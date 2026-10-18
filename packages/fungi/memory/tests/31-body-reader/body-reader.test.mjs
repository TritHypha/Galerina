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
  if (!m) {
    return { status: r.status, text, present: false, reason: "INVOKE_VALUE_ABSENT", value: 0 };
  }
  const value = Number(m[1]);
  if (Number.isSafeInteger(value) !== true) {
    return { status: r.status, text, present: false, reason: "INVOKE_VALUE_NOT_SAFE_INTEGER", value: 0 };
  }
  return { status: r.status, text, present: true, reason: "INVOKE_VALUE_PRESENT", value };
}

function expectPacked(r, expected, label) {
  assert.equal(r.status, 0, label + " status " + r.reason + " " + r.text);
  assert.equal(r.present, true, label + " " + r.reason + " " + r.text);
  assert.equal(r.value, expected, label + " " + r.text);
}

function chunkArgs(over) {
  const o = over || {};
  return [
    o.nChunksClass ?? 0,
    o.nChunks ?? 0,
    o.id1 ?? 0,
    o.off1Class ?? 0,
    o.off1 ?? 0,
    o.len1Class ?? 0,
    o.len1 ?? 0,
    o.id2 ?? 0,
    o.off2Class ?? 0,
    o.off2 ?? 0,
    o.len2Class ?? 0,
    o.len2 ?? 0,
    o.capClass ?? 0,
    o.cap ?? 16384,
    o.declaredPresent ?? 0,
    o.declaredLenClass ?? 0,
    o.declaredLen ?? 0,
    o.streamPresent ?? 1,
    o.deadlineExpired ?? 0,
    o.foreignThrow ?? 0,
  ];
}

test("helper admits SafeInteger", () => {
  const r = invoke(BOUNDARY, "readForeignSafeInteger", [0, 4]);
  expectPacked(r, 0, "admit SafeInteger");
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
    expectPacked(r, row[2], "class " + String(row[0]));
    i = i + 1;
  }
});

test("helper length refuses negative integer", () => {
  const r = invoke(BOUNDARY, "readForeignLength", [0, -1]);
  expectPacked(r, 9, "negative length");
});

test("helper Bool admits 0 and 1 and refuses unlisted token", () => {
  expectPacked(invoke(BOUNDARY, "readForeignBool", [0]), 0, "bool 0");
  expectPacked(invoke(BOUNDARY, "readForeignBool", [1]), 0, "bool 1");
  expectPacked(invoke(BOUNDARY, "readForeignBool", [2]), 11, "bool 2");
});

test("MUST-REFUSE absent stream", () => {
  const r = invoke(READER, "readChunks", chunkArgs({ nChunks: 0, streamPresent: 0 }));
  expectPacked(r, 108, "absent stream");
});

test("MUST-REFUSE lone zero-length chunk", () => {
  const r = invoke(READER, "readChunks", chunkArgs({ nChunks: 1, id1: 1, off1: 0, len1: 0, streamPresent: 1 }));
  expectPacked(r, 104, "lone zero-length");
});

test("MUST-REFUSE zero-length at covered offset", () => {
  const r = invoke(READER, "readChunks", chunkArgs({
    nChunks: 2, id1: 1, off1: 0, len1: 4, id2: 2, off2: 0, len2: 0, streamPresent: 1,
  }));
  expectPacked(r, 104, "zero-length covered");
});

test("MUST-ADMIT two adjacent half-open chunks", () => {
  const r = invoke(READER, "readChunks", chunkArgs({
    nChunks: 2, id1: 1, off1: 0, len1: 4, id2: 2, off2: 4, len2: 4, streamPresent: 1,
  }));
  expectPacked(r, 100, "adjacent");
});

test("MUST-REFUSE duplicate reference", () => {
  const r = invoke(READER, "readChunks", chunkArgs({
    nChunks: 2, id1: 7, off1: 0, len1: 4, id2: 7, off2: 4, len2: 4, streamPresent: 1,
  }));
  expectPacked(r, 101, "dup ref");
});

test("MUST-REFUSE overlapping views", () => {
  const r = invoke(READER, "readChunks", chunkArgs({
    nChunks: 2, id1: 1, off1: 0, len1: 6, id2: 2, off2: 4, len2: 4, streamPresent: 1,
  }));
  expectPacked(r, 103, "overlap");
});

test("MUST-REFUSE duplicate range identity", () => {
  const r = invoke(READER, "readChunks", chunkArgs({
    nChunks: 2, id1: 1, off1: 0, len1: 4, id2: 2, off2: 0, len2: 4, streamPresent: 1,
  }));
  expectPacked(r, 102, "dup range");
});

test("MUST-REFUSE over cap by one byte", () => {
  const r = invoke(READER, "readChunks", chunkArgs({
    nChunks: 1, id1: 1, off1: 0, len1: 5, cap: 4, streamPresent: 1,
  }));
  expectPacked(r, 105, "over cap");
});

