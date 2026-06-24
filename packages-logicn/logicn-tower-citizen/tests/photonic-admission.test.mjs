// photonic-admission.test.mjs — T-as-signed-artifact admission rail (R&D 0108 #3).
//
// Proves the 4-gate fail-closed admission of a photonic-config blob (the matrix T) BEFORE a
// PPU reprogram: hash-pin, Ed25519 signature, revocation, photonic.reprogram capability. The
// rail admits ONLY a blob whose bytes match the signed manifest, signed by a non-revoked key,
// declaring + granted the reprogram capability. Every other path denies — crypto stays Binary.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  admitPhotonicConfig,
  signPhotonicConfig,
  photonicConfigHash,
  generatePhotonicConfigKeypair,
  PHOTONIC_REPROGRAM_CAP,
} from "../dist/index.js";

const BLOB = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);

function fixture(overrides = {}) {
  const { publicKeyPem, privateKeyPem } = generatePhotonicConfigKeypair();
  const manifest = {
    schemaVersion: "logicn.photonic-config.v1",
    name: "mesh-weights-v1",
    configSha256: photonicConfigHash(BLOB),
    capability: PHOTONIC_REPROGRAM_CAP,
    seam: "ppu.lane0",
    signerKeyId: "feedfacecafe0001",
    ...overrides.manifest,
  };
  const attestation = signPhotonicConfig(manifest, privateKeyPem);
  const policy = {
    publicKeyPem,
    grantedCapabilities: [PHOTONIC_REPROGRAM_CAP],
    ...overrides.policy,
  };
  return { publicKeyPem, privateKeyPem, manifest, attestation, policy };
}

test("admit: a correctly-signed config blob with the granted capability is ADMITTED", () => {
  const { attestation, policy } = fixture();
  const r = admitPhotonicConfig(BLOB, attestation, policy);
  assert.equal(r.admitted, true, r.reason);
  assert.equal(r.decision.authorized, true);
  assert.equal(r.configHash, photonicConfigHash(BLOB));
});

test("deny: hash mismatch — a tampered blob is refused (the signed manifest pins the exact T)", () => {
  const { attestation, policy } = fixture();
  const tampered = new Uint8Array([9, 9, 9, 9]);
  const r = admitPhotonicConfig(tampered, attestation, policy);
  assert.equal(r.admitted, false);
  assert.match(r.reason, /hash mismatch|tamper/i);
});

test("deny: a tampered manifest field breaks the signature", () => {
  const { attestation, policy } = fixture();
  const forged = { ...attestation, manifest: { ...attestation.manifest, seam: "ppu.lane7" } };
  const r = admitPhotonicConfig(BLOB, forged, policy);
  assert.equal(r.admitted, false);
  assert.match(r.reason, /hash mismatch|signature/i);
});

test("deny: signature from the wrong key fails verification", () => {
  const { attestation } = fixture();
  const other = generatePhotonicConfigKeypair();
  const r = admitPhotonicConfig(BLOB, attestation, { publicKeyPem: other.publicKeyPem, grantedCapabilities: [PHOTONIC_REPROGRAM_CAP] });
  assert.equal(r.admitted, false);
  assert.match(r.reason, /signature/i);
});

test("indeterminate: no attestation is undischarged (LLN-GOV-3VL-001), not admitted", () => {
  const { policy } = fixture();
  const r = admitPhotonicConfig(BLOB, undefined, policy);
  assert.equal(r.admitted, false);
  assert.equal(r.decision.verdict, 0, "INDETERMINATE");
  assert.equal(r.decision.diagnostic?.code, "LLN-GOV-3VL-001");
});

test("deny: a valid signature from a REVOKED key is refused", () => {
  const { attestation, policy, manifest } = fixture();
  const r = admitPhotonicConfig(BLOB, attestation, {
    ...policy,
    signerKeyId: manifest.signerKeyId,
    revocationCheck: (k) => k === manifest.signerKeyId,
  });
  assert.equal(r.admitted, false);
  assert.match(r.reason, /REVOKED/);
});

test("deny: a throwing revocation registry is fail-closed", () => {
  const { attestation, policy } = fixture();
  const r = admitPhotonicConfig(BLOB, attestation, {
    ...policy,
    revocationCheck: () => { throw new Error("registry tampered"); },
  });
  assert.equal(r.admitted, false);
  assert.match(r.reason, /could not be determined|fail-closed/i);
});

test("deny-by-default: capability not granted to the caller", () => {
  const { attestation, policy } = fixture();
  const r = admitPhotonicConfig(BLOB, attestation, { ...policy, grantedCapabilities: [] });
  assert.equal(r.admitted, false);
  assert.match(r.reason, /not granted/);
});

test("deny: manifest declaring the wrong capability", () => {
  const { privateKeyPem, publicKeyPem } = fixture();
  // hand-build a manifest that declares a different capability
  const manifest = {
    schemaVersion: "logicn.photonic-config.v1", name: "x", configSha256: photonicConfigHash(BLOB),
    capability: "network.outbound", seam: "ppu.lane0",
  };
  const attestation = signPhotonicConfig(manifest, privateKeyPem);
  const r = admitPhotonicConfig(BLOB, attestation, { publicKeyPem, grantedCapabilities: [PHOTONIC_REPROGRAM_CAP] });
  assert.equal(r.admitted, false);
  assert.match(r.reason, /is not/);
});

test("pin set: only an allow-listed config hash is admitted", () => {
  const { attestation, policy } = fixture();
  const hash = photonicConfigHash(BLOB);
  assert.equal(admitPhotonicConfig(BLOB, attestation, { ...policy, allowedHashes: ["sha256:deadbeef"] }).admitted, false);
  assert.equal(admitPhotonicConfig(BLOB, attestation, { ...policy, allowedHashes: [hash] }).admitted, true);
});

test("SOUNDNESS: across mutations of blob/sig/cap, admission requires ALL gates", () => {
  const { attestation, policy } = fixture();
  // baseline admits
  assert.equal(admitPhotonicConfig(BLOB, attestation, policy).admitted, true);
  // break each gate independently → never admitted
  assert.equal(admitPhotonicConfig(new Uint8Array([0]), attestation, policy).admitted, false);
  assert.equal(admitPhotonicConfig(BLOB, undefined, policy).admitted, false);
  assert.equal(admitPhotonicConfig(BLOB, attestation, { ...policy, grantedCapabilities: [] }).admitted, false);
});
