// Request validation policy contract (TODO pass, Grok 2026-10-05; zero-trust defaults, owner may revisit).
//
// Closed-shape RequestValidationPolicy for the app-kernel "Define request validation
// policy" TODO. Captures the body-admission rules a route-level request validator
// must honour (content type, size, unknown-fields / duplicate-keys modes, admitted
// field set) without wiring createAppKernel requestValidators or decoding JSON.
//
// Zero-trust rules:
//  - Closed shapes via property descriptors (no getters run; symbols / accessors /
//    custom prototypes refuse). Unknown keys refuse without echoing the key.
//  - Mode tokens are exact closed vocabularies; "strip" is reserved and refused.
//  - Diagnostic messages never echo tokens, labels, keys, paths or unknown values.
//  - Numbers are finite, non-negative, safe integers within bounds (no NaN/Infinity).
//
// Not covered: auth provider boundary, scope/role model, idempotency store,
// rate-limit enforcement, Structured Await, queue/job contracts, runtime audit
// report format, handoff contracts, or live JSON decode / requestValidators wiring.

/** Record / input is not a closed data object. */
export const FUNGI_APPK_RVP_001 = "FUNGI-APPK-RVP-001";
/** A field value is outside its closed domain. */
export const FUNGI_APPK_RVP_002 = "FUNGI-APPK-RVP-002";
/** Policy consistency refuse (deny + empty admittedFields / overlapping lists). */
export const FUNGI_APPK_RVP_003 = "FUNGI-APPK-RVP-003";
/** Nested list refuse. */
export const FUNGI_APPK_RVP_004 = "FUNGI-APPK-RVP-004";
/** Result consistency refuse. */
export const FUNGI_APPK_RVP_005 = "FUNGI-APPK-RVP-005";

export const REQUEST_VALIDATION_POLICY_SCHEMA = "galerina.app-kernel.request-validation-policy/v1";

/** "strip" is reserved and refused until implemented (matches route-defaults / typed-api). */
export const RVP_UNKNOWN_FIELDS_MODES = Object.freeze(["deny", "allow"] as const);
export type RequestValidationUnknownFieldsMode = (typeof RVP_UNKNOWN_FIELDS_MODES)[number];

export const RVP_DUPLICATE_KEYS_MODES = Object.freeze(["deny", "lastWins"] as const);
export type RequestValidationDuplicateKeysMode = (typeof RVP_DUPLICATE_KEYS_MODES)[number];

export const REQUEST_VALIDATION_POLICY_FIELDS = Object.freeze([
  "schema",
  "requestType",
  "bodyRequired",
  "contentType",
  "maxSizeBytes",
  "unknownFields",
  "duplicateKeys",
  "admittedFields",
  "diagnostics",
] as const);

export type RequestValidationDiagnosticField =
  | "record"
  | "schema"
  | "requestType"
  | "bodyRequired"
  | "contentType"
  | "maxSizeBytes"
  | "unknownFields"
  | "duplicateKeys"
  | "admittedFields"
  | "diagnostics";

export interface RequestValidationDiagnostic {
  readonly code: string;
  readonly severity: "error";
  readonly message: string;
  readonly field: RequestValidationDiagnosticField;
}

export interface RequestValidationPolicy {
  readonly schema: typeof REQUEST_VALIDATION_POLICY_SCHEMA;
  readonly requestType: string;
  readonly bodyRequired: boolean;
  readonly contentType: string;
  readonly maxSizeBytes: number;
  readonly unknownFields: RequestValidationUnknownFieldsMode;
  readonly duplicateKeys: RequestValidationDuplicateKeysMode;
  readonly admittedFields: readonly string[];
  readonly diagnostics: readonly RequestValidationDiagnostic[];
}

export type ReadRequestValidationPolicyResult =
  | { readonly ok: true; readonly value: RequestValidationPolicy }
  | { readonly ok: false; readonly diagnostics: readonly RequestValidationDiagnostic[] };

