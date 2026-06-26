/**
 * bridge/stub-provider.ts — Simulation fallback bridges
 *
 * When no native bridge is registered for a precision technique, these stubs run
 * so the package works on ANY machine (no GPU, no AVX required):
 *
 *   StubTernaryBridge — runs the real, byte-faithful TPLSimulator (BitNet I2_S).
 *                       This is a faithful CPU SIMULATION, not a no-op: it produces
 *                       the correct deterministic result, just without native SIMD.
 *
 *   StubFp4Bridge     — a GOVERNED no-op. NVFP4 needs Blackwell hardware + the
 *                       galerina-ext-bridge-nvfp4 kernel; until then this returns a
 *                       clearly-marked unexecuted result (executedNatively=false,
 *                       value=0) so callers can detect the missing backend rather
 *                       than silently trusting a fake number.
 */

import { TPLSimulator, SecurityTrap } from "../tpl-simulator.js";
import { GovernanceEnforcer } from "../governance-enforcer.js";
import { AuditLogger } from "../audit-logger.js";
import type { InferenceBridge, BridgeOp, BridgeResult, BridgeManifest } from "./interface.js";

/** Ternary fallback — executes via the in-package BitNet-faithful simulator. */
export class StubTernaryBridge implements InferenceBridge {
  readonly bridgeId = "stub-ternary";
  readonly technique = "ternary" as const;
  readonly nativeAvailable = false; // simulation, not native SIMD
  /** Self-description. DEV profile + unsigned — so under an attestation policy with
   *  requireSigned it is correctly REJECTED (the simulator is not a certified kernel). */
  readonly manifest: BridgeManifest = {
    bridgeId: "stub-ternary",
    packageName: "@galerina/tower-citizen",
    packageHash: "0".repeat(64),       // dev placeholder; a real build pins the package hash
    sourceEngine: "microsoft/BitNet",
    precision: "ternary",
    layoutVersion: "i2s-v1",
    hardwareIdentity: "wasm-simulator",
    determinismMode: "exact",
    certificationProfile: "dev",
  };

  private readonly logger: AuditLogger;
  private readonly governance: GovernanceEnforcer;

  constructor(logger?: AuditLogger, governance?: GovernanceEnforcer) {
    this.logger = logger ?? new AuditLogger();
    this.governance = governance ?? new GovernanceEnforcer();
  }

  initialize(): void { /* no native resources to load */ }
  shutdown(): void { /* nothing to release */ }

  execute(op: BridgeOp): BridgeResult {
    const t0 = Date.now();
    if (!(op.weights instanceof Int32Array)) {
      throw new Error(
        `[STUB_TERNARY]: simulation requires packed Int32Array weights, got a native handle. ` +
        `A handle implies a native bridge that is not registered.`,
      );
    }

    // Reconstruct the simulator over the supplied packed weights.
    // (The simulator is the authoritative byte-faithful ternary kernel.)
    const trits = this.decodePackedTrits(op.weights, op.count, op.offset ?? 0);
    const sim = new TPLSimulator(this.logger, this.governance, Math.max(1, op.count));
    sim.loadWeights(trits);
    sim.setScale(op.scale);
    const value = sim.tmacVector(op.activations, 0, op.count, op.correlationId);

    return {
      value,
      executedNatively: false,
      bridgeId: this.bridgeId,
      technique: this.technique,
      latencyMs: Date.now() - t0,
      deterministic: true, // Standard 1: ternary simulation is exact and deterministic
    };
  }

  /** Decode BitNet-packed i32 words back into a trit array for the simulator. */
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
      // 0b11 is the BitNet I2_S corruption sentinel — it MUST NOT be silently
      // masked to 0 here (that would hide a corrupted packed buffer from the
      // simulator's own trap). Trap at the bridge boundary instead.
      if (enc === 3) {
        throw new SecurityTrap(
          `[STUB_TERNARY]: corrupt trit encoding 0b11 at element ${idx} — packed buffer integrity violation`,
        );
      }
      out.push(enc === 0 ? -1 : enc === 1 ? 0 : 1);
    }
    return out;
  }
}

/** FP4 fallback — governed no-op. NVFP4 execution requires native hardware. */
export class StubFp4Bridge implements InferenceBridge {
  readonly bridgeId = "stub-fp4";
  readonly technique = "fp4_block" as const;
  readonly nativeAvailable = false;
  /** Self-description. DEV + `unverified` (this is a governed no-op, not a real
   *  FP4 kernel) — so a certified attestation policy that pins certificationProfile
   *  would reject it, which is correct: it must not stand in for a real backend. */
  readonly manifest: BridgeManifest = {
    bridgeId: "stub-fp4",
    packageName: "@galerina/tower-citizen",
    packageHash: "0".repeat(64),
    sourceEngine: "NVIDIA/TransformerEngine",
    precision: "fp4_block",
    layoutVersion: "nvfp4-v1",
    hardwareIdentity: "none-governed-noop",
    determinismMode: "unverified",
    certificationProfile: "dev",
  };

  initialize(): void { /* no-op */ }
  shutdown(): void { /* no-op */ }

  execute(op: BridgeOp): BridgeResult {
    // Honest unexecuted result — the caller MUST treat executedNatively=false as
    // "this op did not actually run on FP4 hardware". No fake numbers.
    return {
      value: 0,
      executedNatively: false,
      bridgeId: this.bridgeId,
      technique: this.technique,
      latencyMs: 0,
      deterministic: false, // FP4 is not on the deterministic ternary path
    };
  }
}

/** Build the default stub registry — used when no native bridges are present. */
export function createStubRegistry(
  logger?: AuditLogger,
  governance?: GovernanceEnforcer,
): Map<string, InferenceBridge> {
  const ternary = new StubTernaryBridge(logger, governance);
  const fp4 = new StubFp4Bridge();
  return new Map<string, InferenceBridge>([
    [ternary.technique, ternary],
    [fp4.technique, fp4],
  ]);
}
