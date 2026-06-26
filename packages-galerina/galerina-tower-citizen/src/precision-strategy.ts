/**
 * precision-strategy.ts — The Hybrid Engine's "best-of-all-three" technique selector
 *
 * Galerina's Unified Hybrid Inference Engine is NOT three engines behind a router.
 * It is ONE engine that blends three mathematical techniques inside a single
 * inference pass, choosing the best technique per operation:
 *
 *   - TERNARY      (from Microsoft BitNet b1.58, MIT)
 *       weights ∈ {-1, 0, +1} · 1.58-bit · CPU-resident · deterministic
 *       Strength: memory efficiency + auditability on weight-heavy layers.
 *
 *   - FP4_BLOCK    (from NVIDIA NVFP4 / TransformerEngine, Apache-2.0)
 *       E2M1 4-bit float · 16-element block scaling · Blackwell tensor cores
 *       Strength: raw throughput on dense, high-bandwidth tensor ops.
 *
 *   - SCHEDULED    (from Groq LPU, MIT-licensed IP)
 *       static compile-time scheduling · zero memory jitter · plesiosynchronous
 *       Strength: latency-deterministic execution for real-time invariants.
 *
 * The two axes are orthogonal:
 *   PRECISION  axis: which number format runs the math   (ternary | fp4_block | fp8 | fp16)
 *   SCHEDULING axis: how execution is ordered in time    (dynamic | deterministic_static)
 *
 * Every per-operation decision is recorded in the AuditEvent ledger. This is the
 * Galerina differentiator: a mixed-precision engine where you can cryptographically
 * prove WHICH precision ran on WHICH data — required for regulated AI (e.g. a
 * medical diagnosis layer at full precision, a formatting layer at FP4).
 */

// ─────────────────────────────────────────────────────────────────────────────
// Axis 1 — Precision technique
// ─────────────────────────────────────────────────────────────────────────────

// The precision/scheduling/op-class TYPES now live in the neutral Brain/Brawn
// contract package so native bridges depend on it, not on the Tower. The routing
// LOGIC (sensitivity tables + routePrecision) stays here. Re-exported for back-compat.
import type { PrecisionTechnique, SchedulingTechnique, InferenceOpClass } from "@galerina/inference-bridge-contract";
export type { PrecisionTechnique, SchedulingTechnique, InferenceOpClass } from "@galerina/inference-bridge-contract";

/**
 * Provenance — which open-source engine each technique is derived from.
 *
 * Note: only `fp4_block` genuinely requires NVIDIA Blackwell tensor cores. `fp8`
 * is a number format that emulates on CPU, so it is attributed to "native" — it
 * carries no NVIDIA hardware dependency and is safe in air-gapped deployments.
 */
export const TECHNIQUE_SOURCE: Readonly<Record<PrecisionTechnique, { engine: string; license: string }>> = {
  ternary:   { engine: "microsoft/BitNet",            license: "MIT" },
  fp4_block: { engine: "NVIDIA/TransformerEngine",    license: "Apache-2.0" }, // Blackwell-bound
  fp8:       { engine: "native",                      license: "MIT" },        // CPU-emulatable format
  fp16:      { engine: "native",                      license: "MIT" },
};

/** Approximate bits-per-weight for memory accounting. */
export const TECHNIQUE_BITS: Readonly<Record<PrecisionTechnique, number>> = {
  ternary: 1.58,
  fp4_block: 4,
  fp8: 8,
  fp16: 16,
};

// (SchedulingTechnique and InferenceOpClass are defined in
// @galerina/inference-bridge-contract and re-exported above.)

/**
 * Sensitivity of an operation class to low-precision quantization.
 * Higher sensitivity → the router avoids aggressive low-bit techniques.
 *   1.0 = must run at high precision (quantization error compounds badly)
 *   0.0 = tolerates the most aggressive low-bit technique with no quality loss
 */
export const OP_SENSITIVITY: Readonly<Record<InferenceOpClass, number>> = {
  embedding:     0.2,  // tolerant — large, redundant
  attention:     0.6,  // moderate — errors propagate through softmax
  feedforward:   0.3,  // tolerant — BitNet's sweet spot (weight-heavy)
  normalization: 0.9,  // sensitive — small scale, errors amplify
  output_head:   0.8,  // sensitive — final logits drive the token choice
  kv_cache:      0.4,  // moderate — bandwidth-bound, FP4's sweet spot
};

