/**
 * `galerina verify` command wiring (zero-trust defaults, owner may revisit).
 *
 * Composes closed-shape artefact integrity + optional runtime-manifest checks + optional
 * audit/capability report validation into one CliResult with exit codes: 0 success, 2 usage,
 * 3 audit/runtime failure, 4 runtime-compatibility validation failure, 5 capability/policy
 * failure, 6 artefact verify failure, 7 manifest integrity failure. Never echoes raw paths,
 * flag values, or file contents.
 *
 * Admitted flags: --artefacts <file>, --root <dir>, --manifest <file>, --report <dir>,
 * --policy <capability-report.json>, --audit <audit-report.json>, --json, --strict, --hash.
 * Unknown flags refuse. No getters run on loaded JSON: JSON.parse yields data only; shape
 * checks live in verify-integrity / verify-manifest / verify-runtime.
 */

import { readFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import type { CliContext, CliError, CliResult } from "../types.js";
import {
  createVerificationReport,
  renderVerificationReport,
  writeVerificationReport,
  VERIFICATION_REPORT_FILE,
} from "./verify-reporter.js";
import { verifyArtefactIntegritySet } from "./verify-integrity.js";
import { verifyRuntimeManifestSet } from "./verify-manifest.js";
import type { RuntimeManifestVerification } from "./verify-manifest.js";
import type { VerificationResult } from "../verify.js";
import {
  verifyAuditReport,
  verifyCapabilityReport,
  verifyRuntimeCompatibility,
} from "./verify-runtime.js";
import type { RuntimeReportVerification } from "./verify-runtime.js";

/** Unknown or duplicate flag / missing value. */
export const FUNGI_CLI_VERIFY_001 = "FUNGI-CLI-VERIFY-001";
/** Required --artefacts missing. */
export const FUNGI_CLI_VERIFY_002 = "FUNGI-CLI-VERIFY-002";
/** Artefacts, manifest or report input file unreadable / not JSON / wrong top-level shape. */
export const FUNGI_CLI_VERIFY_003 = "FUNGI-CLI-VERIFY-003";
/** Reserved (previously --policy/--audit not admitted); kept for stable code space. */
export const FUNGI_CLI_VERIFY_004 = "FUNGI-CLI-VERIFY-004";
/** --report directory unusable (missing, not a dir, or report already exists). */
export const FUNGI_CLI_VERIFY_005 = "FUNGI-CLI-VERIFY-005";

export const VERIFY_EXIT_OK = 0;
export const VERIFY_EXIT_USAGE = 2;
export const VERIFY_EXIT_RUNTIME = 3;
export const VERIFY_EXIT_VALIDATION = 4;
export const VERIFY_EXIT_CAPABILITY = 5;
export const VERIFY_EXIT_ARTEFACT = 6;
export const VERIFY_EXIT_MANIFEST = 7;

const ADMITTED_FLAGS = Object.freeze([
  "--artefacts",
  "--root",
  "--manifest",
  "--report",
  "--json",
  "--strict",
  "--hash",
  "--policy",
  "--audit",
] as const);

export type VerifyFlagName = (typeof ADMITTED_FLAGS)[number];

export interface VerifyCommandOptions {
  readonly artefactsPath: string;
  readonly root: string;
  readonly manifestPath?: string;
  readonly reportDir?: string;
  readonly policyPath?: string;
  readonly auditPath?: string;
  readonly json: boolean;
  readonly strict: boolean;
  readonly hash: boolean;
}

function refuse(code: string, exitCode: number, safeMessage: string, suggestedFix: string): CliResult {
  const error: CliError = Object.freeze({ code, safeMessage, suggestedFix });
  return Object.freeze({
    ok: false as const,
    code: exitCode,
    message: `${code}: ${safeMessage}`,
    details: Object.freeze([`Fix: ${suggestedFix}`]),
    error,
  });
}

function isAdmittedFlag(name: string): name is VerifyFlagName {
  return (ADMITTED_FLAGS as readonly string[]).includes(name);
}

/**
 * Parse verify argv. Fail-closed: unknown flags, duplicates and missing values refuse.
 * Boolean flags (--json/--strict/--hash) take no value. Value flags accept `--flag <value>`
 * only (no `--flag=value`) so values never look like flags.
 */
export function parseVerifyArgs(args: readonly string[]):
  | { readonly ok: true; readonly options: VerifyCommandOptions }
  | { readonly ok: false; readonly result: CliResult } {
  let artefactsPath = "";
  let root = "";
  let manifestPath = "";
  let reportDir = "";
  let policyPath = "";
  let auditPath = "";
  let json = false;
  let strict = false;
  let hash = false;
  const seen = new Set<string>();

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (typeof a !== "string" || a.length === 0) {
      return { ok: false, result: refuse(FUNGI_CLI_VERIFY_001, VERIFY_EXIT_USAGE, "Verify received an empty argument.", "Pass only admitted verify flags.") };
    }
    if (a.startsWith("--") && a.includes("=")) {
      return { ok: false, result: refuse(FUNGI_CLI_VERIFY_001, VERIFY_EXIT_USAGE, "Verify does not accept --flag=value forms.", "Pass --flag <value> with a separate argument.") };
    }
    if (!a.startsWith("--")) {
      return { ok: false, result: refuse(FUNGI_CLI_VERIFY_001, VERIFY_EXIT_USAGE, "Verify does not accept positional arguments.", "Pass inputs through --artefacts / --manifest / --root / --report / --policy / --audit.") };
    }
    if (!isAdmittedFlag(a)) {
      return { ok: false, result: refuse(FUNGI_CLI_VERIFY_001, VERIFY_EXIT_USAGE, "Verify received an unknown flag.", "Use only --artefacts, --root, --manifest, --report, --policy, --audit, --json, --strict, --hash.") };
    }
    if (seen.has(a)) {
      return { ok: false, result: refuse(FUNGI_CLI_VERIFY_001, VERIFY_EXIT_USAGE, "A verify flag was given more than once.", "Pass each flag at most once.") };
    }
    seen.add(a);

    if (a === "--json") { json = true; continue; }
    if (a === "--strict") { strict = true; continue; }
    if (a === "--hash") { hash = true; continue; }

    const next = args[i + 1];
    if (next === undefined || next.startsWith("-")) {
      return { ok: false, result: refuse(FUNGI_CLI_VERIFY_001, VERIFY_EXIT_USAGE, "A verify flag that needs a value was given without one.", "Pass --artefacts <file>, --root <dir>, --manifest <file>, --report <dir>, --policy <file>, or --audit <file>.") };
    }
    i += 1;
    if (a === "--artefacts") artefactsPath = next;
    else if (a === "--root") root = next;
    else if (a === "--manifest") manifestPath = next;
    else if (a === "--report") reportDir = next;
    else if (a === "--policy") policyPath = next;
    else if (a === "--audit") auditPath = next;
  }

  if (artefactsPath.length === 0) {
    return { ok: false, result: refuse(FUNGI_CLI_VERIFY_002, VERIFY_EXIT_USAGE, "Verify requires --artefacts <file>.", "Pass --artefacts pointing at a JSON array of BuildArtefact records.") };
  }

  // --hash is accepted as an explicit acknowledgment; hash/integrity always run.
  // --strict is accepted; verification is always fail-closed (no non-strict mode).
  void hash;
  void strict;
  const options: VerifyCommandOptions = Object.freeze({
    artefactsPath,
    root: root.length > 0 ? root : ".",
    ...(manifestPath.length > 0 ? { manifestPath } : {}),
    ...(reportDir.length > 0 ? { reportDir } : {}),
    ...(policyPath.length > 0 ? { policyPath } : {}),
    ...(auditPath.length > 0 ? { auditPath } : {}),
    json,
    strict,
    hash,
  });
  return { ok: true, options };
}

