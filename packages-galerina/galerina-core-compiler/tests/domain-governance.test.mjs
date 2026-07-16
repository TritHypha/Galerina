// =============================================================================
// domain-governance.test.mjs — Governance domain tests
//
// Covers the full governance pipeline:
//   parseProgram → checkEffects → verifyGovernance → checkEvents
//
// Diagnostic codes exercised:
//   FUNGI-GOV-003, FUNGI-GOV-011, FUNGI-GOV-012
//   FUNGI-CONTEXT-001
//   FUNGI-EVENT-001, FUNGI-EVENT-002
//   FUNGI-EFFECT-001, FUNGI-EFFECT-002, FUNGI-EFFECT-003, FUNGI-EFFECT-004
//   GOV-001 (FUNGI-GOV-001), GOV-002 (FUNGI-GOV-002), GOV-004 (FUNGI-GOV-010),
//   GOV-010 (FUNGI-GOV-010)
// =============================================================================

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  parseProgram,
  checkEffects,
  verifyGovernance,
  checkEvents,
  FUNGI_GOV_003,
  FUNGI_CONTEXT_001,
  FUNGI_GOV_011,
  FUNGI_GOV_012,
  FUNGI_EVENT_001,
  FUNGI_EVENT_002,
} from "../dist/index.js";

// ---------------------------------------------------------------------------
// Pipeline helpers
// ---------------------------------------------------------------------------

function runPipeline(source, profile = "dev") {
  const parsed = parseProgram(source, "test.fungi");
  const effects = checkEffects(parsed.flows, parsed.ast);
  const gov = verifyGovernance(parsed.ast, parsed.flows, effects, profile);
  const events = checkEvents(parsed.ast);
  return { parsed, effects, gov, events };
}

function govHasDiag(gov, code) {
  return gov.diagnostics.some((d) => d.code === code);
}

function eventHasDiag(events, code) {
  return events.diagnostics.some((d) => d.code === code);
}

function effectHasDiag(effects, code) {
  return effects.some((r) => r.diagnostics.some((d) => d.code === code));
}

function noParseErrors(parsed) {
  return parsed.diagnostics.filter((d) => d.severity === "error").length === 0;
}

// =============================================================================
// 1. Contract with all 16 sections
// =============================================================================

describe("Domain governance — contract with all 16 sections", () => {
  // Full 16-section contract source used across multiple tests.
  const FULL_CONTRACT = `
event PatientDataAccessed

secure flow getPatient(readonly request: Request) -> GetPatientResult
contract {
  types {
    type GetPatientResult = Result<Response, ApiError>
  }
  intent {
    "Return patient record to an authorised clinical actor."
  }
  request {
    accepts PatientReadRequest
    params {
      patientId: unsafe String
    }
    requires {
      actor
      trace_id
    }
  }
  response {
    returns PatientProfileResponse
    exposes { patientId name }
    denies { nhsNumber dateOfBirth }
  }
  context {
    require actor
    require trace_id
  }
  model {
    uses PatientRecord
    reads PatientIndex
    constraints {
      active_only
    }
  }
  effects {
    database.read
    audit.write
  }
  timeouts {
    deadline 5 seconds
    network {
      timeout 2 seconds
    }
    cancel on deadline
  }
  retries {
    database.read {
      attempts 2
      strategy exponential_backoff
    }
  }
  limits {
    max request size 1 MB
    max batch size 50
    max memory 128 MB
  }
  privacy {
    contains PII
    retention 7 years
    deny protected Email to response
    require redaction before audit.write
  }
  errors {
    returns {
      ApiError.NotFound
      ApiError.Unauthorised
      ApiError.Internal
    }
    map PatientNotFound to ApiError.NotFound
    expose { ApiError.NotFound ApiError.Unauthorised }
    redact { ApiError.Internal }
    audit { ApiError.Internal }
  }
  rules {
    require actor before database.read
    deny direct nhsNumber in response
  }
  observability {
    trace flow
    measure latency
    count database.read
    log event names
    deny protected values in logs
    deny request body logging
    require trace_id
  }
  events {
    emits PatientDataAccessed
  }
  audit {
    require runtime report
    require signed attestation
  }
}
contract { effects { database.read, audit.write } }
intent "Return patient record to an authorised clinical actor." {
  let actor = context.actor
  let trace = context.trace_id
  let patient = PatientsDB.find(request.params.id)?
  emit PatientDataAccessed
  return Ok(Response.ok({ patientId: patient.id, name: patient.name }))
}
`;

  it("parses without errors", () => {
    const { parsed } = runPipeline(FULL_CONTRACT);
    assert.ok(
      noParseErrors(parsed),
      `Parse errors: ${parsed.diagnostics.filter((d) => d.severity === "error").map((d) => d.code + ": " + d.message).join(", ")}`,
    );
  });

  it("extracts one flow from the 16-section contract", () => {
    const { parsed } = runPipeline(FULL_CONTRACT);
    assert.equal(parsed.flows.length, 1);
    assert.equal(parsed.flows[0]?.name, "getPatient");
  });

  it("does not raise FUNGI-EVENT-001 — event declared before use", () => {
    const { events } = runPipeline(FULL_CONTRACT);
    assert.ok(!eventHasDiag(events, "FUNGI-EVENT-001"), "Unexpected FUNGI-EVENT-001");
  });

  it("does not raise FUNGI-EVENT-002 — event is emitted", () => {
    const { events } = runPipeline(FULL_CONTRACT);
    assert.ok(!eventHasDiag(events, "FUNGI-EVENT-002"), "Unexpected FUNGI-EVENT-002");
  });

  it("does not raise FUNGI-CONTEXT-001 — actor and trace_id are accessed", () => {
    const { gov } = runPipeline(FULL_CONTRACT);
    assert.ok(!govHasDiag(gov, "FUNGI-CONTEXT-001"), "Unexpected FUNGI-CONTEXT-001");
  });

  it("does not raise FUNGI-GOV-003 — denied fields nhsNumber/dateOfBirth are not returned", () => {
    const { gov } = runPipeline(FULL_CONTRACT);
    assert.ok(!govHasDiag(gov, "FUNGI-GOV-003"), "Unexpected FUNGI-GOV-003");
  });

  it("does not raise FUNGI-GOV-010 — intent is declared", () => {
    const { gov } = runPipeline(FULL_CONTRACT);
    assert.ok(!govHasDiag(gov, "FUNGI-GOV-010"), "Unexpected FUNGI-GOV-010");
  });

  it("records intent_declared proof obligation", () => {
    const { gov } = runPipeline(FULL_CONTRACT);
    assert.ok(
      gov.proofObligations.some((o) => o.startsWith("intent_declared:")),
      "Expected intent_declared proof obligation",
    );
  });

  it("records audit_required proof obligation", () => {
    const { gov } = runPipeline(FULL_CONTRACT);
    assert.ok(
      gov.proofObligations.some((o) => o.startsWith("audit_required:")),
      "Expected audit_required proof obligation",
    );
  });
});

