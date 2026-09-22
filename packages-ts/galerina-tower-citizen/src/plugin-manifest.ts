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
import { types as utilTypes } from "node:util";
import { evaluateSignerRevocation, type AttestationPolicy, type AttestationResult } from "./bridge-attestation.js";
import { snapshotPluginMetadata, type PluginMetadata } from "./plugin-sandbox.js";

export interface SignedPluginManifest {
  readonly manifest: PluginMetadata;
  readonly signature?: string;        // Ed25519 over canonicalPluginManifestString, base64
  readonly mlDsaSignature?: string;   // ML-DSA-65, base64 (hybrid — no PQ downgrade)
}

/** FIPS-204 domain-separation context for the plugin-manifest signing surface (distinct from the
 *  bridge-manifest and capability-grant contexts). */
const PLUGIN_MLDSA_CONTEXT = new TextEncoder().encode("galerina.plugin.manifest.v1");

function canonicalPluginManifestSnapshot(m: PluginMetadata): string {
  return JSON.stringify({
    engineId: m.engineId,
    artifactPath: m.artifactPath,
    artifactHash: m.artifactHash,
    governanceTier: m.governanceTier,
    license: m.license,
    maxMemoryMB: m.maxMemoryMB,
    capabilityMask: m.capabilityMask >>> 0,
  });
}

function snapshotSignedPluginManifest(value: unknown): SignedPluginManifest {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("signed plugin manifest must be a plain object");
  }
  if (utilTypes.isProxy(value)) throw new Error("signed plugin manifest proxies are forbidden");
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error("signed plugin manifest must have a plain object prototype");
  }
  if (Object.getOwnPropertySymbols(value).length !== 0) {
    throw new Error("signed plugin manifest must not contain symbol keys");
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const allowed = new Set(["manifest", "signature", "mlDsaSignature"]);
  const names = Object.keys(descriptors);
  if (!names.includes("manifest") || names.some((name) => !allowed.has(name))) {
    throw new Error("signed plugin manifest fields are not canonical");
  }
  const read = (name: string): unknown => {
    const descriptor = descriptors[name];
    if (descriptor === undefined) return undefined;
    if (!("value" in descriptor) || descriptor.enumerable !== true) {
      throw new Error(`signed plugin manifest field '${name}' must be an enumerable data descriptor; accessors are forbidden`);
    }
    return descriptor.value;
  };
  const manifest = snapshotPluginMetadata(read("manifest"));
  const signature = read("signature");
  const mlDsaSignature = read("mlDsaSignature");
  if (signature !== undefined && typeof signature !== "string") throw new Error("plugin manifest signature must be a string");
  if (mlDsaSignature !== undefined && typeof mlDsaSignature !== "string") throw new Error("plugin manifest ML-DSA signature must be a string");
  return Object.freeze({
    manifest,
    ...(signature !== undefined ? { signature } : {}),
    ...(mlDsaSignature !== undefined ? { mlDsaSignature } : {}),
  });
}

/** Canonical, deterministic signing/hashing pre-image — every field in a fixed order, mask normalised
 *  to unsigned 32-bit so `-1` and `0xFFFFFFFF` cannot serialise to different strings. */
export function canonicalPluginManifestString(m: PluginMetadata): string {
  return canonicalPluginManifestSnapshot(snapshotPluginMetadata(m));
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
  const snapshot = snapshotPluginMetadata(manifest);
  const sig = edSign(null, Buffer.from(canonicalPluginManifestSnapshot(snapshot), "utf8"), createPrivateKey(privateKeyPem));
  return Object.freeze({ manifest: snapshot, signature: sig.toString("base64") });
}

