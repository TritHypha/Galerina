# Core Application Model

Galerina uses five beginner-facing concepts for secure application design:

```text
data
flow
permission
boundary
report
```

This model simplifies the developer surface while preserving the stronger
internal security model.

## Concept Map

| Concept | Meaning | Contains |
|---|---|---|
| `data` | Anything the application reads, receives, creates, changes or returns | models, requests, responses/views, vault entries, storage records, classifications |
| `flow` | The controlled path data follows through the application | validation, permission checks, loading, saving, response creation, errors |
| `permission` | What is allowed | actor authority, effects, policies, data exposure, audit |
| `boundary` | Where Galerina connects to another trust area | packages, storage, external APIs, events, AI/tools, compute |
| `report` | Proof of what was checked | generated evidence for humans, tools and AI |

See [Galerina Concept Map](galerina-concept-map.md) for the detailed concept index
under this five-part model.

## Design Rule

Galerina should simplify the surface, not weaken the system.

```text
data       = model + request + response/view
permission = policy + effects + capabilities + audit
boundary   = package + storage + external + event + AI/tool + compute
```

Internally, Galerina still preserves the detailed concepts so the compiler,
runtime and reports can reason precisely.

Beginner-facing docs should teach the five concepts first. Detailed concepts
then sit underneath them.

## Data

Data includes:

```text
request data
database records
API responses
session data
vault data
configuration data
user profile data
order data
payment data
files
logs
generated reports
```

Data should be typed and classified:

```galerina
data PaymentMethod {
  id: PaymentMethodId view: public
  providerRef: Text view: private
  lastFourDigits: Text view: public
  cardholderName: Text view: private
}
```

Galerina must distinguish public, private, sensitive and secret data.

## Flow

A flow is the controlled path data follows:

```text
request arrives
validate request
check permission
load data
perform action
save result
return response
write report event
```

Galerina should avoid hidden behavior:

```text
silent database writes
silent network calls
silent permission checks
silent cache access
silent vault access
```

The flow should show what can happen.

## Permission

Permission controls whether a flow can read, write, call or expose something.

Galerina should ask:

```text
Can this flow read this data?
Can this flow write this data?
Can this flow use the vault?
Can this flow call an external API?
Can this flow send an email?
Can this flow make a payment?
Can this flow expose data in a response?
```

## Boundary

A boundary is any place where data crosses from one trust area into another:

```text
browser -> server
public API -> application
application -> database
application -> payment provider
request flow -> session vault
session vault -> response
trusted code -> untrusted input
```

Every boundary crossing should validate data, check permission and record what
happened.

## Report

Reports prove what the application is allowed to do:

```text
app.data-report.json
app.flow-report.json
app.permission-report.json
app.boundary-report.json
app.vault-report.json
app.security-report.json
app.audit-report.json
```

Example report shape:

```json
{
  "flow": "Orders.create",
  "input": "CreateOrderRequest",
  "output": "OrderResponse",
  "permissions": ["OrdersCreate", "CustomerRead"],
  "boundaries": ["PublicApi", "Database", "SessionVault"],
  "dataAccess": [
    {
      "data": "CustomerProfile",
      "source": "vault.session",
      "permission": "CustomerRead",
      "sensitivity": "private"
    }
  ]
}
```

## Model And Response Rule

Do not fully merge model and response.

Use model views where useful:

```galerina
data User {
  model {
    id: UUID view: public
    email: Email view: private
    passwordHash: SecureString view: secret
  }

  request get {
    userId: UUID view: public
  }

  view public {
    include id
    deny email
    deny passwordHash
  }

  view authorised {
    include id
    include email requires permission users.private.read
    deny passwordHash
  }
}
```

The model is internal data. The view is safe output.

See [Model Views And Data Blocks](model-views-and-data-blocks.md).

## Flow Rule

A flow is reusable execution logic. It should not be merged with a route.

```galerina
flow getUser(
  request: User.get,
  ctx: RequestContext
) -> Result<User.authorised, ApiError>
  permission use user_read_with_pii
{
  let user = try UsersRepository.findRequired(request.userId)
  return Ok(User.authorised.from(user))
}
```

Routes, events, jobs and tools may call flows, but they remain separate
boundaries.

## Permission Rule

Permission is the developer-facing authority block.

```galerina
permission user_read_with_pii {
  actor require users.read
  actor require users.private.read

  code allow db.read
  code allow audit.write
  code deny network.external

  data allow expose view: private with users.private.read
  data deny expose view: secret

  audit required event "user.read"
}
```

Internally this compiles into capability checks, effect checks, policy decisions
and report output.

See [Developer-Friendly Permission Model](developer-friendly-permission-model.md).

## Boundary Rule

Boundaries describe trust crossings.

```galerina
boundary storage UsersDatabase {
  type postgres
  model User
  permission use user_storage_access
}
```

```galerina
boundary ai SupportAssistant {
  type ai_tool
  input SupportQuestion
  output SupportAnswer
  permission use support_ai_access
}
```

Every boundary crossing should validate data, check permission and generate
evidence.

## Polymorphism

Polymorphism fits the same model:

| Concept | Polymorphism role |
|---|---|
| `data` | generic and variant data shapes |
| `flow` | contract-defined behavior |
| `permission` | required authority for an implementation |
| `boundary` | adapter, external, storage, AI/tool or compute boundary |
| `report` | proof of which implementation and effects were used |

## Core Statement

Galerina does not guess trust. It declares data, flow, permission, boundary and
report so humans, tools and AI can understand what the system is allowed to do
before it runs.

Galerina code should communicate system intent, not only machine instructions.
See [Software As Declared Intent](software-as-declared-intent.md).

For a compact beginner example, see
[Hello World API Pattern](hello-world-api-pattern.md).
