// hold-pin.ts — package side of the core-reports HOLD row.
//
// This package never mints a new audit-code family, never expands the frozen
// eight-category v1 set, never adds a v1 trace-correlation key, and never
// converts scheduler evidence into a v1 audit event.

export const CORE_REPORTS_HOLD_PIN_SCHEMA = "galerina.core-reports.hold-pin.v1" as const;

export const CORE_REPORTS_HOLD_TOPICS = Object.freeze([
  "fungi-audit-codes",
  "audit-categories-10",
  "v1-trace-correlation",
  "scheduler-as-v1",
] as const);

export type CoreReportsHoldTopic = (typeof CORE_REPORTS_HOLD_TOPICS)[number];

export type CoreReportsHoldRefusalCode =
  | "REPORT_FUNGI_AUDIT_FORBIDDEN"
  | "REPORT_AUDIT_CATEGORIES_10_FORBIDDEN"
  | "REPORT_V1_TRACE_ID_FORBIDDEN"
  | "REPORT_SCHEDULER_AS_V1_FORBIDDEN"
  | "REPORT_HOLD_REQUEST_AUTHORITY_FIELD_PRESENT"
  | "REPORT_HOLD_REQUEST_MALFORMED";

export interface CoreReportsHoldRefusal {
  readonly kind: "REFUSED";
  readonly code: CoreReportsHoldRefusalCode;
  readonly authorityReleased: false;
  readonly admissionAuthority: false;
}

export interface CoreReportsHoldRequestV1 {
  readonly kind: "CORE_REPORTS_HOLD_REQUEST";
  readonly schema: typeof CORE_REPORTS_HOLD_PIN_SCHEMA;
  readonly status: "REQUESTED_NOT_ADMITTED";
  readonly topic: CoreReportsHoldTopic;
  readonly requires: {
    readonly ownerDecision: true;
    readonly categoryVocabularyOwner: true;
    readonly auditCodeFamilyOwner: true;
  };
  readonly authorityReleased: false;
  readonly admissionAuthority: false;
}

export type CoreReportsHoldRequestResult =
  | CoreReportsHoldRequestV1
  | CoreReportsHoldRefusal;

const AUTHORITY_KEYS: ReadonlySet<string> = new Set([
  "lease", "vokLease", "vokDecision", "decision", "grant", "receipt", "admission",
  "admissionToken", "capabilityToken", "executor", "dispatch", "allow", "authority",
  "kernel", "traceId", "FUNGI_AUDIT", "categoryTen",
]);

const TOPIC_SET: ReadonlySet<string> = new Set(CORE_REPORTS_HOLD_TOPICS);

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

function refusal(code: CoreReportsHoldRefusalCode): CoreReportsHoldRefusal {
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
export function prepareCoreReportsHoldRequest(input: unknown): CoreReportsHoldRequestResult {
  if (hasAuthorityField(input, 0)) return refusal("REPORT_HOLD_REQUEST_AUTHORITY_FIELD_PRESENT");
  if (!isPlainDataObject(input)) return refusal("REPORT_HOLD_REQUEST_MALFORMED");
  const topic = input.topic;
  if (typeof topic !== "string" || !TOPIC_SET.has(topic)) {
    return refusal("REPORT_HOLD_REQUEST_MALFORMED");
  }
  return Object.freeze({
    kind: "CORE_REPORTS_HOLD_REQUEST",
    schema: CORE_REPORTS_HOLD_PIN_SCHEMA,
    status: "REQUESTED_NOT_ADMITTED",
    topic: topic as CoreReportsHoldTopic,
    requires: Object.freeze({
      ownerDecision: true,
      categoryVocabularyOwner: true,
      auditCodeFamilyOwner: true,
    }),
    authorityReleased: false,
    admissionAuthority: false,
  });
}

export function mintFungiAuditCodes(_input: unknown): CoreReportsHoldRefusal {
  return refusal("REPORT_FUNGI_AUDIT_FORBIDDEN");
}

export function expandRuntimeAuditCategoriesToTen(_input: unknown): CoreReportsHoldRefusal {
  return refusal("REPORT_AUDIT_CATEGORIES_10_FORBIDDEN");
}

export function addV1TraceCorrelationKey(_input: unknown): CoreReportsHoldRefusal {
  return refusal("REPORT_V1_TRACE_ID_FORBIDDEN");
}

export function convertSchedulerEvidenceToV1Audit(_input: unknown): CoreReportsHoldRefusal {
  return refusal("REPORT_SCHEDULER_AS_V1_FORBIDDEN");
}
