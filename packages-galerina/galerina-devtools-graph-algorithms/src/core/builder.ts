import { ImmutableGraph } from "./graph.js";
import type { Graph, GraphEdge, GraphJSON, GraphNode, NodeId } from "./types.js";

export class GraphBuilder<N, E> {
  private readonly nodes = new Map<NodeId, GraphNode<N>>();
  private readonly outEdges = new Map<NodeId, GraphEdge<E>[]>();
  private readonly inEdges = new Map<NodeId, GraphEdge<E>[]>();

  addNode(id: NodeId, data: N): this {
    this.nodes.set(id, { id, data });
    if (!this.outEdges.has(id)) {
      this.outEdges.set(id, []);
    }
    if (!this.inEdges.has(id)) {
      this.inEdges.set(id, []);
    }
    return this;
  }

  addEdge(from: NodeId, to: NodeId, data: E): this {
    if (!this.nodes.has(from)) {
      throw new Error(`GraphBuilder.addEdge: source node "${from}" does not exist`);
    }
    if (!this.nodes.has(to)) {
      throw new Error(`GraphBuilder.addEdge: target node "${to}" does not exist`);
    }

    const edge: GraphEdge<E> = { from, to, data };

    const outs = this.outEdges.get(from);
    if (outs !== undefined) {
      outs.push(edge);
    } else {
      this.outEdges.set(from, [edge]);
    }

    const ins = this.inEdges.get(to);
    if (ins !== undefined) {
      ins.push(edge);
    } else {
      this.inEdges.set(to, [edge]);
    }

    return this;
  }

  build(): Graph<N, E> {
    // Snapshot all edge arrays so later mutations to the builder don't affect the graph
    const frozenOut = new Map<NodeId, readonly GraphEdge<E>[]>();
    for (const [id, edges] of this.outEdges) {
      frozenOut.set(id, Object.freeze([...edges]));
    }

    const frozenIn = new Map<NodeId, readonly GraphEdge<E>[]>();
    for (const [id, edges] of this.inEdges) {
      frozenIn.set(id, Object.freeze([...edges]));
    }

    return new ImmutableGraph<N, E>(
      new Map(this.nodes),
      frozenOut,
      frozenIn,
    );
  }

  static fromJSON<N, E>(json: GraphJSON<N, E>): Graph<N, E> {
    const builder = new GraphBuilder<N, E>();
    for (const { id, data } of json.nodes) {
      builder.addNode(id, data);
    }
    for (const { from, to, data } of json.edges) {
      builder.addEdge(from, to, data);
    }
    return builder.build();
  }
}
