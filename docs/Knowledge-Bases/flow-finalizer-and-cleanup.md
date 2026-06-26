# Flow Finalizer and Runtime Cleanup

## Definition

Galerina performs **automatic runtime cleanup at the end of every flow**. This is
the Flow Finalizer (also called Runtime Cleanup Phase).

```text
release = explicit early cleanup
end-of-flow cleanup = automatic final cleanup
```

## Automatic Cleanup

Local runtime values are cleaned up automatically when a flow ends. Developers
do not need to free resources manually.

```galerina
flow process_upload(raw: unsafe File) -> Result {
  let file: safe File = validate.file(raw)
  process(file)
  return Success
}
```

Even without `release file`, the runtime cleans up `file` when the flow ends.

## Early Release

Use `release` when cleanup is needed before the flow returns:

```galerina
flow process_upload(raw: unsafe File) -> Result {
  let file: safe File = validate.file(raw)
  process(file)
  release file
  return Success
}
```

This releases the value before subsequent work continues, useful for large or
sensitive values.

The compiler prevents use-after-release.

## Cleanup Triggers

The runtime performs cleanup on:

```text
success
failure
validation rejection
runtime error
permission denial
worker cancellation
timeout
```

## Cleanup Scope

End-of-flow cleanup releases **local flow-owned runtime values only**.

It does not affect:

```text
the returned value
GlobalVault state
boot settings
main runtime settings
compile settings
persistent services
external systems
```

Example:

```galerina
flow get_user(id: safe Id) -> User
  uses vault.users.read
{
  let user: safe User = GlobalVault.users.get(id)
  return user
}
```

At the end of this flow:

```text
local variable user is cleaned up (ownership transferred to return)
returned User is preserved and passed to caller
GlobalVault.users is unchanged
boot/main/runtime settings are unchanged
```

## Ownership Transfer

If a value is returned, ownership transfers to the caller instead of being
released. The value is preserved, not cleaned up.

## Cleanup Strength

```text
1. Automatic cleanup at scope/flow end
2. Optional release for early cleanup
3. Strong cleanup for secrets and unsafe values
4. Compiler prevents use-after-release
```

## Runtime GC Strategy

The runtime decides when memory reclamation happens, not the developer. Galerina uses:

```text
runtime-managed automatic GC
+
deterministic flow cleanup
```

Not: forced GC after every flow (which would hurt performance).

The runtime chooses the right strategy per value type:

```text
normal String       -> GC when efficient
large File buffer   -> reclaim earlier
Secret / Token      -> zero ASAP
unsafe raw input    -> invalidate at flow end
returned value      -> transfer ownership to caller
```

A `let` variable that reads from GlobalVault does not become GlobalVault state:

```galerina
let token = GlobalVault.secrets.read("api-token")
```

```text
GlobalVault owns the secret source.
The local variable token is still flow-scoped.

At flow end:
  local token reference is cleaned
  GlobalVault secret remains
```

### Cleanup Candidate Rules

```text
1. let values are flow-local by default (cleanup candidates)
2. returned values escape the flow safely (ownership transfer)
3. GlobalVault persists outside the flow (not cleaned)
4. release allows early cleanup before flow end
5. runtime decides when GC is efficient
6. sensitive values (Secret, Token, unsafe inputs) get priority cleanup / zeroing
```

## Core Principle

```text
Every flow ends with a guaranteed cleanup phase.
Only local values owned by the flow are cleaned up.
The runtime governs when GC runs — not the developer.
```
