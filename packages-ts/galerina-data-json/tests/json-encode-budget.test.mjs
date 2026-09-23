import assert from "node:assert/strict";
import { test } from "node:test";
import { encodeJsonValue } from "../dist/index.js";

const string = (value) => ({ kind: "string", value, taint: "clean" });
const refused = (value) => {
  const result = encodeJsonValue(value);
  assert.equal(result.ok, false);
  assert.equal(result.diagnostic.code, "FUNGI-JSON-005");
};

test("encoder admits exactly one MiB including quotes, measured in UTF-8 bytes", () => {
  const result = encodeJsonValue(string("é".repeat(524287)));
  assert.equal(result.ok, true);
  assert.equal(Buffer.byteLength(result.text, "utf8"), 1048576);
});

test("encoder refuses multibyte output one character beyond the byte ceiling", () => {
  refused(string("é".repeat(524288)));
  refused(string("😀".repeat(262144)));
});

test("encoder counts object keys and JSON punctuation in the same byte budget", () => {
  refused({ kind: "object", fields: [{ name: "é".repeat(524285), value: string("x") }], taint: "clean" });
});

test("encoder preserves duplicate-key diagnostics before byte-budget refusal", () => {
  const key = "a";
  const result = encodeJsonValue({ kind: "object", fields: [
    { name: key, value: string("x".repeat(1048568)) },
    { name: key, value: string("y") },
  ], taint: "clean" });
  assert.equal(result.ok, false);
  assert.equal(result.diagnostic.code, "FUNGI-JSON-003");
});

test("encoder stops at an exhausted aggregate budget without visiting another child", () => {
  let visits = 0;
  const later = { get kind() { visits += 1; throw new Error("later child visited"); } };
  refused({ kind: "array", items: [string("a".repeat(600000)), string("b".repeat(600000)), later], taint: "clean" });
  assert.equal(visits, 0);
});

test("encoder admits and refuses escaped backslashes on the UTF-8 byte boundary", () => {
  const admitted = encodeJsonValue(string("\\".repeat(524287)));
  assert.equal(admitted.ok, true);
  assert.equal(Buffer.byteLength(admitted.text, "utf8"), 1048576);
  refused(string("\\".repeat(524288)));
});

test("encoder preserves escapes, scalar values and taint below the ceiling", () => {
  const result = encodeJsonValue({ kind: "array", taint: "clean", items: [
    string("é😀\n\u0000\"\\"),
    { kind: "bool", value: false, taint: "tainted" },
    { kind: "int", value: 42, taint: "clean" },
    { kind: "null", taint: "clean" },
  ] });
  assert.deepEqual(result, { ok: true, text: '["é😀\\n\\u0000\\\"\\\\",false,42,null]', taint: "tainted" });
});
