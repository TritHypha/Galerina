import assert from "node:assert/strict";
import { test } from "node:test";
import { lex } from "../dist/lexer.js";

function hasLineTooLong(src) {
  return lex(src, "line-bound.fungi").diagnostics.some((d) => d.code === "FUNGI-LEX-005");
}

test("a newline-terminated line over 10000 characters emits FUNGI-LEX-005", () => {
  assert.equal(hasLineTooLong(`${" ".repeat(10001)}\n`), true);
});

test("hostile: last line over 10000 characters without a newline still emits FUNGI-LEX-005", () => {
  assert.equal(hasLineTooLong(" ".repeat(10001)), true, "EOF must apply the line-length ceiling");
});

test("hostile: a line comment over 10000 characters without a newline still emits FUNGI-LEX-005", () => {
  assert.equal(hasLineTooLong(`//${"x".repeat(10001)}`), true);
});

test("hostile: a block comment line over 10000 characters still emits FUNGI-LEX-005", () => {
  assert.equal(hasLineTooLong(`/*${"x".repeat(10001)}\n*/`), true, "newlines inside block comments must count");
});
