import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  parseProgram,
  checkTypes,
  resolveSymbols,
  executeFlow,
} from "../dist/index.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseAndCheck(source) {
  const parsed = parseProgram(source, "financial.spore");
  return checkTypes(parsed.ast);
}

function hasDiag(result, code) {
  return result.diagnostics.some((d) => d.code === code);
}

function diagsWithCode(result, code) {
  return result.diagnostics.filter((d) => d.code === code);
}

function parse(source) {
  return parseProgram(source, "financial.spore");
}

function hasNoDiags(result) {
  return result.diagnostics.filter((d) => d.severity === "error").length === 0;
}

async function parseAndRun(source, flowName, args = new Map()) {
  const parsed = parseProgram(source, "financial.spore");
  resolveSymbols(parsed.ast);
  checkTypes(parsed.ast);
  return await executeFlow(flowName, args, parsed.ast);
}

// ── 1. Money types: Money<GBP>, Money<USD>, Money<EUR>, Money<JPY> ───────────

describe("Financial — Money type declarations", () => {
  it("accepts Money<GBP> as a parameter type without SPORE-TYPE-001", () => {
    const result = parseAndCheck(`
pure flow getPrice(amount: Money<GBP>) -> Money<GBP> {
  return amount
}
`);
    assert.ok(!hasDiag(result, "SPORE-TYPE-001"), "Money<GBP> should be a known type");
  });

  it("accepts Money<USD> as a parameter type without SPORE-TYPE-001", () => {
    const result = parseAndCheck(`
pure flow convert(amount: Money<USD>) -> Money<USD> {
  return amount
}
`);
    assert.ok(!hasDiag(result, "SPORE-TYPE-001"), "Money<USD> should be a known type");
  });

  it("accepts Money<EUR> as a parameter type without SPORE-TYPE-001", () => {
    const result = parseAndCheck(`
pure flow price(amount: Money<EUR>) -> Money<EUR> {
  return amount
}
`);
    assert.ok(!hasDiag(result, "SPORE-TYPE-001"), "Money<EUR> should be a known type");
  });

  it("accepts Money<JPY> as a parameter type without SPORE-TYPE-001", () => {
    const result = parseAndCheck(`
pure flow jpy(amount: Money<JPY>) -> Money<JPY> {
  return amount
}
`);
    assert.ok(!hasDiag(result, "SPORE-TYPE-001"), "Money<JPY> should be a known type");
  });

  it("accepts all four currency types together in the same flow", () => {
    const result = parseAndCheck(`
flow exchangeRates(
  gbp: Money<GBP>,
  usd: Money<USD>,
  eur: Money<EUR>,
  jpy: Money<JPY>
) -> Void {
  return
}
`);
    const typeErrors = diagsWithCode(result, "SPORE-TYPE-001");
    assert.equal(typeErrors.length, 0, "No unknown-type errors for all four currency Money types");
  });

  it("does not emit SPORE-TYPE-009 for Money<GBP> (correct arity)", () => {
    const result = parseAndCheck(`
pure flow gross(price: Money<GBP>) -> Money<GBP> {
  return price
}
`);
    assert.ok(!hasDiag(result, "SPORE-TYPE-009"), "Money<GBP> has arity 1 — no arity error");
  });
});

// ── 2. Valid same-currency arithmetic: Money<GBP> + Money<GBP> ───────────────

describe("Financial — valid same-currency arithmetic (type check)", () => {
  it("does not emit SPORE-TYPE-004 for Money<GBP> + Money<GBP>", () => {
    const result = parseAndCheck(`
flow test() -> String {
  let price: Money<GBP> = Money.gbp("100.00")
  let vat: Money<GBP> = Money.gbp("20.00")
  let total: Money<GBP> = price + vat
  return "ok"
}
`);
    const moneyErrors = diagsWithCode(result, "SPORE-TYPE-004").filter(
      (d) => d.message.includes("Money") && d.message.includes("currency"),
    );
    assert.equal(moneyErrors.length, 0, "Same-currency addition must not emit cross-currency error");
  });

  it("does not emit SPORE-TYPE-004 for Money<USD> + Money<USD>", () => {
    const result = parseAndCheck(`
flow test() -> String {
  let a: Money<USD> = Money.usd("50.00")
  let b: Money<USD> = Money.usd("25.00")
  let total: Money<USD> = a + b
  return "ok"
}
`);
    const moneyErrors = diagsWithCode(result, "SPORE-TYPE-004").filter(
      (d) => d.message.includes("currency"),
    );
    assert.equal(moneyErrors.length, 0, "USD + USD should not emit a currency error");
  });

  it("does not emit SPORE-TYPE-004 for Money<EUR> - Money<EUR>", () => {
    const result = parseAndCheck(`
flow test() -> String {
  let invoice: Money<EUR> = Money.eur("200.00")
  let discount: Money<EUR> = Money.eur("10.00")
  let net: Money<EUR> = invoice - discount
  return "ok"
}
`);
    const moneyErrors = diagsWithCode(result, "SPORE-TYPE-004").filter(
      (d) => d.message.includes("currency"),
    );
    assert.equal(moneyErrors.length, 0, "EUR - EUR should not emit a currency error");
  });
});

