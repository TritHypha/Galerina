import type { Graph, GraphEdge, GraphJSON, GraphNode, NodeId } from "./types.js";

export class ImmutableGraph<N, E> implements Graph<N, E> {
  constructor(
    private readonly nodeMap: ReadonlyMap<NodeId, GraphNode<N>>,
    private readonly outEdgeMap: ReadonlyMap<NodeId, readonly GraphEdge<E>[]>,
    private readonly inEdgeMap: ReadonlyMap<NodeId, readonly GraphEdge<E>[]>,
  ) {}

  get nodeCount(): number {
    return this.nodeMap.size;
  }

  get edgeCount(): number {
    let count = 0;
    for (const edges of this.outEdgeMap.values()) {
      count += edges.length;
    }
    return count;
  }

  hasNode(id: NodeId): boolean {
    return this.nodeMap.has(id);
  }

  node(id: NodeId): GraphNode<N> | undefined {
    return this.nodeMap.get(id);
  }

  nodes(): readonly GraphNode<N>[] {
    return [...this.nodeMap.values()];
  }

  outEdges(from: NodeId): readonly GraphEdge<E>[] {
    return this.outEdgeMap.get(from) ?? [];
  }

  inEdges(to: NodeId): readonly GraphEdge<E>[] {
    return this.inEdgeMap.get(to) ?? [];
  }

  edges(): readonly GraphEdge<E>[] {
    const result: GraphEdge<E>[] = [];
    for (const edges of this.outEdgeMap.values()) {
      result.push(...edges);
    }
    return result;
  }

  toJSON(): GraphJSON<N, E> {
    return {
      schemaVersion: "spore.graph.v1",
      nodes: [...this.nodeMap.values()].map(({ id, data }) => ({ id, data })),
      edges: this.edges().map(({ from, to, data }) => ({ from, to, data })),
    };
  }
}
