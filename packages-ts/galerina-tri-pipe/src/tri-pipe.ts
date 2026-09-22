// tri-pipe.ts — proposal-only candidate route (P6 / C3).
//
// Composes the hardware() capability directive into a digest-bound candidate
// route and a route-safety operand. It does NOT construct a HybridInferenceEngine,
// does not dispatch, and does not mint admission. Independent SLIDE/TLL admission
// is the only later act that may execute a proposed route.

import { createHash } from "node:crypto";
import { resolveHardware, type Tier } from "../../galerina-hardware-tier/dist/index.js";

export type { Tier };

/** RD-0855 architectural execution profiles. 128/512 are experimental and have no ABI. */
export const ADMITTED_REPRESENTATION_PROFILES = Object.freeze([1, 32, 64, 256] as const);
export type RepresentationProfile = (typeof ADMITTED_REPRESENTATION_PROFILES)[number];
export const EXPERIMENTAL_REPRESENTATION_PROFILES = Object.freeze([128, 512] as const);

export const COMPUTE_TRANSFER_SCHEMA = "galerina.compute-transfer.v1" as const;

export interface ComputeTransferV1 {
  readonly schema: typeof COMPUTE_TRANSFER_SCHEMA;
  readonly owner: "galerina.tri-pipe";
  readonly kind: "route-proposal";
  readonly digest: string;
}

export interface TriPipeOptions {
  /** Attested hardware target id (e.g. "photonic", "gpu", "cpu", "wasm"). */
  readonly targetId: string;
  /** Result of verifyAttestation(att, policy).ok — the directive is ATTESTED, not self-asserted. */
  readonly attestationVerified: boolean;
  /** Component is pure-tensor / fully eligible (no crypto/control). Gates the photonic ceiling
   *  (a whole component converges to hybrid). Default false (the common whole-component case). */
  readonly componentFullyEligible?: boolean;
  /**
   * RD-0855 representation-profile candidate. Default 1 (scalar oracle, mandatory first).
   * 32 = compatibility fallback; 64/256 = packed/wide after scalar parity.
   * 128/512 have no ABI and refuse. This never authorises the route.
   */
  readonly representationProfile?: number;
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
  readonly representationProfile: RepresentationProfile;
  readonly candidateRouteDigest: string;
  readonly transfer: ComputeTransferV1;
  /** Well-formed proposal, not an admitted or dispatched route. */
  readonly routeSafety: "SAFE";
  readonly authorityReleased: false;
  readonly dataBrand: "Trit";
  readonly governanceBrand: "Verdict";
}

export interface TriPipeRefusal {
  readonly kind: "REFUSED";
  readonly code: "REPRESENTATION_PROFILE_NOT_ADMITTED";
  readonly requested: number;
  readonly authorityReleased: false;
}

export type TriPipeResult = TriPipeProposal | TriPipeRefusal;

function isAdmittedProfile(value: number): value is RepresentationProfile {
  return (ADMITTED_REPRESENTATION_PROFILES as readonly number[]).includes(value);
}

/**
 * Propose one digest-bound Tri-Pipe route. `hardware()` picks the tier; no engine
 * is constructed and nothing is dispatched. RD-0855: Tri-Pipe cannot authorise
 * its own route; representation profiles are candidates only.
 */
export function createTriPipeEngine(opts: TriPipeOptions): TriPipeResult {
  const requested = opts.representationProfile ?? 1;
  if (!isAdmittedProfile(requested)) {
    return Object.freeze({
      kind: "REFUSED",
      code: "REPRESENTATION_PROFILE_NOT_ADMITTED",
      requested,
      authorityReleased: false,
    });
  }
  const tier = resolveHardware({
    targetId: opts.targetId,
    attestationVerified: opts.attestationVerified,
    componentFullyEligible: opts.componentFullyEligible ?? false,
  });
  const photonicEnabled = tier === "hybrid" || tier === "photonic";
  const encoded = JSON.stringify({
    profile: "galerina.tri-pipe.proposal.v2",
    targetId: opts.targetId,
    attestationVerified: opts.attestationVerified,
    componentFullyEligible: opts.componentFullyEligible ?? false,
    representationProfile: requested,
    tier,
    photonicEnabled,
    dataBrand: "Trit",
    governanceBrand: "Verdict",
  });
  const candidateRouteDigest = `sha256:${createHash("sha256").update(encoded).digest("hex")}`;
  return Object.freeze({
    kind: "PROPOSAL",
    tier,
    photonicEnabled,
    representationProfile: requested,
    candidateRouteDigest,
    transfer: Object.freeze({
      schema: COMPUTE_TRANSFER_SCHEMA,
      owner: "galerina.tri-pipe",
      kind: "route-proposal",
      digest: candidateRouteDigest,
    }),
    routeSafety: "SAFE",
    authorityReleased: false,
    dataBrand: "Trit",
    governanceBrand: "Verdict",
  });
}

/** Dispatch is structurally refused. Independent SLIDE/TLL admission is the only later act. */
export function dispatchTriPipeEngine(_proposal: TriPipeResult): {
  readonly refused: true;
  readonly code: "ROUTE_DISPATCH_FORBIDDEN";
} {
  return { refused: true, code: "ROUTE_DISPATCH_FORBIDDEN" };
}
