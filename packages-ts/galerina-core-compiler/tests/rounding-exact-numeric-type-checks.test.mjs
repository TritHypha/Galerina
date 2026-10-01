// rounding-exact-numeric-type-checks — R5 / R8 / R11 compile-time contracts (Grok Bot rounding work,
// 2026-09-30). The type checker refuses, BY NAME, every program the tree-walker would trap on for a missing
// rounding policy, an inexact (Float) operand, a mixed Decimal × Int/Float operator, or a bare Money
// operator — so the interpreter and the WASM backend reject the same programs. Zero-trust defaults (owner
// may revisit): a rounding mode is a string LITERAL from the closed set; there is no default mode.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseProgram, resolveSymbols, checkTypes } from "../dist/index.js";

function diags(body, ret = "Decimal", params = "") {
  const src = `pure flow probe(${params}) -> ${ret} {\n${body}\n}`;
  const p = parseProgram(src, "probe.fungi");
  resolveSymbols(p.ast);
  const tc = checkTypes(p.ast);
  return [...(p.diagnostics ?? []), ...(tc?.diagnostics ?? [])].filter((d) => d.severity === "error");
}
const codes = (ds) => ds.map((d) => d.code);
const clean = (body, ret, params) => {
  const ds = diags(body, ret, params);
  assert.deepEqual(codes(ds), [], ds.map((d) => `${d.code}: ${d.message}`).join("\n"));
};
const refused = (body, code, ret, params) => {
  const ds = diags(body, ret, params);
  assert.ok(codes(ds).includes(code), `expected ${code}; got ${JSON.stringify(codes(ds))}`);
  return ds.find((d) => d.code === code);
};

describe("R5 — Decimal.divide / remainder contracts", () => {
  it("the full explicit form is clean for every mode in the closed set", () => {
    for (const m of ["halfEven", "halfUp", "halfDown", "up", "down", "ceiling", "floor"]) {
      clean(`  return Decimal("1").divide(Decimal("3"), 2, "${m}")`);
    }
    clean('  return Decimal("1").divide(3, 2, "halfEven")'); // an Int divisor is exact
    clean('  return Decimal("10").remainder(Decimal("3"))');
  });
  it("a missing mode is ROUND_MODE_REQUIRED (no halfEven default)", () => {
    refused('  return Decimal("1").divide(Decimal("3"), 2)', "FUNGI-NUMERIC-OP-004");
  });
  it("an unknown or computed mode is refused", () => {
    refused('  return Decimal("1").divide(Decimal("3"), 2, "nearest")', "FUNGI-NUMERIC-OP-004");
    refused('  return Decimal("1").divide(Decimal("3"), 2, m)', "FUNGI-NUMERIC-OP-004", "Decimal", "m: String");
  });
  it("wrong arity and wrong argument types are named", () => {
    refused('  return Decimal("1").divide(Decimal("3"))', "FUNGI-TYPE-007");
    refused('  return Decimal("1").remainder()', "FUNGI-TYPE-007");
    refused('  return Decimal("1").divide(Decimal("3"), "2", "halfEven")', "FUNGI-TYPE-005");
  });
  it("a Float divisor is INEXACT_OPERAND_REFUSED", () => {
    const d = refused('  return Decimal("1").divide(3.0, 2, "halfEven")', "FUNGI-NUMERIC-OP-003");
    assert.equal(d.name, "INEXACT_OPERAND_REFUSED");
  });
});

describe("R8 — Decimal never mixes with Int/Float under an operator", () => {
  it("Decimal ± Int, Decimal * Float and Decimal < Float are MIXED_DECIMAL_OPERAND", () => {
    for (const e of ['Decimal("1") + 1', 'Decimal("1") * 2.5', '2 - Decimal("1")']) {
      const d = refused(`  return ${e}`, "FUNGI-NUMERIC-OP-003");
      assert.equal(d.name, "MIXED_DECIMAL_OPERAND");
    }
    refused('  return Decimal("1") < 0.0', "FUNGI-NUMERIC-OP-003", "Bool");
    refused('  return Decimal("1") == 1', "FUNGI-NUMERIC-OP-003", "Bool");
  });
  it("the Int path is explicit and clean: Decimal.fromInt(n)", () => {
    clean('  return Decimal("1") + Decimal.fromInt(1)');
    clean("  return Decimal.fromInt(n)", "Decimal", "n: Int");
    refused("  return Decimal.fromInt(x)", "FUNGI-TYPE-005", "Decimal", "x: Float");
  });
  it("Decimal ⊕ Decimal stays clean", () => {
    clean('  return Decimal("0.1") + Decimal("0.2")');
    clean('  return Decimal("0.1") < Decimal("0.2")', "Bool");
  });
});

