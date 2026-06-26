import type { CliCommand, CliContext, CliResult } from "./types.js";
import { createCoreCommandRunner } from "./core-command.js";
import { runGraphCommand } from "./graph-command.js";
import { runTaskCommand } from "./task-command.js";

function createCoreCommand(
  name: Parameters<typeof createCoreCommandRunner>[0],
  description: string,
): CliCommand {
  return {
    name,
    description,
    run: createCoreCommandRunner(name)
  };
}

export const commands: readonly CliCommand[] = [
  createCoreCommand("check", "Parse and type-check a Galerina project."),
  createCoreCommand("build", "Build project outputs."),
  createCoreCommand("run", "Run a Galerina entrypoint."),
  createCoreCommand("serve", "Start the API server package."),
  createCoreCommand("reports", "Generate development reports."),
  createCoreCommand("security:check", "Check security rules and unsafe features."),
  createCoreCommand("routes", "List declared API routes."),
  {
    name: "task",
    description: "Run a safe task through galerina-core-tasks.",
    run: runTaskCommand
  },
  {
    name: "graph",
    description: "Generate or query the Galerina project graph.",
    run: runGraphCommand
  },
  {
    name: "benchmark",
    description: "Run Galerina benchmark diagnostics.",
    run: async (_context: CliContext): Promise<CliResult> => ({
      ok: false,
      code: 2,
      message: "Galerina benchmark is defined but not implemented yet."
    })
  }
];

export function findCommand(name: string): CliCommand | undefined {
  return commands.find((command) => command.name === name);
}
