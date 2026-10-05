// Typed API boundary contract (TODO pass, Grok 2026-10-05; zero-trust defaults, owner may revisit).
//
// Closed-shape TypedApiBoundary / TypedApiRoute for the app-kernel "Define typed API
// boundary contract" TODO. Mirrors the fungi `api Name { METHOD "path" { ... } }` example
// shape without parsing .fungi or wiring createAppKernel.
//
// Zero-trust rules:
//  - Closed shapes via property descriptors (no getters run; symbols / accessors /
//    custom prototypes refuse). Unknown keys refuse without echoing the key.
//  - Method / auth / body / idempotency tokens are exact closed vocabularies.
//  - Diagnostic messages never echo tokens, labels, keys, paths or unknown values.
//  - Numbers are finite, non-negative, safe integers within bounds (no NaN/Infinity).
//
// Not covered: request validation policy, auth provider boundary, scope/role model,
// idempotency store, rate-limit enforcement, Structured Await, queue/job contracts,
// runtime audit report format, or handoff contracts to core-runtime / api-server.

/** Record / input is not a closed data object. */
export const FUNGI_APPK_001 = "FUNGI-APPK-001";
/** A field value is outside its closed domain. */
export const FUNGI_APPK_002 = "FUNGI-APPK-002";
/** Route set consistency refuse (duplicate method+path / empty routes). */
export const FUNGI_APPK_003 = "FUNGI-APPK-003";
/** Nested policy block refuse. */
export const FUNGI_APPK_004 = "FUNGI-APPK-004";
/** Result consistency refuse. */
export const FUNGI_APPK_005 = "FUNGI-APPK-005";

export const TYPED_API_BOUNDARY_SCHEMA = "galerina.app-kernel.typed-api-boundary/v1";

export const HTTP_METHODS = Object.freeze([
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "OPTIONS",
  "HEAD",
] as const);

export type TypedApiHttpMethod = (typeof HTTP_METHODS)[number];

export const AUTH_MODES = Object.freeze(["required", "public"] as const);
export type TypedApiAuthMode = (typeof AUTH_MODES)[number];

/** "strip" is reserved and refused until implemented (matches route-defaults). */
export const UNKNOWN_FIELDS_MODES = Object.freeze(["deny", "allow"] as const);
export type TypedApiUnknownFieldsMode = (typeof UNKNOWN_FIELDS_MODES)[number];

export const DUPLICATE_KEYS_MODES = Object.freeze(["deny", "lastWins"] as const);
export type TypedApiDuplicateKeysMode = (typeof DUPLICATE_KEYS_MODES)[number];

/** "replay" is reserved and refused until implemented (matches route-defaults). */
export const ON_DUPLICATE_MODES = Object.freeze(["reject"] as const);
export type TypedApiOnDuplicateMode = (typeof ON_DUPLICATE_MODES)[number];

export const TYPED_API_BOUNDARY_FIELDS = Object.freeze([
  "schema",
  "name",
  "routes",
  "diagnostics",
] as const);

export const TYPED_API_ROUTE_FIELDS = Object.freeze([
  "method",
  "path",
  "handler",
  "requestType",
  "responseType",
  "auth",
  "body",
  "idempotency",
  "limits",
] as const);

export const TYPED_API_AUTH_FIELDS = Object.freeze(["mode", "scopes"] as const);

export const TYPED_API_BODY_FIELDS = Object.freeze([
  "contentType",
  "maxSizeBytes",
  "unknownFields",
  "duplicateKeys",
] as const);

export const TYPED_API_IDEMPOTENCY_FIELDS = Object.freeze([
  "enabled",
  "header",
  "ttlSeconds",
  "onDuplicate",
] as const);

export const TYPED_API_LIMITS_FIELDS = Object.freeze([
  "rate",
  "maxConcurrent",
  "memoryBytes",
  "timeoutMs",
] as const);

