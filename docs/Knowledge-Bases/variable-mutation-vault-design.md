# Variable Mutation Vault Design

## Status

Status: Future — This feature is not yet implemented in Stage A (Phase 1-15).
Planned for: Stage B

## Purpose

This concept defines the Galerina direction for:

```text
local variables
immutability
explicit mutation
readonly values
protected shared state
vault access
secret values
security boundaries
```

The design aims to remain:

```text
security-first
AI-readable
easy for developers
runtime-auditable
future-compatible
```

## Core Philosophy

```text
Variables are local by default.
Mutation must always be explicit.
Shared state must be protected.
Secrets and shared state must never be implicit.
```

## v0.1 Surface

Galerina v0.1 should prefer this small surface:

```text
let       normal local variable inside a flow
mut       explicit mutation action
readonly  cannot be changed after creation
vault     protected shared state
secure    access to vault state
Secret<T> protected secret value
```

Do not use `const` in v0.1.

```text
readonly replaces const for now.
Add const later only if Galerina needs compile-time constants separate from runtime readonly values.
```

## `let`

`let` declares a normal local variable.

Rules:

```text
flow/block scoped
readable inside scope
not accessible outside the flow
not silently mutable
mutation requires mut
```

Example:

```galerina
flow myFunction() {
  let counter: Int = 1

  print(counter)
}
```

Outside the flow:

```galerina
print(counter)
```

fails because `counter` does not exist outside the flow scope.

## `mut`

`mut` performs an explicit mutation operation.

Rules:

```text
mutation must be visible
mutation only allowed inside flow/block scope
normal assignment without mut fails
increment/decrement without mut fails
```

Example:

```galerina
flow myFunction() {
  let counter: Int = 1

  mut counter++
}
```

Valid:

```galerina
mut counter = counter + 1
```

Invalid:

```galerina
counter = counter + 1
counter++
```

because mutation was not explicitly declared.

`mut counter++` is intentionally preferred over `counter++` because the mutation
marker makes every state change visible to developers, reviewers, AI tooling,
the checker and mutation reports.

## `readonly`

`readonly` declares a value that cannot be changed after creation.

Current direction:

```text
no unlock mechanism
no mutation allowed
flow/block scoped unless used in an approved declaration context
```

Example:

```galerina
flow myFunction() {
  readonly requestId: UUID = request.id
}
```

Invalid:

```galerina
mut requestId = otherId
```

## No `const` In v0.1

`const` overlaps too much with `readonly`.

Use:

```galerina
readonly MaxUsers: Int = 100
```

Do not use:

```galerina
const MaxUsers: Int = 100
```

For maths and logic, use readonly symbolic values:

```galerina
readonly PI: Decimal = 3.14159
readonly FieldPrime: Int = 1000003
readonly MatrixSize: Int = 4
```

Future mathematical language may also need:

```text
axiom
theorem
lemma
proof
assume
given
invariant
```

Example direction:

```galerina
given p: Prime
readonly F = FiniteField<p>

invariant fieldCharacteristic(F) == p
```

These proof terms are future concepts, not v0.1 syntax.

## Scope Rules

Variables declared inside flows are:

```text
private to the flow
not globally accessible
not shared automatically
destroyed after flow completes
```

Example:

```galerina
flow login() {
  let password: Secret<Text> = request.password
}
```

Outside the flow:

```galerina
print(password)
```

fails.

## Vault Design

`vault {}` defines protected shared runtime state.

Vault values are:

```text
shared
protected
permission controlled
audit aware
runtime managed
```

Vault values are not normal variables.

## Vault Declaration

Example:

```galerina
vault {
  loginCount: Int {
    allow incrementLogin write
    allow getLoginCount read

    audit required
  }
}
```

Vault rules:

```text
vault defines shared protected state
vault values are globally managed by runtime
read/write permissions are generated or declared
only allowed flows may access values
writes require mut
audit may be required
```

## Secure Access Path

