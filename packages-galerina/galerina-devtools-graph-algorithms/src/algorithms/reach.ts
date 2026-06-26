import { bfsReachable } from "./bfs.js";
import type { Graph, NodeId } from "../core/types.js";

// NOTE: a near-identical reachability module lives in `@galerina/devtools-project-graph`,
// which is a SEPARATE, externally-maintained vendored repo (its own git remote/history).
// Do NOT "consolidate" these two — coupling a compiler-used package to vendored code via a
// brittle relative path is the wrong trade (see the #200 nested-repo absorb/submodule
// decision). This package (`@galerina/devtools-graph-algorithms`) is the canonical copy for
// the parent repo; keep its behaviour in lockstep with the documented contract below.

/**
 * Returns true if node `to` is reachable from node `from` via directed edges.
 * A node reaches itself (distance 0). Returns false if EITHER node does not exist.
 */
export function canReach<N, E>(graph: Graph<N, E>, from: NodeId, to: NodeId): boolean {
  if (!graph.hasNode(from) || !graph.hasNode(to)) return false;
  if (from === to) return true;
  return bfsReachable(graph, from).has(to);
}

/**
 * Returns the set of all node IDs reachable from `from` (including `from` itself).
 * Delegates to bfsReachable for consistent traversal semantics.
 */
export function allReachable<N, E>(graph: Graph<N, E>, from: NodeId): Set<NodeId> {
  return bfsReachable(graph, from);
}