export type TypedApiDiagnosticField =
  | "record"
  | "schema"
  | "name"
  | "routes"
  | "diagnostics"
  | "method"
  | "path"
  | "handler"
  | "requestType"
  | "responseType"
  | "auth"
  | "body"
  | "idempotency"
  | "limits"
  | "mode"
  | "scopes"
  | "contentType"
  | "maxSizeBytes"
  | "unknownFields"
  | "duplicateKeys"
  | "enabled"
  | "header"
  | "ttlSeconds"
  | "onDuplicate"
  | "rate"
  | "maxConcurrent"
  | "memoryBytes"
  | "timeoutMs";

export interface TypedApiDiagnostic {
  readonly code: string;
  readonly severity: "error";
  readonly message: string;
  readonly field: TypedApiDiagnosticField;
}

export interface TypedApiAuthPolicy {
  readonly mode: TypedApiAuthMode;
  readonly scopes: readonly string[];
}

export interface TypedApiBodyPolicy {
  readonly contentType: string;
  readonly maxSizeBytes: number;
  readonly unknownFields: TypedApiUnknownFieldsMode;
  readonly duplicateKeys: TypedApiDuplicateKeysMode;
}

export interface TypedApiIdempotencyPolicy {
  readonly enabled: boolean;
  readonly header: string;
  readonly ttlSeconds: number;
  readonly onDuplicate: TypedApiOnDuplicateMode;
}

export interface TypedApiLimitsPolicy {
  readonly rate: string;
  readonly maxConcurrent: number;
  readonly memoryBytes: number;
  readonly timeoutMs: number;
}

export interface TypedApiRoute {
  readonly method: TypedApiHttpMethod;
  readonly path: string;
  readonly handler: string;
  readonly requestType: string | null;
  readonly responseType: string | null;
  readonly auth: TypedApiAuthPolicy | null;
  readonly body: TypedApiBodyPolicy | null;
  readonly idempotency: TypedApiIdempotencyPolicy | null;
  readonly limits: TypedApiLimitsPolicy | null;
}

export interface TypedApiBoundary {
  readonly schema: typeof TYPED_API_BOUNDARY_SCHEMA;
  readonly name: string;
  readonly routes: readonly TypedApiRoute[];
  readonly diagnostics: readonly TypedApiDiagnostic[];
}

export type ReadTypedApiBoundaryResult =
  | { readonly ok: true; readonly value: TypedApiBoundary }
  | { readonly ok: false; readonly diagnostics: readonly TypedApiDiagnostic[] };

const API_NAME = /^[A-Z][A-Za-z0-9_]{0,63}$/;
const TYPE_NAME = /^[A-Z][A-Za-z0-9_]{0,63}$/;
const HANDLER_NAME = /^[a-z][A-Za-z0-9_]{0,63}$/;
const SCOPE_TOKEN = /^[a-z][a-z0-9_.-]{0,63}$/;
const PATH_TOKEN = /^\/[A-Za-z0-9._~!$&'()*+,;=:@\/-]{0,255}$/;
const CONTENT_TYPE = /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/;
const HEADER_TOKEN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]{1,64}$/;
const RATE_PER_MINUTE = /^(\d+)\/minute$/;
const MAX_ROUTES = 256;
const MAX_SCOPES = 64;
const MAX_LIST = 4096;
const MAX_TOKEN = 128;
const MAX_BODY_BYTES = 64 * 1024 * 1024;
const MAX_TTL_SECONDS = 7 * 24 * 60 * 60;
const MAX_TIMER_MS = 2_147_483_647;
const METHOD_SET = new Set<string>(HTTP_METHODS);
const AUTH_SET = new Set<string>(AUTH_MODES);
const UNKNOWN_SET = new Set<string>(UNKNOWN_FIELDS_MODES);
const DUP_SET = new Set<string>(DUPLICATE_KEYS_MODES);
const ON_DUP_SET = new Set<string>(ON_DUPLICATE_MODES);

const diag = (code: string, message: string, field: TypedApiDiagnosticField): TypedApiDiagnostic =>
  Object.freeze({ code, severity: "error" as const, message, field });

