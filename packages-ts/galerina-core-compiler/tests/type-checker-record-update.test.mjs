import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseProgram, checkTypes } from "../dist/index.js";

function typeErrors(source) {
  const parsed = parseProgram(source, "record-update-type-check.fungi");
  return checkTypes(parsed.ast).diagnostics.filter((diagnostic) => diagnostic.severity === "error");
}

describe("FUNGI-TYPE-002 record-update inference", () => {
  it("rejects a record update whose known base record is incompatible with the binding", () => {
    const errors = typeErrors(`
record Point { x: Int y: Int }
record Label { text: String }

pure flow patch(point: Point, replacement: Int) -> Label {
  let wrong: Label = { ...point, x: replacement }
  return wrong
}
`);

    assert.ok(
      errors.some((error) => error.code === "FUNGI-TYPE-002"),
      `Expected FUNGI-TYPE-002, got: ${errors.map((error) => error.code).join(", ")}`,
    );
  });

  it("accepts a record update when the known base record matches the binding", () => {
    const errors = typeErrors(`
record Point { x: Int y: Int }

pure flow patch(point: Point, replacement: Int) -> Point {
  let updated: Point = { ...point, x: replacement }
  return updated
}
`);

    assert.deepEqual(errors, []);
  });

  it("defers when the spread base has no declared record schema", () => {
    const errors = typeErrors(`
pure flow patch(base: Auto) -> Int {
  let unresolved: Int = { ...base, x: 1 }
  return unresolved
}
`);

    assert.equal(errors.some((error) => error.code === "FUNGI-TYPE-002"), false);
  });
});
