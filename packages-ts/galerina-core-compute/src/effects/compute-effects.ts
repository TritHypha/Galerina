// Compute effects vocabulary (TODO pass, Grok 2026-10-05).
// Zero-trust defaults, owner may revisit. Closed names only: declaring an effect
// here is NOT admission. V1 execution freeze stays on CPU/WASM; accelerator /
// optical_io / distributed_compute stay planning vocabulary until an attested
// backend is admitted by the owner.

import type { ComputeDiagnostic } from "../index.js";
import { isQuantumTargetToken, quantumTargetRefusalDiagnostic } from "../quantum/quantum-refusal.js";

/** Closed compute-effect names named by the package TODO. */
export const COMPUTE_EFFECTS = Object.freeze([
  "accelerator",
  "optical_io",
  "distributed_compute",
  "high_memory",
  "parallel_compute",
] as const);

export type ComputeEffectName = (typeof COMPUTE_EFFECTS)[number];

/** Effects that may appear on a v1-active CPU/WASM plan today. */
export const V1_ACTIVE_COMPUTE_EFFECTS = Object.freeze([
  "high_memory",
  "parallel_compute",
] as const);

export type V1ActiveComputeEffect = (typeof V1_ACTIVE_COMPUTE_EFFECTS)[number];

function diag(code: string, message: string, path?: string): ComputeDiagnostic {
  return Object.freeze({
    code,
    severity: "error" as const,
    message,
    ...(path === undefined ? {} : { path }),
  });
}

export function isComputeEffectName(value: unknown): value is ComputeEffectName {
  return typeof value === "string" && (COMPUTE_EFFECTS as readonly string[]).includes(value);
}

export function isV1ActiveComputeEffect(value: ComputeEffectName): boolean {
  return (V1_ACTIVE_COMPUTE_EFFECTS as readonly string[]).includes(value);
}

/**
 * Validate a list of compute effect names. Fail closed: unknown names and
 * non-lists are errors. Non-v1-active names are accepted as planning-only
 * vocabulary but flagged with a warning diagnostic (severity stays "error" only
 * for unknowns; planning-only use a dedicated warning code via validate for
 * admission checks — see `assertComputeEffectsAdmissible`).
 */
export function validateComputeEffectNames(
  value: unknown,
  path = "effects",
): readonly ComputeDiagnostic[] {
  if (!Array.isArray(value)) {
    return [diag("Galerina_COMPUTE_EFFECTS_INVALID", "Compute effects must be an array of closed names.", path)];
  }
  const out: ComputeDiagnostic[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < value.length; i += 1) {
    const item = value[i];
    const p = `${path}.${i}`;
    if (isQuantumTargetToken(item)) {
      out.push(quantumTargetRefusalDiagnostic(p));
      continue;
    }
    if (!isComputeEffectName(item)) {
      out.push(diag("Galerina_COMPUTE_EFFECT_UNKNOWN", "Compute effect name is not in the closed vocabulary.", p));
      continue;
    }
    if (seen.has(item)) {
      out.push(diag("Galerina_COMPUTE_EFFECT_DUPLICATE", "Compute effect names must be unique.", p));
    }
    seen.add(item);
  }
  return out;
}

/**
 * Admission check: under the v1 freeze only high_memory and parallel_compute
 * may be claimed as active. Other closed names are planning vocabulary and
 * refuse admission (owner may revisit when a backend is attested).
 */
export function assertComputeEffectsAdmissible(
  effects: readonly ComputeEffectName[],
  path = "effects",
): readonly ComputeDiagnostic[] {
  const out: ComputeDiagnostic[] = [];
  for (let i = 0; i < effects.length; i += 1) {
    const effect = effects[i]!;
    if (!isV1ActiveComputeEffect(effect)) {
      out.push(
        diag(
          "Galerina_COMPUTE_EFFECT_NOT_ADMITTED",
          "Compute effect is planning-only under the v1 freeze (not admitted for execution).",
          `${path}.${i}`,
        ),
      );
    }
  }
  return out;
}
