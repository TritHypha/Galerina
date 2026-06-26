/**
 * Self-hosted GIR emitter (gir-emitter.spore) — execution tests.
 *
 * Exercises the Stage B GIR emitter by executing the .spore flows through the
 * production interpreter. GIR = Governed Intermediate Representation, the form
 * between AST and backend lowering. Each flow contributes TWO GIR nodes:
 *   - a "flowDecl" metadata node (qualifier/returnType/effect/param counts)
 *   - an "expr" node lowering the flow's return expression to a GIR op:
 *       literal → "const" (resultType = litType)
 *       param   → "load"  (resultType = litType)
 *       arith   → "add"   (resultType = "Int")
 *       compare → "cmp"   (resultType = "Bool")
 *       other   → "unknown" (resultType = "Unknown")
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

// ── value-model builders (interpreter takes tagged values / Maps) ──
const vStr = (s) => ({ __tag: "string", value: String(s) });
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
const flow = ({ name, kind = "pure", returnType, effects = [], params = [], returnExpr }) =>
  vRecord({
    name: vStr(name),
    kind: vStr(kind),
    returnType: vStr(returnType),
    effects: vList(effects),
    params: vList(params),
    returnExpr,
  });

async function emit(flows) {
  const args = new Map([["flows", vList(flows)]]);
  const r = await executeFlow(
    "emitGIRModule", args, program.ast, program.flows,
    undefined, undefined, { pureFastPath: false }, undefined, undefined,
  );
  const rec = r.value ?? r;
  const nodes = rec.fields.get("nodes").items.map((n) => {
    const x = n.value ?? n;
    return {
      kind: x.fields.get("kind").value,
      flowName: x.fields.get("flowName").value,
      qualifier: x.fields.get("qualifier").value,
      returnType: x.fields.get("returnType").value,
      effectCount: x.fields.get("effectCount").value,
      paramCount: x.fields.get("paramCount").value,
      isPure: x.fields.get("isPure").value,
      isEffectFree: x.fields.get("isEffectFree").value,
    };
  });
  const exprNodes = rec.fields.get("exprNodes").items.map((n) => {
    const x = n.value ?? n;
    return {
      kind: x.fields.get("kind").value,
      flowName: x.fields.get("flowName").value,
      exprKind: x.fields.get("exprKind").value,
      op: x.fields.get("op").value,
      resultType: x.fields.get("resultType").value,
      leftType: x.fields.get("leftType").value,
      rightType: x.fields.get("rightType").value,
    };
  });
  return {
    flowCount: rec.fields.get("flowCount").value,
    pureCount: rec.fields.get("pureCount").value,
    governedCount: rec.fields.get("governedCount").value,
    nodes,
    exprNodes,
  };
}

const exprFor = (exprNodes, flowName) => exprNodes.find((e) => e.flowName === flowName);
const nodeFor = (nodes, flowName) => nodes.find((n) => n.flowName === flowName);

describe("gir-emitter.spore — parses clean", () => {
  it("has zero parse errors", () => {
    const errors = program.diagnostics.filter((d) => d.severity === "error");
    assert.equal(errors.length, 0, errors.map((e) => e.message).join(", "));
  });
});

describe("gir-emitter.spore — expression GIR ops", () => {
  it("literal → op 'const', resultType carries litType", async () => {
    const { exprNodes } = await emit([
      flow({ name: "f", returnType: "Int", returnExpr: retExpr("literal", "Int") }),
    ]);
    const e = exprFor(exprNodes, "f");
    assert.equal(e.op, "const");
    assert.equal(e.resultType, "Int");
    assert.equal(e.exprKind, "literal");
  });

  it("literal carries a String value type too", async () => {
    const { exprNodes } = await emit([
      flow({ name: "f", returnType: "String", returnExpr: retExpr("literal", "String") }),
    ]);
    const e = exprFor(exprNodes, "f");
    assert.equal(e.op, "const");
    assert.equal(e.resultType, "String");
  });

  it("param → op 'load', resultType carries litType", async () => {
    const { exprNodes } = await emit([
      flow({ name: "f", returnType: "Int", params: [param("x", "Int")], returnExpr: retExpr("param", "Int") }),
    ]);
    const e = exprFor(exprNodes, "f");
    assert.equal(e.op, "load");
    assert.equal(e.resultType, "Int");
  });

  it("arith → op 'add', resultType Int, carries operand types", async () => {
    const { exprNodes } = await emit([
      flow({ name: "f", returnType: "Int", returnExpr: retExpr("arith", "", "Int", "Int") }),
    ]);
    const e = exprFor(exprNodes, "f");
    assert.equal(e.op, "add");
    assert.equal(e.resultType, "Int");
    assert.equal(e.leftType, "Int");
    assert.equal(e.rightType, "Int");
  });

  it("compare → op 'cmp', resultType Bool", async () => {
    const { exprNodes } = await emit([
      flow({ name: "f", returnType: "Bool", returnExpr: retExpr("compare") }),
    ]);
    const e = exprFor(exprNodes, "f");
    assert.equal(e.op, "cmp");
    assert.equal(e.resultType, "Bool");
  });

  it("unrecognised expr kind → op 'unknown', resultType Unknown", async () => {
    const { exprNodes } = await emit([
      flow({ name: "f", returnType: "Int", returnExpr: retExpr("ternary") }),
    ]);
    const e = exprFor(exprNodes, "f");
    assert.equal(e.op, "unknown");
    assert.equal(e.resultType, "Unknown");
  });
});

describe("gir-emitter.spore — flow-decl GIR node", () => {
  it("pure effect-free flow → flowDecl node with isPure/isEffectFree true", async () => {
    const { nodes } = await emit([
      flow({ name: "f", returnType: "Int", returnExpr: retExpr("literal", "Int") }),
    ]);
    const n = nodeFor(nodes, "f");
    assert.equal(n.kind, "flowDecl");
    assert.equal(n.qualifier, "pure");
    assert.equal(n.returnType, "Int");
    assert.equal(n.isPure, true);
    assert.equal(n.isEffectFree, true);
    assert.equal(n.effectCount, 0);
    assert.equal(n.paramCount, 0);
  });

  it("governed flow with effects + params → counts and flags reflect them", async () => {
    const { nodes } = await emit([
      flow({
        name: "g", kind: "flow", returnType: "Int",
        effects: [vStr("io"), vStr("net")],
        params: [param("a", "Int")],
        returnExpr: retExpr("arith", "", "Int", "Int"),
      }),
    ]);
    const n = nodeFor(nodes, "g");
    assert.equal(n.qualifier, "flow");
    assert.equal(n.isPure, false);
    assert.equal(n.isEffectFree, false);
    assert.equal(n.effectCount, 2);
    assert.equal(n.paramCount, 1);
  });
});

describe("gir-emitter.spore — module emission", () => {
  it("each flow contributes BOTH a flowDecl node and an expr node", async () => {
    const { nodes, exprNodes, flowCount } = await emit([
      flow({ name: "a", returnType: "Int", returnExpr: retExpr("literal", "Int") }),
      flow({ name: "b", returnType: "Bool", returnExpr: retExpr("compare") }),
    ]);
    assert.equal(flowCount, 2);
    assert.equal(nodes.length, 2);
    assert.equal(exprNodes.length, 2);
    assert.equal(exprFor(exprNodes, "a").op, "const");
    assert.equal(exprFor(exprNodes, "b").op, "cmp");
  });

  it("module counts: flowCount/pureCount/governedCount across a mixed module", async () => {
    const { flowCount, pureCount, governedCount } = await emit([
      flow({ name: "p1", returnType: "Int", returnExpr: retExpr("literal", "Int") }),
      flow({ name: "p2", returnType: "Bool", returnExpr: retExpr("compare") }),
      flow({ name: "g1", kind: "flow", returnType: "Int", effects: [vStr("io")], returnExpr: retExpr("arith", "", "Int", "Int") }),
    ]);
    assert.equal(flowCount, 3);
    assert.equal(pureCount, 2);
    assert.equal(governedCount, 1);
  });

  it("multi-flow: every expression kind lowers in one module", async () => {
    const { exprNodes } = await emit([
      flow({ name: "lit", returnType: "Int", returnExpr: retExpr("literal", "Int") }),
      flow({ name: "par", returnType: "Int", params: [param("x", "Int")], returnExpr: retExpr("param", "Int") }),
      flow({ name: "ari", returnType: "Int", returnExpr: retExpr("arith", "", "Int", "Int") }),
      flow({ name: "cmp", returnType: "Bool", returnExpr: retExpr("compare") }),
    ]);
    assert.equal(exprFor(exprNodes, "lit").op, "const");
    assert.equal(exprFor(exprNodes, "par").op, "load");
    assert.equal(exprFor(exprNodes, "ari").op, "add");
    assert.equal(exprFor(exprNodes, "cmp").op, "cmp");
  });

  it("empty flow list → no nodes, all counts 0", async () => {
    const { flowCount, pureCount, governedCount, nodes, exprNodes } = await emit([]);
    assert.equal(flowCount, 0);
    assert.equal(pureCount, 0);
    assert.equal(governedCount, 0);
    assert.equal(nodes.length, 0);
    assert.equal(exprNodes.length, 0);
  });
});