// ── 3. Invalid cross-currency: SPORE-TYPE-004 ──────────────────────────────────

describe("Financial — cross-currency rejection (SPORE-TYPE-004)", () => {
  it("emits SPORE-TYPE-004 for Money<GBP> + Money<USD>", () => {
    const result = parseAndCheck(`
flow test() -> String {
  let gbp: Money<GBP> = Money.gbp("100.00")
  let usd: Money<USD> = Money.usd("120.00")
  let wrong: Money<GBP> = gbp + usd
  return "ok"
}
`);
    assert.ok(
      hasDiag(result, "SPORE-TYPE-004"),
      "Expected SPORE-TYPE-004 for Money<GBP> + Money<USD>",
    );
    const diag = diagsWithCode(result, "SPORE-TYPE-004").find((d) => d.message.includes("currency"));
    assert.ok(diag !== undefined, "SPORE-TYPE-004 message must mention 'currency'");
  });

  it("emits SPORE-TYPE-004 for Money<GBP> + Money<EUR>", () => {
    const result = parseAndCheck(`
flow test() -> String {
  let gbp: Money<GBP> = Money.gbp("50.00")
  let eur: Money<EUR> = Money.eur("60.00")
  let wrong = gbp + eur
  return "ok"
}
`);
    assert.ok(hasDiag(result, "SPORE-TYPE-004"), "Expected SPORE-TYPE-004 for GBP + EUR");
  });

  it("emits SPORE-TYPE-004 for Money<USD> - Money<JPY>", () => {
    const result = parseAndCheck(`
flow test() -> String {
  let usd: Money<USD> = Money.usd("100.00")
  let jpy: Money<JPY> = Money.jpy("15000")
  let wrong = usd - jpy
  return "ok"
}
`);
    assert.ok(hasDiag(result, "SPORE-TYPE-004"), "Expected SPORE-TYPE-004 for USD - JPY");
  });

  it("emits SPORE-TYPE-004 for Money * Money (dimensionally invalid)", () => {
    const result = parseAndCheck(`
flow test() -> String {
  let price: Money<GBP> = Money.gbp("100.00")
  let factor: Money<GBP> = Money.gbp("1.20")
  let wrong = price * factor
  return "ok"
}
`);
    const moneyMulDiag = diagsWithCode(result, "SPORE-TYPE-004").find(
      (d) => d.message.includes("Money") && d.message.includes("*"),
    );
    assert.ok(moneyMulDiag !== undefined, "Expected SPORE-TYPE-004 for Money * Money");
  });
});

// ── 4. Money comparison: isGreaterThan, equals ───────────────────────────────

// Money comparison helpers use the subtract-and-sign approach:
// isGreaterThan(a, b) = a.subtract(b) is positive (not negative, not zero)
// equals(a, b)        = a.amount() == b.amount() (works via logicNValuesEqual on decimal)

