// alternative-proposal.test.mjs — RD-0855 admission-time alternatives (proposal only).
// Owner three-tier order: requested trit-width -> standard K3 -> binary with the same task semantics.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  proposeInitialAttempt, proposeAlternative, computeTaskPolicyDigest,
  initialCandidate, nextCandidate, dispatchTriPipeEngine,
  TASK_POLICY_SCHEMA, INITIAL_ATTEMPT_REQUEST_SCHEMA, ALTERNATIVE_REQUEST_SCHEMA,
  ATTEMPT_PROPOSAL_SCHEMA, MAX_ATTEMPTS_HARD_CAP,
} from "../dist/index.js";

const SNAP = `sha256:${"a".repeat(64)}`;
const OTHER_SNAP = `sha256:${"c".repeat(64)}`;
const REFUSAL_DIGEST = `sha256:${"b".repeat(64)}`;
const EVIDENCE = `sha256:${"e".repeat(64)}`;
const TERMINAL = ["DENY", "REVOKED", "INVALID_EVIDENCE", "UNKNOWN_OUTCOME", "PARTIAL_EFFECT", "CLEANUP_FAILURE"];

const policy = (o = {}) => ({
  schema: TASK_POLICY_SCHEMA,
  taskId: "task-1",
  issuerId: "issuer.test",
  requestedRepresentationProfile: 256,
  workloadClass: "SCIENCE",
  permittedReasons: ["CANDIDATE_LOCAL_UNAVAILABLE", "CANDIDATE_LOCAL_INCOMPATIBLE"],
  maxAttempts: 3,
  ...o,
});

const initial = (pol, o = {}) =>
  proposeInitialAttempt({ schema: INITIAL_ATTEMPT_REQUEST_SCHEMA, taskId: "task-1", checkedSnapshotDigest: SNAP, taskPolicy: pol, ...o });

const ident = (c) => ({ step: c.step, carrier: c.carrier, representationProfile: c.representationProfile });

const parentOf = (prop, o = {}) => ({
  attemptIndex: prop.attemptIndex,
  planIdentity: prop.planIdentity,
  candidate: ident(prop.candidate),
  taskPolicyDigest: prop.taskPolicyDigest,
  checkedSnapshotDigest: prop.checkedSnapshotDigest,
  outcome: "REFUSED_BEFORE_EFFECT",
  refusalCode: "SLIDE_PROFILE_UNAVAILABLE",
  refusalDigest: REFUSAL_DIGEST,
  noPriorEffect: true,
  ...o,
});

const altReq = (pol, prop, history, o = {}) => ({
  schema: ALTERNATIVE_REQUEST_SCHEMA,
  taskId: "task-1",
  checkedSnapshotDigest: SNAP,
  taskPolicy: pol,
  parent: parentOf(prop, o.parent ?? {}),
  history: history.map(ident),
  reasonEvidence: { reason: "CANDIDATE_LOCAL_UNAVAILABLE", evidenceDigest: EVIDENCE, attestedBy: "tower.evidence.test", ...(o.reasonEvidence ?? {}) },
  ...(o.top ?? {}),
});

const trusted = { verifyReasonEvidence: () => true };

function assertNonAuthorizing(r) {
  assert.equal(r.authorityReleased, false);
  assert.equal(r.admissionAuthority, false);
  assert.equal(Object.isFrozen(r), true);
}

function chain256(pol = policy()) {
  const a0 = initial(pol);
  const a1 = proposeAlternative(altReq(pol, a0, [a0.candidate]), trusted);
  const a2 = proposeAlternative(altReq(pol, a1, [a0.candidate, a1.candidate]), trusted);
  return { a0, a1, a2 };
}

