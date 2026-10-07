// validateTarget (TODO pass, Grok 2026-10-05; owner may revisit). Pure and explainable.

import type { ComputeWorkload } from "../workload.js";
import { isQuantumTargetToken, COMPUTE_QUANTUM_TARGET_REFUSED, COMPUTE_QUANTUM_TARGET_REFUSED_MESSAGE } from "../quantum/quantum-refusal.js";
import type { CompatibilityBlocker, CompatibilityLevel, CompatibilityResult, CompatibilityWarning, TargetProfile } from "./target-compatibility.js";
import {
  FUNGI_COMPAT_FORBIDDEN_EFFECT,
  FUNGI_COMPAT_MEMORY_LIMIT,
  FUNGI_COMPAT_MISSING_CAPABILITY,
  FUNGI_COMPAT_SENSITIVE_DATA,
  FUNGI_COMPAT_UNSUPPORTED_EFFECT,
} from "./compatibility-rules.js";

export function validateTarget(workload: ComputeWorkload, profile: TargetProfile): CompatibilityResult {
  const blockers: CompatibilityBlocker[] = [];
  const warnings: CompatibilityWarning[] = [];
  if (isQuantumTargetToken(profile.target)) {
    blockers.push({
      reason: COMPUTE_QUANTUM_TARGET_REFUSED_MESSAGE,
      diagnosticCode: COMPUTE_QUANTUM_TARGET_REFUSED,
    });
    const next = workload.fallbackTargets.find((t) => t !== profile.target && !isQuantumTargetToken(t));
    const base = {
      target: profile.target,
      level: "incompatible" as const,
      blockers: Object.freeze(blockers),
      warnings: Object.freeze(warnings),
    };
    return next === undefined
      ? Object.freeze(base)
      : Object.freeze({ ...base, fallback: Object.freeze({ target: next, reason: COMPUTE_QUANTUM_TARGET_REFUSED_MESSAGE }) });
  }
  for (const effect of workload.effects) {
    if (profile.forbiddenEffects.includes(effect)) {
      blockers.push({ reason: `Effect ${effect} is forbidden on ${profile.target}.`, diagnosticCode: FUNGI_COMPAT_FORBIDDEN_EFFECT, effect });
    } else if (!profile.supportedEffects.includes(effect)) {
      blockers.push({ reason: `Effect ${effect} is not supported on ${profile.target}.`, diagnosticCode: FUNGI_COMPAT_UNSUPPORTED_EFFECT, effect });
    }
  }
  for (const capability of profile.requiredCapabilities) {
    if (!workload.requiredCapabilities.includes(capability)) {
      blockers.push({ reason: `${profile.target} requires capability ${capability}, which the workload did not declare.`, diagnosticCode: FUNGI_COMPAT_MISSING_CAPABILITY, capability });
    }
  }
  if (profile.memoryLimitMb === undefined) {
    warnings.push({ message: `${profile.target} declares no memory limit; ${workload.memoryMb} MB cannot be verified.`, diagnosticCode: FUNGI_COMPAT_MEMORY_LIMIT });
  } else if (!(Number.isFinite(profile.memoryLimitMb) && profile.memoryLimitMb >= 0) || workload.memoryMb > profile.memoryLimitMb) {
    blockers.push({ reason: `Workload needs ${workload.memoryMb} MB; ${profile.target} allows ${String(profile.memoryLimitMb)} MB.`, diagnosticCode: FUNGI_COMPAT_MEMORY_LIMIT });
  }
  if (workload.dataShape.sensitive && profile.allowsSensitiveData !== true) {
    blockers.push({ reason: `Sensitive data is not allowed on ${profile.target}.`, diagnosticCode: FUNGI_COMPAT_SENSITIVE_DATA });
  }

  let level: CompatibilityLevel;
  if (blockers.length > 0) level = "incompatible";
  else if (workload.preferredTargets.includes(profile.target)) level = warnings.length === 0 ? "full" : "partial";
  else if (workload.fallbackTargets.includes(profile.target)) level = "degraded";
  else {
    warnings.push({ message: `${profile.target} was not requested by the workload.`, diagnosticCode: "Galerina_COMPAT_TARGET_NOT_REQUESTED" });
    level = "partial";
  }

  const base = { target: profile.target, level, blockers: Object.freeze(blockers), warnings: Object.freeze(warnings) };
  if (level !== "incompatible") return Object.freeze(base);
  const next = workload.fallbackTargets.find((t) => t !== profile.target);
  return next === undefined
    ? Object.freeze(base)
    : Object.freeze({ ...base, fallback: Object.freeze({ target: next, reason: `${profile.target} is incompatible; ${next} is the workload's declared fallback.` }) });
}
