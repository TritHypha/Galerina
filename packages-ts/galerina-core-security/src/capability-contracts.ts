// Capability boundary / grant report schemas (TODO pass, Grok 2026-10-05;
// zero-trust defaults, owner may revisit).
//
// Closed-shape contracts for the security TODO row "Define capability boundary
// and grant report schemas". Aligns decision vocabulary with policy-contracts
// (allow|deny|abstain) and capability name tokens with ID-style names used by
// core-reports CapabilityEvidence, without depending on that package or
// inventing SecretReference v0.2 / capability lease / attenuation / approver-chain
// (those stay open / do-not-invent as labelled).
//
// Zero-trust rules:
//  - Closed shapes via property descriptors (no getters; symbols / accessors /
//    custom prototypes refuse). Unknown keys refuse without echoing the key.
//  - CapabilityBoundary.defaultEffect admits only "deny".
//  - admittedCapabilities / deniedCapabilities are unique ascending ID tokens;
//    the two lists must be disjoint.
//  - CapabilityGrantReport.grantedCapabilities / refusedCapabilities unique
//    ascending and disjoint; complete must be boolean.
//  - Never throws; never echoes boundary ids, subject ids, capability names,
//    or unknown values.
//
// Not covered: SecretReference v0.2, capability lease / attenuation /
// approver-chain diagnostics, live grant enforcement, report file writers.

/** Record / input is not a closed data object. */
export const FUNGI_SEC_CAP_001 = "FUNGI-SEC-CAP-001";
/** A field value is outside its closed domain (incl. NaN / Infinity / unknown effect). */
export const FUNGI_SEC_CAP_002 = "FUNGI-SEC-CAP-002";
/** Consistency refuse (empty when required / duplicate / unsorted / overlapping lists / defaultEffect not deny). */
export const FUNGI_SEC_CAP_003 = "FUNGI-SEC-CAP-003";
/** Nested record / list refuse. */
export const FUNGI_SEC_CAP_004 = "FUNGI-SEC-CAP-004";
/** Result consistency refuse. */
export const FUNGI_SEC_CAP_005 = "FUNGI-SEC-CAP-005";

export const CAPABILITY_BOUNDARY_SCHEMA = "galerina.security.capability-boundary/v1";
export const CAPABILITY_GRANT_REPORT_SCHEMA = "galerina.security.capability-grant-report/v1";

/** Undeclared capabilities are not admitted. */
export const CAPABILITY_DEFAULT_EFFECTS = Object.freeze(["deny"] as const);
export type CapabilityDefaultEffect = (typeof CAPABILITY_DEFAULT_EFFECTS)[number];

export const CAPABILITY_GRANT_DECISIONS = Object.freeze(["abstain", "allow", "deny"] as const);
export type CapabilityGrantDecision = (typeof CAPABILITY_GRANT_DECISIONS)[number];

export const CAPABILITY_BOUNDARY_FIELDS = Object.freeze([
  "schema", "boundaryId", "subjectId", "admittedCapabilities", "deniedCapabilities",
  "defaultEffect", "diagnostics",
] as const);

export const CAPABILITY_GRANT_REPORT_FIELDS = Object.freeze([
  "schema", "reportId", "boundaryId", "subjectId", "decision",
  "grantedCapabilities", "refusedCapabilities", "complete", "diagnostics",
] as const);

export type CapabilityDiagnosticField =
  | "record" | "schema" | "boundaryId" | "subjectId" | "admittedCapabilities"
  | "deniedCapabilities" | "defaultEffect" | "diagnostics" | "reportId"
  | "decision" | "grantedCapabilities" | "refusedCapabilities" | "complete";

export interface CapabilityDiagnostic {
  readonly code: string;
  readonly severity: "error";
  readonly message: string;
  readonly field: CapabilityDiagnosticField;
}

export interface CapabilityBoundary {
  readonly schema: typeof CAPABILITY_BOUNDARY_SCHEMA;
  readonly boundaryId: string;
  readonly subjectId: string;
  readonly admittedCapabilities: readonly string[];
  readonly deniedCapabilities: readonly string[];
  readonly defaultEffect: CapabilityDefaultEffect;
  readonly diagnostics: readonly CapabilityDiagnostic[];
}