type Snapshot = { readonly ok: true; readonly values: ReadonlyMap<string, unknown> } | { readonly ok: false };

function snapshotRecord(value: unknown, maxKeys: number): Snapshot {
  try {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return { ok: false };
    const proto: unknown = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) return { ok: false };
    const values = new Map<string, unknown>();
    const keys = Reflect.ownKeys(value);
    if (keys.length > maxKeys) return { ok: false };
    for (const key of keys) {
      if (typeof key !== "string") return { ok: false };
      const d = Object.getOwnPropertyDescriptor(value, key);
      if (d === undefined || !("value" in d) || d.get !== undefined || d.set !== undefined) return { ok: false };
      values.set(key, d.value);
    }
    return { ok: true, values };
  } catch {
    return { ok: false };
  }
}

function snapshotArray(value: unknown, max: number): readonly unknown[] | undefined {
  try {
    if (!Array.isArray(value)) return undefined;
    const length: unknown = Object.getOwnPropertyDescriptor(value, "length")?.value;
    if (typeof length !== "number" || !Number.isSafeInteger(length) || length < 0 || length > max) return undefined;
    const keys = Reflect.ownKeys(value);
    if (keys.length !== length + 1) return undefined;
    const out: unknown[] = [];
    for (let i = 0; i < length; i += 1) {
      const d = Object.getOwnPropertyDescriptor(value, String(i));
      if (d === undefined || !("value" in d) || d.get !== undefined || d.set !== undefined) return undefined;
      out.push(d.value);
    }
    return out;
  } catch {
    return undefined;
  }
}

function strictlyAscending(xs: readonly string[]): boolean {
  return xs.every((x, i) => i === 0 || (xs[i - 1] as string) < x);
}

function readBoundedInt(
  value: unknown,
  field: TypedApiDiagnosticField,
  max: number,
  out: TypedApiDiagnostic[],
): number | undefined {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > max
  ) {
    out.push(diag(FUNGI_APPK_002, "Numeric field is outside the closed domain.", field));
    return undefined;
  }
  return value;
}

function readBoolean(
  value: unknown,
  field: TypedApiDiagnosticField,
  out: TypedApiDiagnostic[],
): boolean | undefined {
  if (value !== true && value !== false) {
    out.push(diag(FUNGI_APPK_002, "Flag must be a boolean.", field));
    return undefined;
  }
  return value;
}

function requireExactKeys(
  snap: Extract<Snapshot, { ok: true }>,
  allowed: readonly string[],
  field: TypedApiDiagnosticField,
  out: TypedApiDiagnostic[],
): boolean {
  const allowedSet = new Set(allowed);
  for (const key of snap.values.keys()) {
    if (!allowedSet.has(key)) {
      out.push(diag(FUNGI_APPK_001, "Record has a key outside the closed shape.", field));
      return false;
    }
  }
  for (const key of allowed) {
    if (!snap.values.has(key)) {
      out.push(diag(FUNGI_APPK_001, "Record is missing a required field.", field));
      return false;
    }
  }
  return true;
}

function requireKeysSubset(
  snap: Extract<Snapshot, { ok: true }>,
  allowed: readonly string[],
  required: readonly string[],
  field: TypedApiDiagnosticField,
  out: TypedApiDiagnostic[],
): boolean {
  const allowedSet = new Set(allowed);
  for (const key of snap.values.keys()) {
    if (!allowedSet.has(key)) {
      out.push(diag(FUNGI_APPK_001, "Record has a key outside the closed shape.", field));
      return false;
    }
  }
  for (const key of required) {
    if (!snap.values.has(key)) {
      out.push(diag(FUNGI_APPK_001, "Record is missing a required field.", field));
      return false;
    }
  }
  return true;
}