test("initial attempt: requested science width is tier 1, proposal only, fresh admission required", () => {
  const a0 = initial(policy());
  assert.equal(a0.kind, "ATTEMPT_PROPOSAL");
  assert.equal(a0.schema, ATTEMPT_PROPOSAL_SCHEMA);
  assert.deepEqual(ident(a0.candidate), { step: 1, carrier: "TRIT_WIDTH", representationProfile: 256 });
  assert.equal(a0.attemptIndex, 0);
  assert.equal(a0.parent, null);
  assert.deepEqual({ ...a0.requires }, { freshSlideAdmission: true, freshVokDecision: true, freshVokLease: true, linkedTerminalReceipt: true });
  assert.equal(a0.transfer.digest, a0.planIdentity);
  assert.equal(a0.transfer.owner, "galerina.tri-pipe");
  assert.match(a0.planIdentity, /^sha256:[0-9a-f]{64}$/u);
  assert.equal(a0.dataBrand, "Trit");
  assert.equal(a0.governanceBrand, "Verdict");
  assertNonAuthorizing(a0);
  assert.equal(dispatchTriPipeEngine(a0).code, "ROUTE_DISPATCH_FORBIDDEN");
});

test("initial attempt: general work requesting the single K3 trit starts at tier 2 (standard K3)", () => {
  const a0 = initial(policy({ workloadClass: "GENERAL", requestedRepresentationProfile: 1 }));
  assert.deepEqual(ident(a0.candidate), { step: 2, carrier: "K3_SCALAR", representationProfile: 1 });
  assert.equal(a0.candidate.semantics, "K3");
  assert.equal(a0.candidate.permissionDecidedBy, "K3");
  assert.equal(a0.candidate.binaryCarrier, null);
});

test("policy: wider widths are opt-in science work; unregistered, experimental and bad budgets refuse", () => {
  for (const w of [32, 64, 256]) {
    assert.equal(initial(policy({ workloadClass: "GENERAL", requestedRepresentationProfile: w })).code, "TP_ALT_WIDTH_NOT_OPTED_IN");
  }
  for (const w of [0, 2, 8, 16, 128, 512, 1024]) {
    assert.equal(initial(policy({ requestedRepresentationProfile: w })).code, "TP_ALT_POLICY_INVALID");
  }
  for (const m of [0, -1, MAX_ATTEMPTS_HARD_CAP + 1]) {
    assert.equal(initial(policy({ maxAttempts: m })).code, "TP_ALT_POLICY_INVALID");
  }
  assert.equal(initial(policy({ permittedReasons: ["CANDIDATE_LOCAL_UNAVAILABLE", "CANDIDATE_LOCAL_UNAVAILABLE"] })).code, "TP_ALT_POLICY_INVALID");
  assert.equal(initial(policy({ permittedReasons: ["DENY"] })).code, "TP_ALT_INPUT_MALFORMED");
  assert.equal(initial(policy({ maxAttempts: 1.5 })).code, "TP_ALT_INPUT_MALFORMED");
  assert.equal(initial(policy({ taskId: "task-2" })).code, "TP_ALT_TASK_POLICY_SUBSTITUTED");
});

test("three-tier order: width -> K3 -> binary, each a new plan identity linked to the kept parent refusal", () => {
  const { a0, a1, a2 } = chain256();
  assert.deepEqual(ident(a1.candidate), { step: 2, carrier: "K3_SCALAR", representationProfile: 1 });
  assert.deepEqual(ident(a2.candidate), { step: 3, carrier: "BINARY_K3_CARRIER", representationProfile: 1 });
  assert.equal(a1.attemptIndex, 1);
  assert.equal(a2.attemptIndex, 2);
  assert.equal(new Set([a0.planIdentity, a1.planIdentity, a2.planIdentity]).size, 3);
  assert.equal(a1.parent.planIdentity, a0.planIdentity);
  assert.equal(a2.parent.planIdentity, a1.planIdentity);
  assert.equal(a1.parent.refusalCode, "SLIDE_PROFILE_UNAVAILABLE");
  assert.equal(a1.parent.refusalDigest, REFUSAL_DIGEST);
  assert.equal(a1.parent.reason, "CANDIDATE_LOCAL_UNAVAILABLE");
  assert.equal(a1.parent.reasonEvidenceDigest, EVIDENCE);
  assert.equal(a1.taskPolicyDigest, a0.taskPolicyDigest);
  assert.equal(a2.checkedSnapshotDigest, SNAP);
  for (const a of [a1, a2]) {
    assertNonAuthorizing(a);
    assert.equal(a.requires.freshSlideAdmission, true);
    assert.equal(a.requires.freshVokLease, true);
    assert.equal(dispatchTriPipeEngine(a).refused, true);
  }
  // Binary keeps the task's K3 semantics; K3 still decides permission.
  assert.equal(a2.candidate.semantics, "K3");
  assert.equal(a2.candidate.permissionDecidedBy, "K3");
  assert.deepEqual({ ...a2.candidate.binaryCarrier }, { minBitsPerTrit: 2, illegalCodePolicy: "REFUSE", unknownCollapse: "FINAL_PERMISSION_BOUNDARY_ONLY" });
  // After binary there is no further tier.
  const pol = policy();
  const end = proposeAlternative(altReq(pol, a2, [a0.candidate, a1.candidate, a2.candidate]), trusted);
  assert.equal(end.code, "TP_ALT_NO_FURTHER_TIER");
  assert.equal(end.parentRefusalCode, "SLIDE_PROFILE_UNAVAILABLE");
});

