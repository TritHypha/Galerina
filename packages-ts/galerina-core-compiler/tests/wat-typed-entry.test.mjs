import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assembleWAT } from "../dist/wat-assembler.js";
import {
  buildWATFromCheckedProgram,
  checkProgram,
  FUNGI_WAT_CHECKED_001,
  isCheckedProgram,
  renderWAT,
} from "../dist/index.js";

const CLEAN = `@version 1
pure flow add(a: Int, b: Int) -> Int {
  return a + b
}
`;

const TYPE_FAIL = `@version 1
pure flow bad() -> Int {
  return "nope"
}
`;

describe("typed CheckedProgram WAT front door", () => {
  it("refuses a type-failing program before WAT emission", () => {
    const result = checkProgram(TYPE_FAIL, "typed-entry-neg.fungi");
    assert.equal(result.ok, false);
    assert.equal(result.family, "type");
    assert.equal(typeof result.code, "string");
    assert.notEqual(result.code.length, 0);
    assert.equal(isCheckedProgram(result.program), false);
    assert.throws(
      () => buildWATFromCheckedProgram({ kind: "not-checked" }),
      new RegExp(FUNGI_WAT_CHECKED_001.code),
    );
    assert.throws(
      () => buildWATFromCheckedProgram(null),
      new RegExp(FUNGI_WAT_CHECKED_001.code),
    );
    assert.throws(
      () => buildWATFromCheckedProgram(Number.NaN),
      new RegExp(FUNGI_WAT_CHECKED_001.code),
    );
  });

  it("lowers a tiny clean pure flow through the checked entry", async () => {
    const result = checkProgram(CLEAN, "typed-entry-pos.fungi");
    assert.equal(result.ok, true);
    assert.equal(isCheckedProgram(result.program), true);
    const module = buildWATFromCheckedProgram(result.program);
    const wat = renderWAT(module);
    assert.equal(typeof wat, "string");
    assert.equal(wat.includes("(module"), true);
    const assembled = await assembleWAT(wat);
    assert.equal(assembled.valid, true);
    assert.equal(assembled.diagnostics.length, 0);
  });
});
