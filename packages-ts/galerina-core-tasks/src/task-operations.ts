import type {
  TaskDefinition,
  TaskEffect,
  TaskError,
  TaskOperation,
  TaskOperationIssue,
  TaskOperationIssueCode,
  TaskOperationName,
  TaskPermission,
  TaskRunBlock
} from "./types.js";

// Parse and permission-check `run { ... }` task operations. This is a check-only
// slice: nothing here executes an operation. Execution semantics (what
// compiler.build writes, which effect schemas/openapi/tests map to, ordering and
// failure behaviour) are still product decisions, so those are refused here.

export const MAX_TASK_OPERATIONS = 256;
export const MAX_TASK_OPERATION_ARGS = 8;
export const MAX_TASK_OPERATION_LINE_LENGTH = 1024;

type PathAccess = "read" | "write" | "read-or-write";

interface TaskOperationSpec {
  /** Effect the task must declare; undefined = mapping not yet decided (refused). */
  readonly effect: TaskEffect | undefined;
  readonly arity: number;
  /** Access required for each path argument, by position. */
  readonly access: readonly PathAccess[];
}

const TASK_OPERATION_SPECS: Readonly<Record<TaskOperationName, TaskOperationSpec>> = Object.freeze({
  "filesystem.copy": { effect: "filesystem", arity: 2, access: ["read", "write"] },
  "filesystem.remove": { effect: "filesystem", arity: 1, access: ["write"] },
  "filesystem.mkdir": { effect: "filesystem", arity: 1, access: ["write"] },
  "filesystem.exists": { effect: "filesystem", arity: 1, access: ["read-or-write"] },
  "compiler.check": { effect: "compiler", arity: 0, access: [] },
  "compiler.build": { effect: "compiler", arity: 0, access: [] },
  "reports.generate": { effect: "reports", arity: 0, access: [] },
  "schemas.generateJson": { effect: undefined, arity: 0, access: [] },
  "openapi.generate": { effect: undefined, arity: 0, access: [] },
  "tests.run": { effect: undefined, arity: 0, access: [] }
});

export const TASK_OPERATION_NAMES: readonly TaskOperationName[] = Object.freeze(
  Object.keys(TASK_OPERATION_SPECS) as TaskOperationName[]
);

function isTaskOperationName(value: string): value is TaskOperationName {
  return Object.prototype.hasOwnProperty.call(TASK_OPERATION_SPECS, value);
}

const CALL = /^([A-Za-z_][A-Za-z0-9_]{0,31})\.([A-Za-z_][A-Za-z0-9_]{0,31})\((.*)\)$/;

function parseOperationArgs(raw: string): readonly string[] | undefined {
  const text = raw.trim();
  if (text.length === 0) return [];
  const args: string[] = [];
  const item = /\s*"([^"\\\u0000-\u001f\u007f]*)"\s*(,?)/y;
  let index = 0;
  while (index < text.length) {
    item.lastIndex = index;
    const match = item.exec(text);
    if (match === null) return undefined;
    args.push(match[1] ?? "");
    index = item.lastIndex;
    if (args.length > MAX_TASK_OPERATION_ARGS) return undefined;
    if (match[2] === "") return index === text.length ? args : undefined;
    if (index === text.length) return undefined; // trailing comma
  }
  return undefined;
}

function issue(line: number, code: TaskOperationIssueCode, operation?: string): TaskOperationIssue {
  return Object.freeze({ line, code, ...(operation === undefined ? {} : { operation }) });
}

/**
 * Parse the body of a `run { ... }` block into typed operations. One call per
 * line; blank lines and `//` comment lines are ignored. Anything else (nested
 * blocks, `return`, shell, unknown calls, malformed arguments) is recorded as an
 * issue and refused by checkTaskOperations. `blockCount` > 1 means the task
 * declared more than one run block.
 */
export function parseTaskRunBlock(body: string, blockCount = 1): TaskRunBlock {
  const operations: TaskOperation[] = [];
  const issues: TaskOperationIssue[] = [];

  if (blockCount > 1) issues.push(issue(0, "Galerina_TASK_RUN_BLOCK_DUPLICATE"));

  const lines = body.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = index + 1;
    const text = (lines[index] ?? "").trim();
    if (text.length === 0 || text.startsWith("//")) continue;
    if (text.length > MAX_TASK_OPERATION_LINE_LENGTH || operations.length >= MAX_TASK_OPERATIONS) {
      issues.push(issue(line, "Galerina_TASK_OPERATION_LIMIT_EXCEEDED"));
      break;
    }
    const call = CALL.exec(text);
    if (call === null) {
      issues.push(issue(line, "Galerina_TASK_OPERATION_SYNTAX_INVALID"));
      continue;
    }
    const name = `${call[1]}.${call[2]}`;
    const args = parseOperationArgs(call[3] ?? "");
    if (args === undefined) {
      issues.push(issue(line, "Galerina_TASK_OPERATION_SYNTAX_INVALID", name));
      continue;
    }
    if (!isTaskOperationName(name)) {
      issues.push(issue(line, "Galerina_TASK_OPERATION_UNKNOWN", name));
      continue;
    }
    operations.push(Object.freeze({ name, args: Object.freeze([...args]), line }));
  }

  return Object.freeze({ operations: Object.freeze(operations), issues: Object.freeze(issues) });
}

