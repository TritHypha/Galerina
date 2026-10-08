import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as C from "../dist/rd0855-alternative-plan.js";

const codes = (d) => d.diagnostics.map((x) => x.code).sort();

const request = (over = {}) => ({
  taskId: "task-1",
  admittedTaskPolicyId: "policy-1",
  proposedTaskPolicyId: "policy-1",
  refusedAttemptId: "attempt-requested",
  proposedPlanId: "attempt-k3",
  priorAttemptIds: [],
  requestedTritWidth: 32,
  requestedTier: "requested-width",
  skipClass: "unavailable",
  effectOccurred: false,
  k3TritRunnable: true,
  k3TritUnprocessable: false,
  binarySemantics: "same",
  proposedTier: "k3-trit",
  proposedTritWidth: 1,
  budget: { ...C.DEFAULT_TASK_ATTEMPT_BUDGET },
  usage: { ...C.DEFAULT_TASK_ATTEMPT_USAGE },
  ...over,
});

describe("RD-0855 alternative-plan planning (proposal only)", () => {
  it("emits a tier-2 K3 Trit proposal when requested width is authenticated-unavailable before any effect", () => {
    const d = C.proposeAlternativePlan(request());
    assert.equal(d.status, "PROPOSED");
    assert.equal(d.proposedTier, "k3-trit");
    assert.equal(d.proposedPlanId, "attempt-k3");
    assert.equal(d.linkedAttemptId, "attempt-requested");
    assert.equal(d.executable, false);
    assert.equal(d.authorityReleased, false);
    assert.equal(d.slideAdmission, "not-evaluated");
    assert.equal(d.vokDecision, "not-evaluated");
    assert.equal(d.schema, C.RD0855_PLAN_SCHEMA);
    assert.equal(d.taskPolicyIssuer, "OWNER-REVISIT");
    assert.equal(d.coordinatorPackage, "OWNER-REVISIT");
    assert.equal(d.budgetOwner, "OWNER-REVISIT");
    assert.equal(d.keptRefusal, "");
    assert.deepEqual(d.diagnostics, []);
  });

  it("proposes tier-3 binary only after K3 Trit is authenticated unprocessable", () => {
    const d = C.proposeAlternativePlan(request({
      refusedAttemptId: "attempt-k3",
      proposedPlanId: "attempt-binary",
      priorAttemptIds: ["attempt-requested"],
      requestedTier: "k3-trit",
      skipClass: "incompatible",
      k3TritRunnable: false,
      k3TritUnprocessable: true,
      proposedTier: "binary-same-semantics",
      proposedTritWidth: 1,
    }));
    assert.equal(d.status, "PROPOSED");
    assert.equal(d.proposedTier, "binary-same-semantics");
    assert.equal(d.proposedPlanId, "attempt-binary");
    assert.equal(d.linkedAttemptId, "attempt-k3");
    assert.equal(d.executable, false);
    assert.equal(d.authorityReleased, false);
  });

  it("refuses binary proposed while K3 Trit can run", () => {
    const d = C.proposeAlternativePlan(request({
      proposedPlanId: "attempt-binary",
      proposedTier: "binary-same-semantics",
      k3TritRunnable: true,
      k3TritUnprocessable: false,
    }));
    assert.equal(d.status, "REFUSED");
    assert.equal(d.keptRefusal, "binary_while_k3_runnable");
    assert.ok(codes(d).includes("Galerina_COMPUTE_REPLAN_BINARY_WHILE_K3_RUNNABLE"));
    assert.equal(d.proposedTier, "");
  });

  it("refuses a different two-valued algorithm or degraded semantics", () => {
    const different = C.proposeAlternativePlan(request({
      refusedAttemptId: "attempt-k3",
      proposedPlanId: "attempt-binary",
      priorAttemptIds: ["attempt-requested"],
      requestedTier: "k3-trit",
      skipClass: "unavailable",
      k3TritRunnable: false,
      k3TritUnprocessable: true,
      proposedTier: "binary-same-semantics",
      binarySemantics: "different-two-valued",
    }));
    assert.equal(different.status, "REFUSED");
    assert.equal(different.keptRefusal, "different_two_valued_algorithm");
    assert.ok(codes(different).includes("Galerina_COMPUTE_REPLAN_DIFFERENT_ALGORITHM"));

    const degraded = C.proposeAlternativePlan(request({
      refusedAttemptId: "attempt-k3",
      proposedPlanId: "attempt-binary",
      priorAttemptIds: ["attempt-requested"],
      requestedTier: "k3-trit",
      skipClass: "unavailable",
      k3TritRunnable: false,
      k3TritUnprocessable: true,
      proposedTier: "binary-same-semantics",
      binarySemantics: "degraded",
    }));
    assert.equal(degraded.status, "REFUSED");
    assert.equal(degraded.keptRefusal, "degraded_semantics");
    assert.ok(codes(degraded).includes("Galerina_COMPUTE_REPLAN_DEGRADED"));
  });

  it("keeps the original typed refusal for DENY, revoked, invalid or stale evidence, unknown, partial and cleanup", () => {
    const terminals = [
      "deny",
      "revoked",
      "invalid_evidence",
      "stale_evidence",
      "unknown_outcome",
      "partial_effect",
      "cleanup_failure",
    ];
    for (const skipClass of terminals) {
      const d = C.proposeAlternativePlan(request({ skipClass }));
      assert.equal(d.status, "REFUSED", skipClass);
      assert.equal(d.keptRefusal, skipClass, skipClass);
      assert.ok(codes(d).includes("Galerina_COMPUTE_REPLAN_TERMINAL"), skipClass);
      assert.equal(d.authorityReleased, false, skipClass);
    }
  });

  it("refuses post-effect retry and keeps the original refusal", () => {
    const d = C.proposeAlternativePlan(request({ effectOccurred: true, skipClass: "unavailable" }));
    assert.equal(d.status, "REFUSED");
    assert.equal(d.keptRefusal, "effect_occurred");
    assert.ok(codes(d).includes("Galerina_COMPUTE_REPLAN_TERMINAL"));
  });

  it("refuses task-policy substitution", () => {
    const d = C.proposeAlternativePlan(request({ proposedTaskPolicyId: "policy-other" }));
    assert.equal(d.status, "REFUSED");
    assert.equal(d.keptRefusal, "task_policy_substitution");
    assert.ok(codes(d).includes("Galerina_COMPUTE_REPLAN_POLICY_SUBSTITUTION"));
  });

  it("refuses exhausted attempt, deadline and resource budgets", () => {
    const attempts = C.proposeAlternativePlan(request({
      usage: { ...C.DEFAULT_TASK_ATTEMPT_USAGE, attemptsAlready: 2 },
    }));
    assert.equal(attempts.status, "REFUSED");
    assert.equal(attempts.keptRefusal, "budget_exhausted");
    assert.ok(codes(attempts).includes("Galerina_COMPUTE_REPLAN_BUDGET_EXHAUSTED"));

    const deadline = C.proposeAlternativePlan(request({
      usage: { ...C.DEFAULT_TASK_ATTEMPT_USAGE, elapsedMs: 10_000 },
    }));
    assert.equal(deadline.status, "REFUSED");
    assert.equal(deadline.keptRefusal, "deadline_exceeded");

    const cpu = C.proposeAlternativePlan(request({
      usage: { ...C.DEFAULT_TASK_ATTEMPT_USAGE, cpuMs: 5_001 },
    }));
    assert.equal(cpu.status, "REFUSED");
    assert.equal(cpu.keptRefusal, "resource_exhausted");
  });

  it("refuses a cyclic plan-identity chain", () => {
    const reuse = C.proposeAlternativePlan(request({
      proposedPlanId: "attempt-requested",
    }));
    assert.equal(reuse.status, "REFUSED");
    assert.equal(reuse.keptRefusal, "cyclic_chain");

    const prior = C.proposeAlternativePlan(request({
      proposedPlanId: "attempt-old",
      priorAttemptIds: ["attempt-old"],
    }));
    assert.equal(prior.status, "REFUSED");
    assert.equal(prior.keptRefusal, "cyclic_chain");
    assert.ok(codes(prior).includes("Galerina_COMPUTE_REPLAN_CYCLIC"));
  });

  it("records the three-tier order and refuses unregistered 8/16 proposed widths", () => {
    assert.deepEqual(C.FALLBACK_TIER_ORDER, ["requested-width", "k3-trit", "binary-same-semantics"]);
    assert.deepEqual(C.ADMITTED_TRIT_WIDTHS_V1, [1, 32, 64, 256]);
    assert.deepEqual([...C.PERMITTED_PLAN_REASONS], ["unavailable", "incompatible"]);
    for (const proposedTritWidth of [8, 16]) {
      const d = C.proposeAlternativePlan(request({ proposedTritWidth }));
      assert.equal(d.status, "REFUSED", String(proposedTritWidth));
      assert.ok(codes(d).includes("Galerina_COMPUTE_REPLAN_WIDTH_UNREGISTERED"), String(proposedTritWidth));
    }
  });

  it("may step down from an unregistered requested 8/16 width to K3 Trit width 1", () => {
    const d = C.proposeAlternativePlan(request({
      requestedTritWidth: 8,
      skipClass: "unregistered_width",
      proposedTier: "k3-trit",
      proposedTritWidth: 1,
    }));
    assert.equal(d.status, "PROPOSED");
    assert.equal(d.proposedTier, "k3-trit");
    assert.equal(d.executable, false);
  });

  it("refuses proposing the original requested-width tier as an alternative", () => {
    const d = C.proposeAlternativePlan(request({
      proposedTier: "requested-width",
      proposedTritWidth: 32,
    }));
    assert.equal(d.status, "REFUSED");
    assert.ok(codes(d).includes("Galerina_COMPUTE_REPLAN_NOT_ALTERNATIVE"));
  });

  it("default shared budget is fail-closed and owner remains OWNER-REVISIT", () => {
    assert.deepEqual(C.DEFAULT_TASK_ATTEMPT_BUDGET, {
      maxAttempts: 2,
      deadlineMs: 10_000,
      cpuMs: 5_000,
      memoryBytes: 256 * 1024 * 1024,
      acceleratorMs: 0,
    });
    assert.ok(Object.isFrozen(C.DEFAULT_TASK_ATTEMPT_BUDGET));
    assert.equal(C.TASK_POLICY_ISSUER, "OWNER-REVISIT");
    assert.equal(C.ALTERNATIVE_ATTEMPT_BUDGET_OWNER, "OWNER-REVISIT");
    assert.equal(C.validateTaskAttemptBudget(C.DEFAULT_TASK_ATTEMPT_BUDGET).length, 0);
    assert.ok(C.validateTaskAttemptBudget({ ...C.DEFAULT_TASK_ATTEMPT_BUDGET, maxAttempts: 0 }).some(
      (x) => x.code === "Galerina_COMPUTE_REPLAN_BUDGET_INVALID",
    ));
  });
});
