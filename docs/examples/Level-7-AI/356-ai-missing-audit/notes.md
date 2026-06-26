# 356 — AI missing audit

**Concept:** secure AI flow that declares audit.write but omits the AuditLog.write call

Declaring `audit.write` in the effects list creates a governance obligation. The compiler verifies that `AuditLog.write` is called on all return paths. Omitting the call triggers `SPORE-GOV-XXX` (exact code assigned in Phase 8).

**AI rule:** If a `secure flow` declares `audit.write`, it must call `AuditLog.write` before returning.
