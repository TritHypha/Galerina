// symbol-usage-search.test.mjs - the read-only usage search groups by package/file/kind, covers every file
// type (incl. .md/.json/.fungi/.wat), excludes node_modules and build output, and its --check drift gate works.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { scan, classifyUse, packageOf, isExcludedPath, parseVsCodeExport, compareWithExport, PRESETS } from "../symbol-usage-search.mjs";

const TOOL = join(dirname(fileURLToPath(import.meta.url)), "..", "symbol-usage-search.mjs");

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "symbol-usage-"));
  const put = (rel, body) => { mkdirSync(dirname(join(root, rel)), { recursive: true }); writeFileSync(join(root, rel), body); };
  put("packages-ts/pkg-a/src/a.ts", "const v = new Float32Array(4);\nconst r = Math.fround(0.1);\n");
  put("packages-ts/pkg-a/README.md", "Float32Array storage is binary32\n");
  put("packages-ts/pkg-b/plan.json", "{ \"jsTypedArray\": \"Float32Array\" }\n");
  put("examples/x.fungi", "// Float16Array is not used here\n");
  put("examples/y.wat", ";; f32 Math.f16round reference\n");
  put("node_modules/dep/index.js", "new Float32Array(1)\n");
  put("packages-ts/pkg-a/dist/a.js", "new Float32Array(1)\n");
  put("build/out.json", "\"Float32Array\"\n");
  put("bin.dat", Buffer.from([0x46, 0x6c, 0x6f, 0x61, 0x74, 0x00, 0x33, 0x32]));
  return root;
}

test("classifyUse and packageOf", () => {
  assert.equal(classifyUse("a.ts", "const v = new Float32Array(4);"), "typed-array-construct");
  assert.equal(classifyUse("a.ts", "return Math.fround(x);"), "rounding-call");
  assert.equal(classifyUse("a.ts", "  [\"Float32\", \"Float32Array\"],"), "string-literal");
  assert.equal(classifyUse("a.ts", "// Float32Array note"), "comment");
  assert.equal(classifyUse("a.md", "new Float32Array()"), "documentation");
  assert.equal(classifyUse("r.json", "\"Float32Array\""), "data");
  assert.equal(classifyUse("a.ts", "if (x instanceof Float32Array) {"), "type-reference");
  assert.equal(packageOf("packages-ts/galerina-core-compiler/src/x.ts"), "galerina-core-compiler");
  assert.equal(packageOf("packages-galerina/galerina-core/x.md"), "galerina-core");
  assert.equal(packageOf("scripts/x.mjs"), "scripts");
  assert.equal(isExcludedPath("a/node_modules/b.js"), true);
  assert.equal(isExcludedPath("packages-ts/p/dist/x.js"), true);
  assert.equal(isExcludedPath("packages-ts/p/src/x.ts"), false);
});

test("scan covers every file type, excludes node_modules/build output, skips binary, groups by package", () => {
  const root = fixture();
  try {
    const r = scan(root, PRESETS["float-width"]);
    const paths = r.packages.flatMap((p) => p.files.map((f) => f.path)).sort();
    assert.deepEqual(paths, ["examples/x.fungi", "examples/y.wat", "packages-ts/pkg-a/README.md", "packages-ts/pkg-a/src/a.ts", "packages-ts/pkg-b/plan.json"]);
    assert.equal(r.totals.matches, 6);
    assert.deepEqual(r.byKind, { comment: 2, data: 1, documentation: 1, "rounding-call": 1, "typed-array-construct": 1 });
    assert.equal(r.skipped.binary, 1);
    assert.deepEqual(r.packages.map((p) => p.package), ["examples", "pkg-a", "pkg-b"]);
    // deterministic
    assert.deepEqual(scan(root, PRESETS["float-width"]), r);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("VS Code export comparison finds paths each side missed", () => {
  const exp = [
    "# Query: Float32Array", "",
    "GitHub \u2022 Galerina\\.worktrees\\wt-1\\packages-ts\\pkg-a\\src\\a.ts:",
    "  1: const v = new Float32Array(4);",
    "GitHub \u2022 Galerina\\packages-ts\\pkg-c\\gone.ts:",
    "GitHub \u2022 Galerina\\packages-ts\\pkg-a\\dist\\a.js:",
  ].join("\n");
  const paths = parseVsCodeExport(exp);
  assert.deepEqual(paths, ["packages-ts/pkg-a/dist/a.js", "packages-ts/pkg-a/src/a.ts", "packages-ts/pkg-c/gone.ts"]);
  const root = fixture();
  try {
    const c = compareWithExport(scan(root, PRESETS["float-width"]), paths);
    assert.deepEqual(c.onlyInExport, ["packages-ts/pkg-c/gone.ts"]);
    assert.equal(c.excludedGeneratedInExport, 1);
    assert.ok(c.onlyInScan.includes("packages-ts/pkg-b/plan.json"));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("CLI --json then --check passes, and drifts fail closed", () => {
  const root = fixture();
  try {
    const snap = join(root, "..", `${root.split(/[\\/]/).pop()}-snap.json`);
    const run = (args) => spawnSync(process.execPath, [TOOL, "--root", root, ...args], { encoding: "utf8" });
    const j = run(["--json"]);
    assert.equal(j.status, 0, j.stderr);
    writeFileSync(snap, j.stdout);
    assert.equal(JSON.parse(readFileSync(snap, "utf8")).schema, "galerina.symbol-usage-search.v1");
    assert.equal(run(["--check", snap]).status, 0);
    writeFileSync(join(root, "examples", "z.mjs"), "Math.fround(1)\n");
    assert.equal(run(["--check", snap]).status, 1);
    rmSync(snap, { force: true });
    assert.equal(run(["--bogus"]).status, 2);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
