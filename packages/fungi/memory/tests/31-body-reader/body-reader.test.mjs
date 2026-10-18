import { spawnSync } from "node:child_process";
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readFileSync, writeFileSync } from "node:fs";

const HERE = dirname(fileURLToPath(import.meta.url));
const MEM = join(HERE, "..", "..");
const REPO = join(MEM, "..", "..", "..");
const BOUNDARY = join(MEM, "src", "c-boundary.fungi");
const READER = join(MEM, "src", "body-reader.fungi");
const GALERINA = join(REPO, "galerina.mjs");

function invoke(file, flow, args) {
  const argv = [GALERINA, "run", file, "--invoke", flow, ...args.map(String)];
  const r = spawnSync(process.execPath, argv, { encoding: "utf8", cwd: REPO });
  const text = (r.stdout || "") + (r.stderr || "");
  const m = text.match(/=>\s*(-?\d+)\s*$/m) || text.match(/(-?\d+)\s*$/);
  return { status: r.status, text, value: m ? Number(m[1]) : NaN };
}

test("helper admits SafeInteger", () => {
  const r = invoke(BOUNDARY, "readForeignSafeInteger", [0, 4]);
  assert.equal(r.status, 0, r.text);
  assert.equal(r.value, 0);
});

test("helper refuses Null NaN Infinity NegZero NonInteger OutOfSafeRange NegativeLength WrongType Absent Unlisted", () => {
  const cases = [
    [1, 0, 1],
    [2, 0, 2],
    [3, 0, 3],
    [4, 0, 4],
    [5, 0, 5],
    [6, 0, 6],
    [7, 0, 7],
    [8, 0, 8],
    [9, -1, 9],
    [10, 0, 10],
    [99, 0, 11],
  ];
  let i = 0;
  while (i < cases.length) {
    const row = cases[i];
    const r = invoke(BOUNDARY, "readForeignSafeInteger", [row[0], row[1]]);
    assert.equal(r.status, 0, r.text);
    assert.equal(r.value, row[2], "class " + String(row[0]));
    i = i + 1;
  }
});

test("helper length refuses negative integer", () => {
  const r = invoke(BOUNDARY, "readForeignLength", [0, -1]);
  assert.equal(r.status, 0, r.text);
  assert.equal(r.value, 9);
});

test("MUST-REFUSE absent stream", () => {
  const r = invoke(READER, "readChunks", [0, 0, 0, 0, 0, 0, 0, 16384, false, 0, false, false, false]);
  assert.equal(r.status, 0, r.text);
  assert.equal(r.value, 108);
});

test("MUST-REFUSE lone zero-length chunk", () => {
  const r = invoke(READER, "readChunks", [1, 1, 0, 0, 0, 0, 0, 16384, false, 0, true, false, false]);
  assert.equal(r.status, 0, r.text);
  assert.equal(r.value, 104);
});

test("MUST-REFUSE zero-length at covered offset", () => {
  const r = invoke(READER, "readChunks", [2, 1, 0, 4, 2, 0, 0, 16384, false, 0, true, false, false]);
  assert.equal(r.status, 0, r.text);
  assert.equal(r.value, 104);
});

test("MUST-ADMIT two adjacent half-open chunks", () => {
  const r = invoke(READER, "readChunks", [2, 1, 0, 4, 2, 4, 4, 16384, false, 0, true, false, false]);
  assert.equal(r.status, 0, r.text);
  assert.equal(r.value, 100);
});

test("MUST-REFUSE duplicate reference", () => {
  const r = invoke(READER, "readChunks", [2, 7, 0, 4, 7, 4, 4, 16384, false, 0, true, false, false]);
  assert.equal(r.status, 0, r.text);
  assert.equal(r.value, 101);
});

test("MUST-REFUSE overlapping views", () => {
  const r = invoke(READER, "readChunks", [2, 1, 0, 6, 2, 4, 4, 16384, false, 0, true, false, false]);
  assert.equal(r.status, 0, r.text);
  assert.equal(r.value, 103);
});

test("MUST-REFUSE duplicate range identity", () => {
  const r = invoke(READER, "readChunks", [2, 1, 0, 4, 2, 0, 4, 16384, false, 0, true, false, false]);
  assert.equal(r.status, 0, r.text);
  assert.equal(r.value, 102);
});

test("MUST-REFUSE over cap by one byte", () => {
  const r = invoke(READER, "readChunks", [1, 1, 0, 5, 0, 0, 0, 4, false, 0, true, false, false]);
  assert.equal(r.status, 0, r.text);
  assert.equal(r.value, 105);
});

test("MUST-REFUSE declared longer", () => {
  const r = invoke(READER, "readChunks", [1, 1, 0, 4, 0, 0, 0, 16384, true, 8, true, false, false]);
  assert.equal(r.status, 0, r.text);
  assert.equal(r.value, 106);
});

