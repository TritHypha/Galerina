#!/usr/bin/env node
// prove-photonic.mjs — re-runnable prove-own-maths for the SHIPPED package code.
//
// Computes the headline D1 (emulator) + D2 (router) claims against independent ground
// truth, using THIS package's compiled dist (not the R&D scripts). Re-runnable, seeded,
// exit 0 iff all pass. Mirrors:
//   Galerina-R-AND-D/scripts/rd-photonic-ppu-emulator-proof.mjs   (D1, 18/18)
//   Galerina-R-AND-D/scripts/rd-photonic-ppu-cost-model-proof.mjs (D2, 25/25)
//
//   Run:  npm run prove   (or: node scripts/prove-photonic.mjs)

import {
  Xorshift32, ACT_MAX, ENOB_CEILING, PHOTONIC, NOISY,
  tmacExact, analogVarianceClosedForm, quantStep, tmacPhotonic, tmacVoted,
  wdmCrosstalkMatrix, applyWdm, freivaldsVerify, freivaldsVerifyCost,
  PartitionDecider, meechRealizedRatio, requiredRedundancy, crossover, Tdigital, Tphotonic,
  PhotonicRuntime,
} from "../dist/index.js";

const results = [];
const ok = (name, cond, detail) => results.push({ name, ok: !!cond, detail });
const randTernary = (rng, n) => { const w = new Int8Array(n); for (let i = 0; i < n; i++) w[i] = Math.floor(rng.next() * 3) - 1; return w; };
const randActs = (rng, n) => { const a = new Int32Array(n); for (let i = 0; i < n; i++) a[i] = Math.floor(rng.next() * (2 * ACT_MAX + 1)) - ACT_MAX; return a; };

// ── D1 emulator ──────────────────────────────────────────────────────────────────────
{
  const rng = new Xorshift32(0x0e3a17c5);
  const ideal = { phaseDriftSigma: 0, readoutSigma: 0, quantBits: 16 }, n = 64, bound = quantStep(n, 16) / 2 + 1e-9;
  let maxAbs = 0; for (let t = 0; t < 3000; t++) { const w = randTernary(rng, n), a = randActs(rng, n); maxAbs = Math.max(maxAbs, Math.abs(tmacPhotonic(w, a, n, 1, ideal, rng) - tmacExact(w, a, n, 1))); }
  ok("D1/E1 high-SNR + many bits → converges to exact (≤ LSB/2)", maxAbs <= bound, `max|err| ${maxAbs.toExponential(2)} ≤ ${bound.toExponential(2)}`);

  const phys = { phaseDriftSigma: 0.05, readoutSigma: 0.4, quantBits: 0 }, m = 24, w = randTernary(rng, m), a = randActs(rng, m), exact = tmacExact(w, a, m, 1);
  const predicted = analogVarianceClosedForm(w, a, m, phys);
  let s = 0, ss = 0; const D = 200000; for (let t = 0; t < D; t++) { const y = tmacPhotonic(w, a, m, 1, phys, rng) - exact; s += y; ss += y * y; }
  const measVar = ss / D - (s / D) ** 2;
  ok("D1/E2 MC variance == first-principles closed form (<3%)", Math.abs(measVar - predicted) / predicted < 0.03, `meas ${measVar.toFixed(3)} vs ${predicted.toFixed(3)}`);

  const m2 = 8, leak = 0.1, W = wdmCrosstalkMatrix(m2, leak);
  let maxEnergyErr = 0; for (let t = 0; t < 2000; t++) { const powIn = Float64Array.from({ length: m2 }, () => rng.next() * 10); const powOut = applyWdm(W, powIn); let ein = 0, eout = 0; for (let i = 0; i < m2; i++) { ein += powIn[i]; eout += powOut[i]; } maxEnergyErr = Math.max(maxEnergyErr, Math.abs(eout - ein) / Math.max(1e-12, ein)); }
  ok("D1/E4 WDM coupler conserves optical energy (out == in)", maxEnergyErr < 1e-12, `max drift ${maxEnergyErr.toExponential(2)}`);

  const nn = 8, k = 20; const randMat = () => Array.from({ length: nn }, () => Float64Array.from({ length: nn }, () => Math.floor(rng.next() * 9) - 4));
  const matmul = (A, B) => { const C = Array.from({ length: nn }, () => new Float64Array(nn)); for (let i = 0; i < nn; i++) for (let kk = 0; kk < nn; kk++) { const av = A[i][kk]; for (let j = 0; j < nn; j++) C[i][j] += av * B[kk][j]; } return C; };
  let caught = 0; const T = 1500; for (let t = 0; t < T; t++) { const A = randMat(), B = randMat(), C = matmul(A, B); const Cc = C.map((r) => Float64Array.from(r)); const i = Math.floor(rng.next() * nn), j = Math.floor(rng.next() * nn); Cc[i][j] += (rng.next() < 0.5 ? 1 : -1) * (1 + Math.floor(rng.next() * 3)); if (!freivaldsVerify(A, B, Cc, nn, k, 1e-9, () => rng.next())) caught++; }
  ok("D1/E5 Freivalds catches out-of-tolerance product (≥99.9%)", caught / T >= 0.999, `caught ${(100 * caught / T).toFixed(2)}%; verify ${freivaldsVerifyCost(256, k).toLocaleString()} < op ${(256 ** 3).toLocaleString()}`);
}

