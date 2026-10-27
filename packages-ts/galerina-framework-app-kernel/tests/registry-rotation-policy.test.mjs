// Registry rotation policy: root-signed policy -> issuer-signed delegations ->
// operational key. Real hybrid Ed25519 + ML-DSA-65 with THROWAWAY keys that are
// generated in memory and never written anywhere.
import assert from "node:assert/strict";
import {
  createHash,
  createPublicKey,
  generateKeyPairSync,
  randomBytes,
  sign as edSign,
} from "node:crypto";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";

import * as K from "../dist/index.js";
import { createRegistryPublicVerifiers } from "../../galerina-tower-citizen/dist/index.js";

const towerRequire = createRequire(
  new URL("../../galerina-tower-citizen/package.json", import.meta.url),
);
const { ml_dsa65: mlDsa65 } = await import(
  pathToFileURL(towerRequire.resolve("@noble/post-quantum/ml-dsa.js")).href
);

const enc = new TextEncoder();
const sha256Bytes = (bytes) => createHash("sha256").update(bytes).digest("hex");
const CONTEXTS = {
  root: K.REGISTRY_DELEGATION_V1_CONTEXT,
  rotationPolicy: K.REGISTRY_ROTATION_POLICY_V1_CONTEXT,
  rotationIssuer: K.REGISTRY_ISSUED_DELEGATION_V1_CONTEXT,
  operational: "galerina.registry.index.sig.v2",
};

function makeKey(keyId = randomBytes(8).toString("hex")) {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const seed = Uint8Array.from(randomBytes(32));
  const ml = mlDsa65.keygen(seed);
  const pem = publicKey.export({ type: "spki", format: "pem" });
  return {
    keyId,
    privateKey,
    pem,
    ml,
    edSha: sha256Bytes(publicKey.export({ type: "spki", format: "der" })),
    mlSha: sha256Bytes(ml.publicKey),
    fingerprints: undefined,
  };
}
const sign = (key, role) => ({
  ed: (message) => edSign(null, message, key.privateKey).toString("base64"),
  ml: (message) => Buffer.from(
    mlDsa65.sign(message, key.ml.secretKey, { context: enc.encode(CONTEXTS[role]) }),
  ).toString("base64"),
});
const verifiersFor = (key, role) => createRegistryPublicVerifiers({
  role, keyId: key.keyId, ed25519PublicKeyPem: key.pem, mlDsa65PublicKey: key.ml.publicKey,
});
const pinned = (key) => ({
  keyId: key.keyId, ed25519PublicKeySha256: key.edSha, mlDsa65PublicKeySha256: key.mlSha,
});
const operational = (key) => ({
  keyId: key.keyId, algorithm: "Ed25519+ML-DSA-65",
  ed25519PublicKeySha256: key.edSha, mlDsa65PublicKeySha256: key.mlSha,
});

const ROOT = makeKey("21415420b447e219");
const ISSUER = makeKey();
const SLIDE = makeKey("f3172a48372bfb23");
const GALERINA = makeKey("0da09262513e2a8d");
const REGISTRY = "galerina-central";
const DAY = 86_400_000;
const T = (iso) => Date.parse(iso);
const iso = (ms) => new Date(ms).toISOString();

const ANCHOR_END = "2027-01-25T15:45:00.000Z";
function makeAnchor(overrides = {}, signer = ROOT) {
  const unsigned = K.buildRegistryAuthorityDelegation({
    registry: REGISTRY, serial: 2,
    issuedAt: "2026-10-27T15:45:00.000Z",
    notBefore: "2026-10-27T15:45:00.000Z",
    notAfter: ANCHOR_END,
    rootKeyId: ROOT.keyId, operational: operational(SLIDE),
    roles: ["package-manifest.sign", "registry-index.sign"],
    ...overrides,
  });
  const s = sign(signer, "root");
  return K.signRegistryAuthorityDelegation(unsigned, s.ed, s.ml);
}

function policyInput(overrides = {}) {
  return {
    registry: REGISTRY, serial: 1,
    issuedAt: "2026-10-28T00:00:00.000Z",
    notBefore: "2026-10-28T00:00:00.000Z",
    notAfter: "2028-10-27T00:00:00.000Z",
    rootKeyId: ROOT.keyId,
    issuer: { keyId: ISSUER.keyId, algorithm: "Ed25519+ML-DSA-65",
      ed25519PublicKeySha256: ISSUER.edSha, mlDsa65PublicKeySha256: ISSUER.mlSha },
    allowedRoles: ["package-manifest.sign", "registry-index.sign"],
    allowedAlgorithms: ["hybrid-ed25519-mldsa65"],
    maxDelegationLifetimeSeconds: 30 * 86_400,
    minOverlapSeconds: 7 * 86_400,
    pinnedOperationalKeys: [pinned(GALERINA)],
    allowGeneratedKeyIds: true,
    deniedOperationalKeyIds: [SLIDE.keyId],
    anchor: { serial: 2, keyId: SLIDE.keyId, notAfter: ANCHOR_END },
    firstRotation: { fromKeyId: SLIDE.keyId, toKeyId: GALERINA.keyId },
    ...overrides,
  };
}
function makePolicy(overrides = {}, signer = ROOT) {
  const policy = K.buildRegistryRotationPolicy(policyInput(overrides));
  const s = sign(signer, "rotationPolicy");
  return K.signRegistryRotationPolicy(policy, s.ed, s.ml);
}
const digestOf = (policy) => K.registryRotationPolicyDigest(policy, sha256Bytes);

