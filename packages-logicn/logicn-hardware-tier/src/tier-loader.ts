// tier-loader.ts — the per-tier package loader (0054 D2 §2.4).
//
// Selects WHICH BridgeRegistry answers `this.bridges.get(decision.precision)` by the cached
// hardware() tier, with the owner's fall-through: "clearly photonic if not hybrid if not binary".
// A missing higher tier silently degrades; `binary` is the unconditional floor. The selected
// registry is injected into the UNCHANGED engine via createHybridEngine({ bridges }) — no Tower edit.
//
// This is AXIS-1 (capability preference, picks the package). AXIS-2 (the 0053 per-kernel net-win
// router) decides, WITHIN the chosen package, whether to actually offload — so preference NEVER
// forces compute onto photonics. Worst case == binary == identical to today.

import type { BridgeRegistry } from "../../logicn-inference-bridge-contract/dist/index.js";
import type { Tier } from "./hardware-directive.js";

/** The per-tier registries a deployment provides. `binary` is mandatory (the floor). */
export interface TierRegistries {
  /** The always-fallback (createStubRegistry — byte-unchanged digital default). REQUIRED. */
  readonly binary: BridgeRegistry;
  /** The DOMINANT real package (e.g. createCppBridgeRegistry — digital core + offloaded eligible). */
  readonly hybrid?: BridgeRegistry;
  /** Fully-eligible-only photonic package (e.g. createPhotonicRegistry). */
  readonly photonic?: BridgeRegistry;
}

export interface TierSelection {
  readonly registry: BridgeRegistry;
  /** The tier actually selected after fall-through (may be lower than requested). */
  readonly selected: Tier;
  /** The tier the directive requested (before fall-through). */
  readonly requested: Tier;
  readonly reason: string;
}

/**
 * Select the registry for a requested tier, applying the photonic > hybrid > binary fall-through.
 * Pure + total; `binary` is reached unconditionally. Never throws.
 */
export function selectTier(registries: TierRegistries, requested: Tier): TierSelection {
  switch (requested) {
    case "photonic":
      if (registries.photonic) return { registry: registries.photonic, selected: "photonic", requested, reason: "photonic tier available" };
      // FALL THROUGH — "clearly photonic if not hybrid if not binary"
    case "hybrid":
      if (registries.hybrid) return { registry: registries.hybrid, selected: "hybrid", requested, reason: requested === "hybrid" ? "hybrid tier available" : "photonic absent → degrade to hybrid" };
      // FALL THROUGH
    case "binary":
    default:
      return { registry: registries.binary, selected: "binary", requested, reason: requested === "binary" ? "binary tier" : `${requested} absent → degrade to binary (floor)` };
  }
}

/**
 * Build the tier loader. `resolveTier` is the cached hardware() directive (e.g.
 * `() => directive.resolve()`), resolved ONCE — the loader does not re-probe per call.
 * Returns the selected BridgeRegistry, ready to inject via createHybridEngine({ bridges }).
 */
export function createTierLoader(
  registries: TierRegistries,
  resolveTier: () => Tier,
): () => TierSelection {
  return () => selectTier(registries, resolveTier());
}
