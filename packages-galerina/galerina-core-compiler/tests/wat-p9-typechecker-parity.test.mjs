// wat-p9-typechecker-parity.test.mjs — P9 R3 for the TYPE-CHECKER stage (Phase 3, DSS.wasm path):
// type-checker.fungi produces an IDENTICAL result through the Stage-A interpreter AND compiled to
// real WASM through the #105 admission gate, over a parsed corpus. Same concatenation pattern as
// wat-p9-giremit-parity: lexer + parser + type-checker + driver compiled as one module.
//
// This pins the Phase-2 concretization: type-checker's Array<Auto>/Auto AST params were typed to
// the parser's concrete records (FlowDecl / FlowParam / Stmt / Expr). If the erasure returns, the
// WASM side traps and this reds.
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

// Driver A: tokenize -> parseFlows -> checkFlows; project flowCount (non-vacuous: non-zero for any valid flow).
// Driver B: also calls checkFlowBodies; project cleanFlows from that result.
const DRIVER = `
/// R3 driver A — tokenize -> parseFlows -> checkFlows; project flowCount.
pure flow tcProbe(src: String) -> Int
contract { intent { "P9 R3 driver: type-check and project flowCount." } }
{
  let res = tokenize(src)
  match res {
    Ok(toks) => {
      let p = parseFlows(toks)
      let r = checkFlows(p.flows)
      return r.flowCount
    }
    Err(e) => { return -1 }
  }
}

/// R3 driver B — checkFlowBodies; project flowCount.
pure flow tcBodyProbe(src: String) -> Int
contract { intent { "P9 R3 driver: check flow bodies and project flowCount." } }
{
  let res = tokenize(src)
  match res {
    Ok(toks) => {
      let p = parseFlows(toks)
      let r = checkFlowBodies(p.flows)
      return r.flowCount
    }
    Err(e) => { return -1 }
  }
}
`;

const SRC = "@version 1\n" + strip("lexer.fungi") + "\n" + strip("parser.fungi") + "\n" + strip("type-checker.fungi") + "\n" + DRIVER;

const prog = L.parseProgram(SRC, "lexer-parser-typechecker-combined.fungi");
const parseErrs = (prog.diagnostics ?? []).filter((d) => d.severity === "error");
const fx = L.checkEffects(prog.flows, prog.ast);
const { gir } = L.emitGIR(prog.ast, prog.flows, fx);
const WAT = L.renderWAT(L.buildWATModuleFromGIR(gir, undefined, "typechecker", prog.ast, /*exportAllPure*/ true));

// ── Stage-A: interpreter runs the SAME combined source ──
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
    assert.ok(asm.valid && asm.diagnostics.length === 0, "combined WAT assembles (R0): " + JSON.stringify(asm.diagnostics));
    const host = L.createHostRuntime();
    let maxH = 0;
    for (const e of L.getInternedStrings()) { host.seedString(e.handle, e.value); if (e.handle > maxH) maxH = e.handle; }
    const kp = L.generateRunnerKeypair();
    const att = L.signWasm(asm.wasm, kp.privateKeyPem, "dev");
    const { instance } = await L.admitAndInstantiate({
      wasm: asm.wasm, attestation: att, policy: { requireSigned: true, publicKeyPem: kp.publicKeyPem }, host,
    });
    assert.equal(typeof instance.exports.tcProbe, "function", "driver admitted + exported (R1)");
    wasmCtx = { host, instance, nextH: maxH + 1 };
  }
  const { host, instance } = wasmCtx;
  const srcH = wasmCtx.nextH++;
  host.seedString(srcH, input);
  return Number(instance.exports[flow](srcH));
}

// Corpus: variety of flow kinds, param/return types, bodies
const CORPUS = [
  "pure flow f(a: Int) -> Int\ncontract { intent { \"x\" } }\n{ return a }",
  "pure flow add(a: Int, b: Int) -> Int\ncontract { intent { \"x\" } }\n{ return a }",
  "pure flow f(a: Int) -> Int\ncontract { intent { \"x\" } }\n{ return a }\npure flow g(b: Int) -> Int\ncontract { intent { \"y\" } }\n{ return b }",
  "pure flow lit() -> Int\ncontract { intent { \"x\" } }\n{ return 1 }",
  "pure flow rich(a: Int, b: Int) -> Int\ncontract { intent { \"body\" } }\n{ let x = a\n if x > 0 { return x }\n while x < 10 { x = a }\n return b }",
];

describe("P9 R3 · type-checker stage: checkFlows byte-parity (Stage-A interpreter == Stage-B WASM)", () => {
  it("combined lexer+parser+type-checker+driver source parses clean (R0 precondition)", () => {
    assert.equal(parseErrs.length, 0, `combined source must parse clean: ${parseErrs[0]?.code ?? ""} ${parseErrs[0]?.message ?? ""}`);
  });

  for (const input of CORPUS) {
    it(`checkFlows flowCount identical for ${JSON.stringify(input.slice(0, 40))}`, async () => {
      const [i, w] = await Promise.all([runInterp("tcProbe", input), runWasm("tcProbe", input)]);
      assert.equal(w, i, `WASM checkFlows flowCount must equal interpreter for ${JSON.stringify(input.slice(0, 40))}`);
    });
  }

  it("non-vacuity: a 2-flow corpus yields flowCount=2 through BOTH backends", async () => {
    const two = CORPUS[2];
    const [i, w] = await Promise.all([runInterp("tcProbe", two), runWasm("tcProbe", two)]);
    assert.equal(i, 2, "interpreter must see 2 flows");
    assert.equal(w, i, "WASM agrees");
  });
});

describe("P9 R3 · type-checker stage: checkFlowBodies byte-parity (Stage-A interpreter == Stage-B WASM)", () => {
  for (const input of CORPUS) {
    it(`checkFlowBodies flowCount identical for ${JSON.stringify(input.slice(0, 40))}`, async () => {
      const [i, w] = await Promise.all([runInterp("tcBodyProbe", input), runWasm("tcBodyProbe", input)]);
      assert.equal(w, i, `WASM checkFlowBodies flowCount must equal interpreter for ${JSON.stringify(input.slice(0, 40))}`);
    });
  }

  it("non-vacuity: rich body flow yields flowCount=1 through BOTH backends (body walk ran)", async () => {
    const rich = CORPUS[4];
    const [i, w] = await Promise.all([runInterp("tcBodyProbe", rich), runWasm("tcBodyProbe", rich)]);
    assert.equal(i, 1, "interpreter must report 1 flow from the body-level check");
    assert.equal(w, i, "WASM agrees");
  });
});
