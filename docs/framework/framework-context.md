# Framework: Context

## Purpose

Context carries request, actor, tenant, trace and runtime facts without using
hidden global state.

## Short Definition

`RequestContext` is the explicit runtime context passed into secure flows.

## Syntax Example

```galerina
secure flow getUser(
  request: User.get,
  ctx: RequestContext
) -> Result<User.authorised, ApiError>
  permission use user_read_with_pii
{
  let user = try UsersRepository.findRequired(request.userId)
  return Ok(User.authorised.from(user))
}
```

## Context May Contain

```text
request id
actor/user
tenant id
locale
trace id
granted capabilities
runtime environment
audit metadata
```

## Security Rules

- No hidden global `currentUser`.
- No hidden global request object.
- Context must be explicit at flow boundaries.
- Context values must be scoped and redacted in reports where sensitive.
- Actor and capability information must be derived from trusted auth policy.

## Generated Reports

```text
context-report.json
actor-report.json
audit-context-report.json
```

## v1 Scope

Explicit request context for secure flow execution.
