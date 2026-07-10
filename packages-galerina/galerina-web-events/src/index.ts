// Typed browser event contracts.
//
// This package defines the event boundary for the Galerina web family — raw
// browser event objects never cross into application logic. Events are
// typed (click/input/submit/navigation, unknown kinds rejected), payload
// fields declare kinds from a known set, rate limiting is bounded and
// non-contradictory (debounce and throttle on the same event is an error),
// propagation policy comes from a known set, and sensitive capabilities
// (clipboard, fullscreen, permission requests, downloads) require a
// literal-true user-gesture declaration that is re-checked at runtime and
// fails closed. No DOM code lives here: these are contracts, not listeners.

export type WebEventsDiagnosticSeverity = "warning" | "error";

export interface WebEventsDiagnostic {
  readonly code: string;
  readonly severity: WebEventsDiagnosticSeverity;
  readonly message: string;
  readonly path?: string;
}

export type WebEventKind = "click" | "input" | "submit" | "navigation";

export const KNOWN_WEB_EVENT_KINDS: readonly WebEventKind[] = [
  "click",
  "input",
  "submit",
  "navigation",
];

export type EventPayloadFieldKind =
  | "string"
  | "integer"
  | "number"
  | "boolean"
  | "enum";

export const KNOWN_EVENT_PAYLOAD_FIELD_KINDS: readonly EventPayloadFieldKind[] = [
  "string",
  "integer",
  "number",
  "boolean",
  "enum",
];

export interface EventPayloadField {
  readonly name: string;
  readonly kind: EventPayloadFieldKind;
}

export type EventPropagationPolicy = "allow" | "stop" | "stop_immediate";

export const KNOWN_EVENT_PROPAGATION_POLICIES: readonly EventPropagationPolicy[] = [
  "allow",
  "stop",
  "stop_immediate",
];

// Debounce and throttle are alternative rate disciplines; declaring both on
// the same event is a contradiction, not a configuration.
export interface EventRatePolicy {
  readonly debounceMs?: number;
  readonly throttleMs?: number;
}

export type SensitiveCapability =
  | "clipboard"
  | "fullscreen"
  | "permission_request"
  | "download";

export const KNOWN_SENSITIVE_CAPABILITIES: readonly SensitiveCapability[] = [
  "clipboard",
  "fullscreen",
  "permission_request",
  "download",
];

// A handler that touches a sensitive capability must be gesture-gated.
// requiresUserGesture is the literal `true`: a gesture-free sensitive
// handler is not expressible, and untyped callers are re-checked at runtime.
export interface SensitiveCapabilityDeclaration {
  readonly capabilities: readonly SensitiveCapability[];
  readonly requiresUserGesture: true;
}

export interface WebEventContract {
  readonly name: string;
  readonly kind: WebEventKind;
  readonly payload: readonly EventPayloadField[];
  readonly propagation: EventPropagationPolicy;
  readonly rate?: EventRatePolicy;
  readonly sensitive?: SensitiveCapabilityDeclaration;
}

export type WebEventsCheck =
  | "events"
  | "payload"
  | "rate"
  | "propagation"
  | "userGesture";

export type WebEventsCheckOutcome = "pass" | "fail";

export type WebEventsReportStatus = "success" | "partial" | "failed";

export interface WebEventReport {
  readonly eventCount: number;
  readonly status: WebEventsReportStatus;
  readonly checks: Readonly<Record<WebEventsCheck, WebEventsCheckOutcome>>;
  readonly diagnostics: readonly WebEventsDiagnostic[];
  readonly warnings: readonly string[];
}

export const WEB_EVENTS_CHECKS: readonly WebEventsCheck[] = [
  "events",
  "payload",
  "rate",
  "propagation",
  "userGesture",
];

const KNOWN_KINDS: ReadonlySet<string> = new Set(KNOWN_WEB_EVENT_KINDS);

const KNOWN_PAYLOAD_KINDS: ReadonlySet<string> = new Set(
  KNOWN_EVENT_PAYLOAD_FIELD_KINDS,
);

const KNOWN_PROPAGATION: ReadonlySet<string> = new Set(
  KNOWN_EVENT_PROPAGATION_POLICIES,
);

const KNOWN_CAPABILITIES: ReadonlySet<string> = new Set(
  KNOWN_SENSITIVE_CAPABILITIES,
);

