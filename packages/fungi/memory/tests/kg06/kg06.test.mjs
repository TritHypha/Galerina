import { spawnSync } from "node:child_process";
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

import { uniqueFungiFile } from "../_harness/unique-build-name.mjs";
const HERE = dirname(fileURLToPath(import.meta.url));
const MEM = join(HERE, "..", "..");
const REPO = join(MEM, "..", "..", "..");
const BOUNDARY = join(MEM, "src", "c-boundary.fungi");
const ARENA = join(MEM, "src", "secret-arena.fungi");
const RCP = join(MEM, "src", "release-commit-point.fungi");
const PORT = join(MEM, "src", "secret-arena-custodian-port.fungi");
const PROFILE = join(MEM, "src", "adapter-profile.fungi");
const GALERINA = join(REPO, "galerina.mjs");
const CB_IMPORT = "\nimport \"./c-boundary.fungi\"\n";
const RCP_IMPORT = "\nimport \"./release-commit-point.fungi\"\n";
const PORT_IMPORT = "\nimport \"./secret-arena-custodian-port.fungi\"\n";
const PROFILE_IMPORT = "import \"./c-boundary.fungi\"";

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

function withFileMutant(path, from, to, label, fn) {
  const orig = readFileSync(path, "utf8");
  const mutant = orig.replace(from, to);
  assert.notEqual(mutant, orig, label + " needle");
  writeFileSync(path, mutant);
  try {
    fn();
  } finally {
    writeFileSync(path, orig);
  }
}

function withMutant(from, to, label, fn) {
  withFileMutant(BOUNDARY, from, to, label, fn);
}

function stripVersion(src) {
  const marker = "@version 1";
  const first = src.indexOf(marker);
  assert.notEqual(first, -1, "version marker");
  return src.slice(first + marker.length);
}

function splitOnce(src, needle, label) {
  const parts = src.split(needle);
  assert.equal(parts.length, 2, label + " import line must occur once");
  return parts[0] + "\n" + parts[1];
}

function flattenArena() {
  const boundary = readFileSync(BOUNDARY, "utf8");
  const rcp = readFileSync(RCP, "utf8");
  const port = readFileSync(PORT, "utf8");
  const unit = readFileSync(ARENA, "utf8");
  let rest = unit;
  rest = splitOnce(rest, CB_IMPORT, "c-boundary");
  rest = splitOnce(rest, RCP_IMPORT, "release-commit-point");
  rest = splitOnce(rest, PORT_IMPORT, "custodian-port");
  rest = stripVersion(rest);
  let portRest = splitOnce(port, CB_IMPORT, "port c-boundary");
  portRest = stripVersion(portRest);
  const dir = mkdtempSync(join(tmpdir(), "kg06-arena-"));
  const file = uniqueFungiFile(dir);
  writeFileSync(file, boundary + "\n" + stripVersion(rcp) + "\n" + portRest + "\n" + rest);
  return { dir, file };
}

function flattenProfile() {
  const boundary = readFileSync(BOUNDARY, "utf8");
  const profile = readFileSync(PROFILE, "utf8");
  assert.equal(profile.includes(PROFILE_IMPORT), true, "profile import");
  const parts = profile.split(PROFILE_IMPORT);
  assert.equal(parts.length, 2, "profile import once");
  let rest = parts[0] + parts[1];
  rest = stripVersion(rest);
  const dir = mkdtempSync(join(tmpdir(), "kg06-profile-"));
  const file = uniqueFungiFile(dir);
  writeFileSync(file, boundary + "\n" + rest);
  return { dir, file };
}

function invokeArenaEpoch(lastEpoch, fenceEpoch) {
  const flat = flattenArena();
  try {
    return invoke(flat.file, "arenaEpoch", [0, 0, 0, 0, 0, 8, 0, 1, 0, lastEpoch, 0, fenceEpoch]);
  } finally {
    rmSync(flat.dir, { recursive: true, force: true });
  }
}

