/**
 * `galerina promote` command wiring (zero-trust defaults, owner may revisit).
 *
 * Parses closed from/to environments + artefact hash/target flags, calls
 * createPromotePlan (never live wrap/sign/push/deploy). Never echoes paths,
 * hashes, environments, or keys in diagnostics / default.
 *
 * Admitted flags: --from <env>, --to <env>, --hash <sha256>, --target <tok>,
 * --json, --strict.
 * --live / --apply / --sign / --push / --deploy refuse FUNGI-CLI-PROMOTE-004.
 * Exit codes: 0 success, 2 usage, 4 validation.
 */

import type { CliContext, CliError, CliResult } from "../types.js";
import {
  PROMOTE_REQUEST_SCHEMA,
  createPromotePlan,
  isPromoteEnvironment,
  isPromoteTarget,
  type PromoteResult,
} from "./promote-contracts.js";

/** Unknown or duplicate flag / missing value / equals-form / positional. */
export const FUNGI_CLI_PROMOTE_001 = "FUNGI-CLI-PROMOTE-001";
/** Required --from / --to / --hash / --target missing. */
export const FUNGI_CLI_PROMOTE_002 = "FUNGI-CLI-PROMOTE-002";
/** Closed-shape promote plan refused. */
export const FUNGI_CLI_PROMOTE_003 = "FUNGI-CLI-PROMOTE-003";
/** Live promote / apply / sign / push / deploy flag not admitted. */
export const FUNGI_CLI_PROMOTE_004 = "FUNGI-CLI-PROMOTE-004";

export const PROMOTE_EXIT_OK = 0;
export const PROMOTE_EXIT_USAGE = 2;
export const PROMOTE_EXIT_VALIDATION = 4;

const ADMITTED_FLAGS = Object.freeze([
  "--from",
  "--to",
  "--hash",
  "--target",
  "--json",
  "--strict",
  "--live",
  "--apply",
  "--sign",
  "--push",
  "--deploy",
] as const);

const LIVE_FLAGS = new Set(["--live", "--apply", "--sign", "--push", "--deploy"]);

export type PromoteFlagName = (typeof ADMITTED_FLAGS)[number];

export interface PromoteCommandOptions {
  readonly fromEnvironment: string;
  readonly toEnvironment: string;
  readonly buildHash: string;
  readonly target: string;
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

function isAdmittedFlag(name: string): name is PromoteFlagName {
  return (ADMITTED_FLAGS as readonly string[]).includes(name);
}

/**
 * Parse promote argv. Fail-closed: unknown flags, duplicates, missing values,
 * equals-form, positionals, and live-promote flags all refuse.
 */
export function parsePromoteArgs(args: readonly string[]):
  | { readonly ok: true; readonly options: PromoteCommandOptions }
  | { readonly ok: false; readonly result: CliResult } {
  let fromEnvironment = "";
  let toEnvironment = "";
  let buildHash = "";
  let target = "";
  let json = false;
  let strict = false;
  const seen = new Set<string>();

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (typeof a !== "string" || a.length === 0) {
      return {
        ok: false,
        result: refuse(
          FUNGI_CLI_PROMOTE_001,
          PROMOTE_EXIT_USAGE,
          "Promote received an empty argument.",
          "Pass only admitted promote flags.",
        ),
      };
    }
    if (a.startsWith("--") && a.includes("=")) {
      return {
        ok: false,
        result: refuse(
          FUNGI_CLI_PROMOTE_001,
          PROMOTE_EXIT_USAGE,
          "Promote does not accept --flag=value forms.",
          "Pass --flag <value> with a separate argument.",
        ),
      };
    }
    if (!a.startsWith("--")) {
      return {
        ok: false,
        result: refuse(
          FUNGI_CLI_PROMOTE_001,
          PROMOTE_EXIT_USAGE,
          "Promote does not accept positional arguments.",
          "Pass environments through --from / --to and artefact through --hash / --target.",
        ),
      };
    }
    if (!isAdmittedFlag(a)) {
      return {
        ok: false,
        result: refuse(
          FUNGI_CLI_PROMOTE_001,
          PROMOTE_EXIT_USAGE,
          "Promote received an unknown flag.",
          "Use only --from, --to, --hash, --target, --json, --strict.",
        ),
      };
    }
    if (seen.has(a)) {
      return {
        ok: false,
        result: refuse(
          FUNGI_CLI_PROMOTE_001,
          PROMOTE_EXIT_USAGE,
          "A promote flag was given more than once.",
          "Pass each flag at most once.",
        ),
      };
    }
    seen.add(a);

    if (LIVE_FLAGS.has(a)) {
      return {
        ok: false,
        result: refuse(
          FUNGI_CLI_PROMOTE_004,
          PROMOTE_EXIT_USAGE,
          "Live promote or apply flags are not admitted.",
          "Pass a closed promote plan via --from/--to/--hash/--target instead of live apply.",
        ),
      };
    }
    if (a === "--json") {
      json = true;
      continue;
    }
    if (a === "--strict") {
      strict = true;
      continue;
    }

    const next = args[i + 1];
    if (typeof next !== "string" || next.length === 0 || next.startsWith("--")) {
      return {
        ok: false,
        result: refuse(
          FUNGI_CLI_PROMOTE_001,
          PROMOTE_EXIT_USAGE,
          "A promote flag is missing its value.",
          "Pass --from/--to/--hash/--target with a following value.",
        ),
      };
    }
    i += 1;
    if (a === "--from") fromEnvironment = next;
    else if (a === "--to") toEnvironment = next;
    else if (a === "--hash") buildHash = next;
    else if (a === "--target") target = next;
  }

