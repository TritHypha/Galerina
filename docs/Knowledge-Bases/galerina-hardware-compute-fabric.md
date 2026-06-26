# Galerina — ComputeFabricGraph and Hardware Governance Classes

**Version: 1.0 — 2026-06-01**
**Status: Canonical architecture — Phase 40+ implementation**

---

## The Missing Abstraction

The current pipeline is:

```
GovernanceGraph → ProofGraph → ExecutionGraph → Hardware
```

This is missing a layer. Hardware has **properties** — it is deterministic or probabilistic,
observable or opaque, branching or matrix-oriented. These properties determine what proof
requirements are necessary before the hardware may receive work.

The complete pipeline is:

```
GovernanceGraph
    ↓
ProofGraph
    ↓
ExecutionGraph
    ↓
ComputeFabricGraph   ← NEW: describes hardware properties, proof escalation
    ↓
Hardware
```

---

## ComputeFabricGraph

**Purpose:** Describe hardware properties. Never describe authority.

The `ComputeFabricGraph` is a read-only view of hardware capabilities and their
corresponding proof requirements. It answers:

```
What properties does this hardware have?
What proof level is required for execution on it?
What observability class does it belong to?
```

The `ComputeFabricGraph` makes decisions about:
- Which hardware targets are available
- What ProofLevel is required for each target
- Whether results need post-execution sanitisation

The `ComputeFabricGraph` does not make decisions about:
- Whether the flow is authorised to execute (GovernanceGraph)
- Whether capabilities are held (CapabilityGraph)
- Whether effects are declared (EffectChecker)

---

## Hardware Properties

Every hardware target in Galerina has a defined set of properties:

| Property | Values | Significance |
|---|---|---|
| `determinism` | `full`, `high`, `partial`, `probabilistic` | Affects proof reproducibility |
| `observability` | `full`, `high`, `partial`, `opaque` | Affects required proof level |
| `executionModel` | `branching`, `parallel`, `matrix`, `streaming`, `event-driven`, `wave-function` | Affects execution plan type |
| `stateModel` | `stateful`, `stateless` | Affects lineage tracking |
| `energyClass` | `standard`, `efficient`, `minimal`, `ultra-low` | Affects CostGraph energy budget |

### Property Profiles by Hardware

| Hardware | Determinism | Observability | Execution Model | State |
|---|---|---|---|---|
| CPU | full | full | branching | stateful |
| GPU | full | full | parallel | stateful |
| NPU | full | partial | matrix | stateless |
| TPU | full | partial | matrix | stateless |
| ANE (Apple) | full | partial | matrix | stateless |
| Photonic | full | partial | non-branching | stateless |
| Neuromorphic | high | partial | event-driven | stateful |
| Quantum | probabilistic | opaque | wave-function | stateless |

---

## Hardware Governance Classes

```typescript
export const enum HardwareGovernanceClass {
  /** GovernancePlane: may issue leases, enforce policy, evaluate authority.
   *  Hardware: CPU, WASM, Trusted Runtime */
  GovernancePlane  = 0,

  /** ExecutionPlane: executes approved work. Deterministic and observable.
   *  Hardware: CPU (secondary), GPU, NPU, TPU */
  ExecutionPlane   = 1,

  /** AcceleratorPlane: accelerates approved work. Partially observable.
   *  Hardware: Photonic, Neuromorphic, Future AI Fabrics */
  AcceleratorPlane = 2,

  /** ExperimentalPlane: probabilistic or opaque. Requires strongest proof.
   *  Hardware: Quantum, Future novel substrates */
  ExperimentalPlane = 3,
}
```

### GovernancePlane (Class 0)

**Hardware:** CPU, WASM, Trusted Runtime

**May:**
- Issue capability leases
- Enforce runtime policy
- Evaluate authority
- Build ProofGraph
- Write to AuditGraph
- Make execution routing decisions

**Proof requirement:** Standard ProofGraph

This is the sovereign anchor. **Regardless of what silicon executes the math, the GovernancePlane
always runs on CPU or WASM.** This is not policy — it is an architectural invariant.

```
INVARIANT: GovernancePlane is always CPU or WASM.
           No accelerator may host the GovernancePlane.
```

### ExecutionPlane (Class 1)

**Hardware:** GPU, NPU, TPU, ARM SME2, AMD CDNA, Intel AMX

**May:**
- Execute pre-approved computation
- Perform matrix operations, inference, transforms
- Return deterministic results

**Must not:**
- Issue leases
- Evaluate authority
- Write directly to AuditGraph (writes are proxied through GovernancePlane)

**Proof requirement:** ProofGraph + ExecutionSignature + Immutable Input Seal

The **Immutable Input Seal** is applied by the GovernancePlane before dispatch:
```
inputSeal  = hash(inputs)  ← recorded in ProofGraph before NPU dispatch
NPU executes...
outputSeal = hash(outputs) ← recorded in AuditGraph after return
```

Even if the NPU is partially observable, we have cryptographic proof of what entered and what emerged.

### AcceleratorPlane (Class 2)

**Hardware:** Photonic, Neuromorphic, Future AI Fabrics

**May:**
- Accelerate approved mathematical operations
- Provide energy-efficient continuous monitoring (neuromorphic)
- Perform optical matrix transforms (photonic)

