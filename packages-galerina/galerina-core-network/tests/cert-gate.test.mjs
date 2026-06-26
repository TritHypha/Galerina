// TLSTP S1 — K3 cert/channel-validation gate. Fail-closed: revocation-unknown → DENY.
// Verifies the algebra (cert_verdict = min of four trits), the boundary collapse,
// and that every "unknown" / errored / un-provable factor denies — never allows.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  Verdict,
  toSubVerdicts,
  certVerdict,
  withSideSignal,
  certGate,
} from "../dist/index.js";

const { DENY, INDETERMINATE, ALLOW } = Verdict;
const TRITS = [DENY, INDETERMINATE, ALLOW]; // -1, 0, +1

// Fixed clock + a healthy, pinned, in-window cert as the baseline for the examples.
const NOW = Date.parse("2026-06-22T12:00:00Z");
const PIN = "ab".repeat(32); // a 64-hex-char sha256-shaped digest
const HEALTHY = {
  pinnedDigests: [PIN],
  presentedDigest: PIN,
  chainOutcome: "valid",
  notBefore: Date.parse("2026-01-01T00:00:00Z"),
  notAfter: Date.parse("2026-12-31T23:59:59Z"),
  now: NOW,
  revocation: "good",
  revocationProducedAt: Date.parse("2026-06-22T11:55:00Z"),
  revocationFreshnessMs: 24 * 60 * 60 * 1000,
};

// ── §3 worked examples ────────────────────────────────────────────────────────

test("example (a): valid pinned chain + fresh OCSP → +1 → ALLOW", () => {
  const subs = toSubVerdicts(HEALTHY);
  assert.deepEqual(subs, {
    pinMatch: ALLOW,
    chainValid: ALLOW,
    notExpired: ALLOW,
    revocationFresh: ALLOW,
  });
  assert.equal(certVerdict(subs), ALLOW);

  const decision = certGate(HEALTHY);
  assert.equal(decision.verdict, ALLOW);
  assert.equal(decision.decision, "allow");
  assert.equal(decision.authorized, true);
  assert.equal(decision.diagnostic, null);
});

test("example (b): revocation responder unreachable → 0 → DENY + SPORE-GOV-3VL-001 (the soft-fail hole, closed)", () => {
  const input = { ...HEALTHY, revocation: "unknown" };
  const subs = toSubVerdicts(input);
  // Three "good" factors cannot rescue the one unknown.
  assert.equal(subs.pinMatch, ALLOW);
  assert.equal(subs.chainValid, ALLOW);
  assert.equal(subs.notExpired, ALLOW);
  assert.equal(subs.revocationFresh, INDETERMINATE);
  assert.equal(certVerdict(subs), INDETERMINATE);

  const diags = [];
  const decision = certGate(input, (d) => diags.push(d));
  assert.equal(decision.verdict, INDETERMINATE);
  assert.equal(decision.decision, "deny");
  assert.equal(decision.authorized, false);
  assert.equal(decision.diagnostic?.code, "SPORE-GOV-3VL-001");
  assert.equal(diags.length, 1);
  assert.equal(diags[0].code, "SPORE-GOV-3VL-001");
});

test("example (c): hash-pin mismatch → −1 → DENY, no diagnostic (library-valid cert is not enough)", () => {
  // A perfectly valid CA-issued cert whose leaf digest is NOT the pinned one (classic MITM).
  const input = { ...HEALTHY, presentedDigest: "cd".repeat(32) };
  const subs = toSubVerdicts(input);
  assert.equal(subs.pinMatch, DENY);
  assert.equal(subs.chainValid, ALLOW);
  assert.equal(certVerdict(subs), DENY); // single −1 annihilates

  const decision = certGate(input);
  assert.equal(decision.verdict, DENY);
  assert.equal(decision.decision, "deny");
  assert.equal(decision.authorized, false);
  assert.equal(decision.diagnostic, null); // definite −1 is an ordinary policy denial, not a collapsed 0
});

// ── Exhaustive 3⁴ = 81-row truth table ────────────────────────────────────────

