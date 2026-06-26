## What this level teaches

- Healthcare PII governance: `NhsNumber`, `PatientName`, `DateOfBirth`, `PatientId` — all validated to `protected` types
- `pii.write` and `pii.read` effects alongside `database.write` and `audit.write` in healthcare flows
- Financial flows: `Money<GBP>` payment charges, cross-currency guard, VAT and fee calculations
- Compliance effects: `pii.write`, `phi.write` (protected health information)
- Full 16-section contracts in production shape — all sections populated
- `authority` block: `grant pii.share to <Service>` with `purpose` and `expiry` for cross-boundary data sharing
- Multi-actor patterns: `context.actor`, `context.trace_id` required before every effectful operation
- `audit` section: `require proof`, `require runtime report`, `require signed attestation`
- `privacy` section: `contains PII`, `deny protected values in logs`, `retain N days`
- Response field control with `exposes` / `denies` in the `response` block
- Supply-chain and enterprise domain flows combining governance, compute, and security

## Canonical patterns

```spore
// Healthcare: validate all PII to protected types, audit with redaction
secure flow createPatient(readonly request: Request) -> CreatePatientResult
contract {
  types { type CreatePatientResult = Result<Response, PatientError> }
  intent { "Create a new patient record with validated NHS number." }
  effects {
    pii.write
    database.write
    audit.write
  }
}
{
  unsafe let rawNhs: String       = request.body.nhsNumber
  let nhsNumber: protected NhsNumber = validate.nhsNumber(rawNhs)?
  let patientId: protected PatientId = PatientDB.insert({ nhsNumber: nhsNumber })?
  AuditLog.write({ event: "PatientCreated", patientId: redact(patientId), nhsNumber: redact(nhsNumber) })
  return Ok(Response.created({ patientId: redact(patientId) }))
}
```

```spore
// Authority block: grant protected data to cross a trust boundary
authority {
  grant pii.share to SpecialistService
  purpose "patient_referral"
  expiry 24h
}
```

## Do not use in this level

- `result of X else Y` (proposal only — use `Result<T, E>`)
- Sending `protected` data to an external service without an `authority` block — triggers `SPORE-GOV-003`
- Omitting `pii.write` or `pii.read` when handling PHI or PII data — triggers `SPORE-EFFECT-001`
- Logging `protected` values without `redact()` — triggers `SPORE-VALUESTATE-001`
- Partial contracts — all 16 sections should be considered and included where relevant at this level

## Key diagnostics this level demonstrates

| Code | Meaning |
|------|---------|
| `SPORE-GOV-003` | Protected data sent to external service without an `authority` block |
| `SPORE-VALUESTATE-001` | Protected value written to audit/log sink without `redact()` |
| `SPORE-VALUESTATE-003` | Unsafe binding flows into a governed database or network sink without validation |
| `SPORE-EFFECT-001` | Required effect (`pii.write`, `audit.write`) missing from contract `effects` block |
| `SPORE-TARGET-001` | Non-CPU compute target missing `fallback` (applies when compute targets are used) |

## Example IDs at this level

451-healthcare-patient-create, 452-healthcare-invalid-pii-log, 453-financial-payment-charge, 454-financial-cross-currency-invalid, 455-financial-money-calculation, 456-compliance-pii-effect, 457-compliance-phi-effect, 458-compliance-audit-required, 459-multi-protected-values, 460-authority-data-sharing, 461-authority-missing, 462-policy-purpose, 463-policy-mismatch, 464-enterprise-supply-chain, 465-enterprise-summary, 466-pii-without-pii-effect, 467-protected-response-body, 468-full-contract-model, 469-contract-financial-payment, 470-contract-healthcare-search, 471-medical-medication-check, 472-physics-simulation
