import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  AI_COMPUTE_PLAN_SCHEMA,
  DEFAULT_AI_COMPUTE_POLICY,
  DEFAULT_RUNTIME_RESOURCE_BUDGET,
  FAST_PATH_NEVER_BYPASSES,
  FAST_PATH_SIGNATURE_SCHEMA,
  GOVERNED_EXECUTION_PLAN_SCHEMA,
  MAX_FAST_PATH_LEASE_MS,
  admitAiComputePlan,
  advanceGovernedExecution,
  checkAiComputeOutput,
  checkFastPath,
  createFastPathSignature,
  startGovernedExecution,
  validateGovernedExecutionPlan,
} from "../dist/index.js";

const codes = (v) => [...new Set(v.diagnostics.map((d) => d.code))].sort();
const plan = (over = {}) => ({
  schema: GOVERNED_EXECUTION_PLAN_SCHEMA,
  planId: "orders.create",
  actor: { kind: "service", id: "orders-api" },
  zone: "governed",
  effects: ["db.write"],
  capabilities: ["db.orders.write", "audit.append"],
  budget: DEFAULT_RUNTIME_RESOURCE_BUDGET,
  auditRequired: true,
  ...over,
});
const clean = Object.freeze({ allowed: true, diagnostics: Object.freeze([]) });
const run = (p, events) => events.reduce((s, e) => advanceGovernedExecution(p, s, e), startGovernedExecution(p));
const happy = [
  { type: "plan" },
  { type: "verify", verdict: clean },
  { type: "lock-capabilities", granted: ["db.orders.write", "audit.append", "net.any"] },
  { type: "execute" },
  { type: "audit-proof", proofId: "proof-1" },
];

