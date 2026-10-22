// S2 red tests, round 2 (merge check s2mc 0b733a02 FAIL items 1 and 4). Written before the fixes.
// Each test pins one guard that a surviving mutant removed: D7 nameless flow, H1b reuse, H1c shape, H1d cleanup,
// plus no U+FFFD replacement characters in galerina.mjs.
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { readFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { uniqueFungiFile } from "../_harness/unique-build-name.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..", "..", "..", "..");
const GALERINA = join(REPO, "galerina.mjs");
const HELPER = join(HERE, "..", "_harness", "unique-build-name.mjs");
const EXTS = [".wasm", ".wat", ".lmanifest", ".lmanifest.json", ".dot", ".svg"];

function loadDupDiag() {
  const src = readFileSync(GALERINA, "utf8");
  const all = [...src.matchAll(/^function duplicateFlowDiagnostics\(flows\) \{\n[\s\S]*?\n\}\n/gm)];
  assert.equal(all.length, 1, "exactly one duplicateFlowDiagnostics definition");
  return new Function(all[0][0] + "\nreturn duplicateFlowDiagnostics;")();
}

test("S2-D7-01 a flow with no readable name is refused with FUNGI-NAME-002, alone or beside named flows", () => {
  const diag = loadDupDiag();
  for (const flows of [[{}], [{ name: "" }], [{ name: 7 }], [null], [{ name: undefined }], [{ name: "ok" }, {}]]) {
    const out = diag(flows);
    assert.equal(out.length, 1, "one refusal for " + JSON.stringify(flows));
    assert.equal(out[0].code, "FUNGI-NAME-002");
    assert.equal(out[0].severity, "error");
  }
  assert.equal(diag([{ name: "a" }, { name: "b" }]).length, 0, "distinct names admitted");
  assert.equal(diag([{ name: "a" }, { name: "a" }]).length, 1, "duplicate refused");
});

test("S2-ENC-01 galerina.mjs carries no U+FFFD replacement characters", () => {
  const text = readFileSync(GALERINA, "utf8");
  assert.equal(text.includes("\uFFFD"), false, "U+FFFD found in galerina.mjs");
});

test("S2-H1b-01 the same tmp folder cannot name two builds in one process", () => {
  const dir = mkdtempSync(join(tmpdir(), "s2-h1b-"));
  try {
    uniqueFungiFile(dir);
    assert.throws(() => uniqueFungiFile(dir), /S2_UNIQUE_BUILD_NAME_REFUSED: build name reused/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("S2-H1c-01 names that are not mkdtemp-shaped are refused", () => {
  for (const bad of ["/tmp/flat", "/tmp/flat.fungi", "/tmp/s2-h1c-", "/tmp/s2 h1c-abcdef", "/tmp/s2-h1c-abc", "/tmp/s2-h1c-abcdefg", "/tmp/s2.h1c-abcdef", ""]) {
    assert.throws(() => uniqueFungiFile(bad), /S2_UNIQUE_BUILD_NAME_REFUSED/, "must refuse " + JSON.stringify(bad));
  }
  assert.throws(() => uniqueFungiFile(5), /S2_UNIQUE_BUILD_NAME_REFUSED/);
});

test("S2-H1d-01 build outputs for every handed-out name are removed when the process exits", () => {
  const child = [
    "import { uniqueFungiFile } from " + JSON.stringify(pathToFileURL(HELPER).href) + ";",
    "import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';",
    "import { join, basename } from 'node:path';",
    "import { tmpdir } from 'node:os';",
    "const d = mkdtempSync(join(tmpdir(), 's2-h1d-'));",
    "const n = basename(uniqueFungiFile(d), '.fungi');",
    "rmSync(d, { recursive: true, force: true });",
    "mkdirSync(" + JSON.stringify(join(REPO, "build")) + ", { recursive: true });",
    "for (const e of " + JSON.stringify(EXTS) + ") writeFileSync(join(" + JSON.stringify(join(REPO, "build")) + ", n + e), 'synthetic');",
    "console.log('NAME=' + n);",
  ].join("\n");
  const r = spawnSync(process.execPath, ["--input-type=module", "-e", child], { encoding: "utf8", cwd: REPO });
  assert.equal(r.status, 0, r.stderr);
  const m = (r.stdout || "").match(/NAME=([A-Za-z0-9_-]+)/);
  assert.notEqual(m, null, "child printed its name");
  const left = EXTS.map((e) => join(REPO, "build", m[1] + e)).filter((p) => existsSync(p));
  for (const p of left) rmSync(p, { force: true });
  assert.deepEqual(left, [], "build outputs left behind");
});