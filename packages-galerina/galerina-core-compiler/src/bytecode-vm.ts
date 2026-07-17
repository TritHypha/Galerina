// =============================================================================
// Galerina Phase 31 — Bytecode VM for Pure Integer Flows
//
// Compiles a pure EffectFree flow's AST into a flat Int32Array of opcodes,
// then executes it in a tight synchronous loop with NO object allocation,
// NO async, NO AST traversal per call.
//
// This is the fastest interpreter tier below WASM. Where the tree-walker
// allocates a { __tag, value } object per node and pays async overhead, the
// bytecode VM operates on raw Int32Array stack slots.
//
// Coverage: integer arithmetic, comparison, logical ops, let/mut/assign,
//   if/else, while loops, return, intra-module pure calls.
//   Falls back to the tree-walker for anything unsupported (strings, floats,
//   records, stdlib calls).
//
// Pipeline:  AST → compileFlow() → BytecodeProgram → runBytecode() → number
// =============================================================================

import { type AstNode, type FlowMeta } from "./parser.js";
import { i32AddChecked, i32SubChecked, i32MulChecked, i32DivChecked, i32ModChecked, i32NegChecked, type I32Result } from "./i32-arith.js";
import { flowDeclaresUnlowerable64 } from "./numeric-lowering.js";

// ---------------------------------------------------------------------------
// Opcodes
// ---------------------------------------------------------------------------

export enum Op {
  LOAD_CONST = 1,    // [value]           push value
  LOAD_LOCAL = 2,    // [slot]            push locals[slot]
  STORE_LOCAL = 3,   // [slot]            locals[slot] = pop()
  ADD = 10, SUB = 11, MUL = 12, DIV = 13, MOD = 14,
  LT = 20, LE = 21, GT = 22, GE = 23, EQ = 24, NE = 25,
  AND = 30, OR = 31, NOT = 32, NEG = 33,
  JUMP = 40,         // [target]          pc = target
  JUMP_IF_FALSE = 41,// [target]          if pop()==0, pc = target
  CALL = 50,         // [flowIdx, argc]   call another bytecode flow
  RETURN = 60,       // return pop()
  HALT = 99,
}

// ---------------------------------------------------------------------------
// Compiled program
// ---------------------------------------------------------------------------

export interface BytecodeProgram {
  readonly code: Int32Array;       // flat opcode stream
  readonly localCount: number;     // number of local slots (params + vars)
  readonly paramNames: readonly string[];
  readonly flowName: string;
  /** Phase 45: sub-programs for called pure flows (inlined at call site). */
  readonly subPrograms?: ReadonlyMap<string, BytecodeProgram>;
}

/** Sentinel thrown when a node can't be compiled to bytecode. */
class BytecodeUnsupported {
  constructor(readonly reason: string) {}
}

// ---------------------------------------------------------------------------
// Compiler — AST → bytecode
// ---------------------------------------------------------------------------

const FLOW_KINDS = new Set(["flowDecl", "secureFlowDecl", "pureFlowDecl", "guardedFlowDecl"]);

const BINOP_TO_OP: ReadonlyMap<string, Op> = new Map<string, Op>([
  ["+", Op.ADD], ["-", Op.SUB], ["*", Op.MUL], ["/", Op.DIV], ["%", Op.MOD],
  ["<", Op.LT], ["<=", Op.LE], [">", Op.GT], [">=", Op.GE], ["==", Op.EQ], ["!=", Op.NE],
  ["&&", Op.AND], ["||", Op.OR], ["and", Op.AND], ["or", Op.OR],
]);

class BytecodeCompiler {
  private readonly code: number[] = [];
  private readonly slots = new Map<string, number>();
  private nextSlot = 0;
  // Phase 45: sub-programs accumulated during compilation
  private readonly subPrograms = new Map<string, BytecodeProgram>();

  constructor(
    private readonly flowName: string,
    private readonly ast: AstNode | null = null,
  ) {}

  /** Allocate or return the slot index for a variable. */
  private slotFor(name: string): number {
    let s = this.slots.get(name);
    if (s === undefined) {
      s = this.nextSlot++;
      this.slots.set(name, s);
    }
    return s;
  }

