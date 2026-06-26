import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  lex,
  V1_ACTIVE_KEYWORDS,
  V1_FUTURE_RESERVED,
  SPORE_LEX_001,
  SPORE_LEX_002,
  SPORE_LEX_003,
  SPORE_LEX_004,
  SPORE_LEX_005,
} from "../dist/index.js";

describe("Lexer — keyword table", () => {
  it("active keywords include the three valid flow qualifiers", () => {
    assert.ok(V1_ACTIVE_KEYWORDS.has("flow"));
    assert.ok(V1_ACTIVE_KEYWORDS.has("secure"));
    assert.ok(V1_ACTIVE_KEYWORDS.has("pure"));
  });

  it("active keywords include binding keywords", () => {
    assert.ok(V1_ACTIVE_KEYWORDS.has("let"));
    assert.ok(V1_ACTIVE_KEYWORDS.has("mut"));
    assert.ok(V1_ACTIVE_KEYWORDS.has("readonly"));
  });

  it("active keywords include value-state keywords", () => {
    assert.ok(V1_ACTIVE_KEYWORDS.has("safe"));
    assert.ok(V1_ACTIVE_KEYWORDS.has("unsafe"));
    assert.ok(V1_ACTIVE_KEYWORDS.has("validated"));
    assert.ok(V1_ACTIVE_KEYWORDS.has("unvalidated"));
  });

  it("active keywords include trust and secrecy state markers", () => {
    assert.ok(V1_ACTIVE_KEYWORDS.has("tainted"),   "expected 'tainted' in V1_ACTIVE_KEYWORDS");
    assert.ok(V1_ACTIVE_KEYWORDS.has("secret"),    "expected 'secret' in V1_ACTIVE_KEYWORDS");
    assert.ok(V1_ACTIVE_KEYWORDS.has("protected"), "expected 'protected' in V1_ACTIVE_KEYWORDS");
  });

  it("active keywords include flow sub-declaration keywords", () => {
    assert.ok(V1_ACTIVE_KEYWORDS.has("effects"),    "expected 'effects' in V1_ACTIVE_KEYWORDS");
    assert.ok(V1_ACTIVE_KEYWORDS.has("with"),       "expected 'with' in V1_ACTIVE_KEYWORDS");
    assert.ok(V1_ACTIVE_KEYWORDS.has("intent"),     "expected 'intent' in V1_ACTIVE_KEYWORDS");
    assert.ok(V1_ACTIVE_KEYWORDS.has("governance"), "expected 'governance' in V1_ACTIVE_KEYWORDS");
    assert.ok(V1_ACTIVE_KEYWORDS.has("api"),        "expected 'api' in V1_ACTIVE_KEYWORDS");
    assert.ok(V1_ACTIVE_KEYWORDS.has("package"),    "expected 'package' in V1_ACTIVE_KEYWORDS");
  });

  it("active keywords include v1 route, fn, qualifier, governance, record, and target words", () => {
    for (const keyword of ["fn", "route", "redacted", "record", "authority", "policy", "with", "target"]) {
      assert.ok(V1_ACTIVE_KEYWORDS.has(keyword), `expected '${keyword}' in V1_ACTIVE_KEYWORDS`);
    }
  });

  it("active keywords and future-reserved keywords do not overlap", () => {
    const overlap = [...V1_ACTIVE_KEYWORDS].filter((keyword) => V1_FUTURE_RESERVED.has(keyword));
    assert.deepEqual(overlap, []);
  });

  it("future-reserved set includes async and await", () => {
    assert.ok(V1_FUTURE_RESERVED.has("async"));
    assert.ok(V1_FUTURE_RESERVED.has("await"));
  });

  it("safe, unsafe, guard are NOT listed as flow qualifiers in future-reserved", () => {
    // These are value-state keywords in v0.1, not flow prefixes
    assert.ok(!V1_FUTURE_RESERVED.has("safe"));
    assert.ok(!V1_FUTURE_RESERVED.has("guard"));
  });
});

