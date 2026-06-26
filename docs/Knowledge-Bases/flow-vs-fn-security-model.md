# Flow vs fn Security Model

## Definition

Galerina has three distinct execution constructs. They are not interchangeable.

```text
route = external entry point — exposes a flow to callers
flow  = governed execution logic — the runtime plans, audits, and checks this
fn    = local helper routine — pure computation, no runtime authority
```

The execution hierarchy is:

```text
route -> flow -> fn
```

A `route` delegates to a `flow`. A `flow` calls `fn` helpers for local computation.
Effects propagate upward: if a `fn` uses `database.write`, the `flow` calling it
must also declare or be permitted for that effect, and by extension so must the `route`.

Galerina is a **flow-first language**. The primary governed execution unit is `flow`.

## TL;DR
- route → flow → fn: expose, govern, compute
- fn may only appear inside a flow body — top-level fn is SPORE-SYNTAX-005
- fn cannot declare effects, authority, or await — it is always synchronous

---

## route

A `route` is an external entry point. It exposes a `flow` to callers (HTTP, webhook,
scheduled job, event trigger). A route does not contain logic — it declares the
contract and delegates to a flow.

```galerina
route POST "/orders" {
  request CreateOrderRequest
  response OrderResponse
  flow createOrder
}
```

A `route`:
- Declares the request and response shape
- Names the `flow` that handles the request
- Optionally declares permissions the caller must satisfy
- Does not contain business logic

---

## flow

A `flow` represents governed execution logic that is runtime-managed and
may interact with trusted systems and infrastructure.

A `flow` may:

```text
return values
declare runtime permissions (uses)
access GlobalVault
call backend services
perform network operations
access databases
read/write files
spawn workers
emit events
be audited
be scheduled by the runtime
cross trust boundaries
```

Example:

```galerina
flow checkout_order(order: Order) -> Receipt
  uses vault.payments.read
  uses network.internal
{
  let total = calculate_total(order)
  let payment = GlobalVault.payments.charge(order.payment_id, total)
  return Receipt(payment.id)
}
```

## fn

`fn` is reserved for local helper logic only. A helper function has no runtime
authority.

A `fn` may only be declared inside a `flow` body. It is not a top-level
declaration form.

A `fn` cannot:

```text
request permissions
declare uses
declare effects [...]
access GlobalVault
perform network operations
access databases
access files
access secrets
call backend services directly
spawn workers
perform payment operations
cross trust boundaries
use task or wait (async work)
create background work
```

If a local `fn` uses an operation with effects, those effects are attributed to
the containing flow. The `fn` itself still cannot declare effects or authority.

The purpose of `fn` is purely:

```text
computation
formatting
transformation
local reusable logic
```

Example:

```galerina
pure flow calculateTotal(price: Money<GBP>) -> Money<GBP> {
  fn calculateVat(value: Money<GBP>) -> Money<GBP> {
    return value * Decimal("0.20")
  }

  return price + calculateVat(price)
}
```

## fn Scope Rules

- `fn` may only appear inside a `flow` body.
- Top-level `fn` is a compiler error: `SPORE-SYNTAX-005`.
- `fn` may not declare `effects [...]` or `with effects [...]`; this is
  `SPORE-SEC-014`.
- `fn` may not request authority, capabilities, permissions, or `uses`.
- `fn` may use effects only when the containing flow declares those effects.
- Effects used inside a `fn` count as observed effects of the containing flow.
- `fn` is always synchronous.
- `fn` cannot spawn tasks and cannot use `task`, `wait`, `async`, or `await`.

Correct local helper, from CEC example 004:

```galerina
pure flow calculateTotal(price: Money<GBP>) -> Money<GBP> {
  fn calculateVat(value: Money<GBP>) -> Money<GBP> {
    return value * Decimal("0.20")
  }

  return price + calculateVat(price)
}
```

Correct pure local helper, from CEC example 109:

```galerina
pure flow calculateTotal(prices: List<Money<GBP>>) -> Money<GBP> {
  fn sum(acc: Money<GBP>, item: Money<GBP>) -> Money<GBP> {
    return acc + item
  }
  return prices.reduce(Money.gbp("0.00"), sum)
}
```

Correct effect use through containing flow, from CEC example 110:

