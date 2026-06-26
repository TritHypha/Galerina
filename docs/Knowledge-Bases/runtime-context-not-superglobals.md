# Runtime Context (Not Superglobals)

## Definition

**Runtime.Context** is the runtime-owned, read-controlled execution context for the current flow. It contains request and runtime facts, but it is not a global variable and not freely writable.

## Key Distinction

```text
Superglobals     = globally available mutable data (PHP-style)
Runtime.Context  = governed runtime-provided execution facts
Vaults           = governed shared/global state
```

Galerina must not have PHP-style superglobals:

```galerina
// Rejected patterns
$_SESSION
$_POST
$_COOKIE
global user
```

Instead:

```galerina
request: Login.post
context: Runtime.AuthContext
SessionVault.write(...)
```

## What Runtime.Context May Contain

```text
actor
request_id
route
method
headers allowed by policy
client info allowed by policy
permission used
capabilities granted
audit context
budget context
event source
compute context
```

## Injection Model

`Runtime.Context` belongs to the runtime layer and is injected into flows only when needed:

```galerina
flow login(
  request: Login.post,
  context: Runtime.AuthContext
)
```

Simple flows can omit it:

```galerina
flow hello(
  request: Hello.get
)
```

The runtime still has context internally even when not injected into the flow signature.

## Lifecycle

```text
Request enters
 -> Intake Guard creates Runtime.Context
 -> Authority Control attaches actor/permission/budget
 -> flow may read allowed context fields
 -> audit auto-inherits context
 -> response gate uses context for output rules
```

## Anti-Patterns

`Runtime.Context` must not become:

- Mutable global state
- Hidden session storage
- Unrestricted request bag
- Unfiltered headers/cookies/files
- A way to bypass permissions

## Sessions Belong in Vaults

Instead of mutable global session state:

```galerina
SessionVault.write(
  key: session_uuid,
  value: {
    actor_uuid: user.uuid,
    expires_at: Runtime.now() + Duration.hours(12)
  }
)
```

## Core Principle

> [!TIP]
> **Context may be automatic. Authority must be explicit.**

```text
No global bags.
No hidden writable state.
Context is runtime-owned.
Vaults are governed state.
```