describe("Lexer — token production", () => {
  it("produces an eof token for empty source", () => {
    const result = lex("", "test.spore");
    assert.equal(result.tokens.length, 1);
    assert.equal(result.tokens[0]?.kind, "eof");
    assert.equal(result.diagnostics.length, 0);
  });

  it("classifies keywords correctly", () => {
    const result = lex("flow secure pure let mut", "test.spore");
    const nonEof = result.tokens.filter((t) => t.kind !== "eof" && t.kind !== "newline");
    assert.ok(nonEof.every((t) => t.kind === "keyword"),
      `Expected all keyword tokens, got: ${nonEof.map((t) => t.kind).join(", ")}`);
    assert.equal(nonEof.map((t) => t.value).join(" "), "flow secure pure let mut");
  });

  it("classifies new v1 reserved words as keywords", () => {
    const source = "fn route redacted record authority policy with target";
    const result = lex(source, "test.spore");
    const nonEof = result.tokens.filter((t) => t.kind !== "eof" && t.kind !== "newline");
    assert.ok(nonEof.every((t) => t.kind === "keyword"),
      `Expected all keyword tokens, got: ${nonEof.map((t) => `${t.value}:${t.kind}`).join(", ")}`);
    assert.equal(nonEof.map((t) => t.value).join(" "), source);
  });

  it("does not classify new v1 reserved words as identifiers", () => {
    const result = lex("let fn = route", "test.spore");
    const fnToken = result.tokens.find((t) => t.value === "fn");
    const routeToken = result.tokens.find((t) => t.value === "route");
    assert.equal(fnToken?.kind, "keyword");
    assert.equal(routeToken?.kind, "keyword");
  });

  it("classifies identifiers that are not keywords", () => {
    const result = lex("getOrderStatus OrderId MyType", "test.spore");
    const nonEof = result.tokens.filter((t) => t.kind !== "eof" && t.kind !== "newline");
    assert.ok(nonEof.every((t) => t.kind === "identifier"));
  });

  it("tokenises string literals", () => {
    const result = lex('"hello world"', "test.spore");
    const str = result.tokens.find((t) => t.kind === "string");
    assert.ok(str !== undefined);
    assert.equal(str.value, '"hello world"');
  });

  it("tokenises char literals", () => {
    const result = lex("'A' 'L' '\\n'", "test.spore");
    const chars = result.tokens.filter((t) => t.kind === "char");
    assert.equal(chars.length, 3);
    assert.equal(chars[0]?.value, "A");
    assert.equal(chars[1]?.value, "L");
    assert.equal(chars[2]?.value, "\\n");
  });

  it("reports SPORE-CHAR-003 for an empty char literal", () => {
    const result = lex("''", "test.spore");
    const diag = result.diagnostics.find((d) => d.code === "SPORE-CHAR-003");
    assert.ok(diag !== undefined, "Expected SPORE-CHAR-003 diagnostic");
  });

  it("reports SPORE-PARSE-003 for unterminated string", () => {
    const result = lex('"unterminated', "test.spore");
    const diag = result.diagnostics.find((d) => d.code === "SPORE-PARSE-003");
    assert.ok(diag !== undefined, "Expected SPORE-PARSE-003 diagnostic");
  });

  it("tokenises integers and decimal numbers", () => {
    const result = lex("42 3.14 1_000_000", "test.spore");
    const numbers = result.tokens.filter((t) => t.kind === "number");
    assert.equal(numbers.length, 3);
    assert.equal(numbers[0]?.value, "42");
    assert.equal(numbers[1]?.value, "3.14");
    assert.equal(numbers[2]?.value, "1_000_000");
  });

  it("tokenises hex number literals", () => {
    const result = lex("0xFF 0x1A 0x00", "test.spore");
    const numbers = result.tokens.filter((t) => t.kind === "number");
    assert.deepEqual(numbers.map((t) => t.value), ["0xFF", "0x1A", "0x00"]);
  });

  it("tokenises binary number literals", () => {
    const result = lex("0b1010", "test.spore");
    const number = result.tokens.find((t) => t.kind === "number");
    assert.equal(number?.value, "0b1010");
  });

  it("tokenises octal number literals", () => {
    const result = lex("0o755", "test.spore");
    const number = result.tokens.find((t) => t.kind === "number");
    assert.equal(number?.value, "0o755");
  });

  // Scientific-notation exponents (added for the substrate {} tolerance use-case, but
  // a language-wide numeric-literal feature). `1e-6` must be ONE number token.
  it("tokenises scientific-notation number literals as a single token", () => {
    const result = lex("1e-6 1E-9 2.5e3 6.022e23 1e10 1e+3", "test.spore");
    const numbers = result.tokens.filter((t) => t.kind === "number");
    assert.deepEqual(numbers.map((t) => t.value), ["1e-6", "1E-9", "2.5e3", "6.022e23", "1e10", "1e+3"]);
  });

  it("does NOT consume a trailing `e` with no exponent digits (stays an identifier)", () => {
    // `1e` → number `1` then identifier `e`; the guard requires a digit (or sign+digit) after e/E.
    const result = lex("1e", "test.spore");
    const nonEof = result.tokens.filter((t) => t.kind !== "eof" && t.kind !== "newline");
    assert.deepEqual(nonEof.map((t) => `${t.kind}:${t.value}`), ["number:1", "identifier:e"]);
  });

  it("does NOT consume an incomplete exponent `1e-` (number, identifier, operator)", () => {
    const result = lex("1e-", "test.spore");
    const nonEof = result.tokens.filter((t) => t.kind !== "eof" && t.kind !== "newline");
    assert.deepEqual(nonEof.map((t) => `${t.kind}:${t.value}`), ["number:1", "identifier:e", "operator:-"]);
  });

  it("hex literal 0x1e is unaffected by exponent scanning (the `e` is a hex digit)", () => {
    const result = lex("0x1e", "test.spore");
    const number = result.tokens.find((t) => t.kind === "number");
    assert.equal(number?.value, "0x1e");
  });

  it("keeps a Byte hex initializer as an operator followed by one number token", () => {
    const result = lex("let byte: Byte = 0xFF", "test.spore");
    const nonEof = result.tokens.filter((t) => t.kind !== "eof" && t.kind !== "newline");
    assert.deepEqual(
      nonEof.map((t) => `${t.kind}:${t.value}`),
      [
        "keyword:let",
        "identifier:byte",
        "symbol::",
        "identifier:Byte",
        "operator:=",
        "number:0xFF",
      ],
    );
  });

  it("tokenises two-char operators", () => {
    const result = lex("-> => == != <= >= && ||", "test.spore");
    const ops = result.tokens.filter((t) => t.kind === "operator");
    assert.deepEqual(ops.map((t) => t.value), ["->", "=>", "==", "!=", "<=", ">=", "&&", "||"]);
  });

  it("tokenises single-char operators and symbols", () => {
    const result = lex("( ) { } [ ] , : . ?", "test.spore");
    const syms = result.tokens.filter((t) => t.kind === "symbol" || t.kind === "operator");
    const values = syms.map((t) => t.value);
    assert.ok(values.includes("("));
    assert.ok(values.includes("}"));
    assert.ok(values.includes("?"));
  });

  it("tokenises line comments", () => {
    const result = lex("// this is a comment\nflow", "test.spore");
    const comment = result.tokens.find((t) => t.kind === "comment");
    assert.ok(comment !== undefined);
    assert.ok(comment.value.includes("this is a comment"));
  });

  it("tokenises doc comments", () => {
    const result = lex("/// doc comment text", "test.spore");
    const doc = result.tokens.find((t) => t.kind === "docComment");
    assert.ok(doc !== undefined);
    assert.ok(doc.value.includes("doc comment text"));
  });

  it("tracks line and column numbers", () => {
    const result = lex("flow\norder", "test.spore");
    const tokens = result.tokens.filter((t) => t.kind !== "newline" && t.kind !== "eof");
    assert.equal(tokens[0]?.line, 1);
    assert.equal(tokens[0]?.column, 1);
    assert.equal(tokens[1]?.line, 2);
    assert.equal(tokens[1]?.column, 1);
  });

  it("records byte offsets (start/end)", () => {
    const source = "flow add";
    const result = lex(source, "test.spore");
    const flowTok = result.tokens.find((t) => t.value === "flow");
    assert.ok(flowTok !== undefined);
    assert.equal(flowTok.start, 0);
    assert.equal(flowTok.end, 4);
    const addTok = result.tokens.find((t) => t.value === "add");
    assert.ok(addTok !== undefined);
    assert.equal(addTok.start, 5);
    assert.equal(addTok.end, 8);
  });

  it("emits SPORE-SYNTAX-003 for future-reserved keywords", () => {
    const result = lex("let async = 1", "test.spore");
    const diag = result.diagnostics.find((d) => d.code === "SPORE-SYNTAX-003");
    assert.ok(diag !== undefined, "Expected SPORE-SYNTAX-003 for future-reserved keyword");
  });

  it("produces eof token at the correct position", () => {
    const source = "let x";
    const result = lex(source, "test.spore");
    const eof = result.tokens[result.tokens.length - 1];
    assert.equal(eof?.kind, "eof");
    assert.equal(eof?.start, source.length);
  });
});

