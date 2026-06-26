// quantum-contract.ts — coarse-grained, JOB-oriented governed-backend contract for the
// out-of-process ffsim quantum bridge. Distinct from the ternary, OP-oriented
// @galerina/inference-bridge-contract (design §3): a quantum "job" is a whole simulation
// (ms→s), float64/complex128, NOT bit-exact, Tier-3 untrusted, run out-of-process.
import type { BridgeManifest, BridgeAttestation } from "../../galerina-inference-bridge-contract/dist/index.js";

/** The closed, enumerated set of permitted ffsim operations (deny-by-default). */
export type QuantumOp =
  | "hartree_fock_state"
  | "slater_determinant"
  | "apply_orbital_rotation"
  | "simulate_trotter_double_factorized"
  | "simulate_trotter_diag_coulomb_split_op"
  | "expectation_energy"
  | "rdms"
  | "sample_state_vector";

export const QUANTUM_OPS: readonly QuantumOp[] = [
  "hartree_fock_state", "slater_determinant", "apply_orbital_rotation",
  "simulate_trotter_double_factorized", "simulate_trotter_diag_coulomb_split_op",
  "expectation_energy", "rdms", "sample_state_vector",
];

/** Hard ceilings — the V_DPM traps a job that exceeds any of these (design §5.3). */
export interface QuantumLimits {
  readonly maxOrbitals: number;
  readonly maxSubspaceDim: number;   // the real governor (§6)
  readonly maxMemoryMB: number;
  readonly maxWallMs: number;
  readonly maxTrotterSteps?: number;
  readonly maxShots?: number;
  readonly rayonThreads: number;     // pinned → reproducibility + resource bound
  readonly tolerance: number;        // tolerance-determinism band
}

/** A hashed handle to a large numeric artifact — never inline a giant array on the hot path. */
export interface QuantumArtifactRef {
  readonly handle: string;
  readonly sha256: string;
  readonly shape: readonly number[];
  readonly dtype: "complex128" | "float64";
}

export interface QuantumJob {
  readonly op: QuantumOp;
  readonly correlationId: string;
  readonly norb: number;
  readonly nelec: readonly [number, number];   // (n_alpha, n_beta)
  readonly seed: number;                        // REQUIRED — no implicit entropy
  readonly params: Readonly<Record<string, number | readonly number[]>>; // validated numerics only
  readonly inputArtifacts?: readonly QuantumArtifactRef[];
}

export interface QuantumProvenance {
  readonly backendVersion: string;
  readonly backendArtifactHash: string;
  readonly seed: number;
  readonly rayonThreads: number;
  readonly tolerance: number;
  readonly inputHash: string;
  readonly outputHash: string;
}

export interface QuantumResult {
  readonly correlationId: string;
  readonly backendId: string;
  readonly executedNatively: boolean;   // true = real ffsim ran; false = trapped or unavailable/stub
  readonly scalars: Readonly<Record<string, number>>;
  readonly artifacts: readonly QuantumArtifactRef[];
  readonly provenance: QuantumProvenance;
  readonly latencyMs: number;
  readonly trapFired: boolean;
  readonly errorCode?: string;          // present iff a limit/border trap fired
  readonly reason?: string;
}

export interface QuantumSimBackend {
  readonly backendId: string;
  readonly available: boolean;          // python + ffsim importable in the pinned env?
  readonly manifest?: BridgeManifest;
  readonly attestation?: BridgeAttestation;
  initialize(): Promise<void>;
  shutdown(): Promise<void>;
  run(job: QuantumJob, limits: QuantumLimits): Promise<QuantumResult>;
}

export type QuantumBridgeRegistry = ReadonlyMap<string, QuantumSimBackend>;
