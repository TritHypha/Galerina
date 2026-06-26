# Galerina — NPU and APU: Passive Compute Fabrics

**Version: 1.0 — 2026-06-01**
**Status: Canonical architecture**

---

## Position Statement

```
Galerina treats NPUs and APUs as governed accelerator fabrics.

NPUs and APUs may accelerate approved workloads, reduce energy consumption,
reduce inference cost, reduce audit processing cost, and reduce governance overhead.

NPUs and APUs may never:
  Grant authority
  Perform capability checks
  Modify runtime policy
  Issue leases
  Bypass audit
  Bypass privacy
  Bypass ProofGraph

They execute. They do not govern.
```

---

## What Is a Passive Compute Fabric?

NPUs and APUs are **Passive Compute Fabrics** — they receive mathematically proven
workloads from the CPU governance plane and execute them.

"Passive" means:
- They do not initiate execution (they receive it)
- They do not make authority decisions (they execute already-approved work)
- They do not observe or modify governance state (that lives on CPU/WASM)
- They are passive until activated by the GovernancePlane

This is not a limitation — it is a **design property**. Passive compute fabrics are:
- More predictable
- More provable
- More auditable
- Easier to reason about

The governance plane remains **active and sovereign**. The compute fabric remains **passive and fast**.

---

## NPU Architecture

### What an NPU Does

An NPU (Neural Processing Unit) is optimised for:
- Matrix multiply-accumulate operations (MMA)
- Convolution
- Activation functions
- Tensor transformations

NPUs are ideal for **deterministic, fixed-topology execution** — they receive an immutable
execution plan and run it to completion. This aligns perfectly with Galerina's ProofGraph model:
the ProofGraph IS the immutable execution plan.

### NPU Governance Profiles

#### Validation Profile (`npu.validation`)

```galerina
hardware {
  target npu.validation
  require static_execution_plan
}
```

Use cases:
- PII detection in streams
- Policy validation at ingress
- Pattern matching against governance rules
- Compliance scanning of data batches

Why NPU for validation? The same tensor operations used for inference work equally well
for validation. A validation model (is this PII? does this violate policy?) runs on the NPU
with the same throughput as a classifier — but the governance rules are pre-compiled
into the NPU execution plan.

#### Audit Profile (`npu.audit`)

```galerina
hardware {
  target npu.audit
  require static_execution_plan
}
```

Use cases:
- Log classification at high throughput
- Audit anomaly detection
- Governance pattern scoring
- Lineage violation detection

High-volume audit streams can be classified by NPU at low energy cost, then
significant events are escalated to the CPU governance plane for action.

#### AI Profile (`npu.ai`)

```galerina
hardware {
  target npu.ai
  require static_execution_plan
  require audit_interlock
}
```

Use cases:
- AI inference under `ai.infer` effect
- Embeddings generation
- Classification
- Risk scoring

`require audit_interlock` means every NPU result is intercepted by the CPU governance
plane before it enters the application. Results cannot bypass the CPU — they flow
through AuditGraph before use.

### NPU Hardware Examples

| Vendor | NPU | Used With |
|---|---|---|
| AMD | XDNA (Ryzen AI) | `target npu`, `target amd.zen5` |
| Intel | NPU (Core Ultra) | `target npu`, `target intel.avx512` |
| Apple | Neural Engine (ANE) | `target apple.neural_engine` |
| Google | TPU (Cloud) | `target google.tpu.inference` |
| Qualcomm | Hexagon | `target qualcomm.hexagon` |

All share the same Galerina governance model. The target ID changes. The invariant does not.

### The `require static_execution_plan` Rule

NPUs should only receive **immutable, pre-validated execution plans**:

```galerina
hardware {
  target npu
  require static_execution_plan
}
```

This requirement reflects NPU architecture: NPUs are most efficient when the execution
graph is fixed at dispatch time. Dynamic re-routing during execution is expensive
(or impossible on some NPU architectures).

It also reflects governance requirements: an immutable execution plan is easier to prove,
easier to audit, and impossible to tamper with mid-execution.

---

## APU Architecture

### What an APU Is

An APU (Accelerated Processing Unit) integrates:
```
CPU + GPU + NPU
```
on one silicon die, sharing a memory bus (or unified memory).

Examples:
```
AMD Ryzen AI (XDNA NPU + Zen4/5 CPU + RDNA GPU)
AMD Strix Halo (high-end APU variant)
Intel Meteor Lake / Lunar Lake (NPU + P-cores + Arc GPU)
Intel Panther Lake (next-gen)
Apple M-Series (CPU + Neural Engine + GPU + Secure Enclave)
Future Qualcomm platforms
```

