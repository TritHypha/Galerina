import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  MAX_CONTRACT_ITEMS,
  createAcceleratorCapabilityReport,
  createAcceleratorFallbackReport,
  createDataSensitivityReport,
  createExploitResistanceReport,
  createHardwareRiskReport,
  createMaliciousDataReport,
  createPolicyAiSummaryReport,
  createPolicyConflictReport,
  createPolicyDefinitionsReport,
  createPolicyEffectiveReport,
  createPolicyIndexReport,
  createPrecisionCompatibilityReport,
  createResourceBudgetReport,
  createSpecialistHardwareReport,
  createTaintFlowReport,
} from "../dist/index.js";

const T = "2026-10-05T12:00:00Z";
const MARKER = "do-not-copy-marker-prs-42";

describe("policy report contracts", () => {
  it("indexes closed policy kinds and rejects duplicates and free-text", () => {
    const report = createPolicyIndexReport(
      [
        { policyId: "pol-net", kind: "network" },
        { policyId: "pol-cap", kind: "capability" },
        { policyId: "pol-net", kind: "network" },
        { policyId: "bad", kind: "not-a-kind" },
        { policyId: "x", kind: "data", body: MARKER },
      ],
      T,
    );
    assert.equal(report.schema, "galerina.report.policy-index.v1");
    assert.equal(report.entries.length, 3);
    assert.equal(report.byKind.network, 1);
    assert.equal(report.byKind.capability, 1);
    assert.equal(report.byKind.data, 1);
    assert.deepEqual([...report.rejectedIndexes], [2, 3]);
    assert.equal(report.complete, false);
    assert.ok(!JSON.stringify(report).includes(MARKER));
    assert.ok(Object.isFrozen(report));
  });

  it("definitions keep field names only and refuse non-identifier names", () => {
    const report = createPolicyDefinitionsReport(
      [
        { policyId: "p1", kind: "runtime", fieldNames: ["defaultEffect", "requireTimeouts"] },
        { policyId: "p2", kind: "runtime", fieldNames: ["bad name"] },
      ],
      T,
    );
    assert.equal(report.entries.length, 1);
    assert.deepEqual([...report.entries[0].fieldNames], ["defaultEffect", "requireTimeouts"]);
    assert.deepEqual([...report.rejectedIndexes], [1]);
  });

  it("effective decisions are closed and counted", () => {
    const report = createPolicyEffectiveReport(
      [
        { subjectId: "s1", policyId: "p1", decision: "deny" },
        { subjectId: "s2", policyId: "p1", decision: "allow" },
        { subjectId: "s3", policyId: "p1", decision: "maybe" },
      ],
      T,
    );
    assert.equal(report.byDecision.deny, 1);
    assert.equal(report.byDecision.allow, 1);
    assert.equal(report.byDecision.abstain, 0);
    assert.deepEqual([...report.rejectedIndexes], [2]);
  });

  it("conflicts carry codes only", () => {
    const report = createPolicyConflictReport(
      [
        {
          conflictId: "c1",
          kind: "contradictory_decision",
          policyIds: ["p1", "p2"],
          diagnosticCodes: ["FUNGI-REPORT-002"],
          reason: MARKER,
        },
      ],
      T,
    );
    assert.equal(report.entries.length, 1);
    assert.deepEqual([...report.entries[0].diagnosticCodes], ["FUNGI-REPORT-002"]);
    assert.ok(!JSON.stringify(report).includes(MARKER));
  });

  it("AI summary refuses free-text fields and unknown tokens", () => {
    const ok = createPolicyAiSummaryReport(
      { tokens: ["deny_default", "conflicts_present"], policyCount: 2, conflictCount: 1, denyCount: 1, allowCount: 0 },
      T,
    );
    assert.equal(ok.schema, "galerina.report.policy-ai-summary.v1");
    assert.deepEqual([...ok.tokens], ["deny_default", "conflicts_present"]);
    assert.throws(() => createPolicyAiSummaryReport({ tokens: ["deny_default"], summaryText: MARKER }, T), /FUNGI-REPORT-002/);
    assert.throws(() => createPolicyAiSummaryReport({ tokens: ["invented"] }, T), /FUNGI-REPORT-002/);
  });

  it("hostile getters that throw become rejected index entries, not thrown report builders", () => {
    const hostile = {
      get policyId() { throw new Error(MARKER); },
      kind: "network",
    };
    const report = createPolicyIndexReport([hostile, { policyId: "ok", kind: "network" }], T);
    assert.equal(report.entries.length, 1);
    assert.deepEqual([...report.rejectedIndexes], [0]);
    assert.ok(!JSON.stringify(report).includes(MARKER));
  });
});

