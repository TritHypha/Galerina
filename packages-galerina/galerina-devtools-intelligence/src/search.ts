// =============================================================================
// galerina-devtools-intelligence — Hybrid Search Engine
//
// Combines:
//   1. BM25 sparse lexical search (exact token matching)
//   2. Structural metadata filters (effects, qualifier, taint, risk tier)
//
// Algorithm:
//   - Score all flows by BM25 for the query
//   - Apply structural filters (zero score if not matching)
//   - Compute combined rank score (BM25 dominates; structural bonus applied)
//   - Return top-10 sorted by rankScore desc
// =============================================================================

import { buildInvertedIndex, bm25Search } from "./bm25.js";
import type { IndexedFlow, SearchFilters, SearchResult } from "./types.js";

// ---------------------------------------------------------------------------
// Risk tier mapping
// ---------------------------------------------------------------------------

/**
 * Derive a risk tier from a flow's structural properties.
 * 'high' = has taint + secrets + governed effects
 * 'medium' = has taint OR secrets OR multiple sensitive effects
 * 'low' = everything else
 */
function deriveRiskTier(flow: IndexedFlow): "low" | "medium" | "high" {
  const sensitiveEffects = flow.declaredEffects.filter(e =>
    e.includes("secret") || e.includes("crypto") || e.includes("database") ||
    e.includes("audit") || e.includes("network")
  );

  if ((flow.hasTaint && flow.hasSecrets) || sensitiveEffects.length >= 3) {
    return "high";
  }
  if (flow.hasTaint || flow.hasSecrets || sensitiveEffects.length >= 1) {
    return "medium";
  }
  return "low";
}

const RISK_TIER_RANK: Record<string, number> = { low: 0, medium: 1, high: 2 };

// ---------------------------------------------------------------------------
// Structural filter application
// ---------------------------------------------------------------------------

function matchesFilters(flow: IndexedFlow, filters: SearchFilters): boolean {
  // Qualifier filter
  if (filters.qualifier !== undefined && filters.qualifier !== "") {
    if (flow.qualifier !== filters.qualifier) return false;
  }

  // Effects filter: flow must declare ALL specified effects
  if (filters.effects !== undefined && filters.effects.length > 0) {
    for (const requiredEffect of filters.effects) {
      // Support prefix matching: "audit" matches "audit.write"
      const matched = flow.declaredEffects.some(e =>
        e === requiredEffect || e.startsWith(requiredEffect + ".")
      );
      if (!matched) return false;
    }
  }

  // Taint filter
  if (filters.hasTaint !== undefined) {
    if (flow.hasTaint !== filters.hasTaint) return false;
  }

  // Risk tier filter: only return flows at or below the specified tier
  if (filters.maxRiskTier !== undefined) {
    const flowTier = deriveRiskTier(flow);
    const maxRank = RISK_TIER_RANK[filters.maxRiskTier] ?? 2;
    const flowRank = RISK_TIER_RANK[flowTier] ?? 0;
    if (flowRank > maxRank) return false;
  }

  return true;
}

// ---------------------------------------------------------------------------
// Public search API
// ---------------------------------------------------------------------------

const TOP_K = 10;

/**
 * Hybrid search: BM25 + structural filters.
 *
 * @param query    Natural-language or identifier query string
 * @param index    The loaded IndexedFlow array
 * @param filters  Optional structural filters
 * @returns        Top-10 results sorted by combined rank score
 */
export function search(
  query: string,
  index: IndexedFlow[],
  filters?: SearchFilters,
): SearchResult[] {
  if (index.length === 0) return [];

  // Build inverted index for this search call
  // (small enough corpus that per-call build is fast; callers can cache if needed)
  const invertedIndex = buildInvertedIndex(index);

  // BM25 scoring — query may be empty (browse mode)
  let scored: Array<{ flow: IndexedFlow; score: number }>;
  if (query.trim().length === 0) {
    // No query: return all flows with score=1.0 (filtered browse)
    scored = index.map(flow => ({ flow, score: 1.0 }));
  } else {
    scored = bm25Search(query, index, invertedIndex);
  }

  // Apply structural filters and compute combined rank
  const results: SearchResult[] = [];
  for (const { flow, score } of scored) {
    const structuralMatch = filters !== undefined ? matchesFilters(flow, filters) : true;

    if (!structuralMatch) continue;

    // Combined rank: BM25 score is primary; add small bonus for structural richness
    const structuralBonus =
      (flow.qualifier === "secure" ? 0.05 : 0) +
      (flow.declaredEffects.length > 0 ? 0.02 : 0) +
      (flow.qualifier_tags.includes("has-intent") ? 0.03 : 0);

    const rankScore = score + structuralBonus;

    results.push({
      flow,
      bm25Score: score,
      structuralMatch: true,
      rankScore,
    });
  }

  // Sort descending by rankScore
  results.sort((a, b) => b.rankScore - a.rankScore);

  return results.slice(0, TOP_K);
}

/**
 * Search with a pre-built inverted index (for repeated queries on same corpus).
 * Caller is responsible for building and caching the index via buildInvertedIndex.
 */
export function searchWithIndex(
  query: string,
  flows: IndexedFlow[],
  invertedIndex: Map<string, number[]>,
  filters?: SearchFilters,
): SearchResult[] {
  if (flows.length === 0) return [];

  let scored: Array<{ flow: IndexedFlow; score: number }>;
  if (query.trim().length === 0) {
    scored = flows.map(flow => ({ flow, score: 1.0 }));
  } else {
    scored = bm25Search(query, flows, invertedIndex);
  }

  const results: SearchResult[] = [];
  for (const { flow, score } of scored) {
    const structuralMatch = filters !== undefined ? matchesFilters(flow, filters) : true;
    if (!structuralMatch) continue;

    const structuralBonus =
      (flow.qualifier === "secure" ? 0.05 : 0) +
      (flow.declaredEffects.length > 0 ? 0.02 : 0) +
      (flow.qualifier_tags.includes("has-intent") ? 0.03 : 0);

    results.push({
      flow,
      bm25Score: score,
      structuralMatch: true,
      rankScore: score + structuralBonus,
    });
  }

  results.sort((a, b) => b.rankScore - a.rankScore);
  return results.slice(0, TOP_K);
}

export { buildInvertedIndex } from "./bm25.js";
