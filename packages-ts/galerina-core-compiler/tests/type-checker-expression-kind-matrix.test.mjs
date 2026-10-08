import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseProgram, checkTypes } from "../dist/index.js";

function typeErrors(source) {
  const parsed = parseProgram(source, "expression-kind-matrix.fungi");
  const parseErrors = parsed.diagnostics.filter((diagnostic) => diagnostic.severity === "error");
  if (parseErrors.length > 0) return parseErrors;
  return checkTypes(parsed.ast).diagnostics.filter((diagnostic) => diagnostic.severity === "error");
}

function hasCode(errors, code) {
  return errors.some((error) => error.code === code);
}

describe("FUNGI-TYPE-002/005/007 expression-kind matrix", () => {
  it("admits inferred literals, identifiers, arithmetic, match and Option.unwrapOr", () => {
    const errors = typeErrors(`
pure flow admitted(n: Int, flag: Bool, label: String) -> Int {
  let a: Int = 1
  let b: String = "x"
  let c: Bool = true
  let d: Int = n + 1
  let e: Bool = n == 1
  let f: String = label
  let g: Int = match flag { true => 1 false => 0 _ => 0 }
  let h: Int = Option.fromNullable(n).unwrapOr(0)
  return a
}
`);
    assert.deepEqual(errors.map((error) => error.code), []);
  });

  it("fires FUNGI-TYPE-002 on a known incompatible assignment", () => {
    const errors = typeErrors(`
pure flow mismatch(n: Int) -> String {
  let wrong: String = n
  return wrong
}
`);
    assert.equal(hasCode(errors, "FUNGI-TYPE-002"), true);
  });

  it("fires FUNGI-TYPE-004 on a known incompatible operator", () => {
    const errors = typeErrors(`
pure flow badOp(n: Int, label: String) -> Int {
  return n + label
}
`);
    assert.equal(hasCode(errors, "FUNGI-TYPE-004"), true);
  });

  it("fires FUNGI-TYPE-007 on a known argument-count mismatch", () => {
    const errors = typeErrors(`
pure flow add(a: Int, b: Int) -> Int { return a + b }
pure flow call() -> Int { return add(1) }
`);
    assert.equal(hasCode(errors, "FUNGI-TYPE-007"), true);
  });

  it("does not treat an unknown spread-update as compatible with Int", () => {
    const errors = typeErrors(`
pure flow patch(base: Auto) -> Int {
  let unresolved: Int = { ...base, x: 1 }
  return unresolved
}
`);
    assert.equal(hasCode(errors, "FUNGI-TYPE-002"), false);
  });

  it("types Option.zip as Option<ZipPair<T,U>> and refuses Pair assignment", () => {
    const mismatch = typeErrors(`
record Pair { first: Int second: Int }
pure flow zip(a: Option<Int>, b: Option<Int>) -> Pair {
  let joined: Pair = a.zip(b)
  return joined
}
`);
    assert.equal(hasCode(mismatch, "FUNGI-TYPE-002"), true);

    const exact = typeErrors(`
pure flow zipOk(a: Option<Int>, b: Option<String>) -> Option<ZipPair<Int, String>> {
  return a.zip(b)
}
`);
    assert.deepEqual(exact.map((error) => error.code), []);

    const wrapperMismatch = typeErrors(`
pure flow zipWrongWrapper(a: Option<Int>, b: Option<String>) -> Int {
  let joined: Option<Int> = a.zip(b)
  return 1
}
`);
    assert.equal(hasCode(wrapperMismatch, "FUNGI-TYPE-002"), true);

    const innerMismatch = typeErrors(`
pure flow zipWrongInner(a: Option<Int>, b: Option<String>) -> Int {
  let joined: Option<ZipPair<Int, Int>> = a.zip(b)
  return 1
}
`);
    assert.equal(hasCode(innerMismatch, "FUNGI-TYPE-002"), true);
  });

  it("fires FUNGI-TYPE-005 on a known incompatible call argument", () => {
    const errors = typeErrors(`
pure flow greet(name: String) -> Int { return 1 }
pure flow call() -> Int { return greet(1) }
`);
    assert.equal(hasCode(errors, "FUNGI-TYPE-005"), true);
  });

  it("fires FUNGI-TYPE-008 on a known incompatible return expression", () => {
    const errors = typeErrors(`
pure flow asString(n: Int) -> String { return n }
`);
    assert.equal(hasCode(errors, "FUNGI-TYPE-008"), true);
  });

  it("admits Int literals into lifted Int64 and UInt64 bindings", () => {
    const errors = typeErrors(`
pure flow wide() -> Int64 {
  let signed: Int64 = 1
  let unsigned: UInt64 = 42
  return signed
}
`);
    assert.equal(hasCode(errors, "FUNGI-TYPE-002"), false);
    assert.equal(hasCode(errors, "FUNGI-NUMERIC-001"), false);
  });

  it("types a C14 html block as Html and refuses String assignment", () => {
    const mismatch = typeErrors(`
pure flow render() -> String {
  let wrong: String =
    html <<HTML
    <div>ok</div>
  HTML
  return wrong
}
`);
    assert.equal(hasCode(mismatch, "FUNGI-TYPE-002"), true);

    const exact = typeErrors(`
pure flow render() -> Html {
  let page: Html =
    html <<HTML
    <div>ok</div>
  HTML
  return page
}
`);
    assert.equal(hasCode(exact, "FUNGI-TYPE-002"), false);
    assert.equal(hasCode(exact, "FUNGI-TYPE-008"), false);
    assert.equal(hasCode(exact, "FUNGI-TYPE-001"), false);
  });

  it("fires FUNGI-TYPE-008 when an inferred Html block binding is returned as String", () => {
    const errors = typeErrors(`
pure flow render() -> String {
  let page: Html =
    html <<HTML
    <div>ok</div>
  HTML
  return page
}
`);
    assert.equal(hasCode(errors, "FUNGI-TYPE-008"), true);
  });
});
