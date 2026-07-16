/**
 * Self-hosted pipeline integration (M-A / M-B bridge).
 *
 * Proves the Stage-B compiler composes end-to-end IN Galerina: a source string is
 * lexed by lexer.fungi, the token stream is parsed by parser.fungi, and the resulting
 * flow records are type-checked by type-checker.fungi — with the GalerinaValue outputs
 * of each stage fed directly as the input of the next (no TypeScript stage in the
 * middle of the pipeline for the supported subset).
 *
 * This is the executing exit-evidence for the lexer→parser→type-checker bridge.
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

let lexer, parser, checker, effect, govern, gir, runtime;
before(() => {
  lexer = load("lexer.fungi");
  parser = load("parser.fungi");
  checker = load("type-checker.fungi");
  effect = load("effect-checker.fungi");
  govern = load("governance-verifier.fungi");
  gir = load("gir-emitter.fungi");
  runtime = load("runtime.fungi");
});

const vStr = (s) => ({ __tag: "string", value: s });

async function pipeline(source) {
  // 1. lexer.fungi: source -> Result<Array<Token>>
  const lexRes = await executeFlow("tokenize", new Map([["source", vStr(source)]]), lexer.ast);
  let tokensVal = lexRes.value ?? lexRes;
  if (tokensVal.__tag === "ok") tokensVal = tokensVal.value;

  // 2. parser.fungi: tokens -> ParseResult { flows, errors }
  const parseRes = await executeFlow("parseFlows", new Map([["tokens", tokensVal]]), parser.ast);
  const prRec = parseRes.value ?? parseRes;
  const flowsVal = prRec.fields.get("flows");

  // 3. type-checker.fungi: return-expr check (checkFlows) + full body check (checkFlowBodies)
  const readDiags = (res) =>
    (res.value ?? res).fields.get("diagnostics").items.map((d) => {
      const x = d.value ?? d;
      return { code: x.fields.get("code").value, flowName: x.fields.get("flowName").value };
    });
  const checkRes = await executeFlow("checkFlows", new Map([["flows", flowsVal]]), checker.ast);
  const diags = readDiags(checkRes);
  const bodyRes = await executeFlow("checkFlowBodies", new Map([["flows", flowsVal]]), checker.ast);
  const bodyDiags = readDiags(bodyRes);

  const flows = flowsVal.items.map((f) => {
    const fr = f.value ?? f;
    const re = fr.fields.get("returnExpr").value ?? fr.fields.get("returnExpr");
    const body = fr.fields.get("body").items.map((s) => (s.value ?? s).fields.get("kind").value);
    return {
      name: fr.fields.get("name").value,
      returnType: fr.fields.get("returnType").value,
      exprKind: re.fields.get("kind").value,
      litType: re.fields.get("litType").value,
      body,
    };
  });

  return { tokenCount: tokensVal.items.length, flows, diags, bodyDiags };
}

describe("self-hosted pipeline — lexer → parser → type-checker (M-A/M-B)", () => {
  it("a clean program flows through all three stages with zero type diagnostics", async () => {
    const { flows, diags } = await pipeline(`pure flow add(a: Int, b: Int) -> Int { return a }`);
    assert.equal(flows.length, 1);
    assert.equal(flows[0].name, "add");
    assert.equal(flows[0].returnType, "Int");
    assert.equal(flows[0].exprKind, "param");
    assert.deepEqual(diags, []);
  });

  it("a String returned where Int is declared is caught as FUNGI-TYPE-008 by the self-hosted checker", async () => {
    const { flows, diags } = await pipeline(`pure flow bad() -> Int { return "hello" }`);
    assert.equal(flows[0].exprKind, "literal");
    assert.equal(flows[0].litType, "String");
    assert.deepEqual(diags, [{ code: "FUNGI-TYPE-008", flowName: "bad" }]);
  });

  it("multiple flows: only the mismatching one is flagged (good passes, bad fails)", async () => {
    const { flows, diags } = await pipeline(
      `pure flow good(a: Int, b: Int) -> Int { return a }\npure flow bad() -> Int { return "hello" }`,
    );
    assert.equal(flows.length, 2);
    assert.deepEqual(diags, [{ code: "FUNGI-TYPE-008", flowName: "bad" }]);
  });

  it("a literal return matching its declared type produces no diagnostic", async () => {
    const { flows, diags } = await pipeline(`pure flow answer() -> Int { return 42 }`);
    assert.equal(flows[0].exprKind, "literal");
    assert.equal(flows[0].litType, "Int");
    assert.deepEqual(diags, []);
  });
});

describe("self-hosted pipeline — full body AST + body type-check (M-A fold → M-B)", () => {
  it("parseFlows now attaches a full statement body AST to each flow", async () => {
    const { flows } = await pipeline(
      `pure flow fib(n: Int) -> Int { if n < 2 { return n }\nreturn fib(n - 1) + fib(n - 2) }`,
    );
    assert.deepEqual(flows[0].body, ["if", "return"]);
  });

  it("checkFlowBodies catches a bad let binding in the body via the real parser", async () => {
    const { bodyDiags } = await pipeline(
      `pure flow good() -> Int { let a: Int = 1\nreturn a }\npure flow bad() -> Int { let x: Int = "oops"\nreturn 0 }`,
    );
    assert.deepEqual(bodyDiags, [{ code: "FUNGI-TYPE-002", flowName: "bad" }]);
  });

  it("a clean body produces no body diagnostics", async () => {
    const { bodyDiags } = await pipeline(`pure flow f() -> Int { let a: Int = 1\nmut b: Int = 2\nreturn a }`);
    assert.deepEqual(bodyDiags, []);
  });

  it("a null initializer via the REAL parser → 002 + 025 (SILENT_NULL_DENIED)", async () => {
    // `null` parses to an identifier node (value "null"), not a literal. The twin's value-keyed nullish
    // branch must fire on that real representation — this proves it, not just the hand-built differential.
    const { bodyDiags } = await pipeline(`pure flow f() -> Int { let x: Int = null\nreturn 0 }`);
    const codes = bodyDiags.filter((d) => d.flowName === "f").map((d) => d.code).sort();
    assert.deepEqual(codes, ["FUNGI-TYPE-002", "FUNGI-TYPE-025"]);
  });

  it("FUNGI-TYPE-014: a flow calling an effectful callee without declaring the effect, via the REAL parser", async () => {
    // Proves the cross-flow effect check on the REAL self-hosted parse: the parser must populate each
    // flow's `effects` field from `contract { effects { … } }` AND emit the call as a `call` expr the
    // twin's collector recognises. The isTensor/025 representation trap lives exactly here.
    const { bodyDiags } = await pipeline(
      `flow fetchRate() -> Int\n  contract { effects { network.outbound } }\n{ return 0 }\nflow computeRate() -> Int {\n  let r = fetchRate()\n  return 0\n}`,
    );
    const codes = bodyDiags.filter((d) => d.flowName === "computeRate").map((d) => d.code);
    assert.ok(codes.includes("FUNGI-TYPE-014"), `expected 014 on computeRate, got: ${codes.join(", ")}`);
  });

  it("FUNGI-BINDING-005: reassigning a let binding via the REAL parser", async () => {
    // Proves the immutable-reassignment check on the real self-hosted parse: the parser emits let/mut
    // with `.name` and the reassignment as `{kind:"assign", name}` — the twin's collector keys on that.
    const { bodyDiags } = await pipeline(`pure flow f() -> Int {\n  let x: Int = 1\n  x = 2\n  return 0\n}`);
    const codes = bodyDiags.filter((d) => d.flowName === "f").map((d) => d.code);
    assert.ok(codes.includes("FUNGI-BINDING-005"), `expected BINDING-005 on f, got: ${codes.join(", ")}`);
  });
});

// ── effect + governance over the parsed body AST (M-B continued) ──
async function flowsFrom(source) {
  const lexRes = await executeFlow("tokenize", new Map([["source", vStr(source)]]), lexer.ast);
  let toks = lexRes.value ?? lexRes;
  if (toks.__tag === "ok") toks = toks.value;
  const parseRes = await executeFlow("parseFlows", new Map([["tokens", toks]]), parser.ast);
  return (parseRes.value ?? parseRes).fields.get("flows");
}
const codesOn = (res) =>
  (res.value ?? res).fields.get("diagnostics").items.map((d) => {
    const x = d.value ?? d;
    return { code: x.fields.get("code").value, flowName: x.fields.get("flowName").value };
  });

describe("self-hosted pipeline — effect + governance over the parsed body AST (M-B)", () => {
  it("effect-checker derives undeclared effect use from the body's calls", async () => {
    const flows = await flowsFrom(`secure flow charge() -> Int { dbWrite(amount)\nreturn 0 }`);
    const r = await executeFlow("checkBodyEffects", new Map([["flows", flows]]), effect.ast);
    assert.deepEqual(codesOn(r), [{ code: "FUNGI-EFFECT-001", flowName: "charge" }]);
  });

  it("FUNGI-EFFECT-008: a plain flow declaring a privileged effect (secret.read), via the REAL parser", async () => {
    // Proves 008 on the real parse: the parser produces kind "flow" + effects [secret.read] (leg-0
    // confirmed), and checkFlowEffects — the declared-vs-used reconciliation, where 008 lives — flags it.
    const flows = await flowsFrom(`flow f() -> Int\n  contract { effects { secret.read } }\n{ return 0 }`);
    const r = await executeFlow("checkFlowEffects", new Map([["flows", flows]]), effect.ast);
    const codes = codesOn(r).filter((d) => d.flowName === "f").map((d) => d.code);
    assert.ok(codes.includes("FUNGI-EFFECT-008"), `expected 008 on f, got: ${codes.join(", ")}`);
  });

  it("governance flags a secure flow that never audits in its body", async () => {
    const flows = await flowsFrom(`secure flow charge() -> Int { dbWrite(amount)\nreturn 0 }`);
    const r = await executeFlow("checkBodyGovernance", new Map([["flows", flows]]), govern.ast);
    assert.deepEqual(codesOn(r), [{ code: "FUNGI-VAL-001", flowName: "charge" }]);
  });

  it("a secure flow that calls auditWrite in its body passes governance", async () => {
    const flows = await flowsFrom(`secure flow safe() -> Int { auditWrite(amount)\nreturn 0 }`);
    const r = await executeFlow("checkBodyGovernance", new Map([["flows", flows]]), govern.ast);
    assert.deepEqual(codesOn(r), []);
  });
});

describe("self-hosted pipeline — GIR emission over the parsed body AST (M-B emit)", () => {
  const readGStmt = (n) => {
    const x = n.value ?? n;
    return {
      op: x.fields.get("op").value,
      name: x.fields.get("name").value,
      exprOps: x.fields.get("expr").items.map((e) => (e.value ?? e).fields.get("op").value),
      body: x.fields.get("body").items.map(readGStmt),
    };
  };

  it("lowers a real fib body to GIR (branch + ret with a binop of two calls)", async () => {
    const flows = await flowsFrom(
      `pure flow fib(n: Int) -> Int { if n < 2 { return n }\nreturn fib(n - 1) + fib(n - 2) }`,
    );
    const fib = flows.items[0].value ?? flows.items[0];
    const body = fib.fields.get("body");
    const res = await executeFlow("emitBodyGIR", new Map([["stmts", body]]), gir.ast);
    const stmts = (res.value ?? res).items.map(readGStmt);
    assert.deepEqual(stmts.map((s) => s.op), ["branch", "ret"]);
    // the branch condition is a comparison binop; its body is a single ret
    assert.equal(stmts[0].exprOps[0], "binop");
    assert.equal(stmts[0].body[0].op, "ret");
    // the final return lowers to a binop (add) whose kids are two calls
    const finalRet = stmts[1];
    assert.equal(finalRet.exprOps[0], "binop");
  });

  it("lowers let/return bindings in a real body", async () => {
    const flows = await flowsFrom(`pure flow f() -> Int { let x: Int = 1 + 2\nreturn x }`);
    const fr = flows.items[0].value ?? flows.items[0];
    const res = await executeFlow("emitBodyGIR", new Map([["stmts", fr.fields.get("body")]]), gir.ast);
    const stmts = (res.value ?? res).items.map(readGStmt);
    assert.deepEqual(stmts.map((s) => s.op), ["store", "ret"]);
    assert.equal(stmts[0].name, "x");
    assert.equal(stmts[0].exprOps[0], "binop");
  });
});

describe("self-hosted pipeline — new grammar forms reach all downstream stages", () => {
  const elseLen = (n) => (n.value ?? n).fields.get("elseBody").items.length;

  it("GIR: a real if/else body lowers to a branch carrying a non-empty elseBody", async () => {
    const flows = await flowsFrom(`pure flow f() -> Int { if c { return 1 } else { return 2 } }`);
    const body = (flows.items[0].value ?? flows.items[0]).fields.get("body");
    const res = await executeFlow("emitBodyGIR", new Map([["stmts", body]]), gir.ast);
    const branch = (res.value ?? res).items[0];
    assert.equal((branch.value ?? branch).fields.get("op").value, "branch");
    assert.equal((branch.value ?? branch).fields.get("body").items.length, 1);
    assert.equal(elseLen(branch), 1);
  });

  it("effect-check: an effectful call in the ELSE branch is caught", async () => {
    const flows = await flowsFrom(`secure flow charge() -> Int { if ok { return 0 } else { dbWrite(amt)\nreturn 0 } }`);
    const r = await executeFlow("checkBodyEffects", new Map([["flows", flows]]), effect.ast);
    assert.deepEqual(codesOn(r), [{ code: "FUNGI-EFFECT-001", flowName: "charge" }]);
  });

  it("govern: an audit call in the ELSE branch satisfies a secure flow", async () => {
    const flows = await flowsFrom(`secure flow safe() -> Int { if ok { auditWrite(x)\nreturn 0 } else { auditWrite(x)\nreturn 1 } }`);
    const r = await executeFlow("checkBodyGovernance", new Map([["flows", flows]]), govern.ast);
    assert.deepEqual(codesOn(r), []);
  });

  it("govern: a secure flow with no audit in either branch is flagged", async () => {
    const flows = await flowsFrom(`secure flow bad() -> Int { if ok { return 0 } else { return 1 } }`);
    const r = await executeFlow("checkBodyGovernance", new Map([["flows", flows]]), govern.ast);
    assert.deepEqual(codesOn(r), [{ code: "FUNGI-VAL-001", flowName: "bad" }]);
  });
});

// ── The full chain: source → lex → parse → emit GIR → EXECUTE, all in Galerina (S7 / M-C) ──
describe("self-hosted pipeline — execute the emitted GIR (S7: source→run, in Galerina)", () => {
  const vList = (items) => ({ __tag: "list", items });
  const vRec = (o) => { const f = new Map(); for (const [k, v] of Object.entries(o)) f.set(k, v); return { __tag: "record", fields: f }; };
  const binding = (name, i) => vRec({ name: vStr(name), val: vRec({ ty: vStr("Int"), i: { __tag: "int", value: i }, b: { __tag: "bool", value: false } }) });

  async function execute(source, env = []) {
    const flows = await flowsFrom(source);
    const body = (flows.items[0].value ?? flows.items[0]).fields.get("body");
    const g = await executeFlow("emitBodyGIR", new Map([["stmts", body]]), gir.ast);
    const stmts = g.value ?? g;
    const r = await executeFlow("runGIRBody", new Map([["stmts", stmts], ["env", vList(env)]]), runtime.ast);
    const v = r.value ?? r;
    return { ty: v.fields.get("ty").value, i: v.fields.get("i").value, b: v.fields.get("b").value };
  }

  it("arithmetic with locals: let x=2; let y=3; return x + y → 5", async () => {
    assert.equal((await execute(`pure flow f() -> Int { let x: Int = 2\nlet y: Int = 3\nreturn x + y }`)).i, 5);
  });

  it("branch: if true { return 1 } else { return 2 } → 1", async () => {
    assert.equal((await execute(`pure flow f() -> Int { if true { return 1 } else { return 2 } }`)).i, 1);
  });

  it("while loop: sum 1..5 → 15", async () => {
    const src = `pure flow f() -> Int { mut s: Int = 0\nmut i: Int = 1\nwhile i <= 5 { s = s + i\ni = i + 1 }\nreturn s }`;
    assert.equal((await execute(src)).i, 15);
  });

  it("params from the environment: return a + b with a=10,b=5 → 15", async () => {
    assert.equal((await execute(`pure flow add() -> Int { return a + b }`, [binding("a", 10), binding("b", 5)])).i, 15);
  });

  it("unary + precedence: return -x * 2 with x=4 → -8", async () => {
    assert.equal((await execute(`pure flow f() -> Int { return -x * 2 }`, [binding("x", 4)])).i, -8);
  });

  it("comparison returns a Bool: return 3 < 5 → true", async () => {
    const v = await execute(`pure flow f() -> Bool { return 3 < 5 }`);
    assert.equal(v.ty, "Bool");
    assert.equal(v.b, true);
  });
});

// ── M-C: a recursive, MULTI-FLOW program compiles AND runs in Galerina ──
describe("self-hosted pipeline — multi-flow + recursion (M-C: Galerina runs Galerina)", () => {
  const vList = (items) => ({ __tag: "list", items });
  const vRec = (o) => { const f = new Map(); for (const [k, v] of Object.entries(o)) f.set(k, v); return { __tag: "record", fields: f }; };
  const intArg = (n) => vRec({ ty: vStr("Int"), i: { __tag: "int", value: n }, b: { __tag: "bool", value: false } });

  async function runProgram(source, entry, args = []) {
    const flows = await flowsFrom(source);
    const tbl = await executeFlow("buildFlowTable", new Map([["flows", flows]]), gir.ast);
    const table = tbl.value ?? tbl;
    const res = await executeFlow(
      "runProgram", new Map([["flows", table], ["entryName", vStr(entry)], ["args", vList(args)]]), runtime.ast,
    );
    const runResult = res.value ?? res;
    // runProgram now returns RunResult { retVal, auditLog } — extract retVal
    const v = runResult.fields?.get("retVal") ?? runResult;
    return { ty: v.fields.get("ty").value, i: v.fields.get("i").value, b: v.fields.get("b").value };
  }

  const FIB = `pure flow fib(n: Int) -> Int { if n < 2 { return n } else { return fib(n - 1) + fib(n - 2) } }`;

  it("recursion: fib(10) → 55, computed entirely in Galerina", async () => {
    assert.equal((await runProgram(FIB, "fib", [intArg(10)])).i, 55);
  });

  it("recursion: fib(15) → 610", async () => {
    assert.equal((await runProgram(FIB, "fib", [intArg(15)])).i, 610);
  });

  it("nested cross-flow calls: twice(40) where twice(x)=inc(inc(x)) → 42", async () => {
    const src = `pure flow inc(x: Int) -> Int { return x + 1 }\npure flow twice(x: Int) -> Int { return inc(inc(x)) }`;
    assert.equal((await runProgram(src, "twice", [intArg(40)])).i, 42);
  });

  it("recursion with accumulation: sumTo(100) → 5050", async () => {
    const src = `pure flow sumTo(n: Int) -> Int { if n == 0 { return 0 } else { return n + sumTo(n - 1) } }`;
    assert.equal((await runProgram(src, "sumTo", [intArg(100)])).i, 5050);
  });
});
