// =============================================================================
// @galerina/devtools-provenance — Public API
// =============================================================================

export {
  analyzeFile,
  buildProvenanceGraph,
  collectLlnFiles,
  type FileProvenanceResult,
} from "./analyzer.js";

export {
  renderTextReport,
  renderJsonReport,
  renderProvReport,
  type ProvReportOptions,
} from "./reporter.js";

export type {
  DataNode,
  DataEdge,
  ProvenanceGraph,
  ProvenanceOptions,
  DataSourceKind,
  DataSinkKind,
  TransformKind,
} from "./types.js";

/** Package version */
export const DEVTOOLS_PROVENANCE_VERSION = "0.1.0";
