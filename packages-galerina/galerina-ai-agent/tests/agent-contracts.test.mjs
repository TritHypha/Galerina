import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  validateAgentLimits,
  validateAgentToolPermissions,
  validateAgentDefinition,
  validateAgentTaskGroupPlan,
  applyAgentMergePolicy,
  createAgentReport,
} from "../dist/index.js";

const safeLimits = {
  timeoutMs: 30_000,
  memoryBytes: 256 * 1024 * 1024,
  maxToolCalls: 16,
  maxTokens: 4096,
  rateLimitPerMinute: 60,
};

const codes = (diags) => diags.map((d) => d.code);

describe("validateAgentLimits — unbounded is unsafe (fail-closed)", () => {
  it("accepts fully-bounded limits", () => {
    assert.deepEqual(codes(validateAgentLimits(safeLimits)), []);
  });

  it("rejects a non-positive timeout, memory and tool-call budget", () => {
    const diags = validateAgentLimits({ timeoutMs: 0, memoryBytes: -1, maxToolCalls: 0 });
    assert.deepEqual(codes(diags).sort(), [
      "Galerina_AGENT_MEMORY_LIMIT_REQUIRED",
      "Galerina_AGENT_TIMEOUT_REQUIRED",
      "Galerina_AGENT_TOOL_CALL_LIMIT_REQUIRED",
    ]);
    assert.ok(diags.every((d) => d.severity === "error"));
  });

  it("rejects NaN bounds (not just <= 0)", () => {
    const diags = validateAgentLimits({ timeoutMs: Number.NaN, memoryBytes: 1, maxToolCalls: 1 });
    assert.deepEqual(codes(diags), ["Galerina_AGENT_TIMEOUT_REQUIRED"]);
  });

  it("rejects optional budgets only when present and non-positive", () => {
    assert.deepEqual(codes(validateAgentLimits({ ...safeLimits, maxTokens: 0 })), [
      "Galerina_AGENT_MAX_TOKENS_INVALID",
    ]);
    assert.deepEqual(codes(validateAgentLimits({ ...safeLimits, rateLimitPerMinute: -5 })), [
      "Galerina_AGENT_RATE_LIMIT_INVALID",
    ]);
    // absent optionals are fine
    assert.deepEqual(
      codes(validateAgentLimits({ timeoutMs: 1, memoryBytes: 1, maxToolCalls: 1 })),
      [],
    );
  });
});

describe("validateAgentToolPermissions — allow+deny resolves to deny", () => {
  it("accepts a clean permission list", () => {
    const diags = validateAgentToolPermissions([
      { tool: "read_file", decision: "allow" },
      { tool: "shell", decision: "deny" },
    ]);
    assert.deepEqual(codes(diags), []);
  });

  it("flags an empty tool name", () => {
    const diags = validateAgentToolPermissions([{ tool: "   ", decision: "allow" }]);
    assert.deepEqual(codes(diags), ["Galerina_AGENT_TOOL_NAME_REQUIRED"]);
  });

  it("flags a tool that is both allowed and denied", () => {
    const diags = validateAgentToolPermissions([
      { tool: "network", decision: "allow" },
      { tool: "network", decision: "deny" },
    ]);
    assert.deepEqual(codes(diags), ["Galerina_AGENT_TOOL_PERMISSION_CONFLICT"]);
  });

  it("does NOT flag the same tool declared twice with the same decision", () => {
    const diags = validateAgentToolPermissions([
      { tool: "network", decision: "deny" },
      { tool: "network", decision: "deny" },
    ]);
    assert.deepEqual(codes(diags), []);
  });
});

describe("validateAgentDefinition — structural + delegated policy checks", () => {
  const base = {
    name: "triage",
    inputType: "Request",
    outputType: "Report",
    tools: [{ tool: "read_file", decision: "allow" }],
    effects: [],
    permissions: [],
    limits: safeLimits,
    failureBehaviour: "return_typed_error",
  };

  it("accepts a well-formed definition", () => {
    assert.deepEqual(codes(validateAgentDefinition(base)), []);
  });

  it("requires name, inputType and outputType", () => {
    const diags = validateAgentDefinition({ ...base, name: "", inputType: " ", outputType: "" });
    assert.deepEqual(codes(diags).sort(), [
      "Galerina_AGENT_INPUT_TYPE_REQUIRED",
      "Galerina_AGENT_NAME_REQUIRED",
      "Galerina_AGENT_OUTPUT_TYPE_REQUIRED",
    ]);
  });

  it("propagates tool + limit diagnostics from the delegated validators", () => {
    const diags = validateAgentDefinition({
      ...base,
      tools: [{ tool: "x", decision: "allow" }, { tool: "x", decision: "deny" }],
      limits: { timeoutMs: 0, memoryBytes: 1, maxToolCalls: 1 },
    });
    assert.ok(codes(diags).includes("Galerina_AGENT_TOOL_PERMISSION_CONFLICT"));
    assert.ok(codes(diags).includes("Galerina_AGENT_TIMEOUT_REQUIRED"));
  });
});

