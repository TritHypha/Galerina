// Compute runtime capability vocabulary (TODO pass, Grok 2026-10-05).
// Zero-trust defaults, owner may revisit. Names only: listing a capability here
// does not grant it. V1 freeze: only ComputeRuntime may be claimed available.

import type { ComputeDiagnostic } from "../index.js";
import { isQuantumTargetToken, quantumTargetRefusalDiagnostic } from "../quantum/quantum-refusal.js";

/** Closed compute capability names named by the package TODO. */
export const COMPUTE_RUNTIME_CAPABILITIES = Object.freeze([
  "ComputeRuntime",
  "GpuRuntime",
  "AcceleratorRuntime",
  "OpticalTransport",
  "DistributedScheduler",
] as const);

export type ComputeRuntimeCapabilityName = (typeof COMPUTE_RUNTIME_CAPABILITIES)[number];

/** Capabilities that may be claimed available under the v1 freeze. */
export const V1_ACTIVE_COMPUTE_CAPABILITIES = Object.freeze(["ComputeRuntime"] as const);

export type V1ActiveComputeCapability = (typeof V1_ACTIVE_COMPUTE_CAPABILITIES)[number];

export type ComputeCapabilityAvailability = "available" | "planning_only" | "unavailable" | "unknown";

export interface ComputeRuntimeCapabilityClaim {
  readonly name: ComputeRuntimeCapabilityName;
  readonly availability: ComputeCapabilityAvailability;
}

function diag(code: string, message: string, path?: string): ComputeDiagnostic {
  return Object.freeze({
    code,
    severity: "error" as const,
    message,
    ...(path === undefined ? {} : { path }),
  });
}

export function isComputeRuntimeCapabilityName(
  value: unknown,
): value is ComputeRuntimeCapabilityName {
  return typeof value === "string" && (COMPUTE_RUNTIME_CAPABILITIES as readonly string[]).includes(value);
}

export function isV1ActiveComputeCapability(value: ComputeRuntimeCapabilityName): boolean {
  return (V1_ACTIVE_COMPUTE_CAPABILITIES as readonly string[]).includes(value);
}

/**
 * Validate a capability claim. Fail closed: unknown names refused; non-ComputeRuntime
 * "available" claims refused under the v1 freeze.
 */
export function validateComputeRuntimeCapabilityClaim(
  value: unknown,
  path = "capability",
): readonly ComputeDiagnostic[] {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return [diag("Galerina_COMPUTE_CAPABILITY_INVALID", "Capability claim must be a plain record.", path)];
  }
  const c = value as Record<string, unknown>;
  const out: ComputeDiagnostic[] = [];
  for (const key of Object.keys(c)) {
    if (key !== "name" && key !== "availability") {
      out.push(diag("Galerina_COMPUTE_CAPABILITY_FIELD_UNKNOWN", "Capability claims may only carry known fields.", path));
      break;
    }
  }
  if (isQuantumTargetToken(c.name)) {
    out.push(quantumTargetRefusalDiagnostic(`${path}.name`));
  } else if (!isComputeRuntimeCapabilityName(c.name)) {
    out.push(diag("Galerina_COMPUTE_CAPABILITY_NAME_INVALID", "Capability name is not in the closed vocabulary.", `${path}.name`));
  }
  const availabilityOk =
    c.availability === "available" ||
    c.availability === "planning_only" ||
    c.availability === "unavailable" ||
    c.availability === "unknown";
  if (!availabilityOk) {
    out.push(
      diag(
        "Galerina_COMPUTE_CAPABILITY_AVAILABILITY_INVALID",
        "availability must be available|planning_only|unavailable|unknown.",
        `${path}.availability`,
      ),
    );
  }
  if (
    isComputeRuntimeCapabilityName(c.name) &&
    c.availability === "available" &&
    !isV1ActiveComputeCapability(c.name)
  ) {
    out.push(
      diag(
        "Galerina_COMPUTE_CAPABILITY_V1_FREEZE",
        "Only ComputeRuntime may claim availability=available under the v1 freeze.",
        `${path}.availability`,
      ),
    );
  }
  return out;
}
