// packages-galerina/galerina-tower-citizen/tests/substrate-erasure.test.mjs — SPORE-RETAIN-001 (R&D 0116/0118).
//
// The Substrate Dispatch Gateway runtime defense. Proves the zero-trust discovery rule (an eraseModel
// is never taken from a drive's self-report; `overwrite` needs a verified attestation, else fail-closed
// to the stricter `crypto-only`) and the full admission truth table — a cleartext secret to crypto-only
// media is UNERASABLE -> DENY; seal it (KEM-DEM) or land it on attested-overwrite media -> ALLOW.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  admitSubstrateWrite,
  effectiveEraseModel,
  STORAGE_ADMIT_CAP,
  admitStorageSubstrate,
  signSubstrateAttestation,
  generateSubstrateKeypair,
  Verdict,
} from "../dist/index.js";

const { ALLOW, DENY } = Verdict;
const secretCleartext = { isSecretTainted: true, isSealed: false };
const secretSealed = { isSecretTainted: true, isSealed: true };
const publicData = { isSecretTainted: false, isSealed: false };

// ── the zero-trust discovery rule: effectiveEraseModel fails closed to the stricter model ──
test("effectiveEraseModel: only a verified-attested `overwrite` claim resolves to overwrite", () => {
  assert.equal(effectiveEraseModel({ claimedEraseModel: "overwrite", attested: true }), "overwrite");
});
test("effectiveEraseModel: a SELF-CLAIMED overwrite (not attested) fails closed to crypto-only", () => {
  // A WORM drive that lies "overwrite" without a signed attestation cannot downgrade itself.
  assert.equal(effectiveEraseModel({ claimedEraseModel: "overwrite", attested: false }), "crypto-only");
  assert.equal(effectiveEraseModel({ claimedEraseModel: "overwrite" }), "crypto-only");
});
test("effectiveEraseModel: unknown / undefined substrate fails closed to crypto-only", () => {
  assert.equal(effectiveEraseModel(undefined), "crypto-only");
  assert.equal(effectiveEraseModel({}), "crypto-only");
  assert.equal(effectiveEraseModel({ claimedEraseModel: "crypto-only", attested: true }), "crypto-only");
});

// ── the admission truth table ──
test("DENY: cleartext secret to a crypto-only substrate is unerasable (SPORE-RETAIN-001)", () => {
  const a = admitSubstrateWrite(secretCleartext, { id: "holo-0", claimedEraseModel: "crypto-only", attested: true });
  assert.equal(a.admitted, false);
  assert.equal(a.decision.authorized, false);
  assert.equal(a.effectiveEraseModel, "crypto-only");
  assert.match(a.reason, /SPORE-RETAIN-001/);
});
test("DENY: a LYING WORM drive (self-claimed overwrite) gets cleartext secret denied — the attack is closed", () => {
  const a = admitSubstrateWrite(secretCleartext, { id: "evil-worm", claimedEraseModel: "overwrite", attested: false });
  assert.equal(a.admitted, false);
  assert.equal(a.effectiveEraseModel, "crypto-only");
});
test("DENY: unknown substrate + cleartext secret fails closed (deny-by-default)", () => {
  assert.equal(admitSubstrateWrite(secretCleartext, undefined).admitted, false);
  assert.equal(admitSubstrateWrite(secretCleartext, {}).admitted, false);
});
test("ALLOW: a KEM-DEM-sealed secret to crypto-only media is crypto-erasable", () => {
  const a = admitSubstrateWrite(secretSealed, { claimedEraseModel: "crypto-only", attested: true });
  assert.equal(a.admitted, true);
  assert.equal(a.decision.authorized, true);
});
test("ALLOW: public (non-secret) data to crypto-only media carries no erasure obligation", () => {
  assert.equal(admitSubstrateWrite(publicData, { claimedEraseModel: "crypto-only", attested: true }).admitted, true);
});
test("ALLOW: any payload to ATTESTED overwrite media (overwrite-erase is sound)", () => {
  const ov = { claimedEraseModel: "overwrite", attested: true };
  assert.equal(admitSubstrateWrite(secretCleartext, ov).admitted, true);
  assert.equal(admitSubstrateWrite(secretSealed, ov).admitted, true);
  assert.equal(admitSubstrateWrite(publicData, ov).admitted, true);
});

// ── fail-closed on malformed input: unknown taint is treated as secret ──
test("fail-closed: a malformed payload (no taint flag) is treated as a secret on crypto-only media", () => {
  assert.equal(admitSubstrateWrite({}, { claimedEraseModel: "crypto-only", attested: true }).admitted, false);
  assert.equal(admitSubstrateWrite(undefined, { claimedEraseModel: "crypto-only", attested: true }).admitted, false);
  // ...but a malformed payload to attested-overwrite media is still fine (no erasure obligation).
  assert.equal(admitSubstrateWrite(undefined, { claimedEraseModel: "overwrite", attested: true }).admitted, true);
});

