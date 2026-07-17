// wat-p9-parser-flows-parity.test.mjs — P9 R3 increment #5 for the PARSER stage (task #56, U1 frontier):
// `parseFlows` — the parser's TOP-LEVEL ENTRY POINT — produces an IDENTICAL ParseResult through the
// Stage-A interpreter AND compiled to real WASM through the #105 admission gate.
//
// The ladder closes here:
//     #1 parseParams   Array<FlowParam>   FLAT record                      7/7
//     #2 parseExpr     Expr               one recursion axis              12/12
//     #3 parseStmt     Stmt               SELF + MUTUAL, two axes         15/15
//     #4 parseBlock    Array<Stmt>        top-level array                 10/10
//     #5 parseFlows    ParseResult        ← composes ALL FOUR             this
//
// ★ WHY THIS IS THE CAPSTONE AND NOT JUST THE NEXT ONE. ParseResult is not another shape — it is every
// shape at once, reached from the stage's real entry point:
//
//     record ParseResult { flows: Array<FlowDecl> · errors/imports: Array<String>
//                          policies: Array<PolicyDecl> · guardDecls: Array<GuardDecl> }
//     record FlowDecl { kind·name·returnType·conformsTo: String
//                       params: Array<FlowParam>   ← #1's shape
//                       effects: Array<String>
//                       body: Array<Stmt>          ← #3/#4's shape, which reaches #2's via Stmt.expr
//                       returnExpr: ReturnExpr }
//
// Every reader below is REUSED from its increment, not re-derived. That is the point: if the composition
// holds, the parser's whole output crosses the boundary intact, and "the record-readback bridge already
// ships, so no new ABI is needed" is settled for this stage — not per-flow, but structurally.
//
// A divergent second copy of any reader would make the differential compare two different readings and
// stay GREEN while proving nothing — the failure this repo found five times in its own gates on 2026-07-17.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import * as L from "../dist/index.js";

const __dir = dirname(fileURLToPath(import.meta.url));
const strip = (p) => {
  let s = readFileSync(join(__dir, "../src/self-hosted", p), "utf8");
  if (s.charCodeAt(0) === 0xFEFF) s = s.slice(1);
  return s.replace(/^@version 1\s*/m, "");
};

// parseFlows takes the whole token stream — no position argument. The driver is the thinnest of the five.
const DRIVER = `
/// test driver — tokenize the source and parse every flow declaration in it.
pure flow parseFlowsFromSource(src: String) -> ParseResult
contract { intent { "P9 parity driver: tokenize then parseFlows over the whole token stream." } }
{
  let res = tokenize(src)
  match res {
    Ok(toks) => {
      return parseFlows(toks)
    }
    _ => {
      return ParseResult { flows: Array.empty(), errors: Array.empty(), imports: Array.empty(), policies: Array.empty(), guardDecls: Array.empty() }
    }
  }
}
`;
const SRC = "@version 1\n" + strip("lexer.fungi") + "\n" + strip("parser.fungi") + "\n" + DRIVER;

const prog = L.parseProgram(SRC, "lexer-parser-flows-combined.fungi");
const parseErrs = (prog.diagnostics ?? []).filter((d) => d.severity === "error");
const fx = L.checkEffects(prog.flows, prog.ast);
const { gir } = L.emitGIR(prog.ast, prog.flows, fx);
const WAT = L.renderWAT(L.buildWATModuleFromGIR(gir, undefined, "lexer-parser-flows", prog.ast, /*exportAllPure*/ true));

