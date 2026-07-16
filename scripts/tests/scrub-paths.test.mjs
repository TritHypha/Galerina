// scrub-paths.test.mjs — unit test for the leak genericizer extracted from kb-index.mjs (housekeeping trio,
// 2026-07-16). Before extraction scrub() ran only on-import, so its behaviour was AUDIT-covered (the path-leak
// gate is its end-to-end detector) but never unit-pinned; this locks each pattern class + the safe-token boundary.
import { test } from "node:test";
import assert from "node:assert/strict";
import { scrubPaths } from "../lib/scrub-paths.mjs";

test("scrubPaths: Windows user-home path → <path> (single and double backslash)", () => {
  assert.equal(scrubPaths("see C:\\Users\\alice\\GitHub\\x.ts here"), "see <path> here");
  assert.equal(scrubPaths("see C:\\\\Users\\\\bob\\\\y.md end"), "see <path> end");
});

test("scrubPaths: wwwprojects root → <path>", () => {
  assert.equal(scrubPaths("root wwwprojects\\galerina\\z done"), "root <path> done");
});

test("scrubPaths: percent-wrapped env-var literals → <env-var> (the windows-env-literal class)", () => {
  assert.equal(scrubPaths("path %USERPROFILE%\\.env"), "path <env-var>\\.env");
  assert.equal(scrubPaths("%APPDATA% and %LocalAppData%"), "<env-var> and <env-var>");
});

test("scrubPaths: SAFE tokens are untouched (no over-scrub)", () => {
  // A bare word `userprofile` (no %%) must NOT be genericized — it never trips the %-anchored gate.
  assert.equal(scrubPaths("the userprofile field"), "the userprofile field");
  // A placeholder / repo-relative path is already portable — left alone.
  assert.equal(scrubPaths("read <path>/a and packages-galerina/x/src/y.ts"), "read <path>/a and packages-galerina/x/src/y.ts");
  assert.equal(scrubPaths("~/notes and $HOME/x"), "~/notes and $HOME/x");
});

test("scrubPaths: idempotent (scrubbing an already-clean/scrubbed string is a no-op)", () => {
  const once = scrubPaths("C:\\Users\\me\\p and %USERNAME%");
  assert.equal(scrubPaths(once), once);
});

console.log("scrub-paths: all checks passed ✅");
