import type { TaskDefinition, TaskResult } from "./types.js";

export interface DryRunPlan {
  readonly task: string;
  readonly dependencyOrder: readonly string[];
  readonly effects: TaskDefinition["effects"];
  readonly permissions: TaskDefinition["permissions"];
  /** Operations that would run (from the run block); empty when none. */
  readonly operations: NonNullable<TaskDefinition["run"]>["operations"];
}

export function createDryRunPlan(task: TaskDefinition, dependencyOrder: readonly string[] = []): DryRunPlan {
  return {
    task: task.name,
    dependencyOrder,
    effects: task.effects,
    permissions: task.permissions,
    operations: task.run?.operations ?? []
  };
}

export function dryRunTask(task: TaskDefinition): TaskResult {
  return {
    task: task.name,
    status: "dry-run",
    durationMs: 0,
    warnings: []
  };
}
