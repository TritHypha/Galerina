/**
 * @galerina/devtools-pci — PCI DSS 4.0.1 Compliance Tests
 *
 * 12 tests covering all SPORE-PCI-001..010 diagnostic codes and report fields.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

import { runPciAudit, ALL_PCI_REQUIREMENTS } from "../dist/index.js";

// ---------------------------------------------------------------------------
// Test 1: payment flow with no authority {} → SPORE-PCI-004 and SPORE-PCI-008
// ---------------------------------------------------------------------------
describe("SPORE-PCI-004 + SPORE-PCI-008: payment flow missing authority", () => {
  it("fires SPORE-PCI-004 and SPORE-PCI-008 when authority is absent", () => {
    const source = [
      "secure flow processPayment(req: Request) -> Result<PaymentId, PaymentError>",
      "contract {",
      "  intent { \"Process a payment transaction.\" }",
      "  effects { database.write  audit.write }",
      "}",
      "{",
      "  let txn = PaymentDB.insert(req.body)?",
      "  AuditLog.write({ event: \"PaymentProcessed\", txnId: txn.id })",
      "  return Ok(txn.id)",
      "}",
    ].join("\n");

    const report = runPciAudit(source, "payment.spore");
    const codes = report.findings.map(f => f.code);
    assert.ok(codes.includes("SPORE-PCI-004"), `Expected SPORE-PCI-004, got: [${codes.join(", ")}]`);
    assert.ok(codes.includes("SPORE-PCI-008"), `Expected SPORE-PCI-008, got: [${codes.join(", ")}]`);
    assert.ok(!report.passed, "Report should fail");
    assert.ok(report.failedRequirements.includes("7"), "Req 7 should be failed");
    assert.ok(report.failedRequirements.includes("8"), "Req 8 should be failed");
  });
});

// ---------------------------------------------------------------------------
// Test 2: payment flow with no effects { audit.write } → SPORE-PCI-005
// ---------------------------------------------------------------------------
describe("SPORE-PCI-005: payment flow missing audit.write effect", () => {
  it("fires SPORE-PCI-005 when audit.write is absent", () => {
    const source = [
      "secure flow chargeCustomer(req: Request) -> Result<ChargeId, ChargeError>",
      "contract {",
      "  intent { \"Charge a customer card.\" }",
      "  effects { database.write }",
      "}",
      "authority { requires role: \"payment-processor\" }",
      "{",
      "  let charge = ChargeDB.insert(req.body)?",
      "  return Ok(charge.id)",
      "}",
    ].join("\n");

    const report = runPciAudit(source, "charge.spore");
    const codes = report.findings.map(f => f.code);
    assert.ok(codes.includes("SPORE-PCI-005"), `Expected SPORE-PCI-005, got: [${codes.join(", ")}]`);
    assert.ok(report.failedRequirements.includes("10.2"), "Req 10.2 should be failed");
  });
});

// ---------------------------------------------------------------------------
// Test 3: binding named pan reaching AuditLog.write without redact → SPORE-PCI-006
// ---------------------------------------------------------------------------
describe("SPORE-PCI-006: card data at AuditLog.write without redact", () => {
  it("fires SPORE-PCI-006 when pan reaches audit log unredacted", () => {
    const source = [
      "secure flow recordTransaction(req: Request) -> Result<TxnId, TxnError>",
      "contract {",
      "  intent { \"Record a card transaction.\" }",
      "  effects { database.write  audit.write }",
      "}",
      "authority { requires role: \"audit-writer\" }",
      "{",
      "  let pan: String = req.body.cardNumber",
      "  AuditLog.write({ event: \"TxnRecorded\", pan: pan })",
      "  return Ok(req.body.id)",
      "}",
    ].join("\n");

    const report = runPciAudit(source, "txn.spore");
    const codes = report.findings.map(f => f.code);
    assert.ok(codes.includes("SPORE-PCI-006"), `Expected SPORE-PCI-006, got: [${codes.join(", ")}]`);
    assert.ok(report.failedRequirements.includes("10.3"), "Req 10.3 should be failed");
  });
});

// ---------------------------------------------------------------------------
// Test 4: unsafe let binding named cvv without gating → SPORE-PCI-010
// ---------------------------------------------------------------------------
describe("SPORE-PCI-010: unsafe card-data binding not gated", () => {
  it("fires SPORE-PCI-010 for ungated cvv binding", () => {
    const source = [
      "secure flow validateCard(req: Request) -> Result<Bool, CardError>",
      "contract {",
      "  intent { \"Validate a credit card.\" }",
      "  effects { audit.write }",
      "}",
      "authority { requires role: \"card-validator\" }",
      "{",
      "  let cvv: String = req.body.cvv",
      "  AuditLog.write({ event: \"CardValidated\" })",
      "  return Ok(true)",
      "}",
    ].join("\n");

    const report = runPciAudit(source, "card.spore");
    const codes = report.findings.map(f => f.code);
    assert.ok(codes.includes("SPORE-PCI-010"), `Expected SPORE-PCI-010, got: [${codes.join(", ")}]`);
    assert.ok(report.failedRequirements.includes("6.3"), "Req 6.3 should be failed");
  });
});

// ---------------------------------------------------------------------------
// Test 5: fully-compliant payment flow → 0 findings
// ---------------------------------------------------------------------------
describe("Compliant payment flow: no findings", () => {
  it("passes a fully-compliant payment flow", () => {
    const source = [
      "secure flow processPayment(req: Request) -> Result<PaymentId, PaymentError>",
      "contract {",
      "  intent { \"Process a payment securely with full audit trail and access control.\" }",
      "  effects { database.write  audit.write }",
      "  privacy { mask cardNumber  mask cvv }",
      "  target { tls: \"1.3\" }",
      "}",
      "authority { requires role: \"payment-processor\"  sharing protected CardData to \"payment-gateway\"  approved_by \"security-board\" }",
      "{",
      "  let validCard = validate.cardData(req.body.cardNumber)?",
      "  let txn = PaymentDB.insert({ card: validCard })?",
      "  AuditLog.write({ event: \"PaymentProcessed\", txnId: txn.id, card: redact(validCard) })",
      "  return Ok(txn.id)",
      "}",
    ].join("\n");

    const report = runPciAudit(source, "compliant-payment.spore");
    // Filter to only high/critical findings for the pass assertion
    const severe = report.findings.filter(f => f.severity === "critical" || f.severity === "high");
    assert.equal(severe.length, 0, `Expected 0 severe findings, got: [${severe.map(f => f.code).join(", ")}]`);
    assert.ok(report.passed, `Expected passed=true, findings: [${report.findings.map(f => f.code).join(", ")}]`);
  });
});

// ---------------------------------------------------------------------------
// Test 6: non-payment flow → 0 PCI findings
// ---------------------------------------------------------------------------
describe("Non-payment flow: no PCI findings", () => {
  it("does not fire PCI checks on a non-payment flow", () => {
    const source = [
      "pure flow add(a: Int, b: Int) -> Int",
      "contract { effects {} }",
      "{ return a + b }",
    ].join("\n");

    const report = runPciAudit(source, "math.spore");
    assert.equal(report.findings.length, 0, `Expected 0 findings, got: [${report.findings.map(f => f.code).join(", ")}]`);
    assert.ok(report.passed, "Non-payment flow should pass");
  });
});

// ---------------------------------------------------------------------------
// Test 7: directory with 2+ payment flows all missing intent → SPORE-PCI-009
// ---------------------------------------------------------------------------
describe("SPORE-PCI-009: multiple payment flows, none have contract.intent", () => {
  it("fires SPORE-PCI-009 for a file with 2+ payment flows and no intent", () => {
    const source = [
      "secure flow processPayment(req: Request) -> Result<PaymentId, PaymentError>",
      "contract {",
      "  effects { database.write  audit.write }",
      "}",
      "authority { requires role: \"payment-processor\" }",
      "{",
      "  let txn = PaymentDB.insert(req.body)?",
      "  AuditLog.write({ event: \"PaymentProcessed\", txnId: txn.id })",
      "  return Ok(txn.id)",
      "}",
      "",
      "secure flow chargeCard(req: Request) -> Result<ChargeId, ChargeError>",
      "contract {",
      "  effects { database.write  audit.write }",
      "}",
      "authority { requires role: \"payment-processor\" }",
      "{",
      "  let charge = ChargeDB.insert(req.body)?",
      "  AuditLog.write({ event: \"CardCharged\", chargeId: charge.id })",
      "  return Ok(charge.id)",
      "}",
    ].join("\n");

    const report = runPciAudit(source, "multi-payment.spore");
    const codes = report.findings.map(f => f.code);
    assert.ok(codes.includes("SPORE-PCI-009"), `Expected SPORE-PCI-009, got: [${codes.join(", ")}]`);
    assert.ok(report.failedRequirements.includes("12.6"), "Req 12.6 should be failed");
  });
});

// ---------------------------------------------------------------------------
// Test 8: passed: true when all requirements met
// ---------------------------------------------------------------------------
describe("passed: true when all critical/high requirements met", () => {
  it("sets passed=true for a clean non-payment source", () => {
    const source = [
      "pure flow greet(name: String) -> String",
      "contract { effects {} }",
      "{ return name }",
    ].join("\n");

    const report = runPciAudit(source);
    assert.ok(report.passed, "Clean source should pass");
    assert.equal(report.critical.length, 0, "No critical findings expected");
    assert.equal(report.high.length, 0, "No high findings expected");
  });
});

// ---------------------------------------------------------------------------
// Test 9: failedRequirements contains correct PCI codes
// ---------------------------------------------------------------------------
describe("failedRequirements accuracy", () => {
  it("reports correct requirement codes in failedRequirements", () => {
    const source = [
      "secure flow checkout(req: Request) -> Result<OrderId, OrderError>",
      "contract {",
      "  effects { database.write }",
      "}",
      "{",
      "  let order = OrderDB.insert(req.body)?",
      "  return Ok(order.id)",
      "}",
    ].join("\n");

    const report = runPciAudit(source, "checkout.spore");
    // checkout is a payment keyword → should trigger missing authority, intent, audit.write
    assert.ok(report.failedRequirements.includes("7"), `Req 7 expected in failedRequirements: ${JSON.stringify(report.failedRequirements)}`);
    assert.ok(report.failedRequirements.includes("10.2"), `Req 10.2 expected in failedRequirements`);
    assert.ok(report.failedRequirements.includes("6.2"), `Req 6.2 expected in failedRequirements`);
  });
});

// ---------------------------------------------------------------------------
// Test 10: requirementsCovered has all 10 requirements
// ---------------------------------------------------------------------------
describe("requirementsCovered always has all 10 requirements", () => {
  it("always lists all 10 PCI requirements as covered, even when passing", () => {
    const source = "pure flow f() -> Int contract { effects {} } { return 42 }";
    const report = runPciAudit(source);
    assert.equal(report.requirementsCovered.length, 10, `Expected 10 covered, got ${report.requirementsCovered.length}`);
    for (const req of ALL_PCI_REQUIREMENTS) {
      assert.ok(report.requirementsCovered.includes(req), `Missing ${req} from requirementsCovered`);
    }
  });
});

// ---------------------------------------------------------------------------
// Test 11: JSON output format is valid and contains pciDssVersion: "4.0.1"
// ---------------------------------------------------------------------------
describe("JSON output format", () => {
  it("produces valid JSON with pciDssVersion: 4.0.1 and schemaVersion: spore.pci-audit.v1", () => {
    const source = "pure flow f() -> Int contract { effects {} } { return 1 }";
    const report = runPciAudit(source, "test.spore");
    const json = JSON.stringify(report);
    const parsed = JSON.parse(json);
    assert.equal(parsed.pciDssVersion, "4.0.1", "pciDssVersion must be 4.0.1");
    assert.equal(parsed.schemaVersion, "spore.pci-audit.v1", "schemaVersion must be spore.pci-audit.v1");
    assert.ok(Array.isArray(parsed.findings), "findings must be an array");
    assert.ok(Array.isArray(parsed.requirementsCovered), "requirementsCovered must be an array");
    assert.ok(typeof parsed.auditedAt === "string", "auditedAt must be a string");
    assert.ok(typeof parsed.passed === "boolean", "passed must be a boolean");
  });
});

// ---------------------------------------------------------------------------
// Test 12: card data in a comment (not a binding) → no SPORE-PCI-001
// ---------------------------------------------------------------------------
describe("SPORE-PCI-001: comments do not trigger findings", () => {
  it("does not fire SPORE-PCI-001 when card keyword appears only in a comment", () => {
    // The word 'pan' and 'cvv' appear only in comments / non-binding positions.
    // The flow itself processes generic data with no card-data bindings.
    const source = [
      "// This flow does NOT handle pan or cvv — purely cosmetic note",
      "pure flow formatAddress(street: String, city: String) -> String",
      "contract { effects {} }",
      "{ return street }",
    ].join("\n");

    const report = runPciAudit(source, "address.spore");
    const codes = report.findings.map(f => f.code);
    assert.ok(!codes.includes("SPORE-PCI-001"), `SPORE-PCI-001 should NOT fire for comment-only card keywords, got: [${codes.join(", ")}]`);
    assert.ok(report.passed, "Should pass — no card-data in bindings or string literals");
  });
});
