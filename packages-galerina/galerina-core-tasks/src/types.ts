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
