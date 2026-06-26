# Healthcare — Governance Proof

This document records the static governance properties of every flow in the
`healthcare` example package. It is generated once per compiler release and
pinned alongside the source so that auditors can verify claims without
re-running the toolchain.

---

## Flow: getPatient

**Source:** `getPatient.spore`
**Qualifier:** `secure`

### Declared Effects

| Effect | Meaning |
|---|---|
| `database.read` | Reads patient records from the patients database |
| `phi.read` | Reads protected health information (PHI) fields |
| `audit.write` | Writes one `PatientAccessed` record to the audit log unconditionally |

### WASM Capability Imports

| Effect | WASM import (`host:<name>`) | Description |
|---|---|---|
| `database.read` | `host:db.find` | Sandboxed read-only patient DB cursor; write access denied by import table |
| `phi.read` | `host:phi.read` | Controlled PHI access; governed by WASI import table; no raw value escapes |
| `audit.write` | `host:audit.write` | Append-only audit sink; cannot read back written records |

### PHI Governance

The following fields are declared PHI in the `privacy` block:

- `name` — patient full name
- `dob` — date of birth

Both fields are redacted before any response or audit write. The compiler
enforces `require redaction before audit.write`, meaning the effect checker
will emit `SPORE-EFFECT-*` diagnostics if `redact()` is not called before
`AuditLog.write`.

The `deny protected PatientId to response.body` rule prevents the raw
`PatientId` value from appearing in any HTTP response body.

### Audit Trail Contents

Every execution appends exactly one record:

```
{
  event:     "PatientAccessed",         // fixed string literal — not caller-controlled
  patientId: redact(patientId),         // opaque hash; raw PatientId never stored
  actor:     request.context.actor      // authenticated actor from request context
}
```

The record is written unconditionally (outside any `if` branch), so every
access — successful or not — is always logged.

### Request Context Requirements

The `request.context` block requires:

- `actor` — the authenticated identity making the request
- `trace_id` — a correlation ID for distributed tracing

Both are enforced at the contract boundary before the flow body executes.

### PassiveExecutionPlan Hash

```
pep_sha256: PLACEHOLDER-getPatient-v0
```

---

## Governance Summary

| Flow | Qualifier | Effects | WASM imports | PHI | Audited |
|---|---|---|---|---|---|
| `getPatient` | `secure` | `database.read`, `phi.read`, `audit.write` | `host:db.find`, `host:phi.read`, `host:audit.write` | `name`, `dob` | Yes — `PatientAccessed` |

All hashes above are placeholders pending integration of the deterministic GIR
hasher in Phase 26. Replace each `PLACEHOLDER-*` value with the output of
`galerina hash <flow-name>` after building the package.
