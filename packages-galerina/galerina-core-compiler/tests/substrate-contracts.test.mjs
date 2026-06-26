// Direction B — substrate {} contract obligations (B1/B2/B3), fail-closed.
// Governance-level acceptance via the real parse→effects→verify harness, plus a
// drift-control oracle pinning the compiler-side NMR math to the SAME hand-verified
// golden constants asserted in tower-citizen's substrate-model.test.mjs
// (nmr(0.1,3)=0.028, nmr(0.5,N)=0.5 ∀ odd N, nmr(0,N)=0, nmr(1,N)=1). If the two NMR
// copies ever diverge, at least one suite fails.
//
// Tolerances are written in SCIENTIFIC NOTATION (1e-6 …) — the spec's canonical form and
// the natural way to express tight error envelopes. The lexer tokenizes these as a single
// numeric literal; malformed/split exponents fail closed (SPORE-SUBSTRATE-002).
//
// Spec: docs/Knowledge-Bases/galerina-substrate-contracts.md
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  parseProgram, checkEffects, verifyGovernance,
  SPORE_SUBSTRATE_001, SPORE_SUBSTRATE_002, SPORE_SUBSTRATE_003, SPORE_SUBSTRATE_004,
  singleLaneErrorProbability, nmrFailureProbability,
} from "../dist/index.js";

function parseAndVerify(source, profile = "dev") {
  const parsed = parseProgram(source, "test.spore");
  const effects = checkEffects(parsed.flows, parsed.ast);
  return verifyGovernance(parsed.ast, parsed.flows, effects, profile);
}
const has = (r, code) => r.diagnostics.some((d) => d.code === code);
const find = (r, code) => r.diagnostics.find((d) => d.code === code);
const approx = (a, b, e = 1e-9) => Math.abs(a - b) <= e;
const substrateCount = (r) => r.diagnostics.filter((d) => d.code.startsWith("SPORE-SUBSTRATE-")).length;

// ── B1 — crypto on a noisy lane (SPORE-SUBSTRATE-001) ───────────────────────────

const b1src = (lane) => `
secure flow sealReceipt(request: Request) -> Result<Response, ApiError>
contract {
  effects { crypto.sign audit.write }
  substrate {
    lane: ${lane}
    tolerance: 5e-3
    redundancy: 3
  }
}
{ return Ok(Response.ok({})) }
`;

describe("B1 — crypto-on-noisy-lane (SPORE-SUBSTRATE-001)", () => {
  it("crypto.sign on a photonic lane is denied (error), even with redundancy: 3", () => {
    const r = parseAndVerify(b1src("photonic"), "production");
    assert.ok(has(r, "SPORE-SUBSTRATE-001"));
    assert.equal(find(r, "SPORE-SUBSTRATE-001").severity, "error");
    assert.match(find(r, "SPORE-SUBSTRATE-001").message, /digital lane|bit-exact/i);
  });
  it("SPORE-SUBSTRATE-001 is profile-independent (still error in dev)", () => {
    assert.equal(find(parseAndVerify(b1src("photonic"), "dev"), "SPORE-SUBSTRATE-001").severity, "error");
  });
  it("the same crypto effect on a digital lane is fine (no 001)", () => {
    assert.ok(!has(parseAndVerify(b1src("digital"), "production"), "SPORE-SUBSTRATE-001"));
  });
});

// ── #34 — confidentiality crypto effects are lane-gated too (crypto-on-core) ──
const confSrc = (effect, lane) => `
secure flow encryptVec(request: Request) -> Result<Response, ApiError>
contract {
  effects { ${effect} audit.write }
  substrate { lane: ${lane}  tolerance: 5e-3  redundancy: 3 }
}
{ return Ok(Response.ok({})) }
`;
describe("#34 — KEM-DEM/AEAD effects on a noisy lane (SPORE-SUBSTRATE-001)", () => {
  for (const eff of ["crypto.encrypt", "crypto.decrypt", "crypto.seal"]) {
    it(`${eff} on a photonic lane is denied (bit-exact required)`, () => {
      assert.ok(has(parseAndVerify(confSrc(eff, "photonic"), "production"), "SPORE-SUBSTRATE-001"),
        `${eff} must be crypto-on-core gated`);
    });
    it(`${eff} on a digital lane is fine`, () => {
      assert.ok(!has(parseAndVerify(confSrc(eff, "digital"), "production"), "SPORE-SUBSTRATE-001"));
    });
  }
});

