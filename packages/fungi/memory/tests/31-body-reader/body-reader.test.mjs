import { spawnSync } from "node:child_process";
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

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
  const r = invoke(BOUNDARY, "readForeignLength", [0, -1, 2147483647]);
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

function withMutant(file, from, to, runRed) {
  const orig = readFileSync(file, "utf8");
  const mutant = orig.replace(from, to);
  assert.notEqual(mutant, orig, "mutant must change source");
  writeFileSync(file, mutant);
  try {
    runRed();
  } finally {
    writeFileSync(file, orig);
  }
}

test("MUST-REFUSE declaredPresentToken 2", () => {
  const r = invoke(READER, "readChunks", chunkArgs({ nChunks: 0, declaredPresent: 2, streamPresent: 1 }));
  expectPacked(r, 111, "declaredPresent 2");
});

test("MUST-REFUSE deadlineExpiredToken 2", () => {
  const r = invoke(READER, "readChunks", chunkArgs({ nChunks: 0, deadlineExpired: 2, streamPresent: 1 }));
  expectPacked(r, 111, "deadline 2");
});

test("MUST-REFUSE foreignThrowToken 2", () => {
  const r = invoke(READER, "readChunks", chunkArgs({ nChunks: 0, foreignThrow: 2, streamPresent: 1 }));
  expectPacked(r, 111, "foreignThrow 2");
});

test("MUST-REFUSE nChunksClass != 0", () => {
  const r = invoke(READER, "readChunks", chunkArgs({ nChunksClass: 2, nChunks: 0, streamPresent: 1 }));
  expectPacked(r, 111, "nChunksClass 2");
});

test("MUST-REFUSE declaredLenClass != 0 with declaredPresent 0", () => {
  const r = invoke(READER, "readChunks", chunkArgs({
    nChunks: 0, declaredPresent: 0, declaredLenClass: 2, declaredLen: 0, streamPresent: 1,
  }));
  expectPacked(r, 111, "absent header class 2");
});

test("MUST-REFUSE off1Class != 0", () => {
  const r = invoke(READER, "readChunks", chunkArgs({ nChunks: 0, off1Class: 2, streamPresent: 1 }));
  expectPacked(r, 111, "off1Class 2");
});

test("MUST-REFUSE len1Class != 0", () => {
  const r = invoke(READER, "readChunks", chunkArgs({ nChunks: 0, len1Class: 2, streamPresent: 1 }));
  expectPacked(r, 111, "len1Class 2");
});

test("MUST-REFUSE off2Class != 0", () => {
  const r = invoke(READER, "readChunks", chunkArgs({ nChunks: 0, off2Class: 2, streamPresent: 1 }));
  expectPacked(r, 111, "off2Class 2");
});

test("MUST-REFUSE len2Class != 0", () => {
  const r = invoke(READER, "readChunks", chunkArgs({ nChunks: 0, len2Class: 2, streamPresent: 1 }));
  expectPacked(r, 111, "len2Class 2");
});

test("MUST-REFUSE two-chunk off1 overflow 114", () => {
  const r = invoke(READER, "readChunks", chunkArgs({
    nChunks: 2, id1: 1, off1: 2147483647, len1: 2, id2: 2, off2: 0, len2: 2, cap: 16384, streamPresent: 1,
  }));
  expectPacked(r, 114, "two-chunk off1 overflow");
});

test("MUST-REFUSE two-chunk off2 overflow 114", () => {
  const r = invoke(READER, "readChunks", chunkArgs({
    nChunks: 2, id1: 1, off1: 0, len1: 2, id2: 2, off2: 2147483647, len2: 2, cap: 16384, streamPresent: 1,
  }));
  expectPacked(r, 114, "two-chunk off2 overflow");
});

test("MUST-REFUSE zero-chunk declaredLen 5", () => {
  const r = invoke(READER, "readChunks", chunkArgs({
    nChunks: 0, declaredPresent: 1, declaredLen: 5, streamPresent: 1,
  }));
  expectPacked(r, 106, "zero-chunk declared 5");
});

test("MUST-REFUSE cap -1", () => {
  const r = invoke(READER, "readChunks", chunkArgs({ nChunks: 0, cap: -1, streamPresent: 1 }));
  expectPacked(r, 112, "cap -1");
});

