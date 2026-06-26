import { mkdir, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import {
  createTaskRunReport,
  loadTasks,
  resolveTaskDependencies,
  runTask,
  type LoadedTasks,
  type TaskResult
} from "../../galerina-core-tasks/dist/index.js";
import type { CliContext, CliResult } from "./types.js";

export async function runTaskCommand(context: CliContext): Promise<CliResult> {
  const taskFile = resolveTaskFile(context);
  const reportPath = resolveReportPath(context);
  const taskName = positionalArgs(context.args)[0];
  const dryRun = context.args.includes("--dry-run");
  const skipReport = context.args.includes("--no-report");
  let loadedTasks: LoadedTasks;

  try {
    loadedTasks = await loadTasks(taskFile);
  } catch {
    return {
      ok: false,
      code: 1,
      message: `Task file not found: ${relativeTaskFile(context, taskFile)}`,
      details: [
        "Create tasks.spore in the repository root or pass --file <path>.",
        "Example: Galerina task generateReports --file packages-galerina/galerina-core-tasks/examples/tasks.spore --dry-run"
      ]
    };
  }

  if (taskName === undefined) {
    return {
      ok: true,
      code: 0,
      message: `Tasks loaded from ${relativeTaskFile(context, taskFile)}.`,
      details: loadedTasks.tasks.map((task) => `${task.name}: ${task.description ?? "no description"}`)
    };
  }

  const plan = resolveTaskDependencies(loadedTasks, taskName);

  if (plan.error !== undefined) {
    return {
      ok: false,
      code: 1,
      message: plan.error.safeMessage,
      details: [
        `Code: ${plan.error.code}`,
        ...(plan.error.internalDiagnostic === undefined ? [] : [plan.error.internalDiagnostic]),
        ...(plan.error.suggestedFix === undefined ? [] : [`Fix: ${plan.error.suggestedFix}`])
      ]
    };
  }

  const results: TaskResult[] = [];

  for (const task of plan.order) {
    results.push(await runTask(task, { dryRun }));
  }

  const failed = results.find((result) => result.status === "failed");
  const report = createTaskRunReport({
    taskFile: relativePath(context, taskFile),
    requestedTask: taskName,
    dryRun,
    dependencyOrder: plan.order,
    results
  });

  if (!skipReport) {
    await mkdir(dirname(reportPath), { recursive: true });
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }

  return {
    ok: failed === undefined,
    code: failed === undefined ? 0 : 1,
    message: failed === undefined
      ? `Task ${taskName} ${dryRun ? "dry-run planned" : "completed"}.`
      : `Task ${failed.task} failed.`,
    details: [
      `Task file: ${relativeTaskFile(context, taskFile)}`,
      `Dependency order: ${plan.order.map((task) => task.name).join(" -> ")}`,
      ...(skipReport ? [] : [`Task report: ${relativePath(context, reportPath)}`]),
      ...results.flatMap(formatTaskResult)
    ]
  };
}

function resolveTaskFile(context: CliContext): string {
  const fileFlagIndex = context.args.findIndex((arg) => arg === "--file");
  const fileValue = fileFlagIndex >= 0 ? context.args[fileFlagIndex + 1] : undefined;
  return resolve(context.cwd, fileValue ?? "tasks.spore");
}

function resolveReportPath(context: CliContext): string {
  const reportFlagIndex = context.args.findIndex((arg) => arg === "--report-out");
  const reportValue = reportFlagIndex >= 0 ? context.args[reportFlagIndex + 1] : undefined;
  return resolve(context.cwd, reportValue ?? "build/reports/task-report.json");
}

function relativeTaskFile(context: CliContext, taskFile: string): string {
  return relativePath(context, taskFile);
}

function relativePath(context: CliContext, path: string): string {
  const output = relative(context.cwd, path);
  return output.length === 0 ? "." : output;
}

function positionalArgs(args: readonly string[]): readonly string[] {
  const output: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === undefined) {
      continue;
    }
    if (arg === "--file" || arg === "--env" || arg === "--report-out") {
      index += 1;
      continue;
    }
    if (arg.startsWith("--")) {
      continue;
    }
    output.push(arg);
  }

  return output;
}

function formatTaskResult(result: TaskResult): readonly string[] {
  return [
    `${result.task}: ${result.status}`,
    ...result.warnings.map((warning) => `${result.task} warning: ${warning}`),
    ...(result.error === undefined
      ? []
      : [`${result.task} error: ${result.error.code} ${result.error.safeMessage}`])
  ];
}
