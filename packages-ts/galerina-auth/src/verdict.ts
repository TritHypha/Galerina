/**
 * verdict.ts — the K3 verdict algebra, re-exported as galerina-auth's vocabulary.
 *
 * Authentication/authorization in Galerina is three-valued, not boolean. Every auth
 * FACTOR this package computes is a Kleene-K3 trit (the shipped @galerina/tower-citizen
 * `Verdict`):
 *
 *   +1 ALLOW          — proof discharged, the factor may authorize
 *    0 NEUTRAL        — a computed neutral trit (e.g. ALLOW ∧ NEUTRAL); refused at the boundary
 *   K3_UNKNOWN        — no positive evidence / un-provable: the typed UNKNOWN sentinel, NEVER the
 *                       trit 0 (`Verdict.UNKNOWN`; `Verdict.INDETERMINATE` is its deprecated name);
 *                       infectious under ∧/∨, refused at the boundary with FUNGI-GOV-3VL-001
 *   −1 DENY           — definite refusal (annihilator under conjunction)
 *
 * We re-export the verdict type, the conjunction/disjunction reducers, and the
 * boundary collapse VERBATIM from tower-citizen so a consumer of galerina-auth can
 * type and interpret a factor without reaching across into another package — the
 * same courtesy @galerina/core-network's cert-gate extends. We never re-implement the
 * algebra: `vAnd`/`allOf` are the K3-conformance-pinned gates, so the oracle that
 * guards tower-citizen keeps guarding the verdicts this package produces.
 *
 * NOTE on the boundary collapse: `decideAtBoundary` is re-exported for transports
 * that want to PREVIEW or log what the kernel will decide. It is NOT this package's
 * job to make the admission decision — the App Kernel performs the authoritative,
 * fail-closed collapse of the composed `channelVerdict` at its admission gate. See
 * compose.ts (`composeAuthVerdict` returns a verdict, never a decision).
 */

export {
  Verdict,
  vAnd,
  vOr,
  allOf,
  anyOf,
  decideAtBoundary,
} from "../../galerina-tower-citizen/dist/index.js";

export type {
  BoundaryDecision,
  GovernanceDiagnostic,
} from "../../galerina-tower-citizen/dist/index.js";