describe("Financial — Money comparison at runtime", () => {
  it("isGreaterThan: 100.00 GBP > 50.00 GBP is true", async () => {
    // subtract(b) gives a positive diff; its toString will not contain "-"
    const result = await parseAndRun(`
pure flow isGreaterThan(a: Money<GBP>, b: Money<GBP>) -> Bool {
  let diff = a.subtract(b)
  let diffStr = diff.toString()
  let isNeg = diffStr.contains("-")
  let isZero = diff.amount() == Decimal("0.00")
  if isNeg { return false }
  if isZero { return false }
  return true
}
pure flow test() -> Bool {
  return isGreaterThan(Money.gbp("100.00"), Money.gbp("50.00"))
}
`, "test");
    assert.equal(result.value.__tag, "bool", "Result should be bool");
    assert.equal(result.value.value, true, "100.00 > 50.00 should be true");
  });

  it("isGreaterThan: 50.00 GBP > 100.00 GBP is false", async () => {
    const result = await parseAndRun(`
pure flow isGreaterThan(a: Money<GBP>, b: Money<GBP>) -> Bool {
  let diff = a.subtract(b)
  let diffStr = diff.toString()
  let isNeg = diffStr.contains("-")
  let isZero = diff.amount() == Decimal("0.00")
  if isNeg { return false }
  if isZero { return false }
  return true
}
pure flow test() -> Bool {
  return isGreaterThan(Money.gbp("50.00"), Money.gbp("100.00"))
}
`, "test");
    assert.equal(result.value.__tag, "bool");
    assert.equal(result.value.value, false, "50.00 > 100.00 should be false");
  });

  it("equals: two GBP amounts with identical value (via Decimal ==)", async () => {
    // Decimal equality uses bigIntDecimalCmp via logicNValuesEqual
    const result = await parseAndRun(`
pure flow moneyEquals(a: Money<GBP>, b: Money<GBP>) -> Bool {
  return a.amount() == b.amount()
}
pure flow test() -> Bool {
  return moneyEquals(Money.gbp("75.00"), Money.gbp("75.00"))
}
`, "test");
    assert.equal(result.value.__tag, "bool");
    assert.equal(result.value.value, true, "75.00 == 75.00 should be true");
  });

  it("equals: two GBP amounts with different values", async () => {
    const result = await parseAndRun(`
pure flow moneyEquals(a: Money<GBP>, b: Money<GBP>) -> Bool {
  return a.amount() == b.amount()
}
pure flow test() -> Bool {
  return moneyEquals(Money.gbp("75.00"), Money.gbp("76.00"))
}
`, "test");
    assert.equal(result.value.__tag, "bool");
    assert.equal(result.value.value, false, "75.00 == 76.00 should be false");
  });

  it("currency accessor returns the currency code string", async () => {
    const result = await parseAndRun(`
pure flow test() -> String {
  let price = Money.gbp("99.99")
  return price.currency()
}
`, "test");
    assert.equal(result.value.__tag, "string");
    assert.equal(result.value.value, "GBP");
  });
});

// ── 5. VAT calculation: price * vatRate ──────────────────────────────────────

describe("Financial — VAT calculation", () => {
  it("calculates VAT at 20% on a GBP price", async () => {
    const result = await parseAndRun(`
pure flow calculateVat(price: Money<GBP>, vatRate: Decimal) -> Money<GBP> {
  return price.multiply(vatRate)
}
`, "calculateVat", new Map([
      ["price", { __tag: "record", fields: new Map([
        ["__amount", { __tag: "decimal", value: "100.00" }],
        ["__currency", { __tag: "string", value: "GBP" }],
        ["__isMoney", { __tag: "bool", value: true }],
      ]) }],
      ["vatRate", { __tag: "decimal", value: "0.20" }],
    ]));
    assert.equal(result.value.__tag, "record", "VAT result should be a Money record");
    const amount = result.value.fields.get("__amount");
    assert.ok(amount !== undefined, "Result must have __amount field");
    assert.equal(amount.__tag, "decimal", "Amount must be decimal");
    assert.equal(amount.value, "20.00", "20% of 100.00 GBP = 20.00");
  });

  it("calculates gross price: net + VAT", async () => {
    const result = await parseAndRun(`
pure flow grossPrice() -> String {
  let net = Money.gbp("100.00")
  let vatRate: Decimal = Decimal("0.20")
  let vat = net.multiply(vatRate)
  let gross = net.add(vat)
  return gross.toString()
}
`, "grossPrice");
    assert.equal(result.value.__tag, "string");
    assert.ok(result.value.value.includes("120.00"), `Expected gross to include 120.00, got: ${result.value.value}`);
  });

  it("type checker accepts Money<GBP> * Decimal (vatRate flow signature)", () => {
    const result = parseAndCheck(`
pure flow applyVat(price: Money<GBP>, rate: Decimal) -> Money<GBP> {
  return price.multiply(rate)
}
`);
    const errors = result.diagnostics.filter((d) => d.severity === "error");
    assert.equal(errors.length, 0, `Unexpected errors: ${errors.map((d) => `${d.code}: ${d.message}`).join(", ")}`);
  });
});

