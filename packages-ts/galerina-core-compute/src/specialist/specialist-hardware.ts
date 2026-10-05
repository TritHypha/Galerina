// Specialist AI hardware target taxonomy + related planning fields (TODO pass, Grok 2026-10-05).
// Zero-trust defaults, owner may revisit. Planning vocabulary only: nothing here admits
// execution, selects a live backend, or weakens the v1 CPU/WASM freeze.

import type { ComputeDiagnostic } from "../index.js";

/** Specialist AI/accelerator hardware classes named by the TODO taxonomy row. */
export const SPECIALIST_HARDWARE_CLASSES = Object.freeze([
  "cpu",
  "gpu",
  "npu",
  "tpu",
  "vpu",
  "fpga",
  "asic",
] as const);

export type SpecialistHardwareClass = (typeof SPECIALIST_HARDWARE_CLASSES)[number];

/** V1-active classes that may be recommended for execution planning today. */
export const V1_ACTIVE_SPECIALIST_CLASSES = Object.freeze(["cpu"] as const);

export type SpecialistHardwareAvailability = "available" | "planning_only" | "unavailable" | "unknown";

export type SpecialistDataSensitivity = "public" | "internal" | "confidential" | "restricted" | "secret";

export interface SpecialistHardwareTarget {
  readonly schema: "galerina.compute.specialist-hardware.v1";
  readonly id: string;
  readonly hardwareClass: SpecialistHardwareClass;
  /** Vendor/plugin label (e.g. "generic", "cuda", "rocm"); never an authority claim. */
  readonly vendor: string;
  readonly availability: SpecialistHardwareAvailability;
  /** Max sensitivity this target may process; omit = may process nothing (fail closed). */
  readonly maxDataSensitivity?: SpecialistDataSensitivity;
  readonly auditRequired: true;
  readonly features: readonly string[];
}

export interface SpecialistComputeCapabilityFields {
  readonly hardwareClass: SpecialistHardwareClass;
  readonly parallelism?: number;
  readonly memoryBytes?: number;
  readonly precision?: "fp32" | "fp16" | "bf16" | "int8" | "int4" | "binary" | "ternary" | "mixed";
}

export interface SpecialistComputeAuditFields {
  readonly eventKind: "plan" | "select" | "fallback" | "refuse";
  readonly hardwareClass: SpecialistHardwareClass;
  readonly targetId?: string;
  /** Fixed codes only; free-text reasons must not be copied here. */
  readonly diagnosticCodes: readonly string[];
}

const SENSITIVITY_RANK: Readonly<Record<SpecialistDataSensitivity, number>> = Object.freeze({
  public: 0,
  internal: 1,
  confidential: 2,
  restricted: 3,
  secret: 4,
});

const ID = /^[A-Za-z][A-Za-z0-9._-]{0,63}$/;
const VENDOR = /^[A-Za-z][A-Za-z0-9._-]{0,31}$/;
const FEATURE = /^[A-Za-z][A-Za-z0-9._-]{0,63}$/;

function diag(code: string, message: string, path?: string): ComputeDiagnostic {
  return Object.freeze({ code, severity: "error" as const, message, ...(path === undefined ? {} : { path }) });
}

export function isSpecialistHardwareClass(value: unknown): value is SpecialistHardwareClass {
  return typeof value === "string" && (SPECIALIST_HARDWARE_CLASSES as readonly string[]).includes(value);
}

export function isV1ActiveSpecialistClass(value: SpecialistHardwareClass): boolean {
  return (V1_ACTIVE_SPECIALIST_CLASSES as readonly string[]).includes(value);
}

/**
 * Validate a specialist hardware target. Fail closed: unknown classes, missing audit,
 * non-cpu "available" claims, and over-sensitive caps are refused.
 */
