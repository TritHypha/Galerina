// =============================================================================
// Decision v0.2 — capability evaluation
//
// evaluateCapability() produces a Decision from a capability request and a
// policy context. Deny-first; review when policies are present but no evidence.
// =============================================================================

import type { UnknownReason } from "../tri/tri-unknown-reason.js";
import type { Decision, DecisionEvidence } from "./decision-state.js";
import { allow, deny, review, unknownDecision } from "./decision-constructors.js";
import { combineDecisions } from "./decision-combine.js";

export interface CapabilityRequest {
  /** The capability being requested. Example: "database.write". */
  readonly capability: string;
  /** Optional effect category. Example: "database". */
  readonly effect?: string;
  /** The actor requesting the capability. */
  readonly actor: string;
  /** Optional target resource. */
  readonly target?: string;
  /** Evidence supporting this request. */
  readonly evidence: readonly DecisionEvidence[];
}

export interface PolicyContext {
  /** Current environment mode. */
  readonly environment: string;
  /** Capabilities that have been explicitly granted to this context. */
  readonly grantedCapabilities: readonly string[];
  /** Capabilities that have been explicitly denied to this context. */
  readonly deniedCapabilities: readonly string[];
  /** Required policy names that must be satisfied. */
  readonly requiredPolicies: readonly string[];
  /** Evidence that policies have been satisfied. */
  readonly evidence: readonly DecisionEvidence[];
}

/**
 * Evaluate a capability request against a policy context.
 *
 * Rules:
 * 1. If the capability is in deniedCapabilities → deny.
 * 2. If requiredPolicies exist but no policy evidence → review (escalate).
 * 3. If the capability is in grantedCapabilities → allow.
 * 4. Otherwise → unknown (not explicitly granted or denied).
 */
export function evaluateCapability(
  request: CapabilityRequest,
  context: PolicyContext,
): Decision {
  const allEvidence: DecisionEvidence[] = [
    ...request.evidence,
    ...context.evidence,
  ];

  // Rule 1 — explicit deny wins
  if (context.deniedCapabilities.includes(request.capability)) {
    return deny(
      `Capability "${request.capability}" is explicitly denied for actor "${request.actor}".`,
      allEvidence,
    );
  }

  // Rule 2 — required policies present but no evidence to satisfy them
  if (context.requiredPolicies.length > 0 && context.evidence.length === 0) {
    return review(
      `Capability "${request.capability}" requires policy evaluation but no policy evidence was provided.`,
      allEvidence,
    );
  }

  // Rule 3 — explicitly granted
  if (context.grantedCapabilities.includes(request.capability)) {
    return allow(
      `Capability "${request.capability}" is granted to actor "${request.actor}".`,
      allEvidence,
    );
  }

  // Rule 4 — unknown
  const unknownReasons: UnknownReason[] = [
    {
      code: "CAPABILITY_NOT_DECLARED",
      message: `Capability "${request.capability}" is not in the granted or denied list for this context.`,
      source: request.capability,
    },
  ];

  return unknownDecision(
    `Capability "${request.capability}" has no explicit grant or denial for actor "${request.actor}".`,
    unknownReasons,
    allEvidence,
  );
}

export { combineDecisions };
