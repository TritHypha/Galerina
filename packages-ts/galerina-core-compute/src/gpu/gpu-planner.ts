// GPU plan builder (TODO pass, Grok 2026-10-05).
// Zero-trust defaults, owner may revisit.
// recommendedTarget is always "cpu" under the v1 freeze. Suitability may be
// "low" as an advisory signal only; diagnostics always include FUNGI-COMPUTE-001.

import type { ComputeDiagnostic } from "../index.js";
import type { ComputeWorkload } from "../workload.js";
import { validateComputeWorkload } from "../workload.js";
import { FUNGI_COMPUTE_CODES, type FungiComputeCode } from "./gpu-codes.js";
import { estimateGpuSuitability } from "./gpu-estimator.js";
import { cpuGpuFallback } from "./gpu-fallback.js";
import type { GpuFallbackReason, GpuPlan, GpuPrecision, GpuRequirements } from "./gpu-types.js";

function fungi(code: FungiComputeCode, path?: string): ComputeDiagnostic {
  return Object.freeze({
    code,
    severity: "error" as const,
    message: FUNGI_COMPUTE_CODES[code],
    ...(path === undefined ? {} : { path }),
  });
}

function deriveRequirements(workload: ComputeWorkload): GpuRequirements {
  // Advisory derived floors only — not a claim that a GPU can meet them.
  const precision: GpuPrecision =
    workload.kind === "ai_inference" || workload.kind === "tensor" ? "mixed" : "fp32";
  return Object.freeze({
    minMemoryMb: Math.max(0, workload.memoryMb),
    minParallelism: workload.operationCount >= 10_000 ? 256 : 1,
    precision,
  });
}

function freezePlan(plan: GpuPlan): GpuPlan {
  return Object.freeze({
    ...plan,
    reasons: Object.freeze([...plan.reasons]),
    requirements: Object.freeze({ ...plan.requirements }),
    fallback: Object.freeze({ ...plan.fallback }),
    diagnostics: Object.freeze(plan.diagnostics.map((d) => Object.freeze({ ...d }))),
  });
}

/**
 * Build a GpuPlan v0.2. Always recommends cpu under the v1 freeze. Emits
 * FUNGI-COMPUTE-001 on every plan so callers cannot mistake advisory
 * suitability for admission.
 */
export function buildGpuPlan(workload: ComputeWorkload): GpuPlan {
  const structural = validateComputeWorkload(workload);
  if (structural.length > 0) {
    return freezePlan({
      schemaVersion: "galerina.compute.gpu-plan.v0.2",
      suitability: "unknown",
      recommendedTarget: "cpu",
      reasons: ["workload_invalid", "gpu_not_admitted", "explicit_cpu_fallback"],
      requirements: Object.freeze({ minMemoryMb: 0, minParallelism: 0, precision: "unknown" }),
      fallback: cpuGpuFallback("workload_invalid"),
      diagnostics: [
        fungi("FUNGI-COMPUTE-002", "workload"),
        fungi("FUNGI-COMPUTE-001"),
        fungi("FUNGI-COMPUTE-005"),
        ...structural,
      ],
    });
  }

  const suitability = estimateGpuSuitability(workload);
  const requirements = deriveRequirements(workload);
  const reasons: GpuFallbackReason[] = ["gpu_not_admitted", "explicit_cpu_fallback"];
  const diagnostics: ComputeDiagnostic[] = [
    fungi("FUNGI-COMPUTE-001"),
    fungi("FUNGI-COMPUTE-005"),
    fungi("FUNGI-COMPUTE-003", "requirements"),
  ];

  if (workload.dataShape.sensitive) {
    reasons.push("sensitive_data");
    diagnostics.push(fungi("FUNGI-COMPUTE-004", "dataShape.sensitive"));
  }

  if (suitability === "unsuitable") {
    reasons.push("workload_unsuitable");
    diagnostics.push(fungi("FUNGI-COMPUTE-006", "workload"));
  }

  if (requirements.precision === "unknown") {
    diagnostics.push(fungi("FUNGI-COMPUTE-007", "requirements.precision"));
  }

  // Advisory warning surface: suitability "low" is interesting but never raises
  // recommendedTarget above cpu.
  return freezePlan({
    schemaVersion: "galerina.compute.gpu-plan.v0.2",
    suitability,
    recommendedTarget: "cpu",
    reasons: Object.freeze(Array.from(new Set(reasons))),
    requirements,
    fallback: cpuGpuFallback(
      workload.dataShape.sensitive
        ? "sensitive_data"
        : suitability === "unsuitable"
          ? "workload_unsuitable"
          : "gpu_not_admitted",
    ),
    diagnostics,
  });
}
