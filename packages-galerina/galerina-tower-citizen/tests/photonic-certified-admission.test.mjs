// Certified-mode PHOTONIC admission. Certified mode normally bars the photonic lane (the dev emulator is an
// unattested tolerance backend). H5 fix (threat-model 2026-06-25): it is admitted ONLY when a SIGNED certified
// BridgeManifest cryptographically VERIFIES through the same hybrid path registry bridges use (Ed25519+ML-DSA)
// AND the sync preconditions hold. The self-declared booleans alone NEVER admit (closes the confused-deputy).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createHybridEngine, generateHybridAttestationKeypair, attestBridgeHybrid, StubTernaryBridge,
  signManifestHybrid,
} from "../dist/index.js";
import { createPhotonicRouterPort } from "../../galerina-ext-photonic-emulator/dist/index.js";
import { AuditEgress } from "../../galerina-core-sentinel-egress/dist/index.js";

let c = 0;
const dir = () => `build/cert-photonic-${process.pid}-${++c}`;
const realKey = Uint8Array.from({ length: 32 }, (_, i) => i + 1);
const fullGov = { approvedModels: ["bitnet_b1_58_2b"], maxNewTokens: 256, maxTokenCost: "GBP0.05", denyHostNativeFallback: true };
const { publicKeyPem, privateKeyPem, mlDsaPublicKey, mlDsaPrivateKey } = await generateHybridAttestationKeypair();
const attPolicy = { requireSigned: true, publicKeyPem, mlDsaPublicKey };
async function signedTernaryRegistry() {
  const b = await attestBridgeHybrid(new StubTernaryBridge(), privateKeyPem, mlDsaPrivateKey);
  return new Map([[b.technique, b]]);
}
const bigKernel = () => ({ n: 1024, lane: "photonic", tolerance: 0.05 });
const CALL = { prompt: "x", correlationId: "cp", model: "bitnet_b1_58_2b", maxNewTokens: 128, opClasses: ["embedding", "feedforward"] };

// H5 fix: certified photonic admission now requires a SIGNED certified BridgeManifest, verified through the
// SAME hybrid path registry bridges use — the self-declared booleans alone no longer admit. Build a real
// hybrid-signed certified manifest (same key as the bridge registry) for the happy-path test.
const CERTIFIED_MANIFEST = {
  bridgeId: "photonic-certified", packageName: "@galerina/tower-citizen", packageHash: "0".repeat(64),
  sourceEngine: "microsoft/BitNet", precision: "ternary", layoutVersion: "i2s-v1",
  hardwareIdentity: "photonic-certified-backend", determinismMode: "exact", certificationProfile: "certified",
};
const signedCertifiedManifest = await signManifestHybrid(CERTIFIED_MANIFEST, privateKeyPem, mlDsaPrivateKey);
const GOOD_ATTESTATION = { attested: true, certificationProfile: "certified", toleranceWitnessed: true, signedManifest: signedCertifiedManifest };
// The OLD fail-open shape: the three self-declared booleans with NO signed manifest. Must now be DENIED.
const SELF_DECLARED_ONLY = { attested: true, certificationProfile: "certified", toleranceWitnessed: true };

async function certifiedEngine(photonic) {
  return createHybridEngine({
    certified: true, auditEgress: new AuditEgress({ dir: dir(), batchSize: 8, hmacKey: realKey }),
    governance: fullGov, bridges: await signedTernaryRegistry(), attestation: attPolicy, photonic,
  });
}

test("certified + a VERIFIED attestation bound to the declared backend admits the photonic lane", async () => {
  // H5 binding: PhotonicConfig.bridgeId must match the verified manifest's bridgeId ("photonic-certified").
  const eng = await certifiedEngine({ router: createPhotonicRouterPort(), kernelFor: bigKernel, certifiedAttestation: GOOD_ATTESTATION, bridgeId: "photonic-certified" });
  const r = await eng.infer(CALL);
  assert.equal(r.trapFired, false);
  assert.ok(r.bridgesUsed.some((b) => b.startsWith("photonic:")), `expected a photonic: bridge, got ${JSON.stringify(r.bridgesUsed)}`);
});

test("certified + NO attestation keeps the photonic lane OFF (the safe default, unchanged)", async () => {
  const eng = await certifiedEngine({ router: createPhotonicRouterPort(), kernelFor: bigKernel }); // no certifiedAttestation
  const r = await eng.infer(CALL);
  assert.equal(r.trapFired, false);
  assert.ok(!r.bridgesUsed.some((b) => b.startsWith("photonic:")), `photonic must stay off; got ${JSON.stringify(r.bridgesUsed)}`);
  assert.ok(r.bridgesUsed.includes("stub-ternary"));
});

