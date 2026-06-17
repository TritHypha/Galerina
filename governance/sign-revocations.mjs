#!/usr/bin/env node
/**
 * governance/sign-revocations.mjs — OWNER-RUN: self-sign the revocation registry.
 *
 * Makes governance/revocations.json tamper-evident: after signing, any edit that
 * is not re-signed by a valid (non-revoked) key fails the gate closed.
 *
 * An assistant CANNOT run this — it requires the offline signing private key.
 *
 * Usage (from repo root):
 *   LOGICN_SIGNING_KEY_ID=<id> LOGICN_SIGNING_KEY_PEM_PATH=path/to/private.pem \
 *     node governance/sign-revocations.mjs
 *   # or pass the PEM directly:
 *   LOGICN_SIGNING_KEY_ID=<id> LOGICN_SIGNING_KEY_PEM="$(cat private.pem)" \
 *     node governance/sign-revocations.mjs
 *
 * The signer key id MUST NOT be one of the revoked ids, and its public key must
 * exist at governance/signing-key-<id>.pub.pem so the gate can verify.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadRegistry, signRegistryObject } from "./revocation-registry.mjs";

const keyId = process.env.LOGICN_SIGNING_KEY_ID;
if (!keyId) {
  console.error("LOGICN_SIGNING_KEY_ID is required (the active signing key id).");
  process.exit(1);
}
const pemPath = process.env.LOGICN_SIGNING_KEY_PEM_PATH;
const pem = process.env.LOGICN_SIGNING_KEY_PEM ?? (pemPath ? readFileSync(pemPath, "utf-8") : null);
if (!pem) {
  console.error("Provide the private key via LOGICN_SIGNING_KEY_PEM or LOGICN_SIGNING_KEY_PEM_PATH.");
  process.exit(1);
}

const data = loadRegistry(".");
if (data === null) {
  console.error("governance/revocations.json not found.");
  process.exit(1);
}
if (data.revoked.some((e) => e && e.keyId === keyId)) {
  console.error(`Refusing to sign: ${keyId} is itself revoked. Sign with the current active key.`);
  process.exit(1);
}

const signed = signRegistryObject(data, pem, keyId);
writeFileSync(join(".", "governance", "revocations.json"), JSON.stringify(signed, null, 2) + "\n");
console.log(`Signed governance/revocations.json with key ${keyId}.`);
console.log("Verify: node -e \"import('./governance/revocation-registry.mjs').then(m=>console.log(m.assertRegistryTrustworthy('.')))\"");
