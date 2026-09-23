import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const require = createRequire(import.meta.url);
const { formatProject } = require("./formatter.js");

test("hostile: fmt refuses to follow a source symlink and does not overwrite the target", (t) => {
  const parent = mkdtempSync(join(tmpdir(), "galerina-fmt-link-"));
  const root = join(parent, "proj");
  const outside = join(parent, "secret.fungi");
  try {
    mkdirSync(root, { recursive: true });
    writeFileSync(outside, "secure flow secret() -> Int {\nreturn 1\n}\n");
    const link = join(root, "main.fungi");
    try {
      symlinkSync(outside, link);
    } catch (err) {
      t.skip(`symlink creation refused: ${err instanceof Error ? err.message : err}`);
      return;
    }
    const project = {
      files: [{
        path: link,
        relativePath: "main.fungi",
        content: "secure flow secret() -> Int {\nreturn 1\n}\n",
      }],
    };
    assert.throws(() => formatProject(project), /symlink/);
    assert.match(readFileSync(outside, "utf8"), /return 1/);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});
