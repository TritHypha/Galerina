// B5a — signed central registry index. Real Ed25519 round-trip + every fail-closed path.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign as edSign, verify as edVerify } from "node:crypto";
import {
  buildRegistryIndex,
  signRegistryIndex,
  verifyRegistryIndex,
  registryIndexSigningInput,
  lookupCertifiedPackage,
  checkRegistryPolicy,
  admitFromRegistry,
  RegistryIndexError,
  ERR_REGISTRY_INDEX_UNSIGNED,
  ERR_REGISTRY_INDEX_NO_KEY,
  ERR_REGISTRY_INDEX_BAD_SIGNATURE,
  ERR_REGISTRY_PACKAGE_UNKNOWN,
  ERR_REGISTRY_VERSION_UNKNOWN,
  ERR_REGISTRY_HASH_MISMATCH,
  ERR_REGISTRY_KEYID_MISMATCH,
  ERR_REGISTRY_POLICY_DENIED,
  ERR_REGISTRY_INDEX_STALE,
  ERR_REGISTRY_INDEX_MALFORMED,
  ERR_REGISTRY_DUPLICATE,
} from "../dist/index.js";

const AUTH_KEY = "registry-authority-2026";
const { publicKey, privateKey } = generateKeyPairSync("ed25519");

const signFn = (message) => edSign(null, message, privateKey).toString("base64");
const verifier = (message, sigB64, keyId) => {
  if (keyId !== AUTH_KEY) return "no-key";
  return edVerify(null, message, publicKey, Buffer.from(sigB64, "base64"));
};

const ENTRIES = [
  { name: "Auth.Standard", version: "1.2.0", sourceHash: "sha256:aaa", publisher: "galerina-certified",
    keyId: "pub-auth", certificationLevel: "certified", riskRating: "low",
    capabilities: ["crypto.password.verify"], effects: ["database.read", "audit.write"] },
  { name: "Auth.Standard", version: "1.1.0", sourceHash: "sha256:old", publisher: "galerina-certified",
    keyId: "pub-auth", certificationLevel: "verified", riskRating: "medium", capabilities: [], effects: [] },
  { name: "Analytics.Beta", version: "0.9.0", sourceHash: "sha256:bbb", publisher: "community-x",
    keyId: "pub-ana", certificationLevel: "community", riskRating: "high", capabilities: [], effects: ["network.outbound"] },
];

const freshSigned = () =>
  signRegistryIndex(
    buildRegistryIndex({ registry: "galerina-central", issuedAt: "2026-06-22T00:00:00Z", entries: ENTRIES }),
    AUTH_KEY, signFn,
  );

