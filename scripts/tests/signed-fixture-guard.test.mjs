// CG-7 cascade-guard tests (annotation→re-fuse→unsigned, owner-directed "both ends + detector").
// Subprocess + crafted tmp workspaces = tests the REAL end-to-end behavior:
//   1. the shared signed-manifest predicate (scripts/lib/signed-lmanifest.mjs)
//   2. the detector gate (audit-signed-fixture-drift.mjs --root) on a temp git repo
//   3. the writer guard: `galerina deps --all --write` must NEVER rewrite src
//      inside a SIGNED fusable package (and must rewrite an unsigned one).
//   4. the direct-invocation guard (CG-7 third end, owner-approved 2026-07-02):
//      `galerina build --package <signed>` refuses without --force; --force overrides.
// The rebuild guard (rebuild-fusable-packages.mjs) shares predicate 1 and forwards
// --force to the child build; its skip branch is exercised against the real repo by
// the phase-close cadence.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import { isRealSignedManifest, findFusablePackages } from "../lib/signed-lmanifest.mjs";

const SCRIPTS = join(dirname(fileURLToPath(import.meta.url)), "..");
const ROOT = join(SCRIPTS, "..");
const isWin = process.platform === "win32";

const REAL_SIG = { algorithm: "Ed25519", keyId: "deadbeefcafe0123", signature: "QUJDREVG", canon: "jcs" };

const tmp = mkdtempSync(join(tmpdir(), "fungi-signed-guard-"));
after(() => { try { rmSync(tmp, { recursive: true, force: true }); } catch { /* best effort */ } });

/** Lay down a fusable package: package.fungi.json + src flow + optional manifest. */
function makePkg(base, name, { signature } = {}) {
  const dir = join(base, name);
  mkdirSync(join(dir, "src"), { recursive: true });
  mkdirSync(join(dir, "dist"), { recursive: true });
  writeFileSync(join(dir, "package.fungi.json"), JSON.stringify({ name, entry: "src/index.fungi" }, null, 2));
  writeFileSync(join(dir, "src", "index.fungi"),
    "@version 1\npure flow lonely(x: Int) -> Int contract { effects {} } { return x }\n");
  if (signature !== undefined) {
    writeFileSync(join(dir, "dist", `${name}.lmanifest.json`),
      JSON.stringify({ schemaVersion: "fungi.lmanifest.v1", governanceSignature: signature }, null, 2));
  }
  return dir;
}

function git(cwd, ...args) {
  return spawnSync("git", args, { cwd, encoding: "utf8", timeout: 30_000, shell: isWin });
}
const gitAvailable = spawnSync("git", ["--version"], { encoding: "utf8", shell: isWin }).status === 0;

// ── 1. the shared predicate ────────────────────────────────────────────────
test("predicate: real signature → protected; placeholder/missing/absent → regenerable", () => {
  const base = join(tmp, "pred");
  const signed = makePkg(base, "sig-real", { signature: REAL_SIG });
  const placeholder = makePkg(base, "sig-placeholder", { signature: { ...REAL_SIG, signature: "placeholder:sha256:abc" } });
  const nosig = makePkg(base, "sig-none", { signature: null });
  const nomanifest = makePkg(base, "no-manifest", {});
  assert.equal(isRealSignedManifest(join(signed, "dist", "sig-real.lmanifest.json")), true);
  assert.equal(isRealSignedManifest(join(placeholder, "dist", "sig-placeholder.lmanifest.json")), false);
  assert.equal(isRealSignedManifest(join(nosig, "dist", "sig-none.lmanifest.json")), false);
  assert.equal(isRealSignedManifest(join(nomanifest, "dist", "no-manifest.lmanifest.json")), false);
});

test("predicate: existing-but-unreadable manifest → protected (deny-by-default)", () => {
  const base = join(tmp, "pred-broken");
  const dir = makePkg(base, "broken", {});
  writeFileSync(join(dir, "dist", "broken.lmanifest.json"), "{ not json !!");
  assert.equal(isRealSignedManifest(join(dir, "dist", "broken.lmanifest.json")), true);
});

test("findFusablePackages marks signed vs unsigned", () => {
  const base = join(tmp, "find");
  makePkg(base, "alpha", { signature: REAL_SIG });
  makePkg(base, "beta", {});
  const found = findFusablePackages([base]);
  const byName = new Map(found.map(p => [p.name, p.signed]));
  assert.equal(byName.get("alpha"), true);
  assert.equal(byName.get("beta"), false);
});

// ── 2. the detector gate on a temp git repo ───────────────────────────────
test("detector: clean signed package → exit 0; dirty signed → exit 1; dirty unsigned → exit 0",
  { skip: !gitAvailable && "git not available" }, () => {
  const repo = join(tmp, "detect-repo");
  mkdirSync(repo, { recursive: true });
  assert.equal(git(repo, "init", "-q").status, 0);
  const signed = makePkg(repo, "locked", { signature: REAL_SIG });
  const unsigned = makePkg(repo, "open", {});
  assert.equal(git(repo, "add", "-A").status, 0);
  assert.equal(git(repo, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "fixture").status, 0);

  const run = () => spawnSync("node", [join(SCRIPTS, "audit-signed-fixture-drift.mjs"), "--root", repo],
    { encoding: "utf8", timeout: 60_000, shell: isWin });

  assert.equal(run().status, 0, "clean tree must pass");

  writeFileSync(join(unsigned, "src", "index.fungi"),
    "pure flow lonely(x: Int) -> Int contract { effects {} } { return x }\n//fungi: IMPACT: (0)\n");
  assert.equal(run().status, 0, "drift in an UNSIGNED package is not CG-7's concern");

  writeFileSync(join(signed, "src", "index.fungi"),
    "//fungi: IMPACT: (0) — safe to delete\npure flow lonely(x: Int) -> Int contract { effects {} } { return x }\n");
  const red = run();
  assert.equal(red.status, 1, "drift in a SIGNED package must block");
  assert.match(red.stdout, /CG-7 signed-drift/, "finding names the rule");
});