// =============================================================================
// 2. FUNGI-GOV-003: response.denies field appears in response body
// =============================================================================

describe("FUNGI-GOV-003 — denied field appears in response body", () => {
  it("emits FUNGI-GOV-003 when a denied field name is used in a response record", () => {
    const { gov } = runPipeline(`
flow getPatient(readonly request: Request) -> GetPatientResult
contract {
  types {
    type GetPatientResult = Result<Response, ApiError>
  }
  response {
    returns PatientResponse
    denies { email nhsNumber }
  }
}
contract { effects { database.read } }
{
  let patient = PatientsDB.find(request.params.id)?
  return Ok(Response.ok({ patientId: patient.id, email: patient.email }))
}
`);
    assert.ok(govHasDiag(gov, "FUNGI-GOV-003"), "Expected FUNGI-GOV-003 for denied email field");
  });

  it("FUNGI-GOV-003 is error severity", () => {
    const { gov } = runPipeline(`
flow getPatient(readonly request: Request) -> GetPatientResult
contract {
  response {
    denies { ssn }
  }
}
contract { effects { database.read } }
{
  return Ok(Response.ok({ ssn: patient.ssn }))
}
`);
    const diag = gov.diagnostics.find((d) => d.code === "FUNGI-GOV-003");
    assert.ok(diag !== undefined, "Expected FUNGI-GOV-003");
    assert.equal(diag.severity, "error");
  });

  it("FUNGI-GOV-003 message names the offending field", () => {
    const { gov } = runPipeline(`
flow getPatient(readonly request: Request) -> GetPatientResult
contract {
  response {
    denies { creditCardNumber }
  }
}
contract { effects { database.read } }
{
  return Ok(Response.ok({ creditCardNumber: card.num }))
}
`);
    const diag = gov.diagnostics.find((d) => d.code === "FUNGI-GOV-003");
    assert.ok(diag !== undefined);
    assert.ok(diag.message.includes("creditCardNumber"), "Message should name the denied field");
  });

  it("does not emit FUNGI-GOV-003 when denied field is not in the response body", () => {
    const { gov } = runPipeline(`
flow getPatient(readonly request: Request) -> GetPatientResult
contract {
  response {
    exposes { patientId name }
    denies { email nhsNumber }
  }
}
contract { effects { database.read } }
{
  return Ok(Response.ok({ patientId: patient.id, name: patient.name }))
}
`);
    assert.ok(!govHasDiag(gov, "FUNGI-GOV-003"), "Unexpected FUNGI-GOV-003");
  });

  it("does not emit FUNGI-GOV-003 when contract has no response section", () => {
    const { gov } = runPipeline(`
flow getOrder(readonly request: Request) -> GetOrderResult
contract {
  types {
    type GetOrderResult = Result<Response, ApiError>
  }
}
contract { effects { database.read } }
{
  return Ok(Response.ok({ email: user.email }))
}
`);
    assert.ok(!govHasDiag(gov, "FUNGI-GOV-003"), "Unexpected FUNGI-GOV-003 without response contract");
  });

  it("FUNGI_GOV_003 constant has expected code and name", () => {
    assert.equal(FUNGI_GOV_003.code, "FUNGI-GOV-003");
    assert.equal(FUNGI_GOV_003.name, "PROTECTED_DATA_IN_RESPONSE");
    assert.equal(FUNGI_GOV_003.severity, "error");
  });
});

// =============================================================================
// 3. FUNGI-GOV-011: unknown contract set
// =============================================================================

describe("FUNGI-GOV-011 — unknown contract set", () => {
  it("emits FUNGI-GOV-011 when flow uses an undeclared contract set", () => {
    const { gov } = runPipeline(`
flow createOrder(request: Request) -> Result<Response, ApiError>
contract {
  effects { database.write }
  use UnknownPolicy
}
{
  return Ok(Response.ok({}))
}
`);
    assert.ok(govHasDiag(gov, "FUNGI-GOV-011"), "Expected FUNGI-GOV-011 for unknown contract set");
  });

  it("FUNGI-GOV-011 is error severity", () => {
    const { gov } = runPipeline(`
flow x(request: Request) -> Result<Response, ApiError>
contract {
  effects { database.write }
  use MissingSet
}
{
  return Ok(Response.ok({}))
}
`);
    const diag = gov.diagnostics.find((d) => d.code === "FUNGI-GOV-011");
    assert.ok(diag !== undefined);
    assert.equal(diag.severity, "error");
  });

  it("FUNGI-GOV-011 message names the missing set", () => {
    const { gov } = runPipeline(`
flow x(request: Request) -> Result<Response, ApiError>
contract {
  effects { database.write }
  use GhostPolicy
}
{
  return Ok(Response.ok({}))
}
`);
    const diag = gov.diagnostics.find((d) => d.code === "FUNGI-GOV-011");
    assert.ok(diag !== undefined);
    assert.ok(diag.message.includes("GhostPolicy"), "Message should name the unknown set");
  });

  it("does not emit FUNGI-GOV-011 when the contract set is declared at program scope", () => {
    const { gov } = runPipeline(`
contract set OrderPolicy {
  rules {}
  events {}
  audit {}
}

flow createOrder(request: Request) -> Result<Response, ApiError>
contract {
  effects { database.write }
  use OrderPolicy
}
{
  return Ok(Response.ok({}))
}
`);
    assert.ok(!govHasDiag(gov, "FUNGI-GOV-011"), "Unexpected FUNGI-GOV-011 when set is declared");
  });

  it("FUNGI_GOV_011 constant has expected code and name", () => {
    assert.equal(FUNGI_GOV_011.code, "FUNGI-GOV-011");
    assert.equal(FUNGI_GOV_011.name, "UnknownContractSet");
    assert.equal(FUNGI_GOV_011.severity, "error");
  });
});

