/**
 * Self-hosted GIR body emitter (gir-emitter.spore, M-B body section) — execution tests.
 *
 * Lowers the parser's full Stmt/Expr body AST into a nested GIR tree:
 *   emitBodyGIR(body) -> Array<GIRStmt>, each GIRStmt carrying lowered GIRExpr operands.
 * Exercises the merged module (real lowerExpr wired into lowerStmt).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseProgram, executeFlow } from "../dist/index.js";

const __dir = dirname(fileURLToPath(import.meta.url));
const GIR_LLN = join(__dir, "..", "src", "self-hosted", "gir-emitter.spore");
const program = parseProgram(readFileSync(GIR_LLN, "utf8"), "gir-emitter.spore");

const vStr = (s) => ({ __tag: "string", value: String(s) });
const vList = (items) => ({ __tag: "list", items });
function vRecord(obj) {
  const fields = new Map();
  for (const [k, v] of Object.entries(obj)) fields.set(k, v);
  return { __tag: "record", fields };
}

// AST builders (parser shapes)
const expr = (kind, value = "", litType = "", children = []) =>
  vRecord({ kind: vStr(kind), value: vStr(value), litType: vStr(litType), children: vList(children) });
const stmt = ({ kind, name = "", typeName = "", expr: e = [], body = [], elseBody = [] }) =>
  vRecord({ kind: vStr(kind), name: vStr(name), typeName: vStr(typeName), expr: vList(e), body: vList(body), elseBody: vList(elseBody) });

// GIR readers
function readGExpr(node) {
  const x = node.value ?? node;
  return {
    op: x.fields.get("op").value,
    ty: x.fields.get("ty").value,
    value: x.fields.get("value").value,
    kids: x.fields.get("kids").items.map(readGExpr),
  };
}
function readGStmt(node) {
  const x = node.value ?? node;
  return {
    op: x.fields.get("op").value,
    name: x.fields.get("name").value,
    expr: x.fields.get("expr").items.map(readGExpr),
    body: x.fields.get("body").items.map(readGStmt),
    elseBody: x.fields.get("elseBody").items.map(readGStmt),
  };
}

async function emit(stmts) {
  const r = await executeFlow(
    "emitBodyGIR", new Map([["stmts", vList(stmts)]]), program.ast, program.flows,
    undefined, undefined, { pureFastPath: false }, undefined, undefined,
  );
  const rec = r.value ?? r;
  return rec.items.map(readGStmt);
}

describe("gir-emitter.spore (body GIR) — parses clean", () => {
  it("has zero parse errors", () => {
    const errs = program.diagnostics.filter((d) => d.severity === "error");
    assert.equal(errs.length, 0, errs.map((e) => e.message).join(", "));
  });
});

// ── FLOW TABLE: parse real source via lexer.spore + parser.spore, feed parseFlows'
//    output straight into buildFlowTable, read back the FlowEntry records. ──
const SH_DIR = join(__dir, "..", "src", "self-hosted");
const lexer = parseProgram(readFileSync(join(SH_DIR, "lexer.spore"), "utf8"), "lexer.spore");
const parser = parseProgram(readFileSync(join(SH_DIR, "parser.spore"), "utf8"), "parser.spore");

async function flowsFrom(source) {
  const lexRes = await executeFlow("tokenize", new Map([["source", vStr(source)]]), lexer.ast);
  let toks = lexRes.value ?? lexRes;
  if (toks.__tag === "ok") toks = toks.value;
  const parseRes = await executeFlow("parseFlows", new Map([["tokens", toks]]), parser.ast);
  return (parseRes.value ?? parseRes).fields.get("flows");
}

// buildFlowTable(flows) -> Array<FlowEntry { name, params: Array<String>, body: Array<GIRStmt> }>
async function flowTable(source) {
  const flows = await flowsFrom(source);
  const res = await executeFlow("buildFlowTable", new Map([["flows", flows]]), program.ast);
  const tbl = res.value ?? res;
  return tbl.items.map((node) => {
    const e = node.value ?? node;
    return {
      name: e.fields.get("name").value,
      params: e.fields.get("params").items.map((p) => (p.value ?? p)),
      body: e.fields.get("body").items.map(readGStmt),
    };
  });
}

describe("gir-emitter.spore — buildFlowTable (cross-flow table for the runtime)", () => {
  it("a single flow builds a one-entry table with name, ordered params, and a lowered body", async () => {
    const table = await flowTable(`pure flow double(x: Int) -> Int { return x + x }`);
    assert.equal(table.length, 1);
    const [e] = table;
    assert.equal(e.name, "double");
    assert.deepEqual(e.params, ["x"]);
    assert.ok(e.body.length > 0, "body should be a non-empty GIR list");
    assert.equal(e.body[0].op, "ret");
  });

  it("a two-flow source builds a two-entry table with correct names and param lists", async () => {
    const table = await flowTable(
      `pure flow add(a: Int, b: Int) -> Int { return a + b }\npure flow neg(x: Int) -> Int { return -x }`,
    );
    assert.equal(table.length, 2);
    assert.deepEqual(table.map((e) => e.name), ["add", "neg"]);
    assert.deepEqual(table[0].params, ["a", "b"]);
    assert.deepEqual(table[1].params, ["x"]);
    assert.equal(table[0].body[0].op, "ret");
    assert.equal(table[1].body[0].op, "ret");
  });

  it("a no-param flow yields an empty params list", async () => {
    const table = await flowTable(`pure flow answer() -> Int { return 42 }`);
    assert.equal(table.length, 1);
    assert.deepEqual(table[0].params, []);
    assert.equal(table[0].body[0].op, "ret");
  });
});

describe("gir-emitter.spore — expression lowering (real lowerExpr inside statements)", () => {
  it("let with a binary initializer lowers to store + binop with const kids", async () => {
    const [s] = await emit([
      stmt({ kind: "let", name: "x", typeName: "Int", expr: [expr("binary", "+", "", [expr("lit", "1", "Int"), expr("lit", "2", "Int")])] }),
    ]);
    assert.equal(s.op, "store");
    assert.equal(s.name, "x");
    assert.equal(s.expr[0].op, "binop");
    assert.equal(s.expr[0].value, "add");
    assert.equal(s.expr[0].ty, "Int");
    assert.deepEqual(s.expr[0].kids.map((k) => k.op), ["const", "const"]);
  });

  it("comparison lowers to a Bool binop; call lowers with args", async () => {
    const [cmp] = await emit([stmt({ kind: "return", expr: [expr("binary", "<", "", [expr("name", "a"), expr("name", "b")])] })]);
    assert.equal(cmp.op, "ret");
    assert.equal(cmp.expr[0].value, "lt");
    assert.equal(cmp.expr[0].ty, "Bool");

    const [call] = await emit([stmt({ kind: "exprStmt", expr: [expr("call", "f", "", [expr("name", "a"), expr("lit", "2", "Int")])] })]);
    assert.equal(call.expr[0].op, "call");
    assert.equal(call.expr[0].value, "f");
    assert.equal(call.expr[0].kids.length, 2);
  });

  it("unary neg over a literal lowers to unop with one lowered kid", async () => {
    const [s] = await emit([stmt({ kind: "return", expr: [expr("unary", "neg", "", [expr("lit", "5", "Int")])] })]);
    assert.equal(s.op, "ret");
    assert.equal(s.expr[0].op, "unop");
    assert.equal(s.expr[0].value, "neg");
    assert.equal(s.expr[0].kids.length, 1);
    assert.equal(s.expr[0].kids[0].op, "const");
    assert.equal(s.expr[0].kids[0].value, "5");
  });

  it("unary not over a comparison lowers to unop wrapping a Bool binop", async () => {
    const [s] = await emit([
      stmt({ kind: "return", expr: [expr("unary", "not", "", [expr("binary", "==", "", [expr("name", "a"), expr("name", "b")])])] }),
    ]);
    assert.equal(s.expr[0].op, "unop");
    assert.equal(s.expr[0].value, "not");
    assert.equal(s.expr[0].kids.length, 1);
    assert.equal(s.expr[0].kids[0].op, "binop");
    assert.equal(s.expr[0].kids[0].value, "eq");
    assert.equal(s.expr[0].kids[0].ty, "Bool");
  });
});

describe("gir-emitter.spore — statement lowering", () => {
  it("let/mut/assign → store, return → ret, exprStmt → eval", async () => {
    const out = await emit([
      stmt({ kind: "let", name: "a", typeName: "Int", expr: [expr("lit", "1", "Int")] }),
      stmt({ kind: "mut", name: "b", typeName: "Int", expr: [expr("lit", "2", "Int")] }),
      stmt({ kind: "assign", name: "a", expr: [expr("name", "b")] }),
      stmt({ kind: "exprStmt", expr: [expr("call", "log", "", [])] }),
      stmt({ kind: "return", expr: [expr("name", "a")] }),
    ]);
    assert.deepEqual(out.map((s) => s.op), ["store", "store", "store", "eval", "ret"]);
    assert.deepEqual([out[0].name, out[1].name, out[2].name], ["a", "b", "a"]);
  });

  it("return with no value → ret with empty expr", async () => {
    const [s] = await emit([stmt({ kind: "return", expr: [] })]);
    assert.equal(s.op, "ret");
    assert.equal(s.expr.length, 0);
  });

  it("if → branch with lowered condition and nested body", async () => {
    const [s] = await emit([
      stmt({ kind: "if", expr: [expr("binary", "<", "", [expr("name", "n"), expr("lit", "2", "Int")])],
        body: [stmt({ kind: "return", expr: [expr("name", "n")] })] }),
    ]);
    assert.equal(s.op, "branch");
    assert.equal(s.expr[0].op, "binop");
    assert.equal(s.expr[0].value, "lt");
    assert.equal(s.body.length, 1);
    assert.equal(s.body[0].op, "ret");
    assert.equal(s.elseBody.length, 0);
  });

  it("if with a non-empty elseBody → branch carrying both then-block and else-block", async () => {
    const [s] = await emit([
      stmt({ kind: "if",
        expr: [expr("name", "c")],
        body: [stmt({ kind: "return", expr: [expr("lit", "1", "Int")] })],
        elseBody: [stmt({ kind: "return", expr: [expr("lit", "2", "Int")] })] }),
    ]);
    assert.equal(s.op, "branch");
    assert.equal(s.body.length, 1);
    assert.equal(s.body[0].op, "ret");
    assert.equal(s.body[0].expr[0].value, "1");
    assert.equal(s.elseBody.length, 1);
    assert.equal(s.elseBody[0].op, "ret");
    assert.equal(s.elseBody[0].expr[0].value, "2");
  });

  it("if with empty elseBody → branch with elseBody length 0", async () => {
    const [s] = await emit([
      stmt({ kind: "if", expr: [expr("name", "c")], body: [stmt({ kind: "return", expr: [] })], elseBody: [] }),
    ]);
    assert.equal(s.op, "branch");
    assert.equal(s.elseBody.length, 0);
  });

  it("while → loop with nested body", async () => {
    const [s] = await emit([
      stmt({ kind: "while", expr: [expr("name", "go")], body: [stmt({ kind: "assign", name: "i", expr: [expr("name", "j")] })] }),
    ]);
    assert.equal(s.op, "loop");
    assert.equal(s.body[0].op, "store");
  });

  it("empty body → empty GIR list", async () => {
    assert.deepEqual(await emit([]), []);
  });
});
