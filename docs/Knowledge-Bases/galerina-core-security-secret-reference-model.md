# Galerina Core Security — Secret Reference Model with Taint Tracking

**Package:** `galerina-core-security`
**Version Target:** v0.2 Draft
**Status:** Architecture + Type Contracts + Runtime Helper Design

See also: `galerina-core-security-v02.md` (v0.2 formal spec),
`data-in-motion-security.md`, `model-security-contracts.md`.

Note on version conflicts: This document represents the architecture
specification form of `galerina-core-security`. The v0.2 formal spec KB
(`galerina-core-security-v02.md`) uses different field shapes for several
types — specifically `SecretSource`, `SecretTaint`, `SecretRedactionPolicy`,
`ProtectedSecret<T>`, and `SecretReference`. See conflict notes below.

---

## Overview

`galerina-core-security` defines reusable security primitives and secret-safe
runtime contracts for the Galerina ecosystem.

Design goal:

```text
secret value → protected reference → governed flow → approved sink
```

Rather than:

```text
secret → string → accidental exposure
```

The package prevents:
- accidental logging
- AI prompt leakage
- telemetry leakage
- unsafe string conversion
- unsafe report generation
- accidental serialization
- unsafe cache persistence
- unsafe runtime propagation

While still allowing:
- approved network authentication
- cryptographic operations
- runtime token generation
- secure database connection initialization
- governed secret derivation

---

## SecretSource (Discriminated Union)

```ts
export type SecretSource =
    | { type: "env";          variable: string }
    | { type: "file";         path: string; key?: string }
    | { type: "secretStore";  provider: "aws-secrets-manager" | "gcp-secret-manager" | "azure-key-vault" | "vault" | "custom"; key: string }
    | { type: "runtimeInjected"; name: string }
```

Represents where a secret originated, allowing reasoning about deployment
requirements, provider dependencies, trust boundaries, and production readiness.

Note: The v0.2 formal spec (`galerina-core-security-v02.md`) uses a different
6-value discriminated union: `"environment"/"vault"/"kms"/"runtime"/"oauth"/"token"`.
This architecture spec uses the 4-value form above with provider details inside
the `secretStore` variant.

---

## SecretCategory (13 Values — String Union)

```ts
export type SecretCategory =
    | "api_token"
    | "oauth_client_secret"
    | "jwt_signing_key"
    | "webhook_signing_secret"
    | "database_password"
    | "private_key"
    | "session_secret"
    | "encryption_key"
    | "payment_provider_token"
    | "smtp_password"
    | "cloud_access_key"
    | "ai_provider_token"
    | "custom"
```

Note: The v0.2 formal spec defines `SecretCategory` as an enum with different
value names (ApiKey/Password/AccessToken/RefreshToken/SessionToken/OAuthSecret/
PrivateKey/SigningKey/EncryptionKey/Certificate/RuntimeCredential/DatabaseCredential/
InternalSecret). This architecture spec uses snake_case string union values.

---

## SecretRedactionPolicy

```ts
export interface SecretRedactionPolicy {
    mode: "full" | "partial" | "hashOnly"
    replacement: "[REDACTED_SECRET]"
    showPrefixChars?: number
    showSuffixChars?: number
    allowFingerprint: boolean
}
```

| Mode | Behaviour |
| --------- | -------------------------------------- |
| `full` | Completely hides the value |
| `partial` | Exposes only limited prefix/suffix |
| `hashOnly` | Exposes only a keyed fingerprint |

Production systems should use `mode: "full"`.

Note: The v0.2 formal spec uses `{redactInLogs, redactInReports, redactInAuditStreams, allowPartialReveal}` fields instead.

---

## SecretReference v0.2 (Architecture Form)

```ts
export interface SecretReference {
    id: string
    name: string
    source: SecretSource
    category: SecretCategory
    provider?: string
    environmentScope: "development" | "test" | "staging" | "production" | "any"
    allowedSinks: string[]
    deniedSinks: string[]
    allowDerivation: boolean
    redaction: SecretRedactionPolicy
    required: boolean
    scope: string
    fingerprint?: string
    allowedOperation?: string
    protected: true
}
```

Note: The v0.2 formal spec uses a simpler `{id, source, category, createdAt}` shape.
This architecture form includes full sink governance, derivation flags, and
environment scoping.

---

