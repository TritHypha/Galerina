// OWASP / CWE baseline diagnostic mapping (TODO pass, Grok 2026-10-05;
// zero-trust defaults, owner may revisit).
//
// Closed-shape contracts for the security TODO row "Define OWASP/CWE baseline
// diagnostic mapping" (README use-list: "exploit-resistance baseline mappings").
// Maps ONLY the existing in-package Galerina_SECURITY_* diagnostic codes
// (src/index.ts) onto OWASP Top 10 (2021 edition) category ids and MITRE CWE ids.
// The mapping is descriptive metadata: it does not add rules, change severities,
// or claim coverage of any OWASP category.
//
// Zero-trust rules:
//  - Closed shapes via property descriptors (no getters; symbols / accessors /
//    custom prototypes refuse). Unknown keys refuse without echoing the key.
//  - OWASP ids are the closed A01:2021..A10:2021 vocabulary only.
//  - CWE ids match ^CWE-[1-9][0-9]{0,5}$, unique, numerically ascending.
//  - status mapped requires a non-empty CWE list; status unmapped requires both
//    lists empty (an honest "no baseline mapping" instead of a guessed one).
//  - Entries unique by code, strictly ascending.
//  - Never throws; never echoes codes / ids / tokens / unknown values.
//
// Not covered: SecretReference v0.2, taint-flow types, FUNGI-SEC-* reader codes,
// FUNGI-CRYPTO-* provider codes, OWASP Top 10 later editions, ASVS levels,
// CVSS scoring, scanners, or report writers.

/** Record / input is not a closed data object. */
export const FUNGI_SEC_OWC_001 = "FUNGI-SEC-OWC-001";
/** A field value is outside its closed domain (incl. unknown OWASP id / malformed CWE id). */
export const FUNGI_SEC_OWC_002 = "FUNGI-SEC-OWC-002";
/** Consistency refuse (mapped without CWE / unmapped with ids / duplicate / order). */
export const FUNGI_SEC_OWC_003 = "FUNGI-SEC-OWC-003";
/** Nested record / list refuse. */
export const FUNGI_SEC_OWC_004 = "FUNGI-SEC-OWC-004";
/** Result consistency refuse / lookup miss. */
export const FUNGI_SEC_OWC_005 = "FUNGI-SEC-OWC-005";

export const OWASP_CWE_MAPPING_SCHEMA = "galerina.security.owasp-cwe-mapping/v1";
export const OWASP_TOP10_EDITION = "2021";

export const OWASP_TOP10_2021_IDS = Object.freeze([
  "A01:2021",
  "A02:2021",
  "A03:2021",
  "A04:2021",
  "A05:2021",
  "A06:2021",
  "A07:2021",
  "A08:2021",
  "A09:2021",
  "A10:2021",
] as const);
export type OwaspTop10Id = (typeof OWASP_TOP10_2021_IDS)[number];

export const OWASP_CWE_MAPPING_STATUSES = Object.freeze(["mapped", "unmapped"] as const);
export type OwaspCweMappingStatus = (typeof OWASP_CWE_MAPPING_STATUSES)[number];

export const OWASP_CWE_MAPPING_FIELDS = Object.freeze([
  "schema", "owaspEdition", "entries", "complete", "diagnostics",
] as const);

export const OWASP_CWE_ENTRY_FIELDS = Object.freeze([
  "code", "status", "owasp", "cwe",
] as const);

export type OwaspCweDiagnosticField =
  | "record" | "schema" | "owaspEdition" | "entries" | "complete" | "diagnostics"
  | "code" | "status" | "owasp" | "cwe";

export interface OwaspCweDiagnostic {
  readonly code: string;
  readonly severity: "error";
  readonly message: string;
  readonly field: OwaspCweDiagnosticField;
}

export interface OwaspCweEntry {
  readonly code: string;
  readonly status: OwaspCweMappingStatus;
  readonly owasp: readonly OwaspTop10Id[];
  readonly cwe: readonly string[];
}

export interface OwaspCweMapping {
  readonly schema: typeof OWASP_CWE_MAPPING_SCHEMA;
  readonly owaspEdition: typeof OWASP_TOP10_EDITION;
  readonly entries: readonly OwaspCweEntry[];
  readonly complete: boolean;
  readonly diagnostics: readonly OwaspCweDiagnostic[];
}

export type ReadOwaspCweMappingResult =
  | { readonly ok: true; readonly value: OwaspCweMapping }
  | { readonly ok: false; readonly diagnostics: readonly OwaspCweDiagnostic[] };

export type LookupOwaspCweBaselineResult =
  | { readonly ok: true; readonly value: OwaspCweEntry }
  | { readonly ok: false; readonly diagnostics: readonly OwaspCweDiagnostic[] };

