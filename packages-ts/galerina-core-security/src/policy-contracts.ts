// Policy definition / effective policy / conflict schemas (TODO pass, Grok 2026-10-05;
// zero-trust defaults, owner may revisit).
//
// Closed-shape contracts for the security TODO row "Define policy definition,
// effective policy and conflict report schemas". Aligns kind / decision /
// conflict vocabularies with galerina-core-reports policy-family reports without
// depending on that package or inventing the SecretReference v0.2 subsystem
// (do-not-invent; see TODO header).
//
// Zero-trust rules:
//  - Closed shapes via property descriptors (no getters run; symbols / accessors /
//    custom prototypes refuse). Unknown keys refuse without echoing the key.
//  - PolicyDefinition.defaultDecision admits only "deny".
//  - Authored PolicyDefinition.kind excludes "unknown" (reports may still index
//    unknown; definitions must declare a concrete kind).
//  - EffectivePolicy.decision admits allow|deny|abstain; complete must be boolean.
//  - PolicyConflict.kind is a closed conflict vocabulary; policyIds unique ascending.
//  - fieldNames / diagnosticCodes are closed tokens only; values / free text refused.
//  - Never throws; never echoes policy ids, subject ids, field names, or unknown values.
//
// Not covered: SecretReference v0.2, live policy enforcement, report file writers
// (core-reports), capability lease / OWASP mapping / crypto-inventory rows.

/** Record / input is not a closed data object. */
export const FUNGI_SEC_POL_001 = "FUNGI-SEC-POL-001";
/** A field value is outside its closed domain (incl. NaN / Infinity / unknown kind). */
export const FUNGI_SEC_POL_002 = "FUNGI-SEC-POL-002";
/** Consistency refuse (empty / duplicate / unsorted lists, defaultDecision not deny). */
export const FUNGI_SEC_POL_003 = "FUNGI-SEC-POL-003";
/** Nested record / list refuse. */
export const FUNGI_SEC_POL_004 = "FUNGI-SEC-POL-004";
/** Result consistency refuse. */
export const FUNGI_SEC_POL_005 = "FUNGI-SEC-POL-005";

export const POLICY_DEFINITION_SCHEMA = "galerina.security.policy-definition/v1";
export const EFFECTIVE_POLICY_SCHEMA = "galerina.security.effective-policy/v1";
export const POLICY_CONFLICT_SCHEMA = "galerina.security.policy-conflict/v1";

/** Authored policy kinds (reports may also index "unknown"; definitions may not). */
export const SECURITY_POLICY_KINDS = Object.freeze([
  "capability",
  "data",
  "effect",
  "network",
  "runtime",
] as const);
export type SecurityPolicyKind = (typeof SECURITY_POLICY_KINDS)[number];

/** Undeclared subjects are not admitted. */
export const SECURITY_POLICY_DEFAULT_DECISIONS = Object.freeze(["deny"] as const);
export type SecurityPolicyDefaultDecision = (typeof SECURITY_POLICY_DEFAULT_DECISIONS)[number];

export const SECURITY_EFFECTIVE_DECISIONS = Object.freeze(["abstain", "allow", "deny"] as const);
export type SecurityEffectiveDecision = (typeof SECURITY_EFFECTIVE_DECISIONS)[number];

export const SECURITY_POLICY_CONFLICT_KINDS = Object.freeze([
  "contradictory_decision",
  "duplicate_id",
  "priority_tie",
  "unknown_reference",
] as const);
export type SecurityPolicyConflictKind = (typeof SECURITY_POLICY_CONFLICT_KINDS)[number];

export const POLICY_DEFINITION_FIELDS = Object.freeze([
  "schema", "policyId", "kind", "defaultDecision", "priority", "fieldNames", "diagnostics",
] as const);

export const EFFECTIVE_POLICY_FIELDS = Object.freeze([
  "schema", "subjectId", "policyId", "decision", "appliedPolicyIds", "complete", "diagnostics",
] as const);

export const POLICY_CONFLICT_FIELDS = Object.freeze([
  "schema", "conflictId", "kind", "policyIds", "diagnosticCodes", "diagnostics",
] as const);