// Every error code maps to exactly one report check, so a failed check is
// always explained by a diagnostic and never asserted by the caller.
const CHECK_CODES: Readonly<Record<WebEventsCheck, readonly string[]>> = {
  events: [
    "Galerina_WEB_EVENTS_EVENT_NAME_REQUIRED",
    "Galerina_WEB_EVENTS_EVENT_KIND_UNKNOWN",
  ],
  payload: [
    "Galerina_WEB_EVENTS_PAYLOAD_FIELD_NAME_REQUIRED",
    "Galerina_WEB_EVENTS_PAYLOAD_FIELD_KIND_UNKNOWN",
  ],
  rate: [
    "Galerina_WEB_EVENTS_DEBOUNCE_BOUND_INVALID",
    "Galerina_WEB_EVENTS_THROTTLE_BOUND_INVALID",
    "Galerina_WEB_EVENTS_RATE_POLICY_CONTRADICTION",
  ],
  propagation: ["Galerina_WEB_EVENTS_PROPAGATION_POLICY_UNKNOWN"],
  userGesture: [
    "Galerina_WEB_EVENTS_CAPABILITY_UNKNOWN",
    "Galerina_WEB_EVENTS_USER_GESTURE_REQUIRED",
  ],
};

function eventsDiagnostic(
  code: string,
  severity: WebEventsDiagnosticSeverity,
  message: string,
  path?: string,
): WebEventsDiagnostic {
  return {
    code,
    severity,
    message,
    ...(path === undefined ? {} : { path }),
  };
}

function isPositiveSafeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

export function validateEventPayloadField(
  field: EventPayloadField,
  path = "field",
): readonly WebEventsDiagnostic[] {
  const diagnostics: WebEventsDiagnostic[] = [];

  if (field.name.trim().length === 0) {
    diagnostics.push(eventsDiagnostic(
      "Galerina_WEB_EVENTS_PAYLOAD_FIELD_NAME_REQUIRED",
      "error",
      "Event payload field requires a name.",
      `${path}.name`,
    ));
  }

  if (!KNOWN_PAYLOAD_KINDS.has(field.kind)) {
    diagnostics.push(eventsDiagnostic(
      "Galerina_WEB_EVENTS_PAYLOAD_FIELD_KIND_UNKNOWN",
      "error",
      `Event payload field kind "${String(field.kind)}" is not in the known set; untyped payloads may not cross the event boundary.`,
      `${path}.kind`,
    ));
  }

  return diagnostics;
}

export function validateEventRatePolicy(
  rate: EventRatePolicy,
  path = "rate",
): readonly WebEventsDiagnostic[] {
  const diagnostics: WebEventsDiagnostic[] = [];

  if (rate.debounceMs !== undefined && !isPositiveSafeInteger(rate.debounceMs)) {
    diagnostics.push(eventsDiagnostic(
      "Galerina_WEB_EVENTS_DEBOUNCE_BOUND_INVALID",
      "error",
      "debounceMs, when set, must be a positive integer.",
      `${path}.debounceMs`,
    ));
  }

  if (rate.throttleMs !== undefined && !isPositiveSafeInteger(rate.throttleMs)) {
    diagnostics.push(eventsDiagnostic(
      "Galerina_WEB_EVENTS_THROTTLE_BOUND_INVALID",
      "error",
      "throttleMs, when set, must be a positive integer.",
      `${path}.throttleMs`,
    ));
  }

  if (rate.debounceMs !== undefined && rate.throttleMs !== undefined) {
    diagnostics.push(eventsDiagnostic(
      "Galerina_WEB_EVENTS_RATE_POLICY_CONTRADICTION",
      "error",
      "Debounce and throttle are declared on the same event; the two rate disciplines contradict each other — declare one.",
      path,
    ));
  }

  return diagnostics;
}