test("certified + an INVALID attestation fails closed (each of: unattested / wrong-profile / not-witnessed)", async () => {
  const invalids = [
    { attested: false, certificationProfile: "certified", toleranceWitnessed: true },   // not attested
    { attested: true, certificationProfile: "dev", toleranceWitnessed: true },           // dev profile
    { attested: true, certificationProfile: "certified", toleranceWitnessed: false },    // band not witnessed
  ];
  for (const certifiedAttestation of invalids) {
    const eng = await certifiedEngine({ router: createPhotonicRouterPort(), kernelFor: bigKernel, certifiedAttestation });
    const r = await eng.infer(CALL);
    assert.ok(!r.bridgesUsed.some((b) => b.startsWith("photonic:")),
      `invalid attestation ${JSON.stringify(certifiedAttestation)} must keep photonic OFF; got ${JSON.stringify(r.bridgesUsed)}`);
  }
});

test("H5 FAIL-CLOSED: self-declared booleans with NO signed manifest are DENIED (the confused-deputy fix)", async () => {
  // This is exactly the OLD fail-open: a caller asserts {attested,certified,witnessed} with no cryptographic
  // backing. It must no longer admit the photonic lane.
  const eng = await certifiedEngine({ router: createPhotonicRouterPort(), kernelFor: bigKernel, certifiedAttestation: SELF_DECLARED_ONLY });
  const r = await eng.infer(CALL);
  assert.ok(!r.bridgesUsed.some((b) => b.startsWith("photonic:")),
    `self-declared (unsigned) attestation must keep photonic OFF; got ${JSON.stringify(r.bridgesUsed)}`);
  assert.ok(r.bridgesUsed.includes("stub-ternary"));
});

test("H5 FAIL-CLOSED: a FORGED signature (wrong key) is DENIED", async () => {
  const other = await generateHybridAttestationKeypair();
  const forged = await signManifestHybrid(CERTIFIED_MANIFEST, other.privateKeyPem, other.mlDsaPrivateKey);
  const certifiedAttestation = { attested: true, certificationProfile: "certified", toleranceWitnessed: true, signedManifest: forged };
  const eng = await certifiedEngine({ router: createPhotonicRouterPort(), kernelFor: bigKernel, certifiedAttestation });
  const r = await eng.infer(CALL);
  assert.ok(!r.bridgesUsed.some((b) => b.startsWith("photonic:")),
    `a manifest signed by the wrong key must keep photonic OFF; got ${JSON.stringify(r.bridgesUsed)}`);
});

test("H5 FAIL-CLOSED: a validly-signed but NON-certified (dev) manifest is DENIED", async () => {
  const devManifest = { ...CERTIFIED_MANIFEST, certificationProfile: "dev" };
  const signedDev = await signManifestHybrid(devManifest, privateKeyPem, mlDsaPrivateKey);
  const certifiedAttestation = { attested: true, certificationProfile: "certified", toleranceWitnessed: true, signedManifest: signedDev };
  const eng = await certifiedEngine({ router: createPhotonicRouterPort(), kernelFor: bigKernel, certifiedAttestation });
  const r = await eng.infer(CALL);
  assert.ok(!r.bridgesUsed.some((b) => b.startsWith("photonic:")),
    `a signed-but-dev-profile manifest must keep photonic OFF; got ${JSON.stringify(r.bridgesUsed)}`);
});

test("H5 LANE-BINDING (RD-0129): a certified CPU-kernel coupon CANNOT admit the photonic lane", async () => {
  // The red-team repro: a VALIDLY hybrid-signed CERTIFIED manifest describing a CPU kernel (a sibling coupon a
  // real certified deployment holds in-process) lifted into certifiedAttestation. Must be REFUSED — it does not
  // describe a photonic backend (hardwareIdentity) and does not match the declared backend id (bridgeId).
  const cpuManifest = { ...CERTIFIED_MANIFEST, bridgeId: "real-fp16", hardwareIdentity: "x86_64-avx2", precision: "fp16" };
  const signedCpu = await signManifestHybrid(cpuManifest, privateKeyPem, mlDsaPrivateKey);
  const certifiedAttestation = { attested: true, certificationProfile: "certified", toleranceWitnessed: true, signedManifest: signedCpu };
  const eng = await certifiedEngine({ router: createPhotonicRouterPort(), kernelFor: bigKernel, certifiedAttestation, bridgeId: "photonic-certified" });
  const r = await eng.infer(CALL);
  assert.ok(!r.bridgesUsed.some((b) => b.startsWith("photonic:")),
    `a certified CPU coupon must keep photonic OFF; got ${JSON.stringify(r.bridgesUsed)}`);
  assert.ok(r.bridgesUsed.includes("stub-ternary"));
});