describe("Securely Governed Runtime execution plan", () => {
  it("validates a well-formed plan and refuses each missing guarantee", () => {
    assert.equal(validateGovernedExecutionPlan(plan()).allowed, true);
    assert.deepEqual(codes(validateGovernedExecutionPlan(plan({ auditRequired: false }))), ["Galerina_RUNTIME_PLAN_AUDIT_REQUIRED"]);
    assert.deepEqual(codes(validateGovernedExecutionPlan(plan({ budget: undefined }))), ["Galerina_RUNTIME_PLAN_BUDGET_REQUIRED"]);
    assert.deepEqual(codes(validateGovernedExecutionPlan(plan({ budget: { ...DEFAULT_RUNTIME_RESOURCE_BUDGET, cpuMs: 0 } }))), ["Galerina_RUNTIME_BUDGET_INVALID"]);
    assert.deepEqual(codes(validateGovernedExecutionPlan(plan({ zone: "untrusted" }))), ["Galerina_RUNTIME_PLAN_BOUNDARY_REQUIRED"]);
    assert.equal(validateGovernedExecutionPlan(plan({ zone: "untrusted", boundary: "plugin.sandbox" })).allowed, true);
    assert.deepEqual(codes(validateGovernedExecutionPlan(plan({ capabilities: ["a", "a"] }))), ["Galerina_RUNTIME_PLAN_CAPABILITIES"]);
    assert.deepEqual(codes(validateGovernedExecutionPlan(plan({ schema: "v0" }))), ["Galerina_RUNTIME_PLAN_SCHEMA"]);
    assert.deepEqual(codes(validateGovernedExecutionPlan(null)), ["Galerina_RUNTIME_PLAN_MALFORMED"]);
  });

  it("AI actors need a lease and never run in the trusted core", () => {
    assert.deepEqual(codes(validateGovernedExecutionPlan(plan({ actor: { kind: "ai", id: "agent-1" } }))), ["Galerina_RUNTIME_PLAN_AI_LEASE_REQUIRED"]);
    assert.equal(validateGovernedExecutionPlan(plan({ actor: { kind: "ai", id: "agent-1", leaseId: "lease-9" } })).allowed, true);
    assert.deepEqual(codes(validateGovernedExecutionPlan(plan({ actor: { kind: "ai", id: "agent-1", leaseId: "lease-9" }, zone: "trusted-core" }))), ["Galerina_RUNTIME_PLAN_AI_TRUSTED_CORE"]);
  });

  it("runs the six stages in order and locks exactly the requested capabilities", () => {
    const end = run(plan(), happy);
    assert.equal(end.complete, true);
    assert.equal(end.failed, false);
    assert.equal(end.stage, "audit-proof");
    assert.equal(end.auditProofId, "proof-1");
    assert.deepEqual([...end.lockedCapabilities], ["db.orders.write", "audit.append"]);
    assert.ok(Object.isFrozen(end) && Object.isFrozen(end.lockedCapabilities));
  });

  it("any out-of-order step, failed verification or ungranted capability is terminal", () => {
    const skip = run(plan(), [{ type: "plan" }, { type: "execute" }]);
    assert.equal(skip.failed, true);
    assert.ok(codes(skip).includes("Galerina_RUNTIME_PLAN_STAGE_ORDER"));
    const badVerify = run(plan(), [{ type: "plan" }, { type: "verify", verdict: { allowed: true, diagnostics: [{ code: "x" }] } }]);
    assert.ok(codes(badVerify).includes("Galerina_RUNTIME_PLAN_VERIFICATION_FAILED"));
    const ungranted = run(plan(), [{ type: "plan" }, { type: "verify", verdict: clean }, { type: "lock-capabilities", granted: ["db.orders.write"] }]);
    assert.ok(codes(ungranted).includes("Galerina_RUNTIME_PLAN_CAPABILITY_NOT_GRANTED"));
    assert.deepEqual([...ungranted.lockedCapabilities], []);
    const after = advanceGovernedExecution(plan(), ungranted, { type: "execute" });
    assert.equal(after.failed, true);
    assert.ok(codes(after).includes("Galerina_RUNTIME_PLAN_STATE"));
    const done = run(plan(), happy);
    assert.ok(codes(advanceGovernedExecution(plan(), done, { type: "plan" })).includes("Galerina_RUNTIME_PLAN_STATE"));
  });

  it("an invalid plan starts failed, and a swapped or mutated plan cannot advance", () => {
    assert.equal(startGovernedExecution(plan({ auditRequired: false })).failed, true);
    const s = startGovernedExecution(plan());
    assert.ok(codes(advanceGovernedExecution(plan({ planId: "other.plan" }), s, { type: "plan" })).includes("Galerina_RUNTIME_PLAN_CHANGED"));
    assert.ok(codes(advanceGovernedExecution(plan({ auditRequired: false }), s, { type: "plan" })).includes("Galerina_RUNTIME_PLAN_CHANGED"));
  });
});

const H = (c) => c.repeat(64);
const ctx = (over = {}) => ({ policyHash: H("a"), packageGraphHash: H("b"), outputContractHash: H("c"), modelVersion: "none", hardwareProfile: "x86-64-v3", trustState: "trusted", ...over });
const sig = (over = {}) => createFastPathSignature({ signatureId: "fp-1", workloadKey: "orders.create", leaseId: "lease-1", context: ctx(), issuedAtMs: 1_000, leaseMs: 60_000, ...over });

