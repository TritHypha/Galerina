// Plan contracts + command barrel (TODO pass, Grok 2026-10-05; zero-trust defaults, owner may revisit).
// Re-exports closed-shape ComputePlan / estimateTarget, compute-plan.json reporter, and CLI wiring.
// --runtime / --energy / --graph still refuse (live probe HOLD).

export {
  FUNGI_PLAN_001,
  FUNGI_PLAN_002,
  FUNGI_PLAN_003,
  FUNGI_PLAN_004,
  PLAN_RUNTIME_TARGETS,
  PLAN_GPU_SUITABILITIES,
  PLAN_OPTICAL_NEEDS,
  PLAN_OPTICAL_MODES,
  PLAN_OPTICAL_FALLBACK_TARGETS,
  PLAN_WASM_TARGETS,
  PLAN_GPU_SCHEMA,
  PLAN_OPTICAL_SCHEMA,
  PLAN_COMPAT_SCHEMA,
  COMPUTE_PLAN_FIELDS,
  PLAN_GPU_FIELDS,
  PLAN_OPTICAL_FIELDS,
  PLAN_COMPAT_FIELDS,
  PLAN_WORKSPACE_FIELDS,
  PLAN_OPTIONS_FIELDS,
  isPlanRuntimeTarget,
  isPlanGpuSuitability,
  isPlanOpticalNeed,
  isPlanOpticalMode,
  isPlanOpticalFallbackTarget,
  isPlanWasmTarget,
  estimateTarget,
  createComputePlan,
  readComputePlan,
} from "./plan/plan-contracts.js";

export type {
  PlanRuntimeTarget,
  PlanGpuSuitability,
  PlanOpticalNeed,
  PlanOpticalMode,
  PlanOpticalFallbackTarget,
  PlanWasmTarget,
  PlanDiagnosticField,
  PlanDiagnostic,
  PlanGpuPlan,
  PlanOpticalPlan,
  PlanCompatibility,
  PlanWorkspaceInput,
  PlanOptions,
  ComputePlan,
  ReadComputePlanResult,
} from "./plan/plan-contracts.js";

export {
  createComputePlanReport,
  renderComputePlanReport,
  writeComputePlanReport,
  COMPUTE_PLAN_REPORT_SCHEMA,
  COMPUTE_PLAN_REPORT_FILE,
  COMPUTE_PLAN_REPORT_LIMITATIONS,
} from "./plan/plan-reporter.js";

export type {
  ComputePlanReport,
  ComputePlanReportDiagnostic,
  ComputePlanReportGpu,
  ComputePlanReportOptical,
  ComputePlanReportCompat,
} from "./plan/plan-reporter.js";

export {
  runPlanCommand,
  parsePlanArgs,
  FUNGI_CLI_PLAN_001,
  FUNGI_CLI_PLAN_002,
  FUNGI_CLI_PLAN_003,
  FUNGI_CLI_PLAN_004,
  FUNGI_CLI_PLAN_005,
  PLAN_EXIT_OK,
  PLAN_EXIT_USAGE,
  PLAN_EXIT_VALIDATION,
} from "./plan/plan-command.js";

export type {
  PlanCommandOptions,
  PlanFlagName,
} from "./plan/plan-command.js";
