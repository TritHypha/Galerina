# 173 — Validation chain

**Concept:** Complete canonical trust flow chain

This is the canonical Galerina trust chain in its simplest form:
1. unsafe let rawEmail — mark the trust boundary
2. alidate.email(rawEmail)? — validate to protected Email
3. edact(email) — redact to edacted Email
4. AuditLog.write(...) — write to audit sink

**AI rule:** This is the canonical Galerina trust flow: unsafe -> alidate -> protected -> edact -> udit.
