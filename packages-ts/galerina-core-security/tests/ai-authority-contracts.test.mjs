import assert from "node:assert/strict";
import test from "node:test";
import {
  FUNGI_SEC_ASG_001,
  FUNGI_SEC_ASG_002,
  FUNGI_SEC_ASG_003,
  AI_AUTHORITY_REQUEST_SCHEMA,
  TRUST_ROOT_MODIFICATION_SCHEMA,
  readAiAuthorityRequest,
  readTrustRootModification,
} from "../dist/index.js";

const goodRequest = Object.freeze({
  schema: AI_AUTHORITY_REQUEST_SCHEMA,
  requestId: "req.ai.1",
  actorId: "agent.reviewer",
  actorType: "ai_agent",
  requestedCapabilities: Object.freeze(["audit.read", "reports.write"]),
  requestedEffects: Object.freeze(["fs.read"]),
  decision: "deny",
  selfGrantAttempt: true,
  complete: true,
  diagnostics: Object.freeze([]),
});

const goodAllowRequest = Object.freeze({
  schema: AI_AUTHORITY_REQUEST_SCHEMA,
  requestId: "req.ops.1",
  actorId: "alice.ops",
  actorType: "human",
  requestedCapabilities: Object.freeze(["deploy.staging"]),
  requestedEffects: Object.freeze([]),
  decision: "allow",
  selfGrantAttempt: false,
  complete: true,
  diagnostics: Object.freeze([]),
});

const goodTrust = Object.freeze({
  schema: TRUST_ROOT_MODIFICATION_SCHEMA,
  modificationId: "trm.1",
  actorId: "alice.ops",
  actorType: "human",
  trustRootId: "root.prod",
  operation: "rotate_key",
  decision: "allow",
  externalGovernance: true,
  complete: true,
  diagnostics: Object.freeze([]),
});

const deniedAiTrust = Object.freeze({
  schema: TRUST_ROOT_MODIFICATION_SCHEMA,
  modificationId: "trm.ai.1",
  actorId: "agent.reviewer",
  actorType: "ai_agent",
  trustRootId: "root.prod",
  operation: "add_key",
  decision: "deny",
  externalGovernance: false,
  complete: true,
  diagnostics: Object.freeze([]),
});

test("readAiAuthorityRequest admits denied self-grant and external allow", () => {
  const r1 = readAiAuthorityRequest(goodRequest);
  assert.equal(r1.ok, true);
  if (!r1.ok) return;
  assert.equal(r1.value.selfGrantAttempt, true);
  assert.equal(r1.value.decision, "deny");
  assert.equal(r1.value.diagnostics.length, 0);

  const r2 = readAiAuthorityRequest(goodAllowRequest);
  assert.equal(r2.ok, true);
  if (!r2.ok) return;
  assert.equal(r2.value.decision, "allow");
  assert.equal(r2.value.selfGrantAttempt, false);
  assert.deepEqual(r2.value.requestedCapabilities, ["deploy.staging"]);
});

test("readTrustRootModification admits governed human allow and AI deny", () => {
  const r1 = readTrustRootModification(goodTrust);
  assert.equal(r1.ok, true);
  if (!r1.ok) return;
  assert.equal(r1.value.operation, "rotate_key");
  assert.equal(r1.value.externalGovernance, true);

  const r2 = readTrustRootModification(deniedAiTrust);
  assert.equal(r2.ok, true);
  if (!r2.ok) return;
  assert.equal(r2.value.decision, "deny");
  assert.equal(r2.value.actorType, "ai_agent");
});

test("self-grant allow / empty allow capabilities refuse", () => {
  const selfAllow = { ...goodRequest, decision: "allow", selfGrantAttempt: true };
  const r1 = readAiAuthorityRequest(selfAllow);
  assert.equal(r1.ok, false);
  if (!r1.ok) assert.equal(r1.diagnostics.some((d) => d.code === FUNGI_SEC_ASG_003), true);

  const emptyAllow = {
    ...goodAllowRequest,
    requestedCapabilities: Object.freeze([]),
  };
  const r2 = readAiAuthorityRequest(emptyAllow);
  assert.equal(r2.ok, false);
  if (!r2.ok) assert.equal(r2.diagnostics.some((d) => d.code === FUNGI_SEC_ASG_003), true);
});

test("AI trust-root allow / allow without governance refuse", () => {
  const aiAllow = {
    ...deniedAiTrust,
    decision: "allow",
    externalGovernance: true,
  };
  const r1 = readTrustRootModification(aiAllow);
  assert.equal(r1.ok, false);
  if (!r1.ok) assert.equal(r1.diagnostics.some((d) => d.code === FUNGI_SEC_ASG_003), true);

  const noGov = { ...goodTrust, externalGovernance: false };
  const r2 = readTrustRootModification(noGov);
  assert.equal(r2.ok, false);
  if (!r2.ok) assert.equal(r2.diagnostics.some((d) => d.code === FUNGI_SEC_ASG_003), true);
});

test("hostile getter / unknown key refuse without echo", () => {
  const hostile = {
    schema: AI_AUTHORITY_REQUEST_SCHEMA,
    requestId: "secret.req",
    actorId: "agent.reviewer",
    actorType: "ai_agent",
    requestedCapabilities: ["audit.read"],
    requestedEffects: [],
    decision: "deny",
    selfGrantAttempt: true,
    complete: true,
    diagnostics: [],
  };
  Object.defineProperty(hostile, "requestId", {
    get() {
      throw new Error("getter-ran");
    },
    enumerable: true,
  });
  const r1 = readAiAuthorityRequest(hostile);
  assert.equal(r1.ok, false);
  if (r1.ok) return;
  assert.equal(r1.diagnostics[0]?.code, FUNGI_SEC_ASG_001);
  const joined = r1.diagnostics.map((d) => d.message).join(" ");
  assert.equal(joined.includes("secret.req"), false);
  assert.equal(joined.includes("getter-ran"), false);

  const extra = { ...goodRequest, evil: "TOKEN" };
  const r2 = readAiAuthorityRequest(extra);
  assert.equal(r2.ok, false);
  if (r2.ok) return;
  assert.equal(r2.diagnostics.some((d) => d.code === FUNGI_SEC_ASG_001), true);
  assert.equal(r2.diagnostics.map((d) => d.message).join(" ").includes("TOKEN"), false);
});

test("unknown actorType / operation / NaN-free closed domain refuse", () => {
  const badActor = { ...goodRequest, actorType: "admin" };
  const r1 = readAiAuthorityRequest(badActor);
  assert.equal(r1.ok, false);
  if (!r1.ok) assert.equal(r1.diagnostics[0]?.code, FUNGI_SEC_ASG_002);

  const badOp = { ...goodTrust, operation: "wipe_all" };
  const r2 = readTrustRootModification(badOp);
  assert.equal(r2.ok, false);
  if (!r2.ok) assert.equal(r2.diagnostics[0]?.code, FUNGI_SEC_ASG_002);

  const badDecision = { ...goodTrust, decision: "maybe" };
  const r3 = readTrustRootModification(badDecision);
  assert.equal(r3.ok, false);
  if (!r3.ok) assert.equal(r3.diagnostics[0]?.code, FUNGI_SEC_ASG_002);
});
