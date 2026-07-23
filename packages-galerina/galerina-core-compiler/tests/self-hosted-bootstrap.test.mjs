/**
 * R6 bootstrap conformance gate — Stage A (TS) == Stage B (self-hosted), full parity.
 *
 * For each corpus flow (tests/r6-corpus/r6-00N-*.fungi) the SAME source is executed by:
 *   Stage A — parseProgram + executeFlow (the production TS interpreter)
 *   Stage B — self-hosted pipeline: lexer.fungi → parser.fungi → gir-emitter.fungi(buildFlowTable)
 *             → runtime.fungi(runProgram), all interpreted Galerina
 * and the return VALUES are normalized to a canonical string and asserted equal.
 *
 * This is the 100%-Axis-B marker: Galerina compiles AND runs Galerina at parity with the
 * TS reference for the supported subset. Flows are added per R-phase as the self-hosted
 * runtime widens (R1 strings/Result → R6-001; R2 records/lists → 002/003; R4 → 004; R5 → 005).
 */

import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseProgram, resolveSymbols, checkTypes, executeFlow } from "../dist/index.js";

const __dir = dirname(fileURLToPath(import.meta.url));
const SH = join(__dir, "..", "src", "self-hosted");
const CORPUS = join(__dir, "r6-corpus");

function loadSH(file) {
  const p = parseProgram(readFileSync(join(SH, file), "utf8"), file);
  resolveSymbols(p.ast);
  checkTypes(p.ast);
  const errs = p.diagnostics.filter((d) => d.severity === "error");
  assert.equal(errs.length, 0, `${file}: ${errs.map((e) => e.message).join("; ")}`);
  return p;
}

let lexer, parser, gir, rt;
before(() => {
  lexer = loadSH("lexer.fungi");
  parser = loadSH("parser.fungi");
  gir = loadSH("gir-emitter.fungi");
  rt = loadSH("runtime.fungi");
});

// ── value builders (Stage B harness) ──
const vStr = (s) => ({ __tag: "string", value: String(s) });
const vInt = (n) => ({ __tag: "int", value: n });
const vBool = (x) => ({ __tag: "bool", value: x });
const vList = (items) => ({ __tag: "list", items });
const vRec = (o) => { const f = new Map(); for (const [k, v] of Object.entries(o)) f.set(k, v); return { __tag: "record", fields: f }; };
// RtValue args for the self-hosted runtime
const emptyList = vList([]);
const rtInt = (n) => vRec({ ty: vStr("Int"), i: vInt(n), b: vBool(false), s: vStr(""), tag: vStr(""), payload: emptyList, fields: emptyList });
// Build an RtValue record (for passing struct params like Point{x,y} to the self-hosted runtime)
const rtRecord = (pairs) => {
  const items = [];
  for (const [name, val] of pairs) {
    items.push(vRec({ ty: vStr("String"), i: vInt(0), b: vBool(false), s: vStr(name), tag: vStr(""), payload: emptyList, fields: emptyList }));
    items.push(val);
  }
  return vRec({ ty: vStr("record"), i: vInt(0), b: vBool(false), s: vStr(""), tag: vStr(""), payload: emptyList, fields: vList(items) });
};

// ── canonical normalization (both stages → the same string) ──
function normA(v) {
  if (v == null) return "null";
  const x = v.value !== undefined && v.__tag === undefined ? v.value : v; // unwrap nothing fancy
  switch (x.__tag) {
    case "ok": return `Ok(${normA(x.value)})`;
    case "err": return `Err(${normA(x.error ?? x.value)})`;
    case "some": return `Some(${normA(x.value)})`;
    case "none": return "None";
    case "string": return `"${x.value}"`;
    case "int": return String(x.value);
    case "bool": return String(x.value);
    default: return JSON.stringify(x);
  }
}
function normB(rec) {
  const v = rec.value ?? rec;
  const ty = v.fields.get("ty").value;
  if (ty === "Int") return String(v.fields.get("i").value);
  if (ty === "Bool") return String(v.fields.get("b").value);
  if (ty === "String") return `"${v.fields.get("s").value}"`;
  if (ty === "tag") {
    const tag = v.fields.get("tag").value;
    const pl = v.fields.get("payload").items;
    if (pl.length === 0) return tag; // None
    return `${tag}(${normB(pl[0])})`;
  }
  return `<${ty}>`;
}

