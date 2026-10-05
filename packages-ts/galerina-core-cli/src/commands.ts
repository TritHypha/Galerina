import type { CliCommand, CliContext, CliResult } from "./types.js";
import { createCoreCommandRunner } from "./core-command.js";
import { runGraphCommand } from "./graph-command.js";
import { runTaskCommand } from "./task-command.js";
import { runInitCommand } from "./init-command.js";
import { runVerifyCommand } from "./verify/verify-command.js";
import { runDeployCommand } from "./deploy/deploy-command.js";
import { runExplainCommand } from "./explain/explain-command.js";
import { runPlanCommand } from "./plan/plan-command.js";
import { runBuildCommand } from "./build/build-command.js";

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
  {
    name: "init",
    description: "Scaffold a deny-by-default Galerina app (alias of galerina new app).",
    run: runInitCommand
  },
  createCoreCommand("check", "Parse and type-check a Galerina project."),
  {
    name: "build",
    description: "Closed-shape build admission against BuildWorkspaceInput (fail-closed; 14-pass pipeline not admitted).",
    run: runBuildCommand
  },
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
    name: "verify",
    description: "Verify build artefacts and optional runtime manifests (fail-closed).",
    run: runVerifyCommand
  },
  {
    name: "deploy",
    description: "Dry-run deploy effects validation against a closed policy (fail-closed; no live deploy).",
    run: runDeployCommand
  },
  {
    name: "explain",
    description: "Explain closed-shape manifest facets and/or deployment-denial reasoning (fail-closed; no live tree).",
    run: runExplainCommand
  },
  {
    name: "plan",
    description: "Estimate closed-shape compute plan suitability (fail-closed; no live GPU/optical/memory probe).",
    run: runPlanCommand
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
