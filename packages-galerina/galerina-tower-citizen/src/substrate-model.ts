/**
 * substrate-model.ts — seeded substrate failure-mode model (Direction C)
 *
 * A SOFTWARE simulation of an emerging photonic/ternary substrate's failure modes
 * (phase-drift, crosstalk, lane-failure, readout noise), so the verifier can reason
 * about a flow's declared guarantee *before any silicon exists*. It is NOT a hardware
 * twin: it is (a) a conservative checker, and (b) the spec a future backend is held to.
 *
 * Reuse, don't modify: this is a NEW sibling of tpl-simulator.ts. It imports
 * `consensusTrit` (the #173/#196 3-input majority kernel) and Direction A's `vAnd`/
 * `Verdict`/`decideAtBoundary` UNCHANGED. tpl-simulator's gate semantics are frozen.
 *
 * The central result (§4 of galerina-substrate-failure-model.md):
 *   effectiveVerdict(ideal, reading) = vAnd(ideal, reading)
 *   ⇒ substrate noise can only DEGRADE a verdict toward deny, never UPGRADE a 0/-1
 *     into +1. So the substrate can cost AVAILABILITY (a legitimate +1 denied), never
 *     SAFETY (an illegitimate +1 allowed). Safety is structural, inherited from
 *     Direction A's No-Coercion theorem; availability is bounded by the NMR check below.
 *
 * Determinism: the only entropy source is the injected `seed`, mixed with a static
 * op identity. No non-seeded randomness, no wall-clock time. Same (seed, op) →
 * byte-identical result, so verifier output is a reproducible build artifact.
 *
 * Spec: docs/Knowledge-Bases/galerina-substrate-failure-model.md.
 */

import { consensusTrit } from "./tpl-simulator.js";
import { Verdict, vAnd } from "./three-valued-governance.js";
import { dispatchDeadZone, type OnIndeterminate } from "./deadzone-dispatcher.js";
// Pure NMR compute is the shared single source of truth (also used by the compiler's
// substrate-inference). This module keeps the SubstrateParamError-throwing validation
// wrappers below; the math itself lives in @galerina/substrate-math.
import {
  flipProbability as mathFlipProbability,
  singleLaneErrorProbability as mathSingleLaneErrorProbability,
  nmrFailureProbability as mathNmrFailureProbability,
} from "@galerina/substrate-math";

// ── Errors ────────────────────────────────────────────────────────────────────

export class SubstrateParamError extends Error {
  constructor(message: string) {
    super(`[SUBSTRATE_PARAM]: ${message}`);
    this.name = "SubstrateParamError";
  }
}

// ── Parameters ──────────────────────────────────────────────────────────────-

/** Software model of the substrate's noise. All four sigmas/probabilities ∈ [0,1]. */
export interface SubstrateParameters {
  /** uint32 master seed — the ONLY entropy source. 0 is remapped to 1. */
  readonly seed: number;
  /** Phase-shifter AWGN / thermo-optic shift, as a fraction of a 2π cycle. */
  readonly phaseDriftSigma: number;
  /** Linear neighbour-lane coupling fraction (crosstalk). */
  readonly crosstalkCoeff: number;
  /** Per-op probability a lane goes dark → abstains to INDETERMINATE (0). */
  readonly laneFailureProb: number;
  /** Vote-margin jitter at readout (shot + thermal noise). */
  readonly readoutSigma: number;
}

// Calibration gains (PHASE/XTALK/READOUT) and the per-lane error formula now live in
// @galerina/substrate-math (the shared single source of truth). This module wraps that
// compute with SubstrateParamError-throwing validation.
function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}
function assertProb(name: string, v: number): void {
  if (typeof v !== "number" || Number.isNaN(v) || v < 0 || v > 1) {
    throw new SubstrateParamError(`${name} must be a number in [0,1], got ${v}`);
  }
}
function validateParams(p: SubstrateParameters): void {
  if (!Number.isInteger(p.seed)) throw new SubstrateParamError(`seed must be an integer, got ${p.seed}`);
  assertProb("phaseDriftSigma", p.phaseDriftSigma);
  assertProb("crosstalkCoeff", p.crosstalkCoeff);
  assertProb("laneFailureProb", p.laneFailureProb);
  assertProb("readoutSigma", p.readoutSigma);
}
function assertOddPositive(N: number): void {
  if (!Number.isInteger(N) || N < 1 || N % 2 === 0) {
    throw new SubstrateParamError(`redundancy N must be a positive odd integer, got ${N}`);
  }
}
function assertTritValue(t: number): asserts t is -1 | 0 | 1 {
  if (t !== -1 && t !== 0 && t !== 1) throw new SubstrateParamError(`trit must be -1, 0, or 1, got ${t}`);
}