async function readJsonArray(filePath: string, cwd: string): Promise<
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly result: CliResult }
> {
  const absolute = isAbsolute(filePath) ? filePath : resolve(cwd, filePath);
  let text: string;
  try {
    text = await readFile(absolute, "utf8");
  } catch {
    return { ok: false, result: refuse(FUNGI_CLI_VERIFY_003, VERIFY_EXIT_USAGE, "A verify input file could not be read.", "Ensure --artefacts / --manifest names a readable UTF-8 JSON file.") };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, result: refuse(FUNGI_CLI_VERIFY_003, VERIFY_EXIT_USAGE, "A verify input file was not valid JSON.", "Provide a JSON array of closed-shape records.") };
  }
  if (!Array.isArray(parsed)) {
    return { ok: false, result: refuse(FUNGI_CLI_VERIFY_003, VERIFY_EXIT_USAGE, "A verify input file must be a JSON array.", "Provide a dense JSON array (not an object or sparse array wrapper).") };
  }
  if (Object.keys(parsed).length !== parsed.length) {
    return { ok: false, result: refuse(FUNGI_CLI_VERIFY_003, VERIFY_EXIT_USAGE, "A verify input array must be dense.", "Remove holes from the JSON array.") };
  }
  return { ok: true, value: parsed };
}

async function readJsonObject(filePath: string, cwd: string): Promise<
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly result: CliResult }
> {
  const absolute = isAbsolute(filePath) ? filePath : resolve(cwd, filePath);
  let text: string;
  try {
    text = await readFile(absolute, "utf8");
  } catch {
    return { ok: false, result: refuse(FUNGI_CLI_VERIFY_003, VERIFY_EXIT_USAGE, "A verify input file could not be read.", "Ensure --policy / --audit names a readable UTF-8 JSON object.") };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, result: refuse(FUNGI_CLI_VERIFY_003, VERIFY_EXIT_USAGE, "A verify input file was not valid JSON.", "Provide a JSON object matching the closed report shape.") };
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, result: refuse(FUNGI_CLI_VERIFY_003, VERIFY_EXIT_USAGE, "A verify report input must be a JSON object.", "Provide a single closed-shape report object (not an array).") };
  }
  return { ok: true, value: parsed };
}