// Sensitive capabilities require a user gesture; this is not configurable.
// Unknown capabilities are rejected (they cannot be reasoned about), and an
// empty capability list under a gesture gate is warned as protecting
// nothing.
export function validateSensitiveCapabilityDeclaration(
  declaration: SensitiveCapabilityDeclaration,
  path = "sensitive",
): readonly WebEventsDiagnostic[] {
  const diagnostics: WebEventsDiagnostic[] = [];

  if (declaration.capabilities.length === 0) {
    diagnostics.push(eventsDiagnostic(
      "Galerina_WEB_EVENTS_CAPABILITIES_EMPTY",
      "warning",
      "Sensitive capability declaration lists no capabilities; the gesture gate protects nothing.",
      `${path}.capabilities`,
    ));
  }

  declaration.capabilities.forEach((capability, index) => {
    if (!KNOWN_CAPABILITIES.has(capability)) {
      diagnostics.push(eventsDiagnostic(
        "Galerina_WEB_EVENTS_CAPABILITY_UNKNOWN",
        "error",
        `Sensitive capability "${String(capability)}" is not in the known set (clipboard/fullscreen/permission_request/download).`,
        `${path}.capabilities.${index}`,
      ));
    }
  });

  if ((declaration.requiresUserGesture as boolean) !== true) {
    diagnostics.push(eventsDiagnostic(
      "Galerina_WEB_EVENTS_USER_GESTURE_REQUIRED",
      "error",
      "Handlers declaring sensitive capabilities must require a user gesture; this is not configurable.",
      `${path}.requiresUserGesture`,
    ));
  }

  return diagnostics;
}

export function validateWebEventContract(
  contract: WebEventContract,
  path = "event",
): readonly WebEventsDiagnostic[] {
  const diagnostics: WebEventsDiagnostic[] = [];

  if (contract.name.trim().length === 0) {
    diagnostics.push(eventsDiagnostic(
      "Galerina_WEB_EVENTS_EVENT_NAME_REQUIRED",
      "error",
      "Event contract requires a name.",
      `${path}.name`,
    ));
  }

  if (!KNOWN_KINDS.has(contract.kind)) {
    diagnostics.push(eventsDiagnostic(
      "Galerina_WEB_EVENTS_EVENT_KIND_UNKNOWN",
      "error",
      `Event kind "${String(contract.kind)}" is not in the known set (click/input/submit/navigation); unknown kinds are rejected, never defaulted.`,
      `${path}.kind`,
    ));
  }

  contract.payload.forEach((field, index) => {
    diagnostics.push(...validateEventPayloadField(field, `${path}.payload.${index}`));
  });

  if (!KNOWN_PROPAGATION.has(contract.propagation)) {
    diagnostics.push(eventsDiagnostic(
      "Galerina_WEB_EVENTS_PROPAGATION_POLICY_UNKNOWN",
      "error",
      `Propagation policy "${String(contract.propagation)}" is not in the known set (allow/stop/stop_immediate).`,
      `${path}.propagation`,
    ));
  }

  if (contract.rate !== undefined) {
    diagnostics.push(...validateEventRatePolicy(contract.rate, `${path}.rate`));
  }

  if (contract.sensitive !== undefined) {
    diagnostics.push(
      ...validateSensitiveCapabilityDeclaration(contract.sensitive, `${path}.sensitive`),
    );
  }

  return diagnostics;
}

// Status is arithmetic, not assertion: derived from the diagnostics the
// validators actually produced, never accepted from the caller.
export function deriveWebEventsReportStatus(
  diagnostics: readonly WebEventsDiagnostic[],
): WebEventsReportStatus {
  if (diagnostics.some((diagnostic) => diagnostic.severity === "error")) {
    return "failed";
  }
  if (diagnostics.some((diagnostic) => diagnostic.severity === "warning")) {
    return "partial";
  }
  return "success";
}

export function createWebEventReport(input: {
  readonly events: readonly WebEventContract[];
}): WebEventReport {
  const diagnostics: WebEventsDiagnostic[] = [];

  input.events.forEach((event, index) => {
    diagnostics.push(...validateWebEventContract(event, `events.${index}`));
  });

  const errorCodes = new Set(
    diagnostics
      .filter((diagnostic) => diagnostic.severity === "error")
      .map((diagnostic) => diagnostic.code),
  );

  const checks = {} as Record<WebEventsCheck, WebEventsCheckOutcome>;
  for (const check of WEB_EVENTS_CHECKS) {
    checks[check] = CHECK_CODES[check].some((code) => errorCodes.has(code))
      ? "fail"
      : "pass";
  }

  return {
    eventCount: input.events.length,
    status: deriveWebEventsReportStatus(diagnostics),
    checks,
    diagnostics,
    warnings: diagnostics
      .filter((diagnostic) => diagnostic.severity === "warning")
      .map((diagnostic) => diagnostic.message),
  };
}
