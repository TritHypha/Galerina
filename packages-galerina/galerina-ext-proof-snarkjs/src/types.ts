// =============================================================================
// Galerina — ext-proof-snarkjs — Type definitions
//
// The ProverBackend interface that the compiler core expects.
// Core never imports snarkjs directly — the prover is injected via this plug-in API.
//
// Phase 1: GalerinaSnarkjsProver implements ProverBackend using a cryptographically-
// grounded sha256 seal structured as a pre-ceremony Groth16 placeholder.
// Phase 2: Replace with real snarkjs.groth16.fullProve() once .zkey is available.
// =============================================================================

/** Input to any ProverBackend implementation. */
export interface ProverInput {
  readonly sourceText: string;     // raw Galerina source of the flow
  readonly contractHash: string;   // canonical sha256 of the contract block
  readonly resultJson?: string;    // optional: flow execution result (for output seal)
}

/**
 * A completed zero-knowledge proof produced by a wired ProverBackend.
 *
 * Encoding:
 *   proofBase64          — base64-encoded JSON of the snarkjs/bellman proof object
 *   verificationKeyHash  — sha256 hex of the serialised verification key
 *   publicSignalsHash    — sha256 hex of the JSON-serialised public signals array
 */
export interface ZkProof {
  readonly protocol: "groth16" | "plonk";
  readonly curve: "bn128" | "bls12-381";
  readonly proofBase64: string;         // base64-encoded proof object
  readonly verificationKeyHash: string; // sha256 of the verification key
  readonly publicSignalsHash: string;   // sha256 of the public signals array
}

/**
 * Plug-in interface — implemented by galerina-ext-proof-snarkjs (Phase 1) or
 * galerina-ext-proof-bellman (Phase 2). Injected into generateEpilogueReceipt()
 * via a module-level registry or direct parameter injection.
 */
export interface ProverBackend {
  /** Compute a ZkProof for the given input. Deterministic for the same input. */
  prove(input: ProverInput): Promise<ZkProof>;
  /** Verify that a ZkProof is valid for the given input. */
  verify(proof: ZkProof, input: ProverInput): Promise<boolean>;
  /** Identifies the circuit version — e.g. "galerina-sha256-v0.1" */
  readonly circuitId: string;
}
