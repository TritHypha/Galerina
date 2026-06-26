# Galerina: .env Trust Model

## Position

`.env` files are **conditionally trusted but operationally unsafe by default**.

```text
.env is an input source.
Not a security boundary.
Not a secret vault.
```

This is the canonical Galerina position. It reflects current industry practice:
`.env` files are widely used, practically useful, and not inherently secure.

---

## Why `.env` Is Problematic for Production Secrets

```text
accidentally committed to git
copied between environments
logged accidentally
loaded into process memory
visible to subprocesses
visible in crash dumps
shared too broadly
hard to audit
not typed
not governed
```

None of these problems are fatal for local development. All of them are
unacceptable for long-lived production credentials.

---

## What `.env` Is Good For

### Development

```text
local developer setup
temporary testing
non-production configuration
CI test environments (ephemeral secrets only)
```

Example `.env` (development):

```env
APP_PORT=8080
API_BASE_URL=https://dev-api.example.com
LOG_LEVEL=debug
```

### Acceptable in staging

```text
non-production provider API keys
staging database connections
test webhook secrets
```

---

## What `.env` Is Not Acceptable For

Long-lived production secrets:

```text
payment provider keys (Stripe, Braintree)
JWT signing keys
private keys and certificates
database master passwords
cloud root credentials (AWS, GCP, Azure)
AI provider tokens
OAuth client secrets
```

---

## Galerina Security Levels

### Level 1 — Development

Policy: `allowDotEnvFiles: true`, `allowUnsafeOverrides: true`

```text
.env loading enabled
unsafe overrides allowed
developer convenience allowed
validation optional
```

### Level 2 — Staging

Policy: `allowDotEnvFiles: false`, `allowUnsafeOverrides: false`

```text
.env discouraged
secret providers preferred
strict validation enabled
production-like policy applied
```

### Level 3 — Production

Policy: `allowDotEnvFiles: false`, `allowUnsafeOverrides: false`, strict mode

```text
runtime secret injection
managed secret stores
vault providers
KMS/HSM-backed secrets
container runtime injection
```

Preferred production providers:

```text
AWS Secrets Manager
HashiCorp Vault
Azure Key Vault
GCP Secret Manager
Kubernetes Secrets (projected volumes)
```

---

## Source vs Trust Level

Galerina distinguishes the *source* of a secret from its *trust level*.

The same secret name may be loaded from different sources in different
environments, each with an explicit trust declaration:

```galerina
secret STRIPE_API_KEY {
  from env "STRIPE_API_KEY"
  trust development_only
}
```

```galerina
secret STRIPE_API_KEY {
  from vault "vault://payments/stripe"
  trust production
}
```

This allows the compiler to reject uses of a `development_only`-trusted secret
in production code paths, even if the environment variable happens to be set.

---

## Galerina Best Practice

Prefer:

```galerina
secret DATABASE_PASSWORD {
  from vault "aws-secrets-manager://prod/db"
}
```

Over:

```galerina
secret DATABASE_PASSWORD {
  from env "DATABASE_PASSWORD"
}
```

for production deployments.

---

## Compiler and Deploy Diagnostics

### Warning — .env in production (default)

```text
SPORE-CONFIG-WARN-001
Production environment is using .env as a secret source.
Managed secret store recommended.
Use: from vault "..." for production secrets.
```

### Error — .env in production (strict mode)

```text
SPORE-CONFIG-WARN-002
.env secrets are forbidden in this environment.
EnvironmentPolicy.allowDotEnvFiles is false.
Move all secrets to a managed vault or KMS provider.
```

### Warning — development_only secret in production scope

```text
SPORE-SECRET-003
Secret STRIPE_API_KEY is declared trust development_only
but is referenced in a production execution path.
```

---

## EnvironmentPolicy Integration

The `EnvironmentPolicy` type in `galerina-core-config` exposes `.env` control:

```ts
export interface EnvironmentPolicy {
  /** Whether .env files are allowed as a secret/config source. */
  allowDotEnvFiles: boolean;

  /** Whether process.env overrides are permitted. */
  allowUnsafeOverrides: boolean;

  /** Raw secret values must never appear in reports. */
  allowSecretValuesInReports: false;
}
```

Default per mode (from `defaultEnvironmentPolicy()`):

| Mode | allowDotEnvFiles | allowUnsafeOverrides |
| --- | --- | --- |
| development | `true` | `true` |
| test | `true` | `false` |
| staging | `false` | `false` |
| production | `false` | `false` |

---

## Summary

```text
.env is acceptable for development.
.env is tolerated for simple non-production deployments.
.env is not considered a secure production secret system.

Production secrets must come from managed vault or KMS providers.
The compiler emits warnings (or errors in strict mode) when .env
is used as a production secret source.
```

---

## Related

```text
galerina-core-config-environment-secrets.md   SecretConfigSource, EnvironmentPolicy
galerina-core-security-v02.md                 SecretSource discriminated union
galerina-core-config-vault.md                 typed non-secret config vault (use instead of .env for app config)
```