// ── D2 router ──────────────────────────────────────────────────────────────────────────
{
  const decider = new PartitionDecider();
  const { idealRatio, realizedRatio } = meechRealizedRatio();
  ok("D2/M1 Meech ideal ~9.4× / realized ~1.9×", Math.abs(idealRatio - 9.4) < 0.2 && realizedRatio > 1.6 && realizedRatio < 2.3, `ideal ${idealRatio.toFixed(2)}× realized ${realizedRatio.toFixed(2)}×`);

  let violations = 0, slowdowns = 0, phot = 0;
  for (let n = 1; n <= 4096; n++) for (const Nv of [1, 3, 9, 25]) {
    const r = decider.decide({ n, redundancyN: Nv, lane: "photonic" });
    const realised = r.target === "photonic" ? Tphotonic(n, Nv) : Tdigital(n);
    if (r.target === "photonic") { phot++; if (Tphotonic(n, Nv) >= Tdigital(n)) violations++; }
    if (realised > Tdigital(n) + 1e-9) slowdowns++;
  }
  ok("D2/M2 NEVER a slowdown over n=1..4096 × N∈{1,3,9,25}", violations === 0 && slowdowns === 0 && phot > 0, `${violations} mis-routes, ${slowdowns} slowdowns, ${phot} photonic offloads`);

  ok("D2/M4 clean lane votes into spec; noisy lane INFEASIBLE", Number.isFinite(requiredRedundancy(256, PHOTONIC, 0.02)) && !Number.isFinite(requiredRedundancy(256, NOISY, 0.02)), "clean finite / noisy Infinity");

  const huge = 100000;
  ok("D2/M5 crypto/control-flow stay digital even when huge (crypto-on-core)",
    decider.decide({ n: huge, lane: "photonic", isCrypto: true }).target === "digital" &&
    decider.decide({ n: huge, lane: "photonic", isControlFlow: true }).target === "digital", "both digital");
  ok("D2/M6 NaN/negative inputs fail closed → digital",
    decider.decide({ n: 1024, redundancyN: NaN, lane: "photonic" }).target === "digital" &&
    decider.decide({ n: -5, redundancyN: 1, lane: "photonic" }).target === "digital", "both digital");
}

// ── Integration: the fail-closed runtime path ────────────────────────────────────────────
{
  const n = Math.ceil(crossover(1) * 8);
  let r = 0x12345 >>> 0; const trits = [], acts = [];
  for (let i = 0; i < n; i++) { r ^= r << 13; r >>>= 0; r ^= r >>> 17; r ^= r << 5; r >>>= 0; trits.push((r % 3) - 1); acts.push(((r >>> 3) % 7) - 3); }
  const exact = tmacExact(trits, acts, n, 1);
  const tamper = { execute: () => ({ value: exact + 1e6, executedNatively: false, bridgeId: "tamper", technique: "ternary", latencyMs: 0, deterministic: false }), executeExact: () => exact };
  const out = new PhotonicRuntime(tamper).run({ opClass: "feedforward", precision: "ternary", correlationId: "k", weights: new Int32Array(1), activations: Int32Array.from([0]), count: n, scale: 1 }, { n, lane: "photonic", tolerance: 0.05 });
  ok("INT a routed-photonic kernel that fails re-verify → DENY + digital fallback (fail-closed)", out.decision.target === "photonic" && out.target === "digital" && out.fellBack === true && out.value === exact, `decision=${out.decision.target} committed=${out.target} value==exact:${out.value === exact}`);
}

// ── summary ──────────────────────────────────────────────────────────────────────────
let fails = 0;
console.log("\n-- @galerina/ext-photonic-emulator — prove-own-maths (D1 emulator + D2 router + integration) --");
for (const x of results) { if (!x.ok) fails++; console.log(`${x.ok ? "PASS" : "FAIL"} ${x.name.padEnd(58)} ${x.detail}`); }
console.log(fails === 0
  ? `\n${results.length}/${results.length} PASS — emulator converges + matches the closed-form variance, WDM conserves energy, Freivalds catches corruption; the router never causes a slowdown and gates crypto off; the runtime path fails closed to digital. EMULATED (no measured speedup).`
  : `\n${results.length - fails}/${results.length} PASS, ${fails} FAILED — review above.`);
process.exit(fails === 0 ? 0 : 1);