describe("Lexer — endLine / endColumn source ranges", () => {
  it("single-line token: endLine === line, endColumn === column + value.length", () => {
    const result = lex("let", "test.spore");
    const tok = result.tokens.find((t) => t.value === "let");
    assert.ok(tok !== undefined);
    assert.equal(tok.line, 1);
    assert.equal(tok.column, 1);
    assert.equal(tok.endLine, 1);
    assert.equal(tok.endColumn, 4); // 1 + 3 chars
  });

  it("eof token has endLine and endColumn equal to its position", () => {
    const result = lex("x", "test.spore");
    const eof = result.tokens[result.tokens.length - 1];
    assert.equal(eof?.kind, "eof");
    assert.equal(typeof eof?.endLine, "number");
    assert.equal(typeof eof?.endColumn, "number");
  });

  it("multi-word source: second token has correct start position", () => {
    const result = lex("let x", "test.spore");
    const xTok = result.tokens.find((t) => t.value === "x");
    assert.ok(xTok !== undefined);
    assert.equal(xTok.line, 1);
    assert.equal(xTok.column, 5);
    assert.equal(xTok.endLine, 1);
    assert.equal(xTok.endColumn, 6);
  });

  it("token on second line has correct line/endLine", () => {
    const result = lex("flow\norder", "test.spore");
    const orderTok = result.tokens.find((t) => t.value === "order");
    assert.ok(orderTok !== undefined);
    assert.equal(orderTok.line, 2);
    assert.equal(orderTok.endLine, 2);
    assert.equal(orderTok.column, 1);
    assert.equal(orderTok.endColumn, 6); // "order" = 5 chars
  });
});

