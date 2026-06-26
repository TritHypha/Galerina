# Galerina Structured Await

Status: draft language, compiler and report contract.

Galerina Structured Await is the preferred async model for normal Galerina code. It allows
`await`, but it does not make futures, promises, executors, pinning or manual
polling part of everyday application programming.

## Design Rule

```text
Galerina supports waiting and concurrency, but not unstructured async programming.
```

All async work in Galerina must be:

```text
scoped
typed
cancellable
timeout-aware
effect-declared
reportable
memory-bounded where relevant
```

## Syntax Direction

Simple wait:

```Galerina
task FetchCustomerOrder(orderId: OrderId) -> Result<OrderView, AppError>
effects [network.outbound, database.read, await] {
  let customer = await CustomerApi.get(orderId) timeout 2s
  let order = await OrderDb.find(orderId) timeout 500ms

  return Ok(OrderView.from(customer, order))
}
```

Grouped wait:

```Galerina
task LoadDashboard(userId: UserId) -> Result<Dashboard, AppError>
effects [database.read, network.outbound, await] {
  await all timeout 2500ms cancelOnError {
    user = UserDb.find(userId)
    orders = OrderDb.recentFor(userId)
    alerts = AlertService.forUser(userId)
    permissions = AuthService.permissions(userId)
  }

  return Ok(Dashboard.from(user, orders, alerts, permissions))
}
```

Race:

```Galerina
await race timeout 200ms firstSuccess {
  cache = Cache.get(key)
  database = Database.get(key)
}
```

Stream:

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

Queue handoff:

```Galerina
queue EmailJob {
  payload EmailRequest
  retry 3
  timeout 10s
  audit true
}

await queue EmailJob.add(request) timeout 1s
```

## Effect Rules

Pure functions cannot await:

```Galerina
pure flow calculateVat(price: Money<GBP>) -> Money<GBP> {
  return price * 0.20
}
```

Any declaration that waits must declare `await` plus the concrete effect it
uses:

```Galerina
flow loadUser(id: UserId) -> Result<User, DbError>
effects [database.read, await] {
  return await UserDb.find(id) timeout 500ms
}
```

Route handlers may await only inside route/request policy. The Secure App Kernel
owns route-level limits and request cancellation policy; Galerina core owns the syntax
and compiler checks.

## Policy Rules

Production profiles should fail or warn when:

```text
external network await has no timeout
database await has no timeout
awaited work has undeclared effects
async work is started outside a scope
request work can outlive the request without queue handoff
stream processing has unbounded concurrency
queue handoff has no retry, timeout or audit policy where required
```

Independent sequential awaits should produce an optimisation warning:

```Galerina
let a = await ApiA.get() timeout 500ms
let b = await ApiB.get() timeout 500ms
let c = await ApiC.get() timeout 500ms
```

Suggested fix:

```Galerina
await all timeout 500ms {
  a = ApiA.get()
  b = ApiB.get()
  c = ApiC.get()
}
```

## Report Outputs

Structured Await analysis may emit:

```text
app.async-report.json
app.await-report.json
app.concurrency-report.json
app.timeout-report.json
app.queue-report.json
```

Minimum async report fields:

```json
{
  "kind": "async",
  "awaitPoints": 18,
  "awaitGroups": 4,
  "raceBlocks": 1,
  "streamBlocks": 2,
  "queueAwaits": 3,
  "networkAwaitWithoutTimeout": 0,
  "databaseAwaitWithoutTimeout": 0,
  "unscopedTasks": 0,
  "backgroundTasks": 0,
  "structuredConcurrency": true
}
```

## Boundary

```text
galerina-core
  syntax, effect rules, compiler diagnostics and report contracts

galerina-core-runtime
  scheduling, cancellation propagation, timeout enforcement and runtime events

galerina-framework-app-kernel
  request scopes, route limits, queue/job policy and audit events

galerina-core-reports
  shared async/concurrency report shapes
```

Final rule:

```text
Normal developers use await, await all, await race, await stream, queue,
timeout and retry. Runtime/package authors may expose lower-level Future, Task,
Scheduler, Poll or pin-like internals only behind package boundaries.
```
