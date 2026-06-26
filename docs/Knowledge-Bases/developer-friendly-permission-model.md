# Developer-Friendly Permission Model

## Purpose

Galerina should keep effects, capabilities, policies, audit and reports precise
internally, but expose a simpler developer-facing permission model.

## Short Definition

```text
permission = declared authority for a flow to act
```

A permission declares:

- who may run the flow
- what the code may do
- what data may move
- what must be audited
- what reports prove the decision

## Internal Mapping

```text
permission = actor authority + code effects + data exposure + policy rules + audit/report proof
```

| Internal part | Meaning |
| --- | --- |
| `actor` | what the user, service, package or agent is allowed to do |
| `code` | what side effects the flow may perform |
| `data` | what classified data may be accessed or exposed |
| `audit` | what must be recorded |
| `report` | generated proof |

## Simple Use

```galerina
secure flow updateUserEmail(
  request: UpdateEmailRequest,
  ctx: RequestContext
) -> Result<UserResponse, ApiError>
  permission use user_email_update
{
  let user = try UsersRepository.findRequired(request.userId)
  let updated = try User.changeEmail(user, request.email)

  return Ok(UserResponse.from(updated))
}
```

## Permission Definition

```galerina
permission user_email_update {
  actor {
    require users.email.update
    require users.private.read
  }

  code {
    allow db.read
    allow db.write
    allow audit.write
    deny network.external
    deny file.write
  }

  data {
    allow expose view: public
    allow expose view: private with users.private.read
    deny expose view: secret
    deny expose view: internal
  }

  audit {
    required true
    event "user.email.update"
  }
}
```

## Beginner And Advanced Forms

Beginner form:

```galerina
secure flow getUser(...)
  permission use read_user
{
  ...
}
```

Advanced form:

```galerina
secure flow getUser(...)
  capabilities {
    require users.read
    require users.private.read
  }
  effects {
    allow db.read
    allow audit.write
    deny network.external
  }
  policy use UserReadPolicy
{
  ...
}
```

Both should compile to effective capability, effect, policy, data exposure and
report facts.

## Rules

- Normal developers should usually start with `permission use`.
- Effects are not actor authority.
- Capabilities are not technical effects.
- Advanced blocks may be supported where explicit detail is needed.
- Reports must show the effective permission after expansion.
- Audit identity should be inherited from governed runtime context. Developers
  should not manually attach or override the primary actor in ordinary audit
  events.

## Best Short Statement

```text
Developers write permission.
Galerina compiles it into capabilities, effects, policy and reports.
```

See [Audit Actor Model](audit-actor-model.md).