const CODE_TOKEN = /^[A-Za-z][A-Za-z0-9_.-]{0,127}$/;
const CWE_TOKEN = /^CWE-[1-9][0-9]{0,5}$/;
const MAX_ENTRIES = 512;
const MAX_IDS = 16;
const MAX_KEYS = 16;
const OWASP_SET = new Set<string>(OWASP_TOP10_2021_IDS);
const STATUS_SET = new Set<string>(OWASP_CWE_MAPPING_STATUSES);

const diag = (
  code: string,
  message: string,
  field: OwaspCweDiagnosticField,
): OwaspCweDiagnostic => Object.freeze({ code, severity: "error" as const, message, field });

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

function requireExactKeys(
  snap: Extract<Snapshot, { ok: true }>,
  keys: readonly string[],
  field: OwaspCweDiagnosticField,
  out: OwaspCweDiagnostic[],
): boolean {
  const allowed = new Set(keys);
  for (const key of snap.values.keys()) {
    if (!allowed.has(key)) {
      out.push(diag(FUNGI_SEC_OWC_001, "Record has a key outside the closed shape.", field));
      return false;
    }
  }
  for (const key of keys) {
    if (!snap.values.has(key)) {
      out.push(diag(FUNGI_SEC_OWC_001, "Record is missing a required field.", field));
      return false;
    }
  }
  return true;
}

function cweNumber(id: string): number {
  return Number.parseInt(id.slice(4), 10);
}

function readOwaspList(value: unknown, out: OwaspCweDiagnostic[]): readonly OwaspTop10Id[] | undefined {
  const items = snapshotArray(value, MAX_IDS);
  if (items === undefined) {
    out.push(diag(FUNGI_SEC_OWC_004, "OWASP list must be a dense array within bounds.", "owasp"));
    return undefined;
  }
  const list: OwaspTop10Id[] = [];
  for (const item of items) {
    if (typeof item !== "string" || !OWASP_SET.has(item)) {
      out.push(diag(FUNGI_SEC_OWC_002, "OWASP id is outside the closed vocabulary.", "owasp"));
      return undefined;
    }
    const prev = list[list.length - 1];
    if (prev !== undefined && !(prev < item)) {
      out.push(diag(FUNGI_SEC_OWC_003, "OWASP ids must be unique and strictly ascending.", "owasp"));
      return undefined;
    }
    list.push(item as OwaspTop10Id);
  }
  return Object.freeze(list);
}

function readCweList(value: unknown, out: OwaspCweDiagnostic[]): readonly string[] | undefined {
  const items = snapshotArray(value, MAX_IDS);
  if (items === undefined) {
    out.push(diag(FUNGI_SEC_OWC_004, "CWE list must be a dense array within bounds.", "cwe"));
    return undefined;
  }
  const list: string[] = [];
  let prev = 0;
  for (const item of items) {
    if (typeof item !== "string" || !CWE_TOKEN.test(item)) {
      out.push(diag(FUNGI_SEC_OWC_002, "CWE id is outside the closed token domain.", "cwe"));
      return undefined;
    }
    const n = cweNumber(item);
    if (!Number.isSafeInteger(n) || n <= prev) {
      out.push(diag(FUNGI_SEC_OWC_003, "CWE ids must be unique and numerically ascending.", "cwe"));
      return undefined;
    }
    prev = n;
    list.push(item);
  }
  return Object.freeze(list);
}

function readEntry(value: unknown, out: OwaspCweDiagnostic[]): OwaspCweEntry | undefined {
  const snap = snapshotRecord(value, MAX_KEYS);
  if (!snap.ok) {
    out.push(diag(FUNGI_SEC_OWC_004, "Mapping entry must be a plain data object.", "entries"));
    return undefined;
  }
  if (!requireExactKeys(snap, OWASP_CWE_ENTRY_FIELDS, "entries", out)) return undefined;
  const code = snap.values.get("code");
  if (typeof code !== "string" || !CODE_TOKEN.test(code)) {
    out.push(diag(FUNGI_SEC_OWC_002, "Diagnostic code is outside the closed token domain.", "code"));
    return undefined;
  }
  const status = snap.values.get("status");
  if (typeof status !== "string" || !STATUS_SET.has(status)) {
    out.push(diag(FUNGI_SEC_OWC_002, "Mapping status is outside the closed vocabulary.", "status"));
    return undefined;
  }
  const owasp = readOwaspList(snap.values.get("owasp"), out);
  if (owasp === undefined) return undefined;
  const cwe = readCweList(snap.values.get("cwe"), out);
  if (cwe === undefined) return undefined;
  if (status === "mapped" && cwe.length === 0) {
    out.push(diag(FUNGI_SEC_OWC_003, "Mapped entry requires at least one CWE id.", "cwe"));
    return undefined;
  }
  if (status === "unmapped" && (cwe.length !== 0 || owasp.length !== 0)) {
    out.push(diag(FUNGI_SEC_OWC_003, "Unmapped entry must carry empty OWASP and CWE lists.", "status"));
    return undefined;
  }
  return Object.freeze({ code, status: status as OwaspCweMappingStatus, owasp, cwe });
}