function readScopeList(
  value: unknown,
  field: TypedApiDiagnosticField,
  out: TypedApiDiagnostic[],
): readonly string[] | undefined {
  const items = snapshotArray(value, MAX_SCOPES);
  if (items === undefined) {
    out.push(diag(FUNGI_APPK_001, "Scope list must be a dense array within bounds.", field));
    return undefined;
  }
  const scopes: string[] = [];
  for (const item of items) {
    if (typeof item !== "string" || !SCOPE_TOKEN.test(item)) {
      out.push(diag(FUNGI_APPK_002, "Scope token is outside the closed domain.", field));
      return undefined;
    }
    scopes.push(item);
  }
  if (!strictlyAscending(scopes)) {
    out.push(diag(FUNGI_APPK_002, "Scope list must be strictly ascending with no duplicates.", field));
    return undefined;
  }
  return Object.freeze(scopes);
}

function readAuth(
  value: unknown,
  out: TypedApiDiagnostic[],
): TypedApiAuthPolicy | undefined {
  const snap = snapshotRecord(value, TYPED_API_AUTH_FIELDS.length);
  if (!snap.ok) {
    out.push(diag(FUNGI_APPK_004, "Auth policy must be a plain data object.", "auth"));
    return undefined;
  }
  if (!requireExactKeys(snap, TYPED_API_AUTH_FIELDS, "auth", out)) return undefined;
  const mode = snap.values.get("mode");
  if (typeof mode !== "string" || !AUTH_SET.has(mode)) {
    out.push(diag(FUNGI_APPK_002, "Auth mode is outside the closed vocabulary.", "mode"));
    return undefined;
  }
  const scopes = readScopeList(snap.values.get("scopes"), "scopes", out);
  if (scopes === undefined) return undefined;
  return Object.freeze({ mode: mode as TypedApiAuthMode, scopes });
}

function readBody(
  value: unknown,
  out: TypedApiDiagnostic[],
): TypedApiBodyPolicy | undefined {
  const snap = snapshotRecord(value, TYPED_API_BODY_FIELDS.length);
  if (!snap.ok) {
    out.push(diag(FUNGI_APPK_004, "Body policy must be a plain data object.", "body"));
    return undefined;
  }
  if (!requireExactKeys(snap, TYPED_API_BODY_FIELDS, "body", out)) return undefined;
  const contentType = snap.values.get("contentType");
  if (typeof contentType !== "string" || contentType.length > MAX_TOKEN || !CONTENT_TYPE.test(contentType)) {
    out.push(diag(FUNGI_APPK_002, "Content type is outside the closed domain.", "contentType"));
    return undefined;
  }
  const maxSizeBytes = readBoundedInt(snap.values.get("maxSizeBytes"), "maxSizeBytes", MAX_BODY_BYTES, out);
  if (maxSizeBytes === undefined) return undefined;
  const unknownFields = snap.values.get("unknownFields");
  if (typeof unknownFields !== "string" || !UNKNOWN_SET.has(unknownFields)) {
    out.push(diag(FUNGI_APPK_002, "Unknown-fields mode is outside the closed vocabulary.", "unknownFields"));
    return undefined;
  }
  const duplicateKeys = snap.values.get("duplicateKeys");
  if (typeof duplicateKeys !== "string" || !DUP_SET.has(duplicateKeys)) {
    out.push(diag(FUNGI_APPK_002, "Duplicate-keys mode is outside the closed vocabulary.", "duplicateKeys"));
    return undefined;
  }
  return Object.freeze({
    contentType,
    maxSizeBytes,
    unknownFields: unknownFields as TypedApiUnknownFieldsMode,
    duplicateKeys: duplicateKeys as TypedApiDuplicateKeysMode,
  });
}

