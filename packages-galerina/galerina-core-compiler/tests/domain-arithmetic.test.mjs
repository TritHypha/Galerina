import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseProgram, checkTypes } from "../dist/index.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseAndCheck(source) {
  const parsed = parseProgram(source, "test.fungi");
  return checkTypes(parsed.ast);
}

function noErrors(result) {
  return result.diagnostics.filter((d) => d.severity === "error").length === 0;
}

function hasDiag(result, code) {
  return result.diagnostics.some((d) => d.code === code);
}

function diagsWithCode(result, code) {
  return result.diagnostics.filter((d) => d.code === code);
}

function errorCount(result) {
  return result.diagnostics.filter((d) => d.severity === "error").length;
}

// =============================================================================
// 1. Int arithmetic: +, -, *, /, % with Int literals
// =============================================================================

describe("Arithmetic — Int: addition", () => {
  it("Int + Int produces no type errors", () => {
    const result = parseAndCheck(`
pure flow test() -> Int {
  let a: Int = 10
  let b: Int = 3
  let c: Int = a + b
  return c
}
`);
    assert.ok(noErrors(result), `Unexpected errors: ${result.diagnostics.map((d) => d.code + ": " + d.message).join("; ")}`);
  });

  it("Int literal addition inline: 7 + 5", () => {
    const result = parseAndCheck(`
pure flow test() -> Int {
  return 7 + 5
}
`);
    assert.ok(!hasDiag(result, "FUNGI-TYPE-004"), "Unexpected FUNGI-TYPE-004 for 7 + 5");
  });
});

describe("Arithmetic — Int: subtraction", () => {
  it("Int - Int produces no type errors", () => {
    const result = parseAndCheck(`
pure flow test() -> Int {
  let salary: Int = 50000
  let tax: Int = 10000
  let net: Int = salary - tax
  return net
}
`);
    assert.ok(noErrors(result), `Unexpected errors: ${result.diagnostics.map((d) => d.code + ": " + d.message).join("; ")}`);
  });

  it("Int literal subtraction: 100 - 42", () => {
    const result = parseAndCheck(`
pure flow test() -> Int {
  return 100 - 42
}
`);
    assert.ok(!hasDiag(result, "FUNGI-TYPE-004"), "Unexpected FUNGI-TYPE-004 for 100 - 42");
  });
});

describe("Arithmetic — Int: multiplication", () => {
  it("Int * Int produces no type errors", () => {
    const result = parseAndCheck(`
pure flow test() -> Int {
  let units: Int = 12
  let pricePerUnit: Int = 5
  let total: Int = units * pricePerUnit
  return total
}
`);
    assert.ok(noErrors(result), `Unexpected errors: ${result.diagnostics.map((d) => d.code + ": " + d.message).join("; ")}`);
  });

  it("Int literal multiplication: 6 * 7", () => {
    const result = parseAndCheck(`
pure flow test() -> Int {
  return 6 * 7
}
`);
    assert.ok(!hasDiag(result, "FUNGI-TYPE-004"), "Unexpected FUNGI-TYPE-004 for 6 * 7");
  });
});

describe("Arithmetic — Int: division", () => {
  it("Int / Int produces no type errors", () => {
    const result = parseAndCheck(`
pure flow test() -> Int {
  let total: Int = 100
  let parts: Int = 4
  let each: Int = total / parts
  return each
}
`);
    assert.ok(noErrors(result), `Unexpected errors: ${result.diagnostics.map((d) => d.code + ": " + d.message).join("; ")}`);
  });

  it("Int literal division: 99 / 3", () => {
    const result = parseAndCheck(`
pure flow test() -> Int {
  return 99 / 3
}
`);
    assert.ok(!hasDiag(result, "FUNGI-TYPE-004"), "Unexpected FUNGI-TYPE-004 for 99 / 3");
  });
});

describe("Arithmetic — Int: modulo", () => {
  it("Int % Int produces no type errors", () => {
    const result = parseAndCheck(`
pure flow test() -> Int {
  let n: Int = 17
  let divisor: Int = 5
  let remainder: Int = n % divisor
  return remainder
}
`);
    assert.ok(noErrors(result), `Unexpected errors: ${result.diagnostics.map((d) => d.code + ": " + d.message).join("; ")}`);
  });

  it("Int literal modulo: 13 % 4", () => {
    const result = parseAndCheck(`
pure flow test() -> Int {
  return 13 % 4
}
`);
    assert.ok(!hasDiag(result, "FUNGI-TYPE-004"), "Unexpected FUNGI-TYPE-004 for 13 % 4");
  });
});