// ── 6. Salary flow with Decimal precision ─────────────────────────────────────

describe("Financial — salary flow with Decimal precision", () => {
  it("monthly salary computed from annual correctly (BigInt-backed)", async () => {
    const result = await parseAndRun(`
pure flow monthlySalary() -> String {
  let annual = Money.gbp("60000.00")
  let monthly = annual.divideBy(12)
  return monthly.toString()
}
`, "monthlySalary");
    assert.equal(result.value.__tag, "string");
    assert.ok(result.value.value.includes("5000.00"), `Expected 5000.00, got: ${result.value.value}`);
  });

  it("annual salary after 10% raise", async () => {
    const result = await parseAndRun(`
pure flow withRaise() -> String {
  let base = Money.gbp("50000.00")
  let raise = base.multiply(Decimal("0.10"))
  let newSalary = base.add(raise)
  return newSalary.toString()
}
`, "withRaise");
    assert.equal(result.value.__tag, "string");
    assert.ok(result.value.value.includes("55000.00"), `Expected 55000.00, got: ${result.value.value}`);
  });

  it("salary deductions: pension and tax", async () => {
    const result = await parseAndRun(`
pure flow takeHome() -> String {
  let gross = Money.gbp("4000.00")
  let pensionRate: Decimal = Decimal("0.05")
  let taxRate: Decimal = Decimal("0.20")
  let pension = gross.multiply(pensionRate)
  let tax = gross.multiply(taxRate)
  let afterPension = gross.subtract(pension)
  let takeHome = afterPension.subtract(tax)
  return takeHome.toString()
}
`, "takeHome");
    assert.equal(result.value.__tag, "string");
    // gross=4000, pension=200, tax=800, takeHome=3000
    assert.ok(result.value.value.includes("3000.00"), `Expected 3000.00, got: ${result.value.value}`);
  });

  it("Decimal type is recognised without SPORE-TYPE-001", () => {
    const result = parseAndCheck(`
pure flow salaryCalc(
  annual: Money<GBP>,
  taxRate: Decimal,
  pensionRate: Decimal
) -> Money<GBP> {
  return annual
}
`);
    assert.ok(!hasDiag(result, "SPORE-TYPE-001"), "Decimal must be a known type");
  });
});

// ── 7. Payment flow with governed contract ────────────────────────────────────

describe("Financial — payment flow with full governed contract (parse)", () => {
  it("parses a payment flow contract with types, intent, effects, privacy, errors, audit sections", () => {
    const result = parse(`
type PaymentResult = Result<Response, ApiError>

secure flow processPayment(readonly request: Request) -> PaymentResult
contract {
  types {
    type PaymentResult = Result<Response, ApiError>
  }
  intent {
    "Process payment for an order. Charges the customer card via the payment gateway, records the transaction to the ledger, and emits an audit event."
  }
  effects {
    database.write
    network.outbound
    audit.write
  }
  privacy {
    contains PII
    retention 7 years
    deny protected CardNumber to logs
    require redaction before audit.write
  }
  errors {
    returns {
      ApiError.BadRequest
      ApiError.Internal
    }
    map ValidationError to ApiError.BadRequest
    expose { ApiError.BadRequest }
    redact { ApiError.Internal }
    audit { ApiError.Internal }
  }
  audit {
    require runtime report
  }
}
contract { effects { database.write, network.outbound, audit.write } }
{
  return Ok(Response.created("{}"))
}
`);
    assert.ok(
      hasNoDiags(result),
      `Unexpected parse errors: ${result.diagnostics.map((d) => `${d.code}: ${d.message}`).join(", ")}`,
    );
  });

  it("parses payment flow with timeouts and retries", () => {
    const result = parse(`
secure flow processPayment(readonly request: Request) -> PaymentResult
contract {
  types {
    type PaymentResult = Result<Response, ApiError>
  }
  intent {
    "Process payment with timeout and retry policy."
  }
  effects {
    database.write
    network.outbound
    audit.write
  }
  privacy {
    contains PII
  }
  errors {
    returns { ApiError.BadRequest ApiError.Internal }
  }
  timeouts {
    deadline 10 seconds
    network { timeout 5 seconds }
    cancel on deadline
  }
  retries {
    network.outbound {
      attempts 3
      strategy exponential_backoff
    }
  }
  audit {
    require runtime report
  }
}
contract { effects { database.write, network.outbound, audit.write } }
{
  return Ok(Response.created("{}"))
}
`);
    assert.ok(
      hasNoDiags(result),
      `Unexpected parse errors: ${result.diagnostics.map((d) => `${d.code}: ${d.message}`).join(", ")}`,
    );
  });

  it("parses payment flow contract with observability section", () => {
    const result = parse(`
secure flow processPayment(readonly request: Request) -> PaymentResult
contract {
  types {
    type PaymentResult = Result<Response, ApiError>
  }
  intent {
    "Process a payment and emit telemetry."
  }
  effects {
    database.write
    network.outbound
    audit.write
  }
  privacy {
    contains PII
    deny protected CardNumber to logs
  }
  errors {
    returns { ApiError.BadRequest ApiError.Internal }
    redact { ApiError.Internal }
    audit { ApiError.Internal }
  }
  observability {
    trace flow
    measure latency
    count database.write
    deny protected values in logs
    deny request body logging
    require trace_id
  }
  audit {
    require runtime report
  }
}
contract { effects { database.write, network.outbound, audit.write } }
{
  return Ok(Response.created("{}"))
}
`);
    assert.ok(
      hasNoDiags(result),
      `Unexpected parse errors: ${result.diagnostics.map((d) => `${d.code}: ${d.message}`).join(", ")}`,
    );
  });
});

