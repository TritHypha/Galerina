// =============================================================================
// OmniState diagnostic codes — SPORE-OMNI series
// =============================================================================

import type { LogicDiagnostic } from "../index.js";

// ---------------------------------------------------------------------------
// Diagnostic code constants
// ---------------------------------------------------------------------------

/** SPORE-OMNI-001: OmniDecision reached a deterministic boundary without going through omniToDecision(). */
export const SPORE_OMNI_001_DIRECT_BOUNDARY_USE = "SPORE-OMNI-001";

/** SPORE-OMNI-002: OmniDecision.advisoryOnly is false — this violates the advisory contract. */
export const SPORE_OMNI_002_ADVISORY_ONLY_VIOLATED = "SPORE-OMNI-002";

/** SPORE-OMNI-003: OmniDecision.confidence is outside the [0, 1] range. */
export const SPORE_OMNI_003_CONFIDENCE_OUT_OF_RANGE = "SPORE-OMNI-003";

/** SPORE-OMNI-004: OmniEvidence is missing a required field. */
export const SPORE_OMNI_004_MALFORMED_EVIDENCE = "SPORE-OMNI-004";

/** SPORE-OMNI-005: OmniState value is not a recognised state string. */
export const SPORE_OMNI_005_INVALID_STATE = "SPORE-OMNI-005";

// ---------------------------------------------------------------------------
// Diagnostic constructors
// ---------------------------------------------------------------------------

export function omniDiagnosticDirectBoundaryUse(path?: string): LogicDiagnostic {
  return {
    code: SPORE_OMNI_001_DIRECT_BOUNDARY_USE,
    name: "DIRECT_BOUNDARY_USE",
    severity: "error",
    message: "OmniDecision must be converted via omniToDecision() before reaching a deterministic boundary. Never use OmniState values directly in capability or policy gates.",
    ...(path === undefined ? {} : { path }),
  };
}

export function omniDiagnosticAdvisoryOnlyViolated(path?: string): LogicDiagnostic {
  return {
    code: SPORE_OMNI_002_ADVISORY_ONLY_VIOLATED,
    name: "ADVISORY_ONLY_VIOLATED",
    severity: "error",
    message: "OmniDecision.advisoryOnly must always be true. Omni logic is advisory and must not control deterministic execution directly.",
    ...(path === undefined ? {} : { path }),
  };
}

export function omniDiagnosticConfidenceOutOfRange(
  confidence: number,
  path?: string,
): LogicDiagnostic {
  return {
    code: SPORE_OMNI_003_CONFIDENCE_OUT_OF_RANGE,
    name: "CONFIDENCE_OUT_OF_RANGE",
    severity: "error",
    message: `OmniDecision.confidence must be in the range [0, 1]. Received: ${confidence}.`,
    ...(path === undefined ? {} : { path }),
  };
}

export function omniDiagnosticMalformedEvidence(path?: string): LogicDiagnostic {
  return {
    code: SPORE_OMNI_004_MALFORMED_EVIDENCE,
    name: "MALFORMED_EVIDENCE",
    severity: "error",
    message: "OmniEvidence is missing a required field (code, message, or confidence).",
    ...(path === undefined ? {} : { path }),
  };
}

export function omniDiagnosticInvalidState(
  value: unknown,
  path?: string,
): LogicDiagnostic {
  return {
    code: SPORE_OMNI_005_INVALID_STATE,
    name: "INVALID_STATE",
    severity: "error",
    message: `"${String(value)}" is not a valid OmniState. Expected one of: true, false, unknown, partial_true, partial_false, conflicted, deferred, inconsistent.`,
    ...(path === undefined ? {} : { path }),
  };
}