test("K3 request: K3 -> binary, then nothing; tier order is a pure fixed function", () => {
  const pol = policy({ workloadClass: "GENERAL", requestedRepresentationProfile: 1 });
  const a0 = initial(pol);
  const a1 = proposeAlternative(altReq(pol, a0, [a0.candidate]), trusted);
  assert.deepEqual(ident(a1.candidate), { step: 3, carrier: "BINARY_K3_CARRIER", representationProfile: 1 });
  assert.deepEqual(initialCandidate(64), { step: 1, carrier: "TRIT_WIDTH", representationProfile: 64 });
  assert.deepEqual(nextCandidate({ step: 1, carrier: "TRIT_WIDTH", representationProfile: 64 }), { step: 2, carrier: "K3_SCALAR", representationProfile: 1 });
  assert.equal(nextCandidate({ step: 3, carrier: "BINARY_K3_CARRIER", representationProfile: 1 }), null);
});

test("binary is never proposed while K3 has not been tried and refused (no skipped tier)", () => {
  const pol = policy();
  const a0 = initial(pol);
  const a1 = proposeAlternative(altReq(pol, a0, [a0.candidate]), trusted);
  assert.notEqual(a1.candidate.step, 3);
  // Forged parent that claims to be K3 without a K3 entry in the history.
  const skipped = altReq(pol, a0, [a0.candidate], { parent: { candidate: { step: 2, carrier: "K3_SCALAR", representationProfile: 1 } } });
  assert.equal(proposeAlternative(skipped, trusted).code, "TP_ALT_CHAIN_INCONSISTENT");
  // History that starts at K3 when the policy requested width 256.
  const k3First = altReq(pol, { ...a0, candidate: { step: 2, carrier: "K3_SCALAR", representationProfile: 1 } }, [{ step: 2, carrier: "K3_SCALAR", representationProfile: 1 }]);
  assert.equal(proposeAlternative(k3First, trusted).code, "TP_ALT_CHAIN_INCONSISTENT");
  // Ill-formed candidates (tier 1 at width 1, tier 3 as a trit width).
  const bad1 = altReq(policy({ workloadClass: "GENERAL", requestedRepresentationProfile: 1 }), { ...a0, candidate: { step: 1, carrier: "TRIT_WIDTH", representationProfile: 1 } }, [{ step: 1, carrier: "TRIT_WIDTH", representationProfile: 1 }]);
  assert.equal(proposeAlternative(bad1, trusted).code, "TP_ALT_TASK_POLICY_SUBSTITUTED");
  const polK3 = policy({ workloadClass: "GENERAL", requestedRepresentationProfile: 1 });
  const k0 = initial(polK3);
  const bad2 = altReq(polK3, { ...k0, candidate: { step: 1, carrier: "TRIT_WIDTH", representationProfile: 1 } }, [{ step: 1, carrier: "TRIT_WIDTH", representationProfile: 1 }]);
  assert.equal(proposeAlternative(bad2, trusted).code, "TP_ALT_CHAIN_INCONSISTENT");
  const bad3 = altReq(pol, { ...a0, candidate: { step: 3, carrier: "TRIT_WIDTH", representationProfile: 256 } }, [{ step: 3, carrier: "TRIT_WIDTH", representationProfile: 256 }]);
  assert.equal(proposeAlternative(bad3, trusted).code, "TP_ALT_CHAIN_INCONSISTENT");
});

