// registry-index-fuse-e2e.test.mjs — B5a END-TO-END: the REAL signed central index composed with the REAL fuse
// loader (task #72 / roadmap Phase-1 item 0: "add a forked-but-signed-package-REFUSED e2e test").
//
// Why this exists on top of the existing tests: `registry-index.test.mjs` proves the index module in ISOLATION,
// and `fuse-loader.test.mjs` proves the `registryCheck` seam with a STUB predicate (`() => ({ok:false})`). Neither
// proves the two COMPOSE — that `admitFromRegistry` over a genuinely-signed index, injected as the loader's
// registryCheck, actually refuses a real package at the real fuse gate. That composition IS the module header's
// load-bearing claim: "a central allow-list ON TOP of the per-manifest signature gate, so a validly self-signed but
// unlisted / forked package is rejected."
//
// The demo fuses with `allowUnsigned: true` — deliberately. That is the sharp version of the claim: a package that
// CLEARS (or sidesteps) the per-manifest signature gate must STILL be refused when the central index does not pin it.
// The central index is the second, independent lock.
import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { existsSync } from "node:fs";
import { generateKeyPairSync, sign as edSign, verify as edVerify } from "node:crypto";
import { fusePackage, buildRegistryIndex, signRegistryIndex, admitFromRegistry } from "../dist/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const DEMO_DIR = join(here, "..", "..", "..", "examples", "fuse-demo", "my-custom-api-rest");

const AUTH_KEY = "registry-authority-e2e";
const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const signFn = (message) => edSign(null, message, privateKey).toString("base64");
// Fail-closed verifier: an unknown authority keyId is "no-key" ⇒ the index is unverifiable ⇒ DENY.
const verifier = (message, sigB64, keyId) =>
  keyId !== AUTH_KEY ? "no-key" : edVerify(null, message, publicKey, Buffer.from(sigB64, "base64"));

const ISSUED_AT = "2026-07-15T00:00:00Z";           // caller-supplied — the module takes no wall-clock
const POLICY = { allowedLevels: ["certified"], maxRiskRating: "low" };

// Learn the demo's REAL identity (name/version/sourceHash) from the loader itself, so the index pins the hash the
// loader actually computes — never a hand-typed constant that could drift from the artifact.
let _identity;
async function demoIdentity() {
  if (_identity) return _identity;
  await fusePackage(DEMO_DIR, {
    allowUnsigned: true, warn: () => {},
    registryCheck: (pkg) => { _identity = { ...pkg }; return { ok: true }; },
  });
  return _identity;
}

const entryFor = (id, over = {}) => ({
  name: id.name, version: id.version, sourceHash: id.sourceHash,
  publisher: "galerina-certified", keyId: id.keyId ?? "pub-demo",
  certificationLevel: "certified", riskRating: "low", capabilities: [], effects: [],
  ...over,
});
const signedIndex = (entries) =>
  signRegistryIndex(buildRegistryIndex({ registry: "galerina-central", issuedAt: ISSUED_AT, entries }), AUTH_KEY, signFn);
// The composition under test: the real gate, injected exactly as the loader's docs prescribe.
const gateFor = (index, policy = POLICY) => (pkg) => admitFromRegistry(index, verifier, pkg, policy);

test("B5a e2e: a package PINNED in a validly-signed index fuses (the gate is not vacuous)", async () => {
  assert.ok(existsSync(join(DEMO_DIR, "dist", "my-custom-api-rest.wasm")), "demo must be built first");
  const id = await demoIdentity();
  const component = await fusePackage(DEMO_DIR, {
    allowUnsigned: true, warn: () => {},
    registryCheck: gateFor(signedIndex([entryFor(id)])),
  });
  assert.equal(component.name, "my-custom-api-rest", "pinned + policy-clean ⇒ admitted through the real registry gate");
});

