# Galerina — Governed Identity System

**Status:**
- Phase 17+ — Design Proposal
- Foundation: `Brand<T,"Name">` typed IDs (Phase 9A-2, implemented)
- Full governed identity: future
- Key decision: "Governed Identity System" not "New UUID format"

---

## TL;DR

An identity in Galerina carries: type, classification, trust level, lifecycle, and audit metadata — not just a random number.

Typed IDs (`UserId`, `OrderId`, `PatientId`) prevent passing the wrong ID to the wrong function — already implemented via `Brand<String,"Name">`. Future governed IDs carry domain, classification (pii), retention policy, and verifiability.

---

## What's Wrong with UUID Alone

A UUID is "unique" — but it says nothing about:

- **Origin** — who issued this ID and under what authority
- **Ownership** — which entity, tenant, or domain owns it
- **Trust** — is this ID externally supplied or internally minted
- **Classification** — does this ID reference PII, financial data, health data
- **Lifecycle** — when does this ID expire, when should it be purged

A UUID passed to the wrong function compiles. A UUID logged when it shouldn't be has no protection. A UUID handed across a trust boundary carries no verification. Galerina addresses all of this through governed identity.

---

## Option 1 (IMPLEMENTED): Typed IDs via Brand

Typed IDs are already live. A `UserId` and an `OrderId` are distinct types even though both are strings at runtime.

```galerina
type UserId  = Brand<String, "UserId">
type OrderId = Brand<String, "OrderId">

fn getUser(id: UserId) -> User { ... }
fn getOrder(id: OrderId) -> Order { ... }
```

The compiler rejects:

```galerina
getUser(orderId)   -- type error: expected UserId, got OrderId
```

No runtime check. No defensive guard. The type system catches it before the program runs. This is the foundation all further options build on.

---

## Option 2: Governed IDs with Metadata (Future)

A governed ID declaration attaches semantic meaning directly to the identity type.

```galerina
identity UserId {
  domain         "user"
  classification pii
  retention      7y
}
```

The generated ID carries a semantic prefix rather than a plain UUID:

```
usr_01HK5M7XQPZ...
```

The prefix is machine-parseable. Logs, audit trails, and data pipelines can identify the type without a schema lookup. Retention tooling can scan for `usr_` prefixes and apply the 7-year policy automatically.

---

## Option 3: Intent IDs

IDs are embedded in the audit trail alongside the intent declaration that created or consumed them.

```galerina
intent CreateUser {
  produces UserId
  audit    required
}
```

Every `UserId` emitted by `CreateUser` is recorded with the intent context: who called it, what capability authorised it, what boundary it crossed. The identity is traceable from creation to deletion without manual annotation.

---

## Option 4: Capability-Bound IDs

A `protected` ID cannot be exported and cannot leave its trust boundary. The compiler enforces containment.

```galerina
protected UserId
```

Attempting to return a `protected UserId` across a boundary is a compile error. The value can be used internally — passed to authorised functions, stored in governed memory — but it cannot be serialised to an external response or logged to an unclassified sink.

This option is partially implemented. `protected PatientId` already enforces boundary containment in the type system.

---

## Option 5: Deterministic Entity IDs

The same entity produces the same ID across services and deployments.

```galerina
UserId.from(tenantId, email) -> sha256(tenantId + email + domain_salt)
```

Two services independently computing the identity for the same user arrive at the same ID without coordination. Cross-service joins require no lookup table. Deduplication is structural.

---

## Option 6: Trace IDs as First-Class Citizens

Execution identities are generated automatically and form a graph.

```galerina
ExecutionId   -- top-level execution
FlowId        -- named flow within an execution
IntentId      -- individual intent invocation
BoundaryId    -- boundary crossing event
CapabilityUseId -- capability activation
```

An execution is no longer a single request ID passed through headers. It is a structured graph of named identities. Distributed traces, audit logs, and replay systems operate on this graph without instrumentation boilerplate.

---

## Option 7 (BEST): Semantic Identities

Not just unique — meaningful.

```
usr_eu_prod_01HK5M7XQPZ...
```

Each segment is machine-parseable:

```json
{
  "type":        "usr",
  "region":      "eu",
  "environment": "prod",
  "value":       "01HK5M7XQPZ..."
}
```

A `usr_eu_prod_` prefix in a log tells a data engineer, a compliance tool, and a deletion pipeline exactly what they are looking at without a schema registry. Region and environment are embedded so routing, residency enforcement, and environment isolation can operate on the ID itself.

This is the target format for Galerina governed identities.

---

## Option 8: Verifiable IDs

An identity issued by an authority carries a verifiable signature.

```galerina
identity PatientId signed by HealthcareAuthority
```

The runtime can verify at the point of use:

- This `PatientId` was issued by `HealthcareAuthority`
- The issuing key matches the registered authority for this domain
- The ID has not been revoked

External IDs supplied by callers cannot be fabricated. A `PatientId` that did not pass through the signing authority is rejected before it reaches application logic.

---

## The Galerina Way

A Governed Identity System where identity carries:

| Dimension       | Meaning                                          |
|-----------------|--------------------------------------------------|
| Type            | What kind of entity does this ID reference       |
| Intent          | Which intent created or authorised this ID       |
| Classification  | PII, financial, health, internal                 |
| Trust Level     | Internally minted, externally supplied, verified |
| Lifecycle       | Retention period, expiry, deletion policy        |
| Audit Metadata  | Origin intent, boundary crossings, capability use|

The compiler understands all of it. No runtime annotation. No defensive logging. No manual tagging for compliance.

---

## Phase Order

| Option      | Status              |
|-------------|---------------------|
| Option 1    | Implemented (Phase 9A-2) |
| Option 4    | Partially implemented (`protected PatientId`) |
| Option 5    | Future              |
| Option 2    | Future              |
| Option 3    | Future              |
| Options 6-8 | Phase 17+           |

---

## See Also

- `galerina-pii-handling`
- `value-state-annotations`
- `galerina-governed-memory-blocks`
