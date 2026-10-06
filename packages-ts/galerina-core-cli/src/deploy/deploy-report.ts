// deployment-report.json emitter (TODO pass, Grok 2026-10-05; zero-trust defaults, owner may revisit).
//
// Built from a DeploymentResult. Does not trust result.success: recomputed as
// diagnostics.length === 0. Diagnostic messages are withheld (fixed token); only
// FUNGI-form codes and closed field tokens are copied. No timestamp unless given.
// Exclusive create only (never overwrite). Dry-run / no-live-deploy limitations
// are carried in every report.

import { constants } from "node:fs";
import { open, realpath, stat } from "node:fs/promises";
import { join } from "node:path";

import type { DeploymentResult, DeploymentTarget } from "./deploy-validator.js";
import { DEPLOYMENT_TARGETS, isDeploymentTarget } from "./deploy-validator.js";

export const DEPLOYMENT_REPORT_SCHEMA = "galerina.deployment-report/v1";
export const DEPLOYMENT_REPORT_FILE = "deployment-report.json";

export const DEPLOYMENT_REPORT_LIMITATIONS: readonly string[] = Object.freeze([
  "dry-run effects validation only; no live deploy",
  "does not probe targets; module hashes on disk are checked only when --artefacts is given",
  "does not prove trusted provenance",
]);

export interface DeploymentReportDiagnostic {
  readonly code: string;
  readonly severity: "error";
  readonly message: string;
  readonly field: string;
}

export interface DeploymentReport {
  readonly schema: typeof DEPLOYMENT_REPORT_SCHEMA;
  readonly success: boolean;
  readonly target: DeploymentTarget;
  readonly manifestHash: string;
  readonly dryRun: true;
  readonly diagnostics: readonly DeploymentReportDiagnostic[];
  readonly limitations: readonly string[];
  readonly generatedAt?: string;
}

const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const CODE = /^FUNGI-[A-Z0-9]+(?:-[A-Z0-9]+)*-\d{3}$/;
const SHA256 = /^sha256:[0-9a-f]{64}$/;
const FIELD = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;

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

function copyDiagnostic(d: unknown): DeploymentReportDiagnostic {
  return Object.freeze({
    code: safeCode(get(d, "code")),
    severity: "error" as const,
    message: "diagnostic message withheld",
    field: safeField(get(d, "field")),
  });
}

/** Build a frozen, JSON-safe deployment report. Throws RangeError for a malformed generatedAt. */
export function createDeploymentReport(
  result: DeploymentResult,
  options: { readonly generatedAt?: string } = {},
): DeploymentReport {
  const generatedAt = options.generatedAt;
  if (
    generatedAt !== undefined &&
    (typeof generatedAt !== "string" || !ISO_UTC.test(generatedAt) || Number.isNaN(Date.parse(generatedAt)))
  ) {
    throw new RangeError("generatedAt must be a UTC ISO-8601 timestamp ending in Z.");
  }
  const diagnostics = list(get(result, "diagnostics")).map(copyDiagnostic);
  const targetRaw = get(result, "target");
  const target: DeploymentTarget = isDeploymentTarget(targetRaw) ? targetRaw : DEPLOYMENT_TARGETS[0];
  const hashRaw = get(result, "manifestHash");
  const manifestHash =
    typeof hashRaw === "string" && SHA256.test(hashRaw) ? hashRaw : ("sha256:" + "0".repeat(64));
  const success = diagnostics.length === 0 && get(result, "success") === true;
  const report: DeploymentReport = {
    schema: DEPLOYMENT_REPORT_SCHEMA,
    success,
    target,
    manifestHash,
    dryRun: true,
    diagnostics: Object.freeze(diagnostics),
    limitations: DEPLOYMENT_REPORT_LIMITATIONS,
    ...(generatedAt !== undefined ? { generatedAt } : {}),
  };
  return Object.freeze(report);
}

export function renderDeploymentReport(report: DeploymentReport): string {
  return JSON.stringify(report, null, 2) + "\n";
}

/**
 * Write deployment-report.json into an existing directory. Exclusive create only.
 * Caller maps failures to a fixed CLI code (never echo paths).
 */
export async function writeDeploymentReport(
  result: DeploymentResult,
  outDir: string,
  options: { readonly generatedAt?: string } = {},
): Promise<{ readonly report: DeploymentReport }> {
  if (typeof outDir !== "string" || outDir.length === 0) throw new TypeError("outDir must be a non-empty string.");
  const dir = await realpath(outDir);
  if (!(await stat(dir)).isDirectory()) throw new TypeError("outDir must be a directory.");
  const report = createDeploymentReport(result, options);
  const path = join(dir, DEPLOYMENT_REPORT_FILE);
  const flags =
    constants.O_WRONLY |
    constants.O_CREAT |
    constants.O_EXCL |
    (process.platform === "win32" ? 0 : (constants.O_NOFOLLOW ?? 0));
  const handle = await open(path, flags, 0o644);
  try {
    await handle.writeFile(renderDeploymentReport(report), "utf8");
  } finally {
    await handle.close();
  }
  return Object.freeze({ report });
}
