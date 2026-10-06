// Runtime compatibility / capability / audit-report verification (TODO pass, Grok 2026-10-05;
// zero-trust defaults, owner may revisit).
//
// Completes the verify/ dir alongside verify-reporter, verify-manifest, verify-integrity and
// verify-command. Validates the closed report shapes that galerina-core-reports emits for
// audit-report.json (`galerina.report.audit.v1`) and capability-report.json
// (`galerina.report.capability.v1`). No dependency on core-reports: the shapes are mirrored
// here the same way verify-manifest mirrors the compiler RuntimeManifest.
//
// Zero-trust rules:
//  - Closed shape via property descriptors (no getters run; symbols / accessors / custom
//    prototypes refuse). Unknown keys refuse without echoing the key.
//  - schema must be exact; unknown schema refuses before other fields are interpreted.
//  - Counts are non-negative safe integers; byCategory / byStatus keys are exact closed
//    vocabularies; their values must sum to eventCount.
//  - Capability deniedCapabilities must equal the sorted unique capability names with denied>0.
//  - complete must equal (no rejections and not truncated). complete:false never verifies.
//  - Diagnostics never echo values, paths or unknown key names.
//
// Not covered: effect-report.json, denial-report.json, compiler-report.json, runtime-audit.jsonl
// line parsing, or live runtime probing. Owner may revisit.

export const AUDIT_REPORT_SCHEMA = "galerina.report.audit.v1";
export const CAPABILITY_REPORT_SCHEMA = "galerina.report.capability.v1";

/** Record is not a closed data object: unreadable, non-plain, accessor, unknown/missing key or wrong type. */
export const FUNGI_VERIFY_012 = "FUNGI-VERIFY-012";
/** schema is not the expected report schema. */
export const FUNGI_VERIFY_013 = "FUNGI-VERIFY-013";
/** A field value is outside its closed domain. */
export const FUNGI_VERIFY_014 = "FUNGI-VERIFY-014";
/** Fields contradict each other (counts, complete flag, deniedCapabilities membership). */
export const FUNGI_VERIFY_015 = "FUNGI-VERIFY-015";
/** The report is incomplete (complete:false, or truncated / rejections present). */
export const FUNGI_VERIFY_016 = "FUNGI-VERIFY-016";

/** Mirrors RUNTIME_AUDIT_CATEGORIES in galerina-core-reports. */
export const AUDIT_REPORT_CATEGORIES: readonly string[] = Object.freeze([
  "effect", "capability", "boundary", "secret", "network", "policy", "denial", "proof",
]);

/** Mirrors RUNTIME_AUDIT_STATUSES (v0.2) in galerina-core-reports. */
export const AUDIT_REPORT_STATUSES: readonly string[] = Object.freeze([
  "allowed", "denied", "warning", "error", "executed", "verified",
]);

export const AUDIT_REPORT_FIELDS = Object.freeze([
  "schema", "generatedAt", "eventCount", "byCategory", "byStatus",
  "firstTimestamp", "lastTimestamp", "rejectedLines", "rejectedCodes", "truncated", "complete",
] as const);

export const CAPABILITY_REPORT_FIELDS = Object.freeze([
  "schema", "generatedAt", "capabilities", "deniedCapabilities", "policyIds",
  "rejectedIndices", "rejectedCodes", "truncated", "complete",
] as const);

export const CAPABILITY_ROW_FIELDS = Object.freeze(["capability", "allowed", "denied"] as const);

export type RuntimeReportField =
  | (typeof AUDIT_REPORT_FIELDS)[number]
  | (typeof CAPABILITY_REPORT_FIELDS)[number]
  | "record"
  | "row";

export interface RuntimeReportDiagnostic {
  readonly code: string;
  readonly severity: "error";
  readonly message: string;
  readonly field: RuntimeReportField;
}

export interface RuntimeReportVerification {
  readonly success: boolean;
  readonly kind: "audit" | "capability";
  readonly diagnostics: readonly RuntimeReportDiagnostic[];
}

