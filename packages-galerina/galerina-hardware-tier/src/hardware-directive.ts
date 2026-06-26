// hardware-directive.ts — the `hardware()` passive capability directive (0054 D1).
//
// Resolves a cached capability tier {binary|hybrid|photonic} ONCE at boot/admission, ATTESTED
// (derived from the bridge manifest behind verifyAttestation, NOT a self-asserted boolean), reused
// as a Passive Execution Plan input. Cache-invalidation = re-attestation. Fail-closed: UNKNOWN or
// UNATTESTED ⇒ binary (the K3 dead-zone collapses to DENY → binary, SPORE-HW-004).
//
// NEUTRAL by design: this package never calls verifyAttestation itself (that lives in the Tower,
// with node:crypto, on the BRIDGE attestation surface — `logicn.bridge.manifest.v1`, NOT the audit
// surface). The caller runs verifyAttestation(att, policy) and passes the boolean result in. So the
// directive ignores `InferenceBridge.nativeAvailable` (the gameable self-claim) entirely.
//
// Resolution order (0054 spec §1.2), mirrored exactly:
//   1. read the attested manifest's hardwareIdentity → targetId
//   2. GATE: attestation verified?            → if NO  ⇒ 'binary' (UNATTESTED ⇒ floor)
//   3. profiles.get(targetId)                  → if undefined ⇒ 'binary' (UNKNOWN ⇒ K3 DENY, SPORE-HW-004)
//   4. profile.requiresAttestation && !verified ⇒ 'binary' (defensive; step 2 already gated)
//   5. AcceleratorPlane && component fully-eligible ⇒ 'photonic' (the preference ceiling)
//   6. AcceleratorPlane (whole component) / ExecutionPlane ⇒ 'hybrid' (digital core + offloaded eligible)
//   7. else (GovernancePlane / ExperimentalPlane / out-of-scope) ⇒ 'binary'

import { HARDWARE_TIER_PROFILES, targetFromHardwareIdentity, type TierProfile } from "./trust-profiles.js";

/** The cached capability tier. */
export type Tier = "binary" | "hybrid" | "photonic";

export interface ResolveHardwareInput {
  /** Normalized target id (e.g. "photonic", "cpu", "gpu"). */
  readonly targetId: string;
  /** Result of verifyAttestation(att, policy).ok — injected (the directive never self-claims). */
  readonly attestationVerified: boolean;
  /** Component is pure tensor / governance T-MAC reduction — NO crypto, NO control flow.
   *  A whole component (crypto/control present) degrades the photonic ceiling to hybrid (§4). */
  readonly componentFullyEligible: boolean;
  /** Tier map (defaults to the mirrored HARDWARE_TIER_PROFILES). */
  readonly profiles?: ReadonlyMap<string, TierProfile>;
}

/** Resolve the capability tier, fail-closed. Pure + total (every input yields a tier). */
export function resolveHardware(input: ResolveHardwareInput): Tier {
  const profiles = input.profiles ?? HARDWARE_TIER_PROFILES;
  // 2. UNATTESTED ⇒ binary. A tier above binary REQUIRES a verified attestation; binary is the floor.
  // Strict boolean identity (zero-trust): any truthy non-boolean (the string "false", {}, [], 1 from a
  // JSON/env round-trip or a mis-wired caller passing the verifyAttestation result object instead of .ok)
  // must collapse to the floor — never coerce-pass the gate.
  if (input.attestationVerified !== true) return "binary";
  // 3. UNKNOWN target ⇒ K3 INDETERMINATE ⇒ DENY ⇒ binary (SPORE-HW-004).
  const profile = profiles.get(input.targetId);
  if (!profile) return "binary";
  // 4. defensive (step 2 already ensured verified === true here).
  if (profile.requiresAttestation && input.attestationVerified !== true) return "binary";
  // 5. AcceleratorPlane (photonic/neuromorphic) + fully-eligible ⇒ photonic (the preference ceiling).
  if (profile.governanceClass === "AcceleratorPlane") {
    return input.componentFullyEligible ? "photonic" : "hybrid"; // whole component converges to hybrid (§4)
  }
  // 6. ExecutionPlane (gpu/npu/cpu-SIMD) ⇒ hybrid (offload-capable; digital core + offloaded eligible).
  if (profile.governanceClass === "ExecutionPlane") return "hybrid";
  // 7. GovernancePlane (cpu/wasm) or ExperimentalPlane (quantum, out of scope) ⇒ binary floor.
  return "binary";
}

/** Convenience: resolve from a manifest's raw hardwareIdentity (normalizes → targetId first). */
export function resolveHardwareFromIdentity(input: {
  readonly hardwareIdentity: string;
  readonly attestationVerified: boolean;
  readonly componentFullyEligible: boolean;
  readonly profiles?: ReadonlyMap<string, TierProfile>;
}): Tier {
  return resolveHardware({
    targetId: targetFromHardwareIdentity(input.hardwareIdentity),
    attestationVerified: input.attestationVerified,
    componentFullyEligible: input.componentFullyEligible,
    ...(input.profiles !== undefined ? { profiles: input.profiles } : {}),
  });
}

/**
 * The cached passive directive. Resolves ONCE, then returns the cached tier (deployment-stable —
 * it must NOT re-resolve per call or wobble with wall-clock, or it would break planHash determinism).
 * `invalidate()` models cache-invalidation = re-attestation (a new attested manifest).
 */
export class HardwareDirective {
  private cached: Tier | null = null;
  private readonly input: ResolveHardwareInput;

  constructor(input: ResolveHardwareInput) { this.input = input; }

  /** The cached tier (resolved once). */
  resolve(): Tier {
    if (this.cached === null) this.cached = resolveHardware(this.input);
    return this.cached;
  }

  /** Re-attestation: drop the cache so the next resolve() re-derives from a fresh attestation. */
  invalidate(): void { this.cached = null; }

  /**
   * Deployment-stable canonical pre-image contribution for the Passive Execution Plan's planHash.
   * Stable JSON with NO wall-clock (mirrors buildExecutionPlan's generatedAt-stripped pre-image),
   * so the cached capability hashes INTO planHash deterministically and binds to the attestation.
   */
  capabilityPreimage(): string {
    return JSON.stringify({ id: "hardware.capability", tier: this.resolve() });
  }
}

/** Free-function form of the deployment-stable pre-image (for a bare tier value). */
export function capabilityPreimage(tier: Tier): string {
  return JSON.stringify({ id: "hardware.capability", tier });
}
