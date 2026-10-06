// Runtime audit report format (TODO pass, Grok 2026-10-05; zero-trust defaults,
// owner may revisit).
//
// Closed-shape RuntimeAuditReportFormat for the app-kernel "Define runtime audit
// report format" TODO. Captures which kernel report kinds a build may admit and
// the redaction / inclusion floors from README.md Reports + ARCHITECTURE.md
// ("app-kernel owns ... audit events") as data a kernel or reporter may consult,
// without writing report files, wiring createAppKernel, defining core-reports
// RuntimeAuditEvent schemas, or implementing IdempotencyStore (HOLD).
//
// Zero-trust rules:
//  - Closed shapes via property descriptors (no getters run; symbols / accessors /
//    custom prototypes refuse). Unknown keys refuse without echoing the key.
//  - defaultDecision admits only "deny": a report kind that is not declared is not
//    admitted (allow / bypass refused).
//  - admittedReports is a non-empty, strictly ascending subset of the closed
//    APP_KERNEL_REPORT_KINDS vocabulary (README report file stems).
//  - "idempotency" is reserved while the app-kernel idempotency / IdempotencyStore
//    contract is on HOLD: including it in admittedReports is refused.
//  - redaction admits only "required" (optional / none / plaintext refused).
//  - includeSecrets admits only "deny" (allow refused).
//  - maxEventsPerReport is a finite, positive, safe integer within bounds
//    (no NaN / Infinity / 0 / negative / "unlimited").
//  - Diagnostic messages never echo tokens, names, keys, paths, secrets or
//    unknown values.
//
// Not covered: live report emission / JSONL append, core-reports audit-report.json
// schemas (parked remaining), IdempotencyStore (HOLD), core-runtime / api-server
// handoffs, or lifting Structured Await queue_handoff.

/** Record / input is not a closed data object. */
export const FUNGI_APPK_RAR_001 = "FUNGI-APPK-RAR-001";
/** A field value is outside its closed domain (incl. reserved idempotency report). */
export const FUNGI_APPK_RAR_002 = "FUNGI-APPK-RAR-002";
/** Format consistency refuse (empty / duplicate / unsorted report lists). */
export const FUNGI_APPK_RAR_003 = "FUNGI-APPK-RAR-003";
/** Nested record / list refuse. */
export const FUNGI_APPK_RAR_004 = "FUNGI-APPK-RAR-004";
/** Result consistency refuse. */
export const FUNGI_APPK_RAR_005 = "FUNGI-APPK-RAR-005";

export const RUNTIME_AUDIT_REPORT_FORMAT_SCHEMA = "galerina.app-kernel.runtime-audit-report-format/v1";

/** Undeclared report kinds are not admitted. */
export const RUNTIME_AUDIT_REPORT_DEFAULT_DECISIONS = Object.freeze(["deny"] as const);
export type RuntimeAuditReportDefaultDecision = (typeof RUNTIME_AUDIT_REPORT_DEFAULT_DECISIONS)[number];

/** Every admitted report must redact secret material. */
export const RUNTIME_AUDIT_REPORT_REDACTION = Object.freeze(["required"] as const);
export type RuntimeAuditReportRedaction = (typeof RUNTIME_AUDIT_REPORT_REDACTION)[number];

/** Secret values must never appear in admitted reports. */
export const RUNTIME_AUDIT_REPORT_INCLUDE_SECRETS = Object.freeze(["deny"] as const);
export type RuntimeAuditReportIncludeSecrets = (typeof RUNTIME_AUDIT_REPORT_INCLUDE_SECRETS)[number];

/**
 * Closed vocabulary of app-kernel report kinds (README.md Reports stems, without
 * the `app.` prefix / `.json` / `.md` suffix). `idempotency` is reserved while
 * IdempotencyStore is HOLD and is refused if listed.
 */
export const APP_KERNEL_REPORT_KINDS = Object.freeze([
  "ai-guide",
  "api-manifest",
  "auth",
  "crash",
  "crash-risk",
  "csrf",
  "data",
  "idempotency",
  "load-control",
  "map-manifest",
  "memory",
  "response-security",
  "secret",
  "security",
  "target",
] as const);
export type AppKernelReportKind = (typeof APP_KERNEL_REPORT_KINDS)[number];

