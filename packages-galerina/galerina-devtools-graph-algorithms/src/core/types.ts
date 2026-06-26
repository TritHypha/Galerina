export type NodeId = string;

export interface GraphNode<N> {
  readonly id: NodeId;
  readonly data: N;
}

export interface GraphEdge<E> {
  readonly from: NodeId;
  readonly to: NodeId;
  readonly data: E;
}

export interface Graph<N, E> {
  readonly nodeCount: number;
  readonly edgeCount: number;
  hasNode(id: NodeId): boolean;
  node(id: NodeId): GraphNode<N> | undefined;
  nodes(): readonly GraphNode<N>[];
  outEdges(from: NodeId): readonly GraphEdge<E>[];
  inEdges(to: NodeId): readonly GraphEdge<E>[];
  edges(): readonly GraphEdge<E>[];
  toJSON(): GraphJSON<N, E>;
}

export interface GraphJSON<N, E> {
  schemaVersion: "spore.graph.v1";
  nodes: Array<{ id: NodeId; data: N }>;
  edges: Array<{ from: NodeId; to: NodeId; data: E }>;
}
