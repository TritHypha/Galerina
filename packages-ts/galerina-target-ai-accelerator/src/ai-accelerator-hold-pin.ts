// ai-accelerator-hold-pin.ts — package side of the target-ai-accelerator HOLD rows.
//
// Planning only. This package never admits hardware, never adds parked kinds
// to the live kind set, never emits isolation reports, and never ships
// POST-V1 HBM/topology report examples.
// Owner O1 (2026-10-06): POST-V1 stays parked until v1 ships.

export const AI_ACCELERATOR_HOLD_PIN_SCHEMA = "galerina.target-ai-accelerator.hold-pin.v1" as const;

export const PARKED_AI_ACCELERATOR_KINDS = Object.freeze(["vpu", "fpga", "asic"] as const);
export const PARKED_AI_ACCELERATOR_TOPOLOGY_TOKENS = Object.freeze(["mesh", "isolation"] as const);

export const ADMITTED_AI_ACCELERATOR_REQUEST_KINDS = Object.freeze([
  "npu", "tpu", "ane", "dsp", "ai-chip", "inference-accelerator", "training-accelerator", "plan-only",
] as const);

export type AiAcceleratorHoldRefusalCode =
  | "AA_PHYSICAL_ADMISSION_FORBIDDEN"
  | "AA_PHYSICAL_EVIDENCE_FORBIDDEN"
  | "AA_KERNEL_DISPATCH_FORBIDDEN"
  | "AA_POST_V1_VPU_FPGA_ASIC_FORBIDDEN"
  | "AA_POST_V1_ISOLATION_REPORT_FORBIDDEN"
  | "AA_POST_V1_HBM_TOPOLOGY_REPORT_FORBIDDEN"
  | "AA_HOLD_REQUEST_AUTHORITY_FIELD_PRESENT"
  | "AA_HOLD_REQUEST_MALFORMED";

export interface AiAcceleratorHoldRefusal {
  readonly kind: "REFUSED";
  readonly code: AiAcceleratorHoldRefusalCode;
  readonly authorityReleased: false;
  readonly admissionAuthority: false;
}

export interface AiAcceleratorAdmissionRequestV1 {
  readonly kind: "AI_ACCELERATOR_ADMISSION_REQUEST";
  readonly schema: typeof AI_ACCELERATOR_HOLD_PIN_SCHEMA;
  readonly status: "REQUESTED_NOT_ADMITTED";
  readonly name: string;
  readonly acceleratorKind: string;
  readonly requires: {
    readonly ownerV1ShipDecision: true;
    readonly physicalAcceleratorEvidence: true;
    readonly currentVokReceipt: true;
  };
  readonly authorityReleased: false;
  readonly admissionAuthority: false;
}

export type AiAcceleratorAdmissionRequestResult =
  | AiAcceleratorAdmissionRequestV1
  | AiAcceleratorHoldRefusal;

const AUTHORITY_KEYS: ReadonlySet<string> = new Set([
  "lease", "vokLease", "vokDecision", "decision", "grant", "receipt", "admission",
  "admissionToken", "capabilityToken", "executor", "dispatch", "allow", "authority",
]);

const ISOLATION_KEYS: ReadonlySet<string> = new Set([
  "isolation", "isolationLevel", "isolation_level",
]);

const PARKED_KIND_SET: ReadonlySet<string> = new Set(PARKED_AI_ACCELERATOR_KINDS);
const PARKED_TOPOLOGY_SET: ReadonlySet<string> = new Set(PARKED_AI_ACCELERATOR_TOPOLOGY_TOKENS);
const ADMITTED_KIND_SET: ReadonlySet<string> = new Set(ADMITTED_AI_ACCELERATOR_REQUEST_KINDS);

const MAX_STRING_LENGTH = 2048;

function isPlainDataObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function hasNamedKey(value: unknown, keys: ReadonlySet<string>, depth: number): boolean {
  if (depth > 8 || value === null || typeof value !== "object") return false;
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key === "string" && keys.has(key)) return true;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !("value" in descriptor)) return true;
    if (hasNamedKey(descriptor.value, keys, depth + 1)) return true;
  }
  return false;
}

