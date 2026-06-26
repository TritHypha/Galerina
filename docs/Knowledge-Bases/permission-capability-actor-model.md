# Permission, Capability And Actor Model

Galerina should expose a simple developer-facing `permission` model while keeping
capabilities, effects, policies and reports internally precise.

## Short Definitions

```text
actor       = who or what is performing the action
capability  = declared authority the actor/package/flow/tool has
effect      = technical action the code may perform
permission  = authority for a flow to act
policy      = rules that decide when authority applies
report      = proof the checks happened
```

## Actor

An actor is the identity attempting to perform an action.

Actors may be:

```text
logged-in user
admin user
service account
API client
AI agent
background job
package/plugin
external system
```

The actor usually comes from `ctx.actor`:

```galerina
ctx.actor.id
ctx.actor.type
ctx.actor.roles
ctx.actor.capabilities
ctx.actor.tenantId
```

For audit events, the primary actor should be inherited automatically from the
governed runtime context. Application code may add audit metadata, but it should
not manually supply or override the primary audit actor.

## Capabilities

Capabilities describe what the actor, service, package, flow or tool is
authorised to do.

```text
capabilities = declared permissions / powers
```

They answer:

```text
Who is allowed to do this?
What are they allowed to access?
For what purpose?
```

Examples:

```text
users.read
users.email.update
users.pii.read
orders.refund
payments.charge
ai.external_tool.call
dataset.export
```

See [Capabilities](capabilities.md) for the dedicated capability concept record.

## Capabilities Versus Effects

| Concept | Meaning | Example |
|---|---|---|
| `effects` | What the code is technically allowed to do | `db.read`, `db.write`, `audit.write` |
| `capabilities` | What the actor is authorised to do | `users.read`, `users.email.update`, `users.pii.read` |

You normally need both.

## Developer-Facing Permission

Instead of making normal developers write separate effects, capabilities,
policies and audit blocks for every flow, Galerina should support reusable
permissions.

```galerina
secure flow updateUserEmail(
  request: UpdateEmailRequest,
  ctx: RequestContext
) -> UpdateUserEmailResult
  permission use user_email_update
contract {
  types {
    type UpdateUserEmailResult = Result<UserResponse, ApiError>
  }
}
{
  let user = try UsersRepository.findRequired(request.userId)
  let updated = try User.changeEmail(user, request.email)

  return Ok(UserResponse.from(updated))
}
```

Permission definition:

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

## Advanced Form

Advanced code may still expose the internal concepts directly:

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

## Security Rules

```text
Sensitive action requires permission.
Sensitive data exposure requires permission.
Capabilities must be checked at secure flow, route, package, response and tool boundaries.
Effects must be declared before privileged technical actions.
Effects must not be treated as actor authorization.
Missing actor authority must fail closed.
```

## Boundary Capability Rule

```text
Every secure flow, public route, response/view, package export, adapter,
AI/tool boundary, MCP boundary and scoped vault access that touches protected
data or protected action must declare the required capability or permission.
```

## Report Rules

Galerina should generate permission and capability evidence:

```text
permission-report.json
permission-effective-report.json
capability-report.json
capability-boundary-report.json
capability-grant-report.json
effect-report.json
security-report.json
audit-actor-report.json
```

## Performance Rule

Capabilities should be expensive to validate at build/check time and cheap to
check at runtime.

At build time Galerina can generate:

```text
getUser requires:
- users.read
- users.pii.read
```

At runtime the secure runtime can precheck against `ctx.actor.capabilities`.

## AI Rule

AI tools should treat a permission block as the authoritative explanation of who
may do what, which effects may happen, what data may move and what audit event
is required.

See [Audit Actor Model](audit-actor-model.md) for automatic runtime actor
attribution in audit events.
