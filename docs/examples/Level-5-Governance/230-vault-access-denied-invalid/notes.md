# 230-vault-access-denied-invalid

## Concept

The GlobalVault enforces least-privilege access. A flow that is not named in a vault
entry's `allow` list cannot read or write that entry, even if it declares
`vault.read` or `vault.write` in its effects.

## The rule

```text
vault { loginCount: Int { allow incrementLogin write; allow getLoginCount read } }
```

- `incrementLogin` may write `loginCount` ✅
- `getLoginCount` may read `loginCount` ✅
- Any other flow that tries to read or write → `FUNGI-VAULT-006` ❌

## Why

Declaring `vault.write` in effects is necessary but not sufficient. The vault entry's
`allow` list is the capability gate. This is the principle of least privilege applied
to shared runtime state — each entry explicitly names its authorised accessors.

## AI rule

Do not add `vault.read` or `vault.write` to a flow's effects unless the flow is also
in the vault entry's `allow` list.
