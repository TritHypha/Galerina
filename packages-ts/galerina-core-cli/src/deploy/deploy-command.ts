/**
 * `galerina deploy` command wiring (zero-trust defaults, owner may revisit).
 *
 * Dry-run: loads closed-shape manifest slice + effects policy JSON objects,
 * optionally checks module hashes on disk (--artefacts), runs validateEffects,
 * optionally writes deployment-report.json.
 *
 * Live (no --dry-run; owner 2026-10-06 10:15 BST): requires --artefacts,
 * --runtime, --audit, and --report. Module-hash is the mandatory pre-deploy
 * gate. Writes a local exclusive-create deployment-report.json with dryRun:false.
 * Never copies artefacts, never attaches to a host/process, never opens a
 * network. Never echoes paths, effect names, targets, hashes, or file contents
 * in diagnostics / default details.
 *
 * Admitted flags: --manifest <file>, --policy <file>, --target <token>,
 * --hash <sha256:...>, --artefacts <file>, --root <dir>, --runtime <file>,
 * --audit <capability-report.json>, --report <dir>, --json, --dry-run, --strict.
 * FUNGI-CLI-DEPLOY-004 is reserved (previously --audit not admitted).
 * Exit codes: 0 success, 2 usage or policy denial, 3 target incompatibility,
 * 4 validation failure, 5 capability failure, 6 verified-gate failure,
 * 7 module-hash failure (FUNGI-VERIFY-001..005 from --artefacts).
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
  FUNGI_DEPLOY_006,
  FUNGI_DEPLOY_007,
  FUNGI_DEPLOY_008,
  FUNGI_DEPLOY_009,
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
import { readDeployPolicy } from "./deploy-policy.js";
import { checkDeployRuntimeConsistency, readDeployRuntimeProfile } from "./deploy-runtime.js";
import { verifyCapabilityReport } from "../verify/verify-runtime.js";

/** Unknown or duplicate flag / missing value / equals-form / positional. */
export const FUNGI_CLI_DEPLOY_001 = "FUNGI-CLI-DEPLOY-001";
/** Required flag missing (--manifest / --policy / --target / --hash). */
export const FUNGI_CLI_DEPLOY_002 = "FUNGI-CLI-DEPLOY-002";
/** Input file unreadable / not JSON / not a plain object. */
export const FUNGI_CLI_DEPLOY_003 = "FUNGI-CLI-DEPLOY-003";
/** Reserved (previously --audit not admitted); kept for stable code space. */
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
  "--runtime",
  "--audit",
  "--report",
  "--json",
  "--dry-run",
  "--strict",
] as const);

export type DeployFlagName = (typeof ADMITTED_FLAGS)[number];

export interface DeployCommandOptions {
  readonly manifestPath: string;
  readonly policyPath: string;
  readonly target: string;
  readonly manifestHash: string;
  readonly artefactsPath?: string;
  readonly root?: string;
  readonly runtimePath?: string;
  readonly auditPath?: string;
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
 * equals-form, and positionals refuse. Boolean flags take no value.
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
  let runtimePath = "";
  let auditPath = "";
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
          "Pass inputs through --manifest / --policy / --target / --hash / --artefacts / --runtime / --audit / --report.",
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
          "Use only --manifest, --policy, --target, --hash, --artefacts, --root, --runtime, --audit, --report, --json, --dry-run, --strict.",
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

