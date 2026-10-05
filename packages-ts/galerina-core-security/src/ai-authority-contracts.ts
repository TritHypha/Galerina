// AI self-grant / trust-root modification diagnostics (TODO pass, Grok 2026-10-05;
// zero-trust defaults, owner may revisit).
//
// Closed-shape contracts for the security TODO row "Define AI self-grant and
// trust-root modification diagnostics". Aligns with README Safety Contracts:
// AI actors may request capabilities but must not self-grant / self-approve;
// trust roots must not be modified by runtime AI without external governance.
// Does not invent SecretReference v0.2 or live enforcement.
//
// Zero-trust rules:
//  - Closed shapes via property descriptors (no getters; symbols / accessors /
//    custom prototypes refuse). Unknown keys refuse without echoing the key.
//  - Decisions are allow|deny|abstain only.
//  - selfGrantAttempt true requires decision deny (never record an allowed self-grant).
//  - decision allow on AiAuthorityRequest requires non-empty requestedCapabilities
//    and selfGrantAttempt false.
//  - Trust-root allow requires externalGovernance true and actorType human|service
//    (ai_agent / tool allow refused).
//  - Never throws; never echoes ids/tokens/keys/unknown values.
//
// Not covered: SecretReference v0.2, live AI grant / trust-root mutation runtime,
// OWASP / taint-flow / crypto-inventory / SecureRandom rows, or report writers.

/** Record / input is not a closed data object. */
export const FUNGI_SEC_ASG_001 = "FUNGI-SEC-ASG-001";
/** A field value is outside its closed domain (incl. unknown actorType / decision / op). */
export const FUNGI_SEC_ASG_002 = "FUNGI-SEC-ASG-002";
/** Consistency refuse (self-grant allow / empty allow caps / AI trust-root allow / governance). */
export const FUNGI_SEC_ASG_003 = "FUNGI-SEC-ASG-003";
/** Nested record / list refuse. */
export const FUNGI_SEC_ASG_004 = "FUNGI-SEC-ASG-004";
/** Result consistency refuse. */
export const FUNGI_SEC_ASG_005 = "FUNGI-SEC-ASG-005";

export const AI_AUTHORITY_REQUEST_SCHEMA = "galerina.security.ai-authority-request/v1";
export const TRUST_ROOT_MODIFICATION_SCHEMA = "galerina.security.trust-root-modification/v1";

export const AI_ACTOR_TYPES = Object.freeze([
  "human",
  "service",
  "ai_agent",
  "tool",
] as const);
export type AiActorType = (typeof AI_ACTOR_TYPES)[number];

export const AI_AUTHORITY_DECISIONS = Object.freeze(["abstain", "allow", "deny"] as const);
export type AiAuthorityDecision = (typeof AI_AUTHORITY_DECISIONS)[number];

export const TRUST_ROOT_OPERATIONS = Object.freeze([
  "add_key",
  "rotate_key",
  "revoke_key",
  "replace_root",
  "set_delegate",
] as const);
export type TrustRootOperation = (typeof TRUST_ROOT_OPERATIONS)[number];

/** Actor types that may be allowed to modify a trust root when externalGovernance is true. */
export const TRUST_ROOT_ALLOW_ACTOR_TYPES = Object.freeze(["human", "service"] as const);

export const AI_AUTHORITY_REQUEST_FIELDS = Object.freeze([
  "schema", "requestId", "actorId", "actorType", "requestedCapabilities",
  "requestedEffects", "decision", "selfGrantAttempt", "complete", "diagnostics",
] as const);

export const TRUST_ROOT_MODIFICATION_FIELDS = Object.freeze([
  "schema", "modificationId", "actorId", "actorType", "trustRootId",
  "operation", "decision", "externalGovernance", "complete", "diagnostics",
] as const);

export type AiAuthorityDiagnosticField =
  | "record" | "schema" | "requestId" | "actorId" | "actorType"
  | "requestedCapabilities" | "requestedEffects" | "decision" | "selfGrantAttempt"
  | "complete" | "diagnostics" | "modificationId" | "trustRootId" | "operation"
  | "externalGovernance";

export interface AiAuthorityDiagnostic {
  readonly code: string;
  readonly severity: "error";
  readonly message: string;
  readonly field: AiAuthorityDiagnosticField;
}

export interface AiAuthorityRequest {
  readonly schema: typeof AI_AUTHORITY_REQUEST_SCHEMA;
  readonly requestId: string;
  readonly actorId: string;
  readonly actorType: AiActorType;
  readonly requestedCapabilities: readonly string[];
  readonly requestedEffects: readonly string[];
  readonly decision: AiAuthorityDecision;
  readonly selfGrantAttempt: boolean;
  readonly complete: boolean;
  readonly diagnostics: readonly AiAuthorityDiagnostic[];
}