test("MUST-REFUSE nChunks 3", () => {
  const r = invoke(READER, "readChunks", chunkArgs({ nChunks: 3, streamPresent: 1 }));
  expectPacked(r, 111, "nChunks 3");
});

test("mutant GM9 declaredPresent token 2 goes RED then restore", () => {
  withMutant(
    READER,
    "    if declaredPresentToken != 1 {\n      return finish(11, true)\n    }",
    "    if declaredPresentToken == 99 {\n      return finish(11, true)\n    }",
    () => {
      const red = invoke(READER, "readChunks", chunkArgs({ nChunks: 0, declaredPresent: 2, streamPresent: 1 }));
      assert.equal(red.present, true, red.reason + " " + red.text);
      assert.notEqual(red.value, 111, "GM9 must survive token 2: " + String(red.value) + " " + red.text);
    },
  );
  expectPacked(invoke(READER, "readChunks", chunkArgs({ nChunks: 0, declaredPresent: 2, streamPresent: 1 })), 111, "restore GM9");
});

test("mutant GM10 deadline token 2 goes RED then restore", () => {
  withMutant(
    READER,
    "    if deadlineExpiredToken != 1 {\n      return finish(11, true)\n    }",
    "    if deadlineExpiredToken == 99 {\n      return finish(11, true)\n    }",
    () => {
      const red = invoke(READER, "readChunks", chunkArgs({ nChunks: 0, deadlineExpired: 2, streamPresent: 1 }));
      assert.equal(red.present, true, red.reason + " " + red.text);
      assert.notEqual(red.value, 111, "GM10 must survive token 2: " + String(red.value) + " " + red.text);
    },
  );
  expectPacked(invoke(READER, "readChunks", chunkArgs({ nChunks: 0, deadlineExpired: 2, streamPresent: 1 })), 111, "restore GM10");
});

test("mutant GM11 foreignThrow token 2 goes RED then restore", () => {
  withMutant(
    READER,
    "    if foreignThrowToken != 1 {\n      return finish(11, true)\n    }",
    "    if foreignThrowToken == 99 {\n      return finish(11, true)\n    }",
    () => {
      const red = invoke(READER, "readChunks", chunkArgs({ nChunks: 0, foreignThrow: 2, streamPresent: 1 }));
      assert.equal(red.present, true, red.reason + " " + red.text);
      assert.notEqual(red.value, 111, "GM11 must survive token 2: " + String(red.value) + " " + red.text);
    },
  );
  expectPacked(invoke(READER, "readChunks", chunkArgs({ nChunks: 0, foreignThrow: 2, streamPresent: 1 })), 111, "restore GM11");
});

test("mutant GM12 nChunksClass != 0 goes RED then restore", () => {
  withMutant(
    READER,
    "  if nChunksClass != 0 {\n    return finish(11, true)\n  }",
    "",
    () => {
      const red = invoke(READER, "readChunks", chunkArgs({ nChunksClass: 2, nChunks: 0, streamPresent: 1 }));
      assert.equal(red.present, true, red.reason + " " + red.text);
      assert.notEqual(red.value, 111, "GM12 must survive class 2: " + String(red.value) + " " + red.text);
    },
  );
  expectPacked(invoke(READER, "readChunks", chunkArgs({ nChunksClass: 2, nChunks: 0, streamPresent: 1 })), 111, "restore GM12");
});

test("mutant GM14 declaredLenClass != 0 goes RED then restore", () => {
  withMutant(
    READER,
    "  if declaredLenClass != 0 {\n    return finish(11, true)\n  }",
    "",
    () => {
      const red = invoke(READER, "readChunks", chunkArgs({
        nChunks: 0, declaredPresent: 0, declaredLenClass: 2, streamPresent: 1,
      }));
      assert.equal(red.present, true, red.reason + " " + red.text);
      assert.notEqual(red.value, 111, "GM14 must survive class 2: " + String(red.value) + " " + red.text);
    },
  );
  expectPacked(invoke(READER, "readChunks", chunkArgs({
    nChunks: 0, declaredPresent: 0, declaredLenClass: 2, streamPresent: 1,
  })), 111, "restore GM14");
});

