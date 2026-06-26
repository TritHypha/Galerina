/**
 * Self-hosted parser — grammar extensions (parser.spore).
 *
 * Logical and/or (lowest precedence), unary prefix (! → "not", - → "neg"),
 * and if/else branches. Tokenizes real source with lexer.spore, parses a flow
 * body via parseBlock, and asserts the resulting Stmt/Expr AST.
 */

import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseProgram, resolveSymbols, checkTypes, executeFlow } from "../dist/index.js";

const __dir = dirname(fileURLToPath(import.meta.url));
const SH = join(__dir, "..", "src", "self-hosted");
function load(file) {
  const p = parseProgram(readFileSync(join(SH, file), "utf8"), file);
  resolveSymbols(p.ast);
  checkTypes(p.ast);
  const errs = p.diagnostics.filter((d) => d.severity === "error");
  assert.equal(errs.length, 0, `${file}: ${errs.map((e) => e.message).join("; ")}`);
  return p;
}

let lexer, parser;
before(() => {
  lexer = load("lexer.spore");
  parser = load("parser.spore");
});

const vStr = (s) => ({ __tag: "string", value: s });
const vInt = (n) => ({ __tag: "int", value: n });

async function tokenize(src) {
  const r = await executeFlow("tokenize", new Map([["source", vStr(src)]]), lexer.ast);
  let t = r.value ?? r;
  if (t.__tag === "ok") t = t.value;
  return t;
}
function readExpr(n) {
  const x = n.value ?? n;
  return { kind: x.fields.get("kind").value, value: x.fields.get("value").value, children: x.fields.get("children").items.map(readExpr) };
}
function readStmt(n) {
  const x = n.value ?? n;
  return {
    kind: x.fields.get("kind").value,
    expr: x.fields.get("expr").items.map(readExpr),
    body: x.fields.get("body").items.map(readStmt),
    elseBody: x.fields.get("elseBody").items.map(readStmt),
  };
}
function afterBrace(toks) {
  const it = toks.items;
  for (let i = 0; i < it.length; i++) if ((it[i].value ?? it[i]).fields.get("value").value === "{") return i + 1;
  throw new Error("no brace");
}
async function bodyOf(src) {
  const toks = await tokenize(src);
  const r = await executeFlow("parseBlock", new Map([["tokens", toks], ["pos", vInt(afterBrace(toks))]]), parser.ast);
  return (r.value ?? r).fields.get("stmts").items.map(readStmt);
}
async function exprOf(e) {
  const stmts = await bodyOf(`pure flow f() -> Int { return ${e} }`);
  return stmts.find((s) => s.kind === "return").expr[0];
}

describe("parser.spore grammar — logical and/or", () => {
  it("a and b → binary 'and'", async () => {
    const e = await exprOf("a and b");
    assert.equal(e.kind, "binary");
    assert.equal(e.value, "and");
    assert.deepEqual(e.children.map((c) => c.value), ["a", "b"]);
  });

  it("logical sits below comparison: a < b and c < d → root 'and' over two comparisons", async () => {
    const e = await exprOf("a < b and c < d");
    assert.equal(e.value, "and");
    assert.deepEqual(e.children.map((c) => c.value), ["<", "<"]);
    assert.deepEqual(e.children.map((c) => c.kind), ["binary", "binary"]);
  });

  it("or is also a logical binary", async () => {
    const e = await exprOf("x or y");
    assert.equal(e.value, "or");
  });
});

describe("parser.spore grammar — unary prefix", () => {
  it("!x → unary 'not'", async () => {
    const e = await exprOf("!x");
    assert.equal(e.kind, "unary");
    assert.equal(e.value, "not");
    assert.equal(e.children[0].value, "x");
  });

  it("-x → unary 'neg'", async () => {
    const e = await exprOf("-x");
    assert.equal(e.kind, "unary");
    assert.equal(e.value, "neg");
  });

  it("unary binds tighter than +: -x + 1 → binary '+' with left unary 'neg'", async () => {
    const e = await exprOf("-x + 1");
    assert.equal(e.kind, "binary");
    assert.equal(e.value, "+");
    assert.equal(e.children[0].kind, "unary");
    assert.equal(e.children[0].value, "neg");
  });

  it("!(a == b) → unary 'not' over a comparison", async () => {
    const e = await exprOf("!(a == b)");
    assert.equal(e.kind, "unary");
    assert.equal(e.value, "not");
    assert.equal(e.children[0].kind, "binary");
    assert.equal(e.children[0].value, "==");
  });
});

describe("parser.spore grammar — if/else", () => {
  it("if without else → empty elseBody", async () => {
    const [s] = await bodyOf(`pure flow f() -> Int { if c { return 1 } }`);
    assert.equal(s.kind, "if");
    assert.equal(s.body.length, 1);
    assert.equal(s.elseBody.length, 0);
  });

  it("if/else → both blocks captured", async () => {
    const [s] = await bodyOf(`pure flow f() -> Int { if c { return 1 } else { return 2 } }`);
    assert.equal(s.body.length, 1);
    assert.equal(s.body[0].kind, "return");
    assert.equal(s.elseBody.length, 1);
    assert.equal(s.elseBody[0].kind, "return");
  });

  it("else block with multiple statements", async () => {
    const [s] = await bodyOf(`pure flow f() -> Int { if c { return 1 } else { let x: Int = 2\nreturn x } }`);
    assert.equal(s.elseBody.length, 2);
    assert.deepEqual(s.elseBody.map((e) => e.kind), ["let", "return"]);
  });

  it("if WITHOUT else does not consume a following statement", async () => {
    const stmts = await bodyOf(`pure flow f() -> Int { if c { return 1 }\nreturn 0 }`);
    assert.deepEqual(stmts.map((s) => s.kind), ["if", "return"]);
    assert.equal(stmts[0].elseBody.length, 0);
  });

  it("nested if/else inside an if body", async () => {
    const [s] = await bodyOf(`pure flow f() -> Int { if a { if b { return 1 } else { return 2 } } }`);
    assert.equal(s.kind, "if");
    assert.equal(s.body.length, 1);
    const inner = s.body[0];
    assert.equal(inner.kind, "if");
    assert.equal(inner.body.length, 1);
    assert.equal(inner.elseBody.length, 1);
  });
});
