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

/** --env was given a value outside the closed environment vocabulary (e.g. a typo). */
export const FUNGI_CLI_ENV_001 = "FUNGI-CLI-ENV-001";
/** --env was given without a value. */
export const FUNGI_CLI_ENV_002 = "FUNGI-CLI-ENV-002";
/** --env was given more than once. */
export const FUNGI_CLI_ENV_003 = "FUNGI-CLI-ENV-003";

/** The command name is not a known Galerina command (the raw name is never echoed). */
export const FUNGI_CLI_001 = "FUNGI-CLI-001";
/** A command threw instead of returning a result; the thrown detail is never echoed. */
export const FUNGI_CLI_002 = "FUNGI-CLI-002";
/** A command reported failure without its own structured error. */
export const FUNGI_CLI_003 = "FUNGI-CLI-003";

function cliFailure(code: string, exitCode: number, safeMessage: string, suggestedFix: string, details: readonly string[] = []): CliResult {
  const error: CliError = Object.freeze({ code, safeMessage, suggestedFix });
  return Object.freeze({ ok: false, code: exitCode, message: `${code}: ${safeMessage}`, details: Object.freeze([...details, `Fix: ${suggestedFix}`]), error });
}

export type EnvironmentResolution =
  | { readonly ok: true; readonly env: CliEnvironment }
  | { readonly ok: false; readonly error: CliError };

function environmentError(code: string, safeMessage: string): EnvironmentResolution {
  return Object.freeze({
    ok: false as const,
    error: Object.freeze({
      code,
      safeMessage,
      suggestedFix: `Pass --env <${VALID_ENVIRONMENT_CHOICES}>, or omit --env to use ${DEFAULT_ENVIRONMENT}.`
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
    return environmentError(FUNGI_CLI_ENV_003, "--env was given more than once; the environment is ambiguous.");
  }

  const value = values[0];
  if (value === undefined) {
    return environmentError(FUNGI_CLI_ENV_002, "--env was given without a value.");
  }
  if (!VALID_ENVIRONMENTS.has(value as CliEnvironment)) {
    return environmentError(
      FUNGI_CLI_ENV_001,
      `--env value is not a known environment (expected one of: ${VALID_ENVIRONMENT_LIST}).`
    );
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
        "Usage: Galerina <check|build|run|serve|reports|security:check|routes|benchmark|task|graph|verify|deploy|init> [options]"
    };
  }

  const command = findCommand(commandName);

  if (command === undefined) {
    return cliFailure(
      FUNGI_CLI_001,
      1,
      "The first argument is not a known Galerina command.",
      "Run `Galerina help` to list the commands."
    );
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

  let result: CliResult;
  try {
    result = await command.run(context);
  } catch {
    return cliFailure(FUNGI_CLI_002, 1, `The ${command.name} command failed unexpectedly.`, "Re-run with a smaller input or report the failure; no internal detail is printed.");
  }
  if (result.ok || "error" in result) return result;
  return Object.freeze({
    ...result,
    code: result.code === 0 ? 1 : result.code,
    error: Object.freeze({ code: FUNGI_CLI_003, safeMessage: `The ${command.name} command reported a failure.`, suggestedFix: "See the details above." })
  });
}
