/**
 * `galerina build` command wiring (zero-trust defaults, owner may revisit).
 *
 * Parses closed BuildWorkspaceInput flags, calls buildWorkspace (never opens the
 * workspace / never runs the 14-pass pipeline), optionally writes build-report.json.
 * Never echoes paths, tokens, or keys in diagnostics / default.
 *
 * Admitted flags: --workspace <rel>, --target <token>, --out <rel>, --strict,
 * --profile <token>, --report <dir>, --json.
 * --audit is recognized but refused (FUNGI-CLI-BUILD-004; audit emit HOLD until
 * pipeline). Exit codes: 0 success (diagnostics empty), 2 usage, 4 validation /
 * pipeline-not-admitted.
 */

import { isAbsolute, resolve } from "node:path";
import type { CliContext, CliError, CliResult } from "../types.js";
import {
  buildWorkspace,
  isBuildRuntimeTarget,
  type BuildDiagnostic,
  type BuildRuntimeTarget,
  type BuildWorkspaceInput,
  FUNGI_BUILD_005,
} from "./build-contracts.js";
import {
  createBuildReport,
  renderBuildReport,
  writeBuildReport,
  BUILD_REPORT_FILE,
} from "./build-reporter.js";

/** Unknown or duplicate flag / missing value / equals-form / positional. */
export const FUNGI_CLI_BUILD_001 = "FUNGI-CLI-BUILD-001";
/** Required --workspace / --target / --out missing. */
export const FUNGI_CLI_BUILD_002 = "FUNGI-CLI-BUILD-002";
/** Reserved (input IO path); kept for stable numbering with sibling CLIs. */
export const FUNGI_CLI_BUILD_003 = "FUNGI-CLI-BUILD-003";
/** --audit not admitted yet (audit-report emit HOLD until pipeline). */
export const FUNGI_CLI_BUILD_004 = "FUNGI-CLI-BUILD-004";
/** --report directory unusable (missing, not a dir, or report already exists). */
export const FUNGI_CLI_BUILD_005 = "FUNGI-CLI-BUILD-005";

export const BUILD_EXIT_OK = 0;
export const BUILD_EXIT_USAGE = 2;
export const BUILD_EXIT_VALIDATION = 4;

const ADMITTED_FLAGS = Object.freeze([
  "--workspace",
  "--target",
  "--out",
  "--strict",
  "--profile",
  "--report",
  "--json",
  "--audit",
] as const);

export type BuildFlagName = (typeof ADMITTED_FLAGS)[number];

export interface BuildCommandOptions {
  readonly workspace: string;
  readonly target: BuildRuntimeTarget;
  readonly outDir: string;
  readonly strict: boolean;
  readonly profile?: string;
  readonly reportDir?: string;
  readonly json: boolean;
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

function isAdmittedFlag(name: string): name is BuildFlagName {
  return (ADMITTED_FLAGS as readonly string[]).includes(name);
}

/**
 * Parse build argv. Fail-closed: unknown flags, duplicates, missing values,
 * equals-form, positionals, and --audit all refuse.
 */
export function parseBuildArgs(args: readonly string[]):
  | { readonly ok: true; readonly options: BuildCommandOptions }
  | { readonly ok: false; readonly result: CliResult } {
  let workspace = "";
  let target: BuildRuntimeTarget | null = null;
  let outDir = "";
  let strict = true;
  let profile = "";
  let reportDir = "";
  let json = false;
  const seen = new Set<string>();

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (typeof a !== "string" || a.length === 0) {
      return {
        ok: false,
        result: refuse(
          FUNGI_CLI_BUILD_001,
          BUILD_EXIT_USAGE,
          "Build received an empty argument.",
          "Pass only admitted build flags.",
        ),
      };
    }
    if (a.startsWith("--") && a.includes("=")) {
      return {
        ok: false,
        result: refuse(
          FUNGI_CLI_BUILD_001,
          BUILD_EXIT_USAGE,
          "Build does not accept --flag=value forms.",
          "Pass --flag <value> with a separate argument.",
        ),
      };
    }
    if (!a.startsWith("--")) {
      return {
        ok: false,
        result: refuse(
          FUNGI_CLI_BUILD_001,
          BUILD_EXIT_USAGE,
          "Build does not accept positional arguments.",
          "Pass inputs through --workspace / --target / --out / --profile / --report.",
        ),
      };
    }
    if (!isAdmittedFlag(a)) {
      return {
        ok: false,
        result: refuse(
          FUNGI_CLI_BUILD_001,
          BUILD_EXIT_USAGE,
          "Build received an unknown flag.",
          "Use only --workspace, --target, --out, --strict, --profile, --report, --json (and note --audit is not admitted yet).",
        ),
      };
    }
    if (seen.has(a)) {
      return {
        ok: false,
        result: refuse(
          FUNGI_CLI_BUILD_001,
          BUILD_EXIT_USAGE,
          "A build flag was given more than once.",
          "Pass each flag at most once.",
        ),
      };
    }
    seen.add(a);

    if (a === "--json") {
      json = true;
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
          FUNGI_CLI_BUILD_004,
          BUILD_EXIT_USAGE,
          "Build flag is not admitted yet.",
          "Omit --audit until the 14-pass pipeline emits audit-report.json.",
        ),
      };
    }

    const next = args[i + 1];
    if (next === undefined || next.startsWith("-")) {
      return {
        ok: false,
        result: refuse(
          FUNGI_CLI_BUILD_001,
          BUILD_EXIT_USAGE,
          "Build flag is missing its value.",
          "Pass --flag <value> with a non-flag value argument.",
        ),
      };
    }
    i += 1;

    if (a === "--workspace") {
      workspace = next;
      continue;
    }
    if (a === "--out") {
      outDir = next;
      continue;
    }
    if (a === "--report") {
      reportDir = next;
      continue;
    }
    if (a === "--profile") {
      profile = next;
      continue;
    }
    if (a === "--target") {
      if (!isBuildRuntimeTarget(next)) {
        return {
          ok: false,
          result: refuse(
            FUNGI_CLI_BUILD_001,
            BUILD_EXIT_USAGE,
            "Build target is outside the closed vocabulary.",
            "Pass --target with an admitted BuildRuntimeTarget token.",
          ),
        };
      }
      target = next;
      continue;
    }
  }

  if (workspace.length === 0 || target === null || outDir.length === 0) {
    return {
      ok: false,
      result: refuse(
        FUNGI_CLI_BUILD_002,
        BUILD_EXIT_USAGE,
        "Build requires workspace, target, and out inputs.",
        "Pass --workspace <rel> --target <token> --out <rel> (relative path tokens only).",
      ),
    };
  }

  return {
    ok: true,
    options: Object.freeze({
      workspace,
      target,
      outDir,
      strict,
      ...(profile.length > 0 ? { profile } : {}),
      ...(reportDir.length > 0 ? { reportDir } : {}),
      json,
    }),
  };
}

