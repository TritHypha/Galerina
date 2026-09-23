import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { findSignedPackageRoots } from "../dist/index.js";

test("hostile: path-shaped package names do not freeze a signed root", () => {
  const root = mkdtempSync(join(tmpdir(), "signed-name-"));
  try {
    mkdirSync(join(root, "pkg", "dist"), { recursive: true });
    writeFileSync(join(root, "pkg", "package.fungi.json"), JSON.stringify({ name: "../escape" }));
    writeFileSync(join(root, "pkg", "dist", "..escape.lmanifest.json"), "{}");
    assert.deepEqual(findSignedPackageRoots(root), []);
    writeFileSync(join(root, "pkg", "package.fungi.json"), JSON.stringify({ name: "ok-name" }));
    assert.deepEqual(findSignedPackageRoots(root), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
