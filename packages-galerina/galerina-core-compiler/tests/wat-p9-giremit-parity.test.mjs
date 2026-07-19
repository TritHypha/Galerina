// wat-p9-giremit-parity.test.mjs — P9 R3 for the GIR-EMITTER stage (task #56/#108, brick-2 Option Y):
// gir-emitter.fungi produces an IDENTICAL result through the Stage-A interpreter AND compiled to real WASM
// through the #105 admission gate, over a parsed corpus. Same ladder as wat-p9-parser-params-parity, one
// stage up: the stage consumes the parser's FlowDecl/Expr/Stmt records, so the twins are compiled
// CONCATENATED (lexer + parser + gir-emitter + driver) — the in-tree R2 pattern (audit-stage-execution.mjs),
// which R&D adopted as the realization of the shared-AST-type prelude (Option Y). No new ABI.
//
// This pins the brick-2 concretization: gir-emitter's Array<Auto>/Auto AST params were typed to the parser's
// concrete records + one typed-local hoist (let re: ReturnExpr = fd.returnExpr), dropping the #100 element-
// type erasure. If the erasure returns (a param reverts to Array<Auto>) the WASM side traps and this reds.
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

// Two drivers: (1) emitGIRModule metadata path; (2) emitBodyGIR — the RECURSIVE lowerStmt/lowerExpr path,
// fed a real statement body via a typed-local hoist (`let flows: Array<FlowDecl> = p.flows`), the brick-2
// pattern that keeps the field-read off a concrete element type.
const DRIVER = `
/// R3 driver A — tokenize -> parseFlows -> emitGIRModule, project flow/pure/governed counts to one Int.
pure flow giremitProbe(src: String) -> Int
contract { intent { "P9 R3 driver: emit a GIR module and project its counts." } }
{
  let res = tokenize(src)
  match res {
    Ok(toks) => {
      let p = parseFlows(toks)
      let g = emitGIRModule(p.flows)
      return g.flowCount * 100 + g.pureCount * 10 + g.governedCount
    }
    Err(e) => { return -1 }
  }
}

/// R3 driver B — lower the FIRST flow's statement body to GIR (the recursive path), return the node count.
pure flow giremitBodyProbe(src: String) -> Int
contract { intent { "P9 R3 driver: lower a flow body to GIR statements and count them." } }
{
  let res = tokenize(src)
  match res {
    Ok(toks) => {
      let p = parseFlows(toks)
      let flows: Array<FlowDecl> = p.flows
      let fOpt = flows.get(0)
      match fOpt {
        Some(fd) => {
          let stmts = emitBodyGIR(fd.body)
          return stmts.count()
        }
        None => { return -2 }
        _ => { return -2 }
      }
    }
    Err(e) => { return -1 }
  }
}

/// R3 driver C (VALUE, non-vacuous) — lower the FIRST flow's body and project the ACTUAL lowered binop
/// OPCODE of its first return. A count projection (drivers A/B) collapses "add" and "unknown" to the same
/// number, so it stays green even if every opcode is wrong (the #160 str_eq false-green). This projects the
/// opcode VALUE opcodeOf produced, mapped to a distinct Int, so a wrong opcode ("unknown") CHANGES the result.
pure flow giremitBinopProbe(src: String) -> Int
contract { intent { "P9 R3 VALUE driver: project the first return's lowered binop opcode." } }
{
  let res = tokenize(src)
  match res {
    Ok(toks) => {
      let p = parseFlows(toks)
      let flows: Array<FlowDecl> = p.flows
      let fOpt = flows.get(0)
      match fOpt {
        Some(fd) => {
          let stmts: Array<GIRStmt> = emitBodyGIR(fd.body)
          let sOpt = stmts.get(0)
          match sOpt {
            Some(s) => {
              let exprs: Array<GIRExpr> = s.expr
              let eOpt = exprs.get(0)
              match eOpt {
                Some(ex) => {
                  let opc: String = ex.value
                  match opc {
                    "add" => { return 1 }
                    "sub" => { return 2 }
                    "mul" => { return 3 }
                    "div" => { return 4 }
                    "eq" => { return 5 }
                    "lt" => { return 7 }
                    "unknown" => { return 99 }
                    _ => { return 0 }
                  }
                }
                None => { return -3 }
                _ => { return -3 }
              }
            }
            None => { return -2 }
            _ => { return -2 }
          }
        }
        None => { return -1 }
        _ => { return -1 }
      }
    }
    Err(e) => { return -1 }
  }
}
`;
const SRC = "@version 1\n" + strip("lexer.fungi") + "\n" + strip("parser.fungi") + "\n" + strip("gir-emitter.fungi") + "\n" + DRIVER;

