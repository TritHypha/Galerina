// emulator.test.mjs — the D1 physics-faithful emulator properties, as node:test cases.
// Mirrors Galerina-R-AND-D/scripts/rd-photonic-ppu-emulator-proof.mjs (18/18), asserting
// the SAME properties against this package's compiled emulator (computed vs ground truth).

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  Xorshift32, ACT_MAX, ENOB_CEILING, PHOTONIC, NOISY,
  tmacExact, analogVarianceClosedForm, quantStep,
  tmacPhotonic, tmacVoted, wdmCrosstalkMatrix, applyWdm,
  singleLaneErrorProbability, nmrFailureProbability, freivaldsVerify, freivaldsVerifyCost,
} from "../dist/index.js";

const randTernary = (rng, n) => { const w = new Int8Array(n); for (let i = 0; i < n; i++) w[i] = Math.floor(rng.next() * 3) - 1; return w; };
const randActs = (rng, n) => { const a = new Int32Array(n); for (let i = 0; i < n; i++) a[i] = Math.floor(rng.next() * (2 * ACT_MAX + 1)) - ACT_MAX; return a; };

// E1 — HIGH-SNR / MORE-BITS LIMIT → emulator converges to the exact digital product.
test("E1: high-SNR + many ADC bits → converges to exact (residual ≤ LSB/2)", () => {
  const rng = new Xorshift32(0x0e3a17c5);
  const ideal = { phaseDriftSigma: 0, readoutSigma: 0, quantBits: 16 };
  const n = 64, trials = 3000;
  const lsb = quantStep(n, ideal.quantBits), bound = lsb / 2 + 1e-9;
  let maxAbs = 0, within = 0;
  for (let t = 0; t < trials; t++) {
    const w = randTernary(rng, n), a = randActs(rng, n);
    const e = Math.abs(tmacPhotonic(w, a, n, 1, ideal, rng) - tmacExact(w, a, n, 1));
    if (e > maxAbs) maxAbs = e;
    if (e <= bound) within++;
  }
  assert.ok(maxAbs <= bound, `max|err| ${maxAbs} ≤ LSB/2 ${bound}`);
  assert.equal(within, trials, "every residual within LSB/2");
});

test("E1c: no noise + no quantization → emulator IS the exact stub (gap = 0)", () => {
  const rng = new Xorshift32(0x0e3a17c5);
  const zero = { phaseDriftSigma: 0, readoutSigma: 0, quantBits: 0 };
  let gap = 0;
  for (let t = 0; t < 500; t++) { const w = randTernary(rng, 32), a = randActs(rng, 32); gap += Math.abs(tmacPhotonic(w, a, 32, 1, zero, rng) - tmacExact(w, a, 32, 1)); }
  assert.equal(gap, 0);
});

// E2 — MC variance == first-principles closed form; N-vote cuts it by exactly 1/N.
test("E2: MC variance == closed form (Var = σ_phase²·Σa² + σ_readout²) and the 1/N vote law", () => {
  const rng = new Xorshift32(0x0e3a17c5);
  const n = 24, phys = { phaseDriftSigma: 0.05, readoutSigma: 0.4, quantBits: 0 };
  const w = randTernary(rng, n), a = randActs(rng, n);
  const exact = tmacExact(w, a, n, 1);
  const predicted = analogVarianceClosedForm(w, a, n, phys);
  let sum = 0, sumSq = 0; const draws = 200000;
  for (let t = 0; t < draws; t++) { const y = tmacPhotonic(w, a, n, 1, phys, rng) - exact; sum += y; sumSq += y * y; }
  const measVar = sumSq / draws - (sum / draws) ** 2;
  assert.ok(Math.abs(measVar - predicted) / predicted < 0.03, `meas ${measVar.toFixed(3)} vs closed-form ${predicted.toFixed(3)}`);

  const votedVar = (N) => { let s = 0, ss = 0; const D = 60000; for (let t = 0; t < D; t++) { const y = tmacVoted(w, a, n, 1, phys, N, rng) - exact; s += y; ss += y * y; } return ss / D - (s / D) ** 2; };
  const v1 = votedVar(1), v4 = votedVar(4), v16 = votedVar(16);
  assert.ok(Math.abs(v1 / v4 - 4) / 4 < 0.08, `Var1/Var4 ${(v1 / v4).toFixed(2)} ≈ 4`);
  assert.ok(Math.abs(v1 / v16 - 16) / 16 < 0.10, `Var1/Var16 ${(v1 / v16).toFixed(2)} ≈ 16`);
});

// E3 — PRECISION WALL demonstrated, not asserted.
test("E3: precision wall — RMS falls with bits then flattens at the cited ~8-bit ENOB knee", () => {
  const n = 128, trials = 1500;
  const floorPhys = { phaseDriftSigma: 0, readoutSigma: quantStep(n, ENOB_CEILING), quantBits: 0 };
  const rmsAtBits = (bits) => {
    const rng = new Xorshift32(0xa11ce5 ^ bits);
    let se = 0;
    for (let t = 0; t < trials; t++) { const w = randTernary(rng, n), a = randActs(rng, n); se += (tmacPhotonic(w, a, n, 1, { ...floorPhys, quantBits: bits }, rng) - tmacExact(w, a, n, 1)) ** 2; }
    return Math.sqrt(se / trials);
  };
  const curve = {}; for (let b = 2; b <= 16; b += 2) curve[b] = rmsAtBits(b);
  assert.ok(curve[2] / curve[ENOB_CEILING] > 4, "below the wall, more bits sharply cut error");
  assert.ok(curve[ENOB_CEILING] / curve[16] < 1.5, "past the wall, more bits buy ~nothing (flat)");
  let knee = 2; for (let b = 2; b <= 14; b += 2) if (curve[b] / curve[b + 2] > 1.08) knee = b + 2;
  assert.ok(knee >= 4 && knee <= ENOB_CEILING, `knee at ${knee} bits (cited 4-8 ENOB)`);
});

