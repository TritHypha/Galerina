import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseProgram } from "../dist/index.js";

function parse(source) {
  return parseProgram(source, "test.spore");
}

function hasNoDiags(result) {
  return result.diagnostics.filter((d) => d.severity === "error").length === 0;
}

// ── 6 new contract section parsers ───────────────────────────────────────────

describe("Contract sections — errors {}", () => {
  it("parses errors block without errors", () => {
    const result = parse(`
secure flow test(readonly request: Request) -> TestResult
contract {
  types {
    type TestResult = Result<Response, ApiError>
  }
  errors {
    returns {
      ApiError.BadRequest
      ApiError.NotFound
      ApiError.Internal
    }
    map ValidationError to ApiError.BadRequest
    expose {
      ApiError.BadRequest
      ApiError.NotFound
    }
    redact {
      ApiError.Internal
    }
    audit {
      ApiError.Internal
    }
  }
}
contract { effects { database.read } }
{
  return Ok(Response.ok("{}"))
}
`);
    assert.ok(hasNoDiags(result), `Unexpected errors: ${result.diagnostics.map((d) => d.code + ": " + d.message).join(", ")}`);
  });
});

describe("Contract sections — timeouts {}", () => {
  it("parses timeouts block without errors", () => {
    const result = parse(`
secure flow test(readonly request: Request) -> TestResult
contract {
  types {
    type TestResult = Result<Response, ApiError>
  }
  timeouts {
    deadline 5 seconds
    network {
      timeout 2 seconds
    }
    cancel on deadline
  }
}
contract { effects { network.outbound } }
{
  return Ok(Response.ok("{}"))
}
`);
    assert.ok(hasNoDiags(result), `Unexpected errors: ${result.diagnostics.map((d) => d.code + ": " + d.message).join(", ")}`);
  });
});

describe("Contract sections — retries {}", () => {
  it("parses retries block without errors", () => {
    const result = parse(`
secure flow test(readonly request: Request) -> TestResult
contract {
  types {
    type TestResult = Result<Response, ApiError>
  }
  retries {
    network.outbound {
      attempts 3
      strategy exponential_backoff
    }
    database.read {
      attempts 2
    }
  }
}
contract { effects { network.outbound database.read } }
{
  return Ok(Response.ok("{}"))
}
`);
    assert.ok(hasNoDiags(result), `Unexpected errors: ${result.diagnostics.map((d) => d.code + ": " + d.message).join(", ")}`);
  });
});

describe("Contract sections — limits {}", () => {
  it("parses limits block without errors", () => {
    const result = parse(`
secure flow test(readonly request: Request) -> TestResult
contract {
  types {
    type TestResult = Result<Response, ApiError>
  }
  limits {
    max request size 5 MB
    max batch size 100
    max memory 256 MB
  }
}
contract { effects { database.read } }
{
  return Ok(Response.ok("{}"))
}
`);
    assert.ok(hasNoDiags(result), `Unexpected errors: ${result.diagnostics.map((d) => d.code + ": " + d.message).join(", ")}`);
  });
});

describe("Contract sections — privacy {}", () => {
  it("parses privacy block without errors", () => {
    const result = parse(`
secure flow test(readonly request: Request) -> TestResult
contract {
  types {
    type TestResult = Result<Response, ApiError>
  }
  privacy {
    contains PII
    retention 7 years
    deny protected Email to response
    require redaction before audit.write
  }
}
contract { effects { database.read audit.write } }
{
  return Ok(Response.ok("{}"))
}
`);
    assert.ok(hasNoDiags(result), `Unexpected errors: ${result.diagnostics.map((d) => d.code + ": " + d.message).join(", ")}`);
  });
});

describe("Contract sections — observability {}", () => {
  it("parses observability block without errors", () => {
    const result = parse(`
secure flow test(readonly request: Request) -> TestResult
contract {
  types {
    type TestResult = Result<Response, ApiError>
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
}
contract { effects { database.read audit.write } }
{
  return Ok(Response.ok("{}"))
}
`);
    assert.ok(hasNoDiags(result), `Unexpected errors: ${result.diagnostics.map((d) => d.code + ": " + d.message).join(", ")}`);
  });
});

describe("Contract sections — all 6 new sections together", () => {
  it("parses all 6 new contract sections in one contract", () => {
    const result = parse(`
secure flow test(readonly request: Request) -> TestResult
contract {
  types {
    type TestResult = Result<Response, ApiError>
  }
  intent {
    "Test all 6 new contract sections together."
  }
  errors {
    returns { ApiError.BadRequest ApiError.Internal }
    map ValidationError to ApiError.BadRequest
    expose { ApiError.BadRequest }
    redact { ApiError.Internal }
  }
  timeouts {
    deadline 10 seconds
  }
  retries {
    network.outbound { attempts 3 }
  }
  limits {
    max request size 1 MB
    max batch size 50
  }
  privacy {
    contains PII
    deny protected Email to logs
  }
  observability {
    trace flow
    measure latency
    deny protected values in logs
  }
}
contract { effects { database.read network.outbound audit.write } }
{
  return Ok(Response.ok("{}"))
}
`);
    assert.ok(hasNoDiags(result), `Unexpected errors: ${result.diagnostics.map((d) => d.code + ": " + d.message).join(", ")}`);
  });
});

describe("Contract sections — named result type", () => {
  it("flow using named result type in contract.types parses without error", () => {
    const result = parse(`
secure flow createPatient(readonly request: Request) -> CreatePatientResult
contract {
  types {
    type CreatePatientResult = Result<Response, ApiError>
  }
  intent {
    "Create a patient record."
  }
}
contract { effects { database.write audit.write } }
{
  return Ok(Response.created("123"))
}
`);
    assert.ok(hasNoDiags(result), `Unexpected errors: ${result.diagnostics.map((d) => d.code + ": " + d.message).join(", ")}`);
  });

  it("canonical getPatient with all sections parses without error", () => {
    const result = parse(`
secure flow getPatient(readonly request: Request) -> GetPatientResult
contract {
  types {
    type GetPatientResult = Result<Response, ApiError>
  }
  intent {
    "Return a patient profile to an authorised actor."
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
  errors {
    returns { ApiError.NotFound ApiError.Unauthorised ApiError.Internal }
    map PatientNotFound to ApiError.NotFound
    expose { ApiError.NotFound ApiError.Unauthorised }
    redact { ApiError.Internal }
  }
  timeouts {
    deadline 5 seconds
  }
  privacy {
    contains PII
    deny protected Email to response
    require redaction before audit.write
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
contract { effects { database.read audit.write } }
{
  return Ok(Response.ok("{}"))
}
`);
    assert.ok(hasNoDiags(result), `Unexpected errors: ${result.diagnostics.map((d) => d.code + ": " + d.message).join(", ")}`);
  });
});
