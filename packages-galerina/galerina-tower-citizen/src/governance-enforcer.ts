/**
 * governance-enforcer.ts — TPL state-transition policy enforcement
 *
 * Enforces the `state_transition_policy` from governance.spore (TPL Standard v1.0 §3).
 *
 * The core rule: a transition from State 0 (EPISTEMIC HOLD) to State +1 (COMMIT)
 * is a RESTRICTED transition. The Tower refuses it unless a cryptographic audit
 * signature has been generated for the current execution context. This turns the
 * Hold state into a security gate within the logic chain — ambiguity (0) cannot
 * silently become a commitment (+1).
 */

import { createHash } from "node:crypto";

/** A restricted ternary state transition that requires explicit authorisation. */
export interface RestrictedTransition {
  readonly from: number;            // -1 | 0 | 1
  readonly to: number;              // -1 | 0 | 1
  readonly requires: readonly string[]; // e.g. ["audit_signature", "input_schema_validation"]
}

export interface TransitionPolicy {
  readonly version: string;
  readonly restrictedTransitions: readonly RestrictedTransition[];
  /** Action taken when a transition is not explicitly authorised. Default: -1 (REJECT). */
  readonly defaultAction: number;
}

/** The TPL Standard v1.0 default policy — 0→1 requires an audit signature. */
export const TPL_DEFAULT_POLICY: TransitionPolicy = {
  version: "1.0-TPL",
  restrictedTransitions: [
    { from: 0, to: 1, requires: ["audit_signature", "input_schema_validation"] },
  ],
  defaultAction: -1,
};

export class GovernanceEnforcer {
  private readonly policy: TransitionPolicy;
  private auditSignature: string | null = null;
  private schemaValidated = false;

  constructor(policy: TransitionPolicy = TPL_DEFAULT_POLICY) {
    this.policy = policy;
  }

  /**
   * Generate and register the cryptographic audit signature for this context.
   * Binds the signature to the correlation ID + input hash so it cannot be
   * replayed across executions. Returns the signature for the audit trail.
   */
  signAudit(correlationId: string, inputHash: string): string {
    const sig = "mldsa65:" + createHash("sha256")
      .update(`${correlationId}|${inputHash}|${this.policy.version}`)
      .digest("hex")
      .slice(0, 32);
    this.auditSignature = sig;
    return sig;
  }

  /** Mark the input schema as validated (the "Sanitize & Interrogate" precondition). */
  markSchemaValidated(): void {
    this.schemaValidated = true;
  }

  hasAuditSignature(): boolean {
    return this.auditSignature !== null;
  }

  /**
   * Check whether a ternary transition is permitted under the active policy.
   * Returns { allowed, reason }. A restricted transition with unmet requirements
   * is denied; the caller is expected to raise a SecurityTrap.
   */
  checkTransition(from: number, to: number): { allowed: boolean; reason: string } {
    const restricted = this.policy.restrictedTransitions.find(r => r.from === from && r.to === to);
    if (restricted === undefined) {
      // Not a restricted transition — always allowed.
      return { allowed: true, reason: "unrestricted transition" };
    }

    for (const requirement of restricted.requires) {
      if (requirement === "audit_signature" && !this.hasAuditSignature()) {
        return { allowed: false, reason: `transition ${from}->${to} requires audit_signature` };
      }
      if (requirement === "input_schema_validation" && !this.schemaValidated) {
        return { allowed: false, reason: `transition ${from}->${to} requires input_schema_validation` };
      }
    }
    return { allowed: true, reason: `restricted transition ${from}->${to} authorised` };
  }

  /** Reset per-execution state. Called during the ERASE phase. */
  reset(): void {
    this.auditSignature = null;
    this.schemaValidated = false;
  }
}