  compile(flowNode: AstNode): BytecodeProgram {
    // FAIL-CLOSED (verified i64 plan, R1): this Int32Array VM is i32-only. A flow that declares ANY
    // unlowerable 64-bit scalar — including an INTERNAL `let y: Int64` in an int-param flow, which the
    // per-param check below does NOT catch and which would compile to a silently-truncating i32
    // STORE_LOCAL — must bail to the faithful tree-walker (which carries int64 as a bigint). Same
    // BACKEND_UNLOWERABLE_SCALAR the FUNGI-NUMERIC-001 gate uses, so the tiers can't disagree.
    if (flowDeclaresUnlowerable64(flowNode)) {
      throw new BytecodeUnsupported("flow declares a 64-bit scalar (Int64/UInt64) — defer to the tree-walker");
    }
    // Parameters → slots 0..n. The VM is integer-only — reject non-integer params.
    const INTEGER_TYPES = new Set(["Int", "Int8", "Int16", "Int32", "Bool", "Byte"]);
    const paramNodes = (flowNode.children ?? []).filter(c => c.kind === "paramDecl");
    const paramNames: string[] = [];
    for (const p of paramNodes) {
      const raw = p.value ?? "";
      const name = (raw.split(":")[0] ?? "").trim();
      const declType = (raw.split(":")[1] ?? "Int").trim();
      if (!INTEGER_TYPES.has(declType)) {
        throw new BytecodeUnsupported(`non-integer param type: ${declType}`);
      }
      paramNames.push(name);
      this.slotFor(name);
    }

    const body = (flowNode.children ?? []).find(c => c.kind === "block");
    if (body === undefined) throw new BytecodeUnsupported("no body block");

    this.compileBlock(body);
    // Implicit return 0 if no explicit return at end
    this.code.push(Op.LOAD_CONST, 0, Op.RETURN);

    return {
      code: Int32Array.from(this.code),
      localCount: this.nextSlot,
      paramNames,
      flowName: this.flowName,
      ...(this.subPrograms.size > 0 ? { subPrograms: new Map(this.subPrograms) } : {}),
    };
  }

  private compileBlock(block: AstNode): void {
    for (const stmt of block.children ?? []) {
      this.compileStmt(stmt);
    }
  }

  private compileStmt(stmt: AstNode): void {
    switch (stmt.kind) {
      case "letDecl":
      case "mutDecl": {
        const name = ((stmt.value ?? "").split(":")[0] ?? "").trim();
        const init = stmt.children?.[0];
        if (init !== undefined) this.compileExpr(init);
        else this.code.push(Op.LOAD_CONST, 0);
        this.code.push(Op.STORE_LOCAL, this.slotFor(name));
        break;
      }

      case "assignStmt": {
        const name = (stmt.value ?? "").trim();
        const expr = stmt.children?.[0];
        if (expr !== undefined) this.compileExpr(expr);
        else this.code.push(Op.LOAD_CONST, 0);
        this.code.push(Op.STORE_LOCAL, this.slotFor(name));
        break;
      }

      case "returnStmt": {
        const expr = stmt.children?.[0];
        if (expr !== undefined) this.compileExpr(expr);
        else this.code.push(Op.LOAD_CONST, 0);
        this.code.push(Op.RETURN);
        break;
      }

      case "ifStmt": {
        // [cond] JUMP_IF_FALSE elseLabel  [then]  JUMP endLabel  elseLabel: [else]  endLabel:
        const [condNode, thenBlock, elseBlock] = stmt.children ?? [];
        if (condNode === undefined) throw new BytecodeUnsupported("if without condition");
        this.compileExpr(condNode);
        this.code.push(Op.JUMP_IF_FALSE);
        const elseJumpAddr = this.code.length;
        this.code.push(0); // placeholder for else target

        if (thenBlock !== undefined) this.compileNestedBlock(thenBlock);

        if (elseBlock !== undefined) {
          this.code.push(Op.JUMP);
          const endJumpAddr = this.code.length;
          this.code.push(0); // placeholder for end target
          // else target = here
          this.code[elseJumpAddr] = this.code.length;
          if (elseBlock.kind === "ifStmt") this.compileStmt(elseBlock);
          else this.compileNestedBlock(elseBlock);
          this.code[endJumpAddr] = this.code.length;
        } else {
          // no else — else target = here
          this.code[elseJumpAddr] = this.code.length;
        }
        break;
      }

      case "whileStmt": {
        // loopStart: [cond] JUMP_IF_FALSE end  [body]  JUMP loopStart  end:
        const [condNode, bodyBlock] = stmt.children ?? [];
        if (condNode === undefined) throw new BytecodeUnsupported("while without condition");
        const loopStart = this.code.length;
        this.compileExpr(condNode);
        this.code.push(Op.JUMP_IF_FALSE);
        const endJumpAddr = this.code.length;
        this.code.push(0); // placeholder for end
        if (bodyBlock !== undefined) this.compileNestedBlock(bodyBlock);
        this.code.push(Op.JUMP, loopStart);
        this.code[endJumpAddr] = this.code.length;
        break;
      }

      case "block":
        this.compileBlock(stmt);
        break;

      default:
        throw new BytecodeUnsupported(`statement: ${stmt.kind}`);
    }
  }