// =============================================================================
// 4. FUNGI-GOV-012: contract set requires audit.write but flow doesn't declare it
// =============================================================================

describe("FUNGI-GOV-012 — contract set audit requirement not met", () => {
  it("emits FUNGI-GOV-012 when audit requirement is unmet", () => {
    const { gov } = runPipeline(`
contract set AuditedPolicy {
  rules {}
  audit {
    require audit.write
  }
}

flow createOrder(request: Request) -> Result<Response, ApiError>
contract {
  effects { database.write }
  use AuditedPolicy
}
{
  return Ok(Response.ok({}))
}
`);
    assert.ok(govHasDiag(gov, "FUNGI-GOV-012"), "Expected FUNGI-GOV-012");
  });

  it("FUNGI-GOV-012 is warning severity", () => {
    const { gov } = runPipeline(`
contract set AuditedPolicy {
  audit {
    require audit.write
  }
}

flow createOrder(request: Request) -> Result<Response, ApiError>
contract {
  effects { database.write }
  use AuditedPolicy
}
{
  return Ok(Response.ok({}))
}
`);
    const diag = gov.diagnostics.find((d) => d.code === "FUNGI-GOV-012");
    assert.ok(diag !== undefined);
    assert.equal(diag.severity, "warning");
  });

  it("does not emit FUNGI-GOV-012 when flow declares audit.write", () => {
    const { gov } = runPipeline(`
contract set AuditedPolicy {
  audit {
    require audit.write
  }
}

flow createOrder(request: Request) -> Result<Response, ApiError>
contract {
  effects { database.write, audit.write }
  use AuditedPolicy
}
{
  return Ok(Response.ok({}))
}
`);
    assert.ok(!govHasDiag(gov, "FUNGI-GOV-012"), "Unexpected FUNGI-GOV-012 when audit.write is declared");
  });

  it("does not emit FUNGI-GOV-012 when contract set audit block is empty", () => {
    const { gov } = runPipeline(`
contract set SimplePolicy {
  rules {}
  audit {}
}

flow createOrder(request: Request) -> Result<Response, ApiError>
contract {
  effects { database.write }
  use SimplePolicy
}
{
  return Ok(Response.ok({}))
}
`);
    assert.ok(!govHasDiag(gov, "FUNGI-GOV-012"), "Unexpected FUNGI-GOV-012 for empty audit block");
  });

  it("FUNGI_GOV_012 constant has expected code and name", () => {
    assert.equal(FUNGI_GOV_012.code, "FUNGI-GOV-012");
    assert.equal(FUNGI_GOV_012.name, "ContractSetRequirementNotMet");
    assert.equal(FUNGI_GOV_012.severity, "warning");
  });
});

// =============================================================================
// 5. FUNGI-CONTEXT-001: required context field not accessed
// =============================================================================

describe("FUNGI-CONTEXT-001 — required context field not accessed", () => {
  it("emits FUNGI-CONTEXT-001 when context.actor is required but never accessed", () => {
    const { gov } = runPipeline(`
flow getRecord(readonly request: Request) -> GetRecordResult
contract {
  types {
    type GetRecordResult = Result<Response, ApiError>
  }
  context {
    require actor
  }
}
contract { effects { database.read } }
{
  let record = RecordsDB.find(request.params.id)?
  return Ok(Response.ok({ id: record.id }))
}
`);
    assert.ok(govHasDiag(gov, "FUNGI-CONTEXT-001"), "Expected FUNGI-CONTEXT-001");
  });

  it("FUNGI-CONTEXT-001 is warning severity", () => {
    const { gov } = runPipeline(`
flow getRecord(readonly request: Request) -> GetRecordResult
contract {
  context {
    require trace_id
  }
}
contract { effects { database.read } }
{
  return Ok(Response.ok({}))
}
`);
    const diag = gov.diagnostics.find((d) => d.code === "FUNGI-CONTEXT-001");
    assert.ok(diag !== undefined);
    assert.equal(diag.severity, "warning");
  });

  it("FUNGI-CONTEXT-001 message names the missing field", () => {
    const { gov } = runPipeline(`
flow getRecord(readonly request: Request) -> GetRecordResult
contract {
  context {
    require correlation_id
  }
}
contract { effects { database.read } }
{
  return Ok(Response.ok({}))
}
`);
    const diag = gov.diagnostics.find((d) => d.code === "FUNGI-CONTEXT-001");
    assert.ok(diag !== undefined);
    assert.ok(diag.message.includes("correlation_id"), "Message should name the unaccessed field");
  });

  it("does not emit FUNGI-CONTEXT-001 when the field is accessed in the body", () => {
    const { gov } = runPipeline(`
flow getRecord(readonly request: Request) -> GetRecordResult
contract {
  context {
    require actor
  }
}
contract { effects { database.read } }
{
  let actor = context.actor
  return Ok(Response.ok({ actor: actor }))
}
`);
    assert.ok(!govHasDiag(gov, "FUNGI-CONTEXT-001"), "Unexpected FUNGI-CONTEXT-001");
  });

  it("does not emit FUNGI-CONTEXT-001 when there is no context section", () => {
    const { gov } = runPipeline(`
flow getOrder(readonly request: Request) -> GetOrderResult
contract {
  types {
    type GetOrderResult = Result<Response, ApiError>
  }
}
contract { effects { database.read } }
{
  return Ok(Response.ok({}))
}
`);
    assert.ok(!govHasDiag(gov, "FUNGI-CONTEXT-001"), "Unexpected FUNGI-CONTEXT-001 without context section");
  });

  it("FUNGI_CONTEXT_001 constant has expected code and name", () => {
    assert.equal(FUNGI_CONTEXT_001.code, "FUNGI-CONTEXT-001");
    assert.equal(FUNGI_CONTEXT_001.name, "REQUIRED_CONTEXT_NOT_ACCESSED");
    assert.equal(FUNGI_CONTEXT_001.severity, "warning");
  });
});

