// =============================================================================
// omniToDecision() — convert an OmniDecision to a canonical Decision
//
// Mapping:
//   "true"       → allow (only if confidence >= threshold)
//   "false"      → deny
//   all others   → review (fail closed — uncertain states must not allow)
//
// omniToDecision() never produces unknown. If the omni state is ambiguous,
// it returns review so the system can escalate to a human or policy engine.
// =============================================================================

import type { OmniDecision } from "./omni-state.js";
import { isOmniUncertain } from "./omni-state.js";
import type { Decision, DecisionEvidence } from "../decision/decision-state.js";
import { allow, deny, review } from "../decision/decision-constructors.js";

/**
 * Minimum confidence threshold for an OmniDecision to produce allow().
 * Below this threshold, even a "true" state produces review().
 */
export const OMNI_MIN_ALLOW_CONFIDENCE = 0.8;

/**
 * Convert an OmniDecision to a canonical Decision.
 *
 * Mapping table:
 *   "true"  + confidence >= 0.8  → allow
 *   "true"  + confidence < 0.8   → review (low confidence)
 *   "false"                      → deny
 *   "unknown"                    → review
 *   "partial_true"               → review
 *   "partial_false"              → review
 *   "conflicted"                 → review
 *   "deferred"                   → review
 *   "inconsistent"               → review
 *
 * All uncertain states map to review (never to unknown) so the result can
 * always propagate through combineDecisions() without losing a reason chain.
 */
export function omniToDecision(omni: OmniDecision): Decision {
  const evidence: DecisionEvidence[] = omni.evidence.map((e) => ({
    code: e.code,
    message: e.message,
    ...(e.source === undefined ? {} : { source: e.source }),
  }));

  if (omni.state === "false") {
    return deny(
      omni.reasons.join("; ") || "OmniDecision state is false.",
      evidence,
    );
  }

  if (omni.state === "true") {
    if (omni.confidence >= OMNI_MIN_ALLOW_CONFIDENCE) {
      return allow(
        omni.reasons.join("; ") || "OmniDecision state is true with sufficient confidence.",
        evidence,
      );
    }

    // Low confidence — escalate to review
    return review(
      `OmniDecision state is "true" but confidence (${omni.confidence}) is below threshold (${OMNI_MIN_ALLOW_CONFIDENCE}). Escalating to review.`,
      evidence,
    );
  }

  // All uncertain states → review
  const isUncertain = isOmniUncertain(omni.state);
  const stateLabel = isUncertain ? `uncertain state "${omni.state}"` : omni.state;

  return review(
    `OmniDecision has ${stateLabel}. Escalating to review for deterministic resolution.`,
    evidence,
  );
}