function snapshotDiagnostics(
  value: unknown,
  out: OwaspCweDiagnostic[],
): readonly OwaspCweDiagnostic[] | undefined {
  const items = snapshotArray(value, MAX_ENTRIES);
  if (items === undefined) {
    out.push(diag(FUNGI_SEC_OWC_001, "Diagnostics must be a dense array within bounds.", "diagnostics"));
    return undefined;
  }
  const result: OwaspCweDiagnostic[] = [];
  const known = ["code", "severity", "message", "field"];
  for (const item of items) {
    const snap = snapshotRecord(item, 8);
    if (!snap.ok) {
      out.push(diag(FUNGI_SEC_OWC_001, "Diagnostic entry must be a plain data object.", "diagnostics"));
      return undefined;
    }
    if (!requireExactKeys(snap, known, "diagnostics", out)) return undefined;
    const code = snap.values.get("code");
    const severity = snap.values.get("severity");
    const message = snap.values.get("message");
    const f = snap.values.get("field");
    if (
      typeof code !== "string" || code.length === 0 || code.length > 128 ||
      severity !== "error" ||
      typeof message !== "string" || message.length === 0 || message.length > 256 ||
      typeof f !== "string" || f.length === 0 || f.length > 64
    ) {
      out.push(diag(FUNGI_SEC_OWC_002, "Diagnostic fields are outside the closed domain.", "diagnostics"));
      return undefined;
    }
    result.push(Object.freeze({ code, severity: "error" as const, message, field: f as OwaspCweDiagnosticField }));
  }
  return Object.freeze(result);
}

function fail(out: OwaspCweDiagnostic[]): ReadOwaspCweMappingResult {
  return Object.freeze({ ok: false as const, diagnostics: Object.freeze([...out]) });
}

export function readOwaspCweMapping(input: unknown): ReadOwaspCweMappingResult {
  const out: OwaspCweDiagnostic[] = [];
  const snap = snapshotRecord(input, MAX_KEYS);
  if (!snap.ok) {
    out.push(diag(FUNGI_SEC_OWC_001, "OWASP/CWE mapping must be a plain data object.", "record"));
    return fail(out);
  }
  if (!requireExactKeys(snap, OWASP_CWE_MAPPING_FIELDS, "record", out)) return fail(out);
  if (snap.values.get("schema") !== OWASP_CWE_MAPPING_SCHEMA) {
    out.push(diag(FUNGI_SEC_OWC_002, "Schema is outside the closed domain.", "schema"));
    return fail(out);
  }
  if (snap.values.get("owaspEdition") !== OWASP_TOP10_EDITION) {
    out.push(diag(FUNGI_SEC_OWC_002, "OWASP edition is outside the closed domain.", "owaspEdition"));
    return fail(out);
  }
  const rawEntries = snapshotArray(snap.values.get("entries"), MAX_ENTRIES);
  if (rawEntries === undefined) {
    out.push(diag(FUNGI_SEC_OWC_004, "Entries must be a dense array within bounds.", "entries"));
    return fail(out);
  }
  const entries: OwaspCweEntry[] = [];
  for (const raw of rawEntries) {
    const entry = readEntry(raw, out);
    if (entry === undefined) return fail(out);
    const prev = entries[entries.length - 1];
    if (prev !== undefined && !(prev.code < entry.code)) {
      out.push(diag(FUNGI_SEC_OWC_003, "Entry codes must be unique and strictly ascending.", "entries"));
      return fail(out);
    }
    entries.push(entry);
  }
  const complete = snap.values.get("complete");
  if (typeof complete !== "boolean") {
    out.push(diag(FUNGI_SEC_OWC_002, "Complete flag must be a boolean.", "complete"));
    return fail(out);
  }
  const diagnostics = snapshotDiagnostics(snap.values.get("diagnostics"), out);
  if (diagnostics === undefined) return fail(out);
  if (diagnostics.length !== 0) {
    out.push(diag(FUNGI_SEC_OWC_005, "Successful OWASP/CWE mapping must carry empty diagnostics.", "diagnostics"));
    return fail(out);
  }
  const value: OwaspCweMapping = Object.freeze({
    schema: OWASP_CWE_MAPPING_SCHEMA,
    owaspEdition: OWASP_TOP10_EDITION,
    entries: Object.freeze(entries),
    complete,
    diagnostics,
  });
  return Object.freeze({ ok: true as const, value });
}