function resolveRoot(root: string, cwd: string): string {
  if (root === "." || root.length === 0) return cwd;
  return isAbsolute(root) ? root : resolve(cwd, root);
}

export async function runVerifyCommand(context: CliContext): Promise<CliResult> {
  const parsed = parseVerifyArgs(context.args);
  if (!parsed.ok) return parsed.result;

  const { options } = parsed;
  const root = resolveRoot(options.root, context.cwd);

  const artefactsLoad = await readJsonArray(options.artefactsPath, context.cwd);
  if (!artefactsLoad.ok) return artefactsLoad.result;

  let manifests: RuntimeManifestVerification | undefined;
  if (options.manifestPath !== undefined) {
    const manifestLoad = await readJsonArray(options.manifestPath, context.cwd);
    if (!manifestLoad.ok) return manifestLoad.result;
    manifests = verifyRuntimeManifestSet(manifestLoad.value);
  }

  const artefactResult: VerificationResult = await verifyArtefactIntegritySet(artefactsLoad.value, root);

  let audit: RuntimeReportVerification | undefined;
  let capability: RuntimeReportVerification | undefined;
  if (options.auditPath !== undefined) {
    const load = await readJsonObject(options.auditPath, context.cwd);
    if (!load.ok) return load.result;
    audit = verifyAuditReport(load.value);
  }
  if (options.policyPath !== undefined) {
    const load = await readJsonObject(options.policyPath, context.cwd);
    if (!load.ok) return load.result;
    capability = verifyCapabilityReport(load.value);
  }
  let runtimeCompat: RuntimeReportVerification | undefined;
  if (audit !== undefined && capability !== undefined) {
    runtimeCompat = verifyRuntimeCompatibility(audit, capability);
  }

  if (options.reportDir !== undefined) {
    const reportAbsolute = isAbsolute(options.reportDir) ? options.reportDir : resolve(context.cwd, options.reportDir);
    try {
      await writeVerificationReport(artefactResult, reportAbsolute, manifests !== undefined ? { manifests } : {});
    } catch {
      return refuse(FUNGI_CLI_VERIFY_005, VERIFY_EXIT_USAGE, "Could not write verification-report.json (directory missing, not a directory, or file already exists).", `Ensure --report names an existing empty-of-report directory; the file is ${VERIFICATION_REPORT_FILE} created exclusively.`);
    }
  }

  const report = createVerificationReport(artefactResult, manifests !== undefined ? { manifests } : {});
  const details: string[] = [];
  if (options.json) {
    details.push(renderVerificationReport(report));
  } else {
    details.push(
      `Artefacts: ${report.summary.verified}/${report.summary.total} verified`,
      ...(report.manifests !== undefined
        ? [`Manifests: ${report.manifests.summary.verified}/${report.manifests.summary.total} verified`]
        : []),
      ...(audit !== undefined ? [`Audit report: ${audit.success ? "verified" : "failed"}`] : []),
      ...(capability !== undefined ? [`Capability report: ${capability.success ? "verified" : "failed"}`] : []),
    );
  }

  if (!artefactResult.success) {
    return Object.freeze({
      ok: false as const,
      code: VERIFY_EXIT_ARTEFACT,
      message: "Verify failed: one or more artefacts did not verify.",
      details: Object.freeze(details),
    });
  }

  if (manifests !== undefined && !manifests.success) {
    return Object.freeze({
      ok: false as const,
      code: VERIFY_EXIT_MANIFEST,
      message: "Verify failed: one or more runtime manifests did not verify.",
      details: Object.freeze(details),
    });
  }

  if (audit !== undefined && !audit.success) {
    return Object.freeze({
      ok: false as const,
      code: VERIFY_EXIT_RUNTIME,
      message: "Verify failed: audit report did not verify.",
      details: Object.freeze(details),
    });
  }

  if (capability !== undefined && !capability.success) {
    return Object.freeze({
      ok: false as const,
      code: VERIFY_EXIT_CAPABILITY,
      message: "Verify failed: capability/policy report did not verify.",
      details: Object.freeze(details),
    });
  }

  if (runtimeCompat !== undefined && !runtimeCompat.success) {
    return Object.freeze({
      ok: false as const,
      code: VERIFY_EXIT_VALIDATION,
      message: "Verify failed: runtime compatibility check did not verify.",
      details: Object.freeze(details),
    });
  }

  if (!report.success) {
    return Object.freeze({
      ok: false as const,
      code: manifests !== undefined ? VERIFY_EXIT_MANIFEST : VERIFY_EXIT_ARTEFACT,
      message: "Verify failed: verification report recomputed success as false.",
      details: Object.freeze(details),
    });
  }

  return Object.freeze({
    ok: true as const,
    code: VERIFY_EXIT_OK,
    message: "Verify succeeded.",
    details: Object.freeze(details),
  });
}
