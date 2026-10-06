#!/usr/bin/env node
import { formatCliResult } from "./output.js";
import { runCli } from "./cli.js";

export { runCli, FUNGI_CLI_001, FUNGI_CLI_002, FUNGI_CLI_003 } from "./cli.js";
export { verifyHash, verifyArtefacts, sha256File, FUNGI_VERIFY_001, FUNGI_VERIFY_002, FUNGI_VERIFY_003, FUNGI_VERIFY_004, FUNGI_VERIFY_005 } from "./verify.js";
export type { BuildArtefact, BuildArtefactKind, VerifiedArtefact, VerificationResult, VerifyDiagnostic } from "./verify.js";
export { createVerificationReport, renderVerificationReport, writeVerificationReport, VERIFICATION_REPORT_FILE, VERIFICATION_REPORT_LIMITATIONS, VERIFICATION_REPORT_SCHEMA } from "./verify/verify-reporter.js";
export type { VerificationReport, VerificationReportArtefact, VerificationReportDiagnostic, VerificationReportManifestRecord, VerificationReportManifests, VerificationReportOptions } from "./verify/verify-reporter.js";
export { verifyRuntimeManifest, verifyRuntimeManifestSet, RUNTIME_MANIFEST_SCHEMA, RUNTIME_MANIFEST_FIELDS, RUNTIME_MANIFEST_GOVERNANCE_FLAGS, RUNTIME_MANIFEST_QUALIFIERS, RUNTIME_MANIFEST_COMPUTE_TARGETS, RUNTIME_MANIFEST_MAX_SET, FUNGI_VERIFY_006, FUNGI_VERIFY_007, FUNGI_VERIFY_008, FUNGI_VERIFY_009, FUNGI_VERIFY_010, FUNGI_VERIFY_011 } from "./verify/verify-manifest.js";
export type { ManifestDiagnostic, ManifestDiagnosticField, RuntimeManifestField, RuntimeManifestVerification, VerifiedRuntimeManifest } from "./verify/verify-manifest.js";
export { commands, findCommand } from "./commands.js";
export { formatCliResult } from "./output.js";
export { redactCliOutput, redactCliOutputChecked, FUNGI_CLI_REDACT_001 } from "./security.js";
export type { RedactionResult } from "./security.js";
export type { CliCommand, CliContext, CliEnvironment, CliError, CliResult } from "./types.js";

if (process.argv[1]?.endsWith("index.js") === true) {
  const result = await runCli(process.argv.slice(2), process.cwd());
  const output = formatCliResult(result);

  if (output.length > 0) {
    console.log(output);
  }

  process.exitCode = result.code;
}

export {
  readBuildArtefact,
  verifyArtefactIntegrity,
  verifyArtefactIntegritySet,
  BUILD_ARTEFACT_FIELDS,
  BUILD_ARTEFACT_KINDS,
} from "./verify/verify-integrity.js";
export type {
  BuildArtefactField,
  BuildArtefactRead,
  BuildArtefactRefuse,
  BuildArtefactReadResult,
} from "./verify/verify-integrity.js";
export {
  runVerifyCommand,
  parseVerifyArgs,
  FUNGI_CLI_VERIFY_001,
  FUNGI_CLI_VERIFY_002,
  FUNGI_CLI_VERIFY_003,
  FUNGI_CLI_VERIFY_004,
  FUNGI_CLI_VERIFY_005,
  VERIFY_EXIT_OK,
  VERIFY_EXIT_USAGE,
  VERIFY_EXIT_RUNTIME,
  VERIFY_EXIT_VALIDATION,
  VERIFY_EXIT_CAPABILITY,
  VERIFY_EXIT_ARTEFACT,
  VERIFY_EXIT_MANIFEST,
} from "./verify/verify-command.js";
export type { VerifyCommandOptions, VerifyFlagName } from "./verify/verify-command.js";
export {
  verifyAuditReport,
  verifyCapabilityReport,
  verifyRuntimeCompatibility,
  AUDIT_REPORT_SCHEMA,
  CAPABILITY_REPORT_SCHEMA,
  AUDIT_REPORT_CATEGORIES,
  AUDIT_REPORT_STATUSES,
  AUDIT_REPORT_FIELDS,
  CAPABILITY_REPORT_FIELDS,
  CAPABILITY_ROW_FIELDS,
  FUNGI_VERIFY_012,
  FUNGI_VERIFY_013,
  FUNGI_VERIFY_014,
  FUNGI_VERIFY_015,
  FUNGI_VERIFY_016,
} from "./verify/verify-runtime.js";
export type { RuntimeReportDiagnostic, RuntimeReportField, RuntimeReportVerification } from "./verify/verify-runtime.js";

