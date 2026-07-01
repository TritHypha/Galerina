// =============================================================================
// fungi-graph — core types
//
// All graph structures in the library are parameterised on N (node data) and
// E (edge data). NodeId is always a plain string for JSON compatibility and
// deterministic ordering.
// =============================================================================

/** Stable string identifier for a node. Must be unique within a Graph. */
export type NodeId = string;

/** An immutable node containing its id and typed payload. */
export interface GraphNode<N> {
  readonly id: NodeId;
  readonly data: N;
}

/** A directed edge from one node to another with typed payload. */
export interface GraphEdge<E> {
  readonly from: NodeId;
  readonly to: NodeId;
  readonly data: E;
}

/**
 * An immutable directed graph.
 *
 * Instances are always produced by GraphBuilder.build() or
 * GraphBuilder.fromJSON(). There is no public constructor.
 *
 * All accessor methods return readonly values; the graph cannot be mutated
 * after construction.
 */
export interface Graph<N, E> {
  readonly nodeCount: number;
  readonly edgeCount: number;

  hasNode(id: NodeId): boolean;
  node(id: NodeId): GraphNode<N> | undefined;
  nodes(): readonly GraphNode<N>[];

  /** All edges leaving `from`. Returns [] if node does not exist. */
  outEdges(from: NodeId): readonly GraphEdge<E>[];
  /** All edges arriving at `to`. Returns [] if node does not exist. */
  inEdges(to: NodeId): readonly GraphEdge<E>[];
  edges(): readonly GraphEdge<E>[];

  toJSON(): GraphJSON<N, E>;
}

/**
 * Stable JSON representation of a Graph.
 * schemaVersion allows consumers to detect format changes.
 */
export interface GraphJSON<N, E> {
  readonly schemaVersion: "fungi.graph.v1";
  readonly nodes: ReadonlyArray<{ readonly id: NodeId; readonly data: N }>;
  readonly edges: ReadonlyArray<{
    readonly from: NodeId;
    readonly to: NodeId;
    readonly data: E;
  }>;
}

/**
 * Shared diagnostic shape used by fungi-graph graph validators.
 * Structurally compatible with Galerina's CompilerDiagnostic / BaseDiagnostic.
 */
export interface FungiDiagnostic {
  readonly code: string;
  readonly name: string;
  readonly severity: "info" | "warning" | "error";
  readonly message: string;
}

// ---------------------------------------------------------------------------
// FUNGI-PGRAPH diagnostic constants — project-graph-owned; distinct from flowgraph's FUNGI-GRAPH-*
// ---------------------------------------------------------------------------

/** A cycle was found in a graph that must be a DAG. */
export const FUNGI_PGRAPH_001 = {
  code: "FUNGI-PGRAPH-001",
  name: "CYCLE_DETECTED",
  severity: "error",
  message: "Graph contains a cycle where a directed acyclic graph is required.",
} as const satisfies FungiDiagnostic;

/** A referenced node does not exist in the graph. */
export const FUNGI_PGRAPH_002 = {
  code: "FUNGI-PGRAPH-002",
  name: "NODE_NOT_FOUND",
  severity: "error",
  message: "Referenced node does not exist in the graph.",
} as const satisfies FungiDiagnostic;

/** A declared dependency could not be resolved to an existing node. */
export const FUNGI_PGRAPH_003 = {
  code: "FUNGI-PGRAPH-003",
  name: "DEPENDENCY_MISSING",
  severity: "error",
  message: "A declared dependency was not found in the graph.",
} as const satisfies FungiDiagnostic;

/** Iterative fixpoint propagation did not converge within the allowed iterations. */
export const FUNGI_PGRAPH_004 = {
  code: "FUNGI-PGRAPH-004",
  name: "FIXPOINT_TIMEOUT",
  severity: "error",
  message: "Iterative fixpoint propagation did not converge within the maximum allowed iterations.",
} as const satisfies FungiDiagnostic;

/** A resource lifecycle state transition is not permitted by the state machine. */
export const FUNGI_PGRAPH_005 = {
  code: "FUNGI-PGRAPH-005",
  name: "INVALID_TRANSITION",
  severity: "error",
  message: "Resource lifecycle state transition is not permitted.",
} as const satisfies FungiDiagnostic;

export const FUNGI_PGRAPH_DIAGNOSTICS = [
  FUNGI_PGRAPH_001,
  FUNGI_PGRAPH_002,
  FUNGI_PGRAPH_003,
  FUNGI_PGRAPH_004,
  FUNGI_PGRAPH_005,
] as const;
