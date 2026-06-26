# Galerina — Master Architecture Direction

**Version: 2.0 — 2026-06-01**
**Status: Canonical — supersedes all prior architecture documents**

---

## The Four-Way Separation

```
Governance decides.
Proof verifies.
Economics optimises.
Hardware executes.
```

These four roles are **never mixed**. Governance and proof are upstream. Economics and hardware are downstream. No downstream component may reach upstream and change a decision.

---

## One-line definition

> Galerina is a **Governance-First Execution Platform for High-Consequence Systems**, where authority, safety, cost, AI, infrastructure and execution are governed through provable runtime contracts.

This is broader and more accurate than "governance-first programming language." Galerina governs execution, not merely syntax.

---

## The Core Rule

```
Galerina is not a compliance language.
Galerina is not an economics language.
Galerina is not an AI language.
Galerina is a Governance-First Execution Platform.
Everything else is built on top of governance.
```

**The inviolable stack:**

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

**If there is a conflict:**

```
Security wins.
Governance wins.
Audit wins.
Privacy wins.
Safety wins.

Performance and economics lose. Always.
```

---

## What Galerina Governs

Galerina is not primarily about PII. PII is one example.

Galerina governs anything with **consequence**:

```
Authority        Effects          Capabilities
Privacy          Infrastructure   AI
Data             Safety           Mission Integrity
Economic Cost    Execution
```

The common characteristic is **consequence**, not personal data.

---

## High-Consequence Systems

Galerina is designed for systems where failure matters:

```
Healthcare          Finance           Government
Defence             Aerospace         Space
Energy              Transportation    Critical Infrastructure
Industrial Control  AI Systems        Scientific Systems
National Security
```

The governance model is identical across all domains.
The consequence profile changes.

---

## The Complete Execution Pipeline

```
GovernanceGraph         ← what is allowed, by whom, under what conditions
    ↓
ProofGraph              ← prove legality before execution
    ↓
ImmutableInputSeal      ← hash(inputs) recorded before any accelerator receives work
    ↓
ComputeFabricGraph      ← hardware properties, observability class, proof level
    ↓
HardwareGovernanceClass ← GovernancePlane / ExecutionPlane / AcceleratorPlane / ExperimentalPlane
    ↓
ExecutionGraph          ← dispatch to silicon target
    ↓
OutputSeal              ← hash(outputs) recorded after accelerator returns
    ↓
AuditGraph              ← immutable record of what entered, what emerged, what was proven
```

**The Immutable Input Seal rule:** No accelerator receives unsealed authority-bearing state.
Before any ExecutionPlane, AcceleratorPlane, or ExperimentalPlane target receives work:
```
inputSeal = hash(inputs)   → recorded in ProofGraph before dispatch
... hardware executes ...
outputSeal = hash(outputs) → recorded in AuditGraph after return
```
Even an opaque quantum coprocessor has cryptographic proof of what entered and what emerged.

**Proof Escalation Rule (Governance Visibility Rule):**
```
FullyObservable     (CPU, GPU)        → Standard     proof (ProofGraph)
PartiallyObservable (NPU, TPU, ANE)   → Sealed       proof (+ Input/Output Seals)
Opaque              (Photonic, Neuro) → Escalated    proof (+ Runtime Attestation)
Probabilistic       (Quantum)         → FormalRequired proof (+ Post-execution Validation)
```

---

## The Governance Graph as Root

All runtime behaviour derives from the `GovernanceGraph`:

```
GovernanceGraph (root)
├── ProofGraph          — legality proof before execution
├── ExecutionGraph      — dispatch to hardware targets
├── CapabilityGraph     — authority resolution
├── AuditGraph          — immutable audit trail
├── LineageGraph        — data origin and movement
├── CostGraph           — cost measurement and attribution
├── ValueGraph          — risk-adjusted value
└── TrustGraph          — authority chain
```

All graphs are projections of the GovernanceGraph.
None may exist without it.

---

## ProofGraph

**Purpose:** Prove legality before execution. Execution never performs proof — it consumes proof.

ProofGraph validates:
- Effects
- Capabilities
- Privacy
- Memory
- Targets
- Safety
- AI policies
- Economics constraints

---

## Capability Leasing

Authority is never cached. Only **proof of authority** is cached.

```
Authority ≠ Lease
```

Leases are:
- Revocable
- Time-bounded
- Context-scoped
- Policy-scoped
- Flow-scoped

---

## Economics Layer

Economics is **additive governance**. It operates BELOW governance in the stack.