// ── 8. Financial record types: Invoice, Payment, Balance ─────────────────────

describe("Financial — record types: Invoice, Payment, Balance", () => {
  it("type checker accepts an Invoice record type declaration", () => {
    const result = parseAndCheck(`
type Invoice {
  id: String
  amount: Money<GBP>
  vatAmount: Money<GBP>
  totalAmount: Money<GBP>
  issuedAt: Timestamp
  dueAt: Timestamp
  status: String
}

flow getTotal(inv: Invoice) -> Money<GBP> {
  return inv.totalAmount
}
`);
    const errors = result.diagnostics.filter((d) => d.severity === "error");
    assert.equal(errors.length, 0, `Unexpected errors: ${errors.map((d) => `${d.code}: ${d.message}`).join(", ")}`);
  });

  it("type checker accepts a Payment record type declaration", () => {
    const result = parseAndCheck(`
type Payment {
  id: String
  invoiceId: String
  paid: Money<GBP>
  currency: String
  method: String
  paidAt: Timestamp
  status: String
}

flow getPaymentId(pmt: Payment) -> String {
  return pmt.id
}
`);
    const errors = result.diagnostics.filter((d) => d.severity === "error");
    assert.equal(errors.length, 0, `Unexpected errors: ${errors.map((d) => `${d.code}: ${d.message}`).join(", ")}`);
  });

  it("type checker accepts a Balance record type declaration", () => {
    const result = parseAndCheck(`
type Balance {
  accountId: String
  available: Money<GBP>
  pending: Money<GBP>
  reserved: Money<GBP>
  updatedAt: Timestamp
}

flow isPositive(bal: Balance) -> Bool {
  return true
}
`);
    const errors = result.diagnostics.filter((d) => d.severity === "error");
    assert.equal(errors.length, 0, `Unexpected errors: ${errors.map((d) => `${d.code}: ${d.message}`).join(", ")}`);
  });

  it("type checker accepts Invoice, Payment, and Balance together in a flow", () => {
    const result = parseAndCheck(`
type Invoice {
  id: String
  amount: Money<GBP>
  totalAmount: Money<GBP>
  status: String
}

type Payment {
  id: String
  invoiceId: String
  amount: Money<GBP>
  status: String
}

type Balance {
  accountId: String
  available: Money<GBP>
  updatedAt: Timestamp
}

flow reconcile(inv: Invoice, pmt: Payment, bal: Balance) -> Bool {
  return true
}
`);
    const errors = result.diagnostics.filter((d) => d.severity === "error");
    assert.equal(errors.length, 0, `Unexpected errors: ${errors.map((d) => `${d.code}: ${d.message}`).join(", ")}`);
  });
});

// ── 9. Brand types for financial domain ──────────────────────────────────────

