// trust-profiles.ts — the per-target tier MAP the hardware() directive keys off.
//
// MIRRORS the shipped HARDWARE_TRUST_PROFILES (galerina-core-compiler/src/type-registry.ts:455-505)
// — kept here as a neutral, self-contained copy so this package depends on no compiler internals
// and so the directive's resolution is provable against the SAME governance-class / attestation rows
// the production proof-escalation table uses. Per the 0054 spec gotcha, that production table is a
// COMPILE-TIME proof-escalation table; here it is reused purely as the tier MAP (the resolve-once
// boot detection is design-added, in hardware-directive.ts).

/** Governance plane of a hardware target (mirrors HardwareGovernanceClass). */
export type GovernanceClass =
  | "GovernancePlane"    // cpu / wasm — may issue authority, fully observable
  | "ExecutionPlane"     // gpu / npu / cpu-SIMD — deterministic compute, observable/sealed
  | "AcceleratorPlane"   // photonic / neuromorphic — opaque, REQUIRES attestation
  | "ExperimentalPlane"; // quantum — probabilistic (out of 0054's {binary|hybrid|photonic} scope)

export interface TierProfile {
  readonly targetId: string;
  readonly governanceClass: GovernanceClass;
  /** true for AcceleratorPlane/ExperimentalPlane (Escalated+) — a tier above binary needs it verified. */
  readonly requiresAttestation: boolean;
}

// Representative rows mirrored from type-registry.ts:455-505 (governanceClass + requiresAttestation).
const ROWS: ReadonlyArray<readonly [string, GovernanceClass, boolean]> = [
  // GovernancePlane — binary tier (no offload hardware)
  ["cpu", "GovernancePlane", false],
  ["wasm", "GovernancePlane", false],
  ["wasm.simd128", "GovernancePlane", false],
  // ExecutionPlane — offload-capable (gpu/npu/cpu-SIMD); whole component → hybrid
  ["intel", "ExecutionPlane", false],
  ["intel.avx512", "ExecutionPlane", false],
  ["amd", "ExecutionPlane", false],
  ["arm", "ExecutionPlane", false],
  ["gpu", "ExecutionPlane", false],
  ["npu", "ExecutionPlane", false],
  ["nvidia", "ExecutionPlane", false],
  ["nvidia.blackwell", "ExecutionPlane", false],
  // AcceleratorPlane — photonic tier ceiling; REQUIRES attestation
  ["photonic", "AcceleratorPlane", true],
  ["neuromorphic", "AcceleratorPlane", true],
  // ExperimentalPlane — out of scope for the {binary|hybrid|photonic} axis (quantum is a separate path)
  ["quantum", "ExperimentalPlane", true],
];

/** The tier MAP: targetId → { governanceClass, requiresAttestation }. */
export const HARDWARE_TIER_PROFILES: ReadonlyMap<string, TierProfile> = new Map(
  ROWS.map(([targetId, governanceClass, requiresAttestation]) => [
    targetId,
    { targetId, governanceClass, requiresAttestation },
  ]),
);

/**
 * Best-effort normalization of a manifest `hardwareIdentity` (e.g. "photonic-emulator-v0",
 * "wasm-simulator", "x86_64-avx2") to a known targetId. Splits on -/_/. and returns the first
 * segment that is a known tier key; otherwise returns the raw id (which resolves UNKNOWN → binary,
 * fail-closed). The directive only ever rises ABOVE binary for a recognized, attested target.
 */
export function targetFromHardwareIdentity(hardwareIdentity: string): string {
  const id = hardwareIdentity.toLowerCase();
  for (const seg of id.split(/[-_.]/)) {
    if (HARDWARE_TIER_PROFILES.has(seg)) return seg;
  }
  return id; // unknown → caller's map.get(...) is undefined → binary (fail-closed)
}
