# Galerina — Coordinated Compute

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

This document covers the third stage: **coordinated compute**.

---

## What Is Coordinated Compute?

Coordinated compute is the runtime orchestration layer that transforms a governed execution plan into actual execution across:

```text
CPU
GPU
NPU
APU
WASM
native runtime
distributed workers
future photonic targets
```

It is responsible for:

```text
runtime target selection      — which hardware is legal and available
fallback coordination         — what happens when the preferred target is unavailable
memory isolation              — request-scoped arenas, secret zeroing, cross-request boundaries
accelerator dispatch          — GPU kernels, NPU inference, quantized execution
verification                  — cross-target reference checks, precision validation
runtime isolation             — unsafe boundary containment, capability enforcement
execution synchronization     — distributed nodes, concurrent flows, structured await
```

---

## Simple Definition

| Stage | Answers |
|---|---|
| Intent | *Why does this system exist?* |
| Governed Execution Plan | *How is the system allowed to execute?* |
| **Coordinated Compute** | ***How does governed execution actually occur?*** |
| Audit Proof | *What can be proven about execution?* |

---

## Core Philosophy

Traditional runtimes ask:

> *How do we execute code efficiently?*

Galerina coordinated compute asks:

> *How do we execute code efficiently, safely, governably, verifiably, and within declared authority constraints?*

A normal scheduler coordinates threads, memory, tasks, and processes. Coordinated compute coordinates authority, effects, runtime targets, accelerators, memory safety, verification, governance constraints, resource boundaries, fallback legality, and precision policy.

That is a fundamentally different layer.

---

## From Governed Plan to Runtime Decision

### Governed execution plan (from the compiler)

```yaml
compute:
  preferred:
    - npu
  fallback:
    - gpu
    - cpu
  quantization:
    required: true
    format: Int8
  runtime:
    localExecutionOnly: true
```

### Runtime coordination decision

The coordinated compute layer now evaluates:

```text
- Is NPU available?
- Does the selected backend support this operation graph?
- Is quantized inference supported on the available hardware?
- Does the fallback violate localExecutionOnly policy?
- Is memory sufficient?
- Is CPU reference verification required?
```

### Runtime coordination record

```yaml
coordinatedCompute:
  graph: FraudModel

  selectedTarget:
    provider: gpu
    reason:   npu unavailable

  fallback:
    provider: cpu_reference

  memory:
    arena: request_scoped

  verification:
    compareAgainstCpuReference: true

  scheduling:
    priority: realtime

  runtimeIsolation:
    enabled: true
```

This record feeds directly into the audit proof.

---

## Runtime Target Selection

One of coordinated compute's primary responsibilities is selecting the legal execution target from the preference/fallback chain declared in the plan.

```galerina
compute target best {
  prefer [npu, gpu, cpu]
  fallback cpu
  result = FraudModel(input)
}
```

The coordinator decides:

```text
Which target is legally allowed?
Which target is available on this hardware?
Which target satisfies runtime policy constraints?
Which target satisfies memory constraints?
Which target satisfies precision constraints?
```

If no legal target is available, execution fails cleanly rather than silently degrading.

---

## Governance-Aware Fallback

Fallback is not merely "try the next thing". Fallback legality is checked against the governed execution plan.

Example: execution plan declares `localExecutionOnly: true`. A cloud GPU is available but is rejected — not because it is unavailable, but because it violates policy.

```yaml
policy:
  denyRemoteInference: true
```

Runtime rejects cloud fallback even if it would be faster:

```text
SPORE-RUNTIME-201: Execution violates coordinated compute policy.
  Remote execution denied. localExecutionOnly is enforced.
```

---

## Memory Coordination

Memory in coordinated compute is orchestrated around governance requirements:

```yaml
memory:
  requestArena: enabled

  secretMemory:
    zeroing: required

  crossRequestIsolation:
    enabled
```

The coordinator manages:
- allocation of request-scoped arenas (data does not leak between requests)
- isolation of secret material (never enters accelerator memory unless explicitly permitted)
- cleanup and zeroing of sensitive memory after execution
- accelerator-specific memory coordination for GPU/NPU buffers

---

## Accelerator Dispatch

For AI and compute-intensive workloads, coordinated compute manages the full dispatch chain:

```yaml
accelerator:
  provider: TensorRT

  precision:
    Int8

  fallback:
    cpu_reference

  verification:
    enabled: true
```

