// =============================================================================
// galerina-devtools-intelligence — BM25 Sparse Search
//
// Pure in-memory BM25 implementation. Zero dependencies.
//
// Tokenisation: split on `.`, `_`, camelCase boundaries, whitespace, and
// other non-alphanumeric delimiters. Lowercase. Deduplication is NOT done
// at tokenisation time so that term-frequency reflects repeated usage.
//
// BM25 parameters tuned for identifier-heavy code search:
//   K1 = 1.5  (term saturation — longer docs don't drown rare tokens)
//   B  = 0.75 (length normalisation)
// =============================================================================

import type { IndexedFlow } from "./types.js";

// BM25 hyperparameters
const K1 = 1.5;
const B  = 0.75;

// ---------------------------------------------------------------------------
// Tokenisation
// ---------------------------------------------------------------------------

/**
 * Tokenise a string for BM25 indexing / query expansion.
 *
 * Strategy:
 *   1. Split on non-alphanumeric chars (`.`, `_`, `-`, `/`, whitespace, etc.)
 *   2. Split remaining segments on camelCase boundaries
 *   3. Lowercase everything
 *   4. Drop empty strings and tokens shorter than 2 chars
 */
export function tokenize(text: string): string[] {
  // Step 1: split on common delimiters
  const parts = text.split(/[^a-zA-Z0-9]+/);
  const tokens: string[] = [];

  for (const part of parts) {
    if (part.length === 0) continue;
    // Step 2: camelCase split — insert break before each uppercase letter
    // that follows a lowercase letter, e.g. "verifyPassword" → ["verify","Password"]
    const camelParts = part.replace(/([a-z])([A-Z])/g, "$1 $2").split(" ");
    for (const cp of camelParts) {
      const lower = cp.toLowerCase();
      if (lower.length >= 2) {
        tokens.push(lower);
      }
    }
  }

  return tokens;
}

/**
 * Tokenise and ALSO include fully-spelled compound forms for BM25.
 * e.g. "verifyPassword" adds: "verify", "password", "verifypassword" (compound)
 * This ensures both sub-word and whole-identifier queries hit.
 */
export function tokenizeWithCompounds(text: string): string[] {
  const base = tokenize(text);
  const compounds: string[] = [];

  // For each delimiter-split segment, add the lowercased whole as a compound
  const segments = text.split(/[^a-zA-Z0-9]+/).filter(s => s.length > 0);
  for (const seg of segments) {
    const lower = seg.toLowerCase();
    if (lower.length >= 2 && !base.includes(lower)) {
      compounds.push(lower);
    }
  }

  return [...base, ...compounds];
}

// ---------------------------------------------------------------------------
// Inverted index
// ---------------------------------------------------------------------------

/**
 * Build an inverted index: token → list of flow indices that contain it.
 * Uses the flows array index as the document ID.
 */
export function buildInvertedIndex(flows: IndexedFlow[]): Map<string, number[]> {
  const index = new Map<string, number[]>();

  for (let i = 0; i < flows.length; i++) {
    const flow = flows[i];
    if (flow === undefined) continue;
    const seen = new Set<string>();
    for (const tok of flow.lexicalTokens) {
      if (!seen.has(tok)) {
        seen.add(tok);
        const list = index.get(tok);
        if (list !== undefined) {
          list.push(i);
        } else {
          index.set(tok, [i]);
        }
      }
    }
  }

  return index;
}

// ---------------------------------------------------------------------------
// BM25 scoring
// ---------------------------------------------------------------------------

interface BM25Doc {
  tf: Map<string, number>;    // term frequency
  length: number;             // number of tokens
}

function buildBM25Docs(flows: IndexedFlow[]): BM25Doc[] {
  return flows.map(flow => {
    const tf = new Map<string, number>();
    for (const tok of flow.lexicalTokens) {
      tf.set(tok, (tf.get(tok) ?? 0) + 1);
    }
    return { tf, length: flow.lexicalTokens.length };
  });
}

/**
 * BM25 search.
 *
 * Returns flows with a positive score, sorted descending. Only flows
 * containing at least one query term will appear.
 */
export function bm25Search(
  query: string,
  flows: IndexedFlow[],
  index: Map<string, number[]>,
): Array<{ flow: IndexedFlow; score: number }> {
  if (flows.length === 0) return [];

  const queryTokens = tokenizeWithCompounds(query);
  if (queryTokens.length === 0) return [];

  const N = flows.length;
  const docs = buildBM25Docs(flows);

  // Average document length
  const avgdl = docs.reduce((sum, d) => sum + d.length, 0) / N;

  // Candidate document set: union of all postings lists for query terms
  const candidateSet = new Set<number>();
  for (const qt of queryTokens) {
    const postings = index.get(qt);
    if (postings !== undefined) {
      for (const docIdx of postings) candidateSet.add(docIdx);
    }
  }

  if (candidateSet.size === 0) return [];

  const scores = new Map<number, number>();

  for (const qt of queryTokens) {
    // IDF — how rare is this term across the corpus?
    const postings = index.get(qt);
    const df = postings?.length ?? 0;
    if (df === 0) continue;

    // BM25 IDF: log((N - df + 0.5) / (df + 0.5) + 1)
    const idf = Math.log((N - df + 0.5) / (df + 0.5) + 1);

    for (const docIdx of postings!) {
      const doc = docs[docIdx];
      if (doc === undefined) continue;
      const tf = doc.tf.get(qt) ?? 0;
      if (tf === 0) continue;

      // BM25 TF normalisation
      const tfNorm = (tf * (K1 + 1)) / (tf + K1 * (1 - B + B * (doc.length / avgdl)));
      const termScore = idf * tfNorm;

      scores.set(docIdx, (scores.get(docIdx) ?? 0) + termScore);
    }
  }

  const results: Array<{ flow: IndexedFlow; score: number }> = [];
  for (const [docIdx, score] of scores.entries()) {
    const flow = flows[docIdx];
    if (flow !== undefined && score > 0) {
      results.push({ flow, score });
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results;
}
