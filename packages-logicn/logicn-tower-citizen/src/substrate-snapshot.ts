/**
 * substrate-snapshot.ts — calibration-as-attestation core (owner-approved build 2026-06-25).
 *
 * A SubstrateModelSnapshot binds a substrate's noise PARAMETERS to its modeled guarantee. The whole point
 * of "calibration as attestation": the noise figures (pBad / epsilonModeled / met) are STAMPED FROM THE
 * MODEL (`checkGuarantee`), NOT supplied by the author or the hardware — so a producer cannot hand-wave the
 * tolerance down to make a lane "pass". Because `checkGuarantee` is a deterministic, exact function of the
 * parameters, a snapshot is SELF-VERIFYING: `verifySubstrateSnapshot` re-derives the figures and rejects any
 * snapshot whose stamped values diverge (tampered / gamed) — and admits ONLY a consistent snapshot whose
 * guarantee is met (fail-closed). No-Coercion holds: a snapshot can only ever LOWER admissibility, never lift
 * an unmet guarantee into "met".
 *
 * This is the CRYPTO-FREE core (authoritative stamping + consistency re-check). Turning the snapshot into a
 * portable, SIGNED attestation (Ed25519, mirroring bridge-attestation) is a tracked follow-up.
 */

import { type SubstrateParameters, type SubstrateGuarantee, checkGuarantee } from "./substrate-model.js";

/** A model snapshot: the parameters + declared guarantee, plus the figures STAMPED FROM `checkGuarantee`. */
export interface SubstrateModelSnapshot {
  readonly schema: "lln.substrate.snapshot.v1";
  readonly lane: string;
  readonly params: SubstrateParameters;
  readonly guarantee: SubstrateGuarantee;
  // Authoritative — derived from `params` by the model, NOT author-supplied. Re-derivable ⇒ tamper-evident.
  readonly pBad: number;
  readonly epsilonModeled: number;
  readonly met: boolean;
}

/**
 * Build a snapshot by STAMPING the authoritative noise figures from the model (`checkGuarantee`). The author
 * supplies only the parameters + the guarantee they claim; the figures are computed here, so they cannot be
 * hand-waved. Throws (via checkGuarantee's validation) on an invalid guarantee — fail-closed at build time.
 */
export function buildSubstrateSnapshot(
  params: SubstrateParameters,
  guarantee: SubstrateGuarantee,
  lane: string,
): SubstrateModelSnapshot {
  const check = checkGuarantee(params, guarantee);
  return {
    schema: "lln.substrate.snapshot.v1",
    lane,
    params,
    guarantee,
    pBad: check.pBad,
    epsilonModeled: check.epsilonModeled,
    met: check.met,
  };
}

/** Deterministic canonical serialization of a snapshot (stable key order) — the basis for a future signature. */
export function canonicalSnapshot(s: SubstrateModelSnapshot): string {
  const p = s.params;
  const g = s.guarantee;
  return JSON.stringify({
    schema: s.schema,
    lane: s.lane,
    params: { seed: p.seed, phaseDriftSigma: p.phaseDriftSigma, crosstalkCoeff: p.crosstalkCoeff, laneFailureProb: p.laneFailureProb, readoutSigma: p.readoutSigma },
    guarantee: { resultId: g.resultId, epsilonDeclared: g.epsilonDeclared, redundancyN: g.redundancyN, mustCommit: g.mustCommit },
    pBad: s.pBad,
    epsilonModeled: s.epsilonModeled,
    met: s.met,
  });
}

export interface SnapshotVerdict {
  /** The stamped figures match a fresh model re-derivation (not tampered / gamed). */
  readonly consistent: boolean;
  /** The guarantee is met under the RE-DERIVED noise (trusts the model, not the stamped flag). */
  readonly met: boolean;
  /** Admit IFF consistent AND met — fail-closed. */
  readonly admit: boolean;
  readonly reason: string;
}

/**
 * Verify a snapshot against the model, fail-closed. Re-derives pBad/epsilonModeled/met from `params` and
 * rejects any snapshot whose stamped figures diverge — a producer cannot forge a lower pBad to claim a
 * tolerance it cannot meet. Admits ONLY a consistent snapshot whose guarantee is met.
 */
export function verifySubstrateSnapshot(snapshot: SubstrateModelSnapshot): SnapshotVerdict {
  let fresh;
  try {
    fresh = checkGuarantee(snapshot.params, snapshot.guarantee);
  } catch (e) {
    return { consistent: false, met: false, admit: false, reason: `snapshot params/guarantee invalid: ${(e as Error).message}` };
  }
  const eq = (a: number, b: number) => Math.abs(a - b) <= 1e-12;
  const consistent =
    eq(fresh.pBad, snapshot.pBad) &&
    eq(fresh.epsilonModeled, snapshot.epsilonModeled) &&
    fresh.met === snapshot.met;
  const met = fresh.met; // trust the re-derived model result, NOT the (possibly tampered) stamped flag
  const admit = consistent && met;
  const reason = !consistent
    ? "snapshot figures DIVERGE from the model re-derivation — tampered or gamed (rejected)"
    : !met
      ? "guarantee NOT met under the modeled noise (tolerance unachievable at the declared redundancy)"
      : "consistent with the model and guarantee met";
  return { consistent, met, admit, reason };
}
