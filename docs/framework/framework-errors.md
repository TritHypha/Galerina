# Framework: Errors

## Purpose

Errors are explicit, typed and reportable.

## Short Definition

Recoverable failures should use `Result<T, E>` or another declared typed error
form. Missing values should use `Option<T>` or another explicit optional form.

## Syntax Example

```galerina
match result {
  Ok(user) => return Ok(User.authorised.from(user))
  Err(error) => return Err(error)
}
```

## Important Error Types

```text
Result<T, E>
Option<T>
ApiError
ValidationError
SecurityError
StorageError
ExternalServiceError
```

## Security Rules

- Do not ignore `Result<T, E>` errors.
- Do not use `Option<T>` as the contained value without handling `None`.
- Match catch-all branches must not silently hide unknown security-sensitive
  states.
- Unknown webhook, provider, permission or auth states should return a typed
  error, explicit ignored response, safe log, manual review or fail-closed
  result.
- Public errors must not expose secrets, stack traces or internal paths.
- Security errors must be auditable.
- Panic/crash paths must be contained by runtime crash policy.

## Generated Reports

```text
error-report.json
api-error-report.json
crash-report.json
unhandled-result-report.json
```

## v1 Scope

`Result<T, E>`, `Option<T>`, safe API errors and basic unhandled-error
diagnostics.

## Knowledge Base

See [Match Catch-All Branch](../../../ZTF-Knowledge-Bases/match-catch-all-branch.md).
