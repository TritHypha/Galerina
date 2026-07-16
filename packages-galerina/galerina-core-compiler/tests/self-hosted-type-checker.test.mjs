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
const vBool = (b) => ({ __tag: "bool", value: Boolean(b) });
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

// FUNGI-TYPE-026 (DEFERRED_TYPE_CHECK, warning) — a return type declared `Auto` defers the return-type
// check. Verified vs Stage-A raw diagnostics: `-> Auto { return 5 }` and `-> Auto { return "s" }` each
// emit 026 ALONE — Auto is a valid deferred type (no 001) and the check is deferred (no 008 mismatch).
// (Landing this also fixed a latent divergence: the twin previously flagged an Auto return type as an
// unknown type, FUNGI-TYPE-001, since isKnownType has no `Auto`.) (Tranche B, RD-0412 §4.)
describe("type-checker.fungi — FUNGI-TYPE-026 DEFERRED_TYPE_CHECK (Auto return defers the check)", () => {
  it("Auto return + Int return expr → 026 (deferred, no 008)", async () => {
    const { diags } = await check([
      flow({ name: "f", returnType: "Auto", returnExpr: retExpr("literal", "Int") }),
    ]);
    assert.deepEqual(codesFor(diags, "f"), ["FUNGI-TYPE-026"]);
  });

  it("Auto return + String return expr → 026 (Auto defers, so no 008 mismatch)", async () => {
    const { diags } = await check([
      flow({ name: "f", returnType: "Auto", returnExpr: retExpr("literal", "String") }),
    ]);
    assert.deepEqual(codesFor(diags, "f"), ["FUNGI-TYPE-026"]);
  });

  it("Auto return is NOT flagged an unknown type → 026 only, never FUNGI-TYPE-001", async () => {
    const { diags } = await check([
      flow({ name: "f", returnType: "Auto", returnExpr: retExpr("param", "Int") }),
    ]);
    assert.deepEqual(codesFor(diags, "f"), ["FUNGI-TYPE-026"]);
  });

  it("a concrete return type still return-checks normally (no 026)", async () => {
    const { diags } = await check([
      flow({ name: "f", returnType: "Int", returnExpr: retExpr("literal", "Int") }),
    ]);
    assert.deepEqual(codesFor(diags, "f"), []);
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

// True when an Int literal's value is outside the WASM i32 range — the range decision the twin cannot
// make itself (it runs on i32 Ints), so the parser lane / this builder supplies it as a field, exactly
// like the pre-parsed tensor shape. Non-Int or non-lit exprs are never overflowing.
function isI32Overflow(kind, litType, value) {
  if (kind !== "lit" || litType !== "Int") return false;
  const n = Number(String(value).replace(/_/g, ""));
  return Number.isFinite(n) && (n > 2147483647 || n < -2147483648);
}
const expr = (kind, value = "", litType = "", children = []) =>
  vRecord({
    kind: vStr(kind),
    value: vStr(value),
    litType: vStr(litType),
    children: vList(children),
    // FUNGI-TYPE-024: pre-parsed i32-overflow flag for Int literals (the twin can't hold the value).
    litI32Overflow: vBool(isI32Overflow(kind, litType, value)),
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
// Decompose a `Tensor<Elem, [d0, d1, …]>` into its element type and a NORMALIZED shape string ("2,2"),
// or { elem:"", shape:"" } when the type is not a well-formed 2-arg Tensor (so a malformed Tensor falls
// through to the generic arity path, which emits 009 as Stage-A does). Stands in for the parser lane
// handing the twin a pre-decided tensor shape — keeps the fragile shape-literal parser out of .fungi.
function parseTensor(typeName) {
  const { base, args } = parseGeneric(typeName);
  if (base !== "Tensor" || args.length !== 2) return { elem: "", shape: "" };
  const raw = args[1];
  if (!raw.startsWith("[")) return { elem: "", shape: "" };
  const inner = raw.slice(1, raw.lastIndexOf("]"));
  const shape = inner.split(",").map((s) => s.trim()).filter((s) => s !== "").join(",");
  return { elem: args[0], shape };
}
const stmt = ({ kind, name = "", typeName = "", initType = "", expr: e = [], body = [], elseBody = [], arms = [], branded = false }) => {
  const { base, args } = parseGeneric(typeName);
  const dt = parseTensor(typeName);
  const it = parseTensor(initType);
  return vRecord({
    kind: vStr(kind),
    name: vStr(name),
    typeName: vStr(typeName),
    // typeBase + typeArgs = the parser-produced generic decomposition (empty args for a non-generic
    // type); the twin's checkGenericBinding checks FUNGI-TYPE-009/001/002/011 over them.
    typeBase: vStr(base),
    typeArgs: vList(args.map(vStr)),
    // isBranded = the parser's brandedTypes-registry membership (type X = Brand<…>); the twin's
    // checkBinding emits FUNGI-TYPE-002/003 for a raw-literal init to a branded type.
    isBranded: vBool(branded),
    // declared/init tensor decomposition (element + normalized shape) — set only for a well-formed
    // `Tensor<Elem,[dims]>`. The twin's checkTensorBinding compares them for FUNGI-TYPE-030/017/016.
    // `initType` is the initializer's INFERRED type (the twin has no symbol resolution, so the harness
    // supplies it, mirroring how Stage-A resolves the RHS tensor type). `isTensor` is the absent-safe
    // routing flag (a boolean the twin tests for truthiness; the real parser leaves it unset → false).
    isTensor: vBool(dt.elem !== ""),
    declaredTensorElem: vStr(dt.elem),
    declaredTensorShape: vStr(dt.shape),
    initTensorElem: vStr(it.elem),
    initTensorShape: vStr(it.shape),
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

  // FUNGI-TYPE-003 (InvalidNominalConversion) — a branded type (`type X = Brand<T,"Name">`) is known,
  // but a raw literal init is a nominal conversion: TYPE-002 for a type-mismatched literal, and TYPE-003
  // (needs a validation gate) when the literal is a String. Verified vs `galerina check --strict-types`:
  //   CustomerId = "raw" → 002 + 003 · CustomerId = 5 → 002 · CustomerId = <param> → clean.
  it("branded CustomerId = \"raw\" (String literal) → FUNGI-TYPE-002 + 003", async () => {
    const { diags } = await checkBodies([
      bodyFlow({ name: "f", body: [
        stmt({ kind: "let", name: "c", typeName: "CustomerId", branded: true, expr: [expr("lit", "raw", "String")] }),
      ] }),
    ]);
    assert.deepEqual(codesFor(diags, "f"), ["FUNGI-TYPE-002", "FUNGI-TYPE-003"]);
  });

  it("branded CustomerId = 5 (Int literal) → FUNGI-TYPE-002 only (003 needs a String)", async () => {
    const { diags } = await checkBodies([
      bodyFlow({ name: "f", body: [
        stmt({ kind: "let", name: "c", typeName: "CustomerId", branded: true, expr: [expr("lit", "5", "Int")] }),
      ] }),
    ]);
    assert.deepEqual(codesFor(diags, "f"), ["FUNGI-TYPE-002"]);
  });

  it("branded CustomerId = id (name init, in scope) → no diagnostic; branded type is known (no 001)", async () => {
    const { diags } = await checkBodies([
      bodyFlow({ name: "f", body: [
        stmt({ kind: "let", name: "c", typeName: "CustomerId", branded: true, expr: [expr("name", "id")] }),
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

// FUNGI-TYPE-030 (TensorElementTypeMismatch, error) / -017 (QuantizedPrecisionMismatch, warning) /
// -016 (TensorShapeMismatch, error) — a `Tensor<Elem,[dims]>` binding whose initializer is ALSO a
// tensor. The twin compares the declared vs the init's INFERRED tensor (element + normalized shape).
// Every expectation below was verified against Stage-A both via `galerina check --strict-types` AND a
// raw-diagnostics inspection (the CLI suppresses the 017 warning; the differential compares the code
// SET, so an unseen warning would silently diverge — hence the raw check). Because `codesFor` SORTS,
// expectations are alphabetical. (Tranche B, RD-0412 §4.)
describe("type-checker.fungi — FUNGI-TYPE-030/017/016 tensor element & shape", () => {
  it("element mismatch Int8→Float32 (same shape) → 030 + 017 (quantized pair)", async () => {
    const { diags } = await checkBodies([
      bodyFlow({ name: "f", body: [
        stmt({ kind: "let", name: "t", typeName: "Tensor<Float32, [2, 2]>", initType: "Tensor<Int8, [2, 2]>", expr: [expr("name", "p")] }),
      ] }),
    ]);
    assert.deepEqual(codesFor(diags, "f"), ["FUNGI-TYPE-017", "FUNGI-TYPE-030"]);
  });

  it("NON-quantized element mismatch Float64→Float32 (same shape) → 030 only (no 017)", async () => {
    const { diags } = await checkBodies([
      bodyFlow({ name: "f", body: [
        stmt({ kind: "let", name: "t", typeName: "Tensor<Float64, [2, 2]>", initType: "Tensor<Float32, [2, 2]>", expr: [expr("name", "p")] }),
      ] }),
    ]);
    assert.deepEqual(codesFor(diags, "f"), ["FUNGI-TYPE-030"]);
  });

  it("shape mismatch same element (dim value [2,2]←[3,3]) → 016 only", async () => {
    const { diags } = await checkBodies([
      bodyFlow({ name: "f", body: [
        stmt({ kind: "let", name: "t", typeName: "Tensor<Float32, [2, 2]>", initType: "Tensor<Float32, [3, 3]>", expr: [expr("name", "p")] }),
      ] }),
    ]);
    assert.deepEqual(codesFor(diags, "f"), ["FUNGI-TYPE-016"]);
  });

  it("rank mismatch same element ([2,2]←[2,2,2]) → 016 only", async () => {
    const { diags } = await checkBodies([
      bodyFlow({ name: "f", body: [
        stmt({ kind: "let", name: "t", typeName: "Tensor<Float32, [2, 2]>", initType: "Tensor<Float32, [2, 2, 2]>", expr: [expr("name", "p")] }),
      ] }),
    ]);
    assert.deepEqual(codesFor(diags, "f"), ["FUNGI-TYPE-016"]);
  });

  it("element AND shape mismatch Int8[3,3]→Float32[2,2] → 016 + 017 + 030", async () => {
    const { diags } = await checkBodies([
      bodyFlow({ name: "f", body: [
        stmt({ kind: "let", name: "t", typeName: "Tensor<Float32, [2, 2]>", initType: "Tensor<Int8, [3, 3]>", expr: [expr("name", "p")] }),
      ] }),
    ]);
    assert.deepEqual(codesFor(diags, "f"), ["FUNGI-TYPE-016", "FUNGI-TYPE-017", "FUNGI-TYPE-030"]);
  });

  it("identical tensors → no diagnostic", async () => {
    const { diags } = await checkBodies([
      bodyFlow({ name: "f", body: [
        stmt({ kind: "let", name: "t", typeName: "Tensor<Float32, [2, 2]>", initType: "Tensor<Float32, [2, 2]>", expr: [expr("name", "p")] }),
      ] }),
    ]);
    assert.deepEqual(codesFor(diags, "f"), []);
  });

  it("a well-formed Tensor's [dims] shape is NOT mis-flagged as an unknown type argument (no FUNGI-TYPE-001)", async () => {
    // Regression: Tensor<Float32,[2,2]> must route to the tensor path, not the generic arity path
    // (which would emit 001 for the "[2,2]" shape "argument"). Init omitted → tensor check is inert.
    const { diags } = await checkBodies([
      bodyFlow({ name: "f", body: [
        stmt({ kind: "let", name: "t", typeName: "Tensor<Float32, [2, 2]>", expr: [expr("name", "p")] }),
      ] }),
    ]);
    assert.deepEqual(codesFor(diags, "f"), []);
  });
});

// FUNGI-TYPE-024 (INT_LITERAL_I32_OVERFLOW, warning) — an Int literal outside the WASM i32 range
// [-2147483648, 2147483647] wraps silently. Verified vs Stage-A raw diagnostics: an overflowing Int
// literal in a binding emits 024 alone (the declared Int matches, so no 002). The twin relays the
// parser-computed range flag (it can't hold the value on i32). Boundary values checked. (Tranche B.)
describe("type-checker.fungi — FUNGI-TYPE-024 Int literal i32 overflow", () => {
  it("Int literal above i32 max → 024", async () => {
    const { diags } = await checkBodies([
      bodyFlow({ name: "f", body: [
        stmt({ kind: "let", name: "x", typeName: "Int", expr: [expr("lit", "9999999999999", "Int")] }),
      ] }),
    ]);
    assert.deepEqual(codesFor(diags, "f"), ["FUNGI-TYPE-024"]);
  });

  it("Int literal below i32 min (negative) → 024", async () => {
    const { diags } = await checkBodies([
      bodyFlow({ name: "f", body: [
        stmt({ kind: "let", name: "x", typeName: "Int", expr: [expr("lit", "-9999999999999", "Int")] }),
      ] }),
    ]);
    assert.deepEqual(codesFor(diags, "f"), ["FUNGI-TYPE-024"]);
  });

  it("in-range Int literal → clean", async () => {
    const { diags } = await checkBodies([
      bodyFlow({ name: "f", body: [
        stmt({ kind: "let", name: "x", typeName: "Int", expr: [expr("lit", "5", "Int")] }),
      ] }),
    ]);
    assert.deepEqual(codesFor(diags, "f"), []);
  });

  it("exactly i32 max (2147483647) is in range → clean; max+1 (2147483648) → 024", async () => {
    const { diags: ok } = await checkBodies([
      bodyFlow({ name: "f", body: [
        stmt({ kind: "let", name: "x", typeName: "Int", expr: [expr("lit", "2147483647", "Int")] }),
      ] }),
    ]);
    assert.deepEqual(codesFor(ok, "f"), []);
    const { diags: over } = await checkBodies([
      bodyFlow({ name: "g", body: [
        stmt({ kind: "let", name: "x", typeName: "Int", expr: [expr("lit", "2147483648", "Int")] }),
      ] }),
    ]);
    assert.deepEqual(codesFor(over, "g"), ["FUNGI-TYPE-024"]);
  });
});

// FUNGI-TYPE-025 (SILENT_NULL_DENIED, error) — a `null`/`undefined` initializer. Verified vs Stage-A raw
// diagnostics: `let x: Int = null` and `= undefined` each emit {002, 025} — two independent conditions
// (null/undefined infer to type 'Null' → 002 mismatch; not a valid Galerina value → 025). Built as an
// IDENTIFIER node (value "null"), matching the parser's real representation, so the twin's value-keyed
// branch runs the same way the real parser drives it (the pipeline suite proves the real path). (Tranche B.)
describe("type-checker.fungi — FUNGI-TYPE-025 SILENT_NULL_DENIED (null/undefined literal)", () => {
  it("let x: Int = null → 002 + 025", async () => {
    const { diags } = await checkBodies([
      bodyFlow({ name: "f", body: [
        stmt({ kind: "let", name: "x", typeName: "Int", expr: [expr("identifier", "null")] }),
      ] }),
    ]);
    assert.deepEqual(codesFor(diags, "f"), ["FUNGI-TYPE-002", "FUNGI-TYPE-025"]);
  });

  it("let x: Int = undefined → 002 + 025", async () => {
    const { diags } = await checkBodies([
      bodyFlow({ name: "f", body: [
        stmt({ kind: "let", name: "x", typeName: "Int", expr: [expr("identifier", "undefined")] }),
      ] }),
    ]);
    assert.deepEqual(codesFor(diags, "f"), ["FUNGI-TYPE-002", "FUNGI-TYPE-025"]);
  });

  it("a non-null identifier initializer does NOT trigger 025 (no false null-denial)", async () => {
    const { diags } = await checkBodies([
      bodyFlow({ name: "f", body: [
        stmt({ kind: "let", name: "x", typeName: "Int", expr: [expr("identifier", "someVar")] }),
      ] }),
    ]);
    assert.deepEqual(codesFor(diags, "f"), []);
  });
});