export type SecurityPolicyDiagnosticField =
  | "record" | "schema" | "policyId" | "kind" | "defaultDecision" | "priority" | "fieldNames"
  | "diagnostics" | "subjectId" | "decision" | "appliedPolicyIds" | "complete" | "conflictId"
  | "policyIds" | "diagnosticCodes";

export interface SecurityPolicyDiagnostic {
  readonly code: string;
  readonly severity: "error";
  readonly message: string;
  readonly field: SecurityPolicyDiagnosticField;
}

export interface PolicyDefinition {
  readonly schema: typeof POLICY_DEFINITION_SCHEMA;
  readonly policyId: string;
  readonly kind: SecurityPolicyKind;
  readonly defaultDecision: SecurityPolicyDefaultDecision;
  readonly priority: number;
  /** Closed field names declared on the definition; values are never retained. */
  readonly fieldNames: readonly string[];
  readonly diagnostics: readonly SecurityPolicyDiagnostic[];
}

export interface EffectivePolicy {
  readonly schema: typeof EFFECTIVE_POLICY_SCHEMA;
  readonly subjectId: string;
  readonly policyId: string;
  readonly decision: SecurityEffectiveDecision;
  readonly appliedPolicyIds: readonly string[];
  readonly complete: boolean;
  readonly diagnostics: readonly SecurityPolicyDiagnostic[];
}

export interface PolicyConflict {
  readonly schema: typeof POLICY_CONFLICT_SCHEMA;
  readonly conflictId: string;
  readonly kind: SecurityPolicyConflictKind;
  readonly policyIds: readonly string[];
  readonly diagnosticCodes: readonly string[];
  readonly diagnostics: readonly SecurityPolicyDiagnostic[];
}

export type ReadPolicyDefinitionResult =
  | { readonly ok: true; readonly value: PolicyDefinition }
  | { readonly ok: false; readonly diagnostics: readonly SecurityPolicyDiagnostic[] };

export type ReadEffectivePolicyResult =
  | { readonly ok: true; readonly value: EffectivePolicy }
  | { readonly ok: false; readonly diagnostics: readonly SecurityPolicyDiagnostic[] };

export type ReadPolicyConflictResult =
  | { readonly ok: true; readonly value: PolicyConflict }
  | { readonly ok: false; readonly diagnostics: readonly SecurityPolicyDiagnostic[] };

const ID_TOKEN = /^[A-Za-z][A-Za-z0-9._-]{0,63}$/;
const FIELD_NAME = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;
const DIAG_CODE = /^FUNGI-[A-Z0-9-]{1,64}$/;
const MAX_LIST = 4096;
const MAX_KEYS = 32;
const MIN_PRIORITY = 1;
const MAX_PRIORITY = 1_000_000;
const KIND_SET = new Set<string>(SECURITY_POLICY_KINDS);
const DEFAULT_SET = new Set<string>(SECURITY_POLICY_DEFAULT_DECISIONS);
const DECISION_SET = new Set<string>(SECURITY_EFFECTIVE_DECISIONS);
const CONFLICT_SET = new Set<string>(SECURITY_POLICY_CONFLICT_KINDS);

const diag = (
  code: string,
  message: string,
  field: SecurityPolicyDiagnosticField,
): SecurityPolicyDiagnostic => Object.freeze({ code, severity: "error" as const, message, field });

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
  field: SecurityPolicyDiagnosticField,
  out: SecurityPolicyDiagnostic[],
): boolean {
  const allowedSet = new Set(allowed);
  for (const key of snap.values.keys()) {
    if (!allowedSet.has(key)) {
      out.push(diag(FUNGI_SEC_POL_001, "Record has a key outside the closed shape.", field));
      return false;
    }
  }
  for (const key of required) {
    if (!snap.values.has(key)) {
      out.push(diag(FUNGI_SEC_POL_001, "Record is missing a required field.", field));
      return false;
    }
  }
  return true;
}

