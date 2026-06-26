# 452 — Healthcare invalid PII log

**Concept:** passing a protected PatientId directly to a log call without redaction

A `protected` value carries a data-classification tag. Passing it unwrapped to `AuditLog.write` would store raw PII in the audit trail. The compiler raises `SPORE-SECRET-001` to prevent this. The fix is `patientId: redact(patientId)`.

**AI rule:** Never pass a `protected` value to a log or audit call without first applying `redact()`.