test("the verifier sees the full bound reason record and must return exactly true", () => {
  const pol = policy();
  const a0 = initial(pol);
  const seen = [];
  const r = proposeAlternative(altReq(pol, a0, [a0.candidate]), { verifyReasonEvidence: (b) => { seen.push(b); return true; } });
  assert.equal(r.kind, "ATTEMPT_PROPOSAL");
  assert.equal(seen.length, 1);
  const b = seen[0];
  assert.equal(Object.isFrozen(b), true);
  assert.equal(b.taskId, "task-1");
  assert.equal(b.checkedSnapshotDigest, SNAP);
  assert.equal(b.taskPolicyDigest, a0.taskPolicyDigest);
  assert.equal(b.parentPlanIdentity, a0.planIdentity);
  assert.deepEqual({ ...b.parentCandidate }, ident(a0.candidate));
  assert.equal(b.parentRefusalDigest, REFUSAL_DIGEST);
  assert.equal(b.reason, "CANDIDATE_LOCAL_UNAVAILABLE");
  assert.equal(b.evidenceDigest, EVIDENCE);
  assert.equal(b.attestedBy, "tower.evidence.test");
});

test("hostile: forged or unauthenticated reasons refuse (no verifier, false, truthy non-true, throw)", () => {
  const pol = policy();
  const a0 = initial(pol);
  const req = altReq(pol, a0, [a0.candidate]);
  const verifiers = [undefined, () => false, () => "true", () => 1, () => ({ ok: true }), () => { throw new Error("boom"); }];
  for (const v of verifiers) {
    const r = proposeAlternative(req, v === undefined ? {} : { verifyReasonEvidence: v });
    assert.equal(r.kind, "REFUSED");
    assert.equal(r.code, "TP_ALT_REASON_UNAUTHENTICATED");
    assert.equal(r.parentRefusalCode, "SLIDE_PROFILE_UNAVAILABLE");
    assertNonAuthorizing(r);
  }
  assert.equal(proposeAlternative(req).code, "TP_ALT_REASON_UNAUTHENTICATED");
  // A verifier that only trusts one evidence digest refuses a forged digest.
  const only = { verifyReasonEvidence: (b) => b.evidenceDigest === EVIDENCE };
  const forged = altReq(pol, a0, [a0.candidate], { reasonEvidence: { evidenceDigest: `sha256:${"f".repeat(64)}` } });
  assert.equal(proposeAlternative(forged, only).code, "TP_ALT_REASON_UNAUTHENTICATED");
  assert.equal(proposeAlternative(req, only).kind, "ATTEMPT_PROPOSAL");
});

test("hostile: a reason the admitted policy does not permit refuses before the verifier runs", () => {
  const pol = policy({ permittedReasons: ["CANDIDATE_LOCAL_UNAVAILABLE"] });
  const a0 = initial(pol);
  let calls = 0;
  const r = proposeAlternative(altReq(pol, a0, [a0.candidate], { reasonEvidence: { reason: "CANDIDATE_LOCAL_INCOMPATIBLE" } }), { verifyReasonEvidence: () => { calls++; return true; } });
  assert.equal(r.code, "TP_ALT_REASON_NOT_PERMITTED");
  assert.equal(calls, 0);
  const none = policy({ permittedReasons: [] });
  const n0 = initial(none);
  assert.equal(proposeAlternative(altReq(none, n0, [n0.candidate]), trusted).code, "TP_ALT_REASON_NOT_PERMITTED");
  for (const reason of ["DENY", "REVOKED", "UNKNOWN_OUTCOME", "TIMEOUT"]) {
    assert.equal(proposeAlternative(altReq(policy(), a0, [a0.candidate], { reasonEvidence: { reason } }), trusted).code, "TP_ALT_INPUT_MALFORMED");
  }
});

test("DENY, revocation, invalid evidence, unknown outcome, partial effect, cleanup failure never become an alternative", () => {
  const pol = policy();
  const a0 = initial(pol);
  for (const outcome of TERMINAL) {
    let calls = 0;
    const r = proposeAlternative(altReq(pol, a0, [a0.candidate], { parent: { outcome, refusalCode: `VOK_${outcome}` } }), { verifyReasonEvidence: () => { calls++; return true; } });
    assert.equal(r.kind, "REFUSED");
    assert.equal(r.code, "TP_ALT_PRIOR_OUTCOME_TERMINAL");
    assert.equal(r.parentRefusalCode, `VOK_${outcome}`, "original typed refusal kept");
    assert.equal(calls, 0);
    assertNonAuthorizing(r);
  }
  const effect = proposeAlternative(altReq(pol, a0, [a0.candidate], { parent: { noPriorEffect: false } }), trusted);
  assert.equal(effect.code, "TP_ALT_PRIOR_EFFECT_NOT_EXCLUDED");
});