// ── Stage-A ──
const itemsOf = (fv) => fv?.value?.items ?? fv?.items ?? [];
const strsI = (fv) => itemsOf(fv).map((s) => s?.value ?? "");
const recOf = (f, k) => f?.get(k)?.value ?? f?.get(k);
function readExprI(rec) {
  const f = rec?.fields;
  if (!f) return { kind: "", value: "", litType: "", children: [] };
  return { kind: f.get("kind")?.value ?? "", value: f.get("value")?.value ?? "", litType: f.get("litType")?.value ?? "", children: itemsOf(f.get("children")).map(readExprI) };
}
function readStmtI(rec) {
  const f = rec?.fields;
  if (!f) return { kind: "", name: "", typeName: "", expr: [], body: [], elseBody: [] };
  return {
    kind: f.get("kind")?.value ?? "", name: f.get("name")?.value ?? "", typeName: f.get("typeName")?.value ?? "",
    expr: itemsOf(f.get("expr")).map(readExprI), body: itemsOf(f.get("body")).map(readStmtI), elseBody: itemsOf(f.get("elseBody")).map(readStmtI),
  };
}
const readParamI = (rec) => ({ name: rec?.fields?.get("name")?.value ?? "", typeName: rec?.fields?.get("typeName")?.value ?? "", isReadonly: rec?.fields?.get("isReadonly")?.value === true });
const readRetExprI = (rec) => ({ kind: rec?.fields?.get("kind")?.value ?? "", litType: rec?.fields?.get("litType")?.value ?? "", leftType: rec?.fields?.get("leftType")?.value ?? "", rightType: rec?.fields?.get("rightType")?.value ?? "" });
function readFlowDeclI(rec) {
  const f = rec?.fields;
  if (!f) return null;
  return {
    kind: f.get("kind")?.value ?? "", name: f.get("name")?.value ?? "",
    params: itemsOf(f.get("params")).map(readParamI),
    returnType: f.get("returnType")?.value ?? "",
    effects: strsI(f.get("effects")),
    conformsTo: f.get("conformsTo")?.value ?? "",
    body: itemsOf(f.get("body")).map(readStmtI),
    returnExpr: readRetExprI(recOf(f, "returnExpr")),
  };
}
const readPolicyI = (rec) => ({ name: rec?.fields?.get("name")?.value ?? "", permittedEffects: strsI(rec?.fields?.get("permittedEffects")) });
const readGuardI = (rec) => ({ name: rec?.fields?.get("name")?.value ?? "", permittedEffects: strsI(rec?.fields?.get("permittedEffects")), enforcedLimits: strsI(rec?.fields?.get("enforcedLimits")) });
async function runInterp(input) {
  const args = new Map([["src", { __tag: "string", value: input }]]);
  const res = await L.executeFlow("parseFlowsFromSource", args, prog.ast, prog.flows, undefined, undefined, { pureFastPath: true });
  const f = (res?.value?.value ?? res?.value)?.fields;
  return {
    flows: itemsOf(f?.get("flows")).map(readFlowDeclI),
    errors: strsI(f?.get("errors")),
    imports: strsI(f?.get("imports")),
    policies: itemsOf(f?.get("policies")).map(readPolicyI),
    guardDecls: itemsOf(f?.get("guardDecls")).map(readGuardI),
  };
}

// ── Stage-B: real WASM through the #105 admission gate ──
let wasmCtx = null;
async function runWasm(input) {
  if (wasmCtx === null) {
    const asm = await L.assembleWAT(WAT);
    assert.ok(asm.valid && asm.diagnostics.length === 0, "combined lexer+parser WAT assembles (R0): " + JSON.stringify(asm.diagnostics));
    const host = L.createHostRuntime();
    let maxH = 0;
    for (const e of L.getInternedStrings()) { host.seedString(e.handle, e.value); if (e.handle > maxH) maxH = e.handle; }
    const kp = L.generateRunnerKeypair();
    const att = L.signWasm(asm.wasm, kp.privateKeyPem, "dev");
    const { instance } = await L.admitAndInstantiate({
      wasm: asm.wasm, attestation: att, policy: { requireSigned: true, publicKeyPem: kp.publicKeyPem }, host,
    });
    assert.equal(typeof instance.exports.parseFlowsFromSource, "function", "driver admitted + exported (R1)");
    wasmCtx = { host, instance, nextH: maxH + 1 };
  }
  const { host, instance } = wasmCtx;
  const srcH = wasmCtx.nextH++;
  host.seedString(srcH, input);
  const rH = instance.exports.parseFlowsFromSource(srcH);

  const S = (h) => host.readString(h) ?? "";
  const strsW = (h) => (host.readArray(h) ?? []).map(S);
  const readExprW = (h) => ({ kind: S(host.readRecordField(h, 0)), value: S(host.readRecordField(h, 1)), litType: S(host.readRecordField(h, 2)), children: (host.readArray(host.readRecordField(h, 3)) ?? []).map(readExprW) });
  const readStmtW = (h) => ({
    kind: S(host.readRecordField(h, 0)), name: S(host.readRecordField(h, 1)), typeName: S(host.readRecordField(h, 2)),
    expr: (host.readArray(host.readRecordField(h, 3)) ?? []).map(readExprW),
    body: (host.readArray(host.readRecordField(h, 4)) ?? []).map(readStmtW),
    elseBody: (host.readArray(host.readRecordField(h, 5)) ?? []).map(readStmtW),
  });
  // FlowParam: 0 name · 1 typeName · 2 isReadonly    (increment #1's slots, unchanged)
  const readParamW = (h) => ({ name: S(host.readRecordField(h, 0)), typeName: S(host.readRecordField(h, 1)), isReadonly: host.readRecordField(h, 2) !== 0 });
  // ReturnExpr: 0 kind · 1 litType · 2 leftType · 3 rightType
  const readRetExprW = (h) => ({ kind: S(host.readRecordField(h, 0)), litType: S(host.readRecordField(h, 1)), leftType: S(host.readRecordField(h, 2)), rightType: S(host.readRecordField(h, 3)) });
  // FlowDecl: 0 kind · 1 name · 2 params · 3 returnType · 4 effects · 5 conformsTo · 6 body · 7 returnExpr
  // ★ Slot 2 crosses into #1's reader, slot 6 into #3's (which reaches #2's via Stmt.expr), slot 7 into a
  //   flat one. One record, four increments' worth of shape.
  const readFlowDeclW = (h) => ({
    kind: S(host.readRecordField(h, 0)), name: S(host.readRecordField(h, 1)),
    params: (host.readArray(host.readRecordField(h, 2)) ?? []).map(readParamW),
    returnType: S(host.readRecordField(h, 3)),
    effects: strsW(host.readRecordField(h, 4)),
    conformsTo: S(host.readRecordField(h, 5)),
    body: (host.readArray(host.readRecordField(h, 6)) ?? []).map(readStmtW),
    returnExpr: readRetExprW(host.readRecordField(h, 7)),
  });
  const readPolicyW = (h) => ({ name: S(host.readRecordField(h, 0)), permittedEffects: strsW(host.readRecordField(h, 1)) });
  const readGuardW = (h) => ({ name: S(host.readRecordField(h, 0)), permittedEffects: strsW(host.readRecordField(h, 1)), enforcedLimits: strsW(host.readRecordField(h, 2)) });
  // ParseResult: 0 flows · 1 errors · 2 imports · 3 policies · 4 guardDecls
  return {
    flows: (host.readArray(host.readRecordField(rH, 0)) ?? []).map(readFlowDeclW),
    errors: strsW(host.readRecordField(rH, 1)),
    imports: strsW(host.readRecordField(rH, 2)),
    policies: (host.readArray(host.readRecordField(rH, 3)) ?? []).map(readPolicyW),
    guardDecls: (host.readArray(host.readRecordField(rH, 4)) ?? []).map(readGuardW),
  };
}

