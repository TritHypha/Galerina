// =============================================================================
// BoolBoundary diagnostic codes — SPORE-BOOL-BOUNDARY series
// =============================================================================

import type { LogicDiagnostic } from "../index.js";

// ---------------------------------------------------------------------------
// Diagnostic code constants
// ---------------------------------------------------------------------------

/** SPORE-BOOL-BOUNDARY-001: A TriState or Decision failed closed at a boolean boundary. */
export const SPORE_BOOL_BOUNDARY_001_FAILED_CLOSED = "SPORE-BOOL-BOUNDARY-001";

/** SPORE-BOOL-BOUNDARY-002: An UnknownReason from the failing state is recorded here. */
export const SPORE_BOOL_BOUNDARY_002_UNKNOWN_REASON = "SPORE-BOOL-BOUNDARY-002";

/** SPORE-BOOL-BOUNDARY-003: validateBoolBoundary() received an invalid input shape. */
export const SPORE_BOOL_BOUNDARY_003_INVALID_INPUT = "SPORE-BOOL-BOUNDARY-003";

/** SPORE-BOOL-BOUNDARY-004: BoolBoundaryContext is missing a required boundaryName. */
export const SPORE_BOOL_BOUNDARY_004_MISSING_BOUNDARY_NAME = "SPORE-BOOL-BOUNDARY-004";

/** SPORE-BOOL-BOUNDARY-005: A BoolBoundaryResult with allowed=false was used as true. */
export const SPORE_BOOL_BOUNDARY_005_RESULT_MISUSED = "SPORE-BOOL-BOUNDARY-005";

// ---------------------------------------------------------------------------
// Diagnostic constructors
// ---------------------------------------------------------------------------

export function boolDiagnosticFailedClosed(
  kind: string,
  boundaryName: string,
): LogicDiagnostic {
  return {
    code: SPORE_BOOL_BOUNDARY_001_FAILED_CLOSED,
    name: "FAILED_CLOSED",
    severity: "error",
    message: `State kind "${kind}" reached boolean boundary "${boundaryName}" and failed closed. Only allow/true passes.`,
    path: boundaryName,
  };
}

export function boolDiagnosticUnknownReason(
  code: string,
  message: string,
): LogicDiagnostic {
  return {
    code: SPORE_BOOL_BOUNDARY_002_UNKNOWN_REASON,
    name: "UNKNOWN_REASON",
    severity: "info",
    message: `[${code}] ${message}`,
  };
}

export function boolDiagnosticInvalidInput(path?: string): LogicDiagnostic {
  return {
    code: SPORE_BOOL_BOUNDARY_003_INVALID_INPUT,
    name: "INVALID_INPUT",
    severity: "error",
    message: "validateBoolBoundary() received a value that is neither a TriState nor a Decision.",
    ...(path === undefined ? {} : { path }),
  };
}

export function boolDiagnosticMissingBoundaryName(): LogicDiagnostic {
  return {
    code: SPORE_BOOL_BOUNDARY_004_MISSING_BOUNDARY_NAME,
    name: "MISSING_BOUNDARY_NAME",
    severity: "error",
    message: "BoolBoundaryContext.boundaryName is required.",
  };
}

export function boolDiagnosticResultMisused(boundaryName: string): LogicDiagnostic {
  return {
    code: SPORE_BOOL_BOUNDARY_005_RESULT_MISUSED,
    name: "RESULT_MISUSED",
    severity: "error",
    message: `BoolBoundaryResult.value was used but allowed=false at boundary "${boundaryName}". Always check allowed before using value.`,
    path: boundaryName,
  };
}