  if (!fromEnvironment || !toEnvironment || !buildHash || !target) {
    return {
      ok: false,
      result: refuse(
        FUNGI_CLI_PROMOTE_002,
        PROMOTE_EXIT_USAGE,
        "Promote requires --from, --to, --hash and --target.",
        "Pass all four required flags with closed vocabulary values.",
      ),
    };
  }
  // Domain checks happen inside createPromotePlan; keep parse free of echoing.
  void isPromoteEnvironment;
  void isPromoteTarget;
  void strict;

  return {
    ok: true,
    options: Object.freeze({
      fromEnvironment,
      toEnvironment,
      buildHash,
      target,
      json,
      strict,
    }),
  };
}

function renderPlan(result: PromoteResult, json: boolean): string {
  if (json) {
    return JSON.stringify({
      success: result.success,
      admitted: result.admitted,
      fromEnvironment: result.fromEnvironment,
      toEnvironment: result.toEnvironment,
      buildHash: result.buildHash,
      target: result.target,
      diagnosticCount: result.diagnostics.length,
      diagnosticCodes: result.diagnostics.map((d) => d.code),
    });
  }
  if (result.success) {
    return "Promote plan admitted (plan-only; no live apply).";
  }
  const codes = result.diagnostics.map((d) => d.code).join(", ");
  return `Promote plan refused (${codes || "FUNGI-PROMOTE-001"}).`;
}

/** Run `galerina promote` against closed flag inputs. Never live-applies. */
export async function runPromoteCommand(context: CliContext): Promise<CliResult> {
  const parsed = parsePromoteArgs(context.args);
  if (!parsed.ok) return parsed.result;

  const plan = createPromotePlan({
    schema: PROMOTE_REQUEST_SCHEMA,
    fromEnvironment: parsed.options.fromEnvironment,
    toEnvironment: parsed.options.toEnvironment,
    buildHash: parsed.options.buildHash,
    target: parsed.options.target,
  });

  if (!plan.success) {
    return refuse(
      FUNGI_CLI_PROMOTE_003,
      PROMOTE_EXIT_VALIDATION,
      "Promote plan was refused by the closed-shape contract.",
      "Pass distinct closed environments, a sha256 build hash, and a closed target.",
    );
  }

  return Object.freeze({
    ok: true as const,
    code: PROMOTE_EXIT_OK,
    message: renderPlan(plan, parsed.options.json),
  });
}
