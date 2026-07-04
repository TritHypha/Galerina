import type { TaskDefinition, TaskError } from "./types.js";

export function checkTaskPermissions(task: TaskDefinition): TaskError | undefined {
  const usesShell = task.effects.includes("shell");
  const filesystemPermissions = task.permissions.filter(
    (permission) => permission.kind === "read" || permission.kind === "write",
  );
  const environmentPermissions = task.permissions.filter(
    (permission) => permission.kind === "environment",
  );

  if (usesShell && task.unsafe !== true) {
    return {
      task: task.name,
      code: "Galerina_TASK_SHELL_DENIED",
      safeMessage: "Shell execution is disabled unless the task is explicitly unsafe.",
      effect: "shell",
      suggestedFix: "Use safe built-in task operations or mark the task unsafe with a reason and strict permissions."
    };
  }

  if (task.unsafe === true && (task.reason === undefined || task.reason.trim().length === 0)) {
    return {
      task: task.name,
      code: "Galerina_TASK_UNSAFE_REASON_REQUIRED",
      safeMessage: "Unsafe tasks must include a reason.",
      suggestedFix: "Add a reason explaining why the unsafe task is temporarily required."
    };
  }

  if (usesShell && !hasPermission(task, "shell")) {
    return {
      task: task.name,
      code: "Galerina_TASK_SHELL_PERMISSION_REQUIRED",
      safeMessage: "Shell tasks must declare an explicit shell permission.",
      effect: "shell",
      suggestedFix: "Add a shell permission with the exact command family allowed."
    };
  }

  if (task.effects.includes("filesystem") && filesystemPermissions.length === 0) {
    return {
      task: task.name,
      code: "Galerina_TASK_FILESYSTEM_PERMISSION_REQUIRED",
      safeMessage: "Filesystem tasks must declare at least one read or write permission.",
      effect: "filesystem",
      suggestedFix: "Add read/write permissions scoped to repository-relative paths."
    };
  }

  for (const permission of filesystemPermissions) {
    const invalidPath = permission.values.find((value) => !isSafeRelativePath(value)); // perf-allow: loop-array-find — security permission check; validation predicate (not key equality), first-invalid scan over a small values list

    if (permission.values.length === 0 || invalidPath !== undefined) {
      return {
        task: task.name,
        code: "Galerina_TASK_FILESYSTEM_PERMISSION_INVALID",
        safeMessage: "Filesystem permissions must use explicit safe repository-relative paths.",
        permission,
        suggestedFix: "Use paths such as ./src or ./build/reports; avoid absolute paths, empty paths and parent traversal."
      };
    }
  }

  if (task.effects.includes("environment") && environmentPermissions.length === 0) {
    return {
      task: task.name,
      code: "Galerina_TASK_ENVIRONMENT_PERMISSION_REQUIRED",
      safeMessage: "Environment tasks must declare explicit environment variable permissions.",
      effect: "environment",
      suggestedFix: "Add environment permissions for the exact variable names the task may read."
    };
  }

  for (const permission of environmentPermissions) {
    const invalidName = permission.values.find((value) => !isSafeEnvironmentName(value)); // perf-allow: loop-array-find — security permission check; validation predicate (not key equality), first-invalid scan over a small values list

    if (permission.values.length === 0 || invalidName !== undefined) {
      return {
        task: task.name,
        code: "Galerina_TASK_ENVIRONMENT_PERMISSION_INVALID",
        safeMessage: "Environment permissions must list explicit environment variable names.",
        permission,
        suggestedFix: "Use uppercase names such as NODE_ENV or GALERINA_ENV; wildcards and empty values are not allowed."
      };
    }
  }

  const requiredPermissionError = checkEffectPermission(task, "network", "network");
  if (requiredPermissionError !== undefined) {
    return requiredPermissionError;
  }

  const requiredDatabaseError = checkEffectPermission(task, "database", "database");
  if (requiredDatabaseError !== undefined) {
    return requiredDatabaseError;
  }

  return undefined;
}

function checkEffectPermission(
  task: TaskDefinition,
  effect: "network" | "database",
  permissionKind: "network" | "database",
): TaskError | undefined {
  if (!task.effects.includes(effect) || hasPermission(task, permissionKind)) {
    return undefined;
  }

  return {
    task: task.name,
    code: `Galerina_TASK_${effect.toUpperCase()}_PERMISSION_REQUIRED`,
    safeMessage: `${effect} tasks must declare an explicit ${permissionKind} permission.`,
    effect,
    suggestedFix: `Add a ${permissionKind} permission scoped to the exact target needed.`
  };
}

function hasPermission(
  task: TaskDefinition,
  kind: TaskDefinition["permissions"][number]["kind"],
): boolean {
  return task.permissions.some(
    (permission) => permission.kind === kind && permission.values.length > 0,
  );
}

function isSafeRelativePath(path: string): boolean {
  const normalized = path.replace(/\\/g, "/").trim();

  return (
    normalized.length > 0 &&
    normalized !== "." &&
    normalized !== "./" &&
    !normalized.startsWith("/") &&
    !/^[A-Za-z]:/.test(normalized) &&
    !normalized.split("/").includes("..") &&
    !normalized.includes("\0")
  );
}

function isSafeEnvironmentName(name: string): boolean {
  return /^[A-Z][A-Z0-9_]*$/.test(name);
}