describe("B5a hardening — adversarial fail-closed (review wn8v30euh)", () => {
  it("REJECTS a truthy NON-BOOLEAN verifier return (fail-open fix: result !== true)", () => {
    for (const truthy of ["yes", 1, {}, []]) {
      assert.throws(() => verifyRegistryIndex(freshSigned(), () => truthy),
        (e) => e instanceof RegistryIndexError && e.code === ERR_REGISTRY_INDEX_BAD_SIGNATURE,
        `truthy ${JSON.stringify(truthy)} must NOT admit`);
    }
  });
  it("REJECTS a stale/replayed index below the issuedAt floor (rollback defense)", () => {
    const idx = freshSigned();
    assert.throws(() => verifyRegistryIndex(idx, verifier, "2026-06-22T00:00:00Z"), // equal = replay
      (e) => e.code === ERR_REGISTRY_INDEX_STALE);
    assert.throws(() => verifyRegistryIndex(idx, verifier, "2027-01-01T00:00:00Z"), // older = rollback
      (e) => e.code === ERR_REGISTRY_INDEX_STALE);
    assert.equal(verifyRegistryIndex(idx, verifier, "2026-01-01T00:00:00Z"), "verified"); // strictly newer → ok
  });
  it("REJECTS a flipped (unauthenticated) canon tag", () => {
    const idx = freshSigned();
    const tampered = { ...idx, signature: { ...idx.signature, canon: "legacy" } };
    assert.throws(() => verifyRegistryIndex(tampered, verifier), (e) => e.code === ERR_REGISTRY_INDEX_MALFORMED);
  });
  it("REJECTS an unexpected (but validly-signed) schema — post-verify validation", () => {
    const base = buildRegistryIndex({ registry: "r", issuedAt: "2026-06-22T00:00:00Z", entries: ENTRIES });
    const wrong = signRegistryIndex({ ...base, schema: "totally-different/v9" }, AUTH_KEY, signFn);
    assert.throws(() => verifyRegistryIndex(wrong, verifier), (e) => e.code === ERR_REGISTRY_INDEX_MALFORMED);
  });
  it("REFUSES a duplicate (name,version) entry — order must not decide facts", () => {
    const dup = lookupCertifiedPackage(
      { schema: "galerina-registry-index/v1", registry: "r", issuedAt: "t", entries: [
        ENTRIES[0], { ...ENTRIES[0], sourceHash: "sha256:EVIL", certificationLevel: "regulated" }] },
      { name: "Auth.Standard", version: "1.2.0", sourceHash: "sha256:aaa" });
    assert.equal(dup.ok, false);
    assert.equal(dup.code, ERR_REGISTRY_DUPLICATE);
  });
  it("admitFromRegistry threads the issuedAt floor (stale → structured deny, no throw)", () => {
    const r = admitFromRegistry(freshSigned(), verifier,
      { name: "Auth.Standard", version: "1.2.0", sourceHash: "sha256:aaa" },
      { allowedLevels: ["certified"] }, "2026-12-31T00:00:00Z");
    assert.equal(r.ok, false);
    assert.equal(r.code, ERR_REGISTRY_INDEX_STALE);
  });
});

describe("B5a registry index — build + sign + verify (real Ed25519)", () => {
  it("verifies a correctly signed index", () => {
    assert.equal(verifyRegistryIndex(freshSigned(), verifier), "verified");
  });

  it("build sorts entries by (name, version) — canonical catalog", () => {
    const idx = buildRegistryIndex({ registry: "r", issuedAt: "t", entries: ENTRIES });
    assert.deepEqual(idx.entries.map((e) => `${e.name}@${e.version}`),
      ["Analytics.Beta@0.9.0", "Auth.Standard@1.1.0", "Auth.Standard@1.2.0"]);
  });

  it("signing input excludes the signature field and is stable", () => {
    const signed = freshSigned();
    const a = registryIndexSigningInput(signed);
    const b = registryIndexSigningInput({ ...signed, signature: undefined });
    assert.equal(a, b);
    assert.ok(!a.includes("signature"));
  });

  it("rejects an UNSIGNED index (fail-closed)", () => {
    const idx = buildRegistryIndex({ registry: "r", issuedAt: "t", entries: ENTRIES });
    assert.throws(() => verifyRegistryIndex(idx, verifier),
      (e) => e instanceof RegistryIndexError && e.code === ERR_REGISTRY_INDEX_UNSIGNED);
  });

  it("rejects a TAMPERED index (signature no longer matches content)", () => {
    const signed = freshSigned();
    const tampered = { ...signed, entries: signed.entries.map((e, i) =>
      i === 0 ? { ...e, sourceHash: "sha256:EVIL" } : e) };
    assert.throws(() => verifyRegistryIndex(tampered, verifier),
      (e) => e.code === ERR_REGISTRY_INDEX_BAD_SIGNATURE);
  });

  it("rejects when no public key is registered for the authority keyId (fail-closed)", () => {
    const signed = signRegistryIndex(
      buildRegistryIndex({ registry: "r", issuedAt: "t", entries: ENTRIES }), "unknown-authority", signFn);
    assert.throws(() => verifyRegistryIndex(signed, verifier),
      (e) => e.code === ERR_REGISTRY_INDEX_NO_KEY);
  });
});

