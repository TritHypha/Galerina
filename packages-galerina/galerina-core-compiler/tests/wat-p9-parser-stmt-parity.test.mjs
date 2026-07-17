// wat-p9-parser-stmt-parity.test.mjs — P9 R3 increment #3 for the PARSER stage (task #56, U1 frontier):
// `parseStmt` produces an IDENTICAL statement TREE through the Stage-A interpreter AND compiled to real
// WASM through the #105 admission gate.
//
// The ladder so far: #1 parseParams (Array<FlowParam> — FLAT) · #2 parseExpr (Expr — ONE recursion axis)
// · #3 this one. Not a repeat of #2: `Stmt` recurses on TWO axes at once, and only one of them is its own.
//
//     record Stmt {
//       kind: String · name: String · typeName: String
//       expr: Array<Expr>       // ← MUTUAL recursion, into the tree #2 proved
//       body: Array<Stmt>       // ← SELF recursion
//       elseBody: Array<Stmt>   // ← SELF recursion, a second independent branch
//     }
//     record StmtParse { stmt: Stmt, nextPos: Int }
//
// ★ WHAT THIS INCREMENT IS ACTUALLY FOR. #2 proved a self-recursive record survives the boundary. It did
// NOT prove that two record TYPES can recurse THROUGH each other across it — a Stmt holding Exprs holding
// Exprs, with the reader crossing type boundaries mid-walk. That is the shape every remaining parse-result
// flow needs (parseBlock → Array<Stmt>; parseFlows → ParseResult), so if the mutual axis were going to
// break, it breaks here and not four increments later.
//
// The Expr reader is REUSED VERBATIM from #2 rather than re-derived — a second hand-written copy could
// drift from the first and the differential would compare two different readings while staying green.
// That is precisely the failure this repo found five times in its own gates on 2026-07-17.
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

const DRIVER = `
/// test driver — tokenize the source and parse one statement from the first token.
pure flow parseStmtFromSource(src: String) -> StmtParse
contract { intent { "P9 parity driver: tokenize then parseStmt from position 0." } }
{
  let res = tokenize(src)
  match res {
    Ok(toks) => {
      return parseStmt(toks, 0)
    }
    _ => {
      let empty: Stmt = Stmt { kind: "", name: "", typeName: "", expr: Array.empty(), body: Array.empty(), elseBody: Array.empty() }
      return StmtParse { stmt: empty, nextPos: 0 }
    }
  }
}
`;
const SRC = "@version 1\n" + strip("lexer.fungi") + "\n" + strip("parser.fungi") + "\n" + DRIVER;

const prog = L.parseProgram(SRC, "lexer-parser-stmt-combined.fungi");
const parseErrs = (prog.diagnostics ?? []).filter((d) => d.severity === "error");
const fx = L.checkEffects(prog.flows, prog.ast);
const { gir } = L.emitGIR(prog.ast, prog.flows, fx);
const WAT = L.renderWAT(L.buildWATModuleFromGIR(gir, undefined, "lexer-parser-stmt", prog.ast, /*exportAllPure*/ true));

// ── Stage-A: the interpreter runs the SAME combined source ──
const itemsOf = (fv) => fv?.value?.items ?? fv?.items ?? [];
function readExprI(rec) {
  const f = rec?.fields;
  if (!f) return { kind: "", value: "", litType: "", children: [] };
  return {
    kind: f.get("kind")?.value ?? "",
    value: f.get("value")?.value ?? "",
    litType: f.get("litType")?.value ?? "",
    children: itemsOf(f.get("children")).map(readExprI),
  };
}
function readStmtI(rec) {
  const f = rec?.fields;
  if (!f) return { kind: "", name: "", typeName: "", expr: [], body: [], elseBody: [] };
  return {
    kind: f.get("kind")?.value ?? "",
    name: f.get("name")?.value ?? "",
    typeName: f.get("typeName")?.value ?? "",
    expr: itemsOf(f.get("expr")).map(readExprI),      // mutual axis
    body: itemsOf(f.get("body")).map(readStmtI),      // self axis
    elseBody: itemsOf(f.get("elseBody")).map(readStmtI),
  };
}
async function runInterp(input) {
  const args = new Map([["src", { __tag: "string", value: input }]]);
  const res = await L.executeFlow("parseStmtFromSource", args, prog.ast, prog.flows, undefined, undefined, { pureFastPath: true });
  const rec = res?.value?.value ?? res?.value;
  const f = rec?.fields;
  return { stmt: readStmtI(f?.get("stmt")?.value ?? f?.get("stmt")), nextPos: f?.get("nextPos")?.value ?? 0 };
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
    assert.equal(typeof instance.exports.parseStmtFromSource, "function", "driver admitted + exported (R1)");
    wasmCtx = { host, instance, nextH: maxH + 1 };
  }
  const { host, instance } = wasmCtx;
  const srcH = wasmCtx.nextH++;
  host.seedString(srcH, input);
  const parseH = instance.exports.parseStmtFromSource(srcH);

  // Expr slots: 0 kind · 1 value · 2 litType · 3 children  (identical to increment #2 — same shape, one
  // reader; a divergent second copy is how a differential goes green while comparing two things.)
  const readExprW = (h) => ({
    kind: host.readString(host.readRecordField(h, 0)) ?? "",
    value: host.readString(host.readRecordField(h, 1)) ?? "",
    litType: host.readString(host.readRecordField(h, 2)) ?? "",
    children: (host.readArray(host.readRecordField(h, 3)) ?? []).map(readExprW),
  });
  // Stmt slots: 0 kind · 1 name · 2 typeName · 3 expr(Array<Expr>) · 4 body(Array<Stmt>) · 5 elseBody.
  // ★ Slot 3 crosses INTO the Expr reader; slots 4/5 re-enter THIS one. Both axes, one walk.
  const readStmtW = (h) => ({
    kind: host.readString(host.readRecordField(h, 0)) ?? "",
    name: host.readString(host.readRecordField(h, 1)) ?? "",
    typeName: host.readString(host.readRecordField(h, 2)) ?? "",
    expr: (host.readArray(host.readRecordField(h, 3)) ?? []).map(readExprW),
    body: (host.readArray(host.readRecordField(h, 4)) ?? []).map(readStmtW),
    elseBody: (host.readArray(host.readRecordField(h, 5)) ?? []).map(readStmtW),
  });
  // StmtParse slots: 0 stmt (Stmt) · 1 nextPos (Int).
  return { stmt: readStmtW(host.readRecordField(parseH, 0)), nextPos: host.readRecordField(parseH, 1) };
}

