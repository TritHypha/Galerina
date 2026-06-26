// photonic-bridge.ts — the photonic backend behind the neutral Brain/Brawn contract.
//
// PhotonicEmulatorBridge implements @galerina/inference-bridge-contract's InferenceBridge
// (the SAME contract the stub ternary bridge and the native cpp/quantum bridges implement).
// It depends ONLY on that neutral contract — never on the Tower runtime — and the contract
// is imported by relative path to the sibling's built dist (the repo convention; resolves
// offline with no node_modules).
//
// Honest reporting (this is a Rung-2 EMULATOR, not silicon):
//   • executedNatively = false   — emulated, not a real PIC
//   • deterministic    = false   — analog, NOT bit-exact (so assertDeterminism() on a
//                                  ternary result correctly THROWS — that is WHY the
//                                  photonic path needs the separate tolerance re-verify,
//                                  not the bit-exact ternary determinism oracle)
//   • manifest.determinismMode = "tolerance"  — admissible ONLY when fully pinned +
//                                  witnessed (the shipped validateManifestShape rail).

import type { InferenceBridge, BridgeOp, BridgeResult, BridgeManifest } from "../../galerina-inference-bridge-contract/dist/index.js";
import { tmacExact, tmacVoted, clampVotes, PHOTONIC, type PhysParams, Xorshift32 } from "./emulator.js";
import { proveBifurcatedParity, type ParityReport } from "./parity-conformance.js";

/** The surface the photonic runtime consumes: the contract execute + a cheap exact recompute. */
export interface PhotonicBackend {
  /** Analog voted T-MAC. `votes` overrides the configured redundancy (the cost model's N). */
  execute(op: BridgeOp, votes?: number): BridgeResult;
  /** The exact digital value of the same op — O(n), used for the cheap re-verify + fallback. */
  executeExact(op: BridgeOp): number;
}

/** Configuration for the emulated photonic lane. */
export interface PhotonicBridgeConfig {
  /** Device-physics noise knobs (defaults to the clean PHOTONIC profile). */
  readonly phys?: PhysParams;
  /** Default voting redundancy used by execute() when no override is supplied. */
  readonly redundancyN?: number;
  /** Declared tolerance band of the lane (must be ≥ the witnessed epsilon). */
  readonly tolerance?: number;
}

const HEX64 = (c: string): string => c.repeat(64); // dev placeholder pins; a real build pins real sha256s

function fnv1a(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}

export class PhotonicEmulatorBridge implements InferenceBridge, PhotonicBackend {
  readonly bridgeId = "photonic-emulator";
  readonly technique = "ternary" as const;     // T-MAC lane (PrecisionTechnique)
  readonly nativeAvailable = false;            // EMULATED — honest (Rung 2, not silicon)
  // Reassignable (a mutable property still satisfies the contract's readonly member) so calibrate()
  // can replace the UNCALIBRATED placeholder witness with a MEASURED one (R&D 0057-parity-witness).
  manifest: BridgeManifest;
  /** False until calibrate() binds a MEASURED tolerance band — an uncalibrated witness is dev-only. */
  private calibrated = false;

  private readonly phys: PhysParams;
  private readonly redundancyN: number;

  constructor(cfg: PhotonicBridgeConfig = {}) {
    this.phys = cfg.phys ?? PHOTONIC;
    this.redundancyN = clampVotes(cfg.redundancyN, 8); // caller-independent [1, N_MAX_VOTES] bound
    const tolerance = cfg.tolerance ?? 0.05;
    // determinismMode:"tolerance" — admissible ONLY when fully pinned (validateManifestShape):
    // finite positive tolerance + pinnedEnvHash + backendArtifactHash, and (with a witness)
    // tolerance ≥ the measured epsilon. The witness binds the declared band to a measured curve.
    this.manifest = {
      bridgeId: this.bridgeId,
      packageName: "@galerina/ext-photonic-emulator",
      packageHash: HEX64("0"),
      sourceEngine: "galerina/photonic-emulator",
      precision: "ternary",
      layoutVersion: "i2s-v1",
      hardwareIdentity: "photonic-emulator-v0",
      determinismMode: "tolerance",
      certificationProfile: "dev",
      tolerance,
      pinnedEnvHash: HEX64("a"),
      backendArtifactHash: HEX64("b"),
      toleranceWitness: {
        redundancyN: this.redundancyN,
        // UNCALIBRATED PLACEHOLDER (R&D 0057-parity-witness). Until calibrate() runs a real parity
        // sweep, this literal attests NOTHING — it is a dev-only stand-in. calibrate() replaces it
        // with the MEASURED maxRelativeResidual / residualStdDev so the witness binds the declared
        // band to an empirical curve (calibration-as-attestation), which is the whole point.
        epsilonMeasured: 0.02,
        stdDev: 0.01,
        noiseModelId: "photonic-emulator-d1-v0",
      },
    };
  }

