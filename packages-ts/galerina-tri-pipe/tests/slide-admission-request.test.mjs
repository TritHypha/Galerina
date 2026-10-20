// slide-admission-request.test.mjs — Tri-Pipe may request SLIDE/VOK admission; it never admits.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createTriPipeEngine, dispatchTriPipeEngine,
  prepareSlideAdmissionRequest, admitProposedRoute,
  proposeInitialAttempt,
  SLIDE_ADMISSION_REQUEST_SCHEMA, INITIAL_ATTEMPT_REQUEST_SCHEMA, TASK_POLICY_SCHEMA,
} from "../dist/index.js";

const SNAP = `sha256:${"a".repeat(64)}`;
const ARTIFACT = `sha256:${"b".repeat(64)}`;
const ARTIFACT_OTHER = `sha256:${"c".repeat(64)}`;

function assertNonAuthorizing(value) {
  assert.equal(value.authorityReleased, false);
  assert.equal(value.admissionAuthority, false);
  assert.equal(Object.isFrozen(value), true);
}

test("createTriPipeEngine proposals require fresh SLIDE/VOK and never admit", () => {
  const proposal = createTriPipeEngine({ targetId: "cpu", attestationVerified: true });
  assert.equal(proposal.kind, "PROPOSAL");
  if (proposal.kind !== "PROPOSAL") return;
  assert.deepEqual({ ...proposal.requires }, {
    freshSlideAdmission: true,
    freshVokDecision: true,
    freshVokLease: true,
    linkedTerminalReceipt: true,
  });
  assertNonAuthorizing(proposal);
  assert.equal(dispatchTriPipeEngine(proposal).code, "ROUTE_DISPATCH_FORBIDDEN");
});

test("createTriPipeEngine refuses authority-bearing option keys", () => {
  for (const extra of [
    { admission: true },
    { lease: "x" },
    { vokDecision: {} },
    { receipt: "r" },
    { executor: {} },
    { allow: true },
  ]) {
    const refused = createTriPipeEngine({ targetId: "cpu", attestationVerified: true, ...extra });
    assert.equal(refused.kind, "REFUSED");
    if (refused.kind !== "REFUSED") continue;
    assert.equal(refused.code, "TP_ROUTE_AUTHORITY_FIELD_PRESENT");
    assertNonAuthorizing(refused);
  }
});

test("prepareSlideAdmissionRequest packages a route proposal as REQUESTED_NOT_ADMITTED", () => {
  const proposal = createTriPipeEngine({ targetId: "cpu", attestationVerified: true });
  const request = prepareSlideAdmissionRequest(proposal, ARTIFACT);
  assert.equal(request.kind, "SLIDE_ADMISSION_REQUEST");
  if (request.kind !== "SLIDE_ADMISSION_REQUEST") return;
  assert.equal(request.schema, SLIDE_ADMISSION_REQUEST_SCHEMA);
  assert.equal(request.status, "REQUESTED_NOT_ADMITTED");
  assert.equal(request.proposalKind, "PROPOSAL");
  assert.equal(request.proposalDigest, proposal.candidateRouteDigest);
  assert.equal(request.transfer.digest, proposal.candidateRouteDigest);
  assert.equal(request.artifactDigest, ARTIFACT);
  assert.notEqual(request.artifactDigest, request.proposalDigest);
  assert.deepEqual({ ...request.requires }, {
    freshSlideAdmission: true,
    freshVokDecision: true,
    freshVokLease: true,
    linkedTerminalReceipt: true,
  });
  assert.match(request.requestDigest, /^sha256:[0-9a-f]{64}$/u);
  assertNonAuthorizing(request);
  assert.equal(dispatchTriPipeEngine(request).code, "ROUTE_DISPATCH_FORBIDDEN");
});

test("prepareSlideAdmissionRequest packages an attempt proposal", () => {
  const attempt = proposeInitialAttempt({
    schema: INITIAL_ATTEMPT_REQUEST_SCHEMA,
    taskId: "task-1",
    checkedSnapshotDigest: SNAP,
    taskPolicy: {
      schema: TASK_POLICY_SCHEMA,
      taskId: "task-1",
      issuerId: "issuer.test",
      requestedRepresentationProfile: 1,
      workloadClass: "GENERAL",
      permittedReasons: ["CANDIDATE_LOCAL_UNAVAILABLE"],
      maxAttempts: 2,
    },
  });
  assert.equal(attempt.kind, "ATTEMPT_PROPOSAL");
  const request = prepareSlideAdmissionRequest(attempt, ARTIFACT);
  assert.equal(request.kind, "SLIDE_ADMISSION_REQUEST");
  if (request.kind !== "SLIDE_ADMISSION_REQUEST") return;
  assert.equal(request.proposalKind, "ATTEMPT_PROPOSAL");
  assert.equal(request.proposalDigest, attempt.planIdentity);
  assert.equal(request.artifactDigest, ARTIFACT);
  assert.notEqual(request.artifactDigest, request.proposalDigest);
  assertNonAuthorizing(request);
});

