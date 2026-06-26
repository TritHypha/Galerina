// =============================================================================
// Governance Conformance Tests
//
// Proves that flows obey their contracts: effect declarations match actual
// calls, PII taint propagates correctly, response denials are enforced,
// context requirements are checked, contract sets are validated, and events
// are declared before they are emitted.
// =============================================================================

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  parseProgram,
  resolveSymbols,
  checkTypes,
  checkValueStates,
  checkEffects,
  effectResultsToDiagnostics,
  verifyGovernance,
  checkEvents,
} from "../dist/index.js";

// ---------------------------------------------------------------------------
// Pipeline helper: runs all checkers and collects every diagnostic
// ---------------------------------------------------------------------------

function pipeline(source) {
  const parsed = parseProgram(source, "test.spore");
  const symbolResult = resolveSymbols(parsed.ast);
  const typeResult = checkTypes(parsed.ast);
  const vsResult = checkValueStates(parsed.ast);
  const effectResults = checkEffects(parsed.flows, parsed.ast);
  const govResult = verifyGovernance(parsed.ast, parsed.flows, effectResults, "production");
  const eventResult = checkEvents(parsed.ast);
  return [
    ...parsed.diagnostics,
    ...symbolResult.diagnostics,
    ...typeResult.diagnostics,
    ...vsResult.diagnostics,
    ...effectResultsToDiagnostics(effectResults),
    ...govResult.diagnostics,
    ...eventResult.diagnostics,
  ];
}

function hasDiag(diags, code) {
  return diags.some((d) => d.code === code);
}

// =============================================================================
// Suite 1: Capability proof — declared effects match actual calls
// =============================================================================

describe("Governance conformance — Suite 1: Capability proof", () => {
  it("declared database.read only but body calls AuditLog.write emits SPORE-EFFECT-001 or SPORE-EFFECT-002", () => {
    // AuditLog.write is an audit.write sink; only database.read is declared.
    // The effect checker detects the undeclared audit.write call.
    const diags = pipeline(`
guarded flow readPatient(request: Request) -> Result<Response, Error>
contract { effects { database.read } }
{
  AuditLog.write("accessed")
  return Ok(Response.ok({}))
}
`);
    const hasEffectError = hasDiag(diags, "SPORE-EFFECT-001") || hasDiag(diags, "SPORE-EFFECT-002");
    assert.ok(hasEffectError, `Expected an effect violation, got: ${diags.map((d) => d.code).join(", ")}`);
  });

  it("pure flow that calls a database function emits SPORE-EFFECT-003", () => {
    // OrdersDB.find is a recognised database-read sink in the effect checker.
    const diags = pipeline(`
pure flow findOrder(id: Int) -> String {
  let row = OrdersDB.find(id)
  return "found"
}
`);
    assert.ok(hasDiag(diags, "SPORE-EFFECT-003"), `Expected SPORE-EFFECT-003, got: ${diags.map((d) => d.code).join(", ")}`);
  });

  it("pure flow with only pure math produces no effect errors", () => {
    const diags = pipeline(`
pure flow add(a: Int, b: Int) -> Int {
  return a + b
}
`);
    const effectErrors = diags.filter((d) => d.code.startsWith("SPORE-EFFECT-"));
    assert.equal(effectErrors.length, 0, `Unexpected effect errors: ${effectErrors.map((d) => d.code).join(", ")}`);
  });

  it("declared network.outbound with http.get produces no EFFECT-001", () => {
    const diags = pipeline(`
guarded flow fetchRate(currency: String) -> Result<String, Error>
contract { effects { network.outbound } }
{
  unsafe let rawResponse = http.get("https://rates.example.com/" + currency)?
  return Ok(rawResponse)
}
`);
    assert.ok(!hasDiag(diags, "SPORE-EFFECT-001"), `Unexpected SPORE-EFFECT-001 for correctly declared network.outbound`);
  });
});

// =============================================================================
// Suite 2: PII / value-state transitions
// =============================================================================

describe("Governance conformance — Suite 2: PII value-state transitions", () => {
  it("unsafe let + validate.email() produces no value-state errors", () => {
    const diags = pipeline(`
secure flow processEmail(raw: String) -> Result<String, Error>
contract { effects { database.read } }
{
  unsafe let rawEmail: String = raw
  safe mut rawEmail = validate.email(rawEmail)?
  return Ok(rawEmail)
}
`);
    const vsErrors = diags.filter((d) => d.code.startsWith("SPORE-VALUESTATE-"));
    assert.equal(vsErrors.length, 0, `Unexpected value-state errors: ${vsErrors.map((d) => d.code).join(", ")}`);
  });

  it("unsafe let directly to AuditLog.write emits SPORE-VALUESTATE-003", () => {
    const diags = pipeline(`
secure flow processEmail(raw: String) -> Result<String, Error>
contract { effects { database.read audit.write } }
{
  unsafe let rawEmail: String = raw
  AuditLog.write(rawEmail)
  return Ok(rawEmail)
}
`);
    assert.ok(hasDiag(diags, "SPORE-VALUESTATE-003"), `Expected SPORE-VALUESTATE-003, got: ${diags.map((d) => d.code).join(", ")}`);
  });

  it("two-hop taint: rawEmail.trim() at governed sink emits SPORE-VALUESTATE-005", () => {
    const diags = pipeline(`
secure flow processEmail(raw: String) -> Result<String, Error>
contract { effects { database.read audit.write } }
{
  unsafe let rawEmail: String = raw
  let trimmed = rawEmail.trim()
  AuditLog.write(trimmed)
  return Ok(trimmed)
}
`);
    assert.ok(hasDiag(diags, "SPORE-VALUESTATE-005"), `Expected SPORE-VALUESTATE-005, got: ${diags.map((d) => d.code).join(", ")}`);
  });

  it("protected email through redact() produces no value-state error at audit sink", () => {
    const diags = pipeline(`
secure flow processEmail(raw: String) -> Result<String, Error>
contract { effects { database.read audit.write } }
{
  unsafe let rawEmail: String = raw
  safe mut rawEmail = validate.email(rawEmail)?
  AuditLog.write(redact(rawEmail))
  return Ok(rawEmail)
}
`);
    const vsErrors = diags.filter((d) => d.code.startsWith("SPORE-VALUESTATE-"));
    assert.equal(vsErrors.length, 0, `Unexpected value-state errors after redact(): ${vsErrors.map((d) => d.code).join(", ")}`);
  });
});

