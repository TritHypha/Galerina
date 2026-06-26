/**
 * Self-hosted runtime dispatcher (runtime.spore) — execution tests.
 *
 * Exercises the Stage B tier-selection logic by executing the .spore flows
 * through the production interpreter and asserting their outputs. Guards the
 * cache-eligibility regression where `if c { let cacheStr = ... }` shadowed the
 * outer binding instead of reassigning it (must be `mut` + assignment).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseProgram, executeFlow } from "../dist/index.js";

const __dir = dirname(fileURLToPath(import.meta.url));
const RUNTIME_LLN = join(__dir, "..", "src", "self-hosted", "runtime.spore");

const program = parseProgram(readFileSync(RUNTIME_LLN, "utf8"), "runtime.spore");

function argsOf(obj) {
  const m = new Map();
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === "number") m.set(k, { __tag: "int", value: v });
    else if (typeof v === "boolean") m.set(k, { __tag: "bool", value: v });
    else m.set(k, { __tag: "string", value: String(v) });
  }
  return m;
}

async function call(flowName, obj) {
  const r = await executeFlow(
    flowName, argsOf(obj), program.ast, program.flows,
    undefined, undefined, { pureFastPath: false }, undefined, undefined,
  );
  return r.value ?? r;
}

const plan = async (obj) => (await call("buildExecutionPlan", obj)).items.map((i) => i.value);
const field = (rec, name) => rec.fields.get(name).value;

describe("runtime.spore — parses clean", () => {
  it("has zero parse errors", () => {
    const errors = program.diagnostics.filter((d) => d.severity === "error");
    assert.equal(errors.length, 0, errors.map((e) => e.message).join(", "));
  });
});

describe("runtime.spore — selectTier", () => {
  it("pure integer flow → bytecode tier", async () => {
    const d = await call("selectTier", { qualifier: "pure", effectCount: 0, isIntegerOnly: true });
    assert.equal(field(d, "tier"), "bytecode");
    assert.equal(field(d, "isOptimal"), true);
  });

  it("pure non-integer flow → wasm tier", async () => {
    const d = await call("selectTier", { qualifier: "pure", effectCount: 0, isIntegerOnly: false });
    assert.equal(field(d, "tier"), "wasm");
  });

  it("effect-free non-pure flow → sync tier", async () => {
    const d = await call("selectTier", { qualifier: "guarded", effectCount: 0, isIntegerOnly: false });
    assert.equal(field(d, "tier"), "sync");
  });

  it("effectful governed flow → tree tier (not optimal)", async () => {
    const d = await call("selectTier", { qualifier: "secure", effectCount: 2, isIntegerOnly: false });
    assert.equal(field(d, "tier"), "tree");
    assert.equal(field(d, "isOptimal"), false);
  });
});

describe("runtime.spore — isCacheEligible", () => {
  it("pure + no effects → eligible", async () => {
    assert.equal((await call("isCacheEligible", { qualifier: "pure", effectCount: 0 })).value, true);
  });

  it("pure + effects → not eligible", async () => {
    assert.equal((await call("isCacheEligible", { qualifier: "pure", effectCount: 1 })).value, false);
  });

  it("non-pure → not eligible", async () => {
    assert.equal((await call("isCacheEligible", { qualifier: "secure", effectCount: 0 })).value, false);
  });
});

describe("runtime.spore — buildExecutionPlan (cache regression guard)", () => {
  it("cache-eligible pure integer flow reports cache:true", async () => {
    const [tier, cache] = await plan({ flowName: "f", qualifier: "pure", effectCount: 0, isIntegerOnly: true });
    assert.equal(tier, "bytecode");
    assert.equal(cache, "cache:true", "cache flag must reflect eligibility (mut, not shadowed let)");
  });

  it("non-cacheable effectful flow reports cache:false", async () => {
    const [tier, cache] = await plan({ flowName: "f", qualifier: "secure", effectCount: 2, isIntegerOnly: false });
    assert.equal(tier, "tree");
    assert.equal(cache, "cache:false");
  });
});

// ── GIR evaluator (Milestone S7) — hand-built GIR ──────────────
const vStr = (s) => ({ __tag: "string", value: String(s) });
const vInt = (n) => ({ __tag: "int", value: n });
const vBool = (x) => ({ __tag: "bool", value: x });
const vList = (items) => ({ __tag: "list", items });
function vRec(obj) {
  const f = new Map();
  for (const [k, v] of Object.entries(obj)) f.set(k, v);
  return { __tag: "record", fields: f };
}
const gExpr = (op, ty = "", value = "", kids = []) =>
  vRec({ op: vStr(op), ty: vStr(ty), value: vStr(value), kids: vList(kids) });
const gStmt = ({ op, name = "", expr = [], body = [], elseBody = [] }) =>
  vRec({ op: vStr(op), name: vStr(name), expr: vList(expr), body: vList(body), elseBody: vList(elseBody) });
const constI = (n) => gExpr("const", "Int", String(n));
const constB = (x) => gExpr("const", "Bool", x ? "true" : "false");

async function runGIR(stmts, env = []) {
  const r = await executeFlow(
    "runGIRBody", new Map([["stmts", vList(stmts)], ["env", vList(env)]]),
    program.ast, program.flows, undefined, undefined, { pureFastPath: false }, undefined, undefined,
  );
  const runResult = r.value ?? r;
  // runProgram returns RunResult { retVal, auditLog } — extract retVal
  const v = runResult.fields?.get("retVal") ?? runResult;
  return { ty: v.fields.get("ty").value, i: v.fields.get("i").value, b: v.fields.get("b").value };
}

describe("runtime.spore — GIR evaluator (S7)", () => {
  it("evaluates a const return", async () => {
    assert.equal((await runGIR([gStmt({ op: "ret", expr: [constI(42)] })])).i, 42);
  });

  it("store then load + binop: x=2; y=3; return x+y → 5", async () => {
    const out = await runGIR([
      gStmt({ op: "store", name: "x", expr: [constI(2)] }),
      gStmt({ op: "store", name: "y", expr: [constI(3)] }),
      gStmt({ op: "ret", expr: [gExpr("binop", "Int", "add", [gExpr("load", "", "x"), gExpr("load", "", "y")])] }),
    ]);
    assert.equal(out.i, 5);
  });

  it("branch picks the taken arm: if true → 1 else 2", async () => {
    const out = await runGIR([
      gStmt({ op: "branch", expr: [constB(true)],
        body: [gStmt({ op: "ret", expr: [constI(1)] })],
        elseBody: [gStmt({ op: "ret", expr: [constI(2)] })] }),
    ]);
    assert.equal(out.i, 1);
  });

  it("loop accumulates: sum i=1..3 → 6", async () => {
    const out = await runGIR([
      gStmt({ op: "store", name: "s", expr: [constI(0)] }),
      gStmt({ op: "store", name: "i", expr: [constI(1)] }),
      gStmt({ op: "loop", expr: [gExpr("binop", "Bool", "le", [gExpr("load", "", "i"), constI(3)])],
        body: [
          gStmt({ op: "store", name: "s", expr: [gExpr("binop", "Int", "add", [gExpr("load", "", "s"), gExpr("load", "", "i")])] }),
          gStmt({ op: "store", name: "i", expr: [gExpr("binop", "Int", "add", [gExpr("load", "", "i"), constI(1)])] }),
        ] }),
      gStmt({ op: "ret", expr: [gExpr("load", "", "s")] }),
    ]);
    assert.equal(out.i, 6);
  });

  it("unary neg and comparison: return -4 → -4; 3 < 5 → true", async () => {
    assert.equal((await runGIR([gStmt({ op: "ret", expr: [gExpr("unop", "", "neg", [constI(4)])] })])).i, -4);
    const cmp = await runGIR([gStmt({ op: "ret", expr: [gExpr("binop", "Bool", "lt", [constI(3), constI(5)])] })]);
    assert.equal(cmp.ty, "Bool");
    assert.equal(cmp.b, true);
  });

  it("reads params from the initial environment: return a (a=7) → 7", async () => {
    const env = [vRec({ name: vStr("a"), val: vRec({ ty: vStr("Int"), i: vInt(7), b: vBool(false) }) })];
    assert.equal((await runGIR([gStmt({ op: "ret", expr: [gExpr("load", "", "a")] })], env)).i, 7);
  });

  // Regression: Bool eq/ne must compare the boolean payload (.b), not .i (which is
  // pinned to 0 for Bools — comparing .i made all Bools compare equal).
  it("Bool equality compares the boolean payload", async () => {
    const eq = (x, y) => runGIR([gStmt({ op: "ret", expr: [gExpr("binop", "Bool", "eq", [constB(x), constB(y)])] })]);
    const ne = (x, y) => runGIR([gStmt({ op: "ret", expr: [gExpr("binop", "Bool", "ne", [constB(x), constB(y)])] })]);
    assert.equal((await eq(true, false)).b, false);
    assert.equal((await eq(true, true)).b, true);
    assert.equal((await ne(true, false)).b, true);
    assert.equal((await ne(false, false)).b, false);
  });

  it("integer div / ne / ge (div-by-zero yields 0 by design)", async () => {
    const bin = (op, ty, x, y) => runGIR([gStmt({ op: "ret", expr: [gExpr("binop", ty, op, [constI(x), constI(y)])] })]);
    assert.equal((await bin("div", "Int", 20, 4)).i, 5);
    assert.equal((await bin("div", "Int", 5, 0)).i, 0);
    assert.equal((await bin("ne", "Bool", 3, 4)).b, true);
    assert.equal((await bin("ge", "Bool", 5, 5)).b, true);
    assert.equal((await bin("gt", "Bool", 4, 9)).b, false);
  });
});

// ── Cross-flow call execution: runProgram over a flow table ────
const flowEntry = (name, params, body) =>
  vRec({ name: vStr(name), params: vList(params.map(vStr)), body: vList(body) });
const rtIntArg = (n) => vRec({ ty: vStr("Int"), i: vInt(n), b: vBool(false) });

async function runProgram(table, entryName, args) {
  const r = await executeFlow(
    "runProgram",
    new Map([["flows", vList(table)], ["entryName", vStr(entryName)], ["args", vList(args)]]),
    program.ast, program.flows, undefined, undefined, { pureFastPath: false }, undefined, undefined,
  );
  const runResult = r.value ?? r;
  // runProgram returns RunResult { retVal, auditLog } — extract retVal
  const v = runResult.fields?.get("retVal") ?? runResult;
  return { ty: v.fields.get("ty").value, i: v.fields.get("i").value, b: v.fields.get("b").value };
}

describe("runtime.spore — runProgram (cross-flow call)", () => {
  it("single-arg flow: double(x) = return x + x; double(21) → 42", async () => {
    const double = flowEntry("double", ["x"], [
      gStmt({ op: "ret", expr: [gExpr("binop", "Int", "add", [gExpr("load", "", "x"), gExpr("load", "", "x")])] }),
    ]);
    assert.equal((await runProgram([double], "double", [rtIntArg(21)])).i, 42);
  });

  it("two-flow program: main() calls addOne(n) = return n + 1; main → 42", async () => {
    const addOne = flowEntry("addOne", ["n"], [
      gStmt({ op: "ret", expr: [gExpr("binop", "Int", "add", [gExpr("load", "", "n"), constI(1)])] }),
    ]);
    const main = flowEntry("main", [], [
      gStmt({ op: "ret", expr: [gExpr("call", "Int", "addOne", [constI(41)])] }),
    ]);
    assert.equal((await runProgram([addOne, main], "main", [])).i, 42);
  });

  it("recursion: fib(n) over the flow table; fib(10) → 55", async () => {
    const fib = flowEntry("fib", ["n"], [
      gStmt({ op: "branch",
        expr: [gExpr("binop", "Bool", "lt", [gExpr("load", "", "n"), constI(2)])],
        body: [gStmt({ op: "ret", expr: [gExpr("load", "", "n")] })],
        elseBody: [gStmt({ op: "ret", expr: [gExpr("binop", "Int", "add", [
          gExpr("call", "Int", "fib", [gExpr("binop", "Int", "sub", [gExpr("load", "", "n"), constI(1)])]),
          gExpr("call", "Int", "fib", [gExpr("binop", "Int", "sub", [gExpr("load", "", "n"), constI(2)])]),
        ])] })] }),
    ]);
    assert.equal((await runProgram([fib], "fib", [rtIntArg(10)])).i, 55);
  });

  it("missing callee resolves to Int 0 (empty sentinel entry)", async () => {
    const main = flowEntry("main", [], [
      gStmt({ op: "ret", expr: [gExpr("call", "Int", "nope", [])] }),
    ]);
    assert.equal((await runProgram([main], "main", [])).i, 0);
  });
});
