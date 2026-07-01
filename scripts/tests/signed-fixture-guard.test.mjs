// CG-7 cascade-guard tests (annotation→re-fuse→unsigned, owner-directed "both ends + detector").
// Subprocess + crafted tmp workspaces = tests the REAL end-to-end behavior:
//   1. the shared signed-manifest predicate (scripts/lib/signed-lmanifest.mjs)
//   2. the detector gate (audit-signed-fixture-drift.mjs --root) on a temp git repo
//   3. the writer guard: `galerina deps --all --write` must NEVER rewrite src
//      inside a SIGNED fusable package (and must rewrite an unsigned one).
// The rebuild guard (rebuild-fusable-packages.mjs) shares predicate 1; its skip
// branch is exercised against the real repo by the phase-close cadence.
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
    "pure flow lonely(x: Int) -> Int contract { effects {} } { return x }\n");
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
