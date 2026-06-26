# Guarded Flow Specification

## Definition

`guarded flow` is the v1 effectful execution unit. It is used when a flow may
perform governed side effects but is not itself the external trust boundary.

```galerina
guarded flow saveOrder(order: Order) -> SaveOrderResult
contract {
  types {
    type SaveOrderResult = Result<OrderId, OrderError>
  }
  effects {
    database.write
  }
}
{
  let orderId = OrdersDB.insert(order)?
  return Ok(orderId)
}
```

Canonical syntax:

```text
guarded flow name(params) -> ReturnType
contract {
  effects { effect.name, other.effect }
}
{
  body
}
```

During migration, the grammar may also accept `effects [...]` without `with`,
but the preferred form uses `contract { effects { ... } }` for guarded flows.

## Role

Use `guarded flow` for governed operations such as:

- database reads and writes
- outbound network calls
- filesystem access
- audit writes
- calls to other effectful flows

Use `pure flow` for deterministic computation and `secure flow` at trust
boundaries where protected data, validation, policy, and audit requirements are
first established.

## Rules

- A guarded flow must declare every effect it uses.
- A guarded flow may call pure flows.
- A guarded flow may define and call local `fn` helpers.
- Effects observed inside local `fn` helpers count against the containing
  guarded flow.
- A guarded flow may call another effectful flow only when it declares the
  callee's transitive effects.
- Missing direct or transitive effects are reported with `SPORE-EFFECT-*`.
- `guarded flow` is not a synonym for `secure flow`; it does not by itself mark
  an external trust boundary.

## Effect Propagation Through fn

Local `fn` helpers cannot declare their own `effects [...]` clause, but their
body is checked in the containing flow's effect context.

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

If `network.outbound` is omitted from the parent flow, the effect checker must
reject the program even though the network call is inside a local `fn`.

## Canonical Examples

```galerina
// 102-guarded-database-write
guarded flow saveOrder(order: Order) -> SaveOrderResult
contract {
  types {
    type SaveOrderResult = Result<OrderId, OrderError>
  }
  effects {
    database.write
  }
}
{
  let orderId = OrdersDB.insert(order)?
  return Ok(orderId)
}
```

```galerina
// 103-guarded-network-outbound
guarded flow fetchRate(baseCurrency: String) -> FetchRateResult
contract {
  types {
    type FetchRateResult = Result<Decimal, RateError>
  }
  effects {
    network.outbound
  }
}
{
  unsafe let rawResponse = http.get("https://rates.example.com/" + baseCurrency)?
  let rate: Decimal = json.decode(rawResponse)?
  return Ok(rate)
}
```

```galerina
// 104-multiple-effects
guarded flow syncOrder(order: Order) -> SyncOrderResult
contract {
  types {
    type SyncOrderResult = Result<Unit, SyncError>
  }
  effects {
    database.write
    network.outbound
    audit.write
  }
}
{
  let orderId = OrdersDB.insert(order)?
  let _ = http.post("https://sync.example.com/orders", order)?
  AuditLog.write({ action: "syncOrder", orderId: orderId })
  return Ok(unit)
}
```

```galerina
// 108-guarded-flow-calls-effectful-flow
guarded flow buildPriceQuote(orderId: OrderId) -> BuildPriceQuoteResult
contract {
  types {
    type BuildPriceQuoteResult = Result<Money<GBP>, RateError>
  }
  effects {
    network.outbound
  }
}
{
  let rate = fetchRate("GBP")?
  return Ok(Money.gbp("100.00") * rate)
}
```

## Compiler Status

```text
Keyword status: guarded is listed in V1_ACTIVE_KEYWORDS.
Parser status: Phase 4 parser does not yet fully handle guarded flow.
AST status: Phase 7A must add/activate guardedFlowDecl in AstNodeKind and parser output.
Checker status: effect propagation through local fn is specified; implementation pending.
```

