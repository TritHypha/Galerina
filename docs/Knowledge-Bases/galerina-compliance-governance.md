# Galerina — Compliance Governance

## Overview

Galerina's governance model is well-suited to building compliant systems for regulated
industries: Finance, Medical, Government and any domain requiring PII protection,
OWASP alignment, security auditing, or regulatory evidence (GDPR, HIPAA, SOX, PCI-DSS).

This document defines the language-level features and framework patterns that enable
compliance-first development without requiring each team to re-implement security
controls from scratch.

---

## The Core Idea

Compliance requirements are not framework concerns or deployment checklist items.
They are **type-level and effect-level constraints** that the compiler can verify.

Instead of:

```text
"Did the developer remember to sanitize this input?"
"Is this endpoint authenticated?"
"Is this PII data encrypted at rest?"
```

Galerina asks and answers:

```text
"This flow cannot receive Tainted<T> at a sensitive sink — compiler error."
"This API route has no auth policy — compiler error."
"This PII<T> field cannot be written without audit effect — compiler error."
```

---

## Data Classification Types

### PII — Personally Identifiable Information

```galerina
type EmailAddress = PII<String>
type PhoneNumber = PII<String>
type NationalId = PII<String>
type HealthRecord = PHI<PatientData>    // Protected Health Information — HIPAA
type FinancialRecord = PCI<CardData>    // PCI-DSS cardholder data
```

`PII<T>`, `PHI<T>`, `PCI<T>` are sealed types that:

```text
cannot be logged (SPORE-PII-001: PII value reached logger)
cannot be stored without encryption declaration
cannot cross a boundary without a retention/transfer declaration
require explicit redaction for display
require audit effect when written
require purpose declaration when read
```

### Classified Data Levels

```galerina
type InternalMemo   = Classified<String, Internal>
type ConfidentialId = Classified<UUID, Confidential>
type SecretKey      = Classified<Bytes, Secret>
```

The type system enforces that classified data does not flow into lower-classification
contexts without an explicit declassification gate:

```galerina
let display = declassify(memo, approver: SeniorReviewer)
```

---

## Regulated-Industry Effects

Compliance domains need their own effect categories so the effect checker can verify
that flows only touch regulated data when they have declared intent:

```text
pii.read
pii.write
pii.transmit
pii.delete

phi.read          (HIPAA)
phi.write
phi.audit

pci.read          (PCI-DSS)
pci.write
pci.transmit

audit.write       (SOX, GDPR)
audit.immutable   (tamper-evident log write)

consent.check
consent.record
consent.revoke

retention.schedule
retention.delete
```

---

## Role-Based Capability System

Capabilities gate access to regulated operations:

```galerina
capability pii.access             // access PII data
capability phi.access             // access protected health information
capability pci.access             // access cardholder data
capability audit.write            // write to immutable audit log
capability data.delete.right      // GDPR right to erasure
capability consent.manage         // manage consent records
capability break_glass            // emergency override — always audited
```

A flow declares the capabilities it requires:

```galerina
secure flow exportPatientHistory(id: PatientId) -> Result<HealthRecord, ApiError>
effects [phi.read, audit.write]
capabilities [phi.access, audit.write] {
  let record = db.getPatientRecord(id)
  audit.log("Patient history exported", patientId: id, actor: currentUser())
  return Ok(record)
}
```

The compiler verifies that the declared capability set is sufficient for the effects used.

---

## OWASP Top 10 — Compiler Coverage