test("mutant GM15 off1Class != 0 goes RED then restore", () => {
  withMutant(
    READER,
    "  if off1Class != 0 {\n    return finish(11, true)\n  }",
    "",
    () => {
      const red = invoke(READER, "readChunks", chunkArgs({ nChunks: 0, off1Class: 2, streamPresent: 1 }));
      assert.equal(red.present, true, red.reason + " " + red.text);
      assert.notEqual(red.value, 111, "GM15 must survive class 2: " + String(red.value) + " " + red.text);
    },
  );
  expectPacked(invoke(READER, "readChunks", chunkArgs({ nChunks: 0, off1Class: 2, streamPresent: 1 })), 111, "restore GM15");
});

test("mutant GM16 len1Class != 0 goes RED then restore", () => {
  withMutant(
    READER,
    "  if len1Class != 0 {\n    return finish(11, true)\n  }",
    "",
    () => {
      const red = invoke(READER, "readChunks", chunkArgs({ nChunks: 0, len1Class: 2, streamPresent: 1 }));
      assert.equal(red.present, true, red.reason + " " + red.text);
      assert.notEqual(red.value, 111, "GM16 must survive class 2: " + String(red.value) + " " + red.text);
    },
  );
  expectPacked(invoke(READER, "readChunks", chunkArgs({ nChunks: 0, len1Class: 2, streamPresent: 1 })), 111, "restore GM16");
});

test("mutant GM17 off2Class != 0 goes RED then restore", () => {
  withMutant(
    READER,
    "  if off2Class != 0 {\n    return finish(11, true)\n  }",
    "",
    () => {
      const red = invoke(READER, "readChunks", chunkArgs({ nChunks: 0, off2Class: 2, streamPresent: 1 }));
      assert.equal(red.present, true, red.reason + " " + red.text);
      assert.notEqual(red.value, 111, "GM17 must survive class 2: " + String(red.value) + " " + red.text);
    },
  );
  expectPacked(invoke(READER, "readChunks", chunkArgs({ nChunks: 0, off2Class: 2, streamPresent: 1 })), 111, "restore GM17");
});

test("mutant GM18 len2Class != 0 goes RED then restore", () => {
  withMutant(
    READER,
    "  if len2Class != 0 {\n    return finish(11, true)\n  }",
    "",
    () => {
      const red = invoke(READER, "readChunks", chunkArgs({ nChunks: 0, len2Class: 2, streamPresent: 1 }));
      assert.equal(red.present, true, red.reason + " " + red.text);
      assert.notEqual(red.value, 111, "GM18 must survive class 2: " + String(red.value) + " " + red.text);
    },
  );
  expectPacked(invoke(READER, "readChunks", chunkArgs({ nChunks: 0, len2Class: 2, streamPresent: 1 })), 111, "restore GM18");
});

test("mutant GM5 two-chunk off1 overflow goes RED then restore", () => {
  withMutant(
    READER,
    "    if off1 > maxInt2 - len1 {\n      return finish(14, true)\n    }",
    "",
    () => {
      const red = invoke(READER, "readChunks", chunkArgs({
        nChunks: 2, id1: 1, off1: 2147483647, len1: 2, id2: 2, off2: 0, len2: 2, cap: 16384, streamPresent: 1,
      }));
      assert.equal(red.present !== true || red.value !== 114, true, "GM5 must not keep 114: " + String(red.value) + " " + red.text);
    },
  );
  expectPacked(invoke(READER, "readChunks", chunkArgs({
    nChunks: 2, id1: 1, off1: 2147483647, len1: 2, id2: 2, off2: 0, len2: 2, cap: 16384, streamPresent: 1,
  })), 114, "restore GM5");
});

test("mutant GM4 two-chunk off2 overflow goes RED then restore", () => {
  withMutant(
    READER,
    "    if off2 > maxInt2 - len2 {\n      return finish(14, true)\n    }",
    "",
    () => {
      const red = invoke(READER, "readChunks", chunkArgs({
        nChunks: 2, id1: 1, off1: 0, len1: 2, id2: 2, off2: 2147483647, len2: 2, cap: 16384, streamPresent: 1,
      }));
      assert.equal(red.present !== true || red.value !== 114, true, "GM4 must not keep 114: " + String(red.value) + " " + red.text);
    },
  );
  expectPacked(invoke(READER, "readChunks", chunkArgs({
    nChunks: 2, id1: 1, off1: 0, len1: 2, id2: 2, off2: 2147483647, len2: 2, cap: 16384, streamPresent: 1,
  })), 114, "restore GM4");
});

