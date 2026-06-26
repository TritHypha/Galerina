import { checkTaskPermissions } from "./check-permissions.js";
import { dryRunTask } from "./dry-run.js";
import type { TaskDefinition, TaskResult } from "./types.js";

export interface RunTaskOptions {
  readonly dryRun?: boolean;
}

export async function runTask(task: TaskDefinition, options: RunTaskOptions = {}): Promise<TaskResult> {
  const permissionError = checkTaskPermissions(task);

  if (permissionError !== undefined) {
    return {
      task: task.name,
      status: "failed",
      durationMs: 0,
      warnings: [],
      error: permissionError
    };
  }

  if (options.dryRun === true) {
    return dryRunTask(task);
  }

  return {
    task: task.name,
    status: "skipped",
    durationMs: 0,
    warnings: ["Task operation execution is not implemented yet."]
  };
}
