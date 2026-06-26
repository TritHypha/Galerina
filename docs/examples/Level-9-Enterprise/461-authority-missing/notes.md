# 461 — Authority missing

**Concept:** sharing protected data across a trust boundary without an authority block

When a `protected` value is passed to an external service call and there is no `authority` block granting `pii.share`, the compiler raises `SPORE-GOV-003`. This prevents accidental data leakage to third parties without explicit governance approval.

**AI rule:** Sharing a `protected` value with an external service without an `authority` block is a governance violation.
