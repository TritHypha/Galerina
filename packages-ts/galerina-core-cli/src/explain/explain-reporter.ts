// explain-report.json emitter (TODO pass, Grok 2026-10-05; zero-trust defaults, owner may revisit).
//
// Built from an ExplainResult. Does not trust caller success: recomputed as
// diagnostics.length === 0. Diagnostic messages are withheld (fixed token); only
// FUNGI-form codes and closed field tokens are copied. Trace labels/input/output
// must already be closed tokens (copied only when they match). Exclusive create
// only (never overwrite). Limitations note declared tree/runtime; no live walk/probe; policy/audit open.

import { constants } from "node:fs";
import { open, realpath, stat } from "node:fs/promises";
import { join } from "node:path";

import {
  EXPLAIN_TRACE_LABELS,
  type ExplainResult,
  type ExplainTraceLabel,
  isExplainTraceLabel,
} from "./explain-trace.js";

export const EXPLAIN_REPORT_SCHEMA = "galerina.explain-report/v1";
export const EXPLAIN_REPORT_FILE = "explain-report.json";

export const EXPLAIN_REPORT_LIMITATIONS: readonly string[] = Object.freeze([
  "closed-shape explain of manifest / denial / declared dependency-tree / declared runtime profile",
  "does not walk a live filesystem or package dependency graph",
  "does not probe a live runtime, policy, or audit evidence stream",
]);

export interface ExplainReportDiagnostic {
  readonly code: string;
  readonly severity: "error";
  readonly message: string;
  readonly field: string;
}

export interface ExplainReportTrace {
  readonly step: number;
  readonly label: ExplainTraceLabel;
  readonly input: string;
  readonly output: string;
}

export interface ExplainReport {
  readonly schema: typeof EXPLAIN_REPORT_SCHEMA;
  readonly success: boolean;
  readonly traces: readonly ExplainReportTrace[];
  readonly effects: readonly string[];
  readonly capabilities: readonly string[];
  readonly boundaries: readonly string[];
  readonly diagnostics: readonly ExplainReportDiagnostic[];
  readonly limitations: readonly string[];
  readonly generatedAt?: string;
}

const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const CODE = /^FUNGI-[A-Z0-9]+(?:-[A-Z0-9]+)*-\d{3}$/;
const FIELD = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;
const TOKEN = /^[a-z][A-Za-z0-9_]*(?:\.[a-z][A-Za-z0-9_]*)*$/;
const MAX_TOKEN = 128;
const LABEL_SET = new Set<string>(EXPLAIN_TRACE_LABELS);

const get = (o: unknown, key: string): unknown => {
  if (o === null || typeof o !== "object") return undefined;
  try {
    return (o as Record<string, unknown>)[key];
  } catch {
    return undefined;
  }
};
const list = (v: unknown): readonly unknown[] => {
  try {
    return Array.isArray(v) ? Array.from(v as readonly unknown[]) : [];
  } catch {
    return [];
  }
};
const safeCode = (v: unknown): string => (typeof v === "string" && CODE.test(v) ? v : "code withheld");
const safeField = (v: unknown): string => (typeof v === "string" && FIELD.test(v) ? v : "field");
const safeToken = (v: unknown): string | undefined =>
  typeof v === "string" && v.length > 0 && v.length <= MAX_TOKEN && TOKEN.test(v) ? v : undefined;

function copyDiagnostic(d: unknown): ExplainReportDiagnostic {
  return Object.freeze({
    code: safeCode(get(d, "code")),
    severity: "error" as const,
    message: "diagnostic message withheld",
    field: safeField(get(d, "field")),
  });
}

function copyTrace(t: unknown, stepFallback: number): ExplainReportTrace | undefined {
  const stepRaw = get(t, "step");
  const step =
    typeof stepRaw === "number" && Number.isSafeInteger(stepRaw) && stepRaw >= 0 ? stepRaw : stepFallback;
  const labelRaw = get(t, "label");
  if (!isExplainTraceLabel(labelRaw) || !LABEL_SET.has(labelRaw)) return undefined;
  const input = safeToken(get(t, "input"));
  const output = safeToken(get(t, "output"));
  if (input === undefined || output === undefined) return undefined;
  return Object.freeze({ step, label: labelRaw, input, output });
}

function copyTokenList(v: unknown): readonly string[] {
  const out: string[] = [];
  for (const item of list(v)) {
    const t = safeToken(item);
    if (t !== undefined) out.push(t);
  }
  return Object.freeze(out);
}

/** Build a frozen, JSON-safe explain report. Throws RangeError for a malformed generatedAt. */
export function createExplainReport(
  result: ExplainResult,
  options: { readonly generatedAt?: string } = {},
): ExplainReport {
  const generatedAt = options.generatedAt;
  if (
    generatedAt !== undefined &&
    (typeof generatedAt !== "string" || !ISO_UTC.test(generatedAt) || Number.isNaN(Date.parse(generatedAt)))
  ) {
    throw new RangeError("generatedAt must be a UTC ISO-8601 timestamp ending in Z.");
  }
  const diagnostics = list(get(result, "diagnostics")).map(copyDiagnostic);
  const tracesRaw = list(get(result, "traces"));
  const traces: ExplainReportTrace[] = [];
  for (let i = 0; i < tracesRaw.length; i += 1) {
    const copied = copyTrace(tracesRaw[i], i);
    if (copied !== undefined) traces.push(copied);
  }
  const success = diagnostics.length === 0;
  const report: ExplainReport = {
    schema: EXPLAIN_REPORT_SCHEMA,
    success,
    traces: Object.freeze(traces),
    effects: copyTokenList(get(result, "effects")),
    capabilities: copyTokenList(get(result, "capabilities")),
    boundaries: copyTokenList(get(result, "boundaries")),
    diagnostics: Object.freeze(diagnostics),
    limitations: EXPLAIN_REPORT_LIMITATIONS,
    ...(generatedAt !== undefined ? { generatedAt } : {}),
  };
  return Object.freeze(report);
}

export function renderExplainReport(report: ExplainReport): string {
  return JSON.stringify(report, null, 2) + "\n";
}

/**
 * Write explain-report.json into an existing directory. Exclusive create only.
 * Caller maps failures to a fixed CLI code (never echo paths).
 */
export async function writeExplainReport(
  result: ExplainResult,
  outDir: string,
  options: { readonly generatedAt?: string } = {},
): Promise<{ readonly report: ExplainReport }> {
  if (typeof outDir !== "string" || outDir.length === 0) throw new TypeError("outDir must be a non-empty string.");
  const dir = await realpath(outDir);
  if (!(await stat(dir)).isDirectory()) throw new TypeError("outDir must be a directory.");
  const report = createExplainReport(result, options);
  const path = join(dir, EXPLAIN_REPORT_FILE);
  const flags =
    constants.O_WRONLY |
    constants.O_CREAT |
    constants.O_EXCL |
    (process.platform === "win32" ? 0 : (constants.O_NOFOLLOW ?? 0));
  const handle = await open(path, flags, 0o644);
  try {
    await handle.writeFile(renderExplainReport(report), "utf8");
  } finally {
    await handle.close();
  }
  return Object.freeze({ report });
}
