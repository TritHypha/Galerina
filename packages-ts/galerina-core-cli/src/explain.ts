// Explain contracts + command barrel (TODO pass, Grok 2026-10-05; zero-trust defaults, owner may revisit).
// Re-exports closed-shape ExplainTrace / ExplainResult / buildTrace, denial reader,
// explain-report emitter, and CLI wiring. Tree/runtime helpers remain open.

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
