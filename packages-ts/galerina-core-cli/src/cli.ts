import { findCommand } from "./commands.js";
import type { CliContext, CliEnvironment, CliError, CliResult } from "./types.js";

const VALID_ENVIRONMENTS = new Set<CliEnvironment>([
  "development",
  "test",
  "staging",
  "production"
]);

const DEFAULT_ENVIRONMENT: CliEnvironment = "development";
const VALID_ENVIRONMENT_LIST = [...VALID_ENVIRONMENTS].join(", ");
const VALID_ENVIRONMENT_CHOICES = [...VALID_ENVIRONMENTS].join("|");

// 2026-10-02 diag-constants (Phillip 16:35 BST order): each FUNGI-CLI-ENV-* code is ONE exported constant
// { code, name, severity, message, suggestedFix } in FUNGI_CLI_ENV_DIAGNOSTICS, and every emit references it.
// IDs and emitted text are unchanged; the names are new (the KB has no CLI-ENV rows yet - proposed for the KB).
export interface CliDiagnosticDefinition {
  readonly code: `FUNGI-CLI-${string}`;
  readonly name: string;
  readonly severity: "error";
  readonly message: string;
  readonly suggestedFix: string;
}

const ENVIRONMENT_FIX = `Pass --env <${VALID_ENVIRONMENT_CHOICES}>, or omit --env to use ${DEFAULT_ENVIRONMENT}.`;

/** --env was given a value outside the closed environment vocabulary (e.g. a typo). */
export const FUNGI_CLI_ENV_001 = {
  code: "FUNGI-CLI-ENV-001",
  name: "ENVIRONMENT_UNKNOWN",
  severity: "error",
  message: `--env value is not a known environment (expected one of: ${VALID_ENVIRONMENT_LIST}).`,
  suggestedFix: ENVIRONMENT_FIX,
} as const satisfies CliDiagnosticDefinition;
/** --env was given without a value. */
export const FUNGI_CLI_ENV_002 = {
  code: "FUNGI-CLI-ENV-002",
  name: "ENVIRONMENT_VALUE_MISSING",
  severity: "error",
  message: "--env was given without a value.",
  suggestedFix: ENVIRONMENT_FIX,
} as const satisfies CliDiagnosticDefinition;
/** --env was given more than once. */
export const FUNGI_CLI_ENV_003 = {
  code: "FUNGI-CLI-ENV-003",
  name: "ENVIRONMENT_REPEATED",
  severity: "error",
  message: "--env was given more than once; the environment is ambiguous.",
  suggestedFix: ENVIRONMENT_FIX,
} as const satisfies CliDiagnosticDefinition;

export const FUNGI_CLI_ENV_DIAGNOSTICS = Object.freeze([
  FUNGI_CLI_ENV_001,
  FUNGI_CLI_ENV_002,
  FUNGI_CLI_ENV_003,
] as const);

export type EnvironmentResolution =
  | { readonly ok: true; readonly env: CliEnvironment }
  | { readonly ok: false; readonly error: CliError };

function createEnvironmentDiagnostic(diag: CliDiagnosticDefinition): EnvironmentResolution {
  return Object.freeze({
    ok: false as const,
    error: Object.freeze({
      code: diag.code,
      safeMessage: diag.message,
      suggestedFix: diag.suggestedFix
    })
  });
}

/**
 * Resolve the CLI environment. Fail-closed: the default applies only when --env
 * is absent. An unknown, missing or repeated --env value is refused rather than
 * silently falling back to development (so `--env prodution` cannot run as
 * development). Accepts `--env <value>` and `--env=<value>`.
 */
export function parseEnvironment(args: readonly string[]): EnvironmentResolution {
  const values: (string | undefined)[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--env") {
      const next = args[index + 1];
      values.push(next === undefined || next.startsWith("-") ? undefined : next);
      if (next !== undefined && !next.startsWith("-")) index += 1;
    } else if (arg !== undefined && arg.startsWith("--env=")) {
      const inline = arg.slice("--env=".length);
      values.push(inline.length === 0 ? undefined : inline);
    }
  }

  if (values.length === 0) {
    return Object.freeze({ ok: true as const, env: DEFAULT_ENVIRONMENT });
  }
  if (values.length > 1) {
    return createEnvironmentDiagnostic(FUNGI_CLI_ENV_003);
  }

  const value = values[0];
  if (value === undefined) {
    return createEnvironmentDiagnostic(FUNGI_CLI_ENV_002);
  }
  if (!VALID_ENVIRONMENTS.has(value as CliEnvironment)) {
    return createEnvironmentDiagnostic(FUNGI_CLI_ENV_001);
  }
  return Object.freeze({ ok: true as const, env: value as CliEnvironment });
}

export async function runCli(args: readonly string[], cwd: string): Promise<CliResult> {
  const commandName = args[0];

  if (commandName === undefined || commandName === "help" || commandName === "--help") {
    return {
      ok: true,
      code: 0,
      message:
        "Usage: Galerina <check|build|run|serve|reports|security:check|routes|benchmark|task|graph> [options]"
    };
  }

  const command = findCommand(commandName);

  if (command === undefined) {
    return {
      ok: false,
      code: 1,
      message: `Unknown Galerina command: ${commandName}`
    };
  }

  const environment = parseEnvironment(args);
  if (!environment.ok) {
    return {
      ok: false,
      code: 1,
      message: `${environment.error.code}: ${environment.error.safeMessage}`,
      details: [`Fix: ${environment.error.suggestedFix}`],
      error: environment.error
    };
  }

  const context: CliContext = {
    cwd,
    env: environment.env,
    args: args.slice(1)
  };

  return command.run(context);
}
