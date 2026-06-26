# Error Propagation Through Call Chains

## Definition

Galerina uses `Result<T, E>` for all fallible operations. Errors propagate
explicitly through call chains. There is no hidden exception propagation.

```text
No throw.
No catch.
No hidden jump.
Errors move upward explicitly.
```

See also: `no-exceptions-result-model.md`, `typed-error-model.md`.

## The `Result<T, E>` Type

```galerina
enum Result<T, E> {
    Ok(T)
    Err(E)
}
```

Every fallible operation returns either:

- `Ok(value)` — success with a typed value
- `Err(error)` — failure with a typed error

## Basic Usage

```galerina
flow divide(a: Int, b: Int) -> Result<Int, String> {
    if b == 0 {
        return Err("division by zero")
    } else {
        return Ok(a / b)
    }
}

match divide(10, 2) {
    Ok(value) => print(value)
    Err(error) => log(error)
}
```

## The `?` Operator — Attempt Chaining

The `?` operator propagates errors automatically.

```galerina
let config = readConfig()?
```

Equivalent to:

```galerina
match readConfig() {
    Ok(value) => value
    Err(error) => return Err(error)
}
```

The `?` operator:

```text
- only operates on Result<T, E> values
- propagates errors upward
- preserves error types unless explicitly converted
- respects async/runtime boundaries
```

Invalid usage:

```galerina
let value = 123?
// SPORE-E2007: attempt operator requires Result<T,E>
```

## Multi-Step Propagation

```galerina
flow loadConfig() -> Result<Config, Error> {
    let text = fs.read("config.json")?
    parseConfig(text)?
}
```

Propagation flow:

```text
fs.read()     → Err → propagated immediately
parseConfig() → Err → propagated immediately
              → Ok  → returned
```

## Nested Call Chain Example

```galerina
flow fetchUser() -> Result<User, Error> {
    let response = network.fetch("https://api.example.com/user")?
    parseUser(response)?
}

flow startService() -> Result<Unit, Error> {
    let user = fetchUser()?
    runtime.start(user)?
    Ok(Unit)
}
```

Failures propagate upward until explicitly handled, logged, converted, or
returned to the runtime boundary.

## Error Conversion Between Layers

Errors may be transformed between architectural layers using `.map_err()`:

```galerina
flow loadUser() -> Result<User, AppError> {
    let text = fs.read("user.json")
        .map_err(AppError::ConfigRead)?

    parseUser(text)
        .map_err(AppError::InvalidUser)?
}
```

This preserves structured error meaning and context-aware diagnostics while
maintaining layer separation.

## Structured Error Types

Prefer structured enums over raw strings:

```galerina
enum AppError {
    ConfigRead(String)
    InvalidUser(String)
    NetworkFailure(String)
}
```

Benefits:

```text
exhaustive handling in match blocks
stable APIs
better compiler diagnostics
runtime traceability
```

## Exhaustive Error Handling

The compiler encourages exhaustive handling:

```galerina
match result {
    Ok(value)                   => handle(value)
    Err(AppError.ConfigRead(e)) => recover(e)
    Err(AppError.InvalidUser(e)) => report(e)
    Err(AppError.NetworkFailure(e)) => retry(e)
}
```

## Effects and Result

Effectful operations typically return `Result<T, E>`:

```galerina
flow fetch() -> Result<Response, NetworkError>
effects [network.connect] { ... }
```

This communicates that the operation performs a network effect and may fail.

## Async Error Propagation

Async operations preserve propagation semantics:

```galerina
async flow fetchUser() -> Result<User, NetworkError> {
    let response = await network.fetch(url)?
    parseUser(response)?
}
```

Errors propagate through async boundaries consistently.

## Runtime Boundary Propagation

Unhandled errors reaching runtime boundaries should:

```text
emit audit events
preserve structured metadata
attach trace correlation IDs
support observability pipelines
```

Runtime error format:

```json
{
  "error": "network.timeout",
  "service": "payments-api",
  "trace_id": "trace_456",
  "artifact_digest": "sha256:abc123"
}
```

## Propagation Across Runtime Boundaries

Errors crossing runtime boundaries should preserve:

```text
trace IDs
error categories
capability context
runtime metadata
deployment identity
```

## Error Codes

```text
SPORE-E2001 invalid Result type
SPORE-E2002 unhandled Result
SPORE-E2003 incompatible error type
SPORE-E2004 invalid error conversion
SPORE-E2005 non-exhaustive error match
SPORE-E2006 invalid propagation boundary
SPORE-E2007 invalid attempt operator usage
```

## Recommended Practices

```text
Prefer structured error types over raw strings
Use Result<T, E> explicitly
Avoid hidden runtime exceptions
Propagate errors intentionally
Preserve context during conversion
Keep error categories stable
Emit runtime audit events for boundary failures
Avoid losing trace metadata during propagation
```