// =============================================================================
// Suite 3: Response exposure (response.denies)
// =============================================================================

describe("Governance conformance — Suite 3: Response exposure", () => {
  it("response { denies { email } } + body returns email field emits SPORE-GOV-003", () => {
    const diags = pipeline(`
flow getPatient(readonly request: Request) -> GetPatientResult
contract {
  types {
    type GetPatientResult = Result<Response, ApiError>
  }
  response {
    returns PatientResponse
    denies { email }
  }
  effects { database.read }
}
{
  let patient = PatientsDB.find(request.params.id)?
  return Ok(Response.ok({ patientId: patient.id, email: patient.email }))
}
`);
    assert.ok(hasDiag(diags, "SPORE-GOV-003"), `Expected SPORE-GOV-003, got: ${diags.map((d) => d.code).join(", ")}`);
  });

  it("response { denies { email } } + body returns only { patientId } produces no SPORE-GOV-003", () => {
    const diags = pipeline(`
flow getPatient(readonly request: Request) -> GetPatientResult
contract {
  types {
    type GetPatientResult = Result<Response, ApiError>
  }
  response {
    returns PatientResponse
    exposes { patientId name }
    denies { email nhsNumber }
  }
  effects { database.read }
}
{
  let patient = PatientsDB.find(request.params.id)?
  return Ok(Response.ok({ patientId: patient.id, name: patient.name }))
}
`);
    assert.ok(!hasDiag(diags, "SPORE-GOV-003"), "Unexpected SPORE-GOV-003 when no denied fields are returned");
  });
});

// =============================================================================
// Suite 4: Context requirement enforcement
// =============================================================================

describe("Governance conformance — Suite 4: Context requirement enforcement", () => {
  it("context { require actor } + body reads context.actor produces no SPORE-CONTEXT-001", () => {
    const diags = pipeline(`
flow getRecord(readonly request: Request) -> GetRecordResult
contract {
  types {
    type GetRecordResult = Result<Response, ApiError>
  }
  context {
    require actor
  }
  effects { database.read }
}
{
  let actor = context.actor
  let record = RecordsDB.findForActor(actor, request.params.id)?
  return Ok(Response.ok({ id: record.id }))
}
`);
    assert.ok(!hasDiag(diags, "SPORE-CONTEXT-001"), "Unexpected SPORE-CONTEXT-001 when context.actor is accessed");
  });

  it("context { require actor } + body never reads actor emits SPORE-CONTEXT-001", () => {
    const diags = pipeline(`
flow getRecord(readonly request: Request) -> GetRecordResult
contract {
  types {
    type GetRecordResult = Result<Response, ApiError>
  }
  context {
    require actor
  }
  effects { database.read }
}
{
  let record = RecordsDB.find(request.params.id)?
  return Ok(Response.ok({ id: record.id }))
}
`);
    assert.ok(hasDiag(diags, "SPORE-CONTEXT-001"), `Expected SPORE-CONTEXT-001, got: ${diags.map((d) => d.code).join(", ")}`);
  });
});

// =============================================================================
// Suite 5: Contract set validation
// =============================================================================

describe("Governance conformance — Suite 5: Contract set validation", () => {
  it("use DeclaredSet where set exists produces no SPORE-GOV-011", () => {
    const diags = pipeline(`
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
    assert.ok(!hasDiag(diags, "SPORE-GOV-011"), "Unexpected SPORE-GOV-011 when contract set is declared");
  });

  it("use UndeclaredSet where set does not exist emits SPORE-GOV-011", () => {
    const diags = pipeline(`
flow createOrder(request: Request) -> Result<Response, ApiError>
contract {
  effects { database.write }
  use UndeclaredSet
}
{
  return Ok(Response.ok({}))
}
`);
    assert.ok(hasDiag(diags, "SPORE-GOV-011"), `Expected SPORE-GOV-011, got: ${diags.map((d) => d.code).join(", ")}`);
  });
});

// =============================================================================
// Suite 6: Event checking
// =============================================================================

describe("Governance conformance — Suite 6: Event checking", () => {
  it("emit PatientCreated with global event PatientCreated declared produces no SPORE-EVENT-001", () => {
    const diags = pipeline(`
event PatientCreated

flow createPatient(request: Request) -> Result<Response, ApiError>
contract { effects { database.write } }
{
  emit PatientCreated
  return Ok(Response.ok({}))
}
`);
    assert.ok(!hasDiag(diags, "SPORE-EVENT-001"), "Unexpected SPORE-EVENT-001 when event is declared");
  });

  it("emit UndeclaredEvent with no global event declaration emits SPORE-EVENT-001", () => {
    const diags = pipeline(`
flow createPatient(request: Request) -> Result<Response, ApiError>
contract { effects { database.write } }
{
  emit UndeclaredEvent
  return Ok(Response.ok({}))
}
`);
    assert.ok(hasDiag(diags, "SPORE-EVENT-001"), `Expected SPORE-EVENT-001, got: ${diags.map((d) => d.code).join(", ")}`);
  });
});
