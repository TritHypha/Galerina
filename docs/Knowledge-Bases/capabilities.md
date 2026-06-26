# Capabilities

Capabilities describe what a user, service, package, flow, tool or actor is
authorised to do.

## Simple Definition

```text
capabilities = declared permissions / powers
```

Capabilities answer:

```text
Who is allowed to do this?
What are they allowed to access?
For what purpose?
```

## Capabilities Versus Effects

| Concept | Meaning | Example |
|---|---|---|
| `effects` | What the code is technically allowed to do | `db.read`, `db.write`, `audit.write` |
| `capabilities` | What the actor is authorised to do | `users.read`, `users.email.update`, `users.pii.read` |

Both are usually required. A flow may technically be allowed to write to storage,
but the actor still needs authority to perform the business action.

## Flow Example

```galerina
secure flow updateUserEmail(
  request: UpdateEmailRequest,
  ctx: RequestContext
) -> Result<UserResponse, ApiError>
  capabilities {
    require users.email.update
    require users.pii.read
  }
{
  let user = try UsersRepository.findRequired(request.userId)
  let updated = try User.changeEmail(user, request.email)

  return Ok(UserResponse.from(updated))
}
```

This means the actor must be allowed to update user email addresses and read PII
before the flow can run safely.

## Response Exposure Example

```galerina
model User {
  id: UUID view: public
  email: Email view: private
  passwordHash: SecureString view: secret
  internalRiskScore: RiskScore view: internal
}
```

```galerina
response UserResponse from User {
  include id
  include email requires capability users.pii.read

  deny passwordHash
  deny internalRiskScore
}
```

This means:

```text
id can be returned because it is public
email can only be returned when users.private.read is present
passwordHash can never be returned
internalRiskScore is denied in this response
```

## Capability Examples

Web application:

```text
users.read
users.create
users.update
users.delete
users.email.update
users.pii.read
users.role.grant
orders.read
orders.create
orders.cancel
orders.refund
payments.charge
payments.refund
reports.view
reports.export
admin.access
audit.read
audit.write
```

AI/tool system:

```text
ai.customer_support.read
ai.knowledge_base.search
ai.email.draft
ai.email.send
ai.external_tool.call
```

Data system:

```text
dataset.read
dataset.write
dataset.export
dataset.pii.read
dataset.financial.read
```

## Grant Sources

Capabilities may come from roles:

```galerina
role SupportAgent {
  grant users.read
  grant users.pii.read
  grant orders.read
}
```

Capabilities may come from policy:

```galerina
policy capability UserAccessPolicy {
  allow users.read when ctx.actor.department == "support"
  allow users.pii.read when ctx.actor.role == "manager"
  deny users.role.grant unless ctx.actor.role == "admin"
}
```

Capabilities may be declared by package or app manifests:

```galerina
package users {
  requires capability db.user.read
  requires capability audit.write
}
```

## Developer-Facing Permission Model

Normal Galerina application code should prefer reusable `permission` blocks:

```galerina
permission user_email_update {
  actor require users.email.update
  actor require users.pii.read

  code allow db.read
  code allow db.write
  code allow audit.write

  data allow expose view: private with users.private.read
  data deny expose view: secret

  audit required event "user.email.update"
}
```

Internally, Galerina compiles permission into:

```text
actor capability checks
code effect checks
data exposure policy
audit requirements
report proof
```

## Boundary Check Points

Capabilities should be checked wherever protected authority crosses a Galerina
boundary.

| Boundary | Capability question |
| --- | --- |
| secure flow | May this actor perform this protected action? |
| route | May this caller enter this public/API boundary? |
| response/view | May this actor see this classified output? |
| package | May this package expose or request this authority? |
| adapter/connector | May this integration perform this external action? |
| AI/tool or MCP boundary | May this agent/tool call this action or see this resource? |
| scoped vault | May this actor read/write this scoped value? |

Capability checks at these boundaries should produce effective reports so
humans, AI tools and deployment systems can see what authority was required and
where it was granted or denied.

## Capability Grant Rules

Capabilities may be granted by role, policy, app profile, package manifest or
temporary lease.

Rules:

```text
grants must be explicit
grants must be attributable
grants must be scoped where possible
grants must be revocable where possible
delegated grants must not be broader than the delegator's authority
missing grants fail closed
```

## Security Rules

```text
Sensitive action requires capability.
Sensitive data exposure requires capability.
Capabilities must be checked at secure flow, route, package, response and tool boundaries.
Missing capability must fail closed.
Capability checks must be reportable.
Effects must not be used as a substitute for actor authority.
```

## Performance Rule

Capabilities should be expensive to validate at build/check time and cheap to
check at runtime.

At build time Galerina can generate a table:

```text
getUser requires:
- users.read
- users.pii.read
```

At runtime the secure runtime can check the precomputed table against
`ctx.actor.capabilities`.

## AI Guidance

AI tools should treat capability declarations as security intent:

```text
This flow handles personal data.
Do not remove the permission check.
Do not suggest returning the raw model.
Do not expose classified fields casually.
```

Capabilities make authorization visible instead of hiding it in arbitrary code.
