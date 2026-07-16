/**
 * Self-hosted type checker (type-checker.fungi) — execution tests.
 *
 * Exercises the Stage B type checks by executing the .fungi flows through the
 * production interpreter and asserting their diagnostics. Codes match the
 * Stage A compiler's canonical meanings:
 *   - FUNGI-TYPE-001 (UnknownType)            — return/param type not a known type
 *   - FUNGI-TYPE-002 (TypeMismatch)           — let/mut binding: declared type != initializer type (checkFlowBodies)
 *   - FUNGI-TYPE-004 (InvalidBinaryOperation) — arithmetic operand not Int
 *   - FUNGI-TYPE-008 (InvalidReturnType)      — return expr type != declared return type (checkFlows)
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseProgram, executeFlow } from "../dist/index.js";

const __dir = dirname(fileURLToPath(import.meta.url));
const TC_FUNGI = join(__dir, "..", "src", "self-hosted", "type-checker.fungi");

const program = parseProgram(readFileSync(TC_FUNGI, "utf8"), "type-checker.fungi");

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

describe("type-checker.fungi — parses clean", () => {
  it("has zero parse errors", () => {
    const errors = program.diagnostics.filter((d) => d.severity === "error");
    assert.equal(errors.length, 0, errors.map((e) => e.message).join(", "));
  });
});

describe("type-checker.fungi — FUNGI-TYPE-001 UnknownType", () => {
  it("unknown return type → FUNGI-TYPE-001", async () => {
    const { diags } = await check([
      flow({ name: "f", returnType: "Widget", returnExpr: retExpr("literal", "Int") }),
    ]);
    assert.deepEqual(codesFor(diags, "f"), ["FUNGI-TYPE-001"]);
  });

  it("unknown parameter type → FUNGI-TYPE-001", async () => {
    const { diags } = await check([
      flow({ name: "f", returnType: "Int", params: [param("x", "Widget")], returnExpr: retExpr("param", "Int") }),
    ]);
    assert.deepEqual(codesFor(diags, "f"), ["FUNGI-TYPE-001"]);
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

describe("type-checker.fungi — FUNGI-TYPE-008 InvalidReturnType (return-type mismatch; Stage-A canonical)", () => {
  it("declared Int but Bool literal returned → FUNGI-TYPE-008", async () => {
    const { diags } = await check([
      flow({ name: "f", returnType: "Int", returnExpr: retExpr("literal", "Bool") }),
    ]);
    assert.deepEqual(codesFor(diags, "f"), ["FUNGI-TYPE-008"]);
  });

  it("compare expr returns Bool — matching Bool declaration passes", async () => {
    const { diags } = await check([
      flow({ name: "f", returnType: "Bool", returnExpr: retExpr("compare") }),
    ]);
    assert.deepEqual(codesFor(diags, "f"), []);
  });

  it("compare expr (Bool) against Int declaration → FUNGI-TYPE-008", async () => {
    const { diags } = await check([
      flow({ name: "f", returnType: "Int", returnExpr: retExpr("compare") }),
    ]);
    assert.deepEqual(codesFor(diags, "f"), ["FUNGI-TYPE-008"]);
  });
});

describe("type-checker.fungi — FUNGI-TYPE-004 InvalidBinaryOperation", () => {
  it("arith with a String operand → FUNGI-TYPE-004", async () => {
    const { diags } = await check([
      flow({ name: "f", returnType: "Int", returnExpr: retExpr("arith", "", "String", "Int") }),
    ]);
    assert.deepEqual(codesFor(diags, "f"), ["FUNGI-TYPE-004"]);
  });

  it("arith Int + Int returning Int passes", async () => {
    const { diags } = await check([
      flow({ name: "add", returnType: "Int", params: [param("a", "Int"), param("b", "Int")], returnExpr: retExpr("arith", "", "Int", "Int") }),
    ]);
    assert.deepEqual(codesFor(diags, "add"), []);
  });

  it("arith error suppresses the 008 mismatch (only 004 reported)", async () => {
    // inferred is ERROR, so the 008 return-type check is guarded off — exactly one 004.
    const { diags } = await check([
      flow({ name: "f", returnType: "Bool", returnExpr: retExpr("arith", "", "String", "Int") }),
    ]);
    assert.deepEqual(codesFor(diags, "f"), ["FUNGI-TYPE-004"]);
  });
});

describe("type-checker.fungi — combined & aggregate", () => {
  it("unknown return type + unknown param both fire (two 001s)", async () => {
    const { diags } = await check([
      flow({ name: "f", returnType: "Widget", params: [param("x", "Gadget")], returnExpr: retExpr("literal", "Int") }),
    ]);
    assert.deepEqual(codesFor(diags, "f"), ["FUNGI-TYPE-001", "FUNGI-TYPE-001"]);
  });

  it("flowCount counts every flow; diagnostics aggregate across flows", async () => {
    const { flowCount, diags } = await check([
      flow({ name: "ok", returnType: "Int", returnExpr: retExpr("literal", "Int") }),
      flow({ name: "bad", returnType: "Int", returnExpr: retExpr("literal", "Bool") }),
    ]);
    assert.equal(flowCount, 2);
    assert.deepEqual(codesFor(diags, "ok"), []);
    assert.deepEqual(codesFor(diags, "bad"), ["FUNGI-TYPE-008"]);
  });

  it("empty flow list → no diagnostics, flowCount 0", async () => {
    const { flowCount, diags } = await check([]);
    assert.equal(flowCount, 0);
    assert.equal(diags.length, 0);
  });
});

// ── checkFlowBodies (Milestone M-B) ──────────────────────────────
// Walks each flow's full statement BODY AST (let/mut bindings + nested
// if/while), emitting FUNGI-TYPE-001 (unknown declared type) and FUNGI-TYPE-002
// (declared type ≠ literal initializer type). Builds Stmt/Expr records by hand.

const expr = (kind, value = "", litType = "", children = []) =>
  vRecord({
    kind: vStr(kind),
    value: vStr(value),
    litType: vStr(litType),
    children: vList(children),
  });

// A match arm carries just its pattern text for exhaustiveness/reachability (`_`/`else` = wildcard).
const arm = (pattern) => vRecord({ pattern: vStr(pattern) });
// A list-literal initializer + its element literals (for the Array<T> collection-element checks).
const litEl = (litType) => expr("lit", "", litType);
const listOf = (...litTypes) => expr("listLiteral", "", "", litTypes.map(litEl));
// Parse a declared type string into { base, args } the way Stage-A `parseTypeString` does — split the
// top-level type arguments respecting BOTH `<>` and `[]` nesting (so Tensor<Float32, [1,128]> is 2 args,
// not 3). This stands in for the parser lane; the twin mirrors the DECISION over base + args.
function parseGeneric(typeName) {
  const lt = typeName.indexOf("<");
  if (lt < 0) return { base: typeName, args: [] };
  const base = typeName.slice(0, lt);
  const inner = typeName.slice(lt + 1, typeName.lastIndexOf(">"));
  const args = []; let depth = 0, cur = "";
  for (const ch of inner) {
    if (ch === "<" || ch === "[") { depth++; cur += ch; }
    else if (ch === ">" || ch === "]") { depth--; cur += ch; }
    else if (ch === "," && depth === 0) { if (cur.trim()) args.push(cur.trim()); cur = ""; }
    else cur += ch;
  }
  if (cur.trim()) args.push(cur.trim());
  return { base, args };
}
const stmt = ({ kind, name = "", typeName = "", expr: e = [], body = [], elseBody = [], arms = [] }) => {
  const { base, args } = parseGeneric(typeName);
  return vRecord({
    kind: vStr(kind),
    name: vStr(name),
    typeName: vStr(typeName),
    // typeBase + typeArgs = the parser-produced generic decomposition (empty args for a non-generic
    // type); the twin's checkGenericBinding checks FUNGI-TYPE-009/001/002/011 over them.
    typeBase: vStr(base),
    typeArgs: vList(args.map(vStr)),
    expr: vList(e),
    body: vList(body),
    elseBody: vList(elseBody),
    // Only read for `kind === "match"` (FUNGI-TYPE-022/023). The arm SET (not a scalar flag) is the
    // faithful mirror of Stage-A `checkMatch`, which derives has-wildcard + reachability from it.
    arms: vList(arms),
  });
};

const bodyFlow = ({ name, params = [], body = [] }) =>
  vRecord({ name: vStr(name), params: vList(params), body: vList(body) });

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

describe("type-checker.fungi — checkFlowBodies (M-B body AST)", () => {
  it("let x: Int = \"s\" → exactly FUNGI-TYPE-002", async () => {
    const { diags } = await checkBodies([
      bodyFlow({ name: "f", body: [
        stmt({ kind: "let", name: "x", typeName: "Int", expr: [expr("lit", "s", "String")] }),
      ] }),
    ]);
    assert.deepEqual(codesFor(diags, "f"), ["FUNGI-TYPE-002"]);
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

  it("unknown declared type: let w: Widget = 1 → FUNGI-TYPE-001", async () => {
    const { diags } = await checkBodies([
      bodyFlow({ name: "f", body: [
        stmt({ kind: "let", name: "w", typeName: "Widget", expr: [expr("lit", "1", "Int")] }),
      ] }),
    ]);
    assert.deepEqual(codesFor(diags, "f"), ["FUNGI-TYPE-001"]);
  });

  it("mismatch nested inside an if body is caught (recursion)", async () => {
    const { diags } = await checkBodies([
      bodyFlow({ name: "f", body: [
        stmt({ kind: "if", expr: [expr("name", "cond")], body: [
          stmt({ kind: "let", name: "y", typeName: "Int", expr: [expr("lit", "t", "String")] }),
        ] }),
      ] }),
    ]);
    assert.deepEqual(codesFor(diags, "f"), ["FUNGI-TYPE-002"]);
  });

  it("mismatch nested inside a while body is caught (recursion)", async () => {
    const { diags } = await checkBodies([
      bodyFlow({ name: "f", body: [
        stmt({ kind: "while", expr: [expr("name", "cond")], body: [
          stmt({ kind: "mut", name: "z", typeName: "Bool", expr: [expr("lit", "3", "Int")] }),
        ] }),
      ] }),
    ]);
    assert.deepEqual(codesFor(diags, "f"), ["FUNGI-TYPE-002"]);
  });

  // FUNGI-TYPE-011 (INVALID_COLLECTION_ELEMENT) + FUNGI-TYPE-001 on the element type — an `Array<T>`
  // binding: Stage-A treats the `Array` base as known, flags an unknown element type T (001), and
  // flags every list-literal element whose type differs from T (011, one per element). All cases
  // verified against `galerina check --strict-types` before landing (Tranche B, RD-0412 §4).
  it("Array<Int> = [Int, Int, Int] → no diagnostic (homogeneous)", async () => {
    const { diags } = await checkBodies([
      bodyFlow({ name: "f", body: [
        stmt({ kind: "let", name: "xs", typeName: "Array<Int>", expr: [listOf("Int", "Int", "Int")] }),
      ] }),
    ]);
    assert.deepEqual(codesFor(diags, "f"), []);
  });

  it("Array<Int> with a String element → exactly FUNGI-TYPE-011", async () => {
    const { diags } = await checkBodies([
      bodyFlow({ name: "f", body: [
        stmt({ kind: "let", name: "xs", typeName: "Array<Int>", expr: [listOf("Int", "String", "Int")] }),
      ] }),
    ]);
    assert.deepEqual(codesFor(diags, "f"), ["FUNGI-TYPE-011"]);
  });

  it("Array<Int> with a Bool element → FUNGI-TYPE-011", async () => {
    const { diags } = await checkBodies([
      bodyFlow({ name: "f", body: [
        stmt({ kind: "let", name: "xs", typeName: "Array<Int>", expr: [listOf("Int", "Bool", "Int")] }),
      ] }),
    ]);
    assert.deepEqual(codesFor(diags, "f"), ["FUNGI-TYPE-011"]);
  });

  it("Array<String> = [Int, Int] → FUNGI-TYPE-011 per element", async () => {
    const { diags } = await checkBodies([
      bodyFlow({ name: "f", body: [
        stmt({ kind: "let", name: "xs", typeName: "Array<String>", expr: [listOf("Int", "Int")] }),
      ] }),
    ]);
    assert.deepEqual(codesFor(diags, "f"), ["FUNGI-TYPE-011", "FUNGI-TYPE-011"]);
  });

  it("Array<Widget> = [Int, Int, Int] → FUNGI-TYPE-001 (element) then 011 per element", async () => {
    const { diags } = await checkBodies([
      bodyFlow({ name: "f", body: [
        stmt({ kind: "let", name: "xs", typeName: "Array<Widget>", expr: [listOf("Int", "Int", "Int")] }),
      ] }),
    ]);
    assert.deepEqual(codesFor(diags, "f"),
      ["FUNGI-TYPE-001", "FUNGI-TYPE-011", "FUNGI-TYPE-011", "FUNGI-TYPE-011"]);
  });

  it("Array<Int> = [] (empty) → no diagnostic", async () => {
    const { diags } = await checkBodies([
      bodyFlow({ name: "f", body: [
        stmt({ kind: "let", name: "xs", typeName: "Array<Int>", expr: [listOf()] }),
      ] }),
    ]);
    assert.deepEqual(codesFor(diags, "f"), []);
  });

  // FUNGI-TYPE-009 (InvalidGenericInstantiation) — a known generic base with the wrong type-argument
  // arity. The twin's binding path is generalized over ALL generics (subsumes the 011 Array case).
  // Emit order verified vs `galerina check --strict-types`: 009 (arity) → 001 (unknown arg) → 002
  // (a literal initializer vs the base type). The clean case emits nothing.
  it("Result<Int> (arity 2, got 1) = 5 → FUNGI-TYPE-009 then 002", async () => {
    const { diags } = await checkBodies([
      bodyFlow({ name: "f", body: [
        stmt({ kind: "let", name: "r", typeName: "Result<Int>", expr: [expr("lit", "5", "Int")] }),
      ] }),
    ]);
    assert.deepEqual(codesFor(diags, "f"), ["FUNGI-TYPE-002", "FUNGI-TYPE-009"]); // codesFor sorts — set, not order
  });

  it("Map<Int, String, Bool> (arity 2, got 3) = 5 → FUNGI-TYPE-009 then 002 (over-arity)", async () => {
    const { diags } = await checkBodies([
      bodyFlow({ name: "f", body: [
        stmt({ kind: "let", name: "m", typeName: "Map<Int, String, Bool>", expr: [expr("lit", "5", "Int")] }),
      ] }),
    ]);
    assert.deepEqual(codesFor(diags, "f"), ["FUNGI-TYPE-002", "FUNGI-TYPE-009"]); // codesFor sorts — set, not order
  });

  it("Vector<Int> (arity 2, got 1) = 5 → FUNGI-TYPE-009 then 002 (non-Array generic)", async () => {
    const { diags } = await checkBodies([
      bodyFlow({ name: "f", body: [
        stmt({ kind: "let", name: "v", typeName: "Vector<Int>", expr: [expr("lit", "5", "Int")] }),
      ] }),
    ]);
    assert.deepEqual(codesFor(diags, "f"), ["FUNGI-TYPE-002", "FUNGI-TYPE-009"]); // codesFor sorts — set, not order
  });

  it("Result<Int, Widget> (arity ok) = 5 → FUNGI-TYPE-001 (unknown arg) then 002", async () => {
    const { diags } = await checkBodies([
      bodyFlow({ name: "f", body: [
        stmt({ kind: "let", name: "r", typeName: "Result<Int, Widget>", expr: [expr("lit", "5", "Int")] }),
      ] }),
    ]);
    assert.deepEqual(codesFor(diags, "f"), ["FUNGI-TYPE-001", "FUNGI-TYPE-002"]);
  });

  it("Result<Int, String> = r (well-formed generic, name init) → no diagnostic", async () => {
    const { diags } = await checkBodies([
      bodyFlow({ name: "f", body: [
        stmt({ kind: "let", name: "x", typeName: "Result<Int, String>", expr: [expr("name", "r")] }),
      ] }),
    ]);
    assert.deepEqual(codesFor(diags, "f"), []);
  });

  // FUNGI-TYPE-022/023 (match arm set) — a `match` must end with a wildcard `_ =>` catch-all
  // (023, MISSING_WILDCARD_ARM), and any arm AFTER a wildcard is unreachable (022,
  // UNREACHABLE_PATTERN). Both verified against Stage-A `galerina check --strict-types`: a
  // wildcard-less match emits 023; a `_` followed by an arm emits 022 on that arm; a wildcard-last
  // match is silent. (FUNGI-TYPE-021 NonExhaustiveMatch is superseded by the mandatory wildcard in
  // Stage-A and has no emit site, so the twin deliberately does not emit it.) (Tranche B, RD-0412 §4.)
  it("match with no wildcard arm → exactly FUNGI-TYPE-023", async () => {
    const { diags } = await checkBodies([
      bodyFlow({ name: "f", body: [
        stmt({ kind: "match", name: "c", arms: [arm("Red"), arm("Green"), arm("Blue")] }),
      ] }),
    ]);
    assert.deepEqual(codesFor(diags, "f"), ["FUNGI-TYPE-023"]);
  });

  it("match with a trailing wildcard arm → no diagnostic (exhaustive, reachable)", async () => {
    const { diags } = await checkBodies([
      bodyFlow({ name: "f", body: [
        stmt({ kind: "match", name: "c", arms: [arm("Red"), arm("Green"), arm("_")] }),
      ] }),
    ]);
    assert.deepEqual(codesFor(diags, "f"), []);
  });

  it("`else` counts as the wildcard → no diagnostic", async () => {
    const { diags } = await checkBodies([
      bodyFlow({ name: "f", body: [
        stmt({ kind: "match", name: "c", arms: [arm("Red"), arm("else")] }),
      ] }),
    ]);
    assert.deepEqual(codesFor(diags, "f"), []);
  });

  it("arm after a wildcard → FUNGI-TYPE-022 (unreachable)", async () => {
    const { diags } = await checkBodies([
      bodyFlow({ name: "f", body: [
        stmt({ kind: "match", name: "c", arms: [arm("_"), arm("Red")] }),
      ] }),
    ]);
    assert.deepEqual(codesFor(diags, "f"), ["FUNGI-TYPE-022"]);
  });

  it("two arms after a wildcard → FUNGI-TYPE-022 twice (one per dead arm)", async () => {
    const { diags } = await checkBodies([
      bodyFlow({ name: "f", body: [
        stmt({ kind: "match", name: "c", arms: [arm("Red"), arm("_"), arm("Green"), arm("Blue")] }),
      ] }),
    ]);
    assert.deepEqual(codesFor(diags, "f"), ["FUNGI-TYPE-022", "FUNGI-TYPE-022"]);
  });

  it("mismatch nested inside a match arm body is caught (recursion)", async () => {
    const { diags } = await checkBodies([
      bodyFlow({ name: "f", body: [
        stmt({ kind: "match", name: "c", arms: [arm("Red"), arm("_")], body: [
          stmt({ kind: "let", name: "y", typeName: "Int", expr: [expr("lit", "t", "String")] }),
        ] }),
      ] }),
    ]);
    assert.deepEqual(codesFor(diags, "f"), ["FUNGI-TYPE-002"]);
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
    assert.deepEqual(codesFor(diags, "f"), ["FUNGI-TYPE-002"]);
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
    assert.deepEqual(codesFor(diags, "f"), ["FUNGI-TYPE-002"]);
  });

  it("duplicate binding in the same scope → FUNGI-NAME-002", async () => {
    const { diags } = await checkBodies([
      bodyFlow({ name: "f", body: [
        stmt({ kind: "let", name: "x", typeName: "Int", expr: [expr("lit", "1", "Int")] }),
        stmt({ kind: "let", name: "x", typeName: "Int", expr: [expr("lit", "2", "Int")] }),
      ] }),
    ]);
    assert.deepEqual(codesFor(diags, "f"), ["FUNGI-NAME-002"]);
  });

  it("re-declaring a name in a NESTED block shadows the outer scope → FUNGI-TYPE-020", async () => {
    const { diags } = await checkBodies([
      bodyFlow({ name: "f", body: [
        stmt({ kind: "let", name: "x", typeName: "Int", expr: [expr("lit", "1", "Int")] }),
        stmt({ kind: "if", expr: [expr("name", "cond")], body: [
          stmt({ kind: "let", name: "x", typeName: "Int", expr: [expr("lit", "2", "Int")] }),
        ] }),
      ] }),
    ]);
    assert.deepEqual(codesFor(diags, "f"), ["FUNGI-TYPE-020"]);
  });

  it("a nested binding with a FRESH name does not shadow (no FUNGI-TYPE-020)", async () => {
    const { diags } = await checkBodies([
      bodyFlow({ name: "f", body: [
        stmt({ kind: "let", name: "x", typeName: "Int", expr: [expr("lit", "1", "Int")] }),
        stmt({ kind: "if", expr: [expr("name", "cond")], body: [
          stmt({ kind: "let", name: "y", typeName: "Int", expr: [expr("lit", "2", "Int")] }),
        ] }),
      ] }),
    ]);
    assert.deepEqual(codesFor(diags, "f"), []);
  });

  // Verified 2026-07-16 vs Stage-A `galerina check --strict-types`: an undeclared name in an
  // initializer emits NOTHING — Galerina does not resolve bare symbols, and FUNGI-TYPE-019 has no
  // emit site (registry emits=0). The twin previously emitted 019 here — a FALSE DIFFERENTIAL, now
  // removed. The twin must stay silent to match Stage-A.
  it("a name initializer referencing an undeclared symbol → no diagnostic (Stage-A does not resolve symbols)", async () => {
    const { diags } = await checkBodies([
      bodyFlow({ name: "f", body: [
        stmt({ kind: "let", name: "y", typeName: "Int", expr: [expr("name", "z")] }),
      ] }),
    ]);
    assert.deepEqual(codesFor(diags, "f"), []);
  });

  it("a name initializer referencing an EARLIER binding is in scope (no FUNGI-TYPE-019)", async () => {
    const { diags } = await checkBodies([
      bodyFlow({ name: "f", body: [
        stmt({ kind: "let", name: "x", typeName: "Int", expr: [expr("lit", "1", "Int")] }),
        stmt({ kind: "let", name: "y", typeName: "Int", expr: [expr("name", "x")] }),
      ] }),
    ]);
    assert.deepEqual(codesFor(diags, "f"), []);
  });

  it("a name initializer referencing a PARAM is in scope — params seed the body scope (no FUNGI-TYPE-019)", async () => {
    const { diags } = await checkBodies([
      bodyFlow({ name: "f", params: [param("p", "Int")], body: [
        stmt({ kind: "let", name: "y", typeName: "Int", expr: [expr("name", "p")] }),
      ] }),
    ]);
    assert.deepEqual(codesFor(diags, "f"), []);
  });
});
