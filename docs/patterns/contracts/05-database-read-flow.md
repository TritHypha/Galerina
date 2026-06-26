Title: Galerina Contract Pattern — Database Read Flow

### When to use

Use this pattern when a flow reads from a database and must guarantee that an authenticated actor with an explicit read grant is present before any query executes. It is appropriate for any data-access flow where the result set may differ depending on the caller's identity, or where read access is gated by role or capability. Apply it whenever `model.reads` is non-empty and the caller must be identified before the query runs.

### Correct example

```galerina
flow FetchOrdersByCustomer(readonly request: Request) -> FetchOrdersByCustomerResult {

  contract {

    types {
      Order = { orderId: String, total: Money<GBP>, status: String, createdAt: Timestamp }
      FetchOrdersByCustomerResult = { orders: Order[], customerId: String, count: Int }
    }

    intent = "Fetch all orders belonging to a customer, enforcing that the caller holds a read grant for the orders table."

    request {
      requires request.params["customerId"] is String
      requires request.params["customerId"].length > 0
    }

    response {
      guarantees result.orders is Order[]
      guarantees result.count == result.orders.length
      guarantees result.customerId == request.params["customerId"]
    }

    context {
      requires context.actor is AuthenticatedUser
      requires context.actor.grants contains "orders:read"
    }

    model {
      reads ["orders"]
      writes []
    }

    effects {
      audit {
        on: always
        level: partial
        includes: [request.params["customerId"], context.actor.id, result.count]
      }
    }

    security {
      classification: internal
      requires tls: true
    }

    rate_limit {
      per_actor: 100
      window: "1m"
      on_exceed: reject
    }

    on_error {
      emit: AuditEvent(type: "orders.fetch.failed", actor: context.actor, customerId: request.params["customerId"])
      return: { orders: [], customerId: request.params["customerId"], count: 0 }
    }

  }

  let rows = db.orders.where({ customerId: request.params["customerId"] })

  return {
    orders: rows,
    customerId: request.params["customerId"],
    count: rows.length
  }

}
```

### What each contract section does

- `types` — declares both `Order` (including a `Money<GBP>` field) and `FetchOrdersByCustomerResult`; inline type composition makes the return shape explicit
- `intent` — names the access-control purpose so the governance engine can tag this as a read-gated flow
- `request` — requires `customerId` is a non-empty string; two guards prevent empty-string queries reaching the database
- `response` — the invariant `result.count == result.orders.length` is a verifiable postcondition checked by the runtime
- `context` — requires both authentication and the `orders:read` grant; both must pass before the flow body runs
- `model` — declares `orders` as the only read table; writes are empty, preventing accidental write calls
- `effects.audit` — partial audit capturing customer ID, actor, and result count; raw row data is not included
- `security` — internal classification with TLS enforced
- `rate_limit` — caps at 100 requests per actor per minute and rejects excess calls before they hit the database
- `on_error` — returns an empty result set rather than propagating the database error to the caller

### Common mistakes

**Mistake 1 — Reading from an undeclared table**
```galerina
model {
  reads ["customers"]
  writes []
}
// flow body:
let rows = db.orders.where(...)
```
The flow body queries `orders` but `model.reads` only declares `customers`. The static analyser raises a violation because undeclared table access breaks the capability model.

**Mistake 2 — Missing actor grant check when reading sensitive tables**
```galerina
context {
  requires context.actor is AuthenticatedUser
}
```
Authentication alone is not sufficient when the table contains non-public data. The grant `orders:read` must be declared in the `context` block so it is enforced before the body executes.

**Mistake 3 — Skipping the `rate_limit` block for a public-facing read endpoint**
```galerina
contract {
  model { reads ["orders"] }
  // no rate_limit
}
```
Without `rate_limit`, the endpoint is vulnerable to enumeration and denial-of-service. All database read flows exposed via HTTP must declare a `rate_limit` block.

### Expected diagnostics (if incorrect)

| Mistake | Diagnostic |
|---|---|
| `db.orders` queried but `"orders"` not in `model.reads` | `E311 — db read on table 'orders' not declared in model.reads` |
| `context.actor.grants` checked in body but not in context contract | `E306 — grant check 'orders:read' performed in flow body but not declared in context contract` |
| `result.count` not equal to `result.orders.length` invariant missing | `W420 — count field present but no length invariant declared in response` |
| `rate_limit` absent for a read flow with HTTP entry | `W510 — HTTP read flow has no rate_limit block declared` |
| `result.orders` not typed as `Order[]` in `types` | `E104 — return field 'orders' type does not match types declaration` |

### One-click fix

If `E311 — db read on table 'orders' not declared in model.reads` is raised, update the `model` block:

```galerina
model {
  reads ["orders"]
  writes []
}
```
