/**
 * Decimal WASM fail-close (#53, HIGH): the wat-emitter previously put Decimal in FLOAT_WAT_TYPES and
 * lowered `Decimal + Decimal` to `(f64.add …)` — a VALID module computing wrong money
 * (0.1 + 0.2 = 0.30000000000000004) that could be signed into a manifest. Now any Decimal operand
 * DECLINES (emits `(unreachable)` → fail-closed; exact arithmetic is the tree-walker's). Float / Float64 /
 * Double keep their faithful f64 lowering — proving the decline is Decimal-only, not a Float regression.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as L from "../dist/index.js";

function compileWAT(src) {
  const p = L.parseProgram(src, "dec.spore");
  const errs = p.diagnostics.filter((d) => d.severity === "error");
  assert.equal(errs.length, 0, "parse: " + errs.map((e) => e.message).join("; "));
  const fx = L.checkEffects(p.flows, p.ast);
  const { gir } = L.emitGIR(p.ast, p.flows, fx);
  return L.renderWAT(L.buildWATModuleFromGIR(gir, undefined, "dec", p.ast, true));
}

describe("Decimal WASM fail-close (#53)", () => {
  it("Decimal + Decimal does NOT lower to f64.add — it declines (fail-closed, no silent f64 money)", () => {
    const wat = compileWAT(`pure flow add(a: Decimal, b: Decimal) -> Decimal\ncontract { effects {} }\n{ return a + b }`);
    assert.ok(!wat.includes("f64.add"), `Decimal '+' must NOT emit f64.add (silent wrong money):\n${wat}`);
    assert.ok(wat.includes("unreachable"), `Decimal '+' must decline to (unreachable):\n${wat}`);
  });

  it("Decimal * Decimal declines too (the VAT-scaling case)", () => {
    const wat = compileWAT(`pure flow mul(a: Decimal, b: Decimal) -> Decimal\ncontract { effects {} }\n{ return a * b }`);
    assert.ok(!wat.includes("f64.mul"), `Decimal '*' must NOT emit f64.mul:\n${wat}`);
    assert.ok(wat.includes("unreachable"));
  });

  it("Decimal comparison declines (no f64.lt over decimal-derived doubles)", () => {
    const wat = compileWAT(`pure flow lt(a: Decimal, b: Decimal) -> Bool\ncontract { effects {} }\n{ return a < b }`);
    assert.ok(!wat.includes("f64.lt"), `Decimal '<' must NOT emit f64.lt:\n${wat}`);
    assert.ok(wat.includes("unreachable"));
  });

  it("CONTROL: Float + Float STILL lowers to f64.add (the decline is Decimal-only, no Float regression)", () => {
    const wat = compileWAT(`pure flow fadd(a: Float, b: Float) -> Float\ncontract { effects {} }\n{ return a + b }`);
    assert.ok(wat.includes("f64.add"), `Float '+' must keep its faithful f64 lowering:\n${wat}`);
  });
});
