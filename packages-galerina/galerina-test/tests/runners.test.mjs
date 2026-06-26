// Runner tests for @galerina/test.
//
// Hermetic: every runner is exercised against a CRAFTED tmp workspace with FAKE
// targets (a fake run-all-tests.cjs, a fake galerina.mjs, fake node:test corpora),
// so this suite is fast and — crucially — never recurses into the real heavy
// gates when run-all-tests itself runs this package. It proves the orchestration
// + fail-closed behaviour, not the underlying tools (those have their own suites).

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";

import {
  runUnit,
  runE2e,
  runConformance,
  runFidelity,
  runAll,
  DEFAULT_E2E_EXAMPLES,
} from "../dist/index.js";

// ── fixture helpers ──────────────────────────────────────────────────────────

function w(root, rel, content) {
  const p = join(root, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, content);
  return p;
}

const FAKE_UNIT = [
  // Prints node:test-style counts, echoes its args, fails iff "boom" is requested.
  `const args = process.argv.slice(2);`,
  `process.stdout.write("\\u2139 tests 5\\n\\u2139 pass 5\\n\\u2139 fail 0\\n");`,
  `process.stdout.write("ARGS:" + JSON.stringify(args) + "\\n");`,
  `process.exit(args.includes("boom") ? 1 : 0);`,
].join("\n");

const FAKE_CLI = [
  // A fake `galerina` CLI: exits non-zero iff any arg path mentions "bad".
  `const args = process.argv.slice(2);`,
  `process.exit(args.some((a) => a.includes("bad")) ? 1 : 0);`,
].join("\n");

const PASSING_TEST = `import { test } from "node:test"; test("ok", () => {});\n`;

/** A tmp workspace with every fake target present + a built "compiler dist". */
function fullWorkspace() {
  const root = mkdtempSync(join(tmpdir(), "spore-test-full-"));
  after(() => { try { rmSync(root, { recursive: true, force: true }); } catch { /* best effort */ } });
  w(root, "galerina.workspace.json", JSON.stringify({ name: "fixture", packages: [] }));
  w(root, "scripts/run-all-tests.cjs", FAKE_UNIT);
  w(root, "galerina.mjs", FAKE_CLI);
  w(root, "tests/r6-corpus/r6-parity.test.mjs", PASSING_TEST);
  w(root, "packages-galerina/galerina-core-compiler/tests/fidelity-differential.test.mjs", PASSING_TEST);
  w(root, "packages-galerina/galerina-core-compiler/dist/index.js", "export {};\n");
  w(root, "examples/good.spore", "pure flow main() -> Int { return 0 }\n");
  w(root, "examples/bad.spore", "pure flow main() -> Int { return 0 }\n");
  return root;
}

/** A tmp workspace with ONLY the marker — every target is absent. */
function bareWorkspace() {
  const root = mkdtempSync(join(tmpdir(), "spore-test-bare-"));
  after(() => { try { rmSync(root, { recursive: true, force: true }); } catch { /* best effort */ } });
  w(root, "galerina.workspace.json", JSON.stringify({ name: "bare", packages: [] }));
  return root;
}

// ── unit ─────────────────────────────────────────────────────────────────────

test("runUnit: passes and parses the node:test counts from the child", async () => {
  const root = fullWorkspace();
  const res = await runUnit({ rootDir: root });
  assert.equal(res.kind, "unit");
  assert.equal(res.ok, true);
  assert.equal(res.exitCode, 0);
  assert.equal(res.counts?.tests, 5);
  assert.match(res.detail, /5 tests/);
});

test("runUnit: maps --core / --bail / packages into the child argv", async () => {
  const root = fullWorkspace();
  let out = "";
  const res = await runUnit({
    rootDir: root,
    core: true,
    bail: true,
    packages: ["galerina-core"],
    onOutput: (s) => (out += s),
  });
  assert.equal(res.ok, true);
  const argsLine = out.split("\n").find((l) => l.startsWith("ARGS:"));
  const args = JSON.parse(argsLine.slice("ARGS:".length));
  assert.deepEqual(args, ["--core", "--bail", "galerina-core"]);
});

test("runUnit: a failing child is reported ok:false (exit code is the verdict)", async () => {
  const root = fullWorkspace();
  const res = await runUnit({ rootDir: root, packages: ["boom"] });
  assert.equal(res.ok, false);
  assert.equal(res.exitCode, 1);
});

test("runUnit: fail-closed when the runner script is absent", async () => {
  const root = bareWorkspace();
  const res = await runUnit({ rootDir: root });
  assert.equal(res.ok, false);
  assert.equal(res.exitCode, 1);
  assert.match(res.detail, /target not found/);
});

// ── e2e ──────────────────────────────────────────────────────────────────────

test("runE2e: passes when every example compiles clean", async () => {
  const root = fullWorkspace();
  const res = await runE2e({ rootDir: root, examples: ["examples/good.spore"] });
  assert.equal(res.ok, true);
  assert.match(res.detail, /1\/1 examples checked clean/);
});

