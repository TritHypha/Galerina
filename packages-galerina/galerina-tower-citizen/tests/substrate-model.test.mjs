// Substrate failure-mode model (Direction C) — seeded, fail-closed.
// Closed-form von Neumann NMR check is canonical; the seeded NoisyLane fault-injector
// is cross-checked against it. The central result (§4): noise can cost availability,
// never safety — effectiveVerdict = vAnd(ideal, reading) can never upgrade 0/-1 → +1.
//
// Spec + proofs: docs/Knowledge-Bases/galerina-substrate-failure-model.md
import assert from "node:assert/strict";
import { describe, it, test } from "node:test";
import {
  // substrate model
  SubstrateParamError, singleLaneErrorProbability, nmrFailureProbability, majorityVote,
  NoisyLane, effectiveVerdict, checkGuarantee, verifyToleranceUnderNoise,
  empiricalAdversarialError, votedTrit3, SUBSTRATE_DIAGNOSTICS,
  // Direction A (reused) + the underlying gate
  Verdict, authorize, consensusTrit,
} from "../dist/index.js";

const TRITS = [-1, 0, 1];
const approx = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

// Noiseless and noisy parameter fixtures (seed is arbitrary but fixed → reproducible).
const CLEAN = { seed: 12345, phaseDriftSigma: 0, crosstalkCoeff: 0, laneFailureProb: 0, readoutSigma: 0 };
const NOISY = { seed: 12345, phaseDriftSigma: 0.1, crosstalkCoeff: 0, laneFailureProb: 0, readoutSigma: 0 }; // pBad = 0.1
const SEVERE = { seed: 777, phaseDriftSigma: 0.1, crosstalkCoeff: 0, laneFailureProb: 0.2, readoutSigma: 1.0 }; // pBad ≥ 0.5

// ── 0. Reuse validation — majorityVote(N=3) ≡ the shipped consensusTrit ───────

describe("substrate reuses the shipped ternary kernel (no reimplementation)", () => {
  it("majorityVote([a,b,c]) ≡ votedTrit3 ≡ consensusTrit for all 27 triples", () => {
    for (const a of TRITS) for (const b of TRITS) for (const c of TRITS) {
      assert.equal(majorityVote([a, b, c]), consensusTrit(a, b, c), `majority(${a},${b},${c})`);
      assert.equal(votedTrit3(a, b, c), consensusTrit(a, b, c), `votedTrit3(${a},${b},${c})`);
    }
  });
});

// ── 1. nmrFailureProbability — closed-form sanity + the canonical pBad mapping ─

describe("nmrFailureProbability (von Neumann NMR closed form)", () => {
  it("N=1 returns pBad; endpoints 0 and 1 are fixed; p=0.5 is 0.5 for every odd N", () => {
    for (const p of [0, 0.1, 0.3, 0.5, 0.9, 1]) assert.ok(approx(nmrFailureProbability(p, 1), p), `nmr(${p},1)`);
    for (const N of [1, 3, 5, 7]) {
      assert.ok(approx(nmrFailureProbability(0, N), 0), `nmr(0,${N})`);
      assert.ok(approx(nmrFailureProbability(1, N), 1), `nmr(1,${N})`);
      assert.ok(approx(nmrFailureProbability(0.5, N), 0.5), `nmr(0.5,${N})=0.5 (symmetry)`);
    }
  });
  it("matches the hand-computed TMR value nmr(0.1,3) = 0.028", () => {
    assert.ok(approx(nmrFailureProbability(0.1, 3), 0.028, 1e-9), nmrFailureProbability(0.1, 3));
  });
  it("strictly decreasing in odd N for pBad<0.5; NON-decreasing (voting fails) for pBad>0.5", () => {
    const seq = (p) => [1, 3, 5, 7].map((N) => nmrFailureProbability(p, N));
    const lo = seq(0.2);
    for (let i = 1; i < lo.length; i++) assert.ok(lo[i] < lo[i - 1], `decreasing@${i}: ${lo}`);
    const hi = seq(0.7);
    assert.ok(hi[1] >= hi[0], `pBad>0.5: voting does not help (${hi})`);
  });
  it("pBad = laneFailure OR (survive AND flip), monotone non-decreasing in every parameter", () => {
    assert.ok(approx(singleLaneErrorProbability(CLEAN), 0), "clean → 0");
    assert.ok(approx(singleLaneErrorProbability(NOISY), 0.1), "phaseDrift 0.1 → 0.1");
    assert.ok(singleLaneErrorProbability(SEVERE) >= 0.5, "severe → ≥0.5");
    // monotonicity: raising any parameter never lowers pBad
    const base = singleLaneErrorProbability(NOISY);
    const more = singleLaneErrorProbability({ ...NOISY, crosstalkCoeff: 0.2 });
    assert.ok(more >= base, "more crosstalk ⇒ pBad not lower");
  });
});

