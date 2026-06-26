# Galerina Flow Contract — Full Reference Model

## Status

```
Phase 10A — Canonical specification
Sections: types/intent/events/rules/audit/economics/targets/examples implemented; request/response/model/context Phase 10A
Governance enforcement: Phase 10B+
```

## TL;DR

- A flow contract is the complete declaration of what a flow is allowed, expected, and required to do
- The body describes how it executes; the contract describes what it means
- Canonical section order must be followed by formatters and code generators

---

## Principle

The contract is the meaning layer of a flow. The body is the execution layer.

```
request  = allowed incoming shape and trust state
response = allowed outgoing shape and exposure policy
model    = domain / data model used by the flow
types    = flow-local type aliases
intent   = machine-readable purpose
context  = required execution context fields
effects  = declared side-effects (use contract { effects {} } — canonical form)
economics = cost/value/SLA constraints for governed execution
rules    = governance rules and requirements
events   = events this flow may emit
audit    = audit and integrity requirements
```

A reader should be able to understand what a flow is for, what it accepts,
what it returns, and what it is not allowed to do by reading the contract
alone — without reading the body.

---

## Canonical Section Order (17 sections)

Formatters and code generators must emit contract sections in this order.
All sections are optional. A section may be omitted if it has no declarations.

```galerina
contract {
  types   {}          // Flow-local type aliases (incl. named result type)
  intent  {}          // Why the flow exists

  request {}          // Incoming shape, trust state, params/body expectations
  response {}         // Outgoing shape and exposure policy (exposes/denies)

  context {}          // Required actor, trace_id, deadline, tenant, etc.
  model   {}          // Domain model or AI model dependency

  effects {}          // Declared external capabilities / side-effects
  economics {}        // Cost/value/SLA and route-budget constraints

  timeouts {}         // Deadlines, cancellation, per-operation timeouts
  retries  {}         // Retry policy for network/database/effectful calls
  limits   {}         // Request size, batch size, memory, prompt size

  privacy  {}         // PII rules, retention, exposure, redaction

  errors   {}         // Error mapping, exposure, redaction, audit

  rules    {}         // Enforceable governance/security constraints

  observability {}    // Metrics/traces/logging metadata (never data values)

  events {}           // Events the flow may emit
  audit  {}           // Required runtime report/proof/attestation
}
```

The formatter enforces this order. A contract with sections in a different
order is valid source but will be reordered by `galerina fmt`.

### Named Result Types

The preferred pattern is to declare the result type as a **top-level public `type`**
before the flow declaration. This makes it visible to routes, tests, and other flows
without importing contract internals.

```galerina
// Most preferred — top-level public result type (Phase 41 canonical form)
type CreateOrderResult = Result<Response, ApiError>

secure flow createOrder(readonly request: Request) : CreateOrderResult
contract {
  intent { "Create a new order from a validated customer request." }
  ...
}
{ ... }

// Also valid — flow-local alias in contract.types (preferred when type is private to one flow)
secure flow getPatient(readonly request: Request) : GetPatientResult
contract {
  types {
    type GetPatientResult = Result<PatientProfile, PatientError>
  }
  ...
}
{ ... }

// Also valid — direct in signature (fine for simple flows without full contracts)
pure flow simpleFlow(x: Int) : Result<String, ApiError>
{ ... }
```

The top-level `type` form is preferred for any flow whose result type may be
referenced by routes, tests, or other flows. The `contract.types {}` form is
preferred only when the type is genuinely private to a single flow. Both forms
allow the contract to reference the result type by name in `errors {}` and `response {}`.

### Inline Contract Style (Modern Preferred)

In Phase 41 the preferred style places the `contract {}` as the **first item inside
the flow body** `{}` rather than between the signature and the body:

```galerina
// Modern inline style (preferred for compact flows)
pure flow classify(score: Int) : String {
  contract {
    intent { "Map a numeric score to a risk tier label." }
  }
  match score {
    when score >= 90 => return "critical"
    when score >= 70 => return "high"
    when score >= 40 => return "medium"
    _               => return "low"
  }
}

// Traditional external style (still valid)
pure flow classify(score: Int) -> String
contract {
  intent { "Map a numeric score to a risk tier label." }
}
{
  match score {
    when score >= 90 => return "critical"
    when score >= 70 => return "high"
    when score >= 40 => return "medium"
    _               => return "low"
  }
}
```

