# Galerina — No Ordinary Variables Outside Flows

## Status

```
Proposed — Security Rule / Compiler Rule Candidate
Phase 9B implementation target
Diagnostic codes: SPORE-SYNTAX-006, SPORE-SYNTAX-007, SPORE-SYNTAX-008
```

## TL;DR
- `let`, `mut`, `unsafe let`, calculations, and logic are NOT allowed at the top level
- Top level is for declarations: types, records, enums, events, routes, flows, constants
- All executable behaviour must have a flow as its owner
- `const MAX_RETRIES: Int = 3` is allowed at top level (compile-time immutable)

---

## Core Rule

Do not allow ordinary bindings or executable logic outside a flow.

```galerina
// WRONG
let foo: Int = 123                         // SPORE-SYNTAX-006
mut retryCount: Int = 0                    // SPORE-SYNTAX-007
unsafe let rawEmail: String = request.body.email  // SPORE-SYNTAX-008
emit PatientCreated                        // SPORE-SYNTAX-009

// RIGHT — all of the above belong inside flows
```

---

## Why This Rule Exists

Top-level variables create **hidden state** outside the governed execution model. Hidden state makes it impossible to prove:

```text
Where the data came from
Who can modify it
Whether it is safe or protected
Which flow owns it
Which intent applies
Whether it appears in the audit proof
Which effects it requires
```

Galerina's philosophy:
```text
Flows own execution.
Contracts describe flow meaning.
Global scope owns shared declarations.
```

---

## What IS Allowed at Top Level

### Shared domain types
```galerina
type Email = Brand<String, "EmailAddress">
type PatientId = Brand<String, "PatientId">
```

### Shared record declarations
```galerina
record Patient {
  id: PatientId
  email: protected Email
}
```

### Shared enum declarations
```galerina
enum Environment { Development, Staging, Production }
```

### Event declarations
```galerina
event PatientCreated
event PatientCreationFailed
```

### Route declarations
```galerina
route POST "/patients" {
  request CreatePatientRequest
  response PatientResponse
  flow createPatient
}
```

### Flow declarations
```galerina
secure flow createPatient(readonly request: Request) -> Result<Response, ApiError>
effects [database.write, audit.write] { ... }
```

### Compile-time constants
```galerina
const MAX_RETRIES: Int = 3
const API_VERSION: String = "v1"
```

---

## What is NOT Allowed at Top Level

### Ordinary `let`
```galerina
// WRONG — SPORE-SYNTAX-006
let count: Int = 0

// RIGHT — belongs inside a flow
pure flow countItems(items: Array<Item>) -> Int {
  let count: Int = items.length()
  return count
}
```

### Mutable `mut`
```galerina
// WRONG — SPORE-SYNTAX-007
mut retryCount: Int = 0

// RIGHT — mutable state must be flow-local
guarded flow fetchWithRetry(url: String) -> Result<Response, NetworkError>
effects [network.outbound] {
  mut retryCount: Int = 0
  ...
}
```

### `unsafe let`
```galerina
// WRONG — SPORE-SYNTAX-008
unsafe let rawEmail: String = request.body.email

// RIGHT — boundary data must be owned by a secure flow
secure flow createUser(readonly request: Request) -> Result<Response, ApiError> {
  unsafe let rawEmail: String = request.body.email
  ...
}
```

### Calculations
```galerina
// WRONG — top-level calculation
let vat: Money<GBP> = price * Decimal("0.20")

// RIGHT — calculation belongs inside a flow
pure flow calculateVat(price: Money<GBP>) -> Money<GBP> {
  return price * Decimal("0.20")
}
```

### Event emissions
```galerina
// WRONG — SPORE-SYNTAX-009
emit PatientCreated

// RIGHT — emit belongs inside a flow
secure flow createPatient(...) { ...  emit PatientCreated  ... }
```

---

## Flow-Local Types

Types only used by one flow belong in that flow's contract, not at top level:

```galerina
// WRONG — flow-specific alias leaked globally
type EmailListResult = Result<Array<protected Email>, ValidationError>

// RIGHT — flow-local alias belongs in contract
pure flow collectEmails(inputs: Array<String>) -> EmailListResult
contract {
  types {
    type EmailListResult = Result<Array<protected Email>, ValidationError>
  }
  intent { "Validate email strings into protected Email values." }
}
{ ... }
```

**Rule:** Shared domain type = global. Flow-specific alias = `contract.types`. Ordinary value = inside flow.

---

## Configuration

Config declarations may be global if declarative:
```galerina
// Allowed — declarative config schema
config AppConfig {
  environment: Environment
  auditEnabled: Bool
}
```

Config reading must happen inside a flow:
```galerina
// WRONG — executable config outside a flow
let auditEnabled: Bool = env.get("AUDIT_ENABLED") == "true"

// RIGHT — config reading is effectful, belongs in a flow
guarded flow loadConfig() -> Result<AppConfig, ConfigError>
effects [secret.read] {
  unsafe let rawFlag: String = env.get("AUDIT_ENABLED")?
  let auditEnabled: Bool = validate.bool(rawFlag)?
  return Ok(AppConfig { auditEnabled: auditEnabled })
}
```

---

## Why This Supports the Pipeline

**Intent:** Intent belongs to a flow. If all execution is inside flows, every action connects to a declared intent.

**Governed Execution Plan:** GIR can only be complete if all executable logic is inside flows. Hidden top-level state creates gaps in the governance contract.

**Coordinated Compute:** Target selection (CPU/GPU/NPU) requires knowing which flow owns the work and which effects are declared.

**Runtime Report:** Runtime can only report what happened if execution is flow-owned.

**Audit Proof:** Traceability requires values to live inside governed flows with declared effects and intent.

---

## Diagnostic Codes

| Code | Name | Trigger |
|---|---|---|
| `SPORE-SYNTAX-006` | `LET_AT_TOP_LEVEL` | `let name: T = value` outside a flow |
| `SPORE-SYNTAX-007` | `MUT_AT_TOP_LEVEL` | `mut name: T = value` outside a flow |
| `SPORE-SYNTAX-008` | `UNSAFE_LET_AT_TOP_LEVEL` | `unsafe let name: T = value` outside a flow |
| `SPORE-SYNTAX-009` | `EMIT_AT_TOP_LEVEL` | `emit EventName` outside a flow |

---

## Complete Correct Example

```galerina
// Shared global domain type
type Email = Brand<String, "EmailAddress">

// Shared global event declaration
event UserCreated

// Shared route
route POST "/users" { request CreateUserRequest response UserResponse flow createUser }

secure flow createUser(readonly request: Request) -> CreateUserResult

contract {
  types {
    type CreateUserResult = Result<UserId, ValidationError>
  }
  intent { "Create a user from validated request data." }
  events { emits UserCreated }
  effects {
    database.write
    audit.write
  }
}
{
  unsafe let rawEmail: String = request.body.email
  let email: protected Email = validate.email(rawEmail)?
  let user = UsersDB.insert({ email: email })?
  emit UserCreated
  AuditLog.write({ event: "UserCreated", userId: user.id, email: redact(email) })
  return Response.created(user.id)
}
```

---

## Final Principle

```text
Global scope declares facts.
Flows perform actions.
Contracts describe meaning.
Runtime reports execution.
Audit proof verifies behaviour.
```

This rule is not syntax style — it is what makes the governance model work.

---

## See Also

- `docs/Knowledge-Bases/galerina-flow-contracts.md` — contract blocks
- `docs/Knowledge-Bases/value-state-annotations.md` — unsafe/protected/redacted
- `docs/Knowledge-Bases/galerina-architecture-layers.md` — five-layer model
