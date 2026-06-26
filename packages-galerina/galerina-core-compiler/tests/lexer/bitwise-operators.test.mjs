// =============================================================================
// Lexer — bitwise operators are not Galerina operators (dogfooding GAP-4)
//
// Bit-level math (XOR/shift/NOT) lives in the engine/extension layer, not in .spore
// (the crypto-on-core boundary). `^` and `~` are not tokenized; instead of a bare
// "Unexpected character", the lexer now emits a clear, actionable hint. (The dead
// `^`→i32.xor / `&`→i32.and etc. entries in wat-emitter were removed in the same
// change — they were unreachable because the lexer never produced those tokens.)
// =============================================================================

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { lex, parseProgram } from "../../dist/index.js";

describe("Lexer — bitwise operators give a clear hint, not 'unexpected character'", () => {
  for (const ch of ["^", "~"]) {
    it(`'${ch}' → a Bitwise-operator hint diagnostic`, () => {
      const r = lex(`pure flow x(a: Int, b: Int) -> Int { return a ${ch} b }`, "t.spore");
      const d = r.diagnostics.find((x) => /bitwise operator/i.test(x.message));
      assert.ok(d !== undefined, `expected a bitwise hint for '${ch}', got: ${r.diagnostics.map((x) => x.message).join(" | ")}`);
      assert.ok(!/^Unexpected character/.test(d.message), "should not be the bare unexpected-character message");
    });
  }
});

// #126 — the same crypto-on-core hint at the PARSER for & | << >> (which can't be rejected at
// the lexer: `|` is a match-arm token and `<<`/`>>` collide with generics in type position).
describe("Parser — & | << >> in expression position give the bitwise hint (#126)", () => {
  for (const op of ["&", "|", "<<", ">>"]) {
    it(`'${op}' → a single clean Bitwise-operator hint`, () => {
      const src = `pure flow x(a: Int, b: Int) -> Int {\n  return a ${op} b\n}\n`;
      const r = parseProgram(src, "t.spore");
      const hints = r.diagnostics.filter((x) => /bitwise operator '/i.test(x.message));
      assert.equal(hints.length >= 1, true, `expected a bitwise hint for '${op}', got: ${r.diagnostics.map((x) => x.message).join(" | ")}`);
      assert.match(hints[0].message, /crypto-on-core boundary/);
      // Recovery must suppress the confusing "Unexpected token … in statement position" follow-on.
      assert.equal(
        r.diagnostics.some((x) => /in statement position/.test(x.message)),
        false,
        "the bitwise hint should be the only error (recovery consumed the rest)",
      );
    });
  }

  it("does NOT flag legitimate comparison / logical operators", () => {
    const r = parseProgram(
      `pure flow ok(a: Int, b: Int, c: Int) -> Bool {\n  return a < b and b < c\n}\n`,
      "t.spore",
    );
    assert.equal(r.diagnostics.filter((x) => x.severity === "error").length, 0, "a<b and b<c must parse clean");
  });
});
