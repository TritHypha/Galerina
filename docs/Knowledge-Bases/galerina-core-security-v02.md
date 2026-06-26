> ⚠️ **SUPERSEDED** — This is a v0.2 historical document. Current spec: see See Also links.

# Galerina Core Security v0.2

## Formal Specification — Secret Reference Model and Taint Tracking

**Status: SUPERSEDED — This is a v0.2 design document. The current canonical specification
is in the corresponding Phase 9-15 implementation docs. See galerina-roadmap.md for
the up-to-date architecture. This file is retained for historical context only.**

This document is the v0.2 canonical specification for `galerina-core-security`.

Update status: **conflict resolved (2026-05-26)** — canonical public API is
`ProtectedSecret<T>.unwrapForApprovedSink(sink)`. The former `reveal()` method
is retained only as `private revealUnsafeForRuntimeOnly()` for internal runtime
use. Do not expose `revealUnsafeForRuntimeOnly()` in public APIs, diagnostics,
reports, or AI context.

See also: `model-security-contracts.md`, `data-in-motion-security.md`.

---

## SecretSource Discriminated Union (v0.2)

```ts
type SecretSource =
    | {
        type: "env";
      }

    | {
        type: "vault";
      }

    | {
        type: "kms";
      }

    | {
        type: "runtime";
      }

    | {
        type: "oauth";
      }

    | {
        type: "token";
      };
```

| Source  | Description              |
| ------- | ------------------------ |
| env     | Environment variables    |
| vault   | Secret vault provider    |
| kms     | Key management system    |
| runtime | Runtime-generated secret |
| oauth   | OAuth credentials        |
| token   | API/authentication token |

Note: The prior KB used "environment", "file", "secretStore", "runtimeInjected".
Canonical names (2026-05-26): "env", "vault", "kms", "runtime". The security
package adds "oauth" and "token" for auth-layer secrets beyond the core 4.

---

## SecretCategory Enum (v0.2)

13-value enum:

```ts
enum SecretCategory {
    ApiKey,
    Password,
    AccessToken,
    RefreshToken,
    SessionToken,
    OAuthSecret,
    PrivateKey,
    SigningKey,
    EncryptionKey,
    Certificate,
    RuntimeCredential,
    DatabaseCredential,
    InternalSecret
}
```

Categories enable:
- runtime policy enforcement
- selective redaction
- capability-aware propagation
- audit classification
- compliance filtering

---

## SecretRedactionPolicy

```ts
interface SecretRedactionPolicy {
    redactInLogs: boolean;

    redactInReports: boolean;

    redactInAuditStreams: boolean;

    allowPartialReveal: boolean;
}
```

---

### DEFAULT_REDACTION_POLICY

```ts
const DEFAULT_REDACTION_POLICY = {
    redactInLogs: true,

    redactInReports: true,

    redactInAuditStreams: true,

    allowPartialReveal: false
};
```

All redaction enabled by default. Partial reveal disabled.

---

## SecretReference (v0.2)

```ts
interface SecretReference {
    id: string;

    source: SecretSource;

    category: SecretCategory;

    createdAt: string;
}
```

Example:
```json
{
  "id": "secret_8812",
  "source": { "type": "vault" },
  "category": "DatabaseCredential",
  "createdAt": "2026-05-25T12:00:00Z"
}
```

---

## Secret Derivation System

Derived secrets include authorization headers, encrypted payloads,
session credentials, runtime access tokens, and delegated credentials.

### SecretDerivedReference

```ts
interface SecretDerivedReference {
    parent: SecretReference;

    derivation: SecretDerivation;
}
```

---

### SecretDerivation

```ts
interface SecretDerivation {
    operation: string;

    timestamp: string;
}
```

Example:
```ts
const derived: SecretDerivedReference = {
    parent: secretRef,

    derivation: {
        operation:
            "buildAuthorizationHeader",

        timestamp:
            new Date().toISOString()
    }
};
```

---

## Taint Tracking

### SecretTaint (v0.2)

```ts
interface SecretTaint {
    tainted: boolean;

    source: SecretSource;

    propagationChain: string[];
}
```

Note: The prior KB modelled SecretTaint as a discriminated union. The
v0.2 formal spec defines it as a plain interface with a `propagationChain`
array tracking the full path of transformations.

Example:
```json
{
  "tainted": true,
  "source": { "type": "vault" },
  "propagationChain": [
    "loadSecret",
    "buildAuthorizationHeader"
  ]
}
```

---

## SecureStringReference

```ts
interface SecureStringReference {
    value: string;

    secret: boolean;

    taint?: SecretTaint;
}
```

Example:
```ts
const secureHeader: SecureStringReference = {
    value: "Bearer abc123",

    secret: true,

    taint: {
        tainted: true,

        source: {
            type: "oauth"
        },

        propagationChain: [
            "oauthLogin"
        ]
    }
};
```

---

## ProtectedSecret\<T\> (v0.2)

