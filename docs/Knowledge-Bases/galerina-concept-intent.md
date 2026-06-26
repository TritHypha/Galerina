# Galerina — Intent

## The Governance Pipeline

Galerina's architecture is built around a four-stage semantic pipeline:

```text
intent
    ↓
governed execution plan
    ↓
coordinated compute
    ↓
audit proof
```

This document covers the first stage: **intent**.

---

## What Is Intent?

Intent is the explicit declaration of what a flow or system is *for* — its purpose, the authority it requires, the effects it is allowed to produce, the boundaries it must respect, and the outcomes it is designed to deliver.

Intent is not documentation. It is:

- **structured** — machine-readable syntax, not free-form comments
- **compiler-visible** — the checker can compare declared intent against actual behavior
- **enforceable** — violations emit diagnostics (`SPORE-INTENT-001`)
- **reportable** — builds, audits and AI tools consume intent directly

Most languages describe *how* computation happens. Galerina also describes *why it exists*, *what authority it needs*, *what boundaries it crosses*, and *what it must never do*.

---

## Simple Definition

> **Intent = semantic purpose + declared operational meaning**

```galerina
intent CreateOrder {
  purpose "Create a customer order after validated payment"

  requires [
    payment.charge,
    database.write,
    audit.write
  ]

  produces [
    OrderCreated
  ]

  denies [
    filesystem.write,
    process.spawn,
    network.unlisted
  ]
}
```

This declares:
- the operational goal
- the authority required
- the allowed behaviors
- the explicitly denied behaviors
- the expected outputs

---

## Intent vs Types

Types answer: *what shape is the data?*

Intent answers: *what is this operation supposed to accomplish?*

```galerina
// Type information only:
flow chargeCard(amount: Money) -> PaymentResult
// → takes Money, returns PaymentResult

// With intent:
intent ChargeCustomer {
  purpose "Charge a customer's payment method"
  requires  [payment.charge, network.external]
  effects   [audit.write, payment.capture]
  external  [api.stripe.com]
}
```

The intent declaration is much richer — it exposes authority, side-effects, external dependencies, and governance boundaries that types alone cannot express.

---

## Intent vs Comments

| | Comments | Intent |
|---|---|---|
| Format | Unstructured text | Structured syntax |
| Compiler-visible | No | Yes |
| Enforceable | No | Yes (`SPORE-INTENT-001`) |
| Machine-readable | No | Yes |
| Reportable | No | Yes |

---

## Intent vs Effects

Effects describe *what operations occur*:

```galerina
effects [database.write, network.external]
```

Intent describes *why those operations exist*:

```galerina
intent CreateOrder {
  purpose "Create a customer order after validated payment"
}
```

Both are present in Galerina. They are distinct layers. Effects are the mechanism; intent is the meaning.

---

## Galerina Semantic Layers

You can think of Galerina as having five layers from concrete to abstract:

```text
Syntax Layer      — what code looks like
Type Layer        — what data shapes exist
Effect Layer      — what operations happen
Capability Layer  — what authority is required
Intent Layer      — why the system exists / what it intends to do
```

The intent layer enables governance, AI comprehension, compliance generation, security analysis, and audit reasoning that the lower layers cannot support alone.

---

## A Full Example

```galerina
// Intent declares the purpose and governance boundary.
// Tools can validate implementation against it.
intent CreateOrder {
  purpose "Create a customer order after payment is authorised"

  requires [
    database.write,
    payment.charge,
    audit.write
  ]

  denies [
    filesystem.write,
    process.spawn,
    network.unlisted
  ]

  produces [
    OrderCreated
  ]
}

// API node — linked into the intent graph.
// Edge: POST /orders -> handled_by -> createOrder
api OrdersApi {
  POST "/orders" {
    request  CreateOrderRequest
    response CreateOrderResponse
    handler  createOrder
  }
}

// Flow node.
// Edges:
//   createOrder -> requires_capability -> orders.create
//   createOrder -> produces_effect    -> database.write
//   createOrder -> produces_effect    -> payment.charge
//   createOrder -> produces_effect    -> audit.write
secure flow createOrder(input: CreateOrderRequest)
  -> Result<CreateOrderResponse, CreateOrderError>
effects [
  database.write,
  payment.charge,
  audit.write
]
capabilities [
  orders.create,
  payments.charge
]
intent "Create a customer order after payment is authorised" {

  // Edge: createOrder -> calls -> validateOrder
  let validOrder = validateOrder(input)?

  // Edge: createOrder -> calls -> chargePayment
  // Edge: chargePayment -> uses_resource -> StripeAPI
  let payment = chargePayment(validOrder.payment)?

  // Edge: createOrder -> writes_resource -> OrdersDatabase
  let order = OrdersDatabase.insert({
    customerId: validOrder.customerId,
    paymentId:  payment.id,
    items:      validOrder.items
  })?

  // Edge: createOrder -> writes_resource -> AuditLog
  AuditLog.write({
    event:   "OrderCreated",
    orderId: order.id
  })

  return Ok(CreateOrderResponse {
    orderId: order.id,
    status:  "created"
  })
}

// Pure flow — no external effects.
pure flow validateOrder(input: CreateOrderRequest)
  -> Result<ValidatedOrder, ValidationError> {
  if input.items.isEmpty() {
    return Err(ValidationError.EmptyOrder)
  }
  return Ok(ValidatedOrder(input))
}

// Effectful payment flow.
// Edges:
//   chargePayment -> requires_capability -> payments.charge
//   chargePayment -> reads_secret        -> STRIPE_SECRET_KEY
//   chargePayment -> calls_external      -> api.stripe.com
flow chargePayment(payment: PaymentDetails)
  -> Result<PaymentReceipt, PaymentError>
effects [
  secret.read,
  network.external,
  payment.charge
]
capabilities [
  payments.charge
] {
  let stripeKey = vault.secret("STRIPE_SECRET_KEY")

  return Stripe.charge(
    key:      stripeKey,
    amount:   payment.amount,
    currency: payment.currency
  )
}
```