```galerina
contract {
  economics {
    target_cost < £0.001
    max_compute_budget 100ms_cpu
    preferred_execution wasm
  }
}
```

**Economics may:**
- Reduce cost
- Select hardware
- Optimise execution
- Control AI spending

**Economics may never:**
- Grant permissions
- Remove audit
- Remove proof
- Bypass policy
- Bypass privacy

---

## CostGraph

Purpose: Measure, predict, and attribute cost.

Contains:
- ComputeCost
- StorageCost
- NetworkCost
- GovernanceCost
- AuditCost
- AIUsageCost

**CostGraph never determines legality. Only economics.**

---

## ValueGraph

Purpose: What does this cost? What is this worth?

Contains:
- BusinessValue
- RiskValue
- RegulatoryValue
- CustomerValue
- MissionValue
- SafetyValue

This enables risk-adjusted optimisation.

---

## Data Lineage

Data lineage is **structural** — declared in source, enforced by compiler.

```galerina
lineage {
  source crm.customer
  owner CustomerTeam
  retention 7_years
}
```

Compiler generates: Origin, Ownership, Movement, Retention, Access History — automatically.

Zero runtime CPU overhead (compile-time lineage = 0% runtime cost vs 15% for traditional runtime lineage tools).

---

## AI Governance

AI is a governed capability — not an exception to governance.

```galerina
contract {
  ai {
    max_token_cost £0.01
    max_model_calls 3
    approved_models { gpt5 claude }
  }
}
```

AI governance controls:
- Models
- Spend
- Authority
- Data exposure
- Execution risk

Not merely cost.

---

## Cross-Flow Cost Attribution

Every request receives a governance identifier:

```
Request → Flow → Capability Usage → Resource Usage → Audit Usage → Cost Attribution
```

Enables per-customer, per-feature, per-service, per-AI-workflow cost without reconstructing logs.

---

## Hardware Governance Rule

**This rule applies to all hardware: Intel, AMD, ARM, Google, WASM, Photonic, NPU.**

```
Hardware acceleration may:
  Reduce cost
  Reduce latency
  Increase throughput
  Reduce energy consumption
  Improve isolation

Hardware acceleration may never:
  Grant authority
  Bypass ProofGraph
  Bypass CapabilityGraph
  Bypass audit
  Bypass privacy
  Bypass policy
```

Hardware is an **execution target**.
Never an authority source.

---

## Hardware Target Hierarchy

```
WASM (universal baseline — portable, governed, safe)
    ↓
Native (platform-specific acceleration)
    ├── Intel (x86 — AVX2 i5, AVX-512 i9, P/E-core scheduler)
    ├── AMD (x86 — Zen4/5 AVX-512, RDNA GPU, CDNA AI)
    ├── ARM (Neon, SVE2, SME2 — MTE, PAC, Realm Isolation)
    └── Google (Axion ARM, Titanium offload, TPU AI)
    ↓
NPU / Photonic / Tri (specialised accelerators — future targets)
```

WASM is always the **safe fallback**. Native is the **optimisation layer**.
Governance determines execution. Silicon executes.

---

## Security Invariants (Never Weakened)

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
| safety_critical requires audit.write | SPORE-VAL-001 | Enforced |
| safety_critical requires deterministic | SPORE-VAL-002 | Enforced |

---

## Long-Term Vision

Galerina evolves into a **Governance Operating System** capable of governing:

```
Code        Data        AI          Infrastructure
Compute     Cost        Risk        Mission Integrity
Safety      Authority
```

through one unified model.

The platform ultimately answers:

```
What happened?
Why did it happen?
Who authorised it?
What did it cost?
What risk did it carry?
Was it worth it?
Can it be proven?
```

using `GovernanceGraph`, `ProofGraph`, `AuditGraph`, `LineageGraph`, `CostGraph` and `ValueGraph` as different views of the same governed system.

---

## See Also

- `galerina-governance-hierarchy.md` — The inviolable governance stack
- `galerina-governance-scope.md` — High-consequence systems (aerospace, defence, etc.)
- `galerina-hardware-targets.md` — Full hardware target reference
- `galerina-hardware-amd.md` — AMD CPU/GPU/NPU support
- `galerina-hardware-arm.md` — ARM SVE2/SME2/MTE/PAC/Realm support
- `galerina-hardware-google.md` — Google Axion/Titanium/TPU support
- `galerina-core-economics-package.md` — CostGraph package design
- `galerina-governance-economics-platform.md` — Commercial economics vision
- `galerina-roadmap-phase26-50.md` — Implementation roadmap