describe("Financial — brand types: AccountId, TransactionId, CardNumber", () => {
  it("type checker accepts AccountId as a Brand<String, ...> alias (alias itself not flagged)", () => {
    // The string literal "AccountId" inside Brand<> may emit SPORE-TYPE-001 — that is expected.
    // The alias 'AccountId' itself must NOT be flagged as an unknown type.
    const result = parseAndCheck(`
type AccountId = Brand<String, "AccountId">

flow getAccount(id: AccountId) -> String {
  return "ok"
}
`);
    const type001 = diagsWithCode(result, "SPORE-TYPE-001");
    assert.ok(
      !type001.some((d) => d.message.includes("'AccountId'")),
      "AccountId alias itself must not appear in SPORE-TYPE-001 messages",
    );
  });

  it("type checker accepts TransactionId as a Brand<String, ...> alias (alias itself not flagged)", () => {
    // The string literal "TransactionId" inside Brand<> may emit SPORE-TYPE-001 — that is expected.
    const result = parseAndCheck(`
type TransactionId = Brand<String, "TransactionId">

flow getTransaction(id: TransactionId) -> String {
  return "ok"
}
`);
    const type001 = diagsWithCode(result, "SPORE-TYPE-001");
    assert.ok(
      !type001.some((d) => d.message.includes("'TransactionId'")),
      "TransactionId alias itself must not appear in SPORE-TYPE-001 messages",
    );
  });

  it("type checker accepts CardNumber as a Brand<String, ...> alias (alias itself not flagged)", () => {
    // The string literal "CardNumber" inside Brand<> may emit SPORE-TYPE-001 — that is expected.
    const result = parseAndCheck(`
type CardNumber = Brand<String, "CardNumber">

flow maskCard(card: CardNumber) -> String {
  return "****"
}
`);
    const type001 = diagsWithCode(result, "SPORE-TYPE-001");
    assert.ok(
      !type001.some((d) => d.message.includes("'CardNumber'")),
      "CardNumber alias itself must not appear in SPORE-TYPE-001 messages",
    );
  });

  it("emits SPORE-TYPE-003 when a string literal is directly assigned to AccountId", () => {
    const result = parseAndCheck(`
type AccountId = Brand<String, "AccountId">

flow test() -> String {
  let id: AccountId = "ACC-001"
  return "ok"
}
`);
    assert.ok(
      hasDiag(result, "SPORE-TYPE-003"),
      "Assigning a raw string to AccountId (Brand) must emit SPORE-TYPE-003",
    );
  });

  it("emits SPORE-TYPE-003 when a string literal is directly assigned to TransactionId", () => {
    const result = parseAndCheck(`
type TransactionId = Brand<String, "TransactionId">

flow test() -> String {
  let txId: TransactionId = "TXN-12345"
  return "ok"
}
`);
    assert.ok(
      hasDiag(result, "SPORE-TYPE-003"),
      "Assigning a raw string to TransactionId must emit SPORE-TYPE-003",
    );
  });

  it("emits SPORE-TYPE-003 when a string literal is assigned to CardNumber", () => {
    const result = parseAndCheck(`
type CardNumber = Brand<String, "CardNumber">

flow test() -> String {
  let card: CardNumber = "4111111111111111"
  return "ok"
}
`);
    assert.ok(
      hasDiag(result, "SPORE-TYPE-003"),
      "Assigning a raw card number string to CardNumber brand must emit SPORE-TYPE-003",
    );
  });

  it("SPORE-TYPE-003 diagnostic for CardNumber includes a suggested validate gate", () => {
    const result = parseAndCheck(`
type CardNumber = Brand<String, "CardNumber">

secure flow test(readonly request: Request) -> String
contract { effects { database.write } }
{
  unsafe let card: CardNumber = request.body.cardNumber
  return "ok"
}
`);
    const diag = diagsWithCode(result, "SPORE-TYPE-003")[0];
    assert.ok(diag !== undefined, "Expected SPORE-TYPE-003 for unsafe CardNumber assignment");
    assert.ok(
      diag.suggestedCode !== undefined && diag.suggestedCode.includes("validate"),
      `Expected suggestedCode mentioning 'validate', got: ${diag.suggestedCode}`,
    );
  });

  it("does not emit SPORE-TYPE-003 for a plain String binding (no brand)", () => {
    const result = parseAndCheck(`
flow test() -> String {
  let ref: String = "ACC-001"
  return ref
}
`);
    assert.ok(!hasDiag(result, "SPORE-TYPE-003"), "Plain String binding must not emit SPORE-TYPE-003");
  });
});

