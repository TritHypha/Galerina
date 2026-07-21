// =============================================================================
// TriState v0.2 diagnostic codes — FUNGI-TRI series
// =============================================================================

import type { LogicDiagnostic } from "../index.js";

// ---------------------------------------------------------------------------
// Diagnostic code constants
// ---------------------------------------------------------------------------

/** FUNGI-TRI-001: A TriState was expected but the value does not match the shape. */
export const FUNGI_TRI_001_INVALID_TRISTATE = "FUNGI-TRI-001";

/** FUNGI-TRI-002: triUnknown() was called with an empty reasons array. */
export const FUNGI_TRI_002_EMPTY_UNKNOWN_REASONS = "FUNGI-TRI-002";

/** FUNGI-TRI-003: triStateNot/And/Or received a non-TriState value at runtime. */
export const FUNGI_TRI_003_INVALID_OPERAND = "FUNGI-TRI-003";

/** FUNGI-TRI-004: A TriState unknown leaked into a context that requires a definite value. */
export const FUNGI_TRI_004_UNKNOWN_LEAKED = "FUNGI-TRI-004";

/** FUNGI-TRI-005: An UnknownReason is missing a required field. */
export const FUNGI_TRI_005_MALFORMED_UNKNOWN_REASON = "FUNGI-TRI-005";

// ---------------------------------------------------------------------------
// Diagnostic constructors
// ---------------------------------------------------------------------------

export function triDiagnosticInvalidTriState(path?: string): LogicDiagnostic {
  return {
    code: FUNGI_TRI_001_INVALID_TRISTATE,
    name: "INVALID_TRISTATE",
    severity: "error",
    message: "Value is not a valid TriState. Expected {kind:'true'}, {kind:'false'}, or {kind:'unknown',reasons:[...]}.",
    ...(path === undefined ? {} : { path }),
  };
}

export function triDiagnosticEmptyUnknownReasons(path?: string): LogicDiagnostic {
  return {
    code: FUNGI_TRI_002_EMPTY_UNKNOWN_REASONS,
    name: "TRI_EMPTY_UNKNOWN_REASONS",
    severity: "error",
    message: "TriState unknown must carry at least one UnknownReason explaining why the value is unknown.",
    ...(path === undefined ? {} : { path }),
  };
}
// NOTE: name is TRI_EMPTY_UNKNOWN_REASONS (not EMPTY_UNKNOWN_REASONS) to avoid V2 collision
// with FUNGI-DECISION-003 which uses EMPTY_UNKNOWN_REASONS for the Decision variant.

export function triDiagnosticInvalidOperand(path?: string): LogicDiagnostic {
  return {
    code: FUNGI_TRI_003_INVALID_OPERAND,
    name: "INVALID_OPERAND",
    severity: "error",
    message: "TriState operation received a non-TriState operand.",
    ...(path === undefined ? {} : { path }),
  };
}

export function triDiagnosticUnknownLeaked(path?: string): LogicDiagnostic {
  return {
    code: FUNGI_TRI_004_UNKNOWN_LEAKED,
    name: "UNKNOWN_LEAKED",
    severity: "error",
    message: "A TriState unknown value reached a context that requires a definite true or false. Use validateBoolBoundary() to fail closed.",
    ...(path === undefined ? {} : { path }),
  };
}

export function triDiagnosticMalformedUnknownReason(path?: string): LogicDiagnostic {
  return {
    code: FUNGI_TRI_005_MALFORMED_UNKNOWN_REASON,
    name: "MALFORMED_UNKNOWN_REASON",
    severity: "error",
    message: "UnknownReason is missing a required field (code or message).",
    ...(path === undefined ? {} : { path }),
  };
}
