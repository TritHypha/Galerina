// verification-report.json emitter (TODO pass, Grok 2026-10-05; zero-trust defaults, owner may revisit).
//
// The report is derived from a VerificationResult, but it does not trust that result's
// `success` flag. Success is recomputed: the artefact set must be non-empty, every artefact
// must be verified with no diagnostics, and there must be no set-level diagnostics. Only
// known string fields are copied, so a hostile object cannot add keys to the report. The
// output is deterministic: there is no timestamp unless the caller supplies one, and keys
// are in a fixed order. Writing refuses to overwrite an existing report.
//
// Optional runtime manifest section (Grok 2026-10-05): pass the result of
// verifyRuntimeManifestSet as `options.manifests`. Its success is recomputed in the same way,
// only index, a re-validated flow name, the verdict and FUNGI-form codes are copied, and overall
// success also needs every manifest to verify.

import { constants } from "node:fs";
import { open, realpath, stat } from "node:fs/promises";
import { join } from "node:path";

import type { VerificationResult } from "../verify.js";
import { RUNTIME_MANIFEST_SCHEMA, type RuntimeManifestVerification } from "./verify-manifest.js";

export const VERIFICATION_REPORT_SCHEMA = "galerina.verification-report/v1";
export const VERIFICATION_REPORT_FILE = "verification-report.json";

/** The verifier's documented limits, carried in every report so a reader cannot mistake it for a sandbox result. */
export const VERIFICATION_REPORT_LIMITATIONS: readonly string[] = Object.freeze([
  "integrity helper, not a filesystem sandbox",
  "does not prove trusted provenance",
  "does not prevent concurrent modification of ancestor directories",
]);

export interface VerificationReportDiagnostic {
  readonly code: string;
  readonly severity: "error";
  readonly message: string;
  readonly path: string;
}

export interface VerificationReportArtefact {
  readonly path: string;
  readonly hash: string;
  readonly verified: boolean;
  readonly codes: readonly string[];
}

/** One runtime manifest record in the report: position, validated flow name (or ""), verdict and codes only. */
export interface VerificationReportManifestRecord {
  readonly index: number;
  readonly flow: string;
  readonly verified: boolean;
  readonly codes: readonly string[];
}

/** Optional runtime manifest section (present only when the caller passes `manifests`). */
export interface VerificationReportManifests {
  readonly schema: typeof RUNTIME_MANIFEST_SCHEMA;
  readonly success: boolean;
  readonly summary: { readonly total: number; readonly verified: number; readonly failed: number };
  readonly records: readonly VerificationReportManifestRecord[];
  /** Set-level codes (empty set, duplicate flow, not an array). */
  readonly setCodes: readonly string[];
}

export interface VerificationReport {
  readonly schema: typeof VERIFICATION_REPORT_SCHEMA;
  readonly success: boolean;
  readonly summary: { readonly total: number; readonly verified: number; readonly failed: number };
  readonly artefacts: readonly VerificationReportArtefact[];
  readonly diagnostics: readonly VerificationReportDiagnostic[];
  readonly limitations: readonly string[];
  readonly manifests?: VerificationReportManifests;
  readonly generatedAt?: string;
}

export interface VerificationReportOptions {
  /** Optional UTC timestamp `YYYY-MM-DDTHH:MM:SS(.sss)Z`. Omitted by default so reports are reproducible. */
  readonly generatedAt?: string;
  /**
   * Optional result of verifyRuntimeManifestSet. When given, the report carries a `manifests`
   * section and overall success also needs every manifest to verify. Its `success` flag is not
   * trusted: it is recomputed from the copied records and codes.
   */
  readonly manifests?: RuntimeManifestVerification;
}

const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const str = (v: unknown): string => (typeof v === "string" ? v : "");
/** Read one property without letting a hostile getter or proxy throw out of the report builder. */
const get = (o: unknown, key: string): unknown => {
  if (o === null || typeof o !== "object") return undefined;
  try { return (o as Record<string, unknown>)[key]; } catch { return undefined; }
};
const list = (v: unknown): readonly unknown[] => {
  try { return Array.isArray(v) ? Array.from(v as readonly unknown[]) : []; } catch { return []; }
};

const CODE = /^FUNGI-[A-Z0-9]+(?:-[A-Z0-9]+)*-\d{3}$/;
const FLOW = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/;
/** A manifest code is copied only when it has the FUNGI-...-NNN form; anything else becomes a fixed token. */
const safeCode = (v: unknown): string => (typeof v === "string" && CODE.test(v) ? v : "code withheld");

