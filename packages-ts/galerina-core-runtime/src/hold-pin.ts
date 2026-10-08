// hold-pin.ts — package side of the core-runtime HOLD rows.
//
// This package never runs a general RD-0656 VEO linker, never mints a live
// macOS W^X receipt, never claims physical media wipe, never registers 8/16-trit
// v1 profiles, never selects binary same-semantics, and never assigns the
// alternative-attempt budget owner.

export const CORE_RUNTIME_HOLD_PIN_SCHEMA = "galerina.core-runtime.hold-pin.v1" as const;

export const CORE_RUNTIME_HOLD_TOPICS = Object.freeze([
  "veo-general-linker",
  "macos-wx-receipt",
  "physical-erasure",
  "trit-width-8-16",
  "binary-same-semantics",
  "retry-budget-owner",
] as const);

export type CoreRuntimeHoldTopic = (typeof CORE_RUNTIME_HOLD_TOPICS)[number];

export type CoreRuntimeHoldRefusalCode =
  | "RT_VEO_GENERAL_LINKER_FORBIDDEN"
  | "RT_MACOS_WX_RECEIPT_FORBIDDEN"
  | "RT_PHYSICAL_ERASURE_FORBIDDEN"
  | "RT_TRIT_WIDTH_8_16_FORBIDDEN"
  | "RT_BINARY_SAME_SEMANTICS_FORBIDDEN"
  | "RT_RETRY_BUDGET_OWNER_FORBIDDEN"
  | "RT_HOLD_REQUEST_AUTHORITY_FIELD_PRESENT"
  | "RT_HOLD_REQUEST_MALFORMED";

export interface CoreRuntimeHoldRefusal {
  readonly kind: "REFUSED";
  readonly code: CoreRuntimeHoldRefusalCode;
  readonly authorityReleased: false;
  readonly admissionAuthority: false;
}

export interface CoreRuntimeHoldRequestV1 {
  readonly kind: "CORE_RUNTIME_HOLD_REQUEST";
  readonly schema: typeof CORE_RUNTIME_HOLD_PIN_SCHEMA;
  readonly status: "REQUESTED_NOT_ADMITTED";
  readonly topic: CoreRuntimeHoldTopic;
  readonly requires: {
    readonly ownerDecision: true;
    readonly veoLinkerOwner: true;
    readonly macosLiveReceipt: true;
    readonly physicalErasureProof: true;
  };
  readonly authorityReleased: false;
  readonly admissionAuthority: false;
}

export type CoreRuntimeHoldRequestResult =
  | CoreRuntimeHoldRequestV1
  | CoreRuntimeHoldRefusal;

const AUTHORITY_KEYS: ReadonlySet<string> = new Set([
  "lease", "vokLease", "vokDecision", "decision", "grant", "receipt", "admission",
  "admissionToken", "capabilityToken", "executor", "dispatch", "allow", "authority",
  "kernel", "linker", "imports", "relocations", "mediaWipe", "tritWidth8", "tritWidth16",
]);

const TOPIC_SET: ReadonlySet<string> = new Set(CORE_RUNTIME_HOLD_TOPICS);

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

function refusal(code: CoreRuntimeHoldRefusalCode): CoreRuntimeHoldRefusal {
  return Object.freeze({
    kind: "REFUSED",
    code,
    authorityReleased: false,
    admissionAuthority: false,
  });
}

/**
 * Package a HOLD-row *request*. Never admits the act.
 * Status is always REQUESTED_NOT_ADMITTED.
 */
export function prepareCoreRuntimeHoldRequest(input: unknown): CoreRuntimeHoldRequestResult {
  if (hasAuthorityField(input, 0)) return refusal("RT_HOLD_REQUEST_AUTHORITY_FIELD_PRESENT");
  if (!isPlainDataObject(input)) return refusal("RT_HOLD_REQUEST_MALFORMED");
  const topic = input.topic;
  if (typeof topic !== "string" || !TOPIC_SET.has(topic)) {
    return refusal("RT_HOLD_REQUEST_MALFORMED");
  }
  return Object.freeze({
    kind: "CORE_RUNTIME_HOLD_REQUEST",
    schema: CORE_RUNTIME_HOLD_PIN_SCHEMA,
    status: "REQUESTED_NOT_ADMITTED",
    topic: topic as CoreRuntimeHoldTopic,
    requires: Object.freeze({
      ownerDecision: true,
      veoLinkerOwner: true,
      macosLiveReceipt: true,
      physicalErasureProof: true,
    }),
    authorityReleased: false,
    admissionAuthority: false,
  });
}

export function runGeneralVeoLinker(_input: unknown): CoreRuntimeHoldRefusal {
  return refusal("RT_VEO_GENERAL_LINKER_FORBIDDEN");
}

export function obtainMacosWxLiveReceipt(_input: unknown): CoreRuntimeHoldRefusal {
  return refusal("RT_MACOS_WX_RECEIPT_FORBIDDEN");
}

export function claimPhysicalMediaWipe(_input: unknown): CoreRuntimeHoldRefusal {
  return refusal("RT_PHYSICAL_ERASURE_FORBIDDEN");
}

export function registerTritWidths8And16(_input: unknown): CoreRuntimeHoldRefusal {
  return refusal("RT_TRIT_WIDTH_8_16_FORBIDDEN");
}

export function selectBinarySameSemantics(_input: unknown): CoreRuntimeHoldRefusal {
  return refusal("RT_BINARY_SAME_SEMANTICS_FORBIDDEN");
}

export function assignAlternativeAttemptBudgetOwner(_input: unknown): CoreRuntimeHoldRefusal {
  return refusal("RT_RETRY_BUDGET_OWNER_FORBIDDEN");
}
