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

describe("RD-0349 I2 — registry-driven Money scales", () => {
  it("uses zero decimals for JPY and three for BHD", async () => {
    const jpy = await run("  return Money.jpy(\"1500.6\").toString()");
    assert.equal(jpy.value.value, "JPY 1501");
    const bhd = await run("  return Money.bhd(\"1.2345\").toString()");
    assert.equal(bhd.value.value, "BHD 1.235");
  });

  it("keeps GBP at two decimals and applies the scale to arithmetic", async () => {
    const result = await run(`
  let a = Money.gbp("1.005")
  let b = Money.gbp("0.005")
  let sum = a.add(b)
  let product = a.multiply(Decimal("2"))
  let quotient = a.divideBy(Decimal("2"))
  return sum.toString() + "|" + product.toString() + "|" + quotient.toString()
`);
    assert.equal(result.value.value, "GBP 1.01|GBP 2.01|GBP 0.50");
  });

  it("rounds negative half-up values away from zero at the currency scale", async () => {
    const result = await run('  return Money.jpy("-1.5").amount().toString()');
    assert.equal(result.value.value, "-2");
  });

  it("keeps Money/Money ratios at the existing 18-place ratio scale", async () => {
    const result = await run('  return Money.jpy("2").divideBy(Money.jpy("3")).toString()');
    assert.equal(result.value.value, "0.666666666666666667");
  });

  it("refuses an unregistered Money receiver and right operand", async () => {
    const receiver = await run("  return amount.toString()", new Map([["amount", money("BANANAS", "1.23")]]), "String", ["amount: Money<GBP>"]);
    assert.equal(receiver.value.__tag, "runtimeError");
    assert.match(receiver.value.message, /no admitted minor-unit scale/);
    const rhs = await run("  return left.divideBy(right)", new Map([
      ["left", money("GBP", "2.00")],
      ["right", money("BANANAS", "1.00")],
    ]), "String", ["left: Money<GBP>", "right: Money<GBP>"]);
    assert.equal(rhs.value.__tag, "err");
    assert.match(rhs.value.error.value, /no admitted minor-unit scale/);
  });
});