describe("R9 / R10 — Decimal method surface", () => {
  it("round/toFixed need (Int places, literal mode); floor/ceil take Int places", () => {
    clean('  return Decimal("1.25").round(1, "halfEven")');
    clean('  return Decimal("1.25").toFixed(1, "halfUp")', "String");
    clean('  return Decimal("1.25").floor(1)');
    clean('  return Decimal("-1.25").abs()');
    clean('  return Decimal("-1.25").sign()', "Int");
    refused('  return Decimal("1.25").round(1)', "FUNGI-NUMERIC-OP-004");
    refused('  return Decimal("1.25").toFixed(1)', "FUNGI-NUMERIC-OP-004", "String");
    refused('  return Decimal("1.25").floor()', "FUNGI-TYPE-007");
  });
});

describe("R11 — Money: constructors carry the currency; operators redirect to explicit-mode methods", () => {
  it("Money.gbp(..) is Money<GBP> and does not assign to Money<USD>", () => {
    clean('  return Money.gbp("1.00")', "Money<GBP>");
    const ds = diags('  return Money.gbp("1.00")', "Money<USD>");
    assert.ok(ds.length > 0, "a GBP constructor must not satisfy Money<USD>");
  });
  it("Money.of needs a literal admitted code (and then carries it in the type)", () => {
    clean('  return Money.of("9.99", "CHF")', "Money<CHF>");
    refused('  return Money.of("9.99", code)', "FUNGI-NUMERIC-OP-005", "Money", "code: String");
    refused('  return Money.of("9.99", "GPB")', "FUNGI-TYPE-032", "Money");
  });
  it("Money * Decimal and Money / Int redirect to the method form (OP-002)", () => {
    const m = refused('  return price * Decimal("0.20")', "FUNGI-NUMERIC-OP-002", "Money<GBP>", "price: Money<GBP>");
    assert.equal(m.suggestedCode, 'amount.multiply(rate, "halfEven")');
    refused("  return price / 3", "FUNGI-NUMERIC-OP-002", "Money<GBP>", "price: Money<GBP>");
    refused("  return a / b", "FUNGI-NUMERIC-OP-002", "Decimal", "a: Money<GBP>, b: Money<GBP>");
  });
  it("Money + bare number is refused; same-currency + stays clean", () => {
    refused("  return price + 1", "FUNGI-TYPE-004", "Money<GBP>", "price: Money<GBP>");
    clean("  return a + b", "Money<GBP>", "a: Money<GBP>, b: Money<GBP>");
    refused("  return a + b", "FUNGI-TYPE-004", "Money<GBP>", "a: Money<GBP>, b: Money<USD>");
  });
  it("multiply / divideBy need an explicit literal mode; a Float factor is refused", () => {
    clean('  return price.multiply(Decimal("0.20"), "halfEven")', "Money<GBP>", "price: Money<GBP>");
    clean('  return price.divideBy(12, "halfUp")', "Money<GBP>", "price: Money<GBP>");
    clean('  return a.divideBy(b, 4, "halfEven")', "Decimal", "a: Money<GBP>, b: Money<GBP>");
    refused('  return price.multiply(Decimal("0.20"))', "FUNGI-NUMERIC-OP-004", "Money<GBP>", "price: Money<GBP>");
    refused("  return price.divideBy(12)", "FUNGI-NUMERIC-OP-004", "Money<GBP>", "price: Money<GBP>");
    refused('  return price.multiply(0.2, "halfEven")', "FUNGI-NUMERIC-OP-003", "Money<GBP>", "price: Money<GBP>");
    refused('  return a.divideBy(b, 4, "halfEven")', "FUNGI-TYPE-004", "Decimal", "a: Money<GBP>, b: Money<USD>");
    refused("  return a.add(b)", "FUNGI-TYPE-004", "Money<GBP>", "a: Money<GBP>, b: Money<USD>");
  });
});
