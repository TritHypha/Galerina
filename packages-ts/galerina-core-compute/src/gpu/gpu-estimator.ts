// GPU suitability estimator (TODO pass, Grok 2026-10-05).
// Zero-trust defaults, owner may revisit.
//
// Under the v1 freeze no live GPU backend is admitted, so this estimator NEVER
// returns "high" or "medium" (those would imply an actionable GPU affinity).
// Returns:
//   - "unknown" when the workload is structurally invalid
//   - "low" when the shape is GPU-interesting (advisory only; still not admitted)
//   - "unsuitable" otherwise

import type { ComputeWorkload } from "../workload.js";
import { validateComputeWorkload } from "../workload.js";
import type { GpuSuitability } from "./gpu-types.js";

const GPU_INTEREST_KINDS = new Set([
  "vector",
  "matrix",
  "tensor",
  "image",
  "ai_inference",
  "batch",
]);

/**
 * Advisory GPU suitability. Never claims high/medium under the v1 freeze.
 * Hostile getters that throw during reads return "unknown" (never throw out).
 */
export function estimateGpuSuitability(workload: ComputeWorkload): GpuSuitability {
  try {
    if (validateComputeWorkload(workload).length > 0) return "unknown";

    const gpuInteresting =
      GPU_INTEREST_KINDS.has(workload.kind) ||
      workload.preferredTargets.includes("gpu") ||
      workload.effects.some((e) => e === "accelerator" || e === "parallel_compute") ||
      workload.operationCount >= 10_000 ||
      workload.memoryMb >= 512;

    if (!gpuInteresting) return "unsuitable";

    // Sensitive workloads stay "low" as advisory interest but must not look like
    // an admission recommendation — buildGpuPlan refuses GPU execution for them.
    return "low";
  } catch {
    return "unknown";
  }
}
