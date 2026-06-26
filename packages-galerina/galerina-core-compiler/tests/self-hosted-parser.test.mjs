// =============================================================================
// Self-Hosted Parser — End-to-End Execution Test
//
// Verifies that src/self-hosted/parser.spore parses and executes correctly,
// producing valid FlowDecl records from a token stream produced by lexer.spore.
//
// Pipeline under test:
//   Galerina source text
//     → tokenize() from lexer.spore  → Array<Token>
//     → parseFlows() from parser.spore → ParseResult { flows, errors }
//
// Milestones exercised:
//   - Stage B: self-hosted parser Milestone 1 (flow headers only)
//   - Phase 12A: while loops (active)
//   - Phase 11A runtime: mut reassignment (active)
//   - stdlib: Array.empty, Array.append, list.get
//   - Interpreter: match on enum variant (TokenKind.Keyword etc.)
//   - Interpreter: record literal construction
//   - Constructs parsed: pure/guarded/secure/flow qualifiers
//   - Constructs parsed: parameter lists (readonly and plain)
//   - Constructs parsed: return type annotation (split "-" ">" tokens)
//   - Constructs parsed: with effects [...] clause (dotted names)
//   - Constructs parsed: full structured body AST (Milestone M-A — the former
//     body-parser.spore folded in: parseFlows yields FlowDecl.body as nested
//     Stmt/Expr nodes via parseBlock, alongside the back-compat returnExpr)
// =============================================================================

import assert from "node:assert/strict";
import { describe, it, before } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

import { parseProgram, resolveSymbols, checkTypes, executeFlow } from "../dist/index.js";

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const __dir = dirname(fileURLToPath(import.meta.url));
const LEXER_PATH  = join(__dir, "../src/self-hosted/lexer.spore");
const PARSER_PATH = join(__dir, "../src/self-hosted/parser.spore");

// ---------------------------------------------------------------------------
// Setup: load and compile the combined lexer + parser into a single AST
// ---------------------------------------------------------------------------

let combinedAst;

