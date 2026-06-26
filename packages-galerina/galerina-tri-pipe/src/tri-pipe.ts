// tri-pipe.ts — the Tri-Pipe capstone: hardware() → tier → one governed engine.
//
// Composes the three pieces built across the loop session into a single deployment call:
//   • @galerina/hardware-tier        — the cached, attested hardware() capability directive (AXIS-1)
//   • @galerina/ext-photonic-emulator — the physics-faithful photonic backend + 0053 router (AXIS-2)
//   • @galerina/tower-citizen        — the governed HybridInferenceEngine (the digital default)
//
// The capability tier selects the digital backend registry AND whether the photonic offload port is
// enabled; the per-op net-win router still decides each actual offload. binary ⇒ digital only;
// hybrid/photonic ⇒ digital core + photonic offload for net-win ELIGIBLE kernels. Fail-closed to
// binary (unknown/unattested ⇒ binary ⇒ no offload ⇒ identical to today).
//
// Dependencies imported by relative dist path (the repo convention; resolves offline). This is the
// composition/application layer — the one package allowed to depend on the Tower runtime.

import { createHybridEngine, type HybridInferenceEngine, type PhotonicConfig, type PhotonicKernelCost } from "../../galerina-tower-citizen/dist/index.js";
import { resolveHardware, type Tier } from "../../galerina-hardware-tier/dist/index.js";
import { createPhotonicRouterPort } from "../../galerina-ext-photonic-emulator/dist/index.js";
import type { BridgeRegistry, BridgeOp } from "../../galerina-inference-bridge-contract/dist/index.js";

export type { Tier };

export interface TriPipeOptions {
  /** Attested hardware target id (e.g. "photonic", "gpu", "cpu", "wasm"). */
  readonly targetId: string;
  /** Result of verifyAttestation(att, policy).ok — the directive is ATTESTED, not self-asserted. */
  readonly attestationVerified: boolean;
  /** Component is pure-tensor / fully eligible (no crypto/control). Gates the photonic ceiling
   *  (a whole component converges to hybrid). Default false (the common whole-component case). */
  readonly componentFullyEligible?: boolean;
  /** Digital backend registry for the hybrid/photonic tiers (e.g. createCppBridgeRegistry()).
   *  Defaults to the in-package stub registry when omitted. The binary tier always uses the stub. */
  readonly hybridBridges?: BridgeRegistry;
  /** Maps a routed op to its kernel cost (a deployment supplies real kernel sizes). */
  readonly kernelFor?: (op: BridgeOp) => PhotonicKernelCost;
  /** Use an in-memory audit ledger (ephemeral / benchmark contexts). */
  readonly auditInMemory?: boolean;
}

export interface TriPipeEngine {
  /** The resolved capability tier. */
  readonly tier: Tier;
  /** True iff the photonic offload port is wired (tier ∈ {hybrid, photonic}). */
  readonly photonicEnabled: boolean;
  /** The governed engine, configured for the selected tier. */
  readonly engine: HybridInferenceEngine;
}

/**
 * Build one governed Tri-Pipe engine. `hardware()` (AXIS-1) picks the tier; the digital registry and
 * the photonic offload port are selected accordingly; the 0053 per-kernel router (AXIS-2) still gates
 * each actual offload. Preference NEVER forces compute onto photonics — worst case == binary == today.
 */
export function createTriPipeEngine(opts: TriPipeOptions): TriPipeEngine {
  const tier = resolveHardware({
    targetId: opts.targetId,
    attestationVerified: opts.attestationVerified,
    componentFullyEligible: opts.componentFullyEligible ?? false,
  });

  // Photonic offload is wired for the offload-capable tiers only (binary stays purely digital).
  const photonicEnabled = tier === "hybrid" || tier === "photonic";
  const photonic: PhotonicConfig | undefined = photonicEnabled
    ? { router: createPhotonicRouterPort(), ...(opts.kernelFor !== undefined ? { kernelFor: opts.kernelFor } : {}) }
    : undefined;
  // Digital registry: binary ⇒ the stub default; hybrid/photonic ⇒ the injected hybrid registry (or stub).
  const bridges = photonicEnabled ? opts.hybridBridges : undefined;

  const engine = createHybridEngine({
    ...(opts.auditInMemory !== undefined ? { auditInMemory: opts.auditInMemory } : {}),
    ...(bridges !== undefined ? { bridges } : {}),
    ...(photonic !== undefined ? { photonic } : {}),
  });

  return { tier, photonicEnabled, engine };
}
