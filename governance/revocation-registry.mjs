/**
 * governance/revocation-registry.mjs — enforced signing-key revocation (Gap B).
 *
 * Zero-trust: a revoked signing-key id must evaluate to Deny even if it can still
 * produce a cryptographically valid signature. The verify / admission gates consult
 * this BEFORE trusting any signature (the v(k) mandate —
 * ../ZTF-Knowledge-Bases/galerina-key-custody-and-rotation.md §3).
 *
 * Source of truth: governance/revocations.json (append-only). Human mirror:
 * security/revocations/REV-*.md.
 *
 * v1 adds TAMPER-EVIDENCE: the registry may carry its own Ed25519 `signature`
 * (signed by the active key). A gate calls assertRegistryTrustworthy() and FAILS
 * CLOSED if the registry is signed-but-invalid (someone edited it without
 * re-signing) or is signed by a revoked key. An UNSIGNED registry is still
 * enforced but flagged (graceful v0→v1 transition until the owner runs
 * governance/sign-revocations.mjs).
 *
 * v2 adds TRUST-ANCHOR PINNING (IMPLEMENTED): loadTrustAnchor() reads a pinned
 * registry-signing root key id OUT OF BAND from governance/trust-anchor.json
 * (never from the registry itself), and assertRegistryTrustworthy() enforces it.
 * Under a pin it REQUIRES a signed registry, rejects any signer that is not the
 * pinned root (defeating the rogue not-yet-revoked-signer attack), rejects a
 * revoked signer, and rejects a tampered/invalid signature — all fail closed via
 * throw. Absent trust-anchor.json → legacy v1 behaviour (any present non-revoked
 * signer).
 *
 * HARDENING TODO (v3): the pin is a SINGLE static root key id — no rotation, and a
 * single point of failure. Add trust-anchor key ROTATION (overlapping old+new root
 * during cutover) and MULTI-ROOT / THRESHOLD (k-of-n) registry signing, so one
 * compromised or lost root key can neither strand nor forge the registry.
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

/** The set of revoked signing-key ids. Missing registry → empty set unless a pin is present (then throw). */
export function loadRevokedKeyIds(rootDir = ".") {
  const data = loadRegistry(rootDir);
  if (data === null) {
    const pin = loadTrustAnchor(rootDir);
    if (pin) {
      throw new Error(`revocation registry is MISSING, but trust anchor ${pin} is pinned — a pinned deployment requires a signed registry`);
    }
    return new Set();
  }
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
/**
 * The PINNED registry-signing root (v2 trust-anchor pinning, per revocation-registry-v0 §5).
 * Resolved out of band from governance/trust-anchor.json — NEVER from the registry itself
 * (a registry must not be able to name its own authorizing key). Absent → null (no pin,
 * legacy v1 "any present non-revoked signer"); malformed → throws (fail closed).
 */
function loadTrustAnchor(rootDir) {
  const p = join(rootDir, "governance", "trust-anchor.json");
  if (!existsSync(p)) return null;
  const d = JSON.parse(readFileSync(p, "utf-8")); // malformed → throws → caller fails closed
  if (typeof d.registrySigningRootKeyId !== "string" || d.registrySigningRootKeyId.length === 0) {
    throw new Error("trust-anchor.json: missing/invalid registrySigningRootKeyId");
  }
  return d.registrySigningRootKeyId;
}

function assertRegistryObjectTrustworthy(data, rootDir = ".") {
  const pin = loadTrustAnchor(rootDir); // throws if the anchor file is malformed
  if (data === null) {
    if (pin) {
      throw new Error(`revocation registry is MISSING, but trust anchor ${pin} is pinned — a pinned deployment requires a signed registry`);
    }
    return { present: false, signed: false, valid: false };
  }

  if (!data.signature) {
    // A pinned deployment REQUIRES a signed registry — an unsigned one is untrustworthy.
    if (pin) throw new Error(`revocation registry is UNSIGNED, but trust anchor ${pin} is pinned — a pinned deployment requires a signed registry`);
    return { present: true, signed: false, valid: false }; // no pin → legacy graceful-unsigned
  }

  const keyId = data.signature.keyId;
  // A revoked key cannot authorize the revocation registry itself.
  const revoked = new Set(
    data.revoked.map((e) => (e && typeof e.keyId === "string" ? e.keyId : null)).filter(Boolean)
  );
  if (typeof keyId === "string" && revoked.has(keyId)) {
    throw new Error(`revocation registry is signed by a REVOKED key (${keyId})`);
  }
  // v2 TRUST-ANCHOR PINNING: the signer MUST be the pinned root. Defeats the rogue-signer
  // attack (forge the registry, sign with a fresh not-yet-revoked key) — that key is not the pin.
  if (pin && keyId !== pin) {
    throw new Error(`revocation registry signed by ${keyId}, but the pinned trust anchor is ${pin} (rogue-signer rejected)`);
  }
  const pubPem = loadPubKey(rootDir, keyId);
  if (pubPem === null) {
    throw new Error(`revocation registry signer public key not found: signing-key-${keyId}.pub.pem`);
  }
  const res = verifyRegistryObject(data, pubPem);
  if (!res.valid) {
    throw new Error(`revocation registry signature INVALID (tampered, or wrong key) — keyId ${keyId}`);
  }
  return { present: true, signed: true, valid: true, keyId, pinned: pin !== null && keyId === pin };
}

export function assertRegistryTrustworthy(rootDir = ".") {
  return assertRegistryObjectTrustworthy(loadRegistry(rootDir), rootDir);
}

/**
 * Read, validate and pin one immutable production revocation snapshot.
 *
 * The file is read exactly once; the same in-memory object is structurally
 * checked and signature-verified, avoiding a verify-then-reread seam. Missing,
 * unsigned, unpinned, malformed, duplicate or non-append-only input throws.
 */
export function loadTrustedRevocationSnapshot(rootDir = ".") {
  const data = loadRegistry(rootDir);
  const trust = assertRegistryObjectTrustworthy(data, rootDir);
  if (
    data === null
    || trust.present !== true
    || trust.signed !== true
    || trust.valid !== true
    || trust.pinned !== true
    || data.schemaVersion !== 1
    || data.appendOnly !== true
  ) {
    throw new Error("revocation registry is not a pinned, signed, append-only v1 snapshot");
  }
  const keyIds = [];
  const seen = new Set();
  for (const entry of data.revoked) {
    if (
      typeof entry !== "object"
      || entry === null
      || typeof entry.keyId !== "string"
      || !/^[0-9a-f]{16}$/.test(entry.keyId)
      || seen.has(entry.keyId)
    ) {
      throw new Error("revocation registry contains a malformed or duplicate keyId");
    }
    seen.add(entry.keyId);
    keyIds.push(entry.keyId);
  }
  const frozenKeyIds = Object.freeze(keyIds);
  return Object.freeze({
    signerKeyId: trust.keyId,
    keyIds: frozenKeyIds,
    isRevoked(keyId) {
      return typeof keyId === "string" && seen.has(keyId);
    },
  });
}
