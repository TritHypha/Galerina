// ENV-ANCHOR-BETA host mode tests (gcw-k3u109). Mutant-killer for surviving host mutant HM9 "open mode ignored":
// written after the shim and recorded as such in the ENVANCHOR plan addendum. Synthetic .env files only.
// Zero-trust rule under test: the worse of the caller's typed modeClass and the shim's own lstat wins.
import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, mkdtempSync, rmSync, chmodSync, symlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";

const HERE = dirname(fileURLToPath(import.meta.url));
const HOST = join(HERE, "..", "..", "host", "env-anchor-beta-host.mjs");
const A = "EAB_SYNTH_KEY_A";
const B = "EAB_SYNTH_KEY_B";
const MANIFEST = [{ name: A, hexBytes: 32 }, { name: B, hexBytes: 16 }];

async function code(mod, opts) {
  try {
    await mod.loadEnvAnchorBeta(Object.assign({ manifest: MANIFEST, argv: [], modeClass: 0, faultProbe: () => false }, opts));
  } catch (e) {
    assert.ok(e instanceof mod.EnvAnchorRefused, "typed refusal");
    assert.equal(e.key, "", "file-level refusal names no key");
    return e.code;
  }
  return 100;
}

test("EA-H4 mode: own lstat beats the caller, UNKNOWN refuses, a link refuses", async () => {
  const mod = await import(pathToFileURL(HOST).href);
  const dir = mkdtempSync(join(tmpdir(), "eabmode-"));
  try {
    const p = join(dir, "synthetic.env");
    writeFileSync(p, A + "=" + randomBytes(32).toString("hex") + "\n" + B + "=" + randomBytes(16).toString("hex") + "\n");
    chmodSync(p, 0o600);
    assert.equal(await code(mod, { envPath: p }), 100, "owner-only file with caller 0 admits");
    assert.equal(await code(mod, { envPath: p, modeClass: 1 }), 180, "caller says open: refuse 180");
    assert.equal(await code(mod, { envPath: p, modeClass: 2 }), 181, "caller says UNKNOWN: refuse 181");
    chmodSync(p, 0o640);
    assert.equal(await code(mod, { envPath: p }), 180, "group-readable file refuses 180 even when the caller says 0");
    chmodSync(p, 0o604);
    assert.equal(await code(mod, { envPath: p }), 180, "world-readable file refuses 180 even when the caller says 0");
    chmodSync(p, 0o600);
    const link = join(dir, "link.env");
    symlinkSync(p, link);
    assert.equal(await code(mod, { envPath: link }), 181, "a symlink is not a regular file: refuse 181");
    assert.equal(await code(mod, { envPath: join(dir, "absent.env") }), 181, "a failed stat is UNKNOWN: refuse 181");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});