/** Report kind reserved while the idempotency contract is on HOLD. */
export const RUNTIME_AUDIT_REPORT_RESERVED_KINDS = Object.freeze(["idempotency"] as const);

export const RUNTIME_AUDIT_REPORT_FORMAT_FIELDS = Object.freeze([
  "schema",
  "name",
  "defaultDecision",
  "admittedReports",
  "redaction",
  "includeSecrets",
  "maxEventsPerReport",
  "diagnostics",
] as const);

export type RuntimeAuditReportDiagnosticField =
  | "record"
  | "schema"
  | "name"
  | "defaultDecision"
  | "admittedReports"
  | "redaction"
  | "includeSecrets"
  | "maxEventsPerReport"
  | "diagnostics"
  | "idempotency";

export interface RuntimeAuditReportDiagnostic {
  readonly code: string;
  readonly severity: "error";
  readonly message: string;
  readonly field: RuntimeAuditReportDiagnosticField;
}

export interface RuntimeAuditReportFormat {
  readonly schema: typeof RUNTIME_AUDIT_REPORT_FORMAT_SCHEMA;
  readonly name: string;
  readonly defaultDecision: RuntimeAuditReportDefaultDecision;
  readonly admittedReports: readonly AppKernelReportKind[];
  readonly redaction: RuntimeAuditReportRedaction;
  readonly includeSecrets: RuntimeAuditReportIncludeSecrets;
  readonly maxEventsPerReport: number;
  readonly diagnostics: readonly RuntimeAuditReportDiagnostic[];
}

export type ReadRuntimeAuditReportFormatResult =
  | { readonly ok: true; readonly value: RuntimeAuditReportFormat }
  | { readonly ok: false; readonly diagnostics: readonly RuntimeAuditReportDiagnostic[] };

const TYPE_NAME = /^[A-Z][A-Za-z0-9_]{0,63}$/;
const MAX_REPORTS = APP_KERNEL_REPORT_KINDS.length;
const MAX_LIST = 4096;
const MAX_TOKEN = 128;
const MIN_EVENTS = 1;
const MAX_EVENTS = 100_000;
const DEFAULT_DECISION_SET = new Set<string>(RUNTIME_AUDIT_REPORT_DEFAULT_DECISIONS);
const REDACTION_SET = new Set<string>(RUNTIME_AUDIT_REPORT_REDACTION);
const INCLUDE_SECRETS_SET = new Set<string>(RUNTIME_AUDIT_REPORT_INCLUDE_SECRETS);
const KIND_SET = new Set<string>(APP_KERNEL_REPORT_KINDS);
const RESERVED_KIND_SET = new Set<string>(RUNTIME_AUDIT_REPORT_RESERVED_KINDS);

const diag = (
  code: string,
  message: string,
  field: RuntimeAuditReportDiagnosticField,
): RuntimeAuditReportDiagnostic => Object.freeze({ code, severity: "error" as const, message, field });

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
  field: RuntimeAuditReportDiagnosticField,
  out: RuntimeAuditReportDiagnostic[],
): boolean {
  const allowedSet = new Set(allowed);
  for (const key of snap.values.keys()) {
    if (!allowedSet.has(key)) {
      out.push(diag(FUNGI_APPK_RAR_001, "Record has a key outside the closed shape.", field));
      return false;
    }
  }
  for (const key of required) {
    if (!snap.values.has(key)) {
      out.push(diag(FUNGI_APPK_RAR_001, "Record is missing a required field.", field));
      return false;
    }
  }
  return true;
}

function readPositiveSafeInt(
  value: unknown,
  field: RuntimeAuditReportDiagnosticField,
  min: number,
  max: number,
  out: RuntimeAuditReportDiagnostic[],
): number | undefined {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    !Number.isSafeInteger(value) ||
    value < min ||
    value > max
  ) {
    out.push(diag(FUNGI_APPK_RAR_002, "Numeric limit is outside the closed domain.", field));
    return undefined;
  }
  return value;
}

