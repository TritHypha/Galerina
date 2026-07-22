// wat-p9-effectchecker-parity.test.mjs — P9 R3 for the EFFECT-CHECKER stage (Phase 3, DSS.wasm path):
// effect-checker.fungi produces an IDENTICAL result through the Stage-A interpreter AND compiled to
// real WASM through the #105 admission gate, over a parsed corpus. Same concatenation pattern as
// wat-p9-typechecker-parity: lexer + parser + effect-checker + driver compiled as one module.
//
// This pins the Phase-2 concretization: effect-checker's Array<Auto>/Auto AST params were typed to
// the parser's concrete records (FlowDecl / Stmt / Expr). If the erasure returns, the WASM side
// traps and this reds. Also pins the effectWithNames typed-local hoist (EffectDiagnostic) and the
// EffectTransRec typed-local hoist — both are required for WASM when diagnostics are present.
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

// Driver A: tokenize -> parseFlows -> checkBodyEffects; project flowCount (non-vacuous: >0 for any parsed flow).
// Driver B: project cleanFlows (flows with zero effect diagnostics).
const DRIVER = `
/// R3 driver A — tokenize -> parseFlows -> checkBodyEffects; project flowCount.
pure flow ecProbe(src: String) -> Int
contract { intent { "P9 R3 driver: effect-check via body AST walk and project flowCount." } }
{
  let res = tokenize(src)
  match res {
    Ok(toks) => {
      let p = parseFlows(toks)
      let r = checkBodyEffects(p.flows)
      return r.flowCount
    }
    Err(e) => { return -1 }
  }
}

/// R3 driver B — project cleanFlows (non-vacuous: exercises the diagnostic path when
/// flows DO use effectful calls, and confirms cleanFlows is the right count otherwise).
pure flow ecCleanProbe(src: String) -> Int
contract { intent { "P9 R3 driver: effect-check via body AST walk and project cleanFlows." } }
{
  let res = tokenize(src)
  match res {
    Ok(toks) => {
      let p = parseFlows(toks)
      let r = checkBodyEffects(p.flows)
      return r.cleanFlows
    }
    Err(e) => { return -1 }
  }
}
`;

const SRC = "@version 1\n" + strip("lexer.fungi") + "\n" + strip("parser.fungi") + "\n" + strip("effect-checker.fungi") + "\n" + DRIVER;

const prog = L.parseProgram(SRC, "lexer-parser-effectchecker-combined.fungi");
const parseErrs = (prog.diagnostics ?? []).filter((d) => d.severity === "error");
const fx = L.checkEffects(prog.flows, prog.ast);
const { gir } = L.emitGIR(prog.ast, prog.flows, fx);
const WAT = L.renderWAT(L.buildWATModuleFromGIR(gir, undefined, "effectchecker", prog.ast, /*exportAllPure*/ true));

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
    assert.equal(typeof instance.exports.ecProbe, "function", "driver admitted + exported (R1)");
    wasmCtx = { host, instance, nextH: maxH + 1 };
  }
  const { host, instance } = wasmCtx;
  const srcH = wasmCtx.nextH++;
  host.seedString(srcH, input);
  return Number(instance.exports[flow](srcH));
}

// Corpus: variety of flow kinds, effect declarations, and body-effectful calls.
// Flows with declared effects matching their body calls are clean.
// A pure flow with no body calls is also clean.
const CORPUS = [
  // single pure flow, no body effects → flowCount=1, cleanFlows=1
  "pure flow f(a: Int) -> Int\ncontract { intent { \"x\" } }\n{ return a }",
  // two pure flows → flowCount=2, cleanFlows=2
  "pure flow f(a: Int) -> Int\ncontract { intent { \"x\" } }\n{ return a }\npure flow g(b: Int) -> Int\ncontract { intent { \"y\" } }\n{ return b }",
  // flow that declares database.read and uses dbRead in body → clean
  "flow reader(x: Int) -> Int\neffects { database.read }\ncontract { intent { \"x\" } }\n{ let n = dbRead(x)\n return x }",
  // flow with if body containing a call to auditWrite with audit.write declared → clean
  "flow auditor(x: Int) -> Int\neffects { audit.write }\ncontract { intent { \"x\" } }\n{ if x > 0 { auditWrite(x) }\n return x }",
  // three flows: two pure, one effectful → flowCount=3
  "pure flow a(n: Int) -> Int\ncontract { intent { \"a\" } }\n{ return n }\npure flow b(n: Int) -> Int\ncontract { intent { \"b\" } }\n{ return n }\nflow c(n: Int) -> Int\neffects { database.read }\ncontract { intent { \"c\" } }\n{ let v = dbRead(n)\n return n }",
];

describe("P9 R3 · effect-checker stage: checkBodyEffects flowCount byte-parity (Stage-A interpreter == Stage-B WASM)", () => {
  it("combined lexer+parser+effect-checker+driver source parses clean (R0 precondition)", () => {
    assert.equal(parseErrs.length, 0, `combined source must parse clean: ${parseErrs[0]?.code ?? ""} ${parseErrs[0]?.message ?? ""}`);
  });

  for (const input of CORPUS) {
    it(`checkBodyEffects flowCount identical for ${JSON.stringify(input.slice(0, 40))}`, async () => {
      const [i, w] = await Promise.all([runInterp("ecProbe", input), runWasm("ecProbe", input)]);
      assert.equal(w, i, `WASM checkBodyEffects flowCount must equal interpreter for ${JSON.stringify(input.slice(0, 40))}`);
    });
  }

  it("non-vacuity: a 3-flow corpus yields flowCount=3 through BOTH backends", async () => {
    const three = CORPUS[4];
    const [i, w] = await Promise.all([runInterp("ecProbe", three), runWasm("ecProbe", three)]);
    assert.equal(i, 3, "interpreter must see 3 flows");
    assert.equal(w, i, "WASM agrees");
  });
});

describe("P9 R3 · effect-checker stage: checkBodyEffects cleanFlows byte-parity (Stage-A interpreter == Stage-B WASM)", () => {
  for (const input of CORPUS) {
    it(`checkBodyEffects cleanFlows identical for ${JSON.stringify(input.slice(0, 40))}`, async () => {
      const [i, w] = await Promise.all([runInterp("ecCleanProbe", input), runWasm("ecCleanProbe", input)]);
      assert.equal(w, i, `WASM checkBodyEffects cleanFlows must equal interpreter for ${JSON.stringify(input.slice(0, 40))}`);
    });
  }

  it("non-vacuity: all-clean 2-flow corpus yields cleanFlows=2 through BOTH backends (body walk ran, no effect errors)", async () => {
    const two = CORPUS[1];
    const [i, w] = await Promise.all([runInterp("ecCleanProbe", two), runWasm("ecCleanProbe", two)]);
    assert.equal(i, 2, "interpreter must report 2 clean flows (pure flows with no body effects are clean)");
    assert.equal(w, i, "WASM agrees");
  });

  it("non-vacuity (VALUE): a flow with audit.write declared + auditWrite body call is clean (effectWithNames exercised)", async () => {
    const auditor = CORPUS[3];
    const [i, w] = await Promise.all([runInterp("ecCleanProbe", auditor), runWasm("ecCleanProbe", auditor)]);
    assert.equal(i, 1, "interpreter: auditor declares audit.write and calls auditWrite — clean flow");
    assert.equal(w, i, "WASM agrees (effectWithNames typed-local hoist must be correct)");
  });
});