// ── B2 — tolerance / redundancy sufficiency (SPORE-SUBSTRATE-002 / -003) ────────

const b2src = (tolerance, redundancy, lane = "photonic") => `
flow average(request: Request) -> Result<Response, ApiError>
contract {
  substrate {
    lane: ${lane}
    tolerance: ${tolerance}
    redundancy: ${redundancy}
  }
}
{ return Ok(Response.ok({})) }
`;

describe("B2 — redundancy sufficiency (SPORE-SUBSTRATE-002/-003)", () => {
  it("tight tolerance at N=1 is rejected; redundancy: tmr clears it (monotone)", () => {
    const r1 = parseAndVerify(b2src("1e-2", "1"), "production"); // nmr(0.02,1)=0.02 > 0.01
    assert.ok(has(r1, "SPORE-SUBSTRATE-002"));
    assert.equal(find(r1, "SPORE-SUBSTRATE-002").severity, "error");

    const r2 = parseAndVerify(b2src("1e-2", "tmr"), "production"); // nmr(0.02,3)=0.00118 < 0.01
    assert.equal(substrateCount(r2), 0, "raising redundancy to TMR fully admits the flow");
  });

  it("BLOCKER REGRESSION: scientific-notation tolerance is NOT misparsed to 1.0", () => {
    // If `1e-6` silently became 1.0, nmr(0.02,1)=0.02 ≤ 1.0 → met → NO diagnostic (fail-open).
    // The presence of SPORE-SUBSTRATE-002 proves the tolerance was parsed as a true 1e-6.
    const r = parseAndVerify(b2src("1e-6", "1"), "production");
    assert.ok(has(r, "SPORE-SUBSTRATE-002"), "1e-6 must be a tight tolerance, not 1.0");
    assert.equal(find(r, "SPORE-SUBSTRATE-002").severity, "error");
  });

  it("SPORE-SUBSTRATE-002 is a warning in dev, an error in production", () => {
    assert.equal(find(parseAndVerify(b2src("1e-2", "1"), "dev"), "SPORE-SUBSTRATE-002").severity, "warning");
    assert.equal(find(parseAndVerify(b2src("1e-2", "1"), "production"), "SPORE-SUBSTRATE-002").severity, "error");
  });

  it("declared redundancy insufficient but voting WOULD help (raise N) → SPORE-SUBSTRATE-003", () => {
    // photonic pBad 0.02 (<0.5 → redundancy helps); tolerance 1e-7 unmet at N=3 (nmr=0.00118).
    const r = parseAndVerify(b2src("1e-7", "3"), "production");
    assert.ok(has(r, "SPORE-SUBSTRATE-003"));
    assert.equal(find(r, "SPORE-SUBSTRATE-003").severity, "error");
    assert.match(find(r, "SPORE-SUBSTRATE-003").message, /raise n|insufficient/i);
    assert.ok(!has(r, "SPORE-SUBSTRATE-002"));
  });

  it("pBad ≥ 0.5 (degraded 'noisy' lane): voting cannot converge → SPORE-SUBSTRATE-003 (no false promise)", () => {
    const r = parseAndVerify(b2src("1e-3", "3", "noisy"), "production"); // noisy pBad 0.60 ≥ 0.5
    assert.ok(has(r, "SPORE-SUBSTRATE-003"));
    assert.equal(find(r, "SPORE-SUBSTRATE-003").severity, "error");
    assert.match(find(r, "SPORE-SUBSTRATE-003").message, /converge|0\.5|will not help/i);
    assert.ok(!has(r, "SPORE-SUBSTRATE-002"));
  });
});

// ── B3 — un-voted analog into a deterministic sink (SPORE-SUBSTRATE-004) ────────

const b3src = (redundancy) => `
flow scoreRisk(request: Request) -> Result<Response, ApiError>
contract {
  substrate {
    lane: photonic
    tolerance: 1e-2
    redundancy: ${redundancy}
  }
}
{ return Ok(Response.ok({})) }
`;

