// RD-0855 admission-time alternative plans (compute planning).
//
// Pure fail-closed planner: emits proposal-only alternative plans. A failed
// attempt keeps its typed refusal. No new fallback mechanism. SLIDE admission
// and VOK authority are not granted here. 8/16-trit profiles stay unregistered.
// Binary same-semantics step 3 may be proposed after authenticated K3
// unprocessable, but is never executable.

export const RD0855_PLAN_SCHEMA = "galerina.compute.rd0855-alternative-plan.v1" as const;

export const ADMITTED_TRIT_WIDTHS_V1: readonly number[] = Object.freeze([1, 32, 64, 256]);

export type FallbackTier = "requested-width" | "k3-trit" | "binary-same-semantics";

export const FALLBACK_TIER_ORDER: readonly FallbackTier[] = Object.freeze([
  "requested-width",
  "k3-trit",
  "binary-same-semantics",
]);

export type PermittedPlanReason = "unavailable" | "incompatible";

export const PERMITTED_PLAN_REASONS: readonly PermittedPlanReason[] = Object.freeze([
  "unavailable",
  "incompatible",
]);

export type PlanSkipClass =
  | PermittedPlanReason
  | "deny"
  | "revoked"
  | "invalid_evidence"
  | "stale_evidence"
  | "unknown_outcome"
  | "partial_effect"
  | "cleanup_failure"
  | "effect_occurred"
  | "degraded_semantics"
  | "different_two_valued_algorithm"
  | "task_policy_substitution"
  | "unregistered_width"
  | "binary_step_unresolved"
  | "binary_while_k3_runnable"
  | "budget_exhausted"
  | "deadline_exceeded"
  | "resource_exhausted"
  | "cyclic_chain"
  | "skip_class_required";

export const TERMINAL_PLAN_SKIP_CLASSES: readonly PlanSkipClass[] = Object.freeze([
  "deny",
  "revoked",
  "invalid_evidence",
  "stale_evidence",
  "unknown_outcome",
  "partial_effect",
  "cleanup_failure",
  "effect_occurred",
  "degraded_semantics",
  "different_two_valued_algorithm",
  "task_policy_substitution",
]);

export const ELIGIBLE_PLAN_SKIP_CLASSES: readonly PlanSkipClass[] = Object.freeze([
  "unavailable",
  "incompatible",
  "unregistered_width",
]);

export const TASK_POLICY_ISSUER = "OWNER-REVISIT" as const;
export const COORDINATOR_PACKAGE = "OWNER-REVISIT" as const;
export const ALTERNATIVE_ATTEMPT_BUDGET_OWNER = "OWNER-REVISIT" as const;

export interface ComputeReplanDiagnostic {
  readonly code: string;
  readonly severity: "error";
  readonly message: string;
  readonly path: string;
}

const refuse = (code: string, message: string, path: string): ComputeReplanDiagnostic =>
  Object.freeze({ code, severity: "error" as const, message, path });

const isPositiveInt = (value: number): boolean => Number.isSafeInteger(value) && value > 0;
const isNonNegativeInt = (value: number): boolean => Number.isSafeInteger(value) && value >= 0;

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const isFallbackTier = (value: unknown): value is FallbackTier =>
  value === "requested-width" || value === "k3-trit" || value === "binary-same-semantics";

const PLAN_SKIP_CLASSES: readonly PlanSkipClass[] = Object.freeze([
  "unavailable",
  "incompatible",
  "deny",
  "revoked",
  "invalid_evidence",
  "stale_evidence",
  "unknown_outcome",
  "partial_effect",
  "cleanup_failure",
  "effect_occurred",
  "degraded_semantics",
  "different_two_valued_algorithm",
  "task_policy_substitution",
  "unregistered_width",
  "binary_step_unresolved",
  "binary_while_k3_runnable",
  "budget_exhausted",
  "deadline_exceeded",
  "resource_exhausted",
  "cyclic_chain",
  "skip_class_required",
]);

const isPlanSkipClass = (value: unknown): value is PlanSkipClass =>
  typeof value === "string" && (PLAN_SKIP_CLASSES as readonly string[]).includes(value);

