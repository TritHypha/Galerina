// hardening-trit-conformance.test.mjs — the MANDATORY trit-conformance gate (RD-0360 Q1 Option A DoD).
//
// The RD-0337 epistemic trit exists in TWO independent implementations BY DESIGN:
//   • the RUNTIME trit — galerina-tower-citizen/src/epistemic-type-state.ts (the shipped RD-0337).
//   • the COMPILER trit — galerina-core-compiler/src/hardening-residency.ts (used by the hardening
//     spill→Refuted governed downgrade). The compiler is UPSTREAM of the runtime and cannot import it
//     (no dependency, and adding one would invert the layer — RD-0360 Q1 Option A).
//
// If the two drift, the compiler could rule a value `Trusted` that the runtime would `Refute` — a
// hardened-secret guarantee checked under one algebra and enforced under another. This fail-closed
// differential holds them in lock-step: the state bijection (incl. the Trusted↔PROVEN↔ALLOW name-map),
// the full 3×3 min-fold, sticky-refute, discharge-only-lift, deny-at-boundary, and an ANTI-NEUTER
// self-test proving the differential itself has teeth. Without it, Option A is not zero-trust-complete.
//
// This is an INTEGRATION HARNESS (it must see BOTH packages): the compiler trit is imported by a
// RELATIVE dist path (a filesystem import needs no package dependency), the runtime trit from
// tower-citizen's own build. In keep-green, core-compiler builds before tower-citizen, so its dist exists.
import { test } from "node:test";
import assert from "node:assert/strict";
// runtime trit (RD-0337)
import { Trust, combine, discharge, requireTrusted, trustedRoot, unverified, refute as runtimeRefute } from "../dist/epistemic-type-state.js";
import { K3_UNKNOWN } from "../dist/three-valued-governance.js";
// compiler trit (the hardening spill→Refuted mirror)
import {
  CompilerTrust, trustName, combineTrust, dischargeTrust, boundaryTrusted, refute as compilerRefute,
} from "../../galerina-core-compiler/dist/index.js";

const TRITS = [CompilerTrust.PROVEN, CompilerTrust.UNKNOWN, CompilerTrust.REFUTED]; // +1, 0, -1

/**
 * K3U2 marshal (gcw-k3u4): the compiler trit keeps 0 = Unverified; the runtime UNKNOWN is the K3_UNKNOWN
 * sentinel. The ONLY sanctioned crossing is this explicit total map; anything else (incl. a runtime NEUTRAL 0)
 * is a fail-closed error, so drift in either direction is caught rather than coerced.
 */
function toCompiler(t) {
  if (t === Trust.PROVEN) return CompilerTrust.PROVEN;
  if (t === Trust.REFUTED) return CompilerTrust.REFUTED;
  if (t === K3_UNKNOWN) return CompilerTrust.UNKNOWN;
  throw new Error("runtime trust " + String(t) + " has no compiler image — fail-closed");
}

/** A runtime Epistemic wrapper carrying a given trit — the runtime operates on wrappers, not bare trits. */
function runtimeOf(trit) {
  if (trit === CompilerTrust.PROVEN) return trustedRoot(0, "conformance");
  if (trit === CompilerTrust.UNKNOWN) return unverified(0, "conformance");
  return runtimeRefute(0, "conformance");
}

test("bijection: compiler trit ≡ runtime Trust ≡ Verdict (+1/0/-1) + the Trusted/Unverified/Refuted name-map", () => {
  assert.equal(CompilerTrust.PROVEN, Trust.PROVEN);
  assert.equal(Trust.UNKNOWN, K3_UNKNOWN); // runtime UNKNOWN is the sentinel, never the trit 0
  assert.equal(toCompiler(Trust.UNKNOWN), CompilerTrust.UNKNOWN);
  assert.equal(toCompiler(Trust.PROVEN), CompilerTrust.PROVEN);
  assert.equal(toCompiler(Trust.REFUTED), CompilerTrust.REFUTED);
  assert.throws(() => toCompiler(0)); // a runtime NEUTRAL 0 is not a trust value
  assert.equal(CompilerTrust.REFUTED, Trust.REFUTED);
  assert.equal(trustName(CompilerTrust.PROVEN), "Trusted");
  assert.equal(trustName(CompilerTrust.UNKNOWN), "Unverified");
  assert.equal(trustName(CompilerTrust.REFUTED), "Refuted");
});

test("3×3 min-fold: compiler combineTrust ≡ runtime combine (vAnd) for all nine trit pairs", () => {
  for (const a of TRITS) for (const b of TRITS) {
    const runtime = toCompiler(combine(runtimeOf(a), runtimeOf(b), () => 0).trust);
    assert.equal(combineTrust(a, b), runtime, `min-fold drift at combine(${a},${b})`);
  }
});

test("sticky-refute: a REFUTED can never be lifted — identical in both impls", () => {
  assert.equal(dischargeTrust(compilerRefute(), true), CompilerTrust.REFUTED);
  assert.equal(discharge(runtimeRefute(0, "x"), () => true, "y").trust, Trust.REFUTED);
});

test("discharge-only-lift: UNKNOWN → PROVEN (verify✓) / REFUTED (verify✗) / UNKNOWN (inconclusive) — both impls", () => {
  assert.equal(dischargeTrust(CompilerTrust.UNKNOWN, true), CompilerTrust.PROVEN);
  assert.equal(discharge(unverified(0, "x"), () => true, "y").trust, Trust.PROVEN);
  assert.equal(dischargeTrust(CompilerTrust.UNKNOWN, false), CompilerTrust.REFUTED);
  assert.equal(discharge(unverified(0, "x"), () => false, "y").trust, Trust.REFUTED);
  // compiler `undefined` (inconclusive) ≡ runtime `throwing verifier` (inconclusive) → both stay UNKNOWN
  assert.equal(dischargeTrust(CompilerTrust.UNKNOWN, undefined), CompilerTrust.UNKNOWN);
  assert.equal(discharge(unverified(0, "x"), () => { throw new Error("inconclusive"); }, "y").trust, Trust.UNKNOWN);
});

test("deny-at-boundary: release IFF PROVEN — identical for all three trits", () => {
  for (const t of TRITS) {
    assert.equal(boundaryTrusted(t), requireTrusted(runtimeOf(t)).authorized, `boundary drift at trit ${t}`);
  }
});

test("ANTI-NEUTER self-test: the differential FIRES on a deliberately-drifted mock (max instead of min)", () => {
  const driftedCombine = (a, b) => (a > b ? a : b); // WRONG — max, not the min-fold
  let caught = false;
  for (const a of TRITS) for (const b of TRITS) {
    const runtime = toCompiler(combine(runtimeOf(a), runtimeOf(b), () => 0).trust);
    if (driftedCombine(a, b) !== runtime) caught = true;
  }
  assert.ok(caught, "a drifted (max) combine MUST be caught — a differential that can't catch drift is neutered");
});
