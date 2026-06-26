import type { Graph, NodeId } from "../core/types.js";

/**
 * Topological sort using Kahn's algorithm.
 *
 * Returns `{ order: NodeId[] }` for DAGs.
 * Returns `{ order: NodeId[], cycle: NodeId[] }` when a cycle is detected;
 * `order` will contain nodes processed before the cycle was found.
 */
export function topoSort<N, E>(graph: Graph<N, E>): { order: NodeId[]; cycle?: NodeId[] } {
  const inDegree = new Map<NodeId, number>();

  // Initialise all nodes with in-degree 0
  for (const node of graph.nodes()) {
    inDegree.set(node.id, 0);
  }

  // Count in-degrees
  for (const edge of graph.edges()) {
    inDegree.set(edge.to, (inDegree.get(edge.to) ?? 0) + 1);
  }

  // Seed the queue with all zero-in-degree nodes
  const queue: NodeId[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }

  const order: NodeId[] = [];

  while (queue.length > 0) {
    const current = queue.shift()!;
    order.push(current);

    for (const edge of graph.outEdges(current)) {
      const newDeg = (inDegree.get(edge.to) ?? 0) - 1;
      inDegree.set(edge.to, newDeg);
      if (newDeg === 0) {
        queue.push(edge.to);
      }
    }
  }

  if (order.length !== graph.nodeCount) {
    // Nodes with remaining in-degree > 0 are part of a cycle
    const cycleNodes: NodeId[] = [];
    for (const [id, deg] of inDegree) {
      if (deg > 0) cycleNodes.push(id);
    }
    return { order, cycle: cycleNodes };
  }

  return { order };
}
