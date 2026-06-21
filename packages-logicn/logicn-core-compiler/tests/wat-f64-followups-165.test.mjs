// #165 follow-ups — runtime regression guards for f64 scenarios BEYOND the single-flow cases in
// wat-f64-runtime-165.test.mjs: cross-flow float calls, a float-returning `if` (both branches, i.e. an
// early `(return <f64>)`), float comparisons, and negation. All verified working after the #165 fix;
// these pin them so a future Option/return-type change can't silently regress f64 across flow boundaries.
//
// Tri-Pipe verdict: Binary-only (exact IEEE-754 digital arithmetic).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as L from "../dist/index.js";

async function run(src) {
  const p = L.parseProgram(src, "t.lln");
  const errs = (p.diagnostics ?? []).filter((d) => d.severity === "error");
  assert.equal(errs.length, 0, "parse: " + errs.map((d) => d.message).join("; "));
  const fx = L.checkEffects(p.flows, p.ast);
  const { gir } = L.emitGIR(p.ast, p.flows, fx);
  const wat = L.renderWAT(L.buildWATModuleFromGIR(gir, undefined, "wasm-standalone", p.ast, true));
  const asm = await L.assembleWAT(wat);
  assert.equal(asm.valid, true, "module valid: " + JSON.stringify(asm.diagnostics));
  const rt = L.createHostRuntime();
  const { instance } = await WebAssembly.instantiate(asm.wasm, rt.imports);
  return instance.exports;
}

describe("#165 follow-ups: f64 across flow boundaries and control flow", () => {
  it("a flow CALLS another flow that returns Float (the f64 result threads through the call)", async () => {
    const ex = await run(`pure flow add(a: Float, b: Float) -> Float contract { effects {} } { return a + b }
pure flow useit() -> Float contract { effects {} } { return add(1.5, 2.5) }`);
    assert.equal(ex.useit(), 4.0);
  });

  it("a float local bound from a CALL keeps f64 and arithmetic on it is correct", async () => {
    const ex = await run(`pure flow add(a: Float, b: Float) -> Float contract { effects {} } { return a + b }
pure flow useit() -> Float contract { effects {} } { let x: Float = add(1.5, 2.5) return x + 1.0 }`);
    assert.equal(ex.useit(), 5.0);
  });

  it("a float-returning `if` is correct on BOTH branches (early (return <f64>) lowers to f64)", async () => {
    const ex = await run(`pure flow pick(c: Bool) -> Float contract { effects {} } { if c { return 1.5 } return 2.5 }`);
    assert.equal(ex.pick(1), 1.5, "true branch (early return f64)");
    assert.equal(ex.pick(0), 2.5, "fall-through return f64");
  });

  it("a float comparison returns the correct i32 bool on both sides", async () => {
    const ex = await run(`pure flow gt(a: Float) -> Bool contract { effects {} } { return a > 1.0 }`);
    assert.equal(ex.gt(2.5), 1);
    assert.equal(ex.gt(0.5), 0);
  });

  it("float negation via 0.0 - a is correct", async () => {
    const ex = await run(`pure flow neg(a: Float) -> Float contract { effects {} } { return 0.0 - a }`);
    assert.equal(ex.neg(2.5), -2.5);
    assert.equal(ex.neg(-4.0), 4.0);
  });
});
