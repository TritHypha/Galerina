# Galerina Core Compute: GPU and Photonic Backends

Status: Draft v0.1/vNext compute architecture planning document  
Package: `galerina-core-compute`  
Purpose: Define the future compute architecture for Galerina runtime execution across CPU, GPU, AI accelerators and future photonic/optical systems.

---

# 1. Overview

Galerina is governance-first.

That means advanced compute systems must remain:

```text
safe
explainable
runtime-governed
policy-aware
portable
hardware-neutral
```

The compute layer should not expose raw vendor-specific complexity directly into application code.

Instead, Galerina should:

```text
abstract compute intent
plan execution safely
allow runtime coordination
support heterogeneous systems
remain future-compatible
```

---

# 2. Current Status

Current implementation focus:

```text
CPU runtime
safe async scheduling
runtime governance
compiler correctness
```

GPU and photonic support are currently:

```text
planning only
```

This document defines the architecture direction before implementation.

---

# 3. Compute Design Principles

The compute layer should be:

```text
backend-neutral
runtime-controlled
policy-governed
portable
explainable
fallback-safe
future-compatible
```

The compute layer should avoid:

```text
vendor lock-in
unsafe memory access
hidden runtime switching
magic acceleration
unsafe DMA assumptions
hardcoded GPU syntax
```

---

# 4. Long-Term Compute Goal

Long-term runtime target:

```text
CPU + GPU + AI accelerator + optical interconnect
```

Managed under:

```text
one governed runtime
one execution planner
one audit system
one capability/effect model
```

---

# 5. Compute Architecture Layers

Recommended architecture:

```text
Galerina source
    ↓
compiler
    ↓
execution graph
    ↓
compute planner
    ↓
runtime scheduler
    ↓
backend adapter layer
    ↓
CPU / GPU / accelerator / optical transport
```

---

# 6. Core Compute Packages

Suggested package structure:

```text
galerina-core-compute
galerina-core-compute-cpu
galerina-core-compute-gpu
galerina-core-compute-accelerator
galerina-core-compute-optical
galerina-core-compute-scheduler
galerina-core-compute-runtime
```

---

# 7. Why Compute Must Be Runtime-Governed

Galerina should not allow arbitrary code to directly control hardware execution.

Reason:

```text
security
runtime safety
resource exhaustion
unsafe memory access
thermal instability
uncontrolled scheduling
```

Application code should describe:

```text
intent
```

The runtime decides:

```text
how execution occurs
```

---

# 8. Compute Intent vs Hardware Control

Bad approach:

```galerina
target nvidia_cuda
```

Reason:

```text
hardcoded vendor dependency
not portable
not future-compatible
```

Recommended:

```galerina
target gpu
```

The runtime resolves actual backend.

---

# 9. Example Compute-Aware Function

```galerina
fn run_inference(batch: TensorBatch)
    -> InferenceResult
    effect accelerator
{
    runtime.compute(batch)
}
```

Meaning:

```text
workload may benefit from accelerator execution
runtime decides actual backend
```

---

# 10. Compute Effects

Recommended compute-related effects:

| Effect | Meaning |
|---|---|
| `accelerator` | uses GPU or accelerator execution |
| `optical_io` | uses optical transport planning |
| `distributed_compute` | distributed execution |
| `high_memory` | elevated memory pressure |
| `parallel_compute` | high parallel execution |

---

# 11. Compute Capabilities

Recommended compute capabilities:

| Capability | Meaning |
|---|---|
| `ComputeRuntime` | runtime compute coordination |
| `GpuRuntime` | GPU execution access |
| `AcceleratorRuntime` | AI accelerator access |
| `OpticalTransport` | optical data movement |
| `DistributedScheduler` | distributed execution planning |

---

# Part A: CPU Runtime

---

# 12. CPU as Baseline Runtime

The CPU runtime should remain:

```text
primary
stable
portable
safe
fully governed
```