// ─────────────────────────────────────────────────────────────────────────────
// The routing decision
// ─────────────────────────────────────────────────────────────────────────────

export interface PrecisionDecision {
  readonly opClass:    InferenceOpClass;
  readonly precision:  PrecisionTechnique;
  readonly scheduling: SchedulingTechnique;
  readonly sourceEngine: string;       // provenance for the audit trail
  readonly reason:     string;         // human-readable rationale (→ ;; govComment in manifest)
}

export interface RoutingContext {
  /** "tier-1" air-gapped CPU · "tier-2" cloud · "tier-3" Blackwell GPU */
  readonly governanceTier: 1 | 2 | 3;
  /** Hard latency ceiling (ms). When set, prefers deterministic_static scheduling. */
  readonly maxLatencyMs?: number;
  /** Whether FP4-capable hardware (Blackwell) is actually present. */
  readonly fp4HardwareAvailable: boolean;
  /** Whether the deployment is air-gapped (forces CPU-only ternary path). */
  readonly airGapped: boolean;
  /**
   * Declared loss-tolerance from `contract { substrate { tolerance } }` (R&D 0007 — the
   * "routePrecision lane axis"). It is the acceptable-error magnitude: tight (≈1e-9, the deny-by-
   * default) means no quantization budget; a LOOSE value (≥ {@link LOOSE_TOLERANCE}) is the author
   * opting a NON-sensitive op into the low-bit lane (ternary — CPU/photonic-friendly). FAIL-SAFE: a
   * declared tolerance can only RELAX a tolerant op; it NEVER overrides the high-sensitivity `fp16`
   * floor (sensitivity ≥ 0.85), because op sensitivity is about error COMPOUNDING, not budget.
   */
  readonly tolerance?: number;
}

/**
 * The loss-tolerance threshold (acceptable-error magnitude) at or above which the author is treated
 * as having opted a non-sensitive op into the low-bit ternary lane. Below it (tight/default), routing
 * is unchanged. Conservative: this is a meaningful (≥0.1%) declared budget, not the 1e-9 default.
 */
export const LOOSE_TOLERANCE = 1e-3;

/**
 * The Hybrid Precision Router — picks the best (precision, scheduling) pair for
 * a single operation, blending all three engine techniques.
 *
 * This is pure and deterministic: same op + same context → same decision,
 * which keeps the AuditEvent trail reproducible.
 */