function issue(policy, fields, signer = ISSUER) {
  const unsigned = K.buildRegistryIssuedDelegation({
    registry: REGISTRY, rootKeyId: ROOT.keyId,
    roles: ["package-manifest.sign", "registry-index.sign"],
    policySerial: policy.serial, policySha256: digestOf(policy),
    issuerKeyId: ISSUER.keyId,
    ...fields,
  });
  const s = sign(signer, "rotationIssuer");
  return K.signRegistryIssuedDelegation(unsigned, s.ed, s.ml);
}

// Healthy timeline: anchor(serial 2, SLIDE) -> 3 (GALERINA, 14 days overlap)
// -> 4 (generated key, 7 days overlap).
const D3_START = "2027-01-11T15:45:00.000Z";
const D3_END = iso(T(D3_START) + 30 * DAY);
const D4_START = iso(T(D3_END) - 7 * DAY);
const D4_END = iso(T(D4_START) + 30 * DAY);
const OP4 = makeKey();

function healthy(extra = {}) {
  const policy = extra.policy ?? makePolicy();
  const anchor = extra.anchor ?? makeAnchor();
  const d3 = extra.d3 ?? issue(policy, {
    serial: 3, issuedAt: "2026-12-01T00:00:00.000Z",
    notBefore: D3_START, notAfter: D3_END, operational: operational(GALERINA),
  });
  const d4 = extra.d4 ?? issue(policy, {
    serial: 4, issuedAt: "2027-01-20T00:00:00.000Z",
    notBefore: D4_START, notAfter: D4_END, operational: operational(OP4),
  });
  return { policy, anchor, d3, d4, delegations: extra.delegations ?? [d3, d4] };
}

function options(overrides = {}) {
  return {
    expectedRootKeyId: ROOT.keyId,
    at: iso(T(D4_START) + DAY),
    minSerial: 0,
    minPolicySerial: 0,
    isRevoked: () => false,
    verifyRootPolicy: verifiersFor(ROOT, "rotationPolicy"),
    verifyRootDelegation: verifiersFor(ROOT, "root"),
    verifyIssuer: verifiersFor(ISSUER, "rotationIssuer"),
    issuerPublicKeyFingerprints: { ed25519: ISSUER.edSha, mlDsa65: ISSUER.mlSha },
    sha256Hex: sha256Bytes,
    ...overrides,
  };
}
const verifyChain = (target, h, opts = {}) =>
  K.verifyRegistryIssuedDelegationChain(
    target, { policy: h.policy, anchor: h.anchor, delegations: h.delegations }, options(opts),
  );
const refuses = (code, fn) =>
  assert.throws(fn, (error) => error instanceof K.RegistryRotationError && error.code === code,
    `expected ${code}`);

test("healthy chain: root policy -> anchor -> serial 3 (Galerina key) -> serial 4 verifies", () => {
  const h = healthy();
  assert.equal(verifyChain(h.d3, h, { at: iso(T(D3_START) + DAY) }), "verified");
  assert.equal(verifyChain(h.d4, h), "verified");
  // During the overlap both serial 3 and serial 4 are active and verifiable.
  const overlapAt = iso(T(D4_START) + DAY);
  assert.equal(verifyChain(h.d3, h, { at: overlapAt }), "verified");
  // Serial 3 is the Galerina key, not the SLIDE key: the registry moves off SLIDE.
  assert.equal(h.d3.operational.keyId, "0da09262513e2a8d");
  assert.notEqual(h.d3.operational.keyId, "f3172a48372bfb23");
});

test("no gap: every instant from the anchor start to the chain end is covered", () => {
  const h = healthy();
  const windows = [h.anchor, h.d3, h.d4].map((d) => [T(d.notBefore), T(d.notAfter)]);
  for (let t = windows[0][0]; t <= windows[2][1]; t += 6 * 3_600_000) {
    assert.ok(windows.some(([a, b]) => t >= a && t <= b), `covered ${iso(t)}`);
  }
});

