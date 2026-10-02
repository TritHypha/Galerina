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
// Future:   extract to C:\laragon\www\FUNGI-Graph once API stabilises
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
  readonly sourceFile?: string;    // primary .fungi file
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
  const adj = new Map<string, string[]>();
  for (const edge of graph.edges) {
    if (edge.kind !== edgeKind) continue;
    const list = adj.get(edge.from);
    if (list === undefined) adj.set(edge.from, [edge.to]);
    else list.push(edge.to);
  }
  const result: SemanticNode[] = [];
  const visited = new Set<string>();
  const queue = [fromId];
  const maxVisits = graph.nodes.length + 1;

  while (queue.length > 0 && visited.size < maxVisits) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);

    for (const to of adj.get(current) ?? []) {
      const target = nodeMap.get(to);
      if (target !== undefined && !visited.has(to)) {
        result.push(target);
        queue.push(to);
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
  const incoming = new Map<string, string[]>();
  for (const edge of graph.edges) {
    if (edge.kind !== "calls") continue;
    const list = incoming.get(edge.to);
    if (list === undefined) incoming.set(edge.to, [edge.from]);
    else list.push(edge.from);
  }
  const result: SemanticNode[] = [];
  const seen = new Set<string>();
  const maxResults = graph.nodes.length;
  for (const from of incoming.get(nodeId) ?? []) {
    if (seen.has(from)) continue;
    seen.add(from);
    const source = nodeMap.get(from);
    if (source !== undefined) result.push(source);
    if (result.length >= maxResults) break;
  }
  return result;
}

/**
 * Extract all declared effects for a flow node.
 */
export function effectsOf(
  graph: SemanticGraph,
  flowId: string,
): readonly string[] {
  const outgoing = new Map<string, string[]>();
  for (const edge of graph.edges) {
    if (edge.kind !== "declaresEffect") continue;
    const effect = edge.label ?? edge.to;
    const list = outgoing.get(edge.from);
    if (list === undefined) outgoing.set(edge.from, [effect]);
    else list.push(effect);
  }
  const result: string[] = [];
  const seen = new Set<string>();
  const maxResults = graph.edges.length;
  for (const effect of outgoing.get(flowId) ?? []) {
    if (seen.has(effect)) continue;
    seen.add(effect);
    result.push(effect);
    if (result.length >= maxResults) break;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Serialisation
// ---------------------------------------------------------------------------

export function graphToJSON(graph: SemanticGraph): string {
  return JSON.stringify(graph, null, 2);
}

export const MAX_SEMANTIC_GRAPH_JSON_BYTES = 1_048_576;
export const MAX_SEMANTIC_GRAPH_JSON_DEPTH = 32;
export const MAX_SEMANTIC_GRAPH_WALK_NODES = 100_000;
export const MAX_SEMANTIC_GRAPH_NODES = 16_384;
export const MAX_SEMANTIC_GRAPH_EDGES = 65_536;

function utf8ByteLength(text: string): number {
  let bytes = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    if (cp === undefined) continue;
    if (cp <= 0x7f) bytes += 1;
    else if (cp <= 0x7ff) bytes += 2;
    else if (cp <= 0xffff) bytes += 3;
    else bytes += 4;
  }
  return bytes;
}

function walkBound(value: unknown, depth: number, state: { n: number }): void {
  if (depth > MAX_SEMANTIC_GRAPH_JSON_DEPTH) {
    throw new Error("SemanticGraph JSON exceeds the host depth bound");
  }
  if (state.n >= MAX_SEMANTIC_GRAPH_WALK_NODES) {
    throw new Error("SemanticGraph JSON exceeds the host node bound");
  }
  state.n += 1;
  if (value === null || typeof value !== "object") return;
  if (Array.isArray(value)) {
    if (value.length > MAX_SEMANTIC_GRAPH_EDGES) {
      throw new Error("SemanticGraph JSON array exceeds the host bound");
    }
    for (const item of value) walkBound(item, depth + 1, state);
    return;
  }
  for (const key of Object.keys(value)) {
    walkBound((value as Record<string, unknown>)[key], depth + 1, state);
  }
}

function admitSemanticGraph(value: unknown): SemanticGraph {
  walkBound(value, 0, { n: 0 });
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("SemanticGraph JSON must be an object");
  }
  const rec = value as Record<string, unknown>;
  if (rec.schemaVersion !== "1.0") {
    throw new Error(`Unsupported SemanticGraph schemaVersion: ${String(rec.schemaVersion)}`);
  }
  if (!Array.isArray(rec.nodes)) {
    throw new Error("SemanticGraph nodes must be an array");
  }
  if (!Array.isArray(rec.edges)) {
    throw new Error("SemanticGraph edges must be an array");
  }
  if (rec.nodes.length > MAX_SEMANTIC_GRAPH_NODES) {
    throw new Error("SemanticGraph node count exceeds the host bound");
  }
  if (rec.edges.length > MAX_SEMANTIC_GRAPH_EDGES) {
    throw new Error("SemanticGraph edge count exceeds the host bound");
  }
  return rec as unknown as SemanticGraph;
}

export function graphFromJSON(json: string): SemanticGraph {
  if (typeof json !== "string") {
    throw new Error("SemanticGraph JSON must be a string");
  }
  if (json.length > MAX_SEMANTIC_GRAPH_JSON_BYTES || utf8ByteLength(json) > MAX_SEMANTIC_GRAPH_JSON_BYTES) {
    throw new Error("SemanticGraph JSON exceeds the host byte bound");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(json) as unknown;
  } catch {
    throw new Error("SemanticGraph JSON is not parseable");
  }
  return admitSemanticGraph(parsed);
}
