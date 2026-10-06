// Optical/photonic planning types (TODO pass, Grok 2026-10-05).
// Zero-trust defaults, owner may revisit. Planning vocabulary only: nothing
// here admits optical_io execution or loads a photonic backend.

import type { ComputeDiagnostic } from "../index.js";

export type OpticalNeed =
  | "none"
  | "data_movement"
  | "topology_aware"
  | "high_bandwidth"
  | "unknown";

export const OPTICAL_NEEDS = Object.freeze([
  "none",
  "data_movement",
  "topology_aware",
  "high_bandwidth",
  "unknown",
] as const);

/** Closed recommended planning modes. Never an execution admission. */
export type OpticalRecommendedMode =
  | "none"
  | "optical_io_awareness"
  | "photonic_planning_only";

export const OPTICAL_RECOMMENDED_MODES = Object.freeze([
  "none",
  "optical_io_awareness",
  "photonic_planning_only",
] as const);

/** Closed fallback targets named by the package TODO (not RuntimeTarget). */
export type OpticalFallbackTarget = "network_io" | "cpu" | "cluster_runtime";

export const OPTICAL_FALLBACK_TARGETS = Object.freeze([
  "network_io",
  "cpu",
  "cluster_runtime",
] as const);

/** Closed reason tokens for optical fallback (never free-text from callers). */
export type OpticalFallbackReason =
  | "optical_not_admitted"
  | "workload_invalid"
  | "sensitive_data"
  | "no_optical_need"
  | "explicit_cpu_fallback"
  | "network_disallowed";

export interface OpticalFallbackPlan {
  readonly target: OpticalFallbackTarget;
  readonly reason: OpticalFallbackReason;
}

export interface OpticalPlan {
  readonly schemaVersion: "galerina.compute.optical-plan.v0.2";
  readonly need: OpticalNeed;
  /** Under v1 freeze this is never an execution mode — planning awareness only. */
  readonly recommendedMode: OpticalRecommendedMode;
  readonly fallback: OpticalFallbackPlan;
  readonly diagnostics: readonly ComputeDiagnostic[];
}

export function isOpticalNeed(value: unknown): value is OpticalNeed {
  return typeof value === "string" && (OPTICAL_NEEDS as readonly string[]).includes(value);
}

export function isOpticalRecommendedMode(value: unknown): value is OpticalRecommendedMode {
  return typeof value === "string" && (OPTICAL_RECOMMENDED_MODES as readonly string[]).includes(value);
}

export function isOpticalFallbackTarget(value: unknown): value is OpticalFallbackTarget {
  return typeof value === "string" && (OPTICAL_FALLBACK_TARGETS as readonly string[]).includes(value);
}