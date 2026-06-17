/**
 * governance/revocation-registry.mjs — enforced signing-key revocation (Gap B).
 *
 * Zero-trust: a revoked signing-key id must evaluate to Deny even if it can still
 * produce a cryptographically valid signature. The verify / admission gates consult
 * this BEFORE trusting any signature (the v(k) mandate —
 * docs/Knowledge-Bases/logicn-key-custody-and-rotation.md §3).
 *
 * Source of truth: governance/revocations.json (append-only). Human mirror:
 * security/revocations/REV-*.md.
 *
 * v1 adds TAMPER-EVIDENCE: the registry may carry its own Ed25519 `signature`
 * (signed by the active key). A gate calls assertRegistryTrustworthy() and FAILS
 * CLOSED if the registry is signed-but-invalid (someone edited it without
 * re-signing) or is signed by a revoked key. An UNSIGNED registry is still
 * enforced but flagged (graceful v0→v1 transition until the owner runs
 * governance/sign-revocations.mjs). HARDENING TODO (v2): pin a specific
 * trust-anchor key id rather than accepting any present non-revoked signer.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  sign as edSign,
  verify as edVerify,
  createPrivateKey,
  createPublicKey,
} from "node:crypto";

function registryPath(rootDir) {
  return join(rootDir, "governance", "revocations.json");
}

/** Load + structurally validate the registry object. Missing → null; malformed → throws. */
export function loadRegistry(rootDir = ".") {
  const path = registryPath(rootDir);
  if (!existsSync(path)) return null;
  const data = JSON.parse(readFileSync(path, "utf-8"));
  if (!Array.isArray(data.revoked)) {
    throw new Error("revocations.json: missing or invalid 'revoked' array");
  }
  return data;
}

/** The set of revoked signing-key ids. Missing registry → empty set; malformed → throws. */
export function loadRevokedKeyIds(rootDir = ".") {
  const data = loadRegistry(rootDir);
  if (data === null) return new Set();
  return new Set(
    data.revoked
      .map((e) => (e && typeof e.keyId === "string" ? e.keyId : null))
      .filter((k) => k !== null)
  );
}

/** True if the given signing-key id is revoked (→ Deny). */
export function isKeyRevoked(keyId, rootDir = ".") {
  return loadRevokedKeyIds(rootDir).has(keyId);
}

// ---------------------------------------------------------------------------
// Tamper-evidence (self-signature)
// ---------------------------------------------------------------------------

/** Canonical bytes that are signed: the registry object with `signature` removed. */
function canonical(obj) {
  const base = { ...obj };
  delete base.signature;
  return JSON.stringify(base, null, 2);
}

/** Sign a registry OBJECT with an Ed25519 private key → returns a new object carrying `.signature`. */
export function signRegistryObject(obj, privateKeyPem, keyId) {
  const value = edSign(
    null,
    Buffer.from(canonical(obj), "utf-8"),
    createPrivateKey(privateKeyPem)
  ).toString("base64");
  const base = { ...obj };
  delete base.signature;
  return { ...base, signature: { keyId, algorithm: "ed25519", value } };
}

/** Verify a registry OBJECT's self-signature against a public key (pure). */
export function verifyRegistryObject(obj, pubKeyPem) {
  const sig = obj && obj.signature;
  if (typeof sig !== "object" || sig === null) {
    return { signed: false, valid: false, keyId: null };
  }
  if (sig.algorithm !== "ed25519" || typeof sig.value !== "string" || typeof sig.keyId !== "string") {
    return { signed: true, valid: false, keyId: sig.keyId ?? null };
  }
  const valid = edVerify(
    null,
    Buffer.from(canonical(obj), "utf-8"),
    createPublicKey(pubKeyPem),
    Buffer.from(sig.value, "base64")
  );
  return { signed: true, valid, keyId: sig.keyId };
}

function loadPubKey(rootDir, keyId) {
  const p = join(rootDir, "governance", `signing-key-${keyId}.pub.pem`);
  return existsSync(p) ? readFileSync(p, "utf-8") : null;
}

/**
 * Trust check for a gate. Returns { signed, valid, present }.
 *   - missing registry   → { present:false, signed:false } (no revocations)
 *   - unsigned registry  → { present:true, signed:false } (caller SHOULD warn; still enforce)
 *   - signed & valid     → { signed:true, valid:true }
 *   - signed & INVALID / signer-key-not-found / signer-key-revoked → THROWS (fail closed)
 */
export function assertRegistryTrustworthy(rootDir = ".") {
  const data = loadRegistry(rootDir);
  if (data === null) return { present: false, signed: false, valid: false };
  if (!data.signature) return { present: true, signed: false, valid: false };

  const keyId = data.signature.keyId;
  // A revoked key cannot authorize the revocation registry itself.
  const revoked = new Set(
    data.revoked.map((e) => (e && typeof e.keyId === "string" ? e.keyId : null)).filter(Boolean)
  );
  if (typeof keyId === "string" && revoked.has(keyId)) {
    throw new Error(`revocation registry is signed by a REVOKED key (${keyId})`);
  }
  const pubPem = loadPubKey(rootDir, keyId);
  if (pubPem === null) {
    throw new Error(`revocation registry signer public key not found: signing-key-${keyId}.pub.pem`);
  }
  const res = verifyRegistryObject(data, pubPem);
  if (!res.valid) {
    throw new Error(`revocation registry signature INVALID (tampered, or wrong key) — keyId ${keyId}`);
  }
  return { present: true, signed: true, valid: true, keyId };
}
