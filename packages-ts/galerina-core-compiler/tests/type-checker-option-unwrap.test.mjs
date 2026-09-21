import test from "node:test";
import assert from "node:assert/strict";
import { parseProgram, checkTypes } from "../dist/index.js";

function check(source) {
  const parsed = parseProgram(source, "option-unwrap.fungi");
  assert.equal(parsed.diagnostics.length, 0, "fixture must parse before type checking");
  return checkTypes(parsed.ast).diagnostics;
}

test("Option<T>.unwrapOr infers the contained T for a compatible return", () => {
  const diagnostics = check(`
pure flow read(values: Array<Int>) -> Int {
  return values.get(0).unwrapOr(0)
}
`);

  assert.equal(
    diagnostics.some((diagnostic) => diagnostic.code === "FUNGI-TYPE-002"),
    false,
    `unexpected type mismatch: ${diagnostics.map((diagnostic) => diagnostic.code).join(", ")}`,
  );
});

test("Option<T>.unwrapOr exposes a mismatched contained T at the return boundary", () => {
  const diagnostics = check(`
pure flow read(values: Array<Int>) -> String {
  return values.get(0).unwrapOr(0)
}
`);

  assert.equal(
    diagnostics.some((diagnostic) => diagnostic.code === "FUNGI-TYPE-008"),
    true,
    `expected FUNGI-TYPE-008, got: ${diagnostics.map((diagnostic) => diagnostic.code).join(", ")}`,
  );
});

test("Option<T>.unwrapOr refuses a fallback whose type is not the payload T", () => {
  const diagnostics = check(`
pure flow read(values: Array<Int>) -> Int {
  return values.get(0).unwrapOr("x")
}
`);

  assert.equal(
    diagnostics.some((diagnostic) => diagnostic.code === "FUNGI-TYPE-005"),
    true,
    `expected FUNGI-TYPE-005, got: ${diagnostics.map((diagnostic) => diagnostic.code).join(", ") || "(none)"}`,
  );
});