/** Strict repository-relative normalisation; undefined = refused. */
function normalizeTaskPath(path: string): string | undefined {
  let text = path.replace(/\\/g, "/").trim();
  if (text.length === 0 || text.includes("\0") || text.startsWith("/") || /^[A-Za-z]:/.test(text)) return undefined;
  if (text.startsWith("./")) text = text.slice(2);
  while (text.endsWith("/")) text = text.slice(0, -1);
  if (text.length === 0) return undefined;
  const parts = text.split("/");
  if (parts.some((part) => part === "" || part === "." || part === "..")) return undefined;
  return parts.join("/");
}

function permissionCovers(permission: TaskPermission, target: string): boolean {
  return permission.values.some((value) => {
    const scope = normalizeTaskPath(value);
    return scope !== undefined && (target === scope || target.startsWith(`${scope}/`));
  });
}

function hasPathAccess(task: TaskDefinition, access: PathAccess, target: string): boolean {
  return task.permissions.some((permission) => {
    const kindMatches = access === "read-or-write"
      ? permission.kind === "read" || permission.kind === "write"
      : permission.kind === access;
    return kindMatches && permissionCovers(permission, target);
  });
}

const ISSUE_MESSAGES: Readonly<Record<TaskOperationIssueCode, { safeMessage: string; suggestedFix: string }>> = Object.freeze({
  Galerina_TASK_RUN_BLOCK_DUPLICATE: {
    safeMessage: "A task may declare only one run block.",
    suggestedFix: "Merge the run blocks into a single run { ... } block."
  },
  Galerina_TASK_OPERATION_LIMIT_EXCEEDED: {
    safeMessage: `Task run blocks are limited to ${MAX_TASK_OPERATIONS} operations of at most ${MAX_TASK_OPERATION_LINE_LENGTH} characters.`,
    suggestedFix: "Split the work into smaller dependent tasks."
  },
  Galerina_TASK_OPERATION_SYNTAX_INVALID: {
    safeMessage: "Task run blocks accept only one built-in call per line with double-quoted string arguments.",
    suggestedFix: "Write each operation as namespace.operation(\"arg\", ...) on its own line."
  },
  Galerina_TASK_OPERATION_UNKNOWN: {
    safeMessage: "Task run block uses an operation that is not a safe built-in.",
    suggestedFix: `Use one of: ${TASK_OPERATION_NAMES.join(", ")}. Raw shell stays denied.`
  }
});

function operationError(
  task: TaskDefinition,
  code: string,
  safeMessage: string,
  suggestedFix: string,
  internalDiagnostic: string,
  extra: { readonly effect?: TaskEffect; readonly permission?: TaskPermission } = {}
): TaskError {
  return { task: task.name, code, safeMessage, internalDiagnostic, suggestedFix, ...extra };
}

/**
 * Refuse a task whose run block has any parse issue, unknown operation, missing
 * effect, wrong arity, unsafe path or path outside its declared read/write
 * permissions. Returns undefined when every operation is admissible. This never
 * executes anything; it complements checkTaskPermissions.
 */
export function checkTaskOperations(task: TaskDefinition): TaskError | undefined {
  const run = task.run;
  if (run === undefined) return undefined;

  const firstIssue = run.issues[0];
  if (firstIssue !== undefined) {
    const message = ISSUE_MESSAGES[firstIssue.code];
    return operationError(
      task,
      firstIssue.code,
      message.safeMessage,
      message.suggestedFix,
      `run line ${firstIssue.line}${firstIssue.operation === undefined ? "" : `: ${firstIssue.operation}`}`
    );
  }

  for (const operation of run.operations) {
    const spec = TASK_OPERATION_SPECS[operation.name];
    const where = `run line ${operation.line}: ${operation.name}`;

    if (spec.effect === undefined) {
      return operationError(
        task,
        "Galerina_TASK_OPERATION_EFFECT_UNDECIDED",
        "This built-in operation has no approved effect mapping yet, so it cannot be admitted.",
        "Leave this operation out until its effect and permission rules are decided.",
        where
      );
    }
    if (!task.effects.includes(spec.effect)) {
      return operationError(
        task,
        "Galerina_TASK_OPERATION_EFFECT_UNDECLARED",
        `Operation requires the ${spec.effect} effect, which the task does not declare.`,
        `Add ${spec.effect} to the task effects list.`,
        where,
        { effect: spec.effect }
      );
    }
    if (operation.args.length !== spec.arity) {
      return operationError(
        task,
        "Galerina_TASK_OPERATION_ARGS_INVALID",
        `Operation takes exactly ${spec.arity} argument(s).`,
        "Pass the documented number of double-quoted arguments.",
        where
      );
    }
    for (const [position, access] of spec.access.entries()) {
      const target = normalizeTaskPath(operation.args[position] ?? "");
      if (target === undefined) {
        return operationError(
          task,
          "Galerina_TASK_OPERATION_PATH_INVALID",
          "Operation paths must be explicit safe repository-relative paths.",
          "Use paths such as ./src or ./build/reports; avoid absolute paths, empty paths, dot segments and parent traversal.",
          `${where} argument ${position + 1}`
        );
      }
      if (!hasPathAccess(task, access, target)) {
        const kind = access === "read-or-write" ? "read" : access;
        return operationError(
          task,
          "Galerina_TASK_OPERATION_PERMISSION_DENIED",
          `Operation path is outside the task's declared ${access === "read-or-write" ? "read/write" : access} permissions.`,
          `Add a ${kind} permission that covers this path, or change the path.`,
          `${where} argument ${position + 1}`,
          { effect: spec.effect }
        );
      }
    }
  }

  return undefined;
}