All workloads should be able to execute on CPU unless explicitly impossible.

---

# 13. Why CPU Remains Important

CPU execution provides:

```text
predictable execution
high compatibility
safe fallback
lower runtime complexity
simpler debugging
```

GPU and optical systems should enhance execution, not replace runtime governance.

---

# 14. Example CPU Plan

```json
{
  "module": "app/users/service",
  "recommendedTarget": "cpu",
  "reason": [
    "storage-bound workload",
    "minimal parallel gain"
  ]
}
```

---

# Part B: GPU Runtime Planning

---

# 15. GPU Runtime Purpose

GPU execution is useful for:

```text
parallel tensor operations
matrix multiplication
AI inference
AI training
high throughput workloads
parallel simulation
```

Not every workload benefits from GPU execution.

---

# 16. GPU Runtime Responsibilities

The GPU runtime layer should handle:

```text
kernel scheduling
buffer allocation
copy planning
memory pressure
execution coordination
fallback handling
runtime isolation
```

Application code should not manage these directly.

---

# 17. Example GPU Candidate

```galerina
fn classify_batch(batch: TensorBatch)
    -> ClassificationResult
    effect accelerator, parallel_compute
{
    return runtime.classify(batch)
}
```

Planner reasoning:

```text
parallel workload
high tensor throughput
accelerator-friendly
```

---

# 18. Example GPU Plan

```json
{
  "module": "app/ai/classifier",
  "recommendedTarget": "gpu",
  "fallbackTarget": "cpu",
  "parallelism": "high",
  "memoryPressure": "high"
}
```

---

# 19. GPU Fallback Rules

The runtime must always support safe fallback.

Example:

```text
GPU unavailable → fallback to CPU
GPU overheating → fallback to CPU
GPU policy denied → fallback to CPU
GPU memory exhausted → fallback to CPU
```

Fallback must appear in audit logs.

---

# 20. Example Runtime Fallback Event

```json
{
  "traceId": "trace-500",
  "plannedTarget": "gpu",
  "actualTarget": "cpu",
  "reason": "gpu memory exhausted"
}
```

---

# 21. GPU Policy Rules

Deployment policy may deny GPU usage.

Example:

```json
{
  "allowTargets": ["cpu"],
  "denyEffects": ["accelerator"]
}
```

Deployment denial:

```text
Deployment denied.
Reason:
accelerator effect denied by deployment policy
```

---

# 22. GPU Runtime Isolation

The runtime should isolate GPU execution.

Reason:

```text
prevent memory corruption
prevent unsafe kernel access
prevent ungoverned DMA
prevent backend instability
```

The runtime should own:

```text
buffers
memory transfer
kernel scheduling
execution lifetime
```

---

# 23. Suggested GPU Runtime Architecture

```text
Galerina runtime
    ↓
compute planner
    ↓
GPU scheduler
    ↓
buffer manager
    ↓
kernel adapter
    ↓
GPU backend
```

---

# 24. Vendor-Neutral Goal

Galerina should not hardcode:

```text
CUDA
ROCm
DirectML
Metal
Vulkan
```

Instead:

```text
backend adapters map Galerina runtime operations onto available systems
```

---

# 25. Suggested GPU Adapter Layer

```text
galerina-core-compute-gpu-cuda
galerina-core-compute-gpu-rocm
galerina-core-compute-gpu-metal
galerina-core-compute-gpu-vulkan
```

These remain runtime plugins, not language syntax.

---

# Part C: AI Accelerators

---

# 26. AI Accelerator Planning

Future accelerators may include:

```text
TPUs
NPUs
AI inference chips
edge AI processors
FPGA AI systems
```

Galerina should treat these as:

```text
runtime targets
```

not separate language modes.

---

# 27. Example Accelerator Plan

```json
{
  "module": "app/ai/inference",
  "recommendedTarget": "accelerator",
  "fallbackTarget": "gpu",
  "reason": [
    "tensor inference",
    "accelerator-compatible workload"
  ]
}
```

