// =============================================================================
// Decision v0.2 — 4-state discriminated union
//
// States: allow | deny | review | unknown
// Priority: deny > review > unknown > allow
//
// review and unknown ALWAYS fail closed at runtime Boolean boundaries.
// =============================================================================

import type { UnknownReason } from "../tri/tri-unknown-reason.js";

export interface DecisionEvidence {
  /**
   * Structured evidence code. Convention: "CAPABILITY_GRANTED",
   * "POLICY_MATCHED", "AUDIT_REQUIRED", etc.
   */
  readonly code: string;
  readonly message: string;
  /** Source of the evidence (policy name, capability key, flow ID, etc.). */
  readonly source?: string;
}

export type Decision =
  | {
      readonly kind: "allow";
      readonly reason: string;
      readonly evidence: readonly DecisionEvidence[];
    }
  | {
      readonly kind: "deny";
      readonly reason: string;
      readonly evidence: readonly DecisionEvidence[];
    }
  | {
      readonly kind: "review";
      readonly reason: string;
      readonly evidence: readonly DecisionEvidence[];
    }
  | {
      readonly kind: "unknown";
      readonly reason: string;
      readonly evidence: readonly DecisionEvidence[];
      readonly unknownReasons: readonly UnknownReason[];
    };

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

export function isAllow(d: Decision): d is Decision & { kind: "allow" } {
  return d.kind === "allow";
}

export function isDeny(d: Decision): d is Decision & { kind: "deny" } {
  return d.kind === "deny";
}

export function isReview(d: Decision): d is Decision & { kind: "review" } {
  return d.kind === "review";
}

export function isUnknownDecision(d: Decision): d is Decision & { kind: "unknown" } {
  return d.kind === "unknown";
}

/**
 * Returns true only for an allow decision.
 * deny, review, and unknown all return false (fail closed).
 */
export function decisionToRuntimeBool(d: Decision): boolean {
  return d.kind === "allow";
}
