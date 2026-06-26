# Structured Await Examples

## Good: Group Independent Work

```Galerina
task LoadDashboard(userId: UserId) -> Result<Dashboard, AppError>
effects [database.read, network.outbound, await] {
  await all timeout 2500ms cancelOnError {
    user = UserDb.find(userId)
    orders = OrderDb.recent(userId)
    alerts = AlertService.get(userId)
    permissions = AuthService.permissions(userId)
  }

  return Ok(Dashboard.from(user, orders, alerts, permissions))
}
```

The work is scoped, typed, timeout-aware and cancellable.

## Good: Race Cache and Database

```Galerina
await race timeout 200ms firstSuccess {
  cache = Cache.get(key)
  database = Database.get(key)
}
```

The losing child is cancelled according to race policy.

## Good: Bounded Stream Processing

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

The stream declares concurrency, backpressure and in-flight limits.

## Bad: External Await Without Timeout

```Galerina
let payment = await PaymentApi.charge(request)
```

Expected diagnostic:

```text
external_await_missing_timeout
External network await has no timeout.
```

## Bad: Hidden Background Work

```Galerina
background sendEmailLater(request)
```

Expected diagnostic:

```text
unscoped_background_task
Background work must be declared as scoped work or handed to a queue/job contract.
```

## Bad: Independent Sequential Awaits

```Galerina
let user = await UserDb.find(userId) timeout 500ms
let orders = await OrderDb.recent(userId) timeout 500ms
let alerts = await AlertService.get(userId) timeout 500ms
```

Expected warning:

```text
independent_sequential_awaits
These awaits do not depend on each other. Consider await all.
```
