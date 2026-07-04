# Galerina 5-Minute Primer for AI Code Generators

This document is written for AI code generators, copilots, and language model agents
that need to produce correct Galerina code. Read this before generating any Galerina.

---

## 1. What Galerina IS

Galerina is a **governance-first** language. Every piece of code you write declares
what it is allowed to do, what it reads and writes, and what it promises to callers.
The compiler enforces these declarations.

Three properties define Galerina:

**Governance-first.** Access control and effect boundaries are declared in the source,
not inferred at runtime. The `protected` and `redacted` qualifiers attach to values,
not to call sites.

**Explicit effects.** Every flow declares which system capabilities it may touch in a
`contract.effects` block. Flows that touch more than they declare are rejected.

**Auditable.** Every mutation of governed state emits a structured event. The audit
trail is not optional; it is part of the type system.

---

## 2. The Three Kinds of Flow

Galerina has exactly three flow kinds. Choose based on what the flow touches.

### pure flow
No side effects. Reads no external state. Returns a value computed only from arguments.

```galerina
pure flow calculateAge(readonly request: AgeRequest) -> AgeResult {
    let age = currentYear - request.birthYear
    return AgeResult { age: age }
}
```

### guarded flow
May read external state (e.g. database reads) but writes nothing sensitive. Must still
declare effects.

```galerina
guarded flow getPatientSummary(readonly request: PatientSummaryRequest) -> PatientSummaryResult {
    let record = database.read(request.patientId)
    return PatientSummaryResult { name: record.name, dob: record.dob }
}
```

### secure flow
Writes state, processes protected/redacted data, or performs privileged operations.
This is the most common kind for API endpoints. Requires full contract declaration.

```galerina
secure flow createPatient(readonly request: CreatePatientRequest) -> CreatePatientResult {
    let validated = validate(request)
    database.write(validated)
    AuditLog.write(AuditEvent { action: "createPatient", actorId: request.actorId })
    return CreatePatientResult { patientId: validated.id }
}
```

---

## 3. The Four Binding States

Galerina has four binding forms. Each expresses a distinct governance intent.

### unsafe let
Binds raw, untrusted input. Must be validated before it touches any guarded resource.
The compiler tracks this and will reject flows that allow unsafe values to escape without
going through a validation gate.

```galerina
unsafe let rawInput = request.body
```

### let
Binds a validated or internally-computed value. Immutable after binding. Safe to pass
to guarded operations.

```galerina
let validated = validate(rawInput)
```

### mut
Binds a mutable value. Use only when in-place update is semantically necessary.
Prefer `let` wherever possible.

```galerina
mut counter = 0
counter = counter + 1
```

### readonly
Applied to a parameter or binding to signal that the value must not be mutated by the
receiving flow. All `request` parameters must be `readonly`.

```galerina
pure flow echo(readonly request: EchoRequest) -> EchoResult { ... }
```

---

## 4. The Two Governance Qualifiers

### protected
Marks a value as access-controlled. The runtime enforces read access rules. A protected
value must never appear directly in a response without going through `response.denies`.
The compiler emits a diagnostic if a protected value escapes ungated.

```galerina
protected let ssn = record.ssn
```

### redacted
Marks a value that must never appear in logs, audit events, or serialized responses.
Use `redact(value)` to produce a safe audit-safe token before writing to AuditLog.

```galerina
redacted let secret = secret.read("api-key")
AuditLog.write(AuditEvent { secret: redact(secret) })
```

---

## 5. The Canonical Pattern

Every `secure flow` that processes a request follows this pattern, in this order:

```galerina
secure flow createPatient(readonly request: CreatePatientRequest) -> CreatePatientResult {

    // 1. Bind raw input as unsafe
    unsafe let rawRequest = request

    // 2. Validate — promotes unsafe to let
    let validated = validate(rawRequest)

    // 3. Apply protected qualifier to sensitive fields
    protected let patientDob = validated.dob

    // 4. Apply redacted qualifier to secrets
    redacted let token = validated.authToken

    // 5. Write to database (requires effects { database.write })
    database.write(validated)

    // 6. Write audit event — use redact() on any redacted value
    AuditLog.write(AuditEvent {
        action:  "createPatient",
        actorId: request.actorId,
        token:   redact(token)
    })

    // 7. Build and return named result type
    return CreatePatientResult { patientId: validated.id }
}
```