/**
 * Single-lane error probability pBad (validated wrapper). Validation throws
 * SubstrateParamError (including the seed check); the pure compute is delegated to
 * @galerina/substrate-math so the simulator and the compiler verifier share ONE implementation.
 */
export function singleLaneErrorProbability(p: SubstrateParameters): number {
  validateParams(p);
  return mathSingleLaneErrorProbability(p);
}

// ── Seeded PRNG (Mulberry32) — deterministic, integer-safe, no wall clock ──────

function fnv1a(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

function mulberry32(a: number): () => number {
  let t = a >>> 0;
  return function (): number {
    t = (t + 0x6d2b79f5) | 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** A fresh uniform-[0,1) stream addressed by (seed, op identity). 0 → 1 (non-degenerate). */
function makeStream(seed: number, opId: string): () => number {
  const mixed = ((fnv1a(opId) ^ (seed >>> 0)) >>> 0) || 1;
  return mulberry32(mixed);
}

// ── Odd-N majority vote (reuses consensusTrit for N=3) ────────────────────────

/** Balanced-ternary majority: sign of the sum, 0 on a tie (fail-closed neutral). */
export function majorityVote(trits: readonly number[]): -1 | 0 | 1 {
  if (trits.length === 0) return 0;
  let sum = 0;
  for (const t of trits) {
    assertTritValue(t);
    sum += t;
  }
  return sum > 0 ? 1 : sum < 0 ? -1 : 0;
}

// ── The seeded fault injector ──────────────────────────────────────────────────

export interface Reading {
  readonly value: -1 | 0 | 1; // 0 = abstention/HOLD = Verdict.INDETERMINATE
  readonly indeterminate: boolean; // true iff this reading was a lane-failure erasure
  readonly noiseMargin: number; // headroom (1 - pFlip) — explainability only
}

export interface Neighbors {
  readonly left: -1 | 0 | 1;
  readonly right: -1 | 0 | 1;
}
const NO_NEIGHBORS: Neighbors = { left: 0, right: 0 };

/**
 * A lane that perturbs a clean trit under the substrate noise. Physical model:
 *   - lane-failure (tested FIRST) → erasure to 0 (a dead lane abstains; never fabricates ±1)
 *   - survive-then-flip → a definite ±1 degrades ONE adjacent step to 0 (HOLD); a 0 flips to
 *     ±1 with a crosstalk-biased direction. A ±1 never inverts in a single step.
 *   - else → correct
 * The pure gates are untouched; only the value handed to a gate/vote is perturbed.
 */
export class NoisyLane {
  constructor(readonly params: SubstrateParameters) {
    validateParams(params);
  }

  read(t: -1 | 0 | 1, opId: string, neighbors: Neighbors = NO_NEIGHBORS): Reading {
    assertTritValue(t);
    const rng = makeStream(this.params.seed, opId);
    if (rng() < this.params.laneFailureProb) {
      return { value: 0, indeterminate: true, noiseMargin: 0 };
    }
    const pFlip = mathFlipProbability(this.params);
    if (rng() < pFlip) {
      let v: -1 | 0 | 1;
      if (t === 0) {
        const bias = clamp(this.params.crosstalkCoeff * (neighbors.left + neighbors.right), -1, 1);
        v = rng() < 0.5 + bias / 2 ? 1 : -1;
      } else {
        v = 0; // single adjacent step toward HOLD — degrade, never invert
      }
      return { value: v, indeterminate: false, noiseMargin: 1 - pFlip };
    }
    return { value: t, indeterminate: false, noiseMargin: 1 - pFlip };
  }

  /** N independent replicas (replica index remixed into the seed), folded by majority. */
  readVoted(t: -1 | 0 | 1, N: number, opId: string, neighbors: Neighbors = NO_NEIGHBORS): Reading {
    assertOddPositive(N);
    const trits: number[] = [];
    for (let k = 0; k < N; k++) trits.push(this.read(t, `${opId}:r${k}`, neighbors).value);
    const value = majorityVote(trits);
    return { value, indeterminate: value === 0, noiseMargin: 0 };
  }

  /**
   * Like {@link readVoted}, but when the vote lands in the K3-0 dead zone (value 0 / indeterminate) it
   * EXECUTES the flow's declared `on_indeterminate` policy (trap | revote:N | fallback_digital) instead of
   * silently propagating INDETERMINATE. Fail-closed: an unresolved dead zone TRAPS (SubstrateDeadZoneTrap),
   * never a guessed value. A non-indeterminate vote is returned unchanged (the policy is not invoked). This
   * is the runtime executor for the previously-parsed-but-dead substrate `on_indeterminate` policy.
   */
  readVotedGoverned(
    t: -1 | 0 | 1,
    N: number,
    opId: string,
    policy: OnIndeterminate,
    neighbors: Neighbors = NO_NEIGHBORS,
  ): Reading {
    const r = this.readVoted(t, N, opId, neighbors);
    if (r.value !== 0) return r; // definite — no dead-zone policy needed
    return dispatchDeadZone(policy, t, (n) => this.readVoted(t, n, `${opId}:revote`, neighbors));
  }
}

// ── Safety composition — the central fail-closed result ───────────────────────

/**
 * The governance-effective verdict of a substrate reading: vAnd(ideal, reading)
 * (Kleene ∧). A reading can CONFIRM or DEGRADE the ideal verdict, never UPGRADE it.
 * Therefore no substrate failure can manufacture an ALLOW (proof: spec §4).
 */
export function effectiveVerdict(ideal: Verdict, reading: -1 | 0 | 1): Verdict {
  return vAnd(ideal, reading as Verdict);
}

// ── Analytic guarantee check (von Neumann NMR, exact closed form) ─────────────

/**
 * Conservative residual error of N-modular redundancy (validated wrapper). Validation
 * throws SubstrateParamError; the pure von Neumann NMR closed form is delegated to
 * @galerina/substrate-math (shared with the compiler — single source of truth).
 */
export function nmrFailureProbability(pBad: number, N: number): number {
  assertProb("pBad", pBad);
  assertOddPositive(N);
  return mathNmrFailureProbability(pBad, N);
}

export interface SubstrateGuarantee {
  readonly resultId: string;
  readonly epsilonDeclared: number; // max acceptable P(committing result not delivered)
  readonly redundancyN: number; // declared TMR factor (odd; 1 = none)
  readonly mustCommit: boolean; // true ⇒ a +1 result is required (availability obligation)
}

export interface SubstrateCheckResult {
  readonly resultId: string;
  readonly pBad: number;
  readonly epsilonModeled: number;
  readonly met: boolean;
  readonly trace: ReadonlyArray<{ readonly N: number; readonly epsilon: number }>;
  readonly redundancyHelps: boolean; // pBad < 0.5
}

const TRACE_NS = [1, 3, 5, 7] as const;

function validateGuarantee(g: SubstrateGuarantee): void {
  assertProb("epsilonDeclared", g.epsilonDeclared);
  assertOddPositive(g.redundancyN);
}

/** Deterministic, exact. The verifier's canonical tolerance decision. */
export function checkGuarantee(params: SubstrateParameters, g: SubstrateGuarantee): SubstrateCheckResult {
  const pBad = singleLaneErrorProbability(params);
  validateGuarantee(g);
  const epsilonModeled = nmrFailureProbability(pBad, g.redundancyN);
  const met = g.mustCommit ? epsilonModeled <= g.epsilonDeclared : true;
  const trace = TRACE_NS.map((N) => ({ N, epsilon: nmrFailureProbability(pBad, N) }));
  return { resultId: g.resultId, pBad, epsilonModeled, met, trace, redundancyHelps: pBad < 0.5 };
}

// ── Diagnostics — SPORE-SUBSTRATE-* (fail-closed) ───────────────────────────────

export const SUBSTRATE_DIAGNOSTICS = {
  CRYPTO_ON_NOISY_LANE: "SPORE-SUBSTRATE-001",
  TOLERANCE_UNACHIEVABLE_UNDER_NOISE: "SPORE-SUBSTRATE-002",
  REDUNDANCY_INSUFFICIENT: "SPORE-SUBSTRATE-003",
  UNVOTED_ANALOG_INTO_DETERMINISTIC: "SPORE-SUBSTRATE-004",
} as const;

export interface SubstrateDiagnostic {
  readonly code: string;
  readonly name: string;
  readonly severity: "error" | "warning";
  readonly message: string;
}

export interface SubstrateVerifyContext {
  readonly hasCryptoEffect: boolean;
  readonly laneIsNoisy: boolean;
  readonly sinkRequiresDeterminism: boolean;
}

export type SubstrateProfile = "dev" | "production" | "deterministic";

export interface SubstrateDecision {
  readonly verdict: Verdict;
  readonly check: SubstrateCheckResult;
  readonly diagnostic?: SubstrateDiagnostic;
}

function deny(
  code: string,
  name: string,
  severity: "error" | "warning",
  message: string,
  check: SubstrateCheckResult,
): SubstrateDecision {
  return { verdict: Verdict.DENY, check, diagnostic: { code, name, severity, message } };
}

/**
 * Resolve whether a flow's declared substrate guarantee is provable under the model.
 * Fail-closed: any unproved guarantee, crypto-on-noisy, insufficient redundancy, or
 * un-voted-analog-into-deterministic yields DENY + an SPORE-SUBSTRATE-* diagnostic.
 * Priority: crypto (001) > unvoted-into-deterministic (004) > redundancy (003) > tolerance (002).
 */
export function verifyToleranceUnderNoise(
  params: SubstrateParameters,
  g: SubstrateGuarantee,
  ctx: SubstrateVerifyContext,
  profile: SubstrateProfile,
): SubstrateDecision {
  const check = checkGuarantee(params, g);
  const D = SUBSTRATE_DIAGNOSTICS;

  // 001 — integrity can never be tolerance-bounded; forbidden outright.
  if (ctx.hasCryptoEffect && ctx.laneIsNoisy) {
    return deny(D.CRYPTO_ON_NOISY_LANE, "CRYPTO_ON_NOISY_LANE", "error",
      "crypto/hash/sign effect declared on a noisy lane — integrity requires bit-exactness and cannot be tolerance-bounded; move it to a digital lane", check);
  }
  // 004 — an un-voted (N=1) noisy result must not feed a deterministic sink.
  if (ctx.laneIsNoisy && ctx.sinkRequiresDeterminism && g.redundancyN === 1) {
    return deny(D.UNVOTED_ANALOG_INTO_DETERMINISTIC, "UNVOTED_ANALOG_INTO_DETERMINISTIC", "error",
      "un-voted analog/noisy result feeds a context requiring determinism — require an N-modular (consensusTrit) vote or a digital lane", check);
  }
  if (!check.met) {
    // 003 — voting fundamentally cannot help (pBad ≥ 0.5), or declared redundancy is still short.
    if (!check.redundancyHelps) {
      return deny(D.REDUNDANCY_INSUFFICIENT, "REDUNDANCY_INSUFFICIENT", "error",
        `redundancy cannot meet tolerance: single-lane error pBad=${check.pBad} ≥ 0.5, so majority voting does not converge`, check);
    }
    if (g.redundancyN > 1) {
      return deny(D.REDUNDANCY_INSUFFICIENT, "REDUNDANCY_INSUFFICIENT", "error",
        `declared redundancy N=${g.redundancyN} insufficient: modeled error ${check.epsilonModeled} > tolerance ${g.epsilonDeclared}; raise N`, check);
    }
    // 002 — tolerance unmet at N=1; raising redundancy would help (warning in dev).
    const severity = profile === "dev" ? "warning" : "error";
    return deny(D.TOLERANCE_UNACHIEVABLE_UNDER_NOISE, "TOLERANCE_UNACHIEVABLE_UNDER_NOISE", severity,
      `tolerance unachievable under modeled noise: ${check.epsilonModeled} > ${g.epsilonDeclared} at N=1; declare redundancy (TMR via consensusTrit)`, check);
  }
  return { verdict: Verdict.ALLOW, check };
}

// ── Monte-Carlo cross-check (validates the closed form; deterministic, seeded) ─

/**
 * Empirical voted-error rate under ADVERSARIAL corruption (a bad lane votes the
 * worst value), so it converges to nmrFailureProbability(pBad, N). Used only to
 * cross-validate the closed-form check — deterministic given the seed.
 */
export function empiricalAdversarialError(
  params: SubstrateParameters,
  ideal: -1 | 0 | 1,
  N: number,
  trials: number,
): number {
  assertTritValue(ideal);
  assertOddPositive(N);
  const pBad = singleLaneErrorProbability(params);
  let wrong = 0;
  for (let i = 0; i < trials; i++) {
    const rng = makeStream(params.seed, `adv:${ideal}:${N}:${i}`);
    const lanes: number[] = [];
    for (let k = 0; k < N; k++) {
      if (rng() < pBad) {
        lanes.push(ideal === 0 ? (rng() < 0.5 ? 1 : -1) : ((-ideal) as -1 | 0 | 1));
      } else {
        lanes.push(ideal);
      }
    }
    if (majorityVote(lanes) !== ideal) wrong++;
  }
  return wrong / trials;
}

/** N=3 majority delegates to the shipped consensusTrit (reuse, not reimplement). */
export function votedTrit3(a: -1 | 0 | 1, b: -1 | 0 | 1, c: -1 | 0 | 1): -1 | 0 | 1 {
  return consensusTrit(a, b, c) as -1 | 0 | 1;
}
