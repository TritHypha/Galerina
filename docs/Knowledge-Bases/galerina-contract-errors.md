# Galerina Contract — errors {} Section

## Status

```
Phase 10B — Specification
Parser: Phase 10B
Enforcement: SPORE-GOV-ERROR-001..005 (Phase 10B+)
```

## TL;DR

- `errors {}` is the "how failure is governed" section — it turns `Result<T,E>` into a governed boundary
- Prevents stack traces and internal errors leaking through the API surface
- Maps domain errors to safe API errors and declares which are safe to expose vs must be redacted

---

## The Problem Without errors {}

Without an `errors` section, a flow can accidentally return an `ApiError.Internal` containing a stack trace, database connection string, or internal implementation detail. There is no contract-level declaration of which errors are safe to expose, which must be stripped, and which security events must be recorded.

The body of the flow becomes the only place where error handling policy lives — scattered, implicit, and invisible to the governance verifier.

---

## The errors {} Shape

```galerina
errors {
  returns {
    ApiError.BadRequest
    ApiError.NotFound
    ApiError.Unauthorised
    ApiError.Internal
  }

  map ValidationError to ApiError.BadRequest
  map PatientNotFound to ApiError.NotFound
  map AuthError to ApiError.Unauthorised

  expose {
    ApiError.BadRequest
    ApiError.NotFound
    ApiError.Unauthorised
  }

  redact {
    ApiError.Internal
  }

  audit {
    ApiError.Internal
    ApiError.Unauthorised
  }
}
```

---

## Sub-Declarations

### returns {}

The complete set of error types this flow may return. These must match the declared `Err` branch of the result type. The governance verifier checks that no error type reaches the boundary unless it is listed here.

```galerina
errors {
  returns {
    ApiError.BadRequest
    ApiError.NotFound
    ApiError.Internal
  }
}
```

### map X to Y

Domain error to API error mapping. Prevents internal error types from escaping the API boundary. Each `map` declaration is a translation rule: when the flow body produces a domain error of type `X`, it is rewritten to API error type `Y` before the boundary is crossed.

```galerina
map ValidationError to ApiError.BadRequest
map PatientNotFound to ApiError.NotFound
map AuthError to ApiError.Unauthorised
```

### expose {}

Which errors are safe to return to the caller unchanged. These should not contain stack traces or internal details. Types listed in `expose` are returned as-is, with their message and detail fields intact.

### redact {}

Which errors must have their message and detail stripped before returning to the caller. An `ApiError.Internal` might carry `"Connection refused: postgres://internal:5432/prod"` — that must never reach the caller. Redaction replaces the detail with a safe, opaque message.

```galerina
redact {
  ApiError.Internal
}
```

### audit {}

Which errors must be recorded in the audit trail. Security-relevant events — auth failures, internal errors — should always be audited so that failures are traceable without exposing them to callers.

```galerina
audit {
  ApiError.Internal
  ApiError.Unauthorised
}
```

---

## Connection to Result<T,E>

The result type on the flow signature declares that the flow can fail. The `errors` contract declares how failure is governed:

```
Result type says:   this flow can fail.
errors contract says: how failure is governed.
```

Together they form a complete failure boundary — the signature describes the shape, the contract describes the policy.

---

## Complete Flow Example

```galerina
secure flow getPatient(readonly request: Request)
-> GetPatientResult

contract {

  types {
    type GetPatientResult = Result<PatientProfileResponse, ApiError>
  }

  intent {
    "Retrieve a patient profile by ID for an authenticated clinical actor."
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
    returns {
      ApiError.BadRequest
      ApiError.NotFound
      ApiError.Unauthorised
      ApiError.Internal
    }

    map ValidationError to ApiError.BadRequest
    map PatientNotFound to ApiError.NotFound
    map AuthError to ApiError.Unauthorised

    expose {
      ApiError.BadRequest
      ApiError.NotFound
      ApiError.Unauthorised
    }

    redact {
      ApiError.Internal
    }

    audit {
      ApiError.Internal
      ApiError.Unauthorised
    }
  }

  audit {
    require proof
    require audit.write
  }

}
{
  unsafe let rawId: String = request.params.patientId
  safe mut rawId = validate.uuid(rawId)?

  let patient = PatientsDB.find(rawId)?

  AuditLog.write({
    event: "PatientProfileRead",
    patientId: rawId,
    actor: context.actor
  })

  return Ok(Response.ok({
    patientId: patient.id,
    name: patient.name
  }))
}
```

---

## What errors {} Prevents

| Risk | Declaration that prevents it |
|---|---|
| Stack trace in response | `redact { ApiError.Internal }` |
| Internal hostname leak | `redact { ApiError.Internal }` |
| Auth reason exposure | `redact { ApiError.Unauthorised }` if sensitive |
| Unaudited security event | `audit { ApiError.Unauthorised }` |
| Undeclared error type returned | `SPORE-GOV-ERROR-001` (Phase 10B+) |
| Domain error escaping boundary | `map DomainError to ApiError.X` |

---

## Rules at a Glance

- `returns {}` must list all possible `Err` branch types
- `expose {}` types must be a subset of `returns {}`
- `redact {}` types must be a subset of `returns {}`
- `expose` and `redact` are mutually exclusive for the same type
- Internal implementation errors belong in `redact {}`
- Security events (auth failures) belong in `audit {}`
- Every domain error that can leave the flow must have a `map X to Y` declaration

---

## See Also

- `docs/Knowledge-Bases/galerina-contract-full-model.md` — full contract section reference
- `docs/Knowledge-Bases/value-state-annotations.md` — unsafe/safe/protected value states
- `docs/Knowledge-Bases/galerina-governance-verifier-spec.md` — compiler governance pass
- `docs/Knowledge-Bases/galerina-contract-operational-constraints.md` — timeouts, retries, limits
