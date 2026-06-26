// =============================================================================
// Decision v0.2 — combining multiple decisions
//
// Priority: deny > review > unknown > allow
//
// combineDecisions() returns the highest-priority decision from a set.
// All evidence is merged into the winning decision.
// =============================================================================

import type { UnknownReason } from "../tri/tri-unknown-reason.js";
import { deduplicateUnknownReasons } from "../tri/tri-unknown-reason.js";
import type { Decision, DecisionEvidence } from "./decision-state.js";
import { deny, review, unknownDecision, allow } from "./decision-constructors.js";

/**
 * Combine multiple decisions according to deny-first priority.
 *
 * Priority: deny > review > unknown > allow
 *
 * If there are no decisions, returns allow("no decisions to combine").
 * All evidence from all decisions is merged into the winning decision.
 */
export function combineDecisions(decisions: readonly Decision[]): Decision {
  if (decisions.length === 0) {
    return allow("no decisions to combine");
  }

  const allEvidence: DecisionEvidence[] = [];
  const allUnknownReasons: UnknownReason[] = [];

  let hasDeny    = false;
  let hasReview  = false;
  let hasUnknown = false;

  let denyReason    = "";
  let reviewReason  = "";
  let unknownReason = "";

  for (const d of decisions) {
    allEvidence.push(...d.evidence);

    if (d.kind === "deny") {
      hasDeny = true;
      denyReason = d.reason;
    } else if (d.kind === "review") {
      hasReview = true;
      reviewReason = d.reason;
    } else if (d.kind === "unknown") {
      hasUnknown = true;
      unknownReason = d.reason;
      allUnknownReasons.push(...d.unknownReasons);
    }
  }

  if (hasDeny) {
    return deny(denyReason, allEvidence);
  }

  if (hasReview) {
    return review(reviewReason, allEvidence);
  }

  if (hasUnknown) {
    return unknownDecision(
      unknownReason,
      deduplicateUnknownReasons(allUnknownReasons),
      allEvidence,
    );
  }

  // All decisions are allow — use the first allow reason
  const firstAllow = decisions.find((d) => d.kind === "allow");
  return allow(firstAllow?.reason ?? "all decisions allow", allEvidence);
}