test("hostile: task-policy substitution and snapshot change refuse", () => {
  const pol = policy();
  const a0 = initial(pol);
  const swaps = [
    policy({ maxAttempts: 2 }),
    policy({ issuerId: "issuer.other" }),
    policy({ permittedReasons: ["CANDIDATE_LOCAL_INCOMPATIBLE"] }),
    policy({ requestedRepresentationProfile: 64 }),
  ];
  for (const swapped of swaps) {
    assert.equal(proposeAlternative(altReq(swapped, a0, [a0.candidate]), trusted).code, "TP_ALT_TASK_POLICY_SUBSTITUTED");
  }
  assert.equal(proposeAlternative(altReq(pol, a0, [a0.candidate], { parent: { taskPolicyDigest: `sha256:${"d".repeat(64)}` } }), trusted).code, "TP_ALT_TASK_POLICY_SUBSTITUTED");
  assert.equal(proposeAlternative(altReq(policy({ taskId: "task-2" }), a0, [a0.candidate]), trusted).code, "TP_ALT_TASK_POLICY_SUBSTITUTED");
  assert.equal(proposeAlternative(altReq(pol, a0, [a0.candidate], { top: { checkedSnapshotDigest: OTHER_SNAP } }), trusted).code, "TP_ALT_SNAPSHOT_MISMATCH");
  assert.equal(proposeAlternative(altReq(pol, a0, [a0.candidate], { parent: { checkedSnapshotDigest: OTHER_SNAP } }), trusted).code, "TP_ALT_SNAPSHOT_MISMATCH");
});

test("hostile: unbounded or cyclic chains refuse (budget, revisit, length mismatch)", () => {
  const pol2 = policy({ maxAttempts: 2 });
  const b0 = initial(pol2);
  const b1 = proposeAlternative(altReq(pol2, b0, [b0.candidate]), trusted);
  assert.equal(b1.kind, "ATTEMPT_PROPOSAL");
  assert.equal(proposeAlternative(altReq(pol2, b1, [b0.candidate, b1.candidate]), trusted).code, "TP_ALT_ATTEMPT_BUDGET_EXHAUSTED");
  const pol1 = policy({ maxAttempts: 1 });
  const c0 = initial(pol1);
  assert.equal(proposeAlternative(altReq(pol1, c0, [c0.candidate]), trusted).code, "TP_ALT_ATTEMPT_BUDGET_EXHAUSTED");
  const pol = policy();
  const { a0, a1 } = chain256(pol);
  // Revisit: K3 twice.
  const cyc = altReq(pol, a1, [a1.candidate, a1.candidate]);
  assert.equal(proposeAlternative(cyc, trusted).code, "TP_ALT_CHAIN_CYCLE");
  // History shorter or longer than the parent index says.
  assert.equal(proposeAlternative(altReq(pol, a1, [a1.candidate]), trusted).code, "TP_ALT_CHAIN_INCONSISTENT");
  assert.equal(proposeAlternative(altReq(pol, a0, [a0.candidate, a1.candidate]), trusted).code, "TP_ALT_CHAIN_INCONSISTENT");
  // Parent index past the hard cap, or a fourth history entry.
  assert.equal(proposeAlternative(altReq(pol, { ...a1, attemptIndex: 3 }, [a0.candidate, a1.candidate]), trusted).code, "TP_ALT_INPUT_MALFORMED");
  assert.equal(proposeAlternative(altReq(pol, a1, [a0.candidate, a1.candidate, a1.candidate, a1.candidate]), trusted).code, "TP_ALT_INPUT_MALFORMED");
});

