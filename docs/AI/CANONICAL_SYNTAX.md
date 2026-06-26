# Galerina Canonical Syntax Reference

This document is the definitive reference for current canonical Galerina syntax.
Use it when generating code. Do not invent syntax not listed here.

---

## 1. Flow Signatures

### Secure Flow

```galerina
// CORRECT
secure flow createPatient(readonly request: CreatePatientRequest) -> CreatePatientResult

// AVOID — wrong parameter name, non-named return type
secure flow createPatient(readonly req: Request) -> Result<Response, ApiError>
```

Rules:
- The primary input parameter is always named `request`, never `req`.
- The return type is always a named alias declared in `contract.types`.
- The parameter must carry the `readonly` qualifier.
- The request type must be a named type, not an anonymous struct.

### Guarded Flow

```galerina
// CORRECT
guarded flow getPatient(readonly request: GetPatientRequest) -> GetPatientResult

// AVOID — generic return type
guarded flow getPatient(readonly request: GetPatientRequest) -> Option<Patient>
```

### Pure Flow

```galerina
// CORRECT
pure flow formatName(readonly request: FormatNameRequest) -> FormatNameResult

// AVOID — using req, inline struct return
pure flow formatName(readonly req: { first: String, last: String }) -> String
```

---

## 2. Contract Structure — Canonical 16-Section Order

A contract block must declare its sections in this order. Omit sections that do not
apply, but never reorder the sections that are present.

```galerina
contract ExampleContract {

    // Section 1: version
    version: "1.0"

    // Section 2: description
    description: "Human-readable intent of this contract"

    // Section 3: types
    types {
        ExampleRequest {
            actorId:  String
            targetId: String
        }

        ExampleResult {
            status: String
        }
    }

    // Section 4: intent
    intent {
        creates: ["Entity"]
        reads:   ["Entity"]
        updates: ["Entity"]
        deletes: ["Entity"]
    }

    // Section 5: effects
    effects {
        database.read
        database.write
        audit.write
        network.egress
        cache.read
        cache.write
    }

    // Section 6: events
    events {
        EntityCreated {
            entityId: String
            actorId:  String
            ts:       Timestamp
        }
    }

    // Section 7: audit
    audit {
        level:  "full"
        retain: "7y"
    }

    // Section 8: permissions
    permissions {
        requires: ["role:admin", "scope:write"]
    }

    // Section 9: invariants
    invariants {
        "actorId must not be empty"
        "targetId must reference an existing entity"
    }

    // Section 10: preconditions
    preconditions {
        "caller is authenticated"
        "rate limit not exceeded"
    }

    // Section 11: postconditions
    postconditions {
        "entity exists in database"
        "audit event written"
    }

    // Section 12: errors
    errors {
        NotFound:      "Entity not found"
        Unauthorized:  "Caller lacks required permission"
        Invalid:       "Request failed validation"
    }

    // Section 13: timeouts
    timeouts {
        request: 5000ms
        database: 2000ms
    }

    // Section 14: retries
    retries {
        max:     3
        backoff: "exponential"
    }

    // Section 15: limits
    limits {
        rateLimit:    100
        window:       "1m"
        burstAllowed: 10
    }

    // Section 16: tags
    tags {
        domain:  "patient"
        team:    "clinical"
        sla:     "tier-1"
    }
}
```

---

## 3. Binding Patterns

### unsafe let — raw untrusted input

Binds a value that has not been validated. Must not reach any guarded resource
without going through a validation gate. The compiler tracks propagation.

```galerina
// CORRECT — label raw input immediately
unsafe let rawBody = request.body

// AVOID — treating request fields as validated without labeling
let body = request.body   // misleading; use unsafe let for truly untrusted data
```

### let — validated or internally computed

Immutable. Safe to pass to guarded resources. Promoted from `unsafe let` via
a validation call.

```galerina
// CORRECT
let validated = validate(rawBody)
let userId    = generateId()
```

### mut — mutable binding

Use only when in-place update is semantically required. Not a default choice.

```galerina
// CORRECT — counter that must accumulate
mut retryCount = 0
retryCount = retryCount + 1

// AVOID — using mut where let suffices
mut name = request.name   // name never changes; use let
```

### readonly — immutable parameter qualifier

