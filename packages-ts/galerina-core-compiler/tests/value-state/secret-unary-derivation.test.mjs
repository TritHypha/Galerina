import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseProgram, checkTypes, checkValueStates } from "../../dist/index.js";

// RD-1413--1415: unary operations are not declassification boundaries.
// Exercise Fungi source through the real bootstrap parser/checkers. These tests
// establish compiler diagnostics only, not runtime erasure or host isolation.
function check(expression, declarations = "") {
  const source = `@version 1
secure flow probe(key: SecureString) -> Int {
  ${declarations}
  let derived = ${expression}
  print(derived)
  return 0
}`;
  const parsed = parseProgram(source, "secret-unary-derivation.fungi");
  assert.deepEqual(parsed.diagnostics, [], "the test must reach the value-state checker");
  const types = checkTypes(parsed.ast);
  assert.deepEqual(types.diagnostics, [], "independent type errors must not mask the check");
  return checkValueStates(parsed.ast, "production").diagnostics;
}

describe("Fungi secret derivation through unary operations", () => {
  for (const expression of ["key", "!key", "!!key"]) {
    it(`refuses logging a secret-derived binding from ${expression}`, () => {
      const diagnostics = check(expression);
      assert.ok(
        diagnostics.some((d) => d.code === "FUNGI-SECRET-001" && d.severity === "error"),
        `secret derivation must survive ${expression}: ${JSON.stringify(diagnostics)}`,
      );
    });
  }

  it("preserves secret derivation through an alias before negation", () => {
    assert.ok(check("!alias", "let alias = key").some(
      (d) => d.code === "FUNGI-SECRET-001" && d.severity === "error",
    ));
  });

  it("preserves secret derivation through an alias after negation", () => {
    assert.ok(check("alias", "let alias = !key").some(
      (d) => d.code === "FUNGI-SECRET-001" && d.severity === "error",
    ));
  });

  for (const expression of ["!true", "!!false", "!Crypto.constantTimeEquals(key, key)"]) {
    it(`preserves the permitted public result of ${expression}`, () => {
      assert.deepEqual(check(expression), []);
    });
  }
});
