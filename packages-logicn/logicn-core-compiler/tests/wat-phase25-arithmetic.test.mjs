/**
 * Phase 25A — WAT Real Arithmetic Body Emission Tests
 *
 * Verifies that buildWATModuleFromGIR(gir, cap, target, ast) emits
 * real i32.add/sub/mul/div instructions for pure flows instead of
 * (local.get $p0) identity stubs (Phase 24A).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  parseProgram, checkEffects, emitGIR,
  buildWATModuleFromGIR, renderWAT,
  emitWATExpr, extractFlowParamNames,
  findFlowNodeInAST,
} from "../dist/index.js";

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function compileToWAT(src) {
  const prog = parseProgram(src, "test.lln");
  const errs = (prog.diagnostics ?? []).filter(d => d.severity === "error");
  if (errs.length > 0) throw new Error("Parse error: " + errs.map(d => d.message).join("; "));
  const fx = checkEffects(prog.flows, prog.ast);
  const { gir } = emitGIR(prog.ast, prog.flows, fx);
  return renderWAT(buildWATModuleFromGIR(gir, undefined, "wasm-standalone", prog.ast));
}

// ---------------------------------------------------------------------------
// emitWATExpr unit tests
// ---------------------------------------------------------------------------

describe("emitWATExpr: integer literal", () => {
  it("emits i32.const for integer", () => {
    assert.equal(
      emitWATExpr({ kind: "numberLiteral", value: "42" }, new Map()),
      "(i32.const 42)"
    );
  });

  it("emits f64.const for float", () => {
    assert.equal(
      emitWATExpr({ kind: "numberLiteral", value: "3.14" }, new Map()),
      "(f64.const 3.14)"
    );
  });
});

describe("emitWATExpr: identifier", () => {
  it("resolves param via vars map", () => {
    const vars = new Map([["x", "$p0"]]);
    assert.equal(
      emitWATExpr({ kind: "identifier", value: "x" }, vars),
      "(local.get $p0)"
    );
  });

  it("fail-closes (unreachable) for an unknown identifier — not a silent i32.const 0 (#128-sibling)", () => {
    // Owner pipeline-security pass: an emitter that can't resolve a symbol must TRAP, not emit a
    // wrong value (a silent 0 flowing into a governance predicate is a lying-abstraction exploit).
    const result = emitWATExpr({ kind: "identifier", value: "missing" }, new Map());
    assert.ok(result.includes("unreachable"), "unresolved identifier must fail-closed, not return a value");
    assert.ok(!result.includes("i32.const 0"), "must NOT silently emit a wrong value");
    assert.ok(result.includes("missing"), "diagnostic comment must still name the unresolved symbol");
  });
});

describe("emitWATExpr: binary operations", () => {
  it("+ → checked add", () => {
    // owner Fork A=TRAP: + lowers to a checked-add call that traps on overflow
    const vars = new Map([["a", "$p0"], ["b", "$p1"]]);
    const node = {
      kind: "binaryExpr", value: "+",
      children: [{ kind: "identifier", value: "a" }, { kind: "identifier", value: "b" }],
    };
    assert.equal(emitWATExpr(node, vars), "(call $lln_checked_add_i32 (local.get $p0) (local.get $p1))");
  });

  it("- → checked sub", () => {
    // owner Fork A=TRAP: - lowers to a checked-sub call that traps on overflow
    const vars = new Map([["a", "$p0"], ["b", "$p1"]]);
    const node = {
      kind: "binaryExpr", value: "-",
      children: [{ kind: "identifier", value: "a" }, { kind: "identifier", value: "b" }],
    };
    assert.equal(emitWATExpr(node, vars), "(call $lln_checked_sub_i32 (local.get $p0) (local.get $p1))");
  });

  it("* → checked mul", () => {
    // owner Fork A=TRAP: * lowers to a checked-mul call that traps on overflow
    const vars = new Map([["a", "$p0"], ["b", "$p1"]]);
    const node = {
      kind: "binaryExpr", value: "*",
      children: [{ kind: "identifier", value: "a" }, { kind: "identifier", value: "b" }],
    };
    assert.equal(emitWATExpr(node, vars), "(call $lln_checked_mul_i32 (local.get $p0) (local.get $p1))");
  });

  it("< → i32.lt_s", () => {
    const vars = new Map([["n", "$p0"]]);
    const node = {
      kind: "binaryExpr", value: "<",
      children: [{ kind: "identifier", value: "n" }, { kind: "numberLiteral", value: "10" }],
    };
    assert.equal(emitWATExpr(node, vars), "(i32.lt_s (local.get $p0) (i32.const 10))");
  });

  it("== → i32.eq", () => {
    const vars = new Map([["x", "$p0"]]);
    const node = {
      kind: "binaryExpr", value: "==",
      children: [{ kind: "identifier", value: "x" }, { kind: "numberLiteral", value: "0" }],
    };
    assert.equal(emitWATExpr(node, vars), "(i32.eq (local.get $p0) (i32.const 0))");
  });

  it("nested: (a + b) * c", () => {
    const vars = new Map([["a", "$p0"], ["b", "$p1"], ["c", "$p2"]]);
    const node = {
      kind: "binaryExpr", value: "*",
      children: [
        {
          kind: "binaryExpr", value: "+",
          children: [{ kind: "identifier", value: "a" }, { kind: "identifier", value: "b" }],
        },
        { kind: "identifier", value: "c" },
      ],
    };
    // owner Fork A=TRAP: nested arithmetic composes the checked-op calls
    assert.equal(
      emitWATExpr(node, vars),
      "(call $lln_checked_mul_i32 (call $lln_checked_add_i32 (local.get $p0) (local.get $p1)) (local.get $p2))"
    );
  });
});

describe("emitWATExpr: unary operations", () => {
  it("unary - → checked sub 0 x", () => {
    // owner Fork A=TRAP: unary negation lowers to a checked-sub call (0 - x)
    const vars = new Map([["x", "$p0"]]);
    const node = {
      kind: "unaryExpr", value: "-",
      children: [{ kind: "identifier", value: "x" }],
    };
    assert.equal(emitWATExpr(node, vars), "(call $lln_checked_sub_i32 (i32.const 0) (local.get $p0))");
  });

  it("unary ! → i32.eqz", () => {
    const vars = new Map([["b", "$p0"]]);
    const node = {
      kind: "unaryExpr", value: "!",
      children: [{ kind: "identifier", value: "b" }],
    };
    assert.equal(emitWATExpr(node, vars), "(i32.eqz (local.get $p0))");
  });
});

// ---------------------------------------------------------------------------
// extractFlowParamNames
// ---------------------------------------------------------------------------

describe("extractFlowParamNames", () => {
  it("extracts names from paramDecl nodes", () => {
    const prog = parseProgram(
      "pure flow add(a: Int, b: Int) -> Int contract { effects {} } { return a + b }",
      "test.lln"
    );
    const flowNode = prog.ast.children?.find(c => c.kind === "pureFlowDecl");
    assert.deepEqual(extractFlowParamNames(flowNode), ["a", "b"]);
  });

  it("returns empty array for no-param flow", () => {
    const prog = parseProgram(
      "pure flow zero() -> Int contract { effects {} } { return 0 }",
      "test.lln"
    );
    const flowNode = prog.ast.children?.find(c => c.kind === "pureFlowDecl");
    assert.deepEqual(extractFlowParamNames(flowNode), []);
  });
});

// ---------------------------------------------------------------------------
// findFlowNodeInAST
// ---------------------------------------------------------------------------

describe("findFlowNodeInAST", () => {
  it("finds a named pure flow", () => {
    const prog = parseProgram(
      "pure flow add(a: Int, b: Int) -> Int contract { effects {} } { return a + b }",
      "test.lln"
    );
    const node = findFlowNodeInAST(prog.ast, "add");
    assert.ok(node !== undefined, "must find the add flow");
    assert.equal(node.kind, "pureFlowDecl");
    assert.equal(node.value, "add");
  });

  it("returns undefined for unknown flow name", () => {
    const prog = parseProgram(
      "pure flow add(a: Int, b: Int) -> Int contract { effects {} } { return a + b }",
      "test.lln"
    );
    assert.equal(findFlowNodeInAST(prog.ast, "notHere"), undefined);
  });
});

// ---------------------------------------------------------------------------
// Phase 25 integration — real WAT arithmetic
// ---------------------------------------------------------------------------

describe("Phase 25 integration: real WAT arithmetic", () => {
  it("add(a,b) → checked add (not identity stub)", () => {
    // owner Fork A=TRAP: flow must CALL the checked-add op, not just contain i32.add
    const wat = compileToWAT(
      "pure flow add(a: Int, b: Int) -> Int contract { effects {} } { return a + b }"
    );
    assert.ok(wat.includes("call $lln_checked_add_i32"), `expected checked add in:\n${wat}`);
    assert.ok(wat.includes("local.get $p0"));
    assert.ok(wat.includes("local.get $p1"));
    // checked helper legitimately contains its own overflow-trap `unreachable`,
    // so assert the flow lowered to a real body (not the #128 unsupported stub).
    assert.ok(!wat.includes(";; unsupported-in-WASM"), "must lower to a real body");
  });

  it("sub(a,b) → checked sub", () => {
    // owner Fork A=TRAP
    const wat = compileToWAT(
      "pure flow sub(a: Int, b: Int) -> Int contract { effects {} } { return a - b }"
    );
    assert.ok(wat.includes("call $lln_checked_sub_i32"));
    assert.ok(!wat.includes(";; unsupported-in-WASM"));
  });

  it("mul(a,b) → checked mul", () => {
    // owner Fork A=TRAP
    const wat = compileToWAT(
      "pure flow mul(a: Int, b: Int) -> Int contract { effects {} } { return a * b }"
    );
    assert.ok(wat.includes("call $lln_checked_mul_i32"));
    assert.ok(!wat.includes(";; unsupported-in-WASM"));
  });

  it("constant 42 → i32.const 42", () => {
    const wat = compileToWAT(
      "pure flow fortytwo() -> Int contract { effects {} } { return 42 }"
    );
    assert.ok(wat.includes("i32.const 42"));
    assert.ok(!wat.includes("unreachable"));
  });

  it("identity(x) → local.get $p0", () => {
    const wat = compileToWAT(
      "pure flow identity(x: Int) -> Int contract { effects {} } { return x }"
    );
    assert.ok(wat.includes("local.get $p0"));
    assert.ok(!wat.includes("unreachable"));
  });

  it("let binding emits (local ...) + local.set", () => {
    const wat = compileToWAT([
      "pure flow product(a: Int, b: Int) -> Int",
      "contract { effects {} }",
      "{ let result = a * b",
      "  return result }",
    ].join("\n"));
    assert.ok(wat.includes("(local $result i32)"), `expected local decl:\n${wat}`);
    assert.ok(wat.includes("local.set $result"));
    assert.ok(wat.includes("call $lln_checked_mul_i32")); // owner Fork A=TRAP
    assert.ok(!wat.includes(";; unsupported-in-WASM"));
  });

  it("multiple let bindings in correct order", () => {
    const wat = compileToWAT([
      "pure flow multiStep(a: Int, b: Int) -> Int",
      "contract { effects {} }",
      "{ let sumVal = a + b",
      "  let doubled = sumVal * 2",
      "  return doubled }",
    ].join("\n"));
    const sumPos  = wat.indexOf("$sumVal");
    const dblPos  = wat.indexOf("$doubled");
    assert.ok(sumPos !== -1  && dblPos !== -1);
    assert.ok(sumPos < dblPos, "sumVal declaration must precede doubled");
    // owner Fork A=TRAP: both ops lower to checked-op calls
    assert.ok(wat.includes("call $lln_checked_add_i32") && wat.includes("call $lln_checked_mul_i32"));
    assert.ok(!wat.includes(";; unsupported-in-WASM"));
  });

  it("Phase 24A fallback (no ast) still avoids unreachable", () => {
    const prog = parseProgram(
      "pure flow add(a: Int, b: Int) -> Int contract { effects {} } { return a + b }",
      "test.lln"
    );
    const fx = checkEffects(prog.flows, prog.ast);
    const { gir } = emitGIR(prog.ast, prog.flows, fx);
    // Call WITHOUT ast — falls back to Phase 24A
    const wat = renderWAT(buildWATModuleFromGIR(gir, undefined, "wasm-standalone"));
    assert.ok(!wat.includes("unreachable"), "Phase 24A must not use unreachable");
    assert.ok(wat.includes("local.get"), "Phase 24A uses local.get for identity");
  });

  it("generated WAT has correct module structure", () => {
    const wat = compileToWAT(
      "pure flow inc(x: Int) -> Int contract { effects {} } { return x + 1 }"
    );
    assert.ok(wat.startsWith("(module"), "must start with (module");
    assert.ok(wat.includes("(memory"), "must declare memory");
    assert.ok(wat.includes("(func $inc"), "must have func $inc");
    assert.ok(wat.includes("call $lln_checked_add_i32"), "must have real arithmetic"); // owner Fork A=TRAP
    assert.ok(wat.includes("i32.const 1"), "must have constant 1");
  });
});
