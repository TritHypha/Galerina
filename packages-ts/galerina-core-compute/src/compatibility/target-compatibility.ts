// Compatibility vocabulary (TODO pass, Grok 2026-10-05; owner may revisit).

import type { RuntimeTarget } from "../workload.js";

/**
 * full: preferred target, no blockers, no warnings.
 * partial: no blockers, but warnings, or the target was not requested by the workload.
 * degraded: no blockers, but the target is one of the workload's fallback targets.
 * incompatible: at least one blocker.
 */
export type CompatibilityLevel = "full" | "partial" | "degraded" | "incompatible";

export const COMPATIBILITY_LEVELS: readonly CompatibilityLevel[] = Object.freeze(["full", "partial", "degraded", "incompatible"] as const);

export interface CompatibilityBlocker {
  readonly reason: string;
  readonly diagnosticCode: string;
  readonly effect?: string;
  readonly capability?: string;
}

export interface CompatibilityWarning {
  readonly message: string;
  readonly diagnosticCode: string;
}

export interface CompatibilityFallback {
  readonly target: RuntimeTarget;
  readonly reason: string;
}

export interface CompatibilityResult {
  readonly target: RuntimeTarget;
  readonly level: CompatibilityLevel;
  readonly blockers: readonly CompatibilityBlocker[];
  readonly warnings: readonly CompatibilityWarning[];
  readonly fallback?: CompatibilityFallback;
}

/**
 * What a target allows. Effects are allowlisted: an effect that is neither supported
 * nor forbidden is a blocker (unknown fails closed). `requiredCapabilities` are the
 * capabilities the target needs the workload to declare explicitly (for example a
 * GPU target can require "GpuRuntime"), so accelerator use is never implicit.
 * `allowsSensitiveData` defaults to nothing: it must be stated.
 */
export interface TargetProfile {
  readonly target: RuntimeTarget;
  readonly supportedEffects: readonly string[];
  readonly forbiddenEffects: readonly string[];
  readonly requiredCapabilities: readonly string[];
  readonly memoryLimitMb?: number;
  readonly allowsSensitiveData: boolean;
}
