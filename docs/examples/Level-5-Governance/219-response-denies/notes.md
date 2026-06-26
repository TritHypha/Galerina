# 219 — Response denies (SPORE-GOV-003)

## What this example shows

A flow whose `contract.response.denies` block lists `email` and `nhsNumber`, but the
flow body still returns `email` in the response object literal. This triggers
**SPORE-GOV-003** (PROTECTED_DATA_IN_RESPONSE).

## The rule

`contract.response.denies { fieldName }` declares that a named field must never appear
in the API response. The governance verifier checks whether any named argument label
in the flow's return statements matches a denied field name.

## How to fix

Option 1 — Remove the denied field from the response:
```
return Ok(Response.ok({ patientId: patient.id, name: patient.name }))
```

Option 2 — Redact before returning (if partial data is allowed):
```
return Ok(Response.ok({ patientId: patient.id, name: patient.name, email: redact(patient.email) }))
```

## Why this matters

The response contract is a machine-checkable data-minimisation guarantee.
If `email` is denied, the API surface never leaks it — not even accidentally.
This prevents a class of GDPR/HIPAA violations that code review alone often misses.
