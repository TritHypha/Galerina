// tri-pipe.ts — proposal-only candidate route (P6 / C3).
//
// Composes the hardware() capability directive into a digest-bound candidate
// route and a route-safety operand. It does NOT construct a HybridInferenceEngine,
// does not dispatch, and does not mint admission. Independent SLIDE/TLL admission
// is the only later act that may execute a proposed route.

import { createHash } from "node:crypto";
import { resolveHardware, type Tier } from "../../galerina-hardware-tier/dist/index.js";

export type { Tier };

export interface TriPipeOptions {
  /** Attested hardware target id (e.g. "photonic", "gpu", "cpu", "wasm"). */
  readonly targetId: string;
  /** Result of verifyAttestation(att, policy).ok — the directive is ATTESTED, not self-asserted. */
  readonly attestationVerified: boolean;
  /** Component is pure-tensor / fully eligible (no crypto/control). Gates the photonic ceiling
   *  (a whole component converges to hybrid). Default false (the common whole-component case). */
  readonly componentFullyEligible?: boolean;
  /** Retained for caller compatibility. Ignored: this seam is proposal-only. */
  readonly hybridBridges?: unknown;
  /** Retained for caller compatibility. Ignored: this seam is proposal-only. */
  readonly kernelFor?: unknown;
  /** Retained for caller compatibility. Ignored: this seam is proposal-only. */
  readonly auditInMemory?: boolean;
  /** Retained for caller compatibility. Ignored: this seam is proposal-only. */
  readonly governance?: unknown;
}

export interface TriPipeProposal {
  readonly kind: "PROPOSAL";
  /** The resolved capability tier. */
  readonly tier: Tier;
  /** True iff the proposed route would wire photonic offload (tier ∈ {hybrid, photonic}). */
  readonly photonicEnabled: boolean;
  readonly candidateRouteDigest: string;
  readonly routeSafety: "SAFE";
  readonly authorityReleased: false;
}

/**
 * Propose one digest-bound Tri-Pipe route. `hardware()` picks the tier; no engine
 * is constructed and nothing is dispatched.
 */
export function createTriPipeEngine(opts: TriPipeOptions): TriPipeProposal {
  const tier = resolveHardware({
    targetId: opts.targetId,
    attestationVerified: opts.attestationVerified,
    componentFullyEligible: opts.componentFullyEligible ?? false,
  });
  const photonicEnabled = tier === "hybrid" || tier === "photonic";
  const encoded = JSON.stringify({
    profile: "galerina.tri-pipe.proposal.v1",
    targetId: opts.targetId,
    attestationVerified: opts.attestationVerified,
    componentFullyEligible: opts.componentFullyEligible ?? false,
    tier,
    photonicEnabled,
  });
  return Object.freeze({
    kind: "PROPOSAL",
    tier,
    photonicEnabled,
    candidateRouteDigest: `sha256:${createHash("sha256").update(encoded).digest("hex")}`,
    routeSafety: "SAFE",
    authorityReleased: false,
  });
}

/** Dispatch is structurally refused. Independent SLIDE/TLL admission is the only later act. */
export function dispatchTriPipeEngine(_proposal: TriPipeProposal): {
  readonly refused: true;
  readonly code: "ROUTE_DISPATCH_FORBIDDEN";
} {
  return { refused: true, code: "ROUTE_DISPATCH_FORBIDDEN" };
}
