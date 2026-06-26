// attestation.ts — Phase 1.5 (CF-3/CF-7): attest + admit the ffsim BridgeManifest via
// tower-citizen's bridge-attestation. Uses the hybrid Ed25519+ML-DSA-65 path now available (#34):
// Ed25519-only and hybrid are both supported, and a hybrid policy (one carrying an ML-DSA public
// key) requires BOTH signatures — an Ed25519-only attestation is denied (no PQ downgrade).
// Pure governance, no ffsim. (The AuditLogger lifecycle wiring is the remaining Phase-1.5 step.)
import {
  signManifest, verifyAttestation, signManifestHybrid, verifyAttestationHybrid,
  type AttestationPolicy, type AttestationResult,
} from "../../galerina-tower-citizen/dist/index.js";
import type { BridgeManifest, BridgeAttestation } from "../../galerina-inference-bridge-contract/dist/index.js";

/**
 * Sign the ffsim manifest. Hybrid (Ed25519 + ML-DSA-65) when an ML-DSA secret key is supplied;
 * otherwise classical Ed25519. The signing key lives in key custody (#149), never in the package.
 */
export async function attestFfsimManifest(
  manifest: BridgeManifest,
  privateKeyPem: string,
  mlDsaPrivateKey?: Uint8Array,
): Promise<BridgeAttestation> {
  return mlDsaPrivateKey !== undefined
    ? signManifestHybrid(manifest, privateKeyPem, mlDsaPrivateKey)
    : signManifest(manifest, privateKeyPem);
}

/**
 * Admit (verify) the ffsim backend's attestation before any job runs (CF-3/CF-7). The ffsim bridge
 * is Tier-3 ("Toxic Border"), so hybrid Ed25519+ML-DSA-65 is REQUIRED by default (CRYPTO-002): a
 * policy with no `mlDsaPublicKey` is DENIED — there is no classical-only fallback / PQ downgrade.
 * A non-Tier-3 caller may opt down to classical Ed25519 with `policy.requireHybrid === false`.
 * Fails CLOSED on a missing, downgraded, or tampered attestation.
 */
export async function verifyFfsimAdmission(
  attestation: BridgeAttestation | undefined,
  policy: AttestationPolicy,
): Promise<AttestationResult> {
  const requireHybrid = policy.requireHybrid !== false; // Tier-3 default: hybrid mandatory
  if (requireHybrid && policy.mlDsaPublicKey === undefined) {
    return {
      ok: false,
      reason: "ERR_QUANTUM_PQ_REQUIRED: ffsim admission requires a hybrid attestation policy (mlDsaPublicKey) — Tier-3 toxic border, no PQ downgrade",
    };
  }
  return policy.mlDsaPublicKey !== undefined
    ? verifyAttestationHybrid(attestation, policy, policy.mlDsaPublicKey)
    : verifyAttestation(attestation, policy);
}
