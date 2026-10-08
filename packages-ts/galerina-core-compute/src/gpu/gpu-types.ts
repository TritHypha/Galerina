// GPU planning types: suitability, requirements, fallback, plan (TODO pass).
// Zero-trust defaults, owner may revisit. Planning vocabulary only.

import type { ComputeDiagnostic } from "../index.js";
import type { RuntimeTarget } from "../workload.js";

export type GpuSuitability = "high" | "medium" | "low" | "unsuitable" | "unknown";

export const GPU_SUITABILITIES = Object.freeze([
  "high",
  "medium",
  "low",
  "unsuitable",
  "unknown",
] as const);

export type GpuPrecision = "fp32" | "fp16" | "bf16" | "int8" | "int4" | "mixed" | "unknown";

export const GPU_PRECISIONS = Object.freeze([
  "fp32",
  "fp16",
  "bf16",
  "int8",
  "int4",
  "mixed",
  "unknown",
] as const);

export interface GpuRequirements {
  readonly minMemoryMb: number;
  readonly minParallelism: number;
  readonly precision: GpuPrecision;
}

/** Closed reason tokens for GPU fallback (never free-text from callers). */
export type GpuFallbackReason =
  | "gpu_not_admitted"
  | "requirements_unsatisfiable"
  | "sensitive_data"
  | "workload_unsuitable"
  | "workload_invalid"
  | "explicit_cpu_fallback";

export interface GpuFallbackPlan {
  readonly target: RuntimeTarget;
  readonly reason: GpuFallbackReason;
}

export interface GpuPlan {
  readonly schemaVersion: "galerina.compute.gpu-plan.v0.2";
  readonly suitability: GpuSuitability;
  /** Under v1 freeze this is always "cpu" for an executable recommendation. */
  readonly recommendedTarget: RuntimeTarget;
  /** Closed reason tokens only (not free-text). */
  readonly reasons: readonly GpuFallbackReason[];
  readonly requirements: GpuRequirements;
  readonly fallback: GpuFallbackPlan;
  readonly diagnostics: readonly ComputeDiagnostic[];
}

export function isGpuSuitability(value: unknown): value is GpuSuitability {
  return typeof value === "string" && (GPU_SUITABILITIES as readonly string[]).includes(value);
}

export function isGpuPrecision(value: unknown): value is GpuPrecision {
  return typeof value === "string" && (GPU_PRECISIONS as readonly string[]).includes(value);
}