**Must not:**
- Receive unvalidated inputs
- Produce results without post-execution sanitisation
- Host any governance logic

**Proof requirement:** ProofGraph + AuditGraph + Runtime Attestation + Input Seal + Output Sanitisation

The AcceleratorPlane represents hardware that is:
- Partially observable (cannot inspect all intermediate states)
- Physically different from conventional silicon
- Potentially used for "always-on" governance monitoring (neuromorphic)

### ExperimentalPlane (Class 3)

**Hardware:** Quantum, Future Novel Substrates

**May:**
- Solve optimization problems (route planning, risk modelling)
- Perform probabilistic computation for scenarios with known answer spaces
- Act as a "Mathematical Oracle" — given a question, return a result

**Must not:**
- Issue leases (EVER — quantum results are probabilistic)
- Evaluate authority (EVER — partial observability disqualifies it)
- Directly influence execution decisions without CPU validation

**Proof requirement:** Full proof chain + Post-execution validation + Result sanitisation + Repeated execution consistency check

```
CPU (GovernancePlane) prepares input
    ↓
Quantum coprocessor receives sealed input
    ↓
Quantum coprocessor produces result
    ↓
Result Sanitizer validates result (range check, consistency, hash)
    ↓
CPU validates result is within expected bounds
    ↓
AuditGraph records: { input_seal, output_seal, quantum_result_valid: true }
    ↓
Result enters governance pipeline
```

---

## The Governance Visibility Rule

> **The less observable the hardware, the stronger the proof requirements.**

```
GovernancePlane (full observability)    → Standard ProofGraph
ExecutionPlane  (full observability)    → ProofGraph + Input Seal
AcceleratorPlane (partial observability) → ProofGraph + Input Seal + Attestation
ExperimentalPlane (opaque)             → ProofGraph + Input Seal + Attestation + Validation
```

This is a **structural property** of Galerina, not a configuration option.
The ComputeFabricGraph maps each hardware target to its observability class, and the
ProofGraph builder automatically escalates proof requirements based on the class.

---

## The Accelerator Sovereignty Rule

> **No accelerator may become a source of authority.**

This applies without exception to:
```
GPU     NPU     TPU     ANE     Hexagon  XDNA
AMX     SME     Photonic  Neuromorphic  Quantum
```

These may all:
```
Calculate  Transform  Infer  Validate  Classify
```

They may never:
```
Grant capability  Issue lease  Approve access  Modify policy  Commit state
```

---

## The Immutable Input Seal (My Addition)

Before any work is dispatched to an ExecutionPlane or AcceleratorPlane target, the
Galerina runtime **seals the input**:

```typescript
interface ComputeSeal {
  readonly inputSeal:   string;  // SHA-256 of inputs before dispatch
  readonly outputSeal?: string;  // SHA-256 of outputs after return
  readonly target:      string;  // hardware target ID
  readonly timestamp:   string;  // ISO-8601 dispatch time
  readonly planHash:    string;  // hash of the execution plan
}
```

This means even an opaque accelerator has:
- Proof of **what entered** (inputSeal, in ProofGraph)
- Proof of **what emerged** (outputSeal, in AuditGraph)
- Both cryptographically tied to the specific execution plan

The input seal is built by the CPU (GovernancePlane) and cannot be forged by the accelerator.

---

## APU CPU-Sovereign Pattern

On APU packages (AMD Ryzen AI, Intel Lunar Lake, Apple M-series with unified memory):

```
APU Package:
  CPU cores ─── GovernancePlane (always here, cannot move)
       │
       │ sealed inputs only
       ▼
  GPU cores ─── ExecutionPlane
  NPU cores ─── ExecutionPlane (pre-validated inputs only)
```

**Even on unified memory architectures**, the CPU governance layer must:
1. Validate inputs before placing them in shared memory
2. Apply input seals
3. Validate outputs after NPU/GPU completes
4. Record both seals in AuditGraph

The NPU/GPU cannot read governance structures from shared memory. They receive only:
- Sealed input buffers
- Validated execution plans
- No capability or lease data

---

## Long-Term: The HardwareGraph

Eventually, all hardware targets become interchangeable execution substrates beneath the same governance model:

```
GovernanceGraph
    ↓
ProofGraph
    ↓
LeaseGraph
    ↓
ExecutionGraph
    ↓
ComputeFabricGraph
    ↓
HardwareGraph
      ├── CPU
      ├── GPU
      ├── NPU
      ├── TPU
      ├── FPGA
      ├── Photonic
      ├── Neuromorphic
      └── Quantum
```

Every substrate in the HardwareGraph is an execution target.
None is an authority source.

---

## The Question That Defines Galerina

Most runtimes ask:

> **Where should this execute?**

Galerina asks:

> **Is this allowed to execute?**

Only after that question is answered does it decide whether the work belongs on a CPU, GPU, NPU, TPU, Apple Neural Engine, photonic cluster, or quantum coprocessor.

---

## See Also

- `galerina-master-architecture.md` — The hardware governance rule
- `galerina-hardware-targets.md` — All target IDs
- `galerina-hardware-npu-apu.md` — NPU/APU passive compute fabric
- `galerina-hardware-apple.md` — Apple Silicon (unified memory, Neural Engine)
- `galerina-hardware-future-substrates.md` — Photonic, Neuromorphic, Quantum
