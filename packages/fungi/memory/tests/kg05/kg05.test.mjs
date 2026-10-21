import { spawnSync } from "node:child_process";
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { readFileSync, writeFileSync } from "node:fs";
import {
  encodeI64,
  encodeU64,
  classifyLegacyI32,
  invokeArgs,
  I64_MIN,
  I64_MAX,
  U64_MAX,
  U64_ONE_PAST_MAX,
} from "./encode.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const MEM = join(HERE, "..", "..");
const REPO = join(MEM, "..", "..", "..");
const BOUNDARY = join(MEM, "src", "c-boundary.fungi");
const ENCODE = join(HERE, "encode.mjs");
const GALERINA = join(REPO, "galerina.mjs");

const DLO = -2147483647;
const DHI = 2147483647;
const TIGHT_LO = 0;
const TIGHT_HI = 16;

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

function withMutant(path, from, to, label, fn) {
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

function reasonOf(bytes, bufLen, lo, hi) {
  return invoke(BOUNDARY, "readTaggedWideInteger", invokeArgs(bufLen, bytes, lo, hi));
}

function valueOf(bytes, bufLen, lo, hi) {
  return invoke(BOUNDARY, "decodeTaggedWideI32", invokeArgs(bufLen, bytes, lo, hi));
}

test("KG-05 host encode refuses 2^64 and -1 as u64 before conversion", () => {
  const past = encodeU64(U64_ONE_PAST_MAX);
  assert.equal(past.ok, false, "2^64");
  assert.equal(past.reason, "RANGE");
  assert.equal(past.bytes.length, 0);
  const neg = encodeU64(-1n);
  assert.equal(neg.ok, false, "-1 u64");
  assert.equal(neg.reason, "RANGE");
  const overI = encodeI64(I64_MAX + 1n);
  assert.equal(overI.ok, false, "i64 max+1");
  const underI = encodeI64(I64_MIN - 1n);
  assert.equal(underI.ok, false, "i64 min-1");
});

test("KG-05 host encode has no 64-bit wrap conversion helpers", () => {
  const src = readFileSync(ENCODE, "utf8");
  const wrapSigned = "asInt" + "N";
  const wrapUnsigned = "asUint" + "N";
  assert.equal(src.includes(wrapSigned), false);
  assert.equal(src.includes(wrapUnsigned), false);
});

test("KG-05 classifyLegacyI32 refuses |x| > 2147483647 as classTag 8", () => {
  assert.equal(classifyLegacyI32(4294967300).classTag, 8);
  assert.equal(classifyLegacyI32(2147483648).classTag, 8);
  assert.equal(classifyLegacyI32(-2147483648).classTag, 8);
  assert.equal(classifyLegacyI32(2147483647).classTag, 0);
  assert.equal(classifyLegacyI32(-2147483647).classTag, 0);
  assert.equal(classifyLegacyI32(4).classTag, 0);
  const tagged = classifyLegacyI32(4294967300);
  expectPacked(invoke(BOUNDARY, "readForeignBoundedInteger", [tagged.classTag, 4, DLO, DHI]), 8, "legacy wrap classTag");
});

test("KG-05 in-domain i64 round-trips", () => {
  const values = [0n, 1n, 16n, 2147483647n, -1n, -2147483647n];
  let i = 0;
  while (i < values.length) {
    const n = values[i];
    const enc = encodeI64(n);
    assert.equal(enc.ok, true, String(n));
    assert.equal(enc.bytes.length, 10, String(n) + " len");
    expectPacked(reasonOf(enc.bytes, 10, DLO, DHI), 0, "reason " + String(n));
    expectPacked(valueOf(enc.bytes, 10, DLO, DHI), Number(n), "value " + String(n));
    i = i + 1;
  }
});

test("KG-05 in-domain u64 round-trips", () => {
  const values = [0n, 1n, 16n, 2147483647n];
  let i = 0;
  while (i < values.length) {
    const n = values[i];
    const enc = encodeU64(n);
    assert.equal(enc.ok, true, String(n));
    expectPacked(reasonOf(enc.bytes, 10, 0, DHI), 0, "u64 reason " + String(n));
    expectPacked(valueOf(enc.bytes, 10, 0, DHI), Number(n), "u64 value " + String(n));
    i = i + 1;
  }
});

test("KG-05 wide values refuse after decode and never wrap to 1 or 0", () => {
  const cases = [
    { n: 4294967297n, label: "2^32+1" },
    { n: 9007199254740992n, label: "2^53" },
    { n: 9007199254740993n, label: "2^53+1" },
    { n: I64_MAX, label: "2^63-1" },
    { n: I64_MIN, label: "-2^63" },
  ];
  let i = 0;
  while (i < cases.length) {
    const row = cases[i];
    const enc = encodeI64(row.n);
    assert.equal(enc.ok, true, row.label + " host i64 domain");
    const r = reasonOf(enc.bytes, 10, DLO, DHI);
    expectPacked(r, 8, row.label);
    const v = valueOf(enc.bytes, 10, DLO, DHI);
    expectPacked(v, 0, row.label + " value refuse");
    assert.notEqual(v.value, 1, row.label + " not wrap 1");
    i = i + 1;
  }
  const uMax = encodeU64(U64_MAX);
  assert.equal(uMax.ok, true, "u64 max host");
  expectPacked(reasonOf(uMax.bytes, 10, 0, DHI), 8, "2^64-1 u64");
});

test("KG-05 short empty long buffers refuse before conversion", () => {
  const enc = encodeI64(1n);
  expectPacked(reasonOf(enc.bytes, 0, DLO, DHI), 14, "empty");
  expectPacked(reasonOf(enc.bytes, 7, DLO, DHI), 14, "short 7");
  expectPacked(reasonOf(enc.bytes, 9, DLO, DHI), 14, "short 9");
  expectPacked(reasonOf(enc.bytes, 11, DLO, DHI), 14, "long 11");
});

test("KG-05 unknown tags refuse before conversion", () => {
  const one = encodeI64(1n).bytes.slice();
  one[0] = 0x00;
  expectPacked(reasonOf(one, 10, DLO, DHI), 12, "tag 0x00");
  one[0] = 0x03;
  expectPacked(reasonOf(one, 10, DLO, DHI), 12, "tag 0x03");
  one[0] = 0xff;
  expectPacked(reasonOf(one, 10, DLO, DHI), 12, "tag 0xFF");
});

test("KG-05 length byte other than 8 refuses before conversion", () => {
  const one = encodeI64(1n).bytes.slice();
  one[1] = 0;
  expectPacked(reasonOf(one, 10, DLO, DHI), 13, "len 0");
  one[1] = 7;
  expectPacked(reasonOf(one, 10, DLO, DHI), 13, "len 7");
  one[1] = 9;
  expectPacked(reasonOf(one, 10, DLO, DHI), 13, "len 9");
  one[1] = 255;
  expectPacked(reasonOf(one, 10, DLO, DHI), 13, "len 255");
});

test("mutant m5a accept length 7 or 9 goes RED then restore", () => {
  const enc = encodeI64(1n);
  expectPacked(reasonOf(enc.bytes, 7, DLO, DHI), 14, "live 7");
  withMutant(
    BOUNDARY,
    "  if bufLen != 10 {\n    return 14\n  }",
    "  if bufLen == 100 {\n    return 14\n  }",
    "m5a",
    () => {
      const red = reasonOf(enc.bytes, 7, DLO, DHI);
      assert.equal(red.value, 0, "m5a RED " + red.text);
    },
  );
  expectPacked(reasonOf(enc.bytes, 7, DLO, DHI), 14, "restore 7");
});

test("mutant m5b accept tag 0x03 goes RED then restore", () => {
  const one = encodeI64(1n).bytes.slice();
  one[0] = 0x03;
  expectPacked(reasonOf(one, 10, DLO, DHI), 12, "live tag 3");
  withMutant(
    BOUNDARY,
    "  if b0 != 1 {\n    if b0 != 2 {\n      return 12\n    }\n  }\n  if b1 != 8 {\n    return 13\n  }\n  let w0: Int = u16FromBytes(b2, b3)\n  let w1: Int = u16FromBytes(b4, b5)\n  let w2: Int = u16FromBytes(b6, b7)\n  let w3: Int = u16FromBytes(b8, b9)\n  let fit: Int = taggedPayloadFitsI32(b0, w0, w1, w2, w3)",
    "  if b1 != 8 {\n    return 13\n  }\n  let w0: Int = u16FromBytes(b2, b3)\n  let w1: Int = u16FromBytes(b4, b5)\n  let w2: Int = u16FromBytes(b6, b7)\n  let w3: Int = u16FromBytes(b8, b9)\n  let fit: Int = taggedPayloadFitsI32(1, w0, w1, w2, w3)",
    "m5b",
    () => {
      const red = reasonOf(one, 10, DLO, DHI);
      assert.equal(red.value, 0, "m5b RED " + red.text);
    },
  );
  expectPacked(reasonOf(one, 10, DLO, DHI), 12, "restore tag 3");
});

test("mutant m5c skip post-decode range check goes RED then restore", () => {
  const enc = encodeI64(20n);
  expectPacked(reasonOf(enc.bytes, 10, TIGHT_LO, TIGHT_HI), 8, "live 20");
  withMutant(
    BOUNDARY,
    "  let value: Int = taggedPayloadI32(w0, w1)\n  if value < domainLo {\n    return 8\n  }\n  if value > domainHi {\n    return 8\n  }\n  return 0",
    "  let value: Int = taggedPayloadI32(w0, w1)\n  return 0",
    "m5c",
    () => {
      const red = reasonOf(enc.bytes, 10, TIGHT_LO, TIGHT_HI);
      assert.equal(red.value, 0, "m5c RED " + red.text);
    },
  );
  expectPacked(reasonOf(enc.bytes, 10, TIGHT_LO, TIGHT_HI), 8, "restore 20");
});

test("mutant m5d truncate to low 32 bits goes RED then restore", () => {
  const enc = encodeI64(4294967297n);
  expectPacked(reasonOf(enc.bytes, 10, DLO, DHI), 8, "live 2^32+1");
  withMutant(
    BOUNDARY,
    "  if tag == 1 {\n    if w3 == 0 {\n      if w2 == 0 {\n        if w1 < 32768 {\n          return 0\n        }\n      }\n    }",
    "  if tag == 1 {\n    return 0\n    if w3 == 0 {\n      if w2 == 0 {\n        if w1 < 32768 {\n          return 0\n        }\n      }\n    }",
    "m5d",
    () => {
      const red = reasonOf(enc.bytes, 10, DLO, DHI);
      assert.equal(red.value, 0, "m5d RED " + red.text);
    },
  );
  expectPacked(reasonOf(enc.bytes, 10, DLO, DHI), 8, "restore 2^32+1");
});

test("mutant m5e BigInt.asIntN wrap goes RED then restore", async () => {
  const live = encodeU64(U64_ONE_PAST_MAX);
  assert.equal(live.ok, false, "live 2^64");
  const orig = readFileSync(ENCODE, "utf8");
  const from = "  if (n > U64_MAX) {\n    return { ok: false, reason: \"RANGE\", bytes: [] };\n  }\n  const payload = writeRemainderLE(n, false);";
  const to = "  n = BigInt.asIntN(64, n);\n  if (n > U64_MAX) {\n    return { ok: false, reason: \"RANGE\", bytes: [] };\n  }\n  const payload = writeRemainderLE(n, false);";
  const mutant = orig.replace(from, to);
  assert.notEqual(mutant, orig, "m5e needle");
  writeFileSync(ENCODE, mutant);
  try {
    const url = pathToFileURL(ENCODE).href + "?m5e=" + String(Date.now());
    const mod = await import(url);
    const red = mod.encodeU64(U64_ONE_PAST_MAX);
    assert.equal(red.ok, true, "m5e encodes");
    assert.equal(red.bytes[2], 0, "m5e wrap to 0");
  } finally {
    writeFileSync(ENCODE, orig);
  }
});

test("mutant m5f big-endian decode goes RED then restore", () => {
  const enc = encodeI64(1n);
  expectPacked(valueOf(enc.bytes, 10, DLO, DHI), 1, "live LE 1");
  withMutant(
    BOUNDARY,
    "  let w0: Int = u16FromBytes(b2, b3)\n  let w1: Int = u16FromBytes(b4, b5)\n  let w2: Int = u16FromBytes(b6, b7)\n  let w3: Int = u16FromBytes(b8, b9)",
    "  let w0: Int = u16FromBytes(b8, b9)\n  let w1: Int = u16FromBytes(b6, b7)\n  let w2: Int = u16FromBytes(b4, b5)\n  let w3: Int = u16FromBytes(b2, b3)",
    "m5f",
    () => {
      const red = valueOf(enc.bytes, 10, DLO, DHI);
      assert.notEqual(red.value, 1, "m5f RED " + red.text);
    },
  );
  expectPacked(valueOf(enc.bytes, 10, DLO, DHI), 1, "restore LE 1");
});
