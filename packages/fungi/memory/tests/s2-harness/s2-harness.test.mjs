// S2 red tests (closure path X-H1, X-N1). Written before the fix; they must fail on base 1284a28d.
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";
import { readFileSync, readdirSync, statSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

const HERE = dirname(fileURLToPath(import.meta.url));
const TESTS = join(HERE, "..");
const REPO = join(TESTS, "..", "..", "..", "..");
const GALERINA = join(REPO, "galerina.mjs");
// Import targets must keep the file name their `import "./x.fungi"` line names; they are never a build root.
const IMPORT_ONLY = new Map([["c-boundary.fungi", "import target named by import lines; not a build root"]]);

function walk(dir, out) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      walk(p, out);
    } else if (name.endsWith(".mjs")) {
      out.push(p);
    }
  }
  return out;
}

test("S2-H1-01 no suite writes a fixed shared tmp build name", () => {
  const owners = new Map();
  const fixed = /join\(\s*[A-Za-z_$][\w$]*\s*,\s*["']([^"'\/]+\.fungi)["']\s*\)/g;
  for (const f of walk(TESTS, [])) {
    const text = readFileSync(f, "utf8");
    for (const m of text.matchAll(fixed)) {
      const name = m[1];
      if (IMPORT_ONLY.has(name)) {
        continue;
      }
      assert.notEqual(name, "flat.fungi", "fixed flat.fungi in " + relative(REPO, f));
      const prior = owners.get(name);
      if (prior !== undefined && prior !== f) {
        assert.fail("tmp build name " + name + " shared by " + relative(REPO, prior) + " and " + relative(REPO, f));
      }
      owners.set(name, f);
    }
  }
});

test("S2-H1-02 every suite that flattens a program uses the unique-name helper", () => {
  for (const f of walk(TESTS, [])) {
    if (f.includes("_harness") || f.includes("s2-harness")) {
      continue;
    }
    const text = readFileSync(f, "utf8");
    if (/mkdtempSync\(/.test(text) && /"run",\s*\w+,\s*"--invoke"|"build",\s*\w+/.test(text) && /writeFileSync\(/.test(text)) {
      assert.match(text, /uniqueFungiFile\(/, "no uniqueFungiFile in " + relative(REPO, f));
    }
  }
});

function program(dir) {
  const file = join(dir, "s2arity" + dir.slice(-6).replace(/[^A-Za-z0-9]/g, "x") + ".fungi");
  writeFileSync(file, [
    "@version 1",
    "pure flow addTwo(a: Int, b: Int) -> Int",
    "contract {",
    "  intent { \"S2 arity probe: sum of two ints.\" }",
    "}",
    "{",
    "  return a + b",
    "}",
    "",
  ].join("\n"));
  return file;
}

function run(file, args) {
  const r = spawnSync(process.execPath, [GALERINA, "run", file, "--invoke", "addTwo", ...args.map(String)], { encoding: "utf8", cwd: REPO });
  return { status: r.status, text: (r.stdout || "") + (r.stderr || "") };
}

test("S2-N1-01 raw invoke refuses too few, too many and zero args; exact arity still runs", () => {
  const dir = mkdtempSync(join(tmpdir(), "s2-arity-"));
  const file = program(dir);
  try {
    const exact = run(file, [2, 40]);
    assert.equal(exact.status, 0, exact.text);
    assert.match(exact.text, /42\s*$/);
    for (const args of [[], [7], [1, 2, 3], new Array(150).fill(1), new Array(152).fill(1)]) {
      const r = run(file, args);
      assert.equal(r.status, 2, "arity " + args.length + " must refuse with exit 2: " + r.text);
      assert.match(r.text, /REFUSED: raw invoke of 'addTwo' expected 2 positional argument\(s\) but received/);
      assert.doesNotMatch(r.text, /(^|\n)\s*-?\d+\s*$/, "no value printed for arity " + args.length);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
    for (const ext of [".wasm", ".wat", ".lmanifest", ".lmanifest.json"]) {
      rmSync(join(REPO, "build", file.split("/").pop().replace(/\.fungi$/, "") + ext), { force: true });
    }
  }
});