/**
 * plugin-manifest.ts — RD-0236 #10: verify a plugin's IDENTITY before it is sandboxed + executed.
 *
 * `TowerRuntime.load` documented a "verify artifact hash + manifest" gate that did not exist — plugin
 * metadata was trusted verbatim, so a caller could load ANY plugin identity unverified. The first #10
 * fix added a well-formed-hash floor (a `sha256:`-prefixed identity + engineId). This follow-on adds the
 * real verification the header always claimed:
 *   - hash-vs-bytes: sha256(artifact bytes) MUST equal the declared artifactHash, and
 *   - a signed manifest: the PluginMetadata is signed and verifies against the deployment's attestation key.
 *
 * Construction mirrors bridge-attestation / capability-grant: Ed25519 (+ optional ML-DSA-65, no PQ
 * downgrade) over the canonical manifest pre-image, under a DISTINCT FIPS-204 domain-separation context
 * (`galerina.plugin.manifest.v1`) so a bridge-manifest or capability-grant signature can never be
 * cross-protocol replayed as a plugin manifest, and vice versa.
 */

import { createHash, sign as edSign, verify as edVerify, createPrivateKey, createPublicKey } from "node:crypto";
import type { AttestationPolicy, AttestationResult } from "./bridge-attestation.js";
import type { PluginMetadata } from "./plugin-sandbox.js";

export interface SignedPluginManifest {
  readonly manifest: PluginMetadata;
  readonly signature?: string;        // Ed25519 over canonicalPluginManifestString, base64
  readonly mlDsaSignature?: string;   // ML-DSA-65, base64 (hybrid — no PQ downgrade)
}

/** FIPS-204 domain-separation context for the plugin-manifest signing surface (distinct from the
 *  bridge-manifest and capability-grant contexts). */
const PLUGIN_MLDSA_CONTEXT = new TextEncoder().encode("galerina.plugin.manifest.v1");

/** Canonical, deterministic signing/hashing pre-image — every field in a fixed order, mask normalised
 *  to unsigned 32-bit so `-1` and `0xFFFFFFFF` cannot serialise to different strings. */
export function canonicalPluginManifestString(m: PluginMetadata): string {
  return JSON.stringify({
    engineId: m.engineId,
    artifactPath: m.artifactPath,
    artifactHash: m.artifactHash,
    governanceTier: m.governanceTier,
    license: m.license,
    maxMemoryMB: m.maxMemoryMB,
    capabilityMask: (m.capabilityMask ?? 0) >>> 0,
  });
}

/** sha256 hex of the canonical plugin-manifest pre-image. */
export function pluginManifestHash(m: PluginMetadata): string {
  return createHash("sha256").update(canonicalPluginManifestString(m), "utf8").digest("hex");
}

/** sha256 of raw artifact bytes, `sha256:`-prefixed to match the PluginMetadata.artifactHash convention. */
export function artifactBytesHash(bytes: Uint8Array): string {
  return "sha256:" + createHash("sha256").update(bytes).digest("hex");
}

/** Sign a plugin manifest with an Ed25519 private key (PEM PKCS8). */
export function signPluginManifest(manifest: PluginMetadata, privateKeyPem: string): SignedPluginManifest {
  const sig = edSign(null, Buffer.from(canonicalPluginManifestString(manifest), "utf8"), createPrivateKey(privateKeyPem));
  return { manifest, signature: sig.toString("base64") };
}

/** Hybrid sign (Ed25519 + ML-DSA-65) — both signatures over the canonical manifest pre-image. */
export async function signPluginManifestHybrid(
  manifest: PluginMetadata,
  privateKeyPem: string,
  mlDsaPrivateKey: Uint8Array,
): Promise<SignedPluginManifest> {
  const msg = Buffer.from(canonicalPluginManifestString(manifest), "utf8");
  const edSig = edSign(null, msg, createPrivateKey(privateKeyPem));
  const { ml_dsa65 } = await import("@noble/post-quantum/ml-dsa.js") as {
    ml_dsa65: { sign(m: Uint8Array, sk: Uint8Array, opts?: { context?: Uint8Array }): Uint8Array };
  };
  const mlSig = ml_dsa65.sign(msg, mlDsaPrivateKey, { context: PLUGIN_MLDSA_CONTEXT });
  return { manifest, signature: edSig.toString("base64"), mlDsaSignature: Buffer.from(mlSig).toString("base64") };
}

