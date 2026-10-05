/**
 * `galerina verify deploy` command wiring (zero-trust defaults, owner may revisit).
 *
 * Parses closed receipt + build-manifest-slice flags, calls verifyDeploy (never attaches
 * to a live process), optionally writes verify-deploy-report.json. Never echoes paths,
 * hashes, version ids, or keys in diagnostics / default.
 *
 * Admitted flags: --receipt <file>, --manifest <file>, --report <dir>, --json, --strict.
 * --live / --pid / --process / --host refuse FUNGI-CLI-VDEPLOY-004 (live probe HOLD).
 * Exit codes: 0 success, 2 usage, 4 validation / mismatch.
 */

import { readFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import type { CliContext, CliError, CliResult } from "../types.js";
import {
  verifyDeploy,
  type VerifyDeployResult,
} from "./verify-deploy.js";
import {
  createVerifyDeployReport,
  renderVerifyDeployReport,
  writeVerifyDeployReport,
  VERIFY_DEPLOY_REPORT_FILE,
} from "./verify-deploy-reporter.js";

/** Unknown or duplicate flag / missing value / equals-form / positional. */
export const FUNGI_CLI_VDEPLOY_001 = "FUNGI-CLI-VDEPLOY-001";
/** Required --receipt / --manifest missing. */
export const FUNGI_CLI_VDEPLOY_002 = "FUNGI-CLI-VDEPLOY-002";
/** Receipt or manifest input file unreadable / not JSON / wrong top-level shape. */
export const FUNGI_CLI_VDEPLOY_003 = "FUNGI-CLI-VDEPLOY-003";
/** Live process / pid / host probe flag not admitted. */
export const FUNGI_CLI_VDEPLOY_004 = "FUNGI-CLI-VDEPLOY-004";
/** --report directory unusable (missing, not a dir, or report already exists). */
export const FUNGI_CLI_VDEPLOY_005 = "FUNGI-CLI-VDEPLOY-005";

export const VDEPLOY_EXIT_OK = 0;
export const VDEPLOY_EXIT_USAGE = 2;
export const VDEPLOY_EXIT_VALIDATION = 4;

const ADMITTED_FLAGS = Object.freeze([
  "--receipt",
  "--manifest",
  "--report",
  "--json",
  "--strict",
  "--live",
  "--pid",
  "--process",
  "--host",
] as const);

const LIVE_FLAGS = new Set(["--live", "--pid", "--process", "--host"]);

export type VDeployFlagName = (typeof ADMITTED_FLAGS)[number];

export interface VDeployCommandOptions {
  readonly receiptPath: string;
  readonly manifestPath: string;
  readonly reportDir?: string;
  readonly json: boolean;
  readonly strict: boolean;
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

function isAdmittedFlag(name: string): name is VDeployFlagName {
  return (ADMITTED_FLAGS as readonly string[]).includes(name);
}

/**
 * Parse verify-deploy argv (args after the `deploy` subcommand token).
 * Fail-closed: unknown flags, duplicates, missing values, equals-form, positionals,
 * and live-probe flags all refuse.
 */
export function parseVerifyDeployArgs(args: readonly string[]):
  | { readonly ok: true; readonly options: VDeployCommandOptions }
  | { readonly ok: false; readonly result: CliResult } {
  let receiptPath = "";
  let manifestPath = "";
  let reportDir = "";
  let json = false;
  let strict = false;
  const seen = new Set<string>();

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (typeof a !== "string" || a.length === 0) {
      return { ok: false, result: refuse(FUNGI_CLI_VDEPLOY_001, VDEPLOY_EXIT_USAGE, "Verify deploy received an empty argument.", "Pass only admitted verify deploy flags.") };
    }
    if (a.startsWith("--") && a.includes("=")) {
      return { ok: false, result: refuse(FUNGI_CLI_VDEPLOY_001, VDEPLOY_EXIT_USAGE, "Verify deploy does not accept --flag=value forms.", "Pass --flag <value> with a separate argument.") };
    }
    if (!a.startsWith("--")) {
      return { ok: false, result: refuse(FUNGI_CLI_VDEPLOY_001, VDEPLOY_EXIT_USAGE, "Verify deploy does not accept positional arguments.", "Pass inputs through --receipt / --manifest / --report.") };
    }
    if (!isAdmittedFlag(a)) {
      return { ok: false, result: refuse(FUNGI_CLI_VDEPLOY_001, VDEPLOY_EXIT_USAGE, "Verify deploy received an unknown flag.", "Use only --receipt, --manifest, --report, --json, --strict.") };
    }
    if (seen.has(a)) {
      return { ok: false, result: refuse(FUNGI_CLI_VDEPLOY_001, VDEPLOY_EXIT_USAGE, "A verify deploy flag was given more than once.", "Pass each flag at most once.") };
    }
    seen.add(a);

    if (LIVE_FLAGS.has(a)) {
      return { ok: false, result: refuse(FUNGI_CLI_VDEPLOY_004, VDEPLOY_EXIT_USAGE, "Live process or host probe flags are not admitted.", "Pass a closed --receipt JSON file instead of attaching to a live process.") };
    }
    if (a === "--json") { json = true; continue; }
    if (a === "--strict") { strict = true; continue; }

    const next = args[i + 1];
    if (next === undefined || next.startsWith("-")) {
      return { ok: false, result: refuse(FUNGI_CLI_VDEPLOY_001, VDEPLOY_EXIT_USAGE, "A verify deploy flag that needs a value was given without one.", "Pass --receipt <file>, --manifest <file>, or --report <dir>.") };
    }
    i += 1;
    if (a === "--receipt") receiptPath = next;
    else if (a === "--manifest") manifestPath = next;
    else if (a === "--report") reportDir = next;
  }

  if (receiptPath.length === 0 || manifestPath.length === 0) {
    return { ok: false, result: refuse(FUNGI_CLI_VDEPLOY_002, VDEPLOY_EXIT_USAGE, "Verify deploy requires --receipt and --manifest.", "Pass --receipt <file> and --manifest <file>.") };
  }

  const options: VDeployCommandOptions = reportDir.length > 0
    ? Object.freeze({ receiptPath, manifestPath, reportDir, json, strict })
    : Object.freeze({ receiptPath, manifestPath, json, strict });
  return { ok: true, options };
}

async function loadJsonObject(cwd: string, relativeOrAbs: string): Promise<
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly result: CliResult }
> {
  try {
    const abs = isAbsolute(relativeOrAbs) ? relativeOrAbs : resolve(cwd, relativeOrAbs);
    const text = await readFile(abs, "utf8");
    const parsed: unknown = JSON.parse(text);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ok: false, result: refuse(FUNGI_CLI_VDEPLOY_003, VDEPLOY_EXIT_VALIDATION, "Verify deploy input must be a JSON object.", "Pass a closed receipt or manifest slice JSON object.") };
    }
    return { ok: true, value: parsed };
  } catch {
    return { ok: false, result: refuse(FUNGI_CLI_VDEPLOY_003, VDEPLOY_EXIT_VALIDATION, "Verify deploy could not read a required JSON input.", "Ensure --receipt and --manifest point at readable JSON files.") };
  }
}

