// hold-pin.ts — package side of the core-photonic HOLD rows.
//
// This package never admits a transport-mode enum, never ships POST-V1
// simulation APIs, never implements a v0.2 runtime planner, never rewrites
// C10 photonic diagnostic meanings, and never adds experimental transport
// or production-audit restrictions.

export const CORE_PHOTONIC_HOLD_PIN_SCHEMA = "galerina.core-photonic.hold-pin.v1" as const;

export const CORE_PHOTONIC_HOLD_TOPICS = Object.freeze([
  "post-v1-simulation",
  "optical-transport-mode",
  "v02-runtime-planner",
  "fungi-photonic-meanings",
  "experimental-transport",
] as const);

export type CorePhotonicHoldTopic = (typeof CORE_PHOTONIC_HOLD_TOPICS)[number];

export type CorePhotonicHoldRefusalCode =
  | "PHOTONIC_POST_V1_SIMULATION_FORBIDDEN"
  | "PHOTONIC_TRANSPORT_MODE_FORBIDDEN"
  | "PHOTONIC_RUNTIME_PLANNER_FORBIDDEN"
  | "PHOTONIC_FUNGI_MEANINGS_FORBIDDEN"
  | "PHOTONIC_EXPERIMENTAL_TRANSPORT_FORBIDDEN"
  | "PHOTONIC_HOLD_REQUEST_AUTHORITY_FIELD_PRESENT"
  | "PHOTONIC_HOLD_REQUEST_MALFORMED";

export interface CorePhotonicHoldRefusal {
  readonly kind: "REFUSED";
  readonly code: CorePhotonicHoldRefusalCode;
  readonly authorityReleased: false;
  readonly admissionAuthority: false;
}

export interface CorePhotonicHoldRequestV1 {
  readonly kind: "CORE_PHOTONIC_HOLD_REQUEST";
  readonly schema: typeof CORE_PHOTONIC_HOLD_PIN_SCHEMA;
  readonly status: "REQUESTED_NOT_ADMITTED";
  readonly topic: CorePhotonicHoldTopic;
  readonly requires: {
    readonly ownerDecision: true;
    readonly ownerV1ShipDecision: true;
    readonly crossPackageTransportAdjudication: true;
    readonly diagnosticMeaningOwner: true;
  };
  readonly authorityReleased: false;
  readonly admissionAuthority: false;
}

export type CorePhotonicHoldRequestResult =
  | CorePhotonicHoldRequestV1
  | CorePhotonicHoldRefusal;

const AUTHORITY_KEYS: ReadonlySet<string> = new Set([
  "lease", "vokLease", "vokDecision", "decision", "grant", "receipt", "admission",
  "admissionToken", "capabilityToken", "executor", "dispatch", "allow", "authority",
  "kernel", "transportMode", "experimentalRouting", "OpticalTransportMode",
  "PhotonicRuntimeTarget", "PhotonicExecutionPlan", "PhotonicCapability",
]);

const TOPIC_SET: ReadonlySet<string> = new Set(CORE_PHOTONIC_HOLD_TOPICS);

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

function refusal(code: CorePhotonicHoldRefusalCode): CorePhotonicHoldRefusal {
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
export function prepareCorePhotonicHoldRequest(input: unknown): CorePhotonicHoldRequestResult {
  if (hasAuthorityField(input, 0)) return refusal("PHOTONIC_HOLD_REQUEST_AUTHORITY_FIELD_PRESENT");
  if (!isPlainDataObject(input)) return refusal("PHOTONIC_HOLD_REQUEST_MALFORMED");
  const topic = input.topic;
  if (typeof topic !== "string" || !TOPIC_SET.has(topic)) {
    return refusal("PHOTONIC_HOLD_REQUEST_MALFORMED");
  }
  return Object.freeze({
    kind: "CORE_PHOTONIC_HOLD_REQUEST",
    schema: CORE_PHOTONIC_HOLD_PIN_SCHEMA,
    status: "REQUESTED_NOT_ADMITTED",
    topic: topic as CorePhotonicHoldTopic,
    requires: Object.freeze({
      ownerDecision: true,
      ownerV1ShipDecision: true,
      crossPackageTransportAdjudication: true,
      diagnosticMeaningOwner: true,
    }),
    authorityReleased: false,
    admissionAuthority: false,
  });
}

export function implementPostV1PhotonicSimulation(_input: unknown): CorePhotonicHoldRefusal {
  return refusal("PHOTONIC_POST_V1_SIMULATION_FORBIDDEN");
}

export function admitOpticalTransportMode(_input: unknown): CorePhotonicHoldRefusal {
  return refusal("PHOTONIC_TRANSPORT_MODE_FORBIDDEN");
}

export function implementPhotonicRuntimePlanner(_input: unknown): CorePhotonicHoldRefusal {
  return refusal("PHOTONIC_RUNTIME_PLANNER_FORBIDDEN");
}

export function rewriteFungiPhotonicMeanings(_input: unknown): CorePhotonicHoldRefusal {
  return refusal("PHOTONIC_FUNGI_MEANINGS_FORBIDDEN");
}

export function addExperimentalPhotonicTransport(_input: unknown): CorePhotonicHoldRefusal {
  return refusal("PHOTONIC_EXPERIMENTAL_TRANSPORT_FORBIDDEN");
}
