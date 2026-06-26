## What this level teaches

- `intent` — a human-readable governance statement the compiler checks against observed behaviour
- The full 16-section contract structure and canonical section order:
  `types` → `intent` → `request` → `response` → `context` → `model` → `effects` → `timeouts` → `retries` → `limits` → `privacy` → `errors` → `rules` → `observability` → `events` → `audit`
- `contract set` — reusable governance templates applied to flows with `use <Name>`
- `event` declarations and `emit` statements as domain-level signals
- `context` block: requiring `actor`, `trace_id`, `deadline` before effectful operations
- `response` block: `exposes` and `denies` to control what fields leave a flow
- `rules` block: pre-conditions such as `require actor before database.read`
- `policy` block: `allow purpose` and `purpose mismatch` enforcement
- `compute target` with `deny [remote.execution]` as a governance constraint
- `SPORE-GOV-*` diagnostic family

## Canonical patterns

```spore
// contract set: reusable governance template
contract set NhsPatientData {
  rules {
    require validation before database.write
    require redaction before audit.write
  }
  events {
    emits PatientCreated
    emits PatientCreationFailed
  }
  audit { require audit.write }
}

// Flow applies the contract set with 'use'
secure flow createPatient(readonly request: Request) -> CreatePatientResult
contract {
  types { type CreatePatientResult = Result<Response, ApiError> }
  use NhsPatientData
  intent { "Create a patient record while protecting NHS PII." }
  effects {
    database.write
    audit.write
  }
}
{
  unsafe let rawEmail: String = request.body.email
  let email: protected Email  = validate.email(rawEmail)?
  let saved = PatientsDB.insert({ email: email })?
  AuditLog.write({ event: "PatientCreated", email: redact(email) })
  emit PatientCreated
  return Ok(Response.created(saved.id))
}
```

```spore
// context requirement — actor must be present before database.read
context { require actor }
rules   { require actor before database.read }
```

## Do not use in this level

- `result of X else Y` (proposal only — use `Result<T, E>`)
- `compute target` hardware preferences (Level 6 and 8)
- `authority` blocks for cross-boundary data grants (Level 9)
- `ai.inference` effect and AI model calls (Level 7)
- Omitting `fallback cpu` when using a non-CPU compute target (Level 8 concern)

## Key diagnostics this level demonstrates

| Code | Meaning |
|------|---------|
| `SPORE-GOV-001` | Intent declared but observed behaviour does not match |
| `SPORE-GOV-002` | Required context field (`actor`, `trace_id`) missing at call site |
| `SPORE-GOV-003` | Protected data sent externally without an `authority` block |
| `SPORE-GOV-004` | `policy` purpose mismatch — declared purpose does not match allowed purpose |
| `SPORE-GOV-005` | `audit.write` required by contract set but not declared in `effects` |

## Example IDs at this level

201-intent-basic, 202-secure-intent-boundary, 203-intent-mismatch-invalid, 204-remote-execution-denied, 205-remote-execution-violation, 206-protected-data-sharing-authority, 207-protected-data-sharing-missing-authority, 208-audit-proof-required, 209-audit-proof-missing, 210-governed-execution-plan, 211-policy-block-allows-purpose, 212-policy-purpose-mismatch, 213-governance-summary-example, 214-contract-secure-flow, 215-contract-set, 216-event-declaration, 217-contract-set-validation, 218-errors-contract, 219-response-denies, 220-context-required, 221-timeouts-retries, 222-limits-privacy, 223-observability, 224-contract-best-practices, 225-context-missing, 226-full-16-section-minimal
