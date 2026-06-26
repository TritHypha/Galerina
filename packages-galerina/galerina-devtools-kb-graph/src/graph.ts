// =============================================================================
// graph.ts — builds a node/edge graph from scanner results.
// =============================================================================

import type { KBDocNode, KBEdge, ScanResult } from "./scanner.js";

export interface KBGraph {
  nodes: KBDocNode[];
  edges: KBEdge[];
  orphans: string[];        // node ids with no inbound edges
  staleLinks: string[];     // edge "from→to" entries pointing to non-existent docs
  stats: {
    totalDocs: number;
    totalEdges: number;
    totalLlnCodes: number;
    orphanCount: number;
    staleLinkCount: number;
  };
}

export function buildKBGraph(scanResult: ScanResult): KBGraph {
  const { docs, edges } = scanResult;

  // Build set of known doc ids
  const knownIds = new Set<string>(docs.map(d => d.id));

  // Stale links: edges pointing to non-existent docs
  const staleLinks: string[] = [];
  const validEdges: KBEdge[] = [];
  for (const edge of edges) {
    if (!knownIds.has(edge.to)) {
      staleLinks.push(`${edge.from} → ${edge.to} ("${edge.linkText}")`);
    } else {
      validEdges.push(edge);
    }
  }

  // Orphans: nodes with no inbound edges (from valid edges only)
  const hasInbound = new Set<string>();
  for (const edge of validEdges) {
    hasInbound.add(edge.to);
  }
  const orphans = docs
    .filter(d => !hasInbound.has(d.id))
    .map(d => d.id);

  // Unique SPORE codes across all docs
  const allLlnCodes = new Set<string>();
  for (const doc of docs) {
    for (const code of doc.lnlCodes) {
      allLlnCodes.add(code);
    }
  }

  return {
    nodes: docs,
    edges: validEdges,
    orphans,
    staleLinks,
    stats: {
      totalDocs: docs.length,
      totalEdges: validEdges.length,
      totalLlnCodes: allLlnCodes.size,
      orphanCount: orphans.length,
      staleLinkCount: staleLinks.length,
    },
  };
}