// =============================================================================
// 6. FUNGI-EVENT-001: emit without global event declaration
// =============================================================================

describe("FUNGI-EVENT-001 — emit without global event declaration", () => {
  it("emits FUNGI-EVENT-001 when an event is emitted without a top-level declaration", () => {
    const { events } = runPipeline(`
flow createOrder(request: Request) -> Result<Response, ApiError>
contract { effects { database.write } }
{
  emit OrderCreated
  return Ok(Response.ok({}))
}
`);
    assert.ok(eventHasDiag(events, "FUNGI-EVENT-001"), "Expected FUNGI-EVENT-001");
  });

  it("FUNGI-EVENT-001 is error severity", () => {
    const { events } = runPipeline(`
flow x(request: Request) -> Result<Response, ApiError>
contract { effects { database.write } }
{
  emit SomeEvent
  return Ok(Response.ok({}))
}
`);
    const diag = events.diagnostics.find((d) => d.code === "FUNGI-EVENT-001");
    assert.ok(diag !== undefined);
    assert.equal(diag.severity, "error");
  });

  it("FUNGI-EVENT-001 message names the undeclared event", () => {
    const { events } = runPipeline(`
flow x(request: Request) -> Result<Response, ApiError>
contract { effects { database.write } }
{
  emit PatientCreated
  return Ok(Response.ok({}))
}
`);
    const diag = events.diagnostics.find((d) => d.code === "FUNGI-EVENT-001");
    assert.ok(diag !== undefined);
    assert.ok(diag.message.includes("PatientCreated"), "Message should name the event");
  });

  it("does not emit FUNGI-EVENT-001 when the event is declared globally", () => {
    const { events } = runPipeline(`
event OrderCreated

flow createOrder(request: Request) -> Result<Response, ApiError>
contract { effects { database.write } }
{
  emit OrderCreated
  return Ok(Response.ok({}))
}
`);
    assert.ok(!eventHasDiag(events, "FUNGI-EVENT-001"), "Unexpected FUNGI-EVENT-001");
  });

  it("FUNGI_EVENT_001 constant has expected code and name", () => {
    assert.equal(FUNGI_EVENT_001.code, "FUNGI-EVENT-001");
    assert.equal(FUNGI_EVENT_001.name, "EventNotDeclared");
    assert.equal(FUNGI_EVENT_001.severity, "error");
  });
});

// =============================================================================
// 7. FUNGI-EVENT-002: event declared but never emitted
// =============================================================================

describe("FUNGI-EVENT-002 — event declared but never emitted", () => {
  it("emits FUNGI-EVENT-002 when a declared event is never emitted", () => {
    const { events } = runPipeline(`
event OrderCancelled

pure flow calculate(x: Int) -> Int {
  return x
}
`);
    assert.ok(eventHasDiag(events, "FUNGI-EVENT-002"), "Expected FUNGI-EVENT-002");
  });

  it("FUNGI-EVENT-002 is warning severity", () => {
    const { events } = runPipeline(`
event UnusedEvent

pure flow greet() -> String {
  return "hello"
}
`);
    const diag = events.diagnostics.find((d) => d.code === "FUNGI-EVENT-002");
    assert.ok(diag !== undefined);
    assert.equal(diag.severity, "warning");
  });

  it("FUNGI-EVENT-002 message names the unused event", () => {
    const { events } = runPipeline(`
event DeadEvent
`);
    const diag = events.diagnostics.find((d) => d.code === "FUNGI-EVENT-002");
    assert.ok(diag !== undefined);
    assert.ok(diag.message.includes("DeadEvent"), "Message should name the event");
  });

  it("does not emit FUNGI-EVENT-002 when the event is emitted somewhere", () => {
    const { events } = runPipeline(`
event OrderCreated

flow createOrder(request: Request) -> Result<Response, ApiError>
contract { effects { database.write } }
{
  emit OrderCreated
  return Ok(Response.ok({}))
}
`);
    assert.ok(!eventHasDiag(events, "FUNGI-EVENT-002"), "Unexpected FUNGI-EVENT-002");
  });

  it("FUNGI_EVENT_002 constant has expected code and name", () => {
    assert.equal(FUNGI_EVENT_002.code, "FUNGI-EVENT-002");
    assert.equal(FUNGI_EVENT_002.name, "EventNeverEmitted");
    assert.equal(FUNGI_EVENT_002.severity, "warning");
  });
});

// =============================================================================
// 8. Effect checker: FUNGI-EFFECT-001/002/003/004
// =============================================================================

describe("Effect checker — FUNGI-EFFECT-001 undeclared effect", () => {
  it("emits FUNGI-EFFECT-001 for a guarded flow using an undeclared effect", () => {
    const { effects } = runPipeline(`
guarded flow saveOrder(order: Order) -> Result<OrderId, OrderError>
contract { effects { database.read } }
{
  PatientsDB.insert(order)
  return Ok(order.id)
}
`);
    assert.ok(effectHasDiag(effects, "FUNGI-EFFECT-001"), "Expected FUNGI-EFFECT-001");
  });

  it("FUNGI-EFFECT-001 is error severity", () => {
    const { effects } = runPipeline(`
guarded flow saveOrder(order: Order) -> Result<OrderId, OrderError>
contract { effects { database.read } }
{
  PatientsDB.insert(order)
  return Ok(order.id)
}
`);
    const diag = effects.flatMap((r) => r.diagnostics).find((d) => d.code === "FUNGI-EFFECT-001");
    assert.ok(diag !== undefined);
    assert.equal(diag.severity, "error");
  });

  it("does not emit FUNGI-EFFECT-001 when effect is correctly declared", () => {
    const { effects } = runPipeline(`
guarded flow saveOrder(order: Order) -> Result<OrderId, OrderError>
contract { effects { database.write, database.read } }
{
  PatientsDB.insert(order)
  return Ok(order.id)
}
`);
    assert.ok(!effectHasDiag(effects, "FUNGI-EFFECT-001"), "Unexpected FUNGI-EFFECT-001");
  });
});