test("policy hash binds delegations to exactly one root-signed policy", () => {
  const h = healthy();
  const other = makePolicy({ maxDelegationLifetimeSeconds: 20 * 86_400 });
  assert.notEqual(digestOf(h.policy), digestOf(other));
  assert.equal(h.d3.policySha256, digestOf(h.policy));
  refuses(K.ERR_REGISTRY_ROTATION_CHAIN, () =>
    verifyChain(h.d3, { ...h, policy: other, delegations: [h.d3] }, { at: iso(T(D3_START) + DAY) }));
});

test("forged root: a policy signed by a different key under the root id is refused", () => {
  const forgedRoot = makeKey(ROOT.keyId);
  const h = healthy({ policy: makePolicy({}, forgedRoot) });
  refuses(K.ERR_REGISTRY_ROTATION_BAD_SIGNATURE, () => verifyChain(h.d3, h, { at: iso(T(D3_START) + DAY) }));
});

test("forged root: a policy for a different root id is refused", () => {
  const h = healthy();
  refuses(K.ERR_REGISTRY_ROTATION_KEY_MISMATCH, () =>
    verifyChain(h.d3, h, { expectedRootKeyId: "aaaaaaaaaaaaaaaa", at: iso(T(D3_START) + DAY) }));
});

test("tampered policy bounds invalidate the root signature", () => {
  const h = healthy();
  const tampered = { ...h.policy, maxDelegationLifetimeSeconds: 80 * 86_400 };
  refuses(K.ERR_REGISTRY_ROTATION_BAD_SIGNATURE, () =>
    verifyChain(h.d3, { ...h, policy: tampered }, { at: iso(T(D3_START) + DAY) }));
});

test("an unsigned policy and a downgraded signature envelope are refused", () => {
  const h = healthy();
  const { rootSignature: _omit, ...unsigned } = h.policy;
  refuses(K.ERR_REGISTRY_ROTATION_UNSIGNED, () =>
    verifyChain(h.d3, { ...h, policy: unsigned }, { at: iso(T(D3_START) + DAY) }));
  const wrongContext = { ...h.policy, rootSignature: { ...h.policy.rootSignature, context: K.REGISTRY_DELEGATION_V1_CONTEXT } };
  refuses(K.ERR_REGISTRY_ROTATION_UNSIGNED, () =>
    verifyChain(h.d3, { ...h, policy: wrongContext }, { at: iso(T(D3_START) + DAY) }));
});

test("a root delegation signature cannot be replayed as a policy signature", () => {
  const h = healthy();
  const s = sign(ROOT, "root");
  const message = K.registryRotationPolicyPreimage(h.policy);
  const replay = { ...h.policy, rootSignature: { ...h.policy.rootSignature, ed25519Signature: s.ed(message), mlDsa65Signature: s.ml(message) } };
  refuses(K.ERR_REGISTRY_ROTATION_BAD_SIGNATURE, () =>
    verifyChain(h.d3, { ...h, policy: replay }, { at: iso(T(D3_START) + DAY) }));
});

test("lifetime over the policy cap is refused (and the hard 90-day ceiling holds)", () => {
  const h = healthy();
  const long = issue(h.policy, {
    serial: 3, issuedAt: "2026-12-01T00:00:00.000Z",
    notBefore: D3_START, notAfter: iso(T(D3_START) + 31 * DAY), operational: operational(GALERINA),
  });
  refuses(K.ERR_REGISTRY_ROTATION_LIFETIME, () =>
    verifyChain(long, { ...h, delegations: [long] }, { at: iso(T(D3_START) + DAY) }));
  assert.throws(() => makePolicy({ maxDelegationLifetimeSeconds: 91 * 86_400 }), /90-day ceiling/);
  assert.throws(() => makePolicy({ notAfter: "2028-10-29T00:00:00.000Z" }), /730-day ceiling/);
});

test("role outside the policy is refused", () => {
  const policy = makePolicy({ allowedRoles: ["registry-index.sign"] });
  const h = healthy({ policy, delegations: undefined });
  // d3/d4 were issued with both roles under the narrower policy.
  refuses(K.ERR_REGISTRY_ROTATION_ROLE, () => verifyChain(h.d3, h, { at: iso(T(D3_START) + DAY) }));
  const ok = issue(policy, {
    serial: 3, issuedAt: "2026-12-01T00:00:00.000Z", roles: ["registry-index.sign"],
    notBefore: D3_START, notAfter: D3_END, operational: operational(GALERINA),
  });
  assert.equal(verifyChain(ok, { ...h, delegations: [ok] }, { at: iso(T(D3_START) + DAY), requiredRoles: ["registry-index.sign"] }), "verified");
  refuses(K.ERR_REGISTRY_ROTATION_ROLE, () =>
    verifyChain(ok, { ...h, delegations: [ok] }, { at: iso(T(D3_START) + DAY), requiredRoles: ["package-manifest.sign"] }));
  assert.throws(() => issue(policy, { serial: 3, issuedAt: "2026-12-01T00:00:00.000Z", roles: ["root.sign"],
    notBefore: D3_START, notAfter: D3_END, operational: operational(GALERINA) }), /unsupported role/);
});

