# Galerina Security

`galerina-core-security` is the package for reusable Galerina security primitives and security
report contracts.

## Coverage Reconciliation Status

**Conflict resolved (2026-05-26).** Canonical public API:

```text
ProtectedSecret<T>.unwrapForApprovedSink(sink)   ← canonical public API
private revealUnsafeForRuntimeOnly()              ← internal runtime use only
```

`unwrapForApprovedSink(sink)` is the only public unwrap path. It validates the
sink before releasing the value and emits `SPORE-SECRET-001` on an unapproved sink.
`revealUnsafeForRuntimeOnly()` must not appear in public APIs, framework
adapters, diagnostics, reports, or AI context. The `galerina-core-security-v02.md`
KB has been updated to reflect this decision.

Galerina's strongest honest security position is application security policy. This
package helps make permissions, typed API boundaries, package effects, secrets,
interop, production rules and AI-readable reports visible and enforceable before
code runs.

It belongs in:

```text
/packages-galerina/galerina-core-security
```

Use this package for:

```text
SecureString model helpers
Secret<T> / protected secret reference contracts
redaction primitives
permission model types
policy definition and effective policy contracts
capability grant and boundary report contracts
capability lease and attenuation contracts
AI authority request decision contracts
immutable trust-root protection diagnostics
malicious data validation diagnostics
exploit-resistance baseline mappings
taint-flow and safe-sink diagnostics
hardware risk security report inputs
security diagnostics
security report contracts
safe token/cookie/header handling helpers
secret taint tracking and safe sink decisions
cryptographic policy types
post-quantum crypto policy planning
crypto inventory report contracts
network permission decision integration
security report creation
```

## Boundary

`galerina-core-security` provides shared primitives. It should not own application auth
flows, route enforcement or HTTP parsing.

```text
auth provider workflows -> galerina-framework-app-kernel
route auth enforcement  -> galerina-framework-app-kernel
HTTP header parsing     -> galerina-framework-api-server
network policy shape    -> galerina-core-network
task permission checks  -> galerina-core-tasks
compiler security rules -> galerina-core / galerina-core-compiler
```

## Contracts

The package defines:

```text
SecureStringReference
SecretReference
SecretDerivedReference
RedactionRule
RedactionResult
PermissionModel
PermissionDecision
SafeTokenReference
SafeCookieReference
SafeHeaderReference
CryptographicPolicy
SecurityDiagnostic
SecurityReport
```

Use `SecureStringReference` and safe token/cookie/header helpers to represent
sensitive values without storing the real value in source-controlled reports.
Use redaction helpers before writing diagnostics, logs or report text that may
include secrets.

Use protected secret references for `.env` values and runtime secrets. A secret
reference may expose metadata such as name, required flag, scope, fingerprint
and allowed operation, but it must not expose the raw value to reports,
diagnostics, AI context or normal strings. Values derived from secrets should
remain secret-derived until an approved secret-safe sink consumes them.

## Secret Reference Model

Secret references represent sensitive values without exposing their contents.

### Core Types

```ts
export interface SecretReference {
  name: string
  required: boolean
  scope: string
  fingerprint?: string
  allowedOperation?: string
  protected: true
}

export interface SecretDerivedReference {
  source: SecretReference
  derivedKind: "hash" | "token" | "signature" | "connection-string"
  protected: true
}

export interface SecureStringReference {
  label: string
  redacted: true
  fingerprint?: string
}
```

### ProtectedSecret Class

```ts
export class ProtectedSecret {
  toString(): string { return "[REDACTED]" }
  useWithApprovedSink<T>(sink: SecretSafeSink, operation: (value: string) => T): T
}
```

### SecretSafeSink Type

```ts
export interface SecretSafeSink {
  name: string
  kind: "network" | "crypto" | "database" | "token"
  approved: boolean
}
```

Safe sinks: declared network destination, approved cryptographic operation,
approved token signing, database connection initialization.

Unsafe sinks: logs, errors, AI prompts, build output, cache, telemetry,
normal string conversion.

### Secret Validation Functions

```ts
function canSendSecretToSink(secret: SecretReference, sink: SecretSafeSink): boolean
function redactSecretValue(value: string): RedactionResult
```

### Diagnostic Codes (SPORE-SECRET series)

| Code | Meaning |
| --- | --- |
| `SPORE-SECRET-001` | required secret unavailable |
| `SPORE-SECRET-002` | secret value attempted to flow to unsafe sink |

