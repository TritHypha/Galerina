# Galerina Application Pattern 04 — Domain Events

**When to use:** Distributed systems, audit trails, event-driven architectures — UserCreated, OrderPaid, InvoiceApproved, ClaimRejected.

---

## Global event declaration

Events are declared globally, not inside flows. This separates the contract from the implementation and makes the event schema available to every service in the system.

```galerina
event UserCreated {
  userId:    UserId
  email:     protected Email
  actor:     Actor
  timestamp: Timestamp
}

event OrderPaid {
  orderId:   OrderId
  amount:    Money
  currency:  CurrencyCode
  actor:     Actor
  timestamp: Timestamp
}

event InvoiceApproved {
  invoiceId: InvoiceId
  approvedBy: Actor
  timestamp:  Timestamp
}
```

Event fields follow the same type system as flow parameters. The `protected` marker on `email` means the field is classified as sensitive — consumers of the event must hold the appropriate capability to read it in plaintext. Routers may pass the event without decrypting protected fields.

---

## Governance metadata

Event declarations may carry governance annotations:

```galerina
event UserCreated {
  userId:    UserId
  email:     protected Email
  actor:     Actor
  timestamp: Timestamp

  governance {
    retention 7 years
    classification personal-data
    audit required
    schema-version 1
  }
}
```

| Annotation | Meaning |
|------------|---------|
| `retention N years` | Event records must be retained for N years (compliance) |
| `classification personal-data` | GDPR / data protection classification |
| `audit required` | Emission of this event must itself be audited |
| `schema-version N` | Used by the schema registry for compatibility checks |

Governance metadata is emitted into the GIR and is available to the service manifest generator. It does not affect runtime behaviour in Phase 17 — it is a compiler output for downstream tooling.

---

## Emitting events in flows

Events are emitted using the `emit` keyword inside a flow body. The emit must follow the causal write — you cannot emit an event before the state change that motivated it.

```galerina
flow createUser(input: UserInput) -> Result<User, ApiError>
  effects [database.write, audit.write, validation.run, event.emit]
{
  let validated = validation.run(input)
  let user      = database.write(validated)
  audit.write({ actor, action: "createUser", target: user.id })
  emit UserCreated {
    userId:    user.id
    email:     user.email
    actor:     actor
    timestamp: now()
  }
  return Ok(user)
}
```

The compiler enforces:
- `event.emit` must be declared in the flow's `effects` block — SPORE-EVENT-001 if missing
- The event name must match a globally declared event — SPORE-EVENT-002 if not found
- All required fields of the event must be provided in the emit expression — SPORE-EVENT-003
- `emit` must not appear before the `database.write` that justifies it — SPORE-EVENT-004 (ordering constraint, Phase 17+)

---

## Contract.events block

Service contracts declare which events they emit. This is the authoritative source for inter-service communication contracts:

```galerina
contract UserService {
  version "1.0.0"

  flows {
    createUser
    getUser
    updateUser
    deleteUser
  }

  events {
    emits UserCreated
    emits UserUpdated
    emits UserDeleted
  }

  capabilities {
    requires database.read
    requires database.write
    requires audit.write
    requires event.emit
  }
}
```

A service that emits an event not listed in its `contract.events` block will fail validation — SPORE-CONTRACT-003. A service that lists an event in `contract.events` but never emits it in any flow will produce a warning — SPORE-CONTRACT-004.

---

## What the compiler enforces

| Rule | Diagnostic |
|------|-----------|
| `emit X` where X is not globally declared | SPORE-EVENT-001 |
| `emit X` without `event.emit` in flow effects | SPORE-EVENT-002 |
| `emit X { ... }` missing required field | SPORE-EVENT-003 |
| `emit` before causal `database.write` (Phase 17+) | SPORE-EVENT-004 |
| Service emits event not listed in contract | SPORE-CONTRACT-003 |
| Contract lists event never emitted in any flow | SPORE-CONTRACT-004 (warning) |

---

## Relationship to audit trail

Every emitted event is a point-in-time fact about what happened in the system. When combined with `audit.write`, events provide two complementary audit layers:

- `audit.write` — internal audit log, controlled by the service, immutable per policy
- `emit EventX` — external event, distributed to subscribers, may be routed to an audit event bus

The combination means you can reconstruct what happened (from the event stream) and prove who authorised it (from the audit log). This dual-layer is required for regulated industries (finance, healthcare, legal).

---

## Event routing (Phase 9B+ — event bus integration, future)

In Phase 17, events are declared and emitted. Routing to an event bus (Kafka, NATS, SNS) is a Phase 9B+ feature. When it arrives, the `event` declaration will gain a `route` block:

```galerina
// Future syntax — not yet valid
event UserCreated {
  userId: UserId
  email:  protected Email
  actor:  Actor

  route {
    bus "kafka"
    topic "user-events"
    partition-key userId
  }
}
```

Until Phase 9B+, events are recorded in the GIR and audit log but not physically routed to an external bus. The emit call is valid and compiler-checked; the physical dispatch is a no-op pending the runtime integration.