function copyManifests(m: unknown): VerificationReportManifests {
  const records = list(get(m, "manifests")).map((r): VerificationReportManifestRecord => {
    const codes = list(get(r, "diagnostics")).map((d) => safeCode(get(d, "code")));
    const index = get(r, "index");
    const flow = get(r, "flow");
    return Object.freeze({
      index: typeof index === "number" && Number.isSafeInteger(index) && index >= 0 ? index : -1,
      flow: typeof flow === "string" && FLOW.test(flow) ? flow : "",
      verified: get(r, "verified") === true && codes.length === 0,
      codes: Object.freeze(codes),
    });
  });
  const all = list(get(m, "diagnostics"));
  const setCodes = all.filter((d) => get(d, "field") === "set").map((d) => safeCode(get(d, "code")));
  const verifiedCount = records.filter((r) => r.verified).length;
  const success = get(m, "success") === true && records.length > 0 && verifiedCount === records.length && all.length === 0;
  return Object.freeze({
    schema: RUNTIME_MANIFEST_SCHEMA,
    success,
    summary: Object.freeze({ total: records.length, verified: verifiedCount, failed: records.length - verifiedCount }),
    records: Object.freeze(records),
    setCodes: Object.freeze(setCodes),
  });
}

function copyDiagnostic(d: unknown): VerificationReportDiagnostic {
  // SuperGrok C12 NB-3: never copy untrusted diagnostic.message (a forged result can plant free text).
  // Code + path are still taken as short strings; message is a fixed withhold token.
  return Object.freeze({
    code: str(get(d, "code")),
    severity: "error" as const,
    message: "diagnostic message withheld",
    path: str(get(d, "path")),
  });
}

/** Build a frozen, JSON-safe verification report from a verifier result. Throws RangeError for a malformed generatedAt. */
export function createVerificationReport(result: VerificationResult, options: VerificationReportOptions = {}): VerificationReport {
  const generatedAt = options?.generatedAt;
  if (generatedAt !== undefined && (typeof generatedAt !== "string" || !ISO_UTC.test(generatedAt) || Number.isNaN(Date.parse(generatedAt)))) {
    throw new RangeError("generatedAt must be a UTC ISO-8601 timestamp ending in Z.");
  }
  const artefacts = list(get(result, "artefacts")).map((a): VerificationReportArtefact => {
    const diagnostics = list(get(a, "diagnostics")).map(copyDiagnostic);
    return Object.freeze({
      path: str(get(a, "path")),
      hash: str(get(a, "hash")),
      verified: get(a, "verified") === true && diagnostics.length === 0,
      codes: Object.freeze(diagnostics.map((d) => d.code)),
    });
  });
  const diagnostics = list(get(result, "diagnostics")).map(copyDiagnostic);
  const verifiedCount = artefacts.filter((a) => a.verified).length;
  const manifestOption = options?.manifests;
  const manifests = manifestOption !== undefined ? copyManifests(manifestOption) : undefined;
  const success =
    get(result, "success") === true && artefacts.length > 0 && verifiedCount === artefacts.length && diagnostics.length === 0 &&
    (manifests === undefined || manifests.success);
  const report: VerificationReport = {
    schema: VERIFICATION_REPORT_SCHEMA,
    success,
    summary: Object.freeze({ total: artefacts.length, verified: verifiedCount, failed: artefacts.length - verifiedCount }),
    artefacts: Object.freeze(artefacts),
    diagnostics: Object.freeze(diagnostics),
    limitations: VERIFICATION_REPORT_LIMITATIONS,
    ...(manifests !== undefined ? { manifests } : {}),
    ...(generatedAt !== undefined ? { generatedAt } : {}),
  };
  return Object.freeze(report);
}

/** Render a report as stable JSON (fixed key order, two-space indent, trailing newline). */
export function renderVerificationReport(report: VerificationReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

/**
 * Write `verification-report.json` into an existing directory. The directory must already exist
 * (it is not created), and an existing report is never overwritten (exclusive create), so a
 * stale or planted file fails loudly instead of being silently replaced.
 */
export async function writeVerificationReport(
  result: VerificationResult,
  outDir: string,
  options: VerificationReportOptions = {},
): Promise<{ readonly path: string; readonly report: VerificationReport }> {
  if (typeof outDir !== "string" || outDir.length === 0) throw new TypeError("outDir must be a non-empty string.");
  const dir = await realpath(outDir);
  if (!(await stat(dir)).isDirectory()) throw new TypeError("outDir must be a directory.");
  const report = createVerificationReport(result, options);
  const path = join(dir, VERIFICATION_REPORT_FILE);
  const flags = constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (process.platform === "win32" ? 0 : (constants.O_NOFOLLOW ?? 0));
  const handle = await open(path, flags, 0o644);
  try {
    await handle.writeFile(renderVerificationReport(report), "utf8");
  } finally {
    await handle.close();
  }
  return Object.freeze({ path, report });
}