export interface TrustRootModification {
  readonly schema: typeof TRUST_ROOT_MODIFICATION_SCHEMA;
  readonly modificationId: string;
  readonly actorId: string;
  readonly actorType: AiActorType;
  readonly trustRootId: string;
  readonly operation: TrustRootOperation;
  readonly decision: AiAuthorityDecision;
  readonly externalGovernance: boolean;
  readonly complete: boolean;
  readonly diagnostics: readonly AiAuthorityDiagnostic[];
}

export type ReadAiAuthorityRequestResult =
  | { readonly ok: true; readonly value: AiAuthorityRequest }
  | { readonly ok: false; readonly diagnostics: readonly AiAuthorityDiagnostic[] };

export type ReadTrustRootModificationResult =
  | { readonly ok: true; readonly value: TrustRootModification }
  | { readonly ok: false; readonly diagnostics: readonly AiAuthorityDiagnostic[] };

const ID_TOKEN = /^[A-Za-z][A-Za-z0-9._-]{0,63}$/;
const MAX_LIST = 4096;
const MAX_KEYS = 32;
const ACTOR_SET = new Set<string>(AI_ACTOR_TYPES);
const DECISION_SET = new Set<string>(AI_AUTHORITY_DECISIONS);
const OP_SET = new Set<string>(TRUST_ROOT_OPERATIONS);
const TRUST_ALLOW_ACTOR_SET = new Set<string>(TRUST_ROOT_ALLOW_ACTOR_TYPES);

const diag = (
  code: string,
  message: string,
  field: AiAuthorityDiagnosticField,
): AiAuthorityDiagnostic => Object.freeze({ code, severity: "error" as const, message, field });

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
    if (typeof length !== "number" || !Number.isSafeInteger(length) || length < 0 || length > max) {
      return undefined;
    }
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
  field: AiAuthorityDiagnosticField,
  out: AiAuthorityDiagnostic[],
): boolean {
  const allowedSet = new Set(allowed);
  for (const key of snap.values.keys()) {
    if (!allowedSet.has(key)) {
      out.push(diag(FUNGI_SEC_ASG_001, "Record has a key outside the closed shape.", field));
      return false;
    }
  }
  for (const key of required) {
    if (!snap.values.has(key)) {
      out.push(diag(FUNGI_SEC_ASG_001, "Record is missing a required field.", field));
      return false;
    }
  }
  return true;
}

function readIdToken(
  value: unknown,
  field: AiAuthorityDiagnosticField,
  out: AiAuthorityDiagnostic[],
): string | undefined {
  if (typeof value !== "string" || !ID_TOKEN.test(value)) {
    out.push(diag(FUNGI_SEC_ASG_002, "Identifier is outside the closed token domain.", field));
    return undefined;
  }
  return value;
}

function readTokenList(
  value: unknown,
  field: AiAuthorityDiagnosticField,
  requireNonEmpty: boolean,
  out: AiAuthorityDiagnostic[],
): readonly string[] | undefined {
  const items = snapshotArray(value, MAX_LIST);
  if (items === undefined) {
    out.push(diag(FUNGI_SEC_ASG_004, "List must be a dense array within bounds.", field));
    return undefined;
  }
  if (requireNonEmpty && items.length === 0) {
    out.push(diag(FUNGI_SEC_ASG_003, "List must be non-empty.", field));
    return undefined;
  }
  const outList: string[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    if (typeof item !== "string" || !ID_TOKEN.test(item)) {
      out.push(diag(FUNGI_SEC_ASG_002, "List entry is outside the closed token domain.", field));
      return undefined;
    }
    if (seen.has(item)) {
      out.push(diag(FUNGI_SEC_ASG_003, "List entries must be unique.", field));
      return undefined;
    }
    seen.add(item);
    outList.push(item);
  }
  if (!strictlyAscending(outList)) {
    out.push(diag(FUNGI_SEC_ASG_002, "List must be strictly ascending.", field));
    return undefined;
  }
  return Object.freeze(outList);
}