    const next = args[i + 1];
    if (next === undefined || next.startsWith("-")) {
      return {
        ok: false,
        result: refuse(
          FUNGI_CLI_DEPLOY_001,
          DEPLOY_EXIT_USAGE_OR_POLICY,
          "A deploy flag that needs a value was given without one.",
          "Pass --manifest <file>, --policy <file>, --target <token>, --hash <sha256:...>, --artefacts <file>, --root <dir>, --runtime <file>, --audit <file>, or --report <dir>.",
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
    else if (a === "--runtime") runtimePath = next;
    else if (a === "--audit") auditPath = next;
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

  // --strict is accepted; validation is always fail-closed.
  void strict;

  const options: DeployCommandOptions = Object.freeze({
    manifestPath,
    policyPath,
    target,
    manifestHash,
    ...(artefactsPath.length > 0 ? { artefactsPath } : {}),
    ...(root.length > 0 ? { root } : {}),
    ...(runtimePath.length > 0 ? { runtimePath } : {}),
    ...(auditPath.length > 0 ? { auditPath } : {}),
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
    if (d.code === FUNGI_DEPLOY_009) return DEPLOY_EXIT_CAPABILITY;
    if (d.code === FUNGI_DEPLOY_008 || d.code === FUNGI_DEPLOY_004) exit = DEPLOY_EXIT_TARGET;
    else if (d.code === FUNGI_DEPLOY_005 && exit !== DEPLOY_EXIT_TARGET) exit = DEPLOY_EXIT_VERIFY;
    else if (
      (d.code === FUNGI_DEPLOY_001 ||
        d.code === FUNGI_DEPLOY_002 ||
        d.code === FUNGI_DEPLOY_006 ||
        d.code === FUNGI_DEPLOY_007) &&
      exit !== DEPLOY_EXIT_TARGET &&
      exit !== DEPLOY_EXIT_VERIFY
    ) {
      exit = DEPLOY_EXIT_VALIDATION;
    }
  }
  return exit;
}

function capabilityNamesAndDenied(
  record: unknown,
): { readonly names: readonly string[]; readonly denied: readonly string[] } | undefined {
  try {
    if (record === null || typeof record !== "object" || Array.isArray(record)) return undefined;
    const deniedDesc = Object.getOwnPropertyDescriptor(record, "deniedCapabilities");
    const capsDesc = Object.getOwnPropertyDescriptor(record, "capabilities");
    if (deniedDesc === undefined || !("value" in deniedDesc) || deniedDesc.get !== undefined) return undefined;
    if (capsDesc === undefined || !("value" in capsDesc) || capsDesc.get !== undefined) return undefined;
    const deniedRaw = deniedDesc.value;
    const capsRaw = capsDesc.value;
    if (!Array.isArray(deniedRaw) || !Array.isArray(capsRaw)) return undefined;
    const denied: string[] = [];
    for (const item of deniedRaw) {
      if (typeof item !== "string") return undefined;
      denied.push(item);
    }
    const names: string[] = [];
    for (const row of capsRaw) {
      if (row === null || typeof row !== "object") return undefined;
      const capDesc = Object.getOwnPropertyDescriptor(row, "capability");
      if (capDesc === undefined || !("value" in capDesc) || typeof capDesc.value !== "string") return undefined;
      names.push(capDesc.value);
    }
    return { names: Object.freeze(names), denied: Object.freeze(denied) };
  } catch {
    return undefined;
  }
}

export async function runDeployCommand(context: CliContext): Promise<CliResult> {
  const parsed = parseDeployArgs(context.args);
  if (!parsed.ok) return parsed.result;

  const { options } = parsed;
  const live = options.dryRun !== true;
  const label = live ? "Deploy" : "Deploy dry-run";

  if (live) {
    if (options.artefactsPath === undefined) {
      return refuse(
        FUNGI_CLI_DEPLOY_002,
        DEPLOY_EXIT_USAGE_OR_POLICY,
        "Live deploy requires --artefacts <file>.",
        "Pass --artefacts with a JSON array of BuildArtefact records; the module-hash gate is mandatory.",
      );
    }
    if (options.runtimePath === undefined) {
      return refuse(
        FUNGI_CLI_DEPLOY_002,
        DEPLOY_EXIT_USAGE_OR_POLICY,
        "Live deploy requires --runtime <file>.",
        "Pass --runtime pointing at a galerina.deploy-runtime/v1 JSON object.",
      );
    }
    if (options.auditPath === undefined) {
      return refuse(
        FUNGI_CLI_DEPLOY_002,
        DEPLOY_EXIT_USAGE_OR_POLICY,
        "Live deploy requires --audit <file>.",
        "Pass --audit pointing at a galerina.report.capability.v1 JSON object.",
      );
    }
    if (options.reportDir === undefined) {
      return refuse(
        FUNGI_CLI_DEPLOY_002,
        DEPLOY_EXIT_USAGE_OR_POLICY,
        "Live deploy requires --report <dir>.",
        "Pass --report naming an existing directory for exclusive-create deployment-report.json.",
      );
    }
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
  const policyRead = readDeployPolicy(policyLoad.value);
  if (!policyRead.ok) {
    return Object.freeze({
      ok: false as const,
      code: mapDiagnosticsExit(policyRead.diagnostics),
      message: `${label} failed: deployment policy did not validate.`,
      details: Object.freeze(policyRead.diagnostics.map((d) => d.code)),
    });
  }

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
        message: `${label} refused: module hashes on disk did not verify.`,
        details: Object.freeze([
          `Module-hash codes: ${modules.codes.join(", ")}`,
          "Fix: rebuild or restore the listed artefacts so each file matches its declared sha256 under --root.",
        ]),
      });
    }
    moduleCount = modules.checked;
  }

  const target = options.target as DeploymentTarget;
  const extra: DeployDiagnostic[] = [];

  let runtimeCapabilities: readonly string[] = Object.freeze([]);
  if (options.runtimePath !== undefined) {
    const runtimeLoad = await readJsonObject(options.runtimePath, context.cwd);
    if (!runtimeLoad.ok) return runtimeLoad.result;
    const runtimeRead = readDeployRuntimeProfile(runtimeLoad.value);
    if (!runtimeRead.ok) {
      extra.push(...runtimeRead.diagnostics);
    } else {
      extra.push(
        ...checkDeployRuntimeConsistency(runtimeRead.value, target, policyRead.value.policy.allowedEffects),
      );
      runtimeCapabilities = runtimeRead.value.capabilities;
    }
  }

  if (options.auditPath !== undefined) {
    const auditLoad = await readJsonObject(options.auditPath, context.cwd);
    if (!auditLoad.ok) return auditLoad.result;
    const cap = verifyCapabilityReport(auditLoad.value);
    if (!cap.success) {
      return Object.freeze({
        ok: false as const,
        code: DEPLOY_EXIT_CAPABILITY,
        message: `${label} refused: capability report did not verify.`,
        details: Object.freeze(cap.diagnostics.map((d) => d.code)),
      });
    }
    const view = capabilityNamesAndDenied(auditLoad.value);
    if (view === undefined) {
      extra.push(
        Object.freeze({
          code: FUNGI_DEPLOY_009,
          severity: "error" as const,
          message: "Capability report view could not be read after verification.",
          field: "audit" as const,
        }),
      );
    } else {
      if (view.denied.length > 0) {
        extra.push(
          Object.freeze({
            code: FUNGI_DEPLOY_009,
            severity: "error" as const,
            message: "Capability report lists denied capabilities; deploy refuses.",
            field: "audit" as const,
          }),
        );
      }
      const present = new Set(view.names);
      for (const name of runtimeCapabilities) {
        if (!present.has(name)) {
          extra.push(
            Object.freeze({
              code: FUNGI_DEPLOY_009,
              severity: "error" as const,
              message: "A runtime capability is missing from the capability report.",
              field: "capabilities" as const,
            }),
          );
          break;
        }
      }
      for (const name of policyRead.value.capabilities) {
        if (!present.has(name)) {
          extra.push(
            Object.freeze({
              code: FUNGI_DEPLOY_009,
              severity: "error" as const,
              message: "A policy capability is missing from the capability report.",
              field: "capabilities" as const,
            }),
          );
          break;
        }
      }
    }
  }

  const diagnostics = [
    ...extra,
    ...validateEffects({
      manifest: manifestLoad.value,
      policy: policyRead.value.policy,
      target,
    }),
  ];
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
      await writeDeploymentReport(result, reportAbsolute, { dryRun: !live });
    } catch {
      return refuse(
        FUNGI_CLI_DEPLOY_005,
        DEPLOY_EXIT_USAGE_OR_POLICY,
        "Could not write deployment-report.json (directory missing, not a directory, or file already exists).",
        `Ensure --report names an existing empty-of-report directory; the file is ${DEPLOYMENT_REPORT_FILE} created exclusively.`,
      );
    }
  }

  const report = createDeploymentReport(result, { dryRun: !live });
  const details: string[] = [];
  if (options.json) {
    details.push(renderDeploymentReport(report).trimEnd());
  } else {
    if (moduleCount >= 0) {
      details.push(`${label}: module hashes verified (${moduleCount} artefact(s)).`);
    }
    details.push(
      result.success
        ? `${label}: effects validation succeeded.`
        : `${label}: effects validation failed (${diagnostics.length} diagnostic(s)).`,
    );
  }

  if (!result.success) {
    return Object.freeze({
      ok: false as const,
      code: mapDiagnosticsExit(diagnostics),
      message: `${label} failed: effects validation did not succeed.`,
      details: Object.freeze(details),
    });
  }

  return Object.freeze({
    ok: true as const,
    code: DEPLOY_EXIT_OK,
    message: `${label} succeeded.`,
    details: Object.freeze(details),
  });
}
