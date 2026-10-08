// hold-pin.ts — package side of the core-security HOLD rows.
//
// This package never admits SecretReference v0.2, never invents SecretTaint,
// never emits compiler-owned secret diagnostics, never creates secrets/checks/
// runtime directories, and never invents hardware-risk vocabulary.

export const CORE_SECURITY_HOLD_PIN_SCHEMA = "galerina.core-security.hold-pin.v1" as const;

export const CORE_SECURITY_HOLD_TOPICS = Object.freeze([
  "secret-model",
  "secret-flow",
  "secret-layout",
  "taint-flow",
  "hardware-risk",
] as const);

export type CoreSecurityHoldTopic = (typeof CORE_SECURITY_HOLD_TOPICS)[number];

export type CoreSecurityHoldRefusalCode =
  | "SEC_SECRET_REFERENCE_V02_FORBIDDEN"
  | "SEC_SECRET_VOCABULARY_FORBIDDEN"
  | "SEC_SECURE_STRING_UPGRADE_FORBIDDEN"
  | "SEC_PROTECTED_SECRET_FORBIDDEN"
  | "SEC_SAFE_SINK_FORBIDDEN"
  | "SEC_SERIALIZATION_MARKER_FORBIDDEN"
  | "SEC_SECRET_FLOW_FORBIDDEN"
  | "SEC_FUNGI_SECRET_EMIT_FORBIDDEN"
  | "SEC_SECRET_TAINT_FORBIDDEN"
  | "SEC_SECRET_LAYOUT_FORBIDDEN"
  | "SEC_TAINT_FLOW_DIAGNOSTICS_FORBIDDEN"
  | "SEC_HARDWARE_RISK_FORBIDDEN"
  | "SEC_HOLD_REQUEST_AUTHORITY_FIELD_PRESENT"
  | "SEC_HOLD_REQUEST_MALFORMED";

export interface CoreSecurityHoldRefusal {
  readonly kind: "REFUSED";
  readonly code: CoreSecurityHoldRefusalCode;
  readonly authorityReleased: false;
  readonly admissionAuthority: false;
}

export interface CoreSecurityHoldRequestV1 {
  readonly kind: "CORE_SECURITY_HOLD_REQUEST";
  readonly schema: typeof CORE_SECURITY_HOLD_PIN_SCHEMA;
  readonly status: "REQUESTED_NOT_ADMITTED";
  readonly topic: CoreSecurityHoldTopic;
  readonly requires: {
    readonly ownerDecision: true;
    readonly secretModelOwner: true;
    readonly compilerSecretDiagnostics: true;
    readonly hardwareRiskOwner: true;
  };
  readonly authorityReleased: false;
  readonly admissionAuthority: false;
}

export type CoreSecurityHoldRequestResult =
  | CoreSecurityHoldRequestV1
  | CoreSecurityHoldRefusal;

const AUTHORITY_KEYS: ReadonlySet<string> = new Set([
  "lease", "vokLease", "vokDecision", "decision", "grant", "receipt", "admission",
  "admissionToken", "capabilityToken", "executor", "dispatch", "allow", "authority",
  "kernel", "salt", "hmac", "taint", "hardwareRisk", "unwrap", "ProtectedSecret",
]);

const TOPIC_SET: ReadonlySet<string> = new Set(CORE_SECURITY_HOLD_TOPICS);

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

function refusal(code: CoreSecurityHoldRefusalCode): CoreSecurityHoldRefusal {
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
export function prepareCoreSecurityHoldRequest(input: unknown): CoreSecurityHoldRequestResult {
  if (hasAuthorityField(input, 0)) return refusal("SEC_HOLD_REQUEST_AUTHORITY_FIELD_PRESENT");
  if (!isPlainDataObject(input)) return refusal("SEC_HOLD_REQUEST_MALFORMED");
  const topic = input.topic;
  if (typeof topic !== "string" || !TOPIC_SET.has(topic)) {
    return refusal("SEC_HOLD_REQUEST_MALFORMED");
  }
  return Object.freeze({
    kind: "CORE_SECURITY_HOLD_REQUEST",
    schema: CORE_SECURITY_HOLD_PIN_SCHEMA,
    status: "REQUESTED_NOT_ADMITTED",
    topic: topic as CoreSecurityHoldTopic,
    requires: Object.freeze({
      ownerDecision: true,
      secretModelOwner: true,
      compilerSecretDiagnostics: true,
      hardwareRiskOwner: true,
    }),
    authorityReleased: false,
    admissionAuthority: false,
  });
}

export function admitSecretReferenceV02(_input: unknown): CoreSecurityHoldRefusal {
  return refusal("SEC_SECRET_REFERENCE_V02_FORBIDDEN");
}

export function defineSecretVocabulary(_input: unknown): CoreSecurityHoldRefusal {
  return refusal("SEC_SECRET_VOCABULARY_FORBIDDEN");
}

export function upgradeSecureStringReference(_input: unknown): CoreSecurityHoldRefusal {
  return refusal("SEC_SECURE_STRING_UPGRADE_FORBIDDEN");
}

export function admitProtectedSecretClass(_input: unknown): CoreSecurityHoldRefusal {
  return refusal("SEC_PROTECTED_SECRET_FORBIDDEN");
}

export function admitSecretSafeSink(_input: unknown): CoreSecurityHoldRefusal {
  return refusal("SEC_SAFE_SINK_FORBIDDEN");
}

export function addSecretReferenceProtectedMarker(_input: unknown): CoreSecurityHoldRefusal {
  return refusal("SEC_SERIALIZATION_MARKER_FORBIDDEN");
}

export function implementSecretSinkFlow(_input: unknown): CoreSecurityHoldRefusal {
  return refusal("SEC_SECRET_FLOW_FORBIDDEN");
}

export function emitFungiSecretDiagnostics(_input: unknown): CoreSecurityHoldRefusal {
  return refusal("SEC_FUNGI_SECRET_EMIT_FORBIDDEN");
}

export function admitSecretTaint(_input: unknown): CoreSecurityHoldRefusal {
  return refusal("SEC_SECRET_TAINT_FORBIDDEN");
}

export function createSecretLayoutDirs(_input: unknown): CoreSecurityHoldRefusal {
  return refusal("SEC_SECRET_LAYOUT_FORBIDDEN");
}

export function defineMaliciousTaintFlowDiagnostics(_input: unknown): CoreSecurityHoldRefusal {
  return refusal("SEC_TAINT_FLOW_DIAGNOSTICS_FORBIDDEN");
}

export function defineHardwareRiskReportInputs(_input: unknown): CoreSecurityHoldRefusal {
  return refusal("SEC_HARDWARE_RISK_FORBIDDEN");
}