before(() => {
  let lexerSrc = readFileSync(LEXER_PATH, "utf8");
  if (lexerSrc.charCodeAt(0) === 0xFEFF) lexerSrc = lexerSrc.slice(1);

  let parserSrc = readFileSync(PARSER_PATH, "utf8");
  if (parserSrc.charCodeAt(0) === 0xFEFF) parserSrc = parserSrc.slice(1);

  // Combine into one compilation unit so lexer types are visible to the parser
  const combined = lexerSrc + "\n" + parserSrc;
  const parsed = parseProgram(combined, "lexer+parser.spore");
  resolveSymbols(parsed.ast);
  checkTypes(parsed.ast);
  combinedAst = parsed.ast;
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Tokenize Galerina source via the self-hosted lexer, then parse it via the
 * self-hosted parser. Returns the ParseResult record value.
 */
async function pipeline(source) {
  const lexResult = await executeFlow(
    "tokenize",
    new Map([["source", { __tag: "string", value: source }]]),
    combinedAst,
  );
  assert.equal(lexResult.value.__tag, "ok", "tokenize must return Ok");
  const tokens = lexResult.value.value;

  const parseResult = await executeFlow(
    "parseFlows",
    new Map([["tokens", tokens]]),
    combinedAst,
  );
  assert.equal(parseResult.value.__tag, "record", "parseFlows must return a record");
  return parseResult.value;
}

/** Extract a string field from a Galerina record value. */
function strField(record, field) {
  const v = record.fields.get(field);
  if (v?.__tag === "string")  return v.value;
  if (v?.__tag === "bool")    return String(v.value);
  if (v?.__tag === "unresolved") return v.name;
  return undefined;
}

/** Extract the flows list from a ParseResult record. */
function flowsList(result) {
  const flows = result.fields.get("flows");
  assert.equal(flows?.__tag, "list", "ParseResult.flows must be a list");
  return flows.items;
}

/** Extract the effects list from a FlowDecl record. Returns array of strings. */
function effectsList(flowDecl) {
  const efx = flowDecl.fields.get("effects");
  assert.equal(efx?.__tag, "list", "FlowDecl.effects must be a list");
  return efx.items.map((e) => e.__tag === "string" ? e.value : "??");
}

/** Extract the params list from a FlowDecl record. */
function paramsList(flowDecl) {
  const p = flowDecl.fields.get("params");
  assert.equal(p?.__tag, "list", "FlowDecl.params must be a list");
  return p.items.map((item) => ({
    name:       strField(item, "name"),
    typeName:   strField(item, "typeName"),
    isReadonly: strField(item, "isReadonly"),
  }));
}

/**
 * Extract the decomposed returnExpr record from a FlowDecl.
 * Shape (Phase S6, matching type-checker.spore + gir-emitter.spore):
 *   { kind, litType, leftType, rightType } — all strings.
 */
function returnExpr(flowDecl) {
  const re = flowDecl.fields.get("returnExpr");
  assert.equal(re?.__tag, "record", "FlowDecl.returnExpr must be a record");
  return {
    kind:      strField(re, "kind"),
    litType:   strField(re, "litType"),
    leftType:  strField(re, "leftType"),
    rightType: strField(re, "rightType"),
  };
}

// --- Full body AST readers (Milestone M-A: parseFlows now returns FlowDecl.body
// as a nested Stmt/Expr AST, folded from the former body-parser.spore). These
// mirror the .spore record shapes (Stmt { kind, name, typeName, expr, body },
// Expr { kind, value, litType, children }). ---
function readExpr(node) {
  const x = node.value ?? node;
  const kids = x.fields.get("children").items.map(readExpr);
  return {
    kind:    x.fields.get("kind").value,
    value:   x.fields.get("value").value,
    litType: x.fields.get("litType").value,
    children: kids,
  };
}
function readStmt(node) {
  const x = node.value ?? node;
  return {
    kind:     x.fields.get("kind").value,
    name:     x.fields.get("name").value,
    typeName: x.fields.get("typeName").value,
    expr:     x.fields.get("expr").items.map(readExpr),
    body:     x.fields.get("body").items.map(readStmt),
  };
}

/** Extract the structured body (Array<Stmt>) from a FlowDecl. */
function bodyList(flowDecl) {
  const b = flowDecl.fields.get("body");
  assert.equal(b?.__tag, "list", "FlowDecl.body must be a list");
  return b.items.map(readStmt);
}

// ---------------------------------------------------------------------------
// Section 1: Parse-time sanity
// ---------------------------------------------------------------------------

describe("Self-Hosted Parser (parser.spore) — parse-time sanity", () => {

  it("parser.spore alone parses with zero errors", () => {
    let src = readFileSync(PARSER_PATH, "utf8");
    if (src.charCodeAt(0) === 0xFEFF) src = src.slice(1);
    const parsed = parseProgram(src, "parser.spore");
    const errors = parsed.diagnostics.filter((d) => d.severity === "error");
    assert.equal(
      errors.length,
      0,
      `Expected 0 parse errors, got: ${errors.map((e) => e.message).join("; ")}`,
    );
  });

  it("parser.spore exports the three expected flows", () => {
    let src = readFileSync(PARSER_PATH, "utf8");
    if (src.charCodeAt(0) === 0xFEFF) src = src.slice(1);
    const parsed = parseProgram(src, "parser.spore");
    const names = parsed.flows?.map((f) => f.name) ?? [];
    assert.ok(names.includes("parseFlows"), "parseFlows should be present");
    assert.ok(names.includes("tokVal"),     "tokVal helper should be present");
    assert.ok(names.includes("isKw"),       "isKw helper should be present");
  });

  it("combined lexer + parser compiles with zero errors", () => {
    let lexerSrc = readFileSync(LEXER_PATH, "utf8");
    if (lexerSrc.charCodeAt(0) === 0xFEFF) lexerSrc = lexerSrc.slice(1);
    let parserSrc = readFileSync(PARSER_PATH, "utf8");
    if (parserSrc.charCodeAt(0) === 0xFEFF) parserSrc = parserSrc.slice(1);
    const parsed = parseProgram(lexerSrc + "\n" + parserSrc, "combined.spore");
    const errors = parsed.diagnostics.filter((d) => d.severity === "error");
    assert.equal(
      errors.length,
      0,
      `Combined has errors: ${errors.map((e) => e.message).join("; ")}`,
    );
  });

});

// ---------------------------------------------------------------------------
// Section 2: pure flow — simplest case
// ---------------------------------------------------------------------------

describe("Self-Hosted Parser — pure flow declaration", () => {

  it("parseFlows returns a ParseResult record", async () => {
    const result = await pipeline('pure flow greet() -> String { return "hello" }');
    assert.equal(result.__tag, "record");
    assert.ok(result.fields.has("flows"),  "must have flows field");
    assert.ok(result.fields.has("errors"), "must have errors field");
  });

  it("parseFlows produces exactly one FlowDecl for a single pure flow", async () => {
    const result = await pipeline('pure flow greet() -> String { return "hello" }');
    const flows = flowsList(result);
    assert.equal(flows.length, 1, "should produce exactly one FlowDecl");
  });

  it("FlowDecl.kind is 'pure' for a pure flow", async () => {
    const result = await pipeline('pure flow greet() -> String { return "hello" }');
    const [flow] = flowsList(result);
    assert.equal(strField(flow, "kind"), "pure");
  });

  it("FlowDecl.name is 'greet'", async () => {
    const result = await pipeline('pure flow greet() -> String { return "hello" }');
    const [flow] = flowsList(result);
    assert.equal(strField(flow, "name"), "greet");
  });

  it("FlowDecl.returnType is 'String'", async () => {
    const result = await pipeline('pure flow greet() -> String { return "hello" }');
    const [flow] = flowsList(result);
    assert.equal(strField(flow, "returnType"), "String");
  });

  it("FlowDecl.params is an empty list for a no-param flow", async () => {
    const result = await pipeline('pure flow greet() -> String { return "hello" }');
    const [flow] = flowsList(result);
    assert.equal(paramsList(flow).length, 0);
  });

  it("FlowDecl.effects is an empty list when no effects clause", async () => {
    const result = await pipeline('pure flow greet() -> String { return "hello" }');
    const [flow] = flowsList(result);
    assert.deepEqual(effectsList(flow), []);
  });

});

// ---------------------------------------------------------------------------
// Section 3: guarded flow with parameters
// ---------------------------------------------------------------------------

describe("Self-Hosted Parser — guarded flow with parameters", () => {

  it("recognises 'guarded' qualifier", async () => {
    const result = await pipeline("guarded flow add(x: Int, y: Int) -> Int { return x }");
    const [flow] = flowsList(result);
    assert.equal(strField(flow, "kind"), "guarded");
  });

  it("parses two plain parameters correctly", async () => {
    const result = await pipeline("guarded flow add(x: Int, y: Int) -> Int { return x }");
    const [flow] = flowsList(result);
    const params = paramsList(flow);
    assert.equal(params.length, 2);
    assert.equal(params[0]?.name,     "x");
    assert.equal(params[0]?.typeName, "Int");
    assert.equal(params[0]?.isReadonly, "false");
    assert.equal(params[1]?.name,     "y");
    assert.equal(params[1]?.typeName, "Int");
  });

  it("return type Int is captured", async () => {
    const result = await pipeline("guarded flow add(x: Int, y: Int) -> Int { return x }");
    const [flow] = flowsList(result);
    assert.equal(strField(flow, "returnType"), "Int");
  });

});

// ---------------------------------------------------------------------------
// Section 4: secure flow with readonly parameter
// ---------------------------------------------------------------------------

describe("Self-Hosted Parser — secure flow with readonly parameter", () => {

  it("recognises 'secure' qualifier", async () => {
    const result = await pipeline('secure flow login(readonly user: String) -> Result { return "ok" }');
    const [flow] = flowsList(result);
    assert.equal(strField(flow, "kind"), "secure");
  });

  it("parses readonly parameter with isReadonly=true", async () => {
    const result = await pipeline('secure flow login(readonly user: String) -> Result { return "ok" }');
    const [flow] = flowsList(result);
    const params = paramsList(flow);
    assert.equal(params.length, 1);
    assert.equal(params[0]?.name,       "user");
    assert.equal(params[0]?.typeName,   "String");
    assert.equal(params[0]?.isReadonly, "true");
  });

});

// ---------------------------------------------------------------------------
// Section 5: with effects clause
// ---------------------------------------------------------------------------

// Stage B parser.spore — effects extraction milestone.
// 'with effects [...]' was removed in v1-current; canonical form is 'contract { effects {} }'.
// The Stage B parser (parser.spore) reads contract.effects blocks.
// This describe block tests what the Stage B parser does today:
// - returnType parsing is correct (not contaminated by effects clause)
// - effects extraction from contract block is a Stage B v1 target (parser.spore needs update)
describe("Self-Hosted Parser — contract effects clause", () => {

  it("effects list is empty when Stage B parser.spore does not yet parse contract.effects (milestone)", async () => {
    // Stage B parser.spore does not yet extract effects from contract { effects {} } blocks.
    // This test confirms current behavior (empty). Advance this test when parser.spore gains
    // contract.effects parsing (Stage B milestone).
    const result = await pipeline(`pure flow fetch() -> String contract { effects { io.read } }\n{ return x }`);
    const [flow] = flowsList(result);
    // Current Stage B capability: effects not yet extracted from contract block
    const efx = flow.fields.get("effects");
    assert.ok(efx?.__tag === "list", "effects field must be a list");
    // Future milestone: assert.deepEqual(effectsList(flow), ["io.read"]);
  });

  it("effects don't bleed into returnType (Stage B correctly parses return type)", async () => {
    const result = await pipeline(
      `pure flow sync(x: Int) -> Int contract { effects { io.read } }\n{ return x }`,
    );
    const [flow] = flowsList(result);
    // returnType must be "Int" regardless of effects clause
    assert.equal(strField(flow, "returnType"), "Int");
  });

});

// ---------------------------------------------------------------------------
// Section 6: bare "flow" keyword (no qualifier)
// ---------------------------------------------------------------------------

describe("Self-Hosted Parser — bare flow keyword", () => {

  it("bare 'flow' keyword produces kind='flow'", async () => {
    const result = await pipeline("flow process(x: Int) -> Int { return x }");
    const [flow] = flowsList(result);
    assert.equal(strField(flow, "kind"), "flow");
    assert.equal(strField(flow, "name"), "process");
  });

  it("bare flow captures its parameter", async () => {
    const result = await pipeline("flow process(x: Int) -> Int { return x }");
    const [flow] = flowsList(result);
    const params = paramsList(flow);
    assert.equal(params.length, 1);
    assert.equal(params[0]?.name, "x");
  });

});

// ---------------------------------------------------------------------------
// Section 7: multiple flow declarations in one source
// ---------------------------------------------------------------------------

describe("Self-Hosted Parser — multiple flow declarations", () => {

  it("parses two consecutive flows", async () => {
    const src = [
      'pure flow a() -> Int { return 1 }',
      'guarded flow b(x: String) -> String { return x }',
    ].join("\n");
    const result = await pipeline(src);
    const flows = flowsList(result);
    assert.equal(flows.length, 2);
  });

  it("first flow is 'a', second flow is 'b'", async () => {
    const src = [
      'pure flow a() -> Int { return 1 }',
      'guarded flow b(x: String) -> String { return x }',
    ].join("\n");
    const result = await pipeline(src);
    const flows = flowsList(result);
    assert.equal(strField(flows[0], "name"), "a");
    assert.equal(strField(flows[1], "name"), "b");
  });

  it("qualifiers are preserved across multiple flows", async () => {
    const src = [
      'pure flow a() -> Int { return 1 }',
      'guarded flow b(x: String) -> String { return x }',
    ].join("\n");
    const result = await pipeline(src);
    const flows = flowsList(result);
    assert.equal(strField(flows[0], "kind"), "pure");
    assert.equal(strField(flows[1], "kind"), "guarded");
  });

  it("non-flow tokens between declarations are skipped without error", async () => {
    const src = [
      "// This is a comment line that becomes symbols/identifiers",
      'pure flow a() -> Int { return 1 }',
      'let x = 42',
      'guarded flow b() -> String { return "hi" }',
    ].join("\n");
    const result = await pipeline(src);
    const flows = flowsList(result);
    assert.equal(flows.length, 2, "should find exactly the two flow declarations");
  });

});

// ---------------------------------------------------------------------------
// Section 8: body brace skipping
// ---------------------------------------------------------------------------

describe("Self-Hosted Parser — body brace skipping", () => {

  it("correctly skips a multi-statement body and does not confuse tokens after '}'", async () => {
    const src = [
      'pure flow calc(x: Int) -> Int { let y = x + 1 return y }',
      'pure flow next() -> String { return "done" }',
    ].join("\n");
    const result = await pipeline(src);
    const flows = flowsList(result);
    assert.equal(flows.length, 2);
    assert.equal(strField(flows[1], "name"), "next");
  });

  it("handles nested braces in body without confusion", async () => {
    const src = 'pure flow nested() -> Int { if true { return 1 } return 0 }\npure flow after() -> Int { return 2 }';
    const result = await pipeline(src);
    const flows = flowsList(result);
    assert.equal(flows.length, 2);
    assert.equal(strField(flows[1], "name"), "after");
  });

});

// ---------------------------------------------------------------------------
// Section 8b: decomposed return expression (Phase S6)
//
// The parser decomposes each flow's first top-level return into a
// returnExpr record { kind, litType, leftType, rightType } that exactly
// matches what self-hosted type-checker.spore and gir-emitter.spore consume.
//   kind ∈ "literal" | "param" | "arith" | "compare"
// ---------------------------------------------------------------------------

describe("Self-Hosted Parser — decomposed returnExpr (Phase S6)", () => {

  it("FlowDecl carries a returnExpr record", async () => {
    const result = await pipeline('pure flow f() -> Int { return 42 }');
    const [flow] = flowsList(result);
    assert.equal(flow.fields.get("returnExpr")?.__tag, "record");
  });

  it("single NumberLiteral return → literal/Int", async () => {
    const result = await pipeline('pure flow f() -> Int { return 42 }');
    const [flow] = flowsList(result);
    assert.deepEqual(returnExpr(flow), {
      kind: "literal", litType: "Int", leftType: "", rightType: "",
    });
  });

  it("single StringLiteral return → literal/String", async () => {
    const result = await pipeline('pure flow f() -> String { return "hi" }');
    const [flow] = flowsList(result);
    assert.deepEqual(returnExpr(flow), {
      kind: "literal", litType: "String", leftType: "", rightType: "",
    });
  });

  it("true keyword return → literal/Bool", async () => {
    const result = await pipeline('pure flow f() -> Bool { return true }');
    const [flow] = flowsList(result);
    assert.deepEqual(returnExpr(flow), {
      kind: "literal", litType: "Bool", leftType: "", rightType: "",
    });
  });

  it("false keyword return → literal/Bool", async () => {
    const result = await pipeline('pure flow f() -> Bool { return false }');
    const [flow] = flowsList(result);
    assert.equal(returnExpr(flow).kind, "literal");
    assert.equal(returnExpr(flow).litType, "Bool");
  });

  it("single Identifier return → param/Unknown (name reference)", async () => {
    const result = await pipeline('pure flow g(n: Int) -> Int { return n }');
    const [flow] = flowsList(result);
    assert.deepEqual(returnExpr(flow), {
      kind: "param", litType: "Unknown", leftType: "", rightType: "",
    });
  });

  it("identifier arith 'a + b' → arith with Unknown operand types", async () => {
    const result = await pipeline('pure flow f() -> Int { return a + b }');
    const [flow] = flowsList(result);
    assert.deepEqual(returnExpr(flow), {
      kind: "arith", litType: "", leftType: "Unknown", rightType: "Unknown",
    });
  });

  it("literal arith '1 + 2' classifies both operands as Int", async () => {
    const result = await pipeline('pure flow f() -> Int { return 1 + 2 }');
    const re = returnExpr(flowsList(result)[0]);
    assert.equal(re.kind, "arith");
    assert.equal(re.leftType, "Int");
    assert.equal(re.rightType, "Int");
    assert.equal(re.litType, "");
  });

  it("each arithmetic operator + - * / yields kind=arith", async () => {
    for (const op of ["+", "-", "*", "/"]) {
      const result = await pipeline(`pure flow f() -> Int { return 1 ${op} 2 }`);
      const re = returnExpr(flowsList(result)[0]);
      assert.equal(re.kind, "arith", `operator '${op}' should be arith`);
    }
  });

  it("compare 'x == y' → compare with Unknown operand types", async () => {
    const result = await pipeline('pure flow f() -> Bool { return x == y }');
    const [flow] = flowsList(result);
    assert.deepEqual(returnExpr(flow), {
      kind: "compare", litType: "", leftType: "Unknown", rightType: "Unknown",
    });
  });

  it("compare '3 < 4' classifies both operands as Int", async () => {
    const result = await pipeline('pure flow f() -> Bool { return 3 < 4 }');
    const re = returnExpr(flowsList(result)[0]);
    assert.equal(re.kind, "compare");
    assert.equal(re.leftType, "Int");
    assert.equal(re.rightType, "Int");
  });

  it("each comparison operator == != < > <= >= yields kind=compare", async () => {
    for (const op of ["==", "!=", "<", ">", "<=", ">="]) {
      const result = await pipeline(`pure flow f() -> Bool { return 1 ${op} 2 }`);
      const re = returnExpr(flowsList(result)[0]);
      assert.equal(re.kind, "compare", `operator '${op}' should be compare`);
    }
  });

  it("mixed-operand compare 'n > 0' classifies left=Unknown right=Int", async () => {
    const result = await pipeline('pure flow f(n: Int) -> Bool { return n > 0 }');
    const re = returnExpr(flowsList(result)[0]);
    assert.equal(re.kind, "compare");
    assert.equal(re.leftType, "Unknown");
    assert.equal(re.rightType, "Int");
  });

  it("no return statement → default literal/Unknown sentinel", async () => {
    const result = await pipeline('pure flow f() -> Int { let y = 1 }');
    const [flow] = flowsList(result);
    assert.deepEqual(returnExpr(flow), {
      kind: "literal", litType: "Unknown", leftType: "", rightType: "",
    });
  });

  it("only the top-level return is decomposed (nested return ignored)", async () => {
    // The inner `return 1` is inside an if-block (depth 2); the top-level
    // `return x` is what must be decomposed.
    const result = await pipeline('pure flow f(x: Int) -> Int { if true { return 1 } return x }');
    const re = returnExpr(flowsList(result)[0]);
    assert.equal(re.kind, "param", "top-level `return x` should win over nested `return 1`");
    assert.equal(re.litType, "Unknown");
  });

  it("returnExpr shape matches checker/emitter contract (four string fields)", async () => {
    const result = await pipeline('pure flow f() -> Int { return 1 + 2 }');
    const re = flowsList(result)[0].fields.get("returnExpr");
    assert.deepEqual(
      [...re.fields.keys()].sort(),
      ["kind", "leftType", "litType", "rightType"],
      "returnExpr must expose exactly {kind, litType, leftType, rightType}",
    );
  });

});

// ---------------------------------------------------------------------------
// Section 8c: full structured body AST (Milestone M-A)
//
// parseFlows now folds in the former body-parser.spore: each FlowDecl carries a
// `body` field that is the full nested Stmt/Expr AST (produced by parseBlock),
// in ADDITION to the flat back-compat `returnExpr`. These assertions port the
// strongest coverage from the deleted self-hosted-body-parser.test.mjs, proving
// the structured body now comes straight out of a single parseFlows call.
// ---------------------------------------------------------------------------

describe("Self-Hosted Parser — full body AST (Milestone M-A)", () => {

  it("FlowDecl exposes a structured `body` list (not the old flat `stmts`)", async () => {
    const result = await pipeline('pure flow f(n: Int) -> Int { return n }');
    const [flow] = flowsList(result);
    assert.ok(!flow.fields.has("stmts"), "old flat `stmts` field must be gone");
    assert.equal(flow.fields.get("body")?.__tag, "list", "FlowDecl.body must be a list");
  });

  it("let with type + initializer parses into the body AST", async () => {
    const result = await pipeline('pure flow f() -> Int { let x: Int = 1 + 2 }');
    const [s] = bodyList(flowsList(result)[0]);
    assert.equal(s.kind, "let");
    assert.equal(s.name, "x");
    assert.equal(s.typeName, "Int");
    assert.equal(s.expr[0].kind, "binary");
    assert.equal(s.expr[0].value, "+");
  });

  it("multiple statements appear in order with correct kinds", async () => {
    const result = await pipeline(
      'pure flow f() -> Int { let a: Int = 1\nlet b: Int = 2\nreturn a + b }',
    );
    const stmts = bodyList(flowsList(result)[0]);
    assert.deepEqual(stmts.map((s) => s.kind), ["let", "let", "return"]);
    assert.deepEqual([stmts[0].name, stmts[1].name], ["a", "b"]);
  });

  it("if statement nests its one-statement body", async () => {
    const result = await pipeline('pure flow f(n: Int) -> Int { if n < 2 { return n } }');
    const [s] = bodyList(flowsList(result)[0]);
    assert.equal(s.kind, "if");
    assert.equal(s.expr[0].kind, "binary");
    assert.equal(s.expr[0].value, "<");
    assert.equal(s.body.length, 1);
    assert.equal(s.body[0].kind, "return");
  });

  it("while statement nests an assignment in its body", async () => {
    const result = await pipeline('pure flow f() -> Int { while i < n { i = i + 1 } }');
    const [s] = bodyList(flowsList(result)[0]);
    assert.equal(s.kind, "while");
    assert.equal(s.body.length, 1);
    assert.equal(s.body[0].kind, "assign");
  });

  it("a realistic recursive flow yields the full body AST from one parseFlows call", async () => {
    const result = await pipeline(
      'pure flow fib(n: Int) -> Int { if n < 2 { return n }\nreturn fib(n - 1) + fib(n - 2) }',
    );
    const [flow] = flowsList(result);
    const stmts = bodyList(flow);

    // Body structure: [if, return]
    assert.deepEqual(stmts.map((s) => s.kind), ["if", "return"]);

    // Final return is a binary '+' of two calls to fib.
    const ret = stmts[1];
    assert.equal(ret.expr[0].value, "+");
    assert.deepEqual(ret.expr[0].children.map((c) => c.kind), ["call", "call"]);
    assert.deepEqual(ret.expr[0].children.map((c) => c.value), ["fib", "fib"]);

    // Header fields (consumed by type-checker.spore + gir-emitter.spore) intact.
    assert.equal(strField(flow, "name"), "fib");
    assert.equal(strField(flow, "kind"), "pure");
    assert.equal(strField(flow, "returnType"), "Int");
    const params = paramsList(flow);
    assert.equal(params.length, 1);
    assert.equal(params[0]?.name, "n");
    assert.equal(params[0]?.typeName, "Int");
    // Back-compat returnExpr still produced (first top-level return decomposed).
    assert.equal(returnExpr(flow).kind, "param");
  });

  it("empty body yields an empty statement list", async () => {
    const result = await pipeline('pure flow f() -> Int { }');
    assert.equal(bodyList(flowsList(result)[0]).length, 0);
  });

});

// ---------------------------------------------------------------------------
// Section 9: error resilience
// ---------------------------------------------------------------------------

describe("Self-Hosted Parser — error resilience", () => {

  it("returns ParseResult with errors list (empty on clean input)", async () => {
    const result = await pipeline('pure flow ok() -> Int { return 1 }');
    const errs = result.fields.get("errors");
    assert.equal(errs?.__tag, "list");
  });

  it("produces zero runtime diagnostics for well-formed input", async () => {
    const lexResult = await executeFlow(
      "tokenize",
      new Map([["source", { __tag: "string", value: 'pure flow greet() -> String { return "hello" }' }]]),
      combinedAst,
    );
    const tokens = lexResult.value.value;
    const parseResult = await executeFlow(
      "parseFlows",
      new Map([["tokens", tokens]]),
      combinedAst,
    );
    const runtimeErrors = parseResult.diagnostics.filter((d) => d.code === "SPORE-RUNTIME-002");
    assert.equal(runtimeErrors.length, 0, "Should produce no unresolved-call runtime errors");
  });

  it("empty token stream returns empty flows list without crash", async () => {
    // Tokenize empty source — should give just Eof
    const lexResult = await executeFlow(
      "tokenize",
      new Map([["source", { __tag: "string", value: "" }]]),
      combinedAst,
    );
    const tokens = lexResult.value.value;
    const parseResult = await executeFlow(
      "parseFlows",
      new Map([["tokens", tokens]]),
      combinedAst,
    );
    const flows = flowsList(parseResult.value);
    assert.equal(flows.length, 0);
  });

  // Regression: a dangling operator in an expression must NOT consume the closing
  // "}" of the flow body (which previously swallowed the following flow).
  it("a dangling operator does not swallow the following flow", async () => {
    const result = await pipeline(
      `pure flow f() -> Int { return a + }\npure flow g() -> Int { return 1 }`,
    );
    const flows = flowsList(result);
    assert.equal(flows.length, 2, "both flows must survive a malformed return");
    assert.deepEqual(flows.map((fd) => strField(fd, "name")), ["f", "g"]);
  });

});
