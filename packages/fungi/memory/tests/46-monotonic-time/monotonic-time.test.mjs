import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pins, PROFILE_PATH } from "./harness.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

test("clock admission calls c-boundary length and does not reimplement its table", () => {
  const text = readFileSync(PROFILE_PATH, "utf8");
  assert.equal(text.includes("import \"./c-boundary.fungi\""), true);
  assert.equal(text.includes("readForeignLength(classTag, reading, 2147483647)"), true);
  assert.equal(text.includes("readForeignBool(hasLast)"), true);
  assert.equal(text.includes("readForeignSafeInteger("), false);
  assert.equal(text.includes("classTag == 0"), false);
  assert.equal(text.includes("while"), false);
  assert.equal(text.includes("null"), false);
  assert.equal(text.includes("NaN"), false);
  assert.equal(text.includes("mintLiteral"), false);
});

test("tick refusal sentinel is -1 and forbidden combinations stay typed", () => {
  const text = readFileSync(PROFILE_PATH, "utf8");
  assert.equal(text.includes("return -1"), true);
  assert.equal(text.includes("return 25"), true);
  assert.equal(text.includes("return 26"), true);
  assert.equal(text.includes("return 11"), true);
});

test("flattened invoke pins the closed algebra", () => {
  pins(readFileSync(PROFILE_PATH, "utf8"));
});

for (const id of ["M1", "M2", "M3", "M4", "M5", "M6"]) {
  test("mutant " + id + " goes red", () => {
    const ran = spawnSync(process.execPath, [join(HERE, "red-one.mjs"), id], { encoding: "utf8" });
    assert.equal(ran.status, 1, id);
  });
}