  initialize(): void { /* no native resources to load — emulated */ }
  shutdown(): void { /* nothing to release */ }

  /** True once calibrate() has bound a MEASURED tolerance band (else the witness is a dev placeholder). */
  isCalibrated(): boolean { return this.calibrated; }

  /**
   * Calibration-as-attestation (R&D 0057-parity-witness): run the bifurcated-parity sweep over a
   * representative corpus and bind the MEASURED band into the manifest's ToleranceWitness, replacing
   * the uncalibrated placeholder. Fail-closed: a lane that is NOT fully bifurcation-conformant
   * (any binary≠photonic decision divergence) is REFUSED — we never attest a divergent lane.
   * Returns the parity report (maxRelativeResidual is the empirical epsilon now in the witness).
   */
  calibrate(ops: readonly BridgeOp[]): ParityReport {
    const report = proveBifurcatedParity(ops, {
      phys: this.phys,
      redundancyN: this.redundancyN,
      tolerance: this.manifest.tolerance ?? 0.05,
    });
    if (!report.allConformant) {
      throw new Error(
        `SPORE-SUBSTRATE: photonic lane is NOT bifurcation-conformant (${report.conformant}/${report.total} conformant, ${report.decisionDivergences} decision divergences) — refusing to calibrate/attest a divergent lane`,
      );
    }
    // Bind the MEASURED band; the declared `tolerance` must still be ≥ epsilonMeasured (validateManifestShape).
    const prior = this.manifest.toleranceWitness;
    this.manifest = {
      ...this.manifest,
      toleranceWitness: {
        redundancyN: prior?.redundancyN ?? this.redundancyN,
        noiseModelId: prior?.noiseModelId ?? "photonic-emulator-d1-v0",
        epsilonMeasured: report.maxRelativeResidual,
        stdDev: report.residualStdDev,
      },
    };
    this.calibrated = true;
    return report;
  }

  /** Decode BitNet-packed i32 words into a trit array (mirrors the stub decoder; traps 0b11). */
  private decodePackedTrits(packed: Int32Array, count: number, offset: number): number[] {
    const out: number[] = [];
    for (let i = 0; i < count; i++) {
      const idx = offset + i;
      const word = packed[(idx / 16) | 0] ?? 0;
      const local = idx % 16;
      const byteIdx = (local / 4) | 0;
      const posInByte = local % 4;
      const shift = byteIdx * 8 + (3 - posInByte) * 2;
      const enc = (word >>> shift) & 0x03;
      // 0b11 is the BitNet I2_S corruption sentinel — trap, never silently mask to 0.
      if (enc === 3) {
        throw new Error(`[PHOTONIC_CORRUPT_TRIT]: corrupt trit encoding 0b11 at element ${idx} — packed buffer integrity violation`);
      }
      out.push(enc === 0 ? -1 : enc === 1 ? 0 : 1);
    }
    return out;
  }

  private trits(op: BridgeOp): number[] {
    if (!(op.weights instanceof Int32Array)) {
      throw new Error(`[PHOTONIC_EMULATOR]: emulation requires packed Int32Array weights, got a native handle.`);
    }
    return this.decodePackedTrits(op.weights, op.count, op.offset ?? 0);
  }

  /** Analog voted T-MAC. Seeded from the op identity so a given op reproduces (for tests),
   *  while still reporting deterministic=false (the value is NOT bit-exact across machines). */
  execute(op: BridgeOp, votes?: number): BridgeResult {
    const t0 = Date.now();
    const trits = this.trits(op);
    const N = clampVotes(votes, this.redundancyN); // caller cannot inflate the vote count past N_MAX_VOTES
    const rng = new Xorshift32(fnv1a(`${op.correlationId}:${op.opClass}:${op.precision}:${N}`));
    const value = tmacVoted(trits, op.activations, op.count, op.scale, this.phys, N, rng);
    return {
      value,
      executedNatively: false,
      bridgeId: this.bridgeId,
      technique: this.technique,
      latencyMs: Date.now() - t0,
      deterministic: false,   // analog tolerance backend — NOT the bit-exact ternary path
    };
  }

  /** The exact digital value of the op — O(n). The cheap re-verify reference + the fallback. */
  executeExact(op: BridgeOp): number {
    return tmacExact(this.trits(op), op.activations, op.count, op.scale);
  }
}
