// S7-R2 (closure item 1414-LEASE, RD-1414:242-250): compiler-recognised must-close `linear type`.
// Zero-trust shape (rejected options recorded in gcw-s7e-linear-lease-design.md): a value whose declared
// type is a `linear type` must be closed exactly once, by `close(binding, cap)` with a CloseCap-typed
// parameter as the authority, on EVERY path that reaches flow exit. Use after close or after a move is
// FUNGI-LINEAR-001; reaching exit (or an unanalysable construct) with the binding open is FUNGI-LINEAR-002;
// a second close is FUNGI-LINEAR-003; a `linear type` with an alias or body is FUNGI-LINEAR-004 (parser).
// Rebinding (`let b: T = a`) is a move; `return a` transfers the obligation to the caller.
// Anything this pass cannot analyse while a linear binding is live is refused, never passed.
import type { AstNode, SourceLocation } from "./parser.js";
import type { ValueStateDiagnostic } from "./value-state-checker.js";

export const FUNGI_LINEAR_001 = {
  code: "FUNGI-LINEAR-001",
  name: "LINEAR_USE_AFTER_CLOSE",
  severity: "error" as const,
  message: "A linear value was used after it was closed or moved.",
  why: "A closed or moved linear value no longer owns its resource; using it would act on retired authority.",
  suggestedFix: "Use the value only before close(value, cap), or use the binding it was moved into.",
} as const;

export const FUNGI_LINEAR_002 = {
  code: "FUNGI-LINEAR-002",
  name: "LINEAR_NOT_CLOSED",
  severity: "error" as const,
  message: "A linear value can reach flow exit without being closed exactly once on every path.",
  why: "Affine single use allows a silent drop; a linear resource needs compiler-recognised terminal cleanup.",
  suggestedFix: "Call close(value, cap) with a CloseCap on every path before the flow returns, or return the value to transfer the obligation.",
} as const;

export const FUNGI_LINEAR_003 = {
  code: "FUNGI-LINEAR-003",
  name: "LINEAR_CLOSED_TWICE",
  severity: "error" as const,
  message: "A linear value was closed more than once.",
  why: "A second close acts on a retired resource and could release something it no longer owns.",
  suggestedFix: "Close the value exactly once.",
} as const;

export const FUNGI_LINEAR_004 = {
  code: "FUNGI-LINEAR-004",
  name: "LINEAR_TYPE_SHAPE_REFUSED",
  severity: "error" as const,
  message: "A linear type must be declared bodyless and opaque: `linear type Name`.",
  why: "An alias or body would let ordinary data construct or copy the linear value, erasing its must-close boundary.",
  suggestedFix: "Write `linear type Name` with no `=` alias and no body.",
} as const;

type Spec = { readonly code: string; readonly name: string; readonly message: string; readonly why: string; readonly suggestedFix: string };
type LState = "open" | "closed" | "moved" | "unknown";
type Env = Map<string, LState>;

function diag(spec: Spec, detail: string, location: SourceLocation | undefined): ValueStateDiagnostic {
  const base = { code: spec.code, name: spec.name, severity: "error" as const, message: `${spec.message} ${detail}`, suggestedFix: spec.suggestedFix, why: spec.why };
  return location !== undefined ? { ...base, location } : base;
}

function bindingName(value: string | undefined): string {
  const v = value ?? "";
  const i = v.indexOf(":");
  return (i >= 0 ? v.slice(0, i) : v).trim();
}
function bindingType(node: AstNode): string {
  const tr = (node.children ?? []).find((c) => c.kind === "typeRef");
  if (tr !== undefined) return (tr.value ?? "").trim();
  const v = node.value ?? "";
  const i = v.indexOf(":");
  return i >= 0 ? v.slice(i + 1).trim() : "";
}

export function collectLinearTypes(ast: AstNode): ReadonlySet<string> {
  const out = new Set<string>();
  for (const c of ast.children ?? []) {
    if (c.kind === "typeDecl" && c.linear === true && c.value !== undefined) out.add(c.value);
  }
  return out;
}