function readClosedToken(
  value: unknown,
  allowed: ReadonlySet<string>,
  field: RuntimeAuditReportDiagnosticField,
  message: string,
  out: RuntimeAuditReportDiagnostic[],
): string | undefined {
  if (typeof value !== "string" || !allowed.has(value)) {
    out.push(diag(FUNGI_APPK_RAR_002, message, field));
    return undefined;
  }
  return value;
}

function readReportKindList(value: unknown, out: RuntimeAuditReportDiagnostic[]): readonly AppKernelReportKind[] | undefined {
  const items = snapshotArray(value, MAX_REPORTS);
  if (items === undefined) {
    out.push(diag(FUNGI_APPK_RAR_004, "Report kind list must be a dense array within bounds.", "admittedReports"));
    return undefined;
  }
  if (items.length === 0) {
    out.push(diag(FUNGI_APPK_RAR_003, "Report kind list must be non-empty.", "admittedReports"));
    return undefined;
  }
  const kinds: AppKernelReportKind[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    if (typeof item !== "string") {
      out.push(diag(FUNGI_APPK_RAR_002, "Report kind is outside the closed vocabulary.", "admittedReports"));
      return undefined;
    }
    if (RESERVED_KIND_SET.has(item)) {
      out.push(
        diag(
          FUNGI_APPK_RAR_002,
          "Idempotency report kind is reserved until the app-kernel idempotency contract lands.",
          "idempotency",
        ),
      );
      return undefined;
    }
    if (!KIND_SET.has(item)) {
      out.push(diag(FUNGI_APPK_RAR_002, "Report kind is outside the closed vocabulary.", "admittedReports"));
      return undefined;
    }
    if (seen.has(item)) {
      out.push(diag(FUNGI_APPK_RAR_003, "Report kinds must be unique.", "admittedReports"));
      return undefined;
    }
    seen.add(item);
    kinds.push(item as AppKernelReportKind);
  }
  if (!strictlyAscending(kinds)) {
    out.push(diag(FUNGI_APPK_RAR_002, "Report kind list must be strictly ascending.", "admittedReports"));
    return undefined;
  }
  return Object.freeze(kinds);
}

function snapshotDiagnostics(
  value: unknown,
  out: RuntimeAuditReportDiagnostic[],
): readonly RuntimeAuditReportDiagnostic[] | undefined {
  const items = snapshotArray(value, MAX_LIST);
  if (items === undefined) {
    out.push(diag(FUNGI_APPK_RAR_001, "Diagnostics must be a dense array within bounds.", "diagnostics"));
    return undefined;
  }
  const result: RuntimeAuditReportDiagnostic[] = [];
  const known = ["code", "severity", "message", "field"];
  for (const item of items) {
    const snap = snapshotRecord(item, 8);
    if (!snap.ok) {
      out.push(diag(FUNGI_APPK_RAR_001, "Diagnostic entry must be a plain data object.", "diagnostics"));
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
      out.push(diag(FUNGI_APPK_RAR_002, "Diagnostic entry is outside the closed domain.", "diagnostics"));
      return undefined;
    }
    result.push(
      Object.freeze({ code, severity: "error" as const, message, field: f as RuntimeAuditReportDiagnosticField }),
    );
  }
  return Object.freeze(result);
}

function refusedFormat(diagnostics: readonly RuntimeAuditReportDiagnostic[]): RuntimeAuditReportFormat {
  return Object.freeze({
    schema: RUNTIME_AUDIT_REPORT_FORMAT_SCHEMA,
    name: "Refused",
    defaultDecision: "deny" as const,
    admittedReports: Object.freeze([] as AppKernelReportKind[]),
    redaction: "required" as const,
    includeSecrets: "deny" as const,
    maxEventsPerReport: 1,
    diagnostics: Object.freeze([...diagnostics]),
  });
}

