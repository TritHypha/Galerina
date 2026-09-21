import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseProgram, checkTypes } from "../dist/index.js";

function check(source) {
  const parsed = parseProgram(source, "c01-inference-matrix.fungi");
  const parseErrors = parsed.diagnostics.filter((diagnostic) => diagnostic.severity === "error");
  if (parseErrors.length > 0) return parseErrors;
  return checkTypes(parsed.ast).diagnostics.filter((diagnostic) => diagnostic.severity === "error");
}

describe("C01 expression-inference matrix", () => {
  it("admits homogeneous list literals at return, call and binding consumers", () => {
    const errors = check(`
pure flow accept(value: Array<Int>) -> Array<Int> {
  return value
}

pure flow values() -> Array<Int> {
  let bound: Array<Int> = [1, 2]
  accept([3, 4])
  return bound
}
`);
    assert.deepEqual(errors, [], `homogeneous lists must stay admitted: ${errors.map((error) => error.code).join(", ")}`);
  });

  it("refuses a later heterogeneous list element at return and call sites", () => {
    const errors = check(`
pure flow accept(value: Array<Int>) -> Array<Int> {
  return value
}

pure flow caller() -> Array<Int> {
  accept([1, "nope"])
  return [1, "nope"]
}
`);
    assert.ok(
      errors.some((error) => error.code === "FUNGI-TYPE-011"),
      `expected FUNGI-TYPE-011, got: ${errors.map((error) => error.code).join(", ") || "(none)"}`,
    );
  });

  it("widens mixed numeric list elements instead of inventing Array<Auto>", () => {
    const errors = check(`
pure flow values() -> Array<Float> {
  return [1, 2.0]
}
`);
    assert.deepEqual(errors, [], `numeric list join must widen: ${errors.map((error) => error.code).join(", ")}`);
  });

  it("refuses heterogeneous Array.of instead of admitting Array<Auto>", () => {
    const errors = check(`
pure flow bad() -> Array<Int> {
  return Array.of(1, "nope")
}
`);
    assert.ok(
      errors.some((error) => error.code === "FUNGI-TYPE-011"),
      `expected FUNGI-TYPE-011, got: ${errors.map((error) => error.code).join(", ") || "(none)"}`,
    );
  });

  it("does not guess undeclared record field types from field names", () => {
    const errors = check(`
record Item {
  name: String
}

pure flow read(item: Item) -> Decimal {
  return item.amount
}
`);
    assert.equal(
      errors.some((error) => error.code === "FUNGI-TYPE-008"),
      false,
      `undeclared fields must defer, not guess Decimal: ${errors.map((error) => `${error.code}:${error.message}`).join(" | ")}`,
    );
  });

  it("keeps declared record fields and Request sugar", () => {
    const errors = check(`
record Item {
  amount: Decimal
}

pure flow priced(item: Item) -> Decimal {
  return item.amount
}

pure flow fromRequest(request: Request) -> String {
  return request.body
}
`);
    assert.deepEqual(errors, [], `declared fields and Request must remain typed: ${errors.map((error) => error.code).join(", ")}`);
  });

  it("preserves nested Map.get and Option ? payloads", () => {
    const errors = check(`
pure flow nested(values: Map<String, Option<Int>>) -> Option<Int> {
  return values.get("k")?
}
`);
    assert.deepEqual(errors, [], `nested Map.get payload must round-trip: ${errors.map((error) => error.code).join(", ")}`);
  });

  it("refuses a nested Map.get payload mismatch", () => {
    const errors = check(`
pure flow nested(values: Map<String, Option<Int>>) -> String {
  return values.get("k")?
}
`);
    assert.ok(
      errors.some((error) => error.code === "FUNGI-TYPE-008"),
      `expected FUNGI-TYPE-008, got: ${errors.map((error) => error.code).join(", ") || "(none)"}`,
    );
  });

  it("types Map.entries as MapEntry records, not Array<Auto>", () => {
    const admitted = check(`
pure flow keysOf(values: Map<String, Int>) -> Int {
  let rows = values.entries()
  return 1
}
`);
    assert.deepEqual(
      admitted.filter((error) => error.code === "FUNGI-TYPE-002" || error.code === "FUNGI-TYPE-008"),
      [],
      `unconsumed entries() must not invent a concrete mismatch: ${admitted.map((error) => error.code).join(", ")}`,
    );

    const refused = check(`
pure flow asStrings(values: Map<String, Int>) -> Array<String> {
  return values.entries()
}
`);
    assert.ok(
      refused.some((error) => error.code === "FUNGI-TYPE-008"),
      `entries() must not wildcard-admit as Array<String>: ${refused.map((error) => error.code).join(", ") || "(none)"}`,
    );
  });

  it("reconstructs Option.map callback payloads", () => {
    const good = check(`
pure flow mapped(source: Option<Int>) -> Option<Int> {
  fn double(value: Int) -> Int { return value }
  return source.map(double)
}
`);
    assert.deepEqual(good, [], `matching Option.map must reconstruct Option<Int>: ${good.map((error) => error.code).join(", ")}`);

    const bad = check(`
pure flow bad(source: Option<Int>) -> Option<Int> {
  fn label(value: Int) -> String { return "x" }
  return source.map(label)
}
`);
    assert.ok(
      bad.some((error) => error.code === "FUNGI-TYPE-008"),
      `Option.map payload mismatch must be refused: ${bad.map((error) => error.code).join(", ") || "(none)"}`,
    );
  });

  it("still defers a declared Array<Auto> payload at a concrete boundary", () => {
    const errors = check(`
pure flow accept(value: Array<String>) -> Void {
  return
}

pure flow caller(value: Array<Auto>) -> Void {
  accept(value)
  return
}
`);
    assert.deepEqual(errors, [], `declared Auto remains a deferral: ${errors.map((error) => error.code).join(", ")}`);
  });
});