export interface TaskAttemptBudget {
  readonly maxAttempts: number;
  readonly deadlineMs: number;
  readonly cpuMs: number;
  readonly memoryBytes: number;
  readonly acceleratorMs: number;
}

export const DEFAULT_TASK_ATTEMPT_BUDGET: TaskAttemptBudget = Object.freeze({
  maxAttempts: 2,
  deadlineMs: 10_000,
  cpuMs: 5_000,
  memoryBytes: 256 * 1024 * 1024,
  acceleratorMs: 0,
});

export interface TaskAttemptUsage {
  readonly attemptsAlready: number;
  readonly elapsedMs: number;
  readonly cpuMs: number;
  readonly memoryBytes: number;
  readonly acceleratorMs: number;
}

export const DEFAULT_TASK_ATTEMPT_USAGE: TaskAttemptUsage = Object.freeze({
  attemptsAlready: 0,
  elapsedMs: 0,
  cpuMs: 0,
  memoryBytes: 0,
  acceleratorMs: 0,
});

export type BinarySemantics = "same" | "degraded" | "different-two-valued";

export interface AlternativePlanRequest {
  readonly taskId: string;
  readonly admittedTaskPolicyId: string;
  readonly proposedTaskPolicyId: string;
  readonly refusedAttemptId: string;
  readonly proposedPlanId: string;
  readonly priorAttemptIds: readonly string[];
  readonly requestedTritWidth: number;
  readonly requestedTier: FallbackTier;
  readonly skipClass: PlanSkipClass;
  readonly effectOccurred: boolean;
  readonly k3TritRunnable: boolean;
  readonly k3TritUnprocessable: boolean;
  readonly binarySemantics: BinarySemantics;
  readonly proposedTier: FallbackTier;
  readonly proposedTritWidth: number;
  readonly budget: TaskAttemptBudget;
  readonly usage: TaskAttemptUsage;
}

export interface AlternativePlanDecision {
  readonly schema: typeof RD0855_PLAN_SCHEMA;
  readonly status: "PROPOSED" | "REFUSED";
  readonly proposedTier: FallbackTier | "";
  readonly proposedPlanId: string;
  readonly linkedAttemptId: string;
  readonly keptRefusal: string;
  readonly executable: false;
  readonly authorityReleased: false;
  readonly slideAdmission: "not-evaluated";
  readonly vokDecision: "not-evaluated";
  readonly taskPolicyIssuer: typeof TASK_POLICY_ISSUER;
  readonly coordinatorPackage: typeof COORDINATOR_PACKAGE;
  readonly budgetOwner: typeof ALTERNATIVE_ATTEMPT_BUDGET_OWNER;
  readonly diagnostics: readonly ComputeReplanDiagnostic[];
}

const base = {
  schema: RD0855_PLAN_SCHEMA,
  executable: false as const,
  authorityReleased: false as const,
  slideAdmission: "not-evaluated" as const,
  vokDecision: "not-evaluated" as const,
  taskPolicyIssuer: TASK_POLICY_ISSUER,
  coordinatorPackage: COORDINATOR_PACKAGE,
  budgetOwner: ALTERNATIVE_ATTEMPT_BUDGET_OWNER,
};

function decisionRefuse(
  linkedAttemptId: string,
  proposedPlanId: string,
  keptRefusal: string,
  diagnostics: readonly ComputeReplanDiagnostic[],
): AlternativePlanDecision {
  return Object.freeze({
    ...base,
    status: "REFUSED" as const,
    proposedTier: "" as const,
    proposedPlanId,
    linkedAttemptId,
    keptRefusal,
    diagnostics: Object.freeze([...diagnostics]),
  });
}

function decisionPropose(
  proposedTier: FallbackTier,
  proposedPlanId: string,
  linkedAttemptId: string,
): AlternativePlanDecision {
  return Object.freeze({
    ...base,
    status: "PROPOSED" as const,
    proposedTier,
    proposedPlanId,
    linkedAttemptId,
    keptRefusal: "",
    diagnostics: Object.freeze([] as ComputeReplanDiagnostic[]),
  });
}

