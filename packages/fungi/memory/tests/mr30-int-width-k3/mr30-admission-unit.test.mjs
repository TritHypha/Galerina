// MEM-R30 (gap 4.6/H13): unit pins for the ONE declared-type CLI argument admission shared by raw
// --invoke and --governed. Phillip's decision 2026-10-31: 32-bit and 64-bit integers, both zero-trust
// and K3. Int is an alias of Int32 (checked i32); Int64/UInt64 are exact bigint ranges.
import { test } from "node:test";
import assert from "node:assert/strict";
import { join, dirname } from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "..");
// MR30_GALERINA lets the mutant harness in mr30-cli.test.mjs point this file at a mutated copy.
const G = await import(pathToFileURL(process.env.MR30_GALERINA ?? join(REPO, "galerina.mjs")).href);
const { admitIntegerText, admitInvokeArg, marshalRawInvokeArg, foldInvokeArgVerdicts, k3ArgVerdictWire,
  checkDeclaredIntegerResult, governedRefusalLine, INVOKE_INTEGER_RANGES, K3_ARG_WIRE, K3_ARG_ORDER } = G;

const P31 = 2n ** 31n, P53 = 2n ** 53n, P63 = 2n ** 63n, P64 = 2n ** 64n;
const around = (b) => [b - 1n, b, b + 1n, -b - 1n, -b, -b + 1n];

function expectRange(type, lo, hi) {
  for (const b of [P31, P53, P63, P64]) {
    for (const v of around(b)) {
      const r = admitIntegerText(v.toString(), type);
      if (v >= lo && v <= hi) {
        assert.equal(r.verdict, "ALLOW", `${type} ${v}`);
        assert.equal(typeof r.value, "bigint", "value is a bigint, never a Number");
        assert.equal(r.value, v, `${type} ${v} exact`);
      } else {
        assert.deepEqual(r, { verdict: "DENY", reason: "INT_RANGE" }, `${type} ${v}`);
      }
    }
  }
}

test("ranges are the exact two's-complement / unsigned bounds", () => {
  assert.deepEqual([...INVOKE_INTEGER_RANGES.Int], [-P31, P31 - 1n]);
  assert.deepEqual([...INVOKE_INTEGER_RANGES.Int32], [-P31, P31 - 1n]);
  assert.deepEqual([...INVOKE_INTEGER_RANGES.Int64], [-P63, P63 - 1n]);
  assert.deepEqual([...INVOKE_INTEGER_RANGES.UInt64], [0n, P64 - 1n]);
  assert.deepEqual([...INVOKE_INTEGER_RANGES.UInt32], [0n, 2n ** 32n - 1n]);
  assert.deepEqual([...INVOKE_INTEGER_RANGES.Int8], [-128n, 127n]);
  assert.deepEqual([...INVOKE_INTEGER_RANGES.Int16], [-32768n, 32767n]);
  assert.deepEqual([...INVOKE_INTEGER_RANGES.UInt8], [0n, 255n]);
  assert.deepEqual([...INVOKE_INTEGER_RANGES.Byte], [0n, 255n]);
  assert.deepEqual([...INVOKE_INTEGER_RANGES.UInt16], [0n, 65535n]);
});

test("boundaries 2^31, 2^53, 2^63, 2^64 (+/-1) for every width", () => {
  for (const [type, [lo, hi]] of Object.entries(INVOKE_INTEGER_RANGES)) expectRange(type, lo, hi);
});

test("small widths at their own edges", () => {
  for (const [type, [lo, hi]] of Object.entries(INVOKE_INTEGER_RANGES)) {
    for (const v of [lo - 1n, lo, lo + 1n, hi - 1n, hi, hi + 1n]) {
      const r = admitIntegerText(v.toString(), type);
      assert.equal(r.verdict, v >= lo && v <= hi ? "ALLOW" : "DENY", `${type} ${v}`);
    }
  }
});