Both placement styles are syntactically valid. The inline style is preferred for
flows where the contract is short and the body benefits from reading as a single unit.

---

## Section: types {}

Already documented in `galerina-flow-contracts.md`.

Flow-local type aliases that only exist inside this flow. The compiler never
promotes them to global scope.

```galerina
types {
  type GetPatientResult = Result<PatientProfile, PatientError>
}
```

**Rule:** Flow-local aliases belong in `contract.types`. Shared domain types
(`Email`, `PatientId`, `Money<GBP>`) remain global.

---

## Section: intent {}

Already documented in `galerina-flow-contracts.md`.

Machine-readable purpose string for the flow. Feeds IGO, documentation
generation, governance review, and audit reporting.

```galerina
intent {
  "Retrieve a patient profile by ID for an authenticated clinical actor."
}
```

**Rule:** Intent is descriptive. Intent never grants authority.

---

## Section: request {}

New in Phase 10A. Declares the allowed incoming boundary for the flow.

```galerina
request {
  accepts PatientReadRequest

  params {
    patientId: unsafe String
  }

  requires {
    actor
    trace_id
    deadline
  }
}
```

**Sub-declarations:**

| Declaration | Meaning |
|---|---|
| `accepts TypeName` | Expected request shape (body type) |
| `params { name: TrustState TypeName }` | Path, query, or body parameters with trust state |
| `requires { field, ... }` | Context fields that must be present before execution begins |

Parameters in `params` use value-state prefixes (`unsafe`, `safe`,
`protected`) to express the trust state at the boundary. An `unsafe` param
requires a validation gate before it can reach a governed sink.

`requires` declarations are checked by the governance verifier in Phase 10B
(see `SPORE-CONTEXT-001`).

---

## Section: response {}

New in Phase 10A. Declares the allowed outgoing boundary for the flow.

```galerina
response {
  returns PatientProfileResponse

  exposes {
    patientId
    name
  }

  denies {
    email
    nhsNumber
    dateOfBirth
  }
}
```

**Sub-declarations:**

| Declaration | Meaning |
|---|---|
| `returns TypeName` | Expected response shape |
| `exposes { fields }` | Fields explicitly permitted to leave the flow in the response body |
| `denies { fields }` | Fields that must NOT appear in the response body |

If a `protected` field appears in the response body without being listed in
`exposes`, the governance verifier emits `SPORE-GOV-003` (Phase 10B).

`denies` is an explicit blocklist. A field in `denies` that appears in the
response body triggers `SPORE-GOV-003` regardless of its type.

---

## Section: context {}

New in Phase 10A. Declares required execution context fields that must be
read before the flow performs protected work.

```galerina
context {
  require actor
  require trace_id
  require deadline
}
```

Each `require` line names a field from the runtime execution context. The
governance verifier checks (Phase 10B) that each required field is accessed
before the first protected operation in the flow body. A required field that
is never read emits `SPORE-CONTEXT-001`.

---

## Section: model {}

New in Phase 10A. Declares the domain or AI model dependency for the flow.

**Domain model:**

```galerina
model {
  uses Patient
  reads PatientRecord
}
```

**AI model with governance constraints:**

```galerina
model {
  uses RiskModel
  constraints {
    local_only
    deny training
  }
}
```

`uses` declares a model or domain type the flow depends on. `reads` declares
data models the flow accesses for reading. `constraints` applies governance
restrictions to model usage — `local_only` forbids remote model calls;
`deny training` forbids the flow's data from being used as training input.

---

## Section: effects {}

The canonical form for declaring side-effects. Use `contract { effects {} }`.

```galerina
effects {
  database.read
  audit.write
}
```

`with effects [...]` at the flow signature level is a **hard error**
(SPORE-SYNTAX-LEGACY-001) and must not appear in new or existing source files.
The canonical form is `contract { effects {} }`.