  private compileNestedBlock(node: AstNode): void {
    if (node.kind === "block") this.compileBlock(node);
    else this.compileStmt(node);
  }

  private compileExpr(expr: AstNode): void {
    switch (expr.kind) {
      case "numberLiteral": {
        const raw = (expr.value ?? "0").replace(/_/g, "");
        if (raw.includes(".")) throw new BytecodeUnsupported("float literal");
        const n = parseInt(raw, 10);
        if (!Number.isSafeInteger(n) || n > 0x7fffffff || n < -0x80000000) {
          throw new BytecodeUnsupported("integer out of i32 range");
        }
        this.code.push(Op.LOAD_CONST, n);
        break;
      }

      case "boolLiteral":
        this.code.push(Op.LOAD_CONST, expr.value === "true" ? 1 : 0);
        break;

      case "identifier": {
        const name = expr.value ?? "";
        if (name === "true")  { this.code.push(Op.LOAD_CONST, 1); break; }
        if (name === "false") { this.code.push(Op.LOAD_CONST, 0); break; }
        const slot = this.slots.get(name);
        if (slot === undefined) throw new BytecodeUnsupported(`unknown identifier: ${name}`);
        this.code.push(Op.LOAD_LOCAL, slot);
        break;
      }

      case "binaryExpr": {
        const op = BINOP_TO_OP.get(expr.value ?? "");
        if (op === undefined) throw new BytecodeUnsupported(`binary op: ${expr.value}`);
        const [l, r] = expr.children ?? [];
        if (l === undefined || r === undefined) throw new BytecodeUnsupported("binary missing operand");
        this.compileExpr(l);
        this.compileExpr(r);
        this.code.push(op);
        break;
      }

      case "unaryExpr": {
        const operand = expr.children?.[0];
        if (operand === undefined) throw new BytecodeUnsupported("unary missing operand");
        this.compileExpr(operand);
        if (expr.value === "-")      this.code.push(Op.NEG);
        else if (expr.value === "!") this.code.push(Op.NOT);
        else throw new BytecodeUnsupported(`unary op: ${expr.value}`);
        break;
      }

      // callExpr — call to another pure flow.
      // The compiler used to emit Op.CALL here (Phase 45), but the VM never
      // implemented a CALL handler: runBytecode falls through to `default: return 0`,
      // so every flow that calls another flow miscompiled (non-recursive calls
      // returned 0; self-recursive calls overflowed the compiler stack). Until the
      // VM supports calls, decline these flows by throwing BytecodeUnsupported, which
      // makes executeFlow fall back to the sync tree-walker — that path executes
      // sub-flow calls correctly.
      case "callExpr": {
        throw new BytecodeUnsupported(`callExpr: ${expr.value ?? ""}`);
      }

      default:
        throw new BytecodeUnsupported(`expression: ${expr.kind}`);
    }
  }
}

// ---------------------------------------------------------------------------
// VM — tight synchronous execution loop
// ---------------------------------------------------------------------------

/**
 * Phase 31: Execute a bytecode program. No objects, no async — pure Int32Array.
 *
 * @param program       - Compiled bytecode
 * @param args          - Positional integer arguments (mapped to param slots)
 * @param maxIterations - Fail-closed cap on loop back-edges (Goal-C / 0032 liveness). Default 100_000.
 * @returns the i32 result
 */
/**
 * Unwrap a checked-i32 result for the VM: a trap-kind THROWS (caught at the executeFlow call site
 * → the same `runtimeError` the tree-walker yields). Owner decision Fork A=TRAP, 2026-06-18:
 * overflow / div0 never silently wrap or return 0. Single source of truth = i32-arith.ts.
 */