// =============================================================================
// 2. Float arithmetic: +, -, *, / with Float values
// =============================================================================

describe("Arithmetic — Float: basic operations", () => {
  it("Float + Float produces no type errors", () => {
    const result = parseAndCheck(`
pure flow test() -> Float {
  let x: Float = 3.14
  let y: Float = 2.71
  let z: Float = x + y
  return z
}
`);
    assert.ok(noErrors(result), `Unexpected errors: ${result.diagnostics.map((d) => d.code + ": " + d.message).join("; ")}`);
  });

  it("Float - Float produces no type errors", () => {
    const result = parseAndCheck(`
pure flow test() -> Float {
  let rate: Float = 9.5
  let reduction: Float = 1.5
  let effective: Float = rate - reduction
  return effective
}
`);
    assert.ok(noErrors(result), `Unexpected errors: ${result.diagnostics.map((d) => d.code + ": " + d.message).join("; ")}`);
  });

  it("Float * Float produces no type errors", () => {
    const result = parseAndCheck(`
pure flow test() -> Float {
  let principal: Float = 1000.0
  let rate: Float = 0.05
  let interest: Float = principal * rate
  return interest
}
`);
    assert.ok(noErrors(result), `Unexpected errors: ${result.diagnostics.map((d) => d.code + ": " + d.message).join("; ")}`);
  });

  it("Float / Float produces no type errors", () => {
    const result = parseAndCheck(`
pure flow test() -> Float {
  let distance: Float = 150.0
  let time: Float = 2.5
  let speed: Float = distance / time
  return speed
}
`);
    assert.ok(noErrors(result), `Unexpected errors: ${result.diagnostics.map((d) => d.code + ": " + d.message).join("; ")}`);
  });
});

// =============================================================================
// 3. Decimal arithmetic: financial precision, no rounding errors
// =============================================================================

describe("Arithmetic — Decimal: financial precision", () => {
  it("Decimal + Decimal produces no type errors", () => {
    const result = parseAndCheck(`
pure flow test() -> Decimal {
  let price: Decimal = Decimal("19.99")
  let vat: Decimal = Decimal("4.00")
  let total: Decimal = price + vat
  return total
}
`);
    assert.ok(noErrors(result), `Unexpected errors: ${result.diagnostics.map((d) => d.code + ": " + d.message).join("; ")}`);
  });

  it("Decimal - Decimal produces no type errors", () => {
    const result = parseAndCheck(`
pure flow test() -> Decimal {
  let gross: Decimal = Decimal("1250.00")
  let deduction: Decimal = Decimal("250.00")
  let net: Decimal = gross - deduction
  return net
}
`);
    assert.ok(noErrors(result), `Unexpected errors: ${result.diagnostics.map((d) => d.code + ": " + d.message).join("; ")}`);
  });

  it("Decimal * Decimal produces no type errors", () => {
    const result = parseAndCheck(`
pure flow test() -> Decimal {
  let amount: Decimal = Decimal("500.00")
  let rate: Decimal = Decimal("0.20")
  let vatAmount: Decimal = amount * rate
  return vatAmount
}
`);
    assert.ok(noErrors(result), `Unexpected errors: ${result.diagnostics.map((d) => d.code + ": " + d.message).join("; ")}`);
  });

  it("Decimal '/' REDIRECTS to the method form (FUNGI-NUMERIC-OP-001), and the method type-checks clean", () => {
    // The bare operator was previously type-OK but TRAPPED at runtime (decimal '/' has no dispatch) — the
    // "compiler promises what the runtime can't deliver" class. It is now a compile-reject that redirects to
    // the obligation-carrying method form (explicit rounding + scale; #53/#54).
    const bad = parseAndCheck(`
pure flow test() -> Decimal {
  let total: Decimal = Decimal("600.00")
  let shares: Decimal = Decimal("3.0")
  let perShare: Decimal = total / shares
  return perShare
}
`);
    assert.ok(bad.diagnostics.some((d) => d.code === "FUNGI-NUMERIC-OP-001"),
      `expected the Decimal '/' redirect, got: ${bad.diagnostics.map((d) => d.code).join(",")}`);

    const good = parseAndCheck(`
pure flow test() -> Decimal {
  let total: Decimal = Decimal("600.00")
  let shares: Decimal = Decimal("3.0")
  let perShare: Decimal = total.divide(shares, 2, "halfEven")
  return perShare
}
`);
    assert.ok(noErrors(good), `method form should type-check clean: ${good.diagnostics.map((d) => d.code + ": " + d.message).join("; ")}`);
  });
});