test("B5a e2e: a FORKED package — same name@version, different bytes — is REFUSED (hash mismatch)", async () => {
  const id = await demoIdentity();
  // The index certifies name@version at a DIFFERENT sourceHash: the on-disk artifact is a fork of what was certified.
  // Its manifest gate is satisfied (allowUnsigned) — only the central pin catches it. This is the headline claim.
  const forkIndex = signedIndex([entryFor(id, { sourceHash: "sha256:" + "f0".repeat(32) })]);
  await assert.rejects(
    () => fusePackage(DEMO_DIR, { allowUnsigned: true, warn: () => {}, registryCheck: gateFor(forkIndex) }),
    /ERR_REGISTRY_HASH_MISMATCH|central registry refused/,
    "a forked-but-manifest-clean package must be refused by the pinned hash",
  );
});

test("B5a e2e: an UNLISTED package is REFUSED even though its manifest gate passes", async () => {
  const id = await demoIdentity();
  const otherOnly = signedIndex([entryFor(id, { name: "Some.Other.Package" })]);
  await assert.rejects(
    () => fusePackage(DEMO_DIR, { allowUnsigned: true, warn: () => {}, registryCheck: gateFor(otherOnly) }),
    /ERR_REGISTRY_PACKAGE_UNKNOWN|central registry refused/,
    "not in the central allow-list ⇒ refused",
  );
});

test("B5a e2e: an UNSIGNED central index refuses everything (the index itself must be signed)", async () => {
  const id = await demoIdentity();
  const unsigned = buildRegistryIndex({ registry: "galerina-central", issuedAt: ISSUED_AT, entries: [entryFor(id)] });
  await assert.rejects(
    () => fusePackage(DEMO_DIR, { allowUnsigned: true, warn: () => {}, registryCheck: gateFor(unsigned) }),
    /ERR_REGISTRY_INDEX_UNSIGNED|central registry refused/,
    "an unsigned index is worthless — fail-closed",
  );
});

test("B5a e2e: an index TAMPERED after signing is REFUSED (signature covers the entries)", async () => {
  const id = await demoIdentity();
  const good = signedIndex([entryFor(id)]);
  // Re-point the pinned hash AFTER signing, keeping the original signature — the classic tamper.
  const tampered = { ...good, entries: [{ ...good.entries[0], sourceHash: "sha256:" + "ab".repeat(32) }] };
  await assert.rejects(
    () => fusePackage(DEMO_DIR, { allowUnsigned: true, warn: () => {}, registryCheck: gateFor(tampered) }),
    /ERR_REGISTRY_INDEX_BAD_SIGNATURE|central registry refused/,
    "post-signing entry edit must fail verification",
  );
});

test("B5a e2e: an index signed by an UNKNOWN authority is REFUSED (no-key ⇒ deny, not skip)", async () => {
  const id = await demoIdentity();
  const wrongAuthority = signRegistryIndex(
    buildRegistryIndex({ registry: "galerina-central", issuedAt: ISSUED_AT, entries: [entryFor(id)] }),
    "some-other-authority", signFn,   // validly signed — but by a keyId the verifier does not trust
  );
  await assert.rejects(
    () => fusePackage(DEMO_DIR, { allowUnsigned: true, warn: () => {}, registryCheck: gateFor(wrongAuthority) }),
    /ERR_REGISTRY_INDEX_NO_KEY|central registry refused/,
    "an unverifiable authority is a DENY for the central index",
  );
});

test("B5a e2e: policy denial refuses a pinned package (level below the deployment's floor)", async () => {
  const id = await demoIdentity();
  const communityIndex = signedIndex([entryFor(id, { certificationLevel: "community" })]);
  await assert.rejects(
    () => fusePackage(DEMO_DIR, { allowUnsigned: true, warn: () => {}, registryCheck: gateFor(communityIndex) }),
    /ERR_REGISTRY_POLICY_DENIED|central registry refused/,
    "pinned but below the certification floor ⇒ refused",
  );
});
