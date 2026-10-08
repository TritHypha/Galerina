// hold-pin.ts - package side of the core-compute HOLD row.
//
// This package never admits a quantum RuntimeTarget, never implements
// quantum planning rules, and never executes quantum compute. The closed
// 11-value RuntimeTarget vocabulary stays cpu|node|wasm|browser-wasm|wasi|
// gpu|optical_io|photonic|native|serverless|edge.

export const CORE_COMPUTE_HOLD_PIN_SCHEMA = "galerina.core-compute.hold-pin.v1" as const;

export const CORE_COMPUTE_HOLD_TOPICS = Object.freeze([
  "quantum-target",
  "quantum-planning-rules",
  "quantum-execution",
] as const);

export type CoreComputeHoldTopic = (typeof CORE_COMPUTE_HOLD_TOPICS)[number];

export type CoreComputeHoldRefusalCode =
  | "COMPUTE_QUANTUM_TARGET_FORBIDDEN"
  | "COMPUTE_QUANTUM_PLANNING_FORBIDDEN"
  | "COMPUTE_QUANTUM_EXECUTION_FORBIDDEN"
  | "COMPUTE_HOLD_REQUEST_AUTHORITY_FIELD_PRESENT"
  | "COMPUTE_HOLD_REQUEST_MALFORMED";

export interface CoreComputeHoldRefusal {
  readonly kind: "REFUSED";
  readonly code: CoreComputeHoldRefusalCode;
  readonly authorityReleased: false;
  readonly admissionAuthority: false;
}

export interface CoreComputeHoldRequestV1 {
  readonly kind: "CORE_COMPUTE_HOLD_REQUEST";
  readonly schema: typeof CORE_COMPUTE_HOLD_PIN_SCHEMA;
  readonly status: "REQUESTED_NOT_ADMITTED";
  readonly topic: CoreComputeHoldTopic;
  readonly requires: {
    readonly ownerDecision: true;
    readonly ownerV1ShipDecision: true;
  };
  readonly authorityReleased: false;
  readonly admissionAuthority: false;
}

export type CoreComputeHoldRequestResult =
  | CoreComputeHoldRequestV1
  | CoreComputeHoldRefusal;

const AUTHORITY_KEYS: ReadonlySet<string> = new Set([
  "lease", "vokLease", "vokDecision", "decision", "grant", "receipt", "admission",
  "admissionToken", "capabilityToken", "executor", "dispatch", "allow", "authority",
  "kernel", "quantum", "qubit", "qpu",
]);

const TOPIC_SET: ReadonlySet<string> = new Set(CORE_COMPUTE_HOLD_TOPICS);

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

function refusal(code: CoreComputeHoldRefusalCode): CoreComputeHoldRefusal {
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
export function prepareCoreComputeHoldRequest(input: unknown): CoreComputeHoldRequestResult {
  if (hasAuthorityField(input, 0)) return refusal("COMPUTE_HOLD_REQUEST_AUTHORITY_FIELD_PRESENT");
  if (!isPlainDataObject(input)) return refusal("COMPUTE_HOLD_REQUEST_MALFORMED");
  const topic = input.topic;
  if (typeof topic !== "string" || !TOPIC_SET.has(topic)) {
    return refusal("COMPUTE_HOLD_REQUEST_MALFORMED");
  }
  return Object.freeze({
    kind: "CORE_COMPUTE_HOLD_REQUEST",
    schema: CORE_COMPUTE_HOLD_PIN_SCHEMA,
    status: "REQUESTED_NOT_ADMITTED",
    topic: topic as CoreComputeHoldTopic,
    requires: Object.freeze({
      ownerDecision: true,
      ownerV1ShipDecision: true,
    }),
    authorityReleased: false,
    admissionAuthority: false,
  });
}

export function admitQuantumRuntimeTarget(_input: unknown): CoreComputeHoldRefusal {
  return refusal("COMPUTE_QUANTUM_TARGET_FORBIDDEN");
}

export function implementQuantumPlanningRules(_input: unknown): CoreComputeHoldRefusal {
  return refusal("COMPUTE_QUANTUM_PLANNING_FORBIDDEN");
}

export function executeQuantumCompute(_input: unknown): CoreComputeHoldRefusal {
  return refusal("COMPUTE_QUANTUM_EXECUTION_FORBIDDEN");
}