// =============================================================================
// 4. Mixed numeric types: Int widening to Float, Decimal precision
// =============================================================================

describe("Arithmetic — mixed numeric types", () => {
  it("Int widens to Float when assigned to Float binding", () => {
    const result = parseAndCheck(`
pure flow test() -> Float {
  let count: Float = 5
  return count
}
`);
    assert.ok(!hasDiag(result, "FUNGI-TYPE-002"), "Int should widen to Float without FUNGI-TYPE-002");
  });

  it("Int widens to Decimal when assigned to Decimal binding", () => {
    const result = parseAndCheck(`
pure flow test() -> Decimal {
  let quantity: Decimal = 10
  return quantity
}
`);
    assert.ok(!hasDiag(result, "FUNGI-TYPE-002"), "Int should widen to Decimal without FUNGI-TYPE-002");
  });

  it("Int and Float in same arithmetic expression produce no error", () => {
    const result = parseAndCheck(`
pure flow test() -> Float {
  let a: Int = 4
  let b: Float = 2.5
  let result: Float = a + b
  return result
}
`);
    assert.ok(!hasDiag(result, "FUNGI-TYPE-004"), "Unexpected FUNGI-TYPE-004 for Int + Float");
  });

  it("Decimal binding inferred from Decimal literal", () => {
    const result = parseAndCheck(`
pure flow test() -> Decimal {
  let rate: Decimal = Decimal("0.15")
  return rate
}
`);
    assert.ok(noErrors(result), `Unexpected errors: ${result.diagnostics.map((d) => d.code + ": " + d.message).join("; ")}`);
  });

  it("Bool is not assignable to Int (no silent widening)", () => {
    const result = parseAndCheck(`
pure flow test() -> Int {
  let count: Int = true
  return count
}
`);
    assert.ok(hasDiag(result, "FUNGI-TYPE-002"), "Expected FUNGI-TYPE-002: Bool is not assignable to Int");
  });

  it("String is not assignable to Float", () => {
    const result = parseAndCheck(`
pure flow test() -> Float {
  let rate: Float = "3.14"
  return rate
}
`);
    assert.ok(hasDiag(result, "FUNGI-TYPE-002"), "Expected FUNGI-TYPE-002: String is not assignable to Float");
  });
});

// =============================================================================
// 5. Money arithmetic: same-currency addition, cross-currency rejection
// =============================================================================

describe("Arithmetic — Money<GBP>: same-currency addition", () => {
  it("Money<GBP> + Money<GBP> produces no type errors", () => {
    const result = parseAndCheck(`
pure flow test() -> String {
  let base: Money<GBP> = Money.gbp("100.00")
  let vat: Money<GBP> = Money.gbp("20.00")
  let total: Money<GBP> = base + vat
  return "ok"
}
`);
    const moneyErrors = diagsWithCode(result, "FUNGI-TYPE-004").filter(
      (d) => d.message.includes("currency") || d.message.includes("Money"),
    );
    assert.equal(moneyErrors.length, 0, "Same-currency addition must not produce FUNGI-TYPE-004");
  });

  it("Money<GBP> - Money<GBP> produces no type errors", () => {
    const result = parseAndCheck(`
pure flow test() -> String {
  let gross: Money<GBP> = Money.gbp("500.00")
  let fee: Money<GBP> = Money.gbp("25.00")
  let net: Money<GBP> = gross - fee
  return "ok"
}
`);
    const moneyErrors = diagsWithCode(result, "FUNGI-TYPE-004").filter(
      (d) => d.message.includes("currency") || d.message.includes("Money"),
    );
    assert.equal(moneyErrors.length, 0, "Same-currency subtraction must not produce FUNGI-TYPE-004");
  });

  it("Money<USD> + Money<USD> produces no type errors", () => {
    const result = parseAndCheck(`
pure flow test() -> String {
  let a: Money<USD> = Money.usd("200.00")
  let b: Money<USD> = Money.usd("150.00")
  let c: Money<USD> = a + b
  return "ok"
}
`);
    const moneyErrors = diagsWithCode(result, "FUNGI-TYPE-004").filter(
      (d) => d.message.includes("currency") || d.message.includes("Money"),
    );
    assert.equal(moneyErrors.length, 0, "USD + USD must not produce FUNGI-TYPE-004");
  });
});