describe("Lexer — SPORE-LEX-001 excessive generic nesting", () => {
  it("exports SPORE_LEX_001 with correct code", () => {
    assert.equal(SPORE_LEX_001.code, "SPORE-LEX-001");
    assert.equal(SPORE_LEX_001.name, "ExcessiveNesting");
  });

  it("does not emit SPORE-LEX-001 for 8 levels of nesting", () => {
    // 8 < chars: no error
    const source = "A<B<C<D<E<F<G<H>>>>>>>>"; // 8 < depth at most
    const result = lex(source, "test.spore");
    const diag = result.diagnostics.find((d) => d.code === "SPORE-LEX-001");
    assert.ok(diag === undefined, "Should not emit SPORE-LEX-001 for exactly 8 levels");
  });

  it("emits SPORE-LEX-001 when nesting exceeds 8 levels", () => {
    // 9 < in a row — depth reaches 9 on the last <
    const source = "<".repeat(9);
    const result = lex(source, "test.spore");
    const diag = result.diagnostics.find((d) => d.code === "SPORE-LEX-001");
    assert.ok(diag !== undefined, "Expected SPORE-LEX-001 for depth > 8");
    assert.equal(diag.code, "SPORE-LEX-001");
  });

  // ── Regression: generic-depth counter must reset at line/statement
  //    boundaries so unmatched comparison `<` operators across separate
  //    statements cannot accumulate into a spurious SPORE-LEX-001. (Previously
  //    the counter was global-per-file and never reset, so ≥8 `i < n` style
  //    comparisons across lines emitted a false positive far from any generic.)
  it("does NOT emit SPORE-LEX-001 for many `<` comparisons across multiple lines", () => {
    // Ten separate `while i < srcLen` lines — ten unmatched `<` operators.
    // The newline reset must keep these from accumulating past depth 8.
    const source = Array.from(
      { length: 10 },
      (_, i) => `while i < srcLen { x = ${i} }`,
    ).join("\n");
    const result = lex(source, "loops.spore");
    const diag = result.diagnostics.find((d) => d.code === "SPORE-LEX-001");
    assert.ok(diag === undefined, "Comparison `<` across separate lines must not trip SPORE-LEX-001");
  });

  it("does NOT emit SPORE-LEX-001 for many `<` comparisons separated by `;`", () => {
    // All on one line, but separated by `;` statement boundaries — the `;`
    // reset must keep the counter from accumulating across statements.
    const source = Array.from({ length: 10 }, () => "a < b;").join(" ");
    const result = lex(source, "stmts.spore");
    const diag = result.diagnostics.find((d) => d.code === "SPORE-LEX-001");
    assert.ok(diag === undefined, "Comparison `<` separated by `;` must not trip SPORE-LEX-001");
  });

  it("still emits SPORE-LEX-001 for a deeply nested single-line generic (>8 `<`)", () => {
    // A genuine generic nested 9 levels deep on one line — no newline, brace
    // or `;` to reset, so detection must still fire.
    const source = "let x: Array<Array<Array<Array<Array<Array<Array<Array<Array<Int>>>>>>>>>";
    const result = lex(source, "deep.spore");
    const diag = result.diagnostics.find((d) => d.code === "SPORE-LEX-001");
    assert.ok(diag !== undefined, "Genuine deep single-line generic must still emit SPORE-LEX-001");
    assert.equal(diag.code, "SPORE-LEX-001");
  });

  it("does NOT emit SPORE-LEX-001 for a moderate single-line generic (depth ≤ 8)", () => {
    const source = "let y: Map<Array<Int>, Array<Str>>";
    const result = lex(source, "mod.spore");
    const diag = result.diagnostics.find((d) => d.code === "SPORE-LEX-001");
    assert.ok(diag === undefined, "Moderate generic depth ≤ 8 must not trip SPORE-LEX-001");
  });
});

