/**
 * Self-hosted runtime dispatcher (runtime.fungi) — execution tests.
 *
 * Exercises the Stage B tier-selection logic by executing the .fungi flows
 * through the production interpreter and asserting their outputs. Guards the
 * cache-eligibility regression where `if c { let cacheStr = ... }` shadowed the
 * outer binding instead of reassigning it (must be `mut` + assignment).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseProgram, executeFlow, createCapabilityHost, createContractEnforcer } from "../dist/index.js";

const __dir = dirname(fileURLToPath(import.meta.url));
const RUNTIME_FUNGI = join(__dir, "..", "src", "self-hosted", "runtime.fungi");

const program = parseProgram(readFileSync(RUNTIME_FUNGI, "utf8"), "runtime.fungi");

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

describe("runtime.fungi — parses clean", () => {
  it("has zero parse errors", () => {
    const errors = program.diagnostics.filter((d) => d.severity === "error");
    assert.equal(errors.length, 0, errors.map((e) => e.message).join(", "));
  });
});

describe("runtime.fungi — selectTier", () => {
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

describe("runtime.fungi — isCacheEligible", () => {
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

describe("runtime.fungi — buildExecutionPlan (cache regression guard)", () => {
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

// An RtValue (the runtime's value record) + a caller that passes RtValue records directly (argsOf
// only auto-wraps primitives). Used for the applyBinop unknown-op harden below.
const emptyList = vList([]);
const rtInt = (n) => vRec({ ty: vStr("Int"), i: vInt(n), b: vBool(false), s: vStr(""), tag: vStr(""), payload: emptyList, fields: emptyList });
const rtString = (s) => vRec({ ty: vStr("String"), i: vInt(0), b: vBool(false), s: vStr(s), tag: vStr(""), payload: emptyList, fields: emptyList });
async function callRt(flowName, argMap) {
  const r = await executeFlow(flowName, argMap, program.ast, program.flows, undefined, undefined, { pureFastPath: false }, undefined, undefined);
  return r.value ?? r;
}

describe("runtime.fungi — applyBinop unknown-op harden (RD-0528; R&D 0256/0258)", () => {
  // The unknown-op fail-CLOSED harden (runtime.fungi:273-274). R&D 0258 corrected 0256: this path IS
  // source-reachable — gir-emitter's opcodeOf maps the logical operators `and`/`or` (and any operator
  // outside applyBinop's set) to op="unknown", so `true and false` routes here. Pins the harden (my 0256
  // claim that it was already unit-tested was WRONG — retracted; this is that missing test).
  it("non-vacuity control: a KNOWN opcode computes — add(1,2) = 3 (applyBinop takes OPCODES, not symbols)", async () => {
    const r = await callRt("applyBinop", new Map([["op", vStr("add")], ["a", rtInt(1)], ["b", rtInt(2)]]));
    assert.equal(field(r, "ty"), "Int");
    assert.equal(field(r, "i"), 3);
  });
  it("★ op='unknown' (what opcodeOf yields for and/or/%) fails CLOSED to Err", async () => {
    const r = await callRt("applyBinop", new Map([["op", vStr("unknown")], ["a", rtInt(1)], ["b", rtInt(2)]]));
    assert.equal(field(r, "ty"), "tag");
    assert.equal(field(r, "tag"), "Err");
  });
  it("a bogus operator symbol also fails closed (not only the literal 'unknown')", async () => {
    const r = await callRt("applyBinop", new Map([["op", vStr("@@@")], ["a", rtInt(1)], ["b", rtInt(2)]]));
    assert.equal(field(r, "ty"), "tag");
    assert.equal(field(r, "tag"), "Err");
  });
});

describe("runtime.fungi - String ordering uses value, not the zeroed Int carrier", () => {
  for (const [op, left, right, expected] of [
    ["lt", "alpha", "beta", true],
    ["lt", "beta", "alpha", false],
    ["le", "same", "same", true],
    ["gt", "beta", "alpha", true],
    ["ge", "same", "same", true],
  ]) {
    it(`${op}(${JSON.stringify(left)}, ${JSON.stringify(right)}) -> ${expected}`, async () => {
      const result = await callRt("applyBinop", new Map([
        ["op", vStr(op)],
        ["a", rtString(left)],
        ["b", rtString(right)],
      ]));
      assert.equal(field(result, "ty"), "Bool");
      assert.equal(field(result, "b"), expected);
    });
  }
});

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

describe("runtime.fungi — GIR evaluator (S7)", () => {
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

  it("uses Array methods on a local binding named env without treating them as secret reads", async () => {
    const args = new Map([
      ["env", vList([])],
      ["name", vStr("a")],
      ["v", rtInt(7)],
    ]);
    const bound = await callRt("envBind", args);
    assert.equal(bound.__tag, "list", "env.append must operate on the local Array binding");
    assert.equal(bound.items.length, 1);

    const lookupArgs = new Map([
      ["env", bound],
      ["name", vStr("a")],
    ]);
    const found = await callRt("envLookup", lookupArgs);
    assert.equal(field(found, "ty"), "Int");
    assert.equal(field(found, "i"), 7, "env.count/env.get must read the bound collection");

    const host = createCapabilityHost({
      declaredEffects: new Set(),
      enforcer: createContractEnforcer(undefined, "envBind", {}),
    });
    const hostedBind = await executeFlow(
      "envBind", args, program.ast, program.flows, undefined, host, { pureFastPath: false },
    );
    assert.equal(hostedBind.value.__tag, "list", "ordinary env.append must not be sent to a capability host");
    const hostedLookup = await executeFlow(
      "envLookup", lookupArgs, program.ast, program.flows, undefined, host, { pureFastPath: false },
    );
    assert.equal(field(hostedLookup.value, "i"), 7);
    assert.equal(host.observedEffects.size, 0, "local collection access is not a secret.read capability");
  });

  it("keeps real Env/env secret access refused without a capability host", async () => {
    for (const [caseName, access] of [
      ["uppercase namespace", 'Env.get("RUNTIME_TEST_SECRET")'],
      ["lowercase getter", 'env.get("RUNTIME_TEST_SECRET")'],
      ["lowercase secret accessor", 'env.secret("RUNTIME_TEST_SECRET")'],
    ]) {
      const secretProgram = parseProgram(`
secure flow readSecret(name: String) -> Result<String, Error>
contract { effects { secret.read } }
{ return ${access} }
`, `runtime-env-capability-${caseName}.fungi`);
      const result = await executeFlow(
        "readSecret",
        new Map(),
        secretProgram.ast,
        secretProgram.flows,
        undefined,
        undefined,
        { pureFastPath: false },
      );
      assert.equal(result.value.__tag, "err", `${caseName} must refuse without a capability host`);
      assert.match(result.value.error.value, /CapabilityError: environment reads require a capability host/);

      const host = createCapabilityHost({
        declaredEffects: new Set(),
        enforcer: createContractEnforcer(undefined, "readSecret", {}),
      });
      const hostResult = await executeFlow(
        "readSecret",
        new Map(),
        secretProgram.ast,
        secretProgram.flows,
        undefined,
        host,
        { pureFastPath: false },
      );
      assert.equal(hostResult.value.__tag, "err", `${caseName} must route through the denying host`);
      assert.match(hostResult.value.error.value, /Effect 'secret\.read' not declared/);
    }
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

  it("integer div / ne / ge; div-by-zero is a hard terminal trap", async () => {
    const bin = (op, ty, x, y) => runGIR([gStmt({ op: "ret", expr: [gExpr("binop", ty, op, [constI(x), constI(y)])] })]);
    assert.equal((await bin("div", "Int", 20, 4)).i, 5);
    const divZero = await executeFlow(
      "runGIRBody",
      new Map([
        ["stmts", vList([gStmt({ op: "ret", expr: [gExpr("binop", "Int", "div", [constI(5), constI(0)])] })])],
        ["env", vList([])],
      ]),
      program.ast,
      program.flows,
      undefined,
      undefined,
      { pureFastPath: false },
    );
    assert.equal(divZero.value.__tag, "runtimeError");
    assert.match(divZero.value.message, /ERR_DIV_BY_ZERO/);
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
  if (runResult.__tag === "runtimeError") {
    return { ty: "runtimeError", message: runResult.message };
  }
  // runProgram returns RunResult { retVal, auditLog } — extract retVal
  const v = runResult.fields?.get("retVal") ?? runResult;
  return { ty: v.fields.get("ty").value, i: v.fields.get("i").value, b: v.fields.get("b").value };
}

describe("runtime.fungi — runProgram (cross-flow call)", () => {
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

  it("missing nested callee hard-traps instead of executing the empty sentinel", async () => {
    const main = flowEntry("main", [], [
      gStmt({ op: "ret", expr: [gExpr("call", "Int", "nope", [])] }),
    ]);
    const result = await runProgram([main], "main", []);
    assert.equal(result.ty, "runtimeError");
    assert.match(result.message, /ERR_MISSING_FLOW/);
  });

  it("entry invocation hard-traps missing and surplus arguments", async () => {
    const identity = flowEntry("identity", ["x"], [
      gStmt({ op: "ret", expr: [gExpr("load", "", "x")] }),
    ]);
    const missing = await runProgram([identity], "identity", []);
    const surplus = await runProgram([identity], "identity", [rtIntArg(1), rtIntArg(2)]);
    assert.equal(missing.ty, "runtimeError");
    assert.match(missing.message, /ERR_ARGUMENT_COUNT/);
    assert.equal(surplus.ty, "runtimeError");
    assert.match(surplus.message, /ERR_ARGUMENT_COUNT/);
  });
});