describe("Arithmetic — Money cross-currency: FUNGI-TYPE-004 rejection", () => {
  it("Money<GBP> + Money<USD> emits FUNGI-TYPE-004", () => {
    const result = parseAndCheck(`
pure flow test() -> String {
  let gbp: Money<GBP> = Money.gbp("100.00")
  let usd: Money<USD> = Money.usd("120.00")
  let wrong: Money<GBP> = gbp + usd
  return "ok"
}
`);
    assert.ok(hasDiag(result, "FUNGI-TYPE-004"), "Expected FUNGI-TYPE-004 for Money<GBP> + Money<USD>");
  });

  it("Money<GBP> + Money<USD> error message mentions 'currency'", () => {
    const result = parseAndCheck(`
pure flow test() -> String {
  let gbp: Money<GBP> = Money.gbp("100.00")
  let usd: Money<USD> = Money.usd("120.00")
  let wrong: Money<GBP> = gbp + usd
  return "ok"
}
`);
    const diag = diagsWithCode(result, "FUNGI-TYPE-004").find((d) => d.message.includes("currency"));
    assert.ok(diag !== undefined, "Expected a currency-related error message");
  });

  it("Money<GBP> - Money<USD> emits FUNGI-TYPE-004", () => {
    const result = parseAndCheck(`
pure flow test() -> String {
  let gbp: Money<GBP> = Money.gbp("500.00")
  let usd: Money<USD> = Money.usd("100.00")
  let wrong: Money<GBP> = gbp - usd
  return "ok"
}
`);
    assert.ok(hasDiag(result, "FUNGI-TYPE-004"), "Expected FUNGI-TYPE-004 for Money<GBP> - Money<USD>");
  });

  it("Money<EUR> + Money<GBP> emits FUNGI-TYPE-004", () => {
    const result = parseAndCheck(`
pure flow test() -> String {
  let eur: Money<EUR> = Money.eur("200.00")
  let gbp: Money<GBP> = Money.gbp("180.00")
  let wrong = eur + gbp
  return "ok"
}
`);
    assert.ok(hasDiag(result, "FUNGI-TYPE-004"), "Expected FUNGI-TYPE-004 for Money<EUR> + Money<GBP>");
  });

  it("Money<GBP> * Money<GBP> emits FUNGI-TYPE-004 (dimensionally invalid)", () => {
    const result = parseAndCheck(`
pure flow test() -> String {
  let price: Money<GBP> = Money.gbp("100.00")
  let qty: Money<GBP> = Money.gbp("5.00")
  let wrong = price * qty
  return "ok"
}
`);
    const moneyMulDiag = diagsWithCode(result, "FUNGI-TYPE-004").find(
      (d) => d.message.includes("Money") && d.message.includes("*"),
    );
    assert.ok(moneyMulDiag !== undefined, "Expected FUNGI-TYPE-004 for Money * Money");
  });

  it("Money * Decimal is valid (scaling by rate)", () => {
    const result = parseAndCheck(`
pure flow test() -> String {
  let price: Money<GBP> = Money.gbp("100.00")
  let rate: Decimal = Decimal("0.20")
  let vat = price * rate
  return "ok"
}
`);
    const moneyMulError = diagsWithCode(result, "FUNGI-TYPE-004").find(
      (d) => d.message.includes("Money") && d.message.includes("Decimal"),
    );
    assert.equal(moneyMulError, undefined, "Money * Decimal should be valid");
  });
});

// =============================================================================
// 6. Unary minus: -x for Int, Float
// =============================================================================

