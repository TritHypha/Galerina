// =============================================================================
// @galerina/substrate-math — pure substrate-noise math (single source of truth)
//
// The closed-form calculus shared by the photonic/ternary governance layer:
//   - singleLaneErrorProbability(params) → pBad  (per-lane error: laneFailure OR survive-then-flip)
//   - nmrFailureProbability(pBad, N)      → conservative residual of N-modular redundancy
//                                           (von Neumann NMR: P(≥⌈N/2⌉ of N lanes bad))
//   - flipProbability(params)             → per-lane survive-but-flip probability
//
// Zero runtime deps. Pure, stateless, deterministic, mathematically fixed. Extracted
// so galerina-tower-citizen (substrate-model.ts, the simulator) and galerina-core-compiler
// (substrate-inference.ts, the verifier pass) compute the SAME numbers from ONE
// implementation — eliminating the copy-and-drift risk the golden-value oracle guarded.
//
// Validation throws SubstrateMathError. Consumers that need a different error contract
// (e.g. tower-citizen's SubstrateParamError) validate in their own wrapper BEFORE calling.
//
// Spec: docs/Knowledge-Bases/galerina-substrate-failure-model.md §3.2/§3.4,
//       docs/Knowledge-Bases/galerina-substrate-contracts.md §6.
// =============================================================================

export class SubstrateMathError extends Error {
  constructor(message: string) {
    super(`[SUBSTRATE_MATH]: ${message}`);
    this.name = "SubstrateMathError";
  }
}

/** The four physical noise parameters (no seed — seed is a simulator concern, not math). */
export interface SubstrateNoiseParams {
  readonly phaseDriftSigma: number;
  readonly crosstalkCoeff: number;
  readonly laneFailureProb: number;
  readonly readoutSigma: number;
}

// Calibration gains — documented placeholder knobs (no silicon to calibrate against;
// conservative defaults, retunable). Map physical parameters to a per-lane flip probability.
const PHASE_GAIN = 1.0;
const XTALK_GAIN = 0.5;
const READOUT_GAIN = 0.5;

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

function assertProb(name: string, v: number): void {
  if (typeof v !== "number" || Number.isNaN(v) || v < 0 || v > 1) {
    throw new SubstrateMathError(`${name} must be a number in [0,1], got ${v}`);
  }
}

function assertOddPositive(N: number): void {
  if (!Number.isInteger(N) || N < 1 || N % 2 === 0) {
    throw new SubstrateMathError(`redundancy N must be a positive odd integer, got ${N}`);
  }
}

/** Per-lane probability the lane survives but flips (phase/crosstalk/readout). */
export function flipProbability(p: SubstrateNoiseParams): number {
  return clamp01(p.phaseDriftSigma * PHASE_GAIN + p.crosstalkCoeff * XTALK_GAIN + p.readoutSigma * READOUT_GAIN);
}

/**
 * pBad = P(a lane does NOT deliver the correct trit) = laneFailure OR (survive AND flip).
 * Monotone non-decreasing in every parameter; always in [0,1].
 */
export function singleLaneErrorProbability(p: SubstrateNoiseParams): number {
  assertProb("phaseDriftSigma", p.phaseDriftSigma);
  assertProb("crosstalkCoeff", p.crosstalkCoeff);
  assertProb("laneFailureProb", p.laneFailureProb);
  assertProb("readoutSigma", p.readoutSigma);
  const pFlip = flipProbability(p);
  return clamp01(p.laneFailureProb + (1 - p.laneFailureProb) * pFlip);
}

function binom(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  const kk = Math.min(k, n - k);
  let c = 1;
  for (let i = 0; i < kk; i++) c = (c * (n - i)) / (i + 1);
  return c;
}

/**
 * Conservative residual error of N-modular redundancy: P(at least ⌈N/2⌉ of N independent
 * lanes are bad), assuming a bad lane is adversarial (worst case). Strictly decreasing in
 * odd N for pBad < 0.5 (von Neumann NMR). Exact closed form — no sampling.
 */
export function nmrFailureProbability(pBad: number, N: number): number {
  assertProb("pBad", pBad);
  assertOddPositive(N);
  const need = (N + 1) / 2; // ⌈N/2⌉ for odd N
  let p = 0;
  for (let k = need; k <= N; k++) {
    p += binom(N, k) * Math.pow(pBad, k) * Math.pow(1 - pBad, N - k);
  }
  return clamp01(p);
}