const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const CAP_NAME = /^[A-Za-z_][A-Za-z0-9_.:/-]{0,127}$/;
const CODE_TOKEN = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
const MAX_LIST = 100_000;
const MAX_CODES = 4096;

const diag = (code: string, message: string, field: RuntimeReportField): RuntimeReportDiagnostic =>
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
      if (d === undefined || !("value" in d)) return undefined;
      out.push(d.value);
    }
    return out;
  } catch {
    return undefined;
  }
}

function isNonNegInt(v: unknown): v is number {
  return typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
}

function isTimestamp(v: unknown): v is string {
  return typeof v === "string" && ISO_UTC.test(v) && Number.isFinite(Date.parse(v));
}

function sortedUniqueStrings(xs: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(xs)].sort());
}

function sameStringList(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
  return true;
}

function readClosedCountMap(
  value: unknown,
  expectedKeys: readonly string[],
  field: RuntimeReportField,
  out: RuntimeReportDiagnostic[],
): ReadonlyMap<string, number> | undefined {
  const snap = snapshotRecord(value, expectedKeys.length + 8);
  if (!snap.ok) {
    out.push(diag(FUNGI_VERIFY_012, "Count map must be a plain data object.", field));
    return undefined;
  }
  const keys = [...snap.values.keys()];
  if (keys.length !== expectedKeys.length || expectedKeys.some((k) => !snap.values.has(k))) {
    out.push(diag(FUNGI_VERIFY_014, "Count map keys must be exactly the closed vocabulary.", field));
    return undefined;
  }
  const map = new Map<string, number>();
  for (const k of expectedKeys) {
    const n = snap.values.get(k);
    if (!isNonNegInt(n)) {
      out.push(diag(FUNGI_VERIFY_014, "Count map values must be non-negative safe integers.", field));
      return undefined;
    }
    map.set(k, n);
  }
  return map;
}

function readStringList(
  value: unknown,
  max: number,
  field: RuntimeReportField,
  out: RuntimeReportDiagnostic[],
  itemTest: (s: string) => boolean,
): readonly string[] | undefined {
  const items = snapshotArray(value, max);
  if (items === undefined) {
    out.push(diag(FUNGI_VERIFY_012, "List must be a dense array within bounds.", field));
    return undefined;
  }
  const strings: string[] = [];
  for (const item of items) {
    if (typeof item !== "string" || !itemTest(item)) {
      out.push(diag(FUNGI_VERIFY_014, "List item is outside the closed domain.", field));
      return undefined;
    }
    strings.push(item);
  }
  return strings;
}

function readIntList(
  value: unknown,
  max: number,
  field: RuntimeReportField,
  out: RuntimeReportDiagnostic[],
): readonly number[] | undefined {
  const items = snapshotArray(value, max);
  if (items === undefined) {
    out.push(diag(FUNGI_VERIFY_012, "List must be a dense array within bounds.", field));
    return undefined;
  }
  const nums: number[] = [];
  for (const item of items) {
    if (!isNonNegInt(item)) {
      out.push(diag(FUNGI_VERIFY_014, "List item must be a non-negative safe integer.", field));
      return undefined;
    }
    nums.push(item);
  }
  return nums;
}

