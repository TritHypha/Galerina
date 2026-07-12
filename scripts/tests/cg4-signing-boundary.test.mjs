// CG-4 signing-boundary tests for the BUNDLED CLI (galerina.mjs).
// cli.ts got this gate 2026-07-01 (c2a260d); galerina.mjs — the CLI that actually
// mints package manifests (`build --package`) — was proven 2026-07-02 to still
// hybrid-SIGN an artifact production-strict rejects (effects { totally.fake.effect }).
// These tests lock the mirrored gate: a lenient build of a production-violating
// package emits .wasm/.wat but NO .lmanifest/.lmanifest.json/.fuse.json (loudly);
// a clean package still mints its manifest.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const isWin = process.platform === "win32";

const tmp = mkdtempSync(join(tmpdir(), "fungi-cg4-"));
after(() => { try { rmSync(tmp, { recursive: true, force: true }); } catch { /* best effort */ } });

function makePkg(name, effectsClause) {
  const dir = join(tmp, name);
  mkdirSync(join(dir, "src"), { recursive: true });
  writeFileSync(join(dir, "package.fungi.json"), JSON.stringify({ name, entry: "src/index.fungi" }));
  writeFileSync(join(dir, "src", "index.fungi"), [
    "@version 1",
    "secure flow doThing(x: Int) -> Int",
    "contract {",
    `  intent "cg4 fixture"`,
    `  effects { ${effectsClause} }`,
    "}",
    "{",
    "  return x",
    "}",
    "",
  ].join("\n"));
  return dir;
}

function build(dir) {
  // cwd = ROOT so the dev signing key/env of the repo is used (same as real builds).
  return spawnSync("node", [join(ROOT, "galerina.mjs"), "build", "--package", dir],
    { cwd: ROOT, encoding: "utf8", timeout: 120_000, shell: isWin });
}

test("CG-4: lenient build of a production-violating package mints NO manifest (loudly)", () => {
  const dir = makePkg("cg4-violating", "totally.fake.effect");
  const r = build(dir);
  assert.equal(r.status, 0, `lenient build still compiles (wasm for inspection): ${r.stderr}`);
  assert.match(r.stdout + r.stderr, /CG-4 signing boundary/, "the refusal is loud, never silent");
  assert.ok(existsSync(join(dir, "dist", "cg4-violating.wasm")), ".wasm still emitted");
  assert.ok(!existsSync(join(dir, "dist", "cg4-violating.lmanifest")), "no CBOR manifest");
  assert.ok(!existsSync(join(dir, "dist", "cg4-violating.lmanifest.json")), "no JSON manifest");
  assert.ok(!existsSync(join(dir, "dist", "cg4-violating.fuse.json")), "no fusion descriptor without a manifest");
});

test("CG-4: a clean package still mints its manifest + fusion descriptor", () => {
  const dir = makePkg("cg4-clean", "");
  const r = build(dir);
  assert.equal(r.status, 0, `clean build must succeed: ${r.stderr}`);
  assert.ok(!/CG-4 signing boundary/.test(r.stdout + r.stderr), "no refusal for a clean package");
  assert.ok(existsSync(join(dir, "dist", "cg4-clean.lmanifest")), "CBOR manifest minted");
  assert.ok(existsSync(join(dir, "dist", "cg4-clean.lmanifest.json")), "JSON manifest minted");
  assert.ok(existsSync(join(dir, "dist", "cg4-clean.fuse.json")), "fusion descriptor minted");
});

test("CG-4: deny-only eval.execute blocks even the lenient build outright (integrity set)", () => {
  const dir = makePkg("cg4-denyonly", "eval.execute");
  const r = build(dir);
  assert.notEqual(r.status, 0, "deny-only fails the build at every profile");
  assert.match(r.stdout + r.stderr, /FUNGI-EFFECT-006/, "the deny-only code is named");
  assert.ok(!existsSync(join(dir, "dist", "cg4-denyonly.lmanifest")), "no manifest for a deny-only flow");
});