// ── 10. Runtime test: BigInt precision (0.1 + 0.2 = 0.30) ────────────────────

describe("Financial — runtime Money BigInt precision", () => {
  it("Money.gbp(0.1) + Money.gbp(0.2) equals exactly 0.30 (no floating-point drift)", async () => {
    const result = await parseAndRun(`
pure flow precisionTest() -> String {
  let a = Money.gbp("0.10")
  let b = Money.gbp("0.20")
  let total = a.add(b)
  return total.toString()
}
`, "precisionTest");
    assert.equal(result.value.__tag, "string");
    assert.ok(
      result.value.value.includes("0.30"),
      `Expected BigInt precision result 0.30, got: ${result.value.value}`,
    );
  });

  it("repeating decimal addition stays exact: 10 x 0.10 GBP = 1.00", async () => {
    const result = await parseAndRun(`
guarded flow sumTenths() -> String {
  mut total = Money.gbp("0.00")
  mut i = 0
  while i < 10 {
    total = total.add(Money.gbp("0.10"))
    i = i + 1
  }
  return total.toString()
}
`, "sumTenths");
    assert.equal(result.value.__tag, "string");
    assert.ok(
      result.value.value.includes("1.00"),
      `Expected exact 1.00 after 10x 0.10, got: ${result.value.value}`,
    );
  });

  it("Money.gbp amount() returns a decimal value", async () => {
    const result = await parseAndRun(`
pure flow getAmount() -> Decimal {
  let price = Money.gbp("49.99")
  return price.amount()
}
`, "getAmount");
    assert.equal(result.value.__tag, "decimal");
    assert.equal(result.value.value, "49.99");
  });

  it("USD cross-check: 1/3 of 99.99 does not produce floating-point garbage", async () => {
    // divideBy uses BigInt path; result should be rounded to 2 d.p.
    const result = await parseAndRun(`
pure flow thirdOf() -> String {
  let price = Money.usd("99.99")
  let third = price.divideBy(3)
  return third.toString()
}
`, "thirdOf");
    assert.equal(result.value.__tag, "string");
    // Result should be a well-formed decimal, not NaN or scientific notation
    const value = result.value.value;
    assert.ok(!value.includes("NaN"), "Result must not be NaN");
    assert.ok(!value.includes("e"), "Result must not be in scientific notation");
    assert.ok(value.includes("."), "Result must have a decimal point");
  });

  it("EUR subtract does not underflow to negative floating drift", async () => {
    const result = await parseAndRun(`
pure flow noUnderflow() -> String {
  let a = Money.eur("10.00")
  let b = Money.eur("9.99")
  let diff = a.subtract(b)
  return diff.toString()
}
`, "noUnderflow");
    assert.equal(result.value.__tag, "string");
    assert.ok(
      result.value.value.includes("0.01"),
      `Expected 0.01, got: ${result.value.value}`,
    );
  });

  it("JPY Money.toString includes currency code JPY", async () => {
    const result = await parseAndRun(`
pure flow jpyString() -> String {
  let price = Money.jpy("1500")
  return price.toString()
}
`, "jpyString");
    assert.equal(result.value.__tag, "string");
    assert.ok(result.value.value.includes("JPY"), "JPY toString must include 'JPY'");
  });
});

// ── Full secure payment flow: execute and verify audit output ─────────────────