// ── 2. Acceptance #1 — tolerance unachievable is flagged ──────────────────────

describe("acceptance #1: tolerance unachievable under noise is flagged", () => {
  const g = { resultId: "r", epsilonDeclared: 0.01, redundancyN: 1, mustCommit: true };
  it("met=false and exactly one SPORE-SUBSTRATE-002, payload epsilonModeled > epsilonDeclared", () => {
    const check = checkGuarantee(NOISY, g);
    assert.equal(check.met, false);
    assert.ok(check.epsilonModeled > g.epsilonDeclared, `${check.epsilonModeled} > ${g.epsilonDeclared}`);
    const prod = verifyToleranceUnderNoise(NOISY, g, { hasCryptoEffect: false, laneIsNoisy: true, sinkRequiresDeterminism: false }, "production");
    assert.equal(prod.verdict, Verdict.DENY);
    assert.equal(prod.diagnostic.code, SUBSTRATE_DIAGNOSTICS.TOLERANCE_UNACHIEVABLE_UNDER_NOISE);
    assert.equal(prod.diagnostic.code, "SPORE-SUBSTRATE-002");
    assert.equal(prod.diagnostic.severity, "error");
  });
  it("dev profile downgrades SPORE-SUBSTRATE-002 to warning but changes ONLY severity (verdict/code/check invariant)", () => {
    const ctx = { hasCryptoEffect: false, laneIsNoisy: true, sinkRequiresDeterminism: false };
    const prod = verifyToleranceUnderNoise(NOISY, g, ctx, "production");
    const dev = verifyToleranceUnderNoise(NOISY, g, ctx, "dev");
    assert.equal(dev.diagnostic.code, "SPORE-SUBSTRATE-002");
    assert.equal(dev.diagnostic.severity, "warning");
    // the profile must affect severity ONLY — never the core decision
    assert.equal(dev.verdict, Verdict.DENY);
    assert.equal(dev.verdict, prod.verdict, "verdict is profile-invariant");
    assert.equal(dev.diagnostic.code, prod.diagnostic.code, "code is profile-invariant");
    assert.equal(dev.diagnostic.name, prod.diagnostic.name, "name is profile-invariant");
    assert.equal(dev.diagnostic.message, prod.diagnostic.message, "message is profile-invariant");
    assert.deepEqual(dev.check, prod.check, "check is profile-invariant");
    assert.notEqual(dev.diagnostic.severity, prod.diagnostic.severity, "ONLY severity differs");
  });
});

// ── 3. Acceptance #2 — raising TMR clears it, monotonically ───────────────────

describe("acceptance #2: raising redundancy clears the diagnostic, monotonically", () => {
  it("trace over N=1,3,5,7 strictly decreasing; a smallest N* flips met false→true and stays cleared", () => {
    const eps = 0.05; // pBad(NOISY)=0.1: N=1→0.1 (unmet), N=3→0.028 (met)
    const trace = checkGuarantee(NOISY, { resultId: "r", epsilonDeclared: eps, redundancyN: 1, mustCommit: true }).trace;
    for (let i = 1; i < trace.length; i++) assert.ok(trace[i].epsilon < trace[i - 1].epsilon, `decreasing@${i}`);
    const metAt = (N) => checkGuarantee(NOISY, { resultId: "r", epsilonDeclared: eps, redundancyN: N, mustCommit: true }).met;
    assert.equal(metAt(1), false, "N=1 unmet");
    assert.equal(metAt(3), true, "N=3 clears");
    assert.equal(metAt(5), true, "stays cleared at N=5");
    assert.equal(metAt(7), true, "stays cleared at N=7");
  });
  it("pBad≥0.5: redundancyHelps=false, the trace NEVER clears (non-decreasing), and SPORE-SUBSTRATE-003 fires", () => {
    const eps = 1e-3;
    const check = checkGuarantee(SEVERE, { resultId: "r", epsilonDeclared: eps, redundancyN: 7, mustCommit: true });
    assert.equal(check.redundancyHelps, false);
    assert.equal(check.met, false, "never met for pBad≥0.5");
    // the trace must be NON-decreasing (voting does not help) and clear at NO N
    for (let i = 1; i < check.trace.length; i++) {
      assert.ok(check.trace[i].epsilon >= check.trace[i - 1].epsilon, `non-decreasing@${i}: ${JSON.stringify(check.trace)}`);
    }
    assert.ok(check.trace.every((t) => t.epsilon > eps), "no redundancy level clears the tolerance");
    const d = verifyToleranceUnderNoise(SEVERE, { resultId: "r", epsilonDeclared: eps, redundancyN: 3, mustCommit: true },
      { hasCryptoEffect: false, laneIsNoisy: true, sinkRequiresDeterminism: false }, "production");
    assert.equal(d.diagnostic.code, "SPORE-SUBSTRATE-003");
    assert.equal(d.diagnostic.severity, "error");
  });
});

