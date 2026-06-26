# Scoped Vaults

## Status

Status: Future — This feature is not yet implemented in Stage A (Phase 1-15).
Planned for: Stage B

Galerina does not allow global variables, but it still needs efficient state reuse
during requests, flows, sessions and service lifetimes.

## Core Rule

```text
A vault is not a global variable.
A vault is a scoped, permission-controlled runtime storage area owned by a
request, session, flow or service boundary.
```

Galerina does not remove state. It removes uncontrolled state.

## Why Vaults Exist

Without a safe reuse mechanism, application code may repeatedly load the same
data:

```text
validateOrder       -> load customer from database
checkDiscounts      -> load customer from database
calculateDelivery   -> load customer from database
createOrder         -> load customer from database
buildResponse       -> load customer from database
```

With a request vault:

```text
loadCustomerOnce    -> database
validateOrder       -> vault.request
checkDiscounts      -> vault.request
calculateDelivery   -> vault.request
createOrder         -> vault.request
buildResponse       -> vault.request
```

This improves speed without introducing uncontrolled global state.

## Vault Scopes

| Vault | Lifetime | Example use |
|---|---:|---|
| `vault.request` | One HTTP/API request | Reuse customer data during one API call |
| `vault.flow` | One Galerina flow/action | Store intermediate data without passing large values through every step |
| `vault.session` | Logged-in user session | Recently loaded profile, basket or permission summary |
| `vault.service` | Running service instance | Read-only route tables, schema validators or safe config |
| `vault.secure` | Short-lived sensitive storage | PII, payment state, auth metadata or encrypted values |

## Safe Vault Declaration

```galerina
vault request CustomerSessionData {
  key: CustomerId
  type: Customer
  ttl: request
  owner: ctx.user.id
  sensitivity: private
  access: [
    Orders.create,
    Orders.preview,
    Customer.summary
  ]
}
```

The declaration records:

```text
what is stored
where it is stored
how long it lives
who owns it
who can read it
what type it is
what sensitivity it has
```

Set:

```galerina
vault.request.set CustomerSessionData {
  key: ctx.user.id
  value: customer
}
```

Get:

```galerina
let customer = try vault.request.get CustomerSessionData {
  key: ctx.user.id
  require: Orders.create
}
```

## Capability-Based Vault Access

Vault access should not depend only on string keys. The safer pattern is to
require an actor capability or permission token:

```galerina
let customer = try vault.get<Customer>(
  key: CustomerRecord(ctx.user.id),
  using: ctx.capabilities.readCustomerSessionData
)
```

This lets Galerina enforce:

```text
the data exists
the data type matches
the data belongs to this user/session/request
the flow has permission
the data has not expired
the sensitivity level is allowed
the access is recorded
```

## VaultRef Pattern

Flows may return a safe reference instead of passing a large object around:

```galerina
export action Customer.load(
  id: CustomerId,
  ctx: RequestContext
) -> CustomerLoadResult
contract {
  types {
    type CustomerLoadResult = Result<VaultRef<Customer>, Error>
  }
}
{
  let customer = try db.customers.findById(id)

  let ref = vault.request.put<Customer>(
    key: CustomerRecord(id),
    value: customer,
    ttl: request,
    access: [Orders.create, Customer.summary]
  )

  return Ok(ref)
}
```

Another permitted flow can dereference it:

```galerina
let customer = try vault.request.get<Customer>(
  ref: customerRef,
  require: Orders.create
)
```

## Why This Is Not A Global Variable

Global variables are dangerous because access, mutation and lifetime are often
unclear.

Vaults must be:

```text
scoped
typed
permission checked
TTL controlled
owner checked
audited
optionally encrypted
cleared automatically
not shared unless explicitly allowed
```

## Rejected Pattern

```galerina
dbCustomer = db.customers.findById(id)
vault.put(dbCustomer)
```

This is anonymous, unscoped and under-specified.

## Required Pattern

```galerina
vault.request.set CustomerSessionData {
  key: id
  value: dbCustomer
  ttl: request
  owner: ctx.user.id
  access: [Orders.create]
}
```

This declares what is stored, where it is stored, how long it lives, who owns it,
who can read it, what type it is and how sensitive it is.

## Fast Response Path

Scoped vaults support fast response handling without global state.

The secure runtime can combine:

```text
keep-alive connection
preloaded route table
prebuilt schema validator
preloaded security policy
request vault
session vault
database pool
outbound API pool
```

The response path becomes:

```text
request arrives
route found quickly
policy checked quickly
data already in request/session vault if valid
database call skipped where safe
typed response returned over existing connection
```

The performance rule is:

```text
Galerina can be fast because it knows the safe path before the request arrives.
```

## Data Flow Permission Boundary Report Fit

Vaults fit the core model:

| Concept | Vault role |
|---|---|
| `data` | typed vault entry, owner, sensitivity and TTL |
| `flow` | declared flow that stores or reads the entry |
| `permission` | authority required to access the entry |
| `boundary` | request/session/service/secure vault trust boundary |
| `report` | proof of vault access, retention and permission checks |

Example:

```text
User sends create order request
Data: CreateOrderRequest and CustomerProfile
Flow: Orders.create
Permission: OrdersCreate and CustomerRead
Boundary: PublicApi -> AppKernel -> Database -> SessionVault
Report: order flow, data access, permission and boundary event recorded
```

## Runtime Plan Example

```galerina
flow Orders.create {
  input: CreateOrderRequest
  output: OrderResponse

  boundary: PublicApi
  permission: OrdersCreate

  uses data {
    CustomerProfile from vault.session fallback db.customers
    Order from db.orders
  }

  steps {
    validate input

    let customer = try get CustomerProfile {
      key: ctx.user.id
    }

    let order = try create Order {
      customer: customer
      items: input.items
    }

    return OrderResponse.from(order)
  }

  report {
    include: [
      dataAccess,
      permissions,
      vaultAccess,
      boundaries,
      errors
    ]
  }
}
```

## Vault Rules

```text
No unscoped vaults.
No anonymous vault writes.
No untyped vault values.
No vault access without declared permission.
No cross-user session reads.
No permanent session data without TTL.
No secrets in normal vaults.
No sensitive data in logs, reports or AI output.
No stale database records unless cache policy allows it.
Vault access must appear in the app security report.
```

## Reports

Galerina should generate:

```text
vault-report.json
vault-access-report.json
vault-security-report.json
vault-retention-report.json
vault-performance-report.json
```

The report should show which flows can store, read, update or delete each vault
type.
