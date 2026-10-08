// Request Structured Await scope and cancellation policy (TODO pass, Grok 2026-10-05;
// zero-trust defaults, owner may revisit).
//
// Closed-shape StructuredAwaitPolicy / StructuredAwaitLimits for the app-kernel
// "Define request Structured Await scope and cancellation policy" TODO. Captures
// the request-scope, cancellation, child-error, background-work and timeout
// ceilings described in ARCHITECTURE.md "Structured Await Policy" as data a
// kernel may consult, without wiring createAppKernel, executing scoped work
// (galerina-core-runtime owns execution), or defining the queue/job contract.
//
// Zero-trust rules:
//  - Closed shapes via property descriptors (no getters run; symbols / accessors /
//    custom prototypes refuse). Unknown keys refuse without echoing the key.
//  - requestScope admits only "required" (optional / none refused).
//  - onRequestCancel admits only "cancel_children" (detach / ignore refused).
//  - onChildError admits only "cancel_siblings" (continue / ignore refused).
//  - backgroundWork admits only "deny". "queue_handoff" is reserved until the
//    app-kernel queue/job contract lands and is refused here.
//  - externalAwaitTimeout admits only "required" (optional / none refused).
//  - admittedAwaitModes is a non-empty, strictly ascending subset of
//    all / race / single / stream; wildcards refused.
//  - Limits are finite, positive, safe integers within bounds (no NaN /
//    Infinity / 0 / negative / "unlimited"); the external-await timeout must not
//    exceed the request timeout.
//  - Diagnostic messages never echo tokens, labels, keys, paths, secrets or
//    unknown values.
//
// Not covered: live scope execution, cancellation propagation at runtime, queue
// handoff / queue-job contracts, IdempotencyStore, runtime audit report, or
// handoff contracts to core-runtime / api-server.

/** Record / input is not a closed data object. */
export const FUNGI_APPK_SAW_001 = "FUNGI-APPK-SAW-001";
/** A field value is outside its closed domain. */
export const FUNGI_APPK_SAW_002 = "FUNGI-APPK-SAW-002";
/** Policy consistency refuse (empty / duplicate await modes, timeout ordering). */
export const FUNGI_APPK_SAW_003 = "FUNGI-APPK-SAW-003";
/** Nested limits / list refuse. */
export const FUNGI_APPK_SAW_004 = "FUNGI-APPK-SAW-004";
/** Result consistency refuse. */
export const FUNGI_APPK_SAW_005 = "FUNGI-APPK-SAW-005";

export const STRUCTURED_AWAIT_POLICY_SCHEMA = "galerina.app-kernel.structured-await-policy/v1";

/** Every route handler runs inside a request scope. */
export const STRUCTURED_AWAIT_REQUEST_SCOPES = Object.freeze(["required"] as const);
export type StructuredAwaitRequestScope = (typeof STRUCTURED_AWAIT_REQUEST_SCOPES)[number];

/** Request cancellation cancels unfinished child work. */
export const STRUCTURED_AWAIT_CANCEL_POLICIES = Object.freeze(["cancel_children"] as const);
export type StructuredAwaitCancelPolicy = (typeof STRUCTURED_AWAIT_CANCEL_POLICIES)[number];

/** A failing child cancels its unfinished siblings. */
export const STRUCTURED_AWAIT_CHILD_ERROR_POLICIES = Object.freeze(["cancel_siblings"] as const);
export type StructuredAwaitChildErrorPolicy = (typeof STRUCTURED_AWAIT_CHILD_ERROR_POLICIES)[number];

/** Background work is denied; "queue_handoff" is reserved for the queue/job contract and refused. */
export const STRUCTURED_AWAIT_BACKGROUND_WORK = Object.freeze(["deny"] as const);
export type StructuredAwaitBackgroundWork = (typeof STRUCTURED_AWAIT_BACKGROUND_WORK)[number];

/** External network / database awaits must carry a timeout. */
export const STRUCTURED_AWAIT_EXTERNAL_TIMEOUT = Object.freeze(["required"] as const);
export type StructuredAwaitExternalTimeout = (typeof STRUCTURED_AWAIT_EXTERNAL_TIMEOUT)[number];

