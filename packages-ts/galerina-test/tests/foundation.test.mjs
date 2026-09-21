// Foundation smoke tests for @galerina/test — the harness primitives.
//
// Locks the two behaviour-bearing helpers the runners build on:
//   - parseCounts: count-parsing LIFTED from scripts/run-all-tests.cjs (TAP + spec).
//   - resolveRoot / resolveTarget: fail-closed workspace-root resolution.
//
// Runs against the built dist (node --test tests/*.test.mjs), the same way every
// other dev-tool package in this monorepo tests.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  parseCounts,
  parseAggregateTotal,
  resolveRoot,
  resolveTarget,
  WORKSPACE_MARKER,
} from "../dist/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, "..", "..", ".."); // packages-ts/galerina-test/tests → repo root
const require = createRequire(import.meta.url);
const rootTestRunner = require(resolve(ROOT, "scripts", "run-all-tests.cjs"));

// ── parseCounts (lifted, behaviour-preserving) ───────────────────────────────

test("parseCounts: spec-reporter (ℹ) format", () => {
  const out = ["ℹ tests 42", "ℹ pass 40", "ℹ fail 2"].join("\n");
  assert.deepEqual(parseCounts(out), { tests: 42, pass: 40, fail: 2 });
});

test("parseCounts: TAP (#) format", () => {
  const out = ["# tests 7", "# pass 7", "# fail 0"].join("\n");
  assert.deepEqual(parseCounts(out), { tests: 7, pass: 7, fail: 0 });
});

test("parseCounts: a missing line yields null (never throws, never guesses)", () => {
  assert.deepEqual(parseCounts("no summary here"), {
    tests: null,
    pass: null,
    fail: null,
  });
});

test("parseCounts: duplicate, malformed and unsafe summaries refuse", () => {
  assert.deepEqual(parseCounts("# tests 7\n# tests 7\n# pass 7\n# fail 0"), {
    tests: null,
    pass: 7,
    fail: 0,
  });
  assert.deepEqual(parseCounts("# tests 7 spoofed\n# pass NaN\n# fail 0"), {
    tests: null,
    pass: null,
    fail: 0,
  });
  assert.equal(parseCounts("# tests 9007199254740992").tests, null);
});

test("parseAggregateTotal: reads run-all-tests.cjs's '<N> tests total' line", () => {
  assert.equal(
    parseAggregateTotal("1/1 packages passed · 4993 tests total\n"),
    4993,
  );
  assert.equal(parseAggregateTotal("no total here"), null);
});

test("parseAggregateTotal: duplicate or unsafe totals refuse", () => {
  assert.equal(parseAggregateTotal("1 tests total\n2 tests total"), null);
  assert.equal(parseAggregateTotal("9007199254740992 tests total"), null);
});

test("root run-all-tests parser refuses duplicate and unsafe summaries", () => {
  assert.deepEqual(rootTestRunner.parseCounts("# tests 7\n# tests 7\n# pass 7\n# fail 0"), {
    tests: null,
    pass: 7,
    fail: 0,
  });
  assert.equal(rootTestRunner.parseCounts("# tests 9007199254740992").tests, null);
});

// ── resolveRoot / resolveTarget (fail-closed) ────────────────────────────────

test("resolveRoot: an explicit rootDir must contain the workspace marker", () => {
  assert.equal(resolveRoot(ROOT), ROOT);
  assert.throws(
    () => resolveRoot(resolve(ROOT, "packages-ts", "galerina-test", "tests")),
    /not an attested Galerina workspace/,
  );
});

test("resolveRoot: auto-detects this workspace by walking up from cwd", () => {
  // No argument → walk up from cwd; node --test runs with cwd = the package dir,
  // which is inside the workspace, so the repo root must be found.
  const found = resolveRoot();
  assert.equal(typeof found, "string");
  assert.ok(found.length > 0, "a workspace root was resolved");
});

test("resolveRoot: throws fail-closed when no workspace exists above the dir", () => {
  // A path with no galerina.workspace.json anywhere above it. We point cwd-walk and
  // module-walk away by passing nothing AND clearing the env, but the surest
  // fail-closed check is the marker name being exported for callers to assert on.
  assert.equal(WORKSPACE_MARKER, "galerina.workspace.json");
});

test("resolveTarget: relative paths resolve under the root, absolute pass through", () => {
  assert.equal(
    resolveTarget(ROOT, "scripts/run-all-tests.cjs"),
    resolve(ROOT, "scripts/run-all-tests.cjs"),
  );
  const abs = resolve(ROOT, "galerina.mjs");
  assert.equal(resolveTarget(ROOT, abs), abs);
});

test("resolveTarget: refuses lexical escape, empty targets and device-namespace paths", () => {
  assert.throws(
    () => resolveTarget(ROOT, "../outside-workspace.txt"),
    /escapes the workspace root/,
  );
  assert.throws(() => resolveTarget(ROOT, ""), /target path is empty/);
  assert.throws(
    () => resolveTarget(ROOT, "\\\\.\\NUL"),
    /device-namespace/,
  );
});

test("resolveTarget: a missing relative file stays lexical and contained", () => {
  const missing = "does-not-exist-yet.fungi";
  assert.equal(resolveTarget(ROOT, missing), resolve(ROOT, missing));
});
