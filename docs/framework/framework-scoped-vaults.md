# Framework: Scoped Vaults

## Purpose

Scoped vaults provide controlled runtime state reuse without global variables.

## Short Definition

A vault is a scoped, typed, permission-controlled runtime storage area owned by
a request, flow, session, service or secure boundary.

## Scope Examples

| Vault | Lifetime | Example |
|---|---:|---|
| `vault.request` | One request | Reuse customer data during one API call |
| `vault.flow` | One flow | Store intermediate results |
| `vault.session` | User session | Profile, basket or permission summary |
| `vault.service` | Service runtime | Read-only warmed config or route table |
| `vault.secure` | Short-lived sensitive scope | PII, payment state or auth metadata |

## Security Rules

- No unscoped vaults.
- No anonymous vault writes.
- No untyped vault values.
- No vault access without declared permission.
- No cross-user session reads.
- No permanent session data without TTL.
- No secrets in normal vaults.
- No stale database records unless cache policy allows it.
- Vault access must appear in security reports.

## Fast Runtime Use

Vaults let Galerina avoid repeated database calls while preserving the no-global
rule. The runtime can reuse typed request/session data after the route, schema,
permission and owner checks have passed.

```text
request -> route -> policy -> vault hit if valid -> typed response
```

Vaults must not bypass function inputs, authentication, validation,
authorisation or security policy.

## Generated Reports

```text
vault-report.json
vault-access-report.json
vault-security-report.json
vault-retention-report.json
vault-performance-report.json
```

## Knowledge Base

See [Scoped Vaults](../../../ZTF-Knowledge-Bases/scoped-vaults.md).