export const STRUCTURED_AWAIT_MODES = Object.freeze(["all", "race", "single", "stream"] as const);
export type StructuredAwaitMode = (typeof STRUCTURED_AWAIT_MODES)[number];

export const STRUCTURED_AWAIT_POLICY_FIELDS = Object.freeze([
  "schema",
  "name",
  "requestScope",
  "onRequestCancel",
  "onChildError",
  "backgroundWork",
  "externalAwaitTimeout",
  "admittedAwaitModes",
  "limits",
  "diagnostics",
] as const);

export const STRUCTURED_AWAIT_LIMIT_FIELDS = Object.freeze([
  "maxRequestTimeoutMs",
  "maxExternalAwaitTimeoutMs",
  "maxChildConcurrency",
  "maxStreamItems",
] as const);

export type StructuredAwaitDiagnosticField =
  | "record"
  | "schema"
  | "name"
  | "requestScope"
  | "onRequestCancel"
  | "onChildError"
  | "backgroundWork"
  | "externalAwaitTimeout"
  | "admittedAwaitModes"
  | "limits"
  | "diagnostics"
  | "maxRequestTimeoutMs"
  | "maxExternalAwaitTimeoutMs"
  | "maxChildConcurrency"
  | "maxStreamItems";

export interface StructuredAwaitDiagnostic {
  readonly code: string;
  readonly severity: "error";
  readonly message: string;
  readonly field: StructuredAwaitDiagnosticField;
}

export interface StructuredAwaitLimits {
  readonly maxRequestTimeoutMs: number;
  readonly maxExternalAwaitTimeoutMs: number;
  readonly maxChildConcurrency: number;
  readonly maxStreamItems: number;
}

export interface StructuredAwaitPolicy {
  readonly schema: typeof STRUCTURED_AWAIT_POLICY_SCHEMA;
  readonly name: string;
  readonly requestScope: StructuredAwaitRequestScope;
  readonly onRequestCancel: StructuredAwaitCancelPolicy;
  readonly onChildError: StructuredAwaitChildErrorPolicy;
  readonly backgroundWork: StructuredAwaitBackgroundWork;
  readonly externalAwaitTimeout: StructuredAwaitExternalTimeout;
  readonly admittedAwaitModes: readonly StructuredAwaitMode[];
  readonly limits: StructuredAwaitLimits;
  readonly diagnostics: readonly StructuredAwaitDiagnostic[];
}

export type ReadStructuredAwaitPolicyResult =
  | { readonly ok: true; readonly value: StructuredAwaitPolicy }
  | { readonly ok: false; readonly diagnostics: readonly StructuredAwaitDiagnostic[] };

const TYPE_NAME = /^[A-Z][A-Za-z0-9_]{0,63}$/;
const MAX_MODES = STRUCTURED_AWAIT_MODES.length;
const MAX_LIST = 4096;
const MAX_TOKEN = 128;
const MIN_TIMEOUT_MS = 1;
const MAX_TIMEOUT_MS = 3_600_000; // 1h
const MIN_CHILD_CONCURRENCY = 1;
const MAX_CHILD_CONCURRENCY = 1_024;
const MIN_STREAM_ITEMS = 1;
const MAX_STREAM_ITEMS = 1_000_000;
const REQUEST_SCOPE_SET = new Set<string>(STRUCTURED_AWAIT_REQUEST_SCOPES);
const CANCEL_SET = new Set<string>(STRUCTURED_AWAIT_CANCEL_POLICIES);
const CHILD_ERROR_SET = new Set<string>(STRUCTURED_AWAIT_CHILD_ERROR_POLICIES);
const BACKGROUND_SET = new Set<string>(STRUCTURED_AWAIT_BACKGROUND_WORK);
const EXTERNAL_TIMEOUT_SET = new Set<string>(STRUCTURED_AWAIT_EXTERNAL_TIMEOUT);
const MODE_SET = new Set<string>(STRUCTURED_AWAIT_MODES);

const diag = (
  code: string,
  message: string,
  field: StructuredAwaitDiagnosticField,
): StructuredAwaitDiagnostic => Object.freeze({ code, severity: "error" as const, message, field });

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