describe("verified fast path signature and invalidation", () => {
  it("creates a frozen context-tagged signature with a capped lease", () => {
    const { signature, diagnostics } = sig();
    assert.deepEqual(diagnostics, []);
    assert.equal(signature.schema, FAST_PATH_SIGNATURE_SCHEMA);
    assert.equal(signature.expiresAtMs, 61_000);
    assert.ok(Object.isFrozen(signature) && Object.isFrozen(signature.context));
    assert.deepEqual(sig({ leaseMs: MAX_FAST_PATH_LEASE_MS + 1 }).diagnostics.map((d) => d.code), ["Galerina_RUNTIME_FASTPATH_LEASE"]);
    assert.deepEqual(sig({ context: ctx({ policyHash: "abc" }) }).diagnostics.map((d) => d.code), ["Galerina_RUNTIME_FASTPATH_CONTEXT"]);
    assert.equal(sig({ leaseMs: 0 }).signature, undefined);
  });

  it("is usable only for the same workload and context inside the lease, and never skips the governed checks", () => {
    const { signature } = sig();
    const ok = checkFastPath(signature, { workloadKey: "orders.create", context: ctx(), nowMs: 2_000 });
    assert.equal(ok.use, true);
    assert.deepEqual([...ok.stillRequired], ["policy", "capability-limits", "effect-boundaries", "data-contracts", "audit"]);
    assert.equal(ok.stillRequired, FAST_PATH_NEVER_BYPASSES);
  });

  it("each context change, expiry and revocation invalidates and every reason is reported", () => {
    const { signature } = sig();
    const at = (over, nowMs = 2_000, extra = {}) => checkFastPath(signature, { workloadKey: "orders.create", context: ctx(over), nowMs, ...extra });
    assert.deepEqual([...at({ policyHash: H("d") }).invalidations], ["POLICY_CHANGED"]);
    assert.deepEqual([...at({ packageGraphHash: H("d") }).invalidations], ["PACKAGES_CHANGED"]);
    assert.deepEqual([...at({ outputContractHash: H("d") }).invalidations], ["OUTPUT_CONTRACT_CHANGED"]);
    assert.deepEqual([...at({ modelVersion: "m2" }).invalidations], ["MODEL_CHANGED"]);
    assert.deepEqual([...at({ hardwareProfile: "arm64" }).invalidations], ["HARDWARE_CHANGED"]);
    assert.deepEqual([...at({ trustState: "degraded" }).invalidations], ["TRUST_STATE_CHANGED"]);
    assert.deepEqual([...at({}, 61_000).invalidations], ["EXPIRED"]);
    assert.deepEqual([...at({}, 999).invalidations], ["NOT_YET_VALID"]);
    assert.deepEqual([...at({}, 2_000, { revokedLeaseIds: ["lease-1"] }).invalidations], ["REVOKED"]);
    assert.deepEqual([...at({}, 2_000, { revokedSignatureIds: ["fp-1"] }).invalidations], ["REVOKED"]);
    const many = at({ policyHash: H("d"), trustState: "degraded" }, 70_000);
    assert.equal(many.use, false);
    assert.deepEqual([...many.invalidations].sort(), ["EXPIRED", "POLICY_CHANGED", "TRUST_STATE_CHANGED"]);
    assert.deepEqual([...checkFastPath(signature, { workloadKey: "other", context: ctx(), nowMs: 2_000 }).invalidations], ["WORKLOAD_MISMATCH"]);
  });

  it("hand-built, over-long or malformed signatures are refused", () => {
    const { signature } = sig();
    const cur = { workloadKey: "orders.create", context: ctx(), nowMs: 2_000 };
    assert.ok(checkFastPath({ ...signature, expiresAtMs: signature.issuedAtMs + MAX_FAST_PATH_LEASE_MS + 1 }, cur).invalidations.includes("LEASE_TOO_LONG"));
    assert.deepEqual([...checkFastPath({ ...signature, schema: "v0" }, cur).invalidations], ["MALFORMED"]);
    assert.deepEqual([...checkFastPath({ ...signature, expiresAtMs: signature.issuedAtMs }, cur).invalidations], ["MALFORMED"]);
    assert.deepEqual([...checkFastPath(signature, { ...cur, nowMs: -1 }).invalidations], ["MALFORMED"]);
    assert.deepEqual([...checkFastPath(signature, { ...cur, context: ctx({ trustState: "" }) }).invalidations], ["MALFORMED"]);
  });
});

const aiPlan = (over = {}) => ({
  schema: AI_COMPUTE_PLAN_SCHEMA,
  planId: "summarise.ticket",
  inputType: "TicketText",
  outputType: "TicketSummary",
  modelClass: "small-text",
  dataSensitivity: "confidential",
  precision: "int8",
  latencyTargetMs: 500,
  computeTarget: "cpu",
  memoryBytes: 512 * 1024 * 1024,
  allowedTools: ["kb.search"],
  audit: { required: true, recordInputs: false, recordOutputs: true },
  ...over,
});
const aiPolicy = {
  allowedModelClasses: ["small-text"],
  allowedTargets: ["cpu", "gpu"],
  maxSensitivityByTarget: { cpu: "confidential", gpu: "internal" },
  allowedTools: ["kb.search"],
  maxMemoryBytes: 1024 * 1024 * 1024,
};

