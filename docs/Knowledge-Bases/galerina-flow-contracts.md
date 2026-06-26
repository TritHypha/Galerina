# Galerina Language Proposal — Flow Contracts

## Status

```
Pilot Candidate — basic parsing implemented
Keywords: contract, emit, emits, event, types — active in v1
Full semantics: Phase 9B+
```

## TL;DR
- `contract { types, intent, events }` groups flow-local metadata in one governed location
- Replaces scattered global type aliases and intent strings with explicit local ownership
- Intent inside a contract feeds IGO (Intent-Guided Optimisation)
- Events declared in contract are emitted with `emit EventName` in the body

---

## Core Philosophy

Galerina is **local by default**. The same principle that prevents global mutable state also applies to flow-specific metadata. A type alias that only exists for one flow should *live* inside that flow.

```
Without contract:                    With contract:
  type EmailListResult = ...         flow collectEmails(...)
  flow collectEmails(...)            contract {
  {                                    types { type EmailListResult = ... }
    // who owns EmailListResult?       intent { "Validate email addresses" }
  }                                  }
                                     { ... }
```

---

## Proposed Syntax

```galerina
pure flow collectEmails(inputs: Array<String>) -> EmailListResult

contract {

  types {
    type EmailListResult =
      Result<Array<protected Email>, ValidationError>
  }

  intent {
    "Validate raw email strings and collect only valid results."
  }

  events {
    emits EmailValidationStarted
    emits EmailValidationCompleted
    emits EmailValidationFailed
  }

}
{
  emit EmailValidationStarted

  let results = inputs.map(validate.email)
  let collected = Result.sequence(results)

  match collected {
    Ok(_)  => emit EmailValidationCompleted
    Err(_) => emit EmailValidationFailed
  }

  return collected
}
```

---

## Contract Sub-blocks

### `types { }` — flow-local type aliases

Defines type aliases that only exist inside this flow. The compiler never promotes them to global scope.

```galerina
types {
  type CreatePatientResult = Result<PatientId, ValidationError>
  type PatientFields = Record<String, protected String>
}
```

**Rule:** Flow-local aliases belong in `contract.types`. Shared domain types (`Email`, `Money<GBP>`, `PatientId`) remain global.

### `intent { }` — machine-readable purpose

Declares what the flow is *for*, not how it executes. Intent feeds:
- IGO (Intent-Guided Optimisation) — runtime workload classification
- Documentation generation
- Governance review
- Audit reporting

```galerina
intent {
  "Classify inbound messages locally without remote execution."
}
```

**Rule:** Intent is descriptive. Intent never grants authority.

### `events { }` — declared event emissions

Declares which events this flow may emit. An event declared here must be defined globally before it can be used.

```galerina
events {
  emits PatientCreated
  emits PatientCreationRejected
}
```

---

## Readable Result Types (Optional Syntax)

Within `contract.types`, result types may be written in readable form:

```galerina
// Readable
type EmailListResult = result of protected Email list else ValidationError

// Canonical compiler form (same)
type EmailListResult = Result<Array<protected Email>, ValidationError>
```

**Status:** Readable result types depend on Readable Logic Forms adoption (separate proposal). The canonical `Result<T,E>` form is always valid inside `contract.types`.

---

## Full Examples

### Pure validation flow

```galerina
pure flow collectEmails(inputs: Array<String>) -> EmailListResult

contract {

  types {
    type EmailListResult = Result<Array<protected Email>, ValidationError>
  }

  intent {
    "Validate raw email strings and collect only valid protected results."
  }

  events {
    emits EmailValidationStarted
    emits EmailValidationCompleted
    emits EmailValidationFailed
  }

}
{
  emit EmailValidationStarted
  let collected = Result.sequence(inputs.map(validate.email))
  match collected {
    Ok(_)  => emit EmailValidationCompleted
    Err(_) => emit EmailValidationFailed
  }
  return collected
}
```

### Secure boundary flow

