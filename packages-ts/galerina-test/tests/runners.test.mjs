// Runner tests for @galerina/test.
//
// Hermetic: every runner is exercised against a CRAFTED tmp workspace with FAKE
// targets (a fake run-all-tests.cjs, a fake galerina.mjs, fake node:test corpora),
// so this suite is fast and — crucially — never recurses into the real heavy
// gates when run-all-tests itself runs this package. It proves the orchestration
// + fail-closed behaviour, not the underlying tools (those have their own suites).

import { test, after } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  utimesSync,
  readFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";

import {
  runUnit,
  runE2e,
  runConformance,
  runFidelity,
  runSlide,
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

function writeCompilerEvidence(root) {
  const tracked = spawnSync(
    "git",
    [
      "-C",
      root,
      "ls-files",
      "-z",
      "--",
      "packages-ts/galerina-core-compiler/src",
      "packages-ts/galerina-core-compiler/tests",
    ],
    { encoding: "utf8" },
  );
  assert.equal(tracked.status, 0, tracked.stderr);
  const trackedInputs = tracked.stdout.split("\0").filter(Boolean).sort();
  const hash = createHash("sha256");
  for (const path of trackedInputs) {
    hash.update(path);
    hash.update("\0");
    hash.update(readFileSync(join(root, path)));
    hash.update("\0");
  }
  w(
    root,
    "packages-ts/galerina-core-compiler/dist/build-evidence.json",
    JSON.stringify({
      schema: "galerina.compiler-build-evidence.v1",
      algorithm: "sha256",
      trackedInputs,
      inputDigest: hash.digest("hex"),
    }, null, 2) + "\n",
  );
}

/** A tmp workspace with every fake target present + a built "compiler dist". */
function fullWorkspace() {
  const root = mkdtempSync(join(tmpdir(), "fungi-test-full-"));
  after(() => { try { rmSync(root, { recursive: true, force: true }); } catch { /* best effort */ } });
  w(root, "galerina.workspace.json", JSON.stringify({ name: "fixture", packages: [] }));
  w(root, "scripts/run-all-tests.cjs", FAKE_UNIT);
  w(root, "galerina.mjs", FAKE_CLI);
  w(root, "tests/r6-corpus/r6-parity.test.mjs", PASSING_TEST);
  w(root, "packages-ts/galerina-core-compiler/tests/fidelity-differential.test.mjs", PASSING_TEST);
  w(root, "packages-ts/galerina-core-compiler/tests/slide-green.test.mjs", PASSING_TEST);
  w(root, "packages-ts/galerina-core-compiler/src/index.ts", "export {};\n");
  w(root, "packages-ts/galerina-core-compiler/dist/index.js", "export {};\n");
  w(root, "examples/good.fungi", "pure flow main() -> Int { return 0 }\n");
  w(root, "examples/bad.fungi", "pure flow main() -> Int { return 0 }\n");
  const init = spawnSync("git", ["init", "--quiet"], { cwd: root, encoding: "utf8" });
  assert.equal(init.status, 0, init.stderr);
  const add = spawnSync(
    "git",
    ["add", "--", "packages-ts/galerina-core-compiler/src", "packages-ts/galerina-core-compiler/tests"],
    { cwd: root, encoding: "utf8" },
  );
  assert.equal(add.status, 0, add.stderr);
  writeCompilerEvidence(root);
  return root;
}

/** A tmp workspace with ONLY the marker — every target is absent. */
function bareWorkspace() {
  const root = mkdtempSync(join(tmpdir(), "fungi-test-bare-"));
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
  const res = await runE2e({ rootDir: root, examples: ["examples/good.fungi"] });
  assert.equal(res.ok, true);
  assert.match(res.detail, /1\/1 examples checked clean/);
});

test("runE2e: one failing example fails the whole check", async () => {
  const root = fullWorkspace();
  const res = await runE2e({
    rootDir: root,
    examples: ["examples/good.fungi", "examples/bad.fungi"],
  });
  assert.equal(res.ok, false);
  assert.equal(res.exitCode, 1);
  assert.match(res.detail, /1\/2 examples failed/);
});

