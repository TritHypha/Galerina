import assert from "node:assert/strict";
import test from "node:test";
import {
  FUNGI_SEC_CAP_001,
  FUNGI_SEC_CAP_002,
  FUNGI_SEC_CAP_003,
  CAPABILITY_BOUNDARY_SCHEMA,
  CAPABILITY_GRANT_REPORT_SCHEMA,
  readCapabilityBoundary,
  readCapabilityGrantReport,
} from "../dist/index.js";

const goodBoundary = Object.freeze({
  schema: CAPABILITY_BOUNDARY_SCHEMA,
  boundaryId: "bound.api",
  subjectId: "svc.api",
  admittedCapabilities: Object.freeze(["audit.write", "net.egress"]),
  deniedCapabilities: Object.freeze(["fs.write"]),
  defaultEffect: "deny",
  diagnostics: Object.freeze([]),
});

const goodGrant = Object.freeze({
  schema: CAPABILITY_GRANT_REPORT_SCHEMA,
  reportId: "grant.1",
  boundaryId: "bound.api",
  subjectId: "svc.api",
  decision: "allow",
  grantedCapabilities: Object.freeze(["audit.write"]),
  refusedCapabilities: Object.freeze(["fs.write"]),
  complete: true,
  diagnostics: Object.freeze([]),
});

test("readCapabilityBoundary admits a closed deny-default boundary", () => {
  const result = readCapabilityBoundary(goodBoundary);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.schema, CAPABILITY_BOUNDARY_SCHEMA);
  assert.equal(result.value.defaultEffect, "deny");
  assert.deepEqual(result.value.admittedCapabilities, ["audit.write", "net.egress"]);
  assert.deepEqual(result.value.deniedCapabilities, ["fs.write"]);
  assert.equal(result.value.diagnostics.length, 0);
});

test("readCapabilityGrantReport admits a closed allow grant", () => {
  const result = readCapabilityGrantReport(goodGrant);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.decision, "allow");
  assert.equal(result.value.complete, true);
  assert.deepEqual(result.value.grantedCapabilities, ["audit.write"]);
});

test("hostile getter / prototype / unknown key refuse without echo", () => {
  const hostile = {
    schema: CAPABILITY_BOUNDARY_SCHEMA,
    boundaryId: "secret.leak",
    subjectId: "svc.api",
    admittedCapabilities: [],
    deniedCapabilities: [],
    defaultEffect: "deny",
    diagnostics: [],
  };
  Object.defineProperty(hostile, "boundaryId", {
    get() {
      throw new Error("getter-ran");
    },
    enumerable: true,
  });
  const r1 = readCapabilityBoundary(hostile);
  assert.equal(r1.ok, false);
  if (r1.ok) return;
  assert.equal(r1.diagnostics[0]?.code, FUNGI_SEC_CAP_001);
  const joined = r1.diagnostics.map((d) => d.message).join(" ");
  assert.equal(joined.includes("secret.leak"), false);
  assert.equal(joined.includes("getter-ran"), false);

  const extra = { ...goodBoundary, evil: "TOKEN" };
  const r2 = readCapabilityBoundary(extra);
  assert.equal(r2.ok, false);
  if (r2.ok) return;
  assert.equal(r2.diagnostics.some((d) => d.code === FUNGI_SEC_CAP_001), true);
  assert.equal(r2.diagnostics.map((d) => d.message).join(" ").includes("TOKEN"), false);
});

test("overlapping capability lists and allow-default refuse", () => {
  const overlap = {
    ...goodBoundary,
    admittedCapabilities: Object.freeze(["net.egress"]),
    deniedCapabilities: Object.freeze(["net.egress"]),
  };
  const r1 = readCapabilityBoundary(overlap);
  assert.equal(r1.ok, false);
  if (!r1.ok) assert.equal(r1.diagnostics.some((d) => d.code === FUNGI_SEC_CAP_003), true);

  const allowDefault = { ...goodBoundary, defaultEffect: "allow" };
  const r2 = readCapabilityBoundary(allowDefault);
  assert.equal(r2.ok, false);
  if (!r2.ok) assert.equal(r2.diagnostics[0]?.code, FUNGI_SEC_CAP_002);
});

test("allow decision without grants refuses; unsorted lists refuse", () => {
  const emptyAllow = {
    ...goodGrant,
    grantedCapabilities: Object.freeze([]),
    refusedCapabilities: Object.freeze([]),
  };
  const r1 = readCapabilityGrantReport(emptyAllow);
  assert.equal(r1.ok, false);
  if (!r1.ok) assert.equal(r1.diagnostics.some((d) => d.code === FUNGI_SEC_CAP_003), true);

  const unsorted = {
    ...goodBoundary,
    admittedCapabilities: Object.freeze(["net.egress", "audit.write"]),
  };
  const r2 = readCapabilityBoundary(unsorted);
  assert.equal(r2.ok, false);
  if (!r2.ok) assert.equal(r2.diagnostics[0]?.code, FUNGI_SEC_CAP_002);
});

test("NaN-adjacent: non-boolean complete and unknown decision refuse", () => {
  const badComplete = { ...goodGrant, complete: Number.NaN };
  const r1 = readCapabilityGrantReport(badComplete);
  assert.equal(r1.ok, false);
  if (!r1.ok) assert.equal(r1.diagnostics[0]?.code, FUNGI_SEC_CAP_002);

  const badDecision = { ...goodGrant, decision: "unknown" };
  const r2 = readCapabilityGrantReport(badDecision);
  assert.equal(r2.ok, false);
  if (!r2.ok) assert.equal(r2.diagnostics[0]?.code, FUNGI_SEC_CAP_002);
});
