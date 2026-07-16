// =============================================================================
// wat-assembler build-isolation conformance (2026-07-16)
//
// Regression pair for the wabt re-entrancy fix. wabt is an Emscripten artifact
// with internal state (linear-memory arena, parsed-module registry); when
// assembleWAT shared ONE cached toolkit instance, a multi-function bundle that
// linked cleanly as the FIRST build in a process non-deterministically failed
// ("module does not link — undefined functions") as one of a BATCH — observed
// on the largest DSS supervisor bundle (audit-dss-wasm-build.mjs header).
// The fix gives every build a FRESH toolkit instance (factory cached, instance
// per call). This suite is the conformance set:
//
//   1. two DIFFERENT multi-function bundles assemble faithfully in ONE process
//   2. the alternating BATCH shape (A,B,A,B,A) stays faithful throughout
//   3. repeat builds are byte-identical (no residue ⇒ reproducible bytes)
//   4. fail-closed preserved: an undefined function ref is STILL rejected on a
//      fresh instance (isolation must not soften the failure mode)
//   5. the binaries are REAL compiles: instantiate + call returns the computed
//      value (never the minimal-encoder stub's constant)
//
// Faithful-assembly convention (suite-wide): valid && diagnostics.length === 0.
// =============================================================================

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { assembleWAT } from "../dist/index.js";

// Bundle A — cross-calling function chain (the linker shape that used to flake).
const WAT_A = `(module
  (memory 2 2048)
  (export "memory" (memory 0))
  (func $helper (param $x i32) (result i32)
    (i32.add (local.get $x) (i32.const 7)))
  (func $mid (param $x i32) (result i32)
    (i32.mul (call $helper (local.get $x)) (i32.const 3)))
  (func $entryA (param $x i32) (result i32)
    (call $mid (call $helper (local.get $x))))
  (export "entryA" (func $entryA)))
`;

// Bundle B — a DIFFERENT shape (locals + block/loop/br_if control flow).
const WAT_B = `(module
  (memory 2 2048)
  (export "memory" (memory 0))
  (func $sq (param $x i32) (result i32)
    (i32.mul (local.get $x) (local.get $x)))
  (func $entryB (param $n i32) (result i32)
    (local $acc i32) (local $i i32)
    (local.set $acc (i32.const 0))
    (local.set $i (i32.const 0))
    (block $done
      (loop $go
        (br_if $done (i32.ge_s (local.get $i) (local.get $n)))
        (local.set $acc (i32.add (local.get $acc) (call $sq (local.get $i))))
        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (br $go)))
    (local.get $acc))
  (export "entryB" (func $entryB)))
`;

// A module that must NOT link — $missing is undefined. Fail-closed control.
const WAT_BAD = `(module
  (func $broken (result i32)
    (call $missing))
  (export "broken" (func $broken)))
`;

const faithful = (r) => r.valid === true && r.diagnostics.length === 0;

async function callExport(wasm, name, arg) {
  const { instance } = await WebAssembly.instantiate(wasm);
  const fn = instance.exports[name];
  assert.equal(typeof fn, "function", `export '${name}' must exist`);
  return fn(arg);
}

describe("wat-assembler build isolation: fresh wabt instance per build", () => {
  it("two DIFFERENT bundles assemble faithfully in one process (the fix's contract)", async () => {
    const a = await assembleWAT(WAT_A);
    const b = await assembleWAT(WAT_B);
    assert.ok(faithful(a), `bundle A must be a faithful compile; diagnostics: ${JSON.stringify(a.diagnostics)}`);
    assert.ok(faithful(b), `bundle B must be a faithful compile after A in the SAME process; diagnostics: ${JSON.stringify(b.diagnostics)}`);
  });

  it("the alternating batch shape (A,B,A,B,A) stays faithful throughout", async () => {
    const sources = [WAT_A, WAT_B, WAT_A, WAT_B, WAT_A];
    for (let i = 0; i < sources.length; i++) {
      const r = await assembleWAT(sources[i]);
      assert.ok(
        faithful(r),
        `batch build #${i + 1} must be faithful (the pre-fix flake was non-deterministic in exactly this shape); diagnostics: ${JSON.stringify(r.diagnostics)}`,
      );
    }
  });

  it("repeat builds of the same bundle are byte-identical (no cross-build residue)", async () => {
    const first = await assembleWAT(WAT_A);
    await assembleWAT(WAT_B); // interleave a different module
    const again = await assembleWAT(WAT_A);
    assert.ok(faithful(first) && faithful(again), "both builds must be faithful");
    assert.deepEqual(
      Buffer.from(again.wasm),
      Buffer.from(first.wasm),
      "same WAT must produce byte-identical WASM regardless of what was built in between",
    );
  });

  it("fail-closed preserved: an undefined function ref is REJECTED on a fresh instance", async () => {
    const bad = await assembleWAT(WAT_BAD);
    assert.ok(
      !faithful(bad),
      "a module that does not link must never present as a faithful compile (isolation must not soften the failure mode)",
    );
    // And the failure must not poison the NEXT build (fires-on-bad then silent-on-good).
    const after = await assembleWAT(WAT_B);
    assert.ok(faithful(after), `a good build after a rejected one must be faithful; diagnostics: ${JSON.stringify(after.diagnostics)}`);
  });

  it("the binaries are real compiles: instantiated calls return computed values", async () => {
    const a = await assembleWAT(WAT_A);
    const b = await assembleWAT(WAT_B);
    assert.ok(faithful(a) && faithful(b), "both must be faithful before execution");
    // entryA(5): helper(5)=12 → mid(12)=call helper(12)=19, ×3=57
    assert.equal(await callExport(a.wasm, "entryA", 5), 57, "entryA(5) must compute 57 (never a stub constant)");
    // entryB(4): 0²+1²+2²+3² = 14
    assert.equal(await callExport(b.wasm, "entryB", 4), 14, "entryB(4) must compute 14 (loop actually executed)");
  });
});