Never skip the audit step in a `secure flow`. Never put a `protected` or `redacted`
value directly into the return value without a gate.

---

## 6. Contract Basics

Every `secure flow` (and most `guarded flow`s) must have a `contract` block. The
sections must appear in canonical order.

```galerina
contract CreatePatientContract {

    // 1. version
    version: "1.0"

    // 2. description
    description: "Creates a new patient record"

    // 3. types
    types {
        CreatePatientRequest {
            actorId:   String
            name:      String
            dob:       Date
            authToken: String
        }

        CreatePatientResult {
            patientId: String
        }
    }

    // 4. intent
    intent {
        creates: ["Patient"]
    }

    // 5. effects
    effects {
        database.write
        audit.write
    }

    // 6. events
    events {
        PatientCreated {
            patientId: String
            actorId:   String
        }
    }

    // 7. audit
    audit {
        level:  "full"
        retain: "7y"
    }
}
```

The full 16-section canonical order is documented in `CANONICAL_SYNTAX.md`.

For a flow that only reads:

```galerina
contract GetPatientContract {
    version: "1.0"
    description: "Reads a patient record"
    types { ... }
    intent { reads: ["Patient"] }
    effects { database.read }
    audit { level: "read" }
}
```

---

## 7. The Golden Rule

Two rules apply without exception:

**Always use `request` not `req`.**
The parameter name for the primary input to any flow is always `request`. The compiler
does not enforce this spelling but diagnostics, linter rules, and review tools all expect
it. Using `req` is the single most common AI-generation mistake.

```galerina
// CORRECT
secure flow deleteRecord(readonly request: DeleteRecordRequest) -> DeleteRecordResult

// WRONG — do not generate this
secure flow deleteRecord(readonly req: DeleteRecordRequest) -> Result<Response, ApiError>
```

**Always use named result types.**
Return types must be named aliases declared in `contract.types`. Never use
`Result<Response, ApiError>` directly in a flow signature.

```galerina
// CORRECT
secure flow createOrder(readonly request: CreateOrderRequest) -> CreateOrderResult

// WRONG — do not generate this
secure flow createOrder(readonly request: Request) -> Result<Response, ApiError>
```

These two rules apply to every flow, without exception.

---

## Quick Reference

| Concept | Syntax |
|---|---|
| Pure flow | `pure flow name(readonly request: T) -> R` |
| Guarded flow | `guarded flow name(readonly request: T) -> R` |
| Secure flow | `secure flow name(readonly request: T) -> R` |
| Raw input | `unsafe let x = request.body` |
| Validated value | `let x = validate(raw)` |
| Mutable value | `mut x = 0` |
| Immutable param | `readonly request: T` |
| Access-controlled | `protected let x = record.field` |
| Must not log | `redacted let x = secret.read(k)` |
| Safe audit token | `redact(x)` |
| Effects block | `effects { database.write\naudit.write }` |
| Named result | `-> CreatePatientResult` (declared in contract.types) |

---

---

## The 12 Application Patterns

These patterns cover the common shapes of business logic in Galerina. Each pattern maps to specific keywords, effects, and governance constructs.

| # | Pattern | When to use |
|---|---|---|
| 01 | CRUD Resource | Users, orders, patients |
| 02 | Workflow / Process | Expense claims, approvals |
| 03 | Commands & Queries | Read/write separation |
| 04 | Domain Events | Distributed systems |
| 05 | Routes & APIs | HTTP endpoints |
| 06 | State Machines | Orders, loans, patients |
| 07 | Validation | Email, postcode, NHS numbers |
| 08 | Secrets | API keys, tokens |
| 09 | Background Jobs | Email, PDF, sync |
| 10 | Microservices | Service separation |
| 11 | Audit Trails | GDPR, healthcare, finance |
| 12 | Governed Identities | Entity IDs |

See `docs/patterns/applications/` for governed patterns covering CRUD, workflows, events, routes, state machines, validation, secrets, jobs, services, audit, and identities.

---

*See also: `CANONICAL_SYNTAX.md`, `DO_NOT_USE_YET.md`, `COMMON_FIXES.md`*