See `docs/Knowledge-Bases/galerina-core-config-environment-secrets.md` for the
full secret reference model specification.

## Architecture Depth: TypeScript Contracts (v0.2 Specification)

### SecretSource (Discriminated Union)

```ts
export type SecretSource =
    | { type: "env";     variable: string }
    | { type: "vault";   provider: "aws-secrets-manager" | "gcp-secret-manager" | "azure-key-vault" | "hashicorp-vault" | "custom"; key: string }
    | { type: "kms";     keyId: string; provider?: string }
    | { type: "runtime"; name: string }
    | { type: "oauth";   provider: string }
    | { type: "token";   name: string }
```

### SecretCategory

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

### SecretRedactionPolicy

```ts
export interface SecretRedactionPolicy {
    mode: "full" | "partial" | "hashOnly"
    replacement: "[REDACTED_SECRET]"
    showPrefixChars?: number    // partial only; avoid in production
    showSuffixChars?: number
    allowFingerprint: boolean   // keyed HMAC hash, not raw value
}
```

### SecretReference (Extended v0.2)

```ts
export interface SecretReference {
    id: string
    name: string
    source: SecretSource
    category: SecretCategory
    provider?: string           // e.g. "stripe", "openai", "postgres"
    environmentScope: "development" | "test" | "staging" | "production" | "any"
    allowedSinks: string[]
    deniedSinks: string[]
    allowDerivation: boolean
    redaction: SecretRedactionPolicy
    // kept from v0.1
    required: boolean
    scope: string
    fingerprint?: string
    allowedOperation?: string
    protected: true
}
```

### SecretDerivedReference (Extended)

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

export type SecretDerivation =
    | { type: "hmac";        algorithm: "sha256"|"sha384"|"sha512"; purpose: "webhook_signature"|"request_signature"|"custom" }
    | { type: "hash";        algorithm: "sha256"|"sha512"|"argon2id"|"bcrypt"; purpose: "fingerprint"|"credential_check"|"custom" }
    | { type: "tokenExchange"; provider: string; purpose: "oauth_access_token"|"session_token"|"custom" }
    | { type: "keyDerivation"; algorithm: "hkdf"|"pbkdf2"|"scrypt"|"argon2id"; purpose: "encryption"|"signing"|"custom" }
```

### SecureStringReference (Extended)

```ts
export interface SecureStringReference {
    id: string
    name: string
    source: "http_header" | "cookie" | "request_body" | "query_parameter" | "runtime" | "derived" | "unknown"
    category: "authorization_header" | "cookie" | "jwt" | "session_id" | "password" | "webhook_signature" | "signed_url" | "temporary_token" | "custom"
    lifetime: "request" | "job" | "process" | "persistent"
    redaction: SecretRedactionPolicy
    label: string
    redacted: true
    fingerprint?: string
}
```

### ProtectedSecret<T> (Full Implementation)

```ts
export class ProtectedSecret<T> {
    readonly kind = "ProtectedSecret"

    constructor(
        private readonly value: T,
        public readonly reference: SecretReference | SecretDerivedReference | SecureStringReference
    ) {}

    unwrapForApprovedSink(sink: SecretSafeSink): T {
        if (!canSendSecretToSink(this.reference, sink)) {
            throw new SecretPolicyError("SPORE-SECRET-001",
                `Secret ${this.reference.name} cannot be sent to sink ${sink.id}`)
        }
        return this.revealUnsafeForRuntimeOnly()
    }

    toString(): string { return "[REDACTED_SECRET]" }
    toJSON(): string   { return "[REDACTED_SECRET]" }

    /** Internal runtime use only — must not appear in public APIs. */
    private revealUnsafeForRuntimeOnly(): T { return this.value }
}
```

### SecretSafeSink (Extended)

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
    // kept from v0.1
    name: string
    kind: "network" | "crypto" | "database" | "token"
    approved: boolean
}

export const LOG_SINK: SecretSafeSink          // productionSafe: false, redactedOnly: true
export const API_RESPONSE_SINK: SecretSafeSink  // productionSafe: false, redactedOnly: true
export const STRIPE_AUTH_HEADER_SINK: SecretSafeSink  // productionSafe: true, redactedOnly: false
```

### SecretDiagnostic

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

### Compile-Time Taint Tracking