**Phase 41 rule — `effects {}` is optional for pure flows.**
Omitting the `effects {}` section entirely means the flow declares no side-effects.
An explicit empty `effects {}` is equivalent to omission. For `guarded flow` and
`secure flow`, effects must be declared if the flow observes any.

**Canonical forms:**

```galerina
// Correct — effects declared (guarded/secure flows):
secure flow getPatient(...) : Result<Response, ApiError>
contract {
  effects { database.read, audit.write }
} { ... }

// Correct — pure flow, effects {} omitted (means no effects):
pure flow classify(score: Int) : String {
  contract {
    intent { "Map a numeric score to a risk tier label." }
  }
  match score {
    when score >= 90 => return "critical"
    _               => return "low"
  }
}

// Also correct — pure flow with explicit empty effects {}:
pure flow httpStatus(code: Int) : String {
  contract { effects {} }
  match code {
    200 => return "ok"
    404 => return "not_found"
    _   => return "unknown"
  }
}

// ERROR — SPORE-SYNTAX-LEGACY-001 (hard error, will not compile):
// secure flow getPatient(...) -> Result<Response, ApiError>
// with effects [database.read, audit.write] { ... }
```

---

## Section: economics {}

Economics constraints for governed execution planning. This section declares
cost, value, and budget boundaries the planner/runtime must respect.

```galerina
economics {
  max_cost_gbp 0.05
  max_latency_ms 120
  min_value_score 0.80
  deny_expensive_target photonic
}
```

Typical declarations:

| Declaration | Meaning |
|---|---|
| `max_cost_gbp N` | Hard upper bound on per-execution cost |
| `max_latency_ms N` | Target execution latency budget |
| `min_value_score N` | Minimum acceptable value/utility score |
| `deny_expensive_target target` | Prevent execution routing to a high-cost target |

This section informs plan selection and target bridging. It does not grant
authority and cannot override `effects`, `privacy`, `rules`, or `audit`.

---

## Section: rules {}

Already documented in `galerina-flow-contracts.md` and
`galerina-governance-verifier-spec.md`.

Governance rules and requirements that apply to this flow.

```galerina
rules {
  protect memory for protected values
  deny runtime injection
  require redaction before audit.write
}
```

---

## Section: events {}

Already documented in `galerina-flow-contracts.md`.

Events this flow may emit. Each event listed here must have a global `event`
declaration before it can be used with `emit`.

```galerina
events {
  emits PatientProfileRead
  emits PatientNotFound
}
```

---

## Section: audit {}

Audit and integrity requirements for this flow. These declarations are
checked at compile time and enforced at runtime.

```galerina
audit {
  require proof
  require runtime report
  require signed attestation
  require audit.write
}
```

| Declaration | Meaning |
|---|---|
| `require proof` | An execution proof chain must be generated for every run |
| `require runtime report` | A runtime execution report must be produced |
| `require signed attestation` | The attestation artifact must be signed before the flow result is returned |
| `require audit.write` | `audit.write` must appear in the declared effects |

---

## Full Example: getPatient

