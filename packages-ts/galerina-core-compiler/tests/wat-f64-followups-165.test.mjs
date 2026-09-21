// #165 follow-ups — runtime regression guards for f64 scenarios BEYOND the single-flow cases in
// wat-f64-runtime-165.test.mjs: cross-flow float calls, a float-returning `if` (both branches, i.e. an
// early `(return <f64>)`), float comparisons, and negation. All verified working after the #165 fix;
// these pin them so a future Option/return-type change can't silently regress f64 across flow boundaries.
//
// Tri-Pipe verdict: Binary-only (exact IEEE-754 digital arithmetic).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as L from "../dist/index.js";

async function runWithWAT(src) {
  const p = L.parseProgram(src, "t.fungi");
  const errs = (p.diagnostics ?? []).filter((d) => d.severity === "error");
  assert.equal(errs.length, 0, "parse: " + errs.map((d) => d.message).join("; "));
  const fx = L.checkEffects(p.flows, p.ast);
  const { gir } = L.emitGIR(p.ast, p.flows, fx);
  const wat = L.renderWAT(L.buildWATModuleFromGIR(gir, undefined, "wasm-standalone", p.ast, true));
  const asm = await L.assembleWAT(wat);
  assert.equal(asm.valid, true, "module valid: " + JSON.stringify(asm.diagnostics));
  const rt = L.createHostRuntime();
  const { instance } = await WebAssembly.instantiate(asm.wasm, rt.imports);
  return { wat, exports: instance.exports };
}

async function run(src) {
  return (await runWithWAT(src)).exports;
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

  it("unary negative Float64 literals lower through f64.neg in records and direct expressions", async () => {
    const { wat, exports } = await runWithWAT(`record Sample { value: Float64 }
pure flow make() -> Sample { return Sample { value: -1.0 } }
pure flow read(sample: Sample) -> Float64 { return sample.value }
pure flow direct() -> Float64 { return -0.5 }`);
    assert.match(wat, /f64\.neg/, "unary Float64 minus must use the f64 lane");
    assert.doesNotMatch(wat, /fungi_checked_sub_i32 \(i32\.const 0\) \(f64\.const/,
      "an f64 literal must never enter the checked i32 subtraction helper");
    assert.equal(exports.read(exports.make()), -1.0);
    assert.equal(exports.direct(), -0.5);
  });

  it("unary Float64 parameters preserve signed zero and refuse non-finite inputs", async () => {
    const ex = await run(`pure flow negate(value: Float64) -> Float64 { return -value }
pure flow negativeZero() -> Float64 { return -0.0 }`);
    assert.equal(ex.negate(2.5), -2.5);
    assert.equal(ex.negate(-4.0), 4.0);
    assert.equal(Object.is(ex.negativeZero(), -0), true, "f64.neg must preserve IEEE-754 signed zero");
    assert.throws(() => ex.negate(Number.POSITIVE_INFINITY), WebAssembly.RuntimeError);
    assert.throws(() => ex.negate(Number.NaN), WebAssembly.RuntimeError);
  });

  it("unary Decimal uses the exact host neg and never enters the f64 lane", async () => {
    const p = L.parseProgram("pure flow negate(value: Decimal) -> Decimal { return -value }", "t.fungi");
    const fx = L.checkEffects(p.flows, p.ast);
    const { gir } = L.emitGIR(p.ast, p.flows, fx);
    const wat = L.renderWAT(L.buildWATModuleFromGIR(gir, undefined, "wasm-standalone", p.ast, true));
    assert.match(wat, /host___decimal_neg/);
    assert.doesNotMatch(wat, /f64\.neg/, "Decimal must not silently use binary floating-point negation");
    assert.doesNotMatch(wat, /fungi_checked_sub_i32/, "Decimal must not negate the i32 handle");
    const asm = await L.assembleWAT(wat);
    assert.equal(asm.valid, true, JSON.stringify(asm.diagnostics));
    const host = L.createHostRuntime();
    const { instance } = await WebAssembly.instantiate(asm.wasm, host.imports);
    const value = host.internDecimal("1.25");
    const negated = instance.exports.negate(value);
    assert.equal(host.readDecimal(negated), "-1.25");
  });

  it("Option<Float64> keeps the handle on i32 and the payload on the f64 lane", async () => {
    const { wat, exports } = await runWithWAT(`
pure flow make(value: Float64) -> Option<Float64> { return Some(value) }
pure flow read(option: Option<Float64>) -> Float64 { return option.unwrapOr(3.5) }
pure flow propagate(option: Option<Float64>) -> Option<Float64> {
  let value: Float64 = option?
  return Some(value)
}
pure flow select(option: Option<Float64>) -> Float64 {
  match option {
    None => { return 0.5 }
    Some(value) => { return value }
    _ => { return 0.0 }
  }
}`);
    assert.match(wat, /__option_some_f64_v2/);
    assert.match(wat, /__unwrap_or_f64_v2/);
    assert.match(wat, /__option_value_f64_v2/);
    const some = exports.make(2.25);
    assert.equal(exports.read(some), 2.25);
    assert.equal(exports.read(-1), 3.5, "None uses the Float64 fallback");
    assert.equal(exports.read(exports.propagate(some)), 2.25, "? unwraps the f64 payload before re-wrapping");
    assert.equal(exports.propagate(-1), -1, "? propagates None as the Option handle");
    assert.equal(exports.select(some), 2.25);
    assert.equal(exports.select(-1), 0.5);
    const negativeZero = exports.make(-0);
    assert.equal(Object.is(exports.read(negativeZero), -0), true, "Float64 Option preserves signed zero");
  });
});
