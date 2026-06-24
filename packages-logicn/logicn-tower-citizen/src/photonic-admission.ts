/**
 * photonic-admission.ts — T-as-signed-artifact admission rail (R&D 0108 #3, EMERGENT).
 *
 * TritMesh R&D net-new mechanic #3 (owner-approved 2026-06-23). The shipped Freivalds check
 * (hybrid-engine.ts) verifies the RESULT of a photonic matmul, but NOTHING admits T — the
 * transformation matrix / mesh-config blob that REPROGRAMS the photonic processor — as signed
 * code. A hot weight/config swap is therefore an unsigned code path: an attacker who can write
 * the reprogram blob changes what the mesh computes, and result-verification alone cannot tell.
 *
 * This is the governance RAIL: admit the config blob (T) as a SIGNED ARTIFACT BEFORE the PPU
 * reprograms, with the same fail-closed 4-gate discipline the .wasm fuse border uses, but for a
 * `photonic.reprogram` artifact class:
 *   1. HASH-PIN     — sha256(blob) MUST equal the signed manifest's configSha256 (binds T's bytes).
 *   2. SIGNATURE    — Ed25519 over the canonical manifest verifies against the deployment key.
 *   3. REVOCATION   — the signer key is not revoked (registry-backed, fail-closed on a throw).
 *   4. CAPABILITY   — the manifest declares `photonic.reprogram` AND the caller was granted it
 *                     (deny-by-default — an undeclared/ungranted reprogram has no admission).
 * Any failure collapses (decideAtBoundary) to DENY; "no attestation" is INDETERMINATE
 * (undischarged → LLN-GOV-3VL-001). The PPU reprogram seam (e.g. a PhotonicOffloadPort) MUST
 * call this first and reprogram ONLY if `admitted`.
 *
 * Invariants: crypto stays BINARY (this rail runs in the core; sha256/Ed25519 are bit-exact);
 * the photonic APPLY downstream is degrade-only and HW-gated (#102-106) — admitting T here does
 * NOT trust the analog substrate, it only proves T is the AUTHORIZED matrix. T's bytes are
 * never routed through analog hardware to be "verified".
 */

import { createHash, sign as edSign, verify as edVerify, createPrivateKey, createPublicKey, generateKeyPairSync } from "node:crypto";
import {
  Verdict,
  decideAtBoundary,
  type BoundaryDecision,
  type GovernanceDiagnostic,
} from "./three-valued-governance.js";

/** The capability a config blob MUST declare — and the caller MUST hold — to reprogram a mesh. */
export const PHOTONIC_REPROGRAM_CAP = "photonic.reprogram" as const;

/** The signed descriptor that binds a photonic-config blob (the matrix T) to a capability + signer. */
export interface PhotonicConfigManifest {
  readonly schemaVersion: "logicn.photonic-config.v1";
  readonly name: string;
  /** `sha256:<hex>` of the config blob bytes — pins this manifest to the exact T. */
  readonly configSha256: string;
  /** The capability the blob requires; MUST be PHOTONIC_REPROGRAM_CAP (deny-by-default otherwise). */
  readonly capability: typeof PHOTONIC_REPROGRAM_CAP;
  /** The mesh/lane seam this config targets (free-form, audited). */
  readonly seam: string;
  /** The signer key id — paired with a revocationCheck so a valid sig from a revoked key is refused. */
  readonly signerKeyId?: string;
}

/** A signed photonic-config descriptor (manifest + Ed25519 signature over its canonical form). */
export interface PhotonicConfigAttestation {
  readonly manifest: PhotonicConfigManifest;
  readonly signature: string; // base64 Ed25519 over canonical(manifest)
}

/** Deterministic JSON pre-image: keys sorted, `undefined` dropped, signature excluded. */
function canonical(m: PhotonicConfigManifest): string {
  const entries = Object.entries(m).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify(Object.fromEntries(entries));
}

/** `sha256:<hex>` of a config blob's bytes — the value pinned in the manifest. */
export function photonicConfigHash(blob: Uint8Array): string {
  return "sha256:" + createHash("sha256").update(blob).digest("hex");
}

/** Sign a photonic-config manifest with an Ed25519 private key (PEM PKCS8). */
export function signPhotonicConfig(manifest: PhotonicConfigManifest, privateKeyPem: string): PhotonicConfigAttestation {
  const sig = edSign(null, Buffer.from(canonical(manifest), "utf8"), createPrivateKey(privateKeyPem));
  return { manifest, signature: sig.toString("base64") };
}

/** Generate an Ed25519 keypair for signing photonic-config blobs offline (public key pinned in policy). */
export function generatePhotonicConfigKeypair(): { publicKeyPem: string; privateKeyPem: string } {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return {
    publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
    privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
  };
}