describe("B5a registry index — lookup (fail-closed)", () => {
  const idx = freshSigned();
  it("resolves a pinned package by name+version+hash", () => {
    const r = lookupCertifiedPackage(idx, { name: "Auth.Standard", version: "1.2.0", sourceHash: "sha256:aaa" });
    assert.ok(r.ok && r.entry.certificationLevel === "certified");
  });
  it("denies an unknown package", () => {
    const r = lookupCertifiedPackage(idx, { name: "Nope", version: "1.0.0", sourceHash: "x" });
    assert.equal(r.ok, false); assert.equal(r.code, ERR_REGISTRY_PACKAGE_UNKNOWN);
  });
  it("denies an unknown version", () => {
    const r = lookupCertifiedPackage(idx, { name: "Auth.Standard", version: "9.9.9", sourceHash: "x" });
    assert.equal(r.code, ERR_REGISTRY_VERSION_UNKNOWN);
  });
  it("denies a hash mismatch (supply-chain integrity)", () => {
    const r = lookupCertifiedPackage(idx, { name: "Auth.Standard", version: "1.2.0", sourceHash: "sha256:WRONG" });
    assert.equal(r.code, ERR_REGISTRY_HASH_MISMATCH);
  });
  it("denies a keyId mismatch when the package keyId is supplied", () => {
    const r = lookupCertifiedPackage(idx, { name: "Auth.Standard", version: "1.2.0", sourceHash: "sha256:aaa", keyId: "rogue" });
    assert.equal(r.code, ERR_REGISTRY_KEYID_MISMATCH);
  });
});

describe("B5a registry index — policy (fail-closed)", () => {
  const certified = ENTRIES[0]; // certified / low
  const community = ENTRIES[2]; // community / high
  it("allows a package whose level is permitted", () => {
    assert.equal(checkRegistryPolicy(certified, { allowedLevels: ["certified", "verified"] }).ok, true);
  });
  it("denies a package whose level is not permitted", () => {
    const r = checkRegistryPolicy(community, { allowedLevels: ["certified", "verified"] });
    assert.equal(r.ok, false); assert.equal(r.code, ERR_REGISTRY_POLICY_DENIED);
  });
  it("denies a package whose risk exceeds the policy maximum", () => {
    const r = checkRegistryPolicy(community, { allowedLevels: ["community"], maxRiskRating: "medium" });
    assert.equal(r.ok, false); assert.equal(r.code, ERR_REGISTRY_POLICY_DENIED);
  });
});

describe("B5a registry index — admitFromRegistry (verify → lookup → policy)", () => {
  const policy = { allowedLevels: ["certified", "verified"], maxRiskRating: "medium" };
  it("admits a verified, listed, policy-passing package", () => {
    const r = admitFromRegistry(freshSigned(), verifier,
      { name: "Auth.Standard", version: "1.2.0", sourceHash: "sha256:aaa", keyId: "pub-auth" }, policy);
    assert.ok(r.ok && r.entry.name === "Auth.Standard");
  });
  it("denies via a structured result when the index is unsigned (no throw)", () => {
    const unsigned = buildRegistryIndex({ registry: "r", issuedAt: "t", entries: ENTRIES });
    const r = admitFromRegistry(unsigned, verifier,
      { name: "Auth.Standard", version: "1.2.0", sourceHash: "sha256:aaa" }, policy);
    assert.equal(r.ok, false); assert.equal(r.code, ERR_REGISTRY_INDEX_UNSIGNED);
  });
  it("denies an unlisted package", () => {
    const r = admitFromRegistry(freshSigned(), verifier, { name: "Nope", version: "1", sourceHash: "x" }, policy);
    assert.equal(r.code, ERR_REGISTRY_PACKAGE_UNKNOWN);
  });
  it("denies a listed-but-policy-failing package (community level not allowed)", () => {
    const r = admitFromRegistry(freshSigned(), verifier,
      { name: "Analytics.Beta", version: "0.9.0", sourceHash: "sha256:bbb" }, policy);
    assert.equal(r.code, ERR_REGISTRY_POLICY_DENIED);
  });
});