function readIdempotency(
  value: unknown,
  out: TypedApiDiagnostic[],
): TypedApiIdempotencyPolicy | undefined {
  const snap = snapshotRecord(value, TYPED_API_IDEMPOTENCY_FIELDS.length);
  if (!snap.ok) {
    out.push(diag(FUNGI_APPK_004, "Idempotency policy must be a plain data object.", "idempotency"));
    return undefined;
  }
  if (!requireExactKeys(snap, TYPED_API_IDEMPOTENCY_FIELDS, "idempotency", out)) return undefined;
  const enabled = readBoolean(snap.values.get("enabled"), "enabled", out);
  if (enabled === undefined) return undefined;
  const header = snap.values.get("header");
  if (typeof header !== "string" || !HEADER_TOKEN.test(header)) {
    out.push(diag(FUNGI_APPK_002, "Idempotency header is outside the closed domain.", "header"));
    return undefined;
  }
  const ttlSeconds = readBoundedInt(snap.values.get("ttlSeconds"), "ttlSeconds", MAX_TTL_SECONDS, out);
  if (ttlSeconds === undefined) return undefined;
  const onDuplicate = snap.values.get("onDuplicate");
  if (typeof onDuplicate !== "string" || !ON_DUP_SET.has(onDuplicate)) {
    out.push(diag(FUNGI_APPK_002, "On-duplicate mode is outside the closed vocabulary.", "onDuplicate"));
    return undefined;
  }
  return Object.freeze({
    enabled,
    header,
    ttlSeconds,
    onDuplicate: onDuplicate as TypedApiOnDuplicateMode,
  });
}

function readLimits(
  value: unknown,
  out: TypedApiDiagnostic[],
): TypedApiLimitsPolicy | undefined {
  const snap = snapshotRecord(value, TYPED_API_LIMITS_FIELDS.length);
  if (!snap.ok) {
    out.push(diag(FUNGI_APPK_004, "Limits policy must be a plain data object.", "limits"));
    return undefined;
  }
  if (!requireExactKeys(snap, TYPED_API_LIMITS_FIELDS, "limits", out)) return undefined;
  const rate = snap.values.get("rate");
  if (typeof rate !== "string" || !RATE_PER_MINUTE.test(rate)) {
    out.push(diag(FUNGI_APPK_002, "Rate token is outside the closed domain.", "rate"));
    return undefined;
  }
  const maxConcurrent = readBoundedInt(snap.values.get("maxConcurrent"), "maxConcurrent", 65_536, out);
  if (maxConcurrent === undefined) return undefined;
  const memoryBytes = readBoundedInt(snap.values.get("memoryBytes"), "memoryBytes", MAX_BODY_BYTES, out);
  if (memoryBytes === undefined) return undefined;
  const timeoutMs = readBoundedInt(snap.values.get("timeoutMs"), "timeoutMs", MAX_TIMER_MS, out);
  if (timeoutMs === undefined) return undefined;
  return Object.freeze({ rate, maxConcurrent, memoryBytes, timeoutMs });
}

function readOptionalTypeName(
  value: unknown,
  field: TypedApiDiagnosticField,
  out: TypedApiDiagnostic[],
): string | null | undefined {
  if (value === null) return null;
  if (typeof value !== "string" || !TYPE_NAME.test(value)) {
    out.push(diag(FUNGI_APPK_002, "Type name is outside the closed domain.", field));
    return undefined;
  }
  return value;
}

