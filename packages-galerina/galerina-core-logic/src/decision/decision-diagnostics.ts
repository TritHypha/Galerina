// =============================================================================
// Decision v0.2 diagnostic codes — FUNGI-DECISION series
// =============================================================================

import type { LogicDiagnostic } from "../index.js";

// ---------------------------------------------------------------------------
// Diagnostic code constants
// ---------------------------------------------------------------------------

/** FUNGI-DECISION-001: Decision value does not match the expected 4-state shape. */
export const FUNGI_DECISION_001_INVALID_DECISION = "FUNGI-DECISION-001";

/** FUNGI-DECISION-002: deny() or review() produced with an empty reason string. */
export const FUNGI_DECISION_002_EMPTY_REASON = "FUNGI-DECISION-002";

/** FUNGI-DECISION-003: unknownDecision() called with empty unknownReasons array. */
export const FUNGI_DECISION_003_EMPTY_UNKNOWN_REASONS = "FUNGI-DECISION-003";

/** FUNGI-DECISION-004: A non-allow Decision (deny/review/unknown) reached a runtime bool boundary. */
export const FUNGI_DECISION_004_FAILED_CLOSED = "FUNGI-DECISION-004";
// NOTE: name is DECISION_FAILED_CLOSED (not FAILED_CLOSED) to avoid V2 collision with
// FUNGI-BOOL-BOUNDARY-001 which uses FAILED_CLOSED for the TriState variant.

/** FUNGI-DECISION-005: combineDecisions() received an empty array. */
export const FUNGI_DECISION_005_EMPTY_COMBINE = "FUNGI-DECISION-005";

// ---------------------------------------------------------------------------
// Diagnostic constructors
// ---------------------------------------------------------------------------

export function decisionDiagnosticInvalid(path?: string): LogicDiagnostic {
  return {
    code: FUNGI_DECISION_001_INVALID_DECISION,
    name: "INVALID_DECISION",
    severity: "error",
    message: "Value is not a valid Decision. Expected {kind:'allow'|'deny'|'review'|'unknown', reason, evidence}.",
    ...(path === undefined ? {} : { path }),
  };
}

export function decisionDiagnosticEmptyReason(path?: string): LogicDiagnostic {
  return {
    code: FUNGI_DECISION_002_EMPTY_REASON,
    name: "EMPTY_REASON",
    severity: "error",
    message: "Decision reason must be a non-empty string explaining why this decision was made.",
    ...(path === undefined ? {} : { path }),
  };
}

export function decisionDiagnosticEmptyUnknownReasons(path?: string): LogicDiagnostic {
  return {
    code: FUNGI_DECISION_003_EMPTY_UNKNOWN_REASONS,
    name: "EMPTY_UNKNOWN_REASONS",
    severity: "error",
    message: "unknownDecision() must be called with at least one UnknownReason.",
    ...(path === undefined ? {} : { path }),
  };
}

export function decisionDiagnosticFailedClosed(
  kind: "deny" | "review" | "unknown",
  reason: string,
  path?: string,
): LogicDiagnostic {
  return {
    code: FUNGI_DECISION_004_FAILED_CLOSED,
    name: "DECISION_FAILED_CLOSED",
    severity: "error",
    message: `Decision kind "${kind}" reached a runtime boolean boundary and was rejected (fail-closed). Reason: ${reason}`,
    ...(path === undefined ? {} : { path }),
  };
}

export function decisionDiagnosticEmptyCombine(path?: string): LogicDiagnostic {
  return {
    code: FUNGI_DECISION_005_EMPTY_COMBINE,
    name: "EMPTY_COMBINE",
    severity: "warning",
    message: "combineDecisions() was called with an empty array. Returning allow('no decisions to combine').",
    ...(path === undefined ? {} : { path }),
  };
}
