/**
 * cli-check composition entry (`TOWER_COMPOSITION_CLI_CHECK`).
 *
 * Kernel-free K3 decisions, compiled ai{}, and No-Coercion admission.
 * This is not `tower.governance.v1` (frozen as kernel + governance).
 * Transitive runtime imports are trit-gates plus this cluster; see
 * tests/rd-1295-governance-isolation.test.mjs and src/load-graph.ts.
 */

export {
  Verdict, asVerdict, vAnd, vOr, vNot, allOf, anyOf, collapse, authorize,
  decideAtBoundary, GOV_3VL_DIAGNOSTIC,
  vAndTensor, vAndTensor2D, consensusTritN, collapseConfidence,
} from "./three-valued-governance.js";
export type { ConfidenceVerdict } from "./three-valued-governance.js";
export type { GovernanceDiagnostic, BoundaryDecision, BoundaryDiagnostic } from "./three-valued-governance.js";

export {
  Trust,
  unverified, trustedRoot, refute, discharge,
  map, combine, combineAll,
  isTrusted, isUnverified, isRefuted, trustOf,
  requireTrusted,
  optimistic, reconcile,
  allContracts, anyContract, evaluateContract,
  validateTriSchema,
  classJoin, triTyped, combineTriTyped, declassify, releaseTo,
} from "./epistemic-type-state.js";
export type {
  Epistemic, Trusted, Unverified, Refuted, TrustBoundaryResult,
  Contract, EnforcementMode, ContractOutcome,
  FieldRequirement, TriFieldSpec, TriSchema, TriFieldResult, TriSchemaResult,
  Classification, TriTyped, ReleaseResult,
} from "./epistemic-type-state.js";

export { governAiProposal } from "./ai-governance.js";
export type { AiActionProposal, AiActionDecision, AiGovernanceResult } from "./ai-governance.js";

export {
  compilePolicy,
  POL_HAS_ALLOWLIST, POL_DENY_HOST_NATIVE, POL_HAS_CALL_BUDGET,
  POL_HAS_TOKEN_BUDGET, POL_HAS_COST_CEILING,
} from "./compiled-policy.js";
export type { CompiledPolicy, PolicyTrap } from "./compiled-policy.js";

export { GateCache, defaultGateCache, compilePolicyCached, policyCacheKey } from "./gate-cache.js";
export type { GateCacheStats } from "./gate-cache.js";

export { GovernanceEnforcer, TPL_DEFAULT_POLICY } from "./governance-enforcer.js";
export type { TransitionPolicy, RestrictedTransition } from "./governance-enforcer.js";

export {
  TOWER_PROFILE_GOVERNANCE,
  TOWER_COMPOSITION_CLI_CHECK,
  CLI_CHECK_ALLOWED_STEMS,
  CLI_CHECK_PERMITTED_EXTERNALS,
  GOVERNANCE_PROFILE_MODULES,
  GOVERNANCE_FORBIDDEN_MODULES,
  moduleStem,
  forbiddenProfileModules,
} from "./product-profiles.js";
