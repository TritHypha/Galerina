import assert from "node:assert/strict";
import test from "node:test";
import {
  FUNGI_SEC_CLA_001,
  FUNGI_SEC_CLA_002,
  FUNGI_SEC_CLA_003,
  CAPABILITY_LEASE_SCHEMA,
  CAPABILITY_ATTENUATION_SCHEMA,
  APPROVER_CHAIN_SCHEMA,
  CAPABILITY_LEASE_PARENT_NONE,
  readCapabilityLease,
  readCapabilityAttenuation,
  readApproverChain,
} from "../dist/index.js";

const goodLease = Object.freeze({
  schema: CAPABILITY_LEASE_SCHEMA,
  leaseId: "lease.api.1",
  boundaryId: "bound.api",
  subjectId: "svc.api",
  capabilities: Object.freeze(["audit.write", "net.egress"]),
  status: "active",
  issuedAtEpochSec: 1_700_000_000,
  expiresAtEpochSec: 1_700_086_400,
  parentLeaseId: CAPABILITY_LEASE_PARENT_NONE,
  diagnostics: Object.freeze([]),
});

const goodAttenuation = Object.freeze({
  schema: CAPABILITY_ATTENUATION_SCHEMA,
  attenuationId: "att.1",
  parentLeaseId: "lease.api.1",
  childLeaseId: "lease.api.2",
  parentCapabilities: Object.freeze(["audit.write", "net.egress"]),
  childCapabilities: Object.freeze(["audit.write"]),
  complete: true,
  diagnostics: Object.freeze([]),
});

const goodChain = Object.freeze({
  schema: APPROVER_CHAIN_SCHEMA,
  chainId: "chain.1",
  leaseId: "lease.api.1",
  subjectId: "svc.api",
  approverIds: Object.freeze(["alice.ops", "bob.sec"]),
  decision: "allow",
  complete: true,
  diagnostics: Object.freeze([]),
});

test("readCapabilityLease admits a closed active root lease", () => {
  const result = readCapabilityLease(goodLease);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.schema, CAPABILITY_LEASE_SCHEMA);
  assert.equal(result.value.status, "active");
  assert.equal(result.value.parentLeaseId, CAPABILITY_LEASE_PARENT_NONE);
  assert.deepEqual(result.value.capabilities, ["audit.write", "net.egress"]);
  assert.equal(result.value.diagnostics.length, 0);
});

test("readCapabilityAttenuation admits a closed subset attenuation", () => {
  const result = readCapabilityAttenuation(goodAttenuation);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.value.childCapabilities, ["audit.write"]);
  assert.equal(result.value.complete, true);
});

test("readApproverChain admits a closed allow chain", () => {
  const result = readApproverChain(goodChain);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.decision, "allow");
  assert.deepEqual(result.value.approverIds, ["alice.ops", "bob.sec"]);
});

test("hostile getter / unknown key refuse without echo", () => {
  const hostile = {
    schema: CAPABILITY_LEASE_SCHEMA,
    leaseId: "secret.lease",
    boundaryId: "bound.api",
    subjectId: "svc.api",
    capabilities: ["audit.write"],
    status: "active",
    issuedAtEpochSec: 1_700_000_000,
    expiresAtEpochSec: 1_700_086_400,
    parentLeaseId: CAPABILITY_LEASE_PARENT_NONE,
    diagnostics: [],
  };
  Object.defineProperty(hostile, "leaseId", {
    get() {
      throw new Error("getter-ran");
    },
    enumerable: true,
  });
  const r1 = readCapabilityLease(hostile);
  assert.equal(r1.ok, false);
  if (r1.ok) return;
  assert.equal(r1.diagnostics[0]?.code, FUNGI_SEC_CLA_001);
  const joined = r1.diagnostics.map((d) => d.message).join(" ");
  assert.equal(joined.includes("secret.lease"), false);
  assert.equal(joined.includes("getter-ran"), false);

  const extra = { ...goodLease, evil: "TOKEN" };
  const r2 = readCapabilityLease(extra);
  assert.equal(r2.ok, false);
  if (r2.ok) return;
  assert.equal(r2.diagnostics.some((d) => d.code === FUNGI_SEC_CLA_001), true);
  assert.equal(r2.diagnostics.map((d) => d.message).join(" ").includes("TOKEN"), false);
});

test("subset / self-parent / allow-without-approvers refuse", () => {
  const widen = {
    ...goodAttenuation,
    childCapabilities: Object.freeze(["audit.write", "fs.write"]),
  };
  const r1 = readCapabilityAttenuation(widen);
  assert.equal(r1.ok, false);
  if (!r1.ok) assert.equal(r1.diagnostics.some((d) => d.code === FUNGI_SEC_CLA_003), true);

  const selfParent = { ...goodLease, parentLeaseId: "lease.api.1" };
  const r2 = readCapabilityLease(selfParent);
  assert.equal(r2.ok, false);
  if (!r2.ok) assert.equal(r2.diagnostics.some((d) => d.code === FUNGI_SEC_CLA_003), true);

  const emptyAllow = { ...goodChain, approverIds: Object.freeze([]) };
  const r3 = readApproverChain(emptyAllow);
  assert.equal(r3.ok, false);
  if (!r3.ok) assert.equal(r3.diagnostics.some((d) => d.code === FUNGI_SEC_CLA_003), true);
});

test("NaN epoch / unknown status / expiry-before-issue refuse", () => {
  const badEpoch = { ...goodLease, issuedAtEpochSec: Number.NaN };
  const r1 = readCapabilityLease(badEpoch);
  assert.equal(r1.ok, false);
  if (!r1.ok) assert.equal(r1.diagnostics[0]?.code, FUNGI_SEC_CLA_002);

  const badStatus = { ...goodLease, status: "unknown" };
  const r2 = readCapabilityLease(badStatus);
  assert.equal(r2.ok, false);
  if (!r2.ok) assert.equal(r2.diagnostics[0]?.code, FUNGI_SEC_CLA_002);

  const badExpiry = { ...goodLease, expiresAtEpochSec: 1_699_999_999 };
  const r3 = readCapabilityLease(badExpiry);
  assert.equal(r3.ok, false);
  if (!r3.ok) assert.equal(r3.diagnostics.some((d) => d.code === FUNGI_SEC_CLA_003), true);
});