```galerina
guarded flow syncOrders(orders: List<Order>) -> SyncOrdersResult
contract {
  types {
    type SyncOrdersResult = Result<Unit, SyncError>
  }
  effects {
    network.outbound
    database.write
  }
}
{
  fn fetchRate(currency: String) -> Result<Decimal, RateError> {
    unsafe let rawResponse = http.get("https://rates.example.com/" + currency)?
    return json.decode(rawResponse)
  }
  let rate = fetchRate("GBP")?
  let _ = OrdersDB.insert(orders[0])?
  return Ok(unit)
}
```

Invalid: local `fn` observes an effect not declared by the parent flow, from CEC
example 111:

```galerina
guarded flow saveOrderOnly(order: Order) -> SaveOrderOnlyResult
contract {
  types {
    type SaveOrderOnlyResult = Result<Unit, SaveError>
  }
  effects {
    database.write
  }
}
{
  fn fetchRate(currency: String) -> Result<Decimal, RateError> {
    unsafe let rawResponse = http.get("https://rates.example.com/" + currency)?
    return json.decode(rawResponse)
  }
  let _ = OrdersDB.insert(order)?
  return Ok(unit)
}
```

Invalid: local `fn` declares its own effects, from CEC example 112:

```galerina
guarded flow processOrder(order: Order) -> ProcessOrderResult
contract {
  types {
    type ProcessOrderResult = Result<Unit, ProcessError>
  }
  effects {
    database.write
  }
}
{
  fn save(o: Order) -> Result<Unit, SaveError>
    with effects [database.write]
  {
    return OrdersDB.insert(o)
  }
  return save(order)
}
```

## Security Boundary Rule

```text
route  = external entry point — no logic, delegates to flow
flow   = can cross trust boundaries, declare effects, hold permissions
fn     = cannot cross trust boundaries, no runtime authority
```

| Construct | Authority Level | Contains logic? |
| --- | --- | --- |
| `route` | Entry point only | No — delegates to flow |
| `flow` | Runtime-authorized | Yes — governed execution |
| `fn` | Local-only | Yes — pure computation only |

## Compiler Status

```
fn keyword:    specified — implementation pending (Phase 7+)
flow keyword:  implemented (Phase 4+)
route keyword: specified — implementation pending (Phase 7+)
```

## Compiler Enforcement

If a `fn` attempts to request authority, the compiler rejects it:

```galerina
fn get_secret(user_id: Id) -> Secret
  uses vault.secrets.read
{
  GlobalVault.secrets.get(user_id)
}
```

Compiler error:

```text
SPORE-SEC-014:
fn declarations cannot request runtime authority.
Move this operation into a flow or pass the required value as an argument.
```

## Correct Pattern

```galerina
flow load_secret(user_id: Id) -> Secret
  uses vault.secrets.read
{
  return GlobalVault.secrets.get(user_id)
}

fn mask_secret(secret: Secret) -> Text {
  secret.mask()
}
```

`flow` performs privileged access. `fn` performs safe local transformation.

## Language Philosophy

Galerina avoids `function`, `def` as primary execution primitives.
`flow` is the core governed execution unit. `fn` is for pure local helpers.
`route` is for external exposure only.

```text
route -> flow -> fn

Use route to expose.
Use flow to govern.
Use fn to compute.
```

Galerina's bigger model:

```text
intent -> governed execution plan -> coordinated compute
```

`flow` is where ordinary code becomes part of a governed execution plan.

This reinforces: explicit authority, runtime visibility, secure execution,
auditable behaviour and orchestration-first architecture.

## Async Rule

`flow` may start governed async tasks and wait for results. `fn` may not.

```galerina
// Correct — flow uses task and wait
flow build_report(user_id: safe Id) -> Report
  uses database.users.read
  uses database.analytics.read
{
  let user_task = task database.users.get(user_id)
  let stats_task = task database.analytics.get(user_id)

  let user: safe User = wait user_task
  let stats: safe Stats = wait stats_task

  return make_report(user, stats)
}

// Compiler error — fn cannot use task
fn bad_helper(id: safe Id) -> safe User {
  let t = task database.users.get(id)  // ERROR: SPORE-SEC-014
  return wait t
}
```

```text
fn = synchronous helper only
flow = may start task, may wait, returns after all required tasks complete
```

## Rule

```text
Use route to expose a flow to external callers.
Use flow for all governed application logic.
Use fn only for local helper routines that require no runtime authority.

fn is always synchronous.
flow may be asynchronous via task/wait.
route delegates — it never contains logic.
```

The simple decision:

```text
Is this an external entry point?          → route
Does this need runtime authority/effects? → flow
Is this pure local computation?           → fn
```