describe("Arithmetic — unary minus", () => {
  it("Unary minus on Int produces no type errors", () => {
    const result = parseAndCheck(`
pure flow negate(x: Int) -> Int {
  return -x
}
`);
    assert.ok(!hasDiag(result, "FUNGI-TYPE-004"), "Unexpected FUNGI-TYPE-004 for -Int");
  });

  it("Unary minus on Float literal produces no type errors", () => {
    const result = parseAndCheck(`
pure flow test() -> Float {
  let temp: Float = -273.15
  return temp
}
`);
    assert.ok(noErrors(result), `Unexpected errors: ${result.diagnostics.map((d) => d.code + ": " + d.message).join("; ")}`);
  });

  it("Unary minus on Int literal produces no type errors", () => {
    const result = parseAndCheck(`
pure flow test() -> Int {
  let floor: Int = -1
  return floor
}
`);
    assert.ok(!hasDiag(result, "FUNGI-TYPE-004"), "Unexpected FUNGI-TYPE-004 for -1");
  });
});

// =============================================================================
// 7. Comparison operators on numbers: >, <, >=, <=, ==, !=
// =============================================================================

describe("Arithmetic — comparison operators on Int", () => {
  it("Int > Int produces no type errors", () => {
    const result = parseAndCheck(`
pure flow test(a: Int, b: Int) -> Bool {
  return a > b
}
`);
    assert.ok(!hasDiag(result, "FUNGI-TYPE-004"), "Unexpected FUNGI-TYPE-004 for Int > Int");
  });

  it("Int < Int produces no type errors", () => {
    const result = parseAndCheck(`
pure flow test(a: Int, b: Int) -> Bool {
  return a < b
}
`);
    assert.ok(!hasDiag(result, "FUNGI-TYPE-004"), "Unexpected FUNGI-TYPE-004 for Int < Int");
  });

  it("Int >= Int produces no type errors", () => {
    const result = parseAndCheck(`
pure flow test(a: Int, b: Int) -> Bool {
  return a >= b
}
`);
    assert.ok(!hasDiag(result, "FUNGI-TYPE-004"), "Unexpected FUNGI-TYPE-004 for Int >= Int");
  });

  it("Int <= Int produces no type errors", () => {
    const result = parseAndCheck(`
pure flow test(a: Int, b: Int) -> Bool {
  return a <= b
}
`);
    assert.ok(!hasDiag(result, "FUNGI-TYPE-004"), "Unexpected FUNGI-TYPE-004 for Int <= Int");
  });

  it("Int == Int produces no type errors", () => {
    const result = parseAndCheck(`
pure flow test(a: Int, b: Int) -> Bool {
  return a == b
}
`);
    assert.ok(!hasDiag(result, "FUNGI-TYPE-004"), "Unexpected FUNGI-TYPE-004 for Int == Int");
  });

  it("Int != Int produces no type errors", () => {
    const result = parseAndCheck(`
pure flow test(a: Int, b: Int) -> Bool {
  return a != b
}
`);
    assert.ok(!hasDiag(result, "FUNGI-TYPE-004"), "Unexpected FUNGI-TYPE-004 for Int != Int");
  });

  it("Float > Float produces no type errors", () => {
    const result = parseAndCheck(`
pure flow test(x: Float, y: Float) -> Bool {
  return x > y
}
`);
    assert.ok(!hasDiag(result, "FUNGI-TYPE-004"), "Unexpected FUNGI-TYPE-004 for Float > Float");
  });

  it("Int compared with String emits FUNGI-TYPE-004", () => {
    const result = parseAndCheck(`
pure flow test(n: Int) -> Bool {
  return n > "10"
}
`);
    assert.ok(hasDiag(result, "FUNGI-TYPE-004"), "Expected FUNGI-TYPE-004 for Int > String");
  });

  it("Bool + Int emits FUNGI-TYPE-004", () => {
    const result = parseAndCheck(`
pure flow test() -> Int {
  return true + 1
}
`);
    assert.ok(hasDiag(result, "FUNGI-TYPE-004"), "Expected FUNGI-TYPE-004 for Bool + Int");
  });
});

// =============================================================================
// 8. Real-world calculations: VAT, salary deductions, loan interest
// =============================================================================