describe("Effect checker — FUNGI-EFFECT-007 overdeclared effect", () => {
  it("emits FUNGI-EFFECT-007 (warning) when a declared effect is not observed", () => {
    const { effects } = runPipeline(`
guarded flow getOrder(request: Request) -> Result<Order, OrderError>
contract { effects { database.read, network.outbound } }
{
  let order = OrdersDB.find(request.params.id)?
  return Ok(order)
}
`);
    assert.ok(effectHasDiag(effects, "FUNGI-EFFECT-007"), "Expected FUNGI-EFFECT-007 for overdeclared network.outbound");
  });

  it("FUNGI-EFFECT-007 is warning severity for overdeclared effect", () => {
    const { effects } = runPipeline(`
guarded flow getOrder(request: Request) -> Result<Order, OrderError>
contract { effects { database.read, network.outbound } }
{
  let order = OrdersDB.find(request.params.id)?
  return Ok(order)
}
`);
    const diag = effects.flatMap((r) => r.diagnostics).find((d) => d.code === "FUNGI-EFFECT-007");
    assert.ok(diag !== undefined);
    assert.equal(diag.severity, "warning");
  });
});

describe("Effect checker — FUNGI-EFFECT-003 pure flow with effects", () => {
  it("emits FUNGI-EFFECT-003 when pure flow declares effects", () => {
    const { effects } = runPipeline(`
pure flow badFlow(x: Int) -> Int
contract { effects { database.read } }
{
  return x
}
`);
    assert.ok(effectHasDiag(effects, "FUNGI-EFFECT-003"), "Expected FUNGI-EFFECT-003");
  });

  it("FUNGI-EFFECT-003 is error severity", () => {
    const { effects } = runPipeline(`
pure flow badFlow(x: Int) -> Int
contract { effects { database.write } }
{
  return x
}
`);
    const diag = effects.flatMap((r) => r.diagnostics).find((d) => d.code === "FUNGI-EFFECT-003");
    assert.ok(diag !== undefined);
    assert.equal(diag.severity, "error");
  });

  it("does not emit FUNGI-EFFECT-003 for a pure flow with no effects", () => {
    const { effects } = runPipeline(`
pure flow add(a: Int, b: Int) -> Int {
  return a + b
}
`);
    assert.ok(!effectHasDiag(effects, "FUNGI-EFFECT-003"), "Unexpected FUNGI-EFFECT-003");
  });
});

describe("Effect checker — FUNGI-EFFECT-004 / FUNGI-EFFECT-005 non-canonical / broad alias names", () => {
  it("emits FUNGI-EFFECT-005 for broad alias 'database' (use database.read or database.write)", () => {
    // 'database' is a broad alias — emits FUNGI-EFFECT-005 (warning), not FUNGI-EFFECT-004 (error)
    const { effects } = runPipeline(`
guarded flow getOrder(request: Request) -> Result<Order, OrderError>
contract { effects { database } }
{
  return Ok(order)
}
`);
    assert.ok(effectHasDiag(effects, "FUNGI-EFFECT-005"), "Expected FUNGI-EFFECT-005 for broad alias 'database'");
  });

  it("emits FUNGI-EFFECT-004 for a completely unknown effect name", () => {
    const { effects } = runPipeline(`
guarded flow doTheThing(request: Request) -> Result<Response, ApiError>
contract { effects { magic.spell } }
{
  return Ok(Response.ok({}))
}
`);
    assert.ok(effectHasDiag(effects, "FUNGI-EFFECT-004"), "Expected FUNGI-EFFECT-004 for unknown effect");
  });

  it("does not emit FUNGI-EFFECT-004 for canonical effect names", () => {
    const { effects } = runPipeline(`
guarded flow getOrder(request: Request) -> Result<Order, OrderError>
contract { effects { database.read, audit.write } }
{
  return Ok(order)
}
`);
    assert.ok(!effectHasDiag(effects, "FUNGI-EFFECT-004"), "Unexpected FUNGI-EFFECT-004 for canonical names");
  });
});

// =============================================================================
// 9. Governance verifier: GOV-001/002/004/010
// =============================================================================

describe("Governance verifier — GOV-001 intent behaviour mismatch", () => {
  it("emits FUNGI-GOV-001 warning when intent says local but flow declares network.outbound", () => {
    const { gov } = runPipeline(`
secure flow runModel(request: Request) -> Result<Response, AiError>
contract { effects { ai.inference, network.outbound } }
intent "Run inference locally without remote calls." {
  return Ok(Response.ok({}))
}
`);
    assert.ok(govHasDiag(gov, "FUNGI-GOV-001"), "Expected FUNGI-GOV-001 for local intent + network.outbound");
  });
});

describe("Governance verifier — GOV-002 missing audit for governed sink", () => {
  it("emits FUNGI-GOV-002 when database.write is declared but audit.write is missing", () => {
    const { gov } = runPipeline(`
guarded flow saveOrder(order: Order) -> Result<OrderId, OrderError>
contract { effects { database.write } }
{
  return Ok(order.id)
}
`);
    assert.ok(govHasDiag(gov, "FUNGI-GOV-002"), "Expected FUNGI-GOV-002");
  });

  it("does not emit FUNGI-GOV-002 when audit.write is co-declared", () => {
    const { gov } = runPipeline(`
guarded flow saveOrder(order: Order) -> Result<OrderId, OrderError>
contract { effects { database.write, audit.write } }
{
  return Ok(order.id)
}
`);
    assert.ok(!govHasDiag(gov, "FUNGI-GOV-002"), "Unexpected FUNGI-GOV-002 when audit.write declared");
  });
});

