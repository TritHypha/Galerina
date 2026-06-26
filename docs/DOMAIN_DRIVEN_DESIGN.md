# Domain-Driven Structure

## Purpose

Galerina can support Domain-Driven Design style structure, but it should not force
heavy DDD patterns.

Recommended position:

```text
Use DDD for business meaning.
Use Galerina policies for security.
Use Galerina memory rules for safe data handling.
Use Galerina compute rules for speed.
Use Galerina reports so humans and AI can understand the system.
Avoid abstractions that do not add meaning, safety or future value.
```

Galerina is not automatically DDD. Galerina is a security-first, typed, AI-readable
backend language concept that can support DDD-style architecture for business
applications.

DDD is optional. It is useful when it improves meaning, safety, testing,
reviewability and AI readability. It is harmful when it adds layers that hide
effects, permissions, memory costs or performance behavior.

## Thin DDD

Galerina should prefer:

```text
Thin DDD
Domain-first structure
Policy-enforced architecture
```

Galerina should avoid:

```text
Heavy DDD
Layer-first architecture
Boilerplate-driven design
```

Good abstractions should answer at least one question:

```text
What business decision is being made?
What security boundary is being protected?
What unsafe behavior is being blocked?
What future change is likely?
```

If an abstraction does none of those, it may be waste.

## Progressive Structure

Galerina should support progressive architecture.

| App size | Recommended structure |
| --- | --- |
| Small script | One or two `.ln` files |
| Small API | `api/`, `flows/`, `infrastructure/` |
| Business app | Add `domain/` |
| Complex regulated app | Add stronger boundaries and policies |
| High-security app | Add enforced security, memory, crash and architecture reports |
| Compute-heavy app | Add `compute/` and target reports |

Small apps should not be forced into DDD. Larger business systems can add domain
structure when the extra files clarify business meaning and boundaries.

## Recommended App Shape

```text
my-galerina-app/
|-- boot.ln
|-- main.ln
|-- api/
|   |-- orders-api.ln
|   `-- payment-webhook.ln
|-- flows/
|   |-- create-order.ln
|   `-- refund-order.ln
|-- domain/
|   |-- orders.ln
|   |-- payments.ln
|   `-- customers.ln
|-- infrastructure/
|   |-- order-store.ln
|   |-- payment-provider.ln
|   `-- email-provider.ln
|-- compute/
|   `-- fraud-score.ln
|-- policies/
|   |-- security-policy.ln
|   |-- memory-policy.ln
|   |-- crash-policy.ln
|   `-- ai-cache-policy.ln
`-- reports/
    |-- security-report.json
    |-- memory-report.json
    |-- compute-report.json
    `-- ai-context-report.json
```

| Area | Purpose |
| --- | --- |
| `api/` | HTTP routes, webhooks, request/response translation |
| `flows/` | Application use cases and workflows |
| `domain/` | Business rules and business language |
| `infrastructure/` | Database, files, external APIs and providers |
| `compute/` | Performance-heavy CPU/GPU/vector/AI/photonic work |
| `policies/` | Security, memory, crash, cache and runtime rules |
| `reports/` | Compiler/runtime reports for humans and AI |

## Route-First Compatibility

Thin DDD does not replace Galerina's route-first API policy.

The API route still defines the public contract:

```galerina
api OrdersApi {
  POST "/orders" {
    request CreateOrderRequest
    response OrderResponse

    errors [
      InvalidOrder,
      OrderCannotBePaid,
      PaymentFailed,
      DatabaseUnavailable
    ]

    timeout 5s
    max_body_size 128kb

    handler CreateOrder.handle
  }
}
```

Business meaning moves into domain rules and flows. Controllers remain optional
framework sugar, not core Galerina architecture.

## Domain Example

```galerina
type OrderId = String
type CustomerId = String

enum OrderStatus {
  Draft
  PendingPayment
  Paid
  Cancelled
  Refunded
}

type Order = {
  id: OrderId
  customerId: CustomerId
  status: OrderStatus
  total: Money
  paymentId: String?
}

enum OrderError {
  InvalidOrder
  OrderCannotBePaid
  PaymentFailed
  DatabaseUnavailable
}
```

Domain rules:

```galerina
domain Orders {
  rule canBePaid(order: Order) -> Bool {
    match order.status {
      case Draft {
        return true
      }

      case PendingPayment {
        return true
      }

      otherwise {
        return false
      }
    }
  }

  rule markPaid(order: Order, paymentId: String) -> Order {
    return {
      ...order,
      status: OrderStatus.Paid,
      paymentId: paymentId
    }
  }
}
```

The domain says what an order is, when an order can be paid and how an order
becomes paid. The API route does not decide those rules.

## Flow Example

```galerina
secure flow CreateOrder.handle(input: CreateOrderRequest) -> Result<OrderResponse, OrderError>
  effects [
    payment.authorise,
    database.write,
    log.safe
  ]
{
  let draftOrder = Orders.createDraft(input)
    Err(error) => return Err(error)

  match Orders.canBePaid(draftOrder) {
    case true {
      continue
    }

    case false {
      return Err(OrderCannotBePaid)
    }
  }

  let payment = PaymentProvider.authorise({
    customerId: draftOrder.customerId,
    amount: draftOrder.total
  })
    Err(error) => return Err(PaymentFailed)

  let paidOrder = Orders.markPaid(draftOrder, payment.id)

  let savedOrder = OrderStore.save(paidOrder)
    Err(error) => return Err(DatabaseUnavailable)

  Log.safe("Order created", {
    orderId: savedOrder.id
  })

  return Ok(OrderResponse.from(savedOrder))
}
```

The flow reads as a use case:

```text
Create draft order.
Check if it can be paid.
Authorise payment.
Mark order as paid.
Save order.
Return response.
```

## Infrastructure Example

Infrastructure owns external systems:

```text
database
HTTP APIs
files
queues
secrets
storage
email providers
payment providers
```

Example:

```galerina
provider PaymentProvider {
  allow outbound "https://payments.example.com"

  secret PAYMENT_API_KEY {
    source env "PAYMENT_API_KEY"
  }

  function authorise(request: PaymentAuthoriseRequest) -> Result<PaymentResult, PaymentError>
    effects [
      network.outbound,
      secret.read
    ]
  {
    with secret PAYMENT_API_KEY as key {
      let response = Http.post("https://payments.example.com/authorise", {
        headers: {
          Authorization: Secret.bearer(key)
        },
        body: request
      })
        Err(error) => return Err(PaymentUnavailable)

      return Ok(PaymentResult.from(response))
    }
  }
}
```

Infrastructure code must still use explicit effects, safe logging and secret
guards. DDD structure does not weaken security rules.

## Architecture Policy

Galerina can enforce thin-domain boundaries with architecture policy:

```galerina
architecture_policy ThinDomain {
  domain {
    pure by_default

    deny effects [
      database.read,
      database.write,
      network.outbound,
      secret.read,
      file.write,
      llm.call,
      cache.write
    ]
  }

  api {
    allow request_decode
    allow response_encode
    deny business_rules
  }

  flows {
    allow domain
    allow infrastructure
    require explicit_effects true
  }

  infrastructure {
    allow database
    allow network
    allow secrets
    require safe_logging true
  }

  reports {
    write_architecture_report true
    warn empty_wrappers true
    warn database_shaped_domain true
    warn excessive_layers true
  }
}
```

This is where Galerina is stronger than normal DDD. It can enforce and report
boundaries instead of relying only on naming conventions.

## Security Position

DDD is not a security model.

DDD can help organize security boundaries:

```text
domain          = business rules
flows           = use cases
infrastructure  = database, APIs, files
api             = requests and responses
```

But Galerina security must come from:

```text
explicit effects
permissions
secret tracking
safe logging
typed inputs
typed errors
crash boundaries
source maps
security reports
compiler/runtime enforcement
```

Domain code should be pure by default and should not secretly read secrets,
write files, call databases, call networks or send data to LLMs.

## Memory Position

DDD is not a memory model.

Memory safety should come from Galerina features:

```text
read-only references
explicit clone()
copy-on-write
streaming large data
no silent large copies
memory-pressure reports
safe lifetimes
owned values
borrowed values
```

Example:

```galerina
flow processLargeImport(data: ReadOnly<JsonDocument>) -> Result<ImportResult, ImportError> {
  // Can read the data.
  // Cannot silently copy or mutate the full document.
}
```

DDD may organize the code. It must not hide allocation, cloning, ownership or
streaming behavior.

## Compute Position

DDD is not a compute-performance model.

Heavy DDD can harm performance by adding:

```text
too many allocations
too many conversions
too many layers
too many repository calls
too much abstraction
too much indirection
```

Compute-heavy work should use compute policies and target reports:

```galerina
compute target best verify cpu_reference {
  prefer gpu
  fallback cpu_vector
  fallback cpu_scalar

  result = FraudModel.score(batch)
}
```

Do not hide compute-heavy paths behind unnecessary factories or service chains.

## What Thin DDD Prevents

Without domain boundaries, a handler may accidentally bypass business rules:

```galerina
let order = {
  ...order,
  status: "Refunded"
}

Database.orders.save(order)
```

Preferred:

```galerina
let decision = Orders.canRefund(order, refundAmount)

match decision {
  case Decision.Allow {
    let refundedOrder = Orders.markRefunded(order, refundAmount)
    OrderStore.save(refundedOrder)
  }

  case Decision.Deny {
    return Err(RefundNotAllowed)
  }

  case Decision.Review {
    return Err(RefundRequiresReview)
  }
}
```

The refund rule is visible, named and protected.

## What Galerina Should Avoid

Avoid database-shaped domain folders:

```text
domain/
|-- tbl_orders.ln
|-- tbl_order_items.ln
|-- tbl_customers.ln
`-- tbl_payments.ln
```

Prefer business names:

```text
domain/
|-- orders.ln
|-- payments.ln
|-- customers.ln
`-- refunds.ln
```

Avoid empty wrappers:

```galerina
OrderService.callOrderRepositoryToSaveOrder(order)
```

Prefer meaningful operations:

```galerina
Orders.canRefund(order, amount)
OrderStore.save(order)
```

Avoid heavy service chains:

```galerina
OrderRefundEligibilityDomainServiceFactory
  .create()
  .getService()
  .calculateRefundEligibilityDecisionForOrderRefundRequest(...)
```

Prefer direct business language:

```galerina
Orders.canRefund(order, amount)
```

## Architecture Report

Galerina may generate architecture reports:

```json
{
  "architecture": {
    "domainStyle": "thin-domain",
    "warnings": [
      {
        "code": "GALERINA-ARCH-002",
        "message": "OrderService only forwards calls to Orders.create. Consider removing this wrapper."
      },
      {
        "code": "GALERINA-ARCH-006",
        "message": "Domain folder appears to mirror database table names. Consider business-domain names instead."
      }
    ]
  }
}
```

Useful warnings:

```text
excessive_layers
empty_wrappers
database_shaped_domain
unused_abstractions
domain_effect_violation
business_rules_in_api
infrastructure_in_domain
```

## Final Rule

```text
Business meaning belongs in the domain.
Application steps belong in flows.
External systems belong in infrastructure.
Security, memory, crash handling and compute belong in Galerina policies.
```