test("canonical text only: no +, leading zeros, -0, whitespace, exponent, underscores, hex", () => {
  for (const type of Object.keys(INVOKE_INTEGER_RANGES)) {
    for (const text of ["", " ", " 1", "1 ", "+1", "-0", "00", "01", "-01", "1.0", "1.5", "1e3", "1E3",
      "0x10", "0b1", "1_000", "Infinity", "NaN", "--1", "-", "\u0661", "1\u0000", "\t1", "1\n"]) {
      assert.deepEqual(admitIntegerText(text, type), { verdict: "DENY", reason: "INT_MALFORMED" }, `${type} ${JSON.stringify(text)}`);
    }
  }
});

test("unsigned widths refuse any negative text (DENY, never wrapped)", () => {
  for (const type of ["UInt8", "Byte", "UInt16", "UInt32", "UInt64"]) {
    assert.equal(admitIntegerText("-1", type).verdict, "DENY", type);
    assert.equal(admitIntegerText(`-${P64 - 1n}`, type).verdict, "DENY", type);
  }
});

test("over-long text is DENY before parsing; non-text and unknown type are UNKNOWN", () => {
  assert.deepEqual(admitIntegerText("1".repeat(65), "Int64"), { verdict: "DENY", reason: "INT_TOO_LONG" });
  assert.deepEqual(admitIntegerText("1".repeat(21), "UInt64"), { verdict: "DENY", reason: "INT_RANGE" });
  assert.deepEqual(admitIntegerText(5, "Int"), { verdict: "UNKNOWN", reason: "INT_NOT_TEXT" });
  assert.deepEqual(admitIntegerText(undefined, "Int64"), { verdict: "UNKNOWN", reason: "INT_NOT_TEXT" });
  for (const type of ["", undefined, "Integer", "int", "Int128", "Long", "i32"]) {
    assert.deepEqual(admitIntegerText("1", type), { verdict: "UNKNOWN", reason: "INT_TYPE_UNKNOWN" }, String(type));
  }
});

test("Int is an alias of Int32: identical verdicts and values on both surfaces", () => {
  const vectors = ["0", "1", "-1", "2147483647", "-2147483648", "2147483648", "-2147483649",
    "9007199254740991", "9007199254740993", "9223372036854775807", "01", "-0", "+5", "1e3", "abc"];
  for (const surface of ["raw", "governed"]) {
    for (const text of vectors) {
      const a = admitInvokeArg(text, "Int", surface);
      const b = admitInvokeArg(text, "Int32", surface);
      assert.deepEqual(a, b, `${surface} ${text}: Int and Int32 must behave identically`);
    }
  }
  assert.deepEqual(admitIntegerText("2147483647", "Int"), admitIntegerText("2147483647", "Int32"));
  assert.deepEqual(INVOKE_INTEGER_RANGES.Int, INVOKE_INTEGER_RANGES.Int32);
});

test("raw surface: Int/Int32 to the i32 lane as number, Int64 to the i64 lane as bigint", () => {
  assert.deepEqual(marshalRawInvokeArg("2147483647", "Int32"), { ok: true, verdict: "ALLOW", value: 2147483647 });
  assert.deepEqual(marshalRawInvokeArg("9223372036854775807", "Int64"), { ok: true, verdict: "ALLOW", value: 9223372036854775807n });
  assert.deepEqual(marshalRawInvokeArg("9007199254740993", "Int64"), { ok: true, verdict: "ALLOW", value: 9007199254740993n });
  assert.deepEqual(marshalRawInvokeArg("9223372036854775808", "Int64"), { ok: false, verdict: "DENY", reason: "RAW_ARG_I64_RANGE" });
  assert.deepEqual(marshalRawInvokeArg("2147483648", "Int32"), { ok: false, verdict: "DENY", reason: "RAW_ARG_I32_RANGE" });
  // No raw carrier: known widths are DENY (unsupported), checked for range first.
  for (const type of ["UInt64", "UInt32", "Int8", "Int16", "UInt8", "UInt16", "Byte"]) {
    assert.deepEqual(marshalRawInvokeArg("1", type), { ok: false, verdict: "DENY", reason: "RAW_ARG_TYPE_UNSUPPORTED" }, type);
  }
  assert.equal(marshalRawInvokeArg("-1", "UInt64").reason, "RAW_ARG_I64_RANGE");
});

