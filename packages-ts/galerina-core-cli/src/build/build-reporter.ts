// build-report.json emitter (TODO pass, Grok 2026-10-05; zero-trust defaults, owner may revisit).
//
// Built from a BuildResult. Does not trust result.success: recomputed as
// diagnostics.length === 0. Diagnostic messages are withheld (fixed token); only
// FUNGI-form codes and closed field tokens are copied. Nested artefacts copy only
// closed path/kind/hash/target tokens. Exclusive create only (never overwrite).
// Limitations note: no 14-pass pipeline, no artefact emission to --out, no live IO.

import { constants } from "node:fs";
import { open, realpath, stat } from "node:fs/promises";
import { join } from "node:path";

import {
  BUILD_RUNTIME_TARGETS,
  isBuildRuntimeTarget,
  type BuildResult,
  type BuildRuntimeTarget,
} from "./build-contracts.js";
import { BUILD_ARTEFACT_KINDS } from "../verify/verify-integrity.js";

export const BUILD_REPORT_SCHEMA = "galerina.build-report/v1";
export const BUILD_REPORT_FILE = "build-report.json";

export const BUILD_REPORT_LIMITATIONS: readonly string[] = Object.freeze([
  "closed-shape build contracts only; 14-pass pipeline not admitted on this tip",
  "does not emit runtime-manifest.json / compiler-report.json / effect-report.json / capability-report.json / audit-report.json / build-hash.txt",
  "does not open --workspace or write into --out",
]);

export interface BuildReportDiagnostic {
  readonly code: string;
  readonly severity: "error";
  readonly message: string;
  readonly field: string;
}

export interface BuildReportArtefact {
  readonly path: string;
  readonly kind: string;
  readonly hash: string;
  readonly target: BuildRuntimeTarget;
}

export interface BuildReport {
  readonly schema: typeof BUILD_REPORT_SCHEMA;
  readonly success: boolean;
  readonly artefacts: readonly BuildReportArtefact[];
  readonly diagnostics: readonly BuildReportDiagnostic[];
  readonly manifestPath: string;
  readonly duration: number;
  readonly limitations: readonly string[];
  readonly generatedAt?: string;
}

const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const CODE = /^FUNGI-[A-Z0-9]+(?:-[A-Z0-9]+)*-\d{3}$/;
const FIELD = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;
const REL_PATH = /^(?:[A-Za-z0-9._-]+(?:[\\/][A-Za-z0-9._-]+)*)$/;
const SHA256 = /^sha256:[0-9a-f]{64}$/;
const MAX_PATH = 512;
const MAX_DURATION_MS = 86_400_000;
const KIND_SET = new Set<string>(BUILD_ARTEFACT_KINDS as readonly string[]);

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

function isRelativePathToken(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_PATH &&
    !value.includes("\0") &&
    REL_PATH.test(value) &&
    !value.split(/[\\/]/).includes("..")
  );
}

function copyDiagnostic(d: unknown): BuildReportDiagnostic {
  return Object.freeze({
    code: safeCode(get(d, "code")),
    severity: "error" as const,
    message: "diagnostic message withheld",
    field: safeField(get(d, "field")),
  });
}

function copyArtefact(a: unknown): BuildReportArtefact | null {
  const pathRaw = get(a, "path");
  const kindRaw = get(a, "kind");
  const hashRaw = get(a, "hash");
  const targetRaw = get(a, "target");
  if (!isRelativePathToken(pathRaw)) return null;
  if (typeof kindRaw !== "string" || !KIND_SET.has(kindRaw)) return null;
  if (typeof hashRaw !== "string" || !SHA256.test(hashRaw)) return null;
  if (!isBuildRuntimeTarget(targetRaw)) return null;
  return Object.freeze({
    path: pathRaw,
    kind: kindRaw,
    hash: hashRaw,
    target: targetRaw,
  });
}

function copyBoundedDuration(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) && Number.isSafeInteger(v) && v >= 0 && v <= MAX_DURATION_MS
    ? v
    : 0;
}

/** Build a frozen, JSON-safe build report. Throws RangeError for a malformed generatedAt. */
export function createBuildReport(
  result: BuildResult,
  options: { readonly generatedAt?: string } = {},
): BuildReport {
  const generatedAt = options.generatedAt;
  if (
    generatedAt !== undefined &&
    (typeof generatedAt !== "string" || !ISO_UTC.test(generatedAt) || Number.isNaN(Date.parse(generatedAt)))
  ) {
    throw new RangeError("generatedAt must be a UTC ISO-8601 timestamp ending in Z.");
  }
  const diagnostics = list(get(result, "diagnostics")).map(copyDiagnostic);
  const artefacts: BuildReportArtefact[] = [];
  for (const item of list(get(result, "artefacts"))) {
    const copied = copyArtefact(item);
    if (copied !== null) artefacts.push(copied);
  }
  const manifestRaw = get(result, "manifestPath");
  const manifestPath = isRelativePathToken(manifestRaw) ? manifestRaw : "";
  const success = diagnostics.length === 0;
  void BUILD_RUNTIME_TARGETS;
  const report: BuildReport = {
    schema: BUILD_REPORT_SCHEMA,
    success,
    artefacts: Object.freeze(artefacts),
    diagnostics: Object.freeze(diagnostics),
    manifestPath,
    duration: copyBoundedDuration(get(result, "duration")),
    limitations: BUILD_REPORT_LIMITATIONS,
    ...(generatedAt !== undefined ? { generatedAt } : {}),
  };
  return Object.freeze(report);
}

export function renderBuildReport(report: BuildReport): string {
  return JSON.stringify(report, null, 2) + "\n";
}

/**
 * Write build-report.json into an existing directory. Exclusive create only.
 * Caller maps failures to a fixed CLI code (never echo paths).
 */
export async function writeBuildReport(
  result: BuildResult,
  outDir: string,
  options: { readonly generatedAt?: string } = {},
): Promise<{ readonly report: BuildReport }> {
  if (typeof outDir !== "string" || outDir.length === 0) throw new TypeError("outDir must be a non-empty string.");
  const dir = await realpath(outDir);
  if (!(await stat(dir)).isDirectory()) throw new TypeError("outDir must be a directory.");
  const report = createBuildReport(result, options);
  const path = join(dir, BUILD_REPORT_FILE);
  const flags =
    constants.O_WRONLY |
    constants.O_CREAT |
    constants.O_EXCL |
    (process.platform === "win32" ? 0 : (constants.O_NOFOLLOW ?? 0));
  const handle = await open(path, flags, 0o644);
  try {
    await handle.writeFile(renderBuildReport(report), "utf8");
  } finally {
    await handle.close();
  }
  return Object.freeze({ report });
}
