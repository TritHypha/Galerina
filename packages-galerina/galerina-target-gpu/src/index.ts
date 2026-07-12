export interface GpuTargetCapability {
  readonly name: string;
  readonly backend: "cuda" | "rocm" | "webgpu" | "vulkan" | "plan-only";
  readonly features: readonly string[];
}

export interface GpuKernelPlan {
  readonly flow: string;
  readonly backend: GpuTargetCapability["backend"];
  readonly operations: readonly string[];
}

export interface GpuTargetReport {
  readonly capabilities: readonly GpuTargetCapability[];
  readonly plans: readonly GpuKernelPlan[];
  readonly warnings: readonly string[];
}

// ── runtime contract helpers ──────────────────────────────────────────────────
// The interfaces above are the type contract; the helpers below enforce it at
// runtime for kernel plans that arrive as untrusted parsed JSON. Fail-closed,
// mirroring the green sibling target packages (target-cpu, target-ai-accelerator):
// a plan may not target a backend the host does not advertise.

export type GpuDiagnosticSeverity = "warning" | "error";

export interface GpuDiagnostic {
  readonly code: string;
  readonly severity: GpuDiagnosticSeverity;
  readonly message: string;
  readonly path?: string;
}

const GPU_BACKENDS: readonly GpuTargetCapability["backend"][] = [
  "cuda", "rocm", "webgpu", "vulkan", "plan-only",
];

function gpuDiagnostic(
  code: string,
  severity: GpuDiagnosticSeverity,
  message: string,
  path?: string,
): GpuDiagnostic {
  return { code, severity, message, ...(path === undefined ? {} : { path }) };
}

// A kernel plan must name its flow, use a known backend, list at least one
// operation, and — fail-closed — only target a backend that appears in the
// available capabilities (you cannot lower onto hardware the host lacks).
export function validateGpuKernelPlan(
  plan: GpuKernelPlan,
  capabilities: readonly GpuTargetCapability[],
  path = "plan",
): readonly GpuDiagnostic[] {
  const diagnostics: GpuDiagnostic[] = [];

  if (plan.flow.trim().length === 0) {
    diagnostics.push(gpuDiagnostic(
      "Galerina_GPU_PLAN_FLOW_REQUIRED",
      "error",
      "GPU kernel plan requires a flow.",
      `${path}.flow`,
    ));
  }

  if (!GPU_BACKENDS.includes(plan.backend)) {
    diagnostics.push(gpuDiagnostic(
      "Galerina_GPU_PLAN_BACKEND_INVALID",
      "error",
      `GPU kernel plan backend must be one of: ${GPU_BACKENDS.join(", ")}.`,
      `${path}.backend`,
    ));
  } else if (!capabilities.some((c) => c.backend === plan.backend)) {
    diagnostics.push(gpuDiagnostic(
      "Galerina_GPU_PLAN_BACKEND_UNAVAILABLE",
      "error",
      `GPU kernel plan targets backend "${plan.backend}" which no advertised capability provides.`,
      `${path}.backend`,
    ));
  }

  if (plan.operations.length === 0) {
    diagnostics.push(gpuDiagnostic(
      "Galerina_GPU_PLAN_NO_OPERATIONS",
      "error",
      "GPU kernel plan lists no operations; it would do nothing.",
      `${path}.operations`,
    ));
  }

  return diagnostics;
}

// Build a GPU target report, validating every plan against the advertised
// capabilities and surfacing warnings.
export function createGpuTargetReport(input: {
  readonly capabilities: readonly GpuTargetCapability[];
  readonly plans: readonly GpuKernelPlan[];
}): { readonly report: GpuTargetReport; readonly diagnostics: readonly GpuDiagnostic[] } {
  const diagnostics: GpuDiagnostic[] = [];
  const warnings: string[] = [];

  input.plans.forEach((plan, index) => {
    for (const d of validateGpuKernelPlan(plan, input.capabilities, `plans.${index}`)) {
      diagnostics.push(d);
      if (d.severity === "warning") warnings.push(d.message);
    }
  });

  return {
    report: { capabilities: input.capabilities, plans: input.plans, warnings },
    diagnostics,
  };
}
