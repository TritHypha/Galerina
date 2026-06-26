// bridge-attestation-hybrid.test.mjs — #34: hybrid Ed25519 + ML-DSA-65 bridge attestation.
// Both signatures over the canonical manifest pre-image; verification requires BOTH (no
// downgrade). The ML-DSA half is bound to a per-surface FIPS-204 domain-separation context.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  StubTernaryBridge, AuditLogger, createHybridEngine,
  signManifest, verifyAttestation, attestBridge,
  signManifestHybrid, verifyAttestationHybrid, generateHybridAttestationKeypair, generateAttestationKeypair, attestBridgeHybrid,
} from "../dist/index.js";

const inMem = () => new AuditLogger(null);
const cid = (s) => `ATTH-${s}-${process.pid}-${Math.random().toString(36).slice(2, 7)}`;

test("hybrid: signs both halves and verifies both", async () => {
  const k = await generateHybridAttestationKeypair();
  const att = await signManifestHybrid(new StubTernaryBridge(inMem()).manifest, k.privateKeyPem, k.mlDsaPrivateKey);
  assert.ok(typeof att.signature === "string" && typeof att.mlDsaSignature === "string", "carries both signatures");
  assert.equal((await verifyAttestationHybrid(att, { publicKeyPem: k.publicKeyPem }, k.mlDsaPublicKey)).ok, true);
});

test("hybrid: tampered manifest fails closed", async () => {
  const k = await generateHybridAttestationKeypair();
  const att = await signManifestHybrid(new StubTernaryBridge(inMem()).manifest, k.privateKeyPem, k.mlDsaPrivateKey);
  const forged = { ...att, manifest: { ...att.manifest, hardwareIdentity: "evil-kernel" } };
  assert.equal((await verifyAttestationHybrid(forged, { publicKeyPem: k.publicKeyPem }, k.mlDsaPublicKey)).ok, false);
});

test("hybrid: wrong ML-DSA key fails (both signatures required)", async () => {
  const k = await generateHybridAttestationKeypair();
  const other = await generateHybridAttestationKeypair();
  const att = await signManifestHybrid(new StubTernaryBridge(inMem()).manifest, k.privateKeyPem, k.mlDsaPrivateKey);
  assert.equal((await verifyAttestationHybrid(att, { publicKeyPem: k.publicKeyPem }, other.mlDsaPublicKey)).ok, false);
});

test("hybrid: wrong Ed25519 key fails", async () => {
  const k = await generateHybridAttestationKeypair();
  const other = await generateHybridAttestationKeypair();
  const att = await signManifestHybrid(new StubTernaryBridge(inMem()).manifest, k.privateKeyPem, k.mlDsaPrivateKey);
  assert.equal((await verifyAttestationHybrid(att, { publicKeyPem: other.publicKeyPem }, k.mlDsaPublicKey)).ok, false);
});

test("hybrid: an Ed25519-only attestation is rejected by the hybrid verifier (no downgrade)", async () => {
  const ed = generateAttestationKeypair();
  const k = await generateHybridAttestationKeypair();
  const edOnly = signManifest(new StubTernaryBridge(inMem()).manifest, ed.privateKeyPem); // no mlDsaSignature
  assert.equal((await verifyAttestationHybrid(edOnly, { publicKeyPem: ed.publicKeyPem }, k.mlDsaPublicKey)).ok, false);
});

test("classical verifyAttestation still accepts the Ed25519 half of a hybrid attestation (backward compat)", async () => {
  const k = await generateHybridAttestationKeypair();
  const att = await signManifestHybrid(new StubTernaryBridge(inMem()).manifest, k.privateKeyPem, k.mlDsaPrivateKey);
  assert.equal(verifyAttestation(att, { requireSigned: true, publicKeyPem: k.publicKeyPem }).ok, true);
});

// ── ENFORCEMENT: the hybrid verifier is wired into the live admission gate ──
// (closes the adversarial-review MEDIUM: previously the engine called only the classical verifier).
test("engine ENFORCES hybrid: a hybrid bridge is permitted when mlDsaPublicKey is set in the policy", async () => {
  const k = await generateHybridAttestationKeypair();
  const hybridBridge = await attestBridgeHybrid(new StubTernaryBridge(inMem()), k.privateKeyPem, k.mlDsaPrivateKey);
  const eng = createHybridEngine({
    airGapped: true, governanceTier: 1,
    bridges: new Map([[hybridBridge.technique, hybridBridge]]),
    attestation: { requireSigned: true, publicKeyPem: k.publicKeyPem, mlDsaPublicKey: k.mlDsaPublicKey },
  });
  const r = await eng.infer({ prompt: "x", correlationId: cid("ok"), opClasses: ["feedforward"] });
  assert.notEqual(r.trapCode, "ERR_BRIDGE_UNATTESTED");
});

test("engine DENIES an Ed25519-only bridge under a hybrid-requiring policy (no PQ downgrade at admission)", async () => {
  const k = await generateHybridAttestationKeypair();
  const edOnly = attestBridge(new StubTernaryBridge(inMem()), k.privateKeyPem); // valid Ed25519, NO ML-DSA half
  const eng = createHybridEngine({
    airGapped: true, governanceTier: 1,
    bridges: new Map([[edOnly.technique, edOnly]]),
    attestation: { requireSigned: true, publicKeyPem: k.publicKeyPem, mlDsaPublicKey: k.mlDsaPublicKey },
  });
  const r = await eng.infer({ prompt: "x", correlationId: cid("deny"), opClasses: ["feedforward"] });
  assert.equal(r.trapCode, "ERR_BRIDGE_UNATTESTED");
});