test("truth table: certVerdict === min(four trits); authorized ⟺ all four are +1 (81 rows)", () => {
  let rows = 0;
  for (const pinMatch of TRITS)
    for (const chainValid of TRITS)
      for (const notExpired of TRITS)
        for (const revocationFresh of TRITS) {
          rows++;
          const subs = { pinMatch, chainValid, notExpired, revocationFresh };
          const v = certVerdict(subs);
          const expected = Math.min(pinMatch, chainValid, notExpired, revocationFresh);
          assert.equal(v, expected, `verdict must equal min for ${JSON.stringify(subs)}`);

          const allPositive = pinMatch === ALLOW && chainValid === ALLOW && notExpired === ALLOW && revocationFresh === ALLOW;
          assert.equal(v === ALLOW, allPositive, `+1 ⟺ all four +1 for ${JSON.stringify(subs)}`);
        }
  assert.equal(rows, 81);
});

// Build a CertGateInput that yields exactly the requested sub-verdicts (so the
// end-to-end certGate path is exercised against the same 81 combinations).
function subsToInput(subs) {
  return {
    // pinMatch: +1 match, −1 mismatch, 0 no pin
    ...(subs.pinMatch === ALLOW
      ? { pinnedDigests: [PIN], presentedDigest: PIN }
      : subs.pinMatch === DENY
        ? { pinnedDigests: [PIN], presentedDigest: "cd".repeat(32) }
        : {}),
    // chainValid
    chainOutcome: subs.chainValid === ALLOW ? "valid" : subs.chainValid === DENY ? "invalid" : "incomplete",
    // notExpired: +1 in-window, −1 expired, 0 no window
    ...(subs.notExpired === ALLOW
      ? { notBefore: Date.parse("2026-01-01T00:00:00Z"), notAfter: Date.parse("2026-12-31T23:59:59Z"), now: NOW }
      : subs.notExpired === DENY
        ? { notBefore: Date.parse("2020-01-01T00:00:00Z"), notAfter: Date.parse("2020-12-31T00:00:00Z"), now: NOW }
        : {}),
    // revocationFresh: +1 good+fresh, −1 revoked, 0 unknown
    ...(subs.revocationFresh === ALLOW
      ? { revocation: "good", revocationProducedAt: Date.parse("2026-06-22T11:55:00Z"), revocationFreshnessMs: 24 * 60 * 60 * 1000, now: NOW }
      : subs.revocationFresh === DENY
        ? { revocation: "revoked" }
        : { revocation: "unknown" }),
  };
}

test("truth table end-to-end: certGate(subsToInput(subs)) authorizes ⟺ all four +1 (81 rows)", () => {
  for (const pinMatch of TRITS)
    for (const chainValid of TRITS)
      for (const notExpired of TRITS)
        for (const revocationFresh of TRITS) {
          const subs = { pinMatch, chainValid, notExpired, revocationFresh };
          const produced = toSubVerdicts(subsToInput(subs));
          assert.deepEqual(produced, subs, `subsToInput must reproduce ${JSON.stringify(subs)}, got ${JSON.stringify(produced)}`);

          const decision = certGate(subsToInput(subs));
          const allPositive = pinMatch === ALLOW && chainValid === ALLOW && notExpired === ALLOW && revocationFresh === ALLOW;
          assert.equal(decision.authorized, allPositive);
          assert.equal(decision.decision, allPositive ? "allow" : "deny");
        }
});

// ── Single-factor-unknown sweep ───────────────────────────────────────────────

test("single-factor-unknown: each factor = 0 (others +1) → deny + SPORE-GOV-3VL-001", () => {
  const factors = ["pinMatch", "chainValid", "notExpired", "revocationFresh"];
  for (const zeroed of factors) {
    const subs = { pinMatch: ALLOW, chainValid: ALLOW, notExpired: ALLOW, revocationFresh: ALLOW };
    subs[zeroed] = INDETERMINATE;
    const decision = certGate(subsToInput(subs));
    assert.equal(decision.authorized, false, `${zeroed}=0 must deny`);
    assert.equal(decision.diagnostic?.code, "SPORE-GOV-3VL-001", `${zeroed}=0 must audit the collapse`);
  }
});

// ── The fail-closed seam: every missing factor defaults to 0, never +1 ─────────

