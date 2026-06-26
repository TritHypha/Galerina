// @galerina/substrate-math — golden-value oracle for the shared NMR calculus.
// These are the SAME hand-verified constants asserted by the two consumers
// (galerina-tower-citizen/tests/substrate-model.test.mjs and
//  galerina-core-compiler/tests/substrate-contracts.test.mjs). With the math now living
// here, those consumer assertions become a cross-package conformance check against the
// single implementation — drift between consumer expectations and this package fails loudly.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  SubstrateMathError,
  flipProbability, singleLaneErrorProbability, nmrFailureProbability,
} from "../dist/index.js";

const approx = (a, b, e = 1e-9) => Math.abs(a - b) <= e;
const slep = (phaseDriftSigma, crosstalkCoeff = 0, laneFailureProb = 0, readoutSigma = 0) =>
  singleLaneErrorProbability({ phaseDriftSigma, crosstalkCoeff, laneFailureProb, readoutSigma });

describe("nmrFailureProbability — von Neumann NMR closed form (golden table)", () => {
  it("N=1 returns pBad; endpoints fixed; 0.5 is 0.5 for every odd N", () => {
    for (const p of [0, 0.1, 0.3, 0.5, 0.9, 1]) assert.ok(approx(nmrFailureProbability(p, 1), p), `nmr(${p},1)`);
    for (const N of [1, 3, 5, 7]) {
      assert.ok(approx(nmrFailureProbability(0, N), 0), `nmr(0,${N})`);
      assert.ok(approx(nmrFailureProbability(1, N), 1), `nmr(1,${N})`);
      assert.ok(approx(nmrFailureProbability(0.5, N), 0.5), `nmr(0.5,${N})=0.5`);
    }
  });
  it("matches the hand-computed TMR value nmr(0.1,3) = 0.028", () => {
    assert.ok(approx(nmrFailureProbability(0.1, 3), 0.028));
  });
  it("strictly decreasing in odd N for pBad<0.5; non-decreasing for pBad≥0.5", () => {
    const lo = [1, 3, 5, 7].map((N) => nmrFailureProbability(0.2, N));
    for (let i = 1; i < lo.length; i++) assert.ok(lo[i] < lo[i - 1], `decreasing@${i}`);
    const hi = [1, 3, 5, 7].map((N) => nmrFailureProbability(0.6, N));
    for (let i = 1; i < hi.length; i++) assert.ok(hi[i] >= hi[i - 1], `non-decreasing@${i}`);
  });
});

describe("singleLaneErrorProbability — pBad = laneFailure OR (survive AND flip)", () => {
  it("matches the lane-profile golden values and is monotone non-decreasing", () => {
    assert.ok(approx(slep(0), 0), "noiseless");
    assert.ok(approx(slep(0.02), 0.02), "photonic (compiler profile)");
    assert.ok(approx(slep(0.1), 0.1), "tower-citizen NOISY fixture");
    assert.ok(approx(slep(0.60), 0.60), "degraded lane");
    assert.ok(slep(0.02, 0.2) >= slep(0.02), "more crosstalk ⇒ pBad not lower");
    assert.ok(slep(0.02, 0, 0.01) >= slep(0.02), "more lane-failure ⇒ pBad not lower");
  });
  it("flipProbability folds the gains (phase 1.0 / crosstalk 0.5 / readout 0.5)", () => {
    assert.ok(approx(flipProbability({ phaseDriftSigma: 0.1, crosstalkCoeff: 0.2, laneFailureProb: 0, readoutSigma: 0.4 }), 0.1 + 0.1 + 0.2));
  });
});

describe("validation throws SubstrateMathError", () => {
  it("rejects out-of-range probabilities and non-odd/non-positive N", () => {
    assert.throws(() => singleLaneErrorProbability({ phaseDriftSigma: -0.1, crosstalkCoeff: 0, laneFailureProb: 0, readoutSigma: 0 }), SubstrateMathError);
    assert.throws(() => nmrFailureProbability(0.5, 2), SubstrateMathError);
    assert.throws(() => nmrFailureProbability(0.5, 0), SubstrateMathError);
    assert.throws(() => nmrFailureProbability(1.5, 3), SubstrateMathError);
  });
});
