# Vault Write Syntax

## Status

Status: Future — This feature is not yet implemented in Stage A (Phase 1-15).
Planned for: Stage B

## Definition

Galerina standardises vault write operations using the vault object as the direct actor:

```galerina
SessionVault.write(
  key: session_uuid,
  value: {
    actor_uuid: user.uuid,
    expires_at: Runtime.now() + Duration.hours(12)
  }
)
```

This is the canonical form. The vault name is the subject; `write` is the operation.

## Why the Old Form Was Rejected

The earlier verbose form was:

```galerina
vault.write(
  context,
  vault: SessionVault,
  key: session_uuid,
  value: { ... }
)
```

Problems with the old form:

```text
repeated the vault name in both call and parameter
passed context everywhere explicitly
looked like a generic helper call, not a governed store
harder to read
added boilerplate
made governed storage feel less first-class
```

## Standard Syntax

Write:

```galerina
SessionVault.write(
  key: session_uuid,
  value: {
    actor_uuid: user.uuid,
    expires_at: Runtime.now() + Duration.hours(12)
  }
)
```

Read:

```galerina
let session = SessionVault.read(
  key: session_uuid
)
```

The vault object is the governed storage target. The operation (`write`/`read`) describes the action. This is consistent and first-class.

## Keyword Decisions

### `key` (not `index`, not `use`)

`key` means "the lookup identifier for this vault record." `index` implies array position or database index structure. `use` is reserved for permissions (`permission use auth_login`).

### `value` (not `data`, not `record`)

`value` clearly means "the stored record." It pairs naturally with `key`.

### `write` (not `store`, not `set`)

`write` is short, direct, and operational. It pairs cleanly with `read`:

```galerina
SessionVault.write(...)
SessionVault.read(...)
```

## Why Context Is Not Passed

The runtime already knows the active flow context. Vault operations automatically inherit:

```text
actor
permission
audit context
request id
execution id
runtime budget
granted capabilities
```

Developers do not pass `context` into every governed operation. The runtime owns context.

## Security Is Preserved

Removing explicit `context` from the call does not remove security. Vault writes still require permission:

```galerina
permission auth_login {
  code {
    allow vault.write SessionVault
  }

  audit required event "auth.login"
}
```

If this permission is absent, `SessionVault.write(...)` must fail at runtime.

## Runtime Behaviour on Write

When the runtime sees `SessionVault.write(...)` it must:

1. Verify the active permission allows `vault.write SessionVault`
2. Attach the current actor automatically
3. Attach audit metadata automatically
4. Validate the key type
5. Validate the value shape
6. Enforce expiry and lifetime rules
7. Write to the configured vault backend
8. Emit required audit events

## Design Principle

```text
Do not pass context everywhere.
Let governed operations inherit context.
Require permission for authority.
```