/** Verify one `galerina.report.audit.v1` record. Never throws. */
export function verifyAuditReport(record: unknown): RuntimeReportVerification {
  const out: RuntimeReportDiagnostic[] = [];
  const done = (): RuntimeReportVerification =>
    Object.freeze({ success: out.length === 0, kind: "audit" as const, diagnostics: Object.freeze([...out]) });

  const snap = snapshotRecord(record, AUDIT_REPORT_FIELDS.length + 8);
  if (!snap.ok) {
    out.push(diag(FUNGI_VERIFY_012, "Audit report must be a plain data object (no accessors, symbols or custom prototype).", "record"));
    return done();
  }
  const v = snap.values;
  const known = new Set<string>(AUDIT_REPORT_FIELDS);
  if ([...v.keys()].some((k) => !known.has(k))) {
    out.push(diag(FUNGI_VERIFY_012, "Audit report has a key outside the closed v1 shape.", "record"));
  }
  for (const field of AUDIT_REPORT_FIELDS) {
    if (field === "firstTimestamp" || field === "lastTimestamp") continue;
    if (!v.has(field)) out.push(diag(FUNGI_VERIFY_012, "Audit report is missing a required field.", field));
  }
  if (out.length > 0) return done();

  const schema = v.get("schema");
  if (typeof schema !== "string") {
    out.push(diag(FUNGI_VERIFY_012, "Field has the wrong type.", "schema"));
    return done();
  }
  if (schema !== AUDIT_REPORT_SCHEMA) {
    out.push(diag(FUNGI_VERIFY_013, "Unsupported audit report schema; fields are not interpreted.", "schema"));
    return done();
  }

  const generatedAt = v.get("generatedAt");
  if (!isTimestamp(generatedAt)) out.push(diag(FUNGI_VERIFY_014, "generatedAt must be an ISO-8601 UTC timestamp.", "generatedAt"));

  const eventCount = v.get("eventCount");
  if (!isNonNegInt(eventCount)) out.push(diag(FUNGI_VERIFY_014, "eventCount must be a non-negative safe integer.", "eventCount"));

  const truncated = v.get("truncated");
  if (typeof truncated !== "boolean") out.push(diag(FUNGI_VERIFY_012, "Field has the wrong type.", "truncated"));
  const complete = v.get("complete");
  if (typeof complete !== "boolean") out.push(diag(FUNGI_VERIFY_012, "Field has the wrong type.", "complete"));

  if (v.has("firstTimestamp") && !isTimestamp(v.get("firstTimestamp"))) {
    out.push(diag(FUNGI_VERIFY_014, "firstTimestamp must be an ISO-8601 UTC timestamp when present.", "firstTimestamp"));
  }
  if (v.has("lastTimestamp") && !isTimestamp(v.get("lastTimestamp"))) {
    out.push(diag(FUNGI_VERIFY_014, "lastTimestamp must be an ISO-8601 UTC timestamp when present.", "lastTimestamp"));
  }

  const byCategory = readClosedCountMap(v.get("byCategory"), AUDIT_REPORT_CATEGORIES, "byCategory", out);
  const byStatus = readClosedCountMap(v.get("byStatus"), AUDIT_REPORT_STATUSES, "byStatus", out);
  const rejectedLines = readIntList(v.get("rejectedLines"), MAX_LIST, "rejectedLines", out);
  const rejectedCodes = readStringList(v.get("rejectedCodes"), MAX_CODES, "rejectedCodes", out, (s) => CODE_TOKEN.test(s));

  if (out.length > 0) return done();

  const catSum = [...(byCategory as ReadonlyMap<string, number>).values()].reduce((a, b) => a + b, 0);
  const statusSum = [...(byStatus as ReadonlyMap<string, number>).values()].reduce((a, b) => a + b, 0);
  if (catSum !== eventCount) out.push(diag(FUNGI_VERIFY_015, "byCategory counts must sum to eventCount.", "byCategory"));
  if (statusSum !== eventCount) out.push(diag(FUNGI_VERIFY_015, "byStatus counts must sum to eventCount.", "byStatus"));

  const expectedComplete = (rejectedLines as readonly number[]).length === 0 && truncated === false;
  if (complete !== expectedComplete) {
    out.push(diag(FUNGI_VERIFY_015, "complete must be true only when there are no rejections and the report is not truncated.", "complete"));
  }

  if (v.has("firstTimestamp") && v.has("lastTimestamp")) {
    const first = Date.parse(v.get("firstTimestamp") as string);
    const last = Date.parse(v.get("lastTimestamp") as string);
    if (first > last) out.push(diag(FUNGI_VERIFY_015, "firstTimestamp must not be after lastTimestamp.", "firstTimestamp"));
  }

  if (complete === false || expectedComplete === false) {
    out.push(diag(FUNGI_VERIFY_016, "Incomplete audit report never verifies.", "complete"));
  }

  const codes = rejectedCodes as readonly string[];
  if (!sameStringList(codes, sortedUniqueStrings(codes))) {
    out.push(diag(FUNGI_VERIFY_015, "rejectedCodes must be sorted with no duplicates.", "rejectedCodes"));
  }

  return done();
}