| OWASP Risk | Galerina Mechanism |
|---|---|
| A01: Broken Access Control | Capability system — all routes require declared capabilities |
| A02: Cryptographic Failures | Compile-time crypto policy — `TlsPolicy`, `EncryptionPolicy`, no runtime string override |
| A03: Injection | `Tainted<T>` propagation — tainted values cannot reach SQL/HTML/shell sinks without sanitizers |
| A04: Insecure Design | Effect graph — all authority is declared; intent graph is a reviewable artefact |
| A05: Security Misconfiguration | Production profile gates — compiler blocks weak crypto, missing auth, debug modes |
| A06: Vulnerable Components | Supply-chain attestation — hash-pinned lockfile, `SPORE-SUPPLY-001` on drift |
| A07: Auth & Session Failures | `SecureString` / `ProtectedSecret<T>` — session tokens are opaque governed types |
| A08: Software Integrity Failures | Governance manifests — package effects declared before install |
| A09: Logging/Monitoring Failures | `audit.write` effect — logging is declared and verifiable; `PII<T>` cannot reach log |
| A10: SSRF | Network allowlist — `network.external` effect requires allowlisted host |

---

## GDPR Compliance Features

### Right to Access

```galerina
flow handleAccessRequest(subjectId: DataSubjectId) -> Result<PersonalDataExport, ApiError>
effects [pii.read, pii.transmit, audit.write]
capabilities [pii.access] {
  // compiler verifies pii.read effect is declared
  let data = collectPersonalData(subjectId)
  audit.log("Data access request fulfilled", subject: subjectId)
  return Ok(exportForSubject(data))
}
```

### Right to Erasure

```galerina
flow handleErasureRequest(subjectId: DataSubjectId) -> Result<ErasureConfirmation, ApiError>
effects [pii.delete, audit.immutable]
capabilities [data.delete.right] {
  let result = erasePersonalData(subjectId)
  audit.immutable.log("Data erasure request completed", subject: subjectId)
  return Ok(result)
}
```

### Data Transfer Restrictions

```galerina
boundary EuDataTransfer {
  allowedRegions [EU, EEA]
  requiresAdequacyDecision true
  effects [pii.transmit]
}
```

---

## HIPAA Compliance Features

### Minimum Necessary Rule

PHI access requires a declared purpose — the compiler checks that `phi.read` flows
declare a purpose scope:

```galerina
secure flow viewPatientMedication(
  patient: PatientId,
  purpose: TreatmentPurpose  // required type
) -> Result<MedicationList, ApiError>
effects [phi.read, audit.write]
capabilities [phi.access] {
  // phi.read automatically requires audit.write
  return Ok(db.getMedications(patient))
}
```

### PHI Cannot Escape Governed Scope

```galerina
// Invalid — PHI<T> cannot escape to external logging
flow badLog(record: PHI<PatientData>) {
  console.log(record)  // SPORE-PHI-001: PHI value cannot reach unapproved sink
}
```

### Business Associate Rules

```galerina
boundary BusinessAssociate {
  requires baa_contract true
  effects [phi.transmit]
  allowedPurposes [TreatmentPurpose, PaymentPurpose, OperationsPurpose]
}
```

---

## PCI-DSS Compliance Features

### Cardholder Data Environment Isolation

```galerina
boundary CardholderDataEnvironment {
  effects [pci.read, pci.write, pci.transmit]
  requires capabilities [pci.access]
  tls TlsPolicy.v1_3
  networkPolicy pci_allowlist
}
```

### Card Data Cannot Be Stored After Authorization

```galerina
type PanToken = Opaque<String>      // tokenized card number — safe to store
type RawPan = PCI<String>           // full PAN — must not be stored

flow tokenizeCard(pan: RawPan) -> PanToken
effects [pci.read, pci.transmit]  {
  // RawPan cannot escape — only PanToken is returned
  return PaymentProvider.tokenize(pan)
}
```

---

## SOX Compliance Features

### Immutable Audit Trail

```galerina
// SOX requires financial records to be tamper-evident
effect audit.immutable  // write to append-only log; deletion is a compiler error

flow recordTransaction(tx: FinancialTransaction) -> Result<TransactionId, FinanceError>
effects [database.write, audit.immutable]
capabilities [finance.record] {
  let id = db.insertTransaction(tx)
  audit.immutable.log("Transaction recorded", transactionId: id, amount: tx.amount)
  return Ok(id)
}
```

### Segregation of Duties

Capabilities enforce that approval and execution are separate roles:

```galerina
capability finance.approve   // Approver role
capability finance.execute   // Executor role
// No single user may hold both in production policy
```