const TYPE_NAME = /^[A-Z][A-Za-z0-9_]{0,63}$/;
const FIELD_TOKEN = /^[a-zA-Z_][A-Za-z0-9_]{0,63}$/;
const CONTENT_TYPE = /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/;
const MAX_FIELDS = 256;
const MAX_LIST = 4096;
const MAX_TOKEN = 128;
const MAX_BODY_BYTES = 64 * 1024 * 1024;
const UNKNOWN_SET = new Set<string>(RVP_UNKNOWN_FIELDS_MODES);
const DUP_SET = new Set<string>(RVP_DUPLICATE_KEYS_MODES);

const diag = (
  code: string,
  message: string,
  field: RequestValidationDiagnosticField,
): RequestValidationDiagnostic => Object.freeze({ code, severity: "error" as const, message, field });

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
  field: RequestValidationDiagnosticField,
  max: number,
  out: RequestValidationDiagnostic[],
): number | undefined {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > max
  ) {
    out.push(diag(FUNGI_APPK_RVP_002, "Numeric field is outside the closed domain.", field));
    return undefined;
  }
  return value;
}

function readBoolean(
  value: unknown,
  field: RequestValidationDiagnosticField,
  out: RequestValidationDiagnostic[],
): boolean | undefined {
  if (value !== true && value !== false) {
    out.push(diag(FUNGI_APPK_RVP_002, "Flag must be a boolean.", field));
    return undefined;
  }
  return value;
}

function requireKeysSubset(
  snap: Extract<Snapshot, { ok: true }>,
  allowed: readonly string[],
  required: readonly string[],
  field: RequestValidationDiagnosticField,
  out: RequestValidationDiagnostic[],
): boolean {
  const allowedSet = new Set(allowed);
  for (const key of snap.values.keys()) {
    if (!allowedSet.has(key)) {
      out.push(diag(FUNGI_APPK_RVP_001, "Record has a key outside the closed shape.", field));
      return false;
    }
  }
  for (const key of required) {
    if (!snap.values.has(key)) {
      out.push(diag(FUNGI_APPK_RVP_001, "Record is missing a required field.", field));
      return false;
    }
  }
  return true;
}

function readAdmittedFields(
  value: unknown,
  out: RequestValidationDiagnostic[],
): readonly string[] | undefined {
  const items = snapshotArray(value, MAX_FIELDS);
  if (items === undefined) {
    out.push(diag(FUNGI_APPK_RVP_004, "Admitted fields must be a dense array within bounds.", "admittedFields"));
    return undefined;
  }
  const fields: string[] = [];
  for (const item of items) {
    if (typeof item !== "string" || !FIELD_TOKEN.test(item)) {
      out.push(diag(FUNGI_APPK_RVP_002, "Field token is outside the closed domain.", "admittedFields"));
      return undefined;
    }
    fields.push(item);
  }
  if (!strictlyAscending(fields)) {
    out.push(
      diag(FUNGI_APPK_RVP_002, "Admitted fields must be strictly ascending with no duplicates.", "admittedFields"),
    );
    return undefined;
  }
  return Object.freeze(fields);
}