export function validateTaskAttemptBudget(budget: TaskAttemptBudget): readonly ComputeReplanDiagnostic[] {
  const d: ComputeReplanDiagnostic[] = [];
  if (!isPositiveInt(budget.maxAttempts)) {
    d.push(refuse("Galerina_COMPUTE_REPLAN_BUDGET_INVALID", "Attempt budget maxAttempts must be a positive safe integer.", "maxAttempts"));
  }
  if (!isPositiveInt(budget.deadlineMs)) {
    d.push(refuse("Galerina_COMPUTE_REPLAN_DEADLINE_INVALID", "Attempt budget deadlineMs must be a positive safe integer.", "deadlineMs"));
  }
  if (!isPositiveInt(budget.cpuMs)) {
    d.push(refuse("Galerina_COMPUTE_REPLAN_CPU_BUDGET_INVALID", "Attempt budget cpuMs must be a positive safe integer.", "cpuMs"));
  }
  if (!isPositiveInt(budget.memoryBytes)) {
    d.push(refuse("Galerina_COMPUTE_REPLAN_MEMORY_BUDGET_INVALID", "Attempt budget memoryBytes must be a positive safe integer.", "memoryBytes"));
  }
  if (!isNonNegativeInt(budget.acceleratorMs)) {
    d.push(refuse("Galerina_COMPUTE_REPLAN_ACCELERATOR_BUDGET_INVALID", "Attempt budget acceleratorMs must be a non-negative safe integer.", "acceleratorMs"));
  }
  return Object.freeze(d);
}

export function classifyPlanSkip(request: AlternativePlanRequest): PlanSkipClass {
  if (request.effectOccurred) return "effect_occurred";
  if (request.proposedTaskPolicyId !== request.admittedTaskPolicyId) return "task_policy_substitution";
  if (!isPlanSkipClass(request.skipClass)) return "skip_class_required";
  return request.skipClass;
}