describe("B3 — unvoted-analog-into-deterministic (SPORE-SUBSTRATE-004)", () => {
  it("un-voted (N=1) noisy result in a deterministic profile is rejected", () => {
    const r = parseAndVerify(b3src("1"), "deterministic");
    assert.ok(has(r, "SPORE-SUBSTRATE-004"));
    assert.equal(find(r, "SPORE-SUBSTRATE-004").severity, "error");
  });
  it("a voted (N=3) result is admitted into the same deterministic sink", () => {
    const r = parseAndVerify(b3src("3"), "deterministic");
    assert.equal(substrateCount(r), 0, "a vote restores determinism and meets the tolerance");
  });

  // The sink signal is also a `safety { require deterministic_execution }` clause, independent
  // of the deployment profile (spec §4.3 item 3 — completed as a follow-up).
  const safetySrc = (redundancy) => `
flow scoreRisk(request: Request) -> Result<Response, ApiError>
contract {
  safety { require deterministic_execution }
  substrate {
    lane: photonic
    tolerance: 1e-2
    redundancy: ${redundancy}
  }
}
{ return Ok(Response.ok({})) }
`;
  it("a safety{require deterministic_execution} clause is a determinism sink even in production (004)", () => {
    const r = parseAndVerify(safetySrc("1"), "production"); // NOT the deterministic profile
    assert.ok(has(r, "SPORE-SUBSTRATE-004"), "the safety clause binds determinism regardless of profile");
    assert.equal(find(r, "SPORE-SUBSTRATE-004").severity, "error");
  });
  it("without the safety clause, the same un-voted flow in production is NOT a 004 sink", () => {
    const r = parseAndVerify(b3src("1"), "production"); // production alone is not a determinism sink
    assert.ok(!has(r, "SPORE-SUBSTRATE-004"), "production profile alone does not require determinism");
  });
  it("a voted (N=3) flow clears the safety-clause sink too", () => {
    const r = parseAndVerify(safetySrc("3"), "production");
    assert.ok(!has(r, "SPORE-SUBSTRATE-004"), "a vote satisfies the safety-clause determinism requirement");
  });
});

// ── No-regression — flows without substrate {} are completely unaffected ──────

describe("no-regression: substrate checks are inert without a substrate block", () => {
  it("a flow with NO substrate block emits zero SPORE-SUBSTRATE-* (even with crypto effects)", () => {
    const r = parseAndVerify(`
secure flow createOrder(request: Request) -> Result<Response, ApiError>
contract { effects { database.write audit.write crypto.sign } }
{ return Ok(Response.ok({})) }
`, "production");
    assert.equal(substrateCount(r), 0);
  });
  it("lane: digital is inert — crypto + tight tolerance still emit nothing", () => {
    const r = parseAndVerify(`
flow f(request: Request) -> Result<Response, ApiError>
contract {
  effects { crypto.hash }
  substrate {
    lane: digital
    tolerance: 1e-9
    redundancy: 1
  }
}
{ return Ok(Response.ok({})) }
`, "production");
    assert.equal(substrateCount(r), 0);
  });
});

// ── Fail-closed malformed input ───────────────────────────────────────────────

const malformedSrc = (tol, redundancy) => `
flow f(request: Request) -> Result<Response, ApiError>
contract {
  substrate {
    lane: photonic
    tolerance: ${tol}
    redundancy: ${redundancy}
  }
}
{ return Ok(Response.ok({})) }
`;

describe("malformed substrate declarations fail closed (never silently coerced)", () => {
  it("an even (non-odd) redundancy is rejected as error", () => {
    const r = parseAndVerify(malformedSrc("1e-2", "2"), "production");
    assert.ok(has(r, "SPORE-SUBSTRATE-002"));
    assert.equal(find(r, "SPORE-SUBSTRATE-002").severity, "error");
  });
  it("an incomplete/split exponent (1e-) is rejected, not truncated to a loose 1.0", () => {
    const r = parseAndVerify(malformedSrc("1e-", "3"), "production");
    assert.ok(has(r, "SPORE-SUBSTRATE-002"));
    assert.equal(find(r, "SPORE-SUBSTRATE-002").severity, "error");
  });
});

// ── Fail-open regressions (2026-06-25) ───────────────────────────────────────
// Two fail-opens found while building the gaming-substrate worked example. Both let a
// crypto effect run on a noisy lane undetected (the exact thing SPORE-SUBSTRATE-001 exists
// to stop), so both are pinned here.

