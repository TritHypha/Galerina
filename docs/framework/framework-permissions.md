# Framework: Permissions

## Purpose

Permissions give developers one clear place to declare authority for a flow.

## Short Definition

A permission declares who may run a flow, what the code may do, what data may
move and what audit/report proof is required.

## Syntax Example

```galerina
permission user_email_update {
  actor require users.email.update
  actor require users.private.read

  code allow db.read
  code allow db.write
  code allow audit.write
  code deny network.external

  data allow expose view: private with users.private.read
  data deny expose view: secret

  audit required event "user.email.update"
}
```

Use it from a flow:

```galerina
secure flow updateUserEmail(
  request: UpdateEmailRequest,
  ctx: RequestContext
) -> Result<UserResponse, ApiError>
  permission use user_email_update
{
  ...
}
```

## Internal Parts

| Part | Meaning |
|---|---|
| `actor` | what the user/service/package/agent is allowed to do |
| `code` | what side effects the flow may perform |
| `data` | what viewed data may be accessed or exposed |
| `audit` | what must be recorded |
| `report` | generated proof |

## Security Rules

- Sensitive actions require permissions.
- Sensitive data exposure requires permissions.
- Permissions must include actor authority, not only code effects.
- Effects show technical powers; capabilities show actor authority.
- Missing permission fails closed.
- Permission must compile into effective capability, effect, policy and report data.
- Audit identity must inherit runtime actor, request, route, flow, permission
  and capability context. Application code must not silently override the
  primary audit actor.

## Generated Reports

```text
permission-report.json
permission-effective-report.json
capability-report.json
effect-report.json
security-report.json
audit-actor-report.json
```

## Knowledge Base

See [Permission, Capability And Actor Model](../../../ZTF-Knowledge-Bases/permission-capability-actor-model.md).
See [Audit Actor Model](../../../ZTF-Knowledge-Bases/audit-actor-model.md).
