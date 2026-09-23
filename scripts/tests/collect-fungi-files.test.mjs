import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { collectFungiFiles } from "../../galerina.mjs";

test("collectFungiFiles returns files under the requested root", () => {
  const root = mkdtempSync(join(tmpdir(), "fungi-collect-ok-"));
  try {
    mkdirSync(join(root, "src"), { recursive: true });
    writeFileSync(join(root, "src", "a.fungi"), "pure flow a() -> Int { return 1 }\n");
    const files = collectFungiFiles(root);
    assert.equal(files.length, 1);
    assert.ok(files[0].endsWith("a.fungi"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("hostile: symlink into a file outside the root is not collected", (t) => {
  const root = mkdtempSync(join(tmpdir(), "fungi-collect-link-"));
  const outside = join(root, "..", `fungi-collect-outside-${process.pid}.fungi`);
  try {
    writeFileSync(outside, "pure flow x() -> Int { return 1 }\n");
    try {
      symlinkSync(outside, join(root, "escape.fungi"));
    } catch (err) {
      t.skip(`symlink creation refused on this host: ${err instanceof Error ? err.message : err}`);
      return;
    }
    const files = collectFungiFiles(root);
    assert.equal(files.length, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
    try { rmSync(outside, { force: true }); } catch { /* ignore */ }
  }
});
