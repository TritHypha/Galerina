// Idempotency and replay protection contract (TODO pass, Grok 2026-10-06;
// zero-trust defaults, owner may revisit).
//
// Closed-shape IdempotencyReplayPolicy for the app-kernel "Define idempotency
// and replay protection contract" TODO. It records, as data a kernel, reporter
// or reviewer may consult, the behaviour the shipped request pipeline already
// enforces (src/kernel.ts stage 9.75, src/route-defaults.ts, src/types.ts):
//  - mutating methods get idempotency by default (MUTATING_METHODS);
//  - a missing key is refused (409); a duplicate key is refused (409);
//  - onDuplicate "replay" is declared in the route type but refused at route
//    admission because it is not implemented;
//  - the key is claimed with ONE atomic store operation (IdempotencyStore.claim),
//    never an observational read-then-write pair;
//  - the claim happens only after every pre-handler refusal gate passed, so a
//    refused attempt never consumes a key;
//  - a store error or a malformed claim result fails closed (409);
//  - the claim scope is the route key.
// It does not wire createAppKernel, change kernel.ts, implement a durable store,
// implement response replay, or reconcile core-network IdempotencyStore get/put
// (that core-network [!] row stays open).
//
// Zero-trust rules:
//  - Closed shapes via property descriptors (no getters run; symbols / accessors /
//    custom prototypes refuse). Unknown keys refuse without echoing the key.
//  - Every behaviour field admits exactly ONE value, the fail-closed one:
//    mutatingMethods "required", missingKey "reject", onDuplicate "reject"
//    ("replay" reserved), storeFailure "reject", claim "atomic", claimAfterGates
//    "required", scope "route", echoKey "deny".
//  - header is an RFC 9110 token of at most 64 bytes.
//  - ttlSeconds / maxKeyBytes are positive safe integers within bounds.
//  - Diagnostic messages never echo tokens, names, keys, paths, secrets or
//    unknown values.
//
// OWNER-REVISIT picks (not spec): the ttlSeconds ceiling (7 days), the
// maxKeyBytes ceiling (1024; the in-memory store default is 256), and echoKey
// "deny" (the shipped duplicate-key 409 message currently includes the key; see
// the TODO row note).

/** Record / input is not a closed data object. */
export const FUNGI_APPK_IDR_001 = "FUNGI-APPK-IDR-001";
/** A field value is outside its closed domain (incl. reserved replay mode). */
export const FUNGI_APPK_IDR_002 = "FUNGI-APPK-IDR-002";
/** Header token refuse. */
export const FUNGI_APPK_IDR_003 = "FUNGI-APPK-IDR-003";
/** Nested record / list refuse. */
export const FUNGI_APPK_IDR_004 = "FUNGI-APPK-IDR-004";
/** Result consistency refuse. */
export const FUNGI_APPK_IDR_005 = "FUNGI-APPK-IDR-005";

export const IDEMPOTENCY_REPLAY_POLICY_SCHEMA = "galerina.app-kernel.idempotency-replay-policy/v1";

export const IDEMPOTENCY_MUTATING_METHODS = Object.freeze(["required"] as const);
export const IDEMPOTENCY_MISSING_KEY = Object.freeze(["reject"] as const);
export const IDEMPOTENCY_ON_DUPLICATE = Object.freeze(["reject"] as const);
/** Declared in the route type, refused until response replay is implemented. */
export const IDEMPOTENCY_RESERVED_ON_DUPLICATE = Object.freeze(["replay"] as const);
export const IDEMPOTENCY_STORE_FAILURE = Object.freeze(["reject"] as const);
export const IDEMPOTENCY_CLAIM = Object.freeze(["atomic"] as const);
export const IDEMPOTENCY_CLAIM_AFTER_GATES = Object.freeze(["required"] as const);
export const IDEMPOTENCY_SCOPE = Object.freeze(["route"] as const);
export const IDEMPOTENCY_ECHO_KEY = Object.freeze(["deny"] as const);

export const IDEMPOTENCY_TTL_SECONDS_MAX = 604_800;
export const IDEMPOTENCY_MAX_KEY_BYTES_MAX = 1024;

export const IDEMPOTENCY_REPLAY_POLICY_FIELDS = Object.freeze([
  "schema",
  "name",
  "mutatingMethods",
  "header",
  "ttlSeconds",
  "maxKeyBytes",
  "missingKey",
  "onDuplicate",
  "storeFailure",
  "claim",
  "claimAfterGates",
  "scope",
  "echoKey",
  "diagnostics",
] as const);

export type IdempotencyReplayDiagnosticField = "record" | (typeof IDEMPOTENCY_REPLAY_POLICY_FIELDS)[number];