function snapshotDiagnostics(
  value: unknown,
  out: AiAuthorityDiagnostic[],
): readonly AiAuthorityDiagnostic[] | undefined {
  const items = snapshotArray(value, MAX_LIST);
  if (items === undefined) {
    out.push(diag(FUNGI_SEC_ASG_001, "Diagnostics must be a dense array within bounds.", "diagnostics"));
    return undefined;
  }
  const result: AiAuthorityDiagnostic[] = [];
  const known = ["code", "severity", "message", "field"];
  for (const item of items) {
    const snap = snapshotRecord(item, 8);
    if (!snap.ok) {
      out.push(diag(FUNGI_SEC_ASG_001, "Diagnostic entry must be a plain data object.", "diagnostics"));
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
      code.length > 128 ||
      severity !== "error" ||
      typeof message !== "string" ||
      message.length === 0 ||
      message.length > 256 ||
      typeof f !== "string" ||
      f.length === 0 ||
      f.length > 64
    ) {
      out.push(diag(FUNGI_SEC_ASG_002, "Diagnostic fields are outside the closed domain.", "diagnostics"));
      return undefined;
    }
    result.push(Object.freeze({
      code,
      severity: "error" as const,
      message,
      field: f as AiAuthorityDiagnosticField,
    }));
  }
  return Object.freeze(result);
}

function failReq(out: AiAuthorityDiagnostic[]): ReadAiAuthorityRequestResult {
  return Object.freeze({ ok: false as const, diagnostics: Object.freeze([...out]) });
}

function failTrust(out: AiAuthorityDiagnostic[]): ReadTrustRootModificationResult {
  return Object.freeze({ ok: false as const, diagnostics: Object.freeze([...out]) });
}

export function readAiAuthorityRequest(input: unknown): ReadAiAuthorityRequestResult {
  const out: AiAuthorityDiagnostic[] = [];
  const snap = snapshotRecord(input, MAX_KEYS);
  if (!snap.ok) {
    out.push(diag(FUNGI_SEC_ASG_001, "AI authority request must be a plain data object.", "record"));
    return failReq(out);
  }
  if (!requireKeysSubset(snap, AI_AUTHORITY_REQUEST_FIELDS, AI_AUTHORITY_REQUEST_FIELDS, "record", out)) {
    return failReq(out);
  }
  if (snap.values.get("schema") !== AI_AUTHORITY_REQUEST_SCHEMA) {
    out.push(diag(FUNGI_SEC_ASG_002, "Schema is outside the closed domain.", "schema"));
    return failReq(out);
  }
  const requestId = readIdToken(snap.values.get("requestId"), "requestId", out);
  if (requestId === undefined) return failReq(out);
  const actorId = readIdToken(snap.values.get("actorId"), "actorId", out);
  if (actorId === undefined) return failReq(out);
  const actorTypeRaw = snap.values.get("actorType");
  if (typeof actorTypeRaw !== "string" || !ACTOR_SET.has(actorTypeRaw)) {
    out.push(diag(FUNGI_SEC_ASG_002, "Actor type is outside the closed vocabulary.", "actorType"));
    return failReq(out);
  }
  const decisionRaw = snap.values.get("decision");
  if (typeof decisionRaw !== "string" || !DECISION_SET.has(decisionRaw)) {
    out.push(diag(FUNGI_SEC_ASG_002, "Decision is outside the closed vocabulary.", "decision"));
    return failReq(out);
  }
  const selfGrantAttempt = snap.values.get("selfGrantAttempt");
  if (typeof selfGrantAttempt !== "boolean") {
    out.push(diag(FUNGI_SEC_ASG_002, "Self-grant flag must be a boolean.", "selfGrantAttempt"));
    return failReq(out);
  }
  if (selfGrantAttempt === true && decisionRaw !== "deny") {
    out.push(diag(FUNGI_SEC_ASG_003, "Self-grant attempt must be recorded as deny.", "decision"));
    return failReq(out);
  }
  const requireCaps = decisionRaw === "allow";
  const requestedCapabilities = readTokenList(
    snap.values.get("requestedCapabilities"),
    "requestedCapabilities",
    requireCaps,
    out,
  );
  if (requestedCapabilities === undefined) return failReq(out);
  const requestedEffects = readTokenList(
    snap.values.get("requestedEffects"),
    "requestedEffects",
    false,
    out,
  );
  if (requestedEffects === undefined) return failReq(out);
  if (decisionRaw === "allow" && selfGrantAttempt === true) {
    out.push(diag(FUNGI_SEC_ASG_003, "Allowed decision cannot be a self-grant.", "selfGrantAttempt"));
    return failReq(out);
  }
  const complete = snap.values.get("complete");
  if (typeof complete !== "boolean") {
    out.push(diag(FUNGI_SEC_ASG_002, "Complete flag must be a boolean.", "complete"));
    return failReq(out);
  }
  const diagnostics = snapshotDiagnostics(snap.values.get("diagnostics"), out);
  if (diagnostics === undefined) return failReq(out);
  if (diagnostics.length !== 0) {
    out.push(diag(FUNGI_SEC_ASG_005, "Successful AI authority request must carry empty diagnostics.", "diagnostics"));
    return failReq(out);
  }
  const value: AiAuthorityRequest = Object.freeze({
    schema: AI_AUTHORITY_REQUEST_SCHEMA,
    requestId,
    actorId,
    actorType: actorTypeRaw as AiActorType,
    requestedCapabilities,
    requestedEffects,
    decision: decisionRaw as AiAuthorityDecision,
    selfGrantAttempt,
    complete,
    diagnostics,
  });
  return Object.freeze({ ok: true as const, value });
}

