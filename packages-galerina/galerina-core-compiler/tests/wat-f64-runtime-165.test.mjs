// #165 — float WAT lowering, RUNTIME behaviour. The sibling wat-f64-165.test.mjs proves the right
// OPCODES are emitted and the module ASSEMBLES; it does not instantiate. That left two real bugs that
// only a run-time check catches (assembleWAT().valid is satisfied by a module that WebAssembly.instantiate
// then rejects):
//   1. a float-RETURNING flow was typed `(result i32)` over an f64 body → invalid module → walker.
//   2. a float LOCAL (`let y: Float = …`) was declared `(local $y i32)` and set with an f64 → mistyped.
// These tests instantiate and assert the COMPUTED f64 value, so a wrong opcode/type can't false-green.
//
// Tri-Pipe verdict: Binary-only — IEEE-754 f64 is exact digital arithmetic on the Binary pipe; no
// Hybrid/Photonic facet (floats only reach the photonic seam as tensor kernels, a separate path).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseProgram, checkEffects, emitGIR, renderWAT, buildWATModuleFromGIR, assembleWAT } from "../dist/index.js";

async function run(src) {
  const p = parseProgram(src, "t.spore");
  const errs = (p.diagnostics ?? []).filter((d) => d.severity === "error");
  assert.equal(errs.length, 0, "parse: " + errs.map((d) => d.message).join("; "));
  const fx = checkEffects(p.flows, p.ast);
  const { gir } = emitGIR(p.ast, p.flows, fx);
  const wat = renderWAT(buildWATModuleFromGIR(gir, undefined, "t", p.ast, true));
  const asm = await assembleWAT(wat);
  assert.equal(asm.valid, true, "module must be valid: " + JSON.stringify(asm.diagnostics));
  const { instance } = await WebAssembly.instantiate(asm.wasm);
  return { wat, exports: instance.exports };
}

describe("#165: float WAT lowering — runtime behaviour", () => {
  it("a float-returning flow is typed (result f64) and computes the correct f64", async () => {
    const { wat, exports } = await run(
      "pure flow add(a: Float, b: Float) -> Float contract { effects {} } { return a + b }");
    assert.match(wat, /\(func \$add \(param \$p0 f64\) \(param \$p1 f64\) \(result f64\)/, "f64 signature");
    assert.equal(exports.add(0.1, 0.2), 0.1 + 0.2, "exact IEEE-754 sum (0.30000000000000004)");
    assert.equal(exports.add(2.5, -1.0), 1.5);
  });

  it("a float LOCAL holds an f64 across param·arith·return (was the (local i32) bug)", async () => {
    const { wat, exports } = await run(
      "pure flow scale(x: Float) -> Float contract { effects {} } { let y: Float = x * 2.0 return y + 0.5 }");
    assert.match(wat, /\(local \$y f64\)/, "the float local must be declared f64, not i32");
    assert.equal(exports.scale(2.5), 5.5);
    assert.equal(exports.scale(0.0), 0.5);
  });

  it("a float local with NO annotation takes f64 from its initialiser's stack type", async () => {
    const { wat, exports } = await run(
      "pure flow f(x: Float) -> Float contract { effects {} } { let y = x / 4.0 return y }");
    assert.match(wat, /\(local \$y f64\)/, "inferred-float local is f64 (initialiser is f64.div)");
    assert.equal(exports.f(10.0), 2.5);
  });

  it("a mixed int/float operand promotes the int and computes correctly", async () => {
    const { exports } = await run(
      "pure flow f(x: Float) -> Float contract { effects {} } { return x * 2 + 1 }");
    assert.equal(exports.f(2.5), 6.0, "2.5*2 + 1 = 6.0 (the int operands promote to f64)");
  });

  it("the four float ops compute correct results at runtime", async () => {
    const { exports } = await run(`pure flow sub(a: Float, b: Float) -> Float contract { effects {} } { return a - b }
pure flow mul(a: Float, b: Float) -> Float contract { effects {} } { return a * b }
pure flow div(a: Float, b: Float) -> Float contract { effects {} } { return a / b }`);
    assert.equal(exports.sub(5.0, 2.0), 3.0);
    assert.equal(exports.mul(1.5, 4.0), 6.0);
    assert.equal(exports.div(7.0, 2.0), 3.5);
  });

  it("a float comparison returns an i32 bool (0/1) at runtime", async () => {
    const { wat, exports } = await run(
      "pure flow lt(a: Float, b: Float) -> Bool contract { effects {} } { return a < b }");
    assert.match(wat, /\(func \$lt \(param \$p0 f64\) \(param \$p1 f64\) \(result i32\)/, "Bool result stays i32");
    assert.equal(exports.lt(1.5, 2.5), 1, "1.5 < 2.5 → 1");
    assert.equal(exports.lt(3.0, 2.0), 0, "3.0 < 2.0 → 0");
  });

  it("a while-loop accumulating a float local computes correctly", async () => {
    const { exports } = await run(`pure flow sum(n: Int) -> Float contract { effects {} } {
  mut acc: Float = 0.0
  mut i = 0
  while i < n { acc = acc + 0.5 i = i + 1 }
  return acc
}`);
    assert.equal(exports.sum(10), 5.0, "0.5 added 10× = 5.0");
    assert.equal(exports.sum(0), 0.0);
  });

  it("REGRESSION: an integer flow with a local is UNCHANGED — i32 local, i32 result", async () => {
    const { wat, exports } = await run(
      "pure flow f(x: Int) -> Int contract { effects {} } { let y = x * 2 return y + 3 }");
    assert.match(wat, /\(local \$y i32\)/, "int local must still be i32");
    assert.match(wat, /\(func \$f \(param \$p0 i32\) \(result i32\)/, "int signature unchanged");
    assert.doesNotMatch(wat, /f64\./, "no f64 must leak into an all-int flow");
    assert.equal(exports.f(21), 45);
  });
});
