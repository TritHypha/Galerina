/**
 * governance-enforcer.ts — TPL state-transition policy enforcement
 *
 * Enforces the `state_transition_policy` from governance.fungi (TPL Standard v1.0 §3).
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

  /** RD-0236 #3: the requirement kinds `checkTransition` can actually VERIFY. A policy that
   *  names anything else is malformed — an unverifiable requirement can never be satisfied, so
   *  it must be rejected at LOAD (fail-closed), not silently treated as met at check time. */
  private static readonly KNOWN_REQUIREMENTS: ReadonlySet<string> = new Set([
    "audit_signature", "input_schema_validation",
  ]);

  constructor(policy: TransitionPolicy = TPL_DEFAULT_POLICY) {
    // RD-0236 #3: reject a transition policy carrying an UNRECOGNISED requirement kind at load —
    // it previously fell through to `allowed:true` at check time (the enumerate-danger disease).
    for (const rt of policy.restrictedTransitions) {
      for (const req of rt.requires) {
        if (!GovernanceEnforcer.KNOWN_REQUIREMENTS.has(req)) {
          throw new Error(
            `FUNGI-GOV-TPL-001: transition policy names an unrecognised requirement '${req}' ` +
            `(transition ${rt.from}->${rt.to}) — rejected at load (fail-closed). Known requirements: ` +
            `${[...GovernanceEnforcer.KNOWN_REQUIREMENTS].join(", ")}.`,
          );
        }
      }
    }
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
      if (requirement === "audit_signature") {
        if (!this.hasAuditSignature()) {
          return { allowed: false, reason: `transition ${from}->${to} requires audit_signature` };
        }
      } else if (requirement === "input_schema_validation") {
        if (!this.schemaValidated) {
          return { allowed: false, reason: `transition ${from}->${to} requires input_schema_validation` };
        }
      } else {
        // RD-0236 #3: an unrecognised requirement cannot be VERIFIED, so it can never be satisfied.
        // Previously the if-chain simply didn't match it and fell through to `allowed:true` (the
        // enumerate-danger disease). Apply the policy's `defaultAction` (was dead code, 0 reads):
        // < 0 ⇒ REJECT (the TPL default). Fail-closed — never silently treat an unknown gate as met.
        // (The constructor also rejects such policies at load; this is defense-in-depth.)
        return {
          allowed: this.policy.defaultAction >= 0,
          reason: `transition ${from}->${to} names an unverifiable requirement '${requirement}' — ` +
            `defaultAction applied (${this.policy.defaultAction < 0 ? "REJECT" : "allow"}, fail-closed)`,
        };
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