export function readTrustRootModification(input: unknown): ReadTrustRootModificationResult {
  const out: AiAuthorityDiagnostic[] = [];
  const snap = snapshotRecord(input, MAX_KEYS);
  if (!snap.ok) {
    out.push(diag(FUNGI_SEC_ASG_001, "Trust-root modification must be a plain data object.", "record"));
    return failTrust(out);
  }
  if (!requireKeysSubset(snap, TRUST_ROOT_MODIFICATION_FIELDS, TRUST_ROOT_MODIFICATION_FIELDS, "record", out)) {
    return failTrust(out);
  }
  if (snap.values.get("schema") !== TRUST_ROOT_MODIFICATION_SCHEMA) {
    out.push(diag(FUNGI_SEC_ASG_002, "Schema is outside the closed domain.", "schema"));
    return failTrust(out);
  }
  const modificationId = readIdToken(snap.values.get("modificationId"), "modificationId", out);
  if (modificationId === undefined) return failTrust(out);
  const actorId = readIdToken(snap.values.get("actorId"), "actorId", out);
  if (actorId === undefined) return failTrust(out);
  const actorTypeRaw = snap.values.get("actorType");
  if (typeof actorTypeRaw !== "string" || !ACTOR_SET.has(actorTypeRaw)) {
    out.push(diag(FUNGI_SEC_ASG_002, "Actor type is outside the closed vocabulary.", "actorType"));
    return failTrust(out);
  }
  const trustRootId = readIdToken(snap.values.get("trustRootId"), "trustRootId", out);
  if (trustRootId === undefined) return failTrust(out);
  const operationRaw = snap.values.get("operation");
  if (typeof operationRaw !== "string" || !OP_SET.has(operationRaw)) {
    out.push(diag(FUNGI_SEC_ASG_002, "Operation is outside the closed vocabulary.", "operation"));
    return failTrust(out);
  }
  const decisionRaw = snap.values.get("decision");
  if (typeof decisionRaw !== "string" || !DECISION_SET.has(decisionRaw)) {
    out.push(diag(FUNGI_SEC_ASG_002, "Decision is outside the closed vocabulary.", "decision"));
    return failTrust(out);
  }
  const externalGovernance = snap.values.get("externalGovernance");
  if (typeof externalGovernance !== "boolean") {
    out.push(diag(FUNGI_SEC_ASG_002, "External governance flag must be a boolean.", "externalGovernance"));
    return failTrust(out);
  }
  if (decisionRaw === "allow") {
    if (externalGovernance !== true) {
      out.push(diag(FUNGI_SEC_ASG_003, "Allow requires external governance evidence.", "externalGovernance"));
      return failTrust(out);
    }
    if (!TRUST_ALLOW_ACTOR_SET.has(actorTypeRaw)) {
      out.push(diag(FUNGI_SEC_ASG_003, "Allow admits only human or service actors.", "actorType"));
      return failTrust(out);
    }
  }
  const complete = snap.values.get("complete");
  if (typeof complete !== "boolean") {
    out.push(diag(FUNGI_SEC_ASG_002, "Complete flag must be a boolean.", "complete"));
    return failTrust(out);
  }
  const diagnostics = snapshotDiagnostics(snap.values.get("diagnostics"), out);
  if (diagnostics === undefined) return failTrust(out);
  if (diagnostics.length !== 0) {
    out.push(diag(FUNGI_SEC_ASG_005, "Successful trust-root modification must carry empty diagnostics.", "diagnostics"));
    return failTrust(out);
  }
  const value: TrustRootModification = Object.freeze({
    schema: TRUST_ROOT_MODIFICATION_SCHEMA,
    modificationId,
    actorId,
    actorType: actorTypeRaw as AiActorType,
    trustRootId,
    operation: operationRaw as TrustRootOperation,
    decision: decisionRaw as AiAuthorityDecision,
    externalGovernance,
    complete,
    diagnostics,
  });
  return Object.freeze({ ok: true as const, value });
}
