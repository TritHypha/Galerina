// =============================================================================
// @galerina/core-logic/bool-boundary — BoolBoundary v0.2 sub-path export
// =============================================================================

export type { BoolBoundaryResult } from "./bool-boundary.js";
export type { BoolBoundaryContext } from "./bool-boundary-context.js";

export type { BoolBoundaryInput } from "./bool-enforce.js";
export { validateBoolBoundary } from "./bool-enforce.js";

export {
  SPORE_BOOL_BOUNDARY_001_FAILED_CLOSED,
  SPORE_BOOL_BOUNDARY_002_UNKNOWN_REASON,
  SPORE_BOOL_BOUNDARY_003_INVALID_INPUT,
  SPORE_BOOL_BOUNDARY_004_MISSING_BOUNDARY_NAME,
  SPORE_BOOL_BOUNDARY_005_RESULT_MISUSED,
  boolDiagnosticFailedClosed,
  boolDiagnosticUnknownReason,
  boolDiagnosticInvalidInput,
  boolDiagnosticMissingBoundaryName,
  boolDiagnosticResultMisused,
} from "./bool-diagnostics.js";
