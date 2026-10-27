// Registry rotation CLI: end-to-end self-test with throwaway keys plus guard rails.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const cli = join(root, "scripts", "registry-rotation-cli.mjs");
const run = (...args) => spawnSync(process.execPath, [cli, ...args], { encoding: "utf8", cwd: root });

test("self-test runs the whole root -> policy -> issuer -> chain flow with throwaway keys", () => {
  const result = run("--self-test");
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.ok, true);
  assert.equal(report.steps.length >= 13, true);
  assert.equal(report.steps.every((s) => s.ok === true), true);
  // Private values are never printed.
  assert.doesNotMatch(result.stdout, /GALERINA_SIGNING_(PRIVATE|MLDSA)/);
  assert.doesNotMatch(result.stdout, /BEGIN [A-Z ]*PRIVATE KEY/);
});

test("keygen refuses an output directory inside the repository", () => {
  const result = run("keygen", "--out-dir", join(root, "governance", "never-here"));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /inside the repository/);
  assert.equal(existsSync(join(root, "governance", "never-here")), false);
});

test("keygen writes the env + public bundle outside the repo and refuses to overwrite", () => {
  const dir = join(mkdtempSync(join(tmpdir(), "rot-cli-test-")), "keys");
  const first = run("keygen", "--out-dir", dir, "--key-id", "0123456789abcdef");
  assert.equal(first.status, 0, first.stderr);
  assert.deepEqual(readdirSync(dir).sort(), [
    "galerina-signing-0123456789abcdef.env",
    "signing-key-0123456789abcdef.mldsa.pub.b64",
    "signing-key-0123456789abcdef.pub.pem",
  ]);
  assert.doesNotMatch(first.stdout, /GALERINA_SIGNING_|PRIVATE KEY/);
  const fp = run("fingerprint", "--pub-dir", dir, "--key-id", "0123456789abcdef");
  assert.equal(fp.status, 0, fp.stderr);
  assert.match(JSON.parse(fp.stdout).ed25519PublicKeySha256, /^[0-9a-f]{64}$/);
  const again = run("keygen", "--out-dir", dir, "--key-id", "0123456789abcdef");
  assert.notEqual(again.status, 0);
  assert.match(again.stderr, /EEXIST/);
  const bad = run("keygen", "--out-dir", dir, "--key-id", "NOT-A-KEY-ID");
  assert.notEqual(bad.status, 0);
});

test("unknown commands and repeated options are refused", () => {
  assert.notEqual(run("frobnicate").status, 0);
  const repeated = run("fingerprint", "--key-id", "a", "--key-id", "b");
  assert.notEqual(repeated.status, 0);
  assert.match(repeated.stderr, /repeats/);
});

test("the CLI source never reads key material outside the documented private-file loader", () => {
  const source = readFileSync(cli, "utf8");
  assert.doesNotMatch(source, /readFileSync\([^)]*\.env/);
  assert.equal((source.match(/readSigningEnvironment\(/g) ?? []).length, 2);
});