function readRoute(value: unknown, out: TypedApiDiagnostic[]): TypedApiRoute | undefined {
  const snap = snapshotRecord(value, TYPED_API_ROUTE_FIELDS.length);
  if (!snap.ok) {
    out.push(diag(FUNGI_APPK_001, "Route must be a plain data object.", "routes"));
    return undefined;
  }
  if (!requireExactKeys(snap, TYPED_API_ROUTE_FIELDS, "routes", out)) return undefined;

  const method = snap.values.get("method");
  if (typeof method !== "string" || !METHOD_SET.has(method)) {
    out.push(diag(FUNGI_APPK_002, "HTTP method is outside the closed vocabulary.", "method"));
    return undefined;
  }
  const path = snap.values.get("path");
  if (typeof path !== "string" || !PATH_TOKEN.test(path) || path.includes("//") || path.includes("/../")) {
    out.push(diag(FUNGI_APPK_002, "Path is outside the closed domain.", "path"));
    return undefined;
  }
  const handler = snap.values.get("handler");
  if (typeof handler !== "string" || !HANDLER_NAME.test(handler)) {
    out.push(diag(FUNGI_APPK_002, "Handler name is outside the closed domain.", "handler"));
    return undefined;
  }
  const requestType = readOptionalTypeName(snap.values.get("requestType"), "requestType", out);
  if (requestType === undefined) return undefined;
  const responseType = readOptionalTypeName(snap.values.get("responseType"), "responseType", out);
  if (responseType === undefined) return undefined;

  const authRaw = snap.values.get("auth");
  let auth: TypedApiAuthPolicy | null = null;
  if (authRaw !== null) {
    const read = readAuth(authRaw, out);
    if (read === undefined) return undefined;
    auth = read;
  }

  const bodyRaw = snap.values.get("body");
  let body: TypedApiBodyPolicy | null = null;
  if (bodyRaw !== null) {
    const read = readBody(bodyRaw, out);
    if (read === undefined) return undefined;
    body = read;
  }

  const idemRaw = snap.values.get("idempotency");
  let idempotency: TypedApiIdempotencyPolicy | null = null;
  if (idemRaw !== null) {
    const read = readIdempotency(idemRaw, out);
    if (read === undefined) return undefined;
    idempotency = read;
  }

  const limitsRaw = snap.values.get("limits");
  let limits: TypedApiLimitsPolicy | null = null;
  if (limitsRaw !== null) {
    const read = readLimits(limitsRaw, out);
    if (read === undefined) return undefined;
    limits = read;
  }

  return Object.freeze({
    method: method as TypedApiHttpMethod,
    path,
    handler,
    requestType,
    responseType,
    auth,
    body,
    idempotency,
    limits,
  });
}

function snapshotDiagnostics(
  value: unknown,
  field: TypedApiDiagnosticField,
  out: TypedApiDiagnostic[],
): readonly TypedApiDiagnostic[] | undefined {
  const items = snapshotArray(value, MAX_LIST);
  if (items === undefined) {
    out.push(diag(FUNGI_APPK_001, "Diagnostics must be a dense array within bounds.", field));
    return undefined;
  }
  const result: TypedApiDiagnostic[] = [];
  for (const item of items) {
    const snap = snapshotRecord(item, 8);
    if (!snap.ok) {
      out.push(diag(FUNGI_APPK_001, "Diagnostic entry must be a plain data object.", field));
      return undefined;
    }
    const known = new Set(["code", "severity", "message", "field"]);
    if ([...snap.values.keys()].some((k) => !known.has(k))) {
      out.push(diag(FUNGI_APPK_001, "Diagnostic entry has a key outside the closed shape.", field));
      return undefined;
    }
    for (const req of known) {
      if (!snap.values.has(req)) {
        out.push(diag(FUNGI_APPK_001, "Diagnostic entry is missing a required field.", field));
        return undefined;
      }
    }
    const code = snap.values.get("code");
    const severity = snap.values.get("severity");
    const message = snap.values.get("message");
    const f = snap.values.get("field");
    if (typeof code !== "string" || code.length === 0 || code.length > MAX_TOKEN) {
      out.push(diag(FUNGI_APPK_002, "Diagnostic code is outside the closed domain.", field));
      return undefined;
    }
    if (severity !== "error") {
      out.push(diag(FUNGI_APPK_002, "Diagnostic severity is outside the closed domain.", field));
      return undefined;
    }
    if (typeof message !== "string" || message.length === 0 || message.length > 512) {
      out.push(diag(FUNGI_APPK_002, "Diagnostic message is outside the closed domain.", field));
      return undefined;
    }
    if (typeof f !== "string" || f.length === 0 || f.length > MAX_TOKEN) {
      out.push(diag(FUNGI_APPK_002, "Diagnostic field is outside the closed domain.", field));
      return undefined;
    }
    result.push(Object.freeze({ code, severity: "error" as const, message, field: f as TypedApiDiagnosticField }));
  }
  return Object.freeze(result);
}