/**
 * Verify a signed plugin manifest against an attestation policy, binding it to the metadata actually
 * being loaded. Fails CLOSED — a missing manifest, an engineId/artifactHash mismatch (so a manifest signed
 * for plugin A cannot admit plugin B), an absent/bad signature, a revoked signer, or (in hybrid mode) an
 * absent/bad ML-DSA half all return `{ ok: false }`. When `policy.requireHybrid` or `policy.mlDsaPublicKey`
 * is set the ML-DSA signature is REQUIRED and verified (no PQ downgrade), mirroring verifyAttestationHybrid.
 */
export async function verifyPluginManifest(
  signed: SignedPluginManifest | undefined,
  policy: AttestationPolicy,
  expected: { engineId: string; artifactHash: string },
): Promise<AttestationResult> {
  if (!signed || !signed.manifest) return { ok: false, reason: "no signed plugin manifest provided" };
  const m = signed.manifest;
  const hash = pluginManifestHash(m);

  // Bind the manifest to the metadata being loaded — no manifest-for-another-plugin replay.
  if (m.engineId !== expected.engineId || m.artifactHash !== expected.artifactHash) {
    return { ok: false, reason: `signed manifest does not match the metadata being loaded (engineId/artifactHash)`, hash };
  }

  // Ed25519 — a load manifest asserts identity/authority, so a signature is always required.
  if (!signed.signature) return { ok: false, reason: "manifest signature required but absent", hash };
  if (!policy.publicKeyPem) return { ok: false, reason: "no public key configured to verify the manifest", hash };
  try {
    const ok = edVerify(
      null,
      Buffer.from(canonicalPluginManifestString(m), "utf8"),
      createPublicKey(policy.publicKeyPem),
      Buffer.from(signed.signature, "base64"),
    );
    if (!ok) return { ok: false, reason: "manifest signature verification failed", hash };
  } catch (e) {
    return { ok: false, reason: `manifest signature check error: ${(e as Error).message}`, hash };
  }

  // Revocation (defense-in-depth, mirrors verifyAttestation): a validly-signed manifest from a REVOKED
  // signing key is refused. Fail-closed: a throwing check is itself a denial.
  if (policy.signerKeyId !== undefined && policy.revocationCheck !== undefined) {
    let revoked: boolean;
    try {
      revoked = policy.revocationCheck(policy.signerKeyId) === true;
    } catch (e) {
      return { ok: false, reason: `revocation status for keyId '${policy.signerKeyId}' could not be determined (${(e as Error).message}) — fail-closed`, hash };
    }
    if (revoked) return { ok: false, reason: `signing key '${policy.signerKeyId}' is REVOKED`, hash };
  }

  // Hybrid ML-DSA-65 half (no PQ downgrade) when the policy demands it.
  if (policy.requireHybrid === true || policy.mlDsaPublicKey !== undefined) {
    if (!policy.mlDsaPublicKey) return { ok: false, reason: "requireHybrid set but policy has no mlDsaPublicKey", hash };
    if (!signed.mlDsaSignature) return { ok: false, reason: "ML-DSA manifest signature required but absent (hybrid)", hash };
    try {
      const { ml_dsa65 } = await import("@noble/post-quantum/ml-dsa.js") as {
        ml_dsa65: { verify(s: Uint8Array, m: Uint8Array, pk: Uint8Array, opts?: { context?: Uint8Array }): boolean };
      };
      const ok = ml_dsa65.verify(
        Buffer.from(signed.mlDsaSignature, "base64"),
        Buffer.from(canonicalPluginManifestString(m), "utf8"),
        policy.mlDsaPublicKey,
        { context: PLUGIN_MLDSA_CONTEXT },
      );
      if (!ok) return { ok: false, reason: "ML-DSA manifest verification failed", hash };
    } catch (e) {
      return { ok: false, reason: `ML-DSA manifest check error: ${(e as Error).message}`, hash };
    }
  }

  return { ok: true, hash };
}
