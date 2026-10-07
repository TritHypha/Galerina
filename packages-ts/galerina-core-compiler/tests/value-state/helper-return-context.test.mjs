import assert from "node:assert/strict";
import { test } from "node:test";
import { checkValueStates, parseProgram } from "../../dist/index.js";

function secretReturns(source) {
  const parsed = parseProgram(`@version 1\n${source}`, "helper-return-context.fungi");
  assert.deepEqual(parsed.diagnostics.filter(d => d.severity === "error"), []);
  return checkValueStates(parsed.ast, "production").diagnostics
    .filter(d => d.code === "FUNGI-SECRET-006");
}

test("secret-preserving helper uses its own result type inside a public flow", () => {
  assert.equal(secretReturns(`secure flow outer() -> Bool {
    fn preserve(value: SecureString) -> SecureString { return value }
    return true
  }`).length, 0);
});

test("secret-to-public helper refuses even inside a secret-preserving flow", () => {
  assert.equal(secretReturns(`secure flow outer(value: SecureString) -> SecureString {
    fn leak(payload: SecureString) -> String { return payload }
    return value
  }`).length, 1);
});

test("public helper remains accepted inside a public flow", () => {
  assert.equal(secretReturns(`secure flow outer() -> Bool {
    fn publicValue(value: String) -> String { return value }
    return true
  }`).length, 0);
});

test("outer public return context is restored after a secret-preserving helper", () => {
  assert.equal(secretReturns(`secure flow outer(value: SecureString) -> String {
    fn preserve(payload: SecureString) -> SecureString { return payload }
    return value
  }`).length, 1);
});

test("outer secret result context is restored after a public helper", () => {
  assert.equal(secretReturns(`secure flow outer(value: SecureString) -> SecureString {
    fn publicValue(text: String) -> String { return text }
    return value
  }`).length, 0);
});