describe("risk report contracts", () => {
  it("malicious-data findings refuse payload/sample/message fields", () => {
    const report = createMaliciousDataReport(
      [
        { findingId: "f1", severity: "high", diagnosticCodes: ["FUNGI-REPORT-005"] },
        { findingId: "f2", severity: "high", payload: MARKER, diagnosticCodes: ["FUNGI-REPORT-005"] },
        { findingId: "f3", severity: "nope", diagnosticCodes: ["FUNGI-REPORT-005"] },
      ],
      T,
    );
    assert.equal(report.kind, "malicious_data");
    assert.equal(report.findings.length, 1);
    assert.equal(report.bySeverity.high, 1);
    assert.deepEqual([...report.rejectedIndexes], [1, 2]);
    assert.ok(!JSON.stringify(report).includes(MARKER));
  });

  it("each risk family builder stamps its closed kind", () => {
    assert.equal(createExploitResistanceReport([], T).kind, "exploit_resistance");
    assert.equal(createResourceBudgetReport([], T).kind, "resource_budget");
    assert.equal(createTaintFlowReport([], T).kind, "taint_flow");
    assert.equal(createHardwareRiskReport([], T).kind, "hardware_risk");
  });
});

describe("specialist / accelerator report contracts", () => {
  it("specialist hardware refuses non-cpu available claims under v1 freeze", () => {
    const report = createSpecialistHardwareReport(
      [
        { targetId: "t-cpu", hardwareClass: "cpu", availability: "available" },
        { targetId: "t-gpu", hardwareClass: "gpu", availability: "available" },
        { targetId: "t-gpu2", hardwareClass: "gpu", availability: "planning_only" },
      ],
      T,
    );
    assert.equal(report.entries.length, 2);
    assert.equal(report.entries[0].v1Executable, true);
    assert.equal(report.entries[1].v1Executable, false);
    assert.deepEqual([...report.rejectedIndexes], [1]);
    assert.equal(report.byClass.cpu, 1);
    assert.equal(report.byClass.gpu, 1);
  });

  it("accelerator capability admits only cpu", () => {
    const report = createAcceleratorCapabilityReport(
      [
        { targetId: "a1", hardwareClass: "cpu", capabilityIds: ["ComputeRuntime"], admitted: true },
        { targetId: "a2", hardwareClass: "npu", capabilityIds: ["AcceleratorRuntime"], admitted: true },
        { targetId: "a3", hardwareClass: "npu", capabilityIds: ["AcceleratorRuntime"], admitted: false },
      ],
      T,
    );
    assert.equal(report.entries.length, 2);
    assert.equal(report.entries[0].admitted, true);
    assert.equal(report.entries[1].admitted, false);
    assert.deepEqual([...report.rejectedIndexes], [1]);
  });

  it("accelerator fallback keeps closed targets and codes", () => {
    const report = createAcceleratorFallbackReport(
      [
        { fromClass: "gpu", toTarget: "cpu", diagnosticCodes: ["FUNGI-COMPUTE-001"] },
        { fromClass: "cpu", toTarget: "none", diagnosticCodes: ["FUNGI-COMPUTE-001"] },
      ],
      T,
    );
    assert.equal(report.entries.length, 1);
    assert.deepEqual([...report.rejectedIndexes], [1]);
  });

  it("data sensitivity is rank-derived and cannot be overridden open", () => {
    const report = createDataSensitivityReport(
      [
        { targetId: "d1", maxSensitivity: "internal", requestedSensitivity: "public" },
        { targetId: "d2", maxSensitivity: "public", requestedSensitivity: "secret", allowed: true },
        { targetId: "d3", maxSensitivity: "confidential", requestedSensitivity: "secret" },
      ],
      T,
    );
    assert.equal(report.entries.length, 2);
    assert.equal(report.entries[0].allowed, true);
    assert.equal(report.entries[1].allowed, false);
    assert.deepEqual([...report.rejectedIndexes], [1]);
  });

  it("precision compatibility is membership-derived", () => {
    const report = createPrecisionCompatibilityReport(
      [
        { targetId: "p1", requested: "int8", supported: ["fp32", "int8"] },
        { targetId: "p2", requested: "fp16", supported: ["fp32"], compatible: true },
      ],
      T,
    );
    assert.equal(report.entries.length, 1);
    assert.equal(report.entries[0].compatible, true);
    assert.deepEqual([...report.rejectedIndexes], [1]);
  });

  it("truncates past MAX_CONTRACT_ITEMS without reading further ids", () => {
    const items = Array.from({ length: MAX_CONTRACT_ITEMS + 2 }, (_, i) => ({
      policyId: "p" + i,
      kind: "network",
    }));
    // ids must match ID regex: p0 is ok but need letter start - use pol-
    const items2 = Array.from({ length: MAX_CONTRACT_ITEMS + 2 }, (_, i) => ({
      policyId: "pol-" + i,
      kind: "network",
    }));
    const report = createPolicyIndexReport(items2, T);
    assert.equal(report.entries.length, MAX_CONTRACT_ITEMS);
    assert.equal(report.truncated, true);
    assert.equal(report.complete, false);
  });
});