test("MUST-REFUSE declared longer", () => {
  const r = invoke(READER, "readChunks", chunkArgs({
    nChunks: 1, id1: 1, off1: 0, len1: 4, declaredPresent: 1, declaredLen: 8, streamPresent: 1,
  }));
  expectPacked(r, 106, "declared longer");
});

test("MUST-REFUSE declared shorter", () => {
  const r = invoke(READER, "readChunks", chunkArgs({
    nChunks: 1, id1: 1, off1: 0, len1: 4, declaredPresent: 1, declaredLen: 2, streamPresent: 1,
  }));
  expectPacked(r, 107, "declared shorter");
});

test("MUST-REFUSE deadline expiry", () => {
  const r = invoke(READER, "readChunks", chunkArgs({
    nChunks: 1, id1: 1, off1: 0, len1: 4, deadlineExpired: 1, streamPresent: 1,
  }));
  expectPacked(r, 109, "deadline");
});

test("MUST-REFUSE foreign throw mid-read wipes", () => {
  const r = invoke(READER, "readChunks", chunkArgs({
    nChunks: 1, id1: 1, off1: 0, len1: 4, foreignThrow: 1, streamPresent: 1,
  }));
  expectPacked(r, 110, "foreign throw");
});

test("MUST-REFUSE two chunks summing to cap plus one", () => {
  const r = invoke(READER, "readChunks", chunkArgs({
    nChunks: 2, id1: 1, off1: 0, len1: 3, id2: 2, off2: 3, len2: 2, cap: 4, streamPresent: 1,
  }));
  expectPacked(r, 105, "two-chunk cap+1");
});

test("MUST-REFUSE declared longer than two-chunk total", () => {
  const r = invoke(READER, "readChunks", chunkArgs({
    nChunks: 2, id1: 1, off1: 0, len1: 4, id2: 2, off2: 4, len2: 4,
    declaredPresent: 1, declaredLen: 9, streamPresent: 1,
  }));
  expectPacked(r, 106, "two-chunk declared longer");
});

test("MUST-REFUSE declared shorter than two-chunk total", () => {
  const r = invoke(READER, "readChunks", chunkArgs({
    nChunks: 2, id1: 1, off1: 0, len1: 4, id2: 2, off2: 4, len2: 4,
    declaredPresent: 1, declaredLen: 6, streamPresent: 1,
  }));
  expectPacked(r, 107, "two-chunk declared shorter");
});

test("MUST-REFUSE i32 length-sum without trap", () => {
  const r = invoke(READER, "readChunks", chunkArgs({
    nChunks: 2, id1: 1, off1: 0, len1: 2147483647, id2: 2, off2: 0, len2: 2,
    cap: 2147483647, streamPresent: 1,
  }));
  expectPacked(r, 105, "len1+len2 remaining");
});

test("MUST-REFUSE offset plus length overflow", () => {
  const r = invoke(READER, "readChunks", chunkArgs({
    nChunks: 1, id1: 1, off1: 2147483647, len1: 2, cap: 16384, streamPresent: 1,
  }));
  expectPacked(r, 114, "offset overflow");
});

test("MUST-REFUSE unlisted Bool token streamPresent 2", () => {
  const r = invoke(READER, "readChunks", chunkArgs({
    nChunks: 2, id1: 1, off1: 0, len1: 4, id2: 2, off2: 4, len2: 4, streamPresent: 2,
  }));
  expectPacked(r, 111, "streamPresent 2");
});

test("MUST-REFUSE foreign classTag on cap", () => {
  const helper = invoke(BOUNDARY, "readForeignSafeInteger", [3, 16384]);
  expectPacked(helper, 3, "helper NaN cap");
  const r = invoke(READER, "readChunks", chunkArgs({
    nChunks: 1, id1: 1, off1: 0, len1: 4, capClass: 3, cap: 16384, streamPresent: 1,
  }));
  expectPacked(r, 111, "cap classTag 3");
});

test("mutant admit zero-length goes RED then restore", () => {
  const orig = readFileSync(READER, "utf8");
  const mutant = orig.replace(
    "if len1 <= 0 {\n      return finish(4, true)\n    }\n    if off1 < 0 {",
    "if len1 < 0 {\n      return finish(4, true)\n    }\n    if off1 < 0 {",
  );
  assert.notEqual(mutant, orig);
  writeFileSync(READER, mutant);
  const red = invoke(READER, "readChunks", chunkArgs({ nChunks: 1, id1: 1, off1: 0, len1: 0, streamPresent: 1 }));
  writeFileSync(READER, orig);
  const green = invoke(READER, "readChunks", chunkArgs({ nChunks: 1, id1: 1, off1: 0, len1: 0, streamPresent: 1 }));
  assert.equal(red.present, true, red.reason + " " + red.text);
  assert.notEqual(red.value, 104, "mutant must not refuse zero-length: " + String(red.value) + " " + red.text);
  expectPacked(green, 104, "restore zero-length");
});

