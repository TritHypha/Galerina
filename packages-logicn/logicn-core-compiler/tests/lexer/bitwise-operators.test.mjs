// =============================================================================
// Lexer — bitwise operators are not LogicN operators (dogfooding GAP-4)
//
// Bit-level math (XOR/shift/NOT) lives in the engine/extension layer, not in .lln
// (the crypto-on-core boundary). `^` and `~` are not tokenized; instead of a bare
// "Unexpected character", the lexer now emits a clear, actionable hint. (The dead
// `^`→i32.xor / `&`→i32.and etc. entries in wat-emitter were removed in the same
// change — they were unreachable because the lexer never produced those tokens.)
// =============================================================================

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { lex } from "../../dist/index.js";

describe("Lexer — bitwise operators give a clear hint, not 'unexpected character'", () => {
  for (const ch of ["^", "~"]) {
    it(`'${ch}' → a Bitwise-operator hint diagnostic`, () => {
      const r = lex(`pure flow x(a: Int, b: Int) -> Int { return a ${ch} b }`, "t.lln");
      const d = r.diagnostics.find((x) => /bitwise operator/i.test(x.message));
      assert.ok(d !== undefined, `expected a bitwise hint for '${ch}', got: ${r.diagnostics.map((x) => x.message).join(" | ")}`);
      assert.ok(!/^Unexpected character/.test(d.message), "should not be the bare unexpected-character message");
    });
  }
});