test("MUST-REFUSE declared shorter", () => {
  const r = invoke(READER, "readChunks", [1, 1, 0, 4, 0, 0, 0, 16384, true, 2, true, false, false]);
  assert.equal(r.status, 0, r.text);
  assert.equal(r.value, 107);
});

test("MUST-REFUSE deadline expiry", () => {
  const r = invoke(READER, "readChunks", [1, 1, 0, 4, 0, 0, 0, 16384, false, 0, true, true, false]);
  assert.equal(r.status, 0, r.text);
  assert.equal(r.value, 109);
});

test("MUST-REFUSE foreign throw mid-read wipes", () => {
  const r = invoke(READER, "readChunks", [1, 1, 0, 4, 0, 0, 0, 16384, false, 0, true, false, true]);
  assert.equal(r.status, 0, r.text);
  assert.equal(r.value, 110);
});

test("mutant admit zero-length goes RED then restore", () => {
  const orig = readFileSync(READER, "utf8");
  const mutant = orig.replace(
    "if len1 <= 0 {\n      return finish(4, true)\n    }\n    if off1 < 0 {",
    "if len1 < 0 {\n      return finish(4, true)\n    }\n    if off1 < 0 {",
  );
  assert.notEqual(mutant, orig);
  writeFileSync(READER, mutant);
  const red = invoke(READER, "readChunks", [1, 1, 0, 0, 0, 0, 0, 16384, false, 0, true, false, false]);
  writeFileSync(READER, orig);
  const green = invoke(READER, "readChunks", [1, 1, 0, 0, 0, 0, 0, 16384, false, 0, true, false, false]);
  assert.notEqual(red.value, 104, "mutant must not refuse zero-length: " + String(red.value) + " " + red.text);
  assert.equal(green.value, 104, green.text);
});

test("mutant closed-interval overlap refuses adjacent then restore", () => {
  const orig = readFileSync(READER, "utf8");
  const mutant = orig.replace(
    "if off1 < end2 {\n    if off2 < end1 {",
    "if off1 <= end2 {\n    if off2 <= end1 {",
  );
  assert.notEqual(mutant, orig);
  writeFileSync(READER, mutant);
  const red = invoke(READER, "readChunks", [2, 1, 0, 4, 2, 4, 4, 16384, false, 0, true, false, false]);
  writeFileSync(READER, orig);
  const green = invoke(READER, "readChunks", [2, 1, 0, 4, 2, 4, 4, 16384, false, 0, true, false, false]);
  assert.notEqual(red.value, 100, "mutant must refuse adjacent: " + String(red.value) + " " + red.text);
  assert.equal(green.value, 100, green.text);
});

test("mutant skip wipe on absent stream goes RED then restore", () => {
  const orig = readFileSync(READER, "utf8");
  const mutant = orig.replace(
    "if streamPresent == false {\n    return finish(8, true)\n  }",
    "if streamPresent == false {\n    return finish(8, false)\n  }",
  );
  assert.notEqual(mutant, orig);
  writeFileSync(READER, mutant);
  const red = invoke(READER, "readChunks", [0, 0, 0, 0, 0, 0, 0, 16384, false, 0, false, false, false]);
  writeFileSync(READER, orig);
  const green = invoke(READER, "readChunks", [0, 0, 0, 0, 0, 0, 0, 16384, false, 0, false, false, false]);
  assert.equal(red.value, 8, red.text);
  assert.equal(green.value, 108, green.text);
});

test("mutant accept NaN in helper goes RED then restore", () => {
  const orig = readFileSync(BOUNDARY, "utf8");
  const mutant = orig.replace(
    "if classTag == 3 {\n    return 3\n  }",
    "if classTag == 3 {\n    return 0\n  }",
  );
  assert.notEqual(mutant, orig);
  writeFileSync(BOUNDARY, mutant);
  const red = invoke(BOUNDARY, "readForeignSafeInteger", [3, 0]);
  writeFileSync(BOUNDARY, orig);
  const green = invoke(BOUNDARY, "readForeignSafeInteger", [3, 0]);
  assert.equal(red.value, 0, red.text);
  assert.equal(green.value, 3, green.text);
});

test("mutant drop cap compare goes RED then restore", () => {
  const orig = readFileSync(READER, "utf8");
  const mutant = orig.replace(
    "if len1 > cap {\n      return finish(5, true)\n    }",
    "if len1 < 0 {\n      return finish(5, true)\n    }",
  );
  assert.notEqual(mutant, orig);
  writeFileSync(READER, mutant);
  const red = invoke(READER, "readChunks", [1, 1, 0, 5, 0, 0, 0, 4, false, 0, true, false, false]);
  writeFileSync(READER, orig);
  const green = invoke(READER, "readChunks", [1, 1, 0, 5, 0, 0, 0, 4, false, 0, true, false, false]);
  assert.notEqual(red.value, 105, "mutant must admit over-cap: " + String(red.value) + " " + red.text);
  assert.equal(green.value, 105, green.text);
});
