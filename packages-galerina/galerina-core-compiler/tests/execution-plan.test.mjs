// =============================================================================
// Phase 15 — Passive Execution Plans — Tests
// =============================================================================

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildExecutionPlan,
  buildAttestation,
  parseProgram,
  checkEffects,
} from "../dist/index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parse a source string and return { ast, flows }.
 */
function parse(source) {
  return parseProgram(source, "test.spore");
}

/**
 * Parse source and build a plan for the named flow.
 */
function buildPlan(source, flowName) {
  const parsed = parse(source);
  const errors = parsed.diagnostics.filter((d) => d.severity === "error");
  assert.equal(errors.length, 0, `Parse errors: ${errors.map((e) => e.message).join(", ")}`);
  const meta = parsed.flows.find((f) => f.name === flowName);
  assert.ok(meta !== undefined, `Flow '${flowName}' not found in: ${parsed.flows.map((f) => f.name).join(", ")}`);
  return buildExecutionPlan(parsed.ast, meta);
}

// ---------------------------------------------------------------------------
// Part A — Pure flow: no capability steps
// ---------------------------------------------------------------------------

describe("Phase 15 — PassiveExecutionPlan: pure flow", () => {
  it("buildExecutionPlan for a pure flow returns a plan with no capability steps", () => {
    const plan = buildPlan(`
pure flow calculateVat(price: Money) -> Money {
  return price
}
`, "calculateVat");

    assert.equal(plan.flow, "calculateVat");
    assert.equal(plan.qualifier, "pure");

    const capSteps = plan.steps.filter((s) => s.kind === "capability_call");
    assert.equal(capSteps.length, 0, "Pure flow should have no capability_call steps");
  });

  it("pure flow plan has a return step", () => {
    const plan = buildPlan(`
pure flow add(a: Int, b: Int) -> Int {
  return a
}
`, "add");

    const returnSteps = plan.steps.filter((s) => s.kind === "return");
    assert.equal(returnSteps.length, 1, "Should have exactly one return step");
    assert.equal(returnSteps[0].value, "Int");
  });
});

// ---------------------------------------------------------------------------
// Part B — Guarded flow with database.write: has capability_call step
// ---------------------------------------------------------------------------

describe("Phase 15 — PassiveExecutionPlan: guarded flow with effects", () => {
  it("buildExecutionPlan for a guarded flow with database.write returns plan with capability_call step", () => {
    const plan = buildPlan(`
guarded flow saveOrder(order: Order) -> Result<Order, Error>
contract { effects { database.write } }
{
  OrdersDB.insert(order)
  return Ok(order)
}
`, "saveOrder");

    assert.equal(plan.flow, "saveOrder");
    assert.equal(plan.qualifier, "guarded");

    const capSteps = plan.steps.filter((s) => s.kind === "capability_call");
    assert.ok(capSteps.length >= 1, "Guarded flow with database.write should have at least one capability_call step");

    const dbWriteStep = capSteps.find((s) => s.effect === "database.write");
    assert.ok(dbWriteStep !== undefined, "Should have a capability_call step for database.write");
    assert.equal(dbWriteStep.capability, "host.database.write");
    assert.equal(dbWriteStep.operation, "write");
  });

  it("plan approvedCapabilities contains database.read → host.database.read", () => {
    const plan = buildPlan(`
guarded flow fetchUser(id: String) -> Result<User, Error>
contract { effects { database.read } }
{
  let user = DB.find(id)?
  return Ok(user)
}
`, "fetchUser");

    const cap = plan.approvedCapabilities.get("database.read");
    assert.ok(cap !== undefined, "approvedCapabilities should contain database.read");
    assert.equal(cap.capability, "host.database.read");
    assert.equal(cap.effect, "database.read");
    assert.equal(cap.declared, true);
    assert.equal(cap.allowed, true);
  });
});