describe("validateAgentTaskGroupPlan — named, bounded, non-empty", () => {
  it("accepts a valid plan", () => {
    const diags = validateAgentTaskGroupPlan({
      name: "sweep",
      timeoutMs: 60_000,
      agents: ["triage"],
      cancelOnFailure: true,
    });
    assert.deepEqual(codes(diags), []);
  });

  it("rejects an unnamed, unbounded, empty group", () => {
    const diags = validateAgentTaskGroupPlan({
      name: "",
      timeoutMs: 0,
      agents: [],
      cancelOnFailure: false,
    });
    assert.deepEqual(codes(diags).sort(), [
      "Galerina_AGENT_TASK_GROUP_EMPTY",
      "Galerina_AGENT_TASK_GROUP_NAME_REQUIRED",
      "Galerina_AGENT_TASK_GROUP_TIMEOUT_REQUIRED",
    ]);
  });
});

describe("applyAgentMergePolicy — evidence & confidence gates (fail-closed)", () => {
  const policy = {
    name: "default",
    requireEvidenceFor: ["High", "Critical"],
    minimumConfidence: 0.5,
    lowConfidenceAction: "drop",
  };

  it("drops a High finding that carries no evidence", () => {
    const out = applyAgentMergePolicy(
      [{ title: "sqli", severity: "High", evidence: "  ", confidence: 0.9 }],
      policy,
    );
    assert.equal(out.included.length, 0);
    assert.equal(out.dropped.length, 1);
    assert.match(out.warnings[0], /evidence required but missing/);
  });

  it("drops a low-confidence finding when the action is 'drop'", () => {
    const out = applyAgentMergePolicy(
      [{ title: "maybe", severity: "Low", evidence: "note", confidence: 0.2 }],
      policy,
    );
    assert.equal(out.included.length, 0);
    assert.equal(out.dropped.length, 1);
  });

  it("retains a low-confidence finding for review when the action is 'review'", () => {
    const out = applyAgentMergePolicy(
      [{ title: "maybe", severity: "Low", evidence: "note", confidence: 0.2 }],
      { ...policy, lowConfidenceAction: "review" },
    );
    assert.equal(out.included.length, 1);
    assert.match(out.warnings[0], /retained for human review/);
  });

  it("includes a well-evidenced, confident finding cleanly", () => {
    const out = applyAgentMergePolicy(
      [{ title: "rce", severity: "Critical", evidence: "poc attached", confidence: 0.95 }],
      policy,
    );
    assert.equal(out.included.length, 1);
    assert.equal(out.dropped.length, 0);
    assert.deepEqual(out.warnings, []);
  });
});

describe("createAgentReport — human review is forced, never auto-approved", () => {
  const passingRun = {
    name: "triage",
    status: "passed",
    toolCalls: 3,
    memoryBytes: 1024,
    durationMs: 120,
  };

  it("does not require review when all pass, no unsafe tools, no high-impact finding", () => {
    const report = createAgentReport({
      flow: "audit",
      parallel: false,
      timeoutMs: 30_000,
      runs: [passingRun],
      findings: [{ title: "style", severity: "Low", evidence: "x", confidence: 0.9 }],
    });
    assert.equal(report.humanReviewRequired, false);
    assert.equal(report.agents.length, 1);
  });

  it("forces review when an agent did not pass", () => {
    const report = createAgentReport({
      flow: "audit",
      parallel: false,
      timeoutMs: 30_000,
      runs: [{ ...passingRun, status: "failed" }],
      findings: [],
    });
    assert.equal(report.humanReviewRequired, true);
    assert.match(report.warnings.join(" "), /did not pass/);
  });

  it("forces review when an unsafe tool was used", () => {
    const report = createAgentReport({
      flow: "audit",
      parallel: false,
      timeoutMs: 30_000,
      runs: [passingRun],
      findings: [],
      unsafeToolsUsed: ["shell"],
    });
    assert.equal(report.humanReviewRequired, true);
    assert.match(report.warnings.join(" "), /Unsafe tool/);
  });

  it("forces review when a surviving finding is High or Critical", () => {
    const report = createAgentReport({
      flow: "audit",
      parallel: false,
      timeoutMs: 30_000,
      runs: [passingRun],
      findings: [{ title: "rce", severity: "Critical", evidence: "poc", confidence: 0.95 }],
      mergePolicy: {
        name: "default",
        requireEvidenceFor: ["High", "Critical"],
        minimumConfidence: 0.5,
        lowConfidenceAction: "drop",
      },
    });
    assert.equal(report.humanReviewRequired, true);
  });
});