describe("Governance verifier — GOV-010 missing intent on secure flow", () => {
  it("emits FUNGI-GOV-010 info when secure flow has no intent in dev mode", () => {
    const { gov } = runPipeline(`
secure flow createOrder(request: Request) -> Result<Response, ApiError>
contract { effects { database.write, audit.write } }
{
  return Ok(Response.ok({}))
}
`, "dev");
    assert.ok(govHasDiag(gov, "FUNGI-GOV-010"), "Expected FUNGI-GOV-010 in dev mode");
  });

  it("emits FUNGI-GOV-010 as error in production mode", () => {
    const { gov } = runPipeline(`
secure flow createOrder(request: Request) -> Result<Response, ApiError>
contract { effects { database.write, audit.write } }
{
  return Ok(Response.ok({}))
}
`, "production");
    const diag = gov.diagnostics.find((d) => d.code === "FUNGI-GOV-010");
    assert.ok(diag !== undefined);
    assert.equal(diag.severity, "error");
  });

  it("does not emit FUNGI-GOV-010 when secure flow has intent", () => {
    const { gov } = runPipeline(`
secure flow createPatient(request: Request) -> Result<Response, ApiError>
contract { effects { database.write, audit.write } }
intent "Create a patient record." {
  return Ok(Response.ok({}))
}
`);
    assert.ok(!govHasDiag(gov, "FUNGI-GOV-010"), "Unexpected FUNGI-GOV-010 when intent is present");
  });
});

// =============================================================================
// 10. Full getPatient flow with complete contract and correct governance
// =============================================================================

describe("Full getPatient flow — complete contract and correct governance", () => {
  const GET_PATIENT = `
event PatientProfileRead

secure flow getPatient(readonly request: Request) -> GetPatientResult
contract {
  types {
    type GetPatientResult = Result<Response, ApiError>
  }
  intent {
    "Return a patient profile to an authorised clinical actor."
  }
  request {
    accepts PatientReadRequest
    params {
      patientId: unsafe String
    }
  }
  response {
    returns PatientProfileResponse
    exposes { patientId name dob }
    denies { nhsNumber email }
  }
  context {
    require actor
    require trace_id
  }
  effects {
    database.read
    audit.write
  }
  timeouts {
    deadline 5 seconds
  }
  privacy {
    contains PII
    deny protected Email to response
    require redaction before audit.write
  }
  errors {
    returns { ApiError.NotFound ApiError.Unauthorised ApiError.Internal }
    map PatientNotFound to ApiError.NotFound
    expose { ApiError.NotFound ApiError.Unauthorised }
    redact { ApiError.Internal }
  }
  rules {
    require actor before database.read
  }
  observability {
    trace flow
    measure latency
    deny protected values in logs
  }
  events {
    emits PatientProfileRead
  }
  audit {
    require runtime report
  }
}
contract { effects { database.read, audit.write } }
intent "Return a patient profile to an authorised clinical actor." {
  let actor = context.actor
  let trace = context.trace_id
  let patient = PatientsDB.find(request.params.id)?
  AuditLog.write(event: "getPatient", actor: actor)
  emit PatientProfileRead
  return Ok(Response.ok({ patientId: patient.id, name: patient.name, dob: patient.dob }))
}
`;

  it("parses without errors", () => {
    const { parsed } = runPipeline(GET_PATIENT);
    assert.ok(noParseErrors(parsed), "Expected no parse errors");
  });

  it("has correct flow name and qualifier", () => {
    const { parsed } = runPipeline(GET_PATIENT);
    assert.equal(parsed.flows[0]?.name, "getPatient");
    assert.equal(parsed.flows[0]?.qualifier, "secure");
  });

  it("declares database.read and audit.write", () => {
    const { parsed } = runPipeline(GET_PATIENT);
    const flow = parsed.flows[0];
    assert.ok(flow?.declaredEffects.includes("database.read"));
    assert.ok(flow?.declaredEffects.includes("audit.write"));
  });

  it("no FUNGI-GOV-010 — intent is declared", () => {
    const { gov } = runPipeline(GET_PATIENT);
    assert.ok(!govHasDiag(gov, "FUNGI-GOV-010"), "Unexpected FUNGI-GOV-010");
  });

  it("no FUNGI-GOV-003 — denied fields are not in the response body", () => {
    const { gov } = runPipeline(GET_PATIENT);
    assert.ok(!govHasDiag(gov, "FUNGI-GOV-003"), "Unexpected FUNGI-GOV-003");
  });

  it("no FUNGI-CONTEXT-001 — actor and trace_id are accessed", () => {
    const { gov } = runPipeline(GET_PATIENT);
    assert.ok(!govHasDiag(gov, "FUNGI-CONTEXT-001"), "Unexpected FUNGI-CONTEXT-001");
  });

  it("no FUNGI-GOV-002 — audit.write is declared", () => {
    const { gov } = runPipeline(GET_PATIENT);
    assert.ok(!govHasDiag(gov, "FUNGI-GOV-002"), "Unexpected FUNGI-GOV-002");
  });

  it("no FUNGI-EVENT-001 — event is declared globally", () => {
    const { events } = runPipeline(GET_PATIENT);
    assert.ok(!eventHasDiag(events, "FUNGI-EVENT-001"), "Unexpected FUNGI-EVENT-001");
  });

  it("no FUNGI-EVENT-002 — event is emitted in the flow body", () => {
    const { events } = runPipeline(GET_PATIENT);
    assert.ok(!eventHasDiag(events, "FUNGI-EVENT-002"), "Unexpected FUNGI-EVENT-002");
  });

  it("records audit_required proof obligation", () => {
    const { gov } = runPipeline(GET_PATIENT);
    assert.ok(
      gov.proofObligations.some((o) => o.startsWith("audit_required:")),
      "Expected audit_required",
    );
  });

  it("records intent_declared proof obligation", () => {
    const { gov } = runPipeline(GET_PATIENT);
    assert.ok(
      gov.proofObligations.some((o) => o.startsWith("intent_declared:")),
      "Expected intent_declared",
    );
  });
});

// =============================================================================
// 11. Healthcare flow with privacy.contains PII
// =============================================================================