function mentions(node: AstNode, names: ReadonlySet<string>): boolean {
  if (node.kind === "identifier" && names.has(node.value ?? "")) return true;
  return (node.children ?? []).some((c) => mentions(c, names));
}
function containsKind(node: AstNode, kind: string): boolean {
  if (node.kind === kind) return true;
  return (node.children ?? []).some((c) => containsKind(c, kind));
}

const FLOW_KIND = /flowdecl$/i;

class FlowLinearChecker {
  readonly diags: ValueStateDiagnostic[] = [];
  private readonly reported = new Set<string>();
  constructor(private readonly linearTypes: ReadonlySet<string>, private readonly caps: ReadonlySet<string>, private readonly flowName: string) {}

  private report(spec: Spec, name: string, detail: string, loc: SourceLocation | undefined): void {
    const key = `${spec.code}:${name}:${loc?.line ?? "?"}:${loc?.column ?? "?"}`;
    if (this.reported.has(key)) return;
    this.reported.add(key);
    this.diags.push(diag(spec, `'${name}' in flow '${this.flowName}': ${detail}`, loc));
  }

  /** Exit check: every tracked binding must be closed or moved out. Unknown was already reported at its merge. */
  exitCheck(env: Env, loc: SourceLocation | undefined): void {
    for (const [name, st] of env) if (st === "open") this.report(FUNGI_LINEAR_002, name, "still open at flow exit", loc);
  }

  private use(env: Env, name: string, loc: SourceLocation | undefined): void {
    const st = env.get(name);
    if (st === "closed" || st === "moved" || st === "unknown") this.report(FUNGI_LINEAR_001, name, `used while ${st}`, loc);
  }

  /** Evaluate an expression; bare uses are borrows, close() discharges. Returns nothing (statement-level moves handled by caller). */
  private expr(env: Env, node: AstNode): void {
    if (node.kind === "callExpr" && node.value === "close" && node.callStyle !== "method") {
      const args = node.children ?? [];
      const target = args[0];
      if (target !== undefined && target.kind === "identifier" && env.has(target.value ?? "")) {
        const name = target.value ?? "";
        for (const a of args.slice(1)) this.expr(env, a);
        const capArg = args[1];
        const capOk = args.length === 2 && capArg !== undefined && capArg.kind === "identifier" && this.caps.has(capArg.value ?? "");
        const st = env.get(name);
        if (st === "closed") { this.report(FUNGI_LINEAR_003, name, "closed again", node.location ?? target.location); return; }
        if (st === "moved" || st === "unknown") { this.report(FUNGI_LINEAR_001, name, `closed while ${st}`, node.location ?? target.location); return; }
        // Without a CloseCap authority the close does not discharge: the binding stays open (fails at exit).
        if (capOk) env.set(name, "closed");
        return;
      }
    }
    if (node.kind === "identifier") { if (env.has(node.value ?? "")) this.use(env, node.value ?? "", node.location); return; }
    for (const c of node.children ?? []) this.expr(env, c);
  }

  private live(env: Env): Set<string> {
    const s = new Set<string>();
    for (const [n, st] of env) if (st === "open") s.add(n);
    return s;
  }

  /** Returns true when the path terminated (returned). */
  block(env: Env, block: AstNode): boolean {
    for (const stmt of block.children ?? []) {
      if (this.stmt(env, stmt)) return true;
    }
    return false;
  }

