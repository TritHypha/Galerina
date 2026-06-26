// =============================================================================
// Galerina — ext-proof-snarkjs — Main facade
//
// Exports:
//   GalerinaSnarkjsProver  — ProverBackend implementation (Phase 1: sha256 seal)
//   createSnarkjsProver  — factory for easy instantiation
//   ProverInput          — input type (re-exported for consumers)
//   ZkProof              — proof type (re-exported for consumers)
//   ProverBackend        — interface (re-exported for consumers)
//
// Usage:
//   import { createSnarkjsProver } from "@galerina/ext-proof-snarkjs";
//   const prover = createSnarkjsProver();
//   const receipt = await generateEpilogueReceipt({
//     strategy: "zk_snark_receipt",
//     onFailure: "halt_pipeline",
//     sourceText,
//     contractHash,
//     proverBackend: prover,
//   });
// =============================================================================

export type { ProverInput, ZkProof, ProverBackend } from "./types.js";
export { CIRCUIT_ID } from "./circuit.js";

import { Sha256SealBackend } from "./circuit.js";
import type { ProverInput, ZkProof, ProverBackend } from "./types.js";

/**
 * GalerinaSnarkjsProver — the Phase 1 snarkjs prover backend for Galerina.
 *
 * Implements ProverBackend using a cryptographically-grounded sha256 commitment
 * structured as a pre-ceremony Groth16 placeholder. Deterministic and verifiable.
 *
 * Phase 2 upgrade: swap the internal Sha256SealBackend for a real
 * snarkjs.groth16.fullProve() call once the .zkey is available.
 * The circuitId will change to "galerina-groth16-bn128-v1.0".
 */
export class GalerinaSnarkjsProver implements ProverBackend {
  readonly circuitId: string;

  private readonly _backend: Sha256SealBackend;

  constructor() {
    this._backend = new Sha256SealBackend();
    this.circuitId = this._backend.circuitId;
  }

  /**
   * Compute a ZkProof for the given input.
   * Deterministic: same input always produces the same proof.
   */
  async prove(input: ProverInput): Promise<ZkProof> {
    return this._backend.prove(input);
  }

  /**
   * Verify that a ZkProof is valid for the given input.
   * Returns true iff the proof was produced by prove() with the same input.
   */
  async verify(proof: ZkProof, input: ProverInput): Promise<boolean> {
    return this._backend.verify(proof, input);
  }
}

/**
 * Factory function for easy instantiation.
 * Returns a ProverBackend ready for injection into generateEpilogueReceipt().
 */
export function createSnarkjsProver(): ProverBackend {
  return new GalerinaSnarkjsProver();
}
