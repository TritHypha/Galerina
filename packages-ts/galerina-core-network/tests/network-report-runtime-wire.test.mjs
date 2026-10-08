import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  FUNGI_NETWORK_CODES,
  NETWORK_POLICY_REPORT_SCHEMA,
  NETWORK_REPORT_RUNTIME_TARGETS,
  NETWORK_RUNTIME_AUDIT_CATEGORY,
  NETWORK_RUNTIME_AUDIT_EVENT_KEYS,
  NETWORK_RUNTIME_AUDIT_REFERENCE_TYPES,
  NETWORK_RUNTIME_AUDIT_RUNTIME_KEYS,
  NETWORK_RUNTIME_AUDIT_SCHEMA,
  NETWORK_RUNTIME_AUDIT_STATUSES,
  createNetworkPolicyReport,
  createNetworkReport,
  defineNetworkPolicy,
  networkPolicyReportToRuntimeAuditEvent,
  networkReportToRuntimeAuditEvent,
} from "../dist/index.js";

const policy = defineNetworkPolicy("api", {
  endpoints: [
    { direction: "outbound", protocol: "https", effect: "allow", hosts: ["api.example.com"], ports: [443] },
  ],
});
const dest = (over = {}) => ({ name: "api", protocol: "https", host: "api.example.com", port: 443, tlsRequired: true, ...over });
const ctx = {
  eventId: "net-report-1",
  timestamp: "2026-10-07T12:00:00.000Z",
  runtime: { runtimeId: "rt-1", environment: "test", target: "node", processId: "proc-1" },
};

describe("network report runtime-audit wire", () => {
  it("freezes the closed runtime-audit vocabularies", () => {
    assert.equal(Object.isFrozen(NETWORK_RUNTIME_AUDIT_EVENT_KEYS), true);
    assert.deepEqual([...NETWORK_RUNTIME_AUDIT_EVENT_KEYS], [
      "schemaVersion", "eventId", "timestamp", "category", "status", "message", "runtime",
      "effect", "capability", "destination", "references", "metadata",
    ]);
    assert.deepEqual([...NETWORK_RUNTIME_AUDIT_RUNTIME_KEYS], ["runtimeId", "environment", "target", "processId", "region"]);
    assert.deepEqual([...NETWORK_RUNTIME_AUDIT_STATUSES], ["allowed", "denied", "warning", "error", "executed", "verified"]);
    assert.deepEqual([...NETWORK_RUNTIME_AUDIT_REFERENCE_TYPES], ["proof", "denial", "evidence", "manifest", "policy"]);
    assert.deepEqual([...NETWORK_REPORT_RUNTIME_TARGETS], [
      "cpu", "node", "wasm", "browser-wasm", "wasi", "gpu", "optical_io", "photonic", "native", "serverless", "edge",
    ]);
    assert.equal(NETWORK_RUNTIME_AUDIT_SCHEMA, "galerina.runtime.audit.v1");
    assert.equal(NETWORK_RUNTIME_AUDIT_CATEGORY, "network");
  });

  it("maps NetworkPolicyReport onto category network and strips webhook secrets", () => {
    const secret = "s".repeat(40);
    const report = createNetworkPolicyReport({
      policy,
      generatedAt: "2026-10-07T12:00:00.000Z",
      destinations: [dest(), dest({ name: "evil", host: "evil.example.net" })],
      webhookPolicies: [{ secret, algorithm: "sha256", headerName: "x-sig", maxAgeSeconds: 300 }],
    });
    const first = networkPolicyReportToRuntimeAuditEvent(report, ctx);
    const second = networkPolicyReportToRuntimeAuditEvent(report, ctx);
    assert.deepEqual(first.diagnostics, []);
    assert.equal(first.event.schemaVersion, NETWORK_RUNTIME_AUDIT_SCHEMA);
    assert.equal(first.event.category, "network");
    assert.equal(first.event.status, "denied");
    assert.equal(first.event.destination, "evil");
    assert.equal(first.event.metadata.reportSchema, NETWORK_POLICY_REPORT_SCHEMA);
    assert.equal(first.event.metadata.deniedCount, "1");
    assert.equal(first.event.metadata.validatedCount, "1");
    assert.deepEqual(first.event.references, [{ type: "policy", id: "api" }]);
    assert.equal(Object.isFrozen(first.event), true);
    assert.ok(!JSON.stringify(first.event).includes(secret));
    assert.ok(!JSON.stringify(first.event).includes('"secret"'));
    assert.equal(JSON.stringify(first.event), JSON.stringify(second.event));
    for (const key of Object.keys(first.event)) {
      assert.ok(NETWORK_RUNTIME_AUDIT_EVENT_KEYS.includes(key), key);
    }
  });

  it("maps a clean NetworkPolicyReport to verified", () => {
    const report = createNetworkPolicyReport({
      policy,
      generatedAt: "2026-10-07T12:00:00.000Z",
      destinations: [dest()],
    });
    const wired = networkPolicyReportToRuntimeAuditEvent(report, ctx);
    assert.deepEqual(wired.diagnostics, []);
    assert.equal(wired.event.status, "verified");
    assert.equal(wired.event.destination, "api");
  });

  it("refuses unknown report schema and invalid wire context", () => {
    const report = createNetworkPolicyReport({
      policy,
      generatedAt: "2026-10-07T12:00:00.000Z",
      destinations: [dest()],
    });
    const badSchema = networkPolicyReportToRuntimeAuditEvent({ ...report, schemaVersion: "nope" }, ctx);
    assert.ok(badSchema.event === undefined);
    assert.ok(badSchema.diagnostics.some((d) => d.code === FUNGI_NETWORK_CODES.RUNTIME_POLICY_UNAVAILABLE));
    const badCtx = networkPolicyReportToRuntimeAuditEvent(report, { ...ctx, eventId: "" });
    assert.ok(badCtx.event === undefined);
    const badTarget = networkPolicyReportToRuntimeAuditEvent(report, {
      ...ctx,
      runtime: { ...ctx.runtime, target: "quantum" },
    });
    assert.ok(badTarget.event === undefined);
  });

  it("maps unversioned NetworkReport without inventing a report schema id", () => {
    const report = createNetworkReport({ policy });
    const wired = networkReportToRuntimeAuditEvent(report, ctx);
    assert.deepEqual(wired.diagnostics, []);
    assert.equal(wired.event.schemaVersion, NETWORK_RUNTIME_AUDIT_SCHEMA);
    assert.equal(wired.event.category, "network");
    assert.equal(wired.event.metadata.reportKind, "NetworkReport");
    assert.equal("reportSchema" in wired.event.metadata, false);
  });
});