export function routePrecision(
  opClass: InferenceOpClass,
  ctx: RoutingContext,
): PrecisionDecision {
  // DENY-BY-DEFAULT (audit): an UNRECOGNIZED op class must not silently default into a low-bit lane.
  // InferenceOpClass is a compile-time union (erased at runtime) and opClass crosses a trust boundary
  // as a plain string; previously every numeric comparison against the `undefined` sensitivity was
  // false and the op fell through to a fabricated fp8/ternary decision (with `undefined` in the reason).
  // Route it to the fp16 full-precision floor — no quantization, no photonic offload — mirroring
  // resolveHardware's deny-on-unknown.
  if (!(opClass in OP_SENSITIVITY)) {
    return {
      opClass,
      precision: "fp16",
      scheduling: "dynamic",
      sourceEngine: TECHNIQUE_SOURCE["fp16"].engine,
      reason: `unrecognized op class '${opClass}' — denied to the fp16 full-precision floor (deny-by-default)`,
    };
  }
  const sensitivity = OP_SENSITIVITY[opClass];

  // ── Precision selection ──────────────────────────────────────────────────
  let precision: PrecisionTechnique;
  let reason: string;

  if (sensitivity >= 0.85) {
    // Sensitivity-critical (normalization, near-output) — never quantize hard.
    precision = "fp16";
    reason = `op '${opClass}' sensitivity ${sensitivity} ≥ 0.85 — full precision required`;
  } else if (ctx.airGapped || ctx.governanceTier === 1) {
    // Air-gapped / Tier-1 → BitNet ternary on CPU. Deterministic, auditable, no cloud.
    // Exception: high-sensitivity ops fall back to fp8 even on CPU.
    if (sensitivity >= 0.7) {
      precision = "fp8";
      reason = `air-gapped, but op '${opClass}' sensitivity ${sensitivity} → fp8 over ternary`;
    } else {
      precision = "ternary";
      reason = `air-gapped/tier-1 + op '${opClass}' tolerant (sensitivity ${sensitivity}) → BitNet ternary`;
    }
  } else if (ctx.fp4HardwareAvailable && (opClass === "kv_cache" || opClass === "attention")) {
    // Bandwidth-bound ops on Blackwell → NVFP4 block-scaled, FP4's strength.
    precision = "fp4_block";
    reason = `Blackwell present + op '${opClass}' bandwidth-bound → NVFP4 block-scaled`;
  } else if (ctx.fp4HardwareAvailable && sensitivity < 0.5) {
    // Tolerant dense ops on Blackwell → FP4 for throughput.
    precision = "fp4_block";
    reason = `Blackwell present + op '${opClass}' tolerant → NVFP4 throughput path`;
  } else if (sensitivity < 0.4) {
    // Tolerant weight-heavy ops without FP4 hardware → ternary (CPU-capable).
    precision = "ternary";
    reason = `weight-heavy op '${opClass}' (sensitivity ${sensitivity}) → BitNet ternary`;
  } else {
    // Default middle ground.
    precision = "fp8";
    reason = `op '${opClass}' moderate sensitivity ${sensitivity} → fp8 balance`;
  }

  // ── Declared-tolerance relaxation (R&D 0007) ─────────────────────────────
  // A LOOSE declared loss-tolerance lets the author opt a NON-sensitive op into the low-bit ternary
  // lane (CPU/photonic-friendly). FAIL-SAFE by construction: it only fires for sensitivity < 0.7
  // (so the fp16 floor at ≥0.85 and the air-gapped fp8-for-0.7..0.85 path are untouched) and it only
  // steps the moderate `fp8` default DOWN to ternary — it never raises precision, never relaxes a floor.
  if (
    ctx.tolerance !== undefined &&
    ctx.tolerance >= LOOSE_TOLERANCE &&
    sensitivity < 0.7 &&
    precision === "fp8"
  ) {
    precision = "ternary";
    reason = `op '${opClass}' (sensitivity ${sensitivity}) + declared tolerance ${ctx.tolerance} ≥ ${LOOSE_TOLERANCE} → low-bit ternary lane`;
  }

  // ── Scheduling selection ─────────────────────────────────────────────────
  // A hard latency invariant forces Groq-style deterministic scheduling so the
  // `ai { max_latency_ms }` contract bound is provably enforceable.
  const scheduling: SchedulingTechnique =
    ctx.maxLatencyMs !== undefined && ctx.maxLatencyMs > 0
      ? "deterministic_static"
      : "dynamic";

  if (scheduling === "deterministic_static") {
    reason += ` · Groq-style static schedule (latency bound ${ctx.maxLatencyMs}ms)`;
  }

  return {
    opClass,
    precision,
    scheduling,
    sourceEngine: TECHNIQUE_SOURCE[precision].engine,
    reason,
  };
}

/**
 * Plan an entire inference pass — route every operation class and report the
 * blended precision profile. This is what the manifest records: a per-op map
 * proving exactly which technique handled which part of the model.
 */
export interface HybridPlan {
  readonly decisions:        readonly PrecisionDecision[];
  readonly techniquesUsed:   readonly PrecisionTechnique[];
  readonly enginesBlended:   readonly string[];   // distinct source engines in this plan
  readonly avgBitsPerWeight: number;              // weighted memory profile
  readonly deterministic:    boolean;             // all ops statically scheduled?
}

export function planHybridInference(
  opClasses: readonly InferenceOpClass[],
  ctx: RoutingContext,
): HybridPlan {
  const decisions = opClasses.map((op) => routePrecision(op, ctx));
  const techniquesUsed = [...new Set(decisions.map((d) => d.precision))];
  const enginesBlended = [...new Set(decisions.map((d) => d.sourceEngine))];
  const avgBitsPerWeight =
    decisions.reduce((sum, d) => sum + TECHNIQUE_BITS[d.precision], 0) /
    Math.max(1, decisions.length);
  const deterministic = decisions.every((d) => d.scheduling === "deterministic_static");

  return {
    decisions,
    techniquesUsed,
    enginesBlended,
    avgBitsPerWeight: Math.round(avgBitsPerWeight * 100) / 100,
    deterministic,
  };
}
