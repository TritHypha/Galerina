// =============================================================================
// Galerina ExecutionGraph — Build-once, Run-many
//
// Instead of recursively walking the AstNode tree on every executeFlow() call,
// compile the flow to a flat ExecNode[] once and cache it.
//
// Benefits:
//   - No recursive function calls per node (20 → 1 array access per op)
//   - Sequential memory layout → CPU prefetcher keeps it in L1 cache
//   - Binding slots (Int16Array indices) replace Map<string,GalerinaValue> lookups
//   - Cache key = flowName + ":" + sourceHash
//   - Persisted to build/.spore-cache/<hash>.egraph.json (disk-fallback)
// =============================================================================

import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AstNode } from "./parser.js";
import type { GalerinaValue } from "./interpreter.js";

export const enum ExecOp {
  LOAD_CONST    = 0,   // dest = constants[imm]
  LOAD_SLOT     = 1,   // dest = slots[imm]
  STORE_SLOT    = 2,   // slots[imm] = src1
  BINOP         = 3,   // dest = dispatch(src1, op, src2)
  UNOP          = 4,   // dest = dispatch(op, src1)
  CALL          = 5,   // dest = call(funcName, args...)
  BRANCH        = 6,   // if (slots[src1] is truthy) jump imm1 else jump imm2
  JUMP          = 7,   // unconditional jump to imm
  RETURN        = 8,   // return slots[src1]
  RETURN_VOID   = 9,   // return void
  EFFECT_CALL   = 10,  // capability-gated call (records effect)
  AUDIT_WRITE   = 11,  // emit audit event
  NOP           = 12,  // no-op (placeholder)
}

export interface ExecNode {
  readonly op:       ExecOp;
  readonly dest:     number;   // destination slot (-1 = no dest)
  readonly src1:     number;   // source slot 1 (-1 = unused)
  readonly src2:     number;   // source slot 2 (-1 = unused)
  readonly imm:      number;   // immediate value / jump target / constant index
  readonly opName:   string;   // operator name for BINOP/UNOP ("+" etc.)
  readonly callName: string;   // function name for CALL/EFFECT_CALL
}

export interface ExecutionGraph {
  readonly flowName:  string;
  readonly qualifier: string;
  readonly nodes:     readonly ExecNode[];
  readonly constants: readonly (string | number | boolean | null)[];
  readonly slotCount: number;
  readonly slotNames: ReadonlyMap<string, number>;  // bindingName → slot index
  readonly isPure:    boolean;
  readonly effectMask: number;
}

// ── Memory cache ──────────────────────────────────────────────────────────────
const MEMORY_CACHE = new Map<string, ExecutionGraph>();

// ── Disk cache ────────────────────────────────────────────────────────────────
const DISK_CACHE_DIR = "build/.spore-cache";

function diskCachePath(key: string): string {
  const safe = key.replace(/[^a-z0-9_-]/gi, "_").slice(0, 80);
  return join(DISK_CACHE_DIR, `${safe}.egraph.json`);
}

function ensureCacheDir(): void {
  try { mkdirSync(DISK_CACHE_DIR, { recursive: true }); } catch {}
}

function readDiskCache(key: string): ExecutionGraph | null {
  const path = diskCachePath(key);
  if (!existsSync(path)) return null;
  try {
    const data = JSON.parse(readFileSync(path, "utf8")) as ExecutionGraph & { slotNames: [string,number][] };
    return { ...data, slotNames: new Map(data.slotNames) };
  } catch { return null; }
}

function writeDiskCache(key: string, graph: ExecutionGraph): void {
  try {
    ensureCacheDir();
    const data = { ...graph, slotNames: [...graph.slotNames.entries()] };
    writeFileSync(diskCachePath(key), JSON.stringify(data), "utf8");
  } catch {}
}

// ── Graph lookup ──────────────────────────────────────────────────────────────

export function getCachedGraph(key: string): ExecutionGraph | null {
  return MEMORY_CACHE.get(key) ?? null;
}

export function getOrLoadGraph(key: string): ExecutionGraph | null {
  const mem = MEMORY_CACHE.get(key);
  if (mem !== undefined) return mem;
  const disk = readDiskCache(key);
  if (disk !== null) { MEMORY_CACHE.set(key, disk); return disk; }
  return null;
}

export function storeGraph(key: string, graph: ExecutionGraph): void {
  MEMORY_CACHE.set(key, graph);
  writeDiskCache(key, graph);
}

// ── Graph builder ─────────────────────────────────────────────────────────────

/**
 * Build an ExecutionGraph from a flow's AstNode and metadata.
 * This is called ONCE per flow and the result is cached.
 * Subsequent calls execute the graph directly without rebuilding.
 */