The recommended protected access path is:

```galerina
secure.valueName
```

Meaning:

```text
protected runtime-managed access
```

Read:

```galerina
flow getLoginCount() {
  let count = secure.loginCount
}
```

Write:

```galerina
flow incrementLogin() {
  mut secure.loginCount++
}
```

Invalid:

```galerina
secure.loginCount++
secure.loginCount = secure.loginCount + 1
```

Vault writes must be visibly marked with `mut`.

## Vault Variations

Basic vault value:

```galerina
vault {
  appCounter: Int {
    allow incrementCounter write
    allow getCounter read
  }
}
```

Vault value with audit:

```galerina
vault {
  loginAttempts: Int {
    allow incrementAttempts write
    allow getAttempts read

    audit required
  }
}
```

Readonly vault value:

```galerina
vault {
  appId: readonly UUID {
    allow getAppId read

    audit optional
  }
}
```

Invalid:

```galerina
mut secure.appId = otherId
```

Vault record type:

```galerina
vault {
  session: SessionRecord keyed by session_uuid {
    allow getSession read
    allow createSession write
    allow revokeSession write

    audit required
  }
}
```

Vault record read:

```galerina
flow getSession(session_uuid: SessionUUID) {
  let session = secure.session[session_uuid]
}
```

Vault record write:

```galerina
flow revokeSession(session_uuid: SessionUUID) {
  let session = secure.session[session_uuid]

  mut session.revoked = True

  mut secure.session[session_uuid] = session
}
```

Vault record creation:

```galerina
flow createSession(session_uuid: SessionUUID, user: User) {
  mut secure.session[session_uuid] = {
    actor_uuid: user.uuid,
    created_at: Runtime.now(),
    expires_at: Runtime.now() + Duration.hours(12),
    revoked: false
  }
}
```

Older direct writer-call wording such as:

```galerina
SessionVault.write(context, session_uuid, session)
```

should not be the preferred v0.1 surface. The preferred source model is:

```galerina
mut secure.session[session_uuid] = session
```

The runtime may lower this into an internal vault write call, but source code
should keep the governed state change visible through `mut secure.*`.

Vault operations should inherit the active governed runtime context rather than
requiring application code to pass a generic `context` argument through every
write. The runtime context supplies actor identity, flow or route identity,
permission grants, audit correlation, policy profile and trust-zone metadata.

## Secret Values

Sensitive values should use:

```galerina
Secret<T>
```

Example:

```galerina
let apiKey: Secret<Text>
```

Runtime/compiler protections may include:

```text
deny logging
deny HTML rendering
deny AI exposure
deny unsafe serialization
redact reports
track secret flow
```

## Security Goals

This model aims to prevent:

```text
hidden mutation
unsafe global state
secret leakage
implicit shared memory
runtime injection
template abuse
AI prompt leakage
silent side effects
```

## Design Summary

Local state:

```galerina
let foo: Int = 1
mut foo++
```

Readonly local state:

```galerina
readonly requestId: UUID = request.id
```

Shared protected runtime state:

```galerina
vault {
  loginCount: Int {
    allow incrementLogin write
    allow getLoginCount read

    audit required
  }
}
```

Shared state access:

```galerina
let count = secure.loginCount

mut secure.loginCount++
```

## Relationship To Other Concepts

This concept refines:

- [Scoped Vaults](scoped-vaults.md)
- [Explicit Mutation And Vault Writes](explicit-mutation-and-vault-writes.md)
- [Deny By Default Risk Features](deny-by-default-risk-features.md)
- [Memory Pressure Security](memory-pressure-security.md)
- [AI As Untrusted Reasoning Worker](ai-as-untrusted-reasoning-worker.md)

## Final Principle

```text
Local variables remain local.

Mutation must always be explicit.

Shared state belongs only inside vault.

Protected shared state must be accessed through secure.

Security-sensitive behaviour must always remain visible
to developers, AI tooling and the runtime.
```
