import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPOSITORY_ROOT = resolve(PACKAGE_ROOT, "..", "..");
const GOVERNANCE = join(REPOSITORY_ROOT, "governance");
const AUTHORITY_CLI = join(REPOSITORY_ROOT, "scripts", "registry-authority-cli.mjs");
const ROOT_KEY_ID = "21415420b447e219";
const OPERATIONAL_KEY_ID = "f3172a48372bfb23";
const V1 = join(GOVERNANCE, `registry-delegation-${OPERATIONAL_KEY_ID}-v1.json`);
const V2 = join(GOVERNANCE, `registry-delegation-${OPERATIONAL_KEY_ID}-v2.json`);
const V2_UNSIGNED = join(
  GOVERNANCE,
  `registry-delegation-${OPERATIONAL_KEY_ID}-v2.unsigned.json`,
);

function load(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function verify(path, at, minSerial) {
  return spawnSync(process.execPath, [
    AUTHORITY_CLI,
    "verify",
    "--in", path,
    "--root-pubkey", join(GOVERNANCE, `signing-key-${ROOT_KEY_ID}.pub.pem`),
    "--root-mldsa65-pubkey", join(GOVERNANCE, `signing-key-${ROOT_KEY_ID}.mldsa.pub.b64`),
    "--root-key-id", ROOT_KEY_ID,
    "--at", at,
    "--min-serial", String(minSerial),
  ], { cwd: REPOSITORY_ROOT, encoding: "utf8", timeout: 60_000, windowsHide: true });
}

test("serial-1 and serial-2 delegations share one authority and overlap without a gap", () => {
  const v1 = load(V1);
  const v2 = load(V2);
  assert.equal(v1.serial, 1);
  assert.equal(v2.serial, 2);
  for (const key of ["schema", "registry", "rootKeyId", "operational", "roles"]) {
    assert.deepEqual(v2[key], v1[key], key);
  }
  assert.equal(v2.operational.keyId, OPERATIONAL_KEY_ID);
  assert.ok(Date.parse(v2.notBefore) <= Date.parse(v1.notAfter), "no gap between serials");
  assert.ok(Date.parse(v2.notAfter) > Date.parse(v1.notAfter));
  assert.ok(Date.parse(v2.notAfter) - Date.parse(v2.notBefore) <= 90 * 86_400_000);
});

test("the serial-2 unsigned draft is exactly the signed delegation without its root signature", () => {
  const { rootSignature, ...withoutSignature } = load(V2);
  assert.equal(typeof rootSignature, "object");
  assert.deepEqual(load(V2_UNSIGNED), withoutSignature);
});

test("serial-2 verifies inside its window and refuses outside it or below the floor", () => {
  const inside = verify(V2, "2026-10-28T00:00:00.000Z", 1);
  assert.equal(inside.status, 0, inside.stdout + inside.stderr);
  assert.match(inside.stdout, /VERIFIED delegation serial 2 for operational keyId 'f3172a48372bfb23'/);

  assert.equal(verify(V2, "2026-10-27T15:45:00.000Z", 1).status, 0);
  assert.equal(verify(V2, "2026-10-27T15:00:00.000Z", 1).status, 1, "not yet valid");
  assert.equal(verify(V2, "2027-01-25T15:45:00.001Z", 1).status, 1, "expired");
  assert.equal(verify(V2, "2026-10-28T00:00:00.000Z", 2).status, 1, "not newer than floor 2");
});

test("serial-1 stays valid through its own window and refuses after expiry", () => {
  assert.equal(verify(V1, "2026-10-28T15:45:00.000Z", 0).status, 0);
  assert.equal(verify(V1, "2026-10-28T15:45:00.001Z", 0).status, 1);
  assert.equal(verify(V1, "2026-10-28T00:00:00.000Z", 1).status, 1, "serial 1 is not newer than floor 1");
});