describe("Healthcare flow — privacy.contains PII", () => {
  const HEALTHCARE_FLOW = `
secure flow createPatient(readonly request: Request) -> CreatePatientResult
contract {
  types {
    type CreatePatientResult = Result<Response, ApiError>
  }
  intent {
    "Register a new patient record in the healthcare system."
  }
  privacy {
    contains PII
    retention 7 years
    deny protected Email to response
    require redaction before audit.write
  }
  response {
    denies { nhsNumber email dateOfBirth }
    returns PatientCreatedResponse
    exposes { patientId }
  }
  audit {
    require runtime report
  }
}
contract { effects { database.write, audit.write } }
intent "Register a new patient record in the healthcare system." {
  let patient = PatientsDB.insert(request.body)?
  AuditLog.write(event: "createPatient")
  return Ok(Response.created({ patientId: patient.id }))
}
`;

  it("parses without errors", () => {
    const { parsed } = runPipeline(HEALTHCARE_FLOW);
    assert.ok(noParseErrors(parsed), "Expected no parse errors on healthcare flow");
  });

  it("does not emit FUNGI-GOV-003 — denied PII fields not returned", () => {
    const { gov } = runPipeline(HEALTHCARE_FLOW);
    assert.ok(!govHasDiag(gov, "FUNGI-GOV-003"), "Unexpected FUNGI-GOV-003 for healthcare flow");
  });

  it("no FUNGI-GOV-002 — audit.write declared for the database.write sink", () => {
    const { gov } = runPipeline(HEALTHCARE_FLOW);
    assert.ok(!govHasDiag(gov, "FUNGI-GOV-002"), "Unexpected FUNGI-GOV-002 for healthcare flow");
  });

  it("emits FUNGI-GOV-003 when a PII field leaks into the response body", () => {
    const { gov } = runPipeline(`
secure flow createPatient(readonly request: Request) -> CreatePatientResult
contract {
  privacy {
    contains PII
  }
  response {
    denies { nhsNumber }
  }
}
contract { effects { database.write, audit.write } }
intent "Register patient." {
  return Ok(Response.created({ nhsNumber: patient.nhsNumber }))
}
`);
    assert.ok(govHasDiag(gov, "FUNGI-GOV-003"), "Expected FUNGI-GOV-003 for leaking nhsNumber");
  });
});

// =============================================================================
// 12. AI flow with intent + model + effects { ai.inference }
// =============================================================================

describe("AI flow — intent + model + ai.inference effect", () => {
  const AI_FLOW = `
secure flow diagnoseSymptoms(readonly request: Request) -> DiagnoseResult
contract {
  types {
    type DiagnoseResult = Result<Response, ApiError>
  }
  intent {
    "Run symptom triage using the clinical inference model."
  }
  model {
    uses ClinicalTriageModel
    reads SymptomCatalogue
    constraints {
      approved_models_only
    }
  }
  effects {
    ai.inference
  }
  privacy {
    contains PII
    retain 30 days
  }
}
contract { effects { ai.inference } }
intent "Run symptom triage using the clinical inference model." {
  let result = ClinicalModel.infer(request.body)?
  return Ok(Response.ok({ diagnosis: result.label, confidence: result.score }))
}
`;

  it("parses without errors", () => {
    const { parsed } = runPipeline(AI_FLOW);
    assert.ok(noParseErrors(parsed), "Expected no parse errors on AI flow");
  });

  it("correctly identifies ai.inference as a declared effect", () => {
    const { parsed } = runPipeline(AI_FLOW);
    const flow = parsed.flows[0];
    assert.ok(flow?.declaredEffects.includes("ai.inference"), "Expected ai.inference declared");
  });

  it("does not emit FUNGI-GOV-010 — intent is declared", () => {
    const { gov } = runPipeline(AI_FLOW);
    assert.ok(!govHasDiag(gov, "FUNGI-GOV-010"), "Unexpected FUNGI-GOV-010 on AI flow");
  });

  it("emits FUNGI-HINT-COMPUTE-001 — ai.inference without compute target preference", () => {
    const { gov } = runPipeline(AI_FLOW);
    // Planning hint, not a governance error
    assert.ok(govHasDiag(gov, "FUNGI-HINT-COMPUTE-001"), "Expected planning hint FUNGI-HINT-COMPUTE-001");
  });

  it("does not emit FUNGI-EFFECT-004 — ai.inference is a canonical effect name", () => {
    const { effects } = runPipeline(AI_FLOW);
    assert.ok(!effectHasDiag(effects, "FUNGI-EFFECT-004"), "Unexpected FUNGI-EFFECT-004");
  });
});

// =============================================================================
// 13. Contract set reuse pattern
// =============================================================================