function i32Trap(r: I32Result): number {
  if (typeof r === "string") throw new Error(r);
  return r;
}

export function runBytecode(program: BytecodeProgram, args: readonly number[], maxIterations: number = 100_000): number {
  const code = program.code;
  const locals = new Int32Array(program.localCount);
  for (let i = 0; i < args.length && i < program.localCount; i++) {
    locals[i] = args[i]! | 0;
  }
  const stack = new Int32Array(256);
  let sp = 0;
  let pc = 0;
  // Liveness cap (Goal-C "no system crash" / 0032): the async tree-walker and the sync fast-path both
  // bound their loops; the bytecode VM previously had NONE, so a bytecode-eligible non-terminating loop
  // (e.g. `while true {}`) would hang the host uncatchably. We count loop back-edges (every taken
  // backward JUMP / JUMP_IF_FALSE = one loop iteration) and TRAP at the cap. The count is global across
  // all back-edges in the program — strictly conservative vs. the tree-walker's per-loop counter, but it
  // can only fail-closed sooner, never fail-OPEN. The trap message mirrors the tree-walker's so the tiers
  // stay byte-identical (interpreter.ts wraps it with the flow name, like the walker's runFlow catch).
  let backEdges = 0;

  while (pc < code.length) {
    const op = code[pc++]!;
    switch (op) {
      case Op.LOAD_CONST:  stack[sp++] = code[pc++]!; break;
      case Op.LOAD_LOCAL:  stack[sp++] = locals[code[pc++]!]!; break;
      case Op.STORE_LOCAL: locals[code[pc++]!] = stack[--sp]!; break;

      // Strict-trapping i32 (owner Fork A=TRAP): overflow / div0 throw, never wrap or return 0.
      case Op.ADD: { const b = stack[--sp]!; stack[sp-1] = i32Trap(i32AddChecked(stack[sp-1]!, b)); break; }
      case Op.SUB: { const b = stack[--sp]!; stack[sp-1] = i32Trap(i32SubChecked(stack[sp-1]!, b)); break; }
      case Op.MUL: { const b = stack[--sp]!; stack[sp-1] = i32Trap(i32MulChecked(stack[sp-1]!, b)); break; }
      case Op.DIV: { const b = stack[--sp]!; stack[sp-1] = i32Trap(i32DivChecked(stack[sp-1]!, b)); break; }
      case Op.MOD: { const b = stack[--sp]!; stack[sp-1] = i32Trap(i32ModChecked(stack[sp-1]!, b)); break; }

      case Op.LT: { const b = stack[--sp]!; stack[sp-1] = stack[sp-1]! <  b ? 1 : 0; break; }
      case Op.LE: { const b = stack[--sp]!; stack[sp-1] = stack[sp-1]! <= b ? 1 : 0; break; }
      case Op.GT: { const b = stack[--sp]!; stack[sp-1] = stack[sp-1]! >  b ? 1 : 0; break; }
      case Op.GE: { const b = stack[--sp]!; stack[sp-1] = stack[sp-1]! >= b ? 1 : 0; break; }
      case Op.EQ: { const b = stack[--sp]!; stack[sp-1] = stack[sp-1]! === b ? 1 : 0; break; }
      case Op.NE: { const b = stack[--sp]!; stack[sp-1] = stack[sp-1]! !== b ? 1 : 0; break; }

      case Op.AND: { const b = stack[--sp]!; stack[sp-1] = (stack[sp-1]! !== 0 && b !== 0) ? 1 : 0; break; }
      case Op.OR:  { const b = stack[--sp]!; stack[sp-1] = (stack[sp-1]! !== 0 || b !== 0) ? 1 : 0; break; }
      case Op.NOT: stack[sp-1] = stack[sp-1]! === 0 ? 1 : 0; break;
      case Op.NEG: stack[sp-1] = i32Trap(i32NegChecked(stack[sp-1]!)); break;

      case Op.JUMP: {
        const target = code[pc]!;
        // Backward jump = loop back-edge. Count it against the liveness cap; trap fail-closed when exceeded.
        if (target < pc && ++backEdges > maxIterations) {
          throw new Error(`Loop exceeded maximum iteration count (${maxIterations}) — fail-closed`);
        }
        pc = target;
        break;
      }
      case Op.JUMP_IF_FALSE: {
        const t = code[pc++]!;
        if (stack[--sp]! === 0) {
          // Current codegen only emits forward JIF (loop exit / if-else), but count a taken backward
          // JIF defensively so any future loop shape stays bounded too.
          if (t < pc && ++backEdges > maxIterations) {
            throw new Error(`Loop exceeded maximum iteration count (${maxIterations}) — fail-closed`);
          }
          pc = t;
        }
        break;
      }

      case Op.RETURN: return stack[--sp]!;
      case Op.HALT: return sp > 0 ? stack[sp-1]! : 0;

      default:
        // Fail-CLOSED on an unknown opcode. Returning 0 — a plausible program value, and Unknown/HOLD in the
        // tri-logic — for a corrupt / truncated / future opcode is a fail-OPEN in a fail-CLOSED VM: it would
        // silently yield a wrong-but-runnable result instead of trapping. Everything else here traps (overflow,
        // div0, the loop cap); this now does too. (External audit 2026-07-17, RD-0455.)
        throw new Error(`Unknown bytecode opcode ${op} at pc=${pc - 1} — fail-closed (corrupt/truncated bytecode, or an opcode the VM was not updated for)`);
    }
  }
  return sp > 0 ? stack[sp-1]! : 0;
}

