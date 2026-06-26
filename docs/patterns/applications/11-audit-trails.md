# Galerina Application Pattern 11 — Audit Trails

**When to use:** Any regulated system — healthcare, finance, government, GDPR — where you need proof of what happened

---

## Audit as First-Class Language Feature

In most systems, audit logging is added after the fact — a `logger.info()` call inserted by a developer who remembers to do it. It is inconsistent, unverified, and easy to bypass.

Galerina treats audit as a language-level requirement. When a flow declares `require runtime report` or `require signed attestation`, the compiler enforces that the flow cannot complete without producing the required audit record. It is not possible to bypass this at the call site.

---

## The Audit Requirement Chain

A complete governed audit trail is built from five linked artefacts. Each artefact hashes the previous one, forming a chain that cannot be silently modified.

### 1. Declare the requirement in the contract

```galerina
guarded flow processPatientRecord(id: protected PatientId, data: protected MedicalRecord)
contract {
  effects { database.write, audit.write }
  audit {
    require runtime report
    require signed attestation
  }
  privacy {
    fields { data: redact before audit.write }
  }
}
```

### 2. Write to the audit log inside the flow

```galerina
{
  database.write(patientTable, id, data)
  AuditLog.write({
    event: "patient_record_updated",
    actor: actor.id,
    patientId: id,
    data: redact(data)    // protected → redacted; SPORE-VALUESTATE-003 fires if omitted
  })
}
```

### 3. Runtime report generated automatically

The runtime generates a report for every execution of a flow with `require runtime report`. The report is not written by application code — it is produced by the runtime after the flow completes.

### 4. Report signed with Ed25519

The runtime signs the report using the node's private key. The signature covers:

- Flow name and version
- Actor identity
- Timestamp
- Effects used
- Peak memory and duration
- SHA-256 of all `AuditLog.write` payloads in the execution

### 5. Proof chain

Each artefact is linked by hash:

```
source_hash       → hash of the compiled source at deploy time
  gir_hash        → hash of the GIR (Governed Intermediate Representation)
    plan_hash     → hash of the execution plan
      runtime_hash → hash of the runtime report
        audit_hash → hash of the AuditLog.write payload
```

Verification is performed with `verifyProofChain` from `proof-chain.ts`:

```typescript
const result = verifyProofChain({
  sourceHash,
  girHash,
  planHash,
  runtimeHash,
  auditHash,
  signature,
  publicKey: nodePublicKey
})
// result.valid: boolean
// result.brokenAt: "gir_hash" | "plan_hash" | "runtime_hash" | "audit_hash" | null
```

---

## What Makes Galerina Audits Different

| Property | Conventional logging | Galerina audit |
|----------|---------------------|--------------|
| Enforced by | Developer discipline | Compiler |
| Signed | No | Ed25519 |
| Linked to source | No | Yes (source_hash) |
| Redaction enforced | No | Yes (SPORE-VALUESTATE-003) |
| Tamper-detectable | No | Yes (proof chain) |
| Retained per policy | Manual | `privacy { retention }` |

---

## Redaction Before Audit Write

The compiler enforces that `protected` values must be redacted before they are passed to `AuditLog.write`. The `privacy` block declares this requirement:

```galerina
privacy {
  fields { data: redact before audit.write }
}
```

If a `protected` value is passed to `AuditLog.write` without `redact()`, the compiler emits `SPORE-VALUESTATE-003`.

```galerina
AuditLog.write({ data: patientRecord })          // SPORE-VALUESTATE-003
AuditLog.write({ data: redact(patientRecord) })  // OK — redacted value
```

`redact()` returns a `redacted T` value. The audit log stores the redacted form. The original protected value is not written to any external system.

---

## Retention Policy

The `privacy` block in the contract declares how long audit records are retained:

```galerina
privacy {
  retention {
    audit.write: 7y    // GDPR Article 30 records of processing
    runtime.report: 2y
  }
}
```

The runtime enforces retention at the audit store level. Records older than the declared retention period are deleted by the audit store's scheduled compaction job — which is itself a governed flow with its own audit trail.

---

## Runtime Report for Every Secure Flow

A runtime report is generated for every execution of a flow that declares `require runtime report`. The report is always present — there is no code path through which a governed flow completes without a report.

If the runtime cannot write the report (storage failure, signing key unavailable), the flow is rolled back and the execution is recorded as failed in the audit store's dead-letter queue.

---

## Proof Chain Verification

To verify that an audit record is genuine and unmodified:

```
galerina audit verify --hash <audit_hash>
```

This command:
1. Retrieves the proof chain for the given audit hash
2. Re-computes each hash from stored artefacts
3. Verifies the Ed25519 signature
4. Reports `VERIFIED` or `BROKEN AT <link>` with the first mismatching hash

Proof chain verification is designed to be run by regulators, auditors, and automated compliance checks — not only by the system that produced the record.
