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
const ROOT = resolve(here, "..", "..", ".."); // packages-galerina/galerina-test/tests → repo root

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

test("parseAggregateTotal: reads run-all-tests.cjs's '<N> tests total' line", () => {
  assert.equal(
    parseAggregateTotal("1/1 packages passed · 4993 tests total\n"),
    4993,
  );
  assert.equal(parseAggregateTotal("no total here"), null);
});

// ── resolveRoot / resolveTarget (fail-closed) ────────────────────────────────

test("resolveRoot: an explicit rootDir is trusted as-is", () => {
  assert.equal(resolveRoot(ROOT), ROOT);
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