test("empty input: all factors default to INDETERMINATE → deny (nothing defaults to ALLOW)", () => {
  const subs = toSubVerdicts({});
  assert.deepEqual(subs, {
    pinMatch: INDETERMINATE,
    chainValid: INDETERMINATE,
    notExpired: INDETERMINATE,
    revocationFresh: INDETERMINATE,
  });
  const decision = certGate({});
  assert.equal(decision.authorized, false);
  assert.equal(decision.diagnostic?.code, "SPORE-GOV-3VL-001");
});

// ── Revocation: throws / stale / future-dated / revoked ───────────────────────

test("revocation check that THROWS → revocationFresh = 0 → deny (mirrors fuse-loader.ts:537)", () => {
  const input = {
    ...HEALTHY,
    revocation: undefined,
    revocationCheck: () => {
      throw new Error("OCSP responder TLS handshake failed");
    },
  };
  assert.equal(toSubVerdicts(input).revocationFresh, INDETERMINATE);
  assert.equal(certGate(input).authorized, false);
});

test('revocation "good" but STALE (older than freshness window) → 0 (treated as no-response)', () => {
  const input = {
    ...HEALTHY,
    revocationProducedAt: Date.parse("2026-06-20T11:55:00Z"), // ~2 days old vs 24h window
  };
  assert.equal(toSubVerdicts(input).revocationFresh, INDETERMINATE);
  assert.equal(certGate(input).authorized, false);
});

test('revocation "good" but FUTURE-DATED (produced after now) → 0', () => {
  const input = { ...HEALTHY, revocationProducedAt: Date.parse("2026-06-22T12:05:00Z") };
  assert.equal(toSubVerdicts(input).revocationFresh, INDETERMINATE);
});

test('revocation "good" with no freshness window supplied → 0 (freshness un-provable)', () => {
  const input = { ...HEALTHY, revocationFreshnessMs: undefined };
  assert.equal(toSubVerdicts(input).revocationFresh, INDETERMINATE);
});

test('revocation "revoked" → −1 → deny, no diagnostic', () => {
  const input = { ...HEALTHY, revocation: "revoked" };
  assert.equal(toSubVerdicts(input).revocationFresh, DENY);
  const decision = certGate(input);
  assert.equal(decision.authorized, false);
  assert.equal(decision.diagnostic, null); // definite −1, not a collapsed 0
});

test("injected revocationCheck overrides the declarative outcome", () => {
  const input = { ...HEALTHY, revocation: "good", revocationCheck: () => "revoked" };
  assert.equal(toSubVerdicts(input).revocationFresh, DENY);
});

// SEC-002 mutation guard: an injected check returning "good" must STILL pass the
// freshness gate — a "good" with no provable freshness is 0, never +1. This kills
// any mutation that trusts a check-resolved "good" without re-running freshness
// (the replayed/stale-good fail-open).
test('injected revocationCheck "good" with NO freshness window → 0 (freshness still required)', () => {
  const input = { ...HEALTHY, revocationFreshnessMs: undefined, revocation: undefined, revocationCheck: () => "good" };
  assert.equal(toSubVerdicts(input).revocationFresh, INDETERMINATE);
  assert.equal(certGate(input).authorized, false);
});

test('injected revocationCheck "good" but STALE → 0 (freshness still required)', () => {
  const input = {
    ...HEALTHY,
    revocation: undefined,
    revocationCheck: () => "good",
    revocationProducedAt: Date.parse("2026-06-20T11:55:00Z"), // ~2 days old vs 24h window
  };
  assert.equal(toSubVerdicts(input).revocationFresh, INDETERMINATE);
  assert.equal(certGate(input).authorized, false);
});

test('injected revocationCheck "good" AND fresh → +1 (the positive path is reachable)', () => {
  const input = { ...HEALTHY, revocation: undefined, revocationCheck: () => "good" };
  assert.equal(toSubVerdicts(input).revocationFresh, ALLOW);
  assert.equal(certGate(input).authorized, true);
});

