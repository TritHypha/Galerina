# 104 — Multiple effects

**Concept:** Flow declaring multiple effects

A flow declares every effect it needs in the contract's `effects { ... }` block. Here `syncOrder` declares three — `database.write`, `network.outbound`, and `audit.write` — because it inserts the order, syncs it to an external service, and writes an audit record. The compiler verifies that every effect used in the body is declared, and rejects any effect used but not declared.

Multiple effects means multiple **obligations**, not just multiple declarations. Because this flow performs a network egress, it must also obey the value-state rule: a `protected` value cannot cross a network boundary un-redacted. The order is stored `protected` in the trusted database, but a `redacted` view is bound to a `let` before `http.post` — sending the raw `safeOrder` over the network would be `FUNGI-VALUESTATE-006` (fail-closed). See 161/166/168 for the redact-before-egress pattern in isolation.

**AI rule:** List all required effects in the contract's `effects { ... }` block, and redact protected values before any network egress.