function snapshotDiagnostics(
  value: unknown,
  field: RequestValidationDiagnosticField,
  out: RequestValidationDiagnostic[],
): readonly RequestValidationDiagnostic[] | undefined {
  const items = snapshotArray(value, MAX_LIST);
  if (items === undefined) {
    out.push(diag(FUNGI_APPK_RVP_001, "Diagnostics must be a dense array within bounds.", field));
    return undefined;
  }
  const result: RequestValidationDiagnostic[] = [];
  for (const item of items) {
    const snap = snapshotRecord(item, 8);
    if (!snap.ok) {
      out.push(diag(FUNGI_APPK_RVP_001, "Diagnostic entry must be a plain data object.", field));
      return undefined;
    }
    const known = new Set(["code", "severity", "message", "field"]);
    if ([...snap.values.keys()].some((k) => !known.has(k))) {
      out.push(diag(FUNGI_APPK_RVP_001, "Diagnostic entry has a key outside the closed shape.", field));
      return undefined;
    }
    for (const req of known) {
      if (!snap.values.has(req)) {
        out.push(diag(FUNGI_APPK_RVP_001, "Diagnostic entry is missing a required field.", field));
        return undefined;
      }
    }
    const code = snap.values.get("code");
    const severity = snap.values.get("severity");
    const message = snap.values.get("message");
    const f = snap.values.get("field");
    if (typeof code !== "string" || code.length === 0 || code.length > MAX_TOKEN) {
      out.push(diag(FUNGI_APPK_RVP_002, "Diagnostic code is outside the closed domain.", field));
      return undefined;
    }
    if (severity !== "error") {
      out.push(diag(FUNGI_APPK_RVP_002, "Diagnostic severity is outside the closed domain.", field));
      return undefined;
    }
    if (typeof message !== "string" || message.length === 0 || message.length > 512) {
      out.push(diag(FUNGI_APPK_RVP_002, "Diagnostic message is outside the closed domain.", field));
      return undefined;
    }
    if (typeof f !== "string" || f.length === 0 || f.length > MAX_TOKEN) {
      out.push(diag(FUNGI_APPK_RVP_002, "Diagnostic field is outside the closed domain.", field));
      return undefined;
    }
    result.push(
      Object.freeze({ code, severity: "error" as const, message, field: f as RequestValidationDiagnosticField }),
    );
  }
  return Object.freeze(result);
}

function refusedPolicy(diagnostics: readonly RequestValidationDiagnostic[]): RequestValidationPolicy {
  return Object.freeze({
    schema: REQUEST_VALIDATION_POLICY_SCHEMA,
    requestType: "Refused",
    bodyRequired: true,
    contentType: "application/json",
    maxSizeBytes: 0,
    unknownFields: "deny" as const,
    duplicateKeys: "deny" as const,
    admittedFields: Object.freeze([] as string[]),
    diagnostics: Object.freeze([...diagnostics]),
  });
}