test("serial replay and rollback are refused", () => {
  const h = healthy();
  const replay = issue(h.policy, { serial: 3, issuedAt: "2027-01-20T00:00:00.000Z",
    notBefore: D4_START, notAfter: D4_END, operational: operational(OP4) });
  refuses(K.ERR_REGISTRY_ROTATION_SERIAL, () =>
    verifyChain(replay, { ...h, delegations: [h.d3, replay] }));
  // Re-using the anchor's serial is refused too.
  const anchorSerial = issue(h.policy, { serial: 2, issuedAt: "2026-12-01T00:00:00.000Z",
    notBefore: D3_START, notAfter: D3_END, operational: operational(GALERINA) });
  refuses(K.ERR_REGISTRY_ROTATION_SERIAL, () =>
    verifyChain(anchorSerial, { ...h, delegations: [anchorSerial] }, { at: iso(T(D3_START) + DAY) }));
  // Accepted-serial floor: serial 4 is stale once 4 was accepted.
  refuses(K.ERR_REGISTRY_ROTATION_STALE, () => verifyChain(h.d4, h, { minSerial: 4 }));
  assert.equal(verifyChain(h.d4, h, { minSerial: 3 }), "verified");
});

test("expired policy is refused even though the delegation window is open", () => {
  const policy = makePolicy({ notAfter: "2027-02-05T00:00:00.000Z" });
  const h = healthy({ policy, delegations: undefined });
  // d4 would end after the policy window.
  refuses(K.ERR_REGISTRY_ROTATION_POLICY_WINDOW, () => verifyChain(h.d4, h));
  const h2 = healthy();
  refuses(K.ERR_REGISTRY_ROTATION_NOT_ACTIVE, () =>
    verifyChain(h2.d4, h2, { at: "2028-10-27T00:00:01.000Z" }));
  refuses(K.ERR_REGISTRY_ROTATION_NOT_ACTIVE, () =>
    verifyChain(h2.d3, h2, { at: "2026-10-27T23:59:59.000Z" }));
});

test("policy rollback floor is enforced", () => {
  const h = healthy();
  assert.equal(verifyChain(h.d4, h, { minPolicySerial: 1 }), "verified");
  refuses(K.ERR_REGISTRY_ROTATION_POLICY_STALE, () => verifyChain(h.d4, h, { minPolicySerial: 2 }));
});

test("a gap between consecutive delegations is refused", () => {
  const h = healthy();
  const gap = issue(h.policy, { serial: 4, issuedAt: "2027-01-20T00:00:00.000Z",
    notBefore: iso(T(D3_END) + 1000), notAfter: iso(T(D3_END) + 29 * DAY), operational: operational(OP4) });
  refuses(K.ERR_REGISTRY_ROTATION_GAP, () => verifyChain(gap, { ...h, delegations: [h.d3, gap] },
    { at: iso(T(D3_END) + 2 * DAY) }));
  // First link leaving a gap after the anchor.
  const lateFirst = issue(h.policy, { serial: 3, issuedAt: "2026-12-01T00:00:00.000Z",
    notBefore: iso(T(ANCHOR_END) + DAY), notAfter: iso(T(ANCHOR_END) + 20 * DAY), operational: operational(GALERINA) });
  refuses(K.ERR_REGISTRY_ROTATION_GAP, () => verifyChain(lateFirst, { ...h, delegations: [lateFirst] },
    { at: iso(T(ANCHOR_END) + 2 * DAY) }));
});

test("an overlap shorter than the policy minimum is refused; exactly the minimum passes", () => {
  const h = healthy();
  const short = issue(h.policy, { serial: 4, issuedAt: "2027-01-20T00:00:00.000Z",
    notBefore: iso(T(D3_END) - 7 * DAY + 1000), notAfter: iso(T(D3_END) + 23 * DAY), operational: operational(OP4) });
  refuses(K.ERR_REGISTRY_ROTATION_OVERLAP, () => verifyChain(short, { ...h, delegations: [h.d3, short] },
    { at: iso(T(D3_END) - 6 * DAY) }));
  assert.equal(verifyChain(h.d4, h), "verified"); // d4 overlaps by exactly 7 days
});

