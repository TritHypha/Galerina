// Explain contracts barrel (TODO pass, Grok 2026-10-05; zero-trust defaults, owner may revisit).
// Re-exports closed-shape ExplainTrace / ExplainResult / buildTrace from explain/.
// CLI wiring, report writer, denial reader, and tree/runtime helpers remain open.

export {
  FUNGI_EXPLAIN_001,
  FUNGI_EXPLAIN_002,
  FUNGI_EXPLAIN_003,
  FUNGI_EXPLAIN_004,
  EXPLAIN_TRACE_LABELS,
  EXPLAIN_TRACE_FIELDS,
  EXPLAIN_RESULT_FIELDS,
  EXPLAIN_MANIFEST_SLICE_FIELDS,
  EXPLAIN_OPTIONS_FIELDS,
  isExplainTraceLabel,
  readExplainResult,
  createExplainResult,
  buildTrace,
  explainManifest,
} from "./explain/explain-trace.js";

export type {
  ExplainTraceLabel,
  ExplainDiagnostic,
  ExplainDiagnosticField,
  ExplainTrace,
  ExplainManifestSlice,
  ExplainOptions,
  ExplainResult,
} from "./explain/explain-trace.js";
