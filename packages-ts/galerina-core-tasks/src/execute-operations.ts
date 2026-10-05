import { normalizeTaskPath, TASK_OPERATION_PATH_POSITIONS } from "./task-operations.js";
import type { TaskDefinition, TaskError, TaskOperation, TaskOperationName, TaskResult } from "./types.js";

// Governed execution of an already-checked `run { ... }` block.
//
// Zero-trust defaults (Grok Bot 2026-10-05, standing permission; owner may revisit):
// - The package ships no ambient authority. An operation runs only through a
//   handler the host passes in for that exact operation name. No handlers means
//   nothing runs (runTask keeps returning `skipped`).
// - Preflight before any side effect: every operation in the block must have an
//   own-property function handler, otherwise nothing runs.
// - Operations run one at a time in declared order. The first failure stops the
//   task; later operations are never started.
// - Every task has a time bound: timeoutMs when declared, else
//   DEFAULT_TASK_TIMEOUT_MS. Values outside 1..MAX_TASK_TIMEOUT_MS are refused.
//   On timeout the AbortSignal handed to the handler is aborted.
// - Path arguments reach the handler already normalised (repo-relative, no dot
//   segments). Handler error text is never copied into the result, because it
//   may carry paths or secrets; only the run line and operation name are kept.
// Callers must run checkTaskPermissions and checkTaskOperations first (runTask does).

export const DEFAULT_TASK_TIMEOUT_MS = 60_000;
export const MAX_TASK_TIMEOUT_MS = 3_600_000;

export interface TaskOperationInvocation {
  readonly task: string;
  readonly name: TaskOperationName;
  /** Path arguments are normalised repository-relative paths. */
  readonly args: readonly string[];
  /** 1-based line within the run block. */
  readonly line: number;
  /** Aborted when the task times out or an earlier step fails. */
  readonly signal: AbortSignal;
}

export type TaskOperationHandler = (invocation: TaskOperationInvocation) => void | Promise<void>;

export type TaskOperationHandlers = Readonly<Partial<Record<TaskOperationName, TaskOperationHandler>>>;

export interface ExecuteTaskOperationsOptions {
  readonly handlers: TaskOperationHandlers;
  /** Clock for durationMs; defaults to Date.now. */
  readonly now?: () => number;
}

function failed(task: TaskDefinition, durationMs: number, completed: number, error: TaskError): TaskResult {
  return { task: task.name, status: "failed", durationMs, warnings: [], operationsCompleted: completed, error };
}

function ownHandler(handlers: TaskOperationHandlers, name: TaskOperationName): TaskOperationHandler | undefined {
  if (!Object.prototype.hasOwnProperty.call(handlers, name)) return undefined;
  const candidate: unknown = handlers[name];
  return typeof candidate === "function" ? (candidate as TaskOperationHandler) : undefined;
}

/** Resolve the time bound for a task, or undefined when the declared value is refused. */
export function resolveTaskTimeoutMs(task: TaskDefinition): number | undefined {
  const declared = task.timeoutMs;
  if (declared === undefined) return DEFAULT_TASK_TIMEOUT_MS;
  return Number.isSafeInteger(declared) && declared > 0 && declared <= MAX_TASK_TIMEOUT_MS ? declared : undefined;
}

function invocationArgs(operation: TaskOperation): readonly string[] | undefined {
  const positions = TASK_OPERATION_PATH_POSITIONS[operation.name];
  const args: string[] = [];
  for (const [index, value] of operation.args.entries()) {
    if (index < positions) {
      const normalised = normalizeTaskPath(value);
      if (normalised === undefined) return undefined;
      args.push(normalised);
    } else {
      args.push(value);
    }
  }
  return Object.freeze(args);
}

const TIMED_OUT = Symbol("timed-out");

/**
 * Run a checked task's operations through host-supplied handlers. Returns
 * `passed` only when every operation resolved. See the module note for the
 * zero-trust rules.
 */
export async function executeTaskOperations(
  task: TaskDefinition,
  options: ExecuteTaskOperationsOptions
): Promise<TaskResult> {
  const now = options.now ?? Date.now;
  const operations = task.run?.operations ?? [];

  if (operations.length === 0) {
    return { task: task.name, status: "skipped", durationMs: 0, warnings: ["Task declares no run operations; nothing was executed."], operationsCompleted: 0 };
  }

  const timeoutMs = resolveTaskTimeoutMs(task);
  if (timeoutMs === undefined) {
    return failed(task, 0, 0, {
      task: task.name,
      code: "Galerina_TASK_TIMEOUT_INVALID",
      safeMessage: `Task timeout must be a whole number of milliseconds from 1 to ${MAX_TASK_TIMEOUT_MS}.`,
      suggestedFix: "Set timeoutMs to a positive bound, or remove it to use the default."
    });
  }

  // Preflight: resolve every handler and argument list before anything runs.
  const plan: { readonly operation: TaskOperation; readonly handler: TaskOperationHandler; readonly args: readonly string[] }[] = [];
  for (const operation of operations) {
    const where = `run line ${operation.line}: ${operation.name}`;
    const handler = ownHandler(options.handlers, operation.name);
    if (handler === undefined) {
      return failed(task, 0, 0, {
        task: task.name,
        code: "Galerina_TASK_OPERATION_HANDLER_MISSING",
        safeMessage: "No host handler is registered for this operation, so the task was not started.",
        suggestedFix: "Register a handler for every operation the task uses, or remove the operation.",
        internalDiagnostic: where
      });
    }
    const args = invocationArgs(operation);
    if (args === undefined) {
      return failed(task, 0, 0, {
        task: task.name,
        code: "Galerina_TASK_OPERATION_PATH_INVALID",
        safeMessage: "Operation paths must be explicit safe repository-relative paths.",
        suggestedFix: "Run checkTaskOperations before execution and fix the reported path.",
        internalDiagnostic: where
      });
    }
    plan.push({ operation, handler, args });
  }

  const started = now();
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  const timeout = new Promise<typeof TIMED_OUT>((resolve) => {
    timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
      resolve(TIMED_OUT);
    }, timeoutMs);
  });

  let completed = 0;
  try {
    for (const step of plan) {
      const where = `run line ${step.operation.line}: ${step.operation.name}`;
      const invocation: TaskOperationInvocation = Object.freeze({
        task: task.name,
        name: step.operation.name,
        args: step.args,
        line: step.operation.line,
        signal: controller.signal
      });
      const timeoutError = (): TaskResult => failed(task, now() - started, completed, {
        task: task.name,
        code: "Galerina_TASK_TIMEOUT",
        safeMessage: `Task exceeded its ${timeoutMs} ms time bound; later operations were not started.`,
        suggestedFix: "Raise timeoutMs within the allowed bound or split the task.",
        internalDiagnostic: where
      });
      let outcome: unknown;
      try {
        outcome = await Promise.race([
          Promise.resolve().then(() => step.handler.call(undefined, invocation)),
          timeout
        ]);
      } catch {
        if (timedOut) return timeoutError();
        controller.abort();
        return failed(task, now() - started, completed, {
          task: task.name,
          code: "Galerina_TASK_OPERATION_FAILED",
          safeMessage: "A task operation failed; later operations were not started.",
          suggestedFix: "Check the host handler log for this operation.",
          internalDiagnostic: where
        });
      }
      if (outcome === TIMED_OUT || timedOut) return timeoutError();
      completed += 1;
    }
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }

  return { task: task.name, status: "passed", durationMs: now() - started, warnings: [], operationsCompleted: completed };
}
