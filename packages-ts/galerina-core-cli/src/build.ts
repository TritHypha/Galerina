// Build contracts + command barrel (TODO pass, Grok 2026-10-05; zero-trust defaults, owner may revisit).
// Re-exports closed-shape BuildResult / BuildWorkspaceInput / buildWorkspace,
// build-report.json reporter, and CLI wiring.
// --audit still refuses (audit-report emit HOLD until 14-pass pipeline).
// build-pipeline / build-artifacts / build-integrity remain open.

export {
  FUNGI_BUILD_001,
  FUNGI_BUILD_002,
  FUNGI_BUILD_003,
  FUNGI_BUILD_004,
  FUNGI_BUILD_005,
  BUILD_RUNTIME_TARGETS,
  BUILD_RESULT_FIELDS,
  BUILD_WORKSPACE_INPUT_FIELDS,
  isBuildRuntimeTarget,
  createBuildResult,
  readBuildResult,
  readBuildWorkspaceInput,
  buildWorkspace,
} from "./build/build-contracts.js";

export type {
  BuildRuntimeTarget,
  BuildDiagnosticField,
  BuildDiagnostic,
  BuildWorkspaceInput,
  BuildResult,
  ReadBuildResultResult,
  ReadBuildWorkspaceInputResult,
} from "./build/build-contracts.js";

export {
  createBuildReport,
  renderBuildReport,
  writeBuildReport,
  BUILD_REPORT_SCHEMA,
  BUILD_REPORT_FILE,
  BUILD_REPORT_LIMITATIONS,
} from "./build/build-reporter.js";

export type {
  BuildReport,
  BuildReportDiagnostic,
  BuildReportArtefact,
} from "./build/build-reporter.js";

export {
  runBuildCommand,
  parseBuildArgs,
  FUNGI_CLI_BUILD_001,
  FUNGI_CLI_BUILD_002,
  FUNGI_CLI_BUILD_003,
  FUNGI_CLI_BUILD_004,
  FUNGI_CLI_BUILD_005,
  BUILD_EXIT_OK,
  BUILD_EXIT_USAGE,
  BUILD_EXIT_VALIDATION,
} from "./build/build-command.js";

export type {
  BuildCommandOptions,
  BuildFlagName,
} from "./build/build-command.js";