describe("Financial — full secure payment flow execution", () => {
  it("executes a payment flow and records an audit entry", async () => {
    const result = await parseAndRun(`
guarded flow processPayment(amount: Money<GBP>) -> Result<String, String>
contract { effects { audit.write } }
{
  AuditLog.write(event: "payment.processed")
  return Ok("success")
}
`, "processPayment", new Map([
      ["amount", { __tag: "record", fields: new Map([
        ["__amount", { __tag: "decimal", value: "100.00" }],
        ["__currency", { __tag: "string", value: "GBP" }],
        ["__isMoney", { __tag: "bool", value: true }],
      ]) }],
    ]));
    assert.equal(result.value.__tag, "ok", "Payment flow should return Ok");
    assert.ok(
      result.audit.auditEntries.length >= 1,
      "Payment flow must record at least one audit entry",
    );
    const paymentEntry = result.audit.auditEntries.find((e) => e.event === "payment.processed");
    assert.ok(paymentEntry !== undefined, "Expected audit entry with event 'payment.processed'");
  });

  it("payment flow audit record has correct schema version", async () => {
    const result = await parseAndRun(`
guarded flow processPayment() -> String
contract { effects { audit.write } }
{
  AuditLog.write(event: "payment.initiated")
  return "ok"
}
`, "processPayment");
    assert.equal(result.audit.schemaVersion, "lln.runtime.audit.v1");
  });

  it("validates that payment amount is positive before processing", async () => {
    // Use subtract-and-sign approach: if amount > 0.00, diff.toString() will not contain "-"
    const result = await parseAndRun(`
pure flow isPositive(amount: Money<GBP>) -> Bool {
  let zero = Money.gbp("0.00")
  let diff = amount.subtract(zero)
  let diffStr = diff.toString()
  let isNeg = diffStr.contains("-")
  let isZero = diff.amount() == Decimal("0.00")
  if isNeg { return false }
  if isZero { return false }
  return true
}
pure flow validatePaymentAmount(amount: Money<GBP>) -> Result<String, String> {
  let positive = isPositive(amount)
  if positive {
    return Ok("valid")
  }
  return Err("Payment amount must be positive")
}
`, "validatePaymentAmount", new Map([
      ["amount", { __tag: "record", fields: new Map([
        ["__amount", { __tag: "decimal", value: "50.00" }],
        ["__currency", { __tag: "string", value: "GBP" }],
        ["__isMoney", { __tag: "bool", value: true }],
      ]) }],
    ]));
    assert.equal(result.value.__tag, "ok", "Positive amount should return Ok");
  });

  it("rejects zero payment amount with Err result", async () => {
    const result = await parseAndRun(`
pure flow isPositive(amount: Money<GBP>) -> Bool {
  let zero = Money.gbp("0.00")
  let diff = amount.subtract(zero)
  let diffStr = diff.toString()
  let isNeg = diffStr.contains("-")
  let isZero = diff.amount() == Decimal("0.00")
  if isNeg { return false }
  if isZero { return false }
  return true
}
pure flow validatePaymentAmount(amount: Money<GBP>) -> Result<String, String> {
  let positive = isPositive(amount)
  if positive {
    return Ok("valid")
  }
  return Err("Payment amount must be positive")
}
`, "validatePaymentAmount", new Map([
      ["amount", { __tag: "record", fields: new Map([
        ["__amount", { __tag: "decimal", value: "0.00" }],
        ["__currency", { __tag: "string", value: "GBP" }],
        ["__isMoney", { __tag: "bool", value: true }],
      ]) }],
    ]));
    assert.equal(result.value.__tag, "err", "Zero amount should return Err");
  });

  it("full PaymentResult contract parses without errors", () => {
    const result = parse(`
type PaymentResult = Result<Response, ApiError>

secure flow processPayment(readonly request: Request) -> PaymentResult
contract {
  types {
    type PaymentResult = Result<Response, ApiError>
  }
  intent {
    "Process payment for the given order. Validates the card, charges the gateway, writes the transaction to the ledger and emits an audit trail event."
  }
  effects {
    database.write
    network.outbound
    audit.write
  }
  privacy {
    contains PII
    retention 7 years
    deny protected CardNumber to logs
    deny protected CardNumber to response
    require redaction before audit.write
  }
  errors {
    returns {
      ApiError.BadRequest
      ApiError.Internal
    }
    map ValidationError to ApiError.BadRequest
    expose { ApiError.BadRequest }
    redact { ApiError.Internal }
    audit { ApiError.Internal }
  }
  timeouts {
    deadline 30 seconds
    network { timeout 10 seconds }
    cancel on deadline
  }
  retries {
    network.outbound {
      attempts 3
      strategy exponential_backoff
    }
  }
  limits {
    max request size 1 MB
  }
  observability {
    trace flow
    measure latency
    count database.write
    count network.outbound
    deny protected values in logs
    deny request body logging
    require trace_id
  }
  audit {
    require runtime report
  }
}
contract { effects { database.write, network.outbound, audit.write } }
{
  return Ok(Response.created("{}"))
}
`);
    assert.ok(
      hasNoDiags(result),
      `Full PaymentResult contract must parse cleanly: ${result.diagnostics.map((d) => `${d.code}: ${d.message}`).join(", ")}`,
    );
  });
});
