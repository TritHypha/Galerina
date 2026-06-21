// B2 (R&D 0055) — per-flow arena reset. The bump pointer $__lln_heap was monotone (0 resets ⇒ a
// process-lifetime leak that traps at maxPages). Now a LEAF entry-point (exported ∧ not called by any
// other flow) resets $__lln_heap to WAT_HEAP_BASE at entry, reclaiming the previous invocation's arena.
//
// The leak-prevention is PROVABLE here: with the default minPages=2 (128KB) and no memory.grow, an
// un-reset bump allocator traps after ~16,256 eight-byte records; a reset module runs unboundedly.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as L from "../dist/index.js";

const ALLOC_FLOW = `record Point { x: Int, y: Int }
pure flow makePair(a: Int, b: Int) -> Int
contract { intent { "allocate one record per call" } }
{
  let p: Point = Point { x: a, y: b }
  return p.x + p.y
}
`;

// makePair is the entry; helper is called BY it → helper must NOT get a reset (it would wipe the
// caller's live arena mid-computation). Only the leaf top-level entry resets.
const CALLER_CALLEE = `record Box { v: Int }
pure flow inner(n: Int) -> Int
contract { intent { "callee — allocates, must not self-reset" } }
{
  let b: Box = Box { v: n }
  return b.v
}
pure flow outer(n: Int) -> Int
contract { intent { "leaf entry — resets" } }
{
  return inner(n) + inner(n)
}
`;

async function emit(src) {
  const prog = L.parseProgram(src, "b2.lln");
  const errs = (prog.diagnostics ?? []).filter((d) => d.severity === "error");
  assert.equal(errs.length, 0, `parse errors: ${errs.map((d) => d.message).join("; ")}`);
  const fx = L.checkEffects(prog.flows, prog.ast);
  const { gir } = L.emitGIR(prog.ast, prog.flows, fx);
  const wat = L.renderWAT(L.buildWATModuleFromGIR(gir, undefined, "wasm-standalone", prog.ast, true));
  return wat;
}

test("B2: a leaf entry-point that allocates emits the per-flow heap reset", async () => {
  const wat = await emit(ALLOC_FLOW);
  assert.ok(wat.includes("(global.set $__lln_heap (i32.const 1024))"), "the reset to WAT_HEAP_BASE must be emitted");
});

test("B2: the reset prevents the monotone-bump LEAK — 50k calls run where ~16k would trap un-reset", async () => {
  const wat = await emit(ALLOC_FLOW);
  const asm = await L.assembleWAT(wat);
  assert.ok(asm.valid, `must assemble: ${asm.valid ? "" : asm.diagnostics.map((d) => d.message).join("; ")}`);
  const { instance } = await WebAssembly.instantiate(asm.wasm);
  let r = 0;
  // 50,000 > ~16,256 (130048 free bytes / 8B per record) — would TRAP without the per-call reset.
  for (let i = 0; i < 50000; i++) r = instance.exports.makePair(i, 1);
  assert.equal(r, 50000, "makePair(49999,1) = 50000 — results stay correct under the reset");
});

test("B2: leaf-guard — a callee flow (referenced by another) does NOT self-reset; only the leaf entry does", async () => {
  const wat = await emit(CALLER_CALLEE);
  // Exactly ONE reset in the whole module: at `outer` (the leaf entry), not inside `inner` (the callee).
  const resetCount = (wat.match(/\(global\.set \$__lln_heap \(i32\.const 1024\)\)/g) || []).length;
  assert.equal(resetCount, 1, "only the leaf entry-point resets — the internally-called helper must not");
  // Sanity: it still assembles and computes outer(n) = inner(n)+inner(n) = 2n.
  const asm = await L.assembleWAT(wat);
  assert.ok(asm.valid, `must assemble: ${asm.valid ? "" : asm.diagnostics.map((d) => d.message).join("; ")}`);
  const { instance } = await WebAssembly.instantiate(asm.wasm);
  assert.equal(instance.exports.outer(21), 42, "outer(21) = inner+inner = 42 (callee allocations preserved)");
});
