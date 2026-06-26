/**
 * lease.ts — FAIL-CLOSED TTL capability lease (macaroon-style bounded delegation).
 *
 * G6 slice. A delegated capability must ACTUALLY EXPIRE rather than relying on
 * self-enforcing math: a `CapabilityLease` binds a capability to a hard expiry
 * (`notAfter`) and an `issuedTo` principal, and `checkLease` admits it through the
 * shipped K3 trust boundary so the verdict is three-valued and fail-closed.
 *
 * Invariants (inherited verbatim from the K3 algebra in three-valued-governance.ts —
 * NOT re-proved here):
 *  - **Deny-by-default.** A malformed or absent lease (null/undefined, missing fields,
 *    a non-finite or non-numeric `notAfter`, or a non-finite `now`) folds to
 *    INDETERMINATE → denied (audited SPORE-GOV-3VL-001). There is no path by which a
 *    bad lease authorizes.
 *  - **Hard expiry.** Once `now >= notAfter` the verdict is DENY. The window is
 *    HALF-OPEN: ALLOW holds iff `now < notAfter` (a lease never outlives, nor is it
 *    valid AT, its own expiry tick).
 *  - **No wall-clock.** `now` is supplied by the caller (a logical tick or ms). This
 *    module reads no clock, so `checkLease` is pure and deterministic — the same
 *    (lease, now) always yields the same decision.
 *  - **Never silent.** An INDETERMINATE collapse carries SPORE-GOV-3VL-001 in the
 *    decision and to the optional `onDiagnostic` sink. This shapes GOVERNANCE only; it
 *    never touches crypto (lease integrity, if signed, is verified upstream on binary
 *    silicon — out of scope here).
 */

import {
  Verdict,
  decideAtBoundary,
  type BoundaryDecision,
  type GovernanceDiagnostic,
} from "./three-valued-governance.js";

/**
 * A bounded, time-limited delegation of a single capability.
 *
 * `C` is the caller's capability representation (an opaque token, a name, a V_DPM
 * bitmask, etc.) — this primitive treats it as data and only governs its LIFETIME.
 */
export interface CapabilityLease<C = unknown> {
  /** The delegated capability. Opaque to the lease; carried through unchanged. */
  readonly capability: C;
  /**
   * Hard expiry as a logical tick or millisecond instant on the SAME scale the
   * caller passes to `checkLease`'s `now`. The lease is valid strictly BEFORE this.
   */
  readonly notAfter: number;
  /** The principal the lease was issued to (for audit / scoping). */
  readonly issuedTo: string;
}

/** The outcome of admitting a lease at the trust boundary. */
export interface LeaseDecision<C = unknown> extends BoundaryDecision {
  /** Why the lease was withheld, or `null` when ALLOWed. */
  readonly reason: LeaseDenyReason | null;
  /** The lease that was checked, or `null` when it was malformed/absent. */
  readonly lease: CapabilityLease<C> | null;
}

/** The reason a lease did not authorize. */
export type LeaseDenyReason = "expired" | "malformed";

/** Structural validity check — every field present and well-typed, fail-closed. */
function isWellFormed(lease: unknown): lease is CapabilityLease {
  if (lease === null || typeof lease !== "object") return false;
  const l = lease as Record<string, unknown>;
  if (!("capability" in l)) return false;
  if (typeof l.issuedTo !== "string") return false;
  if (typeof l.notAfter !== "number" || !Number.isFinite(l.notAfter)) return false;
  return true;
}

/**
 * Map a lease + the caller's current `now` to a three-valued Verdict.
 *
 *  - malformed / absent lease, or a non-finite `now`  → INDETERMINATE (deny-by-default)
 *  - `now >= notAfter` (expired, half-open window)     → DENY
 *  - `now <  notAfter` (within window)                 → ALLOW
 */
export function leaseVerdict(lease: CapabilityLease | null | undefined, now: number): Verdict {
  if (!isWellFormed(lease)) return Verdict.INDETERMINATE;
  if (typeof now !== "number" || !Number.isFinite(now)) return Verdict.INDETERMINATE;
  return now < lease.notAfter ? Verdict.ALLOW : Verdict.DENY;
}

/**
 * Admit a capability lease at the trust boundary, fail-closed and audited.
 *
 * Returns a `LeaseDecision` whose `authorized` is `true` ONLY for a well-formed,
 * unexpired lease at the supplied `now`. Expiry yields an ordinary DENY (no
 * diagnostic); a malformed/absent lease yields an INDETERMINATE collapse carrying
 * SPORE-GOV-3VL-001 (also forwarded to `onDiagnostic` if provided). Pure: it reads no
 * clock — the caller owns `now`.
 */
export function checkLease<C>(
  lease: CapabilityLease<C> | null | undefined,
  now: number,
  onDiagnostic?: (d: GovernanceDiagnostic) => void,
): LeaseDecision<C> {
  const wellFormed = isWellFormed(lease) && typeof now === "number" && Number.isFinite(now);
  const verdict = leaseVerdict(lease, now);
  const boundary = decideAtBoundary(verdict, onDiagnostic);
  const reason: LeaseDenyReason | null =
    boundary.authorized ? null : wellFormed ? "expired" : "malformed";
  return {
    ...boundary,
    reason,
    lease: wellFormed ? (lease as CapabilityLease<C>) : null,
  };
}

/**
 * Convenience predicate — `true` IFF the lease is well-formed AND unexpired at `now`.
 * Equivalent to `checkLease(lease, now).authorized`; fail-closed on bad input.
 */
export function isLeaseValid(lease: CapabilityLease | null | undefined, now: number): boolean {
  return checkLease(lease, now).authorized;
}
