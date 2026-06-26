# 456 — Compliance PII effect

**Concept:** accessing PII without declaring the pii.read effect

Any flow that reads or processes a `protected` PII type must declare `effects [pii.read]`. The compiler tracks PII access through the type system and raises `SPORE-PII-001` when the effect is missing. The fix is to add `with effects [pii.read, ...]` to the flow signature.

**AI rule:** Declare `effects [pii.read]` on every flow that reads personally identifiable information.