test("mutant GM24 zero-chunk declared 5 goes RED then restore", () => {
  withMutant(
    READER,
    "      if declaredLen > 0 {\n        return finish(6, true)\n      }",
    "      if declaredLen > 99999 {\n        return finish(6, true)\n      }",
    () => {
      const red = invoke(READER, "readChunks", chunkArgs({
        nChunks: 0, declaredPresent: 1, declaredLen: 5, streamPresent: 1,
      }));
      assert.equal(red.present, true, red.reason + " " + red.text);
      assert.notEqual(red.value, 106, "GM24 must survive declared 5: " + String(red.value) + " " + red.text);
    },
  );
  expectPacked(invoke(READER, "readChunks", chunkArgs({
    nChunks: 0, declaredPresent: 1, declaredLen: 5, streamPresent: 1,
  })), 106, "restore GM24");
});

test("mutant GM27 cap -1 goes RED then restore", () => {
  withMutant(
    READER,
    "  if cap < 0 {\n    return finish(12, true)\n  }",
    "",
    () => {
      const red = invoke(READER, "readChunks", chunkArgs({ nChunks: 0, cap: -1, streamPresent: 1 }));
      assert.equal(red.present, true, red.reason + " " + red.text);
      assert.notEqual(red.value, 112, "GM27 must survive cap -1: " + String(red.value) + " " + red.text);
    },
  );
  expectPacked(invoke(READER, "readChunks", chunkArgs({ nChunks: 0, cap: -1, streamPresent: 1 })), 112, "restore GM27");
});

test("mutant GM29 nChunks 3 goes RED then restore", () => {
  withMutant(
    READER,
    "    return finish(0, true)\n  }\n  return finish(11, true)\n}",
    "    return finish(0, true)\n  }\n  return finish(0, true)\n}",
    () => {
      const red = invoke(READER, "readChunks", chunkArgs({ nChunks: 3, streamPresent: 1 }));
      assert.equal(red.present, true, red.reason + " " + red.text);
      assert.notEqual(red.value, 111, "GM29 must survive nChunks 3: " + String(red.value) + " " + red.text);
    },
  );
  expectPacked(invoke(READER, "readChunks", chunkArgs({ nChunks: 3, streamPresent: 1 })), 111, "restore GM29");
});

test("A2 import c-boundary: check admits, build and run --invoke refuse", () => {
  const tmp = mkdtempSync(join(tmpdir(), "q31-07-a2-"));
  try {
    const boundarySrc = readFileSync(BOUNDARY, "utf8");
    const probe =
      "@version 1\n" +
      "import \"./c-boundary.fungi\"\n" +
      "pure flow ping(classTag: Int, integer: Int) -> Int\n" +
      "contract {\n" +
      "  intent { \"A2 probe import helper CALL\" }\n" +
      "}\n" +
      "{\n" +
      "  let reason: Int = readForeignSafeInteger(classTag, integer)\n" +
      "  return reason\n" +
      "}\n";
    writeFileSync(join(tmp, "c-boundary.fungi"), boundarySrc);
    const probePath = join(tmp, "probe.fungi");
    writeFileSync(probePath, probe);
    const check = spawnSync(process.execPath, [GALERINA, "check", probePath, "--strict-types", "--strict-governance"], {
      encoding: "utf8", cwd: REPO,
    });
    const build = spawnSync(process.execPath, [GALERINA, "build", probePath], {
      encoding: "utf8", cwd: REPO,
    });
    const run = spawnSync(process.execPath, [GALERINA, "run", probePath, "--invoke", "ping", "0", "4"], {
      encoding: "utf8", cwd: REPO,
    });
    assert.equal(check.status, 0, "check must admit import: " + (check.stdout || "") + (check.stderr || ""));
    assert.notEqual(build.status, 0, "build must refuse: " + (build.stdout || "") + (build.stderr || ""));
    assert.equal((build.stderr || "").includes("FUNGI-NAME-001"), true, build.stderr);
    assert.notEqual(run.status, 0, "run --invoke must refuse: " + (run.stdout || "") + (run.stderr || ""));
    assert.equal((run.stderr || "").includes("readForeignSafeInteger"), true, run.stderr);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("CN-1 body-reader does not define the helper", () => {
  const src = readFileSync(READER, "utf8");
  assert.equal(src.includes("pure flow readForeignSafeInteger"), false);
  const boundary = readFileSync(BOUNDARY, "utf8");
  assert.equal(boundary.includes("pure flow readForeignSafeInteger"), true);
});
