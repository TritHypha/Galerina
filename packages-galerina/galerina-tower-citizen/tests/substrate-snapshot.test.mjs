// substrate-snapshot — calibration-as-attestation core. The noise figures are STAMPED FROM the model
// (checkGuarantee), not author-supplied, and re-derivable — so a producer/HW cannot hand-wave the
// tolerance down: a tampered/gamed snapshot is caught by re-derivation, and admit is fail-closed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSubstrateSnapshot, verifySubstrateSnapshot, canonicalSnapshot, checkGuarantee } from "../dist/index.js";

const lowNoise = { seed: 1, phaseDriftSigma: 0.0, crosstalkCoeff: 0, laneFailureProb: 0, readoutSigma: 0 };
const highNoise = { seed: 1, phaseDriftSigma: 0.6, crosstalkCoeff: 0, laneFailureProb: 0, readoutSigma: 0 };
const guarantee = (epsilonDeclared, n = 3) => ({ resultId: "r1", epsilonDeclared, redundancyN: n, mustCommit: true });

test("buildSubstrateSnapshot STAMPS the authoritative figures from checkGuarantee (not author-supplied)", () => {
  const g = guarantee(0.01);
  const snap = buildSubstrateSnapshot(lowNoise, g, "photonic");
  const direct = checkGuarantee(lowNoise, g);
  assert.equal(snap.pBad, direct.pBad);
  assert.equal(snap.epsilonModeled, direct.epsilonModeled);
  assert.equal(snap.met, direct.met);
});

test("verifySubstrateSnapshot: a genuine low-noise snapshot is consistent + met + admitted", () => {
  const v = verifySubstrateSnapshot(buildSubstrateSnapshot(lowNoise, guarantee(0.01), "photonic"));
  assert.equal(v.consistent, true);
  assert.equal(v.met, true); // pBad 0 → epsilonModeled 0 ≤ 0.01
  assert.equal(v.admit, true);
});

test("verifySubstrateSnapshot: a consistent-but-UNMET snapshot is NOT admitted (fail-closed)", () => {
  // epsilonDeclared 0 with any noise (pBad>0) is unachievable → met=false → not admitted.
  const snap = buildSubstrateSnapshot(highNoise, guarantee(0), "noisy");
  const v = verifySubstrateSnapshot(snap);
  assert.equal(v.consistent, true);
  assert.equal(v.met, false);
  assert.equal(v.admit, false);
});

test("verifySubstrateSnapshot: a TAMPERED snapshot (gamed pBad/met) is REJECTED by re-derivation", () => {
  const real = buildSubstrateSnapshot(highNoise, guarantee(0), "noisy"); // genuinely not met
  const tampered = { ...real, pBad: 0.0, epsilonModeled: 0.0, met: true }; // forge a clean lane + met
  const v = verifySubstrateSnapshot(tampered);
  assert.equal(v.consistent, false, "re-derivation from params must catch the forged figures");
  assert.equal(v.admit, false);
});

test("admit invariant: admit === (consistent && met) always holds", () => {
  for (const [params, eps] of [[lowNoise, 0.01], [highNoise, 0], [highNoise, 0.9]]) {
    const v = verifySubstrateSnapshot(buildSubstrateSnapshot(params, guarantee(eps), "x"));
    assert.equal(v.admit, v.consistent && v.met);
  }
});

test("buildSubstrateSnapshot fails closed on an invalid guarantee (even redundancyN throws)", () => {
  assert.throws(() => buildSubstrateSnapshot(lowNoise, { resultId: "r", epsilonDeclared: 0.1, redundancyN: 4, mustCommit: true }, "x"));
});

test("canonicalSnapshot is deterministic (stable serialization)", () => {
  const s = buildSubstrateSnapshot(lowNoise, guarantee(0.01), "photonic");
  assert.equal(canonicalSnapshot(s), canonicalSnapshot(s));
});
