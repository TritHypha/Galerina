import { findCommand } from "./commands.js";
import type { CliContext, CliEnvironment, CliResult } from "./types.js";

const VALID_ENVIRONMENTS = new Set<CliEnvironment>([
  "development",
  "test",
  "staging",
  "production"
]);

export function parseEnvironment(args: readonly string[]): CliEnvironment {
  const envFlagIndex = args.findIndex((arg) => arg === "--env");
  const envValue = envFlagIndex >= 0 ? args[envFlagIndex + 1] : undefined;

  if (envValue !== undefined && VALID_ENVIRONMENTS.has(envValue as CliEnvironment)) {
    return envValue as CliEnvironment;
  }

  return "development";
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

  const context: CliContext = {
    cwd,
    env: parseEnvironment(args),
    args: args.slice(1)
  };

  return command.run(context);
}