test("H5 LANE-BINDING (RD-0129): a certified photonic coupon for a DIFFERENT backend id is REFUSED", async () => {
  // A valid certified PHOTONIC manifest, but for backend "other-photonic" while the deployment declared
  // "photonic-certified". Coupon reuse across photonic backends must be refused (bridgeId binding).
  const otherManifest = { ...CERTIFIED_MANIFEST, bridgeId: "other-photonic", hardwareIdentity: "photonic-other-v0" };
  const signedOther = await signManifestHybrid(otherManifest, privateKeyPem, mlDsaPrivateKey);
  const certifiedAttestation = { attested: true, certificationProfile: "certified", toleranceWitnessed: true, signedManifest: signedOther };
  const eng = await certifiedEngine({ router: createPhotonicRouterPort(), kernelFor: bigKernel, certifiedAttestation, bridgeId: "photonic-certified" });
  const r = await eng.infer(CALL);
  assert.ok(!r.bridgesUsed.some((b) => b.startsWith("photonic:")),
    `a coupon for a different photonic backend must keep photonic OFF; got ${JSON.stringify(r.bridgesUsed)}`);
});

test("H5 LANE-BINDING (RD-0129): a valid certified photonic coupon with NO declared PhotonicConfig.bridgeId is REFUSED", async () => {
  // Without a declared backend id there is nothing to bind the coupon to → fail closed.
  const eng = await certifiedEngine({ router: createPhotonicRouterPort(), kernelFor: bigKernel, certifiedAttestation: GOOD_ATTESTATION }); // no bridgeId
  const r = await eng.infer(CALL);
  assert.ok(!r.bridgesUsed.some((b) => b.startsWith("photonic:")),
    `a coupon with no declared backend to bind to must keep photonic OFF; got ${JSON.stringify(r.bridgesUsed)}`);
});

test("0118 coupon-revocation: a REVOKED coupon (device-level) keeps photonic OFF, fail-closed", async () => {
  // A validly-signed, lane-bound certified coupon is still refused if the deployment device-revokes it
  // (e.g. the backend was decommissioned) — WITHOUT rotating the signing key. Parallel to key revocation.
  const base = { router: createPhotonicRouterPort(), kernelFor: bigKernel, certifiedAttestation: GOOD_ATTESTATION, bridgeId: "photonic-certified" };
  // revoked by bridgeId → OFF
  const revoked = await certifiedEngine({ ...base, couponRevocationCheck: (c) => c.bridgeId === "photonic-certified" });
  let r = await revoked.infer(CALL);
  assert.ok(!r.bridgesUsed.some((b) => b.startsWith("photonic:")), `a revoked coupon must keep photonic OFF; got ${JSON.stringify(r.bridgesUsed)}`);
  // a THROWING revocation registry → fail-closed (OFF)
  const throwing = await certifiedEngine({ ...base, couponRevocationCheck: () => { throw new Error("registry untrusted"); } });
  r = await throwing.infer(CALL);
  assert.ok(!r.bridgesUsed.some((b) => b.startsWith("photonic:")), `a throwing revocation registry must fail closed; got ${JSON.stringify(r.bridgesUsed)}`);
  // NOT revoked → admits (control)
  const live = await certifiedEngine({ ...base, couponRevocationCheck: () => false });
  r = await live.infer(CALL);
  assert.ok(r.bridgesUsed.some((b) => b.startsWith("photonic:")), `a non-revoked coupon should still admit; got ${JSON.stringify(r.bridgesUsed)}`);
});

test("control: NON-certified mode runs photonic without any attestation (existing behaviour unchanged)", async () => {
  const eng = createHybridEngine({ auditInMemory: true, photonic: { router: createPhotonicRouterPort(), kernelFor: bigKernel } });
  const r = await eng.infer({ ...CALL, correlationId: "np" });
  assert.ok(r.bridgesUsed.some((b) => b.startsWith("photonic:")), `non-certified photonic should run; got ${JSON.stringify(r.bridgesUsed)}`);
});
