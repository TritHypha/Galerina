// OPEN-S2-3 (suite 45 build leftovers, recorded at merge checks s2mc2 ea77e9ce and s2r e8edc306).
// Suite 45 built the committed fixture echo.fungi under its own fixed name from two files and built
// proto-member.fungi under a fixed name, leaving build/echo.* and build/proto-member.* behind in the
// checkout after every run. The S2 harness rule (X-H1) is one unique mkdtemp build name per program,
// removed at exit. These guards pin that rule for every memory suite, statically and by a live run.
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";

const HERE = dirname(fileURLToPath(import.meta.url));
const TESTS = join(HERE, "..");
const REPO = join(HERE, "..", "..", "..", "..", "..");
const SUITE45 = join(TESTS, "45-host-adapter-audit");
const BUILD = join(REPO, "build");
const SELF = fileURLToPath(import.meta.url); // this guard quotes the old lines in S2-L45-03
const ARTIFACT = /join\(\s*REPO\s*,\s*"build"\s*,\s*"[^"]*\.(?:wasm|wat|lmanifest|lmanifest\.json|dot|svg)"\s*\)/u;
const COMMITTED_FIXTURE = /join\(\s*HERE\s*,\s*"[^"]+\.fungi"\s*\)/u;

function testFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...testFiles(full));
    else if (name.endsWith(".mjs")) out.push(full);
  }
  return out.sort();
}

function buildEntries() {
  if (!existsSync(BUILD)) return new Set();
  return new Set(readdirSync(BUILD).filter((n) => statSync(join(BUILD, n)).isFile()));
}

test("S2-L45-01 no memory suite reads a build artifact under a fixed literal name", () => {
  const hits = [];
  for (const file of testFiles(TESTS).filter((f) => f !== SELF)) {
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((line, i) => {
      if (ARTIFACT.test(line)) hits.push(relative(REPO, file) + ":" + (i + 1));
    });
  }
  assert.deepEqual(hits, [], "fixed build artifact names: " + hits.join(", "));
});

test("S2-L45-02 a suite that references a committed .fungi fixture builds it through uniqueFungiFile", () => {
  const bad = [];
  for (const file of testFiles(TESTS).filter((f) => f !== SELF)) {
    const text = readFileSync(file, "utf8");
    if (COMMITTED_FIXTURE.test(text) !== true) continue;
    if (text.includes("uniqueFungiFile(") !== true || text.includes("copyFileSync(") !== true) bad.push(relative(REPO, file));
  }
  assert.deepEqual(bad, [], "committed fixtures built in place: " + bad.join(", "));
});

test("S2-L45-03 the guards are live: the old suite 45 lines are caught", () => {
  assert.equal(ARTIFACT.test('    const wat = readFileSync(join(REPO, "build", "echo.wat"), "utf8");'), true);
  assert.equal(ARTIFACT.test('readFileSync(join(REPO, "build", "proto-member.wat"), "utf8")'), true);
  assert.equal(ARTIFACT.test('join(REPO, "build", "flow-registry", "flow-registry.json")'), false, "registry outputs are not per-program builds");
  assert.equal(ARTIFACT.test('join(REPO, "build", basename(ECHO, ".fungi") + ".wat")'), false);
  assert.equal(COMMITTED_FIXTURE.test('const ECHO = join(HERE, "echo.fungi");'), true);
});

test("S2-L45-04 suite 45 still ships its committed echo.fungi fixture and no other build target", () => {
  const fixtures = readdirSync(SUITE45).filter((n) => n.endsWith(".fungi"));
  assert.deepEqual(fixtures, ["echo.fungi"]);
});

test("S2-L45-05 a live run of the suite 45 build users leaves no new files in build/", () => {
  const before = buildEntries();
  const files = ["pre-begin-output.test.mjs", "live-intrinsics.test.mjs", "wrap-vectors.test.mjs"].map((n) => join(SUITE45, n));
  const r = spawnSync(process.execPath, ["--test", "--test-concurrency=1", ...files], {
    encoding: "utf8", cwd: REPO, timeout: 900000, maxBuffer: 50_000_000,
  });
  const text = (r.stdout || "") + (r.stderr || "");
  assert.equal(r.status, 0, "suite 45 must pass: " + text.slice(-4000));
  const after = buildEntries();
  const added = [...after].filter((n) => before.has(n) !== true).sort();
  assert.deepEqual(added, [], "suite 45 left build outputs behind");
  for (const fixed of ["echo.wat", "echo.wasm", "echo.lmanifest", "proto-member.wat", "proto-member.wasm"]) {
    if (before.has(fixed)) continue;
    assert.equal(after.has(fixed), false, "fixed-name build/" + fixed + " reappeared");
  }
});