function invokeClassify(kind, audit) {
  const flat = flattenProfile();
  try {
    return invoke(flat.file, "classifyAdapter", [0, kind, 0, audit]);
  } finally {
    rmSync(flat.dir, { recursive: true, force: true });
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

test("KG-06 i32 min is 8 on SafeInteger and 0 on I32Integer", () => {
  expectPacked(invoke(BOUNDARY, "readForeignSafeInteger", [0, -2147483648]), 8, "safe i32 min");
  expectPacked(invoke(BOUNDARY, "readForeignI32Integer", [0, -2147483648]), 0, "i32 min admitted");
  expectPacked(invoke(BOUNDARY, "readForeignI32Integer", [0, 2147483647]), 0, "i32 max admitted");
  expectPacked(invoke(BOUNDARY, "readForeignI32Integer", [3, -2147483648]), 3, "NaN tag");
  expectPacked(invoke(BOUNDARY, "readForeignI32Integer", [11, 0]), 11, "unlisted tag");
});

test("KG-06 suite 37 lastEpoch i32 min and wrap 2^31 are 140", () => {
  expectPacked(invokeArenaEpoch(-2147483648, 0), 140, "lastEpoch i32 min");
  expectPacked(invokeArenaEpoch(2147483648, 0), 140, "lastEpoch 2^31 wrap");
  expectPacked(invokeArenaEpoch(1, 2147483648), 140, "fenceEpoch 2^31 wrap");
});

test("KG-06 suite 44 kind i32 min is 3 and audit i32 min is 11", () => {
  expectPacked(invokeClassify(-2147483648, 0), 3, "kind i32 min");
  expectPacked(invokeClassify(0, -2147483648), 11, "audit i32 min");
  expectPacked(invokeClassify(7, -2147483648), 11, "kind 7 audit i32 min");
});

test("mutant m6f I32Integer reverts to SafeInteger goes RED then restore", () => {
  withMutant(
    "  if classTag == 0 {\n    return 0\n  }\n  return readForeignBoundedInteger(classTag, integer, 0, 0)",
    "  return readForeignSafeInteger(classTag, integer)",
    "m6f",
    () => {
      const r = invoke(BOUNDARY, "readForeignI32Integer", [0, -2147483648]);
      assert.notEqual(r.value, 0, "m6f must refuse i32 min");
      assert.equal(r.value, 8, "m6f SafeInteger domain");
    },
  );
  expectPacked(invoke(BOUNDARY, "readForeignI32Integer", [0, -2147483648]), 0, "restore m6f");
});

test("mutant m6g lastEpoch call reverts to SafeInteger goes RED then restore", () => {
  expectPacked(invokeArenaEpoch(2147483648, 0), 140, "landed wide lastEpoch");
  withFileMutant(
    ARENA,
    "  let lastReason: Int = readForeignI32Integer(lastClass, lastEpoch)",
    "  let lastReason: Int = readForeignSafeInteger(lastClass, lastEpoch)",
    "m6g",
    () => {
      const r = invokeArenaEpoch(2147483648, 0);
      assert.notEqual(r.value, 140, "m6g must lose 140");
      assert.equal(r.value, 110, "m6g helper 8 maps to 110");
    },
  );
  expectPacked(invokeArenaEpoch(2147483648, 0), 140, "restore m6g");
});

test("mutant m6h kind call reverts to SafeInteger goes RED then restore", () => {
  expectPacked(invokeClassify(-2147483648, 0), 3, "landed kind i32 min");
  withFileMutant(
    PROFILE,
    "  let kindReason: Int = readForeignI32Integer(kindClass, kind)",
    "  let kindReason: Int = readForeignSafeInteger(kindClass, kind)",
    "m6h",
    () => {
      const r = invokeClassify(-2147483648, 0);
      assert.notEqual(r.value, 3, "m6h must lose UNKNOWN_ADAPTER_KIND");
      assert.equal(r.value, 4, "m6h helper 8 maps to RAW_VALUE_REFUSED");
    },
  );
  expectPacked(invokeClassify(-2147483648, 0), 3, "restore m6h");
});