function readIdToken(
  value: unknown,
  field: SecurityPolicyDiagnosticField,
  out: SecurityPolicyDiagnostic[],
): string | undefined {
  if (typeof value !== "string" || !ID_TOKEN.test(value)) {
    out.push(diag(FUNGI_SEC_POL_002, "Identifier is outside the closed token domain.", field));
    return undefined;
  }
  return value;
}

function readTokenList(
  value: unknown,
  field: SecurityPolicyDiagnosticField,
  pattern: RegExp,
  requireNonEmpty: boolean,
  out: SecurityPolicyDiagnostic[],
): readonly string[] | undefined {
  const items = snapshotArray(value, MAX_LIST);
  if (items === undefined) {
    out.push(diag(FUNGI_SEC_POL_004, "List must be a dense array within bounds.", field));
    return undefined;
  }
  if (requireNonEmpty && items.length === 0) {
    out.push(diag(FUNGI_SEC_POL_003, "List must be non-empty.", field));
    return undefined;
  }
  const outList: string[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    if (typeof item !== "string" || !pattern.test(item)) {
      out.push(diag(FUNGI_SEC_POL_002, "List entry is outside the closed token domain.", field));
      return undefined;
    }
    if (seen.has(item)) {
      out.push(diag(FUNGI_SEC_POL_003, "List entries must be unique.", field));
      return undefined;
    }
    seen.add(item);
    outList.push(item);
  }
  if (!strictlyAscending(outList)) {
    out.push(diag(FUNGI_SEC_POL_002, "List must be strictly ascending.", field));
    return undefined;
  }
  return Object.freeze(outList);
}

function snapshotDiagnostics(
  value: unknown,
  out: SecurityPolicyDiagnostic[],
): readonly SecurityPolicyDiagnostic[] | undefined {
  const items = snapshotArray(value, MAX_LIST);
  if (items === undefined) {
    out.push(diag(FUNGI_SEC_POL_001, "Diagnostics must be a dense array within bounds.", "diagnostics"));
    return undefined;
  }
  const result: SecurityPolicyDiagnostic[] = [];
  const known = ["code", "severity", "message", "field"];
  for (const item of items) {
    const snap = snapshotRecord(item, 8);
    if (!snap.ok) {
      out.push(diag(FUNGI_SEC_POL_001, "Diagnostic entry must be a plain data object.", "diagnostics"));
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
      out.push(diag(FUNGI_SEC_POL_002, "Diagnostic fields are outside the closed domain.", "diagnostics"));
      return undefined;
    }
    result.push(Object.freeze({ code, severity: "error" as const, message, field: f as SecurityPolicyDiagnosticField }));
  }
  return Object.freeze(result);
}

function fail(out: SecurityPolicyDiagnostic[]): ReadPolicyDefinitionResult {
  return Object.freeze({ ok: false as const, diagnostics: Object.freeze([...out]) });
}

