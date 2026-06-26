/**
 * substrate-erasure.ts — SPORE-RETAIN-001 sound-erasure admission gate (R&D 0116 / 0118).
 *
 * R&D 0116 found a silent fail-open: Galerina's secret-erasure is OVERWRITE-based (zero the arena
 * page / derived-secret buffer; B2/B2b in wat-emitter.ts). That is silently FALSE on write-once /
 * fixed media — a thermally-fixed photorefractive hologram cannot be erased optically (>170 °C
 * re-heat only), WORM glass is physically immutable, and unfixed holograms leave residual gratings
 * (data remanence). NIST SP 800-88 Rev. 1 names cryptographic-erase = the "Purge" technique for
 * exactly such media: seal before write, keep the DEK on overwritable silicon, "delete" = destroy
 * the key.
 *
 * This is the RUNTIME DEFENSE (stage 2) of the SPORE-RETAIN-001 Hardware Protection Directive — the
 * Substrate Dispatch Gateway's fail-closed K3 admission check on every write to a governed substrate.
 *
 * ZERO-TRUST DISCOVERY RULE (the crux): an eraseModel is NEVER taken from a drive's self-report.
 * `overwrite` (the permissive model) is granted ONLY by a verified SIGNED attestation carrying the
 * `storage.admit` capability (the admitPhotonicConfig-style rail). An unknown / unattested / merely
 * self-claimed substrate FAILS CLOSED TO THE STRICTER MODEL (`crypto-only`) — so a WORM drive that
 * lies "overwrite" is denied because the lie is not signed. Deny-by-default.
 *
 * Invariant: crypto stays BINARY (this gate runs in the core). The decision is a pure K3 verdict;
 * the actual hardware dispatch + the signed-attestation verification (reusing photonic-admission's
 * hash-pin + Ed25519 + revocation) wire in when a real storage-admission path lands (HW-gated,
 * #102-106). The OBLIGATION is enforced now so it cannot be silently violated.
 */

import { sign as edSign, verify as edVerify, createPrivateKey, createPublicKey, generateKeyPairSync } from "node:crypto";
import {
  Verdict,
  decideAtBoundary,
  type BoundaryDecision,
  type GovernanceDiagnostic,
} from "./three-valued-governance.js";

/** The capability a substrate descriptor MUST declare — and the admitter MUST hold — to mount storage. */
export const STORAGE_ADMIT_CAP = "storage.admit" as const;

/** The two erasure physics classes. `overwrite` = the data can be zeroed in place; `crypto-only` = it cannot. */
export type EraseModel = "overwrite" | "crypto-only";

/** A governed storage substrate. `claimedEraseModel` is an UNTRUSTED hint unless `attested` is true. */
export interface SubstrateDescriptor {
  /** Free-form id for audit (drive serial, mount point, mesh seam). */
  readonly id?: string;
  /** The eraseModel the substrate CLAIMS. Treated as an untrusted hint unless `attested === true`. */
  readonly claimedEraseModel?: EraseModel;
  /**
   * True IFF `claimedEraseModel` is backed by a VERIFIED signed attestation (hash-pinned + Ed25519
   * + non-revoked, carrying `storage.admit`). A self-reported boot value is NOT an attestation.
   */
  readonly attested?: boolean;
}

/** A value about to be written to a substrate. */
export interface WritePayload {
  /** True IFF the value is — or derives from — a secret (SealTaint; SPORE-SECRET-002 / SPORE-PRIVACY-002). */
  readonly isSecretTainted: boolean;
  /** True IFF the value is KEM-DEM ciphertext (sealed) — erasable by destroying its DEK. */
  readonly isSealed: boolean;
}

export interface SubstrateWriteAdmission {
  readonly decision: BoundaryDecision;
  /** True IFF the write is admitted (== decision.authorized). The gateway routes ONLY when true. */
  readonly admitted: boolean;
  /** The eraseModel actually enforced (after the fail-closed-to-stricter resolution). */
  readonly effectiveEraseModel: EraseModel;
  /** Audit reason. */
  readonly reason: string;
}

/**
 * Fail-closed-to-stricter resolution: `overwrite` is honoured ONLY when a verified attestation
 * vouches it; every other case (unknown, unattested, self-claimed, or claimed `crypto-only`)
 * resolves to `crypto-only`. This is the zero-trust core: a lying drive cannot downgrade itself.
 */
export function effectiveEraseModel(s: SubstrateDescriptor | undefined): EraseModel {
  return s?.attested === true && s.claimedEraseModel === "overwrite" ? "overwrite" : "crypto-only";
}

