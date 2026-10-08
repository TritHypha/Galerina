// hold-pin.ts — package side of the core-config HOLD row.
//
// This package never splits src/index.ts into environment/secrets/loaders/types
// without an RD-1285 receipt, never admits file/secretStore/runtimeInjected
// secret sources, and never admits underscore secret categories.

export const CORE_CONFIG_HOLD_PIN_SCHEMA = "galerina.core-config.hold-pin.v1" as const;

export const CORE_CONFIG_HOLD_TOPICS = Object.freeze([
  "internal-dir-split",
  "secret-source-file-store",
  "underscore-categories",
] as const);

export type CoreConfigHoldTopic = (typeof CORE_CONFIG_HOLD_TOPICS)[number];

export type CoreConfigHoldRefusalCode =
  | "CONFIG_INTERNAL_DIR_SPLIT_FORBIDDEN"
  | "CONFIG_UNADMITTED_SECRET_SOURCE_FORBIDDEN"
  | "CONFIG_UNDERSCORE_CATEGORY_FORBIDDEN"
  | "CONFIG_HOLD_REQUEST_AUTHORITY_FIELD_PRESENT"
  | "CONFIG_HOLD_REQUEST_MALFORMED";

export interface CoreConfigHoldRefusal {
  readonly kind: "REFUSED";
  readonly code: CoreConfigHoldRefusalCode;
  readonly authorityReleased: false;
  readonly admissionAuthority: false;
}

export interface CoreConfigHoldRequestV1 {
  readonly kind: "CORE_CONFIG_HOLD_REQUEST";
  readonly schema: typeof CORE_CONFIG_HOLD_PIN_SCHEMA;
  readonly status: "REQUESTED_NOT_ADMITTED";
  readonly topic: CoreConfigHoldTopic;
  readonly requires: {
    readonly ownerDecision: true;
    readonly rd1285SplitReceipt: true;
  };
  readonly authorityReleased: false;
  readonly admissionAuthority: false;
}

export type CoreConfigHoldRequestResult =
  | CoreConfigHoldRequestV1
  | CoreConfigHoldRefusal;

const AUTHORITY_KEYS: ReadonlySet<string> = new Set([
  "lease", "vokLease", "vokDecision", "decision", "grant", "receipt", "admission",
  "admissionToken", "capabilityToken", "executor", "dispatch", "allow", "authority",
  "kernel", "secretStore", "runtimeInjected", "plaintext",
]);

const TOPIC_SET: ReadonlySet<string> = new Set(CORE_CONFIG_HOLD_TOPICS);

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

function refusal(code: CoreConfigHoldRefusalCode): CoreConfigHoldRefusal {
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
export function prepareCoreConfigHoldRequest(input: unknown): CoreConfigHoldRequestResult {
  if (hasAuthorityField(input, 0)) return refusal("CONFIG_HOLD_REQUEST_AUTHORITY_FIELD_PRESENT");
  if (!isPlainDataObject(input)) return refusal("CONFIG_HOLD_REQUEST_MALFORMED");
  const topic = input.topic;
  if (typeof topic !== "string" || !TOPIC_SET.has(topic)) {
    return refusal("CONFIG_HOLD_REQUEST_MALFORMED");
  }
  return Object.freeze({
    kind: "CORE_CONFIG_HOLD_REQUEST",
    schema: CORE_CONFIG_HOLD_PIN_SCHEMA,
    status: "REQUESTED_NOT_ADMITTED",
    topic: topic as CoreConfigHoldTopic,
    requires: Object.freeze({
      ownerDecision: true,
      rd1285SplitReceipt: true,
    }),
    authorityReleased: false,
    admissionAuthority: false,
  });
}

export function splitInternalConfigDirs(_input: unknown): CoreConfigHoldRefusal {
  return refusal("CONFIG_INTERNAL_DIR_SPLIT_FORBIDDEN");
}

export function admitFileSecretStoreRuntimeInjected(_input: unknown): CoreConfigHoldRefusal {
  return refusal("CONFIG_UNADMITTED_SECRET_SOURCE_FORBIDDEN");
}

export function admitUnderscoreSecretCategories(_input: unknown): CoreConfigHoldRefusal {
  return refusal("CONFIG_UNDERSCORE_CATEGORY_FORBIDDEN");
}