const entry = (
  code: string,
  status: OwaspCweMappingStatus,
  owasp: readonly OwaspTop10Id[],
  cwe: readonly string[],
): OwaspCweEntry => Object.freeze({ code, status, owasp: Object.freeze([...owasp]), cwe: Object.freeze([...cwe]) });

/**
 * Baseline mapping for the in-package Galerina_SECURITY_* diagnostic codes.
 * Zero-trust defaults, owner may revisit. Entries are sorted by code; codes with
 * no defensible single mapping are recorded as `unmapped` rather than guessed.
 */
export const OWASP_CWE_BASELINE_MAPPING: OwaspCweMapping = Object.freeze({
  schema: OWASP_CWE_MAPPING_SCHEMA,
  owaspEdition: OWASP_TOP10_EDITION,
  entries: Object.freeze([
    // Encryption without integrity: missing integrity check.
    entry("Galerina_SECURITY_AUTHENTICATED_ENCRYPTION_REQUIRED", "mapped", ["A02:2021", "A08:2021"], ["CWE-353"]),
    // Key below policy minimum: inadequate encryption strength.
    entry("Galerina_SECURITY_CRYPTO_KEY_TOO_SMALL", "mapped", ["A02:2021"], ["CWE-326"]),
    // Default-allow permission model: insecure default / incorrect default permissions.
    entry("Galerina_SECURITY_PERMISSION_DEFAULT_ALLOW", "mapped", ["A01:2021", "A05:2021"], ["CWE-276", "CWE-1188"]),
    // Duplicate grant is hygiene only; no defensible baseline weakness.
    entry("Galerina_SECURITY_PERMISSION_DUPLICATE_GRANT", "unmapped", [], []),
    // Grant without a resource: improper access control scope.
    entry("Galerina_SECURITY_PERMISSION_EMPTY_RESOURCE", "mapped", ["A01:2021"], ["CWE-284"]),
    // Wildcard allow: improper privilege management / overly broad permission assignment.
    entry("Galerina_SECURITY_PERMISSION_WILDCARD_ALLOW", "mapped", ["A01:2021"], ["CWE-269", "CWE-732"]),
    // Oversized redaction input guard: uncontrolled resource consumption.
    entry("Galerina_SECURITY_REDACTION_INPUT_TOO_LARGE", "mapped", ["A04:2021"], ["CWE-400"]),
    // Replacement tokens that re-emit matches: sensitive info exposure / into logs.
    entry("Galerina_SECURITY_REDACTION_REPLACEMENT_CAN_LEAK_CONTEXT", "mapped", ["A01:2021", "A09:2021"], ["CWE-200", "CWE-532"]),
    // Invalid rule fails closed; configuration hygiene only.
    entry("Galerina_SECURITY_REDACTION_RULE_INVALID", "unmapped", [], []),
    // Empty rule name; configuration hygiene only.
    entry("Galerina_SECURITY_REDACTION_RULE_NAME_EMPTY", "unmapped", [], []),
    // Refused regex pattern (ReDoS guard): resource consumption / inefficient regex complexity.
    entry("Galerina_SECURITY_REDACTION_RULE_UNSAFE_PATTERN", "mapped", [], ["CWE-400", "CWE-1333"]),
    // Weak algorithm allowed (md5 / sha-1 / des / 3des / rc4 / rsa-pkcs1-v1_5).
    entry("Galerina_SECURITY_WEAK_CRYPTO_ALLOWED", "mapped", ["A02:2021"], ["CWE-327", "CWE-328"]),
  ]),
  complete: true,
  diagnostics: Object.freeze([]),
});

const BASELINE_BY_CODE: ReadonlyMap<string, OwaspCweEntry> = new Map(
  OWASP_CWE_BASELINE_MAPPING.entries.map((e) => [e.code, e] as const),
);

/**
 * Look up the baseline entry for a diagnostic code. Never throws; a non-string,
 * malformed or unknown code refuses without echoing the input.
 */
export function lookupOwaspCweBaseline(code: unknown): LookupOwaspCweBaselineResult {
  if (typeof code !== "string" || !CODE_TOKEN.test(code)) {
    return Object.freeze({
      ok: false as const,
      diagnostics: Object.freeze([diag(FUNGI_SEC_OWC_002, "Diagnostic code is outside the closed token domain.", "code")]),
    });
  }
  const found = BASELINE_BY_CODE.get(code);
  if (found === undefined) {
    return Object.freeze({
      ok: false as const,
      diagnostics: Object.freeze([diag(FUNGI_SEC_OWC_005, "Diagnostic code has no baseline mapping entry.", "code")]),
    });
  }
  return Object.freeze({ ok: true as const, value: found });
}
