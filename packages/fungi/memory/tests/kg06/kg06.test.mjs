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

function withMutant(from, to, label, fn) {
  const orig = readFileSync(BOUNDARY, "utf8");
  const mutant = orig.replace(from, to);
  assert.notEqual(mutant, orig, label + " needle");
  writeFileSync(BOUNDARY, mutant);
  try {
    fn();
  } finally {
    writeFileSync(BOUNDARY, orig);
  }
}

const LO = 0;
const HI = 16;
const TAGS = [-1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 2147483647];
const VALUES = [LO - 1, LO, HI, HI + 1, -1, 0, 2147483647, -2147483647];

test("KG-06 grid: only tag 0 with in-domain value is Ok", () => {
  let cells = 0;
  for (const tag of TAGS) {
    for (const value of VALUES) {
      const r = invoke(BOUNDARY, "readForeignBoundedInteger", [tag, value, LO, HI]);
      cells = cells + 1;
      let expected = 11;
      if (tag >= 1 && tag <= 10) {
        expected = tag;
      }
      if (tag === 0) {
        if (value >= LO && value <= HI) {
          expected = 0;
        } else {
          expected = 8;
        }
      }
      expectPacked(r, expected, "tag=" + tag + " value=" + value);
    }
  }
  assert.equal(cells, TAGS.length * VALUES.length);
});

test("KG-06 classTag 8/9 in-range still refuse as themselves", () => {
  expectPacked(invoke(BOUNDARY, "readForeignBoundedInteger", [8, 4, 0, 16]), 8, "tag 8 in range");
  expectPacked(invoke(BOUNDARY, "readForeignBoundedInteger", [9, 4, 0, 16]), 9, "tag 9 in range");
});

test("KG-06 inverted lo>hi refuses 11", () => {
  expectPacked(invoke(BOUNDARY, "readForeignBoundedInteger", [0, 4, 16, 0]), 11, "inverted domain");
});

test("KG-06 length site classTag 0 negative is 9 never 8", () => {
  expectPacked(invoke(BOUNDARY, "readForeignLength", [0, -1, 2147483647]), 9, "neg length");
  expectPacked(invoke(BOUNDARY, "readForeignLength", [0, 0, 16]), 0, "zero length");
  expectPacked(invoke(BOUNDARY, "readForeignLength", [0, 17, 16]), 8, "over hi");
});

test("KG-06 bool tokens stay {0,1} else 11", () => {
  expectPacked(invoke(BOUNDARY, "readForeignBool", [0]), 0, "bool 0");
  expectPacked(invoke(BOUNDARY, "readForeignBool", [1]), 0, "bool 1");
  expectPacked(invoke(BOUNDARY, "readForeignBool", [2]), 11, "bool 2");
  expectPacked(invoke(BOUNDARY, "readForeignBool", [-1]), 11, "bool -1");
});

test("KG-06 listed tags 0..10 pin; unlisted 11", () => {
  expectPacked(invoke(BOUNDARY, "readForeignBoundedInteger", [0, 1, 0, 16]), 0, "tag 0");
  expectPacked(invoke(BOUNDARY, "readForeignBoundedInteger", [11, 1, 0, 16]), 11, "tag 11");
  expectPacked(invoke(BOUNDARY, "readForeignBoundedInteger", [-1, 1, 0, 16]), 11, "tag -1");
});

test("mutant m6a drop range check goes RED then restore", () => {
  withMutant(
    "    if integer < lo {\n      return 8\n    }\n    if integer > hi {\n      return 8\n    }\n    return 0",
    "    return 0",
    "m6a",
    () => {
      const r = invoke(BOUNDARY, "readForeignBoundedInteger", [0, 99, 0, 16]);
      assert.notEqual(r.value, 8, "m6a must drop OutOfSafeRange");
      assert.equal(r.value, 0, "m6a admits out of range");
    },
  );
  expectPacked(invoke(BOUNDARY, "readForeignBoundedInteger", [0, 99, 0, 16]), 8, "restore m6a");
});

test("mutant m6b default arm returns 0 goes RED then restore", () => {
  withMutant(
    "  if classTag == 10 {\n    return 10\n  }\n  return 11\n}",
    "  if classTag == 10 {\n    return 10\n  }\n  return 0\n}",
    "m6b",
    () => {
      const r = invoke(BOUNDARY, "readForeignBoundedInteger", [99, 0, 0, 16]);
      assert.notEqual(r.value, 11, "m6b must drop Unlisted");
      assert.equal(r.value, 0, "m6b admits unlisted");
    },
  );
  expectPacked(invoke(BOUNDARY, "readForeignBoundedInteger", [99, 0, 0, 16]), 11, "restore m6b");
});

test("mutant m6c widen hi by dropping hi check goes RED then restore", () => {
  withMutant(
    "    if integer > hi {\n      return 8\n    }",
    "    if integer > hi {\n      return 0\n    }",
    "m6c",
    () => {
      const r = invoke(BOUNDARY, "readForeignBoundedInteger", [0, 17, 0, 16]);
      assert.notEqual(r.value, 8, "m6c must admit hi+1");
      assert.equal(r.value, 0, "m6c widened hi");
    },
  );
  expectPacked(invoke(BOUNDARY, "readForeignBoundedInteger", [0, 17, 0, 16]), 8, "restore m6c");
});

test("mutant m6d tag 8 in-range upgraded to Ok goes RED then restore", () => {
  withMutant(
    "  if classTag == 8 {\n    return 8\n  }",
    "  if classTag == 8 {\n    return 0\n  }",
    "m6d",
    () => {
      const r = invoke(BOUNDARY, "readForeignBoundedInteger", [8, 4, 0, 16]);
      assert.notEqual(r.value, 8, "m6d must not keep tag 8");
      assert.equal(r.value, 0, "m6d upgrades tag 8");
    },
  );
  expectPacked(invoke(BOUNDARY, "readForeignBoundedInteger", [8, 4, 0, 16]), 8, "restore m6d");
});

test("mutant m6e caller reverts to unbounded helper goes RED then restore", () => {
  withMutant(
    "  return readForeignBoundedInteger(classTag, integer, 0, 255)",
    "  return readForeignSafeInteger(classTag, integer)",
    "m6e",
    () => {
      const r = invoke(BOUNDARY, "readForeignByte", [0, 256]);
      assert.notEqual(r.value, 8, "m6e must drop byte hi");
      assert.equal(r.value, 0, "m6e unbounded admits 256");
    },
  );
  expectPacked(invoke(BOUNDARY, "readForeignByte", [0, 256]), 8, "restore m6e");
});

test("KG-06 byte domain 0..255", () => {
  expectPacked(invoke(BOUNDARY, "readForeignByte", [0, 0]), 0, "byte 0");
  expectPacked(invoke(BOUNDARY, "readForeignByte", [0, 255]), 0, "byte 255");
  expectPacked(invoke(BOUNDARY, "readForeignByte", [0, 256]), 8, "byte 256");
  expectPacked(invoke(BOUNDARY, "readForeignByte", [0, -1]), 8, "byte -1");
});