describe("fail-open regression: PQ-suffixed crypto effects are crypto-on-core too", () => {
  // CRYPTO_EFFECT was `$`-anchored, so the PQ form a certified profile MANDATES
  // (crypto.sign.hybrid — bare crypto.sign is rejected by SPORE-CRYPTO-PQ-001) slipped past
  // the crypto-on-noisy gate. Fixed to match crypto.<head>.* via a `(\.|$)` tail.
  const pqSrc = (effect, lane) => `
secure flow signPq(request: Request) -> Result<Response, ApiError>
contract {
  intent { "pin PQ crypto-on-core" }
  effects { ${effect} audit.write }
  substrate {
    lane: ${lane}
    tolerance: 5e-3
    redundancy: 3
  }
}
{ return Ok(Response.ok({})) }
`;
  for (const eff of ["crypto.sign.hybrid", "crypto.sign.mldsa65", "crypto.sign.slhdsa"]) {
    it(`${eff} on a photonic lane fires SPORE-SUBSTRATE-001 (the PQ form must not exempt it)`, () => {
      assert.ok(has(parseAndVerify(pqSrc(eff, "photonic"), "production"), "SPORE-SUBSTRATE-001"),
        `${eff} must be gated as crypto-on-core`);
    });
    it(`${eff} on a digital lane is fine (no SUBSTRATE-001)`, () => {
      assert.ok(!has(parseAndVerify(pqSrc(eff, "digital"), "production"), "SPORE-SUBSTRATE-001"));
    });
  }
});

describe("fail-open regression: a malformed lane fails closed, never silently inert", () => {
  // parseLaneField fails an unrecognised lane keyword closed to value "digital" + malformed.
  // The `inf.lane === "digital"` early-return used to run BEFORE the malformed check, so the
  // safe-default masqueraded as an author-chosen inert lane and swallowed everything. Now the
  // malformed check runs first → SPORE-SUBSTRATE-002 error.
  const laneSrc = (laneLine, effect = "") => `
flow tryLane(request: Request) -> Result<Response, ApiError>
contract {
  ${effect ? `effects { ${effect} }` : ""}
  substrate {
    ${laneLine}
    tolerance: 5e-3
    redundancy: 3
  }
}
{ return Ok(Response.ok({})) }
`;
  it("an unrecognised lane keyword (lane: gaming) is rejected as SPORE-SUBSTRATE-002, not swallowed", () => {
    const r = parseAndVerify(laneSrc("lane: gaming"), "production");
    assert.ok(has(r, "SPORE-SUBSTRATE-002"), "lane: gaming must fail closed, not be silently inert");
    assert.equal(find(r, "SPORE-SUBSTRATE-002").severity, "error");
  });
  it("a trailing // comment polluting the lane value fails closed (does not drop the crypto gate)", () => {
    // Before the fix this read lane as inert digital and silently dropped SPORE-SUBSTRATE-001
    // on the crypto effect. Now the polluted value is malformed → SPORE-SUBSTRATE-002 (build fails).
    const r = parseAndVerify(laneSrc("lane: photonic   // optical accelerator", "crypto.sign.hybrid"), "production");
    assert.ok(has(r, "SPORE-SUBSTRATE-002"), "a comment-polluted lane must fail closed");
    assert.ok(!has(r, "SPORE-SUBSTRATE-001") || true); // either way the flow does not pass clean
    assert.notEqual(substrateCount(r), 0, "must NOT compile clean (the fail-open was a clean pass)");
  });
});

// ── Drift-control oracle + monotonicity + constant identity ───────────────────

