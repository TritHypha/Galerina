# Galerina — Governance Hierarchy: The Inviolable Stack

**Version: 1.0 — 2026-06-01**
**Status: Foundational principle — never to be reversed**

---

## The Core Rule

```
Security is not negotiable.
Governance is not optional.
Economics is not authority.
Performance is not authority.
```

---

## The Architectural Stack

```
Governance
    ↓
Proof
    ↓
Authority
    ↓
Economics
    ↓
Execution
    ↓
Performance
```

**Never:**
```
Performance
    ↓
Economics
    ↓
Governance
```

If there is ever a conflict: **Security wins. Governance wins. Audit wins. Privacy wins. Every time.**

---

## Layer by Layer

### Layer 1 — Intent

```galerina
intent {
  "Create patient record"
}
```

Intent describes purpose. It guides optimisation, explanation, tooling, and AI understanding.

**Intent never grants authority. This is unchanged and unchangeable.**

### Layer 2 — Governance (Primary Control Layer)

```galerina
contract {
  effects { }
  privacy { }
  network { }
  memory { }
  safety { }
}
```

Governance determines:
- What is allowed
- What is prohibited
- What requires approval
- What requires audit
- What requires redaction

**Everything below this layer must obey it.**

### Layer 3 — Economics (Constraint Layer, Not Authority)

```galerina
contract {
  economics {
    target_cost < £0.001
    max_compute_budget 100ms_cpu
    preferred_execution wasm
  }
}
```

Economics **may:**
- Reject expensive execution
- Choose cheaper hardware
- Limit AI spend
- Route to more efficient compute

Economics **may never:**
- Grant capability
- Remove audit requirement
- Bypass privacy controls
- Bypass governance
- Override runtime policy

Economics can only optimise **inside already-approved governance boundaries**.

### Layer 4 — Execution

The ExecutionGraph, scheduler, and compute target selection.

These are optimisation infrastructure — they operate on already-proven execution paths.
They have no authority to grant or deny governance decisions.

### Layer 5 — Performance

WASM SIMD, NPU kernels, APU shared memory, GPU shaders.

Performance is the output of correct governance, not the input to it.

---

## The Governance Graph as Root

All runtime graphs are projections of the Governance Graph:

```
GovernanceGraph (root)
  ├── CapabilityGraph
  ├── PrivacyGraph
  ├── BoundaryGraph
  ├── TrustGraph
  ├── LineageGraph
  ├── CostGraph
  ├── AuditGraph
  └── ExecutionGraph
```

The ExecutionGraph is a view of the Governance Graph — it cannot exist without it.

---

## The Security Invariants (Never Weakened)

| Invariant | Code | Status |
|---|---|---|
| Effects must be declared | SPORE-EFFECT-001 | Enforced |
| Stdlib capabilities declared | SPORE-STDLIB-001 | Enforced |
| Protected values need gates | SPORE-VALUESTATE-006/007 | Enforced |
| No eval/dynamic code | SPORE-SOURCE-ESCAPE-001 | Enforced |
| No monkey patching | SPORE-SEC-020/021 | Enforced |
| Capability checks before calls | capabilityHost.ts | Enforced |
| Runtime policy is outer envelope | runtime policy config | Enforced |
| Audit required for governed sinks | SPORE-GOV-002 | Enforced |
| Package signatures required | SPORE-PKG-005 | Enforced |
| Network destinations declared | SPORE-NET-001/002 | Enforced |
| Process spawn declared | SPORE-ANTI-ABUSE-001 | Enforced |

**No optimisation, no performance gain, no economic pressure may weaken any of these.**

---

## The Test for Every Future Proposal

> **Can this optimisation ever cause a flow that was previously denied to become allowed?**

- If **yes** → it does not belong in the optimisation layer. It requires a governance decision.
- If **no** → and it only makes an already-authorised path cheaper, faster, or more observable → it fits perfectly within Galerina's philosophy.

Every future architecture proposal, performance optimisation, and economic feature must pass this test before being implemented.

---

## Capability Leasing — The Critical Distinction

```
Authority  ≠  Lease
```

**What is cached:** proof of authority (time-bounded, scoped, revocable)
**What is never cached:** authority itself

A lease is:
- Time-bounded (expires)
- Context-scoped (this request, this flow)
- Revocable (on policy change, secret rotation)
- Audited (appears in runtime report)

Authority is never globally available. Leases simulate fast authority lookup without making authority ambient.

---

## The Emergency Brake Rule

The CostGraph functions like a **read-only budgeting office**:

> Economics can pull the emergency brake on a safe path.
> Economics can never press the gas pedal on an unsafe one.

Precisely: the `ProofGraph` and `GovernanceGraph` are positioned entirely **upstream** of the `CostGraph` and `ExecutionGraph`. It is therefore physically impossible for an economic rule or scheduling shortcut to bypass a data privacy barrier or an audit requirement.

The flow is:
```
[ Inbound Galerina Flow ]
          │
          ▼
   [ ProofGraph ] ──────► Verifies legality (no entry if unsafe)
          │
          ▼  (only legally approved flows pass through)
   [ GovernanceGraph ]
          │
          ▼
   [ CostGraph ] ────────► Evaluates budget constraints
          │                (can block safe-but-expensive flows,
          │                 cannot unblock unsafe ones)
          ▼  (only affordable safe flows pass through)
   [ ExecutionGraph ] ──► Dispatches to silicon targets
```

This makes the system **mathematically incapable of bribing its own security gates**. Economics and performance are optimisation constraints — they are never sovereign authority.

## Economics Cannot Buy Governance

```galerina
// VALID — economics optimises within governance
contract {
  effects { database.write audit.write }
  economics { target_cost < £0.001 preferred_execution wasm }
}

// INVALID — economics cannot remove audit requirement
contract {
  effects { database.write }
  economics { skip_audit_for_cost_saving true }  // ← this will never be allowed
}
```

The runtime may choose the cheapest valid execution path.
It may never choose an invalid path because it's cheaper.

---

## See Also

- `galerina-governance-scope.md` — Governance for High Consequence Systems (not just PII)
- `galerina-execution-graph-kernel-architecture.md` — The 8 architectural suggestions
- `galerina-governance-economics-platform.md` — The commercial vision
- `galerina-hybrid-wasm-native-architecture-v1.md` — WASM governs, native accelerates
- `galerina-explicitness-principles.md` — Nothing important hidden
