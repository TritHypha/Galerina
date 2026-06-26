# Galerina — @state() Lifecycle System

## Status

```
PHASE 6+ — Layer C Runtime Orchestration
NOT implemented in v1
Design intent preserved for future implementation
```

This document defines the proposed `@state()` lifecycle annotation system for
Galerina. It is **intentionally beyond v1** — beyond core parsing, type
checking, and governance verification. It belongs to high-level runtime
orchestration (Layer C).

---

## 1. What Problem It Solves

Galerina v1 models: flows, effects, capabilities, resources, runtime targets,
governance, and audit proof. Applications also need **long-lived evolving
state** — UI state, session state, streaming state, AI inference context,
GPU resource state, workflow state, distributed coordination state.

Today most languages handle this with ad-hoc mutable objects, causing:

- hidden mutation
- unclear lifecycle ownership
- resource leaks
- unsafe async updates
- difficult audit trails
- unclear cleanup semantics

The `@state()` system turns state into a **governed runtime entity** rather
than arbitrary mutable memory.

---

## 2. Core Idea

```text
State becomes a governed runtime entity
rather than arbitrary mutable memory.
```

---

## 3. Syntax

### Basic state

```galerina
@state()
let currentUser: Option<User> = None
```

### Named scope

```galerina
@state(session)
let currentUser: Option<User> = None
```

### Persisted state

```galerina
@state(persisted)
let preferences: UserPreferences = defaultPreferences()
```

### GPU resource state

```galerina
@state(gpu)
let renderBuffer: GpuBuffer<Vertex>
```

### AI context state

```galerina
@state(context)
let conversationMemory: ConversationContext
```

### Distributed state

```galerina
@state(distributed)
let clusterRoutingTable: RoutingTable
```

---

## 4. State Categories

| Category | Lifetime | Purpose |
|---|---|---|
| `local` | Flow lifetime | Short-lived within a single flow |
| `session` | User/session lifetime | Authentication, user context |
| `persisted` | Durable | Survives process restart; checkpointed |
| `gpu` | GPU resource lifetime | GPU buffers, tensors, render targets |
| `context` | AI conversation lifetime | LLM context, conversation memory |
| `distributed` | Cluster coordination | Routing tables, consensus state |
| `cache` | Runtime cache lifetime | Bounded LRU, evictable |
| `stream` | Stream lifetime | Streaming handles, backpressure |
| `ephemeral` | Very short | Temporary workspace, cleared on scope exit |

---

## 5. Lifecycle Phases

Every `@state()` value goes through:

```
Created
    ↓
Initialized
    ↓
Active
    ↓
Suspended (optional)
    ↓
Serialized (optional — for persisted/distributed)
    ↓
Restored (after serialization)
    ↓
Destroyed
```

---

## 6. Lifecycle Hooks (future syntax)

```galerina
@onCreate(currentUser)
@onDestroy(currentUser)
@onSuspend(currentUser)
@onRestore(currentUser)
```

Example cleanup hook:

```galerina
@onDestroy(renderBuffer)
flow cleanupBuffer() {
  Gpu.free(renderBuffer)
}
```

---

## 7. Mutation Tracking

Every mutation is recorded by the runtime:

```yaml
stateTransition:
  state:      currentUser
  previous:   None
  next:       User
  sourceFlow: login
```

---

## 8. Governance Integration

State mutation can require capabilities:

```galerina
@state(session)
requires [session.write]
let paymentContext: PaymentSession
```

The compiler/runtime verifies caller authority before allowing mutation.

---

## 9. State Effects

State access becomes effects:

| Effect | Meaning |
|---|---|
| `state.read` | Read a managed state value |
| `state.write` | Mutate a managed state value |
| `state.persist` | Checkpoint state to storage |
| `state.destroy` | Explicitly destroy state |

```galerina
secure flow impersonateAdmin()
effects [state.write, audit.write] {
  currentUser = Some(adminUser)
  AuditLog.write({ event: "AdminImpersonation" })
}
```

Pure flows cannot mutate state (`SPORE-STATE-001`).

---

## 10. Reactivity (future)

Derived state can be declared:

```galerina
@state()
let subtotal: Decimal = 0

@state()
let tax: Decimal = subtotal * 0.20

@state()
let total: Decimal = subtotal + tax
```

When `subtotal` changes, `tax` and `total` recompute. The runtime builds a
**state dependency graph**:

```text
subtotal → tax → total
```

Reactivity must remain explicit, traceable, and auditable — no hidden
dependency explosions or magical observers.

---

## 11. Mutation Policies

```galerina
@state(readonly)         // cannot be mutated after initialisation
@state(transactional)    // rollback on failure; audit evidence
@state(immutable)        // never mutates after first write
@state(append_only)      // only additive mutations allowed
```

Append-only state is ideal for audit event logs:

```galerina
@state(append_only)
let auditEvents: List<AuditEvent>
```

The runtime rejects destructive mutations.

---

## 12. Secret + State Interaction

```galerina
@state(session)
let apiKey: SecureString secret protected
```

The runtime enforces: no raw serialisation, no unsafe logging, protected cleanup.

---

## 13. Compute Target State

```galerina
@state(gpu)
let embeddings: GpuTensor<Float16>
```

The runtime coordinates:
- GPU placement and allocation
- Cleanup when lifecycle ends
- Memory pressure and eviction

---

## 14. AI Context Compression (future)

```galerina
@state(context)
let longConversation: ConversationMemory
```

The runtime may: summarise, compress, vectorise, or archive the context while
preserving auditability and provenance.

---

## 15. Diagnostics (SPORE-STATE-* series)

| Code | Name | Description |
|---|---|---|
| `SPORE-STATE-001` | `IllegalStateMutation` | Pure flow cannot mutate runtime state |
| `SPORE-STATE-002` | `MissingStateCapability` | Mutation of session state requires `session.write` |
| `SPORE-STATE-003` | `IllegalStateSerialization` | Protected secret state cannot be serialised |
| `SPORE-STATE-004` | `ReactiveCycleDetected` | Reactive state dependency cycle detected (a → b → a) |
| `SPORE-STATE-005` | `InvalidStateTarget` | Type X cannot exist in state category Y |
| `SPORE-STATE-006` | `StateLifecycleViolation` | State accessed after destruction |

---

## 16. State Audit Proof Format

```yaml
stateAudit:
  mutations:
    - state:     currentUser
      previous:  None
      next:      User
      sourceFlow: login

  recomputations:
    - subtotal
    - tax
    - total

  lifecycle:
    - created
    - active
    - destroyed
```

---

## 17. Layer Model

```
Layer A — Core language
  flows, effects, types, governance

Layer B — Runtime execution
  compute targets, scheduling, async, runtime planning

Layer C — Managed orchestration state  ← @state() lives here
  reactivity, lifecycle state, distributed coordination,
  AI context, persistent orchestration
```

Layer C is not implemented in v1. The v1 compiler should:
- Recognise `@state(...)` as a valid decorator syntactically
- Store the `@state` annotation on the binding's AST node
- Emit a warning (not error) that lifecycle enforcement is post-v1
- Do not attempt reactive recomputation or distributed sync

---

## 18. Why Layer C Matters

Most modern runtime complexity lives in Layer C:

```text
React state / Redux
Vue reactivity
GPU resource graphs
AI conversation memory
Workflow engines
Distributed coordination
Stream processing
```

Galerina should formalise this instead of leaving it ad-hoc. The `@state()`
system is the mechanism for that formalisation.

---

## 19. Recommended v1 Minimal Scope

If a minimal subset is needed in v1:

```galerina
@state(session)
let currentUser: Option<User>
```

With:
- Runtime registration of the state binding
- Mutation tracking (audit evidence)
- Cleanup hooks on session end

Without: automatic reactivity, distributed sync, runtime recomputation graph.

---

## See Also

- `docs/Knowledge-Bases/governed-compute-chain.md` — `@state(gpu)` interacts with compute targets
- `docs/Knowledge-Bases/ihsa-storage-policy.md` — `@state(persisted)` vs disk storage
- `docs/Knowledge-Bases/value-state-annotations.md` — value-state annotations are orthogonal to `@state()`
- `docs/Knowledge-Bases/formal-type-system-spec.md` — type system foundation
