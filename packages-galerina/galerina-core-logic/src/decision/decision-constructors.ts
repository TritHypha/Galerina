// =============================================================================
// Decision v0.2 — canonical constructors
// =============================================================================

import type { UnknownReason } from "../tri/tri-unknown-reason.js";
import type { Decision, DecisionEvidence } from "./decision-state.js";

/**
 * Construct an allow decision with a reason and optional evidence.
 */
export function allow(
  reason: string,
  evidence: readonly DecisionEvidence[] = [],
): Decision {
  return { kind: "allow", reason, evidence };
}

/**
 * Construct a deny decision with a reason and optional evidence.
 * Deny has the highest priority — it overrides all other decisions.
 */
export function deny(
  reason: string,
  evidence: readonly DecisionEvidence[] = [],
): Decision {
  return { kind: "deny", reason, evidence };
}

/**
 * Construct a review decision with a reason and optional evidence.
 * Review fails closed at runtime Boolean boundaries.
 */
export function review(
  reason: string,
  evidence: readonly DecisionEvidence[] = [],
): Decision {
  return { kind: "review", reason, evidence };
}

/**
 * Construct an unknown decision with structured unknown reasons.
 * Unknown fails closed at runtime Boolean boundaries.
 */
export function unknownDecision(
  reason: string,
  unknownReasons: readonly UnknownReason[],
  evidence: readonly DecisionEvidence[] = [],
): Decision {
  return { kind: "unknown", reason, evidence, unknownReasons };
}