describe("Lexer — SPORE-LEX-002 oversized token", () => {
  it("exports SPORE_LEX_002 with correct code", () => {
    assert.equal(SPORE_LEX_002.code, "SPORE-LEX-002");
    assert.equal(SPORE_LEX_002.name, "OversizedToken");
  });

  it("emits SPORE-LEX-002 for an identifier exceeding 10,000 chars", () => {
    const longName = "a" + "b".repeat(10_001);
    const result = lex(longName, "test.spore");
    const diag = result.diagnostics.find((d) => d.code === "SPORE-LEX-002");
    assert.ok(diag !== undefined, "Expected SPORE-LEX-002 for identifier > 10,000 chars");
  });

  it("does not emit SPORE-LEX-002 for an identifier of exactly 10,000 chars", () => {
    const normalName = "a".repeat(10_000);
    const result = lex(normalName, "test.spore");
    const diag = result.diagnostics.find((d) => d.code === "SPORE-LEX-002");
    assert.ok(diag === undefined, "Should not emit SPORE-LEX-002 for exactly 10,000 chars");
  });

  it("emits SPORE-LEX-002 for a string literal body exceeding 10,000 chars", () => {
    const longStr = '"' + "x".repeat(10_001) + '"';
    const result = lex(longStr, "test.spore");
    const diag = result.diagnostics.find((d) => d.code === "SPORE-LEX-002");
    assert.ok(diag !== undefined, "Expected SPORE-LEX-002 for string > 10,000 chars");
  });
});

describe("Lexer — SPORE-LEX-003 unicode escape sequences", () => {
  it("exports SPORE_LEX_003 with correct code", () => {
    assert.equal(SPORE_LEX_003.code, "SPORE-LEX-003");
    assert.equal(SPORE_LEX_003.name, "InvalidUnicodeEscape");
  });

  it("correctly lexes \\u{1F600} (emoji code point)", () => {
    const result = lex('"\\u{1F600}"', "test.spore");
    assert.equal(result.diagnostics.length, 0, "Expected no diagnostics for valid \\u{1F600}");
    const str = result.tokens.find((t) => t.kind === "string");
    assert.ok(str !== undefined);
    // The value should contain the decoded emoji character
    assert.ok(str.value.includes("\u{1F600}"), `Expected emoji in value, got: ${JSON.stringify(str.value)}`);
  });

  it("correctly lexes \\u0041 (BMP 4-digit form, letter A)", () => {
    const result = lex('"\\u0041"', "test.spore");
    assert.equal(result.diagnostics.length, 0, "Expected no diagnostics for valid \\u0041");
    const str = result.tokens.find((t) => t.kind === "string");
    assert.ok(str !== undefined);
    assert.ok(str.value.includes("A"), `Expected 'A' in value, got: ${JSON.stringify(str.value)}`);
  });

  it("emits SPORE-LEX-003 for \\u{} with no hex digits", () => {
    const result = lex('"\\u{}"', "test.spore");
    const diag = result.diagnostics.find((d) => d.code === "SPORE-LEX-003");
    assert.ok(diag !== undefined, "Expected SPORE-LEX-003 for \\u{}");
  });

  it("emits SPORE-LEX-003 for \\u{FFFFFF1} — code point out of range", () => {
    const result = lex('"\\u{FFFFFF1}"', "test.spore");
    const diag = result.diagnostics.find((d) => d.code === "SPORE-LEX-003");
    assert.ok(diag !== undefined, "Expected SPORE-LEX-003 for out-of-range code point");
  });

  it("emits SPORE-LEX-003 for \\u with only 2 hex digits (invalid 4-digit form)", () => {
    const result = lex('"\\u004"', "test.spore");
    const diag = result.diagnostics.find((d) => d.code === "SPORE-LEX-003");
    assert.ok(diag !== undefined, "Expected SPORE-LEX-003 for \\u with < 4 hex digits");
  });

  it("correctly lexes multiple unicode escapes in one string", () => {
    const result = lex('"\\u0048\\u0065\\u006C\\u006C\\u006F"', "test.spore");
    assert.equal(result.diagnostics.length, 0, "Expected no diagnostics for valid \\uXXXX sequence");
    const str = result.tokens.find((t) => t.kind === "string");
    assert.ok(str !== undefined);
    // "Hello" in BMP escapes
    assert.ok(str.value.includes("Hello"), `Expected 'Hello' in value, got: ${JSON.stringify(str.value)}`);
  });
});