  private stmt(env: Env, s: AstNode): boolean {
    switch (s.kind) {
      case "block":
        if (s.value === "(expr)") { for (const c of s.children ?? []) this.expr(env, c); return false; }
        return this.block(env, s);
      case "letDecl": {
        const name = bindingName(s.value);
        const declared = bindingType(s);
        const init = (s.children ?? []).find((c) => c.kind !== "typeRef");
        const isLinear = this.linearTypes.has(declared);
        if (init !== undefined && init.kind === "identifier" && env.has(init.value ?? "")) {
          const src = init.value ?? "";
          const st = env.get(src);
          if (st !== "open") { this.report(FUNGI_LINEAR_001, src, `moved while ${st}`, init.location ?? s.location); }
          else env.set(src, "moved");
          env.set(name, "open");
          return false;
        }
        if (init !== undefined) this.expr(env, init);
        if (isLinear) env.set(name, "open");
        else if (env.has(name)) env.delete(name);
        return false;
      }
      case "returnStmt": {
        const v = (s.children ?? [])[0];
        if (v !== undefined && v.kind === "identifier" && env.has(v.value ?? "")) {
          const n = v.value ?? "";
          if (env.get(n) !== "open") this.use(env, n, v.location);
          else env.set(n, "moved");
        } else if (v !== undefined) this.expr(env, v);
        this.exitCheck(env, s.location);
        return true;
      }
      case "ifStmt": {
        const kids = s.children ?? [];
        const cond = kids[0];
        if (cond !== undefined) this.expr(env, cond);
        const branches = kids.slice(1);
        if (branches.length === 1) branches.push({ kind: "block", children: [] } as AstNode);
        const outs: Env[] = [];
        for (const b of branches) {
          const e: Env = new Map(env);
          const term = b.kind === "block" ? this.block(e, b) : this.stmt(e, b);
          if (!term) outs.push(e);
        }
        if (outs.length === 0) return true;
        this.merge(env, outs, s.location);
        return false;
      }
      default: {
        // Unanalysable construct (loop, match, try, assignment, ...): refuse if it touches a live
        // linear binding or can exit the flow while one is open; otherwise evaluate it as an expression.
        const tracked = new Set(env.keys());
        const hasBlock = containsKind(s, "block") || containsKind(s, "returnStmt");
        if (mentions(s, tracked) && (hasBlock || !/expr$|call/i.test(s.kind))) {
          for (const n of tracked) if (mentions(s, new Set([n]))) {
            if (env.get(n) === "open") { this.report(FUNGI_LINEAR_002, n, `linear binding inside unanalysable '${s.kind}' is refused`, s.location); env.set(n, "unknown"); }
            else this.use(env, n, s.location);
          }
          return false;
        }
        if (containsKind(s, "returnStmt") && this.live(env).size > 0) {
          for (const n of this.live(env)) { this.report(FUNGI_LINEAR_002, n, `'${s.kind}' may exit the flow while it is open`, s.location); env.set(n, "unknown"); }
          return false;
        }
        this.expr(env, s);
        return false;
      }
    }
  }

  private merge(env: Env, outs: readonly Env[], loc: SourceLocation | undefined): void {
    const names = new Set<string>();
    for (const e of outs) for (const n of e.keys()) names.add(n);
    for (const n of names) {
      const states = new Set(outs.map((e) => e.get(n) ?? "absent"));
      if (states.size === 1) { const only = [...states][0]; if (only === "absent") env.delete(n); else env.set(n, only as LState); continue; }
      if (states.has("open")) this.report(FUNGI_LINEAR_002, n, "closed or moved on one path but open on another", loc);
      if (states.has("absent")) { env.delete(n); continue; }
      env.set(n, "unknown");
    }
  }
}

/** Fail-closed must-close pass over every flow that declares a linear-typed parameter or local. */
export function checkLinearValues(ast: AstNode): ValueStateDiagnostic[] {
  const linearTypes = collectLinearTypes(ast);
  if (linearTypes.size === 0) return [];
  const out: ValueStateDiagnostic[] = [];
  const visit = (node: AstNode): void => {
    if (FLOW_KIND.test(node.kind)) {
      const params = (node.children ?? []).filter((c) => c.kind === "paramDecl");
      const caps = new Set(params.filter((p) => bindingType(p) === "CloseCap").map((p) => bindingName(p.value)));
      const body = [...(node.children ?? [])].reverse().find((c) => c.kind === "block");
      const env: Env = new Map();
      for (const p of params) if (linearTypes.has(bindingType(p))) env.set(bindingName(p.value), "open");
      const checker = new FlowLinearChecker(linearTypes, caps, node.value ?? "flow");
      if (body === undefined) { checker.exitCheck(env, node.location); out.push(...checker.diags); return; }
      const terminated = checker.block(env, body);
      if (!terminated) checker.exitCheck(env, body.location ?? node.location);
      out.push(...checker.diags);
      return;
    }
    for (const c of node.children ?? []) visit(c);
  };
  visit(ast);
  return out;
}