# Galerina — Hardware as Governed Capabilities

**Status:** Phase 13/14 — Future architecture

## TL;DR

- Hardware targets (GPU, NPU, APU, Photonic, Quantum) are governed capabilities, not language primitives
- Developers describe intent and workload characteristics; runtime selects hardware
- The source code never says "run on gpu"; it describes what the work IS

---

## The Problem

Traditional hardware coupling looks like this:

```python
# Python / PyTorch
model.cuda()
tensor.to("cuda:0")
x = x.to(device)
```

```javascript
// WebGPU JavaScript
const device = await adapter.requestDevice();
const buffer = device.createBuffer({ ... });
```

```c
// CUDA C
cudaMalloc(&d_array, size);
cudaMemcpy(d_array, h_array, size, cudaMemcpyHostToDevice);
```

The problems this creates:

```text
code is coupled to vendor hardware
code breaks on machines without that hardware
developer must know hardware topology at authoring time
business logic contains infrastructure decisions
portability requires rewriting or branching
hardware changes break application code
auditors see hardware instructions, not business intent
```

---

## Current Industry Approach

Most languages and frameworks require explicit hardware selection inside application code:

```text
developer picks hardware → developer writes hardware-specific code → code runs on that hardware
```

If hardware changes, or if the target machine has a different configuration, the code must change.

This couples application logic to infrastructure. Business intent becomes invisible inside hardware instructions.

---

## Galerina Philosophy

Galerina never requires the phrase "run on gpu" inside business logic.

The rule:

```text
Workload describes itself.
Execution system decides where it runs.
```

Source code expresses:

```text
what the work IS
what data it touches
what precision is acceptable
what latency is required
what authority is needed
```

The runtime expresses:

```text
which hardware is available
which hardware is appropriate
which fallback to use
which capability is approved
```

These two concerns must remain separate. Application authors should not be required to know
whether a deployment runs on a laptop CPU, a server with NPU cards, or a photonic accelerator.

---

## Why Hardware Matters To Governance

Hardware decisions are not neutral infrastructure choices. They carry consequences:

```text
GPU execution may expose data to shared memory
NPU execution may require specific driver trust levels
Remote hardware may cross data residency boundaries
Quantum hardware may expose intermediate state
```

These are governance concerns. They must be:

```text
declared before execution
approved before execution
audited after execution
provable to external reviewers
```

Hardware selection must flow through the same governance system as any other capability.
It must not be a private decision made inside application code without oversight.

---

## Compute Contracts

Future Galerina contracts will include a `contract.compute` section:

```galerina
contract.compute ClassifyTickets {
  workload: ai.inference
  prefer: [npu, gpu]
  fallback: [cpu]
  precision: int8 allowed
  latency: realtime
  data_sensitivity: private
  audit: required
}
```

This declares:

```text
what kind of work this is
which hardware is preferred
which fallback is acceptable
what precision trade-offs are allowed
what data sensitivity applies
whether audit is required
```

The runtime reads this contract and selects hardware accordingly.
The application code contains no hardware references at all.

---

## Hardware Capability Model

At runtime, the system knows what hardware is present and approved:

```yaml
hardware_capabilities:
  cpu:
    available: true
    trust_level: high
    data_sensitivity_allowed: [public, internal, private, regulated]
  gpu:
    available: true
    trust_level: restricted
    data_sensitivity_allowed: [public, internal]
  npu:
    available: true
    trust_level: high
    data_sensitivity_allowed: [public, internal, private]
  apu:
    available: false
  photonic:
    available: false
  quantum:
    available: false
```

Capabilities marked `available: false` are never selected, regardless of preference.
Capabilities with insufficient trust level are rejected for sensitive data.

---

## Intent-Guided Compute

The compiler and runtime derive `compute_affinity` from declared intent:

```galerina
intent "Classify support tickets by risk level" {
  workload: ai.classification
  input: SupportTicket
  output: RiskLevel
  data: private
}
```

Runtime derives:

```yaml
compute_affinity:
  npu: 0.95
  gpu: 0.90
  cpu: 0.40
  wasm: 0.10
```

The runtime selects the highest-affinity available and approved target.

---

## Compute Affinity By Workload Type

| Workload Type       | NPU  | GPU  | CPU  | WASM | Photonic | Quantum |
|---------------------|------|------|------|------|----------|---------|
| AI inference        | high | high | low  | low  | future   | —       |
| AI training         | med  | high | low  | —    | future   | —       |
| Vector search       | high | high | med  | low  | future   | —       |
| Matrix operations   | med  | high | med  | low  | future   | —       |
| General logic       | low  | low  | high | high | —        | —       |
| Database queries    | low  | low  | high | med  | —        | —       |
| Encryption          | low  | med  | high | high | —        | —       |
| Optimisation        | low  | med  | med  | low  | —        | future  |
| Graph traversal     | low  | med  | high | med  | —        | future  |
| Browser/edge        | —    | —    | low  | high | —        | —       |

