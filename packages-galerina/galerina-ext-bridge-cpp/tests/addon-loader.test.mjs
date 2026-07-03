// =============================================================================
// addon-loader.test.mjs — RD-0238 P0: native-addon load is FAIL-CLOSED
// =============================================================================
// The fail-open (verified live at addon-loader.ts:66/:73, 2026-07-03): the SHA-256 pin check fired only
// when `expectedHash !== undefined`, so `loadNativeAddon()` (the sole caller's no-arg call) require()d
// any `.node` at a candidate path with ZERO verification = arbitrary native code execution (CWE-494/-347).
//
// These are SEC-mutant tests: they plant a dummy (NON-real) `.node` at the first candidate path and assert
// the loader REFUSES it before ever calling require(). The security paths (unpinned / mismatch) return
// before require(), so the dummy is never dlopened — the test cannot execute native code even if it wanted
// to. A regression that removes the fail-closed default makes test #1 fail (the un-fix can't silently merge).
//
// Clean-checkout note: there is normally no `.node`, so the suite hits the "no addon found → simulator"
// path and is unaffected; this test creates + removes its own dummy under build/Release.
// =============================================================================
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadNativeAddon } from "../dist/index.js";

// The loader's FIRST candidate path, derived the same way it does (relative to the package root).
const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BUILD_DIR = join(PKG_ROOT, "build");
const RELEASE_DIR = join(BUILD_DIR, "Release");
const ADDON_PATH = join(RELEASE_DIR, "bitnet_addon.node");

// A dummy that is NOT a real native module — enough to be found (existsSync) + hashed (readFileSync).
const DUMMY = Buffer.from("not-a-real-native-addon\n");
// Only remove build/ on cleanup if WE created it (never delete a real native build tree).
const buildPreexisted = existsSync(BUILD_DIR);

function plantDummy() {
  mkdirSync(RELEASE_DIR, { recursive: true });
  writeFileSync(ADDON_PATH, DUMMY);
}
function unplant() {
  try { rmSync(ADDON_PATH, { force: true }); } catch { /* ignore */ }
}
after(() => {
  unplant();
  if (!buildPreexisted) { try { rmSync(BUILD_DIR, { recursive: true, force: true }); } catch { /* ignore */ } }
});

// SEC-mutant #1 (the P0): a PRESENT but UNPINNED `.node` must be REFUSED, never require()d.
test("RD-0238: present + no pin ⇒ ERR_ADDON_UNPINNED, not loaded (no unverified require)", () => {
  plantDummy();
  try {
    const r = loadNativeAddon(); // no pin — exactly the sole caller's call shape
    assert.equal(r.loaded, false, `an unpinned present addon must NOT load\n${r.reason}`);
    assert.equal(r.verified, false);
    assert.match(r.reason, /ERR_ADDON_UNPINNED/, r.reason);
  } finally { unplant(); }
});

// #2: present + WRONG pin ⇒ mismatch refuse (also returns before require).
test("RD-0238: present + mismatched pin ⇒ ERR_ADDON_HASH_MISMATCH, not loaded", () => {
  plantDummy();
  try {
    const r = loadNativeAddon({ expectedHash: "0".repeat(64) });
    assert.equal(r.loaded, false);
    assert.match(r.reason, /ERR_ADDON_HASH_MISMATCH/, r.reason);
  } finally { unplant(); }
});

// #3: the audited dev opt-out BYPASSES the unpinned refusal (it reaches require(); the dummy is not a real
// `.node` so require throws → "failed to load" — but crucially NOT ERR_ADDON_UNPINNED).
test("RD-0238: allowUnverified:true is an audited opt-out that bypasses the unpinned gate", () => {
  plantDummy();
  try {
    const r = loadNativeAddon({ allowUnverified: true });
    assert.equal(r.loaded, false, "the dummy is not a real .node, so it cannot actually load");
    assert.doesNotMatch(r.reason, /ERR_ADDON_UNPINNED/, `opt-out must bypass the unpinned refusal\n${r.reason}`);
  } finally { unplant(); }
});

// #4: clean checkout (no `.node`) ⇒ simulator fallback, unaffected by the fix.
test("RD-0238: absent addon ⇒ no-addon-found (clean-checkout path unaffected)", () => {
  unplant();
  const r = loadNativeAddon();
  assert.equal(r.loaded, false);
  assert.match(r.reason, /no compiled native addon found/, r.reason);
});
