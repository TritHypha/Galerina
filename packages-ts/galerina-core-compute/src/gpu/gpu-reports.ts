// GPU plan report helper (TODO pass, Grok 2026-10-05).
// Zero-trust defaults, owner may revisit. Summarises GpuPlan fields without
// copying free-text diagnostics messages into a separate report surface.

import type { GpuPlan, GpuSuitability } from "./gpu-types.js";
import type { FungiComputeCode } from "./gpu-codes.js";
import { isFungiComputeCode } from "./gpu-codes.js";

export interface GpuPlanReport {
  readonly schemaVersion: "galerina.compute.gpu-plan-report.v1";
  readonly suitability: GpuSuitability;
  readonly recommendedTarget: GpuPlan["recommendedTarget"];
  readonly fallbackTarget: GpuPlan["fallback"]["target"];
  readonly fallbackReason: GpuPlan["fallback"]["reason"];
  readonly reasonCodes: readonly GpuPlan["reasons"][number][];
  readonly fungiCodes: readonly FungiComputeCode[];
  readonly advisoryOnly: true;
}

export function createGpuPlanReport(plan: GpuPlan): GpuPlanReport {
  const fungiCodes = plan.diagnostics
    .map((d) => d.code)
    .filter(isFungiComputeCode);
  return Object.freeze({
    schemaVersion: "galerina.compute.gpu-plan-report.v1",
    suitability: plan.suitability,
    recommendedTarget: plan.recommendedTarget,
    fallbackTarget: plan.fallback.target,
    fallbackReason: plan.fallback.reason,
    reasonCodes: Object.freeze([...plan.reasons]),
    fungiCodes: Object.freeze([...new Set(fungiCodes)]),
    advisoryOnly: true as const,
  });
}