`—` means not applicable or not yet defined.

---

## Hardware Abstraction Layer

The full compilation and execution path:

```text
Galerina Source
  -> Parser -> AST
  -> Type Checker -> Typed AST
  -> Semantic Analyser -> SemanticGraph
  -> Governance Layer -> GIR (Governed IR)
  -> Passive Execution Plan
  -> Hardware Planner
  -> Runtime Target
```

At each stage:

```text
Source           — developer writes intent, not hardware
SemanticGraph    — compiler understands what the work means
GIR              — governance layer proves capabilities, effects, privacy
Passive Plan     — plan describes work without selecting hardware
Hardware Planner — runtime selects hardware based on capabilities and policy
Runtime Target   — actual execution on selected hardware
```

No hardware selection occurs before the Hardware Planner stage.

---

## CPU — Default General Compute

```text
Target: CPU
Use case: all general business logic, control flow, orchestration
Default: yes — always available as fallback
Data sensitivity: all levels
Trust level: high
```

CPU is the universal fallback. If no preferred hardware is available or approved,
the work runs on CPU without error. The developer never needs to detect this or
write a CPU-specific branch.

---

## GPU — Parallel and Matrix Compute

```text
Target: GPU
Use case: parallel work, matrix operations, embeddings, image processing
Default: no — must be available and approved
Data sensitivity: governed by policy (shared GPU memory may restrict sensitive data)
Trust level: restricted unless dedicated
```

GPUs offer high parallelism for vectorisable work. Galerina treats GPU as a capability
that must be declared, approved, and audited. Application code does not call
`.cuda()` or `.to(device)`. The plan declares the workload; the planner selects GPU
when appropriate.

---

## NPU — AI Inference

```text
Target: NPU (Neural Processing Unit)
Use case: AI inference, classification, ranking, embedding
Default: no — must be available and approved
Data sensitivity: typically high trust — check vendor policy
Trust level: high when dedicated, restricted when shared
```

NPUs are optimised for neural network inference at low power. They are the preferred
target for AI classification, embedding generation, and ranking workloads. Galerina
routes to NPU automatically when declared affinity is high and the capability is approved.

---

## APU — Unified Memory Architecture

```text
Target: APU (Accelerated Processing Unit — unified CPU+GPU memory)
Use case: workloads that benefit from zero-copy between CPU and GPU domains
Default: no — must be detected and approved
Data sensitivity: governed by boundary declarations (see Governed Memory Boundaries)
Trust level: high when properly bounded
```

APUs expose a single physical memory space to both CPU and GPU cores. Galerina can exploit
this for zero-copy execution when governed memory boundaries are declared correctly.
See [Governed Memory Boundaries and APU Memory Sharing](galerina-governed-apu-memory.md).

---

## WASM — Browser, Edge, and Sandbox

```text
Target: WebAssembly
Use case: browser execution, edge compute, sandboxed environments, untrusted hosts
Default: no — selected when environment requires it
Data sensitivity: governed by sandbox policy
Trust level: sandboxed
```

WASM is not a performance target — it is an isolation and portability target. Galerina can
emit to WASM for browser-hosted execution or sandboxed edge deployments. The same
governed plan runs in WASM without changing business logic.

---

## Photonic — Future Optical Compute

```text
Target: Photonic compute
Use case: future — ultra-high-throughput matrix operations, AI inference at optical speed
Status: research — not available in current hardware
Data sensitivity: unknown — governance model not yet defined
Trust level: undefined — requires future governance research
```

Photonic computing uses light rather than electrons for computation. Early commercial
photonic AI accelerators exist for matrix multiplication. Galerina's architecture
anticipates this target: the same GIR and Passive Plan can be consumed by a Photonic
Emitter when hardware and governance models mature.

The language will not need to change. A new emitter will be added.

---

## Quantum — Future Optimisation Compute

```text
Target: Quantum compute
Use case: future — combinatorial optimisation, graph problems, specific search problems
Status: research — not available for general workloads
Data sensitivity: unknown — governance model not yet defined
Trust level: undefined — requires future governance research
```

Quantum computing suits specific problem classes: optimisation, graph traversal, and
search over large state spaces. Galerina's separation of planning from emission means that
a Quantum Emitter can be added for these workload types without changing source language
or governance model.

Quantum gates, qubits, and superposition are not Galerina language concerns. They are
emission targets.

---

## Why Not Hardware-Specific Types?

