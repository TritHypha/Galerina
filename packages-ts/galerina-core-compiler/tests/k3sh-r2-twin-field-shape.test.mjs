/**
 * K3-SH r2 leftover pin: the self-hosted type-checker harness must match the
 * parser-shaped Stmt the twin already reads. Missing-field member access traps
 * (`Method 'X' not found on record`) and wipes FUNGI-TYPE-002/022/023/024/025.
 * Twin contract (q2 T2-T8): match-arm text is Stmt.name; overflow flag is
 * stmt.litI32Overflow; source must not contain rhs.litI32Overflow.
 * Replay: node --test --test-reporter=tap tests/k3sh-r2-twin-field-shape.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const DIR = dirname(fileURLToPath(import.meta.url));
const SH = join(DIR, "../src/self-hosted");
const HARNESS = join(DIR, "self-hosted-type-checker.test.mjs");

function load(path) {
  return readFileSync(path, "utf8").replace(/^\uFEFF/, "");
}

describe("K3-SH r2 twin field shape", () => {
  it("twin still reads parser-shaped stmt.litI32Overflow and arm.name", () => {
    const src = load(join(SH, "type-checker.fungi"));
    assert.equal(src.includes("if stmt.litI32Overflow"), true);
    assert.equal(src.includes("isWildcardPat(a.name)"), true);
    assert.equal(/rhs\.litI32Overflow/.test(src), false);
  });

  it("harness copies overflow onto the binding stmt and arm name", () => {
    const src = load(HARNESS);
    assert.equal(src.includes("litI32Overflow: vBool(overflow)"), true);
    assert.equal(src.includes("const arm = (pattern) => vRecord({ name: vStr(pattern), pattern: vStr(pattern) })"), true);
  });
});