function boundedString(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_STRING_LENGTH) return null;
  if (value.trim().length === 0) return null;
  return value;
}

function refusal(code: AiAcceleratorHoldRefusalCode): AiAcceleratorHoldRefusal {
  return Object.freeze({
    kind: "REFUSED",
    code,
    authorityReleased: false,
    admissionAuthority: false,
  });
}

/**
 * Package a well-formed accelerator admission *request*. Never admits.
 * Status is always REQUESTED_NOT_ADMITTED. Parked kinds are refused here.
 */
export function prepareAiAcceleratorAdmissionRequest(input: unknown): AiAcceleratorAdmissionRequestResult {
  if (hasNamedKey(input, AUTHORITY_KEYS, 0)) return refusal("AA_HOLD_REQUEST_AUTHORITY_FIELD_PRESENT");
  if (hasNamedKey(input, ISOLATION_KEYS, 0)) return refusal("AA_POST_V1_ISOLATION_REPORT_FORBIDDEN");
  if (!isPlainDataObject(input)) return refusal("AA_HOLD_REQUEST_MALFORMED");
  const name = boundedString(input.name);
  const acceleratorKind = boundedString(input.kind);
  if (name === null || acceleratorKind === null) return refusal("AA_HOLD_REQUEST_MALFORMED");
  if (PARKED_KIND_SET.has(acceleratorKind)) return refusal("AA_POST_V1_VPU_FPGA_ASIC_FORBIDDEN");
  if (!ADMITTED_KIND_SET.has(acceleratorKind)) return refusal("AA_HOLD_REQUEST_MALFORMED");
  if (typeof input.topology === "string" && PARKED_TOPOLOGY_SET.has(input.topology)) {
    return refusal("AA_POST_V1_HBM_TOPOLOGY_REPORT_FORBIDDEN");
  }
  return Object.freeze({
    kind: "AI_ACCELERATOR_ADMISSION_REQUEST",
    schema: AI_ACCELERATOR_HOLD_PIN_SCHEMA,
    status: "REQUESTED_NOT_ADMITTED",
    name,
    acceleratorKind,
    requires: Object.freeze({
      ownerV1ShipDecision: true,
      physicalAcceleratorEvidence: true,
      currentVokReceipt: true,
    }),
    authorityReleased: false,
    admissionAuthority: false,
  });
}

/** Physical accelerator admission is not this package. Every input is refused. */
export function admitAiAcceleratorCapability(_input: unknown): AiAcceleratorHoldRefusal {
  return refusal("AA_PHYSICAL_ADMISSION_FORBIDDEN");
}

/** Physical evidence is not this package. Every input is refused. */
export function claimPhysicalAcceleratorEvidence(_input: unknown): AiAcceleratorHoldRefusal {
  return refusal("AA_PHYSICAL_EVIDENCE_FORBIDDEN");
}

/** Kernel dispatch is not this package. Every input is refused. */
export function dispatchAiAcceleratorKernel(_input: unknown): AiAcceleratorHoldRefusal {
  return refusal("AA_KERNEL_DISPATCH_FORBIDDEN");
}

/** Owner O1: VPU/FPGA/ASIC planning stays parked. Every input is refused. */
export function implementPostV1VpuFpgaAsic(_input: unknown): AiAcceleratorHoldRefusal {
  return refusal("AA_POST_V1_VPU_FPGA_ASIC_FORBIDDEN");
}

/** Owner O1: isolation reports stay parked. Every input is refused. */
export function implementPostV1IsolationReport(_input: unknown): AiAcceleratorHoldRefusal {
  return refusal("AA_POST_V1_ISOLATION_REPORT_FORBIDDEN");
}

/** Owner O1: HBM and topology report examples stay parked. Every input is refused. */
export function implementPostV1HbmTopologyReport(_input: unknown): AiAcceleratorHoldRefusal {
  return refusal("AA_POST_V1_HBM_TOPOLOGY_REPORT_FORBIDDEN");
}
