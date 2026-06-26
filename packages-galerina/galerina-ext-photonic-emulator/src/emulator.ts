// emulator.ts — the physics-faithful (Rung-2) photonic-PPU ternary-MAC emulator.
//
// This REPLACES the perfect `TPLSimulator` stub with a device-physics model: the
// noise-carrying MZI-mesh / micro-ring MAC. It mirrors EXACTLY the op the stub
// computes (acc += a[i] for w=+1, acc -= a[i] for w=-1, skip for w=0, × per-tensor
// scale), then injects the analog impairments a real photonic device carries.
//
// Ported verbatim from the prove-own-maths artifact
//   Galerina-R-AND-D/scripts/rd-photonic-ppu-emulator-proof.mjs   (D1, 18/18, exit 0)
// every claim there was COMPUTED vs an independent ground truth (the exact digital
// T-MAC and the first-principles closed-form analog variance). The TS port keeps the
// same numbers so this package's tests reproduce the proof.
//
// PHYSICS MODEL (continuous layer — new work over the discrete shipped trit-flip model):
//   phaseDriftSigma : MZI phase-encoding drift → per-ACTIVE-element multiplicative gain
//                     error (1 + σ·N(0,1)). Variance per active element i: a[i]²·σ².
//   readoutSigma    : photodiode shot + Johnson-Nyquist thermal noise on the accumulated
//                     optical power → ONE additive N(0, σ²) per MAC.
//   ⇒ CLOSED-FORM VARIANCE of the UNQUANTIZED analog MAC (about the exact value, pre-scale):
//        Var = phaseDriftSigma²·Σ_{i: w_i≠0} a[i]²  +  readoutSigma²
//   quantBits       : finite DAC/ADC effective bits → uniform quantization, step LSB,
//                     residual bounded by LSB/2 — a SYSTEMATIC floor voting cannot beat.
//
// Posture: model, not silicon. "The real PIC stays within these bounds" is a
// calibration/attestation obligation (ToleranceWitness), NOT a claim this proves.
// No measured speedup is asserted. EMULATED — every BridgeResult reports
// executedNatively=false, deterministic=false.

/** A device-knob noise profile for a photonic lane. */
export interface PhysParams {
  /** MZI phase-encoding drift → per-active-element multiplicative gain error. */
  readonly phaseDriftSigma: number;
  /** Photodiode shot + thermal noise → one additive term per MAC. */
  readonly readoutSigma: number;
  /** Effective DAC/ADC bits → uniform quantization (0 = no quantization). */
  readonly quantBits: number;
}

/** Worst-case |activation| in the demo ternary domain (mirrors buildDemoTernaryOp). */
export const ACT_MAX = 3;

/** Effective-bit ceiling the precision wall flattens at (McMahon ≤10 / Garg 4–8 ENOB). */
export const ENOB_CEILING = 8;

// LANE_PROFILES — device-knob form mirroring substrate-inference.ts:40-44.
// photonic: clean, ~6-bit ADC, converges under redundancy. noisy: degraded, voting can't help.
export const PHOTONIC: PhysParams = Object.freeze({ phaseDriftSigma: 0.02, readoutSigma: 0.6, quantBits: 6 });
export const NOISY: PhysParams = Object.freeze({ phaseDriftSigma: 0.60, readoutSigma: 6.0, quantBits: 3 });

/**
 * Deterministic xorshift32 PRNG + Box–Muller gaussian. Seeded — no Date/Math.random,
 * so a given seed reproduces the same analog noise draw (lets tests pin the variance
 * law). Byte-for-byte the same sequence as the D1 proof's `rnd()`/`gauss()`.
 */
