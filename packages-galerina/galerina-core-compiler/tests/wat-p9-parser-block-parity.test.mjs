// wat-p9-parser-block-parity.test.mjs — P9 R3 increment #4 for the PARSER stage (task #56, U1 frontier):
// `parseBlock` produces an IDENTICAL statement LIST through the Stage-A interpreter AND compiled to real
// WASM through the #105 admission gate.
//
//     record BlockParse { stmts: Array<Stmt>, nextPos: Int }
//
// The ladder: #1 parseParams (FLAT) · #2 parseExpr (one recursion axis) · #3 parseStmt (self + mutual,
// the risky one) · #4 this. This increment is DELIBERATELY THIN — it adds one axis and no new mechanism:
// an Array<Stmt> at the TOP level rather than nested inside a record. It is worth landing anyway because
// parseBlock is what parseFlows consumes, and because "the top-level array behaves like a nested one" is
// an assumption, not a fact, until the differential says so. Cheap increments that close an assumption
// are not busywork; cheap increments that only raise a count are, and that is why the eleven leaf
// predicates (isKw/isIdent/tokVal…) remain unproven and unimportant.
//
// Both readers are REUSED from #2 and #3 unchanged. A third hand-written copy is a third chance to drift,
// and a differential comparing two divergent readings stays green while proving nothing — which is the
// exact failure this repo found five times in its own gates on 2026-07-17.
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

// parseBlock's contract: "Parse statements until the matching closing brace" — so the driver must hand it
// a position INSIDE a brace. It finds the first '{' and starts one past it, mirroring increment #1's
// "Caller must advance past '('" convention from the Contract Registry.
const DRIVER = `
/// test driver — tokenize the source, find the first '{' and parse the block after it.
pure flow parseBlockFromSource(src: String) -> BlockParse
contract { intent { "P9 parity driver: tokenize then parseBlock past the first open brace." } }
{
  let res = tokenize(src)
  match res {
    Ok(toks) => {
      mut i: Int = 0
      while i < toks.count() {
        if tokVal(toks, i) == "{" {
          return parseBlock(toks, i + 1)
        }
        i = i + 1
      }
      return BlockParse { stmts: Array.empty(), nextPos: 0 }
    }
    _ => {
      return BlockParse { stmts: Array.empty(), nextPos: 0 }
    }
  }
}
`;
const SRC = "@version 1\n" + strip("lexer.fungi") + "\n" + strip("parser.fungi") + "\n" + DRIVER;

const prog = L.parseProgram(SRC, "lexer-parser-block-combined.fungi");
const parseErrs = (prog.diagnostics ?? []).filter((d) => d.severity === "error");
const fx = L.checkEffects(prog.flows, prog.ast);
const { gir } = L.emitGIR(prog.ast, prog.flows, fx);
const WAT = L.renderWAT(L.buildWATModuleFromGIR(gir, undefined, "lexer-parser-block", prog.ast, /*exportAllPure*/ true));

// ── Stage-A ──
const itemsOf = (fv) => fv?.value?.items ?? fv?.items ?? [];
function readExprI(rec) {
  const f = rec?.fields;
  if (!f) return { kind: "", value: "", litType: "", children: [] };
  return {
    kind: f.get("kind")?.value ?? "", value: f.get("value")?.value ?? "",
    litType: f.get("litType")?.value ?? "", children: itemsOf(f.get("children")).map(readExprI),
  };
}
function readStmtI(rec) {
  const f = rec?.fields;
  if (!f) return { kind: "", name: "", typeName: "", expr: [], body: [], elseBody: [] };
  return {
    kind: f.get("kind")?.value ?? "", name: f.get("name")?.value ?? "", typeName: f.get("typeName")?.value ?? "",
    expr: itemsOf(f.get("expr")).map(readExprI),
    body: itemsOf(f.get("body")).map(readStmtI),
    elseBody: itemsOf(f.get("elseBody")).map(readStmtI),
  };
}
async function runInterp(input) {
  const args = new Map([["src", { __tag: "string", value: input }]]);
  const res = await L.executeFlow("parseBlockFromSource", args, prog.ast, prog.flows, undefined, undefined, { pureFastPath: true });
  const rec = res?.value?.value ?? res?.value;
  const f = rec?.fields;
  return { stmts: itemsOf(f?.get("stmts")).map(readStmtI), nextPos: f?.get("nextPos")?.value ?? 0 };
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
    assert.equal(typeof instance.exports.parseBlockFromSource, "function", "driver admitted + exported (R1)");
    wasmCtx = { host, instance, nextH: maxH + 1 };
  }
  const { host, instance } = wasmCtx;
  const srcH = wasmCtx.nextH++;
  host.seedString(srcH, input);
  const blockH = instance.exports.parseBlockFromSource(srcH);

  const readExprW = (h) => ({
    kind: host.readString(host.readRecordField(h, 0)) ?? "",
    value: host.readString(host.readRecordField(h, 1)) ?? "",
    litType: host.readString(host.readRecordField(h, 2)) ?? "",
    children: (host.readArray(host.readRecordField(h, 3)) ?? []).map(readExprW),
  });
  const readStmtW = (h) => ({
    kind: host.readString(host.readRecordField(h, 0)) ?? "",
    name: host.readString(host.readRecordField(h, 1)) ?? "",
    typeName: host.readString(host.readRecordField(h, 2)) ?? "",
    expr: (host.readArray(host.readRecordField(h, 3)) ?? []).map(readExprW),
    body: (host.readArray(host.readRecordField(h, 4)) ?? []).map(readStmtW),
    elseBody: (host.readArray(host.readRecordField(h, 5)) ?? []).map(readStmtW),
  });
  // BlockParse slots: 0 stmts (Array<Stmt>) · 1 nextPos (Int).
  return { stmts: (host.readArray(host.readRecordField(blockH, 0)) ?? []).map(readStmtW), nextPos: host.readRecordField(blockH, 1) };
}

