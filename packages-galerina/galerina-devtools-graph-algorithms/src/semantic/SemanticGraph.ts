// =============================================================================
// Galerina Phase 13 — SemanticGraph
//
// The resolved, queryable semantic layer built from the AST.
// Does NOT replace the AST — the AST remains compiler truth.
// SemanticGraph is the enriched, resolved layer above it.
//
// Plain data only — no imports from compiler-private AST types.
// Design: galerina-phase-13-decisions.md Decision 1
// Spec:   galerina-semantic-graph-system.md
//
// Location: galerina-devtools-graph-algorithms (monorepo-first)
// Future:   extract to C:\laragon\www\SPORE-Graph once API stabilises
// =============================================================================

// ---------------------------------------------------------------------------
// Node kinds
// ---------------------------------------------------------------------------

export type SemanticNodeKind =
  | "flow"
  | "fn"
  | "type"
  | "record"
  | "enum"
  | "effect"
  | "capability"
  | "contract"
  | "event"
  | "module"
  | "import"
  | "export"
  | "intent"
  | "boundary";

// ---------------------------------------------------------------------------
// Edge kinds
// ---------------------------------------------------------------------------

export type SemanticEdgeKind =
  | "calls"
  | "usesType"
  | "declaresEffect"
  | "requiresCapability"
  | "emits"
  | "requires"
  | "imports"
  | "exports"
  | "dependsOn"
  | "crossesBoundary"
  | "owns"
  | "returns"
  | "hasParam";

// ---------------------------------------------------------------------------
// Core types — plain data, no AST imports
// ---------------------------------------------------------------------------

export interface SemanticNode {
  readonly id: string;
  readonly kind: SemanticNodeKind;
  readonly name: string;
  readonly sourceFile?: string;
  readonly sourceLine?: number;
  readonly sourceColumn?: number;
  /** Additional metadata (effects, capabilities, return type, etc.) */
  readonly meta?: Record<string, unknown>;
}

export interface SemanticEdge {
  readonly from: string;   // source node id
  readonly to: string;     // target node id
  readonly kind: SemanticEdgeKind;
  readonly label?: string; // optional human-readable label
}

export interface SemanticGraph {
  readonly schemaVersion: "1.0";
  readonly generatedAt: string;    // ISO timestamp
  readonly sourceFile?: string;    // primary .spore file
  readonly nodes: readonly SemanticNode[];
  readonly edges: readonly SemanticEdge[];
}

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

export class SemanticGraphBuilder {
  private readonly nodes: SemanticNode[] = [];
  private readonly edges: SemanticEdge[] = [];
  private readonly nodeIndex = new Map<string, SemanticNode>();

  addNode(node: SemanticNode): this {
    if (!this.nodeIndex.has(node.id)) {
      this.nodes.push(node);
      this.nodeIndex.set(node.id, node);
    }
    return this;
  }

  addEdge(edge: SemanticEdge): this {
    this.edges.push(edge);
    return this;
  }

  hasNode(id: string): boolean {
    return this.nodeIndex.has(id);
  }

  getNode(id: string): SemanticNode | undefined {
    return this.nodeIndex.get(id);
  }

  build(sourceFile?: string): SemanticGraph {
    return {
      schemaVersion: "1.0",
      generatedAt: new Date().toISOString(),
      ...(sourceFile !== undefined ? { sourceFile } : {}),
      nodes: [...this.nodes],
      edges: [...this.edges],
    };
  }
}

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

/**
 * Find all nodes reachable from a starting node via the given edge kind.
 * Useful for: "what effects does this flow require?" (declaresEffect edges)
 */
export function reachable(
  graph: SemanticGraph,
  fromId: string,
  edgeKind: SemanticEdgeKind,
): readonly SemanticNode[] {
  const nodeMap = new Map(graph.nodes.map((n) => [n.id, n]));
  const result: SemanticNode[] = [];
  const visited = new Set<string>();
  const queue = [fromId];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);

    for (const edge of graph.edges) {
      if (edge.from === current && edge.kind === edgeKind) {
        const target = nodeMap.get(edge.to);
        if (target !== undefined && !visited.has(edge.to)) {
          result.push(target);
          queue.push(edge.to);
        }
      }
    }
  }

  return result;
}

/**
 * Find all callers of a node.
 */
export function callers(
  graph: SemanticGraph,
  nodeId: string,
): readonly SemanticNode[] {
  const nodeMap = new Map(graph.nodes.map((n) => [n.id, n]));
  return graph.edges
    .filter((e) => e.to === nodeId && e.kind === "calls")
    .map((e) => nodeMap.get(e.from))
    .filter((n): n is SemanticNode => n !== undefined);
}

/**
 * Extract all declared effects for a flow node.
 */
export function effectsOf(
  graph: SemanticGraph,
  flowId: string,
): readonly string[] {
  return graph.edges
    .filter((e) => e.from === flowId && e.kind === "declaresEffect")
    .map((e) => e.label ?? e.to);
}

// ---------------------------------------------------------------------------
// Serialisation
// ---------------------------------------------------------------------------

export function graphToJSON(graph: SemanticGraph): string {
  return JSON.stringify(graph, null, 2);
}

export function graphFromJSON(json: string): SemanticGraph {
  const parsed = JSON.parse(json) as SemanticGraph;
  if (parsed.schemaVersion !== "1.0") {
    throw new Error(`Unsupported SemanticGraph schemaVersion: ${parsed.schemaVersion}`);
  }
  return parsed;
}