async function stageA(src, flow, argsObj) {
  const p = parseProgram(src, "corpus.fungi");
  const r = await executeFlow(flow, new Map(Object.entries(argsObj)), p.ast);
  return normA(r);
}
// Driver refusal (R&D 0050 / FUNGI-PARSE fail-closed): refuse to feed downstream stages when the
// parser reported errors — an unread error array is the same fail-open one level up.
function refuseParseErrors(prRec, who) {
  const errs = prRec.fields.get("errors");
  assert.deepEqual(
    errs?.__tag === "list" ? errs.items.map((e) => e.value ?? e) : ["<missing errors list>"],
    [],
    `self-hosted parser reported errors — ${who} driver refuses (FUNGI-PARSE fail-closed)`,
  );
}
async function stageB(src, flow, rtArgs) {
  const lx = await executeFlow("tokenize", new Map([["source", vStr(src)]]), lexer.ast);
  let toks = lx.value ?? lx; if (toks.__tag === "ok") toks = toks.value;
  const pr = await executeFlow("parseFlows", new Map([["tokens", toks]]), parser.ast);
  const prRec = pr.value ?? pr;
  refuseParseErrors(prRec, "stageB");
  const flows = prRec.fields.get("flows");
  const tbl = await executeFlow("buildFlowTable", new Map([["flows", flows]]), gir.ast);
  const res = await executeFlow("runProgram", new Map([["flows", tbl.value ?? tbl], ["entryName", vStr(flow)], ["args", vList(rtArgs)]]), rt.ast);
  // runProgram now returns RunResult { retVal, auditLog } — extract retVal
  const runResult = res.value ?? res;
  const retVal = runResult.fields?.get("retVal") ?? runResult;
  return normB(retVal);
}

// Assert Stage A and Stage B agree, and (optionally) match an expected canonical value.
async function conform(file, flow, argsObj, rtArgs, expected) {
  const src = readFileSync(join(CORPUS, file), "utf8");
  const a = await stageA(src, flow, argsObj);
  const b = await stageB(src, flow, rtArgs);
  assert.equal(b, a, `Stage A/B mismatch for ${flow}(${JSON.stringify(argsObj)}): A=${a} B=${b}`);
  if (expected !== undefined) assert.equal(a, expected, `unexpected value for ${flow}: ${a}`);
  return a;
}

describe("R6 bootstrap conformance — Stage A == Stage B (full parity)", () => {
  describe("R6-001 classify (R1: strings + Result + contract.types)", () => {
    it("classify(70) → Ok(\"pass\")", async () => {
      await conform("r6-001-classify.fungi", "classify", { score: vInt(70) }, [rtInt(70)], 'Ok("pass")');
    });
    it("classify(20) → Ok(\"fail\")", async () => {
      await conform("r6-001-classify.fungi", "classify", { score: vInt(20) }, [rtInt(20)], 'Ok("fail")');
    });
    it("classify(-5) → Err(\"negative\")", async () => {
      await conform("r6-001-classify.fungi", "classify", { score: vInt(-5) }, [rtInt(-5)], 'Err("negative")');
    });
  });

  describe("R6-002 distanceSq (R2: records + field access)", () => {
    // Stage A receives a native JS record; Stage B receives an RtValue record.
    // Both must agree and produce Int:25 for Point{x:3,y:4} (3²+4²=25).
    it("distanceSq({x:3,y:4}) → 25", async () => {
      const stageAPoint = { __tag: "record", fields: new Map([["x", vInt(3)], ["y", vInt(4)]]) };
      const stageBPoint = rtRecord([["x", rtInt(3)], ["y", rtInt(4)]]);
      await conform("r6-002-distance.fungi", "distanceSq", { p: stageAPoint }, [stageBPoint], "25");
    });
    it("distanceSq({x:0,y:5}) → 25", async () => {
      const stageAPoint = { __tag: "record", fields: new Map([["x", vInt(0)], ["y", vInt(5)]]) };
      const stageBPoint = rtRecord([["x", rtInt(0)], ["y", rtInt(5)]]);
      await conform("r6-002-distance.fungi", "distanceSq", { p: stageAPoint }, [stageBPoint], "25");
    });
  });

  describe("R6-003 listLen (R2: array literal + .count())", () => {
    it("listLen() → 4", async () => {
      await conform("r6-003-listlen.fungi", "listLen", {}, [], "4");
    });
  });

  describe("R6-004 recordAmount (R4: secure flow + effects + AuditLog.write)", () => {
    it("recordAmount(5) → Ok(5)", async () => {
      await conform("r6-004-record-amount.fungi", "recordAmount", { amount: vInt(5) }, [rtInt(5)], 'Ok(5)');
    });
    it("recordAmount(0) → Ok(0)", async () => {
      await conform("r6-004-record-amount.fungi", "recordAmount", { amount: vInt(0) }, [rtInt(0)], 'Ok(0)');
    });
  });

  describe("R6-005 nameOf (R5: match + Option)", () => {
    it("nameOf(1) → Some(\"alpha\")", async () => {
      await conform("r6-005-name-of.fungi", "nameOf", { code: vInt(1) }, [rtInt(1)], 'Some("alpha")');
    });
    it("nameOf(2) → Some(\"beta\")", async () => {
      await conform("r6-005-name-of.fungi", "nameOf", { code: vInt(2) }, [rtInt(2)], 'Some("beta")');
    });
    it("nameOf(9) → None", async () => {
      await conform("r6-005-name-of.fungi", "nameOf", { code: vInt(9) }, [rtInt(9)], "None");
    });
  });
});

