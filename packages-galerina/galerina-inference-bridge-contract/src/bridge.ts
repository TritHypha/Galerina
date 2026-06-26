// bridge.ts — the formal Brain/Brawn seam. Moved out of galerina-tower-citizen so
// that native Brawn packages depend on a NEUTRAL contract, not the Tower runtime.
//
// The three Citizen One Standards every bridge MUST uphold:
//   1. TPL Determinism  — a ternary op produces the exact same packed-trit /
//      scaled-integer result on CPU, GPU, or photonic silicon.
//   2. Hold-First       — no kernel advances a value to COMMIT without governance
//      authorising the 0 → +1 transition.
//   3. Zero-Copy Memory — bridges interact with linear memory via handles/offsets,
//      not by serialising across the JS↔WASM boundary in the hot path.

import type { PrecisionTechnique, InferenceOpClass } from "./precision-types.js";
import type { BridgeManifest, BridgeAttestation } from "./manifest.js";

/**
 * Fixed-point scale metadata for the ternary path: `value = accumulator * mantissa >> shift`.
 * Replacing a JS `number` scale removes IEEE-754 drift on the deterministic ternary
 * path (a strict ternary-only requirement). `scale: number` is retained on BridgeOp
 * for back-compat; certified ternary bridges should prefer `fixedScale`.
 */
export interface FixedScale {
  readonly mantissa: number;
  readonly shift: number;
}

/** A single unit of work handed to a bridge for execution. */
export interface BridgeOp {
  readonly opClass:       InferenceOpClass;
  readonly precision:     PrecisionTechnique;
  readonly correlationId: string;
  /** Packed ternary weights (BitNet I2_S) OR an opaque handle/offset into linear memory. */
  readonly weights:       Int32Array | number;
  /** Activation vector (int8/int32 domain — no floating point on the ternary path). */
  readonly activations:   Int32Array;
  /** Number of elements in the dot product / GEMM row. */
  readonly count:         number;
  /** Per-tensor scale (BitNet i2_scale = max|w|). Legacy float scale. */
  readonly scale:         number;
  /** Preferred fixed-point scale for the ternary path (no IEEE-754 drift). */
  readonly fixedScale?:   FixedScale;
  /** Packed layout version — lets bridges reject an unknown packed format. */
  readonly layoutVersion?: string;
  /** Starting trit/element offset within `weights`. */
  readonly offset?:       number;
}

/** The result of a bridge execution, with provenance for the audit trail. */
export interface BridgeResult {
  readonly value:            number;        // scaled accumulator
  readonly executedNatively: boolean;       // true = real kernel, false = stub/simulation
  readonly bridgeId:         string;        // "bitnet-cpu" | "nvfp4-cuda" | "stub-ternary" | ...
  readonly technique:        PrecisionTechnique;
  readonly latencyMs:        number;
  readonly deterministic:    boolean;       // ternary bridges MUST report true (Standard 1)
}

/**
 * The contract every execution bridge implements. The hybrid router depends on
 * this abstraction only — adding a new accelerator is "implement this interface".
 */
export interface InferenceBridge {
  readonly bridgeId: string;
  readonly technique: PrecisionTechnique;
  readonly nativeAvailable: boolean;
  /** Self-description (CF-3). Required for a bridge to pass an attestation policy. */
  readonly manifest?: BridgeManifest;
  /** Signed self-description. The Tower verifies this in certified/attested mode;
   *  a bridge without a valid attestation is rejected (`ERR_BRIDGE_UNATTESTED`). */
  readonly attestation?: BridgeAttestation;
  initialize(): void | Promise<void>;
  shutdown(): void | Promise<void>;
  execute(op: BridgeOp): BridgeResult;
}

/** A registry mapping each precision technique to the bridge that executes it. */
export type BridgeRegistry = ReadonlyMap<PrecisionTechnique, InferenceBridge>;

/** Self-check helper: assert a bridge result honours TPL Determinism (Standard 1). */
export function assertDeterminism(result: BridgeResult): void {
  const isTernary = result.technique === "ternary";
  if (isTernary && !result.deterministic) {
    throw new Error(
      `[CITIZEN_STANDARD_VIOLATION]: ternary bridge '${result.bridgeId}' reported ` +
      `non-deterministic result — Standard 1 (TPL Determinism) is mandatory on the ternary path`,
    );
  }
}
