// execution-router.ts — the Galerina Execution Router: one decision across all routing axes.
//
// Galerina's execution routing was, until now, three separate routers a caller had to consult
// individually. This is the single front door that unifies them into ONE ExecutionDecision:
//
//   AXIS-1  capability tier   hardware() → {binary|hybrid|photonic}   (@galerina/hardware-tier)
//   AXIS-2  precision technique routePrecision(opClass, ctx)            (@galerina/tower-citizen)
//   AXIS-3  per-kernel offload PartitionDecider.decide(kernel)         (@galerina/ext-photonic-emulator)
//
// It COMPOSES the existing, proven routers — it re-derives no routing maths. Fail-closed and
// consistent with the Tri-Pipe: photonic offload is only ever considered for a TERNARY op on an
// offload-capable tier (hybrid/photonic); a binary tier, a non-ternary precision, or any uncertainty
// resolves to the digital path. Worst case == binary digital == today.

import { routePrecision, type RoutingContext, type PrecisionDecision } from "../../galerina-tower-citizen/dist/index.js";
import { resolveHardware, type Tier } from "../../galerina-hardware-tier/dist/index.js";
import { PartitionDecider, type KernelCost, type Target, type Lane } from "../../galerina-ext-photonic-emulator/dist/index.js";
import type { InferenceOpClass } from "../../galerina-inference-bridge-contract/dist/index.js";

// Re-export the substrate Lane type so consumers (and the barrel index.ts) can name the
// capability operand's lane without reaching into the photonic-emulator package.
export type { Lane };

export interface CapabilityInput {
  /** Attested hardware target id (e.g. "photonic", "gpu", "cpu"). */
  readonly targetId: string;
  /** Result of verifyAttestation(att, policy).ok — attested, not self-claimed. */
  readonly attestationVerified: boolean;
  /** Pure tensor / no crypto-control (gates the photonic ceiling). Default false. */
  readonly componentFullyEligible?: boolean;
}

export interface ExecutionRouteInput {
  /** The op being routed (drives the precision decision). */
  readonly opClass: InferenceOpClass;
  /** Precision-router context (governance tier, fp4 hw, air-gap, declared tolerance). */
  readonly routing: RoutingContext;
  /** Attested hardware capability (drives the tier). */
  readonly capability: CapabilityInput;
  /** Per-kernel cost inputs (drive the offload decision: n, lane, isCrypto, …). */
  readonly kernel: KernelCost;
  /**
   * CAPABILITY operand (optional). Routing an op to a NON-default substrate lane (hybrid/photonic)
   * is also a capability grant: this predicate answers "is the flow granted lane L?". A non-digital
   * route survives only if capCheck(lane) is true; otherwise it falls back to the digital safe default.
   * Omitted ⇒ no lane gate (backward-compatible: current availability-only behaviour). When both this
   * and `grantedLanes` are supplied, BOTH must allow the lane (deny-by-default, fail-closed).
   */
  readonly capCheck?: (lane: Lane) => boolean;
  /**
   * CAPABILITY operand (optional). Convenience allow-list of substrate lanes the flow is granted.
   * Equivalent to `capCheck = (l) => grantedLanes.includes(l)`, folded as an AND with `capCheck`.
   * Omitted ⇒ not constrained by an allow-list. `digital` is always implicitly granted (safe default).
   */
  readonly grantedLanes?: readonly Lane[];
}

export interface ExecutionDecision {
  /** AXIS-1: the cached capability tier. */
  readonly tier: Tier;
  /** AXIS-2: the precision technique + scheduling + provenance. */
  readonly precision: PrecisionDecision;
  /** AXIS-3: the per-kernel offload target (digital | photonic). */
  readonly offloadTarget: Target;
  /** Why the offload target was chosen. */
  readonly offloadReason: string;
  /** True iff this op runs on the photonic backend (offloadTarget === "photonic"). */
  readonly photonic: boolean;
  /**
   * AXIS-3 capability half: true iff the kernel's substrate lane was granted (or no cap operand was
   * supplied, or the route stayed digital — digital is always granted). False means a non-digital lane
   * the net-win router selected was DENIED by capability and the route fell back to digital.
   */
  readonly laneGranted: boolean;
  /** Unified human-readable rationale across all three axes (→ audit trail). */
  readonly reason: string;
}

/** The unified router. Pure + deterministic: same input → same decision (reproducible audit). */
export class ExecutionRouter {
  private readonly decider: PartitionDecider;
  constructor(decider: PartitionDecider = new PartitionDecider()) { this.decider = decider; }

  /**
   * Deny-by-default capability fold for a single substrate lane. `digital` is never gated (the safe
   * floor). When BOTH `capCheck` and `grantedLanes` are supplied, BOTH must allow the lane (AND).
   * No operand ⇒ granted (the availability-only legacy behaviour).
   */
  private laneIsGranted(input: ExecutionRouteInput, lane: Lane): boolean {
    if (lane === "digital") return true;
    const allowedByList = input.grantedLanes === undefined || input.grantedLanes.includes(lane);
    const allowedByPred = input.capCheck === undefined || input.capCheck(lane);
    return allowedByList && allowedByPred;
  }

  route(input: ExecutionRouteInput): ExecutionDecision {
    // AXIS-1 — capability tier (attested, fail-closed to binary).
    const tier = resolveHardware({
      targetId: input.capability.targetId,
      attestationVerified: input.capability.attestationVerified,
      componentFullyEligible: input.capability.componentFullyEligible ?? false,
    });
    // AXIS-2 — precision technique for this op.
    const precision = routePrecision(input.opClass, input.routing);

    // AXIS-3 — photonic offload is ONLY considered for a TERNARY op on an offload-capable tier;
    // otherwise (binary tier / non-ternary precision) it is inert and the per-kernel router never runs.
    const offloadEligible = (tier === "hybrid" || tier === "photonic") && precision.precision === "ternary";
    const decision = offloadEligible
      ? this.decider.decide(input.kernel)
      : {
          target: "digital" as Target,
          reason: tier === "binary"
            ? "binary tier — no photonic offload"
            : `precision '${precision.precision}' is not ternary — photonic offload inert`,
        };

    // CAPABILITY GATE (the grant half of lane selection). Routing to a non-default substrate lane is a
    // privileged act: it is allowed ONLY if the flow is granted that lane. K3 vAnd / min-style fold —
    //   route_allowed = vAnd(net-win-says-this-lane, capability-grants-this-lane)
    // — where any non-TRUE collapses to the digital safe default. digital is always granted (the safe
    // floor); the gate is inert when no capability operand is supplied (backward-compatible). It NEVER
    // throws and NEVER routes to an ungranted lane.
    const laneGranted = decision.target === "digital" || this.laneIsGranted(input, input.kernel.lane);
    const gated = laneGranted
      ? decision
      : {
          target: "digital" as Target,
          reason: `lane '${input.kernel.lane}' not granted — capability gate fell back to digital (net-win wanted ${decision.target})`,
        };

    return {
      tier,
      precision,
      offloadTarget: gated.target,
      offloadReason: gated.reason,
      photonic: gated.target === "photonic",
      laneGranted,
      reason: `tier=${tier} · precision=${precision.precision} (${precision.reason}) · offload=${gated.target} (${gated.reason})`,
    };
  }
}

/** Build a Galerina Execution Router. */
export function createExecutionRouter(): ExecutionRouter {
  return new ExecutionRouter();
}