// Multi-element pin set: a match against any pinned digest (not just the first) is +1.
test("pin match succeeds against any digest in a multi-element pin set", () => {
  const second = "ef".repeat(32);
  assert.equal(
    toSubVerdicts({ ...HEALTHY, pinnedDigests: ["cd".repeat(32), second], presentedDigest: second }).pinMatch,
    ALLOW,
  );
  assert.equal(
    toSubVerdicts({ ...HEALTHY, pinnedDigests: ["cd".repeat(32), second], presentedDigest: "99".repeat(32) }).pinMatch,
    DENY,
  );
});

// Inclusive-boundary fixtures: the validity window and freshness window are inclusive.
test("validity + freshness windows are inclusive at their boundaries", () => {
  const notAfter = Date.parse("2026-12-31T23:59:59Z");
  // now === notAfter → still in-window (+1), not expired.
  assert.equal(toSubVerdicts({ ...HEALTHY, now: notAfter }).notExpired, ALLOW);
  // now === notBefore → still in-window (+1).
  const notBefore = Date.parse("2026-01-01T00:00:00Z");
  assert.equal(toSubVerdicts({ ...HEALTHY, now: notBefore }).notExpired, ALLOW);
  // age === freshnessMs exactly → still fresh (+1).
  const freshnessMs = 24 * 60 * 60 * 1000;
  const now = Date.parse("2026-06-22T12:00:00Z");
  assert.equal(
    toSubVerdicts({ ...HEALTHY, now, revocationProducedAt: now - freshnessMs, revocationFreshnessMs: freshnessMs }).revocationFresh,
    ALLOW,
  );
  // age === freshnessMs + 1 → stale (0).
  assert.equal(
    toSubVerdicts({ ...HEALTHY, now, revocationProducedAt: now - freshnessMs - 1, revocationFreshnessMs: freshnessMs }).revocationFresh,
    INDETERMINATE,
  );
});

// ── Pin: absent (0) vs mismatch (−1) are distinct ─────────────────────────────

test("pin absent is 0, pin mismatch is −1 — distinct (the gotcha)", () => {
  assert.equal(toSubVerdicts({ ...HEALTHY, pinnedDigests: undefined }).pinMatch, INDETERMINATE);
  assert.equal(toSubVerdicts({ ...HEALTHY, pinnedDigests: [] }).pinMatch, INDETERMINATE);
  assert.equal(toSubVerdicts({ ...HEALTHY, presentedDigest: "cd".repeat(32) }).pinMatch, DENY);
  // pinned but nothing presented → can't compare → 0 (absence of evidence, audited), not −1
  assert.equal(toSubVerdicts({ ...HEALTHY, presentedDigest: undefined }).pinMatch, INDETERMINATE);
});

test("pin match is case-insensitive on the hex digest", () => {
  assert.equal(
    toSubVerdicts({ ...HEALTHY, pinnedDigests: [PIN.toUpperCase()], presentedDigest: PIN }).pinMatch,
    ALLOW,
  );
});

// ── No-Coercion: a degrade-only side-signal can only LOWER a verdict ───────────

test("No-Coercion: withSideSignal(t*, r) ≤ t* for all 9 (t*, r) combinations", () => {
  for (const t of TRITS)
    for (const r of TRITS) {
      const e = withSideSignal(t, r);
      assert.ok(e <= t, `vAnd(${t}, ${r}) = ${e} must be ≤ ${t}`);
      assert.equal(e, Math.min(t, r));
    }
});

test("side-signals fold into certGate: a DENY side-signal sinks an otherwise-ALLOW channel", () => {
  // Healthy channel + a tamper/substrate DENY → channel refused.
  const sunk = certGate({ ...HEALTHY, sideSignals: [DENY] });
  assert.equal(sunk.authorized, false);
  assert.equal(sunk.decision, "deny");

  // An INDETERMINATE side-signal degrades +1 → 0 → deny (audited).
  const degraded = certGate({ ...HEALTHY, sideSignals: [INDETERMINATE] });
  assert.equal(degraded.authorized, false);
  assert.equal(degraded.diagnostic?.code, "SPORE-GOV-3VL-001");

  // An ALLOW side-signal cannot lift anything but must not break a healthy channel.
  const intact = certGate({ ...HEALTHY, sideSignals: [ALLOW, ALLOW] });
  assert.equal(intact.authorized, true);
});
