/**
 * isReceiverCall must use the parser's callStyle marker, not a receiver-kind heuristic.
 *
 * The old heuristic (children[0].kind ∈ {identifier, memberExpr, callExpr}) was wrong in
 * BOTH directions, found while building the self-hosted lexer to WASM:
 *  - a method call on any OTHER receiver shape — `(pos + 1).toString()` — false-flagged
 *    FUNGI-NAME-001 on the method name (check↔build divergence: `check` never runs the
 *    resolver, so the corpus looked clean until `build`);
 *  - a BARE call whose first argument happened to be an identifier — `foo(bar)` — was
 *    never NAME-checked at all (over-suppression; an undeclared `foo` sailed through).
 * The parser stamps every `receiver.method(args)` with callStyle: "method" (parser.ts
 * §parsePostfix) — exact in both directions.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseProgram, resolveSymbols } from "../dist/index.js";

const nameErrors = (src) => {
  const prog = parseProgram(`@version 1\n${src}`, "receiver-marker.fungi");
  return resolveSymbols(prog.ast).diagnostics.filter((d) => d.code === "FUNGI-NAME-001");
};

describe("symbol-resolver: method calls are recognized by callStyle, not receiver kind", () => {
  it("method call on a parenthesized expression is clean — (pos + 1).toString()", () => {
    const errs = nameErrors(`
pure flow f(pos: Int) -> String {
  return (pos + 1).toString()
}`);
    assert.deepEqual(errs.map((e) => e.message), []);
  });

  it("method call on a literal receiver is clean — \"ab\".length()", () => {
    const errs = nameErrors(`
pure flow g() -> Int {
  return "ab".length()
}`);
    assert.deepEqual(errs.map((e) => e.message), []);
  });

  it("chained method call stays clean — s.trim().length()", () => {
    const errs = nameErrors(`
pure flow h(s: String) -> Int {
  return s.trim().length()
}`);
    assert.deepEqual(errs.map((e) => e.message), []);
  });

  it("bare UNDECLARED call with an identifier argument is now CAUGHT — foo(bar)", () => {
    const errs = nameErrors(`
pure flow k(bar: Int) -> Int {
  return foo(bar)
}`);
    assert.equal(errs.length, 1, JSON.stringify(errs));
    assert.match(errs[0].message, /'foo' is not declared/);
  });

  it("bare DECLARED call with an identifier argument stays clean", () => {
    const errs = nameErrors(`
pure flow foo(n: Int) -> Int { return n }
pure flow k(bar: Int) -> Int {
  return foo(bar)
}`);
    assert.deepEqual(errs.map((e) => e.message), []);
  });
});