test("a delegation that starts before its predecessor is refused", () => {
  const h = healthy();
  const early = issue(h.policy, { serial: 4, issuedAt: "2027-01-01T00:00:00.000Z",
    notBefore: iso(T(D3_START) - DAY), notAfter: iso(T(D3_START) + 29 * DAY), operational: operational(OP4) });
  refuses(K.ERR_REGISTRY_ROTATION_ORDER, () => verifyChain(early, { ...h, delegations: [h.d3, early] },
    { at: D3_START }));
});

test("operational key rules: denied SLIDE key, root/issuer ids, fingerprints, first rotation", () => {
  const h = healthy();
  // Re-delegating the retired SLIDE key under the policy is refused.
  const slide = issue(h.policy, { serial: 3, issuedAt: "2026-12-01T00:00:00.000Z",
    notBefore: D3_START, notAfter: D3_END, operational: operational(SLIDE) });
  refuses(K.ERR_REGISTRY_ROTATION_KEY_NOT_ALLOWED, () => verifyChain(slide, { ...h, delegations: [slide] },
    { at: iso(T(D3_START) + DAY) }));
  // The issuer key may not sign registry content: it cannot be an operational key.
  const asIssuer = issue(h.policy, { serial: 3, issuedAt: "2026-12-01T00:00:00.000Z",
    notBefore: D3_START, notAfter: D3_END, operational: operational(ISSUER) });
  refuses(K.ERR_REGISTRY_ROTATION_KEY_NOT_ALLOWED, () => verifyChain(asIssuer, { ...h, delegations: [asIssuer] },
    { at: iso(T(D3_START) + DAY) }));
  const asRoot = issue(h.policy, { serial: 3, issuedAt: "2026-12-01T00:00:00.000Z",
    notBefore: D3_START, notAfter: D3_END, operational: operational(ROOT) });
  refuses(K.ERR_REGISTRY_ROTATION_KEY_NOT_ALLOWED, () => verifyChain(asRoot, { ...h, delegations: [asRoot] },
    { at: iso(T(D3_START) + DAY) }));
  // Pinned id with substituted public keys (id is not derived from the key bytes).
  const imposter = makeKey(GALERINA.keyId);
  const swapped = issue(h.policy, { serial: 3, issuedAt: "2026-12-01T00:00:00.000Z",
    notBefore: D3_START, notAfter: D3_END, operational: operational(imposter) });
  refuses(K.ERR_REGISTRY_ROTATION_KEY_MISMATCH, () => verifyChain(swapped, { ...h, delegations: [swapped] },
    { at: iso(T(D3_START) + DAY) }));
  // The first rotation must land on the Galerina key, not a freshly generated one.
  const generatedFirst = issue(h.policy, { serial: 3, issuedAt: "2026-12-01T00:00:00.000Z",
    notBefore: D3_START, notAfter: D3_END, operational: operational(OP4) });
  refuses(K.ERR_REGISTRY_ROTATION_KEY_NOT_ALLOWED, () => verifyChain(generatedFirst, { ...h, delegations: [generatedFirst] },
    { at: iso(T(D3_START) + DAY) }));
  // allowGeneratedKeyIds=false confines the issuer to pinned keys.
  const strict = makePolicy({ allowGeneratedKeyIds: false });
  const s3 = issue(strict, { serial: 3, issuedAt: "2026-12-01T00:00:00.000Z",
    notBefore: D3_START, notAfter: D3_END, operational: operational(GALERINA) });
  const s4 = issue(strict, { serial: 4, issuedAt: "2027-01-20T00:00:00.000Z",
    notBefore: D4_START, notAfter: D4_END, operational: operational(OP4) });
  refuses(K.ERR_REGISTRY_ROTATION_KEY_NOT_ALLOWED, () =>
    verifyChain(s4, { ...h, policy: strict, delegations: [s3, s4] }));
});

test("forged issuer: wrong signing key, and issuer public bytes that differ from the root-signed fingerprints", () => {
  const h = healthy();
  const rogue = makeKey(ISSUER.keyId);
  const forged = issue(h.policy, { serial: 3, issuedAt: "2026-12-01T00:00:00.000Z",
    notBefore: D3_START, notAfter: D3_END, operational: operational(GALERINA) }, rogue);
  refuses(K.ERR_REGISTRY_ROTATION_BAD_SIGNATURE, () => verifyChain(forged, { ...h, delegations: [forged] },
    { at: iso(T(D3_START) + DAY) }));
  refuses(K.ERR_REGISTRY_ROTATION_KEY_MISMATCH, () => verifyChain(h.d3, h, {
    at: iso(T(D3_START) + DAY),
    issuerPublicKeyFingerprints: { ed25519: rogue.edSha, mlDsa65: rogue.mlSha },
  }));
  // A delegation signed by the root under the issued-delegation context is not accepted as issuer.
  const unsigned = { ...h.d3 };
  delete unsigned.issuerSignature;
  refuses(K.ERR_REGISTRY_ROTATION_UNSIGNED, () => verifyChain(unsigned, { ...h, delegations: [unsigned] },
    { at: iso(T(D3_START) + DAY) }));
});