export class Xorshift32 {
  private s: number;
  constructor(seed: number) { this.s = (seed >>> 0) || 1; }
  /** Uniform in (0,1]. */
  next(): number {
    this.s ^= this.s << 13; this.s >>>= 0;
    this.s ^= this.s >>> 17;
    this.s ^= this.s << 5; this.s >>>= 0;
    return this.s / 0xffffffff;
  }
  /** Standard-normal sample via Box–Muller. */
  gauss(): number {
    let u = 0, v = 0;
    while (u === 0) u = this.next();
    while (v === 0) v = this.next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
}

/** Exact ternary T-MAC — the digital ground truth, bit-identical to the stub's tmacVector. */
export function tmacExact(weights: ArrayLike<number>, acts: ArrayLike<number>, n: number, scale = 1): number {
  let s = 0;
  for (let i = 0; i < n; i++) { const w = weights[i]; if (w === 1) s += acts[i]; else if (w === -1) s -= acts[i]; }
  return s * scale;
}

/** Closed-form variance of the UNQUANTIZED analog MAC about the exact value (pre-scale). */
export function analogVarianceClosedForm(weights: ArrayLike<number>, acts: ArrayLike<number>, n: number, phys: PhysParams): number {
  const { phaseDriftSigma, readoutSigma } = phys;
  let sumSqActive = 0;
  for (let i = 0; i < n; i++) if (weights[i] !== 0) sumSqActive += acts[i] * acts[i];
  return phaseDriftSigma * phaseDriftSigma * sumSqActive + readoutSigma * readoutSigma;
}

/** ADC dynamic-range span for a ternary MAC over |act| ≤ ACT_MAX (conservative). */
export function adcRange(n: number): number { return Math.max(1, n) * ACT_MAX; }

/** Uniform-quantization step of an ADC with `quantBits` over the MAC dynamic range. */
export function quantStep(n: number, quantBits: number): number { return (2 * adcRange(n)) / (2 ** quantBits); }

/** Analog emulation of the SAME T-MAC with device-physics impairments. */
export function tmacPhotonic(
  weights: ArrayLike<number>, acts: ArrayLike<number>, n: number, scale: number, phys: PhysParams, rng: Xorshift32,
): number {
  const { phaseDriftSigma, readoutSigma, quantBits } = phys;
  let s = 0;
  for (let i = 0; i < n; i++) {
    const w = weights[i];
    if (w === 0) continue;                                    // BitNet zero-cost skip
    const gain = 1 + phaseDriftSigma * rng.gauss();           // MZI phase drift → per-element gain error
    s += (w === 1 ? acts[i] : -acts[i]) * gain;
  }
  s += readoutSigma * rng.gauss();                            // photodiode shot + thermal, once per MAC
  if (quantBits > 0) {                                        // finite ADC → uniform quantization
    const lsb = quantStep(n, quantBits);
    s = Math.round(s / lsb) * lsb;
  }
  return s * scale;
}

/** Caller-independent upper bound on N-modular voting redundancy. An attacker/caller cannot
 *  request unbounded votes: without this, `execute(op, Infinity)` → an infinite `tmacVoted` loop
 *  (DoS / hang) and `execute(op, 1e9)` → O(N·n) resource exhaustion. Realistic NMR redundancy is
 *  ≤ ~25; 1024 is a generous STRUCTURAL ceiling the caller cannot raise. */
export const N_MAX_VOTES = 1024;

/** Coerce a requested vote count to a safe integer in [1, N_MAX_VOTES]. Non-finite (NaN/±Infinity)
 *  or < 1 falls back to `fallback` (itself clamped). Caller-independent — the bound cannot be lifted. */
export function clampVotes(n: number | undefined, fallback = 1): number {
  const fb = Number.isFinite(fallback) ? Math.min(N_MAX_VOTES, Math.max(1, Math.floor(fallback))) : 1;
  if (n === undefined || !Number.isFinite(n)) return fb;
  return Math.min(N_MAX_VOTES, Math.max(1, Math.floor(n)));
}

/** N-modular vote = mean of N independent analog readouts. Cuts zero-mean noise variance by 1/N.
 *  N is clamped to [1, N_MAX_VOTES] (caller-independent) so the vote loop is ALWAYS bounded — a
 *  non-finite or enormous caller N can never hang or exhaust the host. */
export function tmacVoted(
  weights: ArrayLike<number>, acts: ArrayLike<number>, n: number, scale: number, phys: PhysParams, N: number, rng: Xorshift32,
): number {
  const votes = clampVotes(N); // bound the loop regardless of caller input (Infinity/NaN/1e9 → safe)
  let acc = 0;
  for (let v = 0; v < votes; v++) acc += tmacPhotonic(weights, acts, n, scale, phys, rng);
  return acc / votes;
}

// ── WDM off-diagonal crosstalk channel — a faithful row-stochastic leakage matrix ───
// A wavelength-division-multiplexed bank routes each lane's optical power through a
// coupler with bounded off-diagonal leakage. Physical invariant: a passive coupler
// CONSERVES optical energy (power out == power in). Modelled as a ROW-STOCHASTIC matrix
// W (each row sums to 1): diagonal = 1 - leak, off-diagonal = leak split over neighbours.

/** Build an m-channel WDM crosstalk matrix: each channel keeps (1-leak), leaks to neighbours. */
export function wdmCrosstalkMatrix(m: number, leak: number): Float64Array[] {
  const W = Array.from({ length: m }, () => new Float64Array(m));
  for (let i = 0; i < m; i++) {
    const neigh: number[] = [];
    if (i - 1 >= 0) neigh.push(i - 1);
    if (i + 1 < m) neigh.push(i + 1);
    W[i]![i] = 1 - leak;                                       // power retained on the channel
    if (neigh.length === 0) { W[i]![i] = 1; continue; }        // single channel: no leakage path
    const share = leak / neigh.length;                         // leak split equally to neighbours
    for (const j of neigh) W[i]![j] = share;
  }
  return W;                                                    // row-stochastic by construction
}

/** Apply the WDM channel to a per-channel optical-power vector (the leakage transport). */
export function applyWdm(W: Float64Array[], powIn: Float64Array): Float64Array {
  const m = powIn.length, out = new Float64Array(m);
  for (let i = 0; i < m; i++) { let s = 0; for (let j = 0; j < m; j++) s += W[j]![i] * powIn[j]!; out[i] = s; }
  return out;                                                  // out_i = Σ_j W[j][i]·in_j
}

// ── SHIPPED substrate-math closed forms, mirrored from galerina-substrate-math/index.ts ──
// (index.ts:39-99). Kept here so fail-closed checks compare against the SAME numbers the
// production verifier computes, with no cross-package runtime import.
const PHASE_GAIN = 1.0, XTALK_GAIN = 0.5, READOUT_GAIN = 0.5;  // index.ts:39-41 (placeholder gains)
const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

/** Per-element flip probability from the device knobs (substrate-math index.ts:60-62). */
export function flipProbability(p: { phaseDriftSigma: number; crosstalkCoeff: number; readoutSigma: number }): number {
  return clamp01(p.phaseDriftSigma * PHASE_GAIN + p.crosstalkCoeff * XTALK_GAIN + p.readoutSigma * READOUT_GAIN);
}

/** Single-lane error probability incl. lane-failure (substrate-math index.ts:68-75). */
export function singleLaneErrorProbability(
  p: { phaseDriftSigma: number; crosstalkCoeff: number; readoutSigma: number; laneFailureProb: number },
): number {
  return clamp01(p.laneFailureProb + (1 - p.laneFailureProb) * flipProbability(p));
}

/** Binomial coefficient (substrate-math index.ts:77-83). */
export function binom(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  const kk = Math.min(k, n - k);
  let c = 1;
  for (let i = 0; i < kk; i++) c = (c * (n - i)) / (i + 1);
  return c;
}

/** N-modular-redundancy failure probability (majority wrong) — substrate-math index.ts:90-99. */
export function nmrFailureProbability(pBad: number, N: number): number {
  const need = (N + 1) / 2;
  let p = 0;
  for (let k = need; k <= N; k++) p += binom(N, k) * Math.pow(pBad, k) * Math.pow(1 - pBad, N - k);
  return clamp01(p);
}
