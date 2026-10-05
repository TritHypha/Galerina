import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  verifyAuditReport,
  verifyCapabilityReport,
  verifyRuntimeCompatibility,
  AUDIT_REPORT_SCHEMA,
  CAPABILITY_REPORT_SCHEMA,
  AUDIT_REPORT_CATEGORIES,
  AUDIT_REPORT_STATUSES,
  FUNGI_VERIFY_012,
  FUNGI_VERIFY_013,
  FUNGI_VERIFY_014,
  FUNGI_VERIFY_015,
  FUNGI_VERIFY_016,
} from "../dist/verify/verify-runtime.js";

const zeroCats = () => Object.fromEntries(AUDIT_REPORT_CATEGORIES.map((k) => [k, 0]));
const zeroStatus = () => Object.fromEntries(AUDIT_REPORT_STATUSES.map((k) => [k, 0]));

function goodAudit(overrides = {}) {
  const byCategory = { ...zeroCats(), effect: 1, capability: 1 };
  const byStatus = { ...zeroStatus(), allowed: 1, denied: 1 };
  return {
    schema: AUDIT_REPORT_SCHEMA,
    generatedAt: "2026-10-05T12:00:00.000Z",
    eventCount: 2,
    byCategory,
    byStatus,
    firstTimestamp: "2026-10-05T11:59:00.000Z",
    lastTimestamp: "2026-10-05T12:00:00.000Z",
    rejectedLines: [],
    rejectedCodes: [],
    truncated: false,
    complete: true,
    ...overrides,
  };
}

function goodCapability(overrides = {}) {
  return {
    schema: CAPABILITY_REPORT_SCHEMA,
    generatedAt: "2026-10-05T12:00:00.000Z",
    capabilities: [
      { capability: "db.read", allowed: 2, denied: 0 },
      { capability: "net.http", allowed: 1, denied: 1 },
    ],
    deniedCapabilities: ["net.http"],
    policyIds: ["policy.default"],
    rejectedIndices: [],
    rejectedCodes: [],
    truncated: false,
    complete: true,
    ...overrides,
  };
}

describe("verifyAuditReport", () => {
  it("accepts a closed complete audit report", () => {
    const r = verifyAuditReport(goodAudit());
    assert.equal(r.success, true);
    assert.equal(r.kind, "audit");
    assert.equal(r.diagnostics.length, 0);
  });

  it("refuses unknown schema before interpreting fields", () => {
    const r = verifyAuditReport(goodAudit({ schema: "galerina.report.audit.v0" }));
    assert.equal(r.success, false);
    assert.equal(r.diagnostics[0].code, FUNGI_VERIFY_013);
  });

  it("refuses getters / unknown keys without echoing", () => {
    const base = goodAudit();
    const hostile = {};
    for (const [k, v] of Object.entries(base)) Object.defineProperty(hostile, k, { value: v, enumerable: true });
    Object.defineProperty(hostile, "extra", {
      get() { throw new Error("getter ran"); },
      enumerable: true,
    });
    const r = verifyAuditReport(hostile);
    assert.equal(r.success, false);
    assert.equal(r.diagnostics[0].code, FUNGI_VERIFY_012);
    assert.equal(JSON.stringify(r).includes("extra"), false);
    assert.equal(JSON.stringify(r).includes("getter"), false);
  });

  it("refuses count sum mismatch and incomplete reports", () => {
    const badSum = verifyAuditReport(goodAudit({ eventCount: 9 }));
    assert.equal(badSum.success, false);
    assert.ok(badSum.diagnostics.some((d) => d.code === FUNGI_VERIFY_015));

    const incomplete = verifyAuditReport(goodAudit({
      rejectedLines: [1],
      rejectedCodes: ["FUNGI-REPORT-002"],
      complete: false,
    }));
    assert.equal(incomplete.success, false);
    assert.ok(incomplete.diagnostics.some((d) => d.code === FUNGI_VERIFY_016));
  });

  it("refuses non-UTC generatedAt", () => {
    const r = verifyAuditReport(goodAudit({ generatedAt: "2026-10-05T12:00:00+01:00" }));
    assert.equal(r.success, false);
    assert.ok(r.diagnostics.some((d) => d.code === FUNGI_VERIFY_014));
  });
});

describe("verifyCapabilityReport", () => {
  it("accepts a closed complete capability report", () => {
    const r = verifyCapabilityReport(goodCapability());
    assert.equal(r.success, true);
    assert.equal(r.kind, "capability");
  });

  it("refuses deniedCapabilities that disagree with rows", () => {
    const r = verifyCapabilityReport(goodCapability({ deniedCapabilities: [] }));
    assert.equal(r.success, false);
    assert.ok(r.diagnostics.some((d) => d.code === FUNGI_VERIFY_015));
  });

  it("refuses unsorted capability rows", () => {
    const r = verifyCapabilityReport(goodCapability({
      capabilities: [
        { capability: "net.http", allowed: 1, denied: 1 },
        { capability: "db.read", allowed: 2, denied: 0 },
      ],
      deniedCapabilities: ["net.http"],
    }));
    assert.equal(r.success, false);
    assert.ok(r.diagnostics.some((d) => d.code === FUNGI_VERIFY_015));
  });

  it("refuses incomplete capability reports", () => {
    const r = verifyCapabilityReport(goodCapability({
      rejectedIndices: [0],
      rejectedCodes: ["FUNGI-EVIDENCE-002"],
      complete: false,
    }));
    assert.equal(r.success, false);
    assert.ok(r.diagnostics.some((d) => d.code === FUNGI_VERIFY_016));
  });
});

describe("verifyRuntimeCompatibility", () => {
  it("passes only when both sides already succeeded", () => {
    const a = verifyAuditReport(goodAudit());
    const c = verifyCapabilityReport(goodCapability());
    assert.equal(verifyRuntimeCompatibility(a, c).success, true);
    const bad = verifyRuntimeCompatibility(a, verifyCapabilityReport(goodCapability({ deniedCapabilities: [] })));
    assert.equal(bad.success, false);
  });
});