test("runE2e: a missing example file fails closed (not skipped)", async () => {
  const root = fullWorkspace();
  const res = await runE2e({ rootDir: root, examples: ["examples/nope.fungi"] });
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
  const res = await runE2e({ rootDir: root, examples: ["examples/good.fungi"], build: true });
  assert.equal(res.ok, true);
  assert.match(res.detail, /builded clean|build/);
});

test("DEFAULT_E2E_EXAMPLES is a non-empty, frozen-ish corpus", () => {
  assert.ok(Array.isArray(DEFAULT_E2E_EXAMPLES));
  assert.ok(DEFAULT_E2E_EXAMPLES.length >= 1);
  assert.equal(Object.isFrozen(DEFAULT_E2E_EXAMPLES), true);
  assert.throws(() => DEFAULT_E2E_EXAMPLES.push("mutated.fungi"), TypeError);
  const copy = [...DEFAULT_E2E_EXAMPLES];
  copy.push("caller-owned.fungi");
  assert.equal(DEFAULT_E2E_EXAMPLES.includes("caller-owned.fungi"), false);
});

// ── conformance ──────────────────────────────────────────────────────────────

test("runConformance: passes against a clean R6 corpus", async () => {
  const root = fullWorkspace();
  const res = await runConformance({ rootDir: root });
  assert.equal(res.ok, true);
  assert.equal(res.kind, "conformance");
});

test("runConformance: fail-closed when the corpus is absent", async () => {
  const root = bareWorkspace();
  const res = await runConformance({ rootDir: root });
  assert.equal(res.ok, false);
  assert.match(res.detail, /target not found/);
});