// ---------------------------------------------------------------------------
// Part C — planHash is a non-empty string
// ---------------------------------------------------------------------------

describe("Phase 15 — PassiveExecutionPlan: planHash", () => {
  it("plan planHash is a non-empty string", () => {
    const plan = buildPlan(`
pure flow greet(name: String) -> String {
  return name
}
`, "greet");

    assert.ok(typeof plan.planHash === "string", "planHash should be a string");
    assert.ok(plan.planHash.length > 0, "planHash should not be empty");
  });

  it("planHash is a 64-char hex string (SHA-256)", () => {
    const plan = buildPlan(`
pure flow identity(x: Int) -> Int {
  return x
}
`, "identity");

    assert.match(plan.planHash, /^[0-9a-f]{64}$/, "planHash should be 64 hex chars");
  });

  it("planHash differs between two different flows", () => {
    const planA = buildPlan(`
pure flow flowA(x: Int) -> Int {
  return x
}
`, "flowA");

    const planB = buildPlan(`
guarded flow flowB(x: Int) -> Int
contract { effects { database.read } }
{
  return x
}
`, "flowB");

    assert.notEqual(planA.planHash, planB.planHash, "Different flows should produce different plan hashes");
  });
});

// ---------------------------------------------------------------------------
// Part D — Attestation with plan includes executionPlan hash field
// ---------------------------------------------------------------------------

describe("Phase 15 — Attestation with execution plan", () => {
  it("attestation with plan includes executionPlan hash field", async () => {
    const plan = buildPlan(`
guarded flow createRecord(entry: RecordEntry) -> Result<RecordEntry, Error>
contract { effects { database.write } }
{
  DB.insert(entry)
  return Ok(entry)
}
`, "createRecord");

    const att = await buildAttestation({
      flowName: "createRecord",
      sourceText: "guarded flow createRecord ...",
      executionPlanHash: plan.planHash,
    });

    assert.ok(att.hashes.executionPlan !== undefined, "Attestation should include executionPlan hash");
    assert.ok(
      att.hashes.executionPlan.startsWith("sha256:"),
      `executionPlan hash should start with 'sha256:' but was: ${att.hashes.executionPlan}`,
    );
    // Should encode the plan hash in the sha256: prefix form
    assert.equal(att.hashes.executionPlan, `sha256:${plan.planHash}`);
  });

  it("attestation without plan has no executionPlan hash field", async () => {
    const att = await buildAttestation({
      flowName: "pureFlow",
      sourceText: "pure flow f() -> Void {}",
    });

    assert.equal(att.hashes.executionPlan, undefined, "Attestation without plan should not have executionPlan hash");
  });
});

// ---------------------------------------------------------------------------
// Part E — Correct flow name and qualifier
// ---------------------------------------------------------------------------

describe("Phase 15 — PassiveExecutionPlan: flow name and qualifier", () => {
  it("PassiveExecutionPlan has correct flow name and qualifier (pure)", () => {
    const plan = buildPlan(`
pure flow computeHash(data: String) -> String {
  return data
}
`, "computeHash");

    assert.equal(plan.flow, "computeHash");
    assert.equal(plan.qualifier, "pure");
  });

  it("PassiveExecutionPlan has correct flow name and qualifier (secure)", () => {
    const plan = buildPlan(`
secure flow processPayment(request: PaymentRequest) -> Result<Receipt, Error>
contract { effects { database.write, network.outbound } }
{
  return Ok(request)
}
`, "processPayment");

    assert.equal(plan.flow, "processPayment");
    assert.equal(plan.qualifier, "secure");
  });

  it("PassiveExecutionPlan has correct flow name and qualifier (guarded)", () => {
    const plan = buildPlan(`
guarded flow auditLog(entry: LogEntry) -> Void
contract { effects { audit.write } }
{
  return
}
`, "auditLog");

    assert.equal(plan.flow, "auditLog");
    assert.equal(plan.qualifier, "guarded");
  });

  it("PassiveExecutionPlan has generatedAt timestamp", () => {
    const plan = buildPlan(`
pure flow noop() -> Void {
  return
}
`, "noop");

    assert.ok(typeof plan.generatedAt === "string", "generatedAt should be a string");
    assert.ok(!isNaN(Date.parse(plan.generatedAt)), "generatedAt should be a valid ISO timestamp");
  });
});

