import { checkTaskPermissions } from "./check-permissions.js";
import { dryRunTask } from "./dry-run.js";
import { executeTaskOperations, type TaskOperationHandlers } from "./execute-operations.js";
import { checkTaskOperations } from "./task-operations.js";
import type { TaskDefinition, TaskResult } from "./types.js";

export interface RunTaskOptions {
  readonly dryRun?: boolean;
  /**
   * Host handlers for the safe built-in operations. Without them nothing is
   * executed and a non-dry run returns `skipped` (no ambient authority).
   */
  readonly handlers?: TaskOperationHandlers;
  /** Clock for durationMs; defaults to Date.now. */
  readonly now?: () => number;
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

  const operationError = checkTaskOperations(task);

  if (operationError !== undefined) {
    return {
      task: task.name,
      status: "failed",
      durationMs: 0,
      warnings: [],
      error: operationError
    };
  }

  if (options.dryRun === true) {
    return dryRunTask(task);
  }

  if (options.handlers === undefined) {
    return {
      task: task.name,
      status: "skipped",
      durationMs: 0,
      warnings: ["No operation handlers were supplied; nothing was executed."]
    };
  }

  return executeTaskOperations(task, {
    handlers: options.handlers,
    ...(options.now === undefined ? {} : { now: options.now })
  });
}