test("runConformance: propagates a failing corpus child", async () => {
  const root = fullWorkspace();
  const target = w(
    root,
    "tests/r6-corpus/red.test.mjs",
    `import { test } from "node:test"; test("red", () => { throw new Error("expected"); });\n`,
  );

  const res = await runConformance({ rootDir: root, corpus: target });

  assert.equal(res.ok, false);
  assert.equal(res.exitCode, 1);
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
  rmSync(join(root, "packages-ts/galerina-core-compiler/dist"), { recursive: true, force: true });
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

test("runFidelity: refuses tracked input drift even when its timestamp appears older", async () => {
  const root = fullWorkspace();
  const input = join(root, "packages-ts/galerina-core-compiler/src/index.ts");
  writeFileSync(input, "export const changedAfterBuild = true;\n");
  const past = new Date(Date.now() - 60_000);
  utimesSync(input, past, past);

  const res = await runFidelity({ rootDir: root });

  assert.equal(res.ok, false);
  assert.equal(res.exitCode, 1);
  assert.match(res.detail, /evidence.*mismatch.*build the compiler/i);
});

test("runFidelity: refuses missing deterministic build evidence", async () => {
  const root = fullWorkspace();
  rmSync(
    join(root, "packages-ts/galerina-core-compiler/dist/build-evidence.json"),
    { force: true },
  );

  const res = await runFidelity({ rootDir: root });

  assert.equal(res.ok, false);
  assert.equal(res.exitCode, 1);
  assert.match(res.detail, /build evidence.*missing/i);
});

test("runFidelity: refuses malformed deterministic build evidence", async () => {
  const root = fullWorkspace();
  w(
    root,
    "packages-ts/galerina-core-compiler/dist/build-evidence.json",
    "{}\n",
  );

  const res = await runFidelity({ rootDir: root });

  assert.equal(res.ok, false);
  assert.match(res.detail, /build evidence.*malformed/i);
});

test("runFidelity: refuses untracked compiler source/test inputs", async () => {
  const root = fullWorkspace();
  w(
    root,
    "packages-ts/galerina-core-compiler/src/untracked.ts",
    "export const hidden = true;\n",
  );

  const res = await runFidelity({ rootDir: root });

  assert.equal(res.ok, false);
  assert.match(res.detail, /untracked.*cannot be proven/i);
});

test("runFidelity: refuses when tracked-input freshness cannot be proven", async () => {
  const root = fullWorkspace();
  rmSync(join(root, ".git"), { recursive: true, force: true });

  const res = await runFidelity({ rootDir: root });

  assert.equal(res.ok, false);
  assert.equal(res.exitCode, 1);
  assert.match(res.detail, /freshness cannot be proven/i);
});

test("runFidelity: propagates a failing differential child", async () => {
  const root = fullWorkspace();
  const target = w(
    root,
    "packages-ts/galerina-core-compiler/tests/fidelity-red.test.mjs",
    `import { test } from "node:test"; test("red", () => { throw new Error("expected"); });\n`,
  );

  const res = await runFidelity({ rootDir: root, target });

  assert.equal(res.ok, false);
  assert.equal(res.exitCode, 1);
});

// ── SLIDE ────────────────────────────────────────────────────────────────────

test("runSlide: refuses an empty in-repo corpus", async () => {
  const root = fullWorkspace();
  rmSync(
    join(root, "packages-ts/galerina-core-compiler/tests/slide-green.test.mjs"),
    { force: true },
  );

  const res = await runSlide({ rootDir: root });

  assert.equal(res.ok, false);
  assert.equal(res.exitCode, 1);
  assert.match(res.detail, /empty SLIDE corpus/i);
});

test("runSlide: discovers only exact slide-*.test.mjs files", async () => {
  const root = fullWorkspace();
  w(
    root,
    "packages-ts/galerina-core-compiler/tests/not-slide-red.test.mjs",
    `import { test } from "node:test"; test("red", () => { throw new Error("must not run"); });\n`,
  );
  w(
    root,
    "packages-ts/galerina-core-compiler/tests/slide-decoy.mjs",
    `throw new Error("must not run");\n`,
  );

  const res = await runSlide({ rootDir: root });

  assert.equal(res.ok, true, JSON.stringify(res));
  assert.equal(res.counts?.tests, 1);
});

test("runSlide: propagates a failing SLIDE test", async () => {
  const root = fullWorkspace();
  w(
    root,
    "packages-ts/galerina-core-compiler/tests/slide-red.test.mjs",
    `import { test } from "node:test"; test("red", () => { throw new Error("expected"); });\n`,
  );

  const res = await runSlide({ rootDir: root });

  assert.equal(res.ok, false);
  assert.equal(res.exitCode, 1);
});

test("runSlide: reports optional independent evidence as a separate child", async () => {
  const root = fullWorkspace();
  w(root, "independent-slide/tests/reference.test.mjs", PASSING_TEST);

  const res = await runSlide({
    rootDir: root,
    independentRoot: "independent-slide",
  });

  assert.equal(res.ok, true, JSON.stringify(res));
  assert.equal(res.children?.length, 1);
  assert.equal(res.children[0].kind, "slide-independent");
  assert.equal(res.children[0].ok, true);
});

test("runSlide: missing independent evidence fails the combined result", async () => {
  const root = fullWorkspace();

  const res = await runSlide({
    rootDir: root,
    independentRoot: "missing-independent-slide",
  });

  assert.equal(res.ok, false);
  assert.equal(res.exitCode, 1);
  assert.equal(res.children?.[0]?.kind, "slide-independent");
  assert.equal(res.children?.[0]?.ok, false);
});

// ── all ──────────────────────────────────────────────────────────────────────

test("runAll: aggregates green children into a single pass", async () => {
  const root = fullWorkspace();
  // Point e2e at the fixture's own example (the default corpus targets the real
  // repo's examples/, which don't exist in this tmp workspace).
  const res = await runAll({ rootDir: root, examples: ["examples/good.fungi"] });
  assert.equal(res.kind, "all");
  assert.equal(res.ok, true, JSON.stringify(res));
  assert.equal(res.exitCode, 0);
  assert.equal(res.children?.length, 5);
  assert.ok(res.children.every((c) => c.ok));
  assert.ok(res.children.some((c) => c.kind === "slide"));
});

test("runAll: a failing child fails the aggregate (exit 1)", async () => {
  const root = fullWorkspace();
  // unit fails (plain-node child → reliable under nesting); everything else green.
  const res = await runAll({
    rootDir: root,
    examples: ["examples/good.fungi"],
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