describe("Contract set reuse pattern", () => {
  const CONTRACT_SET_SOURCE = `
contract set HealthcarePolicy {
  rules {
    require actor before database.read
    deny direct nhsNumber in response
  }
  events {
    emits PatientDataAccessed
  }
  audit {
    require audit.write
  }
}

event PatientDataAccessed

secure flow getPatient(readonly request: Request) -> GetPatientResult
contract {
  types {
    type GetPatientResult = Result<Response, ApiError>
  }
  intent {
    "Retrieve patient data under HealthcarePolicy governance."
  }
  use HealthcarePolicy
}
contract { effects { database.read, audit.write } }
intent "Retrieve patient data under HealthcarePolicy governance." {
  let patient = PatientsDB.find(request.params.id)?
  emit PatientDataAccessed
  return Ok(Response.ok({ patientId: patient.id }))
}
`;

  it("parses without errors", () => {
    const { parsed } = runPipeline(CONTRACT_SET_SOURCE);
    assert.ok(noParseErrors(parsed), "Expected no parse errors with contract set reuse");
  });

  it("does not emit FUNGI-GOV-011 — contract set is declared", () => {
    const { gov } = runPipeline(CONTRACT_SET_SOURCE);
    assert.ok(!govHasDiag(gov, "FUNGI-GOV-011"), "Unexpected FUNGI-GOV-011");
  });

  it("does not emit FUNGI-GOV-012 — flow declares audit.write as required by the set", () => {
    const { gov } = runPipeline(CONTRACT_SET_SOURCE);
    assert.ok(!govHasDiag(gov, "FUNGI-GOV-012"), "Unexpected FUNGI-GOV-012");
  });

  it("does not emit FUNGI-EVENT-001 — event is declared globally", () => {
    const { events } = runPipeline(CONTRACT_SET_SOURCE);
    assert.ok(!eventHasDiag(events, "FUNGI-EVENT-001"), "Unexpected FUNGI-EVENT-001");
  });

  it("emits FUNGI-GOV-012 for a second flow that uses the set without audit.write", () => {
    const src = `
contract set AuditRequired {
  audit {
    require audit.write
  }
}

flow addNote(request: Request) -> Result<Response, ApiError>
contract {
  effects { database.write }
  use AuditRequired
}
{
  return Ok(Response.ok({}))
}
`;
    const { gov } = runPipeline(src);
    assert.ok(govHasDiag(gov, "FUNGI-GOV-012"), "Expected FUNGI-GOV-012 for non-audit flow using audited set");
  });

  it("multiple flows can reuse the same contract set", () => {
    const src = `
contract set BasePolicy {
  rules {}
  audit {}
}

flow flowA(request: Request) -> Result<Response, ApiError>
contract {
  effects { database.read }
  use BasePolicy
}
{
  return Ok(Response.ok({}))
}

flow flowB(request: Request) -> Result<Response, ApiError>
contract {
  effects { database.read }
  use BasePolicy
}
{
  return Ok(Response.ok({}))
}
`;
    const { gov } = runPipeline(src);
    assert.ok(!govHasDiag(gov, "FUNGI-GOV-011"), "Unexpected FUNGI-GOV-011 for reused set");
    assert.ok(!govHasDiag(gov, "FUNGI-GOV-012"), "Unexpected FUNGI-GOV-012 for empty audit block");
  });
});

// =============================================================================
// 14. Named result types: CreatePatientResult = Result<Response, ApiError>
// =============================================================================

describe("Named result types in contract.types", () => {
  it("parses CreatePatientResult = Result<Response, ApiError> without error", () => {
    const { parsed } = runPipeline(`
secure flow createPatient(readonly request: Request) -> CreatePatientResult
contract {
  types {
    type CreatePatientResult = Result<Response, ApiError>
  }
  intent {
    "Create a patient record."
  }
}
contract { effects { database.write, audit.write } }
intent "Create a patient record." {
  return Ok(Response.created("123"))
}
`);
    assert.ok(noParseErrors(parsed), "Expected no parse errors with named result type");
  });

  it("parses GetPatientResult = Result<Response, ApiError> in a complete flow", () => {
    const { parsed } = runPipeline(`
secure flow getPatient(readonly request: Request) -> GetPatientResult
contract {
  types {
    type GetPatientResult = Result<Response, ApiError>
  }
  intent {
    "Return patient profile."
  }
  request {
    accepts PatientReadRequest
    params { patientId: unsafe String }
  }
  response {
    returns PatientProfileResponse
    exposes { patientId name }
    denies { email nhsNumber }
  }
  context {
    require actor
    require trace_id
  }
  effects {
    database.read
    audit.write
  }
}
contract { effects { database.read, audit.write } }
intent "Return patient profile." {
  let actor = context.actor
  let trace = context.trace_id
  return Ok(Response.ok({ patientId: patient.id, name: patient.name }))
}
`);
    assert.ok(noParseErrors(parsed), "Expected no parse errors on complete named result type flow");
  });

  it("named result type does not affect effect checking", () => {
    const { effects } = runPipeline(`
secure flow createPatient(readonly request: Request) -> CreatePatientResult
contract {
  types {
    type CreatePatientResult = Result<Response, ApiError>
  }
}
contract { effects { database.write, audit.write } }
intent "Create patient." {
  PatientsDB.insert(request.body)?
  AuditLog.write(event: "create")
  return Ok(Response.created("ok"))
}
`);
    // database.write should be observed from PatientsDB.insert
    // audit.write from AuditLog.write
    assert.ok(!effectHasDiag(effects, "FUNGI-EFFECT-001"), "Unexpected FUNGI-EFFECT-001 with named result type");
  });

  it("named result type flow with all 16 sections parses cleanly", () => {
    const { parsed } = runPipeline(`
event PatientCreated

secure flow createPatient(readonly request: Request) -> CreatePatientResult
contract {
  types {
    type CreatePatientResult = Result<Response, ApiError>
  }
  intent {
    "Register a new patient in the health system."
  }
  request {
    accepts PatientCreateRequest
    params { patientId: unsafe String }
  }
  response {
    returns PatientCreatedResponse
    exposes { patientId }
    denies { nhsNumber email dateOfBirth }
  }
  context {
    require actor
    require trace_id
  }
  model {
    uses PatientRecord
  }
  effects {
    database.write
    audit.write
  }
  timeouts {
    deadline 10 seconds
  }
  retries {
    database.write { attempts 1 }
  }
  limits {
    max request size 2 MB
  }
  privacy {
    contains PII
    retention 7 years
    deny protected Email to response
  }
  errors {
    returns { ApiError.Conflict ApiError.Internal }
    map DuplicatePatient to ApiError.Conflict
    expose { ApiError.Conflict }
    redact { ApiError.Internal }
  }
  rules {
    require actor before database.write
  }
  observability {
    trace flow
    measure latency
    deny protected values in logs
  }
  events {
    emits PatientCreated
  }
  audit {
    require runtime report
    require signed attestation
  }
}
contract { effects { database.write, audit.write } }
intent "Register a new patient in the health system." {
  let actor = context.actor
  let trace = context.trace_id
  let patient = PatientsDB.insert(request.body)?
  AuditLog.write(event: "createPatient", actor: actor)
  emit PatientCreated
  return Ok(Response.created({ patientId: patient.id }))
}
`);
    const errors = parsed.diagnostics.filter((d) => d.severity === "error");
    assert.equal(errors.length, 0,
      `Parse errors: ${errors.map((d) => d.code + ": " + d.message).join(", ")}`);
  });
});