test("governed surface: tagged values, Int64/UInt64 carried as bigint", () => {
  assert.deepEqual(admitInvokeArg("-2147483648", "Int", "governed").value, { __tag: "int", value: -2147483648 });
  assert.deepEqual(admitInvokeArg("-9223372036854775808", "Int64", "governed").value, { __tag: "int64", value: -(P63) });
  assert.deepEqual(admitInvokeArg("18446744073709551615", "UInt64", "governed").value, { __tag: "uint64", value: P64 - 1n });
  assert.deepEqual(admitInvokeArg("9007199254740991", "Int", "governed"), { ok: false, verdict: "DENY", reason: "GOV_ARG_RANGE" },
    "the old governed check admitted anything up to 2^53");
  assert.deepEqual(admitInvokeArg("18446744073709551616", "UInt64", "governed"), { ok: false, verdict: "DENY", reason: "GOV_ARG_RANGE" });
  assert.deepEqual(admitInvokeArg("-1", "UInt64", "governed"), { ok: false, verdict: "DENY", reason: "GOV_ARG_RANGE" });
  assert.deepEqual(admitInvokeArg("1", "Int8", "governed"), { ok: false, verdict: "DENY", reason: "GOV_ARG_TYPE_UNSUPPORTED" });
  assert.deepEqual(admitInvokeArg("x", "String", "governed").value, { __tag: "string", value: "x" });
});

test("K3 shape: DENY vs UNKNOWN are distinct and both refuse", () => {
  for (const surface of ["raw", "governed"]) {
    const P = surface === "raw" ? "RAW_ARG_" : "GOV_ARG_";
    assert.deepEqual(admitInvokeArg("1", "", surface), { ok: false, verdict: "UNKNOWN", reason: P + "TYPE_UNKNOWN" });
    assert.deepEqual(admitInvokeArg("1", "not a type", surface), { ok: false, verdict: "UNKNOWN", reason: P + "TYPE_UNKNOWN" });
    assert.deepEqual(admitInvokeArg(undefined, "Int", surface), { ok: false, verdict: "UNKNOWN", reason: P + "NOT_TEXT" });
    assert.equal(admitInvokeArg("01", "Int", surface).verdict, "DENY");
    assert.equal(admitInvokeArg("Array", "Array<Int>", surface).verdict, "DENY");
  }
  assert.deepEqual(admitInvokeArg("1", "Int", "elsewhere"), { ok: false, verdict: "UNKNOWN", reason: "ARG_SURFACE_UNKNOWN" });
});

test("strong Kleene AND fold: min over DENY < UNKNOWN < ALLOW; only all-ALLOW runs", () => {
  const A = { ok: true, verdict: "ALLOW", value: 1 };
  const D = { ok: false, verdict: "DENY", reason: "R_D" };
  const U = { ok: false, verdict: "UNKNOWN", reason: "R_U" };
  assert.deepEqual(foldInvokeArgVerdicts([]), { verdict: "ALLOW", index: -1, reason: "" });
  assert.deepEqual(foldInvokeArgVerdicts([A, A]), { verdict: "ALLOW", index: -1, reason: "" });
  assert.deepEqual(foldInvokeArgVerdicts([A, U]), { verdict: "UNKNOWN", index: 1, reason: "R_U" });
  assert.deepEqual(foldInvokeArgVerdicts([U, D]), { verdict: "DENY", index: 1, reason: "R_D" });
  assert.deepEqual(foldInvokeArgVerdicts([D, U]), { verdict: "DENY", index: 0, reason: "R_D" });
  assert.deepEqual(foldInvokeArgVerdicts([A, D, D]), { verdict: "DENY", index: 1, reason: "R_D" });
  // Truth table: fold(x, y) = min(x, y) for all nine pairs.
  const all = { ALLOW: A, DENY: D, UNKNOWN: U };
  for (const x of Object.keys(all)) for (const y of Object.keys(all)) {
    const want = K3_ARG_ORDER[x] <= K3_ARG_ORDER[y] ? x : y;
    assert.equal(foldInvokeArgVerdicts([all[x], all[y]]).verdict, want, `${x} AND ${y}`);
  }
  // A forged ALLOW without ok, or a malformed entry, never folds to ALLOW.
  assert.equal(foldInvokeArgVerdicts([{ verdict: "ALLOW" }]).verdict, "UNKNOWN");
  assert.equal(foldInvokeArgVerdicts([null]).verdict, "UNKNOWN");
  assert.equal(foldInvokeArgVerdicts(undefined).verdict, "UNKNOWN");
});

