// Search document, indexing, query, ranking and report contracts.
//
// Typed boundaries for search providers — not a search engine. The zero-trust
// invariants: indexing is allowlist-based (a field not named in the allowlist
// never reaches the index), declared PII may never be allowlisted, and every
// query must carry a bounded limit so no provider is asked for an unbounded
// result set.

export type SearchFieldKind = "text" | "keyword" | "number" | "boolean" | "date";

export interface SearchDocumentField {
  readonly name: string;
  readonly kind: SearchFieldKind;
  readonly searchable: boolean;
}

// A search document must be addressable (id) and must offer at least one
// searchable field — a document nothing can match is an indexing mistake.
export interface SearchDocumentContract {
  readonly id: string;
  readonly fields: readonly SearchDocumentField[];
}

// PII-safe indexing policy. fieldAllowlist is the only path into the index;
// piiFields declares which fields are personal data. The two sets must be
// disjoint: allowlisting a declared PII field is an error, not a warning.
export interface SearchIndexPolicy {
  readonly name: string;
  readonly fieldAllowlist: readonly string[];
  readonly piiFields: readonly string[];
}

export interface SearchIndexInput {
  readonly index: string;
  readonly document: SearchDocumentContract;
  readonly policy: SearchIndexPolicy;
}

export type SearchFilterOperator =
  | "eq"
  | "neq"
  | "lt"
  | "lte"
  | "gt"
  | "gte"
  | "in"
  | "prefix";

export interface SearchFilter {
  readonly field: string;
  readonly operator: SearchFilterOperator;
}

// Every query must be bounded: a missing or non-positive limit asks the
// provider for an unbounded result set.
export interface SearchQueryContract {
  readonly index: string;
  readonly text?: string;
  readonly filters: readonly SearchFilter[];
  readonly limit: number;
  readonly offset?: number;
}

export type SearchRankingStrategy = "relevance" | "recency" | "field_boost";

export interface SearchFieldBoost {
  readonly field: string;
  readonly factor: number;
}

export interface SearchRankingMetadata {
  readonly strategy: SearchRankingStrategy;
  readonly boosts?: readonly SearchFieldBoost[];
}

export interface SearchIndexReport {
  readonly index: string;
  readonly policy: string;
  readonly documentCount: number;
  readonly skippedFieldCount: number;
  readonly diagnostics: readonly SearchDiagnostic[];
  readonly warnings: readonly string[];
}

export type SearchDiagnosticSeverity = "warning" | "error";

export interface SearchDiagnostic {
  readonly code: string;
  readonly severity: SearchDiagnosticSeverity;
  readonly message: string;
  readonly path?: string;
}

const KNOWN_FIELD_KINDS: ReadonlySet<string> = new Set([
  "text",
  "keyword",
  "number",
  "boolean",
  "date",
]);

const KNOWN_FILTER_OPERATORS: ReadonlySet<string> = new Set([
  "eq",
  "neq",
  "lt",
  "lte",
  "gt",
  "gte",
  "in",
  "prefix",
]);

const KNOWN_RANKING_STRATEGIES: ReadonlySet<string> = new Set([
  "relevance",
  "recency",
  "field_boost",
]);

function searchDiagnostic(
  code: string,
  severity: SearchDiagnosticSeverity,
  message: string,
  path?: string,
): SearchDiagnostic {
  return {
    code,
    severity,
    message,
    ...(path === undefined ? {} : { path }),
  };
}

function isPositiveSafeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

function isNonNegativeSafeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