describe("AI compute plan runtime hooks", () => {
  it("the default policy admits nothing", () => {
    const v = admitAiComputePlan(aiPlan());
    assert.equal(v.allowed, false);
    assert.ok(Object.isFrozen(DEFAULT_AI_COMPUTE_POLICY));
    for (const code of ["Galerina_RUNTIME_AI_PLAN_MODEL_CLASS", "Galerina_RUNTIME_AI_PLAN_TARGET", "Galerina_RUNTIME_AI_PLAN_SENSITIVITY_TARGET", "Galerina_RUNTIME_AI_PLAN_MEMORY", "Galerina_RUNTIME_AI_PLAN_TOOL_NOT_ALLOWED"]) {
      assert.ok(codes(v).includes(code), code);
    }
  });

  it("admits a plan that fits the policy and refuses each overreach", () => {
    assert.equal(admitAiComputePlan(aiPlan(), aiPolicy).allowed, true);
    assert.deepEqual(codes(admitAiComputePlan(aiPlan({ computeTarget: "gpu" }), aiPolicy)), ["Galerina_RUNTIME_AI_PLAN_SENSITIVITY_TARGET"]);
    assert.deepEqual(codes(admitAiComputePlan(aiPlan({ computeTarget: "npu" }), aiPolicy)), ["Galerina_RUNTIME_AI_PLAN_SENSITIVITY_TARGET", "Galerina_RUNTIME_AI_PLAN_TARGET"]);
    assert.deepEqual(codes(admitAiComputePlan(aiPlan({ dataSensitivity: "restricted" }), aiPolicy)), ["Galerina_RUNTIME_AI_PLAN_SENSITIVITY_TARGET"]);
    assert.deepEqual(codes(admitAiComputePlan(aiPlan({ allowedTools: ["kb.search", "shell.exec"] }), aiPolicy)), ["Galerina_RUNTIME_AI_PLAN_TOOL_NOT_ALLOWED"]);
    assert.deepEqual(codes(admitAiComputePlan(aiPlan({ memoryBytes: 2 * 1024 * 1024 * 1024 }), aiPolicy)), ["Galerina_RUNTIME_AI_PLAN_MEMORY"]);
    assert.deepEqual(codes(admitAiComputePlan(aiPlan({ audit: { required: false, recordInputs: false, recordOutputs: false } }), aiPolicy)), ["Galerina_RUNTIME_AI_PLAN_AUDIT"]);
    assert.deepEqual(codes(admitAiComputePlan(aiPlan({ outputType: "ticket summary" }), aiPolicy)), ["Galerina_RUNTIME_AI_PLAN_TYPE"]);
    assert.deepEqual(codes(admitAiComputePlan(aiPlan({ precision: "fp8" }), aiPolicy)), ["Galerina_RUNTIME_AI_PLAN_PRECISION"]);
    assert.deepEqual(codes(admitAiComputePlan(aiPlan({ computeTarget: "toString" }), { ...aiPolicy, maxSensitivityByTarget: { cpu: "confidential" } })), ["Galerina_RUNTIME_AI_PLAN_SENSITIVITY_TARGET", "Galerina_RUNTIME_AI_PLAN_TARGET"]);
  });

  it("output hook: only a literal true from the caller's validator passes; throws refuse; output is never echoed", () => {
    const secret = "do-not-echo-marker-7f3a";
    assert.equal(checkAiComputeOutput(aiPlan(), { summary: "ok" }, (v) => typeof v?.summary === "string").allowed, true);
    const truthy = checkAiComputeOutput(aiPlan(), secret, () => 1);
    assert.deepEqual(codes(truthy), ["Galerina_RUNTIME_AI_OUTPUT_CONTRACT"]);
    assert.ok(!JSON.stringify(truthy).includes(secret));
    assert.deepEqual(codes(checkAiComputeOutput(aiPlan(), secret, () => { throw new Error(secret); })), ["Galerina_RUNTIME_AI_OUTPUT_CONTRACT"]);
    assert.deepEqual(codes(checkAiComputeOutput(aiPlan(), secret, undefined)), ["Galerina_RUNTIME_AI_OUTPUT_VALIDATOR"]);
  });
});
