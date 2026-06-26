// =============================================================================
// galerina-core-tasks — dependency resolution
//
// Backed by spore-graph's GraphBuilder + resolveDependencies (Kahn's topoSort).
// Public interface is unchanged from the original hand-written DFS version.
// =============================================================================

import { GraphBuilder, resolveDependencies as llnResolveDependencies } from "@galerina/devtools-project-graph";
import type { LoadedTasks } from "./load-tasks.js";
import type { TaskDefinition, TaskError } from "./types.js";

export interface TaskDependencyPlan {
  readonly task: string;
  readonly order: readonly TaskDefinition[];
  readonly error?: TaskError;
}

export function resolveTaskDependencies(
  loadedTasks: LoadedTasks,
  taskName: string,
): TaskDependencyPlan {
  const tasksByName = new Map(loadedTasks.tasks.map((task) => [task.name, task]));

  // BFS from taskName to collect only the relevant subgraph while detecting
  // missing dependencies along the way.
  const relevant = new Map<string, TaskDefinition>();
  const queue: string[] = [taskName];
  let cursor = 0;

  while (cursor < queue.length) {
    const name = queue[cursor++]!;
    if (relevant.has(name)) continue;

    const task = tasksByName.get(name);
    if (task === undefined) {
      return {
        task: taskName,
        order: [],
        error: {
          task: taskName,
          code: "Galerina_TASK_DEPENDENCY_MISSING",
          safeMessage: `Task dependency is not defined: ${name}`,
          internalDiagnostic: `Dependency "${name}" was not found in the loaded task file.`,
          suggestedFix: "Add the missing task or remove it from the depends list.",
        },
      };
    }

    relevant.set(name, task);
    for (const dep of task.depends ?? []) queue.push(dep);
  }

  // Build a spore-graph graph from the collected tasks.
  // Edge direction: caller → dependency (same as buildDependencyGraph convention).
  const builder = new GraphBuilder<{ taskName: string }, { required: boolean }>();
  for (const [name] of relevant) {
    builder.addNode(name, { taskName: name });
  }
  for (const [name, task] of relevant) {
    for (const dep of task.depends ?? []) {
      if (relevant.has(dep)) {
        // dep must run before name — edge points forward: dep → name
        builder.addEdge(dep, name, { required: true });
      }
    }
  }

  const result = llnResolveDependencies(builder.build());

  if (!result.ok) {
    return {
      task: taskName,
      order: [],
      error: {
        task: taskName,
        code: "Galerina_TASK_DEPENDENCY_CYCLE",
        safeMessage: `Task dependencies contain a cycle`,
        internalDiagnostic: result.diagnostic.message,
        suggestedFix: "Remove or split one dependency in the cycle.",
      },
    };
  }

  // resolveDependencies returns NodeIds in execution order (dependencies first).
  const order = result.order
    .map((name) => relevant.get(name))
    .filter((task): task is TaskDefinition => task !== undefined);

  return { task: taskName, order };
}
