// =============================================================================

import { isProxy as isNodeProxy } from "node:util/types";
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
// Spec: ../ZTF-Knowledge-Bases/galerina-substrate-failure-model.md §3.2/§3.4,
//       ../ZTF-Knowledge-Bases/galerina-substrate-contracts.md §6.
// =============================================================================

export type SubstrateMathErrorCode =
  | "INVALID_RECORD"
  | "INVALID_PROBABILITY"
  | "INVALID_REDUNDANCY"
  | "NON_FINITE_RESULT";

export class SubstrateMathError extends Error {
  readonly code: SubstrateMathErrorCode;

  constructor(code: SubstrateMathErrorCode) {
    super(`[SUBSTRATE_MATH:${code}]`);
    this.name = "SubstrateMathError";
    this.code = code;
  }
}

/** The four physical noise parameters (no seed — seed is a simulator concern, not math). */
export interface SubstrateNoiseParams {
  readonly phaseDriftSigma: number;
  readonly crosstalkCoeff: number;
  readonly laneFailureProb: number;
  readonly readoutSigma: number;
}

/**
 * Largest odd N admitted by the binary64 closed-form implementation.
 *
 * RD-0839 found the first incorrect result at N=1021 and NaN at N=1023
 * because the direct binomial terms overflow before the powers underflow.
 * Keep this explicit admission bound until an independently verified
 * log-domain implementation replaces the recurrence.
 */
export const MAX_NMR_N = 1019;

// Calibration gains — documented placeholder knobs (no silicon to calibrate against;
// conservative defaults, retunable). Map physical parameters to a per-lane flip probability.
const PHASE_GAIN = 1.0;
const XTALK_GAIN = 0.5;
const READOUT_GAIN = 0.5;
const NOISE_KEYS = Object.freeze([
  "phaseDriftSigma",
  "crosstalkCoeff",
  "laneFailureProb",
  "readoutSigma",
] as const);
type NoiseKey = typeof NOISE_KEYS[number];

function refuse(code: SubstrateMathErrorCode): never {
  throw new SubstrateMathError(code);
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

function assertProb(_name: string, v: unknown): asserts v is number {
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 1) {
    refuse("INVALID_PROBABILITY");
  }
}

function assertOddPositive(N: number): void {
  if (!Number.isInteger(N) || N < 1 || N % 2 === 0 || N > MAX_NMR_N) {
    refuse("INVALID_REDUNDANCY");
  }
}

function captureNoiseParams(value: unknown): SubstrateNoiseParams {
  try {
    if (typeof value !== "object" || value === null || Array.isArray(value) || isNodeProxy(value)) {
      refuse("INVALID_RECORD");
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) refuse("INVALID_RECORD");
    const keys = Reflect.ownKeys(value);
    if (
      keys.length !== NOISE_KEYS.length
      || keys.some((key) => typeof key !== "string" || !NOISE_KEYS.includes(key as NoiseKey))
    ) {
      refuse("INVALID_RECORD");
    }
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const captured = {} as Record<NoiseKey, number>;
    for (const key of NOISE_KEYS) {
      const descriptor = descriptors[key];
      if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) refuse("INVALID_RECORD");
      assertProb(key, descriptor.value);
      captured[key] = descriptor.value;
    }
    return captured;
  } catch (error) {
    if (error instanceof SubstrateMathError) throw error;
    refuse("INVALID_RECORD");
  }
}

function flipProbabilityFromCaptured(p: SubstrateNoiseParams): number {
  return clamp01(p.phaseDriftSigma * PHASE_GAIN + p.crosstalkCoeff * XTALK_GAIN + p.readoutSigma * READOUT_GAIN);
}

/** Per-lane probability the lane survives but flips (phase/crosstalk/readout). */
export function flipProbability(p: SubstrateNoiseParams): number {
  return flipProbabilityFromCaptured(captureNoiseParams(p));
}

/**
 * pBad = P(a lane does NOT deliver the correct trit) = laneFailure OR (survive AND flip).
 * Monotone non-decreasing in every parameter; always in [0,1].
 */
export function singleLaneErrorProbability(p: SubstrateNoiseParams): number {
  const noise = captureNoiseParams(p);
  const pFlip = flipProbabilityFromCaptured(noise);
  return clamp01(noise.laneFailureProb + (1 - noise.laneFailureProb) * pFlip);
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
  if (!Number.isFinite(p)) {
    refuse("NON_FINITE_RESULT");
  }
  return clamp01(p);
}