This covers:
- GPU kernel dispatch
- NPU inference submission
- quantized execution with precision guarantees
- fallback to CPU reference implementation for verification
- future photonic operator dispatch

---

## Precision Coordination

For quantized AI execution, precision changes must be governed:

```galerina
Quantized<Float32, Int8>
```

Runtime coordination ensures:
- the correct quantized backend is selected
- dequantization is valid
- there is no silent precision downgrade outside declared policy
- verification tolerances are respected when cross-checking against a CPU reference

---

## Unsafe Boundary Isolation

When the governed execution plan declares unsafe native execution, coordinated compute ensures it is properly sandboxed:

```galerina
unsafe native flow tensorRtInference(...)
```

```yaml
unsafe:
  native:
    sandboxed: true
    capabilityIsolation:
      enabled: true
    memoryIsolation:
      enabled: true
```

Unsafe execution does not escape into the governing context. The authority boundary between the safe execution environment and the unsafe native call is enforced at runtime.

---

## Distributed Coordination

Future coordinated compute will extend across distributed execution nodes:

```yaml
distributed:
  execution:
    locality:
      - eu-west
  replication:
    disabled
  secrets:
    regionLocked: true
```

Governance reaches distributed systems — data locality constraints, replication policies, and secret regionalization are all enforced as part of coordinated compute, not as external infrastructure conventions.

---

## Verification Coordination

Coordinated compute is responsible for runtime verification across targets:

```yaml
verification:
  compareAgainstCpuReference:
    enabled: true
    tolerance: 0.001
```

Used for:
- quantized AI output verification (does the NPU result match the CPU reference within tolerance?)
- accelerator output consistency checks
- photonic analog computation tolerance checks
- distributed execution consistency

---

## Runtime Evidence Generation

Every coordinated compute decision becomes runtime evidence that feeds into the audit proof:

```yaml
runtimeEvidence:
  target:
    provider: apple_ane

  fallbackUsed: false

  quantization: Int8

  verification:
    passed: true

  memoryIsolation:
    enabled: true
```

The execution becomes explainable — not just a black-box result, but a governed, traceable outcome.

---

## The Coordination Graph

```text
Governed Execution Plan
        ↓
Target Planner
  selects legal runtime target

Memory Coordinator
  governs allocation, isolation, zeroing

Capability Coordinator
  enforces runtime authority at execution points

Accelerator Scheduler
  manages GPU/NPU/photonic dispatch

Verification Coordinator
  validates output across targets

Runtime Evidence Engine
  records execution proof for audit
```

Each component operates within the authority boundaries defined by the governed execution plan.

---

## Coordinated Compute and Photonic Execution

Future photonic targets require fundamentally different coordination. Instead of threads and GPU blocks, the coordinator manages:

```text
wavelength channels
phase synchronization
delay lines
interference paths
optical/electrical conversion
```

```yaml
photonic:
  wavelengths:
    - 1550nm
    - 1551nm
  delayLines:
    enabled: true
  verification:
    analogTolerance: 0.0001
```

This is why photonic cannot simply be "GPU but optical" — the coordination model is entirely different, and the governed plan must express this explicitly.

---

## Today's Implementation (Stage A)

In the current Node.js prototype, coordinated compute is simulated through the TypeScript/Node.js layer. Real hardware target selection, GPU dispatch, and memory isolation arrive in later phases.

The model is designed now so that the governed execution plan, target selection declarations, fallback policies, and audit evidence structures are all expressed in source — ready for the native runtime to enforce them in Phase 6 and beyond.

---

## Final Mental Model

```text
Intent               why the system exists
Governed Plan        what execution is allowed
Coordinated Compute  how governed execution actually occurs
Audit Proof          evidence that execution respected governance
```

Coordinated compute is the *governed orchestration layer* — safely coordinating execution across runtime targets, memory systems, accelerators, and authority boundaries while generating the verifiable runtime evidence that the audit proof layer requires.

---

## Related Documents

| Document | Notes |
|---|---|
| [Intent](galerina-concept-intent.md) | First pipeline stage |
| [Governed Execution Plan](galerina-concept-governed-execution-plan.md) | Second stage — the contract coordinated compute executes against |
| [Audit Proof](galerina-concept-audit-proof.md) | Fourth stage — consumes coordinated compute's runtime evidence |
| [compiler-diagnostics.md](compiler-diagnostics.md) | Full `SPORE-*` diagnostic code table |
