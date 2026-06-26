# Design Patterns for Galerina

## Core Rule

A design pattern is allowed in Galerina only if it keeps effects, permissions, state, errors, and implementation selection **visible**.

## Recommended Primary Pattern

```text
Secure Contract Boundary
+ Capability-Gated Adapter
+ Exhaustive Variant Result
+ Machine-Readable Report
```

This gives extensibility without inheritance and polymorphism without hidden security behaviour.

## Approved Patterns

### Contract + Adapter

Use for: databases, payment providers, AI tools, network clients, storage, auth.

Each adapter must declare: permissions, effects, boundary, and audit requirements.

```galerina
contract PaymentProvider {
  flow charge(request: PaymentRequest)
    -> Result<PaymentResponse, PaymentError>
}

adapter StripeProvider implements PaymentProvider {
  boundary external StripeApi
  permission use payment_provider_access
  effects {
    allow network.external
    allow audit.write
  }
}
```

### Sealed Variants + Exhaustive Match

Use instead of subclass hierarchies for: Actor, AuthResult, PaymentError, NetworkPolicy, Decision, etc.

```galerina
type PaymentStatus =
  | Pending
  | Paid
  | Failed
  | Refunded
```

Exhaustive matching makes security states visible and compiler-verifiable.

### Command / Handler

Good for API-heavy systems. Routes dispatch to explicit handlers returning `Result<T, E>`.

```galerina
command UpdateUserEmail {
  input UpdateEmailRequest
  output User
  errors [ValidationError, PermissionError, StorageError]
  effects [database.write, audit.write]
}
```

### Typed Pipeline (Chain of Responsibility)

Represent validation, auth, rate limit, decode, handler, encode as an ordered typed pipeline with declared effects. No inheritance-based middleware.

```text
request -> validate -> auth -> rate-limit -> decode -> handler -> encode -> response
```

Rule: Order must be explicit. No handler may silently swallow errors.

### Result + Railway-Oriented Flow

Make failure paths explicit using `Result<T, E>` and typed errors, not exceptions.

### Builder for Safe Config

Staged builders for secure server/app config where invalid states cannot be constructed: TLS required, secrets redacted, prod gates satisfied.

### Policy Object

Keep auth, TLS, rate limits, redaction, timeout, retry, and production gates as typed policies — not hidden framework behaviour.

### Capability Object / Permission Token

Functions receive explicit capabilities rather than reaching global services:

```galerina
flow updateEmail(
  user: User,
  newEmail: Email,
  db: DatabaseWrite,
  audit: AuditWrite
) -> Result<User, UpdateError>
```

## Restricted Patterns (Allowed With Rules)

| Pattern | Rule |
|---|---|
| Observer | Events must be typed. Subscribers must be declared. No hidden listeners. |
| Decorator | Must declare added effects. |
| Proxy | Good for permission gates / redaction wrappers. Bad if it hides network calls. |
| Strategy | Selected at boot/config only, not secretly at runtime. |
| Prototype | Never silent deep clone. Use `clonePublic()` or `cloneSafe()`. |

## Mostly Avoided

```text
Singleton         — creates hidden global state
Service Locator   — hides authority
Hidden Factory    — secret runtime implementation selection
Runtime Plugin Discovery — uncontrolled loading
Reflection Dispatch — hides execution path
```

Allowed singleton exceptions: immutable constants and boot-created read-only services (RuntimeConfig, CompilerVersion, StaticPolicyTable).

## Interfaces and Factories

### Interfaces (Contracts)

Use heavily. A Galerina contract must declare:

- required functions
- declared errors
- declared effects
- reportable implementations

### Factories (Boot Binders)

Only at boot/config boundaries. Never hidden runtime selection. Galerina names: **Boot Binder**, **Adapter Selector**, **Implementation Resolver**.

```text
Interfaces are good.
Factories are allowed only at boot/config boundaries.
Runtime hidden factory selection is not allowed.
```

## Reliability Principles

```text
small pure functions
Result-based error handling
clear module boundaries (business rules / API contracts / validation / security / storage / reports)
explicit dependency passing
sealed variants for state
configuration as typed data
immutable by default
testable handlers (route -> validate -> handler -> result -> response)
machine-readable reports
```

## Final Rule

```text
Galerina code should be easy to read, easy to test,
hard to accidentally extend unsafely,
and every important runtime decision should be visible before deployment.
```
