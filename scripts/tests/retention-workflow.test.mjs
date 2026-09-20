import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const WORKFLOW = readFileSync(
  new URL("../../.github/workflows/retention.yml", import.meta.url),
  "utf8",
);

test("retention workflow keeps build, per-commit and hosted dynamic boundaries", () => {
  assert.match(WORKFLOW, /^name: retention$/m);
  assert.match(WORKFLOW, /^  schedule:$/m);
  assert.match(WORKFLOW, /^  release:$/m);
  assert.match(WORKFLOW, /types: \[published\]/);
  assert.match(WORKFLOW, /^  workflow_dispatch: \{\}$/m);
  assert.match(WORKFLOW, /runner: ubuntu-24\.04/);
  assert.match(WORKFLOW, /runner: windows-2022/);
  assert.match(WORKFLOW, /runner: macos-14/);

  const build = WORKFLOW.indexOf("run: npm run build");
  const gate = WORKFLOW.indexOf("run: npm run audit:retention");
  assert.ok(build >= 0 && gate > build, "the per-commit gate must follow a fresh compiler build");

  assert.match(WORKFLOW, /node scripts\/audit-retention-nightly\.mjs/);
  assert.match(WORKFLOW, /if: always\(\)/);
  assert.match(WORKFLOW, /actions\/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5/);
  assert.match(WORKFLOW, /actions\/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020/);
});
