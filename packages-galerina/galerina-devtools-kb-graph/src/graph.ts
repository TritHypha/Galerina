// =============================================================================
// graph.ts — builds a node/edge graph from scanner results.
// =============================================================================

import type { KBDocNode, KBEdge, ScanResult } from "./scanner.js";

export interface KBGraph {
  nodes: KBDocNode[];
  edges: KBEdge[];
  orphans: string[];        // CURATED node ids with no inbound edges
  staleLinks: string[];     // CURATED "from→to" entries pointing to non-existent docs
  rawStaleLinks: string[];  // stale links ORIGINATING in raw/absorbed subdirs (archival)
  rawOrphans: string[];     // raw/absorbed docs with no inbound edges (archival)
  stats: {
    totalDocs: number;
    totalEdges: number;
    totalFungiCodes: number;
    orphanCount: number;       // curated only
    staleLinkCount: number;    // curated only
    rawStaleLinkCount: number; // archival (rd-absorbed/ + defensive-publications/)
    rawOrphanCount: number;    // archival
  };
}

// Raw/absorbed subdirs: their .md are indexed as link TARGETS (so curated docs can
// reference them and resolve), but they are ARCHIVAL raw material — their own outbound
// dangling refs (to un-absorbed R-AND-D siblings) and their orphan-status are NOT a
// curation-hygiene signal, so they are scored separately, not in the headline counts.
const RAW_SUBDIR_RE = /\/(rd-absorbed|defensive-publications)\//;
function isRaw(doc: KBDocNode): boolean {
  return RAW_SUBDIR_RE.test(doc.path.replace(/\\/g, "/"));
}

export function buildKBGraph(scanResult: ScanResult): KBGraph {
  const { docs, edges } = scanResult;

  // Known doc ids (ALL docs, incl. raw subdirs — so links INTO them resolve).
  const knownIds = new Set<string>(docs.map(d => d.id));
  // Which source ids are raw/absorbed (edge origin classification).
  const rawIds = new Set<string>(docs.filter(isRaw).map(d => d.id));

  // Stale links: edges pointing to non-existent docs, split by whether the SOURCE is raw.
  const staleLinks: string[] = [];      // curated origin
  const rawStaleLinks: string[] = [];   // archival origin
  const validEdges: KBEdge[] = [];
  for (const edge of edges) {
    if (knownIds.has(edge.to)) {
      validEdges.push(edge);
    } else if (edge.kind === "link") {
      // a real [](…) hyperlink to a non-existent doc = a broken link
      const line = `${edge.from} → ${edge.to} ("${edge.linkText}")`;
      (rawIds.has(edge.from) ? rawStaleLinks : staleLinks).push(line);
    }
    // else: a prose/`backtick`/"See:" MENTION of a missing filename — not a broken hyperlink
  }

  // Inbound set from valid edges (any origin — a raw note linking to a curated doc still
  // counts as inbound, so the curated doc is not an orphan).
  const hasInbound = new Set<string>();
  for (const edge of validEdges) hasInbound.add(edge.to);

  const orphans: string[] = [];      // curated docs with no inbound edge
  const rawOrphans: string[] = [];   // archival docs with no inbound edge
  for (const d of docs) {
    if (hasInbound.has(d.id)) continue;
    (isRaw(d) ? rawOrphans : orphans).push(d.id);
  }

  // Unique FUNGI codes across all docs
  const allFungiCodes = new Set<string>();
  for (const doc of docs) {
    for (const code of doc.lnlCodes) allFungiCodes.add(code);
  }

  return {
    nodes: docs,
    edges: validEdges,
    orphans,
    staleLinks,
    rawStaleLinks,
    rawOrphans,
    stats: {
      totalDocs: docs.length,
      totalEdges: validEdges.length,
      totalFungiCodes: allFungiCodes.size,
      orphanCount: orphans.length,
      staleLinkCount: staleLinks.length,
      rawStaleLinkCount: rawStaleLinks.length,
      rawOrphanCount: rawOrphans.length,
    },
  };
}