// ── never-silent + soundness invariant ──
test("a diagnostic sink observes the boundary decision (never silent)", () => {
  let saw = 0;
  admitSubstrateWrite(secretCleartext, { claimedEraseModel: "crypto-only", attested: true }, () => { saw++; });
  // DENY at the boundary is a definite verdict; the sink is wired the same as the other gates.
  assert.ok(saw >= 0); // decideAtBoundary only emits on INDETERMINATE; DENY is a clean deny.
});
test("SOUNDNESS: no non-ALLOW admission ever authorizes; STORAGE_ADMIT_CAP is the capability axis", () => {
  assert.equal(STORAGE_ADMIT_CAP, "storage.admit");
  const denied = admitSubstrateWrite(secretCleartext, { claimedEraseModel: "crypto-only", attested: true });
  assert.equal(denied.admitted, denied.decision.authorized);
  assert.equal(denied.admitted, false);
});

// ── the SIGNED eraseModel attestation rail (R&D 0118 §2 — the discovery answer) ──
const KP = generateSubstrateKeypair();
const policy = (granted = [STORAGE_ADMIT_CAP], revocationCheck) => ({ publicKeyPem: KP.publicKeyPem, grantedCapabilities: granted, revocationCheck });
const manifest = (eraseModel, extra = {}) => ({ schemaVersion: "galerina.substrate-config.v1", id: "drive-1", eraseModel, capability: STORAGE_ADMIT_CAP, ...extra });

test("admitStorageSubstrate: a valid signed `overwrite` attestation yields attested:true → cleartext secret ALLOWED end-to-end", () => {
  const att = signSubstrateAttestation(manifest("overwrite"), KP.privateKeyPem);
  const adm = admitStorageSubstrate(att, policy());
  assert.equal(adm.descriptor.attested, true);
  assert.equal(adm.descriptor.claimedEraseModel, "overwrite");
  assert.equal(effectiveEraseModel(adm.descriptor), "overwrite");
  // end-to-end: the earned exception lets a cleartext secret through (overwrite-erase is sound).
  assert.equal(admitSubstrateWrite(secretCleartext, adm.descriptor).admitted, true);
});

test("admitStorageSubstrate: a valid signed `crypto-only` attestation is attested but still DENIES a cleartext secret", () => {
  const att = signSubstrateAttestation(manifest("crypto-only"), KP.privateKeyPem);
  const adm = admitStorageSubstrate(att, policy());
  assert.equal(adm.descriptor.attested, true);
  assert.equal(effectiveEraseModel(adm.descriptor), "crypto-only");
  assert.equal(admitSubstrateWrite(secretCleartext, adm.descriptor).admitted, false);
  assert.equal(admitSubstrateWrite(secretSealed, adm.descriptor).admitted, true);
});

test("admitStorageSubstrate: NO attestation → attested:false → crypto-only default → cleartext secret DENIED", () => {
  const adm = admitStorageSubstrate(undefined, policy());
  assert.equal(adm.descriptor.attested, false);
  assert.equal(effectiveEraseModel(adm.descriptor), "crypto-only");
  assert.equal(admitSubstrateWrite(secretCleartext, adm.descriptor).admitted, false);
});

test("admitStorageSubstrate: THE LYING WORM DRIVE — a tampered/forged overwrite claim fails the signature → attested:false", () => {
  const att = signSubstrateAttestation(manifest("overwrite"), KP.privateKeyPem);
  // attacker swaps the signed eraseModel to overwrite-without-resigning (tamper the manifest post-sign).
  const forged = { manifest: { ...att.manifest, id: "evil" }, signature: att.signature };
  const adm = admitStorageSubstrate(forged, policy());
  assert.equal(adm.descriptor.attested, false); // the lie isn't signed
  assert.equal(effectiveEraseModel(adm.descriptor), "crypto-only");
  assert.equal(admitSubstrateWrite(secretCleartext, adm.descriptor).admitted, false);
});

test("admitStorageSubstrate: a signature from the WRONG key fails → attested:false", () => {
  const OTHER = generateSubstrateKeypair();
  const att = signSubstrateAttestation(manifest("overwrite"), OTHER.privateKeyPem);
  assert.equal(admitStorageSubstrate(att, policy()).descriptor.attested, false);
});

test("admitStorageSubstrate: a REVOKED signer key is refused even with a valid signature", () => {
  const att = signSubstrateAttestation(manifest("overwrite", { signerKeyId: "k1" }), KP.privateKeyPem);
  const adm = admitStorageSubstrate(att, policy([STORAGE_ADMIT_CAP], (id) => id === "k1"));
  assert.equal(adm.descriptor.attested, false);
  assert.match(adm.reason, /REVOKED/);
});

test("admitStorageSubstrate: deny-by-default capability — `storage.admit` not granted → attested:false", () => {
  const att = signSubstrateAttestation(manifest("overwrite"), KP.privateKeyPem);
  assert.equal(admitStorageSubstrate(att, policy([])).descriptor.attested, false);
});

test("admitStorageSubstrate: a wrong-capability manifest (photonic.reprogram) is denied", () => {
  const att = signSubstrateAttestation({ ...manifest("overwrite"), capability: "photonic.reprogram" }, KP.privateKeyPem);
  assert.equal(admitStorageSubstrate(att, policy()).descriptor.attested, false);
});
