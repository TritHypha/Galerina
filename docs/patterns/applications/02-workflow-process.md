# Galerina Application Pattern 02 — Workflow / Process State

**When to use:** Enterprise processes that are NOT CRUD — Draft→Submitted→Approved/Rejected, onboarding, compliance workflows, expense claims, document approvals.

---

## Why workflows are distinct from CRUD

A CRUD resource answers the question: what is the current state of an entity?
A workflow answers the question: how does an entity move through states, who authorises each transition, and what happens when it does?

Workflows have:
- Named states with semantic meaning (Draft is not just a string)
- Guarded transitions (role, capability, or time-based)
- Events emitted on each transition (for audit trails and downstream systems)
- Mandatory audit on state changes (you must know who approved what, and when)

CRUD operations do not enforce any of these. A `database.write` that changes a `status` field from `"submitted"` to `"approved"` is not a governed transition — it is an unguarded mutation. Galerina workflows make the guard explicit and compiler-verified.

---

## Proposed workflow declaration

```galerina
workflow ExpenseClaim {
  states {
    Draft
    Submitted
    Approved
    Rejected
    Archived
  }

  transitions {
    Draft      -> Submitted  requires actor
    Submitted  -> Approved   requires role.approver
    Submitted  -> Rejected   requires role.approver
    Approved   -> Archived   after 90 days
  }

  events {
    emits ClaimSubmitted  on Draft -> Submitted
    emits ClaimApproved   on Submitted -> Approved
    emits ClaimRejected   on Submitted -> Rejected
  }

  audit {
    require audit on every transition
  }
}
```

Each `requires` clause binds to the capability system. `role.approver` means the calling actor must hold the `approver` capability at the time of the transition. `actor` means any authenticated actor may perform the transition (but audit still records who).

The `after 90 days` clause declares a time-based automatic transition. The runtime scheduler, not a user action, triggers this. The compiler emits a scheduled task node in the GIR.

---

## How the compiler verifies transitions

The compiler builds a transition graph from the `transitions` block and verifies:

1. Every state referenced in a transition exists in the `states` block — SPORE-WORKFLOW-001 if not
2. No transition is declared more than once with the same source and target — SPORE-WORKFLOW-002
3. Every `requires role.X` clause is resolvable to a declared capability — SPORE-CAP-001
4. No flow implementing a workflow transition may skip `audit.write` when `require audit on every transition` is declared — SPORE-AUDIT-001
5. Time-based transitions (`after N days`) cannot declare `requires actor` — they are system-initiated — SPORE-WORKFLOW-003

Invalid state jumps are caught at compile time. A flow that attempts to set `Approved -> Draft` on an `ExpenseClaim` will fail unless that transition is declared.

---

## Effect requirements per transition

Each transition compiles to an implicit effect profile:

| Transition | Minimum required effects |
|------------|--------------------------|
| Draft -> Submitted | `database.write`, `audit.write`, `event.emit` |
| Submitted -> Approved | `database.write`, `audit.write`, `event.emit`, `capability:role.approver` |
| Submitted -> Rejected | `database.write`, `audit.write`, `event.emit`, `capability:role.approver` |
| Approved -> Archived | `database.write`, `audit.write` (system-initiated, no actor required) |

The flow implementing the transition must declare at least these effects. Undeclared effects that are used at runtime produce SPORE-EFFECT-002.

```galerina
flow submitClaim(id: ClaimId) -> Result<ExpenseClaim, ApiError>
  implements workflow.ExpenseClaim.transition(Draft -> Submitted)
  effects [database.write, audit.write, event.emit]
{
  let claim = database.read({ id })
  workflow.transition(claim, Submitted)
  emit ClaimSubmitted { claimId: id, actor }
  audit.write({ actor, action: "submit", target: id })
  return Ok(claim)
}
```

---

## Relationship to stateMachine pattern (06)

Both workflow and stateMachine govern state transitions. The distinction is rigidity:

| Dimension | Workflow (Pattern 02) | StateMachine (Pattern 06) |
|-----------|----------------------|--------------------------|
| Focus | Business process with human actors | Technical lifecycle with system rules |
| Guards | Role, capability, time | Computed conditions, payment.processed |
| Flexibility | Transitions can be flexible (future: parallel states) | Strict: no undeclared transition allowed |
| Terminal states | Optional | Explicit terminal set required |
| Events | First-class (emits block) | Secondary (via audit) |

When in doubt: if the process involves human approval steps, use Workflow. If the process is driven by system conditions (payment confirmed, fulfillment ready), use StateMachine.

---

## Phase 17+ status

The `workflow` declaration block is a **Phase 17+** feature. Dependencies:

- Effect checker (Phase 11 — available)
- Capability system (Phase 9 — available)
- Event emission (Phase 9B — partially available)
- Workflow parser and transition graph builder (Phase 17 — planned)
- Time-based transition scheduler (Phase 18 — future)

Current workaround: implement workflows as explicit flows with manual state checks and audit calls. Document the valid transitions in a comment block at the top of the flow file. The compiler will enforce effects; transition validity is manual until Phase 17.
