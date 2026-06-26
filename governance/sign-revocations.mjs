#!/usr/bin/env node
/**
 * governance/sign-revocations.mjs — MAINTAINER-RUN: self-sign the revocation registry.
 *
 * This is NOT a per-developer step. Writing or running Galerina never requires it — it is a
 * project-maintainer action (like a CA signing a CRL): it makes governance/revocations.json
 * tamper-evident, so an edit that is not re-signed by the active key fails the gate closed.
 *
 * SAFE BY DEFAULT — NO key material on the command line. The key is read exactly the way
 * `galerina build` reads it: from .env.galerina-signing (created by `galerina keygen`, mode 0600,
 * git-ignored) as GALERINA_SIGNING_KEY_ID + GALERINA_SIGNING_PRIVATE_KEY_B64. Just run:
 *
 *     node governance/sign-revocations.mjs
 *
 * (If those vars are already exported in your shell they take precedence. Override the file
 *  location with GALERINA_SIGNING_ENV=<path> if your key file lives elsewhere.)
 *
 * PRODUCTION KEY CUSTODY: the plaintext .env.galerina-signing is a DEV stopgap. Production
 * should keep the signing key in an HSM / KMS / hardware token and sign via that API so the
 * raw private key never touches disk, env, the shell, or this process — open item #149.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { loadRegistry, signRegistryObject } from "./revocation-registry.mjs";

function readEnvFile(path) {
  const out = {};
  if (!existsSync(path)) return out;
  for (const line of readFileSync(path, "utf-8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

const envFile = process.env.GALERINA_SIGNING_ENV ?? ".env.galerina-signing";
const fileVars = readEnvFile(envFile);
const keyId = process.env.GALERINA_SIGNING_KEY_ID ?? fileVars.GALERINA_SIGNING_KEY_ID;
const keyB64 = process.env.GALERINA_SIGNING_PRIVATE_KEY_B64 ?? fileVars.GALERINA_SIGNING_PRIVATE_KEY_B64;

if (!keyId || !keyB64) {
  console.error(`No signing key found.`);
  console.error(`Expected ${envFile} (created by \`galerina keygen\`) to contain`);
  console.error(`  GALERINA_SIGNING_KEY_ID=... and GALERINA_SIGNING_PRIVATE_KEY_B64=...`);
  console.error(`or those vars exported in the shell. Do NOT pass the key on the command line.`);
  process.exit(1);
}

const privateKeyPem = Buffer.from(keyB64, "base64").toString("utf-8");

const data = loadRegistry(".");
if (data === null) {
  console.error("governance/revocations.json not found.");
  process.exit(1);
}
if (data.revoked.some((e) => e && e.keyId === keyId)) {
  console.error(`Refusing to sign: the signer key ${keyId} is itself revoked. Sign with the current active key.`);
  process.exit(1);
}

const signed = signRegistryObject(data, privateKeyPem, keyId);
writeFileSync(join(".", "governance", "revocations.json"), JSON.stringify(signed, null, 2) + "\n");
console.log(`Signed governance/revocations.json with key ${keyId}`);
console.log(`(key read from ${envFile} — nothing secret on the command line).`);
