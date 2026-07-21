# 024-vault-global-basic

## Concept

`vault global` is the Config Vault — typed, non-secret, application-wide values that
are fixed at boot. This is the replacement for magic constants scattered through the
codebase.

## Rules for AI

1. `vault global` is **not** a global variable — it is read-only after boot.
2. Reading `vault global` values requires **no** effect declaration in the flow contract.
3. Access via typed property: `vault.limits.maxUploadMb` (preferred).
4. Access via generic key: `vault.get<T>("key.path")` (also valid).
5. **Never** put secrets (API keys, tokens, passwords) in `vault global` — FUNGI-VAULT-001.

## What belongs in vault global

- App name, version, region
- Feature flags (`Bool`)
- Size limits and quotas (`Int` / `Duration`)
- Safe provider names (`String`)
- Algorithm preferences (non-secret)

## What does NOT belong

- API keys → use `secret {}`
- User data, PII → use `vault.secure` or scoped vault
- Runtime-changing state → use GlobalVault (`vault {}`)

## KB references

- `ZTF-Knowledge-Bases/galerina-vault-system.md` — unified vault reference
- `ZTF-Knowledge-Bases/galerina-core-config-vault.md` — Config Vault detail
