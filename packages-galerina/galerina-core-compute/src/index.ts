export type ComputeTarget =
  | "cpu"
  | "cpu.generic"
  | "low_bit_ai"
  | "ternary_ai"
  | "wasm"
  | "binary"
  | "vector"
  | "gpu"
  | "ai_accelerator"
  | "npu"
  | "optical_io"
  | "photonic";

export type ComputeWorkloadKind =
  | "general"
  | "vector"
  | "matrix"
  | "ai-inference"
  | "distributed-ai"
  | "tensor-transfer"
  | "io-bound";

export type ComputeDiagnosticSeverity = "warning" | "error";

export interface ComputeDiagnostic {
  readonly code: string;
  readonly severity: ComputeDiagnosticSeverity;
  readonly message: string;
  readonly path?: string;
}

export interface ComputeCapability {
  readonly target: ComputeTarget;
  readonly features: readonly string[];
  readonly available: boolean;
  readonly memoryBytes?: number;
}

export interface ComputeBudget {
  readonly memoryBytes?: number;
  readonly timeoutMs?: number;
  readonly parallelism?: number;
  readonly maxTokens?: number;
}

export interface ComputePlan {
  readonly name: string;
  readonly workload: ComputeWorkloadKind;
  readonly preferredTarget: ComputeTarget;
  readonly fallbackTargets: readonly ComputeTarget[];
  readonly budget?: ComputeBudget;
  readonly requiredCapabilities: readonly string[];
  readonly reportTargetSelection: boolean;
}

export interface ComputeAutoPolicy {
  readonly workload: ComputeWorkloadKind;
  readonly prefer: readonly ComputeTarget[];
  readonly fallbackRequired: boolean;
  readonly report: boolean;
}

export interface ComputeTargetSelection {
  readonly requested: "compute auto" | ComputeTarget;
  readonly selectedTarget: ComputeTarget;
  readonly reason: string;
  readonly fallback: boolean;
  readonly satisfied: boolean;
  readonly warnings: readonly string[];
}

export interface ComputeTargetPreference {
  readonly prefer: ComputeTarget;
  readonly fallback: readonly ComputeTarget[];
  readonly allowSilentFallback: false;
  readonly requireOnDevice?: boolean;
  readonly allowNetwork?: boolean;
  readonly reportFallback: true;
}

export type ComputeDataLocation =
  | "host"
  | "target"
  | "accelerator"
  | "memory_pool"
  | "storage"
  | "shared"
  | "remote";

export interface ComputeDataMovement {
  readonly from: ComputeDataLocation;
  readonly to: ComputeDataLocation;
  readonly bytes: number;
  readonly reason: string;
  readonly interconnect?: ComputeTarget;
  readonly format?: "json" | "schema-compressed" | "binary-record" | "tensor-binary" | "columnar";
}

export interface ComputeOffloadStage {
  readonly name: string;
  readonly target: ComputeTarget;
  readonly operations: readonly string[];
  readonly dataMovement: readonly ComputeDataMovement[];
  readonly budget?: ComputeBudget;
  readonly fallbackTarget?: ComputeTarget;
}

export interface ComputeOffloadPlan {
  readonly flow: string;
  readonly workload: ComputeWorkloadKind;
  readonly stages: readonly ComputeOffloadStage[];
  readonly verifyWithCpuReference: boolean;
  readonly report: true;
}

export interface ComputeOffloadReport {
  readonly plan: ComputeOffloadPlan;
  readonly selections: readonly ComputeTargetSelection[];
  readonly diagnostics: readonly ComputeDiagnostic[];
  readonly totalDataMovementBytes: number;
  readonly fallbackUsed: boolean;
}

export interface ComputeReport {
  readonly plans: readonly ComputePlan[];
  readonly capabilities: readonly ComputeCapability[];
  readonly selections: readonly ComputeTargetSelection[];
  readonly offloads: readonly ComputeOffloadReport[];
  readonly diagnostics: readonly ComputeDiagnostic[];
  readonly warnings: readonly string[];
}

export function validateComputePlan(
  plan: ComputePlan,
): readonly ComputeDiagnostic[] {
  const diagnostics: ComputeDiagnostic[] = [];

  if (plan.name.trim().length === 0) {
    diagnostics.push({
      code: "Galerina_COMPUTE_PLAN_NAME_REQUIRED",
      severity: "error",
      message: "Compute plan requires a name.",
      path: "name",
    });
  }

  if (plan.fallbackTargets.includes(plan.preferredTarget)) {
    diagnostics.push({
      code: "Galerina_COMPUTE_FALLBACK_DUPLICATES_PREFERRED_TARGET",
      severity: "warning",
      message: "Compute fallback target duplicates the preferred target.",
      path: "fallbackTargets",
    });
  }

  if (plan.budget?.memoryBytes !== undefined && plan.budget.memoryBytes <= 0) {
    diagnostics.push({
      code: "Galerina_COMPUTE_MEMORY_BUDGET_INVALID",
      severity: "error",
      message: "Compute memory budget must be positive when declared.",
      path: "budget.memoryBytes",
    });
  }

  if (plan.budget?.timeoutMs !== undefined && plan.budget.timeoutMs <= 0) {
    diagnostics.push({
      code: "Galerina_COMPUTE_TIMEOUT_BUDGET_INVALID",
      severity: "error",
      message: "Compute timeout budget must be positive when declared.",
      path: "budget.timeoutMs",
    });
  }

  return diagnostics;
}

