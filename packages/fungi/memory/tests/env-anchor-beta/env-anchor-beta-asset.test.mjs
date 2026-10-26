// ENV-ANCHOR-BETA host asset pin (RD-1413 critical path). RED FIRST (gcw-k3u109, 2026-10-26):
// red on 0d02905a7 because packages/fungi/memory/host/env-anchor-beta-host.mjs and its pinned
// packages/fungi/memory/host/env-anchor-beta.wasm do not exist yet.
// Zero-trust placement: the host shim takes every admit/refuse decision from ONE pinned WebAssembly build of the
// four native units (c-boundary, release-commit-point, secrets-provider-port, env-anchor-beta), instantiated
// in-process with NO imports, verified by sha256 before first use. Same pattern as the S5 secret-gate asset.
// Rejected options: spawning `galerina run` per has()/use() (I/O and a child process on the synchronous request
// path); re-deciding in JavaScript (two deciders = bypass); building at boot (unreviewable, unpinned artifact).
// Synthetic data only. NON_AUTHORIZING.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { uniqueFungiFile } from "../_harness/unique-build-name.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const MEM = join(HERE, "..", "..");
const REPO = join(MEM, "..", "..", "..");
const SRC = join(MEM, "src");
const GALERINA = join(REPO, "galerina.mjs");
const HOST = join(MEM, "host", "env-anchor-beta-host.mjs");
const ASSET = join(MEM, "host", "env-anchor-beta.wasm");
const UNITS = ["c-boundary", "release-commit-point", "secrets-provider-port", "env-anchor-beta"];
const FLOWS = ["envFileAdmit", "envKeyAdmit", "envAadAdmit", "envSecretAccess"];

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

// Same flattening as the native test: drop import lines and every @version header except the first.
function flatten() {
  let out = "";
  let i = 0;
  while (i < UNITS.length) {
    let t = readFileSync(join(SRC, UNITS[i] + ".fungi"), "utf8").split("\n").filter((l) => /^import\s+"/.test(l) === false).join("\n");
    if (i > 0) {
      t = t.replace(/^@version 1\s*$/m, "");
    }
    out = out + t + "\n";
    i = i + 1;
  }
  return out;
}

function freshBuild() {
  const dir = mkdtempSync(join(tmpdir(), "eabasset-"));
  const file = uniqueFungiFile(dir);
  const name = file.slice(dir.length + 1, -".fungi".length);
  writeFileSync(file, flatten());
  try {
    const r = spawnSync(process.execPath, [GALERINA, "build", file], { encoding: "utf8", cwd: REPO, timeout: 180000 });
    assert.equal(r.status, 0, "galerina build failed: " + (r.stdout || "") + (r.stderr || ""));
    const wasm = join(REPO, "build", name + ".wasm");
    assert.equal(existsSync(wasm), true, "build produced no wasm");
    return new Uint8Array(readFileSync(wasm));
  } finally {
    for (const f of readdirSync(join(REPO, "build"))) {
      if (f.startsWith(name + ".")) rmSync(join(REPO, "build", f), { force: true });
    }
    rmSync(dir, { recursive: true, force: true });
  }
}

test("EA-H1 host asset is pinned, imports nothing, exports the four flows, and is a reproducible build of the landed units", async () => {
  assert.equal(existsSync(HOST), true, "host shim missing: " + HOST);
  assert.equal(existsSync(ASSET), true, "pinned asset missing: " + ASSET);
  const mod = await import(pathToFileURL(HOST).href);
  const bytes = new Uint8Array(readFileSync(ASSET));
  assert.equal(mod.ENV_ANCHOR_BETA_WASM_SHA256, sha256(bytes), "pinned sha must match the shipped asset");
  const m = new WebAssembly.Module(bytes);
  assert.equal(WebAssembly.Module.imports(m).length, 0, "asset must import nothing");
  const names = WebAssembly.Module.exports(m).map((e) => e.name);
  for (const f of FLOWS) assert.ok(names.includes(f), "asset exports " + f);
  assert.equal(sha256(freshBuild()), sha256(bytes), "shipped asset must equal a fresh build of the four landed units");
});

test("EA-H2 the shim verifies the pin before use and never builds or spawns at runtime", () => {
  assert.equal(existsSync(HOST), true, "host shim missing: " + HOST);
  const src = readFileSync(HOST, "utf8");
  assert.ok(/createHash\(\s*"sha256"\s*\)/.test(src), "shim hashes the asset");
  assert.ok(src.includes("ENV_ANCHOR_BETA_WASM_SHA256"), "shim carries the pin");
  assert.ok(/Module\.imports\(/.test(src), "shim checks the asset imports");
  assert.equal(/child_process|spawn|galerina\.mjs/.test(src), false, "shim never spawns or builds");
});
// EA-H3 (gcw-k3u109 mutant-killer, written after the shim to kill surviving host mutant HM5 "skip the pin check";
// recorded as such in the ENVANCHOR plan addendum). A copy of the shim next to a still-valid but different
// asset (one extra custom section) must refuse 111 before any file is read.
test("EA-H3 a tampered but valid asset refuses 111 at load", async () => {
  const dir = mkdtempSync(join(tmpdir(), "eabtamper-"));
  try {
    writeFileSync(join(dir, "env-anchor-beta-host.mjs"), readFileSync(HOST));
    const bytes = readFileSync(ASSET);
    const tampered = Buffer.concat([bytes, Buffer.from([0x00, 0x02, 0x01, 0x78])]);
    assert.ok(WebAssembly.validate(tampered), "tampered asset is still a valid module");
    writeFileSync(join(dir, "env-anchor-beta.wasm"), tampered);
    const mod = await import(pathToFileURL(join(dir, "env-anchor-beta-host.mjs")).href);
    let err = null;
    try {
      await mod.loadEnvAnchorBeta({ envPath: join(dir, "absent.env"), manifest: [{ name: "EAB_SYNTH_KEY_A", hexBytes: 32 }], argv: [], modeClass: 0, faultProbe: () => false });
    } catch (e) {
      err = e;
    }
    assert.ok(err instanceof mod.EnvAnchorRefused, "tampered asset must refuse with the typed error");
    assert.equal(err.code, 111);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});