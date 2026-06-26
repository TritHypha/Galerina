# No Exceptions — Result Model

## Status

```
Status: Active — language invariant
Scope:  Result<T, Error> return type, no throw/catch/panic
See also: typed-error-model.md, error-propagation-chains.md, galerina-contract-errors.md
```

## Definition

Galerina does not use a hidden exception system. Every fallible operation is expressed as a `Result<T, Error>` return type. Failures are explicit, typed, and governed.

```text
No throw.
No catch.
No hidden exception propagation.
Use Result<T, Error>.
```

## Core Pattern

A flow that can fail must declare what it can return on success and on failure:

```galerina
flow login(
  request: Login.post
) -> LoginResult
  permission use auth_login
contract {
  types {
    type LoginResult = Result<Login.response, AuthError>
  }
}
{
  // body returns Ok(Login.response) or Err(AuthError.variant)
}
```

The flow can only finish as:

```text
Ok(Login.response)
```

or:

```text
Err(AuthError)
```

There is no surprise thrown exception.

## Why This Fits Galerina

```text
explicit   — failure is visible in the type signature
typed      — the error type is declared and checked
auditable  — the runtime can record every typed failure
AI-readable — no hidden throw paths for AI tools to miss
runtime-safe — the runtime governs what reaches the outside world
```

## Governed Failure Path

A typed error still passes through the runtime before reaching the outside world:

```text
Err(AuthError.invalid_credentials)
 -> Response Gate
 -> safe public response (status 401, public message)
 -> audit if required
```

So returning `Err(AuthError.invalid_credentials)` does not mean an internal failure leaks to the user. The runtime controls what is safe to expose.

## What Is Blocked

Galerina must not allow:

```text
throw exception
raise error
panic with stack trace
untyped error propagation
raw exception bubbling to HTTP response
```

## Principle

```text
Success is typed.
Failure is typed.
Both are governed.
```

> [!TIP]
> The exception system in Galerina is `Result<T, Error>` combined with governed failure — not a hidden throw/catch mechanism.