export function readPolicyDefinition(input: unknown): ReadPolicyDefinitionResult {
  const out: SecurityPolicyDiagnostic[] = [];
  const snap = snapshotRecord(input, MAX_KEYS);
  if (!snap.ok) {
    out.push(diag(FUNGI_SEC_POL_001, "Policy definition must be a plain data object.", "record"));
    return fail(out);
  }
  if (!requireKeysSubset(snap, POLICY_DEFINITION_FIELDS, POLICY_DEFINITION_FIELDS, "record", out)) {
    return fail(out);
  }
  if (snap.values.get("schema") !== POLICY_DEFINITION_SCHEMA) {
    out.push(diag(FUNGI_SEC_POL_002, "Schema is outside the closed domain.", "schema"));
    return fail(out);
  }
  const policyId = readIdToken(snap.values.get("policyId"), "policyId", out);
  if (policyId === undefined) return fail(out);
  const kindRaw = snap.values.get("kind");
  if (typeof kindRaw !== "string" || !KIND_SET.has(kindRaw)) {
    out.push(diag(FUNGI_SEC_POL_002, "Policy kind is outside the closed vocabulary.", "kind"));
    return fail(out);
  }
  const defaultDecision = snap.values.get("defaultDecision");
  if (typeof defaultDecision !== "string" || !DEFAULT_SET.has(defaultDecision)) {
    out.push(diag(FUNGI_SEC_POL_002, "Default decision must be deny.", "defaultDecision"));
    return fail(out);
  }
  const priorityRaw = snap.values.get("priority");
  if (
    typeof priorityRaw !== "number" ||
    !Number.isFinite(priorityRaw) ||
    !Number.isSafeInteger(priorityRaw) ||
    priorityRaw < MIN_PRIORITY ||
    priorityRaw > MAX_PRIORITY
  ) {
    out.push(diag(FUNGI_SEC_POL_002, "Priority is outside the closed numeric domain.", "priority"));
    return fail(out);
  }
  const fieldNames = readTokenList(snap.values.get("fieldNames"), "fieldNames", FIELD_NAME, false, out);
  if (fieldNames === undefined) return fail(out);
  const diagnostics = snapshotDiagnostics(snap.values.get("diagnostics"), out);
  if (diagnostics === undefined) return fail(out);
  if (diagnostics.length !== 0) {
    out.push(diag(FUNGI_SEC_POL_005, "Successful definition must carry empty diagnostics.", "diagnostics"));
    return fail(out);
  }
  const value: PolicyDefinition = Object.freeze({
    schema: POLICY_DEFINITION_SCHEMA,
    policyId,
    kind: kindRaw as SecurityPolicyKind,
    defaultDecision: "deny",
    priority: priorityRaw,
    fieldNames,
    diagnostics,
  });
  return Object.freeze({ ok: true as const, value });
}

export function readEffectivePolicy(input: unknown): ReadEffectivePolicyResult {
  const out: SecurityPolicyDiagnostic[] = [];
  const snap = snapshotRecord(input, MAX_KEYS);
  if (!snap.ok) {
    out.push(diag(FUNGI_SEC_POL_001, "Effective policy must be a plain data object.", "record"));
    return Object.freeze({ ok: false as const, diagnostics: Object.freeze(out) });
  }
  if (!requireKeysSubset(snap, EFFECTIVE_POLICY_FIELDS, EFFECTIVE_POLICY_FIELDS, "record", out)) {
    return Object.freeze({ ok: false as const, diagnostics: Object.freeze([...out]) });
  }
  if (snap.values.get("schema") !== EFFECTIVE_POLICY_SCHEMA) {
    out.push(diag(FUNGI_SEC_POL_002, "Schema is outside the closed domain.", "schema"));
    return Object.freeze({ ok: false as const, diagnostics: Object.freeze([...out]) });
  }
  const subjectId = readIdToken(snap.values.get("subjectId"), "subjectId", out);
  if (subjectId === undefined) return Object.freeze({ ok: false as const, diagnostics: Object.freeze([...out]) });
  const policyId = readIdToken(snap.values.get("policyId"), "policyId", out);
  if (policyId === undefined) return Object.freeze({ ok: false as const, diagnostics: Object.freeze([...out]) });
  const decisionRaw = snap.values.get("decision");
  if (typeof decisionRaw !== "string" || !DECISION_SET.has(decisionRaw)) {
    out.push(diag(FUNGI_SEC_POL_002, "Decision is outside the closed vocabulary.", "decision"));
    return Object.freeze({ ok: false as const, diagnostics: Object.freeze([...out]) });
  }
  const appliedPolicyIds = readTokenList(
    snap.values.get("appliedPolicyIds"),
    "appliedPolicyIds",
    ID_TOKEN,
    true,
    out,
  );
  if (appliedPolicyIds === undefined) {
    return Object.freeze({ ok: false as const, diagnostics: Object.freeze([...out]) });
  }
  if (!appliedPolicyIds.includes(policyId)) {
    out.push(diag(FUNGI_SEC_POL_003, "Primary policyId must appear in appliedPolicyIds.", "appliedPolicyIds"));
    return Object.freeze({ ok: false as const, diagnostics: Object.freeze([...out]) });
  }
  const complete = snap.values.get("complete");
  if (typeof complete !== "boolean") {
    out.push(diag(FUNGI_SEC_POL_002, "Complete flag must be a boolean.", "complete"));
    return Object.freeze({ ok: false as const, diagnostics: Object.freeze([...out]) });
  }
  const diagnostics = snapshotDiagnostics(snap.values.get("diagnostics"), out);
  if (diagnostics === undefined) {
    return Object.freeze({ ok: false as const, diagnostics: Object.freeze([...out]) });
  }
  if (diagnostics.length !== 0) {
    out.push(diag(FUNGI_SEC_POL_005, "Successful effective policy must carry empty diagnostics.", "diagnostics"));
    return Object.freeze({ ok: false as const, diagnostics: Object.freeze([...out]) });
  }
  const value: EffectivePolicy = Object.freeze({
    schema: EFFECTIVE_POLICY_SCHEMA,
    subjectId,
    policyId,
    decision: decisionRaw as SecurityEffectiveDecision,
    appliedPolicyIds,
    complete,
    diagnostics,
  });
  return Object.freeze({ ok: true as const, value });
}