// Corpus: real Galerina source at the stage's real entry point, each case adding one ParseResult arm.
const CORPUS = [
  `pure flow f(a: Int) -> Int
contract { intent { "add one" } }
{
  return a + 1
}`,
  // two flows: the top-level array must keep both, in order
  `pure flow f(a: Int) -> Int
contract { intent { "first" } }
{
  return a
}
pure flow g(b: String) -> Bool
contract { intent { "second" } }
{
  return b
}`,
  // a flow whose body carries nested statements — the #3/#4 shape reached from the entry point
  `pure flow h(a: Int) -> Int
contract { intent { "branch" } }
{
  if a { return 1 }
  return 2
}`,
  // no flows at all: every arm must be an EMPTY array, not an absent one
  `// just a comment, nothing to parse`,
];

describe("P9 R3 · parser stage: parseFlows byte-parity — the entry point, composing ALL FOUR readers", () => {
  it("combined lexer+parser+driver source parses clean (R0 precondition)", () => {
    assert.equal(parseErrs.length, 0, `combined source must parse clean: ${parseErrs[0]?.code ?? ""} ${parseErrs[0]?.message ?? ""}`);
  });

  for (const [n, input] of CORPUS.entries()) {
    it(`identical ParseResult for corpus #${n + 1} (${JSON.stringify(input.split("\n")[0]).slice(0, 46)}…)`, async () => {
      const [i, w] = await Promise.all([runInterp(input), runWasm(input)]);
      assert.deepEqual(w, i, `WASM ParseResult must equal interpreter ParseResult for corpus #${n + 1}`);
    });
  }

  // ★ NON-VACUITY. An ABI returning an all-empty ParseResult passes every case above — INCLUDING the
  // "no flows" case, which is the one that looks like it proves emptiness and proves the least.
  it("non-vacuity: a real flow arrives WHOLE — name, params, return type, body, all through WASM", async () => {
    const w = await runWasm(CORPUS[0]);
    assert.equal(w.flows.length, 1, "one flow, not an empty array");
    const f = w.flows[0];
    assert.equal(f.name, "f", "name survives");
    assert.equal(f.kind, "pure", "qualifier survives");
    assert.equal(f.returnType, "Int", "return type survives");
    assert.deepEqual(f.params, [{ name: "a", typeName: "Int", isReadonly: false }], "increment #1's shape, reached from the entry point");
    assert.ok(f.body.length >= 1, "the body carries statements (increment #3's shape)");
  });

  it("non-vacuity: TWO flows keep their order and stay distinct", async () => {
    const w = await runWasm(CORPUS[1]);
    assert.equal(w.flows.length, 2, "both flows arrive");
    assert.deepEqual(w.flows.map((f) => f.name), ["f", "g"], "order survives the boundary");
    assert.equal(w.flows[0].params[0].typeName, "Int", "first flow's param type");
    assert.equal(w.flows[1].params[0].typeName, "String", "second flow's — not aliased to the first");
  });

  it("non-vacuity: a nested body reaches DEPTH through the entry point (#3's shape via #5)", async () => {
    const w = await runWasm(CORPUS[2]);
    const body = w.flows[0].body;
    const ifStmt = body.find((s) => s.kind === "if");
    assert.ok(ifStmt, "the if statement survived to the top-level ParseResult");
    assert.equal(ifStmt.body[0].kind, "return", "and its nested body is intact — four readers deep, one walk");
  });

  it("non-vacuity: the empty ParseResult is empty because it IS, not because the reader returns nothing", async () => {
    const [none, one] = await Promise.all([runWasm(CORPUS[3]), runWasm(CORPUS[0])]);
    assert.equal(none.flows.length, 0, "no flows in a comment-only source");
    assert.equal(one.flows.length, 1, "…and the SAME reader returns one for a real source");
    // Without the pairing, [] is indistinguishable from a reader that always returns [].
  });
});