const prog = L.parseProgram(SRC, "lexer-parser-giremit-combined.fungi");
const parseErrs = (prog.diagnostics ?? []).filter((d) => d.severity === "error");
const fx = L.checkEffects(prog.flows, prog.ast);
const { gir } = L.emitGIR(prog.ast, prog.flows, fx);
const WAT = L.renderWAT(L.buildWATModuleFromGIR(gir, undefined, "giremit", prog.ast, /*exportAllPure*/ true));

// ── Stage-A: the interpreter runs the SAME combined source ──
async function runInterp(flow, input) {
  const args = new Map([["src", { __tag: "string", value: input }]]);
  const res = await L.executeFlow(flow, args, prog.ast, prog.flows, undefined, undefined, { pureFastPath: true });
  return Number(res?.value?.value ?? res?.value ?? res);
}

// ── Stage-B: real WASM through the #105 admission gate ──
let wasmCtx = null;
async function runWasm(flow, input) {
  if (wasmCtx === null) {
    const asm = await L.assembleWAT(WAT);
    assert.ok(asm.valid && asm.diagnostics.length === 0, "combined lexer+parser+gir-emitter WAT assembles (R0): " + JSON.stringify(asm.diagnostics));
    const host = L.createHostRuntime();
    let maxH = 0;
    for (const e of L.getInternedStrings()) { host.seedString(e.handle, e.value); if (e.handle > maxH) maxH = e.handle; }
    const kp = L.generateRunnerKeypair();
    const att = L.signWasm(asm.wasm, kp.privateKeyPem, "dev");
    const { instance } = await L.admitAndInstantiate({
      wasm: asm.wasm, attestation: att, policy: { requireSigned: true, publicKeyPem: kp.publicKeyPem }, host,
    });
    assert.equal(typeof instance.exports.giremitProbe, "function", "driver admitted + exported (R1)");
    wasmCtx = { host, instance, nextH: maxH + 1 };
  }
  const { host, instance } = wasmCtx;
  const srcH = wasmCtx.nextH++;
  host.seedString(srcH, input);
  return Number(instance.exports[flow](srcH));
}

// Corpus: flow headers + bodies the milestone parser recognises (positive demonstrations).
const CORPUS = [
  "pure flow f(a: Int) -> Int\ncontract { intent { \"x\" } }\n{ return a }",
  "pure flow f(a: Int) -> Int\ncontract { intent { \"x\" } }\n{ return a }\nflow g(b: Int) -> Int\ncontract { intent { \"y\" } }\n{ return b }",
  "pure flow lit() -> Int\ncontract { intent { \"x\" } }\n{ return 1 }\npure flow cmp(a: Int, b: Int) -> Bool\ncontract { intent { \"y\" } }\n{ return a }\nflow io(x: Int) -> Int\ncontract { intent { \"z\" } }\n{ return x }",
  "pure flow rich(a: Int, b: Int) -> Int\ncontract { intent { \"body\" } }\n{ let x = a + b\n if x > 0 { return x }\n while x < 10 { x = x + 1 }\n return b }",
];

