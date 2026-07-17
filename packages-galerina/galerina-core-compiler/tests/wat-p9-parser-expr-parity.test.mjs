// wat-p9-parser-expr-parity.test.mjs — P9 R3 increment #2 for the PARSER stage (task #56, U1 frontier):
// `parseExpr` produces an IDENTICAL expression TREE through the Stage-A interpreter AND compiled to real
// WASM through the #105 admission gate. Increment #1 (wat-p9-parser-params-parity) proved `parseParams`;
// this is the first RECURSIVE shape, and that is the whole point of it.
//
// ★ WHY THIS ONE IS THE FRONTIER AND NOT ANOTHER PREDICATE. The Contract Registry lists 32 parser flows.
// Eleven are readback-trivial (isKw/isIdent/isArithOp -> Bool, tokVal -> String, skipNewlines -> Int) —
// leaf helpers, cheap to prove and nearly worthless as evidence: they would raise the "parser stage
// byte-parity" count without touching what the parser actually DOES. The other twenty return parse-result
// records, and every one of them bottoms out in:
//
//     record Expr { kind: String, value: String, litType: String, children: Array<Expr> }   // SELF-REFERENTIAL
//     record ExprParse { expr: Expr, nextPos: Int }
//
// parseParams returned Array<FlowParam> — a FLAT record, which readArray -> readRecordField -> readString
// handles directly. `Expr` is a TREE. So the real question for the parser stage was never "which flow
// next?" but "does the shipped readback reach a recursive shape?".
//
// ★ IT DOES, AND NO NEW ABI IS NEEDED — the recursion belongs in the HARNESS, not the boundary. The
// primitives compose: readRecordField gets the children handle, readArray fans it out, and the reader
// calls itself. Proving that is the point of this file: it converts "no new ABI is needed" from a
// roadmap claim into a executed fact, and unblocks the remaining nineteen parse-result flows, which all
// bottom out in this same shape.
//
// Harness: identical ladder to increment #1 — twins compiled CONCATENATED (parser.fungi consumes
// lexer.fungi's Token record, declared there only), so the module runs its own `tokenize` and the parity
// is marshalling-free. A test DRIVER flow (appended source, twins untouched) does the chaining.
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

// The driver parses an expression from position 0 of the token stream. On a lex error it returns a
// well-formed EMPTY ExprParse rather than throwing — the corpus never exercises that path, but a driver
// that can only succeed is a driver that hides a backend disagreeing about failure.
const DRIVER = `
/// test driver — tokenize the source and parse a full expression from the first token.
pure flow parseExprFromSource(src: String) -> ExprParse
contract { intent { "P9 parity driver: tokenize then parseExpr from position 0." } }
{
  let res = tokenize(src)
  match res {
    Ok(toks) => {
      return parseExpr(toks, 0)
    }
    _ => {
      let empty: Expr = Expr { kind: "", value: "", litType: "", children: Array.empty() }
      return ExprParse { expr: empty, nextPos: 0 }
    }
  }
}
`;
const SRC = "@version 1\n" + strip("lexer.fungi") + "\n" + strip("parser.fungi") + "\n" + DRIVER;

const prog = L.parseProgram(SRC, "lexer-parser-expr-combined.fungi");
const parseErrs = (prog.diagnostics ?? []).filter((d) => d.severity === "error");
const fx = L.checkEffects(prog.flows, prog.ast);
const { gir } = L.emitGIR(prog.ast, prog.flows, fx);
const WAT = L.renderWAT(L.buildWATModuleFromGIR(gir, undefined, "lexer-parser-expr", prog.ast, /*exportAllPure*/ true));