function resultFromVerify(result: VerifyDeployResult, json: boolean, reportNote?: string): CliResult {
  const ok = result.success === true;
  const code = ok ? VDEPLOY_EXIT_OK : VDEPLOY_EXIT_VALIDATION;
  if (json) {
    const report = createVerifyDeployReport(result);
    const payload = reportNote === undefined
      ? report
      : Object.freeze({ ...report, reportFile: VERIFY_DEPLOY_REPORT_FILE });
    return Object.freeze({
      ok,
      code,
      message: renderVerifyDeployReport(payload).trimEnd(),
    });
  }
  if (ok) {
    return Object.freeze({
      ok: true as const,
      code: VDEPLOY_EXIT_OK,
      message: reportNote === undefined
        ? "Verify deploy matched the closed receipt against the build-manifest slice."
        : `Verify deploy matched; wrote ${VERIFY_DEPLOY_REPORT_FILE}.`,
    });
  }
  const first = result.diagnostics[0];
  const safeMessage = first === undefined
    ? "Verify deploy refused the receipt or manifest slice."
    : "Verify deploy refused the receipt or manifest slice.";
  return refuse(
    first?.code ?? "FUNGI-VDEPLOY-001",
    VDEPLOY_EXIT_VALIDATION,
    safeMessage,
    "Pass closed receipt and manifest JSON that share buildHash, target, and optional moduleHash.",
  );
}

/** Run `galerina verify deploy` against closed receipt + manifest slice files. */
export async function runVerifyDeployCommand(context: CliContext): Promise<CliResult> {
  const parsed = parseVerifyDeployArgs(context.args);
  if (!parsed.ok) return parsed.result;
  const { options } = parsed;

  const receiptLoad = await loadJsonObject(context.cwd, options.receiptPath);
  if (!receiptLoad.ok) return receiptLoad.result;
  const manifestLoad = await loadJsonObject(context.cwd, options.manifestPath);
  if (!manifestLoad.ok) return manifestLoad.result;

  // --strict is admitted as a no-op fail-closed token (same posture as deploy/build).
  void options.strict;

  const verified = verifyDeploy(receiptLoad.value, manifestLoad.value);

  if (options.reportDir !== undefined) {
    const report = createVerifyDeployReport(verified);
    const written = await writeVerifyDeployReport(options.reportDir, report);
    if (!written.ok) {
      return refuse(FUNGI_CLI_VDEPLOY_005, VDEPLOY_EXIT_USAGE, "Verify deploy could not write the report.", "Pass --report <existing-empty-dir>; exclusive create only.");
    }
    return resultFromVerify(verified, options.json, VERIFY_DEPLOY_REPORT_FILE);
  }
  return resultFromVerify(verified, options.json);
}