---

## The Intent Graph

Each `intent` declaration, `api` node, and `flow` node becomes a vertex in the intent graph. The compiler connects them:

```text
CreateOrder:
  purpose:     create customer order after payment
  calls:       validateOrder, chargePayment
  requires:    database.write, payment.charge, audit.write
  uses:        OrdersDatabase, StripeAPI, AuditLog
  reads secret: STRIPE_SECRET_KEY
  denied:      filesystem.write, process.spawn, unlisted network
```

This graph is what makes the compiler understand the *system's purpose, authority, resources and boundaries* — not just its syntax.

### What the intent graph models

```text
what the system intends to do      purpose graph
what authority it requires         authority graph
what resources it touches          resource graph
what effects it produces           effect graph
how flows relate semantically      call/dependency graph
```

### Example graph query

```bash
galerina explain processRefund
```

```text
Intent:
  Process customer refunds

Effects:
  database.write
  network.external

Capabilities:
  payment.refund

Resources:
  StripeAPI
  OrdersDB

Secrets:
  STRIPE_SECRET_KEY
```

---

## Intent Verification

The compiler compares declared intent against inferred behavior:

```galerina
intent ReadOnlyAnalytics {
  denies [database.write]
}
```

If the implementation performs `database.insert(...)`, the checker emits:

```text
SPORE-INTENT-001: Flow violates declared intent.
  declared:  denies [database.write]
  actual:    database.write detected in analyticsFlow
```

---

## Intent and Security

Intent makes systems explicitly bounded. If an inference flow declares:

```galerina
intent LocalInference {
  denies [network.external]
}
```

Then cloud inference fallback, telemetry calls or unexpected API access all become detectable governance violations — not silent runtime surprises.

---

## Intent and AI Comprehension

Without intent, AI tools infer meaning from code patterns — a slow and error-prone process.

With intent, AI tools receive declared semantic purpose directly:

```galerina
intent FraudDetection {
  purpose "Score transaction fraud probability"

  sensitive_data [payment_info, customer_identity]

  requires [ai.inference, database.read]
}
```

An AI immediately understands: this is fraud analysis, sensitive data is involved, AI inference occurs, specific authority is required — without reverse-engineering the implementation.

This is one of the core design advantages of Galerina: instead of handing AI tools 500,000 lines of code, you provide a compact semantic graph.

---

## Intent and Build Reports

The build tool can emit a human-readable intent summary:

```text
Intent Summary for this application:

This application intends to:
  - process customer orders
  - charge payments
  - write audit logs

This application does NOT intend to:
  - spawn subprocesses
  - access arbitrary filesystem paths
  - contact unapproved domains
```

Readable by humans, AI systems, and compliance reviewers.

---

## Intent and Runtime Governance

Intent is not only a compile-time concept. At runtime:

```galerina
intent SensitiveProcessing {
  requires [secure_memory]
  deny_logging true
}
```

The runtime may:
- disable debug logs for this scope
- allocate protected memory arenas
- enforce secret redaction
- emit structured audit evidence

---

## Governance Diffing

Between commits, the compiler can diff the intent graph to show *semantic* changes, not just source changes:

```text
Intent graph diff (v1.4 → v1.5):

Added:
  network.external

Removed:
  filesystem.read

Expanded:
  payment.refund authority
```

This is governance visibility at the source level.

---

## Diagnostic Codes

| Code | Name | Trigger |
|---|---|---|
| `SPORE-INTENT-001` | `INTENT_BEHAVIOR_MISMATCH` | Flow behavior contradicts declared intent |
| `SPORE-INTENT-002` | `INTENT_EFFECT_UNDECLARED` | Effect used without being declared in intent |
| `SPORE-INTENT-003` | `INTENT_DENIED_EFFECT_USED` | Denied effect detected in implementation |
| `SPORE-INTENT-004` | `INTENT_MISSING` | Secure or guarded flow has no intent declaration |
| `SPORE-INTENT-005` | `INTENT_PURPOSE_EMPTY` | Intent block has no purpose string |

---

## Related Documents

| Document | Notes |
|---|---|
| [Governed Execution Plan](galerina-concept-governed-execution-plan.md) | Next pipeline stage — turns intent into an operational contract |
| [Coordinated Compute](galerina-concept-coordinated-compute.md) | Third stage — runtime execution against the plan |
| [Audit Proof](galerina-concept-audit-proof.md) | Fourth stage — verifiable evidence that governed execution occurred |
| [compiler-diagnostics.md](compiler-diagnostics.md) | Full `SPORE-INTENT-*` code table |
| [galerina-v1-memory-model.md](galerina-v1-memory-model.md) | Phase 3 memory model |
