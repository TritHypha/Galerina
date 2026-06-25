/**
 * Int64 lift-readiness REGRESSION GUARD — pins the exact current state (the owner's caveat).
 *
 * The Int64 WASM lowering is now faithful + proven byte-exact (see wat-i64-differential.test.mjs:
 * walker ≡ WASM over the full (2^53,2^63) corpus). BUT the `LLN-NUMERIC-001` gate is STILL CLOSED BY
 * DESIGN: declaring a scalar Int64 in a real run/build ERRORS today. Lifting it — removing "Int64" from
 * BACKEND_UNLOWERABLE_SCALAR — is the one IRREVERSIBLE, fail-open-risk, OWNER-GATED action.
 *
 * This test FAILS LOUDLY if (a) the gate ever stops firing, or (b) someone lifts the gate accidentally.
 * When the OWNER deliberately lifts Int64, the two assertions here are the expected, intentional edit.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseProgram, checkValueStates } from "../dist/index.js";
import { BACKEND_UNLOWERABLE_SCALAR, flowDeclaresUnlowerable64 } from "../dist/numeric-lowering.js";

const gateDiags = (src) => {
  const p = parseProgram(src, "lift.lln");
  return (checkValueStates(p.ast).diagnostics ?? []).filter((d) => d.code === "LLN-NUMERIC-001");
};
const firstFlow = (src) => parseProgram(src, "b.lln").ast.children.find((c) => c.kind === "pureFlowDecl");

test("gate STILL CLOSED by design: a scalar Int64 flow errors at checkValueStates (the run/build path)", () => {
  // return-type position
  const ret = gateDiags("pure flow f(n: Int) -> Int64 contract { effects {} } { return n }");
  assert.ok(ret.length >= 1 && ret.every((d) => d.severity === "error"), "Int64 RETURN must fail closed");
  // parameter position
  const par = gateDiags("pure flow f(a: Int64) -> Int contract { effects {} } { return 1 }");
  assert.ok(par.length >= 1 && par.every((d) => d.severity === "error"), "Int64 PARAM must fail closed");
  // local-binding position
  const loc = gateDiags("pure flow f() -> Int contract { effects {} } { let x: Int64 = 1  return 0 }");
  assert.ok(loc.length >= 1 && loc.every((d) => d.severity === "error"), "Int64 LOCAL must fail closed");
});

test("lift is OWNER-GATED: BACKEND_UNLOWERABLE_SCALAR still pins BOTH Int64 and UInt64", () => {
  // If this fails, the gate was lifted. That is the OWNER's deliberate one-line call after a final
  // cross-flow Int64 check — NOT an accidental edit. UInt64 stays gated until its own u64-arith lands.
  assert.ok(BACKEND_UNLOWERABLE_SCALAR.has("Int64"), "Int64 stays gated until the OWNER lifts it");
  assert.ok(BACKEND_UNLOWERABLE_SCALAR.has("UInt64"), "UInt64 stays gated (needs u64-arith)");
});

test("no false positive: a pure i32/f64 flow is NOT gated (the gate is precise)", () => {
  assert.equal(gateDiags("pure flow f(a: Int, b: Int) -> Int contract { effects {} } { return a + b }").length, 0);
  assert.equal(gateDiags("pure flow f(x: Float) -> Float contract { effects {} } { return x }").length, 0);
  // Int64 in a GENERIC position is an opaque handle (base "Tensor"), NOT a gated scalar.
  assert.equal(gateDiags("pure flow f(t: Tensor<Int64,[4]>) -> Int contract { effects {} } { return 1 }").length, 0);
});

test("fast-tier bail: flowDeclaresUnlowerable64 catches Int64 in param/return/INTERNAL binding", () => {
  assert.equal(flowDeclaresUnlowerable64(firstFlow("pure flow f(a: Int64) -> Int contract { effects {} } { return 1 }")), true, "param Int64");
  assert.equal(flowDeclaresUnlowerable64(firstFlow("pure flow f() -> Int64 contract { effects {} } { return 1 }")), true, "return Int64");
  assert.equal(flowDeclaresUnlowerable64(firstFlow("pure flow f(a: Int) -> Int contract { effects {} } { let y: Int64 = 1  return a }")), true, "INTERNAL Int64 (R1) — the bytecode per-param check misses this");
  assert.equal(flowDeclaresUnlowerable64(firstFlow("pure flow f(a: Int) -> Int contract { effects {} } { return a + 1 }")), false, "no 64-bit scalar → runs on the fast tiers");
});
