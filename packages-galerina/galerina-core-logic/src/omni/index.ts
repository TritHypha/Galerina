// =============================================================================
// @galerina/core-logic/omni — OmniState v0.2 sub-path export
// =============================================================================

export type { OmniState, OmniEvidence, OmniDecision } from "./omni-state.js";
export {
  OMNI_UNCERTAIN_STATES,
  OMNI_STATES,
  isOmniState,
  isOmniUncertain,
} from "./omni-state.js";

export {
  OMNI_MIN_ALLOW_CONFIDENCE,
  omniToDecision,
} from "./omni-to-decision.js";

export {
  SPORE_OMNI_001_DIRECT_BOUNDARY_USE,
  SPORE_OMNI_002_ADVISORY_ONLY_VIOLATED,
  SPORE_OMNI_003_CONFIDENCE_OUT_OF_RANGE,
  SPORE_OMNI_004_MALFORMED_EVIDENCE,
  SPORE_OMNI_005_INVALID_STATE,
  omniDiagnosticDirectBoundaryUse,
  omniDiagnosticAdvisoryOnlyViolated,
  omniDiagnosticConfidenceOutOfRange,
  omniDiagnosticMalformedEvidence,
  omniDiagnosticInvalidState,
} from "./omni-diagnostics.js";
