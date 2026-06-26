# Framework: Secure Flows

## Purpose

Secure flows define checked application execution boundaries.

## Short Definition

A secure flow is a typed function boundary with explicit return type, error
model and effects.

Secure flows are the main encapsulation boundary for Galerina execution.

## Syntax Example

```galerina
secure flow createUser(request: CreateUserRequest)
  -> Result<UserResponse, ApiError>
effects [database.write] {
  ...
}
```

## Security Rules

- Effects must be declared.
- Inputs and outputs must be explicit.
- Required capabilities should be declared for sensitive data or actions.
- Recoverable failures should use `Result<T, E>`.
- Missing values should use `Option<T>`.
- Branches over `Result`, `Option`, `Tri` and `Decision` should be explicit.
- Callers should receive declared response/view values, not internal models or
  hidden mutable state.

## Generated Reports

```text
flow-contract-report.json
effect-report.json
error-report.json
```

## v1 Scope

`secure flow`, explicit effects, `Result`, `Option` and match handling.
