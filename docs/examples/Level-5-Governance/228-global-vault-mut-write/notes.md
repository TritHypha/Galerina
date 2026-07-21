# 228-global-vault-mut-write

## Concept

`mut` is required on every GlobalVault write. This makes state changes visible to
developers, AI tools, audit tooling, and the compiler.

## The three vault write patterns

| Pattern | Example |
|---|---|
| Counter increment | `mut secure.loginCount++` |
| Keyed record create | `mut secure.session[uuid] = { … }` |
| Read-modify-write | `let s = secure.session[uuid]` then `mut s.field = v` then `mut secure.session[uuid] = s` |

## AI rules

- `secure.x = y` without `mut` → `FUNGI-VAULT-005` (rejected)
- `secure.x++` without `mut` → `FUNGI-VAULT-005` (rejected)
- Flows that write must declare `vault.write` in `effects`
- Flows that both read and write must declare both `vault.read` and `vault.write`