describe("drift-control oracle (compiler NMR math must match tower-citizen golden constants)", () => {
  it("nmrFailureProbability matches the hand-verified golden table", () => {
    assert.ok(approx(nmrFailureProbability(0.1, 1), 0.1), "nmr(0.1,1)");
    assert.ok(approx(nmrFailureProbability(0.1, 3), 0.028), "nmr(0.1,3) = 0.028 (TMR hand-verify)");
    for (const N of [1, 3, 5, 7]) {
      assert.ok(approx(nmrFailureProbability(0, N), 0), `nmr(0,${N})`);
      assert.ok(approx(nmrFailureProbability(1, N), 1), `nmr(1,${N})`);
      assert.ok(approx(nmrFailureProbability(0.5, N), 0.5), `nmr(0.5,${N})=0.5 symmetry`);
    }
  });
  it("nmr is strictly decreasing for pBad<0.5 and non-decreasing for pBad≥0.5", () => {
    const lo = [1, 3, 5, 7].map((N) => nmrFailureProbability(0.2, N));
    for (let i = 1; i < lo.length; i++) assert.ok(lo[i] < lo[i - 1], `decreasing@${i}`);
    const hi = [1, 3, 5, 7].map((N) => nmrFailureProbability(0.6, N));
    for (let i = 1; i < hi.length; i++) assert.ok(hi[i] >= hi[i - 1], `non-decreasing@${i} (voting won't converge)`);
  });
  it("singleLaneErrorProbability matches the lane-profile golden values and is monotone", () => {
    const p = (phaseDriftSigma, crosstalkCoeff = 0, laneFailureProb = 0, readoutSigma = 0) =>
      singleLaneErrorProbability({ phaseDriftSigma, crosstalkCoeff, laneFailureProb, readoutSigma });
    assert.ok(approx(p(0), 0), "digital");
    assert.ok(approx(p(0.02), 0.02), "photonic");
    assert.ok(approx(p(0.60), 0.60), "noisy (degraded)");
    // monotone non-decreasing: raising any parameter never lowers pBad
    assert.ok(p(0.02, 0.2) >= p(0.02), "more crosstalk ⇒ pBad not lower");
    assert.ok(p(0.02, 0, 0.01) >= p(0.02), "more lane-failure ⇒ pBad not lower");
  });
  it("SPORE_SUBSTRATE constants carry the registered codes", () => {
    assert.equal(SPORE_SUBSTRATE_001.code, "SPORE-SUBSTRATE-001");
    assert.equal(SPORE_SUBSTRATE_002.code, "SPORE-SUBSTRATE-002");
    assert.equal(SPORE_SUBSTRATE_003.code, "SPORE-SUBSTRATE-003");
    assert.equal(SPORE_SUBSTRATE_004.code, "SPORE-SUBSTRATE-004");
  });
});

// ── TRACK a — substrate { on_indeterminate } disposition knob ──────────────────
// Author-declared disposition on a K3-0 INDETERMINATE substrate reading: trap (default,
// fail-closed), revote:N (re-vote on a converging lane), or fallback_digital (recompute
// exactly). Parsed + validated + recorded; a malformed value fails closed.

const oiSrc = (oi) => `
secure flow readSensor(request: Request) -> Result<Response, ApiError>
contract {
  effects { audit.write }
  substrate {
    lane: photonic
    tolerance: 5e-3
    redundancy: 3
    on_indeterminate: ${oi}
  }
}
{ return Ok(Response.ok({})) }
`;

describe("TRACK a — substrate { on_indeterminate } disposition", () => {
  it("trap | fallback_digital | revote:N are accepted on a passing lane (no substrate diagnostic)", () => {
    for (const oi of ["trap", "fallback_digital", "revote:3"]) {
      const r = parseAndVerify(oiSrc(oi), "production");
      assert.equal(substrateCount(r), 0,
        `on_indeterminate: ${oi} should be clean — got ${JSON.stringify(r.diagnostics.filter((d) => d.code.startsWith("SPORE-SUBSTRATE-")))}`);
    }
  });
  it("an unrecognised on_indeterminate value fails closed (SPORE-SUBSTRATE-002, malformed)", () => {
    const r = parseAndVerify(oiSrc("yolo"), "production");
    assert.ok(has(r, "SPORE-SUBSTRATE-002"), "malformed disposition must be rejected");
    assert.equal(find(r, "SPORE-SUBSTRATE-002").severity, "error");
    assert.match(find(r, "SPORE-SUBSTRATE-002").message, /on_indeterminate/);
  });
  it("omitting on_indeterminate is non-breaking (defaults to trap; the clean lane stays clean)", () => {
    const r = parseAndVerify(`
secure flow readSensor2(request: Request) -> Result<Response, ApiError>
contract {
  effects { audit.write }
  substrate { lane: photonic  tolerance: 5e-3  redundancy: 3 }
}
{ return Ok(Response.ok({})) }
`, "production");
    assert.equal(substrateCount(r), 0);
  });
});
