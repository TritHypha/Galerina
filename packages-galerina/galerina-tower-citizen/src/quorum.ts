/**
 * quorum.ts — FAIL-CLOSED distinct-signer M-of-N threshold quorum → K3 verdict.
 *
 * G2 (core half). A sensitive custody action (e.g. unwrapping a sealed key, admitting
 * a high-trust transition) may require the independent approval of M out of N distinct
 * signers. This module is the DECISION: it folds a set of per-signer K3 verdicts into a
 * single three-valued boundary verdict — ALLOW iff at least M *distinct* signers approve.
 *
 * SCOPE — this is governance, not cryptography. It decides WHETHER the threshold is met;
 * it does NOT split or reconstruct any secret. Shamir M-of-N secret-SHARING (the actual
 * share split/combine over key material) is custody EXECUTION and belongs in an external
 * custody package (per the core-declares-verifies / ext-executes split,
 * [[galerina-key-custody-rotation-decision]]). Each `SignerVote.verdict` is expected to be
 * the result of an upstream signature/attestation verification done on binary silicon
 * (SPORE-SUBSTRATE-001); this primitive treats it as an already-decided trit.
 *
 * Invariants (inherited verbatim from the K3 algebra in three-valued-governance.ts —
 * NOT re-proved here), mirroring lease.ts:
 *  - **Deny-by-default.** Malformed input (a non-integer or < 1 threshold, a non-array
 *    vote set, a vote with an empty signer or an out-of-domain verdict) folds to
 *    INDETERMINATE → denied, audited SPORE-GOV-3VL-001. There is no path by which bad
 *    input authorizes.
 *  - **Distinct signers only.** Votes are de-duplicated by `signer`; one signer counts
 *    AT MOST once (anti-Sybil — a signer cannot reach the threshold alone by repeating).
 *  - **No equivocation.** A signer that presents two *conflicting* verdicts is a security
 *    anomaly: the whole decision collapses to INDETERMINATE (audited), never silently
 *    dropped — we do not authorize past a detected equivocation.
 *  - **Clean shortfall is a DENY, not an anomaly.** When the input is well-formed but
 *    fewer than M distinct signers approve, the verdict is an ordinary DENY (no
 *    diagnostic) — exactly as an expired (but well-formed) lease is a clean DENY. Only
 *    malformed/equivocating input raises SPORE-GOV-3VL-001.
 *  - **Pure.** No clock, no I/O, no randomness — same (votes, m) always yields the same
 *    decision (reproducible audit).
 */

import {
  Verdict,
  decideAtBoundary,
  type BoundaryDecision,
  type GovernanceDiagnostic,
} from "./three-valued-governance.js";

/** One signer's independent K3 verdict on the action. */
export interface SignerVote {
  /** Distinct signer identity (e.g. a keyId). De-duplicated; one signer counts once. */
  readonly signer: string;
  /** That signer's already-decided verdict (ALLOW / DENY / INDETERMINATE). */
  readonly verdict: Verdict;
}

/** The outcome of folding the votes at the threshold boundary. */
export interface QuorumDecision extends BoundaryDecision {
  /** The required number of distinct approvals (M). */
  readonly threshold: number;
  /** How many DISTINCT signers approved (ALLOW), after de-duplication. */
  readonly distinctApprovals: number;
  /** Why the quorum was withheld, or `null` when ALLOWed. */
  readonly reason: QuorumDenyReason | null;
}

/** The reason a quorum did not authorize. */
export type QuorumDenyReason = "insufficient_quorum" | "malformed";

/** A single vote is valid iff it names a non-empty signer and a Verdict in {-1, 0, 1}. */
function isValidVote(v: unknown): v is SignerVote {
  if (v === null || typeof v !== "object") return false;
  const vote = v as Record<string, unknown>;
  if (typeof vote.signer !== "string" || vote.signer.length === 0) return false;
  return vote.verdict === Verdict.ALLOW || vote.verdict === Verdict.DENY || vote.verdict === Verdict.INDETERMINATE;
}

/**
 * Tally the distinct approvals, fail-closed. Returns `malformed: true` (and a zeroed
 * count) on any structural problem OR a signer equivocation; otherwise the count of
 * DISTINCT signers whose (de-duplicated) verdict is ALLOW.
 */
function tally(votes: readonly SignerVote[] | unknown, m: number): { malformed: boolean; distinctApprovals: number } {
  if (!Array.isArray(votes)) return { malformed: true, distinctApprovals: 0 };
  if (typeof m !== "number" || !Number.isInteger(m) || m < 1) return { malformed: true, distinctApprovals: 0 };
  const bySigner = new Map<string, Verdict>();
  for (const v of votes) {
    if (!isValidVote(v)) return { malformed: true, distinctApprovals: 0 };
    const prev = bySigner.get(v.signer);
    if (prev !== undefined && prev !== v.verdict) return { malformed: true, distinctApprovals: 0 }; // equivocation
    bySigner.set(v.signer, v.verdict);
  }
  let approvals = 0;
  for (const verdict of bySigner.values()) if (verdict === Verdict.ALLOW) approvals += 1;
  return { malformed: false, distinctApprovals: approvals };
}

/**
 * Map a vote set + threshold to a three-valued Verdict.
 *
 *  - malformed input / equivocating signer        → INDETERMINATE (deny-by-default)
 *  - well-formed, fewer than M distinct approvals  → DENY (clean shortfall)
 *  - well-formed, ≥ M distinct approvals           → ALLOW
 */
export function quorumVerdict(votes: readonly SignerVote[] | unknown, m: number): Verdict {
  const t = tally(votes, m);
  if (t.malformed) return Verdict.INDETERMINATE;
  return t.distinctApprovals >= m ? Verdict.ALLOW : Verdict.DENY;
}

/**
 * Admit an M-of-N distinct-signer quorum at the trust boundary, fail-closed and audited.
 *
 * `authorized` is `true` ONLY when the input is well-formed AND at least `m` DISTINCT
 * signers approve. A clean shortfall (well-formed, < m approvals) is an ordinary DENY
 * (no diagnostic); malformed input or a signer equivocation collapses to INDETERMINATE
 * carrying SPORE-GOV-3VL-001 (also forwarded to `onDiagnostic` if provided). Pure.
 */
export function checkQuorum(
  votes: readonly SignerVote[] | unknown,
  m: number,
  onDiagnostic?: (d: GovernanceDiagnostic) => void,
): QuorumDecision {
  const t = tally(votes, m);
  const verdict = t.malformed
    ? Verdict.INDETERMINATE
    : t.distinctApprovals >= m
      ? Verdict.ALLOW
      : Verdict.DENY;
  const boundary = decideAtBoundary(verdict, onDiagnostic);
  const reason: QuorumDenyReason | null =
    boundary.authorized ? null : t.malformed ? "malformed" : "insufficient_quorum";
  return {
    ...boundary,
    threshold: typeof m === "number" && Number.isFinite(m) ? m : 0,
    distinctApprovals: t.distinctApprovals,
    reason,
  };
}

/**
 * Convenience predicate — `true` IFF the quorum is well-formed AND met at threshold `m`.
 * Equivalent to `checkQuorum(votes, m).authorized`; fail-closed on bad input.
 */
export function meetsQuorum(votes: readonly SignerVote[] | unknown, m: number): boolean {
  return checkQuorum(votes, m).authorized;
}