function requireKeysSubset(
  snap: Extract<Snapshot, { ok: true }>,
  allowed: readonly string[],
  required: readonly string[],
  field: StructuredAwaitDiagnosticField,
  out: StructuredAwaitDiagnostic[],
): boolean {
  const allowedSet = new Set(allowed);
  for (const key of snap.values.keys()) {
    if (!allowedSet.has(key)) {
      out.push(diag(FUNGI_APPK_SAW_001, "Record has a key outside the closed shape.", field));
      return false;
    }
  }
  for (const key of required) {
    if (!snap.values.has(key)) {
      out.push(diag(FUNGI_APPK_SAW_001, "Record is missing a required field.", field));
      return false;
    }
  }
  return true;
}

function readPositiveSafeInt(
  value: unknown,
  field: StructuredAwaitDiagnosticField,
  min: number,
  max: number,
  out: StructuredAwaitDiagnostic[],
): number | undefined {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    !Number.isSafeInteger(value) ||
    value < min ||
    value > max
  ) {
    out.push(diag(FUNGI_APPK_SAW_002, "Numeric limit is outside the closed domain.", field));
    return undefined;
  }
  return value;
}

function readClosedToken(
  value: unknown,
  allowed: ReadonlySet<string>,
  field: StructuredAwaitDiagnosticField,
  message: string,
  out: StructuredAwaitDiagnostic[],
): string | undefined {
  if (typeof value !== "string" || !allowed.has(value)) {
    out.push(diag(FUNGI_APPK_SAW_002, message, field));
    return undefined;
  }
  return value;
}

function readModeList(value: unknown, out: StructuredAwaitDiagnostic[]): readonly StructuredAwaitMode[] | undefined {
  const items = snapshotArray(value, MAX_MODES);
  if (items === undefined) {
    out.push(diag(FUNGI_APPK_SAW_004, "Await-mode list must be a dense array within bounds.", "admittedAwaitModes"));
    return undefined;
  }
  if (items.length === 0) {
    out.push(diag(FUNGI_APPK_SAW_003, "Await-mode list must be non-empty.", "admittedAwaitModes"));
    return undefined;
  }
  const modes: StructuredAwaitMode[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    if (typeof item !== "string" || !MODE_SET.has(item)) {
      out.push(diag(FUNGI_APPK_SAW_002, "Await mode is outside the closed vocabulary.", "admittedAwaitModes"));
      return undefined;
    }
    if (seen.has(item)) {
      out.push(diag(FUNGI_APPK_SAW_003, "Await modes must be unique.", "admittedAwaitModes"));
      return undefined;
    }
    seen.add(item);
    modes.push(item as StructuredAwaitMode);
  }
  if (!strictlyAscending(modes)) {
    out.push(diag(FUNGI_APPK_SAW_002, "Await-mode list must be strictly ascending.", "admittedAwaitModes"));
    return undefined;
  }
  return Object.freeze(modes);
}

function snapshotDiagnostics(value: unknown, out: StructuredAwaitDiagnostic[]): readonly StructuredAwaitDiagnostic[] | undefined {
  const items = snapshotArray(value, MAX_LIST);
  if (items === undefined) {
    out.push(diag(FUNGI_APPK_SAW_001, "Diagnostics must be a dense array within bounds.", "diagnostics"));
    return undefined;
  }
  const result: StructuredAwaitDiagnostic[] = [];
  const known = ["code", "severity", "message", "field"];
  for (const item of items) {
    const snap = snapshotRecord(item, 8);
    if (!snap.ok) {
      out.push(diag(FUNGI_APPK_SAW_001, "Diagnostic entry must be a plain data object.", "diagnostics"));
      return undefined;
    }
    if (!requireKeysSubset(snap, known, known, "diagnostics", out)) return undefined;
    const code = snap.values.get("code");
    const severity = snap.values.get("severity");
    const message = snap.values.get("message");
    const f = snap.values.get("field");
    if (
      typeof code !== "string" ||
      code.length === 0 ||
      code.length > MAX_TOKEN ||
      severity !== "error" ||
      typeof message !== "string" ||
      message.length === 0 ||
      message.length > 512 ||
      typeof f !== "string" ||
      f.length === 0 ||
      f.length > MAX_TOKEN
    ) {
      out.push(diag(FUNGI_APPK_SAW_002, "Diagnostic entry is outside the closed domain.", "diagnostics"));
      return undefined;
    }
    result.push(Object.freeze({ code, severity: "error" as const, message, field: f as StructuredAwaitDiagnosticField }));
  }
  return Object.freeze(result);
}