export function selectComputeTarget(
  policy: ComputeAutoPolicy,
  capabilities: readonly ComputeCapability[],
): ComputeTargetSelection {
  for (const target of policy.prefer) {
    const capability = capabilities.find((item) => item.target === target); // perf-allow: loop-array-find — bounded by the small fixed set of hardware compute targets
    if (capability?.available === true) {
      return {
        requested: "compute auto",
        selectedTarget: target,
        reason: "Target is available and appears first in preference order.",
        fallback: target !== policy.prefer[0],
        satisfied: true,
        warnings: [],
      };
    }
  }

  const firstPreference = policy.prefer[0] ?? "cpu.generic";

  return {
    requested: "compute auto",
    selectedTarget: firstPreference,
    reason: policy.fallbackRequired
      ? "No preferred compute target is available."
      : "No preferred compute target is available; using first preference as a plan-only target.",
    fallback: true,
    satisfied: !policy.fallbackRequired,
    warnings: [
      policy.fallbackRequired
        ? "Required compute fallback could not be satisfied."
        : "Compute target selection is plan-only.",
    ],
  };
}

export function selectPreferredComputeTarget(
  preference: ComputeTargetPreference,
  capabilities: readonly ComputeCapability[],
): ComputeTargetSelection {
  const orderedTargets = [preference.prefer, ...preference.fallback];
  const autoSelection = selectComputeTarget(
    {
      workload: preference.prefer === "npu" || preference.prefer === "ai_accelerator"
        ? "ai-inference"
        : "general",
      prefer: orderedTargets,
      fallbackRequired: true,
      report: preference.reportFallback,
    },
    capabilities,
  );

  if (autoSelection.selectedTarget !== preference.prefer) {
    return {
      ...autoSelection,
      warnings: [
        ...autoSelection.warnings,
        "Compute fallback was explicit and reportable; silent fallback is not allowed.",
      ],
    };
  }

  return autoSelection;
}

export function createComputeOffloadReport(
  plan: ComputeOffloadPlan,
  capabilities: readonly ComputeCapability[],
): ComputeOffloadReport {
  const diagnostics = validateComputeOffloadPlan(plan);
  const selections = plan.stages.map((stage) =>
    selectComputeTarget(
      {
        workload: plan.workload,
        prefer:
          stage.fallbackTarget === undefined
            ? [stage.target]
            : [stage.target, stage.fallbackTarget],
        fallbackRequired: true,
        report: plan.report,
      },
      capabilities,
    ),
  );

  return {
    plan,
    selections,
    diagnostics,
    totalDataMovementBytes: sumDataMovementBytes(plan),
    fallbackUsed: selections.some((selection) => selection.fallback),
  };
}

export function createComputeReport(input: {
  readonly plans?: readonly ComputePlan[];
  readonly capabilities?: readonly ComputeCapability[];
  readonly offloadPlans?: readonly ComputeOffloadPlan[];
}): ComputeReport {
  const plans = input.plans ?? [];
  const capabilities = input.capabilities ?? [];
  const offloadPlans = input.offloadPlans ?? [];
  const diagnostics = plans.flatMap((plan) => validateComputePlan(plan));
  const offloads = offloadPlans.map((plan) =>
    createComputeOffloadReport(plan, capabilities),
  );

  diagnostics.push(
    ...offloads.flatMap((offload) => offload.diagnostics),
  );

  return {
    plans,
    capabilities,
    selections: [],
    offloads,
    diagnostics,
    warnings: diagnostics
      .filter((diagnostic) => diagnostic.severity === "warning")
      .map((diagnostic) => diagnostic.message),
  };
}

function validateComputeOffloadPlan(
  plan: ComputeOffloadPlan,
): readonly ComputeDiagnostic[] {
  const diagnostics: ComputeDiagnostic[] = [];

  if (plan.flow.trim().length === 0) {
    diagnostics.push({
      code: "Galerina_COMPUTE_OFFLOAD_FLOW_REQUIRED",
      severity: "error",
      message: "Compute offload plan requires a flow name.",
      path: "flow",
    });
  }

  if (plan.stages.length === 0) {
    diagnostics.push({
      code: "Galerina_COMPUTE_OFFLOAD_STAGE_REQUIRED",
      severity: "error",
      message: "Compute offload plan requires at least one stage.",
      path: "stages",
    });
  }

  plan.stages.forEach((stage, index) => {
    if (stage.name.trim().length === 0) {
      diagnostics.push({
        code: "Galerina_COMPUTE_OFFLOAD_STAGE_NAME_REQUIRED",
        severity: "error",
        message: "Compute offload stage requires a name.",
        path: `stages.${index}.name`,
      });
    }

    if (stage.operations.length === 0) {
      diagnostics.push({
        code: "Galerina_COMPUTE_OFFLOAD_STAGE_OPERATION_REQUIRED",
        severity: "error",
        message: "Compute offload stage requires at least one operation.",
        path: `stages.${index}.operations`,
      });
    }

    for (const [movementIndex, movement] of stage.dataMovement.entries()) {
      if (movement.bytes < 0) {
        diagnostics.push({
          code: "Galerina_COMPUTE_DATA_MOVEMENT_BYTES_INVALID",
          severity: "error",
          message: "Compute data movement bytes must not be negative.",
          path: `stages.${index}.dataMovement.${movementIndex}.bytes`,
        });
      }
    }
  });

  return diagnostics;
}

function sumDataMovementBytes(plan: ComputeOffloadPlan): number {
  return plan.stages.reduce((stageTotal, stage) => {
    const stageBytes = stage.dataMovement.reduce(
      (movementTotal, movement) => movementTotal + movement.bytes,
      0,
    );
    return stageTotal + stageBytes;
  }, 0);
}
