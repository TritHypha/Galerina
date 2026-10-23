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

/// R3 driver C — checkFlowBodies; project the DIAGNOSTIC COUNT (R&D bridge 0338).
/// Drivers A and B project flowCount, so they lock "no trap + same flow count" but are VACUOUS on
/// EMISSION: a WASM-only silent skip (walk completes, flowCount identical, diagnostic dropped) would
/// pass them green. That is the exact hole that let the call-arg fail-open ship. This driver makes
/// emission itself the projected value, so the lock holds by construction rather than by hand-probe.
pure flow tcDiagCount(src: String) -> Int
contract { intent { "P9 R3 driver: check flow bodies and project the diagnostic count." } }
{
  let res = tokenize(src)
  match res {
    Ok(toks) => {
      let p = parseFlows(toks)
      let r = checkFlowBodies(p.flows)
      return r.diagnostics.count()
    }
    Err(e) => { return -1 }
  }
}

/// R3 driver D — parseFlows; project its fail-closed parser error count.
/// This keeps finite-input parser refusals non-vacuous through the flipped WAT
/// path instead of inferring them from successful compilation of parser.fungi.
pure flow parseDiagCount(src: String) -> Int
contract { intent { "P9 R3 driver: parse flows and project the parser error count." } }
{
  let res = tokenize(src)
  match res {
    Ok(toks) => {
      let p = parseFlows(toks)
      return p.errors.count()
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
    const kp = L.generateRunnerKeypair();
    const att = L.signWasm(asm.wasm, kp.privateKeyPem, "dev");
    wasmCtx = { wasm: asm.wasm, attestation: att, publicKeyPem: kp.publicKeyPem };
  }
  // Mirror the production low-level executor's one-host-per-execution lifecycle;
  // otherwise the bounded host registries accumulate across unrelated corpus cases.
  const host = L.createHostRuntime();
  for (const e of L.getInternedStrings()) host.seedString(e.handle, e.value);
  const { instance } = await L.admitAndInstantiate({
    wasm: wasmCtx.wasm, attestation: wasmCtx.attestation,
    policy: { requireSigned: true, publicKeyPem: wasmCtx.publicKeyPem }, host,
  });
  assert.equal(typeof instance.exports.tcProbe, "function", "driver admitted + exported (R1)");
  const srcH = host.internString(input);
  return Number(instance.exports[flow](srcH));
}

// Corpus: variety of flow kinds, param/return types, bodies
const CORPUS = [
  "pure flow f(a: Int) -> Int\ncontract { intent { \"x\" } }\n{ return a }",
  "pure flow add(a: Int, b: Int) -> Int\ncontract { intent { \"x\" } }\n{ return a }",
  "pure flow f(a: Int) -> Int\ncontract { intent { \"x\" } }\n{ return a }\npure flow g(b: Int) -> Int\ncontract { intent { \"y\" } }\n{ return b }",
  "pure flow lit() -> Int\ncontract { intent { \"x\" } }\n{ return 1 }",
  "pure flow rich(a: Int, b: Int) -> Int\ncontract { intent { \"body\" } }\n{ let x = a\n if x > 0 { return x }\n while x < 10 { x = a }\n return b }",
  // CALL-BEARING rows (2026-07-25) — the inputs this corpus never had. Their absence is why the
  // type-checker flip went green over a call-arg fail-open, AND why the WASM `unreachable` trap in the
  // first fix went unseen (both sessions' §5a probes were interpreter-only; bridges 0333/0334).
  "pure flow addok(x: Int, y: Int) -> Int\ncontract { intent { \"x\" } }\n{ return x }\npure flow callok() -> Int\ncontract { intent { \"y\" } }\n{ let r = addok(1, 2)\n return r }",
  "pure flow greetp(name: String) -> Int\ncontract { intent { \"x\" } }\n{ return 1 }\npure flow callp() -> Int\ncontract { intent { \"y\" } }\n{ let r = greetp(42)\n return r }",
  "pure flow addp(x: Int, y: Int) -> Int\ncontract { intent { \"x\" } }\n{ return x }\npure flow callq() -> Int\ncontract { intent { \"y\" } }\n{ let r = addp(1, 2, 3)\n return r }",
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

// ── EMISSION parity (R&D bridge 0338) ───────────────────────────────────────────
// The two describes above project flowCount: they lock no-trap, not emission. R&D closed that by
// hand-probe and asked for a permanent lock; this is it. The three call-bearing rows carry the
// expectations — a clean call must be SILENT on both backends, and each mismatch must EMIT on both.
const CALL_OK = 5;      // addok(1,2) — correct call: the silence control
const CALL_BADTYPE = 6; // greetp(42) — String param, Int literal → FUNGI-TYPE-005
const CALL_BADARITY = 7;// addp(1,2,3) — 2 params, 3 args   → FUNGI-TYPE-007

const recordLiteralFlow = (fieldCount) => {
  const fields = Array.from({ length: fieldCount }, (_, index) => `f${index}: ${index}`).join(", ");
  return `pure flow recordCeiling() -> Int\ncontract { intent { "record ceiling" } }\n{ let x = { ${fields} }\n return 1 }`;
};

describe("P9 R3 · record field ceiling is non-vacuous through Stage-B WASM", () => {
  it("admits exactly 64 literal fields on BOTH backends", async () => {
    const source = recordLiteralFlow(64);
    const [i, w] = await Promise.all([runInterp("parseDiagCount", source), runWasm("parseDiagCount", source)]);
    assert.equal(i, 0, "interpreter must admit the exact 64-field ceiling");
    assert.equal(w, 0, "WASM must admit the exact 64-field ceiling");
  });

  it("refuses field 65 on BOTH backends", async () => {
    const source = recordLiteralFlow(65);
    const [i, w] = await Promise.all([runInterp("parseDiagCount", source), runWasm("parseDiagCount", source)]);
    assert.ok(i >= 1, `interpreter must emit a parser refusal for field 65, got ${i}`);
    assert.ok(w >= 1, `WASM must emit a parser refusal for field 65, got ${w}`);
    assert.equal(w, i, "WASM and interpreter must agree on the parser refusal count");
  });
});

describe("P9 R3 · type-checker stage: checkFlowBodies EMISSION parity (diagnostics, not just flowCount)", () => {
  for (const input of CORPUS) {
    it(`diagnostic count identical for ${JSON.stringify(input.slice(0, 40))}`, async () => {
      const [i, w] = await Promise.all([runInterp("tcDiagCount", input), runWasm("tcDiagCount", input)]);
      assert.equal(w, i, `WASM diagnostic count must equal interpreter for ${JSON.stringify(input.slice(0, 40))}`);
    });
  }

  // Equality alone would be satisfied by BOTH backends emitting nothing, so the three call rows carry
  // measured expectations. Values below were measured through this harness, not assumed.
  it("non-vacuity: a CORRECT call is silent on BOTH backends (the false-positive control)", async () => {
    const [i, w] = await Promise.all([runInterp("tcDiagCount", CORPUS[CALL_OK]), runWasm("tcDiagCount", CORPUS[CALL_OK])]);
    assert.equal(i, 0, "interpreter must not diagnose a correct call");
    assert.equal(w, 0, "WASM must not diagnose a correct call");
  });

  it("non-vacuity: an arg-TYPE mismatch EMITS on BOTH backends (not just no-trap)", async () => {
    const [i, w] = await Promise.all([runInterp("tcDiagCount", CORPUS[CALL_BADTYPE]), runWasm("tcDiagCount", CORPUS[CALL_BADTYPE])]);
    assert.ok(i >= 1, `interpreter must emit for an arg-type mismatch, got ${i}`);
    assert.ok(w >= 1, `WASM must emit for an arg-type mismatch, got ${w} — a WASM-only silent skip is the vacuity this row exists to catch`);
  });

  it("non-vacuity: an arg-COUNT mismatch EMITS on BOTH backends (not just no-trap)", async () => {
    const [i, w] = await Promise.all([runInterp("tcDiagCount", CORPUS[CALL_BADARITY]), runWasm("tcDiagCount", CORPUS[CALL_BADARITY])]);
    assert.ok(i >= 1, `interpreter must emit for an arity mismatch, got ${i}`);
    assert.ok(w >= 1, `WASM must emit for an arity mismatch, got ${w} — a WASM-only silent skip is the vacuity this row exists to catch`);
  });
});