test("hostile: dispatch bypass and authority fields refuse; proposals carry nothing executable", () => {
  const pol = policy();
  const { a0, a1 } = chain256(pol);
  for (const p of [a0, a1]) {
    assert.deepEqual(dispatchTriPipeEngine(p), { refused: true, code: "ROUTE_DISPATCH_FORBIDDEN" });
    for (const v of Object.values(p)) assert.notEqual(typeof v, "function");
    for (const k of ["engine", "execute", "run", "lease", "decision", "receipt"]) assert.equal(Object.hasOwn(p, k), false);
  }
  const base = altReq(pol, a0, [a0.candidate]);
  for (const extra of [{ lease: {} }, { vokDecision: "ALLOW" }, { receipt: REFUSAL_DIGEST }, { executor: "x" }]) {
    assert.equal(proposeAlternative({ ...base, ...extra }, trusted).code, "TP_ALT_AUTHORITY_FIELD_PRESENT");
  }
  assert.equal(proposeAlternative({ ...base, parent: { ...base.parent, grant: true } }, trusted).code, "TP_ALT_AUTHORITY_FIELD_PRESENT");
  assert.equal(proposeAlternative({ ...base, reasonEvidence: { ...base.reasonEvidence, authority: "tower" } }, trusted).code, "TP_ALT_AUTHORITY_FIELD_PRESENT");
  assert.equal(initial(policy(), { admission: true }).code, "TP_ALT_AUTHORITY_FIELD_PRESENT");
});

test("malformed input refuses without invoking accessors or echoing input values", () => {
  const pol = policy();
  const a0 = initial(pol);
  const base = altReq(pol, a0, [a0.candidate]);
  let touched = false;
  const accessor = { ...base };
  delete accessor.taskId;
  Object.defineProperty(accessor, "taskId", { enumerable: true, get() { touched = true; return "task-1"; } });
  for (const bad of [null, 42, "x", [], { ...base, extra: 1 }, { ...base, schema: "other" }, accessor, Object.assign(Object.create({ evil: 1 }), base), { ...base, history: "x" }]) {
    const r = proposeAlternative(bad, trusted);
    assert.equal(r.kind, "REFUSED");
    assert.equal(r.code, "TP_ALT_INPUT_MALFORMED");
    assertNonAuthorizing(r);
  }
  assert.equal(touched, false);
  const secret = "SECRET-task-zz";
  const r = proposeAlternative({ ...base, taskId: secret }, trusted);
  assert.equal(JSON.stringify(r).includes(secret), false);
  assert.equal(proposeAlternative({ ...base, parent: { ...base.parent, refusalCode: "lower case" } }, trusted).code, "TP_ALT_INPUT_MALFORMED");
});

test("determinism: same input -> identical plan identity; any bound field change -> new identity", () => {
  const pol = policy();
  const a0 = initial(pol);
  assert.equal(initial(pol).planIdentity, a0.planIdentity);
  assert.notEqual(initial(pol, { checkedSnapshotDigest: OTHER_SNAP }).planIdentity, a0.planIdentity);
  const r1 = proposeAlternative(altReq(pol, a0, [a0.candidate]), trusted);
  const r2 = proposeAlternative(altReq(pol, a0, [a0.candidate]), trusted);
  assert.equal(r1.planIdentity, r2.planIdentity);
  const r3 = proposeAlternative(altReq(pol, a0, [a0.candidate], { parent: { refusalDigest: `sha256:${"9".repeat(64)}` } }), trusted);
  assert.notEqual(r3.planIdentity, r1.planIdentity);
  const r4 = proposeAlternative(altReq(pol, a0, [a0.candidate], { reasonEvidence: { reason: "CANDIDATE_LOCAL_INCOMPATIBLE" } }), trusted);
  assert.notEqual(r4.planIdentity, r1.planIdentity);
});

test("task-policy digest is reason-order independent and throws on an invalid policy", () => {
  const a = computeTaskPolicyDigest(policy());
  const b = computeTaskPolicyDigest(policy({ permittedReasons: ["CANDIDATE_LOCAL_INCOMPATIBLE", "CANDIDATE_LOCAL_UNAVAILABLE"] }));
  assert.equal(a, b);
  assert.match(a, /^sha256:[0-9a-f]{64}$/u);
  assert.notEqual(a, computeTaskPolicyDigest(policy({ maxAttempts: 2 })));
  assert.throws(() => computeTaskPolicyDigest(policy({ requestedRepresentationProfile: 128 })), TypeError);
});
