// hold-pin.ts — package side of the api-server HOLD rows.
//
// Thin HTTP adapter. This package never admits a durable replay store, never
// adds a CLI/bin, never enables safeDetails, never logs a raw body, and never
// reopens the v0.2 manifest scaffold. RD-1286 stays deferred.

export const API_SERVER_HOLD_PIN_SCHEMA = "galerina.framework-api-server.hold-pin.v1" as const;

export const API_SERVER_HOLD_TOPICS = Object.freeze([
  "durable-replay",
  "historical-cli",
  "historical-layout",
  "safe-details",
  "timestamp-window",
  "request-id-header",
  "safe-log",
  "openapi-integration",
  "webhook-example",
  "kernel-handler-network",
  "manifest-scaffold",
  "fungi-authoring",
  "conversion-overlay",
] as const);

export type ApiServerHoldTopic = (typeof API_SERVER_HOLD_TOPICS)[number];

export type ApiServerHoldRefusalCode =
  | "API_DURABLE_REPLAY_FORBIDDEN"
  | "API_CLI_BIN_FORBIDDEN"
  | "API_HISTORICAL_LAYOUT_FORBIDDEN"
  | "API_SAFE_DETAILS_FORBIDDEN"
  | "API_TIMESTAMP_WINDOW_FORBIDDEN"
  | "API_REQUEST_ID_HEADER_FORBIDDEN"
  | "API_SAFE_LOG_FORBIDDEN"
  | "API_OPENAPI_INTEGRATION_FORBIDDEN"
  | "API_WEBHOOK_EXAMPLE_FORBIDDEN"
  | "API_KERNEL_HANDLER_NETWORK_FORBIDDEN"
  | "API_MANIFEST_SCAFFOLD_FORBIDDEN"
  | "API_FUNGI_AUTHORING_FORBIDDEN"
  | "API_CONVERSION_OVERLAY_FORBIDDEN"
  | "API_HOLD_REQUEST_AUTHORITY_FIELD_PRESENT"
  | "API_HOLD_REQUEST_MALFORMED";

export interface ApiServerHoldRefusal {
  readonly kind: "REFUSED";
  readonly code: ApiServerHoldRefusalCode;
  readonly authorityReleased: false;
  readonly admissionAuthority: false;
}

export interface ApiServerHoldRequestV1 {
  readonly kind: "API_SERVER_HOLD_REQUEST";
  readonly schema: typeof API_SERVER_HOLD_PIN_SCHEMA;
  readonly status: "REQUESTED_NOT_ADMITTED";
  readonly topic: ApiServerHoldTopic;
  readonly requires: {
    readonly ownerDecision: true;
    readonly rd1286DurableOwner: true;
  };
  readonly authorityReleased: false;
  readonly admissionAuthority: false;
}

export type ApiServerHoldRequestResult = ApiServerHoldRequestV1 | ApiServerHoldRefusal;

const AUTHORITY_KEYS: ReadonlySet<string> = new Set([
  "lease", "vokLease", "vokDecision", "decision", "grant", "receipt", "admission",
  "admissionToken", "capabilityToken", "executor", "dispatch", "allow", "authority",
  "kernel", "durableStore", "safeDetails", "bin",
]);

const TOPIC_SET: ReadonlySet<string> = new Set(API_SERVER_HOLD_TOPICS);

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

function refusal(code: ApiServerHoldRefusalCode): ApiServerHoldRefusal {
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
export function prepareApiServerHoldRequest(input: unknown): ApiServerHoldRequestResult {
  if (hasAuthorityField(input, 0)) return refusal("API_HOLD_REQUEST_AUTHORITY_FIELD_PRESENT");
  if (!isPlainDataObject(input)) return refusal("API_HOLD_REQUEST_MALFORMED");
  const topic = input.topic;
  if (typeof topic !== "string" || !TOPIC_SET.has(topic)) {
    return refusal("API_HOLD_REQUEST_MALFORMED");
  }
  return Object.freeze({
    kind: "API_SERVER_HOLD_REQUEST",
    schema: API_SERVER_HOLD_PIN_SCHEMA,
    status: "REQUESTED_NOT_ADMITTED",
    topic: topic as ApiServerHoldTopic,
    requires: Object.freeze({
      ownerDecision: true,
      rd1286DurableOwner: true,
    }),
    authorityReleased: false,
    admissionAuthority: false,
  });
}

export function installDurableReplayStore(_input: unknown): ApiServerHoldRefusal {
  return refusal("API_DURABLE_REPLAY_FORBIDDEN");
}

export function addHistoricalCliBin(_input: unknown): ApiServerHoldRefusal {
  return refusal("API_CLI_BIN_FORBIDDEN");
}

export function recreateThirteenModuleLayout(_input: unknown): ApiServerHoldRefusal {
  return refusal("API_HISTORICAL_LAYOUT_FORBIDDEN");
}

export function enableSafeDetails(_input: unknown): ApiServerHoldRefusal {
  return refusal("API_SAFE_DETAILS_FORBIDDEN");
}

export function installTimestampWindow(_input: unknown): ApiServerHoldRefusal {
  return refusal("API_TIMESTAMP_WINDOW_FORBIDDEN");
}

export function writeRequestIdResponseHeader(_input: unknown): ApiServerHoldRefusal {
  return refusal("API_REQUEST_ID_HEADER_FORBIDDEN");
}

export function installSafeLog(_input: unknown): ApiServerHoldRefusal {
  return refusal("API_SAFE_LOG_FORBIDDEN");
}

export function wireAdapterOpenApi(_input: unknown): ApiServerHoldRefusal {
  return refusal("API_OPENAPI_INTEGRATION_FORBIDDEN");
}

export function addWebhookExample(_input: unknown): ApiServerHoldRefusal {
  return refusal("API_WEBHOOK_EXAMPLE_FORBIDDEN");
}

export function installKernelHandlerNetworkPolicy(_input: unknown): ApiServerHoldRefusal {
  return refusal("API_KERNEL_HANDLER_NETWORK_FORBIDDEN");
}

export function reopenManifestScaffold(_input: unknown): ApiServerHoldRefusal {
  return refusal("API_MANIFEST_SCAFFOLD_FORBIDDEN");
}

export function authorFungiInAdapter(_input: unknown): ApiServerHoldRefusal {
  return refusal("API_FUNGI_AUTHORING_FORBIDDEN");
}

export function syncConversionOverlay(_input: unknown): ApiServerHoldRefusal {
  return refusal("API_CONVERSION_OVERLAY_FORBIDDEN");
}