describe("Arithmetic — real-world: VAT computation", () => {
  it("VAT calculation with Decimal produces no type errors", () => {
    const result = parseAndCheck(`
pure flow computeVat(netAmount: Decimal, vatRate: Decimal) -> Decimal {
  let vatAmount: Decimal = netAmount * vatRate
  let gross: Decimal = netAmount + vatAmount
  return gross
}
`);
    assert.ok(noErrors(result), `VAT flow has unexpected errors: ${result.diagnostics.map((d) => d.code + ": " + d.message).join("; ")}`);
  });

  it("UK VAT at 20%: Money<GBP> + Money<GBP> total", () => {
    const result = parseAndCheck(`
pure flow addVat(net: Money<GBP>, vat: Money<GBP>) -> Money<GBP> {
  let total: Money<GBP> = net + vat
  return total
}
`);
    assert.ok(noErrors(result), `UK VAT flow has unexpected errors: ${result.diagnostics.map((d) => d.code + ": " + d.message).join("; ")}`);
  });

  it("VAT rate check using Decimal comparison", () => {
    const result = parseAndCheck(`
pure flow isStandardRate(rate: Decimal) -> Bool {
  let standardRate: Decimal = Decimal("0.20")
  return rate == standardRate
}
`);
    assert.ok(noErrors(result), `VAT rate comparison has unexpected errors: ${result.diagnostics.map((d) => d.code + ": " + d.message).join("; ")}`);
  });
});

describe("Arithmetic — real-world: salary deductions", () => {
  it("Salary deduction flow with Int arithmetic produces no type errors", () => {
    const result = parseAndCheck(`
pure flow netSalary(gross: Int, incomeTax: Int, ni: Int) -> Int {
  let totalDeductions: Int = incomeTax + ni
  let net: Int = gross - totalDeductions
  return net
}
`);
    assert.ok(noErrors(result), `Salary deduction flow has unexpected errors: ${result.diagnostics.map((d) => d.code + ": " + d.message).join("; ")}`);
  });

  it("Percentage deduction with Decimal produces no type errors", () => {
    const result = parseAndCheck(`
pure flow deductPercent(salary: Decimal, percent: Decimal) -> Decimal {
  let deduction: Decimal = salary * percent
  let net: Decimal = salary - deduction
  return net
}
`);
    assert.ok(noErrors(result), `Percentage deduction has unexpected errors: ${result.diagnostics.map((d) => d.code + ": " + d.message).join("; ")}`);
  });

  it("Monthly salary from annual: Int / Int", () => {
    const result = parseAndCheck(`
pure flow monthlyFromAnnual(annual: Int) -> Int {
  let months: Int = 12
  let monthly: Int = annual / months
  return monthly
}
`);
    assert.ok(noErrors(result), `Monthly salary flow has unexpected errors: ${result.diagnostics.map((d) => d.code + ": " + d.message).join("; ")}`);
  });
});

describe("Arithmetic — real-world: loan interest", () => {
  it("Simple interest calculation with Float produces no type errors", () => {
    const result = parseAndCheck(`
pure flow simpleInterest(principal: Float, rate: Float, years: Float) -> Float {
  let interest: Float = principal * rate * years
  return interest
}
`);
    assert.ok(noErrors(result), `Interest calculation has unexpected errors: ${result.diagnostics.map((d) => d.code + ": " + d.message).join("; ")}`);
  });

  it("Loan repayment check: balance > 0 comparison", () => {
    const result = parseAndCheck(`
pure flow hasBalance(balance: Int) -> Bool {
  let zero: Int = 0
  return balance > zero
}
`);
    assert.ok(noErrors(result), `Balance check has unexpected errors: ${result.diagnostics.map((d) => d.code + ": " + d.message).join("; ")}`);
  });

  it("Monthly payment modulo: outstanding % installments", () => {
    const result = parseAndCheck(`
pure flow remainder(outstanding: Int, installments: Int) -> Int {
  let rem: Int = outstanding % installments
  return rem
}
`);
    assert.ok(noErrors(result), `Modulo flow has unexpected errors: ${result.diagnostics.map((d) => d.code + ": " + d.message).join("; ")}`);
  });
});

// =============================================================================
// 9. Overflow safety: Int bounds (precision narrowing warnings)
// =============================================================================

// Decision: FUNGI-TYPE-017 is QuantizedPrecisionMismatch per formal spec —
// fires when quantized (Int8) tensors mix with Float32 without dequantize().
// General numeric narrowing (Int → Int8, Float → Float16) is FUNGI-TYPE-002
// territory and does NOT emit TYPE-017. See galerina-phase-11-decisions.md.