// ---------------------------------------------------------------------------
// Public API — compile + cache
// ---------------------------------------------------------------------------

/**
 * Cache compiled bytecode, keyed by the program AST object identity, then by flow name.
 *
 * BUG FIX (2026-06-19): the cache used to key on flow NAME ALONE in a single module-level Map. Two
 * different flows both named `main` (different files/ASTs in the SAME process — e.g. every benchmark's
 * entry flow is `main`) would silently serve the FIRST one's compiled bytecode for the SECOND — a
 * wrong-result hazard. The benchmark runner hit exactly this (it clears the pure-flow cache between
 * files but not this one). Keying by the program AST *identity* gives per-compilation isolation for ALL
 * callers (not just the benchmark runner) at zero hot-path cost — no per-call source hashing on the
 * fastest interpreter tier. A re-parse of the same source yields a fresh AST object → a cache MISS (one
 * harmless recompile), never a wrong HIT. A WeakMap also lets entries be reclaimed when the AST is GC'd.
 */
let BYTECODE_CACHE = new WeakMap<AstNode, Map<string, BytecodeProgram | null>>();

/**
 * Phase 31: Try to compile a pure flow to bytecode. Returns null if unsupported.
 * Caches the result (including null = "known unsupported") to avoid recompilation.
 */
export function compileToBytecode(
  ast: AstNode,
  flowName: string,
): BytecodeProgram | null {
  // Per-compilation isolation: scope the per-flow cache to this exact program AST (see BYTECODE_CACHE).
  let perAst = BYTECODE_CACHE.get(ast);
  if (perAst === undefined) {
    perAst = new Map<string, BytecodeProgram | null>();
    BYTECODE_CACHE.set(ast, perAst);
  }
  if (perAst.has(flowName)) return perAst.get(flowName)!;

  const flowNode = (ast.children ?? []).find(c => FLOW_KINDS.has(c.kind) && c.value === flowName);
  if (flowNode === undefined) {
    perAst.set(flowName, null);
    return null;
  }

  try {
    // Phase 45: pass ast so callExpr can compile callees
    const program = new BytecodeCompiler(flowName, ast).compile(flowNode);
    perAst.set(flowName, program);
    return program;
  } catch (e) {
    if (e instanceof BytecodeUnsupported) {
      perAst.set(flowName, null);
      return null;
    }
    throw e;
  }
}

/**
 * Phase 31: Try to run a pure flow via the bytecode VM.
 * Returns the result, or null if the flow can't be compiled to bytecode.
 */
export function tryRunBytecode(
  ast: AstNode,
  flows: readonly FlowMeta[],
  flowName: string,
  args: readonly number[],
): number | null {
  const flow = flows.find(f => f.name === flowName);
  if (flow === undefined || flow.qualifier !== "pure") return null;
  const program = compileToBytecode(ast, flowName);
  if (program === null) return null;
  return runBytecode(program, args);
}

/** Drop all cached bytecode. (A WeakMap has no clear(), so swap in a fresh one.) */
export function clearBytecodeCache(): void {
  BYTECODE_CACHE = new WeakMap<AstNode, Map<string, BytecodeProgram | null>>();
}
