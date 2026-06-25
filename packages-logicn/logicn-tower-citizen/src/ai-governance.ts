/**
 * ai-governance.ts — Hallucination-proof AI action admission via No-Coercion.
 *
 * The headline guarantee, made executable: **an AI proposal can NEVER cause an action the core rules deny.**
 *
 * Model: the AI is an UNTRUSTED proposer; the rigid Zero-Trust core is the GATE. For each candidate action
 * we hold two verdicts — the core's capability decision (trusted) and the AI's proposal (untrusted, where
 * ALLOW = "I want to take this", DENY = "I decline it", INDETERMINATE = "no opinion"). The effective verdict
 * is the Kleene meet:
 *
 *     effective(action) = vAnd(core, ai) = min(core, ai)      (No-Coercion: an untrusted operand only LOWERS)
 *
 * and an action executes ONLY when `effective === ALLOW`, i.e. ONLY when BOTH core AND ai are ALLOW. Two
 * theorems fall straight out of `min`, and both are CHECKED here at runtime (fail-closed):
 *
 *   1. **Containment** — `admitted ⊆ core-allowed`. An admitted action had effective = 1 = min(core, ai),
 *      so core = 1. The AI can pick WITHIN the core-allowed set; it can never EXPAND it. No matter how badly
 *      the model hallucinates, the worst it can do is propose garbage — and garbage is denied or ignored.
 *   2. **Monotone safety (No-Coercion)** — `effective ≤ core` for every action. The AI proposal can only
 *      narrow the admitted set, never widen a verdict upward.
 *
 * `blockedHallucinations` surfaces exactly the actions the AI wanted (ai = ALLOW) that the core refused —
 * the guarantee caught in the act, as audit evidence (not a heuristic; a proof).
 *
 * Untrusted-input discipline: a malformed verdict (anything not a trit) fails CLOSED to DENY for that action
 * — an unparseable AI output can never become an admission. This composes the proven scalar `vAnd`; for an
 * AI that emits a probability vector rather than a trit, collapse it first with `collapseConfidence`.
 */

import { Verdict, vAnd } from "./three-valued-governance.js";

export interface AiActionProposal {
  /** A human/audit name for the candidate action (e.g. "database.delete:orders"). */
  readonly action: string;
  /** The TRUSTED zero-trust core capability decision for this action. */
  readonly coreVerdict: Verdict;
  /** The UNTRUSTED AI proposal: ALLOW = wants it · DENY = declines · INDETERMINATE = no opinion. */
  readonly aiVerdict: Verdict;
}

export interface AiActionDecision {
  readonly action: string;
  readonly core: Verdict;
  readonly ai: Verdict;
  /** vAnd(core, ai) = min — the AI proposal can only ever LOWER this. */
  readonly effective: Verdict;
  /** Executes IFF effective === ALLOW (so iff BOTH core and ai were ALLOW). */
  readonly admitted: boolean;
  /** True when an input verdict was malformed and was failed-closed to DENY. */
  readonly malformed: boolean;
}

export interface AiGovernanceResult {
  readonly decisions: readonly AiActionDecision[];
  /** Actions that will execute (effective === ALLOW). Guaranteed a subset of the core-allowed set. */
  readonly admitted: readonly string[];
  /** Actions the AI proposed (ai = ALLOW) that the core did NOT allow — blocked. The guarantee, visible. */
  readonly blockedHallucinations: readonly string[];
  /** Theorem 1 — every admitted action had core === ALLOW (the AI never expanded the allowed set). */
  readonly containmentHeld: boolean;
  /** Theorem 2 — effective ≤ core for every action (No-Coercion / monotone safety). */
  readonly noCoercionHeld: boolean;
}

const isTrit = (v: unknown): v is Verdict => v === -1 || v === 0 || v === 1;

/**
 * Admit AI-proposed actions through the No-Coercion meet, fail-closed. Returns the admitted set (always a
 * subset of the core-allowed set), the blocked hallucinations, and the two safety theorems checked live.
 * If either theorem is ever violated (impossible by `min`, so it would indicate a tampered/broken gate),
 * the admitted set is FORCED EMPTY — fail-closed, no admission is trusted past a broken invariant.
 */
export function governAiProposal(proposals: readonly AiActionProposal[]): AiGovernanceResult {
  if (!Array.isArray(proposals)) {
    // Malformed batch — admit nothing (deny-by-default).
    return { decisions: [], admitted: [], blockedHallucinations: [], containmentHeld: true, noCoercionHeld: true };
  }

  const decisions: AiActionDecision[] = proposals.map((p) => {
    const coreOk = isTrit(p?.coreVerdict);
    const aiOk = isTrit(p?.aiVerdict);
    // Untrusted/invalid input fails closed to DENY (never admitted), for either operand.
    const core: Verdict = coreOk ? p.coreVerdict : Verdict.DENY;
    const ai: Verdict = aiOk ? p.aiVerdict : Verdict.DENY;
    const effective = vAnd(core, ai); // = min
    return {
      action: typeof p?.action === "string" ? p.action : "<unnamed>",
      core, ai, effective,
      admitted: effective === Verdict.ALLOW,
      malformed: !coreOk || !aiOk,
    };
  });

  const containmentHeld = decisions.every((d) => !d.admitted || d.core === Verdict.ALLOW);
  const noCoercionHeld = decisions.every((d) => d.effective <= d.core);

  // Defense-in-depth: a violated invariant means the gate itself is compromised → trust no admission.
  const safe = containmentHeld && noCoercionHeld;
  const admitted = safe ? decisions.filter((d) => d.admitted).map((d) => d.action) : [];
  const blockedHallucinations = decisions
    .filter((d) => d.ai === Verdict.ALLOW && d.core !== Verdict.ALLOW)
    .map((d) => d.action);

  return { decisions, admitted, blockedHallucinations, containmentHeld, noCoercionHeld };
}