export interface CapabilityGrantReport {
  readonly schema: typeof CAPABILITY_GRANT_REPORT_SCHEMA;
  readonly reportId: string;
  readonly boundaryId: string;
  readonly subjectId: string;
  readonly decision: CapabilityGrantDecision;
  readonly grantedCapabilities: readonly string[];
  readonly refusedCapabilities: readonly string[];
  readonly complete: boolean;
  readonly diagnostics: readonly CapabilityDiagnostic[];
}

export type ReadCapabilityBoundaryResult =
  | { readonly ok: true; readonly value: CapabilityBoundary }
  | { readonly ok: false; readonly diagnostics: readonly CapabilityDiagnostic[] };

export type ReadCapabilityGrantReportResult =
  | { readonly ok: true; readonly value: CapabilityGrantReport }
  | { readonly ok: false; readonly diagnostics: readonly CapabilityDiagnostic[] };

const ID_TOKEN = /^[A-Za-z][A-Za-z0-9._-]{0,63}$/;
const MAX_LIST = 4096;
const MAX_KEYS = 32;
const DEFAULT_SET = new Set<string>(CAPABILITY_DEFAULT_EFFECTS);
const DECISION_SET = new Set<string>(CAPABILITY_GRANT_DECISIONS);

const diag = (
  code: string,
  message: string,
  field: CapabilityDiagnosticField,
): CapabilityDiagnostic => Object.freeze({ code, severity: "error" as const, message, field });

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
  field: CapabilityDiagnosticField,
  out: CapabilityDiagnostic[],
): boolean {
  const allowedSet = new Set(allowed);
  for (const key of snap.values.keys()) {
    if (!allowedSet.has(key)) {
      out.push(diag(FUNGI_SEC_CAP_001, "Record has a key outside the closed shape.", field));
      return false;
    }
  }
  for (const key of required) {
    if (!snap.values.has(key)) {
      out.push(diag(FUNGI_SEC_CAP_001, "Record is missing a required field.", field));
      return false;
    }
  }
  return true;
}

function readIdToken(
  value: unknown,
  field: CapabilityDiagnosticField,
  out: CapabilityDiagnostic[],
): string | undefined {
  if (typeof value !== "string" || !ID_TOKEN.test(value)) {
    out.push(diag(FUNGI_SEC_CAP_002, "Identifier is outside the closed token domain.", field));
    return undefined;
  }
  return value;
}

function readTokenList(
  value: unknown,
  field: CapabilityDiagnosticField,
  requireNonEmpty: boolean,
  out: CapabilityDiagnostic[],
): readonly string[] | undefined {
  const items = snapshotArray(value, MAX_LIST);
  if (items === undefined) {
    out.push(diag(FUNGI_SEC_CAP_004, "List must be a dense array within bounds.", field));
    return undefined;
  }
  if (requireNonEmpty && items.length === 0) {
    out.push(diag(FUNGI_SEC_CAP_003, "List must be non-empty.", field));
    return undefined;
  }
  const outList: string[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    if (typeof item !== "string" || !ID_TOKEN.test(item)) {
      out.push(diag(FUNGI_SEC_CAP_002, "List entry is outside the closed token domain.", field));
      return undefined;
    }
    if (seen.has(item)) {
      out.push(diag(FUNGI_SEC_CAP_003, "List entries must be unique.", field));
      return undefined;
    }
    seen.add(item);
    outList.push(item);
  }
  if (!strictlyAscending(outList)) {
    out.push(diag(FUNGI_SEC_CAP_002, "List must be strictly ascending.", field));
    return undefined;
  }
  return Object.freeze(outList);
}

function listsDisjoint(
  left: readonly string[],
  right: readonly string[],
  field: CapabilityDiagnosticField,
  out: CapabilityDiagnostic[],
): boolean {
  const set = new Set(left);
  for (const item of right) {
    if (set.has(item)) {
      out.push(diag(FUNGI_SEC_CAP_003, "Capability lists must be disjoint.", field));
      return false;
    }
  }
  return true;
}