### The CPU-Sovereign Pattern on APU

On APU systems, the governance model enforces:

```
APU Package:
  CPU cores ─── GovernancePlane (always here, cannot be delegated)
       │
       │  (sealed input buffers only)
       ↓
  GPU cores ─── ExecutionPlane (receives sealed work)
  NPU cores ─── ExecutionPlane (receives sealed work)
```

Even on unified memory architectures where CPU/GPU/NPU share the same physical memory,
the governance layer enforces:

1. CPU validates and seals inputs before placing in shared memory
2. GPU/NPU can read only the sealed input regions (not governance structures)
3. After NPU/GPU completes, CPU validates outputs and records output seals
4. Governance data (ProofGraph, CapabilityGraph) is in CPU-private memory regions

### APU Dispatch Model

```galerina
hardware {
  target apu
  allow cpu
  allow gpu
  allow npu
  require governed_partitioning
  require deterministic_fallback
}
```

**Execution example:**

```
ProofGraph construction
    → CPU (always on CPU — GovernancePlane)

Validation matrix operations
    → NPU (sealed inputs from CPU, output returned to CPU for validation)

Bulk PII redaction
    → GPU (large data, parallel, deterministic)

Audit commit
    → CPU (always on CPU — GovernancePlane)
```

The CPU is the **conductor** of the APU. It never cedes governance control to the GPU or NPU.

### APU Memory Partitioning

On unified memory APUs:

```
GovernanceRegion (CPU-private):
  ProofGraph
  CapabilityGraph
  AuditGraph
  LeaseCache
  RuntimePolicy

ExecutionRegion (CPU-visible + NPU-visible):
  SealedInputBuffer  ← CPU writes here, NPU reads
  OutputBuffer       ← NPU writes here, CPU reads and validates

ScratchRegion (NPU-private):
  NPU working memory
  No CPU access during execution
  Cleared on completion (deterministic wipe)
```

This partitioning ensures NPU cannot access governance structures even via unified memory.

---

## Aerospace NPU Example

```galerina
secure flow validateTelemetryStream(readonly stream: TelemetryStream)
-> Result<ValidatedFrame, TelemetryError>

contract {
  value {
    classification safety_critical
    domain aerospace
  }

  hardware {
    target npu.validation
    require static_execution_plan
    require audit_interlock
    require deterministic_execution
    fallback cpu
  }

  safety {
    require deterministic_execution
    require bounded_runtime
  }

  audit {
    require proof_graph
  }
}
{
  let validated = NPU.validate(stream)?

  AuditLog.write({
    event: "TelemetryValidated",
    target: "npu.validation",
    inputHash: hash(stream),
    resultHash: hash(validated)
  })

  return Ok(validated)
}
```

The NPU performs pattern-matching validation at high throughput. Even if the NPU processes
millions of telemetry frames per second, the CPU governance plane retains authority over
what is considered "valid" and records every frame's input/output seal.

---

## The Always-On Governance Pattern

**Neuromorphic note (see also `galerina-hardware-future-substrates.md`):**

For continuous governance monitoring (audit stream analysis, lineage violation detection,
anomaly scoring), NPUs also work well — but neuromorphic chips are even better for
"always-on" governance because they consume near-zero power while idle and wake
on events.

A neuromorphic co-processor running a governance monitoring model could:
- Monitor audit streams continuously at < 1mW
- Alert the CPU governance plane when anomalies occur
- Classify lineage violations in real-time
- Score risk across ongoing operations

This gives Galerina **always-on governance** without significant energy overhead.

---

## NPU / APU Security Invariant

```
NPU and APU hardware may:
  Accelerate pre-approved computation
  Reduce inference energy cost
  Improve validation throughput
  Classify audit streams at high throughput
  Execute immutable inference plans
  Reduce CPU governance overhead (via offload)

NPU and APU hardware may never:
  Grant authority
  Perform capability checks
  Issue leases
  Modify runtime policy
  Write directly to AuditGraph (proxied through CPU)
  Receive governance state (ProofGraph, CapabilityGraph)
  Execute without an immutable, CPU-approved execution plan
```

---

## See Also

- `galerina-hardware-compute-fabric.md` — HardwareGovernanceClass, ComputeFabricGraph
- `galerina-hardware-amd.md` — AMD Ryzen AI (XDNA NPU), AMD APU
- `galerina-hardware-apple.md` — Apple Silicon (Neural Engine, unified memory)
- `galerina-hardware-google.md` — Google TPU (cloud NPU equivalent)
- `galerina-hardware-future-substrates.md` — Neuromorphic always-on governance