function readLimits(value: unknown, out: StructuredAwaitDiagnostic[]): StructuredAwaitLimits | undefined {
  const snap = snapshotRecord(value, STRUCTURED_AWAIT_LIMIT_FIELDS.length);
  if (!snap.ok) {
    out.push(diag(FUNGI_APPK_SAW_004, "Structured Await limits must be a plain data object.", "limits"));
    return undefined;
  }
  if (!requireKeysSubset(snap, STRUCTURED_AWAIT_LIMIT_FIELDS, STRUCTURED_AWAIT_LIMIT_FIELDS, "limits", out)) {
    return undefined;
  }

  const maxRequestTimeoutMs = readPositiveSafeInt(
    snap.values.get("maxRequestTimeoutMs"),
    "maxRequestTimeoutMs",
    MIN_TIMEOUT_MS,
    MAX_TIMEOUT_MS,
    out,
  );
  if (maxRequestTimeoutMs === undefined) return undefined;

  const maxExternalAwaitTimeoutMs = readPositiveSafeInt(
    snap.values.get("maxExternalAwaitTimeoutMs"),
    "maxExternalAwaitTimeoutMs",
    MIN_TIMEOUT_MS,
    MAX_TIMEOUT_MS,
    out,
  );
  if (maxExternalAwaitTimeoutMs === undefined) return undefined;
  if (maxExternalAwaitTimeoutMs > maxRequestTimeoutMs) {
    out.push(
      diag(
        FUNGI_APPK_SAW_003,
        "External-await timeout must not exceed the request timeout.",
        "maxExternalAwaitTimeoutMs",
      ),
    );
    return undefined;
  }

  const maxChildConcurrency = readPositiveSafeInt(
    snap.values.get("maxChildConcurrency"),
    "maxChildConcurrency",
    MIN_CHILD_CONCURRENCY,
    MAX_CHILD_CONCURRENCY,
    out,
  );
  if (maxChildConcurrency === undefined) return undefined;

  const maxStreamItems = readPositiveSafeInt(
    snap.values.get("maxStreamItems"),
    "maxStreamItems",
    MIN_STREAM_ITEMS,
    MAX_STREAM_ITEMS,
    out,
  );
  if (maxStreamItems === undefined) return undefined;

  return Object.freeze({ maxRequestTimeoutMs, maxExternalAwaitTimeoutMs, maxChildConcurrency, maxStreamItems });
}

function refusedPolicy(diagnostics: readonly StructuredAwaitDiagnostic[]): StructuredAwaitPolicy {
  return Object.freeze({
    schema: STRUCTURED_AWAIT_POLICY_SCHEMA,
    name: "Refused",
    requestScope: "required" as const,
    onRequestCancel: "cancel_children" as const,
    onChildError: "cancel_siblings" as const,
    backgroundWork: "deny" as const,
    externalAwaitTimeout: "required" as const,
    admittedAwaitModes: Object.freeze([] as StructuredAwaitMode[]),
    limits: Object.freeze({
      maxRequestTimeoutMs: 1,
      maxExternalAwaitTimeoutMs: 1,
      maxChildConcurrency: 1,
      maxStreamItems: 1,
    }),
    diagnostics: Object.freeze([...diagnostics]),
  });
}

