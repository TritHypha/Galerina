# Galerina Application Pattern 06 — State Machines

**When to use:** Regulated entities with strict lifecycle — Patient status, Loan application, Order fulfillment, Insurance claim, Policy lifecycle.

---

## Proposed stateMachine declaration

```galerina
stateMachine Order {
  states {
    Pending
    Paid
    Shipped
    Delivered
    Cancelled
  }

  initial Pending

  transitions {
    Pending  -> Paid       requires payment.processed
    Paid     -> Shipped    requires fulfillment.ready
    Shipped  -> Delivered
    Pending  -> Cancelled  requires actor
    Paid     -> Cancelled  requires manager.approval
  }

  terminal {
    Delivered
    Cancelled
  }

  audit {
    require audit on every transition
  }
}
```

Key elements:

- `initial` declares the starting state. Every new Order entity begins in `Pending`. The compiler will reject any flow that creates an Order entity in any other state — SPORE-STATE-002.
- `terminal` declares states from which no further transition is possible. A flow that attempts to transition out of `Delivered` or `Cancelled` will fail compilation — SPORE-STATE-003.
- `requires payment.processed` binds the transition to a computed condition (not a role). The condition must be declared as a capability or a computable predicate in the type system.
- `requires manager.approval` binds to a role-based capability.
- `requires actor` allows any authenticated actor to perform the transition (but audit still records who).
- Transitions without a `requires` clause are automatic (system-driven, no actor required).

---

## Compiler verification

The compiler constructs a directed transition graph from the `transitions` block and performs the following checks at compile time:

| Rule | Diagnostic |
|------|-----------|
| State referenced in a transition not declared in `states` | SPORE-STATE-001 |
| Flow creates entity in a state other than `initial` | SPORE-STATE-002 |
| Flow attempts transition from a `terminal` state | SPORE-STATE-003 |
| Transition not declared in `transitions` block | SPORE-STATE-004 |
| Duplicate transition (same source and target declared twice) | SPORE-STATE-005 |
| `requires X` where X is not a resolvable capability or predicate | SPORE-CAP-001 |
| Transition flow missing `audit.write` when `require audit on every transition` is declared | SPORE-AUDIT-001 |

No undeclared transition is possible at the type level. If a flow attempts `Order.transition(Shipped -> Pending)` and that transition is not in the `transitions` block, the compiler rejects it before the code ever runs.

---

## Effect requirements per transition

Each transition compiles to an implicit effect profile. Flows implementing transitions must declare these effects:

| Transition | Required effects |
|------------|-----------------|
| Pending -> Paid | `database.write`, `audit.write`, `capability:payment.processed` |
| Paid -> Shipped | `database.write`, `audit.write`, `capability:fulfillment.ready` |
| Shipped -> Delivered | `database.write`, `audit.write` |
| Pending -> Cancelled | `database.write`, `audit.write` |
| Paid -> Cancelled | `database.write`, `audit.write`, `capability:manager.approval` |

```galerina
flow processPayment(id: OrderId) -> Result<Order, ApiError>
  implements stateMachine.Order.transition(Pending -> Paid)
  effects [database.write, audit.write, capability.payment.processed]
{
  let order = database.read({ id })
  stateMachine.transition(order, Paid)
  audit.write({ actor, action: "processPayment", target: id })
  return Ok(order)
}

flow cancelPaidOrder(id: OrderId) -> Result<Order, ApiError>
  implements stateMachine.Order.transition(Paid -> Cancelled)
  effects [database.write, audit.write, capability.manager.approval]
{
  let order   = database.read({ id })
  let approved = capability.check(manager.approval, actor)
  stateMachine.transition(order, Cancelled)
  audit.write({ actor, action: "cancelPaidOrder", target: id })
  return Ok(order)
}
```

---

## Relationship to Workflow pattern (02)

StateMachines and Workflows both govern state transitions. They are distinct patterns for distinct use cases:

| Dimension | StateMachine (Pattern 06) | Workflow (Pattern 02) |
|-----------|--------------------------|----------------------|
| Primary use | Technical entity lifecycle | Business process with human steps |
| Transition guards | Computed conditions (`payment.processed`) | Role and capability (`role.approver`) |
| Terminal states | Explicit, compiler-enforced | Optional |
| Flexibility | Strict — no undeclared transition | More flexible — future: parallel states |
| Events | Via audit trail | First-class `emits` block |
| Time-based transitions | Not supported (Phase 18+) | Supported (`after 90 days`) |
| Best for | Orders, loans, claims, policies | Expense approval, onboarding, compliance |

The rule of thumb: if the entity lifecycle is driven by system conditions (payment confirmed, stock available, document signed), use StateMachine. If the lifecycle is driven by human decisions at each step, use Workflow.

In practice, a real system may compose both. An `InsuranceClaim` may be a StateMachine for its technical lifecycle (Filed → Assessed → Approved → Paid → Closed) and embed a Workflow for the human approval step within `Filed → Assessed`.

---

## SPORE-STATE-001: invalid transition diagnostic (future)

When a flow attempts a transition not declared in the stateMachine block, the compiler will emit:

```
SPORE-STATE-004: Invalid state transition in flow `reopenOrder`
  Order does not declare transition: Delivered -> Pending
  Declared transitions from Delivered: none (terminal state)
  Hint: Add a `reopen` transition to stateMachine.Order if this is intentional,
        or remove this call if the transition is a logic error.
```

This diagnostic replaces a class of runtime bugs — invalid state transitions — with compile-time failures. In regulated industries, an unexpected state transition is not just a bug; it is a compliance event. Catching it before deployment is a hard requirement.

---

## Relationship to governed identity

State is part of entity lifecycle. An entity's current state is not just a data field — it is a governance fact. In the Galerina type system:

- An `Order` in state `Paid` has different read capabilities than an `Order` in state `Pending`
- A `Loan` in state `Closed` may not have its `interestRate` field modified, regardless of the caller's role
- A `Patient` in state `Archived` may only be read by actors with `capability:audit-access`, not by clinical staff

The stateMachine declaration is the compiler's source of truth for these identity-bound rules. When Phase 17 lands, state-conditional capability constraints will be expressible directly in the stateMachine block, making state-dependent access control a compile-time guarantee rather than a runtime check.
