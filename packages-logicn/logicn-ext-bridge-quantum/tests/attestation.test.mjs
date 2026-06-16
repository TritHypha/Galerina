// #199 Phase 1.5 — ffsim manifest attestation (CF-3/CF-7) via tower-citizen's hybrid path (#34).
// Ed25519 and hybrid Ed25519+ML-DSA-65 both admit; a hybrid policy rejects an Ed25519-only or
// tampered attestation (no PQ downgrade, fail-closed). Pure governance — no ffsim needed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildFfsimManifest, attestFfsimManifest, verifyFfsimAdmission } from "../dist/index.js";
import { generateAttestationKeypair, generateHybridAttestationKeypair } from "../../logicn-tower-citizen/dist/index.js";

const mkManifest = () => buildFfsimManifest({
  packageHash: "a".repeat(64), backendArtifactHash: "b".repeat(64), pinnedEnvHash: "c".repeat(64),
  ffsimVersion: "0.0.81.dev", tolerance: 1e-6, certificationProfile: "certified",
});

test("Tier-3 default: an Ed25519-only policy is REJECTED — hybrid mandatory (CRYPTO-002)", async () => {
  const k = generateAttestationKeypair();
  const att = await attestFfsimManifest(mkManifest(), k.privateKeyPem);
  const r = await verifyFfsimAdmission(att, { requireSigned: true, publicKeyPem: k.publicKeyPem });
  assert.equal(r.ok, false);
  assert.match(String(r.reason), /ERR_QUANTUM_PQ_REQUIRED/);
});

test("requireHybrid:false opts down to classical Ed25519 admission (non-Tier-3 callers)", async () => {
  const k = generateAttestationKeypair();
  const att = await attestFfsimManifest(mkManifest(), k.privateKeyPem);
  assert.equal((await verifyFfsimAdmission(att, { requireSigned: true, publicKeyPem: k.publicKeyPem, requireHybrid: false })).ok, true);
});

test("hybrid: attest → admit round-trip (both signatures present)", async () => {
  const k = await generateHybridAttestationKeypair();
  const att = await attestFfsimManifest(mkManifest(), k.privateKeyPem, k.mlDsaPrivateKey);
  assert.ok(typeof att.mlDsaSignature === "string", "carries the ML-DSA half");
  assert.equal((await verifyFfsimAdmission(att, { requireSigned: true, publicKeyPem: k.publicKeyPem, mlDsaPublicKey: k.mlDsaPublicKey })).ok, true);
});

test("hybrid policy REJECTS an Ed25519-only attestation (no PQ downgrade)", async () => {
  const k = await generateHybridAttestationKeypair();
  const edOnly = await attestFfsimManifest(mkManifest(), k.privateKeyPem); // no ML-DSA half
  assert.equal((await verifyFfsimAdmission(edOnly, { requireSigned: true, publicKeyPem: k.publicKeyPem, mlDsaPublicKey: k.mlDsaPublicKey })).ok, false);
});

test("a tampered manifest fails admission", async () => {
  const k = await generateHybridAttestationKeypair();
  const att = await attestFfsimManifest(mkManifest(), k.privateKeyPem, k.mlDsaPrivateKey);
  const forged = { ...att, manifest: { ...att.manifest, tolerance: 9.9 } };
  assert.equal((await verifyFfsimAdmission(forged, { requireSigned: true, publicKeyPem: k.publicKeyPem, mlDsaPublicKey: k.mlDsaPublicKey })).ok, false);
});

test("a missing attestation fails closed", async () => {
  const k = generateAttestationKeypair();
  assert.equal((await verifyFfsimAdmission(undefined, { requireSigned: true, publicKeyPem: k.publicKeyPem })).ok, false);
});