/** Build a closed RequestValidationPolicy; never throws; success recomputed from diagnostics. */
export function createRequestValidationPolicy(input: unknown): RequestValidationPolicy {
  const out: RequestValidationDiagnostic[] = [];
  try {
    const snap = snapshotRecord(input, REQUEST_VALIDATION_POLICY_FIELDS.length);
    if (!snap.ok) {
      out.push(diag(FUNGI_APPK_RVP_001, "Request validation policy must be a plain data object.", "record"));
      return refusedPolicy(out);
    }
    if (
      !requireKeysSubset(
        snap,
        REQUEST_VALIDATION_POLICY_FIELDS,
        [
          "schema",
          "requestType",
          "bodyRequired",
          "contentType",
          "maxSizeBytes",
          "unknownFields",
          "duplicateKeys",
          "admittedFields",
        ],
        "record",
        out,
      )
    ) {
      return refusedPolicy(out);
    }

    const schema = snap.values.get("schema");
    if (schema !== REQUEST_VALIDATION_POLICY_SCHEMA) {
      out.push(diag(FUNGI_APPK_RVP_002, "Schema token is outside the closed vocabulary.", "schema"));
      return refusedPolicy(out);
    }

    const requestType = snap.values.get("requestType");
    if (typeof requestType !== "string" || !TYPE_NAME.test(requestType)) {
      out.push(diag(FUNGI_APPK_RVP_002, "Request type is outside the closed domain.", "requestType"));
      return refusedPolicy(out);
    }

    const bodyRequired = readBoolean(snap.values.get("bodyRequired"), "bodyRequired", out);
    if (bodyRequired === undefined) return refusedPolicy(out);

    const contentType = snap.values.get("contentType");
    if (typeof contentType !== "string" || contentType.length > MAX_TOKEN || !CONTENT_TYPE.test(contentType)) {
      out.push(diag(FUNGI_APPK_RVP_002, "Content type is outside the closed domain.", "contentType"));
      return refusedPolicy(out);
    }

    const maxSizeBytes = readBoundedInt(snap.values.get("maxSizeBytes"), "maxSizeBytes", MAX_BODY_BYTES, out);
    if (maxSizeBytes === undefined) return refusedPolicy(out);

    const unknownFields = snap.values.get("unknownFields");
    if (typeof unknownFields !== "string" || !UNKNOWN_SET.has(unknownFields)) {
      out.push(diag(FUNGI_APPK_RVP_002, "Unknown-fields mode is outside the closed vocabulary.", "unknownFields"));
      return refusedPolicy(out);
    }

    const duplicateKeys = snap.values.get("duplicateKeys");
    if (typeof duplicateKeys !== "string" || !DUP_SET.has(duplicateKeys)) {
      out.push(diag(FUNGI_APPK_RVP_002, "Duplicate-keys mode is outside the closed vocabulary.", "duplicateKeys"));
      return refusedPolicy(out);
    }

    const admittedFields = readAdmittedFields(snap.values.get("admittedFields"), out);
    if (admittedFields === undefined) return refusedPolicy(out);

    // deny requires a non-empty closed field set; allow may be empty (open admission).
    if (unknownFields === "deny" && admittedFields.length === 0) {
      out.push(
        diag(
          FUNGI_APPK_RVP_003,
          "Deny unknown-fields mode requires a non-empty admitted field set.",
          "admittedFields",
        ),
      );
      return refusedPolicy(out);
    }

    // bodyRequired=false with maxSizeBytes=0 is the only empty-body admission; otherwise size must admit at least 1 byte when body is required.
    if (bodyRequired === true && maxSizeBytes === 0) {
      out.push(
        diag(FUNGI_APPK_RVP_003, "Body-required policy must admit a positive max size.", "maxSizeBytes"),
      );
      return refusedPolicy(out);
    }

    let diagnostics: readonly RequestValidationDiagnostic[] = Object.freeze([]);
    if (snap.values.has("diagnostics")) {
      const nested = snapshotDiagnostics(snap.values.get("diagnostics"), "diagnostics", out);
      if (nested === undefined) return refusedPolicy(out);
      if (nested.length > 0) {
        out.push(diag(FUNGI_APPK_RVP_005, "Input diagnostics must be empty on create.", "diagnostics"));
        return refusedPolicy(out);
      }
      diagnostics = nested;
    }

    return Object.freeze({
      schema: REQUEST_VALIDATION_POLICY_SCHEMA,
      requestType,
      bodyRequired,
      contentType,
      maxSizeBytes,
      unknownFields: unknownFields as RequestValidationUnknownFieldsMode,
      duplicateKeys: duplicateKeys as RequestValidationDuplicateKeysMode,
      admittedFields,
      diagnostics,
    });
  } catch {
    return refusedPolicy([diag(FUNGI_APPK_RVP_001, "Request validation policy read failed closed.", "record")]);
  }
}

/** Read a closed RequestValidationPolicy; never throws; never echoes refused tokens. */
export function readRequestValidationPolicy(value: unknown): ReadRequestValidationPolicyResult {
  const created = createRequestValidationPolicy(value);
  if (created.diagnostics.length > 0) {
    return { ok: false, diagnostics: created.diagnostics };
  }
  return { ok: true, value: created };
}

export function isRequestValidationUnknownFieldsMode(
  value: unknown,
): value is RequestValidationUnknownFieldsMode {
  return typeof value === "string" && UNKNOWN_SET.has(value);
}

export function isRequestValidationDuplicateKeysMode(
  value: unknown,
): value is RequestValidationDuplicateKeysMode {
  return typeof value === "string" && DUP_SET.has(value);
}
