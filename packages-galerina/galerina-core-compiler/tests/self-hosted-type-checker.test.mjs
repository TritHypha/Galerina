/**
 * Self-hosted type checker (type-checker.spore) — execution tests.
 *
 * Exercises the Stage B type checks by executing the .spore flows through the
 * production interpreter and asserting their diagnostics. Codes match the
 * Stage A compiler's canonical meanings:
 *   - SPORE-TYPE-001 (UnknownType)            — return/param type not a known type
 *   - SPORE-TYPE-002 (TypeMismatch)           — return expr type != declared return type
 *   - SPORE-TYPE-004 (InvalidBinaryOperation) — arithmetic operand not Int
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseProgram, executeFlow } from "../dist/index.js";

const __dir = dirname(fileURLToPath(import.meta.url));
const TC_LLN = join(__dir, "..", "src", "self-hosted", "type-checker.spore");

const program = parseProgram(readFileSync(TC_LLN, "utf8"), "type-checker.spore");

// ── value-model builders (interpreter takes tagged values / Maps) ──
const vStr = (s) => ({ __tag: "string", value: String(s) });
const vInt = (n) => ({ __tag: "int", value: n });
const vList = (items) => ({ __tag: "list", items });

function vRecord(obj) {
  const fields = new Map();
  for (const [k, v] of Object.entries(obj)) fields.set(k, v);
  return { __tag: "record", fields };
}

const param = (name, typeName) => vRecord({ name: vStr(name), typeName: vStr(typeName) });
const retExpr = (kind, litType = "", leftType = "", rightType = "") =>
  vRecord({
    kind: vStr(kind),
    litType: vStr(litType),
    leftType: vStr(leftType),
    rightType: vStr(rightType),
  });
const flow = ({ name, returnType, params = [], returnExpr }) =>
  vRecord({
    name: vStr(name),
    returnType: vStr(returnType),
    params: vList(params),
    returnExpr,
  });

async function check(flows) {
  const args = new Map([["flows", vList(flows)]]);
  const r = await executeFlow(
    "checkFlows", args, program.ast, program.flows,
    undefined, undefined, { pureFastPath: false }, undefined, undefined,
  );
  const rec = r.value ?? r;
  const diags = rec.fields.get("diagnostics").items.map((d) => {
    const x = d.value ?? d;
    return {
      code: x.fields.get("code").value,
      flowName: x.fields.get("flowName").value,
    };
  });
  return { flowCount: rec.fields.get("flowCount").value, diags };
}

const codesFor = (diags, flowName) =>
  diags.filter((d) => d.flowName === flowName).map((d) => d.code).sort();

describe("type-checker.spore — parses clean", () => {
  it("has zero parse errors", () => {
    const errors = program.diagnostics.filter((d) => d.severity === "error");
    assert.equal(errors.length, 0, errors.map((e) => e.message).join(", "));
  });
});

describe("type-checker.spore — SPORE-TYPE-001 UnknownType", () => {
  it("unknown return type → SPORE-TYPE-001", async () => {
    const { diags } = await check([
      flow({ name: "f", returnType: "Widget", returnExpr: retExpr("literal", "Int") }),
    ]);
    assert.deepEqual(codesFor(diags, "f"), ["SPORE-TYPE-001"]);
  });

  it("unknown parameter type → SPORE-TYPE-001", async () => {
    const { diags } = await check([
      flow({ name: "f", returnType: "Int", params: [param("x", "Widget")], returnExpr: retExpr("param", "Int") }),
    ]);
    assert.deepEqual(codesFor(diags, "f"), ["SPORE-TYPE-001"]);
  });

  it("each known type is accepted (Int/Bool/String/Array)", async () => {
    for (const t of ["Int", "Bool", "String", "Array"]) {
      const { diags } = await check([
        flow({ name: "f", returnType: t, returnExpr: retExpr("literal", t) }),
      ]);
      assert.deepEqual(codesFor(diags, "f"), [], `type ${t} should be known`);
    }
  });
});

describe("type-checker.spore — SPORE-TYPE-002 TypeMismatch", () => {
  it("declared Int but Bool literal returned → SPORE-TYPE-002", async () => {
    const { diags } = await check([
      flow({ name: "f", returnType: "Int", returnExpr: retExpr("literal", "Bool") }),
    ]);
    assert.deepEqual(codesFor(diags, "f"), ["SPORE-TYPE-002"]);
  });

  it("compare expr returns Bool — matching Bool declaration passes", async () => {
    const { diags } = await check([
      flow({ name: "f", returnType: "Bool", returnExpr: retExpr("compare") }),
    ]);
    assert.deepEqual(codesFor(diags, "f"), []);
  });

  it("compare expr (Bool) against Int declaration → SPORE-TYPE-002", async () => {
    const { diags } = await check([
      flow({ name: "f", returnType: "Int", returnExpr: retExpr("compare") }),
    ]);
    assert.deepEqual(codesFor(diags, "f"), ["SPORE-TYPE-002"]);
  });
});

describe("type-checker.spore — SPORE-TYPE-004 InvalidBinaryOperation", () => {
  it("arith with a String operand → SPORE-TYPE-004", async () => {
    const { diags } = await check([
      flow({ name: "f", returnType: "Int", returnExpr: retExpr("arith", "", "String", "Int") }),
    ]);
    assert.deepEqual(codesFor(diags, "f"), ["SPORE-TYPE-004"]);
  });

  it("arith Int + Int returning Int passes", async () => {
    const { diags } = await check([
      flow({ name: "add", returnType: "Int", params: [param("a", "Int"), param("b", "Int")], returnExpr: retExpr("arith", "", "Int", "Int") }),
    ]);
    assert.deepEqual(codesFor(diags, "add"), []);
  });

  it("arith error suppresses the 002 mismatch (only 004 reported)", async () => {
    // inferred is ERROR, so the 002 check is guarded off — exactly one 004.
    const { diags } = await check([
      flow({ name: "f", returnType: "Bool", returnExpr: retExpr("arith", "", "String", "Int") }),
    ]);
    assert.deepEqual(codesFor(diags, "f"), ["SPORE-TYPE-004"]);
  });
});

describe("type-checker.spore — combined & aggregate", () => {
  it("unknown return type + unknown param both fire (two 001s)", async () => {
    const { diags } = await check([
      flow({ name: "f", returnType: "Widget", params: [param("x", "Gadget")], returnExpr: retExpr("literal", "Int") }),
    ]);
    assert.deepEqual(codesFor(diags, "f"), ["SPORE-TYPE-001", "SPORE-TYPE-001"]);
  });

  it("flowCount counts every flow; diagnostics aggregate across flows", async () => {
    const { flowCount, diags } = await check([
      flow({ name: "ok", returnType: "Int", returnExpr: retExpr("literal", "Int") }),
      flow({ name: "bad", returnType: "Int", returnExpr: retExpr("literal", "Bool") }),
    ]);
    assert.equal(flowCount, 2);
    assert.deepEqual(codesFor(diags, "ok"), []);
    assert.deepEqual(codesFor(diags, "bad"), ["SPORE-TYPE-002"]);
  });

  it("empty flow list → no diagnostics, flowCount 0", async () => {
    const { flowCount, diags } = await check([]);
    assert.equal(flowCount, 0);
    assert.equal(diags.length, 0);
  });
});

// ── checkFlowBodies (Milestone M-B) ──────────────────────────────
// Walks each flow's full statement BODY AST (let/mut bindings + nested
// if/while), emitting SPORE-TYPE-001 (unknown declared type) and SPORE-TYPE-002
// (declared type ≠ literal initializer type). Builds Stmt/Expr records by hand.

const expr = (kind, value = "", litType = "", children = []) =>
  vRecord({
    kind: vStr(kind),
    value: vStr(value),
    litType: vStr(litType),
    children: vList(children),
  });

const stmt = ({ kind, name = "", typeName = "", expr: e = [], body = [], elseBody = [] }) =>
  vRecord({
    kind: vStr(kind),
    name: vStr(name),
    typeName: vStr(typeName),
    expr: vList(e),
    body: vList(body),
    elseBody: vList(elseBody),
  });

const bodyFlow = ({ name, body = [] }) =>
  vRecord({ name: vStr(name), body: vList(body) });

async function checkBodies(flows) {
  const args = new Map([["flows", vList(flows)]]);
  const r = await executeFlow(
    "checkFlowBodies", args, program.ast, program.flows,
    undefined, undefined, { pureFastPath: false }, undefined, undefined,
  );
  const rec = r.value ?? r;
  const diags = rec.fields.get("diagnostics").items.map((d) => {
    const x = d.value ?? d;
    return {
      code: x.fields.get("code").value,
      flowName: x.fields.get("flowName").value,
    };
  });
  return { flowCount: rec.fields.get("flowCount").value, diags };
}

describe("type-checker.spore — checkFlowBodies (M-B body AST)", () => {
  it("let x: Int = \"s\" → exactly SPORE-TYPE-002", async () => {
    const { diags } = await checkBodies([
      bodyFlow({ name: "f", body: [
        stmt({ kind: "let", name: "x", typeName: "Int", expr: [expr("lit", "s", "String")] }),
      ] }),
    ]);
    assert.deepEqual(codesFor(diags, "f"), ["SPORE-TYPE-002"]);
  });

  it("let x: Int = 1 → no diagnostic", async () => {
    const { diags } = await checkBodies([
      bodyFlow({ name: "f", body: [
        stmt({ kind: "let", name: "x", typeName: "Int", expr: [expr("lit", "1", "Int")] }),
      ] }),
    ]);
    assert.deepEqual(codesFor(diags, "f"), []);
  });

  it("mut x: Int = 1 → no diagnostic (mut handled like let)", async () => {
    const { diags } = await checkBodies([
      bodyFlow({ name: "f", body: [
        stmt({ kind: "mut", name: "x", typeName: "Int", expr: [expr("lit", "1", "Int")] }),
      ] }),
    ]);
    assert.deepEqual(codesFor(diags, "f"), []);
  });

  it("unknown declared type: let w: Widget = 1 → SPORE-TYPE-001", async () => {
    const { diags } = await checkBodies([
      bodyFlow({ name: "f", body: [
        stmt({ kind: "let", name: "w", typeName: "Widget", expr: [expr("lit", "1", "Int")] }),
      ] }),
    ]);
    assert.deepEqual(codesFor(diags, "f"), ["SPORE-TYPE-001"]);
  });

  it("mismatch nested inside an if body is caught (recursion)", async () => {
    const { diags } = await checkBodies([
      bodyFlow({ name: "f", body: [
        stmt({ kind: "if", expr: [expr("name", "cond")], body: [
          stmt({ kind: "let", name: "y", typeName: "Int", expr: [expr("lit", "t", "String")] }),
        ] }),
      ] }),
    ]);
    assert.deepEqual(codesFor(diags, "f"), ["SPORE-TYPE-002"]);
  });

  it("mismatch nested inside a while body is caught (recursion)", async () => {
    const { diags } = await checkBodies([
      bodyFlow({ name: "f", body: [
        stmt({ kind: "while", expr: [expr("name", "cond")], body: [
          stmt({ kind: "mut", name: "z", typeName: "Bool", expr: [expr("lit", "3", "Int")] }),
        ] }),
      ] }),
    ]);
    assert.deepEqual(codesFor(diags, "f"), ["SPORE-TYPE-002"]);
  });

  it("empty body → no diagnostics", async () => {
    const { flowCount, diags } = await checkBodies([
      bodyFlow({ name: "f", body: [] }),
    ]);
    assert.equal(flowCount, 1);
    assert.deepEqual(codesFor(diags, "f"), []);
  });

  it("assign/return/exprStmt are left alone this milestone", async () => {
    const { diags } = await checkBodies([
      bodyFlow({ name: "f", body: [
        stmt({ kind: "assign", name: "x", expr: [expr("lit", "s", "String")] }),
        stmt({ kind: "return", expr: [expr("lit", "s", "String")] }),
        stmt({ kind: "exprStmt", expr: [expr("call", "doThing")] }),
      ] }),
    ]);
    assert.deepEqual(codesFor(diags, "f"), []);
  });

  it("let with no declared type is skipped (typeName empty)", async () => {
    const { diags } = await checkBodies([
      bodyFlow({ name: "f", body: [
        stmt({ kind: "let", name: "x", typeName: "", expr: [expr("lit", "s", "String")] }),
      ] }),
    ]);
    assert.deepEqual(codesFor(diags, "f"), []);
  });

  it("mismatch nested inside an if ELSE branch is caught (else recursion)", async () => {
    const { diags } = await checkBodies([
      bodyFlow({ name: "f", body: [
        stmt({ kind: "if", expr: [expr("name", "cond")], body: [], elseBody: [
          stmt({ kind: "let", name: "x", typeName: "Int", expr: [expr("lit", "s", "String")] }),
        ] }),
      ] }),
    ]);
    assert.deepEqual(codesFor(diags, "f"), ["SPORE-TYPE-002"]);
  });

  it("clean if else branch → no diagnostic", async () => {
    const { diags } = await checkBodies([
      bodyFlow({ name: "f", body: [
        stmt({ kind: "if", expr: [expr("name", "cond")], body: [
          stmt({ kind: "let", name: "a", typeName: "Int", expr: [expr("lit", "1", "Int")] }),
        ], elseBody: [
          stmt({ kind: "let", name: "b", typeName: "Int", expr: [expr("lit", "2", "Int")] }),
        ] }),
      ] }),
    ]);
    assert.deepEqual(codesFor(diags, "f"), []);
  });

  it("bad binding in if THEN branch still caught (regression, else empty)", async () => {
    const { diags } = await checkBodies([
      bodyFlow({ name: "f", body: [
        stmt({ kind: "if", expr: [expr("name", "cond")], body: [
          stmt({ kind: "let", name: "y", typeName: "Int", expr: [expr("lit", "t", "String")] }),
        ], elseBody: [] }),
      ] }),
    ]);
    assert.deepEqual(codesFor(diags, "f"), ["SPORE-TYPE-002"]);
  });
});