```ts
class ProtectedSecret<T> {

    readonly reference:
        SecretReference;

    readonly taint:
        SecretTaint;

    private readonly value: T;

    constructor(
        value: T,
        reference: SecretReference,
        taint: SecretTaint
    ) {
        this.value = value;

        this.reference =
            reference;

        this.taint = taint;
    }

    /**
     * Canonical public unwrap API.
     * The sink must be approved before the value is released.
     * Emits SPORE-SECRET-001 if the sink is not approved.
     */
    unwrapForApprovedSink(
        sink: SecretSafeSink
    ): T {
        if (!isSafeSink(sink.type)) {
            throw new Error(
                `SPORE-SECRET-001: secret cannot be sent to sink ${sink.type}`
            );
        }

        return this.revealUnsafeForRuntimeOnly();
    }

    /**
     * Internal runtime use only.
     * Never expose in public APIs, diagnostics, reports, or AI context.
     */
    private revealUnsafeForRuntimeOnly(): T {
        return this.value;
    }
}
```

Note (2026-05-26): canonical public API is `unwrapForApprovedSink(sink)`.
`revealUnsafeForRuntimeOnly()` is private and must not be called from
application code, framework adapters, or diagnostic helpers.

---

## SecretSafeSink

```ts
type SecretSafeSink =
    | "secure-runtime-memory"

    | "vault"

    | "kms"

    | "encrypted-channel"

    | "authorization-header";
```

### isSafeSink()

```ts
function isSafeSink(
    sink: string
): boolean {

    const safeSinks = [
        "secure-runtime-memory",
        "vault",
        "kms",
        "encrypted-channel"
    ];

    return safeSinks.includes(
        sink
    );
}
```

Unsafe sinks — secrets must never enter:
- logs
- reports
- explain traces
- browser storage
- telemetry
- public runtime streams

---

## SecretDiagnostic

```ts
interface SecretDiagnostic {
    code: string;

    message: string;

    severity: string;
}
```

---

## safeLog()

```ts
function safeLog(
    value: unknown
): void {

    if (
        value instanceof ProtectedSecret
    ) {
        console.log(
            "[REDACTED_SECRET]"
        );

        return;
    }

    console.log(value);
}
```

Output for `safeLog(dbPassword)`:
```text
[REDACTED_SECRET]
```

---

## buildAuthorizationHeader()

Builds authorization-safe runtime headers. Preserves taint metadata and
derivation chain.

```ts
function buildAuthorizationHeader(
    token:
        ProtectedSecret<string>
): SecureStringReference {

    return {
        value:
            `Bearer ${token.unwrapForApprovedSink(authorizationHeaderSink)}`,

        secret: true,

        taint: {
            tainted: true,

            source:
                token.taint.source,

            propagationChain: [
                ...token
                    .taint
                    .propagationChain,

                "buildAuthorizationHeader"
            ]
        }
    };
}
```

Result:
```json
{
  "secret": true,
  "taint": {
    "tainted": true,
    "propagationChain": [
      "oauthLogin",
      "buildAuthorizationHeader"
    ]
  }
}
```

---

## Secret Propagation Rules

| Rule                          | Purpose                         |
| ----------------------------- | ------------------------------- |
| Secrets stay tainted          | Prevent silent declassification |
| Derived secrets inherit taint | Preserve lineage                |
| Unsafe sinks blocked          | Prevent leaks                   |
| Runtime logs redacted         | Secure observability            |
| Authorization headers tracked | Runtime accountability          |

---

## Diagnostic Codes

| Code          | Meaning                         |
| ------------- | ------------------------------- |
| SPORE-SECRET-001 | Unsafe log sink                 |
| SPORE-SECRET-002 | Unsafe secret propagation       |
| SPORE-SECRET-003 | Secret serialization prohibited |
| SPORE-SECRET-004 | Invalid secret derivation       |
| SPORE-SECRET-005 | Missing taint metadata          |

---

## File Layout

```text
galerina-core-security/

  secrets/
    SecretReference.ts
    ProtectedSecret.ts    (class with unwrapForApprovedSink(sink); private revealUnsafeForRuntimeOnly())
    SecretTaint.ts        (interface with propagationChain[])
    SecretSource.ts       (6-value discriminated union: env|vault|kms|runtime|oauth|token)

  runtime/
    safeLog.ts
    sinkValidation.ts     (isSafeSink)
    authorization.ts      (buildAuthorizationHeader)

  diagnostics/
    SecretDiagnostic.ts
    codes.ts              (SPORE-SECRET-001–005)

  policies/
    redaction.ts          (SecretRedactionPolicy, DEFAULT_REDACTION_POLICY)
    taintRules.ts
```

---

## Planned v0.3 Features

| Feature                      | Purpose                     |
| ---------------------------- | --------------------------- |
| Distributed Taint Graphs     | Cluster-wide secret tracing |
| Zero-Knowledge Secret Proofs | Private verification        |
| Secret Capability Tokens     | Delegated secret access     |
| Encrypted Runtime Memory     | In-memory protection        |
| Secret Expiration Policies   | Automatic invalidation      |
| Hardware-backed Isolation    | Secure enclaves             |
