// =============================================================================
// galerina-devtools-intelligence — Core types
//
// IndexedFlow: the unit of search. One flow = one AST-complete unit.
// SearchResult: ranked result with BM25 + structural match info.
// =============================================================================

export interface IndexedFlow {
  /** sha256 hash of filePath + flowName (stable ID) */
  id: string;
  flowName: string;
  qualifier: string;                 // 'flow' | 'secure' | 'pure' | 'guarded'
  filePath: string;
  // BM25 inverted index tokens (all identifiers, fully spelled)
  lexicalTokens: string[];
  // Structural metadata for filtered search
  declaredEffects: string[];
  economicsHints: string[];          // raw contract.economics content strings
  hasTaint: boolean;
  governanceCodes: string[];         // SPORE-GOV-xxx etc codes that fire
  hasSecrets: boolean;
  qualifier_tags: string[];          // ['secure', 'has-intent', 'has-economics'] etc
  // Source info
  contractText: string;              // the contract block text (for display)
  signatureText: string;             // "flow name(params) -> RetType"
  lineStart: number;
  lineEnd: number;
  indexedAt: string;
  /** Mtime of the source file at index time (ms since epoch) — used for incremental update */
  sourceMtime: number;
}

export interface SearchResult {
  flow: IndexedFlow;
  bm25Score: number;
  structuralMatch: boolean;
  rankScore: number;                 // combined rank
}

export interface SearchFilters {
  /** Only flows declaring ALL of these effects */
  effects?: string[];
  /** 'secure' | 'pure' | 'guarded' | 'flow' */
  qualifier?: string;
  hasTaint?: boolean;
  maxRiskTier?: 'low' | 'medium' | 'high';
}

/** The on-disk .lindex file format */
export interface WorkspaceIndex {
  version: 1;
  builtAt: string;
  workspaceDir: string;
  flows: IndexedFlow[];
  /** SHA-256 content hashes keyed by absolute file path — used for differential re-indexing */
  fileHashes?: Record<string, string>;
  /** Number of files skipped (content unchanged) in the last build */
  skippedFiles?: number;
  /**
   * SPORE-INTEL-001 integrity tag over the canonical index (all fields except this one).
   * `hmac-sha256:<hex>` when GALERINA_INDEX_HMAC_KEY is set (tamper-RESISTANT), else `sha256:<hex>`
   * (tamper-EVIDENT). Verified on load; any mismatch / absence → the cached index is DISCARDED and
   * the workspace is fully re-parsed (fail-closed — a poisoned/corrupt cache is never trusted).
   */
  integrity?: string;
}
