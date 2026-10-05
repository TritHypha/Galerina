// Build contracts barrel (TODO pass, Grok 2026-10-05; zero-trust defaults, owner may revisit).
// Re-exports closed-shape BuildResult / BuildWorkspaceInput / buildWorkspace only.
// No CLI / pipeline / reporter on this tip.

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
