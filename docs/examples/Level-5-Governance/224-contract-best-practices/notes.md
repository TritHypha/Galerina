# 224 — Contract best practices (gold standard)

This example shows the complete, recommended pattern for a production-grade secure flow.
Every section serves a specific purpose; nothing is cargo-culted.

## Anatomy of the gold standard flow

### Signature
```
secure flow getPatientProfile(readonly request: Request) -> PatientProfileResult
```
- `secure` — governed execution; requires intent declaration
- `readonly request` — the parameter is immutable within the flow
- Named result type — keeps the signature readable; the type is defined in `contract.types`

### contract sections (ordered by dependency)

| Section | Role |
|---------|------|
| `types` | Defines the named result type |
| `intent` | Human-readable statement of purpose (required for secure flows) |
| `request` | Accepted input type and required params |
| `response` | Allowed output fields; denied fields enforced by SPORE-GOV-003 |
| `context` | Required execution context fields (actor, trace_id) |
| `effects` | Canonical list of effects (governs audit, security rules) |
| `errors` | Full error taxonomy with map, expose, redact, audit clauses |
| `timeouts` | Hard deadline for the flow |
| `privacy` | PII declaration, retention, and redaction requirements |
| `observability` | Tracing, metrics, log hygiene |
| `rules` | Pre-condition rules (actor required before database access) |
| `events` | Domain events emitted by this flow |
| `audit` | Audit reporting requirements |

### Body pipeline
```
unsafe let rawId = request.params.patientId    // 1. receive raw boundary input
let patientId: protected PatientId = validate.patientId(rawId)?  // 2. validate
let patient = PatientsDB.findById(patientId)?  // 3. governed read
AuditLog.write({ ... })                         // 4. audit
emit PatientProfileRead                          // 5. domain event
return Ok(Response.ok({ ... }))                 // 6. safe response (no denied fields)
```

## Key governance invariants this pattern satisfies

- SPORE-GOV-010: intent declared on secure flow
- SPORE-GOV-002: audit.write declared when database.read is used
- SPORE-GOV-003: denied fields (email, nhsNumber) absent from response body
- SPORE-CONTEXT-001: required context fields (actor, trace_id) accessed in body
- SPORE-VALUE-STATE-001: unsafe input validated before use as protected type