/** Hybrid sign (Ed25519 + ML-DSA-65) — both signatures over the canonical manifest pre-image. */
export async function signPluginManifestHybrid(
  manifest: PluginMetadata,
  privateKeyPem: string,
  mlDsaPrivateKey: Uint8Array,
): Promise<SignedPluginManifest> {
  const snapshot = snapshotPluginMetadata(manifest);
  const msg = Buffer.from(canonicalPluginManifestSnapshot(snapshot), "utf8");
  const edSig = edSign(null, msg, createPrivateKey(privateKeyPem));
  const { ml_dsa65 } = await import("@noble/post-quantum/ml-dsa.js") as {
    ml_dsa65: { sign(m: Uint8Array, sk: Uint8Array, opts?: { context?: Uint8Array }): Uint8Array };
  };
  const mlSig = ml_dsa65.sign(msg, mlDsaPrivateKey, { context: PLUGIN_MLDSA_CONTEXT });
  return Object.freeze({ manifest: snapshot, signature: edSig.toString("base64"), mlDsaSignature: Buffer.from(mlSig).toString("base64") });
}

/**
 * Verify a signed plugin manifest against an attestation policy, binding it to the metadata actually
 * being loaded. Fails CLOSED — a missing manifest, any exact metadata mismatch (so a manifest signed for
 * plugin A cannot admit altered path/tier/licence/budget/capability facts), an absent/bad signature, a revoked signer, or (in hybrid mode) an
 * absent/bad ML-DSA half all return `{ ok: false }`. When `policy.requireHybrid` or `policy.mlDsaPublicKey`
 * is set the ML-DSA signature is REQUIRED and verified (no PQ downgrade), mirroring verifyAttestationHybrid.
 */
export async function verifyPluginManifest(
  signed: SignedPluginManifest | undefined,
  policy: AttestationPolicy,
  expected: PluginMetadata,
): Promise<AttestationResult> {
  if (!signed) return { ok: false, reason: "no signed plugin manifest provided" };
  let admitted: SignedPluginManifest;
  try {
    admitted = snapshotSignedPluginManifest(signed);
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "signed plugin manifest is invalid" };
  }
  const m = admitted.manifest;
  const canonical = canonicalPluginManifestSnapshot(m);
  const hash = createHash("sha256").update(canonical, "utf8").digest("hex");

  // Bind the manifest to the metadata being loaded — no manifest-for-another-plugin replay.
  let expectedSnapshot: PluginMetadata;
  try {
    expectedSnapshot = snapshotPluginMetadata(expected);
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "expected plugin metadata is invalid", hash };
  }
  if (canonical !== canonicalPluginManifestSnapshot(expectedSnapshot)) {
    return { ok: false, reason: "signed manifest does not exactly match all plugin metadata fields", hash };
  }

  // Ed25519 — a load manifest asserts identity/authority, so a signature is always required.
  if (!admitted.signature) return { ok: false, reason: "manifest signature required but absent", hash };
  if (!policy.publicKeyPem) return { ok: false, reason: "no public key configured to verify the manifest", hash };
  try {
    const ok = edVerify(
      null,
      Buffer.from(canonical, "utf8"),
      createPublicKey(policy.publicKeyPem),
      Buffer.from(admitted.signature, "base64"),
    );
    if (!ok) return { ok: false, reason: "manifest signature verification failed", hash };
  } catch (e) {
    return { ok: false, reason: `manifest signature check error: ${(e as Error).message}`, hash };
  }

  const revocation = evaluateSignerRevocation(policy, hash);
  if (revocation !== null) return revocation;

  // Hybrid ML-DSA-65 half (no PQ downgrade) when the policy demands it.
  if (policy.requireHybrid === true || policy.mlDsaPublicKey !== undefined) {
    if (!policy.mlDsaPublicKey) return { ok: false, reason: "requireHybrid set but policy has no mlDsaPublicKey", hash };
    if (!admitted.mlDsaSignature) return { ok: false, reason: "ML-DSA manifest signature required but absent (hybrid)", hash };
    try {
      const { ml_dsa65 } = await import("@noble/post-quantum/ml-dsa.js") as {
        ml_dsa65: { verify(s: Uint8Array, m: Uint8Array, pk: Uint8Array, opts?: { context?: Uint8Array }): boolean };
      };
      const ok = ml_dsa65.verify(
        Buffer.from(admitted.mlDsaSignature, "base64"),
        Buffer.from(canonical, "utf8"),
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
