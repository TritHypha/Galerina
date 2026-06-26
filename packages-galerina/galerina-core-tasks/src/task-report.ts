import type { TaskDefinition, TaskError, TaskResult, TaskStatus } from "./types.js";

export interface TaskReport {
  readonly task: string;
  readonly unsafe: boolean;
  readonly reason?: string;
  readonly status: TaskResult["status"];
  readonly effects: TaskDefinition["effects"];
  readonly permissions: TaskDefinition["permissions"];
  readonly durationMs: number;
  readonly warnings: readonly string[];
  readonly error?: TaskError;
}

export interface TaskRunReport {
  readonly generatedAt: string;
  readonly taskFile: string;
  readonly requestedTask: string;
  readonly dryRun: boolean;
  readonly status: TaskStatus;
  readonly dependencyOrder: readonly string[];
  readonly tasks: readonly TaskReport[];
}

export function createTaskReport(task: TaskDefinition, result: TaskResult): TaskReport {
  return {
    task: task.name,
    unsafe: task.unsafe === true,
    ...(task.reason !== undefined ? { reason: task.reason } : {}),
    status: result.status,
    effects: task.effects,
    permissions: task.permissions,
    durationMs: result.durationMs,
    warnings: result.warnings,
    ...(result.error === undefined ? {} : { error: result.error })
  };
}

export interface CreateTaskRunReportInput {
  readonly taskFile: string;
  readonly requestedTask: string;
  readonly dryRun: boolean;
  readonly dependencyOrder: readonly TaskDefinition[];
  readonly results: readonly TaskResult[];
  readonly generatedAt?: string;
}

export function createTaskRunReport(input: CreateTaskRunReportInput): TaskRunReport {
  const status = summarizeTaskRunStatus(input.results);

  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    taskFile: input.taskFile,
    requestedTask: input.requestedTask,
    dryRun: input.dryRun,
    status,
    dependencyOrder: input.dependencyOrder.map((task) => task.name),
    tasks: input.dependencyOrder.map((task) => {
      const result = input.results.find((candidate) => candidate.task === task.name);

      return createTaskReport(
        task,
        result ?? {
          task: task.name,
          status: "skipped",
          durationMs: 0,
          warnings: ["Task did not produce a result."]
        },
      );
    })
  };
}

function summarizeTaskRunStatus(results: readonly TaskResult[]): TaskStatus {
  if (results.some((result) => result.status === "failed")) {
    return "failed";
  }

  if (results.length > 0 && results.every((result) => result.status === "dry-run")) {
    return "dry-run";
  }

  if (results.some((result) => result.status === "passed")) {
    return "passed";
  }

  return "skipped";
}