## SecretDerivedReference

```ts
export interface SecretDerivedReference {
    id: string
    parentSecretId: string
    name: string
    derivation: SecretDerivation
    allowedSinks: string[]
    expiresAt?: string
    redaction: SecretRedactionPolicy
    source: SecretReference
    derivedKind: "hash" | "token" | "signature" | "connection-string"
    protected: true
}
```

Derived secrets remain protected. They do not become normal strings.

---

## SecretDerivation (Discriminated Union)

```ts
export type SecretDerivation =
    | { type: "hmac";         algorithm: "sha256" | "sha384" | "sha512";  purpose: "webhook_signature" | "request_signature" | "custom" }
    | { type: "hash";         algorithm: "sha256" | "sha512" | "argon2id" | "bcrypt"; purpose: "fingerprint" | "credential_check" | "custom" }
    | { type: "tokenExchange"; provider: string; purpose: "oauth_access_token" | "session_token" | "custom" }
    | { type: "keyDerivation"; algorithm: "hkdf" | "pbkdf2" | "scrypt" | "argon2id"; purpose: "encryption" | "signing" | "custom" }
```

---

## SecureStringReference (Extended)

```ts
export interface SecureStringReference {
    id: string
    name: string
    source:    "http_header" | "cookie" | "request_body" | "query_parameter" | "runtime" | "derived" | "unknown"
    category:  "authorization_header" | "cookie" | "jwt" | "session_id" | "password" | "webhook_signature" | "signed_url" | "temporary_token" | "custom"
    lifetime:  "request" | "job" | "process" | "persistent"
    redaction: SecretRedactionPolicy
    label: string
    redacted: true
    fingerprint?: string
}
```

---

## ProtectedSecret\<T\> (Full Implementation)

```ts
export class ProtectedSecret<T> {
    readonly kind = "ProtectedSecret"

    constructor(
        private readonly value: T,
        public readonly reference:
            | SecretReference
            | SecretDerivedReference
            | SecureStringReference
    ) {}

    unwrapForApprovedSink(sink: SecretSafeSink): T {
        if (!canSendSecretToSink(this.reference, sink)) {
            throw new SecretPolicyError(
                "SPORE-SECRET-001",
                `Secret ${this.reference.name} cannot be sent to sink ${sink.id}`
            )
        }
        return this.value
    }

    toString(): string  { return "[REDACTED_SECRET]" }
    toJSON():   string  { return "[REDACTED_SECRET]" }
}
```

Note: The v0.2 formal spec uses `reveal()` as the unwrap method. This
architecture spec uses `unwrapForApprovedSink(sink)` which requires explicit
sink approval before revealing. Both prevent accidental exposure; the
`unwrapForApprovedSink` form provides stronger sink-level governance.

---

## SecretSafeSink (Interface — 14 type values)

```ts
export interface SecretSafeSink {
    id: string
    type:
        | "https_header_authorization"
        | "https_body"
        | "webhook_verifier"
        | "database_password"
        | "jwt_signer"
        | "encryption_module"
        | "tls_client_auth"
        | "log"
        | "api_response"
        | "query_string"
        | "error_message"
        | "report"
        | "ai_context"
        | "unknown"
    provider?: string
    transport: "none" | "http" | "https" | "internal" | "native"
    productionSafe: boolean
    redactedOnly: boolean
    name: string
    kind: "network" | "crypto" | "database" | "token"
    approved: boolean
}
```

Safe sink constants: `LOG_SINK`, `API_RESPONSE_SINK`, `STRIPE_AUTH_HEADER_SINK`.

Safe sinks: approved HTTPS authorization headers, approved JWT signers, approved
encryption modules, approved database initialization.

Unsafe sinks: logs, telemetry, AI prompts, reports, exceptions, query strings,
JSON serialization, cache persistence.

---

## SecretTaint (Discriminated Union)

```ts
export type SecretTaint =
    | { kind: "none" }
    | { kind: "secret";        referenceId: string }
    | { kind: "derivedSecret"; referenceId: string }
    | { kind: "secureString";  referenceId: string }
```

Note: The v0.2 formal spec models `SecretTaint` as a plain interface with a
`propagationChain: string[]` array. This architecture spec uses a discriminated
union with `kind` field for compile-time taint category discrimination.

### combineTaint()

