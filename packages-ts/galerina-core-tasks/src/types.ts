export type TaskEffect =
  | "filesystem"
  | "network"
  | "database"
  | "environment"
  | "shell"
  | "compiler"
  | "reports"
  | "crypto";

export interface TaskPermission {
  readonly kind: "read" | "write" | "network" | "environment" | "database" | "shell";
  readonly values: readonly string[];
}

export interface TaskDefinition {
  readonly name: string;
  readonly description?: string;
  readonly unsafe?: boolean;
  readonly reason?: string;
  readonly depends?: readonly string[];
  readonly effects: readonly TaskEffect[];
  readonly permissions: readonly TaskPermission[];
  readonly timeoutMs?: number;
  /** Parsed `run { ... }` block, when the task declares one. Check-only; never executed here. */
  readonly run?: TaskRunBlock;
}

/** README safe built-ins. Recognised names; see checkTaskOperations for which are admitted. */
export type TaskOperationName =
  | "filesystem.copy"
  | "filesystem.remove"
  | "filesystem.mkdir"
  | "filesystem.exists"
  | "compiler.check"
  | "compiler.build"
  | "reports.generate"
  | "schemas.generateJson"
  | "openapi.generate"
  | "tests.run";

export interface TaskOperation {
  readonly name: TaskOperationName;
  readonly args: readonly string[];
  /** 1-based line within the run block. */
  readonly line: number;
}

export type TaskOperationIssueCode =
  | "Galerina_TASK_RUN_BLOCK_DUPLICATE"
  | "Galerina_TASK_OPERATION_LIMIT_EXCEEDED"
  | "Galerina_TASK_OPERATION_SYNTAX_INVALID"
  | "Galerina_TASK_OPERATION_UNKNOWN";

export interface TaskOperationIssue {
  readonly line: number;
  readonly code: TaskOperationIssueCode;
  /** Identifier-shaped operation name only; raw line text is never kept. */
  readonly operation?: string;
}

export interface TaskRunBlock {
  readonly operations: readonly TaskOperation[];
  readonly issues: readonly TaskOperationIssue[];
}

export type TaskStatus = "passed" | "failed" | "skipped" | "dry-run";

export interface TaskError {
  readonly task: string;
  readonly code: string;
  readonly safeMessage: string;
  readonly internalDiagnostic?: string;
  readonly effect?: TaskEffect;
  readonly permission?: TaskPermission;
  readonly suggestedFix?: string;
}

export interface TaskResult {
  readonly task: string;
  readonly status: TaskStatus;
  readonly durationMs: number;
  readonly warnings: readonly string[];
  readonly error?: TaskError;
}