// Corpus by statement COUNT and by what the statements carry — a one-statement block proves the array
// exists; a mixed multi-statement block proves ORDER and per-item shape survive the boundary together.
const CORPUS = [
  "{ return 1 }",                                   // one statement
  "{ }",                                            // EMPTY block — the array must be empty, not absent
  "{ let x: Int = 1 return x }",                    // two statements, order matters
  "{ let a: Int = 1 let b: Int = 2 return a + b }", // three, last carries a tree
  "{ if a { return 1 } return 2 }",                 // a nested block INSIDE a top-level block
  "{ while a { x = 1 } return 0 }",
];

describe("P9 R3 · parser stage: parseBlock byte-parity — Array<Stmt> at the top level", () => {
  it("combined lexer+parser+driver source parses clean (R0 precondition)", () => {
    assert.equal(parseErrs.length, 0, `combined source must parse clean: ${parseErrs[0]?.code ?? ""} ${parseErrs[0]?.message ?? ""}`);
  });

  for (const input of CORPUS) {
    it(`identical statement list for ${JSON.stringify(input)}`, async () => {
      const [i, w] = await Promise.all([runInterp(input), runWasm(input)]);
      assert.deepEqual(w, i, `WASM statement list must equal interpreter list for ${JSON.stringify(input)}`);
    });
  }

  // ★ NON-VACUITY. Two empty lists deepEqual, and an ABI returning [] for everything passes every case
  // above — including, deceptively, the "{ }" case, which is the one that LOOKS like it proves emptiness.
  it("non-vacuity: a multi-statement block yields the statements IN ORDER through WASM", async () => {
    const w = await runWasm("{ let a: Int = 1 let b: Int = 2 return a + b }");
    assert.equal(w.stmts.length, 3, "three statements, not an empty array");
    assert.deepEqual(w.stmts.map((s) => s.kind), ["let", "let", "return"], "order survives the boundary");
    assert.equal(w.stmts[0].name, "a", "first let binds a");
    assert.equal(w.stmts[1].name, "b", "second let binds b — the items are distinct, not aliased");
    assert.equal(w.stmts[2].expr[0].value, "+", "and the last one still carries its expression tree");
  });

  it("non-vacuity: the EMPTY block is empty because it IS empty, not because the reader returns nothing", async () => {
    const [empty, full] = await Promise.all([runWasm("{ }"), runWasm("{ return 1 }")]);
    assert.equal(empty.stmts.length, 0, "empty block: zero statements");
    assert.equal(full.stmts.length, 1, "…and the SAME reader returns one for a non-empty block");
    // Without this pairing, "{ }" -> [] is indistinguishable from a reader that always returns [].
  });

  it("non-vacuity: a nested block inside the block keeps its own statements", async () => {
    const w = await runWasm("{ if a { return 1 } return 2 }");
    assert.equal(w.stmts.length, 2, "the if and the trailing return are siblings");
    assert.equal(w.stmts[0].body.length, 1, "the if's body has its own statement");
    assert.equal(w.stmts[0].body[0].expr[0].value, "1", "inner returns 1");
    assert.equal(w.stmts[1].expr[0].value, "2", "outer returns 2 — nesting did not flatten");
  });
});