export {
  FUNGI_DEPLOY_001,
  FUNGI_DEPLOY_002,
  FUNGI_DEPLOY_003,
  FUNGI_DEPLOY_004,
  FUNGI_DEPLOY_005,
  DEPLOYMENT_TARGETS,
  DEPLOYMENT_RESULT_FIELDS,
  EFFECTS_POLICY_FIELDS,
  DEPLOY_MANIFEST_SLICE_FIELDS,
  VALIDATE_EFFECTS_INPUT_FIELDS,
  isDeploymentTarget,
  readDeploymentResult,
  createDeploymentResult,
  validateEffects,
  createDeploymentReport,
  renderDeploymentReport,
  writeDeploymentReport,
  DEPLOYMENT_REPORT_SCHEMA,
  DEPLOYMENT_REPORT_FILE,
  DEPLOYMENT_REPORT_LIMITATIONS,
  runDeployCommand,
  parseDeployArgs,
  FUNGI_CLI_DEPLOY_001,
  FUNGI_CLI_DEPLOY_002,
  FUNGI_CLI_DEPLOY_003,
  FUNGI_CLI_DEPLOY_004,
  FUNGI_CLI_DEPLOY_005,
  DEPLOY_EXIT_OK,
  DEPLOY_EXIT_USAGE_OR_POLICY,
  DEPLOY_EXIT_TARGET,
  DEPLOY_EXIT_VALIDATION,
  DEPLOY_EXIT_CAPABILITY,
  DEPLOY_EXIT_VERIFY,
  DEPLOY_EXIT_MANIFEST,
} from "./deploy.js";
export type {
  DeploymentTarget,
  DeployDiagnostic,
  DeployDiagnosticField,
  EffectsPolicy,
  DeployManifestSlice,
  ValidateEffectsInput,
  DeploymentResult,
  DeploymentReport,
  DeploymentReportDiagnostic,
  DeployCommandOptions,
  DeployFlagName,
} from "./deploy.js";

export {
  FUNGI_EXPLAIN_001,
  FUNGI_EXPLAIN_002,
  FUNGI_EXPLAIN_003,
  FUNGI_EXPLAIN_004,
  FUNGI_EXPLAIN_005,
  FUNGI_EXPLAIN_006,
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
  DEPLOYMENT_DENIAL_SCHEMA,
  DEPLOYMENT_DENIAL_REASON_CODES,
  DEPLOYMENT_DENIAL_FIELDS,
  isDeploymentDenialReasonCode,
  readDeploymentDenial,
  explainDenial,
  createExplainReport,
  renderExplainReport,
  writeExplainReport,
  EXPLAIN_REPORT_SCHEMA,
  EXPLAIN_REPORT_FILE,
  EXPLAIN_REPORT_LIMITATIONS,
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
} from "./explain.js";
export type {
  ExplainTraceLabel,
  ExplainDiagnostic,
  ExplainDiagnosticField,
  ExplainTrace,
  ExplainManifestSlice,
  ExplainOptions,
  ExplainResult,
  DeploymentDenialReasonCode,
  DeploymentDenial,
  ExplainReport,
  ExplainReportDiagnostic,
  ExplainReportTrace,
  ExplainCommandOptions,
  ExplainFlagName,
} from "./explain.js";

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
} from "./plan.js";
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
} from "./plan.js";