// ---------------------------------------------------------------------------
// Part F — Emit steps: flow with emit PatientCreated → plan includes emit_event step
// ---------------------------------------------------------------------------

describe("Phase 15 — PassiveExecutionPlan: emit_event steps", () => {
  it("flow with emit PatientCreated → plan includes emit_event step", () => {
    const plan = buildPlan(`
guarded flow registerPatient(patient: PatientInput) -> Result<Patient, Error>
contract { effects { database.write } }
{
  DB.insert(patient)
  emit PatientCreated
  return Ok(patient)
}
`, "registerPatient");

    const emitSteps = plan.steps.filter((s) => s.kind === "emit_event");
    assert.ok(emitSteps.length >= 1, "Should have at least one emit_event step");
    const patientStep = emitSteps.find((s) => s.event === "PatientCreated");
    assert.ok(patientStep !== undefined, "Should have emit_event step for PatientCreated");
    assert.equal(patientStep.event, "PatientCreated");
  });

  it("flow with multiple emits produces deduplicated emit_event steps", () => {
    const plan = buildPlan(`
guarded flow createOrder(order: OrderInput) -> Result<Order, Error>
contract { effects { database.write } }
{
  DB.insert(order)
  emit OrderCreated
  emit InventoryReserved
  emit OrderCreated
  return Ok(order)
}
`, "createOrder");

    const emitSteps = plan.steps.filter((s) => s.kind === "emit_event");
    const orderCreatedSteps = emitSteps.filter((s) => s.event === "OrderCreated");
    assert.equal(orderCreatedSteps.length, 1, "Duplicate emit events should be deduplicated");
    const inventoryStep = emitSteps.find((s) => s.event === "InventoryReserved");
    assert.ok(inventoryStep !== undefined, "Should include InventoryReserved emit step");
  });

  it("pure flow with no emit has no emit_event steps", () => {
    const plan = buildPlan(`
pure flow formatDate(date: String) -> String {
  return date
}
`, "formatDate");

    const emitSteps = plan.steps.filter((s) => s.kind === "emit_event");
    assert.equal(emitSteps.length, 0, "Pure flow with no emit should have no emit_event steps");
  });
});

// ---------------------------------------------------------------------------
// Part G — Step ordering
// ---------------------------------------------------------------------------

describe("Phase 15 — PassiveExecutionPlan: step structure", () => {
  it("steps array ends with a return step", () => {
    const plan = buildPlan(`
guarded flow doWork(x: Int) -> Int
contract { effects { database.write } }
{
  DB.save(x)
  return x
}
`, "doWork");

    assert.ok(plan.steps.length > 0, "Should have at least one step");
    const lastStep = plan.steps[plan.steps.length - 1];
    assert.equal(lastStep.kind, "return", "Last step should be a return step");
  });

  it("steps is a non-empty readonly array", () => {
    const plan = buildPlan(`
pure flow simple(x: Int) -> Int {
  return x
}
`, "simple");

    assert.ok(Array.isArray(plan.steps), "steps should be an array");
    assert.ok(plan.steps.length > 0, "steps should not be empty");
  });

  it("approvedCapabilities is a Map", () => {
    const plan = buildPlan(`
guarded flow readUser(id: String) -> User
contract { effects { database.read } }
{
  return DB.find(id)
}
`, "readUser");

    assert.ok(plan.approvedCapabilities instanceof Map, "approvedCapabilities should be a Map");
    assert.ok(plan.approvedCapabilities.size >= 1, "Should have at least one approved capability");
  });
});