```galerina
// Top-level public result type (Phase 41 preferred form)
type GetPatientResult = Result<PatientProfile, PatientError>

secure flow getPatient(readonly request: Request) : GetPatientResult
contract {

  types {
    type GetPatientResult = Result<PatientProfile, PatientError>
  }

  intent {
    "Retrieve a patient profile by ID for an authenticated clinical actor."
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

    exposes {
      patientId
      name
    }

    denies {
      email
      nhsNumber
      dateOfBirth
    }
  }

  context {
    require actor
    require trace_id
  }

  model {
    uses Patient
    reads PatientRecord
  }

  effects {
    database.read
    audit.write
  }

  economics {
    max_cost_gbp 0.02
    max_latency_ms 100
  }

  rules {
    require redaction before audit.write
  }

  events {
    emits PatientProfileRead
    emits PatientNotFound
  }

  audit {
    require proof
    require runtime report
    require signed attestation
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

## Diagnostics

New diagnostics introduced by the Phase 10A contract model.

| Code | Meaning | Phase |
|---|---|---|
| `SPORE-GOV-003` | Protected field returned in response without an `exposes` declaration | Phase 10B |
| `SPORE-CONTEXT-001` | Required context field not accessed before protected work begins | Phase 10B |
| `SPORE-CONTRACT-001` | Contract section order violation (formatter only; not a compiler error) | Phase 10B |

These diagnostics are specified in Phase 10A and enforced in Phase 10B.
Existing `SPORE-GOV-*` and `SPORE-EFFECT-*` codes from Phase 9 are unchanged.

---

## Contract vs Body Principle

> Contract = what this flow is allowed, expected, and required to do.
> Body = how it does it.

The contract is the governed boundary. The body is the implementation.
A flow with a complete contract and no body is a valid specification artifact.
A flow with a body and no contract is allowed but ungoverned.

---

## Rules at a Glance

- Canonical section order is: types, intent, request, response, context, model, effects, economics, timeouts, retries, limits, privacy, errors, rules, observability, events, audit
- The formatter enforces section order; the compiler does not error on order violations in Phase 10A
- `response.denies` fields must not appear in the response body — enforced in Phase 10B
- `context.require` fields must be read before the first protected operation — enforced in Phase 10B
- `with effects [...]` is a **hard error** (SPORE-SYNTAX-LEGACY-001); use `contract { effects {} }` only
- `effects {}` is **optional** for `pure flow` — omission means no effects declared
- `else if` is a **hard error** (SPORE-SYNTAX-010) — use `match` or sequential `if`
- `:` is the modern preferred return-type separator; `->` is still accepted
- Top-level `type` declarations are preferred over `contract.types {}` for public result types
- `contract {}` may appear inline as the first item in the flow body (modern preferred style)
- `audit.require signed attestation` requires `src/attestation.ts` to run before the response is returned
- Intent never grants authority — it guides optimisation and documentation only

---

## Phase 41 Syntax Changes (quick reference)

These rules were formalised or added in Phase 41 and apply to all new Galerina source.

| Rule | Detail |
|---|---|
| `:` return type | `pure flow foo(x: Int) : String` — preferred; `->` still valid |
| Inline contract | `contract {}` as first item in `{}` body — preferred for compact flows |
| `when` guard arms | `when score >= 90 => return "critical"` in `match` |
| Integer/string literal arms | `200 => return "ok"` — no `when` needed for constant values |
| `effects {}` optional | Pure flow without `effects {}` = no effects (pure) |
| Top-level result types | `type FooResult = Result<X, E>` at compilation unit level |
| No `else if` | Hard error SPORE-SYNTAX-010; use `match` or sequential `if` statements |
| `unsafe let` at boundary | `unsafe let rawId: String = request.params.id` — marks untrusted input |

**Phase 41 canonical style example:**

```galerina
// Top-level public result type
type AuditPatientResult = Result<Response, AuditError>

// Modern inline contract, : return type, when-guard match
pure flow classify(score: Int) : String {
  contract {
    intent { "Map a numeric score to a risk tier label." }
  }
  match score {
    when score >= 90 => return "critical"
    when score >= 70 => return "high"
    when score >= 40 => return "medium"
    _               => return "low"
  }
}

// Integer literal match arms, inline contract
pure flow httpStatus(code: Int) : String {
  contract { effects {} }
  match code {
    200 => return "ok"
    404 => return "not_found"
    _   => return "unknown"
  }
}

// Binary if (not match) for a simple two-branch decision
pure flow checkAge(age: Int) : Bool {
  if age >= 18 {
    return true
  }
  return false
}
```

---

## See Also

- `docs/Knowledge-Bases/galerina-flow-contracts.md` — types, intent, and events sections (implemented)
- `docs/Knowledge-Bases/galerina-signed-attestation.md` — how signed attestation is produced
- `docs/Knowledge-Bases/galerina-contract-sets.md` — shared contracts across flows
- `docs/Knowledge-Bases/galerina-governance-verifier-spec.md` — compiler governance pass
