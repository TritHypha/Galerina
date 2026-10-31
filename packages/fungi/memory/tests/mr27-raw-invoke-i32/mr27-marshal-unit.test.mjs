// MEM-R27 (gap 4.6/H13): unit pins for the raw WASM `--invoke` argument marshaller.
// .fungi Int lowers to a WebAssembly i32. Before MEM-R27 the raw path used Number(a), so "",
// "1.5", "1e3", "0x10" and values beyond i32 were admitted and then wrapped by WebAssembly.
// These tests call the exported pure helpers directly; no CLI process, no WASM.
import { test } from "node:test";
import assert from "node:assert/strict";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "..");
const G = await import(pathToFileURL(join(REPO, "galerina.mjs")).href);
const { marshalRawInvokeArg, declaredRawParamType, rawInvokeRefusalLines } = G;

const ok = (text, type) => {
  const r = marshalRawInvokeArg(text, type);
  assert.equal(r.ok, true, `${JSON.stringify(text)} as ${type || "(none)"} must be admitted, got ${r.reason}`);
  return r.value;
};
const refused = (text, type) => {
  const r = marshalRawInvokeArg(text, type);
  assert.equal(r.ok, false, `${JSON.stringify(text)} as ${type || "(none)"} must be refused`);
  assert.equal("value" in r, false, "a refusal carries no value");
  return r.reason;
};

test("i32 bounds are the exported constants", () => {
  assert.equal(G.RAW_INVOKE_I32_MIN, -(2 ** 31));
  assert.equal(G.RAW_INVOKE_I32_MAX, 2 ** 31 - 1);
  assert.equal(G.RAW_INVOKE_MAX_ARG_CHARS, 64);
});

test("Int admits canonical decimals inside i32 exactly", () => {
  for (const [text, value] of [["0", 0], ["1", 1], ["-1", -1], ["42", 42], ["-3", -3],
    ["2147483647", 2147483647], ["-2147483648", -2147483648], ["1398361684", 1398361684]]) {
    assert.equal(ok(text, "Int"), value, text);
  }
});

test("Int refuses values outside i32 instead of wrapping", () => {
  for (const text of ["2147483648", "-2147483649", "4294967295", "4294967296", "4294967300",
    "9007199254740991", "9007199254740992", "9223372036854775807", "-9223372036854775808",
    "99999999999", "100000000000000000000"]) {
    assert.equal(refused(text, "Int"), "RAW_ARG_I32_RANGE", text);
  }
});

test("Int refuses every non-canonical spelling", () => {
  for (const text of ["", " ", " 1", "1 ", "+1", "-0", "00", "01", "-01", "1.5", "1.0", "1e3",
    "1E3", "0x10", "0b1", "0o7", "1_000", "Infinity", "-Infinity", "NaN", "abc", "true", "false",
    "\u0661", "1\u0000", "--1", "-"]) {
    assert.equal(refused(text, "Int"), "RAW_ARG_MALFORMED", JSON.stringify(text));
  }
});

test("Bool admits only the two literals", () => {
  assert.equal(ok("true", "Bool"), 1);
  assert.equal(ok("false", "Bool"), 0);
  for (const text of ["1", "0", "2", "-1", "", "TRUE", "False", "yes", "true ", " false"]) {
    assert.equal(refused(text, "Bool"), "RAW_ARG_MALFORMED", JSON.stringify(text));
  }
});

test("undeclared type admits Bool literals or a canonical i32 only", () => {
  assert.equal(ok("true", ""), 1);
  assert.equal(ok("false", ""), 0);
  assert.equal(ok("-7", ""), -7);
  assert.equal(refused("1.5", ""), "RAW_ARG_MALFORMED");
  assert.equal(refused("4294967300", ""), "RAW_ARG_I32_RANGE");
  assert.equal(refused("", undefined), "RAW_ARG_MALFORMED");
});

test("Float, Float64 and Double admit plain finite decimals only", () => {
  for (const type of ["Float", "Float64", "Double"]) {
    assert.equal(ok("2.5", type), 2.5);
    assert.equal(ok("-3", type), -3);
    assert.equal(ok("0.0", type), 0);
    assert.equal(Object.is(ok("-0.0", type), 0), true, "negative zero is normalised to +0");
    for (const text of ["", "1e3", "0x10", "NaN", "Infinity", ".5", "5.", "+1.5", "1,5"]) {
      assert.equal(refused(text, type), "RAW_ARG_MALFORMED", `${type} ${JSON.stringify(text)}`);
    }
  }
});

test("types the raw lane cannot hold exactly are refused", () => {
  for (const type of ["String", "Array<Int>", "Result<Int, String>", "Option<Int>", "Float32",
    "Float16", "Int64", "Bytes", "Secret<String>"]) {
    assert.equal(refused("1", type), "RAW_ARG_TYPE_UNSUPPORTED", type);
  }
});

test("non-text and over-long arguments are refused before parsing", () => {
  assert.equal(refused(1, "Int"), "RAW_ARG_NOT_TEXT");
  assert.equal(refused(null, "Int"), "RAW_ARG_NOT_TEXT");
  assert.equal(refused("1".repeat(65), "Int"), "RAW_ARG_TOO_LONG");
  assert.equal(refused("1".repeat(65), "Float"), "RAW_ARG_TOO_LONG");
  assert.equal(refused("1".repeat(12), "Int"), "RAW_ARG_I32_RANGE");
});

test("declaredRawParamType mirrors the governed metadata parser", () => {
  assert.equal(declaredRawParamType("x: Int"), "Int");
  assert.equal(declaredRawParamType("b:Bool"), "Bool");
  assert.equal(declaredRawParamType("mut x: Array<Int>"), "Array<Int>");
  assert.equal(declaredRawParamType("s: String source_from request.body"), "String");
  assert.equal(declaredRawParamType("noType"), "");
  assert.equal(declaredRawParamType(": Int"), "");
  assert.equal(declaredRawParamType("x:"), "");
});

test("refusal lines name the position and never carry argument text", () => {
  const secret = "SYNTHETIC-CANARY-7f3a";
  for (const reason of ["RAW_ARG_MALFORMED", "RAW_ARG_I32_RANGE", "RAW_ARG_TYPE_UNSUPPORTED",
    "RAW_ARG_TOO_LONG", "RAW_ARG_NOT_TEXT"]) {
    for (const type of ["Int", "Bool", "Float", "String", ""]) {
      const text = rawInvokeRefusalLines(reason, 2, type).join("\n");
      assert.match(text, /invoke argument #3 /);
      assert.match(text, /the value is not echoed/);
      assert.equal(text.includes(secret), false);
    }
  }
  assert.match(rawInvokeRefusalLines("RAW_ARG_I32_RANGE", 0, "Int").join("\n"), /not a valid Int or Bool.*-2147483648 to 2147483647/s);
  assert.match(rawInvokeRefusalLines("RAW_ARG_MALFORMED", 0, "Float").join("\n"), /not a valid Float/);
  assert.match(rawInvokeRefusalLines("RAW_ARG_TYPE_UNSUPPORTED", 0, "String").join("\n"), /use --governed/);
});
