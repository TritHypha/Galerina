// verify-deploy-report.json emitter (TODO pass, Grok 2026-10-05; zero-trust defaults, owner may revisit).
//
// Built from a VerifyDeployResult. Does not trust result.success: recomputed as
// diagnostics.length === 0 && matched. Diagnostic messages are withheld (fixed token);
// only FUNGI-form codes and closed field tokens are copied. Exclusive create only.
// Limitations: no live process/pid/host probe; receipt vs manifest slice compare only.

import { constants } from "node:fs";
import { open, realpath, stat } from "node:fs/promises";
import { join } from "node:path";

import type { VerifyDeployResult } from "./verify-deploy.js";

export const VERIFY_DEPLOY_REPORT_SCHEMA = "galerina.verify-deploy-report/v1";
export const VERIFY_DEPLOY_REPORT_FILE = "verify-deploy-report.json";

export const VERIFY_DEPLOY_REPORT_LIMITATIONS: readonly string[] = Object.freeze([
  "closed-shape receipt vs build-manifest-slice compare only; live process/pid/host probe not admitted",
  "does not attach to a running deployment or read module bytes from a live host",
  "diagnostic messages withheld; codes and closed field tokens only",
]);

export interface VerifyDeployReportDiagnostic {
  readonly code: string;
  readonly severity: "error";
  readonly message: string;
  readonly field: string;
}

export interface VerifyDeployReport {
  readonly schema: typeof VERIFY_DEPLOY_REPORT_SCHEMA;
  readonly success: boolean;
  readonly matched: boolean;
  readonly receiptVersionId: string;
  readonly diagnostics: readonly VerifyDeployReportDiagnostic[];
  readonly limitations: readonly string[];
  readonly generatedAt?: string;
}

const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const CODE = /^FUNGI-[A-Z0-9]+(?:-[A-Z0-9]+)*-\d{3}$/;
const FIELD = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;
const VERSION_ID = /^[a-z][A-Za-z0-9_]*(?:\.[a-z][A-Za-z0-9_]*)*$/;

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
const safeVersionId = (v: unknown): string =>
  typeof v === "string" && (v === "" || VERSION_ID.test(v)) ? v : "";

function copyDiagnostic(d: unknown): VerifyDeployReportDiagnostic {
  return Object.freeze({
    code: safeCode(get(d, "code")),
    severity: "error" as const,
    message: "diagnostic message withheld",
    field: safeField(get(d, "field")),
  });
}

export function createVerifyDeployReport(
  result: VerifyDeployResult,
  options?: { readonly generatedAt?: string },
): VerifyDeployReport {
  const diagnostics = Object.freeze(list(get(result, "diagnostics")).map(copyDiagnostic));
  const matchedRaw = get(result, "matched") === true;
  const matched = matchedRaw && diagnostics.length === 0;
  const success = matched && diagnostics.length === 0;
  const receiptVersionId = safeVersionId(get(result, "receiptVersionId"));
  const generatedAt = options?.generatedAt;
  if (generatedAt !== undefined) {
    if (typeof generatedAt !== "string" || !ISO_UTC.test(generatedAt)) {
      return Object.freeze({
        schema: VERIFY_DEPLOY_REPORT_SCHEMA,
        success: false,
        matched: false,
        receiptVersionId,
        diagnostics: Object.freeze([
          ...diagnostics,
          Object.freeze({
            code: "FUNGI-VDEPLOY-002",
            severity: "error" as const,
            message: "diagnostic message withheld",
            field: "record",
          }),
        ]),
        limitations: VERIFY_DEPLOY_REPORT_LIMITATIONS,
      });
    }
    return Object.freeze({
      schema: VERIFY_DEPLOY_REPORT_SCHEMA,
      success,
      matched,
      receiptVersionId,
      diagnostics,
      limitations: VERIFY_DEPLOY_REPORT_LIMITATIONS,
      generatedAt,
    });
  }
  return Object.freeze({
    schema: VERIFY_DEPLOY_REPORT_SCHEMA,
    success,
    matched,
    receiptVersionId,
    diagnostics,
    limitations: VERIFY_DEPLOY_REPORT_LIMITATIONS,
  });
}

export function renderVerifyDeployReport(report: VerifyDeployReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

export async function writeVerifyDeployReport(
  dir: string,
  report: VerifyDeployReport,
): Promise<{ readonly ok: true; readonly path: string } | { readonly ok: false; readonly code: string }> {
  try {
    const resolved = await realpath(dir);
    const st = await stat(resolved);
    if (!st.isDirectory()) return { ok: false, code: "FUNGI-CLI-VDEPLOY-005" };
    const path = join(resolved, VERIFY_DEPLOY_REPORT_FILE);
    const handle = await open(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL);
    try {
      await handle.writeFile(renderVerifyDeployReport(report), "utf8");
    } finally {
      await handle.close();
    }
    return { ok: true, path };
  } catch {
    return { ok: false, code: "FUNGI-CLI-VDEPLOY-005" };
  }
}
