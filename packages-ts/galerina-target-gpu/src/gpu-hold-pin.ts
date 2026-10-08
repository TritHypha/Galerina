// gpu-hold-pin.ts — package side of the target-gpu HOLD rows.
//
// Planning only. This package never admits GPU hardware, never dispatches a
// kernel, never executes fallback, never claims physical evidence, and never
// promotes a Fungi GPU family into the live diagnostic set.
// Owner O1 (2026-10-06): POST-V1 stays parked until v1 ships.

import { PROPOSED_FUNGI_GPU_MAPPING } from "./proposed-fungi-gpu-mapping.js";

export const GPU_HOLD_PIN_SCHEMA = "galerina.target-gpu.hold-pin.v1" as const;

export type GpuHoldRefusalCode =
  | "GPU_PHYSICAL_ADMISSION_FORBIDDEN"
  | "GPU_KERNEL_DISPATCH_FORBIDDEN"
  | "GPU_FALLBACK_EXECUTE_FORBIDDEN"
  | "GPU_PHYSICAL_EVIDENCE_FORBIDDEN"
  | "GPU_FUNGI_PROMOTION_FORBIDDEN"
  | "GPU_POST_V1_CONTRACT_FORBIDDEN"
  | "GPU_HOLD_REQUEST_AUTHORITY_FIELD_PRESENT"
  | "GPU_HOLD_REQUEST_MALFORMED";

export interface GpuHoldRefusal {
  readonly kind: "REFUSED";
  readonly code: GpuHoldRefusalCode;
  readonly authorityReleased: false;
  readonly admissionAuthority: false;
}

export interface GpuAdmissionRequestV1 {
  readonly kind: "GPU_ADMISSION_REQUEST";
  readonly schema: typeof GPU_HOLD_PIN_SCHEMA;
  readonly status: "REQUESTED_NOT_ADMITTED";
  readonly backend: string;
  readonly flow: string;
  readonly operations: readonly string[];
  readonly requires: {
    readonly physicalGpuEvidence: true;
    readonly coreComputeSchemaOwner: true;
    readonly ownerV1ShipDecision: true;
    readonly currentVokReceipt: true;
  };
  readonly authorityReleased: false;
  readonly admissionAuthority: false;
}

export type GpuAdmissionRequestResult = GpuAdmissionRequestV1 | GpuHoldRefusal;

const AUTHORITY_KEYS: ReadonlySet<string> = new Set([
  "lease", "vokLease", "vokDecision", "decision", "grant", "receipt", "admission",
  "admissionToken", "capabilityToken", "executor", "dispatch", "allow", "authority",
]);

const MAX_GPU_ARRAY_ITEMS = 1024;
const MAX_GPU_STRING_LENGTH = 512;

function isPlainDataObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function hasAuthorityField(value: unknown, depth: number): boolean {
  if (depth > 8 || value === null || typeof value !== "object") return false;
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key === "string" && AUTHORITY_KEYS.has(key)) return true;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !("value" in descriptor)) return true;
    if (hasAuthorityField(descriptor.value, depth + 1)) return true;
  }
  return false;
}

function boundedString(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_GPU_STRING_LENGTH) return null;
  if (value.trim().length === 0) return null;
  return value;
}

function boundedStringArray(value: unknown): readonly string[] | null {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) return null;
  if (value.length === 0 || value.length > MAX_GPU_ARRAY_ITEMS) return null;
  const copy: string[] = [];
  for (const item of value) {
    const decoded = boundedString(item);
    if (decoded === null) return null;
    copy.push(decoded);
  }
  return Object.freeze(copy);
}

function refusal(code: GpuHoldRefusalCode): GpuHoldRefusal {
  return Object.freeze({
    kind: "REFUSED",
    code,
    authorityReleased: false,
    admissionAuthority: false,
  });
}

/**
 * Package a well-formed GPU admission *request*. Never admits.
 * Status is always REQUESTED_NOT_ADMITTED.
 */
export function prepareGpuAdmissionRequest(input: unknown): GpuAdmissionRequestResult {
  if (hasAuthorityField(input, 0)) return refusal("GPU_HOLD_REQUEST_AUTHORITY_FIELD_PRESENT");
  if (!isPlainDataObject(input)) return refusal("GPU_HOLD_REQUEST_MALFORMED");
  const backend = boundedString(input.backend);
  const flow = boundedString(input.flow);
  const operations = boundedStringArray(input.operations);
  if (backend === null || flow === null || operations === null) {
    return refusal("GPU_HOLD_REQUEST_MALFORMED");
  }
  return Object.freeze({
    kind: "GPU_ADMISSION_REQUEST",
    schema: GPU_HOLD_PIN_SCHEMA,
    status: "REQUESTED_NOT_ADMITTED",
    backend,
    flow,
    operations,
    requires: Object.freeze({
      physicalGpuEvidence: true,
      coreComputeSchemaOwner: true,
      ownerV1ShipDecision: true,
      currentVokReceipt: true,
    }),
    authorityReleased: false,
    admissionAuthority: false,
  });
}

/** Physical GPU capability admission is not this package. Every input is refused. */
export function admitGpuCapability(_input: unknown): GpuHoldRefusal {
  return refusal("GPU_PHYSICAL_ADMISSION_FORBIDDEN");
}

/** Kernel dispatch is POST-V1 and not this package. Every input is refused. */
export function dispatchGpuKernel(_input: unknown): GpuHoldRefusal {
  return refusal("GPU_KERNEL_DISPATCH_FORBIDDEN");
}

/** Fallback execution is owned by core-compute. Every input is refused. */
export function executeGpuFallback(_input: unknown): GpuHoldRefusal {
  return refusal("GPU_FALLBACK_EXECUTE_FORBIDDEN");
}

/** Physical GPU evidence is not this package. Every input is refused. */
export function claimPhysicalGpuEvidence(_input: unknown): GpuHoldRefusal {
  return refusal("GPU_PHYSICAL_EVIDENCE_FORBIDDEN");
}

/** FUNGI-CATEGORY-NNN ownership is not this package. Every input is refused. */
export function promoteGpuDiagnosticsToFungi(_input: unknown = PROPOSED_FUNGI_GPU_MAPPING): GpuHoldRefusal {
  return refusal("GPU_FUNGI_PROMOTION_FORBIDDEN");
}

/** Owner O1: POST-V1 contracts stay parked. Every input is refused. */
export function implementPostV1GpuContract(_input: unknown): GpuHoldRefusal {
  return refusal("GPU_POST_V1_CONTRACT_FORBIDDEN");
}
