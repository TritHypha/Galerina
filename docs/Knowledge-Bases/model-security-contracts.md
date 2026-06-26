# Model Security Contracts

## Purpose

Galerina should treat models as first-class security contracts, not just
database-style data shapes.

The recommended model is:

```text
model = internal data shape
      + view metadata
      + memory rules
      + mutation rules
      + relationship rules
      + report source
```

## Short Definition

A Galerina model is a view-governed, reportable internal data contract used by
secure flows and exposed only through declared response or view contracts.

## Core Rule

```text
Models describe internal truth.
Requests describe what may enter.
Responses/views describe what may leave.
Secure flows control how models are used.
Reports prove the rules were followed.
```

Public routes must not return raw models.

Rejected:

```galerina
return Ok(user)
```

Accepted:

```galerina
return Ok(UserResponse.from(user))
```

## Suggested Placement

```text
models/
  user.model.ln
  order.model.ln
  payment.model.ln

requests/
  get-user.request.ln
  create-order.request.ln

responses/
  user.response.ln
  order.response.ln

flows/
  users.flow.ln
  orders.flow.ln

policies/
  data.policy.ln
  response.policy.ln
  memory.policy.ln

routes/
  users.route.ln
  orders.route.ln
```

Placement rules:

- shared domain models go in `models/`
- request-only shapes go in `requests/`
- public output shapes go in `responses/`
- database-specific mappings go in `storage/` or `repositories/`
- temporary flow-only shapes may live near the secure flow

## Model Syntax

Use first-class view metadata for field exposure:

```galerina
model User {
  id: UUID view: public
  email: Email view: private
  passwordHash: SecureString view: secret
  internalRiskScore: RiskScore view: internal
  createdAt: DateTime view: public
  updatedAt: DateTime view: internal
}
```

Production mode should require every model field to have a view.

## View Levels

Starting view levels:

```text
public
internal
private
confidential
secret
restricted
regulated
```

## Model And Response Separation

Models are internal contracts. Responses and views are safe output contracts.

```galerina
response UserResponse from User {
  include id
  include email requires capability users.private.read

  deny passwordHash
  deny internalRiskScore
}
```

The compiler should be able to check:

- `passwordHash` never leaves
- `internalRiskScore` does not leave public boundaries
- `email` requires `users.private.read`
- `User` is not returned directly from public routes

## Field Read Permissions

Database field reads should prefer explicit field allow lists:

```galerina
allow read Profiles fields: [
  id,
  owner,
  name
]
```

Broad read rules are possible but riskier:

```galerina
allow read Profiles fields: all except [
  email
]
```

`all except` must remain visible and reportable because new fields may be added
later. Sensitive tables should prefer explicit allow lists or the safer
`all current except` mode.

See [Field Read Rules](field-read-rules.md).

## Relationships

Model relationships should be explicit and reportable.

```galerina
relationship User.orders {
  from User.id
  to Order.userId
  type one_to_many
}
```

Galerina should avoid hidden lazy-loading behaviour such as `user.orders` when it
silently performs database access.

Prefer:

```galerina
let orders = try OrdersRepository.findByUserId(user.id)
```

or a declared relation loader with effects.

## Memory Rules

Model memory rules should prefer:

- immutable by default
- no raw pointers
- no unchecked field access
- no global model state
- `ReadOnly<T>` for large model collections
- explicit clone for large copies
- copy-on-write where appropriate
- secret fields cannot escape declared scopes

Example:

```galerina
secure flow summariseOrders(
  orders: ReadOnly<List<Order>>,
  ctx: RequestContext
) -> SummariseOrdersResult
contract {
  types {
    type SummariseOrdersResult = Result<OrderSummary, ApiError>
  }
}
{
  let summary = Orders.summarise(orders)
  return Ok(summary)
}
```

## Safe Mutation

Avoid direct uncontrolled mutation:

```galerina
user.email = newEmail
user.role = Admin
user.internalRiskScore = RiskScore.zero
```

Use declared mutations or secure flows:

```galerina
mutation User.changeEmail {
  field email
  require valid Email
  require capability users.email.update
  require audit.write
}
```

Then:

```galerina
let updated = User.changeEmail(user, request.email)
```

## Storage Separation

Models should not own database behaviour directly.

Avoid active-record style:

```galerina
user.save()
user.delete()
User.findById(id)
```

Prefer repositories:

```galerina
let user = try UsersRepository.findRequired(userId)
let saved = try UsersRepository.save(updatedUser)
```

Mental model:

```text
model = data and rules
repository = storage access
secure flow = execution/security boundary
policy = permissions and effects
```

## Model Reports

Galerina should generate machine-readable model reports:

```text
model-index.json
model-definitions.json
model-effective.json
model-exposure.json
model-relationships.json
model-mutation-report.json
model-ai-summary.json
model-human-summary.md
```

## Model Index

`model-index.json` answers:

```text
Which models exist?
Where are they defined?
Which responses, flows, routes and policies use them?
```

## Model Definitions

`model-definitions.json` answers:

```text
What does each model contain?
What is each field type?
What is each field view?
What validation or memory rules apply?
```

## Model Effective Rules

`model-effective.json` answers:

```text
After all policies are applied, what is the actual security meaning of this model?
```

It should include facts such as:

- raw model return allowed: false
- response contract required: true
- secret fields
- PII fields
- internal fields
- audit required when exposing
- never-expose fields

## Model Exposure

`model-exposure.json` answers:

```text
Which model fields leave the system through responses, routes or exports?
```

This is the most important model security report because it helps prevent
accidental data leaks.

## AI Summary

`model-ai-summary.json` gives AI tools safe guidance:

```json
{
  "reportType": "galerina.model.ai_summary",
  "models": [
    {
      "name": "User",
      "safeToReturnDirectly": false,
      "publicFields": ["id"],
      "piiFields": ["email"],
      "secretFields": ["passwordHash"],
      "internalFields": ["internalRiskScore"],
      "useResponses": ["UserResponse", "UserAdminResponse"],
      "aiGuidance": [
        "Do not return User directly from public routes.",
        "Use UserResponse for public output.",
        "Never include passwordHash in responses, logs or reports."
      ]
    }
  ]
}
```

## Speed Principle

```text
Model safety should be expensive at check/build time and cheap at runtime.
```

Galerina should precompute:

- field view maps
- response projection functions
- secret redaction maps
- mutation permission checks
- relationship maps
- storage mapping metadata
- AI summaries
- exposure reports

## Compiler Checks

Galerina should reject:

- unclassified production model fields
- public routes returning raw models
- secret fields included in responses
- PII included without policy
- internal fields exposed in public responses
- credentials logged or printed
- direct mutation without mutation rule
- relationships using incompatible field types
- models with hidden storage effects
- large models copied without explicit clone
- secret fields escaping scope

## Priority Category Placement

Non-negotiable rules:

- public routes must not return raw internal models
- secret and credential fields must never be returned or printed
- production model fields must be classified
- model mutation must be explicit and policy-controlled
- no hidden global model state

Core language rules:

- models define internal data shape
- model fields may include view metadata
- responses define safe output from models
- relationships must be explicit
- mutations must be declared or performed through secure flows

Recommended design rules:

- prefer models for internal truth
- prefer responses/views for output
- prefer repositories for storage
- prefer secure flows for behaviour
- prefer classification over public/private-only design
- prefer build-time model reports over runtime reflection

## Core Principle

```text
Galerina models are not public DTOs and not database-active records.
They are view-governed internal data contracts used by secure flows and exposed only through declared response contracts.
```
