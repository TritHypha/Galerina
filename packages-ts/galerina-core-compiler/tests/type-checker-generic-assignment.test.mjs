import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseProgram, checkTypes } from "../dist/index.js";

function typeErrors(source) {
  const parsed = parseProgram(source, "generic-assignment.fungi");
  return checkTypes(parsed.ast).diagnostics.filter((diagnostic) => diagnostic.severity === "error");
}

describe("FUNGI-TYPE-002 generic assignment compatibility", () => {
  it("rejects a mismatched generic Option payload", () => {
    const errors = typeErrors(`
pure flow read(a: Array<Int>) -> String {
  let value: Option<String> = a.get(0)
  return "ok"
}
`);

    assert.ok(
      errors.some((error) => error.code === "FUNGI-TYPE-002"),
      `Expected FUNGI-TYPE-002, got: ${errors.map((error) => error.code).join(", ")}`,
    );
  });

  it("preserves numeric widening inside generic collections", () => {
    const errors = typeErrors(`
pure flow values() -> Array<Float> {
  let values: Array<Float> = [1, 2]
  return values
}
`);

    assert.ok(
      !errors.some((error) => error.code === "FUNGI-TYPE-002"),
      `Unexpected FUNGI-TYPE-002: ${errors.map((error) => error.code).join(", ")}`,
    );
  });

  it("rejects a mismatched generic payload in a flow return", () => {
    const errors = typeErrors(`
pure flow read(a: Array<Int>) -> Option<String> {
  return a.get(0)
}
`);

    assert.ok(
      errors.some((error) => error.code === "FUNGI-TYPE-008"),
      `Expected FUNGI-TYPE-008, got: ${errors.map((error) => error.code).join(", ")}`,
    );
  });

  it("rejects a mismatched generic payload at a flow call site", () => {
    const errors = typeErrors(`
pure flow accept(value: Option<String>) -> Void {
  return
}

pure flow caller(a: Array<Int>) -> Void {
  accept(a.get(0))
  return
}
`);

    assert.ok(
      errors.some((error) => error.code === "FUNGI-TYPE-005"),
      `Expected FUNGI-TYPE-005, got: ${errors.map((error) => error.code).join(", ")}`,
    );
  });

  it("defers an inferred Auto payload at a concrete generic call boundary", () => {
    const errors = typeErrors(`
pure flow accept(value: Array<String>) -> Void {
  return
}

pure flow caller(value: Array<Auto>) -> Void {
  accept(value)
  return
}
`);

    assert.deepEqual(
      errors,
      [],
      `Array<Auto> is a deferred payload, not a concrete Array<String> mismatch: ${errors.map((error) => error.code).join(", ")}`,
    );
  });
});
