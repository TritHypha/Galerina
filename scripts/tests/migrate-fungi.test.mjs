import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, symlinkSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { admitMigrateTarget } from "../migrate-fungi.mjs";

test("admitMigrateTarget accepts a regular file", () => {
  const dir = mkdtempSync(join(tmpdir(), "mig-ok-"));
  const f = join(dir, "a.fungi");
  writeFileSync(f, "@version 1\n");
  try {
    assert.equal(admitMigrateTarget(f), true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("hostile: symlink targets are not admitted for rewrite", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "mig-link-"));
  const real = join(dir, "real.fungi");
  const link = join(dir, "link.fungi");
  writeFileSync(real, "@version 1\n");
  try {
    try { symlinkSync(real, link); } catch (err) {
      t.skip(`symlink refused: ${err instanceof Error ? err.message : err}`);
      return;
    }
    assert.equal(admitMigrateTarget(link), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
