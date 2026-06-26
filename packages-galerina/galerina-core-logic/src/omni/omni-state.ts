// =============================================================================
// OmniState — multi-state string literal union for AI/advisory reasoning
//
// OmniState is NOT a replacement for TriState or Decision.
// It is advisory-only and must NEVER override runtime policy or capability
// checks. All uncertain states map to review() via omniToDecision().
//
// Safety boundaries:
//   - OmniState must not control capability gates
//   - OmniState must not control security policy outcomes
//   - OmniState advisories must be audited separately from deterministic state
//   - omniToDecision() always maps uncertain states to review (fail closed)
// =============================================================================

/**
 * OmniState is a string literal union (not an enum).
 * All uncertain states map to review() via omniToDecision().
 *
 * Deterministic states:
 *   "true"     — confident positive
 *   "false"    — confident negative
 *
 * Uncertain states (all map to review):
 *   "unknown"        — not enough information
 *   "partial_true"   — leans true but not certain
 *   "partial_false"  — leans false but not certain
 *   "conflicted"     — conflicting evidence (some true, some false)
 *   "deferred"       — decision is deferred to a later stage
 *   "inconsistent"   — internal inconsistency in the evidence
 */
export type OmniState =
  | "true"
  | "false"
  | "unknown"
  | "partial_true"
  | "partial_false"
  | "conflicted"
  | "deferred"
  | "inconsistent";

/** All states that are considered uncertain and map to review(). */
export const OMNI_UNCERTAIN_STATES: ReadonlySet<OmniState> = new Set([
  "unknown",
  "partial_true",
  "partial_false",
  "conflicted",
  "deferred",
  "inconsistent",
]);

/** All valid OmniState values. */
export const OMNI_STATES: readonly OmniState[] = [
  "true",
  "false",
  "unknown",
  "partial_true",
  "partial_false",
  "conflicted",
  "deferred",
  "inconsistent",
];

export function isOmniState(value: unknown): value is OmniState {
  return (
    typeof value === "string" &&
    (OMNI_STATES as readonly string[]).includes(value)
  );
}

export function isOmniUncertain(state: OmniState): boolean {
  return OMNI_UNCERTAIN_STATES.has(state);
}

export interface OmniEvidence {
  /** Evidence code. */
  readonly code: string;
  readonly message: string;
  /**
   * Confidence value in the range [0, 1].
   * 0 = no confidence, 1 = full confidence.
   * Required for OmniEvidence to support advisory weighting.
   */
  readonly confidence: number;
  /** Source of the evidence (model name, policy name, signal ID, etc.). */
  readonly source?: string;
}

export interface OmniDecision {
  readonly state: OmniState;
  /**
   * Overall confidence in this omni decision in the range [0, 1].
   */
  readonly confidence: number;
  readonly reasons: readonly string[];
  readonly evidence: readonly OmniEvidence[];
  /**
   * Advisory flag. Always true — OmniDecision must never gate deterministic
   * execution paths directly.
   */
  readonly advisoryOnly: true;
}