export interface IdempotencyReplayDiagnostic {
  readonly code: string;
  readonly severity: "error";
  readonly message: string;
  readonly field: IdempotencyReplayDiagnosticField;
}

export interface IdempotencyReplayPolicy {
  readonly schema: typeof IDEMPOTENCY_REPLAY_POLICY_SCHEMA;
  readonly name: string;
  readonly mutatingMethods: "required";
  readonly header: string;
  readonly ttlSeconds: number;
  readonly maxKeyBytes: number;
  readonly missingKey: "reject";
  readonly onDuplicate: "reject";
  readonly storeFailure: "reject";
  readonly claim: "atomic";
  readonly claimAfterGates: "required";
  readonly scope: "route";
  readonly echoKey: "deny";
  readonly diagnostics: readonly IdempotencyReplayDiagnostic[];
}

export type ReadIdempotencyReplayPolicyResult =
  | { readonly ok: true; readonly value: IdempotencyReplayPolicy }
  | { readonly ok: false; readonly diagnostics: readonly IdempotencyReplayDiagnostic[] };

const TYPE_NAME = /^[A-Z][A-Za-z0-9_]{0,63}$/;
/** RFC 9110 token (tchar+), bounded. */
const HEADER_TOKEN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]{1,64}$/;
const MAX_LIST = 4096;
const MAX_TOKEN = 128;

const CLOSED: ReadonlyArray<readonly [IdempotencyReplayDiagnosticField, string]> = Object.freeze([
  ["mutatingMethods", "required"],
  ["missingKey", "reject"],
  ["onDuplicate", "reject"],
  ["storeFailure", "reject"],
  ["claim", "atomic"],
  ["claimAfterGates", "required"],
  ["scope", "route"],
  ["echoKey", "deny"],
] as const);

const diag = (
  code: string,
  message: string,
  field: IdempotencyReplayDiagnosticField,
): IdempotencyReplayDiagnostic => Object.freeze({ code, severity: "error" as const, message, field });

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

function readBoundedInt(
  value: unknown,
  field: IdempotencyReplayDiagnosticField,
  max: number,
  out: IdempotencyReplayDiagnostic[],
): number | undefined {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1 || value > max) {
    out.push(diag(FUNGI_APPK_IDR_002, "Numeric limit is outside the closed domain.", field));
    return undefined;
  }
  return value;
}

function snapshotDiagnostics(
  value: unknown,
  out: IdempotencyReplayDiagnostic[],
): readonly IdempotencyReplayDiagnostic[] | undefined {
  const items = snapshotArray(value, MAX_LIST);
  if (items === undefined) {
    out.push(diag(FUNGI_APPK_IDR_004, "Diagnostics must be a dense array within bounds.", "diagnostics"));
    return undefined;
  }
  const result: IdempotencyReplayDiagnostic[] = [];
  const known = new Set(["code", "severity", "message", "field"]);
  for (const item of items) {
    const snap = snapshotRecord(item, 4);
    if (!snap.ok || snap.values.size !== 4 || [...snap.values.keys()].some((k) => !known.has(k))) {
      out.push(diag(FUNGI_APPK_IDR_004, "Diagnostic entry must be a closed plain data object.", "diagnostics"));
      return undefined;
    }
    const code = snap.values.get("code");
    const severity = snap.values.get("severity");
    const message = snap.values.get("message");
    const f = snap.values.get("field");
    if (
      typeof code !== "string" || code.length === 0 || code.length > MAX_TOKEN ||
      severity !== "error" ||
      typeof message !== "string" || message.length === 0 || message.length > 512 ||
      typeof f !== "string" || f.length === 0 || f.length > MAX_TOKEN
    ) {
      out.push(diag(FUNGI_APPK_IDR_004, "Diagnostic entry is outside the closed domain.", "diagnostics"));
      return undefined;
    }
    result.push(Object.freeze({ code, severity: "error" as const, message, field: f as IdempotencyReplayDiagnosticField }));
  }
  return Object.freeze(result);
}

function refusedPolicy(diagnostics: readonly IdempotencyReplayDiagnostic[]): IdempotencyReplayPolicy {
  return Object.freeze({
    schema: IDEMPOTENCY_REPLAY_POLICY_SCHEMA,
    name: "Refused",
    mutatingMethods: "required" as const,
    header: "Idempotency-Key",
    ttlSeconds: 1,
    maxKeyBytes: 1,
    missingKey: "reject" as const,
    onDuplicate: "reject" as const,
    storeFailure: "reject" as const,
    claim: "atomic" as const,
    claimAfterGates: "required" as const,
    scope: "route" as const,
    echoKey: "deny" as const,
    diagnostics: Object.freeze([...diagnostics]),
  });
}

