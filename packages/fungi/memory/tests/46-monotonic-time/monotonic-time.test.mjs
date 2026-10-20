import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const SRC = fileURLToPath(new URL("../../src/monotonic-time.fungi", import.meta.url));

test("clock admission calls c-boundary and does not reimplement its table", () => {
  const text = readFileSync(SRC, "utf8");
  assert.equal(text.includes('import "./c-boundary.fungi"'), true);
  assert.equal(text.includes("readForeignSafeInteger(classTag, reading)"), true);
  assert.equal(text.includes("readForeignBool(hasLast)"), true);
  assert.equal(text.includes("classTag == 0"), false);
  assert.equal(text.includes("while"), false);
  assert.equal(text.includes("null"), false);
  assert.equal(text.includes("NaN"), false);
  assert.equal(text.includes("mintLiteral"), false);
});

test("forbidden combinations have a typed refusal and a final fail-closed return", () => {
  const text = readFileSync(SRC, "utf8");
  assert.equal(text.includes("pure flow pointPlusPoint"), true);
  assert.equal(text.includes("pure flow durationMinusPoint"), true);
  assert.equal(text.includes("return 25"), true);
  assert.equal(text.includes("return 11"), true);
  assert.equal(text.includes("return 21"), true);
  assert.equal(text.includes("return 22"), true);
  assert.equal(text.includes("return 23"), true);
  assert.equal(text.includes("return 26"), true);
});
