import type { Graph, GraphNode, NodeId } from "../core/types.js";

export type DfsVisitor<N, E> = (node: GraphNode<N>, graph: Graph<N, E>) => void;

/**
 * Performs a post-order DFS from `start`, calling `visitor` on each node
 * after all its descendants have been visited.
 */
export function dfsVisit<N, E>(
  graph: Graph<N, E>,
  start: NodeId,
  visitor: DfsVisitor<N, E>,
): void {
  if (!graph.hasNode(start)) {
    return;
  }

  const visited = new Set<NodeId>();

  function visit(id: NodeId): void {
    if (visited.has(id)) return;
    visited.add(id);

    for (const edge of graph.outEdges(id)) {
      visit(edge.to);
    }

    const n = graph.node(id);
    if (n !== undefined) {
      visitor(n, graph);
    }
  }

  visit(start);
}

/**
 * Detects whether the graph contains a cycle.
 * Returns `{ hasCycle: false }` for acyclic graphs, or
 * `{ hasCycle: true, cycle: NodeId[] }` with one cycle path.
 */
export function detectCycle<N, E>(graph: Graph<N, E>): { hasCycle: boolean; cycle?: NodeId[] } {
  // Three-colour DFS: white (0) → gray (1, in stack) → black (2, done)
  const color = new Map<NodeId, 0 | 1 | 2>();
  const parent = new Map<NodeId, NodeId | null>();

  for (const node of graph.nodes()) {
    color.set(node.id, 0);
  }

  function dfs(id: NodeId): NodeId[] | null {
    color.set(id, 1); // gray — currently on the recursion stack

    for (const edge of graph.outEdges(id)) {
      const neighborColor = color.get(edge.to);
      if (neighborColor === 1) {
        // Back edge — cycle detected; reconstruct the cycle
        const cycle: NodeId[] = [edge.to];
        let cur: NodeId | null | undefined = id;
        while (cur !== undefined && cur !== null && cur !== edge.to) {
          cycle.unshift(cur);
          cur = parent.get(cur);
        }
        cycle.unshift(edge.to);
        return cycle;
      }
      if (neighborColor === 0) {
        parent.set(edge.to, id);
        const result = dfs(edge.to);
        if (result !== null) return result;
      }
    }

    color.set(id, 2); // black — fully processed
    return null;
  }

  for (const node of graph.nodes()) {
    if ((color.get(node.id) ?? 0) === 0) {
      const cycle = dfs(node.id);
      if (cycle !== null) {
        return { hasCycle: true, cycle };
      }
    }
  }

  return { hasCycle: false };
}
