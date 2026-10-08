// hold-pin.ts — package side of the core-logic HOLD row.
//
// This package never integrates AI orchestration, never lets Omni traces
// drive runtime policy or capability gates, and never lets Omni override
// compiler decisions. Phase 2 traces stay advisory.

export const CORE_LOGIC_HOLD_PIN_SCHEMA = "galerina.core-logic.hold-pin.v1" as const;

export const CORE_LOGIC_HOLD_TOPICS = Object.freeze([
  "ai-orchestration",
  "omni-runtime-control",
  "omni-compiler-override",
] as const);

export type CoreLogicHoldTopic = (typeof CORE_LOGIC_HOLD_TOPICS)[number];

export type CoreLogicHoldRefusalCode =
  | "LOGIC_AI_ORCHESTRATION_FORBIDDEN"
  | "LOGIC_OMNI_RUNTIME_CONTROL_FORBIDDEN"
  | "LOGIC_OMNI_COMPILER_OVERRIDE_FORBIDDEN"
  | "LOGIC_HOLD_REQUEST_AUTHORITY_FIELD_PRESENT"
  | "LOGIC_HOLD_REQUEST_MALFORMED";

export interface CoreLogicHoldRefusal {
  readonly kind: "REFUSED";
  readonly code: CoreLogicHoldRefusalCode;
  readonly authorityReleased: false;
  readonly admissionAuthority: false;
}

export interface CoreLogicHoldRequestV1 {
  readonly kind: "CORE_LOGIC_HOLD_REQUEST";
  readonly schema: typeof CORE_LOGIC_HOLD_PIN_SCHEMA;
  readonly status: "REQUESTED_NOT_ADMITTED";
  readonly topic: CoreLogicHoldTopic;
  readonly requires: {
    readonly ownerDecision: true;
    readonly ownerV1ShipDecision: true;
    readonly phase3Authorization: true;
  };
  readonly authorityReleased: false;
  readonly admissionAuthority: false;
}

export type CoreLogicHoldRequestResult =
  | CoreLogicHoldRequestV1
  | CoreLogicHoldRefusal;

const AUTHORITY_KEYS: ReadonlySet<string> = new Set([
  "lease", "vokLease", "vokDecision", "decision", "grant", "receipt", "admission",
  "admissionToken", "capabilityToken", "executor", "dispatch", "allow", "authority",
  "kernel", "orchestration", "prompt", "model", "llm", "agent",
]);

const TOPIC_SET: ReadonlySet<string> = new Set(CORE_LOGIC_HOLD_TOPICS);

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

function refusal(code: CoreLogicHoldRefusalCode): CoreLogicHoldRefusal {
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
export function prepareCoreLogicHoldRequest(input: unknown): CoreLogicHoldRequestResult {
  if (hasAuthorityField(input, 0)) return refusal("LOGIC_HOLD_REQUEST_AUTHORITY_FIELD_PRESENT");
  if (!isPlainDataObject(input)) return refusal("LOGIC_HOLD_REQUEST_MALFORMED");
  const topic = input.topic;
  if (typeof topic !== "string" || !TOPIC_SET.has(topic)) {
    return refusal("LOGIC_HOLD_REQUEST_MALFORMED");
  }
  return Object.freeze({
    kind: "CORE_LOGIC_HOLD_REQUEST",
    schema: CORE_LOGIC_HOLD_PIN_SCHEMA,
    status: "REQUESTED_NOT_ADMITTED",
    topic: topic as CoreLogicHoldTopic,
    requires: Object.freeze({
      ownerDecision: true,
      ownerV1ShipDecision: true,
      phase3Authorization: true,
    }),
    authorityReleased: false,
    admissionAuthority: false,
  });
}

export function integrateAiOrchestration(_input: unknown): CoreLogicHoldRefusal {
  return refusal("LOGIC_AI_ORCHESTRATION_FORBIDDEN");
}

export function driveRuntimeFromOmni(_input: unknown): CoreLogicHoldRefusal {
  return refusal("LOGIC_OMNI_RUNTIME_CONTROL_FORBIDDEN");
}

export function overrideCompilerFromOmni(_input: unknown): CoreLogicHoldRefusal {
  return refusal("LOGIC_OMNI_COMPILER_OVERRIDE_FORBIDDEN");
}
