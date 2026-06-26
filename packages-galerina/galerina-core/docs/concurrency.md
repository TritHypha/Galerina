# Galerina Concurrency

This document defines the Galerina core language contract for structured concurrency.

Status: draft language and compiler contract. Runtime scheduling and execution
details belong in `packages-galerina/galerina-core-runtime/`. API workload controls, queue handoff,
rate limits and request cancellation policy belong in `packages-galerina/galerina-framework-app-kernel/`.

## Purpose

Galerina concurrency should make asynchronous work explicit, bounded and reportable.
The normal developer model is **Structured Await**: code may wait with
`await`, but async work must stay scoped, typed, cancellable, timeout-aware and
visible in reports. Galerina should not expose futures, promises, executor plumbing,
pinning or manual polling as the ordinary application programming model.

It should support:

```text
await
await all
await race
await stream
scoped tasks
timeouts
cancellation
channels
workers
worker pools
backpressure
dead-letter queues
safe shared state
```

## Core Rule

```text
Concurrency must be structured.
Effects must be declared.
Cancellation must be visible.
External waits must have timeouts.
Shared mutable state must be controlled.
Failures must be typed and source-mapped.
```

Galerina should avoid:

```text
unbounded background work
hidden shared mutation
silent task failures
unreported cancellation
unbounded queues
data races
secret leakage in concurrent logs
```

## Structured Await

Simple waits should read like synchronous code:

```Galerina
task FetchCustomerOrder(orderId: OrderId) -> Result<OrderView, AppError>
effects [network.outbound, database.read, await] {
  let customer = await CustomerApi.get(orderId) timeout 2s
  let order = await OrderDb.find(orderId) timeout 500ms

  return Ok(OrderView.from(customer, order))
}
```

Independent waits should be grouped so the compiler and runtime can schedule
them safely:

```Galerina
task LoadDashboard(userId: UserId) -> Result<Dashboard, AppError>
effects [database.read, network.outbound, await] {
  await all timeout 2500ms cancelOnError {
    user = UserDb.find(userId)
    orders = OrderDb.recentFor(userId)
    alerts = AlertService.forUser(userId)
  }

  return Ok(Dashboard.from(user, orders, alerts))
}
```

Compiler checks should include:

```text
await is valid only in task, async flow or an effect-declared handler
await requires the current declaration to include the await effect
pure functions cannot await
network/database awaits require timeout policy in production profiles
independent sequential external awaits produce an optimisation warning
raw futures/promises cannot escape normal application code
```

## Await Forms

The core language should standardise on a small set of waiting forms:

```text
await one
await all
await race
await stream
await queue
await retry
```

`await one` waits for one operation and is equivalent to ordinary `await` with
explicit policy. `await all` starts child operations inside one scope and binds
all declared results. `await race` waits according to a race policy such as
`firstSuccess` or `firstResult`. `await stream` consumes a bounded stream with
backpressure. `await queue` hands work to a declared queue/job contract. `await
retry` retries only errors marked retryable by policy.

Cancellation modes should include:

```text
cancelOnError
waitForAll
firstSuccess
firstResult
timeoutCancel
manualCancel
```

Example race:

```Galerina
await race timeout 200ms firstSuccess {
  cache = Cache.get(key)
  database = Database.get(key)
}
```

## Scopes and Tasks

Example:

```Galerina
scope RequestWork {
  await all timeout 2s cancelOnError {
    customer = CustomerApi.get(id)
    orders = OrderDb.list(id)
    payment = PaymentApi.status(id)
  }
}
```

Compiler checks should include:

```text
every task belongs to a scope
request-scoped children cannot outlive the request unless queued explicitly
unfinished children are cancelled or completed according to declared policy
task result and failure types are handled
task effects are allowed in the current scope
```

## Parallel Blocks Compatibility

Older planning docs used `parallel { ... }`. New Galerina source should prefer
`await all { ... }` because it makes waiting, scope and result binding explicit.
The compiler may keep `parallel` as a compatibility spelling during the draft
period, but diagnostics should suggest `await all`.

Example:

```Galerina
parallel {
  customer = await CustomersApi.get(input.customerId)
  stock = await StockApi.check(input.items)
  risk = await RiskApi.score(input)
} timeout 5s catch error {
  return Err(ApiError.ExternalServiceFailed(error))
}
```

Compiler checks should include:

```text
timeout exists for external work
effects are declared
shared writes are rejected unless explicitly controlled
all branch errors are handled
cancellation path is source-mapped
```

## Streams and Backpressure

Streams must be memory-bounded. Unbounded per-event spawning is not allowed.

```Galerina
await stream Orders from OrderQueue {
  concurrency 8
  backpressure required
  maxInFlight 100

  process order {
    await ProcessOrder(order) timeout 10s
  }
}
```

Compiler and runtime checks should include:

```text
stream concurrency is bounded
max in-flight work is bounded
backpressure policy exists
per-item timeout exists for external work
child cancellation is propagated on shutdown
```

## Channels

Example:

```Galerina
channel orders: Channel<OrderEvent> {
  buffer 1000
  overflow "reject"
  dead_letter "./storage/dead/orders.jsonl"
}
```

Channel declarations should define:

```text
item type
buffer limit
overflow behaviour
dead-letter policy where relevant
effect permissions for storage or network handoff
```

Allowed overflow policies may include:

```text
reject
wait
drop_oldest
drop_newest
dead_letter
scale_worker
```

Production builds should warn or fail on unbounded channels.

## Workers

Example:

```Galerina
worker OrderWorker count 8 {
  for event in orders {
    processOrderEvent(event)
  }
}
```

Worker checks should include:

```text
worker count is bounded
input channel exists
handler effects are declared
shared state is controlled
errors are handled or dead-lettered
shutdown path is defined
```

## Safe Shared State

Shared mutable state must be explicit.

Recommended rule:

```text
immutable by default
local mutation by declaration
shared mutation only through controlled state
```

Compiler diagnostics should reject:

```text
unsynchronised shared mutation
capturing mutable references across tasks
borrowing values beyond their safe lifetime
printing SecureString values from concurrent workers
```

## Reports

Galerina should generate concurrency-related report entries in:

```text
app.async-report.json
app.await-report.json
app.concurrency-report.json
app.timeout-report.json
app.queue-report.json
app.security-report.json
app.runtime-report.json
app.memory-report.json
app.failure-report.json
app.ai-context.json
```

Report entries should include:

```text
async tasks
await points
await all/race/stream blocks
parallel blocks
channels
workers
timeouts
cancellation paths
sequential await optimisation suggestions
backpressure policy
dead-letter policy
shared state warnings
source locations
```

## Package Boundaries

```text
galerina-core
  syntax, compiler checks and report contracts

galerina-core-runtime
  execution, scheduling, cancellation propagation and runtime errors

galerina-framework-app-kernel
  API workload controls, queue handoff, request cancellation and rate limits

galerina-core-tasks
  safe project automation tasks, not application async runtime
```

Final rule:

```text
galerina-core defines Structured Await and structured concurrency contracts.
galerina-core-runtime executes them.
galerina-framework-app-kernel applies API/runtime policy around them.
```
