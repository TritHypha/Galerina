// Explain contracts + command barrel (TODO pass, Grok 2026-10-05; zero-trust defaults, owner may revisit).
// Re-exports closed-shape ExplainTrace / ExplainResult / buildTrace, denial reader,
// dependency-tree / runtime-profile explain, explain-report emitter, and CLI wiring.
// --policy / --audit still refuse.

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

export {
  FUNGI_EXPLAIN_005,
  FUNGI_EXPLAIN_006,
  DEPLOYMENT_DENIAL_SCHEMA,
  DEPLOYMENT_DENIAL_REASON_CODES,
  DEPLOYMENT_DENIAL_FIELDS,
  isDeploymentDenialReasonCode,
  readDeploymentDenial,
  explainDenial,
} from "./explain/explain-denial.js";

export type {
  DeploymentDenialReasonCode,
  DeploymentDenial,
} from "./explain/explain-denial.js";


export {
  FUNGI_EXPLAIN_007,
  FUNGI_EXPLAIN_008,
  EXPLAIN_DEPENDENCY_TREE_SCHEMA,
  EXPLAIN_DEPENDENCY_TREE_FIELDS,
  EXPLAIN_DEPENDENCY_EDGE_FIELDS,
  readExplainDependencyTree,
  explainDependencyTree,
} from "./explain/explain-tree.js";

export type {
  ExplainDependencyEdge,
  ExplainDependencyTree,
} from "./explain/explain-tree.js";

export {
  FUNGI_EXPLAIN_009,
  FUNGI_EXPLAIN_010,
  EXPLAIN_RUNTIME_PROFILE_SCHEMA,
  EXPLAIN_RUNTIME_TARGETS,
  EXPLAIN_RUNTIME_PROFILE_FIELDS,
  isExplainRuntimeTarget,
  readExplainRuntimeProfile,
  explainRuntimeProfile,
} from "./explain/explain-runtime.js";

export type {
  ExplainRuntimeTarget,
  ExplainRuntimeProfile,
} from "./explain/explain-runtime.js";

export {
  createExplainReport,
  renderExplainReport,
  writeExplainReport,
  EXPLAIN_REPORT_SCHEMA,
  EXPLAIN_REPORT_FILE,
  EXPLAIN_REPORT_LIMITATIONS,
} from "./explain/explain-reporter.js";

export type {
  ExplainReport,
  ExplainReportDiagnostic,
  ExplainReportTrace,
} from "./explain/explain-reporter.js";

export {
  runExplainCommand,
  parseExplainArgs,
  FUNGI_CLI_EXPLAIN_001,
  FUNGI_CLI_EXPLAIN_002,
  FUNGI_CLI_EXPLAIN_003,
  FUNGI_CLI_EXPLAIN_004,
  FUNGI_CLI_EXPLAIN_005,
  EXPLAIN_EXIT_OK,
  EXPLAIN_EXIT_USAGE,
  EXPLAIN_EXIT_VALIDATION,
} from "./explain/explain-command.js";

export type { ExplainCommandOptions, ExplainFlagName } from "./explain/explain-command.js";
