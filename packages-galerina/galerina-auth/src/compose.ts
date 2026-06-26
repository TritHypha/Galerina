/**
 * compose.ts — fold auth FACTORS into the one verdict the App Kernel folds.
 *
 * The factors in this package (channel/identity, the required-auth posture, scope
 * authorization, and any upstream-verifier output) are each a K3 `Verdict`.
 * `composeAuthVerdict` reduces a set of them CONJUNCTIVELY with the shipped K3
 * `allOf` (= `vAnd`-reduce = `min` over the trit):
 *
 *   ALLOW  iff EVERY factor is ALLOW
 *   DENY   if ANY factor is DENY (annihilator)
 *   else   INDETERMINATE
 *
 * Deny-by-default: an EMPTY factor set is INDETERMINATE (`0`), never the vacuous
 * ALLOW a bare ∧-identity would give. Include exactly the factors that constitute
 * the route's auth requirement; a factor that is merely INDETERMINATE (e.g. the
 * tightened header-presence posture) pulls the composite to non-ALLOW by design.
 *
 * THE BOUNDARY. `composeAuthVerdict` returns a VERDICT, not a decision. That is the
 * whole contract of this package: galerina-auth supplies the authentication FACTORS;
 * the App Kernel's fixed, non-bypassable admission gate makes the call. Hand the
 * composed verdict to the kernel as `LogicnKernelRequest.channelVerdict` and let the
 * kernel collapse it fail-closed (`decideAtBoundary`: only `+1` admits). We do not
 * move that decision out of the kernel.
 */

import {
  Verdict,
  allOf,
  decideAtBoundary,
} from "../../galerina-tower-citizen/dist/index.js";
import type {
  BoundaryDecision,
  GovernanceDiagnostic,
} from "../../galerina-tower-citizen/dist/index.js";

/**
 * Conjunctive fold of auth factors into the single K3 verdict to hand the kernel as
 * `channelVerdict`. Empty → INDETERMINATE (deny-by-default). Returns a verdict, not
 * a decision.
 */
export function composeAuthVerdict(factors: readonly Verdict[]): Verdict {
  return allOf(factors);
}

/**
 * PREVIEW ONLY — interpret what the kernel WILL decide for a composed verdict.
 *
 * This is a diagnostic/logging convenience for the transport side; it does NOT make
 * the authoritative admission decision. The App Kernel performs the binding collapse
 * at its own gate. `onDiagnostic` receives SPORE-GOV-3VL-001 when an INDETERMINATE
 * verdict is collapsed to deny, so a preview can surface exactly why a request would
 * be refused.
 */
export function previewAdmission(
  verdict: Verdict,
  onDiagnostic?: (d: GovernanceDiagnostic) => void,
): BoundaryDecision {
  return decideAtBoundary(verdict, onDiagnostic);
}
