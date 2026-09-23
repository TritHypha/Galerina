import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { discoverChangedPaths } from "../src/git-changes.mjs";

test("Git discovery includes tracked byte changes and untracked paths exactly once", async () => {
  const root = await mkdtemp(join(tmpdir(), "galerina-impact-git-"));
  execFileSync("git", ["init", "-q"], { cwd: root });
  execFileSync("git", ["config", "user.email", "impact@example.invalid"], { cwd: root });
  execFileSync("git", ["config", "user.name", "Impact Test"], { cwd: root });
  await mkdir(join(root, "docs"), { recursive: true });
  await writeFile(join(root, "docs", "tracked.md"), "before\n");
  execFileSync("git", ["add", "."], { cwd: root });
  execFileSync("git", ["commit", "-qm", "fixture"], { cwd: root });
  await writeFile(join(root, "docs", "tracked.md"), "after\n");
  await writeFile(join(root, "docs", "untracked.md"), "new\n");

  assert.deepEqual(discoverChangedPaths(root, "HEAD"), [
    "docs/tracked.md",
    "docs/untracked.md",
  ]);
});

test("option-like Git bases are refused before exec", () => {
  assert.throws(() => discoverChangedPaths(process.cwd(), "--output=/tmp/pwn"), /Git base/);
  assert.throws(() => discoverChangedPaths(process.cwd(), "-c"), /Git base/);
  assert.throws(() => discoverChangedPaths(process.cwd(), ""), /Git base/);
});