export function validateSpecialistHardwareTarget(value: unknown, path = "target"): readonly ComputeDiagnostic[] {
  const out: ComputeDiagnostic[] = [];
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return [diag("Galerina_COMPUTE_SPECIALIST_TARGET_INVALID", "Specialist hardware target must be a plain record.", path)];
  }
  const t = value as Record<string, unknown>;
  for (const key of Object.keys(t)) {
    if (!["schema", "id", "hardwareClass", "vendor", "availability", "maxDataSensitivity", "auditRequired", "features"].includes(key)) {
      out.push(diag("Galerina_COMPUTE_SPECIALIST_FIELD_UNKNOWN", "Specialist hardware targets may only carry known fields.", path)); break;
    }
  }
  if (t.schema !== "galerina.compute.specialist-hardware.v1") {
    out.push(diag("Galerina_COMPUTE_SPECIALIST_SCHEMA_INVALID", "schema must be galerina.compute.specialist-hardware.v1.", `${path}.schema`));
  }
  if (typeof t.id !== "string" || !ID.test(t.id)) {
    out.push(diag("Galerina_COMPUTE_SPECIALIST_ID_INVALID", "id must be a short dotted identifier.", `${path}.id`));
  }
  if (!isSpecialistHardwareClass(t.hardwareClass)) {
    out.push(diag("Galerina_COMPUTE_SPECIALIST_CLASS_INVALID", `hardwareClass must be one of: ${SPECIALIST_HARDWARE_CLASSES.join(", ")}.`, `${path}.hardwareClass`));
  }
  if (typeof t.vendor !== "string" || !VENDOR.test(t.vendor)) {
    out.push(diag("Galerina_COMPUTE_SPECIALIST_VENDOR_INVALID", "vendor must be a short identifier.", `${path}.vendor`));
  }
  const availabilityOk = t.availability === "available" || t.availability === "planning_only" || t.availability === "unavailable" || t.availability === "unknown";
  if (!availabilityOk) {
    out.push(diag("Galerina_COMPUTE_SPECIALIST_AVAILABILITY_INVALID", "availability must be available|planning_only|unavailable|unknown.", `${path}.availability`));
  }
  if (t.auditRequired !== true) {
    out.push(diag("Galerina_COMPUTE_SPECIALIST_AUDIT_REQUIRED", "auditRequired must be true.", `${path}.auditRequired`));
  }
  if (t.maxDataSensitivity !== undefined) {
    if (typeof t.maxDataSensitivity !== "string" || !(t.maxDataSensitivity in SENSITIVITY_RANK)) {
      out.push(diag("Galerina_COMPUTE_SPECIALIST_SENSITIVITY_INVALID", "maxDataSensitivity is not a known sensitivity.", `${path}.maxDataSensitivity`));
    }
  }
  if (!Array.isArray(t.features) || t.features.some((f) => typeof f !== "string" || !FEATURE.test(f))) {
    out.push(diag("Galerina_COMPUTE_SPECIALIST_FEATURES_INVALID", "features must be an array of short identifiers.", `${path}.features`));
  } else if (new Set(t.features as string[]).size !== (t.features as string[]).length) {
    out.push(diag("Galerina_COMPUTE_SPECIALIST_FEATURES_INVALID", "features must be unique.", `${path}.features`));
  }
  // Zero-trust: only cpu may claim availability "available" under the v1 freeze.
  if (t.availability === "available" && isSpecialistHardwareClass(t.hardwareClass) && !isV1ActiveSpecialistClass(t.hardwareClass)) {
    out.push(diag("Galerina_COMPUTE_SPECIALIST_V1_FREEZE", "Non-CPU specialist hardware may not claim availability \"available\" under the v1 freeze.", `${path}.availability`));
  }
  return out;
}

/** True only when the target is valid and may process the given sensitivity (omit max = nothing). */
export function specialistTargetAllowsSensitivity(target: SpecialistHardwareTarget, sensitivity: SpecialistDataSensitivity): boolean {
  if (validateSpecialistHardwareTarget(target).length > 0) return false;
  if (target.maxDataSensitivity === undefined) return false;
  return SENSITIVITY_RANK[sensitivity] <= SENSITIVITY_RANK[target.maxDataSensitivity];
}

export function freezeSpecialistHardwareTarget(input: SpecialistHardwareTarget): SpecialistHardwareTarget {
  return Object.freeze({
    schema: "galerina.compute.specialist-hardware.v1",
    id: input.id,
    hardwareClass: input.hardwareClass,
    vendor: input.vendor,
    availability: input.availability,
    ...(input.maxDataSensitivity === undefined ? {} : { maxDataSensitivity: input.maxDataSensitivity }),
    auditRequired: true as const,
    features: Object.freeze([...input.features]),
  });
}