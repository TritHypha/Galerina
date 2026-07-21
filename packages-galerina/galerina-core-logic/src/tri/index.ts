// =============================================================================
// @galerina/core-logic/tri — TriState v0.2 sub-path export
// =============================================================================

export type { TriState } from "./tri-state.js";
export {
  TRI_STATE_TRUE,
  TRI_STATE_FALSE,
  triUnknown,
  triUnknownFromReasons,
  isTriTrue,
  isTriFalse,
  isTriUnknown,
} from "./tri-state.js";

export type { UnknownReason } from "./tri-unknown-reason.js";
export { deduplicateUnknownReasons } from "./tri-unknown-reason.js";

export {
  triStateNot,
  triStateAnd,
  triStateOr,
  triStateNor,
  triStateXnor,
  triStateImplies,
  combineUnknownReasons,
} from "./tri-ops.js";

export {
  FUNGI_TRI_001_INVALID_TRISTATE,
  FUNGI_TRI_002_EMPTY_UNKNOWN_REASONS,
  FUNGI_TRI_003_INVALID_OPERAND,
  FUNGI_TRI_004_UNKNOWN_LEAKED,
  FUNGI_TRI_005_MALFORMED_UNKNOWN_REASON,
  triDiagnosticInvalidTriState,
  triDiagnosticEmptyUnknownReasons,
  triDiagnosticInvalidOperand,
  triDiagnosticUnknownLeaked,
  triDiagnosticMalformedUnknownReason,
} from "./tri-diagnostics.js";