/** Build a closed IdempotencyReplayPolicy; never throws; success recomputed from diagnostics. */
export function createIdempotencyReplayPolicy(input: unknown): IdempotencyReplayPolicy {
  const out: IdempotencyReplayDiagnostic[] = [];
  try {
    const snap = snapshotRecord(input, IDEMPOTENCY_REPLAY_POLICY_FIELDS.length);
    if (!snap.ok) {
      out.push(diag(FUNGI_APPK_IDR_001, "Idempotency replay policy must be a plain data object.", "record"));
      return refusedPolicy(out);
    }
    const allowed = new Set<string>(IDEMPOTENCY_REPLAY_POLICY_FIELDS);
    for (const key of snap.values.keys()) {
      if (!allowed.has(key)) {
        out.push(diag(FUNGI_APPK_IDR_001, "Record has a key outside the closed shape.", "record"));
        return refusedPolicy(out);
      }
    }
    for (const key of IDEMPOTENCY_REPLAY_POLICY_FIELDS) {
      if (key !== "diagnostics" && !snap.values.has(key)) {
        out.push(diag(FUNGI_APPK_IDR_001, "Record is missing a required field.", key));
        return refusedPolicy(out);
      }
    }

    if (snap.values.get("schema") !== IDEMPOTENCY_REPLAY_POLICY_SCHEMA) {
      out.push(diag(FUNGI_APPK_IDR_002, "Schema token is outside the closed vocabulary.", "schema"));
      return refusedPolicy(out);
    }
    const name = snap.values.get("name");
    if (typeof name !== "string" || !TYPE_NAME.test(name)) {
      out.push(diag(FUNGI_APPK_IDR_002, "Policy name is outside the closed domain.", "name"));
      return refusedPolicy(out);
    }
    const header = snap.values.get("header");
    if (typeof header !== "string" || !HEADER_TOKEN.test(header)) {
      out.push(diag(FUNGI_APPK_IDR_003, "Header must be an HTTP token of at most 64 characters.", "header"));
      return refusedPolicy(out);
    }
    const ttlSeconds = readBoundedInt(snap.values.get("ttlSeconds"), "ttlSeconds", IDEMPOTENCY_TTL_SECONDS_MAX, out);
    if (ttlSeconds === undefined) return refusedPolicy(out);
    const maxKeyBytes = readBoundedInt(snap.values.get("maxKeyBytes"), "maxKeyBytes", IDEMPOTENCY_MAX_KEY_BYTES_MAX, out);
    if (maxKeyBytes === undefined) return refusedPolicy(out);

    for (const [field, only] of CLOSED) {
      const v = snap.values.get(field);
      if (field === "onDuplicate" && v === "replay") {
        out.push(diag(FUNGI_APPK_IDR_002, "Duplicate replay is reserved until response replay is implemented.", field));
        return refusedPolicy(out);
      }
      if (v !== only) {
        out.push(diag(FUNGI_APPK_IDR_002, "Behaviour value is outside the closed vocabulary.", field));
        return refusedPolicy(out);
      }
    }

    let diagnostics: readonly IdempotencyReplayDiagnostic[] = Object.freeze([]);
    if (snap.values.has("diagnostics")) {
      const nested = snapshotDiagnostics(snap.values.get("diagnostics"), out);
      if (nested === undefined) return refusedPolicy(out);
      if (nested.length > 0) {
        out.push(diag(FUNGI_APPK_IDR_005, "Input diagnostics must be empty on create.", "diagnostics"));
        return refusedPolicy(out);
      }
      diagnostics = nested;
    }

    return Object.freeze({
      schema: IDEMPOTENCY_REPLAY_POLICY_SCHEMA,
      name,
      mutatingMethods: "required" as const,
      header,
      ttlSeconds,
      maxKeyBytes,
      missingKey: "reject" as const,
      onDuplicate: "reject" as const,
      storeFailure: "reject" as const,
      claim: "atomic" as const,
      claimAfterGates: "required" as const,
      scope: "route" as const,
      echoKey: "deny" as const,
      diagnostics,
    });
  } catch {
    return refusedPolicy([diag(FUNGI_APPK_IDR_001, "Idempotency replay policy read failed closed.", "record")]);
  }
}

/** Read a closed IdempotencyReplayPolicy; never throws; never echoes refused tokens. */
export function readIdempotencyReplayPolicy(value: unknown): ReadIdempotencyReplayPolicyResult {
  const created = createIdempotencyReplayPolicy(value);
  if (created.diagnostics.length > 0) return { ok: false, diagnostics: created.diagnostics };
  return { ok: true, value: created };
}