describe("Arithmetic — sized Int types: narrowing is handled by FUNGI-TYPE-002", () => {
  it("Int8 = 42 does not emit FUNGI-TYPE-017 (narrowing is TYPE-002, not TYPE-017)", () => {
    const result = parseAndCheck(`
pure flow test() -> Void {
  let x: Int8 = 42
  return
}
`);
    // TYPE-017 is QuantizedPrecisionMismatch (tensor context only) — not fired for Int narrowing
    assert.ok(!hasDiag(result, "FUNGI-TYPE-017"), "FUNGI-TYPE-017 must not fire for plain Int narrowing");
  });

  it("FUNGI-TYPE-017 constant has correct spec name QuantizedPrecisionMismatch", async () => {
    const { FUNGI_TYPE_017 } = await import("../dist/index.js");
    assert.equal(FUNGI_TYPE_017.name, "QUANTIZED_PRECISION_MISMATCH");
    assert.equal(FUNGI_TYPE_017.severity, "warning");
  });

  it("Int16 = 1000 does not emit FUNGI-TYPE-017", () => {
    const result = parseAndCheck(`
pure flow test() -> Void {
  let x: Int16 = 1000
  return
}
`);
    assert.ok(!hasDiag(result, "FUNGI-TYPE-017"), "FUNGI-TYPE-017 must not fire for Int16 narrowing");
  });

  it("Int64 = 999 does not emit FUNGI-TYPE-017 (Int is smaller, widening to larger is safe)", () => {
    const result = parseAndCheck(`
pure flow test() -> Void {
  let x: Int64 = 999
  return
}
`);
    assert.ok(!hasDiag(result, "FUNGI-TYPE-017"), "Unexpected FUNGI-TYPE-017 for Int → Int64 (widening is safe)");
  });

  it("Int = 42 does not emit FUNGI-TYPE-017", () => {
    const result = parseAndCheck(`
pure flow test() -> Void {
  let x: Int = 42
  return
}
`);
    assert.ok(!hasDiag(result, "FUNGI-TYPE-017"), "Unexpected FUNGI-TYPE-017 for Int = 42 (same precision)");
  });

  it("Float16 = 3.14 does not emit FUNGI-TYPE-017 (float narrowing is TYPE-002, not TYPE-017)", () => {
    const result = parseAndCheck(`
pure flow test() -> Void {
  let x: Float16 = 3.14
  return
}
`);
    // TYPE-017 is for quantized/float tensor mixing only — not general float narrowing
    assert.ok(!hasDiag(result, "FUNGI-TYPE-017"), "FUNGI-TYPE-017 must not fire for Float → Float16 narrowing");
  });

  it("Float64 = 3.14 does not emit FUNGI-TYPE-017 (widening is safe)", () => {
    const result = parseAndCheck(`
pure flow test() -> Void {
  let x: Float64 = 3.14
  return
}
`);
    assert.ok(!hasDiag(result, "FUNGI-TYPE-017"), "Unexpected FUNGI-TYPE-017 for Float64 = 3.14");
  });
});

// =============================================================================
// 10. Readable numeric forms: is greater than, is less than or equal to
// =============================================================================