test("prepareSlideAdmissionRequest refuses authority fields, claimed admission, and refusals", () => {
  const proposal = createTriPipeEngine({ targetId: "cpu", attestationVerified: true });
  const withAdmission = { ...proposal, admission: true };
  const claimed = { ...proposal, admissionAuthority: true };
  const released = { ...proposal, authorityReleased: true };
  const profileRefuse = createTriPipeEngine({
    targetId: "cpu",
    attestationVerified: true,
    representationProfile: 128,
  });
  assert.equal(prepareSlideAdmissionRequest(withAdmission, ARTIFACT).code, "TP_SLIDE_REQUEST_AUTHORITY_FIELD_PRESENT");
  assert.equal(prepareSlideAdmissionRequest(claimed, ARTIFACT).code, "TP_SLIDE_REQUEST_ALREADY_CLAIMED");
  assert.equal(prepareSlideAdmissionRequest(released, ARTIFACT).code, "TP_SLIDE_REQUEST_ALREADY_CLAIMED");
  assert.equal(prepareSlideAdmissionRequest(profileRefuse, ARTIFACT).code, "TP_SLIDE_REQUEST_MALFORMED");
  assert.equal(prepareSlideAdmissionRequest(null, ARTIFACT).code, "TP_SLIDE_REQUEST_MALFORMED");
  assert.equal(prepareSlideAdmissionRequest({ kind: "PROPOSAL" }, ARTIFACT).code, "TP_SLIDE_REQUEST_ALREADY_CLAIMED");
});

test("prepareSlideAdmissionRequest requires a well-formed artifactDigest", () => {
  const proposal = createTriPipeEngine({ targetId: "cpu", attestationVerified: true });
  assert.equal(proposal.kind, "PROPOSAL");
  const malformed = [
    undefined,
    null,
    "",
    `sha256:${"A".repeat(64)}`,
    `SHA256:${"b".repeat(64)}`,
    `sha256:${"b".repeat(63)}`,
    `sha256:${"b".repeat(65)}`,
    `sha256:${"g".repeat(64)}`,
    `md5:${"b".repeat(64)}`,
    `${ARTIFACT} `,
    1,
    { digest: ARTIFACT },
  ];
  for (const value of malformed) {
    const refused = prepareSlideAdmissionRequest(proposal, value);
    assert.equal(refused.kind, "REFUSED");
    assert.equal(refused.code, "TP_SLIDE_REQUEST_ARTIFACT_DIGEST_MALFORMED");
    assertNonAuthorizing(refused);
  }
  const omitted = prepareSlideAdmissionRequest(proposal);
  assert.equal(omitted.kind, "REFUSED");
  assert.equal(omitted.code, "TP_SLIDE_REQUEST_ARTIFACT_DIGEST_MALFORMED");
  assertNonAuthorizing(omitted);
});

test("artifactDigest is distinct from proposalDigest and is bound into requestDigest", () => {
  const proposal = createTriPipeEngine({ targetId: "cpu", attestationVerified: true });
  const first = prepareSlideAdmissionRequest(proposal, ARTIFACT);
  const second = prepareSlideAdmissionRequest(proposal, ARTIFACT_OTHER);
  assert.equal(first.kind, "SLIDE_ADMISSION_REQUEST");
  assert.equal(second.kind, "SLIDE_ADMISSION_REQUEST");
  if (first.kind !== "SLIDE_ADMISSION_REQUEST" || second.kind !== "SLIDE_ADMISSION_REQUEST") return;
  assert.equal(first.artifactDigest, ARTIFACT);
  assert.equal(second.artifactDigest, ARTIFACT_OTHER);
  assert.equal(first.proposalDigest, proposal.candidateRouteDigest);
  assert.equal(second.proposalDigest, proposal.candidateRouteDigest);
  assert.equal(first.proposalDigest, second.proposalDigest);
  assert.notEqual(first.artifactDigest, first.proposalDigest);
  assert.notEqual(second.artifactDigest, second.proposalDigest);
  assert.notEqual(first.artifactDigest, second.artifactDigest);
  assert.notEqual(first.requestDigest, second.requestDigest);
  const repeat = prepareSlideAdmissionRequest(proposal, ARTIFACT);
  assert.equal(repeat.kind, "SLIDE_ADMISSION_REQUEST");
  if (repeat.kind !== "SLIDE_ADMISSION_REQUEST") return;
  assert.equal(repeat.requestDigest, first.requestDigest);
  assertNonAuthorizing(first);
  assertNonAuthorizing(second);
});

test("admitProposedRoute always TP_SLIDE_ADMISSION_FORBIDDEN", () => {
  const proposal = createTriPipeEngine({ targetId: "cpu", attestationVerified: true });
  const request = prepareSlideAdmissionRequest(proposal, ARTIFACT);
  const forged = {
    kind: "ADMITTED",
    admission: true,
    authorityReleased: true,
    lease: "forged",
  };
  for (const input of [request, proposal, forged, null, { status: "ADMITTED" }]) {
    const refused = admitProposedRoute(input);
    assert.equal(refused.kind, "REFUSED");
    assert.equal(refused.code, "TP_SLIDE_ADMISSION_FORBIDDEN");
    assertNonAuthorizing(refused);
    assert.equal(dispatchTriPipeEngine(refused).code, "ROUTE_DISPATCH_FORBIDDEN");
  }
});