/** Build a closed RuntimeAuditReportFormat; never throws; success recomputed from diagnostics. */
export function createRuntimeAuditReportFormat(input: unknown): RuntimeAuditReportFormat {
  const out: RuntimeAuditReportDiagnostic[] = [];
  try {
    const snap = snapshotRecord(input, RUNTIME_AUDIT_REPORT_FORMAT_FIELDS.length);
    if (!snap.ok) {
      out.push(diag(FUNGI_APPK_RAR_001, "Runtime audit report format must be a plain data object.", "record"));
      return refusedFormat(out);
    }
    if (
      !requireKeysSubset(
        snap,
        RUNTIME_AUDIT_REPORT_FORMAT_FIELDS,
        RUNTIME_AUDIT_REPORT_FORMAT_FIELDS.filter((k) => k !== "diagnostics"),
        "record",
        out,
      )
    ) {
      return refusedFormat(out);
    }

    if (snap.values.get("schema") !== RUNTIME_AUDIT_REPORT_FORMAT_SCHEMA) {
      out.push(diag(FUNGI_APPK_RAR_002, "Schema token is outside the closed vocabulary.", "schema"));
      return refusedFormat(out);
    }

    const name = snap.values.get("name");
    if (typeof name !== "string" || !TYPE_NAME.test(name)) {
      out.push(diag(FUNGI_APPK_RAR_002, "Format name is outside the closed domain.", "name"));
      return refusedFormat(out);
    }

    if (
      readClosedToken(
        snap.values.get("defaultDecision"),
        DEFAULT_DECISION_SET,
        "defaultDecision",
        "Default decision is outside the closed vocabulary.",
        out,
      ) === undefined
    ) {
      return refusedFormat(out);
    }

    const admittedReports = readReportKindList(snap.values.get("admittedReports"), out);
    if (admittedReports === undefined) return refusedFormat(out);

    const redaction = readClosedToken(
      snap.values.get("redaction"),
      REDACTION_SET,
      "redaction",
      "Redaction policy is outside the closed vocabulary.",
      out,
    );
    if (redaction === undefined) return refusedFormat(out);

    const includeSecrets = readClosedToken(
      snap.values.get("includeSecrets"),
      INCLUDE_SECRETS_SET,
      "includeSecrets",
      "Include-secrets policy is outside the closed vocabulary.",
      out,
    );
    if (includeSecrets === undefined) return refusedFormat(out);

    const maxEventsPerReport = readPositiveSafeInt(
      snap.values.get("maxEventsPerReport"),
      "maxEventsPerReport",
      MIN_EVENTS,
      MAX_EVENTS,
      out,
    );
    if (maxEventsPerReport === undefined) return refusedFormat(out);

    let diagnostics: readonly RuntimeAuditReportDiagnostic[] = Object.freeze([]);
    if (snap.values.has("diagnostics")) {
      const nested = snapshotDiagnostics(snap.values.get("diagnostics"), out);
      if (nested === undefined) return refusedFormat(out);
      if (nested.length > 0) {
        out.push(diag(FUNGI_APPK_RAR_005, "Input diagnostics must be empty on create.", "diagnostics"));
        return refusedFormat(out);
      }
      diagnostics = nested;
    }

    return Object.freeze({
      schema: RUNTIME_AUDIT_REPORT_FORMAT_SCHEMA,
      name,
      defaultDecision: "deny" as const,
      admittedReports,
      redaction: redaction as RuntimeAuditReportRedaction,
      includeSecrets: includeSecrets as RuntimeAuditReportIncludeSecrets,
      maxEventsPerReport,
      diagnostics,
    });
  } catch {
    return refusedFormat([diag(FUNGI_APPK_RAR_001, "Runtime audit report format read failed closed.", "record")]);
  }
}

/** Read a closed RuntimeAuditReportFormat; never throws; never echoes refused tokens. */
export function readRuntimeAuditReportFormat(value: unknown): ReadRuntimeAuditReportFormatResult {
  const created = createRuntimeAuditReportFormat(value);
  if (created.diagnostics.length > 0) {
    return { ok: false, diagnostics: created.diagnostics };
  }
  return { ok: true, value: created };
}

export function isAppKernelReportKind(value: unknown): value is AppKernelReportKind {
  return typeof value === "string" && KIND_SET.has(value) && !RESERVED_KIND_SET.has(value);
}
