# Runtime Boundary Declarations

## Definition

Galerina uses explicit declaration blocks for every runtime boundary: API
endpoints, databases, workers, and queues. Declarations are how the developer
expresses intent; the runtime governs security, identity, and transport
automatically from those declarations.

```text
Declare intent.
Runtime enforces trust, encryption, identity, audit.
```

## API Declaration

```galerina
api payments {
  endpoint: "https://payments.example"
}
```

The runtime automatically applies: TLS, certificate verification, runtime
identity, audit logging, timeout, retry policy, and marks returned data `unsafe`.

Application code:

```galerina
flow charge_order(order: safe Order) -> Receipt
  uses channel.payments.write
{
  let raw: unsafe Any = payments.send(order)
  let receipt: safe Receipt = validate.receipt(raw)
  return receipt
}
```

### Route Declaration

HTTP routes use explicit `route` blocks:

```galerina
route GET "/profile/{id}" {
  request Profile.get
  response Profile.response
  flow getProfile
  permission use profile_read
}

route POST "/orders" {
  request CreateOrderRequest
  response CreateOrderResponse
  flow create_order
  permission use order_write
}
```

Rules:

```text
No route exists unless declared.
No HTTP method is allowed unless declared.
No data enters unless it matches the request schema.
No data leaves unless it matches the response schema and view rules.
```

If a request arrives for an undeclared method, the runtime returns 405 Method Not Allowed.

## Database Declaration

```galerina
database orders {
  source: GlobalVault.database.orders
}

database analytics {
  source: GlobalVault.database.analytics
}
```

The runtime handles: encrypted transport, connection security, identity
verification, audit logging. All query results return `unsafe Any` until validated.

Database usage requires an explicit `uses` declaration:

```galerina
flow get_order(id: safe OrderId) -> Order
  uses database.orders.read
{
  let q: Query = sql {
    SELECT id, total, status FROM orders WHERE id = :id
  }
  let raw: unsafe Any = database.orders.run(q, { id: id })
  let order: safe Order = validate.order(raw)
  return order
}
```

### Multiple Database Declarations

```galerina
database sessions {
  source: GlobalVault.database.sessions
}

database reporting {
  source: GlobalVault.database.reporting
  pool_min: 2
  pool_max: 10
}
```

## Worker Declaration

```galerina
worker image_processor {
  max: 8
  isolation: strict
}
```

Worker options:

```galerina
worker risk_scorer {
  max: 16
  isolation: per_job
  timeout: 30s
  queue: risk_jobs
}
```

Worker invocation:

```galerina
flow process_image(file: safe File) -> ImageResult
  uses worker.image_processor
{
  let result: safe ImageResult = run worker image_processor(file)
  return result
}
```

Worker pool variants (declared in runtime config):

```galerina
worker pool WebPool auto {
  isolate per_request
  memory max 128mb
  time max 5s
  queue max 500
  audit required
}
```

The `auto` keyword lets the runtime manage pool sizing within declared limits.

### Isolation Modes

| Mode | Meaning |
| --- | --- |
| `per_request` | Reset runtime state after every request |
| `per_job` | Isolate each background job |
| `per_actor` | Isolate per actor execution context |
| `per_stream` | Isolate stream processing |
| `strict` | Full isolation, no shared state |

## Queue Declaration

```galerina
queue uploads {
  source: GlobalVault.queue.uploads
}

queue risk_jobs {
  source: GlobalVault.queue.risk
  max_concurrent: 4
  overflow: dead_letter
}
```

Queue trigger wiring:

```galerina
trigger upload_received {
  on: queue.message("uploads")
  run: process_upload
}
```

Queue messages arrive as `unsafe` — they cross a boundary from external producers:

```galerina
flow process_upload(message: unsafe Json) -> Result
  uses worker.image_processor
{
  let upload: safe UploadMessage = validate.upload_message(message)
  return run worker image_processor(upload)
}
```

## Relationship Between Declarations

```text
api declaration   → governs outbound API calls
database declaration → governs database connections
worker declaration → governs background execution
queue declaration  → governs message-passing boundaries
route declaration  → governs inbound HTTP endpoints
```

All of these use GlobalVault for secrets and credentials — never inline values.

## What the Runtime Handles Automatically

For all boundary declarations, the runtime automatically manages:

```text
TLS / encryption
service identity verification
credential rotation
audit logging
timeout enforcement
retry policy
unsafe boundary marking on returned data
```

Developers do not write this logic.

## Core Principle

```text
Every runtime boundary must be declared explicitly.
Declarations express intent.
The runtime enforces security automatically.
```