export interface PhotonicAdmissionPolicy {
  /** PEM SPKI public key used to verify the manifest signature. Required. */
  readonly publicKeyPem: string;
  /** Capabilities granted to the CALLER. `photonic.reprogram` must be present (deny-by-default). */
  readonly grantedCapabilities: readonly string[];
  /** The keyId pinned for this deployment — paired with revocationCheck. */
  readonly signerKeyId?: string;
  /** Registry-backed revocation predicate (host-injected). A throw is treated as a denial. */
  readonly revocationCheck?: (keyId: string) => boolean;
  /** Optional pin set — admit only blobs whose hash is allow-listed. */
  readonly allowedHashes?: readonly string[];
}

export interface PhotonicAdmission {
  readonly decision: BoundaryDecision;
  /** True IFF all four gates passed (== decision.authorized). The PPU reprograms ONLY when true. */
  readonly admitted: boolean;
  /** Audit reason (admitted, or the first gate that denied). */
  readonly reason: string;
  /** The computed `sha256:<hex>` of the blob (audit), or "" if not reached. */
  readonly configHash: string;
}

/**
 * Admit a photonic-config blob (T) as a signed artifact, fail-closed. The PPU reprogram seam
 * MUST call this BEFORE applying T and proceed only if `admitted`. See file header for the 4 gates.
 */
export function admitPhotonicConfig(
  blob: Uint8Array,
  attestation: PhotonicConfigAttestation | undefined,
  policy: PhotonicAdmissionPolicy,
  onDiagnostic?: (d: GovernanceDiagnostic) => void,
): PhotonicAdmission {
  const at = (v: Verdict, reason: string, configHash = ""): PhotonicAdmission => {
    const decision = decideAtBoundary(v, onDiagnostic);
    return { decision, admitted: decision.authorized, reason, configHash };
  };

  if (!attestation) return at(Verdict.INDETERMINATE, "no attestation provided (undischarged)");
  const m = attestation.manifest;
  if (
    !m || m.schemaVersion !== "logicn.photonic-config.v1" ||
    typeof m.configSha256 !== "string" || typeof m.name !== "string" || typeof m.capability !== "string"
  ) {
    return at(Verdict.DENY, "malformed photonic-config manifest");
  }

  // 1. HASH-PIN — bind the manifest to the exact T bytes.
  const configHash = photonicConfigHash(blob);
  if (configHash !== m.configSha256) {
    return at(Verdict.DENY, `config hash mismatch: ${configHash} != ${m.configSha256} (tamper)`, configHash);
  }
  if (policy.allowedHashes && policy.allowedHashes.length > 0 && !policy.allowedHashes.includes(configHash)) {
    return at(Verdict.DENY, `config hash not pinned: ${configHash}`, configHash);
  }

  // 2. SIGNATURE — Ed25519 over the canonical manifest.
  if (!attestation.signature) return at(Verdict.DENY, "signature required but absent", configHash);
  if (!policy.publicKeyPem) return at(Verdict.DENY, "no public key configured to verify signature", configHash);
  try {
    const ok = edVerify(
      null,
      Buffer.from(canonical(m), "utf8"),
      createPublicKey(policy.publicKeyPem),
      Buffer.from(attestation.signature, "base64"),
    );
    if (!ok) return at(Verdict.DENY, "signature verification failed", configHash);
  } catch (e) {
    return at(Verdict.DENY, `signature check error: ${(e as Error).message}`, configHash);
  }

  // 3. REVOCATION — a valid signature from a revoked key is refused (fail-closed on a throw).
  if (m.signerKeyId !== undefined && policy.revocationCheck !== undefined) {
    let revoked: boolean;
    try {
      revoked = policy.revocationCheck(m.signerKeyId) === true;
    } catch (e) {
      return at(Verdict.DENY, `revocation status for keyId '${m.signerKeyId}' could not be determined (${(e as Error).message}) — fail-closed`, configHash);
    }
    if (revoked) return at(Verdict.DENY, `signing key '${m.signerKeyId}' is REVOKED`, configHash);
  }

  // 4. CAPABILITY — deny-by-default: declared AND granted.
  if (m.capability !== PHOTONIC_REPROGRAM_CAP) {
    return at(Verdict.DENY, `manifest capability '${m.capability}' is not '${PHOTONIC_REPROGRAM_CAP}'`, configHash);
  }
  if (!policy.grantedCapabilities.includes(PHOTONIC_REPROGRAM_CAP)) {
    return at(Verdict.DENY, `'${PHOTONIC_REPROGRAM_CAP}' capability not granted to the caller`, configHash);
  }

  return at(Verdict.ALLOW, "admitted", configHash);
}