Other approaches introduce hardware-specific types into the language:

```text
PhotonicTrit
QuantumQubit
GPUFloat16
NPUTensor
```

Galerina rejects this approach. Hardware-specific types:

```text
couple source code to hardware generations
break when hardware is upgraded or replaced
require developer knowledge of hardware internals
prevent portability across deployment environments
make governance harder because hardware policy is embedded in types
```

Galerina uses hardware-neutral types:

```galerina
Tensor<Float32, [768]>
Matrix<Float16, [1024, 1024]>
Embedding<Float32, [512]>
```

The runtime understands these types and knows how to represent them on each hardware target.

---

## Runtime Selection Example

Contract declares:

```galerina
prefer: [npu, gpu]
fallback: [cpu]
```

Runtime at deployment A (server with NPU):

```text
npu: available, approved -> selected
```

Runtime at deployment B (laptop, no NPU):

```text
npu: unavailable -> skip
gpu: available, approved -> selected
```

Runtime at deployment C (sandboxed cloud, GPU restricted for private data):

```text
npu: unavailable -> skip
gpu: available but restricted for private data -> rejected by governance
cpu: available, approved -> selected
```

Application code is identical across all three deployments.

---

## Runtime Reports

After execution, the runtime produces a hardware selection report:

```json
{
  "workload": "ClassifyTickets",
  "selected_target": "npu",
  "alternatives_considered": ["gpu", "cpu"],
  "alternatives_rejected": {
    "gpu": "data_sensitivity: private — shared GPU not approved"
  },
  "fallback_used": false,
  "governance_passed": true,
  "capability_approved": "capability.compute.npu",
  "execution_hash": "sha256:a3f9..."
}
```

This report is part of the runtime report set. It is not optional.

---

## Audit Proof

The attestation record for hardware selection includes:

```json
{
  "selected_target": "npu",
  "compute_affinity": { "npu": 0.95, "gpu": 0.90, "cpu": 0.40 },
  "contract_hash": "sha256:b1c2...",
  "capability_proof": "capability.compute.npu approved by policy v3.1",
  "execution_hash": "sha256:a3f9...",
  "governance_passed": true
}
```

An external auditor can verify:

```text
what hardware was selected
why it was selected
what alternatives were available
that governance approved the selection
that the execution matches the plan
```

---

## Future Research

### GPU-Native Galerina

Explore whether certain Galerina constructs can compile directly to GPU shader-level IR
without passing through CPU-side orchestration.

### NPU-Native Inference Graphs

Explore static AI inference graphs that compile directly to NPU instruction sets,
bypassing the general execution plan for latency-critical paths.

### Photonic IR Mapping

Define how GIR linear-algebra operations map to photonic matrix multiplication circuits.
Determine governance model for optical compute trust levels.

### Quantum Workload Annotation

Define which Galerina workload types have quantum-suitable problem shapes.
Explore how to express quantum circuit structure inside Passive Execution Plans without
exposing qubit semantics to application code.

---

## Relationship to Existing Concepts

| Concept | Relationship |
|---|---|
| IGO (Intent Governance Overlay) | IGO proves intent before hardware selection; hardware selection is a governed IGO output |
| Static Capability Proofs | Hardware targets are capabilities proved before execution |
| Metadata Erasure | Hardware selection metadata is stripped from deployed artefacts; runtime reads policy |
| Passive Plans | Hardware Planner reads Passive Plans; plans do not contain hardware names |
| Runtime Reports | Hardware selection is always reported; selection is never silent |

---

## Final Principle

```text
Galerina is a governed execution language.
It is not a CPU language.
It is not a GPU language.
It is not a quantum language.
It is a language in which software describes what it means
and the governed runtime decides where it runs.
```

---

## Rules at a Glance

- Source code MUST NOT name a hardware target directly
- Hardware selection MUST flow through the governance layer
- Hardware selection MUST be reported
- Hardware selection MUST be auditable
- Fallback MUST be automatic and governed
- Hardware-specific types MUST NOT appear in business logic
- Data sensitivity policy MUST constrain hardware selection
- Governance approval MUST precede execution on any non-CPU target

---

## See Also

- [Separate Logical Planning From Target Emission](galerina-logical-planning-target-emission.md)
- [Governed Memory Boundaries and APU Memory Sharing](galerina-governed-apu-memory.md)
- [AI and Linear Algebra Accelerator Support](ai-linear-algebra-accelerator-support.md)
- [AI Compute Plan](ai-compute-plan.md)
- [Static Capability Proofs](galerina-static-capability-proofs.md)
- [Passive Execution Plans](galerina-passive-execution-plans.md)
- [Runtime Reports](galerina-passive-execution-plans.md#runtime-reports)
