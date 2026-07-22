// wat-p9-governance-parity.test.mjs — P9 R3 for the GOVERNANCE-VERIFIER stage (Phase 3, DSS.wasm path):
// governance-verifier.fungi produces an IDENTICAL result through the Stage-A interpreter AND compiled to
// real WASM through the #105 admission gate, over a parsed corpus. Same concatenation pattern as
// wat-p9-typechecker-parity: lexer + parser + governance-verifier + driver compiled as one module.
//
// This pins the Phase-2 concretization: governance-verifier's Array<Auto>/Auto AST params were typed
// to the parser's concrete records (FlowDecl / Stmt / Expr). If the erasure returns, the WASM side
// traps and this reds. Tests both verifyGovernance (metadata-path) and checkBodyGovernance (AST-body
// path, recursing into Stmt/Expr trees to detect auditWrite calls).
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

// Driver A: tokenize -> parseFlows -> verifyGovernance; project passed + failed (total flows checked).
// Driver B: tokenize -> parseFlows -> checkBodyGovernance; project passed.
const DRIVER = `
/// R3 driver A — tokenize -> parseFlows -> verifyGovernance; project passed + failed.
pure flow govProbe(src: String) -> Int
contract { intent { "P9 R3 driver: verify governance metadata and project passed+failed." } }
{
  let res = tokenize(src)
  match res {
    Ok(toks) => {
      let p = parseFlows(toks)
      let r = verifyGovernance(p.flows)
      return r.passed + r.failed
    }
    Err(e) => { return -1 }
  }
}

/// R3 driver B — tokenize -> parseFlows -> checkBodyGovernance; project passed.
pure flow govBodyProbe(src: String) -> Int
contract { intent { "P9 R3 driver: verify body governance and project passed count." } }
{
  let res = tokenize(src)
  match res {
    Ok(toks) => {
      let p = parseFlows(toks)
      let r = checkBodyGovernance(p.flows)
      return r.passed
    }
    Err(e) => { return -1 }
  }
}
`;

const SRC = "@version 1\n" + strip("lexer.fungi") + "\n" + strip("parser.fungi") + "\n" + strip("governance-verifier.fungi") + "\n" + DRIVER;

const prog = L.parseProgram(SRC, "lexer-parser-govverifier-combined.fungi");
const parseErrs = (prog.diagnostics ?? []).filter((d) => d.severity === "error");
const fx = L.checkEffects(prog.flows, prog.ast);
const { gir } = L.emitGIR(prog.ast, prog.flows, fx);
const WAT = L.renderWAT(L.buildWATModuleFromGIR(gir, undefined, "govverifier", prog.ast, /*exportAllPure*/ true));

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
    assert.equal(typeof instance.exports.govProbe, "function", "driver admitted + exported (R1)");
    wasmCtx = { host, instance, nextH: maxH + 1 };
  }
  const { host, instance } = wasmCtx;
  const srcH = wasmCtx.nextH++;
  host.seedString(srcH, input);
  return Number(instance.exports[flow](srcH));
}

// Corpus: variety of flow kinds exercising both governance metadata and body-AST paths.
const CORPUS = [
  // simple pure flow — no governance annotations → passed=1, failed=0
  "pure flow f(a: Int) -> Int\ncontract { intent { \"x\" } }\n{ return a }",
  // two pure flows
  "pure flow f(a: Int) -> Int\ncontract { intent { \"x\" } }\n{ return a }\npure flow g(b: Int) -> Int\ncontract { intent { \"y\" } }\n{ return b }",
  // secure flow with audit.write declared → passes governance (FUNGI-GOV-002 not triggered, has effects)
  "secure flow sec(x: Int) -> Int\neffects { audit.write }\ncontract { intent { \"x\" } }\n{ return x }",
  // pure flow + secure flow → both in corpus; body check: secure has body, pure is clean
  "pure flow p(a: Int) -> Int\ncontract { intent { \"x\" } }\n{ return a }\nsecure flow s(x: Int) -> Int\neffects { audit.write }\ncontract { intent { \"x\" } }\n{ auditWrite(x)\n return x }",
  // secure flow with auditWrite in if body
  "secure flow guarded(x: Int) -> Int\neffects { audit.write }\ncontract { intent { \"x\" } }\n{ if x > 0 { auditWrite(x) }\n return x }",
];

describe("P9 R3 · governance-verifier stage: verifyGovernance byte-parity (Stage-A interpreter == Stage-B WASM)", () => {
  it("combined lexer+parser+governance-verifier+driver source parses clean (R0 precondition)", () => {
    assert.equal(parseErrs.length, 0, `combined source must parse clean: ${parseErrs[0]?.code ?? ""} ${parseErrs[0]?.message ?? ""}`);
  });

  for (const input of CORPUS) {
    it(`verifyGovernance passed+failed identical for ${JSON.stringify(input.slice(0, 40))}`, async () => {
      const [i, w] = await Promise.all([runInterp("govProbe", input), runWasm("govProbe", input)]);
      assert.equal(w, i, `WASM verifyGovernance result must equal interpreter for ${JSON.stringify(input.slice(0, 40))}`);
    });
  }

  it("non-vacuity: 2-flow corpus yields passed+failed=2 through BOTH backends", async () => {
    const two = CORPUS[1];
    const [i, w] = await Promise.all([runInterp("govProbe", two), runWasm("govProbe", two)]);
    assert.equal(i, 2, "interpreter must see 2 flows (passed+failed=2)");
    assert.equal(w, i, "WASM agrees");
  });
});

describe("P9 R3 · governance-verifier stage: checkBodyGovernance byte-parity (Stage-A interpreter == Stage-B WASM)", () => {
  for (const input of CORPUS) {
    it(`checkBodyGovernance passed identical for ${JSON.stringify(input.slice(0, 40))}`, async () => {
      const [i, w] = await Promise.all([runInterp("govBodyProbe", input), runWasm("govBodyProbe", input)]);
      assert.equal(w, i, `WASM checkBodyGovernance passed must equal interpreter for ${JSON.stringify(input.slice(0, 40))}`);
    });
  }

  it("non-vacuity (VALUE): secure flow with auditWrite body call is passed (body walk ran, Expr tree recursed)", async () => {
    const secAudit = CORPUS[3]; // pure+secure, secure has auditWrite
    const [i, w] = await Promise.all([runInterp("govBodyProbe", secAudit), runWasm("govBodyProbe", secAudit)]);
    assert.ok(i > 0, "interpreter: at least one flow passed body governance check");
    assert.equal(w, i, "WASM agrees (exprCallsAudit/flowCallsAudit body recursion is correct)");
  });

  it("non-vacuity (VALUE): secure flow with nested body traversal is consistent across backends", async () => {
    const nested = CORPUS[4]; // secure with auditWrite inside if body
    const [i, w] = await Promise.all([runInterp("govBodyProbe", nested), runWasm("govBodyProbe", nested)]);
    assert.ok(typeof i === "number" && !isNaN(i), "interpreter returns a number");
    assert.equal(w, i, "WASM agrees with interpreter on nested body governance check (flowCallsAudit recursion)");
  });
});