test("mutant closed-interval overlap refuses adjacent then restore", () => {
  const orig = readFileSync(READER, "utf8");
  const mutant = orig.replace(
    "if off1 < end2 {\n    if off2 < end1 {",
    "if off1 <= end2 {\n    if off2 <= end1 {",
  );
  assert.notEqual(mutant, orig);
  writeFileSync(READER, mutant);
  const red = invoke(READER, "readChunks", chunkArgs({
    nChunks: 2, id1: 1, off1: 0, len1: 4, id2: 2, off2: 4, len2: 4, streamPresent: 1,
  }));
  writeFileSync(READER, orig);
  const green = invoke(READER, "readChunks", chunkArgs({
    nChunks: 2, id1: 1, off1: 0, len1: 4, id2: 2, off2: 4, len2: 4, streamPresent: 1,
  }));
  assert.equal(red.present, true, red.reason + " " + red.text);
  assert.notEqual(red.value, 100, "mutant must refuse adjacent: " + String(red.value) + " " + red.text);
  expectPacked(green, 100, "restore adjacent");
});

test("mutant skip wipe on absent stream goes RED then restore", () => {
  const orig = readFileSync(READER, "utf8");
  const mutant = orig.replace(
    "if streamPresentToken == 0 {\n    return finish(8, true)\n  }",
    "if streamPresentToken == 0 {\n    return finish(8, false)\n  }",
  );
  assert.notEqual(mutant, orig);
  writeFileSync(READER, mutant);
  const red = invoke(READER, "readChunks", chunkArgs({ nChunks: 0, streamPresent: 0 }));
  writeFileSync(READER, orig);
  const green = invoke(READER, "readChunks", chunkArgs({ nChunks: 0, streamPresent: 0 }));
  expectPacked(red, 8, "mutant skip wipe");
  expectPacked(green, 108, "restore wipe construct");
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
  expectPacked(red, 0, "mutant accept NaN");
  expectPacked(green, 3, "restore NaN refuse");
});

test("mutant drop cap compare goes RED then restore", () => {
  const orig = readFileSync(READER, "utf8");
  const mutant = orig.replace(
    "if len1 > cap {\n      return finish(5, true)\n    }",
    "if len1 < 0 {\n      return finish(5, true)\n    }",
  );
  assert.notEqual(mutant, orig);
  writeFileSync(READER, mutant);
  const red = invoke(READER, "readChunks", chunkArgs({
    nChunks: 1, id1: 1, off1: 0, len1: 5, cap: 4, streamPresent: 1,
  }));
  writeFileSync(READER, orig);
  const green = invoke(READER, "readChunks", chunkArgs({
    nChunks: 1, id1: 1, off1: 0, len1: 5, cap: 4, streamPresent: 1,
  }));
  assert.equal(red.present, true, red.reason + " " + red.text);
  assert.notEqual(red.value, 105, "mutant must admit over-cap: " + String(red.value) + " " + red.text);
  expectPacked(green, 105, "restore cap");
});

test("mutant GM6 remaining compare goes RED then restore", () => {
  const orig = readFileSync(READER, "utf8");
  const mutant = orig.replace(
    "if len2 > remaining {\n      return finish(5, true)\n    }",
    "if remaining < 0 {\n      return finish(5, true)\n    }",
  );
  assert.notEqual(mutant, orig);
  writeFileSync(READER, mutant);
  const red = invoke(READER, "readChunks", chunkArgs({
    nChunks: 2, id1: 1, off1: 0, len1: 3, id2: 2, off2: 3, len2: 2, cap: 4, streamPresent: 1,
  }));
  writeFileSync(READER, orig);
  const green = invoke(READER, "readChunks", chunkArgs({
    nChunks: 2, id1: 1, off1: 0, len1: 3, id2: 2, off2: 3, len2: 2, cap: 4, streamPresent: 1,
  }));
  assert.equal(red.present, true, red.reason + " " + red.text);
  assert.notEqual(red.value, 105, "GM6 must survive cap+1: " + String(red.value) + " " + red.text);
  expectPacked(green, 105, "restore GM6");
});

test("mutant GM7 declared shorter compare goes RED then restore", () => {
  const orig = readFileSync(READER, "utf8");
  const mutant = orig.replace(
    "if declaredLen < total {\n        return finish(7, true)\n      }",
    "if declaredLen < 0 {\n        return finish(7, true)\n      }",
  );
  assert.notEqual(mutant, orig);
  writeFileSync(READER, mutant);
  const red = invoke(READER, "readChunks", chunkArgs({
    nChunks: 2, id1: 1, off1: 0, len1: 4, id2: 2, off2: 4, len2: 4,
    declaredPresent: 1, declaredLen: 6, streamPresent: 1,
  }));
  writeFileSync(READER, orig);
  const green = invoke(READER, "readChunks", chunkArgs({
    nChunks: 2, id1: 1, off1: 0, len1: 4, id2: 2, off2: 4, len2: 4,
    declaredPresent: 1, declaredLen: 6, streamPresent: 1,
  }));
  assert.equal(red.present, true, red.reason + " " + red.text);
  assert.notEqual(red.value, 107, "GM7 must survive declared shorter: " + String(red.value) + " " + red.text);
  expectPacked(green, 107, "restore GM7");
});
