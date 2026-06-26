// =============================================================================
// TriState v0.2 diagnostic codes — SPORE-TRI series
// =============================================================================

import type { LogicDiagnostic } from "../index.js";

// ---------------------------------------------------------------------------
// Diagnostic code constants
// ---------------------------------------------------------------------------

/** SPORE-TRI-001: A TriState was expected but the value does not match the shape. */
export const SPORE_TRI_001_INVALID_TRISTATE = "SPORE-TRI-001";

/** SPORE-TRI-002: triUnknown() was called with an empty reasons array. */
export const SPORE_TRI_002_EMPTY_UNKNOWN_REASONS = "SPORE-TRI-002";

/** SPORE-TRI-003: triStateNot/And/Or received a non-TriState value at runtime. */
export const SPORE_TRI_003_INVALID_OPERAND = "SPORE-TRI-003";

/** SPORE-TRI-004: A TriState unknown leaked into a context that requires a definite value. */
export const SPORE_TRI_004_UNKNOWN_LEAKED = "SPORE-TRI-004";

/** SPORE-TRI-005: An UnknownReason is missing a required field. */
export const SPORE_TRI_005_MALFORMED_UNKNOWN_REASON = "SPORE-TRI-005";

// ---------------------------------------------------------------------------
// Diagnostic constructors
// ---------------------------------------------------------------------------

export function triDiagnosticInvalidTriState(path?: string): LogicDiagnostic {
  return {
    code: SPORE_TRI_001_INVALID_TRISTATE,
    name: "INVALID_TRISTATE",
    severity: "error",
    message: "Value is not a valid TriState. Expected {kind:'true'}, {kind:'false'}, or {kind:'unknown',reasons:[...]}.",
    ...(path === undefined ? {} : { path }),
  };
}

export function triDiagnosticEmptyUnknownReasons(path?: string): LogicDiagnostic {
  return {
    code: SPORE_TRI_002_EMPTY_UNKNOWN_REASONS,
    name: "EMPTY_UNKNOWN_REASONS",
    severity: "error",
    message: "TriState unknown must carry at least one UnknownReason explaining why the value is unknown.",
    ...(path === undefined ? {} : { path }),
  };
}

export function triDiagnosticInvalidOperand(path?: string): LogicDiagnostic {
  return {
    code: SPORE_TRI_003_INVALID_OPERAND,
    name: "INVALID_OPERAND",
    severity: "error",
    message: "TriState operation received a non-TriState operand.",
    ...(path === undefined ? {} : { path }),
  };
}

export function triDiagnosticUnknownLeaked(path?: string): LogicDiagnostic {
  return {
    code: SPORE_TRI_004_UNKNOWN_LEAKED,
    name: "UNKNOWN_LEAKED",
    severity: "error",
    message: "A TriState unknown value reached a context that requires a definite true or false. Use validateBoolBoundary() to fail closed.",
    ...(path === undefined ? {} : { path }),
  };
}

export function triDiagnosticMalformedUnknownReason(path?: string): LogicDiagnostic {
  return {
    code: SPORE_TRI_005_MALFORMED_UNKNOWN_REASON,
    name: "MALFORMED_UNKNOWN_REASON",
    severity: "error",
    message: "UnknownReason is missing a required field (code or message).",
    ...(path === undefined ? {} : { path }),
  };
}
