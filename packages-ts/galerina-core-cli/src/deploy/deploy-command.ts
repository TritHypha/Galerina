/**
 * `galerina deploy` command wiring (zero-trust defaults, owner may revisit).
 *
 * Dry-run effects validation only: loads closed-shape manifest slice + effects
 * policy JSON objects, optionally checks module hashes on disk (--artefacts,
 * deploy-module-hash.ts), runs validateEffects, optionally writes
 * deployment-report.json. Never live-deploys. Never echoes paths, effect names,
 * targets, hashes, or file contents in diagnostics / default details.
 *
 * Admitted flags: --manifest <file>, --policy <file>, --target <token>,
 * --hash <sha256:...>, --artefacts <file>, --root <dir>, --report <dir>, --json,
 * --dry-run, --strict. --audit is recognized but refused (capability/audit
 * validation later).
 * Exit codes: 0 success, 2 usage or policy denial, 3 target incompatibility,
 * 4 validation failure, 5 reserved (capability), 6 verified-gate failure,
 * 7 module-hash failure (FUNGI-VERIFY-001..005 from --artefacts).
 *
 * Module-hash check runs before effects validation and before any report write;
 * a failure stops the command with no file written. Owner decision 2026-10-06
 * 10:15 BST: live deploy is authorised for a follow-up PR, and this check is its
 * mandatory pre-deploy gate; this slice stays dry-run only.
 */

import { readFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import type { CliContext, CliError, CliResult } from "../types.js";
import {
  createDeploymentResult,
  isDeploymentTarget,
  validateEffects,
  FUNGI_DEPLOY_001,
  FUNGI_DEPLOY_002,
  FUNGI_DEPLOY_003,
  FUNGI_DEPLOY_004,
  FUNGI_DEPLOY_005,
  type DeploymentTarget,
  type DeployDiagnostic,
} from "./deploy-validator.js";
import {
  createDeploymentReport,
  renderDeploymentReport,
  writeDeploymentReport,
  DEPLOYMENT_REPORT_FILE,
} from "./deploy-report.js";
import { verifyDeployModuleHashes } from "./deploy-module-hash.js";

/** Unknown or duplicate flag / missing value / equals-form / positional. */
export const FUNGI_CLI_DEPLOY_001 = "FUNGI-CLI-DEPLOY-001";
/** Required flag missing (--manifest / --policy / --target / --hash). */
export const FUNGI_CLI_DEPLOY_002 = "FUNGI-CLI-DEPLOY-002";
/** Input file unreadable / not JSON / not a plain object. */
export const FUNGI_CLI_DEPLOY_003 = "FUNGI-CLI-DEPLOY-003";
/** --audit not admitted yet. */
export const FUNGI_CLI_DEPLOY_004 = "FUNGI-CLI-DEPLOY-004";
/** --report directory unusable (missing, not a dir, or report already exists). */
export const FUNGI_CLI_DEPLOY_005 = "FUNGI-CLI-DEPLOY-005";

export const DEPLOY_EXIT_OK = 0;
export const DEPLOY_EXIT_USAGE_OR_POLICY = 2;
export const DEPLOY_EXIT_TARGET = 3;
export const DEPLOY_EXIT_VALIDATION = 4;
export const DEPLOY_EXIT_CAPABILITY = 5;
export const DEPLOY_EXIT_VERIFY = 6;
export const DEPLOY_EXIT_MANIFEST = 7;

const ADMITTED_FLAGS = Object.freeze([
  "--manifest",
  "--policy",
  "--target",
  "--hash",
  "--artefacts",
  "--root",
  "--report",
  "--json",
  "--dry-run",
  "--strict",
  "--audit",
] as const);

export type DeployFlagName = (typeof ADMITTED_FLAGS)[number];

export interface DeployCommandOptions {
  readonly manifestPath: string;
  readonly policyPath: string;
  readonly target: string;
  readonly manifestHash: string;
  readonly artefactsPath?: string;
  readonly root?: string;
  readonly reportDir?: string;
  readonly json: boolean;
  readonly dryRun: boolean;
  readonly strict: boolean;
}

const SHA256 = /^sha256:[0-9a-f]{64}$/;

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

function isAdmittedFlag(name: string): name is DeployFlagName {
  return (ADMITTED_FLAGS as readonly string[]).includes(name);
}

/**
 * Parse deploy argv. Fail-closed: unknown flags, duplicates, missing values,
 * equals-form, positionals, and --audit all refuse. Boolean flags take no value.
 * Value flags accept `--flag <value>` only.
 */
export function parseDeployArgs(args: readonly string[]):
  | { readonly ok: true; readonly options: DeployCommandOptions }
  | { readonly ok: false; readonly result: CliResult } {
  let manifestPath = "";
  let policyPath = "";
  let target = "";
  let manifestHash = "";
  let reportDir = "";
  let artefactsPath = "";
  let root = "";
  let json = false;
  let dryRun = false;
  let strict = false;
  const seen = new Set<string>();

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (typeof a !== "string" || a.length === 0) {
      return {
        ok: false,
        result: refuse(
          FUNGI_CLI_DEPLOY_001,
          DEPLOY_EXIT_USAGE_OR_POLICY,
          "Deploy received an empty argument.",
          "Pass only admitted deploy flags.",
        ),
      };
    }
    if (a.startsWith("--") && a.includes("=")) {
      return {
        ok: false,
        result: refuse(
          FUNGI_CLI_DEPLOY_001,
          DEPLOY_EXIT_USAGE_OR_POLICY,
          "Deploy does not accept --flag=value forms.",
          "Pass --flag <value> with a separate argument.",
        ),
      };
    }
    if (!a.startsWith("--")) {
      return {
        ok: false,
        result: refuse(
          FUNGI_CLI_DEPLOY_001,
          DEPLOY_EXIT_USAGE_OR_POLICY,
          "Deploy does not accept positional arguments.",
          "Pass inputs through --manifest / --policy / --target / --hash / --report.",
        ),
      };
    }
    if (!isAdmittedFlag(a)) {
      return {
        ok: false,
        result: refuse(
          FUNGI_CLI_DEPLOY_001,
          DEPLOY_EXIT_USAGE_OR_POLICY,
          "Deploy received an unknown flag.",
          "Use only --manifest, --policy, --target, --hash, --artefacts, --root, --report, --json, --dry-run, --strict (and note --audit is not admitted yet).",
        ),
      };
    }
    if (seen.has(a)) {
      return {
        ok: false,
        result: refuse(
          FUNGI_CLI_DEPLOY_001,
          DEPLOY_EXIT_USAGE_OR_POLICY,
          "A deploy flag was given more than once.",
          "Pass each flag at most once.",
        ),
      };
    }
    seen.add(a);

    if (a === "--json") {
      json = true;
      continue;
    }
    if (a === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (a === "--strict") {
      strict = true;
      continue;
    }
    if (a === "--audit") {
      return {
        ok: false,
        result: refuse(
          FUNGI_CLI_DEPLOY_004,
          DEPLOY_EXIT_USAGE_OR_POLICY,
          "Deploy --audit is not admitted yet.",
          "Omit --audit until capability / audit-report validation lands for deploy.",
        ),
      };
    }

    const next = args[i + 1];
    if (next === undefined || next.startsWith("-")) {
      return {
        ok: false,
        result: refuse(
          FUNGI_CLI_DEPLOY_001,
          DEPLOY_EXIT_USAGE_OR_POLICY,
          "A deploy flag that needs a value was given without one.",
          "Pass --manifest <file>, --policy <file>, --target <token>, --hash <sha256:...>, --artefacts <file>, --root <dir>, or --report <dir>.",
        ),
      };
    }
    i += 1;
    if (a === "--manifest") manifestPath = next;
    else if (a === "--policy") policyPath = next;
    else if (a === "--target") target = next;
    else if (a === "--hash") manifestHash = next;
    else if (a === "--artefacts") artefactsPath = next;
    else if (a === "--root") root = next;
    else if (a === "--report") reportDir = next;
  }

  if (manifestPath.length === 0) {
    return {
      ok: false,
      result: refuse(
        FUNGI_CLI_DEPLOY_002,
        DEPLOY_EXIT_USAGE_OR_POLICY,
        "Deploy requires --manifest <file>.",
        "Pass --manifest pointing at a JSON object DeployManifestSlice.",
      ),
    };
  }
  if (policyPath.length === 0) {
    return {
      ok: false,
      result: refuse(
        FUNGI_CLI_DEPLOY_002,
        DEPLOY_EXIT_USAGE_OR_POLICY,
        "Deploy requires --policy <file>.",
        "Pass --policy pointing at a JSON object EffectsPolicy.",
      ),
    };
  }
  if (target.length === 0) {
    return {
      ok: false,
      result: refuse(
        FUNGI_CLI_DEPLOY_002,
        DEPLOY_EXIT_USAGE_OR_POLICY,
        "Deploy requires --target <token>.",
        "Pass --target with a closed DeploymentTarget token.",
      ),
    };
  }
  if (manifestHash.length === 0) {
    return {
      ok: false,
      result: refuse(
        FUNGI_CLI_DEPLOY_002,
        DEPLOY_EXIT_USAGE_OR_POLICY,
        "Deploy requires --hash <sha256:...>.",
        "Pass --hash with sha256: followed by 64 lower-case hex digits.",
      ),
    };
  }

  if (root.length > 0 && artefactsPath.length === 0) {
    return {
      ok: false,
      result: refuse(
        FUNGI_CLI_DEPLOY_001,
        DEPLOY_EXIT_USAGE_OR_POLICY,
        "Deploy --root is only meaningful with --artefacts.",
        "Pass --artefacts <file> with --root, or omit --root.",
      ),
    };
  }

  // Live deploy is never admitted; --dry-run is the explicit acknowledgment.
  // --strict is accepted; validation is always fail-closed.
  void dryRun;
  void strict;

  const options: DeployCommandOptions = Object.freeze({
    manifestPath,
    policyPath,
    target,
    manifestHash,
    ...(artefactsPath.length > 0 ? { artefactsPath } : {}),
    ...(root.length > 0 ? { root } : {}),
    ...(reportDir.length > 0 ? { reportDir } : {}),
    json,
    dryRun,
    strict,
  });
  return { ok: true, options };
}

async function readJsonObject(
  filePath: string,
  cwd: string,
): Promise<{ readonly ok: true; readonly value: unknown } | { readonly ok: false; readonly result: CliResult }> {
  const absolute = isAbsolute(filePath) ? filePath : resolve(cwd, filePath);
  let text: string;
  try {
    text = await readFile(absolute, "utf8");
  } catch {
    return {
      ok: false,
      result: refuse(
        FUNGI_CLI_DEPLOY_003,
        DEPLOY_EXIT_USAGE_OR_POLICY,
        "A deploy input file could not be read.",
        "Ensure --manifest / --policy names a readable UTF-8 JSON object.",
      ),
    };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return {
      ok: false,
      result: refuse(
        FUNGI_CLI_DEPLOY_003,
        DEPLOY_EXIT_USAGE_OR_POLICY,
        "A deploy input file was not valid JSON.",
        "Provide a JSON object matching the closed deploy shape.",
      ),
    };
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {
      ok: false,
      result: refuse(
        FUNGI_CLI_DEPLOY_003,
        DEPLOY_EXIT_USAGE_OR_POLICY,
        "A deploy input must be a JSON object.",
        "Provide a single closed-shape object (not an array).",
      ),
    };
  }
  return { ok: true, value: parsed };
}

async function readJsonArray(
  filePath: string,
  cwd: string,
): Promise<{ readonly ok: true; readonly value: unknown } | { readonly ok: false; readonly result: CliResult }> {
  const absolute = isAbsolute(filePath) ? filePath : resolve(cwd, filePath);
  let text: string;
  try {
    text = await readFile(absolute, "utf8");
  } catch {
    return {
      ok: false,
      result: refuse(
        FUNGI_CLI_DEPLOY_003,
        DEPLOY_EXIT_USAGE_OR_POLICY,
        "A deploy input file could not be read.",
        "Ensure --artefacts names a readable UTF-8 JSON array of BuildArtefact records.",
      ),
    };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return {
      ok: false,
      result: refuse(
        FUNGI_CLI_DEPLOY_003,
        DEPLOY_EXIT_USAGE_OR_POLICY,
        "A deploy input file was not valid JSON.",
        "Provide a JSON array of closed-shape BuildArtefact records.",
      ),
    };
  }
  if (!Array.isArray(parsed) || Object.keys(parsed).length !== parsed.length) {
    return {
      ok: false,
      result: refuse(
        FUNGI_CLI_DEPLOY_003,
        DEPLOY_EXIT_USAGE_OR_POLICY,
        "Deploy --artefacts must be a dense JSON array.",
        "Provide a JSON array (not an object) with no holes.",
      ),
    };
  }
  return { ok: true, value: parsed };
}

function mapDiagnosticsExit(diagnostics: readonly DeployDiagnostic[]): number {
  let exit = DEPLOY_EXIT_VALIDATION;
  for (const d of diagnostics) {
    if (d.code === FUNGI_DEPLOY_003) return DEPLOY_EXIT_USAGE_OR_POLICY;
    if (d.code === FUNGI_DEPLOY_004) exit = DEPLOY_EXIT_TARGET;
    else if (d.code === FUNGI_DEPLOY_005 && exit !== DEPLOY_EXIT_TARGET) exit = DEPLOY_EXIT_VERIFY;
    else if (
      (d.code === FUNGI_DEPLOY_001 || d.code === FUNGI_DEPLOY_002) &&
      exit !== DEPLOY_EXIT_TARGET &&
      exit !== DEPLOY_EXIT_VERIFY
    ) {
      exit = DEPLOY_EXIT_VALIDATION;
    }
  }
  return exit;
}

export async function runDeployCommand(context: CliContext): Promise<CliResult> {
  const parsed = parseDeployArgs(context.args);
  if (!parsed.ok) return parsed.result;

  const { options } = parsed;

  // Require --dry-run: live deploy is not admitted in this slice.
  if (options.dryRun !== true) {
    return refuse(
      FUNGI_CLI_DEPLOY_001,
      DEPLOY_EXIT_USAGE_OR_POLICY,
      "Deploy requires --dry-run; live deploy is not admitted.",
      "Pass --dry-run to run closed-shape effects validation only.",
    );
  }

  if (!isDeploymentTarget(options.target)) {
    return refuse(
      FUNGI_CLI_DEPLOY_001,
      DEPLOY_EXIT_USAGE_OR_POLICY,
      "Deploy --target is outside the closed vocabulary.",
      "Pass a closed DeploymentTarget token (node|wasm|native|serverless|edge|gpu|photonic).",
    );
  }
  if (!SHA256.test(options.manifestHash)) {
    return refuse(
      FUNGI_CLI_DEPLOY_001,
      DEPLOY_EXIT_USAGE_OR_POLICY,
      "Deploy --hash must be sha256:<64 lower-case hex>.",
      "Pass --hash with sha256: followed by 64 lower-case hex digits.",
    );
  }

  const manifestLoad = await readJsonObject(options.manifestPath, context.cwd);
  if (!manifestLoad.ok) return manifestLoad.result;
  const policyLoad = await readJsonObject(options.policyPath, context.cwd);
  if (!policyLoad.ok) return policyLoad.result;

  // Module hashes on disk: checked before effects validation and before any report write.
  let moduleCount = -1;
  if (options.artefactsPath !== undefined) {
    const artefactsLoad = await readJsonArray(options.artefactsPath, context.cwd);
    if (!artefactsLoad.ok) return artefactsLoad.result;
    const rootDir = options.root !== undefined
      ? (isAbsolute(options.root) ? options.root : resolve(context.cwd, options.root))
      : context.cwd;
    const modules = await verifyDeployModuleHashes(artefactsLoad.value, rootDir);
    if (!modules.ok) {
      return Object.freeze({
        ok: false as const,
        code: DEPLOY_EXIT_MANIFEST,
        message: "Deploy dry-run refused: module hashes on disk did not verify.",
        details: Object.freeze([
          `Module-hash codes: ${modules.codes.join(", ")}`,
          "Fix: rebuild or restore the listed artefacts so each file matches its declared sha256 under --root.",
        ]),
      });
    }
    moduleCount = modules.checked;
  }

  const target = options.target as DeploymentTarget;
  const diagnostics = validateEffects({
    manifest: manifestLoad.value,
    policy: policyLoad.value,
    target,
  });
  const result = createDeploymentResult(
    target,
    options.manifestHash,
    diagnostics,
    options.reportDir !== undefined ? DEPLOYMENT_REPORT_FILE : undefined,
  );

  if (options.reportDir !== undefined) {
    const reportAbsolute = isAbsolute(options.reportDir)
      ? options.reportDir
      : resolve(context.cwd, options.reportDir);
    try {
      await writeDeploymentReport(result, reportAbsolute);
    } catch {
      return refuse(
        FUNGI_CLI_DEPLOY_005,
        DEPLOY_EXIT_USAGE_OR_POLICY,
        "Could not write deployment-report.json (directory missing, not a directory, or file already exists).",
        `Ensure --report names an existing empty-of-report directory; the file is ${DEPLOYMENT_REPORT_FILE} created exclusively.`,
      );
    }
  }

  const report = createDeploymentReport(result);
  const details: string[] = [];
  if (options.json) {
    // JSON details carry closed report fields (target/hash/codes). Paths are never included.
    details.push(renderDeploymentReport(report).trimEnd());
  } else {
    if (moduleCount >= 0) {
      details.push(`Deploy dry-run: module hashes verified (${moduleCount} artefact(s)).`);
    }
    details.push(
      result.success
        ? "Deploy dry-run: effects validation succeeded."
        : `Deploy dry-run: effects validation failed (${diagnostics.length} diagnostic(s)).`,
    );
  }

  if (!result.success) {
    return Object.freeze({
      ok: false as const,
      code: mapDiagnosticsExit(diagnostics),
      message: "Deploy dry-run failed: effects validation did not succeed.",
      details: Object.freeze(details),
    });
  }

  return Object.freeze({
    ok: true as const,
    code: DEPLOY_EXIT_OK,
    message: "Deploy dry-run succeeded.",
    details: Object.freeze(details),
  });
}