export function proposeAlternativePlan(request: AlternativePlanRequest): AlternativePlanDecision {
  const linked = isNonEmptyString(request.refusedAttemptId) ? request.refusedAttemptId : "";
  const planId = isNonEmptyString(request.proposedPlanId) ? request.proposedPlanId : "";

  if (!isNonEmptyString(request.taskId)) {
    return decisionRefuse(linked, planId, "task-id", [
      refuse("Galerina_COMPUTE_REPLAN_TASK_ID", "taskId must be a non-empty string.", "taskId"),
    ]);
  }
  if (!isNonEmptyString(request.admittedTaskPolicyId) || !isNonEmptyString(request.proposedTaskPolicyId)) {
    return decisionRefuse(linked, planId, "task-policy", [
      refuse("Galerina_COMPUTE_REPLAN_TASK_POLICY", "Admitted and proposed task-policy ids must be non-empty strings.", "admittedTaskPolicyId"),
    ]);
  }
  if (request.proposedTaskPolicyId !== request.admittedTaskPolicyId) {
    return decisionRefuse(linked, planId, "task_policy_substitution", [
      refuse("Galerina_COMPUTE_REPLAN_POLICY_SUBSTITUTION", "An alternative plan must reuse the unchanged admitted task policy.", "proposedTaskPolicyId"),
    ]);
  }
  if (!isNonEmptyString(request.refusedAttemptId) || !isNonEmptyString(request.proposedPlanId)) {
    return decisionRefuse(linked, planId, "plan-identity", [
      refuse("Galerina_COMPUTE_REPLAN_PLAN_IDENTITY", "refusedAttemptId and proposedPlanId must be non-empty strings.", "proposedPlanId"),
    ]);
  }
  if (!Array.isArray(request.priorAttemptIds) || request.priorAttemptIds.some((id) => !isNonEmptyString(id))) {
    return decisionRefuse(linked, planId, "prior-attempts", [
      refuse("Galerina_COMPUTE_REPLAN_PRIOR_ATTEMPTS", "priorAttemptIds must be a list of non-empty strings.", "priorAttemptIds"),
    ]);
  }
  if (!isFallbackTier(request.requestedTier) || !isFallbackTier(request.proposedTier)) {
    return decisionRefuse(linked, planId, "tier", [
      refuse("Galerina_COMPUTE_REPLAN_TIER", "Fallback tier must be requested-width, k3-trit or binary-same-semantics.", "proposedTier"),
    ]);
  }
  if (request.binarySemantics !== "same" && request.binarySemantics !== "degraded" && request.binarySemantics !== "different-two-valued") {
    return decisionRefuse(linked, planId, "binary-semantics", [
      refuse("Galerina_COMPUTE_REPLAN_BINARY_SEMANTICS", "binarySemantics must be same, degraded or different-two-valued.", "binarySemantics"),
    ]);
  }
  if (typeof request.effectOccurred !== "boolean" || typeof request.k3TritRunnable !== "boolean" || typeof request.k3TritUnprocessable !== "boolean") {
    return decisionRefuse(linked, planId, "skip_class_required", [
      refuse("Galerina_COMPUTE_REPLAN_FLAGS", "effectOccurred, k3TritRunnable and k3TritUnprocessable must be booleans.", "effectOccurred"),
    ]);
  }
  if (request.k3TritRunnable && request.k3TritUnprocessable) {
    return decisionRefuse(linked, planId, "skip_class_required", [
      refuse("Galerina_COMPUTE_REPLAN_K3_STATE", "K3 Trit cannot be both runnable and unprocessable.", "k3TritRunnable"),
    ]);
  }

  const budgetDiags = validateTaskAttemptBudget(request.budget);
  if (budgetDiags.length > 0) {
    return decisionRefuse(linked, planId, "budget", budgetDiags);
  }
  const usage = request.usage;
  if (
    !isNonNegativeInt(usage.attemptsAlready)
    || !isNonNegativeInt(usage.elapsedMs)
    || !isNonNegativeInt(usage.cpuMs)
    || !isNonNegativeInt(usage.memoryBytes)
    || !isNonNegativeInt(usage.acceleratorMs)
  ) {
    return decisionRefuse(linked, planId, "usage", [
      refuse("Galerina_COMPUTE_REPLAN_USAGE_INVALID", "Attempt usage must use non-negative safe integers.", "usage"),
    ]);
  }
  if (usage.attemptsAlready >= request.budget.maxAttempts) {
    return decisionRefuse(linked, planId, "budget_exhausted", [
      refuse("Galerina_COMPUTE_REPLAN_BUDGET_EXHAUSTED", "No remaining alternative attempts for this task.", "maxAttempts"),
    ]);
  }
  if (usage.elapsedMs >= request.budget.deadlineMs) {
    return decisionRefuse(linked, planId, "deadline_exceeded", [
      refuse("Galerina_COMPUTE_REPLAN_DEADLINE", "The shared task deadline has already elapsed.", "deadlineMs"),
    ]);
  }
  if (usage.cpuMs > request.budget.cpuMs || usage.memoryBytes > request.budget.memoryBytes || usage.acceleratorMs > request.budget.acceleratorMs) {
    return decisionRefuse(linked, planId, "resource_exhausted", [
      refuse("Galerina_COMPUTE_REPLAN_RESOURCE_EXHAUSTED", "Shared CPU, memory or accelerator budget is exhausted.", "usage"),
    ]);
  }
  if (request.proposedPlanId === request.refusedAttemptId || request.priorAttemptIds.includes(request.proposedPlanId)) {
    return decisionRefuse(linked, planId, "cyclic_chain", [
      refuse("Galerina_COMPUTE_REPLAN_CYCLIC", "A cyclic alternative-plan chain refuses.", "proposedPlanId"),
    ]);
  }

  if (!isPositiveInt(request.requestedTritWidth)) {
    return decisionRefuse(linked, planId, "unregistered_width", [
      refuse("Galerina_COMPUTE_REPLAN_WIDTH_INVALID", "Requested trit-width must be a positive safe integer.", "requestedTritWidth"),
    ]);
  }
  if (!isPositiveInt(request.proposedTritWidth)) {
    return decisionRefuse(linked, planId, "unregistered_width", [
      refuse("Galerina_COMPUTE_REPLAN_WIDTH_INVALID", "Proposed trit-width must be a positive safe integer.", "proposedTritWidth"),
    ]);
  }
  if (request.proposedTier !== "binary-same-semantics" && !ADMITTED_TRIT_WIDTHS_V1.includes(request.proposedTritWidth)) {
    return decisionRefuse(linked, planId, "unregistered_width", [
      refuse("Galerina_COMPUTE_REPLAN_WIDTH_UNREGISTERED", "Proposed trit-width is not an admitted v1 execution profile.", "proposedTritWidth"),
    ]);
  }

  const skip = classifyPlanSkip(request);
  if ((TERMINAL_PLAN_SKIP_CLASSES as readonly string[]).includes(skip)) {
    return decisionRefuse(linked, planId, skip, [
      refuse("Galerina_COMPUTE_REPLAN_TERMINAL", "Terminal skip keeps the original typed refusal and never becomes retry permission.", "skipClass"),
    ]);
  }
  if (!(ELIGIBLE_PLAN_SKIP_CLASSES as readonly string[]).includes(skip)) {
    return decisionRefuse(linked, planId, skip, [
      refuse("Galerina_COMPUTE_REPLAN_NOT_ELIGIBLE", "Only authenticated pre-effect unavailability, incompatibility or an unregistered requested width may propose an alternative.", "skipClass"),
    ]);
  }

  if (request.proposedTier === "requested-width") {
    return decisionRefuse(linked, planId, "tier", [
      refuse("Galerina_COMPUTE_REPLAN_NOT_ALTERNATIVE", "The requested-width tier is the original attempt, not an alternative plan.", "proposedTier"),
    ]);
  }

  if (request.proposedTier === "k3-trit") {
    if (request.requestedTier !== "requested-width") {
      return decisionRefuse(linked, planId, "tier", [
        refuse("Galerina_COMPUTE_REPLAN_TIER_ORDER", "K3 Trit is the second tier and follows only a requested-width attempt.", "proposedTier"),
      ]);
    }
    if (!request.k3TritRunnable || request.k3TritUnprocessable) {
      return decisionRefuse(linked, planId, "skip_class_required", [
        refuse("Galerina_COMPUTE_REPLAN_K3_NOT_RUNNABLE", "A K3 Trit alternative is proposed only when that logic can run.", "k3TritRunnable"),
      ]);
    }
    if (request.proposedTritWidth !== 1) {
      return decisionRefuse(linked, planId, "unregistered_width", [
        refuse("Galerina_COMPUTE_REPLAN_K3_WIDTH", "Standard Galerina Trit (K3) uses admitted trit-width 1.", "proposedTritWidth"),
      ]);
    }
    return decisionPropose("k3-trit", request.proposedPlanId, request.refusedAttemptId);
  }

  // binary-same-semantics
  if (request.k3TritRunnable) {
    return decisionRefuse(linked, planId, "binary_while_k3_runnable", [
      refuse("Galerina_COMPUTE_REPLAN_BINARY_WHILE_K3_RUNNABLE", "Binary is proposed only after K3 Trit is authenticated as unprocessable.", "proposedTier"),
    ]);
  }
  if (!request.k3TritUnprocessable) {
    return decisionRefuse(linked, planId, "skip_class_required", [
      refuse("Galerina_COMPUTE_REPLAN_K3_STILL_PROCESSABLE", "Binary is proposed only after K3 Trit is authenticated as unprocessable.", "k3TritUnprocessable"),
    ]);
  }
  if (request.binarySemantics === "degraded") {
    return decisionRefuse(linked, planId, "degraded_semantics", [
      refuse("Galerina_COMPUTE_REPLAN_DEGRADED", "Degraded semantics refuse; an alternative must implement the same task semantics.", "binarySemantics"),
    ]);
  }
  if (request.binarySemantics === "different-two-valued") {
    return decisionRefuse(linked, planId, "different_two_valued_algorithm", [
      refuse("Galerina_COMPUTE_REPLAN_DIFFERENT_ALGORITHM", "A different two-valued algorithm refuses; K3 still decides permission.", "binarySemantics"),
    ]);
  }
  if (request.requestedTier !== "k3-trit") {
    return decisionRefuse(linked, planId, "tier", [
      refuse("Galerina_COMPUTE_REPLAN_TIER_ORDER", "Binary same-semantics is the third tier and follows only an unprocessable K3 Trit attempt.", "proposedTier"),
    ]);
  }
  return decisionPropose("binary-same-semantics", request.proposedPlanId, request.refusedAttemptId);
}