/**
 * The Substrate Dispatch Gateway's K3 admission check (SPORE-RETAIN-001). Fail-closed, deny-by-default.
 * The hardware dispatch seam MUST call this BEFORE writing and route ONLY if `admitted`.
 *
 * Truth table (effectiveEraseModel × payload):
 *   overwrite                              → ALLOW  (overwrite-erase is sound; the retain gate passes)
 *   crypto-only · ¬secret                  → ALLOW  (public data carries no erasure obligation)
 *   crypto-only · secret · sealed          → ALLOW  (KEM-DEM ciphertext — crypto-erasable by DEK destruction)
 *   crypto-only · secret · ¬sealed         → DENY   (cleartext secret is UNERASABLE here — SPORE-RETAIN-001)
 * A malformed/absent payload is treated as a secret (fail-closed): unknown taint ⇒ assume secret.
 */
export function admitSubstrateWrite(
  payload: WritePayload | undefined,
  substrate: SubstrateDescriptor | undefined,
  onDiagnostic?: (d: GovernanceDiagnostic) => void,
): SubstrateWriteAdmission {
  const model = effectiveEraseModel(substrate);
  const at = (v: Verdict, reason: string): SubstrateWriteAdmission => {
    const decision = decideAtBoundary(v, onDiagnostic);
    return { decision, admitted: decision.authorized, effectiveEraseModel: model, reason };
  };

  // Overwrite media (attested): overwrite-erasure is sound, so the RETAIN obligation is discharged.
  // (Other rules — SPORE-SECRET sink discipline — still apply elsewhere; this gate is erasure-only.)
  if (model === "overwrite") return at(Verdict.ALLOW, "attested overwrite-erasable substrate — RETAIN obligation N/A");

  // Crypto-only media. Fail-closed on a malformed payload: unknown taint ⇒ assume secret.
  const tainted = payload?.isSecretTainted !== false; // anything not explicitly non-secret is treated as secret
  const sealed = payload?.isSealed === true;

  if (!tainted) return at(Verdict.ALLOW, "non-secret payload — no erasure obligation on crypto-only media");
  if (sealed) return at(Verdict.ALLOW, "secret is KEM-DEM-sealed — crypto-erasable by DEK destruction (SPORE-RETAIN-001)");
  return at(
    Verdict.DENY,
    "SPORE-RETAIN-001: cleartext secret to a crypto-only substrate is UNERASABLE (overwrite-erase impossible) — seal with KEM-DEM before write; deletion = destroy the DEK + mint a crypto-erase witness",
  );
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// The SIGNED eraseModel attestation rail (R&D 0118 §2 — the discovery answer).
//
// An eraseModel is NEVER taken from a drive's self-report. `overwrite` (the permissive model) is an
// EARNED, SIGNED, REVOCABLE exception: it is honoured only when a manifest carrying the substrate's
// eraseModel is Ed25519-signed by a non-revoked deployment key AND declares (and the admitter holds)
// the `storage.admit` capability. Any failure — no attestation, bad signature, revoked key, wrong
// capability — yields a descriptor with `attested: false`, which `effectiveEraseModel` resolves to
// the stricter `crypto-only`. So a WORM drive that lies "overwrite" cannot produce a valid signature
// and is denied. (Mirrors photonic-admission.ts's 4-gate discipline for the storage capability axis;
// the shared verify helper is a future dedup — kept separate here to avoid touching the shipped rail.)
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** A signed descriptor binding a storage substrate's id to its eraseModel + a signer. */
export interface SubstrateAttestationManifest {
  readonly schemaVersion: "galerina.substrate-config.v1";
  /** Stable substrate id (drive serial / mount / mesh seam) — inside the signed blob, so id-spoof breaks the sig. */
  readonly id: string;
  /** The erasure physics the signer vouches for. `overwrite` is the earned exception. */
  readonly eraseModel: EraseModel;
  /** MUST be STORAGE_ADMIT_CAP (deny-by-default otherwise — a photonic.reprogram key cannot mount storage). */
  readonly capability: typeof STORAGE_ADMIT_CAP;
  /** Signer key id — paired with a revocationCheck so a valid sig from a revoked key is refused. */
  readonly signerKeyId?: string;
}

/** A signed substrate attestation (manifest + Ed25519 signature over its canonical form). */
export interface SubstrateAttestation {
  readonly manifest: SubstrateAttestationManifest;
  readonly signature: string; // base64 Ed25519 over canonical(manifest)
}

export interface SubstrateAdmissionPolicy {
  /** PEM SPKI public key used to verify the manifest signature. Required. */
  readonly publicKeyPem: string;
  /** Capabilities granted to the admitter. `storage.admit` must be present (deny-by-default). */
  readonly grantedCapabilities: readonly string[];
  /** Registry-backed revocation predicate (host-injected). A throw is treated as a denial. */
  readonly revocationCheck?: (keyId: string) => boolean;
}

export interface StorageSubstrateAdmission {
  readonly decision: BoundaryDecision;
  /** The descriptor to feed `admitSubstrateWrite` — `attested` is true IFF all gates passed. */
  readonly descriptor: SubstrateDescriptor;
  /** Audit reason (admitted, or the first gate that denied → falls back to crypto-only). */
  readonly reason: string;
}

/** Deterministic JSON pre-image: keys sorted, `undefined` dropped, signature excluded. */
function canonicalSubstrate(m: SubstrateAttestationManifest): string {
  const entries = Object.entries(m).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify(Object.fromEntries(entries));
}

/** Sign a substrate attestation manifest with an Ed25519 private key (PEM PKCS8). */
export function signSubstrateAttestation(manifest: SubstrateAttestationManifest, privateKeyPem: string): SubstrateAttestation {
  const sig = edSign(null, Buffer.from(canonicalSubstrate(manifest), "utf8"), createPrivateKey(privateKeyPem));
  return { manifest, signature: sig.toString("base64") };
}

/** Generate an Ed25519 keypair for signing substrate attestations offline (public key pinned in policy). */
export function generateSubstrateKeypair(): { publicKeyPem: string; privateKeyPem: string } {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return {
    publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
    privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
  };
}

/**
 * Resolve a substrate's TRUSTED eraseModel from a signed attestation, fail-closed. The returned
 * descriptor feeds `admitSubstrateWrite`. `attested` is true ONLY when the signature verifies, the
 * key is not revoked, and the `storage.admit` capability is declared AND granted — otherwise the
 * descriptor falls back to an unattested `crypto-only` (the stricter default). Deny-by-default.
 */
export function admitStorageSubstrate(
  attestation: SubstrateAttestation | undefined,
  policy: SubstrateAdmissionPolicy,
  onDiagnostic?: (d: GovernanceDiagnostic) => void,
): StorageSubstrateAdmission {
  // Any non-ALLOW path yields an UNATTESTED descriptor → effectiveEraseModel = crypto-only (stricter).
  const reject = (v: Verdict, reason: string, id?: string): StorageSubstrateAdmission => ({
    decision: decideAtBoundary(v, onDiagnostic),
    // unattested → crypto-only by effectiveEraseModel. Omit `id` when absent (exactOptionalPropertyTypes).
    descriptor: id === undefined ? { attested: false } : { id, attested: false },
    reason,
  });

  if (!attestation) return reject(Verdict.INDETERMINATE, "no substrate attestation — default to crypto-only (undischarged)");
  const m = attestation.manifest;
  if (
    !m || m.schemaVersion !== "galerina.substrate-config.v1" ||
    typeof m.id !== "string" || typeof m.capability !== "string" ||
    (m.eraseModel !== "overwrite" && m.eraseModel !== "crypto-only")
  ) {
    return reject(Verdict.DENY, "malformed substrate attestation manifest");
  }

  // 1. SIGNATURE — Ed25519 over the canonical manifest (id is inside the signed blob → id-spoof breaks it).
  if (!attestation.signature) return reject(Verdict.DENY, "signature required but absent", m.id);
  if (!policy.publicKeyPem) return reject(Verdict.DENY, "no public key configured to verify signature", m.id);
  try {
    const ok = edVerify(
      null,
      Buffer.from(canonicalSubstrate(m), "utf8"),
      createPublicKey(policy.publicKeyPem),
      Buffer.from(attestation.signature, "base64"),
    );
    if (!ok) return reject(Verdict.DENY, "signature verification failed", m.id);
  } catch (e) {
    return reject(Verdict.DENY, `signature check error: ${(e as Error).message}`, m.id);
  }

  // 2. REVOCATION — a valid signature from a revoked key is refused (fail-closed on a throw).
  if (m.signerKeyId !== undefined && policy.revocationCheck !== undefined) {
    let revoked: boolean;
    try {
      revoked = policy.revocationCheck(m.signerKeyId) === true;
    } catch (e) {
      return reject(Verdict.DENY, `revocation status for '${m.signerKeyId}' undeterminable (${(e as Error).message}) — fail-closed`, m.id);
    }
    if (revoked) return reject(Verdict.DENY, `signing key '${m.signerKeyId}' is REVOKED`, m.id);
  }

  // 3. CAPABILITY — deny-by-default: declared AND granted (a photonic.reprogram key cannot mount storage).
  if (m.capability !== STORAGE_ADMIT_CAP) {
    return reject(Verdict.DENY, `manifest capability '${m.capability}' is not '${STORAGE_ADMIT_CAP}'`, m.id);
  }
  if (!policy.grantedCapabilities.includes(STORAGE_ADMIT_CAP)) {
    return reject(Verdict.DENY, `'${STORAGE_ADMIT_CAP}' capability not granted to the admitter`, m.id);
  }

  // All gates passed → the eraseModel is now TRUSTED (attested). `overwrite` is the earned exception.
  return {
    decision: decideAtBoundary(Verdict.ALLOW, onDiagnostic),
    descriptor: { id: m.id, claimedEraseModel: m.eraseModel, attested: true },
    reason: `attested eraseModel='${m.eraseModel}' for substrate '${m.id}'`,
  };
}
