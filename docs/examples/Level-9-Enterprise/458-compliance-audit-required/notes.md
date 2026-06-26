# 458 — Compliance audit required

**Concept:** secure flow that declares audit.write but never calls AuditLog.write

Declaring `audit.write` creates a compile-time obligation. The compiler verifies that `AuditLog.write` is called on all return paths. A missing call triggers `SPORE-AUDIT-001`. This is especially critical for delete operations where the audit trail is the only record that the deletion occurred.

**AI rule:** `AuditLog.write` must be called on every return path in a flow that declares `audit.write`.