function snapshotDiagnostics(
  value: unknown,
  out: CapabilityDiagnostic[],
): readonly CapabilityDiagnostic[] | undefined {
  const items = snapshotArray(value, MAX_LIST);
  if (items === undefined) {
    out.push(diag(FUNGI_SEC_CAP_001, "Diagnostics must be a dense array within bounds.", "diagnostics"));
    return undefined;
  }
  const result: CapabilityDiagnostic[] = [];
  const known = ["code", "severity", "message", "field"];
  for (const item of items) {
    const snap = snapshotRecord(item, 8);
    if (!snap.ok) {
      out.push(diag(FUNGI_SEC_CAP_001, "Diagnostic entry must be a plain data object.", "diagnostics"));
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
      out.push(diag(FUNGI_SEC_CAP_002, "Diagnostic fields are outside the closed domain.", "diagnostics"));
      return undefined;
    }
    result.push(Object.freeze({ code, severity: "error" as const, message, field: f as CapabilityDiagnosticField }));
  }
  return Object.freeze(result);
}

function fail(out: CapabilityDiagnostic[]): ReadCapabilityBoundaryResult {
  return Object.freeze({ ok: false as const, diagnostics: Object.freeze([...out]) });
}

export function readCapabilityBoundary(input: unknown): ReadCapabilityBoundaryResult {
  const out: CapabilityDiagnostic[] = [];
  const snap = snapshotRecord(input, MAX_KEYS);
  if (!snap.ok) {
    out.push(diag(FUNGI_SEC_CAP_001, "Capability boundary must be a plain data object.", "record"));
    return fail(out);
  }
  if (!requireKeysSubset(snap, CAPABILITY_BOUNDARY_FIELDS, CAPABILITY_BOUNDARY_FIELDS, "record", out)) {
    return fail(out);
  }
  if (snap.values.get("schema") !== CAPABILITY_BOUNDARY_SCHEMA) {
    out.push(diag(FUNGI_SEC_CAP_002, "Schema is outside the closed domain.", "schema"));
    return fail(out);
  }
  const boundaryId = readIdToken(snap.values.get("boundaryId"), "boundaryId", out);
  if (boundaryId === undefined) return fail(out);
  const subjectId = readIdToken(snap.values.get("subjectId"), "subjectId", out);
  if (subjectId === undefined) return fail(out);
  const admitted = readTokenList(snap.values.get("admittedCapabilities"), "admittedCapabilities", false, out);
  if (admitted === undefined) return fail(out);
  const denied = readTokenList(snap.values.get("deniedCapabilities"), "deniedCapabilities", false, out);
  if (denied === undefined) return fail(out);
  if (!listsDisjoint(admitted, denied, "deniedCapabilities", out)) return fail(out);
  const defaultEffect = snap.values.get("defaultEffect");
  if (typeof defaultEffect !== "string" || !DEFAULT_SET.has(defaultEffect)) {
    out.push(diag(FUNGI_SEC_CAP_002, "Default effect must be deny.", "defaultEffect"));
    return fail(out);
  }
  const diagnostics = snapshotDiagnostics(snap.values.get("diagnostics"), out);
  if (diagnostics === undefined) return fail(out);
  if (diagnostics.length !== 0) {
    out.push(diag(FUNGI_SEC_CAP_005, "Successful boundary must carry empty diagnostics.", "diagnostics"));
    return fail(out);
  }
  const value: CapabilityBoundary = Object.freeze({
    schema: CAPABILITY_BOUNDARY_SCHEMA,
    boundaryId,
    subjectId,
    admittedCapabilities: admitted,
    deniedCapabilities: denied,
    defaultEffect: "deny",
    diagnostics,
  });
  return Object.freeze({ ok: true as const, value });
}

