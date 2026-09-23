import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { join } from "node:path";
import { test } from "node:test";

const require = createRequire(import.meta.url);
const {
  loadProject,
  MAX_PROJECT_FILES,
  MAX_PROJECT_FILE_BYTES,
  MAX_PROJECT_DEPTH,
} = require("./galerina.js");

const TINY = "flow f() -> Int { return 1 }\n";

test("loadProject admits a small project under the budgets", () => {
  const root = mkdtempSync(join(tmpdir(), "galerina-ingest-ok-"));
  try {
    writeFileSync(join(root, "main.fungi"), TINY);
    const project = loadProject(root);
    assert.equal(project.files.length, 1);
    assert.equal(project.files[0].relativePath, "main.fungi");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("hostile: nesting deeper than MAX_PROJECT_DEPTH is refused", () => {
  const root = mkdtempSync(join(tmpdir(), "galerina-ingest-depth-"));
  try {
    let dir = root;
    for (let i = 0; i < MAX_PROJECT_DEPTH + 2; i++) {
      dir = join(dir, `d${i}`);
      mkdirSync(dir);
    }
    writeFileSync(join(dir, "deep.fungi"), TINY);
    assert.throws(() => loadProject(root), /nesting exceeds/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("hostile: a source file larger than MAX_PROJECT_FILE_BYTES is refused", () => {
  const root = mkdtempSync(join(tmpdir(), "galerina-ingest-size-"));
  try {
    writeFileSync(join(root, "huge.fungi"), Buffer.alloc(MAX_PROJECT_FILE_BYTES + 1));
    assert.throws(() => loadProject(root), /not an admitted regular file|exceeds/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