function refusedBoundary(diagnostics: readonly TypedApiDiagnostic[]): TypedApiBoundary {
  return Object.freeze({
    schema: TYPED_API_BOUNDARY_SCHEMA,
    name: "Refused",
    routes: Object.freeze([] as TypedApiRoute[]),
    diagnostics: Object.freeze([...diagnostics]),
  });
}

/** Build a closed TypedApiBoundary; never throws; success recomputed from diagnostics. */
export function createTypedApiBoundary(input: unknown): TypedApiBoundary {
  const out: TypedApiDiagnostic[] = [];
  try {
    const snap = snapshotRecord(input, TYPED_API_BOUNDARY_FIELDS.length);
    if (!snap.ok) {
      out.push(diag(FUNGI_APPK_001, "Typed API boundary must be a plain data object.", "record"));
      return refusedBoundary(out);
    }
    if (!requireKeysSubset(snap, TYPED_API_BOUNDARY_FIELDS, ["schema", "name", "routes"], "record", out)) {
      return refusedBoundary(out);
    }
    const schema = snap.values.get("schema");
    if (schema !== TYPED_API_BOUNDARY_SCHEMA) {
      out.push(diag(FUNGI_APPK_002, "Schema token is outside the closed vocabulary.", "schema"));
      return refusedBoundary(out);
    }
    const name = snap.values.get("name");
    if (typeof name !== "string" || !API_NAME.test(name)) {
      out.push(diag(FUNGI_APPK_002, "API name is outside the closed domain.", "name"));
      return refusedBoundary(out);
    }
    const routeItems = snapshotArray(snap.values.get("routes"), MAX_ROUTES);
    if (routeItems === undefined) {
      out.push(diag(FUNGI_APPK_001, "Routes must be a dense array within bounds.", "routes"));
      return refusedBoundary(out);
    }
    if (routeItems.length === 0) {
      out.push(diag(FUNGI_APPK_003, "Routes must contain at least one route.", "routes"));
      return refusedBoundary(out);
    }
    const routes: TypedApiRoute[] = [];
    const seen = new Set<string>();
    for (const item of routeItems) {
      const route = readRoute(item, out);
      if (route === undefined) return refusedBoundary(out);
      const key = `${route.method} ${route.path}`;
      if (seen.has(key)) {
        out.push(diag(FUNGI_APPK_003, "Route method and path pair must be unique.", "routes"));
        return refusedBoundary(out);
      }
      seen.add(key);
      routes.push(route);
    }

    let diagnostics: readonly TypedApiDiagnostic[] = Object.freeze([]);
    if (snap.values.has("diagnostics")) {
      const nested = snapshotDiagnostics(snap.values.get("diagnostics"), "diagnostics", out);
      if (nested === undefined) return refusedBoundary(out);
      if (nested.length > 0) {
        out.push(diag(FUNGI_APPK_005, "Input diagnostics must be empty on create.", "diagnostics"));
        return refusedBoundary(out);
      }
      diagnostics = nested;
    }

    return Object.freeze({
      schema: TYPED_API_BOUNDARY_SCHEMA,
      name,
      routes: Object.freeze(routes),
      diagnostics,
    });
  } catch {
    return refusedBoundary([diag(FUNGI_APPK_001, "Typed API boundary read failed closed.", "record")]);
  }
}

/** Read a closed TypedApiBoundary; never throws; never echoes refused tokens. */
export function readTypedApiBoundary(value: unknown): ReadTypedApiBoundaryResult {
  const created = createTypedApiBoundary(value);
  if (created.diagnostics.length > 0) {
    return { ok: false, diagnostics: created.diagnostics };
  }
  // Re-validate via create already succeeded; return the closed value.
  return { ok: true, value: created };
}

export function isTypedApiHttpMethod(value: unknown): value is TypedApiHttpMethod {
  return typeof value === "string" && METHOD_SET.has(value);
}