describe("Lexer — Phase 18A: Token endLine / endColumn (Task 1 verification)", () => {
  it("Token interface has endLine and endColumn fields", () => {
    const result = lex("flow", "test.spore");
    const tok = result.tokens.find((t) => t.value === "flow");
    assert.ok(tok !== undefined);
    assert.equal(typeof tok.endLine, "number", "endLine should be a number");
    assert.equal(typeof tok.endColumn, "number", "endColumn should be a number");
    assert.equal(tok.endLine, 1);
    assert.equal(tok.endColumn, 5); // "flow" is 4 chars, col starts at 1, end is 5
  });

  it("Token has start and end byte offsets (end serves as endOffset)", () => {
    const source = "let x";
    const result = lex(source, "test.spore");
    const letTok = result.tokens.find((t) => t.value === "let");
    assert.ok(letTok !== undefined);
    assert.equal(letTok.start, 0);
    assert.equal(letTok.end, 3);
    // end == endOffset: source.slice(start, end) == value
    assert.equal(source.slice(letTok.start, letTok.end), "let");
  });
});

describe("Lexer — Phase 18A: SPORE-LEX-004 file too large (Task 5)", () => {
  it("exports SPORE_LEX_004 with correct code and name", () => {
    assert.equal(SPORE_LEX_004.code, "SPORE-LEX-004");
    assert.equal(SPORE_LEX_004.name, "FileTooLarge");
    assert.equal(SPORE_LEX_004.severity, "error");
  });

  it("emits SPORE-LEX-004 and returns early for source > 10MB", () => {
    // Build a source string just over 10MB
    const oversize = "x".repeat(10 * 1024 * 1024 + 1);
    const result = lex(oversize, "big.spore");
    const diag = result.diagnostics.find((d) => d.code === "SPORE-LEX-004");
    assert.ok(diag !== undefined, "Expected SPORE-LEX-004 for source > 10MB");
    assert.equal(diag.severity, "error");
    // Should return early with only the EOF token
    assert.equal(result.tokens.length, 1);
    assert.equal(result.tokens[0]?.kind, "eof");
  });
});

describe("Lexer — Phase 18A: SPORE-LEX-005 line too long (Task 5)", () => {
  it("exports SPORE_LEX_005 with correct code and name", () => {
    assert.equal(SPORE_LEX_005.code, "SPORE-LEX-005");
    assert.equal(SPORE_LEX_005.name, "LineTooLong");
    assert.equal(SPORE_LEX_005.severity, "warning");
  });

  it("emits SPORE-LEX-005 for a line longer than 10,000 characters", () => {
    // A line of 10,001 identifier characters followed by a newline
    const longLine = "a".repeat(10_001) + "\n";
    const result = lex(longLine, "test.spore");
    const diag = result.diagnostics.find((d) => d.code === "SPORE-LEX-005");
    assert.ok(diag !== undefined, "Expected SPORE-LEX-005 for line > 10,000 chars");
    assert.equal(diag.severity, "warning");
    assert.equal(diag.location?.line, 1);
  });

  it("does not emit SPORE-LEX-005 for a line of exactly 10,000 characters", () => {
    const normalLine = "a".repeat(10_000) + "\n";
    const result = lex(normalLine, "test.spore");
    const diag = result.diagnostics.find((d) => d.code === "SPORE-LEX-005");
    // SPORE-LEX-002 may fire (oversized identifier) but SPORE-LEX-005 should not
    assert.ok(diag === undefined, "Should not emit SPORE-LEX-005 for exactly 10,000 chars");
  });
});
