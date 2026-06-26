// @galerina/hardware-tier — the Tri-Pipe hardware() directive + per-tier package loader.
//
// Realizes the owner's Tri-Pipe topology (0054): a cached, ATTESTED capability directive
// `hardware() ∈ {binary|hybrid|photonic}` (AXIS-1, picks the package) composed over the EXISTING
// one-router / N-bridge seam, with a loader that selects photonic > hybrid > binary (fall-through,
// binary always the floor). Fail-closed everywhere; preference NEVER forces compute onto photonics
// (the 0053 per-kernel router still gates actual offload — AXIS-2). Worst case == binary == today.
//
// Neutral: depends only on @galerina/inference-bridge-contract (types). The attestation result is
// injected (verifyAttestation lives in the Tower, on the BRIDGE surface). Composes the photonic
// substrate from @galerina/ext-photonic-emulator.

export {
  type GovernanceClass, type TierProfile,
  HARDWARE_TIER_PROFILES, targetFromHardwareIdentity,
} from "./trust-profiles.js";

export {
  type Tier, type ResolveHardwareInput,
  resolveHardware, resolveHardwareFromIdentity,
  HardwareDirective, capabilityPreimage,
} from "./hardware-directive.js";

export {
  type TierRegistries, type TierSelection,
  selectTier, createTierLoader,
} from "./tier-loader.js";