test("tampering with an issued delegation breaks its issuer signature", () => {
  const h = healthy();
  const tampered = { ...h.d3, notAfter: iso(T(D3_END) + DAY) };
  refuses(K.ERR_REGISTRY_ROTATION_BAD_SIGNATURE, () => verifyChain(tampered, { ...h, delegations: [tampered] },
    { at: iso(T(D3_START) + DAY) }));
});

test("backdated issuance and delegations outside the policy window are refused", () => {
  const h = healthy();
  const backdated = issue(h.policy, { serial: 3, issuedAt: iso(T(D3_START) + DAY),
    notBefore: D3_START, notAfter: D3_END, operational: operational(GALERINA) });
  refuses(K.ERR_REGISTRY_ROTATION_BACKDATED, () => verifyChain(backdated, { ...h, delegations: [backdated] },
    { at: iso(T(D3_START) + 2 * DAY) }));
  const early = issue(h.policy, { serial: 3, issuedAt: "2026-10-28T00:00:00.000Z",
    notBefore: "2026-10-27T20:00:00.000Z", notAfter: iso(T("2026-10-27T20:00:00.000Z") + 20 * DAY),
    operational: operational(GALERINA) });
  refuses(K.ERR_REGISTRY_ROTATION_POLICY_WINDOW, () => verifyChain(early, { ...h, delegations: [early] },
    { at: "2026-10-28T00:00:00.000Z" }));
});

test("revocation: root, issuer and the selected operational key kill the chain; retired links do not", () => {
  const h = healthy();
  for (const id of [ROOT.keyId, ISSUER.keyId, OP4.keyId]) {
    refuses(K.ERR_REGISTRY_ROTATION_REVOKED, () => verifyChain(h.d4, h, { isRevoked: (k) => k === id }));
  }
  // Serial 3's (Galerina) key and the SLIDE anchor key being revoked later must not break serial 4.
  assert.equal(verifyChain(h.d4, h, { isRevoked: (k) => k === GALERINA.keyId || k === SLIDE.keyId }), "verified");
  refuses(K.ERR_REGISTRY_ROTATION_REVOKED, () => verifyChain(h.d4, h, { isRevoked: () => { throw new Error("no status"); } }));
});

test("anchor: must be the exact root-signed delegation the policy names", () => {
  const h = healthy();
  const at = iso(T(D3_START) + DAY);
  refuses(K.ERR_REGISTRY_ROTATION_ANCHOR, () => verifyChain(h.d3, { ...h, anchor: makeAnchor({ notAfter: "2027-01-26T15:45:00.000Z" }) }, { at }));
  refuses(K.ERR_REGISTRY_ROTATION_ANCHOR, () => verifyChain(h.d3, { ...h, anchor: makeAnchor({ serial: 1 }) }, { at }));
  refuses(K.ERR_REGISTRY_ROTATION_ANCHOR, () => verifyChain(h.d3, { ...h, anchor: makeAnchor({}, makeKey(ROOT.keyId)) }, { at }));
  const anchorFor = (key) => makeAnchor({ operational: operational(key) });
  refuses(K.ERR_REGISTRY_ROTATION_ANCHOR, () => verifyChain(h.d3, { ...h, anchor: anchorFor(GALERINA) }, { at }));
});

test("the selected delegation must be part of the supplied chain and bound to the policy", () => {
  const h = healthy();
  refuses(K.ERR_REGISTRY_ROTATION_CHAIN, () => verifyChain(h.d4, { ...h, delegations: [h.d3] }));
  const otherPolicy = makePolicy({ serial: 2 });
  refuses(K.ERR_REGISTRY_ROTATION_CHAIN, () => verifyChain(h.d4, { ...h, policy: otherPolicy }));
  // Not yet active / expired delegation.
  refuses(K.ERR_REGISTRY_ROTATION_NOT_ACTIVE, () => verifyChain(h.d4, h, { at: iso(T(D4_START) - DAY) }));
  refuses(K.ERR_REGISTRY_ROTATION_NOT_ACTIVE, () => verifyChain(h.d4, h, { at: iso(T(D4_END) + DAY) }));
  // A broken earlier link breaks every later link.
  const badD3 = { ...h.d3, serial: 3, notAfter: iso(T(D3_END) + DAY) };
  refuses(K.ERR_REGISTRY_ROTATION_BAD_SIGNATURE, () => verifyChain(h.d4, { ...h, delegations: [badD3, h.d4] }));
});

