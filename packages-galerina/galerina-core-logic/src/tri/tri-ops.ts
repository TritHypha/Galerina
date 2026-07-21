// =============================================================================
// TriState v0.2 operations
//
// All operations preserve the unknown-reason chain so callers can trace why
// a result is unknown.
// =============================================================================

import type { UnknownReason } from "./tri-unknown-reason.js";
import { deduplicateUnknownReasons } from "./tri-unknown-reason.js";
import {
  type TriState,
  TRI_STATE_TRUE,
  TRI_STATE_FALSE,
  triUnknownFromReasons,
} from "./tri-state.js";

// ---------------------------------------------------------------------------
// NOT
// ---------------------------------------------------------------------------

/**
 * Logical NOT for TriState.
 * unknown → unknown (reasons preserved).
 */
export function triStateNot(a: TriState): TriState {
  if (a.kind === "true")    return TRI_STATE_FALSE;
  if (a.kind === "false")   return TRI_STATE_TRUE;
  return a; // unknown — preserve reasons
}

// ---------------------------------------------------------------------------
// AND
// ---------------------------------------------------------------------------

/**
 * Logical AND for TriState.
 * false short-circuits: false AND anything = false.
 * true AND unknown = unknown.
 * unknown AND unknown = unknown (reasons merged).
 */
export function triStateAnd(a: TriState, b: TriState): TriState {
  if (a.kind === "false" || b.kind === "false") return TRI_STATE_FALSE;
  if (a.kind === "true"  && b.kind === "true")  return TRI_STATE_TRUE;

  // At least one is unknown — collect all reasons
  const reasons = combineUnknownReasons([a, b]);
  return triUnknownFromReasons(reasons);
}

// ---------------------------------------------------------------------------
// OR
// ---------------------------------------------------------------------------

/**
 * Logical OR for TriState.
 * true short-circuits: true OR anything = true.
 * false OR unknown = unknown.
 * unknown OR unknown = unknown (reasons merged).
 */
export function triStateOr(a: TriState, b: TriState): TriState {
  if (a.kind === "true"  || b.kind === "true")  return TRI_STATE_TRUE;
  if (a.kind === "false" && b.kind === "false")  return TRI_STATE_FALSE;

  // At least one is unknown — collect all reasons
  const reasons = combineUnknownReasons([a, b]);
  return triUnknownFromReasons(reasons);
}

// ---------------------------------------------------------------------------
// NOR
// ---------------------------------------------------------------------------

/**
 * Logical NOR for TriState.
 * Equivalent to NOT(OR(a, b)).
 */
export function triStateNor(a: TriState, b: TriState): TriState {
  return triStateNot(triStateOr(a, b));
}

// ---------------------------------------------------------------------------
// XNOR (logical equivalence / biconditional)
// ---------------------------------------------------------------------------

/**
 * Logical XNOR (equivalence) for TriState: a XNOR b = NOT(a XOR b) = (a AND b) OR (NOT a AND NOT b).
 * true XNOR true = true; false XNOR false = true; true XNOR false = false; unknown ∘ anything = unknown.
 *
 * Useful for governance rule composition: "if hasCapability then mustLog" rewrites as
 * IMPLIES(hasCapability, mustLog), but equivalence checks also arise in symmetric invariants.
 */
export function triStateXnor(a: TriState, b: TriState): TriState {
  if (a.kind === "true"  && b.kind === "true")  return TRI_STATE_TRUE;
  if (a.kind === "false" && b.kind === "false") return TRI_STATE_TRUE;
  if (a.kind === "true"  && b.kind === "false") return TRI_STATE_FALSE;
  if (a.kind === "false" && b.kind === "true")  return TRI_STATE_FALSE;
  // At least one is unknown — collect all reasons
  const reasons = combineUnknownReasons([a, b]);
  return triUnknownFromReasons(reasons);
}

// ---------------------------------------------------------------------------
// IMPLIES (material conditional: A → B ≡ ¬A ∨ B)
// ---------------------------------------------------------------------------

/**
 * Material implication for TriState: A → B ≡ NOT A OR B.
 * Useful for governance rules like "if hasCapability then mustDeclareEffect":
 *   triStateImplies(hasCapability, hasDeclaredEffect)
 * true → false = false (the only failing case); true → true = true; false → anything = true.
 * unknown as antecedent = unknown (we cannot prove the obligation); unknown consequent = unknown.
 */
export function triStateImplies(antecedent: TriState, consequent: TriState): TriState {
  return triStateOr(triStateNot(antecedent), consequent);
}

// ---------------------------------------------------------------------------
// Unknown reason aggregation
// ---------------------------------------------------------------------------

/**
 * Collect and deduplicate UnknownReasons from a set of TriStates.
 * States that are not unknown contribute no reasons.
 */
export function combineUnknownReasons(
  states: readonly TriState[],
): readonly UnknownReason[] {
  const all: UnknownReason[] = [];

  for (const state of states) {
    if (state.kind === "unknown") {
      all.push(...state.reasons);
    }
  }

  return deduplicateUnknownReasons(all);
}
