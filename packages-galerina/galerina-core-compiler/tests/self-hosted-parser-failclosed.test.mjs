// =============================================================================
// Self-Hosted Parser — fail-closed error reporting (R&D 0050 ruling / RD-0528)
// =============================================================================
// Pins the FUNGI-PARSE-00x fail-closed contract of parser.fungi: malformed source
// REPORTS errors — never a silent skip. Before this class landed, `errs` was
// declared and returned but never appended (a genuine fail-open: any garbage
// parsed "clean" with zero flows), which made the stage ineligible for any
// authority flip. The classes, mirroring parser.ts where a code exists:
//   FUNGI-PARSE-001  unexpected non-trivia token at top level (parser.ts UNEXPECTED_TOKEN)
//   FUNGI-PARSE-002  flow qualifier not followed by `flow`   (parser.ts EXPECTED_FLOW_KEYWORD)
//   FUNGI-PARSE-003  dangling/unterminated declaration (flow w/o name · unterminated block)
//   FUNGI-PARSE-004  flow header without a body block
// GREEN guarantees pinned alongside: comments/newlines/Eof are trivia (never
// errors), record/enum/type skip STRUCTURALLY (grammar-gap, deliberate — #93),
// and one bad line yields exactly ONE error (anti-cascade, parser.ts:6177).
// =============================================================================

import assert from "node:assert/strict";
import { describe, it, before } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

import { parseProgram, resolveSymbols, checkTypes, executeFlow } from "../dist/index.js";

const __dir = dirname(fileURLToPath(import.meta.url));
const stripBom = (s) => (s.charCodeAt(0) === 0xfeff ? s.slice(1) : s);
const stripHeader = (s) => s.replace(/^@version[^\n]*\n/, "");

let ast;
before(() => {
  const lexerSrc = stripHeader(stripBom(readFileSync(join(__dir, "../src/self-hosted/lexer.fungi"), "utf8")));
  const parserSrc = stripHeader(stripBom(readFileSync(join(__dir, "../src/self-hosted/parser.fungi"), "utf8")));
  const parsed = parseProgram(lexerSrc + "\n" + parserSrc, "lexer+parser.fungi");
  resolveSymbols(parsed.ast);
  checkTypes(parsed.ast);
  ast = parsed.ast;
});

async function pipeline(source) {
  const lex = await executeFlow("tokenize", new Map([["source", { __tag: "string", value: source }]]), ast);
  assert.equal(lex.value.__tag, "ok", "tokenize must return Ok");
  const parse = await executeFlow("parseFlows", new Map([["tokens", lex.value.value]]), ast);
  assert.equal(parse.value.__tag, "record", "parseFlows must return a record");
  const errors = parse.value.fields.get("errors");
  const flows = parse.value.fields.get("flows");
  assert.equal(errors?.__tag, "list", "ParseResult.errors must be a list");
  return {
    errors: errors.items.map((e) => (e.__tag === "string" ? e.value : "??")),
    flowCount: flows?.__tag === "list" ? flows.items.length : -1,
  };
}

describe("Self-Hosted Parser — fail-closed error reporting (FUNGI-PARSE-00x)", () => {
  it("GREEN: a valid flow parses with zero errors", async () => {
    const r = await pipeline("pure flow add(a: Int, b: Int) -> Int {\n  return a + b\n}\n");
    assert.deepEqual(r.errors, []);
    assert.equal(r.flowCount, 1);
  });

  it("GREEN: comments are trivia and record declarations skip structurally (grammar-gap, not errors)", async () => {
    const r = await pipeline("/// a doc comment\nrecord R {\n  x: Int\n}\npure flow one() -> Int {\n  return 1\n}\n");
    assert.deepEqual(r.errors, []);
    assert.equal(r.flowCount, 1);
  });

  it("FUNGI-PARSE-001: garbage at top level ERRORS — and the next flow still parses (recovery)", async () => {
    const r = await pipeline("banana garbage tokens\npure flow ok() -> Int {\n  return 1\n}\n");
    assert.equal(r.errors.length, 1, `expected exactly one error, got: ${JSON.stringify(r.errors)}`);
    assert.match(r.errors[0], /^FUNGI-PARSE-001/);
    assert.equal(r.flowCount, 1, "the flow after the bad line must still parse");
  });

  it("FUNGI-PARSE-002: a flow qualifier not followed by `flow` is a dangling keyword", async () => {
    const r = await pipeline("pure banana\n");
    assert.equal(r.errors.length, 1);
    assert.match(r.errors[0], /^FUNGI-PARSE-002/);
  });

  it("FUNGI-PARSE-003: `flow` with no name is a dangling declaration", async () => {
    const r = await pipeline("flow");
    assert.ok(r.errors.some((e) => e.startsWith("FUNGI-PARSE-003")), JSON.stringify(r.errors));
  });

  it("FUNGI-PARSE-003: an unterminated record block (EOF before `}`) errors", async () => {
    const r = await pipeline("record R {\n  x: Int\n");
    assert.equal(r.errors.length, 1);
    assert.match(r.errors[0], /^FUNGI-PARSE-003/);
  });

  it("FUNGI-PARSE-004: a flow header with no body block errors", async () => {
    const r = await pipeline("flow f(a: Int) -> Int\n");
    assert.equal(r.errors.length, 1);
    assert.match(r.errors[0], /^FUNGI-PARSE-004/);
  });

  it("anti-cascade: three garbage tokens on ONE line yield exactly ONE error", async () => {
    const r = await pipeline("qqq www eee\n");
    assert.equal(r.errors.length, 1, JSON.stringify(r.errors));
  });
});