export function validateSearchDocument(
  document: SearchDocumentContract,
  path = "document",
): readonly SearchDiagnostic[] {
  const diagnostics: SearchDiagnostic[] = [];

  if (document.id.trim().length === 0) {
    diagnostics.push(searchDiagnostic(
      "Galerina_DATA_SEARCH_DOCUMENT_ID_REQUIRED",
      "error",
      "Search document requires an id.",
      `${path}.id`,
    ));
  }

  if (document.fields.length === 0) {
    diagnostics.push(searchDiagnostic(
      "Galerina_DATA_SEARCH_FIELDS_REQUIRED",
      "error",
      "Search document requires at least one field.",
      `${path}.fields`,
    ));
  } else if (!document.fields.some((field) => field.searchable)) {
    diagnostics.push(searchDiagnostic(
      "Galerina_DATA_SEARCH_SEARCHABLE_FIELD_REQUIRED",
      "error",
      "Search document requires at least one searchable field.",
      `${path}.fields`,
    ));
  }

  const seen = new Set<string>();
  document.fields.forEach((field, index) => {
    if (field.name.trim().length === 0) {
      diagnostics.push(searchDiagnostic(
        "Galerina_DATA_SEARCH_FIELD_NAME_REQUIRED",
        "error",
        "Search document field requires a name.",
        `${path}.fields.${index}.name`,
      ));
      return;
    }
    if (seen.has(field.name)) {
      diagnostics.push(searchDiagnostic(
        "Galerina_DATA_SEARCH_FIELD_DUPLICATE",
        "error",
        `Search document field "${field.name}" is declared more than once.`,
        `${path}.fields.${index}.name`,
      ));
    }
    seen.add(field.name);

    if (!KNOWN_FIELD_KINDS.has(field.kind)) {
      diagnostics.push(searchDiagnostic(
        "Galerina_DATA_SEARCH_FIELD_KIND_UNKNOWN",
        "error",
        `Search field kind "${String(field.kind)}" is not a known kind.`,
        `${path}.fields.${index}.kind`,
      ));
    }
  });

  return diagnostics;
}

// PII-safe indexing: the allowlist is the only path into the index, and a
// declared PII field inside it is a contradiction resolved fail-closed as an
// error. An empty allowlist is valid but indexes nothing, so it warns.
export function validateSearchIndexPolicy(
  policy: SearchIndexPolicy,
  path = "policy",
): readonly SearchDiagnostic[] {
  const diagnostics: SearchDiagnostic[] = [];

  if (policy.name.trim().length === 0) {
    diagnostics.push(searchDiagnostic(
      "Galerina_DATA_SEARCH_POLICY_NAME_REQUIRED",
      "error",
      "Search index policy requires a name.",
      `${path}.name`,
    ));
  }

  if (policy.fieldAllowlist.length === 0) {
    diagnostics.push(searchDiagnostic(
      "Galerina_DATA_SEARCH_ALLOWLIST_EMPTY",
      "warning",
      "Search index field allowlist is empty; the policy is valid but indexes nothing.",
      `${path}.fieldAllowlist`,
    ));
  }

  const pii = new Set(policy.piiFields);
  policy.fieldAllowlist.forEach((field, index) => {
    if (field.trim().length === 0) {
      diagnostics.push(searchDiagnostic(
        "Galerina_DATA_SEARCH_FIELD_NAME_REQUIRED",
        "error",
        "Search allowlist field names must be non-empty.",
        `${path}.fieldAllowlist.${index}`,
      ));
      return;
    }
    if (pii.has(field)) {
      diagnostics.push(searchDiagnostic(
        "Galerina_DATA_SEARCH_PII_FIELD_INDEXED",
        "error",
        `Field "${field}" is declared PII and may never be allowlisted for indexing.`,
        `${path}.fieldAllowlist.${index}`,
      ));
    }
  });

  return diagnostics;
}

export function validateSearchIndexInput(
  input: SearchIndexInput,
): readonly SearchDiagnostic[] {
  const diagnostics: SearchDiagnostic[] = [];

  if (input.index.trim().length === 0) {
    diagnostics.push(searchDiagnostic(
      "Galerina_DATA_SEARCH_INDEX_NAME_REQUIRED",
      "error",
      "Search index input requires an index name.",
      "index",
    ));
  }

  diagnostics.push(...validateSearchDocument(input.document));
  diagnostics.push(...validateSearchIndexPolicy(input.policy));

  // Deny-by-default consequence made visible: if none of the document's
  // searchable fields survive the allowlist, indexing is a silent no-op —
  // report it instead of letting the caller believe the document is findable.
  const allowlist = new Set(input.policy.fieldAllowlist);
  const indexable = input.document.fields.some(
    (field) => field.searchable && allowlist.has(field.name),
  );
  if (input.document.fields.length > 0 && !indexable) {
    diagnostics.push(searchDiagnostic(
      "Galerina_DATA_SEARCH_NO_INDEXABLE_FIELDS",
      "warning",
      "No searchable document field is in the policy allowlist; nothing will be indexed.",
      "document.fields",
    ));
  }

  return diagnostics;
}