---

# Part D: Photonic and Optical Planning

---

# 28. Photonic Compute Philosophy

Galerina should treat photonics primarily as:

```text
optical interconnect
high-speed transport
distributed memory movement
accelerator coordination
```

Not as:

```text
magical replacement boolean logic
```

---

# 29. Why Optical Matters

Optical systems may help:

```text
high bandwidth transport
low latency distributed coordination
accelerator pooling
memory disaggregation
cluster-scale AI coordination
```

---

# 30. Optical Transport Example

```galerina
fn distribute_training_batch(batch: TensorBatch)
    effect optical_io, distributed_compute
{
    runtime.distribute(batch)
}
```

Meaning:

```text
runtime may coordinate distributed accelerator execution
runtime may use optical transport
```

---

# 31. Example Optical Execution Plan

```json
{
  "module": "app/ai/training",
  "recommendedTransport": "optical_io",
  "distributed": true,
  "reason": [
    "large tensor movement",
    "high bandwidth requirement"
  ]
}
```

---

# 32. Optical Runtime Responsibilities

The optical layer should coordinate:

```text
high-speed transport
node coordination
memory pooling
cluster routing
accelerator federation
```

The application layer should not manage optical routing directly.

---

# 33. Optical Governance Rules

Optical systems must still obey:

```text
runtime policy
capability rules
effect declarations
audit logging
execution proof
```

Optical execution should never bypass governance.

---

# 34. Example Optical Audit Event

```json
{
  "traceId": "trace-700",
  "target": "distributed-gpu",
  "transport": "optical_io",
  "distributed": true
}
```

---

# Part E: Runtime Scheduler and Planner

---

# 35. Runtime Scheduler Responsibilities

The scheduler should coordinate:

```text
execution queues
parallel tasks
backend assignment
fallback handling
thermal balancing
resource pressure
runtime fairness
```

---

# 36. Scheduler Inputs

The scheduler should consider:

```text
planner recommendations
runtime policy
available hardware
thermal pressure
memory pressure
queue depth
capability permissions
```

---

# 37. Scheduler Example

```text
Planner recommends GPU.
Runtime detects GPU overheating.
Scheduler falls back to CPU.
Audit event recorded.
```

---

# 38. Example Scheduler Event

```json
{
  "category": "scheduler",
  "event": "target_reassigned",
  "traceId": "trace-800",
  "plannedTarget": "gpu",
  "actualTarget": "cpu",
  "reason": "thermal pressure"
}
```

---

# 39. Runtime Planner Responsibilities

Planner estimates:

```text
parallelism
memory usage
transfer pressure
backend suitability
energy cost
fallback options
```

The planner recommends.
The runtime decides.

---

# Part F: Compute Graphs

---

# 40. Execution Graph Example

```text
input
  ↓
preprocess
  ↓
parallel tensor stage
  ├── gpu kernel 1
  ├── gpu kernel 2
  └── gpu kernel 3
  ↓
merge
  ↓
output
```

---

# 41. Distributed Graph Example

```text
node-1 preprocess
      ↓
optical transport
      ↓
node-2 gpu execution
      ↓
optical transport
      ↓
node-3 aggregation
```

---

# Part G: Runtime Governance

---

# 42. Compute Governance Rules

The compute layer must not:

```text
bypass runtime policy
silently escalate authority
access unsafe memory
execute unapproved kernels
ignore effect declarations
ignore capability rules
```

---

# 43. Compute Runtime Policies

Example:

```json
{
  "allowTargets": [
    "cpu",
    "gpu"
  ],
  "denyTargets": [
    "distributed-gpu"
  ],
  "denyEffects": [
    "optical_io"
  ]
}
```

---

# 44. Example Runtime Denial

```text
Execution denied.
Reason:
optical_io effect denied by runtime policy
```

---

# 45. Capability Enforcement Example

