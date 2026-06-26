// RUNTIME memory-model behaviour (R&D 0055 audit follow-up — the test TYPES the audit flagged as missing).
// These are BEHAVIORAL/runtime tests under WebAssembly.instantiate, not page-metadata assertions:
//   (1) governed == ENFORCED — a declared arena actually BOUNDS allocation at runtime (a store past it traps),
//       and it EXTENDS the usable heap beyond the 128 KB default-committed minimum (B1 commits the arena).
//   (2) the B2a per-invocation aliasing contract — a returned heap handle is invalid after the next call.
//
// Tri-Pipe verdict: Binary-only (this is the digital WASM linear-memory model; no Hybrid/Photonic facet).
import { test } from "node:test";
import assert from "node:assert/strict";
import * as L from "../dist/index.js";

async function instantiate(src) {
  const prog = L.parseProgram(src, "rb.spore");
  const errs = (prog.diagnostics ?? []).filter((d) => d.severity === "error");
  assert.equal(errs.length, 0, `parse errors: ${errs.map((d) => d.message).join("; ")}`);
  const fx = L.checkEffects(prog.flows, prog.ast);
  const { gir } = L.emitGIR(prog.ast, prog.flows, fx);
  const wat = L.renderWAT(L.buildWATModuleFromGIR(gir, undefined, "wasm-standalone", prog.ast, true));
  const asm = await L.assembleWAT(wat);
  assert.ok(asm.valid, `must assemble: ${asm.valid ? "" : asm.diagnostics.map((d) => d.message).join("; ")}`);
  return (await WebAssembly.instantiate(asm.wasm)).instance;
}

// A flow that allocates one record per loop iteration (4 bytes each).
const fillFlow = (arena) => `record R { v: Int }
pure flow fill(n: Int) -> Int
contract { intent { "alloc loop" }${arena ? ` memory { arena ${arena} }` : ""} }
{
  mut i = 0
  mut last = 0
  while i < n {
    let r: R = R { v: i }
    last = r.v
    i = i + 1
  }
  return last
}
`;

test("governed==ENFORCED: a declared arena BOUNDS allocation at runtime (a store past it traps)", async () => {
  const inst = await instantiate(fillFlow("1mb")); // 1 MB committed (B1: minPages == maxPages)
  // 100,000 records × 4 B = 400 KB — within the 1 MB arena → runs.
  assert.equal(inst.exports.fill(100000), 99999, "400 KB of allocation fits inside the 1 MB arena");
  // 400,000 records × 4 B = 1.6 MB — past the 1 MB arena → must TRAP (out-of-bounds store).
  assert.throws(() => inst.exports.fill(400000), WebAssembly.RuntimeError,
    "an allocation past the declared 1 MB arena must trap — the governed ceiling is the enforced bound");
});

test("governed==ENFORCED: declaring an arena EXTENDS the heap beyond the 128 KB default-committed minimum", async () => {
  // No arena ⇒ default minPages=2 (128 KB committed) and Galerina emits no memory.grow, so 400 KB traps…
  const noArena = await instantiate(fillFlow(null));
  assert.throws(() => noArena.exports.fill(100000), WebAssembly.RuntimeError,
    "without an arena the heap is the 128 KB default-committed minimum — 400 KB overruns it");
  // …but the SAME workload runs once a 1 MB arena is declared (B1 commits it). Proves the arena is the lever.
  const arena = await instantiate(fillFlow("1mb"));
  assert.equal(arena.exports.fill(100000), 99999, "declaring `memory { arena 1mb }` extends the enforced heap to 1 MB");
});

test("B2a per-invocation contract: a returned heap handle is INVALID after the next top-level call", async () => {
  const inst = await instantiate(`record Rec { v: Int }
pure flow mkRec(s: Int) -> Rec
contract { intent { "returns a heap handle" } }
{ return Rec { v: s } }
`);
  const mem = new Int32Array(inst.exports.memory.buffer);
  const p1 = inst.exports.mkRec(111);
  assert.equal(mem[p1 >> 2], 111, "call 1's record holds its value while it is the live arena");
  const p2 = inst.exports.mkRec(222);
  // The per-flow reset rebased the arena, so call 2 reuses the same address — call 1's handle now aliases
  // call 2's data. This ENCODES the documented contract: a returned handle is valid only until the next call.
  assert.equal(p2, p1, "the rebased arena reuses the same base address");
  assert.equal(mem[p1 >> 2], 222, "the stale handle from call 1 now reads call 2's value (valid only until the next call)");
});
