# Galerina Security — Secret Safety: Constant-Time, Codegen and HSM

## Overview

Three related security rules govern how secrets are compared, how code
generators treat secret values, and how secrets are sourced from hardware:

1. **Constant-time comparison** — `==` on secret types is a compiler error
2. **Secret-oblivious codegen** — secret values must not control branches or memory addresses
3. **HSM/KMS as first-class vault sources** — secrets should not be bottlenecked through env vars

---

## 1. Constant-Time Secret Comparison

### The Problem

Ordinary `==` uses early-exit comparison. For secrets, this leaks how many
bytes matched before the first mismatch — a timing side channel.

### Compiler Rule

`ProtectedSecret<T>` and `SecureString` do not implement ordinary equality.
The only comparison method is `.constantTimeEquals()`:

```galerina
// Invalid
if storedToken == suppliedToken { allow() }

// Valid
let ok: SecretComparison = storedToken.constantTimeEquals(suppliedToken)
```

### SecretComparison Type

```galerina
enum SecretComparison {
  Match
  NoMatch
}
```

This avoids treating a secret comparison result as a general-purpose boolean in
logs, reports or unintended branching contexts.

### Constant-Time Contract

For fixed-size secrets, the lowering must be equivalent to:

```text
accumulator = 0
for i in 0..N:
  accumulator |= self[i] XOR other[i]
return accumulator == 0
```

The loop count is derived from the public type-level size `N`, not secret data.

For variable-length secrets, a padded comparison over the full maximum capacity
must be used. Three policies apply:

| Policy | Description |
|---|---|
| `fixed_size` | Best for tokens, hashes, MACs, keys, nonces (type carries length) |
| `padded_capacity` | Variable-length stored in fixed-size padded buffer |
| `length_public` | Length is explicitly declared non-secret |

### Diagnostics

| Code | Meaning |
|---|---|
| `LN-SEC-SECRET-EQ-001` | `ProtectedSecret<T>` compared with `==` |
| `LN-SEC-SECRET-EQ-002` | `ProtectedSecret<T>` compared with `!=` |
| `LN-SEC-SECRET-ORDER-001` | `ProtectedSecret<T>` used in ordering operation |
| `LN-SEC-SECRET-LEN-001` | Variable-length secret comparison without explicit length policy |

---

## 2. Secret-Oblivious Code Generation

### The Problem

A source-level ban on secret comparisons is incomplete if the optimiser or
backend can reintroduce the equivalent pattern. The compiler must guarantee
that generated code is secret-oblivious at all levels.

### Rule

Secret-labelled values must not affect:
- conditional branch predicates
- loop counts or loop break/continue conditions
- memory access addresses or array indices
- `match` discriminants
- early return predicates
- backend fallback path selection
- generated report-visible metadata

unless the operation passes through an approved constant-time/secret-safe
primitive.

### Invalid Patterns

```galerina
// Branch on secret — SPORE-SECURITY-SECRET-BRANCH
if apiKey == candidate { grantAccess() }

// Secret-dependent array index — SPORE-SECURITY-SECRET-INDEX
let b = table[secretByte]

// Secret-dependent loop shape — SPORE-SECURITY-SECRET-LOOP-SHAPE
for i in 0..secret.length {
  if secret[i] != expected[i] { return false }
}
```

### Compiler IR Labels

The compiler must propagate secret-ness through the IR:

```text
Public<T>
Secret<T>
ProtectedSecret<T>
SecretLen<T>         -- length is also sensitive
SecretIndex<T>       -- derived index/address is sensitive
Declassified<T>      -- after approved reveal/declassify
```

### Approved Primitive Contract

```galerina
@constant_time
@secret_oblivious
native intrinsic constantTimeEquals(
  a: ProtectedSecret<Bytes>,
  b: ProtectedSecret<Bytes>
) -> SecretComparison
```

The compiler must not replace this intrinsic with ordinary `memcmp`-style code
during optimisation. Backend-specific tests for each approved target are required.

### Codegen Diagnostics

| Code | Meaning |
|---|---|
| `SPORE-SECURITY-SECRET-BRANCH` | Secret-derived branch condition |
| `SPORE-SECURITY-SECRET-INDEX` | Secret-derived memory index or address |
| `SPORE-SECURITY-SECRET-LOOP-SHAPE` | Secret-derived loop count or break |
| `SPORE-SECURITY-SECRET-MATCH` | Secret-derived match discriminant |
| `SPORE-SECURITY-SECRET-CODEGEN` | Backend would emit secret-dependent pattern |
| `SPORE-SECURITY-SECRET-OPTIMIZATION` | Optimisation would alter constant-time behaviour |
| `SPORE-SECURITY-SECRET-BACKEND-UNPROVEN` | Target has no approved constant-time implementation |