// Corpus ordered by which AXIS it exercises: the flat kinds first, then the mutual axis (a statement
// carrying an expression tree), then the self axis (a statement carrying statements), then both at once.
const CORPUS = [
  "let x: Int = 1",                       // flat + mutual (expr: one literal)
  "mut y: Int = 2",
  "return 1",                             // mutual: expr carries a leaf
  "return a + b * c",                     // mutual: expr carries a DEPTH-2 tree
  "x = 5",                                // assign
  "if a { return 1 }",                    // self: body carries one Stmt
  "if a { return 1 } else { return 2 }",  // self: TWO independent branches
  "while a { x = 1 }",                    // self: while body
  "if a { if b { return 1 } }",           // self axis at DEPTH 2
  "if a + b { return c * d }",            // BOTH axes at once: expr tree in the condition AND a body
];

describe("P9 R3 · parser stage: parseStmt byte-parity — SELF + MUTUAL recursion across the boundary", () => {
  it("combined lexer+parser+driver source parses clean (R0 precondition)", () => {
    assert.equal(parseErrs.length, 0, `combined source must parse clean: ${parseErrs[0]?.code ?? ""} ${parseErrs[0]?.message ?? ""}`);
  });

  for (const input of CORPUS) {
    it(`identical statement tree for ${JSON.stringify(input)}`, async () => {
      const [i, w] = await Promise.all([runInterp(input), runWasm(input)]);
      assert.deepEqual(w, i, `WASM statement tree must equal interpreter tree for ${JSON.stringify(input)}`);
    });
  }

  // ★ NON-VACUITY — deepEqual over two empty Stmts passes, and an ABI returning {} for everything would
  // sail through all ten cases above. Pinned on the WASM side: that is the side whose readback is new.
  it("non-vacuity: the MUTUAL axis carries a real Expr tree into the statement", async () => {
    const w = await runWasm("return a + b * c");
    assert.equal(w.stmt.kind, "return", "statement kind survives");
    assert.equal(w.stmt.expr.length, 1, "return carries exactly one expression");
    assert.equal(w.stmt.expr[0].kind, "binary", "and it is a real tree, not an empty shell");
    assert.equal(w.stmt.expr[0].value, "+");
    assert.equal(w.stmt.expr[0].children[1].value, "*", "precedence nested inside a STATEMENT survived WASM");
  });

  it("non-vacuity: the SELF axis carries real nested statements, and the two branches stay distinct", async () => {
    const w = await runWasm("if a { return 1 } else { return 2 }");
    assert.equal(w.stmt.kind, "if");
    assert.equal(w.stmt.body.length, 1, "then-branch has one statement");
    assert.equal(w.stmt.elseBody.length, 1, "else-branch has one statement");
    assert.equal(w.stmt.body[0].expr[0].value, "1", "then returns 1");
    assert.equal(w.stmt.elseBody[0].expr[0].value, "2", "else returns 2 — the branches did NOT alias");
  });

  it("non-vacuity: the SELF axis reaches DEPTH 2 (a nested if inside an if)", async () => {
    const w = await runWasm("if a { if b { return 1 } }");
    const inner = w.stmt.body[0];
    assert.equal(inner.kind, "if", "the nested statement is itself an if — the reader re-entered");
    assert.equal(inner.body[0].kind, "return", "and its own body carries the return");
  });

  it("non-vacuity: BOTH axes at once, and the shapes are not interchangeable", async () => {
    const [both, plain] = await Promise.all([runWasm("if a + b { return c * d }"), runWasm("if a { return 1 }")]);
    assert.equal(both.stmt.expr[0].kind, "binary", "condition is an expression tree (mutual axis)");
    assert.equal(both.stmt.body[0].expr[0].kind, "binary", "body's return carries its own tree (both axes)");
    assert.notDeepEqual(both.stmt, plain.stmt, "the two statements must differ — else the corpus is shape-blind");
  });
});
