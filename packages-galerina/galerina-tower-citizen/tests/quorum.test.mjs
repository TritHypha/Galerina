// packages-galerina/galerina-tower-citizen/tests/quorum.test.mjs — distinct-signer M-of-N quorum (G2 core).
//
// Proves: ALLOW iff >= M DISTINCT signers approve; clean shortfall (well-formed, < M) is an ordinary
// DENY (no diagnostic); de-duplication by signer (anti-Sybil — a repeated signer counts once); a signer
// equivocation and any malformed input collapse to INDETERMINATE carrying + sinking SPORE-GOV-3VL-001;
// DENY/INDETERMINATE votes never count as approvals; purity/determinism; and the soundness invariant
// that no non-ALLOW path authorizes.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  checkQuorum,
  meetsQuorum,
  quorumVerdict,
  Verdict,
  GOV_3VL_DIAGNOSTIC,
} from "../dist/index.js";

const { ALLOW, INDETERMINATE, DENY } = Verdict;
const vote = (signer, verdict = ALLOW) => ({ signer, verdict });

test(">= M distinct approvals → ALLOW + authorized, no diagnostic", () => {
  const d = checkQuorum([vote("a"), vote("b"), vote("c")], 2);
  assert.equal(d.verdict, ALLOW);
  assert.equal(d.decision, "allow");
  assert.equal(d.authorized, true);
  assert.equal(d.reason, null);
  assert.equal(d.diagnostic, null);
  assert.equal(d.threshold, 2);
  assert.equal(d.distinctApprovals, 3);
  assert.equal(meetsQuorum([vote("a"), vote("b"), vote("c")], 2), true);
});

test("exactly M distinct approvals → ALLOW (threshold is inclusive)", () => {
  const d = checkQuorum([vote("a"), vote("b")], 2);
  assert.equal(d.verdict, ALLOW);
  assert.equal(d.authorized, true);
  assert.equal(d.distinctApprovals, 2);
});

test("clean shortfall (well-formed, < M approvals) → DENY, NOT a diagnostic", () => {
  const d = checkQuorum([vote("a")], 2);
  assert.equal(d.verdict, DENY);
  assert.equal(d.decision, "deny");
  assert.equal(d.authorized, false);
  assert.equal(d.reason, "insufficient_quorum");
  assert.equal(d.diagnostic, null, "a clean shortfall is an ordinary DENY, not SPORE-GOV-3VL-001");
  assert.equal(d.distinctApprovals, 1);
  assert.equal(meetsQuorum([vote("a")], 2), false);
});

test("distinct-signer de-dup (anti-Sybil): one signer repeated counts ONCE", () => {
  // Three ALLOW votes but all from the same signer → 1 distinct approval, below M=2 → DENY.
  const d = checkQuorum([vote("a"), vote("a"), vote("a")], 2);
  assert.equal(d.verdict, DENY);
  assert.equal(d.distinctApprovals, 1);
  assert.equal(d.authorized, false);
});

test("DENY / INDETERMINATE votes never count as approvals", () => {
  const d = checkQuorum([vote("a", ALLOW), vote("b", DENY), vote("c", INDETERMINATE)], 2);
  assert.equal(d.distinctApprovals, 1);
  assert.equal(d.verdict, DENY);
  assert.equal(d.authorized, false);
});

test("equivocation (one signer, conflicting verdicts) → INDETERMINATE + SPORE-GOV-3VL-001", () => {
  let sunk = null;
  const d = checkQuorum([vote("a", ALLOW), vote("a", DENY), vote("b", ALLOW)], 1, (x) => { sunk = x; });
  assert.equal(d.verdict, INDETERMINATE);
  assert.equal(d.decision, "deny");
  assert.equal(d.authorized, false, "a detected equivocation is never authorized, even if M would be met without it");
  assert.equal(d.reason, "malformed");
  assert.equal(d.diagnostic?.code, GOV_3VL_DIAGNOSTIC);
  assert.equal(sunk?.code, GOV_3VL_DIAGNOSTIC, "the diagnostic is forwarded to the onDiagnostic sink");
  assert.equal(d.distinctApprovals, 0);
});

test("malformed threshold (M=0, M<1, non-integer) → INDETERMINATE/malformed (no fail-open 0-of-N)", () => {
  for (const m of [0, -1, 1.5, Number.NaN]) {
    const d = checkQuorum([vote("a"), vote("b")], m);
    assert.equal(d.verdict, INDETERMINATE, `M=${m} must be malformed`);
    assert.equal(d.authorized, false);
    assert.equal(d.reason, "malformed");
    assert.equal(d.diagnostic?.code, GOV_3VL_DIAGNOSTIC);
  }
});

test("malformed votes (not an array / bad signer / out-of-domain verdict) → INDETERMINATE/malformed", () => {
  const bad = [
    null,
    "not-an-array",
    [{ signer: "", verdict: ALLOW }],          // empty signer
    [{ signer: "a", verdict: 2 }],             // out-of-domain verdict
    [{ signer: "a" }],                         // missing verdict
    [{ verdict: ALLOW }],                      // missing signer
  ];
  for (const votes of bad) {
    const d = checkQuorum(votes, 1);
    assert.equal(d.verdict, INDETERMINATE, `${JSON.stringify(votes)} must be malformed`);
    assert.equal(d.authorized, false);
    assert.equal(d.reason, "malformed");
  }
});

test("empty vote set with M>=1 → DENY (well-formed, zero approvals — not a diagnostic)", () => {
  const d = checkQuorum([], 1);
  assert.equal(d.verdict, DENY);
  assert.equal(d.reason, "insufficient_quorum");
  assert.equal(d.diagnostic, null);
  assert.equal(d.distinctApprovals, 0);
});

test("M greater than the number of distinct signers → DENY (clean, unreachable shortfall)", () => {
  const d = checkQuorum([vote("a"), vote("b")], 5);
  assert.equal(d.verdict, DENY);
  assert.equal(d.reason, "insufficient_quorum");
  assert.equal(d.distinctApprovals, 2);
});

test("quorumVerdict is pure + deterministic (same input → same verdict)", () => {
  // `a` appears twice (both ALLOW) → distinct {a, b} both ALLOW → 2 approvals.
  const votes = [vote("a"), vote("b"), vote("a")];
  assert.equal(quorumVerdict(votes, 2), ALLOW);  // 2 distinct approvals meets M=2
  assert.equal(quorumVerdict(votes, 3), DENY);   // only 2 distinct signers, can't reach 3
  assert.equal(quorumVerdict(votes, 2), quorumVerdict(votes, 2)); // deterministic
});

test("SOUNDNESS sweep: no non-ALLOW verdict ever authorizes; ALLOW always does", () => {
  const signers = ["a", "b", "c"];
  const verdicts = [ALLOW, DENY, INDETERMINATE];
  let checks = 0;
  // Enumerate small vote sets over {a,b,c} x {ALLOW,DENY,INDETERMINATE} and thresholds 1..4.
  for (const s1 of signers) for (const v1 of verdicts)
  for (const s2 of signers) for (const v2 of verdicts)
  for (let m = 1; m <= 4; m++) {
    const votes = [vote(s1, v1), vote(s2, v2)];
    const d = checkQuorum(votes, m);
    checks++;
    assert.equal(d.authorized, d.verdict === ALLOW, "authorized IFF verdict === ALLOW");
    if (d.verdict === ALLOW) assert.ok(d.distinctApprovals >= m, "ALLOW requires >= M distinct approvals");
  }
  assert.ok(checks > 0);
});
