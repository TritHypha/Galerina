import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { verifyHash, verifyArtefacts, FUNGI_VERIFY_001, FUNGI_VERIFY_002, FUNGI_VERIFY_003, FUNGI_VERIFY_004, FUNGI_VERIFY_005 } from "../dist/index.js";

const digest = (s) => `sha256:${createHash("sha256").update(s).digest("hex")}`;
const codes = (r) => r.diagnostics.map((d) => d.code);

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "galerina-verify-"));
  mkdirSync(join(root, "build"));
  writeFileSync(join(root, "build", "runtime-manifest.json"), '{"a":1}');
  writeFileSync(join(root, "build", "build-hash.txt"), "abc");
  writeFileSync(join(tmpdir(), "galerina-verify-outside.txt"), "outside");
  return root;
}
const art = (path, hash, kind = "manifest") => ({ path, kind, hash, target: "wasm" });

test("verifyHash accepts matching bytes and reports mismatches, malformed hashes and missing files", async () => {
  const root = fixture();
  try {
    const ok = await verifyHash(art("build/runtime-manifest.json", digest('{"a":1}')), digest('{"a":1}'), root);
    assert.deepEqual([ok.verified, ok.hash, ok.diagnostics.length], [true, digest('{"a":1}'), 0]);
    assert.deepEqual(codes(await verifyHash(art("build/runtime-manifest.json", digest("x")), digest("x"), root)), [FUNGI_VERIFY_003]);
    for (const bad of ["", "sha256:ABC", `sha1:${"a".repeat(40)}`, digest("x").toUpperCase()]) {
      assert.deepEqual(codes(await verifyHash(art("build/runtime-manifest.json", bad), bad, root)), [FUNGI_VERIFY_001], bad);
    }
    assert.deepEqual(codes(await verifyHash(art("build/missing.json", digest("x")), digest("x"), root)), [FUNGI_VERIFY_002]);
    assert.deepEqual(codes(await verifyHash(art("build", digest("x")), digest("x"), root)), [FUNGI_VERIFY_002]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("verify entry points refuse malformed runtime values without throwing", async () => {
  const malformed = await verifyHash(null, digest("x"));
  assert.deepEqual([malformed.verified, codes(malformed)], [false, [FUNGI_VERIFY_004]]);
  const badPath = await verifyHash(art(17, digest("x")), digest("x"));
  assert.deepEqual([badPath.verified, codes(badPath)], [false, [FUNGI_VERIFY_004]]);
  assert.deepEqual(codes(await verifyArtefacts(null)), [FUNGI_VERIFY_005]);
  assert.deepEqual(codes(await verifyArtefacts([null])), [FUNGI_VERIFY_004]);
});

test("verifyHash refuses absolute paths, traversal and symlinks out of the root", async (t) => {
  const root = fixture();
  try {
    const outside = join(tmpdir(), "galerina-verify-outside.txt");
    for (const p of [outside, "../galerina-verify-outside.txt", "build/../../x", ""]) {
      assert.deepEqual(codes(await verifyHash(art(p, digest("outside")), digest("outside"), root)), [FUNGI_VERIFY_004], p);
    }
    try {
      symlinkSync(outside, join(root, "build", "link.txt"));
    } catch (err) {
      t.skip(`symlink creation refused on this host: ${err instanceof Error ? err.message : err}`);
      return;
    }
    assert.deepEqual(codes(await verifyHash(art("build/link.txt", digest("outside")), digest("outside"), root)), [FUNGI_VERIFY_004]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("verifyArtefacts needs a non-empty, duplicate-free set that all verifies", async () => {
  const root = fixture();
  try {
    const good = [art("build/runtime-manifest.json", digest('{"a":1}')), art("build/build-hash.txt", digest("abc"), "hash")];
    const ok = await verifyArtefacts(good, root);
    assert.equal(ok.success, true);
    assert.equal(ok.artefacts.length, 2);
    assert.ok(Object.isFrozen(ok) && Object.isFrozen(ok.artefacts));
    assert.deepEqual(codes(await verifyArtefacts([], root)), [FUNGI_VERIFY_005]);
    assert.deepEqual(codes(await verifyArtefacts([good[0], good[0]], root)), [FUNGI_VERIFY_005]);
    const oneBad = await verifyArtefacts([good[0], art("build/build-hash.txt", digest("abd"), "hash")], root);
    assert.deepEqual([oneBad.success, codes(oneBad)], [false, [FUNGI_VERIFY_003]]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