// ── Stage-A: the interpreter runs the SAME combined source ──
// Recursive reader over interpreter records. Mirrors readExprW below shape-for-shape and slot-for-slot;
// if the two readers drift, the differential compares two different things and proves nothing.
function readExprI(rec) {
  const f = rec?.fields;
  if (!f) return { kind: "", value: "", litType: "", children: [] };
  const kids = f.get("children")?.value?.items ?? f.get("children")?.items ?? [];
  return {
    kind: f.get("kind")?.value ?? "",
    value: f.get("value")?.value ?? "",
    litType: f.get("litType")?.value ?? "",
    children: kids.map(readExprI),
  };
}
async function runInterp(input) {
  const args = new Map([["src", { __tag: "string", value: input }]]);
  const res = await L.executeFlow("parseExprFromSource", args, prog.ast, prog.flows, undefined, undefined, { pureFastPath: true });
  const rec = res?.value?.value ?? res?.value;
  const f = rec?.fields;
  return {
    expr: readExprI(f?.get("expr")?.value ?? f?.get("expr")),
    nextPos: f?.get("nextPos")?.value ?? 0,
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
    assert.equal(typeof instance.exports.parseExprFromSource, "function", "driver admitted + exported (R1)");
    wasmCtx = { host, instance, nextH: maxH + 1 };
  }
  const { host, instance } = wasmCtx;
  const srcH = wasmCtx.nextH++;
  host.seedString(srcH, input);
  const parseH = instance.exports.parseExprFromSource(srcH);

  // ★ THE RECURSIVE READBACK — composed from the SHIPPED primitives, no new ABI at the boundary.
  // Expr slots: 0 kind · 1 value · 2 litType · 3 children (Array<Expr>).
  const readExprW = (h) => ({
    kind: host.readString(host.readRecordField(h, 0)) ?? "",
    value: host.readString(host.readRecordField(h, 1)) ?? "",
    litType: host.readString(host.readRecordField(h, 2)) ?? "",
    children: (host.readArray(host.readRecordField(h, 3)) ?? []).map(readExprW),
  });
  // ExprParse slots: 0 expr (Expr) · 1 nextPos (Int).
  return { expr: readExprW(host.readRecordField(parseH, 0)), nextPos: host.readRecordField(parseH, 1) };
}

// Corpus: expression shapes the milestone parser recognises, ordered by tree DEPTH — a flat literal
// proves the record slots; a nested binary proves the recursion actually recurses.
const CORPUS = [
  "1",                       // depth 0: a bare literal
  "x",                       // depth 0: a bare name
  "1 + 2",                   // depth 1: one binary node, two leaf children
  "a + b * c",               // depth 2: precedence climbing builds an UNBALANCED tree
  "(a + b) * c",             // depth 2: grouping inverts the shape — the parens must move the nesting
  "1 + 2 + 3",               // depth 2: left-associative chain
  "a < b",                   // depth 1: comparison level
  "f(a, b)",                 // depth 1: call with two argument children
];

describe("P9 R3 · parser stage: parseExpr byte-parity — the first RECURSIVE readback", () => {
  it("combined lexer+parser+driver source parses clean (R0 precondition)", () => {
    assert.equal(parseErrs.length, 0, `combined source must parse clean: ${parseErrs[0]?.code ?? ""} ${parseErrs[0]?.message ?? ""}`);
  });

  for (const input of CORPUS) {
    it(`identical expression tree for ${JSON.stringify(input)}`, async () => {
      const [i, w] = await Promise.all([runInterp(input), runWasm(input)]);
      assert.deepEqual(w, i, `WASM tree must equal interpreter tree for ${JSON.stringify(input)}`);
    });
  }

  // ★ NON-VACUITY. deepEqual over two empty trees passes, and an ABI that silently returned {} for every
  // input would sail through every case above. These pin that the readback saw REAL STRUCTURE — and pin
  // it on the WASM side, because that is the side whose readback is new.
  it("non-vacuity: the WASM readback returns a REAL tree, not an empty shell", async () => {
    const w = await runWasm("a + b * c");
    assert.equal(w.expr.kind, "binary", "root is a binary node");
    assert.equal(w.expr.value, "+", "root operator is +");
    assert.equal(w.expr.children.length, 2, "root has two children");
    assert.equal(w.expr.children[0].kind, "name", "left child is the name 'a'");
    assert.equal(w.expr.children[0].value, "a");
  });

  it("non-vacuity: the recursion reaches DEPTH 2 through WASM (precedence nests * under +)", async () => {
    const w = await runWasm("a + b * c");
    const right = w.expr.children[1];
    assert.equal(right.kind, "binary", "right child is itself a binary node — the reader recursed");
    assert.equal(right.value, "*", "and it is the * node, so precedence survived the boundary");
    assert.equal(right.children.length, 2, "the depth-2 node has its own two children");
    assert.equal(right.children[1].value, "c", "the deepest leaf carries its value");
  });

  it("non-vacuity: grouping CHANGES the tree, so the corpus is not shape-blind", async () => {
    const [flat, grouped] = await Promise.all([runWasm("a + b * c"), runWasm("(a + b) * c")]);
    assert.equal(flat.expr.value, "+", "unparenthesised: + at the root");
    assert.equal(grouped.expr.value, "*", "parenthesised: * at the root");
    assert.notDeepEqual(grouped.expr, flat.expr, "the two trees must differ — else the corpus proves nothing");
  });
});