// ── 3. the writer guard end-to-end (galerina deps --all --write) ──────────
test("writer guard: deps --all --write skips SIGNED package src, rewrites unsigned", () => {
  const base = join(tmp, "writer");
  const signed = makePkg(base, "sealed", { signature: REAL_SIG });
  const unsigned = makePkg(base, "plain", {});
  const sealedSrc = join(signed, "src", "index.fungi");
  const plainSrc = join(unsigned, "src", "index.fungi");
  const beforeSealed = readFileSync(sealedSrc, "utf8");
  const beforePlain = readFileSync(plainSrc, "utf8");

  const r = spawnSync("node", [join(ROOT, "galerina.mjs"), "deps", "--all", base, "--write"],
    { cwd: ROOT, encoding: "utf8", timeout: 120_000, shell: isWin });
  assert.equal(r.status, 0, `deps --all --write failed: ${r.stderr}`);

  assert.equal(readFileSync(sealedSrc, "utf8"), beforeSealed, "SIGNED package src must be byte-identical");
  assert.match(r.stdout, /🔒/, "the skip is reported, never silent");
  assert.notEqual(readFileSync(plainSrc, "utf8"), beforePlain, "unsigned package src gets its //fungi: block");
});

// ── 4. the direct-invocation guard: build --package refuses a SIGNED package ──
// tmpdir is NOT a git repo → exercises the fail-closed direction: when git cannot say
// whether the signed manifest is a committed ceremony artifact, the guard protects.
test("build --package refuses a SIGNED package without --force; --force overrides; unsigned builds freely", () => {
  const base = join(tmp, "direct-build");
  const signed = makePkg(base, "sealed-build", { signature: REAL_SIG });
  const unsigned = makePkg(base, "open-build", {});
  const build = (dir, ...extra) =>
    spawnSync("node", [join(ROOT, "galerina.mjs"), "build", "--package", dir, ...extra],
      { cwd: ROOT, encoding: "utf8", timeout: 120_000, shell: isWin });
  const REFUSAL = /Refusing to locally rebuild SIGNED/;

  // signed, no --force → refused BEFORE any compile; message names the rule; manifest untouched
  const manPath = join(signed, "dist", "sealed-build.lmanifest.json");
  const beforeMan = readFileSync(manPath, "utf8");
  const refused = build(signed);
  assert.equal(refused.status, 1, "signed package must be refused without --force");
  assert.match(refused.stderr + refused.stdout, REFUSAL, "refusal names the rule");
  assert.equal(readFileSync(manPath, "utf8"), beforeMan, "refusal must not touch the signed manifest");

  // signed, WITH --force → the CG-7 guard is bypassed (build proceeds; no refusal emitted)
  const forced = build(signed, "--force");
  assert.doesNotMatch(forced.stderr + forced.stdout, REFUSAL, "--force must bypass the direct-invocation guard");

  // unsigned, no --force → guard never fires; a valid package compiles
  const open = build(unsigned);
  assert.doesNotMatch(open.stderr + open.stdout, REFUSAL, "unsigned package must never trip the signed guard");
  assert.equal(open.status, 0, `unsigned package should build: ${open.stderr}`);
});

// ── 5. the git-tracked discriminator: committed fixture vs local dev artifact ──
// The CG-7 rule protects COMMITTED signed artifacts (the ceremony's). A real-signed but
// untracked/git-ignored manifest is a local dev rebuild (api-protocol-rest regenerates its
// own dist inside its tests) — refusing those would break legitimate dev workflows.
test("build --package: git-TRACKED signed manifest → refused; untracked dev-signed → builds",
  { skip: !gitAvailable && "git not available" }, () => {
  const repo = join(tmp, "direct-build-repo");
  mkdirSync(repo, { recursive: true });
  assert.equal(git(repo, "init", "-q").status, 0);
  const ceremony = makePkg(repo, "ceremony", { signature: REAL_SIG });
  const devlocal = makePkg(repo, "devlocal", { signature: REAL_SIG });
  // commit ceremony's manifest (committed fixture); leave devlocal fully untracked
  assert.equal(git(repo, "add", "ceremony").status, 0);
  assert.equal(git(repo, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "fixture").status, 0);

  const build = (dir) =>
    spawnSync("node", [join(ROOT, "galerina.mjs"), "build", "--package", dir],
      { cwd: ROOT, encoding: "utf8", timeout: 120_000, shell: isWin });
  const REFUSAL = /Refusing to locally rebuild SIGNED/;

  const refused = build(ceremony);
  assert.equal(refused.status, 1, "a git-tracked signed manifest is a committed fixture — must refuse");
  assert.match(refused.stderr + refused.stdout, REFUSAL);

  const allowed = build(devlocal);
  assert.doesNotMatch(allowed.stderr + allowed.stdout, REFUSAL,
    "an untracked dev-signed manifest is a local artifact — must NOT refuse");
  assert.equal(allowed.status, 0, `dev-signed local package should rebuild freely: ${allowed.stderr}`);
});
