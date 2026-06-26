import type { Graph, NodeId } from "../core/types.js";

/**
 * Returns the shortest path (list of node IDs) from `from` to `to`,
 * or null if no path exists.
 */
export function bfsPath<N, E>(graph: Graph<N, E>, from: NodeId, to: NodeId): NodeId[] | null {
  if (!graph.hasNode(from) || !graph.hasNode(to)) {
    return null;
  }
  if (from === to) {
    return [from];
  }

  const visited = new Set<NodeId>([from]);
  // Each queue entry tracks the path to that node
  const queue: NodeId[][] = [[from]];

  while (queue.length > 0) {
    const path = queue.shift()!;
    const current = path[path.length - 1]!;

    for (const edge of graph.outEdges(current)) {
      if (edge.to === to) {
        return [...path, edge.to];
      }
      if (!visited.has(edge.to)) {
        visited.add(edge.to);
        queue.push([...path, edge.to]);
      }
    }
  }

  return null;
}

/**
 * Returns the set of all node IDs reachable from `from` (including `from` itself).
 */
export function bfsReachable<N, E>(graph: Graph<N, E>, from: NodeId): Set<NodeId> {
  const visited = new Set<NodeId>();
  if (!graph.hasNode(from)) {
    return visited;
  }

  const queue: NodeId[] = [from];
  visited.add(from);

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const edge of graph.outEdges(current)) {
      if (!visited.has(edge.to)) {
        visited.add(edge.to);
        queue.push(edge.to);
      }
    }
  }

  return visited;
}