export function validateSearchQuery(
  query: SearchQueryContract,
): readonly SearchDiagnostic[] {
  const diagnostics: SearchDiagnostic[] = [];

  if (query.index.trim().length === 0) {
    diagnostics.push(searchDiagnostic(
      "Galerina_DATA_SEARCH_INDEX_NAME_REQUIRED",
      "error",
      "Search query requires an index name.",
      "index",
    ));
  }

  if (!isPositiveSafeInteger(query.limit)) {
    diagnostics.push(searchDiagnostic(
      "Galerina_DATA_SEARCH_QUERY_LIMIT_REQUIRED",
      "error",
      "Search query requires a positive integer limit; unbounded result sets are unsafe.",
      "limit",
    ));
  }

  if (query.offset !== undefined && !isNonNegativeSafeInteger(query.offset)) {
    diagnostics.push(searchDiagnostic(
      "Galerina_DATA_SEARCH_QUERY_OFFSET_INVALID",
      "error",
      "Search query offset, when set, must be a non-negative integer.",
      "offset",
    ));
  }

  query.filters.forEach((filter, index) => {
    if (filter.field.trim().length === 0) {
      diagnostics.push(searchDiagnostic(
        "Galerina_DATA_SEARCH_FILTER_FIELD_REQUIRED",
        "error",
        "Search filter requires a field name.",
        `filters.${index}.field`,
      ));
    }
    if (!KNOWN_FILTER_OPERATORS.has(filter.operator)) {
      diagnostics.push(searchDiagnostic(
        "Galerina_DATA_SEARCH_FILTER_OPERATOR_UNKNOWN",
        "error",
        `Search filter operator "${String(filter.operator)}" is not a known operator.`,
        `filters.${index}.operator`,
      ));
    }
  });

  return diagnostics;
}

export function validateSearchRanking(
  ranking: SearchRankingMetadata,
): readonly SearchDiagnostic[] {
  const diagnostics: SearchDiagnostic[] = [];

  if (!KNOWN_RANKING_STRATEGIES.has(ranking.strategy)) {
    diagnostics.push(searchDiagnostic(
      "Galerina_DATA_SEARCH_RANKING_STRATEGY_UNKNOWN",
      "error",
      `Search ranking strategy "${String(ranking.strategy)}" is not a known strategy.`,
      "strategy",
    ));
  }

  if (ranking.strategy === "field_boost") {
    const boosts = ranking.boosts ?? [];
    if (boosts.length === 0) {
      diagnostics.push(searchDiagnostic(
        "Galerina_DATA_SEARCH_BOOSTS_REQUIRED",
        "error",
        "field_boost ranking requires at least one field boost.",
        "boosts",
      ));
    }
    boosts.forEach((boost, index) => {
      if (boost.field.trim().length === 0 || !(boost.factor > 0) || !Number.isFinite(boost.factor)) {
        diagnostics.push(searchDiagnostic(
          "Galerina_DATA_SEARCH_BOOST_INVALID",
          "error",
          "Field boosts require a field name and a positive finite factor.",
          `boosts.${index}`,
        ));
      }
    });
  }

  return diagnostics;
}

export function createSearchIndexReport(input: {
  readonly index: string;
  readonly policy: SearchIndexPolicy;
  readonly documentCount: number;
  readonly skippedFieldCount: number;
}): SearchIndexReport {
  const diagnostics: SearchDiagnostic[] = [];

  if (input.index.trim().length === 0) {
    diagnostics.push(searchDiagnostic(
      "Galerina_DATA_SEARCH_INDEX_NAME_REQUIRED",
      "error",
      "Search index report requires an index name.",
      "index",
    ));
  }

  diagnostics.push(...validateSearchIndexPolicy(input.policy));

  if (!isNonNegativeSafeInteger(input.documentCount)) {
    diagnostics.push(searchDiagnostic(
      "Galerina_DATA_SEARCH_COUNT_INVALID",
      "error",
      "Search index documentCount must be a non-negative integer.",
      "documentCount",
    ));
  }

  if (!isNonNegativeSafeInteger(input.skippedFieldCount)) {
    diagnostics.push(searchDiagnostic(
      "Galerina_DATA_SEARCH_COUNT_INVALID",
      "error",
      "Search index skippedFieldCount must be a non-negative integer.",
      "skippedFieldCount",
    ));
  }

  return {
    index: input.index,
    policy: input.policy.name,
    documentCount: input.documentCount,
    skippedFieldCount: input.skippedFieldCount,
    diagnostics,
    warnings: diagnostics
      .filter((diagnostic) => diagnostic.severity === "warning")
      .map((diagnostic) => diagnostic.message),
  };
}
