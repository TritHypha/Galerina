// RD-0349 I2 — runtime Money operations must use the generated minor-unit
// registry.  This is intentionally a focused runtime test: it exercises the
// actual interpreter dispatch without reopening corpus assurance.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { executeFlow, parseProgram, resolveSymbols } from "../../dist/index.js";

function money(currency, amount) {
  return {
    __tag: "record",
    fields: new Map([
      ["__amount", { __tag: "decimal", value: amount }],
      ["__currency", { __tag: "string", value: currency }],
      ["__isMoney", { __tag: "bool", value: true }],
    ]),
  };
}

async function run(body, args = new Map(), returnType = "String", params = []) {
  const source = `@version 1
pure flow probe(${params.join(", ")}) -> ${returnType} contract { effects {} } {
${body}
}`;
  const parsed = parseProgram(source, "rd-0349-money-scale.fungi");
  const errors = (parsed.diagnostics ?? []).filter((d) => d.severity === "error");
  assert.equal(errors.length, 0, errors.map((d) => d.message).join("; "));
  resolveSymbols(parsed.ast);
  return executeFlow("probe", args, parsed.ast, parsed.flows);
}

// R11 (owner decision D-M1, 2026-09-30, Grok Bot rounding work): a Money amount is ADMITTED only at
// most at the currency's minor units and is never silently rounded; multiply/divideBy take an EXPLICIT
// rounding mode. These cases keep the RD-0349 I2 intent (registry-driven scale, including a valid zero)
// under that contract.
function trapOf(result) {
  assert.equal(result.value.__tag, "runtimeError", JSON.stringify(result.value));
  return result.value.message;
}

describe("RD-0349 I2 — registry-driven Money scales", () => {
  it("uses zero decimals for JPY and three for BHD (admitted, padded, never rounded)", async () => {
    assert.equal((await run("  return Money.jpy(\"1501\").toString()")).value.value, "JPY 1501");
    assert.equal(trapOf(await run("  return Money.jpy(\"1500.6\")", new Map(), "Money")), "MoneyScaleExceedsMinorUnits");
    assert.equal((await run("  return Money.bhd(\"1.235\").toString()")).value.value, "BHD 1.235");
    assert.equal((await run("  return Money.bhd(\"1.2\").toString()")).value.value, "BHD 1.200");
    assert.equal(trapOf(await run("  return Money.bhd(\"1.2345\")", new Map(), "Money")), "MoneyScaleExceedsMinorUnits");
  });

  it("keeps GBP at two decimals and applies the scale to arithmetic with an explicit mode", async () => {
    const result = await run(`
  let a = Money.gbp("1.01")
  let b = Money.gbp("0.01")
  let sum = a.add(b)
  let product = a.multiply(Decimal("2"), "halfEven")
  let up = a.divideBy(Decimal("2"), "halfUp")
  let even = a.divideBy(Decimal("2"), "halfEven")
  return sum.toString() + "|" + product.toString() + "|" + up.toString() + "|" + even.toString()
`);
    assert.equal(result.value.value, "GBP 1.02|GBP 2.02|GBP 0.51|GBP 0.50");
    assert.equal(trapOf(await run('  return Money.gbp("1.00").multiply(Decimal("2"))', new Map(), "Money")), "MissingRoundMode");
  });

  it("rounds negative half values by the caller's mode at the currency scale", async () => {
    assert.equal((await run('  return Money.jpy("-3").divideBy(2, "halfUp").amount().toString()')).value.value, "-2");
    assert.equal((await run('  return Money.jpy("-3").divideBy(2, "halfEven").amount().toString()')).value.value, "-2");
    assert.equal((await run('  return Money.jpy("-5").divideBy(2, "halfEven").amount().toString()')).value.value, "-2");
    assert.equal((await run('  return Money.jpy("-5").divideBy(2, "halfUp").amount().toString()')).value.value, "-3");
    assert.equal(trapOf(await run('  return Money.jpy("-1.5")', new Map(), "Money")), "MoneyScaleExceedsMinorUnits");
  });

  it("computes a Money/Money ratio at the caller's scale and mode (no fixed 18-place default)", async () => {
    const result = await run('  return Money.jpy("2").divideBy(Money.jpy("3"), 18, "halfUp").toString()');
    assert.equal(result.value.value, "0.666666666666666667");
    assert.equal(trapOf(await run('  return Money.jpy("2").divideBy(Money.jpy("3"))', new Map(), "Decimal")), "MissingRoundMode");
  });

  it("refuses an unregistered Money receiver and right operand", async () => {
    const receiver = await run("  return amount.toString()", new Map([["amount", money("BANANAS", "1.23")]]), "String", ["amount: Money<GBP>"]);
    assert.equal(receiver.value.__tag, "runtimeError");
    assert.match(receiver.value.message, /no admitted minor-unit scale/);
    const rhs = await run("  return left.divideBy(right, 2, \"halfEven\")", new Map([
      ["left", money("GBP", "2.00")],
      ["right", money("BANANAS", "1.00")],
    ]), "String", ["left: Money<GBP>", "right: Money<GBP>"]);
    assert.equal(trapOf(rhs), "CurrencyMismatch");
  });
});