// ── 4. Acceptance #3 — deterministic / seeded / reproducible ──────────────────

describe("acceptance #3: deterministic & seeded (reproducible)", () => {
  it("same seed ⇒ byte-identical read stream; different seed ⇒ different stream", () => {
    const a = new NoisyLane(SEVERE);
    const b = new NoisyLane(SEVERE);
    const c = new NoisyLane({ ...SEVERE, seed: SEVERE.seed + 1 });
    const reads = (lane) => Array.from({ length: 50 }, (_, i) => lane.read(1, `op:${i}`).value);
    assert.deepEqual(reads(a), reads(b), "identical params ⇒ identical stream");
    assert.notDeepEqual(reads(a), reads(c), "different seed ⇒ different stream (overwhelmingly likely)");
  });
  it("checkGuarantee and empiricalAdversarialError are reproducible across calls", () => {
    const g = { resultId: "r", epsilonDeclared: 0.02, redundancyN: 3, mustCommit: true };
    assert.deepEqual(checkGuarantee(NOISY, g), checkGuarantee(NOISY, g));
    assert.equal(empiricalAdversarialError(NOISY, 1, 3, 5000), empiricalAdversarialError(NOISY, 1, 3, 5000));
  });
});

// ── 5. The central result — substrate cannot fail open (safety, §4) ───────────

describe("safety theorem: substrate noise can cost availability, never safety", () => {
  it("EXHAUSTIVE over ideal×reading: vAnd(ideal,reading) ≤ ideal, authorize ⇔ (ideal=+1 ∧ reading=+1)", () => {
    for (const ideal of TRITS) for (const reading of TRITS) {
      const e = effectiveVerdict(ideal, reading);
      assert.ok(e <= ideal, `degrade-only: e=${e} > ideal=${ideal}`);
      assert.equal(authorize(e), ideal === 1 && reading === 1, `authorize(${ideal},${reading})`);
      if (ideal !== 1) assert.notEqual(e, 1, `noise upgraded a non-allow ideal=${ideal} to ALLOW`);
    }
  });
  it("an all-dark substrate (laneFailureProb=1) abstains and NEVER authorizes, any ideal, any odd N", () => {
    const dark = new NoisyLane({ seed: 9, phaseDriftSigma: 0, crosstalkCoeff: 0, laneFailureProb: 1, readoutSigma: 0 });
    for (const ideal of TRITS) for (const N of [1, 3, 5, 7]) {
      const voted = dark.readVoted(ideal, N, `op:${ideal}:${N}`);
      assert.equal(voted.value, 0, "every lane dark ⇒ vote is INDETERMINATE");
      assert.equal(authorize(effectiveVerdict(ideal, voted.value)), false, "dark substrate never authorizes");
    }
  });
  it("a flipped indeterminate ideal cannot be coerced to ALLOW (ties to Direction A No-Coercion)", () => {
    // ideal = INDETERMINATE (0); even if the substrate reads +1, the effective verdict stays 0 → deny.
    for (const reading of TRITS) assert.notEqual(effectiveVerdict(Verdict.INDETERMINATE, reading), Verdict.ALLOW);
  });
});

// ── 6. Cross-check — the seeded sampler converges to the closed form ──────────

describe("cross-check: empirical adversarial error ≈ nmrFailureProbability(pBad,N)", () => {
  it("matches the analytic NMR value within sampling slack (ideal=+1 and ideal=-1)", () => {
    const pBad = singleLaneErrorProbability(NOISY); // 0.1
    for (const ideal of [1, -1]) {
      for (const N of [1, 3, 5]) {
        const emp = empiricalAdversarialError(NOISY, ideal, N, 40000);
        const ana = nmrFailureProbability(pBad, N);
        assert.ok(Math.abs(emp - ana) < 0.01, `ideal=${ideal} N=${N}: emp=${emp} ana=${ana}`);
      }
    }
  });
});