export function readCapabilityGrantReport(input: unknown): ReadCapabilityGrantReportResult {
  const out: CapabilityDiagnostic[] = [];
  const snap = snapshotRecord(input, MAX_KEYS);
  if (!snap.ok) {
    out.push(diag(FUNGI_SEC_CAP_001, "Capability grant report must be a plain data object.", "record"));
    return Object.freeze({ ok: false as const, diagnostics: Object.freeze(out) });
  }
  if (!requireKeysSubset(snap, CAPABILITY_GRANT_REPORT_FIELDS, CAPABILITY_GRANT_REPORT_FIELDS, "record", out)) {
    return Object.freeze({ ok: false as const, diagnostics: Object.freeze([...out]) });
  }
  if (snap.values.get("schema") !== CAPABILITY_GRANT_REPORT_SCHEMA) {
    out.push(diag(FUNGI_SEC_CAP_002, "Schema is outside the closed domain.", "schema"));
    return Object.freeze({ ok: false as const, diagnostics: Object.freeze([...out]) });
  }
  const reportId = readIdToken(snap.values.get("reportId"), "reportId", out);
  if (reportId === undefined) return Object.freeze({ ok: false as const, diagnostics: Object.freeze([...out]) });
  const boundaryId = readIdToken(snap.values.get("boundaryId"), "boundaryId", out);
  if (boundaryId === undefined) return Object.freeze({ ok: false as const, diagnostics: Object.freeze([...out]) });
  const subjectId = readIdToken(snap.values.get("subjectId"), "subjectId", out);
  if (subjectId === undefined) return Object.freeze({ ok: false as const, diagnostics: Object.freeze([...out]) });
  const decisionRaw = snap.values.get("decision");
  if (typeof decisionRaw !== "string" || !DECISION_SET.has(decisionRaw)) {
    out.push(diag(FUNGI_SEC_CAP_002, "Decision is outside the closed vocabulary.", "decision"));
    return Object.freeze({ ok: false as const, diagnostics: Object.freeze([...out]) });
  }
  const granted = readTokenList(snap.values.get("grantedCapabilities"), "grantedCapabilities", false, out);
  if (granted === undefined) return Object.freeze({ ok: false as const, diagnostics: Object.freeze([...out]) });
  const refused = readTokenList(snap.values.get("refusedCapabilities"), "refusedCapabilities", false, out);
  if (refused === undefined) return Object.freeze({ ok: false as const, diagnostics: Object.freeze([...out]) });
  if (!listsDisjoint(granted, refused, "refusedCapabilities", out)) {
    return Object.freeze({ ok: false as const, diagnostics: Object.freeze([...out]) });
  }
  if (decisionRaw === "allow" && granted.length === 0) {
    out.push(diag(FUNGI_SEC_CAP_003, "Allow decision requires at least one granted capability.", "grantedCapabilities"));
    return Object.freeze({ ok: false as const, diagnostics: Object.freeze([...out]) });
  }
  if (decisionRaw === "deny" && refused.length === 0 && granted.length !== 0) {
    out.push(diag(FUNGI_SEC_CAP_003, "Deny decision with grants requires refusedCapabilities.", "refusedCapabilities"));
    return Object.freeze({ ok: false as const, diagnostics: Object.freeze([...out]) });
  }
  const complete = snap.values.get("complete");
  if (typeof complete !== "boolean") {
    out.push(diag(FUNGI_SEC_CAP_002, "Complete flag must be a boolean.", "complete"));
    return Object.freeze({ ok: false as const, diagnostics: Object.freeze([...out]) });
  }
  const diagnostics = snapshotDiagnostics(snap.values.get("diagnostics"), out);
  if (diagnostics === undefined) {
    return Object.freeze({ ok: false as const, diagnostics: Object.freeze([...out]) });
  }
  if (diagnostics.length !== 0) {
    out.push(diag(FUNGI_SEC_CAP_005, "Successful grant report must carry empty diagnostics.", "diagnostics"));
    return Object.freeze({ ok: false as const, diagnostics: Object.freeze([...out]) });
  }
  const value: CapabilityGrantReport = Object.freeze({
    schema: CAPABILITY_GRANT_REPORT_SCHEMA,
    reportId,
    boundaryId,
    subjectId,
    decision: decisionRaw as CapabilityGrantDecision,
    grantedCapabilities: granted,
    refusedCapabilities: refused,
    complete,
    diagnostics,
  });
  return Object.freeze({ ok: true as const, value });
}