describe("P9 R3 · gir-emitter stage: emitGIRModule + emitBodyGIR byte-parity (Stage-A interpreter == Stage-B WASM)", () => {
  it("combined lexer+parser+gir-emitter+driver source parses clean (R0 precondition)", () => {
    assert.equal(parseErrs.length, 0, `combined source must parse clean: ${parseErrs[0]?.code ?? ""} ${parseErrs[0]?.message ?? ""}`);
  });
  // NOTE: the DYNAMIC parity tests below are the R3 proof — the WASM actually runs emitGIRModule/emitBodyGIR
  // and must equal the interpreter, so a returned Array<Auto> erasure (a live #100 trap) reds them. A static
  // "no `unreachable` in the WAT" scan is deliberately NOT used: the combined module includes the parser's
  // own pre-existing dead-branch patterns, and grepping the whole module for `unreachable` is the coarse
  // #160-tail false-positive class. Behaviour-equivalence is the honest, non-vacuous check.
  for (const input of CORPUS) {
    it(`emitGIRModule counts identical for ${JSON.stringify(input.slice(0, 34))}`, async () => {
      const [i, w] = await Promise.all([runInterp("giremitProbe", input), runWasm("giremitProbe", input)]);
      assert.equal(w, i, `WASM emitGIRModule projection must equal interpreter for ${JSON.stringify(input.slice(0, 40))}`);
    });
    it(`emitBodyGIR (recursive) node count identical for ${JSON.stringify(input.slice(0, 34))}`, async () => {
      const [i, w] = await Promise.all([runInterp("giremitBodyProbe", input), runWasm("giremitBodyProbe", input)]);
      assert.equal(w, i, `WASM emitBodyGIR count must equal interpreter for ${JSON.stringify(input.slice(0, 40))}`);
    });
  }
  it("non-vacuity: the rich body yields >0 GIR statements through BOTH backends", async () => {
    const rich = CORPUS[3];
    const [i, w] = await Promise.all([runInterp("giremitBodyProbe", rich), runWasm("giremitBodyProbe", rich)]);
    assert.ok(i > 0, "interpreter lowers a non-empty body");
    assert.equal(w, i, "WASM agrees");
  });
});

// R3 VALUE lane (R&D ruling 2026-07-19): drivers A/B above project COUNTS, which are value-vacuous — the
// count is unchanged whether an operator lowers to "add" or "unknown", so this stage read R3-green while
// every emitted opcode was wrong in WASM (the #160 str_eq false-green, caught only by the runtime exec
// driver). This lane projects the lowered binop OPCODE VALUE (via opcodeOf), mapped to a distinct Int, so a
// wrong opcode ("unknown" ⇒ 99) makes WASM disagree with the interpreter and reds. "Non-vacuous" = the
// projection DISCRIMINATES a correct output from an incorrect one, not merely "the path ran".
const OPCODE_CORPUS = [
  ["pure flow f(a: Int, b: Int) -> Int\ncontract { intent { \"x\" } }\n{ return a + b }", 1, "add"],
  ["pure flow f(a: Int, b: Int) -> Int\ncontract { intent { \"x\" } }\n{ return a - b }", 2, "sub"],
  ["pure flow f(a: Int, b: Int) -> Int\ncontract { intent { \"x\" } }\n{ return a * b }", 3, "mul"],
  ["pure flow f(a: Int, b: Int) -> Bool\ncontract { intent { \"x\" } }\n{ return a < b }", 7, "lt"],
];
describe("P9 R3 · gir-emitter VALUE lane: the lowered binop OPCODE (not a count) is Stage-A ≡ Stage-B", () => {
  for (const [src, code, opc] of OPCODE_CORPUS) {
    it(`opcode "${opc}" projects identically (interp == WASM == ${code}, "unknown" would be 99)`, async () => {
      const [i, w] = await Promise.all([runInterp("giremitBinopProbe", src), runWasm("giremitBinopProbe", src)]);
      assert.equal(i, code, `interpreter must lower "${opc}" to ${code} (a COUNT projection would miss a wrong opcode)`);
      assert.equal(w, i, `WASM opcode value must equal interpreter — a wrong opcode ("unknown" ⇒ 99) reds this`);
    });
  }
});
