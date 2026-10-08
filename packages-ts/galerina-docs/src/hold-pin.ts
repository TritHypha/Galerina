// hold-pin.ts — package side of the docs HOLD rows.
//
// This package never invents Option/Result/Decimal schema mappings, never
// owner-closes the audited L33-L42 evidence, never emits OAuth2/OIDC schemes,
// never adds a `galerina docs openapi` CLI, and never mints OpenAPI 3.1
// webhook objects. Compiler/kernel/owner still own those admissions.

export const DOCS_HOLD_PIN_SCHEMA = "galerina.docs.hold-pin.v1" as const;

export const DOCS_HOLD_TOPICS = Object.freeze([
  "contract-mapping",
  "owner-close-audit",
  "oauth-oidc",
  "openapi-cli",
  "webhook-objects",
] as const);

export type DocsHoldTopic = (typeof DOCS_HOLD_TOPICS)[number];

export type DocsHoldRefusalCode =
  | "DOCS_CONTRACT_MAPPING_FORBIDDEN"
  | "DOCS_OWNER_CLOSE_FORBIDDEN"
  | "DOCS_OAUTH_SCHEME_FORBIDDEN"
  | "DOCS_OPENAPI_CLI_FORBIDDEN"
  | "DOCS_WEBHOOK_OBJECTS_FORBIDDEN"
  | "DOCS_HOLD_REQUEST_AUTHORITY_FIELD_PRESENT"
  | "DOCS_HOLD_REQUEST_MALFORMED";

export interface DocsHoldRefusal {
  readonly kind: "REFUSED";
  readonly code: DocsHoldRefusalCode;
  readonly authorityReleased: false;
  readonly admissionAuthority: false;
}

export interface DocsHoldRequestV1 {
  readonly kind: "DOCS_HOLD_REQUEST";
  readonly schema: typeof DOCS_HOLD_PIN_SCHEMA;
  readonly status: "REQUESTED_NOT_ADMITTED";
  readonly topic: DocsHoldTopic;
  readonly requires: {
    readonly ownerDecision: true;
    readonly compilerContractMapping: true;
    readonly kernelSchemeAdmission: true;
    readonly versionedRouteTable: true;
    readonly webhookRouteMapping: true;
  };
  readonly authorityReleased: false;
  readonly admissionAuthority: false;
}

export type DocsHoldRequestResult = DocsHoldRequestV1 | DocsHoldRefusal;

const AUTHORITY_KEYS: ReadonlySet<string> = new Set([
  "lease", "vokLease", "vokDecision", "decision", "grant", "receipt", "admission",
  "admissionToken", "capabilityToken", "executor", "dispatch", "allow", "authority",
  "kernel", "bin", "webhooks", "oauth2", "openIdConnect", "mapping",
]);

const TOPIC_SET: ReadonlySet<string> = new Set(DOCS_HOLD_TOPICS);

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

function refusal(code: DocsHoldRefusalCode): DocsHoldRefusal {
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
export function prepareDocsHoldRequest(input: unknown): DocsHoldRequestResult {
  if (hasAuthorityField(input, 0)) return refusal("DOCS_HOLD_REQUEST_AUTHORITY_FIELD_PRESENT");
  if (!isPlainDataObject(input)) return refusal("DOCS_HOLD_REQUEST_MALFORMED");
  const topic = input.topic;
  if (typeof topic !== "string" || !TOPIC_SET.has(topic)) {
    return refusal("DOCS_HOLD_REQUEST_MALFORMED");
  }
  return Object.freeze({
    kind: "DOCS_HOLD_REQUEST",
    schema: DOCS_HOLD_PIN_SCHEMA,
    status: "REQUESTED_NOT_ADMITTED",
    topic: topic as DocsHoldTopic,
    requires: Object.freeze({
      ownerDecision: true,
      compilerContractMapping: true,
      kernelSchemeAdmission: true,
      versionedRouteTable: true,
      webhookRouteMapping: true,
    }),
    authorityReleased: false,
    admissionAuthority: false,
  });
}

export function mapOptionResultDecimalSchemas(_input: unknown): DocsHoldRefusal {
  return refusal("DOCS_CONTRACT_MAPPING_FORBIDDEN");
}

export function closeAuditedHoldWithoutOwner(_input: unknown): DocsHoldRefusal {
  return refusal("DOCS_OWNER_CLOSE_FORBIDDEN");
}

export function emitOAuthOidcSchemes(_input: unknown): DocsHoldRefusal {
  return refusal("DOCS_OAUTH_SCHEME_FORBIDDEN");
}

export function addDocsOpenApiCli(_input: unknown): DocsHoldRefusal {
  return refusal("DOCS_OPENAPI_CLI_FORBIDDEN");
}

export function emitOpenApi31WebhookObjects(_input: unknown): DocsHoldRefusal {
  return refusal("DOCS_WEBHOOK_OBJECTS_FORBIDDEN");
}
