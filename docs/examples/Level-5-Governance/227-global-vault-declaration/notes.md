# 227-global-vault-declaration

## Concept

`vault {}` at module level declares the GlobalVault — the Galerina replacement for
global mutable state. Every entry is typed, permission-controlled, and optionally
audited.

## Key rules

1. Every entry declares its allowed readers (`allow F read`) and writers (`allow F write`).
2. Reads require `vault.read` in the flow's `effects`.
3. Writes require `vault.write` in effects **and** `mut` on the write statement.
4. `audit required` on an entry = every write emits an audit event automatically.
5. `readonly` entries cannot be mutated after initial creation.
6. Access syntax: `secure.<entryName>` or `secure.<entryName>[key]` for keyed entries.

## AI rules

- `vault {}` is for **mutable** runtime state. For non-secret config, use `vault global`.
- Declaring `vault {}` does not grant access — every flow must be in the `allow` list.
- `secure.x = y` without `mut` is rejected (`FUNGI-VAULT-005`).
