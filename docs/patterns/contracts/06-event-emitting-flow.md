Title: Galerina Contract Pattern — Event-Emitting Flow

### When to use

Use this pattern when a flow must emit one or more named events as part of its execution and those events need to be declared in both the contract and the global event registry. It is required whenever downstream flows or consumers subscribe to events produced here, making the event schema a public contract. Apply it whenever `contract.events` is used and the event type must be declared globally with `event` at the module level.

### Correct example

```galerina
event OrderPlaced {
  orderId: String
  customerId: String
  total: Money<GBP>
  placedAt: Timestamp
}

event OrderRejected {
  orderId: String
  customerId: String
  reason: String
  rejectedAt: Timestamp
}

flow PlaceOrder(readonly request: Request) -> PlaceOrderResult {

  contract {

    types {
      PlaceOrderResult = { orderId: String, status: String, placedAt: Timestamp }
    }

    intent = "Accept an order submission, validate and persist it, then emit an OrderPlaced or OrderRejected event."

    request {
      requires request.body is JsonObject
      requires request.body["customerId"] is String
      requires request.body["items"] is Array
      requires request.body["items"].length > 0
    }

    response {
      guarantees result.orderId is String
      guarantees result.status in ["placed", "rejected"]
    }

    context {
      requires context.actor is AuthenticatedUser
      requires context.actor.grants contains "orders:write"
    }

    model {
      reads ["customers", "inventory"]
      writes ["orders"]
    }

    events {
      emits: [OrderPlaced, OrderRejected]
      on_success: OrderPlaced
      on_failure: OrderRejected
    }

    effects {
      audit {
        on: always
        level: full
        includes: [result.orderId, result.status, context.actor.id, request.body["customerId"]]
      }
    }

    security {
      classification: internal
      requires tls: true
    }

    on_error {
      emit: OrderRejected(
        orderId: "",
        customerId: request.body["customerId"],
        reason: error.message,
        rejectedAt: now()
      )
      return: { orderId: "", status: "rejected", placedAt: now() }
    }

  }

  let customer = db.customers.find_by_id(request.body["customerId"])

  if customer is null {
    emit OrderRejected(
      orderId: "",
      customerId: request.body["customerId"],
      reason: "customer not found",
      rejectedAt: now()
    )
    return { orderId: "", status: "rejected", placedAt: now() }
  }

  let order = db.orders.insert({
    customerId: customer.id,
    items: request.body["items"],
    total: calculate_total(request.body["items"]),
    placedAt: now()
  })

  emit OrderPlaced(
    orderId: order.id,
    customerId: customer.id,
    total: order.total,
    placedAt: order.placedAt
  )

  return { orderId: order.id, status: "placed", placedAt: order.placedAt }

}
```

### What each contract section does

- Global `event` declarations — `OrderPlaced` and `OrderRejected` are declared at module scope, making their schemas available to all subscribing flows in the module
- `types` — declares `PlaceOrderResult`; the event types are already declared globally and not repeated here
- `intent` — names both the persistence goal and the event-emission obligation
- `request` — guards: body is JSON, `customerId` is a String, `items` is a non-empty Array
- `response` — `status` is constrained to exactly two known values corresponding to the two events
- `context` — requires authenticated user with `orders:write` grant
- `model` — reads `customers` and `inventory` for validation; writes to `orders`
- `events` — declares which events this flow can emit, and which fires on success vs failure; the runtime validates that only listed events are emitted in the body
- `effects.audit` — full audit including order ID, status, actor, and customer ID
- `security` — internal classification with TLS
- `on_error` — emits `OrderRejected` even in the unhandled error path to keep event consumers consistent

### Common mistakes

**Mistake 1 — Emitting an event not listed in `contract.events.emits`**
```galerina
events {
  emits: [OrderPlaced]
}
// flow body:
emit OrderRejected(...)
```
The runtime validates that every `emit` call in the body corresponds to an event in `emits`. Emitting an unlisted event raises a contract violation at runtime and a warning at compile time.

**Mistake 2 — Declaring event types inside `contract.types` instead of at module scope**
```galerina
contract {
  types {
    OrderPlaced = { orderId: String, total: Money<GBP> }
  }
}
```
Events declared inside `contract.types` are local to the flow and cannot be consumed by other flows. Events intended for inter-flow communication must be declared at module scope using the `event` keyword.

**Mistake 3 — Omitting `on_success` and `on_failure` in the `events` block**
```galerina
events {
  emits: [OrderPlaced, OrderRejected]
}
```
Without `on_success` and `on_failure`, the runtime cannot automatically emit the correct event when the flow exits via the `on_error` handler. Both fields should be declared so that the error path is covered without repeating emit logic.

### Expected diagnostics (if incorrect)

| Mistake | Diagnostic |
|---|---|
| `emit OrderRejected` called but not in `events.emits` | `E810 — event 'OrderRejected' emitted in body but not declared in contract.events.emits` |
| Event type declared in `contract.types` instead of module scope | `W820 — event type 'OrderPlaced' declared in contract.types; use top-level 'event' declaration for inter-flow events` |
| `on_success` event not in `events.emits` | `E811 — events.on_success 'OrderPlaced' must be listed in events.emits` |
| `emit` called with field missing from global event declaration | `E815 — field 'placedAt' not declared in global event 'OrderPlaced'` |
| Module-level event used but not imported in consuming flow | `E816 — event 'OrderPlaced' used in subscriber but not imported from producing module` |

### One-click fix

If `E810 — event 'OrderRejected' emitted in body but not declared in contract.events.emits` is raised, add the missing event to the `events` block:

```galerina
events {
  emits: [OrderPlaced, OrderRejected]
  on_success: OrderPlaced
  on_failure: OrderRejected
}
```