// ── 7. No-regression (noiseless) + crypto-on-noisy + unvoted-into-deterministic

describe("no-regression: a noiseless substrate is a perfect pass-through", () => {
  it("all params 0 ⇒ read is the identity for every trit; epsilonModeled=0; ALLOW with no diagnostic", () => {
    const lane = new NoisyLane(CLEAN);
    for (const t of TRITS) {
      const r = lane.read(t, "op");
      assert.equal(r.value, t, `identity(${t})`);
      assert.equal(r.indeterminate, false, `clean read is never indeterminate (${t})`);
      assert.ok(approx(r.noiseMargin, 1), `clean noiseMargin(${t}) = 1`); // 1 - pFlip, pFlip = 0
    }
    // the non-trivial branch of the `1 - pFlip` margin is also pinned (NOISY pFlip = 0.1 → 0.9)
    assert.ok(approx(new NoisyLane(NOISY).read(1, "op").noiseMargin, 0.9), "noisy noiseMargin = 1 - pFlip");
    const g = { resultId: "r", epsilonDeclared: 0, redundancyN: 1, mustCommit: true };
    const check = checkGuarantee(CLEAN, g);
    assert.ok(approx(check.epsilonModeled, 0));
    assert.equal(check.met, true);
    const d = verifyToleranceUnderNoise(CLEAN, g, { hasCryptoEffect: false, laneIsNoisy: false, sinkRequiresDeterminism: false }, "production");
    assert.equal(d.verdict, Verdict.ALLOW);
    assert.equal(d.diagnostic, undefined);
  });
  it("crypto on a CLEAN lane does NOT trip SPORE-SUBSTRATE-001 (only noisy lanes do)", () => {
    const g = { resultId: "r", epsilonDeclared: 0, redundancyN: 1, mustCommit: true };
    const d = verifyToleranceUnderNoise(CLEAN, g, { hasCryptoEffect: true, laneIsNoisy: false, sinkRequiresDeterminism: false }, "production");
    assert.equal(d.verdict, Verdict.ALLOW);
  });
});

describe("crypto-on-noisy and unvoted-into-deterministic are fail-closed", () => {
  const easy = { resultId: "r", epsilonDeclared: 0.99, redundancyN: 1, mustCommit: true }; // tolerance trivially met
  it("SPORE-SUBSTRATE-001: crypto effect on a noisy lane is forbidden regardless of tolerance", () => {
    const d = verifyToleranceUnderNoise(NOISY, easy, { hasCryptoEffect: true, laneIsNoisy: true, sinkRequiresDeterminism: false }, "production");
    assert.equal(d.verdict, Verdict.DENY);
    assert.equal(d.diagnostic.code, "SPORE-SUBSTRATE-001");
    assert.equal(d.diagnostic.severity, "error");
  });
  it("SPORE-SUBSTRATE-004: un-voted (N=1) noisy result into a deterministic sink is denied", () => {
    const d = verifyToleranceUnderNoise(NOISY, easy, { hasCryptoEffect: false, laneIsNoisy: true, sinkRequiresDeterminism: true }, "production");
    assert.equal(d.verdict, Verdict.DENY);
    assert.equal(d.diagnostic.code, "SPORE-SUBSTRATE-004");
  });
  it("voting (N=3) admits a result into a deterministic sink (004 does not fire)", () => {
    const voted = { resultId: "r", epsilonDeclared: 0.99, redundancyN: 3, mustCommit: true };
    const d = verifyToleranceUnderNoise(NOISY, voted, { hasCryptoEffect: false, laneIsNoisy: true, sinkRequiresDeterminism: true }, "production");
    assert.equal(d.verdict, Verdict.ALLOW);
  });
});

// ── 8. Input validation traps (no silent coercion of toxic params) ────────────

test("invalid parameters and degrees throw SubstrateParamError", () => {
  assert.throws(() => new NoisyLane({ ...CLEAN, phaseDriftSigma: 2 }), SubstrateParamError);
  assert.throws(() => new NoisyLane({ ...CLEAN, seed: 1.5 }), SubstrateParamError);
  assert.throws(() => singleLaneErrorProbability({ ...CLEAN, laneFailureProb: -0.1 }), SubstrateParamError);
  assert.throws(() => nmrFailureProbability(0.5, 2), SubstrateParamError); // even N → no majority
  assert.throws(() => nmrFailureProbability(0.5, 0), SubstrateParamError);
  assert.throws(() => majorityVote([1, 2, 0]), SubstrateParamError);     // 2 is not a trit
});
