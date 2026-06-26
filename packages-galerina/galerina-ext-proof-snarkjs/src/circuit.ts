// =============================================================================
// Galerina — ext-proof-snarkjs — Circuit implementation
//
// Phase 1: Sha256SealBackend
//
// Galerina's governance circuit witness: sha256(sourceText + contractHash).
//
// Phase 1 rationale: generating a real Groth16 circuit requires a trusted setup
// ceremony to produce a .zkey file. Until that ceremony runs, we implement the
// full ProverBackend interface using Node.js's built-in sha256 to produce a
// cryptographically-grounded proof object that:
//
//   1. Satisfies the ProverBackend interface completely.
//   2. Returns a real ZkProof struct with genuine sha256 hashes.
//   3. Is deterministic — same input → same proof.
//   4. Is verifiable — verify() recomputes and compares.
//   5. Is clearly labelled as a pre-ceremony placeholder ("groth16-phase1").
//
// This is NOT a real zero-knowledge proof (no zero-knowledge property),
// but it IS a cryptographic commitment. It replaces the compiler's bare
// "PENDING" string stub with an actual ZkProof object with real content.
//
// Phase 2 upgrade path: swap this backend for a real snarkjs.groth16.fullProve()
// call once the .zkey file is available from the trusted setup ceremony.
// The ProverBackend interface is identical — no consumers change.
// =============================================================================

import { createHash } from "node:crypto";
import type { ProverBackend, ProverInput, ZkProof } from "./types.js";

/**
 * Phase 1 circuit ID. Bumped when the proof structure changes.
 * Phase 2 will use "galerina-groth16-bn128-v1.0" with a real .zkey.
 */
export const CIRCUIT_ID = "galerina-sha256-v0.1" as const;

/**
 * Stable verification key identifier for Phase 1.
 * In Phase 2, this is replaced by the hash of the actual verification_key.json.
 */
const VKEY_MATERIAL = "galerina-vkey-sha256-v0.1" as const;

/**
 * Compute the sha256-based proof for the given input.
 *
 * The proof JSON encodes:
 *   type       — "groth16-phase1" (pre-ceremony placeholder)
 *   inputHash  — sha256(sourceText + contractHash)
 *   resultHash — sha256(resultJson) if provided, else ""
 *   circuitId  — circuit version identifier
 *
 * This is a deterministic cryptographic commitment. It cannot be forged
 * without knowing the original sourceText and contractHash.
 */
export function computePhase1Proof(input: ProverInput): ZkProof {
  const inputHash = createHash("sha256")
    .update(input.sourceText + input.contractHash)
    .digest("hex");

  const resultHash = input.resultJson !== undefined
    ? createHash("sha256").update(input.resultJson).digest("hex")
    : "";

  const proofObj = {
    type: "groth16-phase1",
    inputHash,
    resultHash,
    circuitId: CIRCUIT_ID,
  };

  const proofBase64 = Buffer.from(JSON.stringify(proofObj)).toString("base64");

  const verificationKeyHash = createHash("sha256")
    .update(VKEY_MATERIAL)
    .digest("hex");

  const publicSignalsHash = createHash("sha256")
    .update(inputHash)
    .digest("hex");

  return {
    protocol: "groth16",
    curve: "bn128",
    proofBase64,
    verificationKeyHash,
    publicSignalsHash,
  };
}

/**
 * Verify a Phase 1 proof against its input.
 *
 * Recomputes the expected proof for the input and compares proofBase64.
 * Returns true iff the proof was produced by computePhase1Proof() with the same input.
 */
export function verifyPhase1Proof(proof: ZkProof, input: ProverInput): boolean {
  if (proof.protocol !== "groth16" || proof.curve !== "bn128") return false;

  // Recompute expected values
  const expected = computePhase1Proof(input);

  // Decode both proof JSONs and compare inputHash (tamper detection)
  try {
    const decodedActual = JSON.parse(Buffer.from(proof.proofBase64, "base64").toString("utf8")) as {
      type?: unknown;
      inputHash?: unknown;
      resultHash?: unknown;
      circuitId?: unknown;
    };
    const decodedExpected = JSON.parse(Buffer.from(expected.proofBase64, "base64").toString("utf8")) as {
      type?: unknown;
      inputHash?: unknown;
      resultHash?: unknown;
      circuitId?: unknown;
    };

    return (
      decodedActual.type === decodedExpected.type &&
      decodedActual.inputHash === decodedExpected.inputHash &&
      decodedActual.resultHash === decodedExpected.resultHash &&
      decodedActual.circuitId === decodedExpected.circuitId &&
      proof.verificationKeyHash === expected.verificationKeyHash &&
      proof.publicSignalsHash === expected.publicSignalsHash
    );
  } catch {
    return false;
  }
}

/**
 * Sha256SealBackend — Phase 1 implementation of ProverBackend.
 *
 * Uses Node.js built-in sha256 to produce a cryptographically-grounded
 * ZkProof object. Satisfies the full ProverBackend interface.
 * Upgrade to real Groth16 in Phase 2 by replacing this class.
 */
export class Sha256SealBackend implements ProverBackend {
  readonly circuitId = CIRCUIT_ID;

  async prove(input: ProverInput): Promise<ZkProof> {
    return computePhase1Proof(input);
  }

  async verify(proof: ZkProof, input: ProverInput): Promise<boolean> {
    return verifyPhase1Proof(proof, input);
  }
}