```galerina
fn run_gpu(batch: TensorBatch)
    effect accelerator
{
    runtime.compute(batch)
}
```

Runtime requirement:

```text
GpuRuntime capability required
```

---

# Part H: Runtime Reporting and Audit

---

# 46. Compute Audit Events

Recommended audit fields:

```json
{
  "traceId": "trace-900",
  "plannedTarget": "gpu",
  "actualTarget": "gpu",
  "effects": ["accelerator"],
  "durationMs": 24,
  "memoryUsageMb": 1024
}
```

---

# 47. Distributed Audit Event

```json
{
  "traceId": "trace-901",
  "distributed": true,
  "transport": "optical_io",
  "nodes": [
    "node-1",
    "node-2"
  ]
}
```

---

# 48. Execution Proof Integration

Compute execution should appear in execution proofs.

Example:

```json
{
  "executionTarget": "gpu",
  "fallback": false,
  "distributed": false,
  "transport": null
}
```

---

# Part I: Compiler and CLI Integration

---

# 49. Compiler Integration

Compiler should emit:

```text
compute hints
parallelism hints
memory hints
backend compatibility
```

Example:

```json
{
  "module": "app/ai/inference",
  "parallelism": "high",
  "recommendedTargets": ["gpu", "accelerator"]
}
```

---

# 50. CLI Integration

Example:

```bash
galerina plan app/ai/inference
```

Output:

```text
Recommended target: gpu
Fallback target: cpu
Estimated memory pressure: high
```

---

# 51. Explain Integration

```bash
galerina explain app/ai/inference
```

Output:

```text
Reasoning:
- tensor-heavy workload
- high parallelism
- accelerator-compatible execution
```

---

# Part J: Future Planning

---

# 52. Potential Future Features

Possible future features:

```text
live distributed balancing
cluster orchestration
photonic memory pooling
runtime energy optimisation
AI-assisted execution planning
accelerator federation
```

These should remain:

```text
runtime-managed
policy-governed
fully auditable
```

---

# 53. Things Galerina Should Avoid

Avoid:

```text
vendor-specific language syntax
unsafe shared memory assumptions
unbounded automatic acceleration
hidden runtime switching
non-auditable execution
```

---

# 54. Suggested Runtime Diagnostics

| Code | Meaning |
|---|---|
| `SPORE-COMPUTE-001` | requested compute target unavailable |
| `SPORE-COMPUTE-002` | accelerator effect denied by policy |
| `SPORE-COMPUTE-003` | optical transport unavailable |
| `SPORE-COMPUTE-004` | distributed scheduler unavailable |
| `SPORE-COMPUTE-005` | runtime fallback occurred |
| `SPORE-COMPUTE-006` | GPU memory pressure exceeded |
| `SPORE-COMPUTE-007` | backend adapter failure |

---

# 55. Required Test Cases

## CPU tests

```text
CPU execution succeeds
CPU fallback succeeds
runtime policy respected
```

## GPU tests

```text
GPU planner recommendation generated
GPU fallback works
GPU denial respected
memory pressure handled
```

## Optical tests

```text
optical planning generated
policy denial enforced
runtime audit events recorded
```

---

# 56. Recommended v0.1 Scope

Implement first:

```text
CPU runtime
compute planner
basic GPU planning metadata
runtime target selection
fallback system
runtime audit integration
```

Defer:

```text
real GPU kernel engine
real optical runtime
cluster orchestration
photonic execution engine
advanced distributed balancing
```

---

# 57. Final Recommendation

Galerina should treat advanced compute systems as:

```text
runtime execution targets
```

not as:

```text
hardcoded language features
```

The runtime should remain responsible for:

```text
planning
scheduling
fallback
policy enforcement
audit logging
execution proof
```

This allows Galerina to remain:

```text
portable
future-compatible
secure
explainable
governance-first
```

while still preparing for:

```text
GPU acceleration
AI accelerators
heterogeneous compute
optical interconnect systems
future photonic infrastructure
```