// ── Widening tests — features beyond the 5-corpus-flow subset ─────────────────
// These confirm Stage B handles the full language, not just the corpus.
describe("Stage B widening — full language coverage (Stage A == Stage B)", () => {
  async function runB(src, flow, rtArgs) {
    const lx = await executeFlow("tokenize", new Map([["source", vStr(src)]]), lexer.ast);
    let toks = lx.value ?? lx; if (toks.__tag === "ok") toks = toks.value;
    const pr = await executeFlow("parseFlows", new Map([["tokens", toks]]), parser.ast);
    const prRecB = pr.value ?? pr;
    refuseParseErrors(prRecB, "runB");
    const flows = prRecB.fields.get("flows");
    const tbl = await executeFlow("buildFlowTable", new Map([["flows", flows]]), gir.ast);
    const res = await executeFlow("runProgram", new Map([["flows", tbl.value ?? tbl], ["entryName", vStr(flow)], ["args", vList(rtArgs)]]), rt.ast);
    const runResult = res.value ?? res;
    const retVal = runResult.fields?.get("retVal") ?? runResult;
    return normB(retVal);
  }
  async function runBFull(src, flow, rtArgs) {
    const lx = await executeFlow("tokenize", new Map([["source", vStr(src)]]), lexer.ast);
    let toks = lx.value ?? lx; if (toks.__tag === "ok") toks = toks.value;
    const pr = await executeFlow("parseFlows", new Map([["tokens", toks]]), parser.ast);
    const prRecBF = pr.value ?? pr;
    refuseParseErrors(prRecBF, "runBFull");
    const flows = prRecBF.fields.get("flows");
    const tbl = await executeFlow("buildFlowTable", new Map([["flows", flows]]), gir.ast);
    const res = await executeFlow("runProgram", new Map([["flows", tbl.value ?? tbl], ["entryName", vStr(flow)], ["args", vList(rtArgs)]]), rt.ast);
    const runResult = res.value ?? res;
    // Return the full RunResult for audit log access
    return runResult;
  }

  it("list.append + count — Array grows correctly", async () => {
    const src = `pure flow f() -> Int\ncontract{intent{"x"}}\n{let xs: Array<Int> = [1,2]\nlet ys = xs.append(3)\nreturn ys.count()}`;
    const a = await stageA(src, "f", {}); const b = await runB(src, "f", []);
    assert.equal(b, a); assert.equal(a, "3");
  });

  it("match Some(x) destructuring — payload binding works", async () => {
    const src = `pure flow f(v: Int) -> Int\ncontract{intent{"x"}}\n{let opt = Some(v)\nmatch opt{Some(x)=>{return x}None=>{return 0}}}`;
    const a = await stageA(src, "f", { v: vInt(99) }); const b = await runB(src, "f", [rtInt(99)]);
    assert.equal(b, a); assert.equal(a, "99");
  });

  it("String.length() method", async () => {
    const src = `pure flow f(s: String) -> Int\ncontract{intent{"x"}}\n{return s.length()}`;
    const a = await stageA(src, "f", { s: vStr("hello") }); const b = await runB(src, "f", [vRec({ ty: vStr("String"), i: vInt(0), b: vBool(false), s: vStr("hello"), tag: vStr(""), payload: emptyList, fields: emptyList })]);
    assert.equal(b, a); assert.equal(a, "5");
  });

  it("Int.toStr() method — 42 → \"42\" (full parity Stage A == Stage B)", async () => {
    const src = `pure flow f(n: Int) -> String\ncontract{intent{"x"}}\n{return n.toStr()}`;
    const a = await stageA(src, "f", { n: vInt(42) }); const b = await runB(src, "f", [rtInt(42)]);
    assert.equal(b, a, `Stage A/B mismatch: A=${a} B=${b}`);
    assert.equal(a, '"42"');
  });

  it("Option.unwrapOr — Some returns payload, None returns default", async () => {
    const src = `pure flow f() -> Int\ncontract{intent{"x"}}\n{let opt = Some(7)\nreturn opt.unwrapOr(0)}`;
    const a = await stageA(src, "f", {}); const b = await runB(src, "f", []);
    assert.equal(b, a); assert.equal(a, "7");
  });

  it("record literal construction — { x: n, y: 0 } builds a record and p.x reads the field", async () => {
    const src = `record Point{x:Int y:Int}\npure flow f(n: Int) -> Int\ncontract{intent{"x"}}\n{let p: Point = {x: n, y: 0}\nreturn p.x}`;
    const a = await stageA(src, "f", { n: vInt(5) }); const b = await runB(src, "f", [rtInt(5)]);
    assert.equal(b, a, `Stage A/B mismatch: A=${a} B=${b}`); assert.equal(a, "5");
  });

  it("cross-module imports — multi-file program runs correctly in Stage B", async () => {
    // FILE B: a helper module
    const fileB = `pure flow double(n: Int) -> Int
contract { intent { "Double a number." } }
{ return n * 2 }`;

    // FILE A: imports and calls FILE B's flow
    const fileA = `import flow double from "./mathUtils.fungi"

pure flow compute(x: Int) -> Int
contract { intent { "Use the imported double flow." } }
{ return double(x) + 1 }`;

    // Host-side multi-file pipeline: parse B → buildFlowTable B, parse A → buildFlowTable A, merge, run
    async function runMultiFile(mainSrc, importedSrcs, flowName, rtArgs) {
      let allItems = [];
      for (const src of importedSrcs) {
        const lx = await executeFlow("tokenize", new Map([["source", vStr(src)]]), lexer.ast);
        let toks = lx.value ?? lx; if (toks.__tag === "ok") toks = toks.value;
        const pr = await executeFlow("parseFlows", new Map([["tokens", toks]]), parser.ast);
        const prRecImp = pr.value ?? pr;
        refuseParseErrors(prRecImp, "runMultiFile(import)");
        const flows = prRecImp.fields.get("flows");
        const tbl = await executeFlow("buildFlowTable", new Map([["flows", flows]]), gir.ast);
        allItems = [...allItems, ...(tbl.value ?? tbl).items];
      }
      const lx = await executeFlow("tokenize", new Map([["source", vStr(mainSrc)]]), lexer.ast);
      let toks = lx.value ?? lx; if (toks.__tag === "ok") toks = toks.value;
      const pr = await executeFlow("parseFlows", new Map([["tokens", toks]]), parser.ast);
      const prRecMain = pr.value ?? pr;
      refuseParseErrors(prRecMain, "runMultiFile(main)");
      const mainFlows = prRecMain.fields.get("flows");
      const tbl = await executeFlow("buildFlowTable", new Map([["flows", mainFlows]]), gir.ast);
      const merged = vList([...(tbl.value ?? tbl).items, ...allItems]);
      const res = await executeFlow("runProgram", new Map([["flows", merged], ["entryName", vStr(flowName)], ["args", vList(rtArgs)]]), rt.ast);
      const runResult = res.value ?? res;
      const v = runResult.fields?.get("retVal") ?? runResult;
      return normB(v);
    }

    const result = await runMultiFile(fileA, [fileB], "compute", [rtInt(5)]);
    assert.equal(result, "11", `expected 11, got ${result}`);
    // Stage A doesn't support multi-file execution natively — verify Stage B independently.
    // The host-side merge pattern is the canonical Stage-B multi-file approach.
    assert.equal(result, "11", `expected 11 (double(5)+1), got ${result}`);
  });

  it("for i in 0..n range loop — sums 0+1+2+3+4 = 10 (Stage B; for not yet in Stage-A tree-walker)", async () => {
    const src = `pure flow f() -> Int\ncontract{intent{"x"}}\n{mut acc: Int = 0\nfor i in 0..5 { acc = acc + i }\nreturn acc}`;
    const b = await runB(src, "f", []);
    assert.equal(b, "10", `expected 10, got ${b}`);
  });

  it("for item in collection iterator — sums list [1,2,3] = 6", async () => {
    const src = `pure flow f() -> Int\ncontract{intent{"x"}}\n{let xs: Array<Int> = [1, 2, 3]\nmut acc: Int = 0\nfor item in xs { acc = acc + item }\nreturn acc}`;
    // Stage A may not support for loops yet — verify Stage B at minimum
    const b = await runB(src, "f", []);
    assert.equal(b, "6", `expected 6, got ${b}`);
  });

  it("AuditLog.write — produces an observable audit entry in Stage B", async () => {
    const src = readFileSync(join(CORPUS, "r6-004-record-amount.fungi"), "utf8");
    const full = await runBFull(src, "recordAmount", [rtInt(5)]);
    const auditLog = full.fields?.get("auditLog");
    assert.ok(auditLog, "auditLog field must exist on RunResult");
    const entries = auditLog.items ?? [];
    assert.ok(entries.length >= 1, `Expected at least 1 audit entry, got ${entries.length}`);
    const first = entries[0];
    const effect = first?.fields?.get("effect")?.value ?? first?.fields?.get("effect");
    assert.ok(effect === "audit.write" || String(effect).includes("audit"),
      `Expected audit.write effect, got: ${JSON.stringify(effect)}`);
  });
});