```ts
export type SecretTaint =
    | { kind: "none" }
    | { kind: "secret";        referenceId: string }
    | { kind: "derivedSecret"; referenceId: string }
    | { kind: "secureString";  referenceId: string }

export function combineTaint(left: SecretTaint, right: SecretTaint): SecretTaint

// Emits SPORE-SECRET-002 on tainted string concatenation
export function checkStringConcat(input: {
    left: ExpressionInfo; right: ExpressionInfo; location: SourceLocation
}): SecretDiagnostic[]

// Emits SPORE-SECRET-001 on unsafe sink
export function checkSecretSink(input: {
    secret: SecretReference; sink: SecretSafeSink; location: SourceLocation
}): SecretDiagnostic[]
```

### Runtime Helpers

```ts
// Safe logger: redacts any ProtectedSecret in fields before writing
export function safeLog(message: string, fields: Record<string, unknown>): void

// Fingerprint helper: HMAC-SHA256 with runtime salt (first 16 hex chars)
export function createSecretFingerprint(input: {
    rawSecret: string; runtimeSalt: string
}): string

// Build Authorization header after sink approval check
export function buildAuthorizationHeader(input: {
    secret: ProtectedSecret<string>; sink: SecretSafeSink
}): Record<string, string>
```

### Internal File Layout

```text
packages-galerina/galerina-core-security/src/
  secrets/
    secret-reference.ts        ← SecretReference, SecretSource, SecretCategory, SecretRedactionPolicy
    secret-derived-reference.ts ← SecretDerivedReference, SecretDerivation
    secure-string-reference.ts ← SecureStringReference
    protected-secret.ts        ← ProtectedSecret<T>
    secret-safe-sink.ts        ← SecretSafeSink, LOG_SINK, API_RESPONSE_SINK
    secret-policy.ts           ← canSendSecretToSink()
    secret-redaction.ts        ← redactSecretValue(), createSecretFingerprint()
    secret-diagnostics.ts      ← SecretDiagnostic, SPORE-SECRET-001, SPORE-SECRET-002
    secret-report.ts           ← galerina.secret.report.v1
  checks/
    check-secret-sink.ts       ← checkSecretSink()
    check-secret-string-conversion.ts ← checkStringConcat()
    secret-taint.ts            ← SecretTaint, combineTaint()
  runtime/
    secret-resolver.ts
    safe-log.ts                ← safeLog(), redactObject()
    safe-json.ts
```

## Safety Contracts

Security helpers must fail closed when a helper cannot prove that output is
safe.

```text
redaction input over the configured maximum is fully redacted
invalid redaction rules fully redact by default
redaction replacements that can re-emit full matches or surrounding context are rejected
permission models deny by default
policy conflicts fail closed unless explicitly resolved
effective policy must be reportable
effects are not actor authorization
protected actions and protected data exposure require capabilities or permissions
AI actors may request capabilities but must not self-grant or self-approve them
capability leases must be scoped, revocable, auditable and no broader than the approver chain
trust roots must not be modified by runtime AI without external governance
data cannot grant authority; input claims for role, ownership or permission must be verified
untrusted input must pass through size, depth, schema, type, range, canonicalisation and ownership checks
unsafe sinks such as SQL, shell, filesystem paths, URLs, HTML, logs, prompts, deserializers, native interop and hardware queues require typed safe operations
explicit deny grants take precedence over allow grants
default-allow and wildcard-allow permission models are diagnosed
network.any, rawSocket, packetCapture and promiscuousMode are denied by default
weak crypto algorithms must not appear in allowed algorithm lists
cryptographic choices must be policy-driven and reportable
Random must not be used for secrets, keys, tokens, salts or nonces
post-quantum readiness must be reported through crypto inventory evidence
raw SQL, shell execution and unsafe interop are production risks by default
secret flows to logs, AI prompts, external APIs and errors are reported
secret values are denied from logs, errors, cache, LLM input, build output and reports
secrets may be sent only to declared network destinations or approved cryptographic operations
```

Callers can choose `onInvalidRule: "skip"` or `"throw"` for compatibility, but
the default redaction mode is `fail-closed`.

Final rule:

```text
galerina-core-security provides reusable security primitives.
galerina-core-network defines network policy and report contracts.
galerina-framework-app-kernel enforces application security policy.
galerina-core and galerina-core-compiler check language-level security contracts.
```