export function buildExecutionGraph(
  flowNode: AstNode,
  flowName: string,
  qualifier: string,
  declaredEffects: readonly string[],
  isPure: boolean,
): ExecutionGraph {
  const nodes:     ExecNode[] = [];
  const constants: (string | number | boolean | null)[] = [];
  const slotNames  = new Map<string, number>();
  let slotCount    = 0;
  let constCount   = 0;

  function allocSlot(name: string): number {
    const existing = slotNames.get(name);
    if (existing !== undefined) return existing;
    const idx = slotCount++;
    slotNames.set(name, idx);
    return idx;
  }

  function addConst(val: string | number | boolean | null): number {
    constants.push(val);
    return constCount++;
  }

  function emit(op: ExecOp, dest=-1, src1=-1, src2=-1, imm=0, opName="", callName=""): void {
    nodes.push({ op, dest, src1, src2, imm, opName, callName });
  }

  // Allocate slots for parameters first
  const bodyNode = flowNode.children?.find(c => c.kind === "block");
  const paramNodes = flowNode.children?.filter(c => c.kind === "paramDecl") ?? [];
  for (const p of paramNodes) {
    const name = ((p.value ?? "").split(":")[0] ?? "").replace(/^(unsafe|safe|readonly|mut)\s*/,"").trim();
    if (name) allocSlot(name);
  }

  // Walk body nodes and emit ExecNodes
  function walkNode(node: AstNode): number {
    switch (node.kind) {
      case "numberLiteral": {
        const v = Number(node.value);
        const c = addConst(Number.isInteger(v) ? Math.round(v) : v);
        const d = slotCount++;
        emit(ExecOp.LOAD_CONST, d, -1, -1, c);
        return d;
      }
      case "stringLiteral": {
        const c = addConst(node.value ?? "");
        const d = slotCount++;
        emit(ExecOp.LOAD_CONST, d, -1, -1, c);
        return d;
      }
      case "boolLiteral": {
        const c = addConst(node.value === "true");
        const d = slotCount++;
        emit(ExecOp.LOAD_CONST, d, -1, -1, c);
        return d;
      }
      case "identifier": {
        const name = node.value ?? "";
        const slot = slotNames.get(name);
        if (slot !== undefined) {
          const d = slotCount++;
          emit(ExecOp.LOAD_SLOT, d, slot);
          return d;
        }
        return -1;
      }
      case "letDecl":
      case "mutDecl": {
        const rawName = ((node.value ?? "").split(":")[0] ?? "").replace(/^(unsafe|safe|readonly|mut)\s*/,"").trim();
        const name    = rawName.split(" ").pop() ?? rawName;
        const slot    = allocSlot(name);
        const child   = node.children?.[0];
        const srcSlot = child !== undefined ? walkNode(child) : -1;
        if (srcSlot >= 0) emit(ExecOp.STORE_SLOT, -1, srcSlot, -1, slot);
        return slot;
      }
      case "assignStmt": {
        const name  = ((node.value ?? "").split(":")[0] ?? "").trim();
        const slot  = allocSlot(name);
        const child = node.children?.[0];
        const src   = child !== undefined ? walkNode(child) : -1;
        if (src >= 0) emit(ExecOp.STORE_SLOT, -1, src, -1, slot);
        return slot;
      }
      case "binaryExpr": {
        const op   = node.value ?? "+";
        const l    = node.children?.[0];
        const r    = node.children?.[1];
        const src1 = l !== undefined ? walkNode(l) : -1;
        const src2 = r !== undefined ? walkNode(r) : -1;
        const d    = slotCount++;
        emit(ExecOp.BINOP, d, src1, src2, 0, op);
        return d;
      }
      case "returnStmt": {
        const child = node.children?.[0];
        const src   = child !== undefined ? walkNode(child) : -1;
        if (src >= 0) emit(ExecOp.RETURN, -1, src);
        else          emit(ExecOp.RETURN_VOID);
        return -1;
      }
      default: {
        // Unhandled node kind — emit NOP and return sentinel
        // The executor will fall back to the tree-walker for these
        emit(ExecOp.NOP, -1, -1, -1, 0, "", node.kind);
        return -1;
      }
    }
  }

  // Walk body
  if (bodyNode !== undefined) {
    for (const stmt of bodyNode.children ?? []) {
      walkNode(stmt);
    }
  }

  // Ensure there's a return
  if (nodes.length === 0 || nodes[nodes.length-1]?.op !== ExecOp.RETURN) {
    emit(ExecOp.RETURN_VOID);
  }

  // Suppress unused variable warning — declaredEffects is part of the API
  void declaredEffects;

  return {
    flowName,
    qualifier,
    nodes,
    constants,
    slotCount,
    slotNames,
    isPure,
    effectMask: 0,
  };
}

export function executionGraphCacheKey(flowName: string, sourceHash: string): string {
  return `${flowName}:${sourceHash}`;
}

export function getGraphCacheStats() {
  return { memoryEntries: MEMORY_CACHE.size };
}
