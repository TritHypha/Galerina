// Unit test for the shared diagnostic-code regex (scripts/lib/codes.mjs). Locks the review wn8v30euh
// fixes: trailing-letter suffix, multi-segment codes, doc-range rejection, ERR_ wildcard handling.
import { test } from "node:test";
import assert from "node:assert/strict";
import { extractCodes, CODE_TEST, familyOf, nsOf } from "../lib/codes.mjs";

test("trailing-letter suffix is preserved (005B not truncated to 005)", () => {
  assert.deepEqual(extractCodes("code: SPORE-PROFILE-005B"), ["SPORE-PROFILE-005B"]);
  assert.deepEqual(extractCodes("code: SPORE-PROFILE-005"), ["SPORE-PROFILE-005"]);
  assert.deepEqual(extractCodes("SPORE-PROFILE-005 and SPORE-PROFILE-005B"), ["SPORE-PROFILE-005", "SPORE-PROFILE-005B"]);
});

test("multi-segment codes match whole", () => {
  for (const c of ["SPORE-GOV-3VL-001", "SPORE-CRYPTO-PQ-001", "SPORE-SYNTAX-LEGACY-003", "SPORE-BOOL-BOUNDARY-001"]) {
    assert.deepEqual(extractCodes("x " + c + " y"), [c]);
    assert.ok(CODE_TEST.test(c), c + " must satisfy CODE_TEST");
  }
});

test("doc range tokens are dropped (not phantom single codes)", () => {
  assert.deepEqual(extractCodes("see SPORE-ACCESS-001-002 for the range"), []);
  assert.deepEqual(extractCodes("SPORE-ACCESS-001-002 SPORE-GOV-001"), ["SPORE-GOV-001"]);
});

test("ERR_ codes match; trailing-underscore wildcard does not capture the underscore", () => {
  assert.deepEqual(extractCodes("code: ERR_REGISTRY_PACKAGE_UNKNOWN"), ["ERR_REGISTRY_PACKAGE_UNKNOWN"]);
  assert.deepEqual(extractCodes("the ERR_AI_* family"), ["ERR_AI"]);
});

test("extractCodes de-dupes in order", () => {
  assert.deepEqual(extractCodes("SPORE-GOV-001 SPORE-GOV-001 SPORE-GOV-002"), ["SPORE-GOV-001", "SPORE-GOV-002"]);
});

test("CODE_TEST is anchored (whole token only)", () => {
  assert.ok(CODE_TEST.test("SPORE-GOV-001"));
  assert.ok(!CODE_TEST.test("see SPORE-GOV-001 here"));
  assert.ok(CODE_TEST.test("ERR_X_Y"));
  assert.ok(!CODE_TEST.test("ERR_AI_"));
});

test("familyOf / nsOf", () => {
  assert.equal(familyOf("SPORE-GOV-3VL-001"), "GOV");
  assert.equal(familyOf("ERR_X_Y"), "ERR_*");
  assert.equal(nsOf("SPORE-GOV-001"), "SPORE");
  assert.equal(nsOf("ERR_X"), "ERR");
});