```galerina
secure flow createPatient(readonly request: Request)
-> CreatePatientResponse

contract {

  types {
    type CreatePatientResponse = Result<Response, ApiError>
    type CreatePatientResult = Result<PatientId, ValidationError>
  }

  intent {
    "Create a patient record from a validated request, protecting all PII."
  }

  events {
    emits PatientCreated
    emits PatientCreationRejected
  }

}
{
  unsafe let rawEmail: String = request.body.email
  let email: protected Email = validate.email(rawEmail)?

  let saved = PatientsDB.insert({ email: email })?

  AuditLog.write({
    event: "PatientCreated",
    patientId: saved.id,
    email: redact(email)
  })

  emit PatientCreated

  return Ok(Response.created(saved.id))
}
```

### AI inference flow

```galerina
guarded flow classifyMessage(message: String) -> ClassificationResult

contract {

  types {
    type ClassificationResult = Result<Label, AiError>
  }

  intent {
    "Classify inbound messages locally without remote execution."
  }

  events {
    emits ClassificationStarted
    emits ClassificationCompleted
  }

}
{
  emit ClassificationStarted
  let label = ClassifierModel.classify(message)?
  emit ClassificationCompleted
  return Ok(label)
}
```

---

## `emit` Statement

Inside a flow body, `emit EventName` signals that the named event occurred. Events must be declared in the contract before they can be emitted.

```galerina
emit PatientCreated        // fires the PatientCreated event
```

In Stage 1, `emit` is a no-op in the interpreter but recorded in the audit trace. Full event routing is Phase 9B+.

---

## Global `event` Declarations

Events referenced in `contract.events` must be declared globally:

```galerina
event PatientCreated
event PatientCreationRejected
event EmailValidationStarted
```

Global event declarations are top-level and can be shared across flows.

---

## Future Contract Sections

These sections are planned but not yet active:

```galerina
contract {

  // Future: explicit data sharing policy
  governance {
    allow protected Email to response
      reason "User is viewing own profile"
  }

  // Future: compute target preferences (replaces top-level compute target block)
  targets {
    prefer [npu, gpu]
    deny [remote.execution]
  }

  // Future: testable examples for AI/docs/testing
  examples {
    input "john@example.com"
    output protected Email
  }

}
```

---

## Design Rules

1. **Flow-local aliases belong in `contract.types`**
2. **Shared domain types remain global** (`Email`, `PatientId`, `Money<GBP>`)
3. **Intent is descriptive — it never grants authority**
4. **Events must be declared before they are emitted**
5. **Readable result aliases are optional** — `Result<T,E>` is always canonical

---

## AI Benefits

Contracts give AI tools a single location to find:
- What the flow produces (`types`)
- Why the flow exists (`intent`)
- What events it fires (`events`)

Instead of searching the flow body, AI reads the contract first, then the body. This mirrors the "What / Why / How" pattern that humans naturally prefer.

---

## Relationship to IGO

The `intent` block inside a contract is the primary signal for Intent-Guided Optimisation:

```galerina
intent {
  "Classify inbound messages locally without remote execution."
}
```

The IGO runtime reads this at startup and may infer:
- AI inference workload → model warmup useful
- "locally" → confirms `deny [remote.execution]`
- NPU/GPU preference appropriate

**Rule:** Intent guides optimisation, not permission.

---

## GIR Integration

The GIR emitter extracts `contract.intent` as the flow's `intent.declared` field. The existing `intentDecl` node in the parser captures this today.

Future: `contract.types` creates a `types` section in GIR for downstream type planning. `contract.events` adds event declarations to GIR for observability planning.

---

## Compiler Status

```text
Keywords:          contract, emit, emits, event, types — active in v1
Parser:            contract block parsed as generic block (body stored)
GIR:               intent extracted from contract.intent
Semantic checks:   Phase 9B+
Event routing:     Phase 9B+
Readable types:    Pending Readable Logic Forms adoption
```

---

## See Also

- `docs/Knowledge-Bases/galerina-readable-logic-forms.md` — readable result syntax
- `docs/Knowledge-Bases/galerina-intent-guided-optimisation.md` — IGO
- `docs/Knowledge-Bases/galerina-governance-verifier-spec.md` — governance context
- `docs/Knowledge-Bases/galerina-gir-schema.md` — GIR event and intent fields
- `docs/Knowledge-Bases/value-state-annotations.md` — protected/redacted types