test("runE2e: one failing example fails the whole check", async () => {
  const root = fullWorkspace();
  const res = await runE2e({
    rootDir: root,
    examples: ["examples/good.spore", "examples/bad.spore"],
  });
  assert.equal(res.ok, false);
  assert.equal(res.exitCode, 1);
  assert.match(res.detail, /1\/2 examples failed/);
});

test("runE2e: a missing example file fails closed (not skipped)", async () => {
  const root = fullWorkspace();
  const res = await runE2e({ rootDir: root, examples: ["examples/nope.spore"] });
  assert.equal(res.ok, false);
});

test("runE2e: an empty corpus is a failure, not a vacuous pass", async () => {
  const root = fullWorkspace();
  const res = await runE2e({ rootDir: root, examples: [] });
  assert.equal(res.ok, false);
  assert.match(res.detail, /empty corpus/);
});

test("runE2e: --build uses the build verb", async () => {
  const root = fullWorkspace();
  const res = await runE2e({ rootDir: root, examples: ["examples/good.spore"], build: true });
  assert.equal(res.ok, true);
  assert.match(res.detail, /builded clean|build/);
});

test("DEFAULT_E2E_EXAMPLES is a non-empty, frozen-ish corpus", () => {
  assert.ok(Array.isArray(DEFAULT_E2E_EXAMPLES));
  assert.ok(DEFAULT_E2E_EXAMPLES.length >= 1);
});

// ── conformance ──────────────────────────────────────────────────────────────

test("runConformance: passes against a clean R6 corpus", async () => {
  const root = fullWorkspace();
  const res = await runConformance({ rootDir: root });
  assert.equal(res.ok, true);
  assert.equal(res.kind, "conformance");
});

// NOTE: the failure DIRECTION of runConformance/runFidelity (a non-zero child →
// ok:false) is NOT asserted here. Both spawn `node --test <corpus>`, and a
// `node --test` child spawned from a `node --test` PARENT (this suite) has its
// exit code swallowed to 0 — the same quirk scripts/tests/dev-tools-scripts.test.mjs
// documents. It is verified standalone (parent = plain node), and the
// exit-code-→-ok logic is identical to runUnit's, whose failure IS asserted
// above with a plain-node child. The fail-CLOSED paths below need no spawn and
// are reliable.

test("runConformance: fail-closed when the corpus is absent", async () => {
  const root = bareWorkspace();
  const res = await runConformance({ rootDir: root });
  assert.equal(res.ok, false);
  assert.match(res.detail, /target not found/);
});

// ── fidelity ─────────────────────────────────────────────────────────────────

test("runFidelity: passes when the differential + compiler dist are present", async () => {
  const root = fullWorkspace();
  const res = await runFidelity({ rootDir: root });
  assert.equal(res.ok, true);
  assert.equal(res.kind, "fidelity");
});

test("runFidelity: fail-closed prerequisite when the compiler dist is not built", async () => {
  const root = fullWorkspace();
  // Remove the built dist to simulate an unbuilt compiler.
  rmSync(join(root, "packages-galerina/galerina-core-compiler/dist"), { recursive: true, force: true });
  const res = await runFidelity({ rootDir: root });
  assert.equal(res.ok, false);
  assert.match(res.detail, /prerequisite missing/);
});

test("runFidelity: fail-closed when the differential target is absent", async () => {
  const root = bareWorkspace();
  const res = await runFidelity({ rootDir: root });
  assert.equal(res.ok, false);
  assert.match(res.detail, /target not found/);
});

// ── all ──────────────────────────────────────────────────────────────────────

test("runAll: aggregates green children into a single pass", async () => {
  const root = fullWorkspace();
  // Point e2e at the fixture's own example (the default corpus targets the real
  // repo's examples/, which don't exist in this tmp workspace).
  const res = await runAll({ rootDir: root, examples: ["examples/good.spore"] });
  assert.equal(res.kind, "all");
  assert.equal(res.ok, true);
  assert.equal(res.exitCode, 0);
  assert.equal(res.children?.length, 4);
  assert.ok(res.children.every((c) => c.ok));
});

test("runAll: a failing child fails the aggregate (exit 1)", async () => {
  const root = fullWorkspace();
  // unit fails (plain-node child → reliable under nesting); everything else green.
  const res = await runAll({
    rootDir: root,
    examples: ["examples/good.spore"],
    packages: ["boom"],
  });
  assert.equal(res.ok, false);
  assert.equal(res.exitCode, 1);
  assert.match(res.detail, /failed: .*unit/);
});

test("runAll: bailScope stops at the first failing check", async () => {
  const root = bareWorkspace(); // unit (first) fails-closed immediately
  const res = await runAll({ rootDir: root, bailScope: true });
  assert.equal(res.ok, false);
  assert.equal(res.children?.length, 1); // stopped after the first failure
  assert.equal(res.children[0].kind, "unit");
});