/** Verify one `galerina.report.capability.v1` record. Never throws. */
export function verifyCapabilityReport(record: unknown): RuntimeReportVerification {
  const out: RuntimeReportDiagnostic[] = [];
  const done = (): RuntimeReportVerification =>
    Object.freeze({ success: out.length === 0, kind: "capability" as const, diagnostics: Object.freeze([...out]) });

  const snap = snapshotRecord(record, CAPABILITY_REPORT_FIELDS.length + 8);
  if (!snap.ok) {
    out.push(diag(FUNGI_VERIFY_012, "Capability report must be a plain data object (no accessors, symbols or custom prototype).", "record"));
    return done();
  }
  const v = snap.values;
  const known = new Set<string>(CAPABILITY_REPORT_FIELDS);
  if ([...v.keys()].some((k) => !known.has(k))) {
    out.push(diag(FUNGI_VERIFY_012, "Capability report has a key outside the closed v1 shape.", "record"));
  }
  for (const field of CAPABILITY_REPORT_FIELDS) {
    if (!v.has(field)) out.push(diag(FUNGI_VERIFY_012, "Capability report is missing a required field.", field));
  }
  if (out.length > 0) return done();

  const schema = v.get("schema");
  if (typeof schema !== "string") {
    out.push(diag(FUNGI_VERIFY_012, "Field has the wrong type.", "schema"));
    return done();
  }
  if (schema !== CAPABILITY_REPORT_SCHEMA) {
    out.push(diag(FUNGI_VERIFY_013, "Unsupported capability report schema; fields are not interpreted.", "schema"));
    return done();
  }

  const generatedAt = v.get("generatedAt");
  if (!isTimestamp(generatedAt)) out.push(diag(FUNGI_VERIFY_014, "generatedAt must be an ISO-8601 UTC timestamp.", "generatedAt"));

  const truncated = v.get("truncated");
  if (typeof truncated !== "boolean") out.push(diag(FUNGI_VERIFY_012, "Field has the wrong type.", "truncated"));
  const complete = v.get("complete");
  if (typeof complete !== "boolean") out.push(diag(FUNGI_VERIFY_012, "Field has the wrong type.", "complete"));

  const rowsRaw = snapshotArray(v.get("capabilities"), MAX_LIST);
  if (rowsRaw === undefined) {
    out.push(diag(FUNGI_VERIFY_012, "capabilities must be a dense array within bounds.", "capabilities"));
    return done();
  }

  const deniedFromRows: string[] = [];
  const seenCaps = new Set<string>();
  for (const row of rowsRaw) {
    const rowSnap = snapshotRecord(row, CAPABILITY_ROW_FIELDS.length + 4);
    if (!rowSnap.ok) {
      out.push(diag(FUNGI_VERIFY_012, "Capability row must be a plain data object.", "row"));
      return done();
    }
    const rk = [...rowSnap.values.keys()];
    if (rk.length !== CAPABILITY_ROW_FIELDS.length || CAPABILITY_ROW_FIELDS.some((f) => !rowSnap.values.has(f))) {
      out.push(diag(FUNGI_VERIFY_012, "Capability row has a key outside the closed shape.", "row"));
      return done();
    }
    const capability = rowSnap.values.get("capability");
    const allowed = rowSnap.values.get("allowed");
    const denied = rowSnap.values.get("denied");
    if (typeof capability !== "string" || !CAP_NAME.test(capability)) {
      out.push(diag(FUNGI_VERIFY_014, "capability name is outside the closed domain.", "capabilities"));
      return done();
    }
    if (!isNonNegInt(allowed) || !isNonNegInt(denied)) {
      out.push(diag(FUNGI_VERIFY_014, "allowed/denied must be non-negative safe integers.", "capabilities"));
      return done();
    }
    if (seenCaps.has(capability)) {
      out.push(diag(FUNGI_VERIFY_015, "capabilities must not list the same capability twice.", "capabilities"));
      return done();
    }
    seenCaps.add(capability);
    if (denied > 0) deniedFromRows.push(capability);
  }

  const names = [...seenCaps];
  if (!sameStringList(names, [...names].sort())) {
    out.push(diag(FUNGI_VERIFY_015, "capabilities must be sorted by capability name.", "capabilities"));
  }

  const deniedCapabilities = readStringList(v.get("deniedCapabilities"), MAX_LIST, "deniedCapabilities", out, (s) => CAP_NAME.test(s));
  const policyIds = readStringList(v.get("policyIds"), MAX_LIST, "policyIds", out, (s) => CAP_NAME.test(s));
  const rejectedIndices = readIntList(v.get("rejectedIndices"), MAX_LIST, "rejectedIndices", out);
  const rejectedCodes = readStringList(v.get("rejectedCodes"), MAX_CODES, "rejectedCodes", out, (s) => CODE_TOKEN.test(s));

  if (out.length > 0) return done();

  const expectedDenied = sortedUniqueStrings(deniedFromRows);
  if (!sameStringList(deniedCapabilities as readonly string[], expectedDenied)) {
    out.push(diag(FUNGI_VERIFY_015, "deniedCapabilities must equal the sorted unique capability names with denied > 0.", "deniedCapabilities"));
  }
  if (!sameStringList(policyIds as readonly string[], sortedUniqueStrings(policyIds as readonly string[]))) {
    out.push(diag(FUNGI_VERIFY_015, "policyIds must be sorted with no duplicates.", "policyIds"));
  }
  if (!sameStringList(rejectedCodes as readonly string[], sortedUniqueStrings(rejectedCodes as readonly string[]))) {
    out.push(diag(FUNGI_VERIFY_015, "rejectedCodes must be sorted with no duplicates.", "rejectedCodes"));
  }

  const expectedComplete = (rejectedIndices as readonly number[]).length === 0 && truncated === false;
  if (complete !== expectedComplete) {
    out.push(diag(FUNGI_VERIFY_015, "complete must be true only when there are no rejections and the report is not truncated.", "complete"));
  }
  if (complete === false || expectedComplete === false) {
    out.push(diag(FUNGI_VERIFY_016, "Incomplete capability report never verifies.", "complete"));
  }

  return done();
}

/**
 * Optional cross-check when both audit and capability reports are present.
 * Fail-closed: both must already verify individually.
 * Never throws.
 */
export function verifyRuntimeCompatibility(
  audit: RuntimeReportVerification,
  capability: RuntimeReportVerification,
): RuntimeReportVerification {
  const out: RuntimeReportDiagnostic[] = [];
  if (audit.kind !== "audit" || capability.kind !== "capability") {
    out.push(diag(FUNGI_VERIFY_012, "Runtime compatibility requires one audit and one capability verification result.", "record"));
  }
  if (!audit.success) out.push(diag(FUNGI_VERIFY_015, "Runtime compatibility requires a successful audit report verification.", "record"));
  if (!capability.success) out.push(diag(FUNGI_VERIFY_015, "Runtime compatibility requires a successful capability report verification.", "record"));
  return Object.freeze({
    success: out.length === 0,
    kind: "audit" as const,
    diagnostics: Object.freeze(out),
  });
}