Applied to flow parameters. All `request` parameters must be `readonly`.
Do not omit this qualifier.

```galerina
// CORRECT
secure flow deleteOrder(readonly request: DeleteOrderRequest) -> DeleteOrderResult

// AVOID — missing readonly on request
secure flow deleteOrder(request: DeleteOrderRequest) -> DeleteOrderResult
```

---

## 4. Effects Declaration

Effects are declared inside the `contract` block in an `effects {}` section.
Each effect is a bare capability name on its own line.

```galerina
// CORRECT
contract CreateOrderContract {
    effects {
        database.write
        audit.write
    }
}

// AVOID — old bracket syntax
contract CreateOrderContract {
    with effects [database.write, audit.write]
}

// AVOID — effects outside contract block
with effects [database.write]
secure flow createOrder(readonly request: CreateOrderRequest) -> CreateOrderResult { ... }
```

Available effect names:

| Effect | Meaning |
|---|---|
| `database.read` | May query the database |
| `database.write` | May mutate the database |
| `audit.write` | May write to the audit log |
| `network.egress` | May make outbound network calls |
| `cache.read` | May read from cache |
| `cache.write` | May write to cache |
| `vault.read` | May read secrets from the vault |
| `queue.publish` | May publish to a message queue |
| `queue.subscribe` | May consume from a message queue |

---

## 5. Named Result Types

Every flow return type must be a named alias declared in `contract.types`.
Never use generic wrapper types directly in a flow signature.

```galerina
// CORRECT — named alias in contract
contract CreatePatientContract {
    types {
        CreatePatientRequest { ... }
        CreatePatientResult  { patientId: String }
    }
}

secure flow createPatient(readonly request: CreatePatientRequest) -> CreatePatientResult

// AVOID — generic wrapper in signature
secure flow createPatient(readonly request: Request) -> Result<Response, ApiError>

// AVOID — inline struct in signature
secure flow createPatient(readonly request: CreatePatientRequest) -> { patientId: String }

// AVOID — unnamed Result with type parameters
secure flow createPatient(readonly request: CreatePatientRequest) -> Result<CreatePatientResult, Error>
```

Naming convention: result type name = flow name (PascalCase) + `Result`.
Request type name = flow name (PascalCase) + `Request`.

---

## 6. Protected and Redacted Values

### protected

```galerina
// CORRECT — declare sensitivity, gate response
protected let ssn = record.ssn

if response.allows(caller, ssn) {
    return PatientResult { ssn: ssn }
} else {
    return PatientResult { ssn: "[REDACTED]" }
}

// AVOID — protected value directly in return
protected let ssn = record.ssn
return PatientResult { ssn: ssn }   // missing gate
```

### redacted

```galerina
// CORRECT — redact before audit
redacted let apiKey = vault.read("service-key")
AuditLog.write(AuditEvent { key: redact(apiKey) })

// AVOID — logging redacted value directly
redacted let apiKey = vault.read("service-key")
AuditLog.write(AuditEvent { key: apiKey })   // runtime error
```

---

## 7. Event Emission

Events must be declared in `contract.events` before they can be emitted.
Global events shared across contracts must be declared in the module-level
event registry.

```galerina
// CORRECT — declared in contract, emitted in flow
contract OrderContract {
    events {
        OrderPlaced {
            orderId: String
            actorId: String
        }
    }
}

secure flow placeOrder(readonly request: PlaceOrderRequest) -> PlaceOrderResult {
    ...
    emit OrderPlaced { orderId: order.id, actorId: request.actorId }
    ...
}

// AVOID — emitting undeclared event
emit OrderPlaced { orderId: order.id }   // OrderPlaced not in contract.events
```

---

## 8. Validate Gate Pattern

The compiler requires that `unsafe let` bindings are validated before reaching
any `database.write` or `audit.write` effect.

```galerina
// CORRECT
unsafe let rawRequest = request
let validated = validate(rawRequest)
database.write(validated)

// AVOID — unsafe value reaches database directly
unsafe let rawRequest = request
database.write(rawRequest)   // diagnostic: SPORE-GOV-003 unsafe escape
```

---

*See also: `GALERINA_5_MINUTE_PRIMER.md`, `DO_NOT_USE_YET.md`, `COMMON_FIXES.md`*