```ts
export function combineTaint(
    left: SecretTaint,
    right: SecretTaint
): SecretTaint
```

Any operation involving secret-tainted values remains tainted.

---

## Compile-Time Checks

### checkStringConcat()

```ts
export function checkStringConcat(input: {
    left: ExpressionInfo
    right: ExpressionInfo
    location: SourceLocation
}): SecretDiagnostic[]
```

Emits `SPORE-SECRET-002` when secret-tainted values flow into unsafe string
creation.

### checkSecretSink()

```ts
export function checkSecretSink(input: {
    secret: SecretReference
    sink: SecretSafeSink
    location: SourceLocation
}): SecretDiagnostic[]
```

Emits `SPORE-SECRET-001` when a protected secret is sent to an unsafe sink.

---

## SecretDiagnostic

```ts
export interface SecretDiagnostic {
    code: "SPORE-SECRET-001" | "SPORE-SECRET-002"
    severity: "error" | "warning"
    message: string
    secretName?: string
    sinkId?: string
    sourceLocation?: SourceLocation
    suggestion?: string
}
```

---

## Runtime Helpers

### safeLog()

```ts
export function safeLog(
    message: string,
    fields: Record<string, unknown>
): void
```

Automatically redacts `ProtectedSecret`, `SecretReference`, and
`SecureStringReference` before logging.

### createSecretFingerprint()

```ts
export function createSecretFingerprint(input: {
    rawSecret: string
    runtimeSalt: string
}): string
```

Recommended implementation: `HMAC-SHA256(runtimeSalt, secret)`.
Output exposes only first 16 hex characters. Never expose raw hashes.

### buildAuthorizationHeader()

```ts
export function buildAuthorizationHeader(input: {
    secret: ProtectedSecret<string>
    sink: SecretSafeSink
}): Record<string, string>
```

1. Validates sink approval
2. Unwraps secret safely via `unwrapForApprovedSink()`
3. Builds header
4. Prevents accidental unsafe propagation

---

## Internal File Layout

```text
packages-galerina/galerina-core-security/src/

  secrets/
    secret-reference.ts
    secret-derived-reference.ts
    secure-string-reference.ts
    protected-secret.ts
    secret-safe-sink.ts
    secret-policy.ts
    secret-redaction.ts
    secret-diagnostics.ts
    secret-report.ts

  checks/
    check-secret-sink.ts
    check-secret-string-conversion.ts
    secret-taint.ts

  runtime/
    secret-resolver.ts
    safe-log.ts
    safe-json.ts
```

---

## Safety Rules

The package must fail closed. Unsafe behaviour is rejected by default.

Never allowed:
```text
secret → console.log
secret → telemetry
secret → AI prompt
secret → exception text
secret → report serialization
secret → cache persistence
secret → normal string interpolation
```

Allowed under governance:
```text
secret → approved HTTPS authorization sink
secret → approved crypto operation
secret → approved token exchange
secret → approved database initialization
```

---

## Diagnostic Codes

| Code | Meaning |
| --------------- | -------------------------------------------------------- |
| `SPORE-SECRET-001` | Secret sent to unsafe sink |
| `SPORE-SECRET-002` | Secret-tainted value flowed into unsafe string operation |

---

## Version Conflict Summary

| Item | This architecture spec | v0.2 formal spec (galerina-core-security-v02.md) |
| ----------------------- | --------------------------------- | --------------------------------------- |
| `SecretSource` | 4-value union: env/file/secretStore/runtimeInjected | 6-value union: environment/vault/kms/runtime/oauth/token |
| `SecretCategory` | 13-value snake_case string union | 13-value PascalCase enum |
| `SecretRedactionPolicy` | mode/replacement/showPrefixChars/showSuffixChars/allowFingerprint | redactInLogs/redactInReports/redactInAuditStreams/allowPartialReveal |
| `SecretReference` | Full governance fields (12+ fields) | Simple {id/source/category/createdAt} |
| `ProtectedSecret<T>` | `unwrapForApprovedSink(sink)` | `reveal()` |
| `SecretTaint` | Discriminated union {kind:"none"/"secret"/"derivedSecret"/"secureString"} | Interface {tainted/source/propagationChain[]} |
| `SecretDerivation` | 4-variant discriminated union (hmac/hash/tokenExchange/keyDerivation) | Simple {operation/timestamp} |