test("policy and delegation formats are closed and strictly validated", () => {
  assert.throws(() => makePolicy({ issuer: { ...policyInput().issuer, keyId: ROOT.keyId } }), /issuer key must differ/);
  assert.throws(() => makePolicy({ firstRotation: { fromKeyId: SLIDE.keyId, toKeyId: "bbbbbbbbbbbbbbbb" } }), /pinned/);
  assert.throws(() => makePolicy({ deniedOperationalKeyIds: [] }), /deniedOperationalKeyIds/);
  assert.throws(() => makePolicy({ pinnedOperationalKeys: [], allowGeneratedKeyIds: false, firstRotation: null,
    deniedOperationalKeyIds: [] }), /no operational key/);
  assert.throws(() => makePolicy({ allowedAlgorithms: ["ed25519"] }), /allowedAlgorithms/);
  assert.throws(() => makePolicy({ minOverlapSeconds: 31 * 86_400 }), /shorter/);
  assert.throws(() => makePolicy({ notBefore: "2026-10-28" }), /canonical/);
  assert.throws(() => makePolicy({ extra: 1 }), /unknown field/);
  const h = healthy();
  const withExtra = { ...h.d3, surprise: true };
  assert.throws(() => K.registryIssuedDelegationPreimage(withExtra), /unknown field/);
});

test("verdict functions: exact boundaries", () => {
  assert.equal(K.rotationLifetimeVerdict(100, 100), "ok");
  assert.equal(K.rotationLifetimeVerdict(101, 100), K.ERR_REGISTRY_ROTATION_LIFETIME);
  assert.equal(K.rotationOverlapVerdict(100, 100, false), "ok");
  assert.equal(K.rotationOverlapVerdict(99, 100, false), K.ERR_REGISTRY_ROTATION_OVERLAP);
  assert.equal(K.rotationOverlapVerdict(-1, 100, false), K.ERR_REGISTRY_ROTATION_GAP);
  assert.equal(K.rotationOverlapVerdict(500, 100, true), K.ERR_REGISTRY_ROTATION_ORDER);
  assert.equal(K.rotationSerialVerdict(5, 4), "ok");
  assert.equal(K.rotationSerialVerdict(4, 4), K.ERR_REGISTRY_ROTATION_SERIAL);
  assert.equal(K.rotationSerialVerdict(3, 4), K.ERR_REGISTRY_ROTATION_SERIAL);
  assert.equal(K.rotationRoleVerdict(2, 0), "ok");
  assert.equal(K.rotationRoleVerdict(0, 0), K.ERR_REGISTRY_ROTATION_MALFORMED);
  assert.equal(K.rotationRoleVerdict(2, 1), K.ERR_REGISTRY_ROTATION_ROLE);
});

test("scheduler extends the chain with the policy overlap and refuses to open a gap", () => {
  const h = healthy();
  const plan = K.planRegistryRotationWindow({
    policy: h.policy, predecessor: { serial: 3, notBefore: D3_START, notAfter: D3_END },
    now: "2027-01-20T00:00:00.000Z",
  });
  assert.equal(plan.serial, 4);
  assert.equal(plan.notBefore, D4_START);
  assert.equal(plan.notAfter, D4_END);
  assert.equal(plan.publishBy, D4_START);
  // Planned window passes the verifier's overlap rule.
  assert.equal(K.rotationOverlapVerdict(T(D3_END) - T(plan.notBefore), 7 * DAY, false), "ok");
  // Requested lifetime/overlap are clamped to the policy.
  const clamped = K.planRegistryRotationWindow({
    policy: h.policy, predecessor: { serial: 3, notBefore: D3_START, notAfter: D3_END },
    now: "2027-01-20T00:00:00.000Z", lifetimeSeconds: 999 * 86_400, overlapSeconds: 1,
  });
  assert.equal(clamped.notAfter, D4_END);
  assert.equal(clamped.notBefore, D4_START);
  // Too late to keep the minimum overlap -> GAP error, never a silent gap.
  refuses(K.ERR_REGISTRY_ROTATION_GAP, () => K.planRegistryRotationWindow({
    policy: h.policy, predecessor: { serial: 3, notBefore: D3_START, notAfter: D3_END },
    now: iso(T(D3_END) - 6 * DAY),
  }));
  // Issuing while the previous window is still far from expiry starts at the overlap point.
  const early = K.planRegistryRotationWindow({
    policy: h.policy, predecessor: { serial: 3, notBefore: D3_START, notAfter: D3_END },
    now: D3_START, overlapSeconds: 10 * 86_400,
  });
  assert.equal(early.notBefore, iso(T(D3_END) - 10 * DAY));
  // The policy window end clips the last delegation; once exhausted, refuse.
  const short = makePolicy({ notAfter: iso(T(D3_END) + 3 * DAY) });
  const clip = K.planRegistryRotationWindow({
    policy: short, predecessor: { serial: 3, notBefore: D3_START, notAfter: D3_END }, now: "2027-01-20T00:00:00.000Z",
  });
  assert.equal(clip.notAfter, iso(T(D3_END) + 3 * DAY));
  refuses(K.ERR_REGISTRY_ROTATION_POLICY_WINDOW, () => K.planRegistryRotationWindow({
    policy: short, predecessor: { serial: 5, notBefore: D4_START, notAfter: iso(T(D3_END) + 3 * DAY) },
    now: "2027-01-20T00:00:00.000Z",
  }));
});

