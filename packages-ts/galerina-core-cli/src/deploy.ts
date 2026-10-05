// Deploy contracts barrel (TODO pass, Grok 2026-10-05; zero-trust defaults, owner may revisit).
// Re-exports closed-shape DeploymentTarget / DeploymentResult / validateEffects from deploy/.

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
