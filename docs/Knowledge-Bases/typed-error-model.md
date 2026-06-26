# Typed Error Model

## Definition

The **Galerina Typed Error Model** is a strict, declared error system where every flow states exactly what error types it may return, and the runtime maps those errors safely to external responses, audit records, and recovery behaviour.

It builds on top of Galerina's strict type system to ensure errors are treated as first-class outputs.

## Where it Sits (Lifecycle)

The typed error model belongs in the **logic layer** and is enforced by the **runtime**:

```text
flow
 -> returns Result<SuccessType, ErrorType>
 -> runtime validates error type
 -> response gate maps safe error output
 -> audit records failure
```

## Flow Signature Example

Every fallible flow must declare its success and error types in the signature:

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
  // Flow body returns Ok(Login.response) or Err(AuthError.variant)
}
```

This guarantees that a flow can only return:
- `Login.response`
- `AuthError`

It prevents the emission of random strings, raw exceptions, stack traces, or untyped failures.

## Defining Typed Errors

Typed errors are defined using the `error` keyword:

```galerina
error AuthError {
  invalid_credentials {
    status: 401
    message: "Invalid email or password"
    view: public
  }

  account_disabled {
    status: 403
    message: "Account disabled"
    view: public
    audit: required
  }

  system_failure {
    status: 500
    message: "Login failed"
    view: public
    hide_internal: true
    audit: required
  }
}
```

## Runtime Enforcements

The runtime governs the lifecycle of an error output:

1. **Developer returns typed error:** The flow returns a clean, structured error variant (e.g., `AuthError.invalid_credentials`).
2. **Runtime decides safe external response:** Based on the error definition's `status` and `view` properties.
3. **Audit receives full internal context:** The audit trail captures the detailed error state, tracing, and parameters.
4. **User receives only safe public message:** Prevent leakages by redacting internal details (e.g., if `hide_internal: true` is set, or by default for unmapped system errors).

## Why this Matters

By requiring typed errors, Galerina prevents common security and reliability anti-patterns:
- Throwing random, untyped runtime exceptions.
- Leaking raw database errors (e.g., SQL syntax or connection strings).
- Leaking stack traces or runtime engine details.
- Exposing secret details (e.g., API keys, environment paths) in HTTP responses.
- Emitting inconsistent HTTP error formats.

## Core Principle

> [!TIP]
> **Errors are outputs too.** They must be typed, governed, and safe to expose.
