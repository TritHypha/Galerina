// Deploy contracts barrel (TODO pass, Grok 2026-10-05; zero-trust defaults, owner may revisit).
// Re-exports closed-shape DeploymentTarget / DeploymentResult / validateEffects from deploy/,
// plus deploy-command wiring and deployment-report emitter.

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
} from "./deploy/deploy-validator.js";

export type {
  DeploymentTarget,
  DeployDiagnostic,
  DeployDiagnosticField,
  EffectsPolicy,
  DeployManifestSlice,
  ValidateEffectsInput,
  DeploymentResult,
} from "./deploy/deploy-validator.js";

export {
  createDeploymentReport,
  renderDeploymentReport,
  writeDeploymentReport,
  DEPLOYMENT_REPORT_SCHEMA,
  DEPLOYMENT_REPORT_FILE,
  DEPLOYMENT_REPORT_LIMITATIONS,
} from "./deploy/deploy-report.js";

export type {
  DeploymentReport,
  DeploymentReportDiagnostic,
} from "./deploy/deploy-report.js";

export {
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
} from "./deploy/deploy-command.js";

export type { DeployCommandOptions, DeployFlagName } from "./deploy/deploy-command.js";
