## What this level teaches

- `pure flow`, `guarded flow`, and `secure flow` qualifiers and when to use each
- `let` (immutable), `mut` (mutable), and `readonly` parameter bindings
- `unsafe let` for values at trust boundaries before validation
- `fn` helpers declared inside a flow body (local helper functions)
- `return` statements and flow return types
- `match` on `Result` and `Option` — every arm must be handled
- `Option<T>` (`Some` / `None`) and `Result<T, E>` (`Ok` / `Err`) as the canonical error model
- Flow-local `contract` block with `types`, `intent`, and `events` sections
- `event` declarations and `emit` statements
- Why `fn` cannot be declared at top level

## Canonical patterns

```spore
// pure flow: deterministic logic, no effects
pure flow calculateVat(price: Money<GBP>) -> Money<GBP>
contract {
  intent { "Calculate VAT at 20% for a given price." }
}
{
  return price * Decimal("0.20")
}
```

```spore
// secure flow: trust-boundary entry point, validate before use
secure flow createPatient(readonly request: Request) -> CreatePatientResult
contract {
  types { type CreatePatientResult = Result<Response, ApiError> }
  intent { "Create a patient record from a validated HTTP request." }
  effects {
    database.write
    audit.write
  }
}
{
  unsafe let rawEmail: String = request.body.email
  let email: protected Email = validate.email(rawEmail)?
  let saved = PatientsDB.insert({ email: email })?
  AuditLog.write({ event: "PatientCreated", email: redact(email) })
  return Ok(Response.created(saved.id))
}
```

## Do not use in this level

- `result of X else Y` (proposal only — use `Result<T, E>`)
- `contract set` (governance templates — Level 5)
- `compute target` blocks (compute targeting — Level 6 and 8)
- `authority` blocks (data-sharing grants — Level 9)
- All 16 contract sections — at this level only `types`, `intent`, `effects`, and `events` are needed

## Key diagnostics this level demonstrates

| Code | Meaning |
|------|---------|
| `SPORE-SYNTAX-005` | Top-level `fn` declaration is not permitted; use a flow qualifier instead |
| `SPORE-SYNTAX-006` (`LET_AT_TOP_LEVEL`) | `let` bindings are not allowed at top level; move inside a flow |

## Example IDs at this level

001-pure-flow, 002-guarded-flow, 003-secure-flow, 004-local-fn-helper, 005-let-binding, 006-mut-binding, 007-readonly-parameter, 008-readonly-local-binding, 009-unsafe-let-boundary, 010-result-return, 011-option-return, 012-match-result, 013-match-option, 014-enum-basic, 015-record-basic, 016-type-alias, 017-domain-brand-type, 018-protected-type-label, 019-redacted-type-label, 020-invalid-fn-top-level, 021-flow-contract-basic, 022-no-toplevel-let, 023-readable-logic-forms (reference only — see Proposed-Readable-Logic-Forms)
