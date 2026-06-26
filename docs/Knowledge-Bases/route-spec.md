# Route Specification

## Definition

`route` declares an external entry point and delegates all logic to a named
flow. It is the boundary shape for HTTP, webhook, event, messaging, or similar
external callers.

```galerina
route POST "/patients" {
  request CreatePatientRequest
  response Response
  flow createPatient
}
```

Formal syntax:

```text
route METHOD "path" {
  request RequestType
  response ResponseType
  flow flowName
}
```

## Role

A route:

- exposes a flow to external callers
- declares request and response types
- names exactly one flow to handle the request
- contains no business logic
- does not validate, redact, audit, or perform effects directly

The called flow is responsible for governance, validation, effects, audit, and
returning the declared response type.

## Hierarchy

```text
route -> flow -> fn
```

- `route`: external entry point and transport contract.
- `flow`: governed execution logic.
- `fn`: local helper inside a flow only.

Example route for the Level 1 secure flow:

```galerina
route POST "/patients" {
  request Request
  response Result<Response, ApiError>
  flow createPatient
}
```

The flow it delegates to is the Level 1 `003-secure-flow` pattern:

```galerina
secure flow createPatient(readonly request: Request) -> CreatePatientResult
contract {
  types {
    type CreatePatientResult = Result<Response, ApiError>
  }
  effects {
    database.write
    audit.write
  }
}
{
  unsafe let rawEmail: String =
    request.body.email

  let email: protected Email =
    validate.email(rawEmail)?

  let saved =
    PatientsDB.insert({ email: email })?

  AuditLog.write({
    event: "PatientCreated",
    patientId: saved.id,
    email: redact(email)
  })

  return Ok(Response.created(saved.id))
}
```

## Route Rules

- A route body may only contain `request`, `response`, and `flow` entries.
- A route must not contain `let`, `mut`, `fn`, `match`, `if`, database calls,
  network calls, audit calls, or validation logic.
- A route must reference an existing flow.
- The referenced flow return type must be compatible with the route response
  type.
- Effects and authority are checked on the referenced flow, not inside the
  route declaration.

## Compiler Status

```text
Spec status:    route is v1 specified.
Parser status:  implemented — route parsing live (Phases 34–51).
Checker status: implemented — route-to-flow name/type validation live (Phases 34–51).
Runtime status: implemented — route lowering to HTTP/webhook/event adapters live (Phases 34–51).
```

