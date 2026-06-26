// G5 (Intrusion-Triggered Arena Fill) — part (b): a SECRET-handling flow now scrubs linear memory with the
// part-a bulk-memory `memory.fill` MID-execution, immediately BEFORE a fail-closed invariant/trap
// `unreachable` breach (53 "intrusion-triggered arena fill", owner-approved). Rationale: a runtime invariant
// breach in a secret flow is treated as a potential intrusion — wipe secret remanence so it is not
// recoverable from a post-mortem memory image, instead of leaving it host-readable. This test proves:
//   (a) a secret flow with an `invariant { ensure <cond> }` emits the memory.fill BEFORE the breach unreachable,
//   (b) an identical NON-secret flow does NOT (it pays nothing — byte-identical breach site),
//   (c) the module still assembles to a valid WASM binary (and carries the bulk-memory opcode 0xFC 0x0B).
// Mirrors wat-arena-memory-fill-g5.test.mjs (the part-a harness).
import { test } from "node:test";
import assert from "node:assert/strict";
import * as L from "../dist/index.js";

// `checkPos` is a secret-handling LEAF entry-point that USES THE HEAP (constructs a record) and carries a
// runtime-precheck invariant (`ensure s > 0` — `s` is unknown at compile time, so it lowers to a WAT
// `(if (i32.eqz …) (then unreachable))` breach gate, NOT a statically folded one). Those facts make
// `emitArenaReset && fn.handlesSecrets === true` true → the G5b mid-execution wipe fires at the breach.
// (Flow name avoids the reserved `guard` keyword.)
const mk = (privacy) => `record Wide { a: Int, b: Int, c: Int }
pure flow checkPos(s: Int) -> Int
contract { intent { "checkPos" }${privacy ? " privacy { contains PII }" : ""} invariant { ensure s > 0; } }
{ let w: Wide = Wide { a: s, b: s, c: s } return w.a }
`;

async function build(src) {
  const prog = L.parseProgram(src, "g5b.spore");
  const errs = (prog.diagnostics ?? []).filter((d) => d.severity === "error");
  assert.equal(errs.length, 0, `parse errors: ${errs.map((d) => d.message).join("; ")}`);
  const fx = L.checkEffects(prog.flows, prog.ast);
  const { gir } = L.emitGIR(prog.ast, prog.flows, fx);
  const wat = L.renderWAT(L.buildWATModuleFromGIR(gir, undefined, "wasm-standalone", prog.ast, true));
  const asm = await L.assembleWAT(wat);
  assert.ok(asm.valid && asm.diagnostics.length === 0,
    `must assemble faithfully: ${asm.diagnostics.map((d) => d.message).join("; ")}\n${wat}`);
  const { instance } = await WebAssembly.instantiate(asm.wasm);
  return { wat, wasm: asm.wasm, instance };
}

test("G5(b): a secret flow emits memory.fill BEFORE the invariant-breach unreachable", async () => {
  const { wat } = await build(mk(true));
  // The runtime-guard breach gate now wipes the arena immediately before trapping.
  assert.ok(wat.includes("G5b intrusion-wipe before trap"),
    `the intrusion-wipe marker must be emitted at the breach:\n${wat}`);
  // The exact folded shape: the bulk-memory fill sits INSIDE the (then …) branch, right before `unreachable`.
  assert.ok(/\(then \(memory\.fill[^\n]*\) unreachable/.test(wat),
    `the wipe must be inside the (then …) branch, before unreachable:\n${wat}`);
  // It must use the part-a fill shape (same base + live $__lln_heap length).
  assert.ok(/\(then \(memory\.fill \(i32\.const 1024\) \(i32\.const 0\) \(i32\.sub \(global\.get \$__lln_heap\) \(i32\.const 1024\)\)\) unreachable/.test(wat),
    `the breach wipe must match the part-a memory.fill (base 1024, live $__lln_heap length):\n${wat}`);
});

test("G5(b): a NON-secret flow with the same invariant does NOT wipe at the breach (byte-identical, pays nothing)", async () => {
  const { wat } = await build(mk(false));
  // The breach gate is still emitted (the invariant is enforced), but WITHOUT the intrusion-wipe.
  assert.ok(wat.includes("(then unreachable)"),
    `the non-secret flow still emits the bare breach gate:\n${wat}`);
  assert.ok(!wat.includes("G5b intrusion-wipe before trap"),
    "a non-secret flow must not pay for the intrusion-wipe at the breach");
  assert.ok(!/\(then \(memory\.fill/.test(wat),
    "a non-secret flow must have no memory.fill inside a (then …) breach branch");
});

test("G5(b): the secret module still assembles to a valid binary carrying the bulk-memory opcode (0xFC 0x0B)", async () => {
  const { wasm } = await build(mk(true)); // build() already asserts asm.valid && no diagnostics
  let found = false;
  for (let i = 0; i < wasm.length - 1; i++) {
    if (wasm[i] === 0xFC && wasm[i + 1] === 0x0B) { found = true; break; }
  }
  assert.ok(found, "memory.fill (0xFC 0x0B) must be present in the assembled WASM");
});

test("G5(b): the secret module still EXECUTES correctly — the breach-wipe doesn't corrupt the happy path", async () => {
  const { instance } = await build(mk(true));
  // s > 0 satisfies the invariant: the breach never fires, the flow returns w.a.
  assert.equal(instance.exports.checkPos(7), 7, "checkPos(7) returns w.a = 7 (invariant holds, no trap)");
  // s <= 0 violates the invariant: the gate wipes then traps — `unreachable` surfaces as a thrown error.
  assert.throws(() => instance.exports.checkPos(0),
    "checkPos(0) violates `ensure s > 0` → wipe + unreachable trap (fail-closed)");
});
