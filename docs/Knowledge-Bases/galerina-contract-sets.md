# Galerina — Contract Sets

## Status

```
Phase 9B — Implemented
Parser: contract set Name { rules, events, audit } — fully parsed
Validation: SPORE-GOV-011 (unknown set), SPORE-GOV-012 (audit requirement not met)
Require lines inside audit { require audit.write } parsed and stored in AST
```

## TL;DR
- `contract set Name { rules, events, audit }` defines a reusable governance template
- Flows apply it with `use Name` inside their `contract { }` block
- Contract sets may require behaviour; they must not silently grant authority
- Flows must still declare their own effects explicitly

---

## Core Concept

A contract set is a **reusable governance template** that can be applied to multiple flows sharing the same data governance requirements.

```galerina
// Defined once globally
contract set PatientDataWrite {
  rules {
    require validation before database.write
    require redaction before audit.write
    deny protected PatientData to response unless policy allows
  }

  events {
    emits PatientDataAccessed
    emits PatientDataChanged
  }

  audit {
    require audit.write
  }
}
```

```galerina
// Applied to a flow
secure flow createPatient(readonly request: Request) -> CreatePatientResult

contract {
  types {
    type CreatePatientResult = Result<Response, ApiError>
  }

  use PatientDataWrite

  intent { "Create a patient record while protecting PII." }

  effects {
    database.write
    audit.write
  }
}
{ ... }
```

---

## Structure

```text
Global scope:
  shared facts (types, records, events)
  reusable contract sets

Flow contract:
  uses shared sets
  adds local intent / types / events / rules

Flow body:
  execution
```

---

## Key Rules

### Sets may require behaviour; they cannot grant authority

```galerina
contract set PatientDataWrite {
  rules {
    require audit.write          // ← May REQUIRE
  }
}
```

The flow must still declare effects explicitly inside `contract.effects {}`:
```galerina
// The flow must declare its own effects — 'use PatientDataWrite' does NOT add them automatically
secure flow createPatient(...)
contract {
  use PatientDataWrite           // may require audit.write

  effects {
    database.write
    audit.write                  // flow still declares explicitly
  }
}
```

### Reason: this keeps Galerina's authority model intact

Silently adding effects through a `use` would bypass the explicit declaration rule and make effects invisible to reviewers. `use` can *require* that effects are present, but cannot add them.

---

## Contract Set Sub-blocks

### `rules { }` — enforceable constraints

```galerina
contract set SecureApiAccess {
  rules {
    require validation before database.write
    require redaction before audit.write
    deny protected Email to response unless policy allows
    require audit.write
  }
}
```

### `events { }` — shared event declarations

```galerina
contract set PatientLifecycle {
  events {
    emits PatientCreated
    emits PatientUpdated
    emits PatientDeleted
    emits PatientDataAccessed
  }
}
```

### `audit { }` — audit requirements

```galerina
contract set ComplianceAudit {
  audit {
    require audit.write
    require redaction before audit.write
  }
}
```

---

## Using Multiple Sets

```galerina
secure flow updatePatient(readonly request: Request) -> UpdatePatientResult

contract {
  types {
    type UpdatePatientResult = Result<Response, ApiError>
  }

  use PatientDataWrite
  use ComplianceAudit

  intent { "Update a patient record." }
  events { emits PatientUpdated }

  effects {
    database.write
    audit.write
  }
}
{ ... }
```

---

## Full Example

```galerina
// Global contract set
contract set NhsPatientData {
  rules {
    require validation before database.write
    require redaction before audit.write
    deny protected NhsNumber to response unless policy allows
    deny protected Email to response unless policy allows
  }

  events {
    emits NhsPatientAccessed
    emits NhsPatientModified
  }

  audit {
    require audit.write
    require redaction before audit.write
  }
}

// Applied to multiple flows
secure flow createPatient(readonly request: Request) -> CreatePatientResult

contract {
  types {
    type CreatePatientResult = Result<Response, ApiError>
  }

  use NhsPatientData
  intent { "Create NHS patient record." }
  events { emits PatientCreated }

  effects {
    database.write
    audit.write
  }
}
{ ... }

secure flow updatePatient(readonly request: Request) -> UpdatePatientResult

contract {
  types {
    type UpdatePatientResult = Result<Response, ApiError>
  }

  use NhsPatientData
  intent { "Update NHS patient record." }
  events { emits PatientUpdated }

  effects {
    database.write
    audit.write
  }
}
{ ... }
```

---

## Compiler Status

```text
contract set declaration:  parsing implemented (generic block) — Phase 9B+ semantics
use ContractSetName:       parsing implemented — Phase 9B+ enforcement
rules { }:                 parsing implemented — Phase 9B+ enforcement
audit { }:                 parsing implemented — Phase 9B+ enforcement
```

---

## See Also

- `docs/Knowledge-Bases/galerina-flow-contracts.md` — flow contract blocks
- `docs/Knowledge-Bases/galerina-no-variables-outside-flows.md` — global scope rules
- `docs/Knowledge-Bases/galerina-governance-verifier-spec.md` — governance checking