test("planned windows always verify: a full simulated year of rotations never leaves a gap", () => {
  const policy = makePolicy();
  const anchor = makeAnchor();
  let predecessor = { serial: 2, notBefore: anchor.notBefore, notAfter: anchor.notAfter };
  const issued = [];
  let now = T("2027-01-11T15:45:00.000Z");
  for (let n = 0; n < 12; n += 1) {
    const plan = K.planRegistryRotationWindow({ policy, predecessor, now: iso(now) });
    const key = n === 0 ? GALERINA : makeKey();
    const d = issue(policy, { serial: plan.serial, issuedAt: plan.issuedAt, notBefore: plan.notBefore,
      notAfter: plan.notAfter, operational: operational(key) });
    issued.push(d);
    predecessor = { serial: d.serial, notBefore: d.notBefore, notAfter: d.notAfter };
    now = T(plan.notBefore) + 20 * DAY; // run the scheduler again 20 days into the new window
  }
  const last = issued[issued.length - 1];
  assert.equal(
    K.verifyRegistryIssuedDelegationChain(last, { policy, anchor, delegations: issued }, options({
      at: iso(T(last.notBefore) + DAY),
    })),
    "verified",
  );
});

test("end to end: the issued operational key signs a registry index the chain accepts", () => {
  const h = healthy();
  const opSigner = sign(OP4, "operational");
  const index = K.signRegistryIndexHybrid(
    K.buildRegistryIndex({ registry: REGISTRY, issuedAt: "2027-02-04T00:00:00.000Z", entries: [] }),
    OP4.keyId, opSigner.ed, opSigner.ml,
  );
  const base = {
    chain: { policy: h.policy, anchor: h.anchor, delegations: h.delegations },
    authority: options(),
    operationalPublicKeyFingerprints: { ed25519: OP4.edSha, mlDsa65: OP4.mlSha },
    verifyIndex: verifiersFor(OP4, "operational"),
  };
  assert.equal(K.verifyRegistryIndexUnderIssuedDelegation(index, h.d4, base), "verified");
  // Wrong public bytes for the operational key.
  refuses(K.ERR_REGISTRY_ROTATION_KEY_MISMATCH, () => K.verifyRegistryIndexUnderIssuedDelegation(index, h.d4,
    { ...base, operationalPublicKeyFingerprints: { ed25519: GALERINA.edSha, mlDsa65: GALERINA.mlSha } }));
  // An index signed by serial 3's key is not accepted under serial 4.
  const otherSigner = sign(GALERINA, "operational");
  const otherIndex = K.signRegistryIndexHybrid(
    K.buildRegistryIndex({ registry: REGISTRY, issuedAt: "2027-02-04T00:00:00.000Z", entries: [] }),
    GALERINA.keyId, otherSigner.ed, otherSigner.ml,
  );
  refuses(K.ERR_REGISTRY_ROTATION_KEY_MISMATCH, () => K.verifyRegistryIndexUnderIssuedDelegation(otherIndex, h.d4, base));
  // The same index verifies under serial 3's delegation only when signed by serial 3's key.
  const under3 = { ...base, authority: options({ at: iso(T(D3_START) + DAY) }),
    operationalPublicKeyFingerprints: { ed25519: GALERINA.edSha, mlDsa65: GALERINA.mlSha },
    verifyIndex: verifiersFor(GALERINA, "operational") };
  assert.equal(K.verifyRegistryIndexUnderIssuedDelegation(otherIndex, h.d3, under3), "verified");
});

test("tower-citizen exposes the two new verifier roles with distinct contexts", () => {
  assert.throws(() => createRegistryPublicVerifiers({ role: "nonsense", keyId: ROOT.keyId,
    ed25519PublicKeyPem: ROOT.pem, mlDsa65PublicKey: ROOT.ml.publicKey }), /role/);
  assert.ok(createPublicKey(ROOT.pem));
  const message = enc.encode("m");
  const s = sign(ROOT, "root");
  const rootAsPolicy = verifiersFor(ROOT, "rotationPolicy");
  assert.equal(rootAsPolicy.mlDsa65(message, s.ml(message), ROOT.keyId), false);
  assert.equal(verifiersFor(ROOT, "root").mlDsa65(message, s.ml(message), ROOT.keyId), true);
});