function toWorkspaceInput(options: BuildCommandOptions): BuildWorkspaceInput {
  return options.profile === undefined
    ? Object.freeze({
        workspace: options.workspace,
        target: options.target,
        strict: options.strict,
        outDir: options.outDir,
      })
    : Object.freeze({
        workspace: options.workspace,
        target: options.target,
        strict: options.strict,
        profile: options.profile,
        outDir: options.outDir,
      });
}

function mapDiagnosticsExit(diagnostics: readonly BuildDiagnostic[]): number {
  for (const d of diagnostics) {
    if (d.code === FUNGI_BUILD_005) return BUILD_EXIT_VALIDATION;
  }
  return BUILD_EXIT_VALIDATION;
}

export async function runBuildCommand(context: CliContext): Promise<CliResult> {
  const parsed = parseBuildArgs(context.args);
  if (!parsed.ok) return parsed.result;
  const options = parsed.options;

  const result = await buildWorkspace(toWorkspaceInput(options));
  const diagnostics = result.diagnostics;

  let reportJson: string | undefined;
  if (options.reportDir !== undefined) {
    const absolute = isAbsolute(options.reportDir) ? options.reportDir : resolve(context.cwd, options.reportDir);
    try {
      const written = await writeBuildReport(result, absolute);
      reportJson = renderBuildReport(written.report);
    } catch {
      return refuse(
        FUNGI_CLI_BUILD_005,
        BUILD_EXIT_USAGE,
        "Build could not write build-report.json.",
        "Pass --report naming an existing empty-of-report directory (exclusive create; no overwrite).",
      );
    }
  } else if (options.json === true) {
    reportJson = renderBuildReport(createBuildReport(result));
  }

  if (diagnostics.length > 0 || result.success !== true) {
    const details: string[] = [];
    if (reportJson !== undefined) details.push(reportJson);
    else {
      details.push("Build refused.");
      details.push(`Use --report <dir> to emit ${BUILD_REPORT_FILE}.`);
    }
    return Object.freeze({
      ok: false as const,
      code: mapDiagnosticsExit(diagnostics),
      message: "Build refused.",
      details: Object.freeze(details),
      error: Object.freeze({
        code: diagnostics[0]?.code ?? FUNGI_BUILD_005,
        safeMessage: "Build closed-shape validation refused or pipeline is not admitted.",
        suggestedFix: "Pass closed relative --workspace/--out tokens; pipeline emit lands in a later tip.",
      }),
    });
  }

  const details: string[] = [];
  if (reportJson !== undefined) details.push(reportJson);
  else {
    details.push("Build completed.");
    details.push(`Use --report <dir> to emit ${BUILD_REPORT_FILE}.`);
  }
  return Object.freeze({
    ok: true as const,
    code: BUILD_EXIT_OK,
    message: "Build completed.",
    details: Object.freeze(details),
  });
}