---

## Governance Diff for Regulated Changes

Changes to regulated flows are tracked by governance diff:

```bash
galerina diff main..feature-gdpr-deletion --only authority
```

```text
Changed flows:
  handleErasureRequest
    Added effects:
      + pii.delete
    Added capabilities:
      + data.delete.right
    Review: REQUIRED
```

Compliance teams receive a structured report of every authority change, not a raw code diff.

---

## Project Compliance Policy

```galerina
compliance_policy {
  require_pii_classification true
  require_audit_on_phi_write true
  require_capability_for [pii.access, phi.access, pci.access, audit.write]
  block_on [pii.transmit_without_consent, phi_in_log, pci_in_plaintext]
  gdpr_mode true
  hipaa_mode true
  pci_dss_mode true
  sox_mode true
}
```

---

## Break-Glass Access

For emergency access in regulated environments:

```galerina
secure flow breakGlassAccess(
  resource: ProtectedResource,
  justification: BreakGlassJustification
) -> Result<ProtectedResource, AccessError>
effects [pii.read, phi.read, audit.immutable]
capabilities [break_glass] {
  audit.immutable.log(
    "BREAK-GLASS ACCESS",
    resource: resource.id,
    actor: currentUser(),
    justification: justification,
    timestamp: now()
  )
  return Ok(resource)
}
```

Break-glass capability triggers mandatory audit and review notification.

---

## Natural-Language Compliance Summary

The governance summary emits compliance-context wording for regulated builds:

```text
For the production profile, this application processes personal data (GDPR Article 6).
It may read customer records, write audit events to an immutable log, and transmit
payment data to api.stripe.com over TLS 1.3. It cannot store raw card numbers,
cannot access patient health records, and cannot make unlogged data transmissions.

Data retention: customer records retained for 7 years (SOX requirement).
Right to erasure: supported via /users/:id/erasure endpoint.
```

---

## Diagnostic Codes

| Code | Meaning |
|---|---|
| `SPORE-PII-001` | PII value reached unapproved sink |
| `SPORE-PII-002` | PII stored without encryption declaration |
| `SPORE-PII-003` | PII transmitted without consent check |
| `SPORE-PHI-001` | PHI value reached unapproved sink (HIPAA) |
| `SPORE-PHI-002` | PHI access lacks declared purpose |
| `SPORE-PCI-001` | PCI cardholder data reached non-PCI context |
| `SPORE-PCI-002` | Raw PAN cannot be stored after authorization |
| `SPORE-AUDIT-001` | Regulated write lacks audit effect |
| `SPORE-AUDIT-002` | Immutable audit log cannot be deleted |
| `SPORE-CONSENT-001` | Personal data processed without consent check |
| `SPORE-RETENTION-001` | Retention schedule required for this data type |

---

## Architecture Placement

| Layer | Responsibility |
|---|---|
| `galerina-core` | Data classification types (`PII<T>`, `PHI<T>`, `PCI<T>`), compliance effects |
| `galerina-core-compiler` | Taint propagation, PII sink checking, audit effect enforcement |
| `galerina-core-security` | Capability model, break-glass policy, regulated access types |
| `galerina-core-config` | Compliance mode flags (`gdpr_mode`, `hipaa_mode`, `pci_dss_mode`, `sox_mode`) |
| `galerina-core-reports` | Compliance section in governance report, data flow mapping |
| `galerina-framework-app-kernel` | Compliance route middleware, consent integration |
| `galerina-compliance-gdpr` | GDPR-specific types: `DataSubjectRequest`, `ConsentRecord`, `RetentionPolicy` |
| `galerina-compliance-hipaa` | HIPAA-specific: `PHI<T>`, `TreatmentPurpose`, `BusinessAssociate` |
| `galerina-compliance-pci` | PCI-DSS: `PCI<T>`, `PanToken`, `CardholderDataEnvironment` |
| `galerina-compliance-sox` | SOX: `audit.immutable`, `FinancialRecord`, `SegregationOfDuties` |
