# Galerina — Governed Execution Plan

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

This document covers the second stage: **governed execution plan**.

---

## What Is a Governed Execution Plan?

A governed execution plan is the compiler/runtime-generated operational contract that defines how execution is *permitted* to occur:

```text
what capabilities are granted
what effects are allowed
which resources may be accessed
which runtime targets are permitted
what behaviors are explicitly denied
what safety constraints must hold
what proof obligations exist
```

It is the bridge between declared intent and actual runtime execution.

---

## Simple Definition

| Stage | Answers |
|---|---|
| Intent | *Why does this system exist?* |
| Governed Execution Plan | *How is the system allowed to execute?* |
| Coordinated Compute | *How does execution actually occur?* |
| Audit Proof | *What can be proven about execution?* |

---

## Core Philosophy

Traditional compilation works like this:

```text
source code  →  compiler  →  binary/runtime
```

Galerina instead targets:

```text
intent  →  governed execution plan  →  verified runtime execution
```

The execution plan is not optimization metadata or scheduler hints. It is a **machine-readable operational contract** — a formal statement of what the runtime is permitted to do, derived from the source, enforced at execution time.

---

## From Source to Governed Execution Plan

### Galerina source

```galerina
intent CreateOrder {
  purpose "Create a customer order after payment"
}

secure flow createOrder(input: CreateOrderRequest)
  -> Result<OrderResponse, OrderError>
effects [
  database.write,
  payment.charge,
  audit.write
]
capabilities [
  orders.create,
  payments.charge
]
intent "Create a customer order after payment" {
  let validated = validateOrder(input)?
  let payment   = chargePayment(validated.payment)?
  let order     = OrdersDB.insert(validated)?

  AuditLog.write({ event: "OrderCreated", orderId: order.id })

  return Ok(OrderResponse(order))
}
```

### Generated governed execution plan

```yaml
executionPlan:
  flow: createOrder

  intent:
    purpose: "Create customer order after payment"

  execution:
    mode: request_scoped
    isolation: enabled

  effects:
    - database.write
    - payment.charge
    - audit.write

  capabilities:
    - orders.create
    - payments.charge

  resources:
    database:
      - OrdersDB
    network:
      allow:
        - api.stripe.com
    secrets:
      - STRIPE_SECRET_KEY

  denied:
    - filesystem.write
    - process.spawn
    - network.unlisted

  runtime:
    secretRedaction: true
    memoryArena: request_scoped
    runtimeTarget: native

  verification:
    requireAuditTrail: true
    requireCapabilityChecks: true
```

---

## Negative Guarantees

One of the most powerful aspects of the governed execution plan is that it models *what the system cannot do*, not just what it can.

```yaml
denied:
  - filesystem.write
  - process.spawn
  - outbound.unlisted
```

This is critical for security, compliance, sandboxing, and AI trust. The runtime enforces this at execution time:

```galerina
// Source attempts:
process.spawn("bash")
```

```text
SPORE-RUNTIME-001: Execution violates governed execution plan.
  denied: process.spawn
```

---

## Coordinated Compute Inputs

The execution plan also describes hardware targets and fallback policy:

```yaml
compute:
  target: npu

  fallback:
    - gpu
    - cpu

  quantization:
    required: true
    format: Int8

  verification:
    compareWithCpuReference: true
```

This becomes the input to the coordinated compute layer — telling the runtime scheduler which targets are legal, which fallbacks are permitted, and what verification must pass.

---

## Unsafe Boundary Declaration

Unsafe native execution must appear explicitly in the plan:

```galerina
unsafe native flow tensorRtInference(...)
```

```yaml
unsafe:
  native:
    enabled: true
    providers:
      - TensorRT
    requiresReview: true
    isolation:
      sandboxed: true
```

Unsafe execution is not hidden — it becomes an auditable, governed entry in the plan.

---

## Proof Obligations

The execution plan defines what the audit proof must later demonstrate:

```yaml
audit:
  required:
    - paymentCaptured
    - auditEventWritten
    - capabilityVerified
```

The audit proof layer uses these obligations as its checklist. If execution cannot prove them, verification fails.

---

## CI Governance Diffing

CI tooling should diff governed execution plans between commits to surface semantic changes that a source diff alone would not reveal:

```text
Execution Plan Diff (v1.4 → v1.5):

Added:
  network.external

Added:
  unsafe.native.TensorRT

Review Required:
  Security approval
```

This is governance visibility at the CI boundary — every expansion of authority or addition of unsafe execution requires explicit review.

---

## Runtime Enforcement

The runtime enforces the plan at execution time:

| Plan entry | Enforcement |
|---|---|
| `effects: [database.write]` | Any database write outside this list is rejected |
| `capabilities: [payment.charge]` | Capability checks gate payment operations |
| `denied: [process.spawn]` | Any attempt to spawn a process is rejected |
| `secrets: [STRIPE_SECRET_KEY]` | Redaction is applied; secret cannot enter logs |
| `isolation: request_scoped` | Memory is scoped to the request; not shared |

---

## Runtime Responsibilities

The runtime consumes the governed execution plan to:

- enforce capability checks at every sensitive operation
- reject any denied effect before it executes
- enforce the declared runtime target (CPU, GPU, NPU, etc.)
- allocate and isolate request-scoped memory
- apply secret redaction automatically
- emit structured audit evidence
- track unsafe boundaries

---

## Relationship to Intent

Intent declares *what the system is for* — the semantic purpose. The governed execution plan translates that into *operational permission* — what the runtime is allowed to do on the system's behalf.

A mismatch between the two is caught at compile time (`SPORE-INTENT-001`).

---

## Relationship to Coordinated Compute

The governed execution plan is consumed by the coordinated compute layer, which schedules and orchestrates actual execution — selecting the legal runtime target, managing fallbacks, coordinating memory, and generating runtime evidence.

---

## Relationship to Audit Proof

The governed execution plan defines what must later be proven. The audit proof layer verifies that every capability used was declared, every denied boundary was respected, every safety constraint held, and every proof obligation was met.

---

## Full Architecture Reminder

```text
Intent
  semantic purpose

↓

Governed Execution Plan
  operational governance contract

↓

Coordinated Compute
  runtime scheduling and execution

↓

Audit Proof
  evidence that governed execution occurred
```

---

## Final Mental Model

The governed execution plan is the *operational constitution* of the application. It defines allowed behavior, forbidden behavior, authority boundaries, runtime constraints, execution guarantees and proof obligations — before execution begins.

---

## Related Documents

| Document | Notes |
|---|---|
| [Intent](galerina-concept-intent.md) | First pipeline stage — semantic purpose declaration |
| [Coordinated Compute](galerina-concept-coordinated-compute.md) | Third stage — runtime execution against the plan |
| [Audit Proof](galerina-concept-audit-proof.md) | Fourth stage — verifiable execution evidence |
| [compiler-diagnostics.md](compiler-diagnostics.md) | Full `SPORE-*` diagnostic code table |