/** Build a closed StructuredAwaitPolicy; never throws; success recomputed from diagnostics. */
export function createStructuredAwaitPolicy(input: unknown): StructuredAwaitPolicy {
  const out: StructuredAwaitDiagnostic[] = [];
  try {
    const snap = snapshotRecord(input, STRUCTURED_AWAIT_POLICY_FIELDS.length);
    if (!snap.ok) {
      out.push(diag(FUNGI_APPK_SAW_001, "Structured Await policy must be a plain data object.", "record"));
      return refusedPolicy(out);
    }
    if (
      !requireKeysSubset(
        snap,
        STRUCTURED_AWAIT_POLICY_FIELDS,
        STRUCTURED_AWAIT_POLICY_FIELDS.filter((k) => k !== "diagnostics"),
        "record",
        out,
      )
    ) {
      return refusedPolicy(out);
    }

    if (snap.values.get("schema") !== STRUCTURED_AWAIT_POLICY_SCHEMA) {
      out.push(diag(FUNGI_APPK_SAW_002, "Schema token is outside the closed vocabulary.", "schema"));
      return refusedPolicy(out);
    }

    const name = snap.values.get("name");
    if (typeof name !== "string" || !TYPE_NAME.test(name)) {
      out.push(diag(FUNGI_APPK_SAW_002, "Policy name is outside the closed domain.", "name"));
      return refusedPolicy(out);
    }

    if (
      readClosedToken(
        snap.values.get("requestScope"),
        REQUEST_SCOPE_SET,
        "requestScope",
        "Request scope is outside the closed vocabulary.",
        out,
      ) === undefined ||
      readClosedToken(
        snap.values.get("onRequestCancel"),
        CANCEL_SET,
        "onRequestCancel",
        "Request-cancel policy is outside the closed vocabulary.",
        out,
      ) === undefined ||
      readClosedToken(
        snap.values.get("onChildError"),
        CHILD_ERROR_SET,
        "onChildError",
        "Child-error policy is outside the closed vocabulary.",
        out,
      ) === undefined ||
      readClosedToken(
        snap.values.get("backgroundWork"),
        BACKGROUND_SET,
        "backgroundWork",
        "Background-work policy is outside the closed vocabulary.",
        out,
      ) === undefined ||
      readClosedToken(
        snap.values.get("externalAwaitTimeout"),
        EXTERNAL_TIMEOUT_SET,
        "externalAwaitTimeout",
        "External-await timeout policy is outside the closed vocabulary.",
        out,
      ) === undefined
    ) {
      return refusedPolicy(out);
    }

    const admittedAwaitModes = readModeList(snap.values.get("admittedAwaitModes"), out);
    if (admittedAwaitModes === undefined) return refusedPolicy(out);

    const limits = readLimits(snap.values.get("limits"), out);
    if (limits === undefined) return refusedPolicy(out);

    let diagnostics: readonly StructuredAwaitDiagnostic[] = Object.freeze([]);
    if (snap.values.has("diagnostics")) {
      const nested = snapshotDiagnostics(snap.values.get("diagnostics"), out);
      if (nested === undefined) return refusedPolicy(out);
      if (nested.length > 0) {
        out.push(diag(FUNGI_APPK_SAW_005, "Input diagnostics must be empty on create.", "diagnostics"));
        return refusedPolicy(out);
      }
      diagnostics = nested;
    }

    return Object.freeze({
      schema: STRUCTURED_AWAIT_POLICY_SCHEMA,
      name,
      requestScope: "required" as const,
      onRequestCancel: "cancel_children" as const,
      onChildError: "cancel_siblings" as const,
      backgroundWork: "deny" as const,
      externalAwaitTimeout: "required" as const,
      admittedAwaitModes,
      limits,
      diagnostics,
    });
  } catch {
    return refusedPolicy([diag(FUNGI_APPK_SAW_001, "Structured Await policy read failed closed.", "record")]);
  }
}

/** Read a closed StructuredAwaitPolicy; never throws; never echoes refused tokens. */
export function readStructuredAwaitPolicy(value: unknown): ReadStructuredAwaitPolicyResult {
  const created = createStructuredAwaitPolicy(value);
  if (created.diagnostics.length > 0) {
    return { ok: false, diagnostics: created.diagnostics };
  }
  return { ok: true, value: created };
}

export function isStructuredAwaitMode(value: unknown): value is StructuredAwaitMode {
  return typeof value === "string" && MODE_SET.has(value);
}