### Machine-Readable Report

```json
{
  "secret_oblivious_codegen": true,
  "secret_branches_rejected": 2,
  "secret_indexes_rejected": 1,
  "constant_time_primitives_used": ["ProtectedSecret.constantTimeEquals"],
  "backend": "wasm",
  "warnings": []
}
```

---

## 3. HSM and KMS as First-Class Vault Sources

### The Problem

When policy says a secret comes from an HSM or KMS but the runtime first
materialises it into an environment variable, the policy is misleading. Audit
reports may say "HSM" while the actual runtime behaviour was "env string."

### Source Hierarchy

```text
env       — process or container environment (local/dev)
vault     — software secret manager (HashiCorp Vault, AWS Secrets Manager)
kms       — key management system (decrypt/sign without exposing key material)
hsm       — hardware-backed key operation (key may never leave device)
```

### Syntax

```galerina
secret StripeKey: ApiKey from hsm "STRIPE_KEY" {
  provider aws_kms
  region "eu-west-2"
  fallback deny
  exportable false
  rotate every 30d
}
```

Environment-specific fallback:

```galerina
secret_source StripeKey {
  production from hsm "STRIPE_KEY"
  development from env "STRIPE_KEY"
  fallback "deny"
}
```

### Key Handles (Non-Exportable Keys)

For keys that must never leave the HSM:

```galerina
key PaymentSigner from hsm "PAYMENT_SIGNING_KEY" {
  provider yubikey
  exportable false
  usage [sign]
}

let signature = PaymentSigner.sign(payload)
```

`KeyHandle<T>` never enters application memory as key material. Only operations
(sign, decrypt, verify) are performed through the handle.

### Runtime Contract

The runtime must NOT silently translate:

```text
hsm → env → string
```

It must preserve:

```text
hsm → provider operation → ProtectedSecret<T> or KeyHandle<T> → audited use
```

### HSM Diagnostics

| Code | Meaning |
|---|---|
| `SPORE-SECURITY-HSM-001` | HSM source requires explicit provider policy |
| `SPORE-SECURITY-HSM-002` | HSM secret cannot be downgraded to `String` |
| `SPORE-SECURITY-HSM-003` | Non-exportable key cannot be revealed |
| `SPORE-SECURITY-HSM-004` | HSM access requires `secret/kms` permission |
| `SPORE-SECURITY-HSM-005` | HSM provider fallback to env is denied |
| `SPORE-SECURITY-HSM-006` | Production profile must reject mock/local HSM providers |
| `SPORE-SECURITY-HSM-007` | Secret source mismatch must appear in security reports |

---

## Architecture Placement

| Layer | Responsibility |
|---|---|
| `galerina-core` | Language rules: secret types cannot use `==`, `!=`, ordering, unsafe reveal |
| `galerina-core-compiler` | Secret IR propagation, intrinsic recognition, optimisation barriers, source-mapped errors |
| `galerina-core-security` | `ProtectedSecret<T>`, `SecureString`, `SecretComparison`, `KeyHandle<T>`, redaction, HSM abstractions |
| `galerina-core-runtime` | Provider resolution, secret lifecycle, checked execution |
| `galerina-core-config` | Environment-specific secret source configuration |
| `galerina-core-reports` | Secret comparison sites, reveal events, HSM provider metadata in audit reports |
| `galerina-target-wasm` / `galerina-target-native` | Backend-specific constant-time lowering and tests |
| Provider packages | `galerina-secret-aws-kms`, `galerina-secret-azure-keyvault`, `galerina-secret-yubikey`, `galerina-secret-tpm` |

---

## Tests Required

1. `ProtectedSecret<T> == ProtectedSecret<T>` fails compilation.
2. `.constantTimeEquals()` loops over full static or padded size.
3. Variable-size comparison requires explicit length policy.
4. Generated reports include secret comparison sites without exposing values.
5. Optimiser does not replace the intrinsic with early-exit comparison.
6. WASM and native backends pass backend-specific constant-time tests.
7. HSM fallback to env is denied when policy says `fallback deny`.
8. Non-exportable `KeyHandle<T>` never appears in report output as key bytes.
