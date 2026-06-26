// runner.ts — the LOAD → (gate) → EXEC → re-verify → fall-back runtime path, in-package.
//
// Demonstrates the spec §4 photonic runtime path end-to-end WITHOUT the Tower, so the
// whole fail-closed design is testable in isolation:
//
//   1. DECIDE     PartitionDecider.decide(kernel)   — default digital; photonic only on a net win
//   2a. digital   → run the exact digital T-MAC (the unchanged default)
//   2b. photonic  → bridge.execute(op) with the decided vote count N
//   3. RE-VERIFY  (photonic only) tolerance bound-check vs the cheap O(n) exact recompute
//                 — verify-cheap, never re-execute
//   4. FAIL-CLOSED out-of-tolerance ⇒ DENY the photonic value and fall back to the DIGITAL
//                 value (never re-run on photonics to "trust"). Worst case = stayed digital.
//
// The photonic backend can only ever ADD speed on a proven-win eligible kernel; it can
// never subtract it or corrupt a result — any failure lands on the unchanged digital path.

import type { BridgeOp, BridgeResult } from "../../galerina-inference-bridge-contract/dist/index.js";
import { PartitionDecider, type KernelCost, type Decision, type Target } from "./partition-decider.js";
import { type PhotonicBackend, type PhotonicBridgeConfig, PhotonicEmulatorBridge } from "./photonic-bridge.js";
import { toleranceCheck } from "./freivalds.js";
import { adcRange } from "./emulator.js";

export interface PhotonicRunResult {
  /** Where the value actually came from after re-verify + fallback. */
  readonly target: Target;
  /** The committed value (digital exact, or photonic-within-tolerance). */
  readonly value: number;
  /** True iff the committed value passed its integrity check (always true for digital). */
  readonly verified: boolean;
  /** True iff a routed-photonic kernel failed re-verify and fell back to digital. */
  readonly fellBack: boolean;
  /** Human-readable trail. */
  readonly reason: string;
  /** The routing decision that produced this run. */
  readonly decision: Decision;
  /** The raw photonic bridge result, when the photonic path was taken. */
  readonly bridgeResult?: BridgeResult;
}

/** The effective re-verify tolerance: never looser than the trusted band, never non-finite/≤0.
 *  A caller-supplied `kernel.tolerance` could otherwise be inflated (e.g. 1e9) to make the re-verify
 *  bound-check trivially pass, turning the integrity rail into a no-op. Clamp it to the trusted band. */
function effectiveTolerance(callerTol: number | undefined, maxBand: number): number {
  const t = (typeof callerTol === "number" && Number.isFinite(callerTol) && callerTol > 0) ? callerTol : maxBand;
  return Math.min(t, maxBand);
}

/** Ties the decider + the photonic backend into the fail-closed runtime path. */
export class PhotonicRuntime {
  private readonly decider: PartitionDecider;
  private readonly backend: PhotonicBackend;
  /** Trusted ceiling for the re-verify band — a caller's kernel.tolerance can never exceed it. */
  private readonly maxTolerance: number;

  constructor(backend?: PhotonicBackend, decider?: PartitionDecider, maxTolerance = 0.05) {
    this.backend = backend ?? new PhotonicEmulatorBridge();
    this.decider = decider ?? new PartitionDecider();
    this.maxTolerance = Number.isFinite(maxTolerance) && maxTolerance > 0 ? maxTolerance : 0.05;
  }

  /** Run one kernel through decide → (digital | photonic + re-verify → fail-closed). */
  run(op: BridgeOp, kernel: KernelCost): PhotonicRunResult {
    const decision = this.decider.decide(kernel);

    if (decision.target === "digital") {
      // The unchanged default path — the exact digital T-MAC.
      return {
        target: "digital",
        value: this.backend.executeExact(op),
        verified: true,
        fellBack: false,
        reason: decision.reason,
        decision,
      };
    }

    // Photonic path: execute, then re-verify against the cheap exact recompute.
    const res = this.backend.execute(op, decision.N);
    const exact = this.backend.executeExact(op);
    const tol = effectiveTolerance(kernel.tolerance, this.maxTolerance); // caller cannot inflate the band
    const span = adcRange(op.count);

    if (toleranceCheck(res.value, exact, tol, span)) {
      return {
        target: "photonic",
        value: res.value,
        verified: true,
        fellBack: false,
        reason: decision.reason,
        decision,
        bridgeResult: res,
      };
    }

    // FAIL-CLOSED: out-of-tolerance → deny the photonic value, commit the digital one.
    return {
      target: "digital",
      value: exact,
      verified: false,
      fellBack: true,
      reason: `re-verify FAILED (|Δ| > ${tol}·span) → DENY photonic, fall back to digital (fail-closed)`,
      decision,
      bridgeResult: res,
    };
  }
}

/** What `createPhotonicRouterPort().route()` returns: a tolerance-verified value, or null to decline. */
export interface PhotonicRouteHit { readonly value: number; readonly bridgeId: string; }

/**
 * Build a photonic offload PORT for the Tower's `HybridInferenceEngine` `photonic` config.
 * Returns a tolerance-verified photonic value for a net-win ELIGIBLE kernel, or `null` to DECLINE
 * (not a net win / out-of-tolerance / any uncertainty) — the engine then runs its digital dispatch.
 * Fail-closed: the only way a value is returned is a proven net-win that ALSO passes the re-verify.
 */
export function createPhotonicRouterPort(
  cfg: PhotonicBridgeConfig = {},
  decider: PartitionDecider = new PartitionDecider(),
): { route(op: BridgeOp, kernel: KernelCost): PhotonicRouteHit | null } {
  const bridge = new PhotonicEmulatorBridge(cfg);
  return {
    route(op, kernel) {
      const d = decider.decide(kernel);
      if (d.target !== "photonic") return null;            // not a net win → engine's digital path
      const value = bridge.execute(op, d.N).value;
      const exact = bridge.executeExact(op);
      // Clamp the re-verify band to the bridge's DECLARED manifest tolerance — a caller's inflated
      // kernel.tolerance can never loosen the integrity check below the attested band.
      if (toleranceCheck(value, exact, effectiveTolerance(kernel.tolerance, bridge.manifest.tolerance ?? 0.05), adcRange(op.count))) {
        return { value, bridgeId: bridge.bridgeId };
      }
      return null;                                          // out-of-tolerance → decline (fail-closed)
    },
  };
}
