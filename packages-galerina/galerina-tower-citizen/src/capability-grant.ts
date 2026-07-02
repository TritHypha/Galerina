/**
 * capability-grant.ts — RD-0236 #1: bind the engine's capability mask to a SIGNED grant.
 *
 * The granted V_DPM capability mask used to be a plain constructor scalar. Making it a JS
 * `#private` field (the first #1 fix) stops a runtime FORGE (`engine.grantedCapabilityMask = …`
 * is inert), but a caller could still CONSTRUCT an engine with `0xFFFFFFFF` and self-grant
 * authority — the mask was still trusted input. This closes that: an engine only holds the
 * capabilities asserted by a grant that cryptographically VERIFIES against its attestation
 * policy. Absent / invalid ⇒ no authority (mask 0), fail-secure.
 *
 * Construction mirrors bridge-attestation.ts: Ed25519 (+ optional ML-DSA-65, no PQ downgrade)
 * over the canonical grant pre-image — but under a DISTINCT FIPS-204 domain-separation context
 * (`galerina.capability.grant.v1`) so a bridge-manifest signature can NEVER be cross-protocol
 * replayed as a capability grant, and vice versa.
 */

import { createHash, sign as edSign, verify as edVerify, createPrivateKey, createPublicKey } from "node:crypto";
import type { AttestationPolicy, AttestationResult } from "./bridge-attestation.js";

export interface CapabilityGrant {
  /** The engine identity this grant authorizes — must equal the engine's own id, so a grant
   *  minted for engine A cannot admit authority on engine B. */
  readonly engineId: string;
  /** The V_DPM capability bitmask this grant confers (unsigned 32-bit). */
  readonly capabilityMask: number;
  /** Optional issuance id / nonce — binds the grant and gives a revocation/freshness handle. */
  readonly grantId?: string;
}

export interface SignedCapabilityGrant {
  readonly grant: CapabilityGrant;
  readonly signature?: string;        // Ed25519 over canonicalGrantString, base64
  readonly mlDsaSignature?: string;   // ML-DSA-65, base64 (hybrid — no PQ downgrade)
}

/** FIPS-204 domain-separation context for the capability-grant signing surface (distinct from
 *  the bridge-manifest context so signatures can never be cross-protocol-confused). */
const CAP_MLDSA_CONTEXT = new TextEncoder().encode("galerina.capability.grant.v1");

/** Canonical, deterministic signing/hashing pre-image (fixed field order; mask normalised to
 *  an unsigned 32-bit int so `-1` and `0xFFFFFFFF` cannot serialise to different strings). */
export function canonicalGrantString(g: CapabilityGrant): string {
  return JSON.stringify({ engineId: g.engineId, capabilityMask: g.capabilityMask >>> 0, grantId: g.grantId ?? null });
}

/** sha256 hex of the canonical grant pre-image. */
export function capabilityGrantHash(g: CapabilityGrant): string {
  return createHash("sha256").update(canonicalGrantString(g), "utf8").digest("hex");
}

/** Sign a capability grant with an Ed25519 private key (PEM PKCS8). */
export function signCapabilityGrant(grant: CapabilityGrant, privateKeyPem: string): SignedCapabilityGrant {
  const sig = edSign(null, Buffer.from(canonicalGrantString(grant), "utf8"), createPrivateKey(privateKeyPem));
  return { grant, signature: sig.toString("base64") };
}

/** Hybrid sign (Ed25519 + ML-DSA-65) — both signatures over the canonical grant pre-image. */
export async function signCapabilityGrantHybrid(
  grant: CapabilityGrant,
  privateKeyPem: string,
  mlDsaPrivateKey: Uint8Array,
): Promise<SignedCapabilityGrant> {
  const msg = Buffer.from(canonicalGrantString(grant), "utf8");
  const edSig = edSign(null, msg, createPrivateKey(privateKeyPem));
  const { ml_dsa65 } = await import("@noble/post-quantum/ml-dsa.js") as {
    ml_dsa65: { sign(m: Uint8Array, sk: Uint8Array, opts?: { context?: Uint8Array }): Uint8Array };
  };
  const mlSig = ml_dsa65.sign(msg, mlDsaPrivateKey, { context: CAP_MLDSA_CONTEXT });
  return { grant, signature: edSig.toString("base64"), mlDsaSignature: Buffer.from(mlSig).toString("base64") };
}

/**
 * Verify a signed capability grant against an attestation policy, for a specific engineId.
 * Fails CLOSED — a missing grant, an engineId mismatch, a malformed mask, an absent/bad
 * signature, a revoked signer, or (in hybrid mode) an absent/bad ML-DSA half all return
 * `{ ok: false }`. When `policy.requireHybrid` or `policy.mlDsaPublicKey` is set the ML-DSA
 * signature is REQUIRED and verified (no PQ downgrade), mirroring verifyAttestationHybrid.
 */
export async function verifyCapabilityGrant(
  signed: SignedCapabilityGrant | undefined,
  policy: AttestationPolicy,
  expectedEngineId: string,
): Promise<AttestationResult> {
  if (!signed || !signed.grant) return { ok: false, reason: "no capability grant provided" };
  const g = signed.grant;
  const hash = capabilityGrantHash(g);

  if (typeof g.engineId !== "string" || g.engineId !== expectedEngineId) {
    return { ok: false, reason: `grant engineId mismatch (grant='${g.engineId}', expected='${expectedEngineId}')`, hash };
  }
  if (!Number.isInteger(g.capabilityMask) || g.capabilityMask < 0 || g.capabilityMask > 0xffffffff) {
    return { ok: false, reason: "grant capabilityMask must be an unsigned 32-bit integer", hash };
  }

  // Ed25519 — a grant IS authority, so a signature is always required (there is no "unsigned grant").
  if (!signed.signature) return { ok: false, reason: "grant signature required but absent", hash };
  if (!policy.publicKeyPem) return { ok: false, reason: "no public key configured to verify the grant", hash };
  try {
    const ok = edVerify(
      null,
      Buffer.from(canonicalGrantString(g), "utf8"),
      createPublicKey(policy.publicKeyPem),
      Buffer.from(signed.signature, "base64"),
    );
    if (!ok) return { ok: false, reason: "grant signature verification failed", hash };
  } catch (e) {
    return { ok: false, reason: `grant signature check error: ${(e as Error).message}`, hash };
  }

  // Revocation (defense-in-depth, mirrors verifyAttestation): a validly-signed grant from a
  // REVOKED signing key is refused. Fail-closed: a throwing check is itself a denial.
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
    if (!signed.mlDsaSignature) return { ok: false, reason: "ML-DSA grant signature required but absent (hybrid)", hash };
    try {
      const { ml_dsa65 } = await import("@noble/post-quantum/ml-dsa.js") as {
        ml_dsa65: { verify(s: Uint8Array, m: Uint8Array, pk: Uint8Array, opts?: { context?: Uint8Array }): boolean };
      };
      const ok = ml_dsa65.verify(
        Buffer.from(signed.mlDsaSignature, "base64"),
        Buffer.from(canonicalGrantString(g), "utf8"),
        policy.mlDsaPublicKey,
        { context: CAP_MLDSA_CONTEXT },
      );
      if (!ok) return { ok: false, reason: "ML-DSA grant verification failed", hash };
    } catch (e) {
      return { ok: false, reason: `ML-DSA grant check error: ${(e as Error).message}`, hash };
    }
  }

  return { ok: true, hash };
}
