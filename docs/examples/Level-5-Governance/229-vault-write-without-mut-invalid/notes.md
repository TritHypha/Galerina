# 229-vault-write-without-mut-invalid

## Concept

The compiler rejects vault writes that are not marked with `mut`. This enforces
explicit mutation visibility — every state change must be scannable by developers,
AI tools, and audit tooling.

## The rule

```text
secure.x = y        → FUNGI-VAULT-005 (rejected)
secure.x++          → FUNGI-VAULT-005 (rejected)
mut secure.x = y    → ✅ correct
mut secure.x++      → ✅ correct
```

## Why

`mut` makes state changes visible and intentional. Without it, a hidden vault write
inside a complex flow body would be invisible to scanning tools, AI code reviewers,
and audit reports. The compiler enforces this at compile time, not runtime.
