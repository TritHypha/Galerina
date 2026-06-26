# Galerina Config Vault

## Definition

The Galerina Config Vault is a typed, non-secret, shared configuration store for
stable application values. It is distinct from:

```text
.env files        → deployment-injected secrets and environment-specific values
GlobalVault       → mutable runtime state (variable-mutation-vault-design.md)
secret references → protected values requiring capability-controlled access
```

The Config Vault is for values that are:

```text
non-secret
typed
stable across a deployment
shared across the application
safe to log and report
```

---

## Core Rule

```text
Vault is not for secrets.
Secrets go in secret references.
```

The compiler enforces this. Any value that looks like a secret key or token
triggers a diagnostic and must be moved to a `secret` reference.

---

## vault global Block

```galerina
vault global {
  app.name: String = "ConsumerThoughts"
  app.region: Region = "uk"
  api.version: SemVer = "1.0.0"
  limits.maxUploadMb: Int = 25
  features.searchEnabled: Bool = true
  payments.provider: String = "stripe"
  payments.currency: Currency = "GBP"
}
```

Values in the config vault are:
- Read-only after boot
- Typed (not raw strings)
- Validated at compile time
- Safe to include in runtime reports

---

## Accessing Vault Values

### Typed property access (preferred)

```galerina
let maxUpload = vault.limits.maxUploadMb
```

```galerina
let region = vault.app.region
```

### Generic key access

```galerina
let maxUpload: Megabytes =
  vault.get<Megabytes>("limits.maxUploadMb")
```

---

## What Goes in the Config Vault

```text
app name and version
feature flags
size limits and quotas
public URLs and base paths
regions and locale defaults
retry counts and timeout defaults
route defaults
UI labels and copy strings (non-localised)
safe provider names
algorithm preferences (non-secret)
```

Example with rich types:

```galerina
vault global {
  app.name:              String   = "Galerina Shop"
  app.region:            Region   = "eu-west-2"
  api.version:           SemVer   = "2.1.0"
  limits.maxUploadMb:    Int      = 25
  limits.requestTimeout: Duration = "30s"
  limits.maxRetries:     Int      = 3
  features.search:       Bool     = true
  features.payments:     Bool     = true
  payments.provider:     String   = "stripe"
  payments.currency:     Currency = "GBP"
  uploads.allowedTypes:  Array<MimeType> = ["image/png", "image/jpeg", "application/pdf"]
}
```

---

## What Does Not Go in the Config Vault

```text
API keys
signing keys
passwords
tokens
credentials
anything that would be a ProtectedSecret<T>
```

The compiler enforces this with pattern detection:

```galerina
vault global {
  stripe.key: String = "sk_live_abc123"  // SPORE-VAULT-001
}
```

```text
SPORE-VAULT-001: Secret-like value found in config vault.
Use a secret reference instead:
  secret STRIPE_API_KEY {
    from vault "vault://payments/stripe"
  }
```

---

## vault global vs .env vs secret

The recommended four-layer model:

| Layer | Purpose | Examples |
| --- | --- | --- |
| `vault global` | Typed non-secret app config | app name, feature flags, limits |
| `.env` | Deployment-injected values (dev/CI only) | `DATABASE_URL`, `APP_PORT` |
| `secret {}` | Protected sensitive values | API keys, signing keys, passwords |
| `manifest` | Generated build truth | routes, effects, capabilities |

Production example split:

```galerina
vault global {
  app.name: String = "Galerina Shop"
  payments.provider: String = "stripe"
  payments.currency: Currency = "GBP"
}

secret STRIPE_API_KEY {
  from vault "vault://payments/stripe"
  provider "stripe"
}
```

---

## Config Vault vs GlobalVault

| | Config Vault | GlobalVault |
| --- | --- | --- |
| Purpose | Typed read-only configuration | Mutable runtime state |
| Written at | Compile time / boot | Runtime |
| Mutability | Read-only after boot | Mutable with `vault.set()` |
| Scope | Application-wide | Scoped by vault key |
| Values | Non-secret config | Any safe runtime value |
| Reports | Safe to include | Subject to mutation audit |

See `variable-mutation-vault-design.md` for GlobalVault.

---

## TypeScript Shape

```ts
export interface ConfigVaultEntry<T> {
  readonly key: string;
  readonly value: T;
  readonly type: ConfigValue["kind"];
}

export interface ConfigVaultSchema {
  readonly [dotPath: string]: ConfigVaultEntry<unknown>;
}

export interface ConfigVaultResult {
  readonly entries: ConfigVaultSchema;
  readonly diagnostics: ConfigDiagnostic[];
}

export function getVaultEntry<T>(
  vault: ConfigVaultSchema,
  key: string
): T | undefined;
```

---

## Diagnostic Codes (SPORE-VAULT series)

| Code | Name | Meaning |
| --- | --- | --- |
| `SPORE-VAULT-001` | SECRET_IN_VAULT | Secret-like value found in config vault — use `secret {}` reference instead |
| `SPORE-VAULT-002` | VAULT_KEY_INVALID | Config vault key does not match `segment.segment` dot-path format |
| `SPORE-VAULT-003` | VAULT_TYPE_MISMATCH | Config vault value cannot be coerced to declared type |
| `SPORE-VAULT-004` | VAULT_KEY_MISSING | Required vault key is not present in vault global block |
| `SPORE-VAULT-005` | VAULT_MUTATION_DENIED | Attempt to write to config vault at runtime (config vault is read-only) |

---

## Compiler Enforcement

The compiler checks config vault values at compile time:

```text
Detects secret-pattern strings (SPORE-VAULT-001):
  Heuristics: "sk_live_", "sk_test_", "_KEY", "_SECRET", "_PASSWORD",
              "-----BEGIN", base64-looking high-entropy values

Validates type declarations against value kinds (SPORE-VAULT-003)

Validates dot-path key format (SPORE-VAULT-002)

Rejects vault.set() calls at runtime (SPORE-VAULT-005)
```

---

## Package Ownership

```text
galerina-core-config   → ConfigVaultEntry, ConfigVaultSchema, ConfigVaultResult, SPORE-VAULT-001–005
galerina-core-compiler → vault global block parsing; secret-pattern detection; type checking
galerina-core          → vault.get<T>() runtime accessor
```

---

## Related

```text
galerina-core-config-environment-secrets.md   SecretConfigSource; .env integration
galerina-core-config-dotenv-trust-model.md    .env trust levels and production warnings
variable-mutation-vault-design.md           GlobalVault — mutable runtime state
vault-write-syntax.md                       vault write/mutation syntax
scoped-vaults.md                            per-actor scoped vaults
```