test("K3 wire byte: ALLOW 0x01, DENY 0xFF, UNKNOWN 0x80 (-128); never in-band in a value", () => {
  assert.deepEqual({ ...K3_ARG_WIRE }, { ALLOW: 0x01, DENY: 0xff, UNKNOWN: 0x80 });
  assert.equal(k3ArgVerdictWire("UNKNOWN"), 0x80);
  assert.equal((k3ArgVerdictWire("UNKNOWN") << 24) >> 24, -128);
  assert.equal(k3ArgVerdictWire("garbage"), 0x80, "an unrecognised verdict is UNKNOWN");
  for (const type of Object.keys(INVOKE_INTEGER_RANGES)) {
    for (const text of ["-1", "0", "18446744073709551616", "x"]) {
      const r = admitIntegerText(text, type);
      if (r.verdict !== "ALLOW") assert.equal("value" in r, false, "a refusal carries no sentinel number");
    }
  }
});

test("narrowing guard: Int/Int32 results must fit i32, 64-bit results print exact", () => {
  assert.equal(checkDeclaredIntegerResult({ __tag: "int64", value: P31 }, "Int"), "RESULT_RANGE");
  assert.equal(checkDeclaredIntegerResult({ __tag: "int64", value: P31 - 1n }, "Int32"), null);
  assert.equal(checkDeclaredIntegerResult({ __tag: "int", value: 2 ** 53 }, "Int"), "RESULT_NOT_EXACT_INTEGER");
  assert.equal(checkDeclaredIntegerResult({ __tag: "int", value: 2 ** 31 }, "Int"), "RESULT_RANGE");
  assert.equal(checkDeclaredIntegerResult(P63, "Int"), "RESULT_RANGE");
  assert.equal(checkDeclaredIntegerResult(-1n, "UInt64"), null, "raw i64 bits reinterpret as UInt64 max");
  assert.equal(checkDeclaredIntegerResult(P63 - 1n, "Int64"), null);
  assert.equal(checkDeclaredIntegerResult(1.5, "Int"), "RESULT_NOT_EXACT_INTEGER");
  assert.equal(checkDeclaredIntegerResult(7, "Int"), null);
  assert.equal(checkDeclaredIntegerResult({ __tag: "runtimeError", message: "x" }, "Int"), null);
  assert.equal(checkDeclaredIntegerResult(5, "String"), null);
});

test("governed refusal line names position and verdict, never the text", () => {
  const line = governedRefusalLine("DENY", "GOV_ARG_RANGE", 1, "x", "Int64");
  assert.match(line, /argument #2 for parameter 'x' declared Int64 is invalid; .*K3 DENY \(GOV_ARG_RANGE\)/);
  assert.match(line, /cannot marshal/);
  assert.match(line, /not echoed/);
});
test("docs pin: Int is documented as an alias of Int32", () => {
  const notes = readFileSync(join(REPO, "docs", "examples", "Level-2-Types", "051-int-basic", "notes.md"), "utf8");
  assert.match(notes, /Int is an alias of Int32/);
  assert.match(notes, /Int and Int32 are the same type/);
});