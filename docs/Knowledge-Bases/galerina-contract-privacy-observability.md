# Galerina Contract — privacy {} and observability {} Sections

## Status

```
Phase 10B — Specification
Parser: Phase 10B
Enforcement: SPORE-PRIVACY-001, SPORE-OBSERVE-001 (Phase 10C+)
```

> **Code namespace note (2026-06-16).** `SPORE-PRIVACY-001` is reserved for the *declarative*
> `deny protected X to Y` clause of this `privacy {}` block (still Phase 10C+ — parsed, not yet
> enforced). It is a DIFFERENT mechanism from `SPORE-PRIVACY-002`, the *dataflow* rule that blocks a
> cleartext semantic embedding from reaching a network sink (ENFORCED now, in `value-state-checker.ts` —
> see [[galerina-privacy-embedding-egress]]). Keep the two distinct: 001 = contract-clause matcher,
> 002 = embedding-taint egress.

## TL;DR

- `privacy {}` declares PII rules, data retention, and exposure policy — it is governance, not implementation
- `observability {}` describes what execution metadata may be observed — it explicitly excludes protected data
- The core rule: observability sees execution, not data

---

## Section: privacy {}

### Purpose

Declare data privacy rules at the contract level. This is governance — it describes requirements and constraints on how personal or sensitive data may flow through and out of this flow. It is not implementation logic; the flow body does not change based on `privacy` declarations. The governance verifier and data governance tooling read these declarations to verify compliance.

### Basic PII declaration

```galerina
privacy {
  contains PII

  retention 7 years

  deny protected Email to response
  deny protected NhsNumber to response

  require redaction before audit.write
}
```

### Sub-clauses

| Declaration | Meaning |
|---|---|
| `contains PII` | Flags this flow as processing personal data — triggers GDPR and data governance tooling |
| `retention N years/days` | Data retention requirement for records produced by this flow |
| `deny protected X to Y` | Prevents a protected value from reaching a named sink |
| `require redaction before X` | Protected values must pass through `redact()` before the named operation |
| `allow protected X to Y reason "..."` | Explicit permission with a stated reason — requires justification |

### Patient data example

```galerina
privacy {
  contains PII
  retention 7 years
  deny protected Email to logs
  deny protected NhsNumber to response
  require redaction before audit.write
}
```

### Financial data example

```galerina
privacy {
  contains PII
  retention 10 years
  deny protected CardNumber to response
  deny protected CardNumber to logs
  require redaction before audit.write
}
```

### Explicit allow with reason

When a protected value must reach a sink that would otherwise be denied, an explicit `allow` with a stated reason is required:

```galerina
privacy {
  contains PII
  deny protected Email to response
  allow protected Email to internal.audit reason "audit trail requires email for accountability"
}
```

### Rules

- `allow protected X everywhere` is not valid — broad grants violate governance
- `contains PII` must be declared if any `protected` values are handled by this flow
- `deny` declarations are enforced by the governance verifier at compile time (Phase 10C+)
- Every `allow` must carry a `reason` string

---

## Section: observability {}

### Purpose

Declare what execution metadata may be observed for this flow. This covers metrics, distributed tracing, structured logs, and diagnostics. Observability declarations explicitly exclude protected and secret data — the contract makes that exclusion visible and verifiable, rather than relying on convention.

### Core rule

> Observability sees execution. Observability does not see data.

### Full observability block

```galerina
observability {
  trace flow

  measure latency
  measure memory
  measure retry_count

  count database.read

  log event names

  require trace_id

  deny protected values in logs
  deny request body logging
  deny secret values in traces
}
```

### Sub-clauses

| Declaration | Meaning |
|---|---|
| `trace flow` | Enable distributed tracing for this flow |
| `measure X` | Collect a named metric (latency, memory, retry_count, error_rate, etc.) |
| `count X` | Increment a counter for a named operation (database.read, network.outbound, etc.) |
| `log event names` | Record emitted event names in structured logs — not event data or payload |
| `require trace_id` | A trace_id must be present for observability output to be emitted |
| `deny protected values in logs` | Explicitly exclude protected fields from log output |
| `deny request body logging` | Prevents capture of the full request body |
| `deny secret values in traces` | Prevents SecureString and secret values from appearing in traces |

### Allowed observability output

The following is a valid, safe observability record for a `getPatient` flow run:

```json
{
  "event": "PatientProfileRead",
  "traceId": "abc123",
  "latencyMs": 42,
  "databaseReads": 1,
  "retryCount": 0
}
```

### What observability must never capture

```
email addresses
NHS numbers
request body content
secret values
protected field values
SecureString contents
stack trace internals
```

### Rules

- `log request body` is not valid — may expose protected values
- `observe everything` is not a valid pattern — governance requires explicit declaration
- `deny protected values in logs` is recommended for all flows that declare `privacy { contains PII }`
- `measure` and `count` targets must name execution events, not data fields

---

## Relationship Between privacy {} and observability {}

`privacy {}` and `observability {}` address different layers of the same concern. They should both be declared for defence in depth:

```galerina
privacy {
  contains PII
  deny protected Email to logs
  require redaction before audit.write
}

observability {
  trace flow
  measure latency
  log event names
  deny protected values in logs
  deny request body logging
}
```

`privacy` is the intent — it declares what the flow is not allowed to do with personal data. `observability` is the operational enforcement — it declares what the observability layer is not allowed to capture. Both declarations are needed: `privacy` without `observability` leaves a gap at the instrumentation layer; `observability` without `privacy` leaves a gap at the governance layer.

---

## Full Example: getPatient with privacy and observability

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

  privacy {
    contains PII
    retention 7 years
    deny protected Email to response
    deny protected NhsNumber to response
    deny protected Email to logs
    require redaction before audit.write
  }

  observability {
    trace flow
    measure latency
    measure retry_count
    count database.read
    log event names
    require trace_id
    deny protected values in logs
    deny request body logging
    deny secret values in traces
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

  emit PatientProfileRead

  return Ok(Response.ok({
    patientId: patient.id,
    name: patient.name
  }))
}
```

---

## Rules at a Glance

- `contains PII` must be declared if any `protected` values are handled
- `allow protected X everywhere` is not valid
- `observe everything` is not a valid pattern
- Observability sees execution metrics, not data values
- `deny protected values in logs` is recommended for all PII flows
- `log request body` is never valid
- Every `allow protected X to Y` must carry a `reason` string
- `require trace_id` should accompany `trace flow`

---

## See Also

- `docs/Knowledge-Bases/galerina-contract-full-model.md` — full contract section reference
- `docs/Knowledge-Bases/value-state-annotations.md` — unsafe/safe/protected value states
- `docs/Knowledge-Bases/galerina-signed-attestation.md` — signed attestation artifacts
- `docs/Knowledge-Bases/galerina-contract-errors.md` — errors {} section
- `docs/Knowledge-Bases/galerina-security-taint-types.md` — taint tracking for protected values