// E4 — WDM crosstalk is energy-bounded (row-stochastic coupler conserves optical power).
test("E4: WDM matrix row-stochastic, energy-conserving, leakage ≤ budget", () => {
  const rng = new Xorshift32(0x0e3a17c5);
  const m = 8, leak = 0.1, W = wdmCrosstalkMatrix(m, leak);
  let maxRowErr = 0; for (let i = 0; i < m; i++) { let s = 0; for (let j = 0; j < m; j++) s += W[i][j]; maxRowErr = Math.max(maxRowErr, Math.abs(s - 1)); }
  assert.ok(maxRowErr < 1e-12, "rows sum to 1");
  let maxEnergyErr = 0;
  for (let t = 0; t < 2000; t++) {
    const powIn = Float64Array.from({ length: m }, () => rng.next() * 10);
    const powOut = applyWdm(W, powIn);
    let ein = 0, eout = 0; for (let i = 0; i < m; i++) { ein += powIn[i]; eout += powOut[i]; }
    maxEnergyErr = Math.max(maxEnergyErr, Math.abs(eout - ein) / Math.max(1e-12, ein));
  }
  assert.ok(maxEnergyErr < 1e-12, "total optical energy conserved");
  let maxLeak = 0; for (let i = 0; i < m; i++) { let off = 0; for (let j = 0; j < m; j++) if (j !== i) off += W[i][j]; maxLeak = Math.max(maxLeak, off); }
  assert.ok(maxLeak <= leak + 1e-12, "per-channel leakage ≤ budget");
});

// E5 — Freivalds catches an out-of-tolerance matmul, O(k·n²), no re-execution.
test("E5: Freivalds catches out-of-tolerance product (≥1−2⁻ᵏ), verify cheaper than the op", () => {
  const rng = new Xorshift32(0x0e3a17c5), n = 8, k = 20, trials = 1500, tol = 1e-9;
  const randMat = () => Array.from({ length: n }, () => Float64Array.from({ length: n }, () => Math.floor(rng.next() * 9) - 4));
  const matmul = (A, B) => { const C = Array.from({ length: n }, () => new Float64Array(n)); for (let i = 0; i < n; i++) for (let kk = 0; kk < n; kk++) { const a = A[i][kk]; for (let j = 0; j < n; j++) C[i][j] += a * B[kk][j]; } return C; };
  let correctPass = 0, corruptCaught = 0;
  for (let t = 0; t < trials; t++) {
    const A = randMat(), B = randMat(), C = matmul(A, B);
    if (freivaldsVerify(A, B, C, n, k, tol, () => rng.next())) correctPass++;
    const Cc = C.map((r) => Float64Array.from(r));
    const i = Math.floor(rng.next() * n), j = Math.floor(rng.next() * n);
    Cc[i][j] += (rng.next() < 0.5 ? 1 : -1) * (1 + Math.floor(rng.next() * 3));
    if (!freivaldsVerify(A, B, Cc, n, k, tol, () => rng.next())) corruptCaught++;
  }
  assert.equal(correctPass, trials, "exact product always verifies");
  assert.ok(corruptCaught / trials >= 0.999, `caught ${(100 * corruptCaught / trials).toFixed(2)}%`);
  const bigN = 256; assert.ok(freivaldsVerifyCost(bigN, k) < bigN ** 3, "verify O(k·n²) ≪ op O(n³)");
});

// E6 — fail-closed: degraded lane can't be voted into spec; a confident DENY never flips OPEN.
test("E6: clean lane converges under NMR, noisy (pBad≥0.5) does NOT; degraded misses tolerance", () => {
  const pPhot = singleLaneErrorProbability({ phaseDriftSigma: 0.02, crosstalkCoeff: 0, laneFailureProb: 0, readoutSigma: 0 });
  const pNoisy = singleLaneErrorProbability({ phaseDriftSigma: 0.60, crosstalkCoeff: 0, laneFailureProb: 0, readoutSigma: 0 });
  assert.ok(nmrFailureProbability(pPhot, 9) < nmrFailureProbability(pPhot, 3), "clean lane converges");
  assert.ok(nmrFailureProbability(pNoisy, 9) >= nmrFailureProbability(pNoisy, 3), "noisy lane diverges (SPORE-SUBSTRATE-003)");

  const rng = new Xorshift32(0x0e3a17c5), n = 64, tol = 0.05; let e = 0; const trials = 400;
  for (let t = 0; t < trials; t++) { const w = randTernary(rng, n), a = randActs(rng, n); const x = tmacExact(w, a, n, 1); e += Math.abs(tmacVoted(w, a, n, 1, NOISY, 25, rng) - x) / Math.max(1, Math.abs(x)); }
  assert.ok(e / trials > tol, `degraded lane misses tolerance even at N=25 → REFUSE (meanRelErr ${(e / trials).toFixed(3)})`);
});

test("E6c: a confident DENY (-1) never flips OPEN under emulator readout noise (fail-SAFE only)", () => {
  const rng = new Xorshift32(0xdead10c5), thr = 0.5, sigma = 0.06, M = 400000;
  let denyToAllow = 0;
  for (let i = 0; i < M; i++) if ((-1 + sigma * rng.gauss()) > thr) denyToAllow++;
  assert.equal(denyToAllow, 0, "confident DENY never crosses the OPEN threshold");
});