describe("Arithmetic — readable numeric comparisons", () => {
  it("'a is greater than b' parses as > and has no type errors", () => {
    const result = parseAndCheck(`
pure flow test(a: Int, b: Int) -> Bool {
  return a is greater than b
}
`);
    const errors = result.diagnostics.filter((d) => d.severity === "error");
    assert.equal(errors.length, 0, `Unexpected errors for 'a is greater than b': ${errors.map((e) => e.code + ": " + e.message).join("; ")}`);
  });

  it("'a is less than b' parses as < and has no type errors", () => {
    const result = parseAndCheck(`
pure flow test(a: Int, b: Int) -> Bool {
  return a is less than b
}
`);
    const errors = result.diagnostics.filter((d) => d.severity === "error");
    assert.equal(errors.length, 0, `Unexpected errors for 'a is less than b': ${errors.map((e) => e.code + ": " + e.message).join("; ")}`);
  });

  it("'a is greater than or equal to b' has no type errors", () => {
    const result = parseAndCheck(`
pure flow test(a: Int, b: Int) -> Bool {
  return a is greater than or equal to b
}
`);
    const errors = result.diagnostics.filter((d) => d.severity === "error");
    assert.equal(errors.length, 0, `Unexpected errors for '>=' readable form: ${errors.map((e) => e.code + ": " + e.message).join("; ")}`);
  });

  it("'a is less than or equal to b' has no type errors", () => {
    const result = parseAndCheck(`
pure flow test(a: Int, b: Int) -> Bool {
  return a is less than or equal to b
}
`);
    const errors = result.diagnostics.filter((d) => d.severity === "error");
    assert.equal(errors.length, 0, `Unexpected errors for '<=' readable form: ${errors.map((e) => e.code + ": " + e.message).join("; ")}`);
  });

  it("'score is greater than 90' with literal produces no type errors", () => {
    const result = parseAndCheck(`
pure flow isPassing(score: Int) -> Bool {
  return score is greater than 90
}
`);
    const errors = result.diagnostics.filter((d) => d.severity === "error");
    assert.equal(errors.length, 0, `Unexpected errors for score comparison: ${errors.map((e) => e.code + ": " + e.message).join("; ")}`);
  });

  it("'balance is less than or equal to 0' has no type errors", () => {
    const result = parseAndCheck(`
pure flow isOverdrawn(balance: Int) -> Bool {
  return balance is less than or equal to 0
}
`);
    const errors = result.diagnostics.filter((d) => d.severity === "error");
    assert.equal(errors.length, 0, `Unexpected errors for overdraft check: ${errors.map((e) => e.code + ": " + e.message).join("; ")}`);
  });

  it("'amount is not equal to 0' readable form has no type errors", () => {
    const result = parseAndCheck(`
pure flow isNonZero(amount: Int) -> Bool {
  return amount is not equal to 0
}
`);
    const errors = result.diagnostics.filter((d) => d.severity === "error");
    assert.equal(errors.length, 0, `Unexpected errors for 'is not equal to': ${errors.map((e) => e.code + ": " + e.message).join("; ")}`);
  });

  it("'rate is equal to 0' readable form has no type errors", () => {
    const result = parseAndCheck(`
pure flow isZeroRate(rate: Float) -> Bool {
  return rate is equal to 0.0
}
`);
    const errors = result.diagnostics.filter((d) => d.severity === "error");
    assert.equal(errors.length, 0, `Unexpected errors for 'is equal to': ${errors.map((e) => e.code + ": " + e.message).join("; ")}`);
  });
});

// =============================================================================
// Additional numeric mismatch guards
// =============================================================================

describe("Arithmetic — numeric type mismatch guards", () => {
  it("String - Int emits FUNGI-TYPE-004", () => {
    const result = parseAndCheck(`
pure flow test() -> Int {
  return "100" - 20
}
`);
    assert.ok(hasDiag(result, "FUNGI-TYPE-004"), "Expected FUNGI-TYPE-004 for String - Int");
  });

  it("String * String emits FUNGI-TYPE-004", () => {
    const result = parseAndCheck(`
pure flow test() -> String {
  return "2" * "3"
}
`);
    assert.ok(hasDiag(result, "FUNGI-TYPE-004"), "Expected FUNGI-TYPE-004 for String * String");
  });

  it("Bool % Int emits FUNGI-TYPE-004", () => {
    const result = parseAndCheck(`
pure flow test() -> Int {
  return false % 2
}
`);
    assert.ok(hasDiag(result, "FUNGI-TYPE-004"), "Expected FUNGI-TYPE-004 for Bool % Int");
  });

  it("String > Int emits FUNGI-TYPE-004 (cross-type comparison)", () => {
    const result = parseAndCheck(`
pure flow test() -> Bool {
  return "100" > 50
}
`);
    assert.ok(hasDiag(result, "FUNGI-TYPE-004"), "Expected FUNGI-TYPE-004 for String > Int");
  });

  it("Int + Int + Int chained arithmetic has no type errors", () => {
    const result = parseAndCheck(`
pure flow test(a: Int, b: Int, c: Int) -> Int {
  let ab: Int = a + b
  let abc: Int = ab + c
  return abc
}
`);
    assert.ok(!hasDiag(result, "FUNGI-TYPE-004"), "Unexpected FUNGI-TYPE-004 for chained Int arithmetic");
  });

  it("Decimal arithmetic chained: (a + b) * rate has no type errors", () => {
    const result = parseAndCheck(`
pure flow test(a: Decimal, b: Decimal, rate: Decimal) -> Decimal {
  let subtotal: Decimal = a + b
  let total: Decimal = subtotal * rate
  return total
}
`);
    assert.ok(noErrors(result), `Chained Decimal arithmetic has unexpected errors: ${result.diagnostics.map((d) => d.code + ": " + d.message).join("; ")}`);
  });
});