export function readPolicyConflict(input: unknown): ReadPolicyConflictResult {
  const out: SecurityPolicyDiagnostic[] = [];
  const snap = snapshotRecord(input, MAX_KEYS);
  if (!snap.ok) {
    out.push(diag(FUNGI_SEC_POL_001, "Policy conflict must be a plain data object.", "record"));
    return Object.freeze({ ok: false as const, diagnostics: Object.freeze(out) });
  }
  if (!requireKeysSubset(snap, POLICY_CONFLICT_FIELDS, POLICY_CONFLICT_FIELDS, "record", out)) {
    return Object.freeze({ ok: false as const, diagnostics: Object.freeze([...out]) });
  }
  if (snap.values.get("schema") !== POLICY_CONFLICT_SCHEMA) {
    out.push(diag(FUNGI_SEC_POL_002, "Schema is outside the closed domain.", "schema"));
    return Object.freeze({ ok: false as const, diagnostics: Object.freeze([...out]) });
  }
  const conflictId = readIdToken(snap.values.get("conflictId"), "conflictId", out);
  if (conflictId === undefined) return Object.freeze({ ok: false as const, diagnostics: Object.freeze([...out]) });
  const kindRaw = snap.values.get("kind");
  if (typeof kindRaw !== "string" || !CONFLICT_SET.has(kindRaw)) {
    out.push(diag(FUNGI_SEC_POL_002, "Conflict kind is outside the closed vocabulary.", "kind"));
    return Object.freeze({ ok: false as const, diagnostics: Object.freeze([...out]) });
  }
  const policyIds = readTokenList(snap.values.get("policyIds"), "policyIds", ID_TOKEN, true, out);
  if (policyIds === undefined) return Object.freeze({ ok: false as const, diagnostics: Object.freeze([...out]) });
  if (policyIds.length < 2 && kindRaw !== "unknown_reference") {
    out.push(diag(FUNGI_SEC_POL_003, "Conflict must reference at least two policy ids.", "policyIds"));
    return Object.freeze({ ok: false as const, diagnostics: Object.freeze([...out]) });
  }
  const diagnosticCodes = readTokenList(
    snap.values.get("diagnosticCodes"),
    "diagnosticCodes",
    DIAG_CODE,
    false,
    out,
  );
  if (diagnosticCodes === undefined) {
    return Object.freeze({ ok: false as const, diagnostics: Object.freeze([...out]) });
  }
  const diagnostics = snapshotDiagnostics(snap.values.get("diagnostics"), out);
  if (diagnostics === undefined) {
    return Object.freeze({ ok: false as const, diagnostics: Object.freeze([...out]) });
  }
  if (diagnostics.length !== 0) {
    out.push(diag(FUNGI_SEC_POL_005, "Successful conflict must carry empty diagnostics.", "diagnostics"));
    return Object.freeze({ ok: false as const, diagnostics: Object.freeze([...out]) });
  }
  const value: PolicyConflict = Object.freeze({
    schema: POLICY_CONFLICT_SCHEMA,
    conflictId,
    kind: kindRaw as SecurityPolicyConflictKind,
    policyIds,
    diagnosticCodes,
    diagnostics,
  });
  return Object.freeze({ ok: true as const, value });
}

