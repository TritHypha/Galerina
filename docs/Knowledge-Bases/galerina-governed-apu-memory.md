# Galerina — Governed Memory Boundaries and APU Memory Sharing

**Status:** Phase 14 — Future architecture

## TL;DR

- APUs share CPU+GPU memory; Galerina can exploit this safely using governed memory boundaries
- Boundaries declare ownership, visibility, lifetime, and mutation rights — compiler proves access patterns, runtime schedules safely
- Stage B: logical boundaries and metadata only; arena allocation comes with native/WASM targets

---

## Executive Summary

APUs (Accelerated Processing Units) expose a single physical memory space to both CPU and GPU cores.
This creates an opportunity:

```text
zero-copy data sharing between CPU and GPU work
reduced duplication of large data structures
lower latency for mixed CPU/GPU pipelines
```

It also creates a risk:

```text
race conditions when CPU and GPU access the same memory concurrently
data corruption when mutation order is not controlled
undefined behaviour when ownership is ambiguous
```

Galerina addresses this through governed memory boundaries: a system in which developers
declare ownership and access intent, the compiler proves access patterns are safe, and the
runtime schedules execution to enforce those proofs.

---

## The Problem

Traditional execution assumes CPU owns memory:

```text
CPU allocates memory
CPU writes data
CPU passes pointer to GPU (copy)
GPU operates on its own copy
GPU returns result (copy)
CPU reads result
```

With APU unified memory:

```text
CPU allocates memory in shared space
CPU writes data
GPU reads the same physical address — no copy needed
GPU writes result to shared space
CPU reads result from the same physical address
```

The performance benefit is real. The danger is equally real:

```text
if CPU writes while GPU reads:    data corruption or undefined behaviour
if GPU writes while CPU reads:    same
if both write concurrently:       race condition
if ownership is not tracked:      compiler cannot prove safety
```

---

## Traditional Solutions

Most systems address this with explicit synchronisation:

```c
// Traditional approach
pthread_mutex_lock(&shared_mutex);
// ... CPU work ...
cudaStreamSynchronize(stream);
pthread_mutex_unlock(&shared_mutex);
```

Problems with this approach:

```text
developer must track every access point manually
locking is error-prone — missed locks cause silent corruption
deadlocks occur when locking order is inconsistent
locks are not auditable — there is no record of what was protected
performance suffers when locks are too coarse
correctness suffers when locks are too fine
```

These are not problems that discipline alone can solve at scale.

---

## Galerina Philosophy

Galerina does not expose `lock()` and `unlock()` as application concerns.

The principle:

```text
Developers describe intent.
Compiler proves access patterns.
Runtime schedules safely.
```

The developer declares:

```text
who owns this memory region
who may read it
who may modify it
when ownership may transfer
how long the region lives
```

The compiler proves that declared access patterns are consistent and safe.
The runtime schedules CPU and GPU work in an order that respects those proofs.
No manual lock required. No manual barrier required. No manual synchronisation required.

---

## Governed Memory Boundaries

Governed memory boundaries extend the existing `unsafe` / `protected` / `redacted` concept
into memory region management.

A boundary declaration:

```galerina
boundary PatientAnalytics {
  data: Array<PatientRecord>
  owner: cpu
  readers: [cpu, gpu]
  mutation: cpu_only
  lifetime: request_scoped
  sensitivity: regulated
}
```

This declares:

```text
what data lives in this region
who owns the region (who controls its lifetime)
who may read from it
who may write to it
how long it exists
what data sensitivity applies
```

The compiler reads this declaration and proves that all accesses in the program respect it.

---

## Read-Only Shared Boundaries

The safest boundary pattern: one region, multiple readers, no mutation.

```galerina
boundary EmbeddingStore {
  data: Array<Tensor<Float32, [768]>>
  owner: cpu
  readers: [cpu, gpu, npu]
  mutation: none
  lifetime: session_scoped
  sensitivity: internal
}
```

Properties of read-only shared boundaries:

```text
CPU may read at any time
GPU may read at any time
NPU may read at any time
No reader can corrupt the data because no reader can write
No synchronisation required between readers
Ideal for: inference inputs, embedding stores, lookup tables, configuration
```

This is the ideal pattern for AI inference pipelines where the model weights and input
embeddings are loaded once and read many times by GPU or NPU cores.

---

## Shared Compute Example

```galerina
fn batchClassify(tickets: boundary EmbeddingStore): Array<RiskLevel> {
  // CPU and GPU both read from EmbeddingStore
  // No copies needed — they share the same physical memory
  // No locks needed — neither side writes
  return npu.classify(tickets.data)
}
```

Runtime execution:

```text
CPU loads ticket embeddings into EmbeddingStore (one allocation)
NPU reads EmbeddingStore directly (no copy)
CPU collects results (no copy back needed for read-only input)
Total copies: 0
```

---

## Mutable Boundaries

When mutation is needed, the compiler determines who writes, when, and in what order.

```galerina
boundary ResultBuffer {
  data: Array<RiskLevel>
  owner: cpu
  readers: [cpu]
  writers: [gpu]
  mutation: gpu_then_cpu_read
  lifetime: request_scoped
  sensitivity: private
}
```

The `mutation: gpu_then_cpu_read` declaration tells the compiler:

```text
GPU writes to this region first
CPU reads from this region after GPU completes
CPU does not read before GPU writes
GPU does not write after CPU begins reading
```

The compiler proves this sequencing is satisfied throughout the program.
If any code path violates the declared ordering, the compiler rejects it.

---

## Exclusive Ownership Model

Some regions must be exclusively owned — one writer with controlled reader access:

```galerina
boundary TrainingGradients {
  data: Matrix<Float32, [1024, 512]>
  owner: gpu
  readers: [gpu]
  writers: [gpu]
  mutation: gpu_exclusive
  lifetime: batch_scoped
  sensitivity: internal
}
```

Ownership model rules:

```text
one writer at a time: enforced
multiple readers allowed only when no writer is active: enforced
CPU write while GPU owns: compiler error
GPU write while CPU reads: compiler error
CPU write and GPU write simultaneously: compiler error
```

---

## Ownership Model YAML

The runtime represents boundary ownership in execution plans:

```yaml
memory_boundary:
  name: PatientAnalytics
  owner: cpu
  readers: [cpu, gpu]
  writers: []
  mutation: none
  lifetime: request_scoped
  sensitivity: regulated
  physical_layout: unified
  zero_copy: true
  estimated_size_bytes: 4096000
```

---

## Execution Scheduling

Boundaries appear in Passive Execution Plans as scheduling constraints:

```yaml
execution_plan:
  - step: cpu_prepare
    boundary: PatientAnalytics
    operation: load_records
    result: boundary_ready

  - step: gpu_inference
    boundary: PatientAnalytics
    access: read_only
    operation: classify_embeddings
    depends_on: cpu_prepare

  - step: cpu_collect_results
    boundary: ResultBuffer
    access: read
    operation: aggregate_scores
    depends_on: gpu_inference
```

The runtime scheduler reads these constraints and sequences execution accordingly.
No locks. No barriers. No manual synchronisation. The plan is the proof.

---

## Zero-Copy Opportunities

The compiler identifies zero-copy opportunities automatically:

```text
Condition: boundary is read_only
Condition: boundary uses unified physical memory (APU)
Condition: all readers are declared in boundary definition
Result: no copy required

Condition: boundary owner transfers to another unit
Condition: transfer is declared in boundary definition
Condition: original owner does not access after transfer
Result: transfer by reference, no copy required
```

Zero-copy is not a developer optimisation hint. It is a compiler-derived consequence
of correct boundary declarations.

---

## What Galerina Can Guarantee

When boundaries are correctly declared, Galerina guarantees:

```text
declared ownership is respected throughout execution
access patterns match declarations or compilation fails
execution ordering respects mutation declarations
governance policy is enforced on boundary access
audit evidence captures boundary use
```

---

## What Galerina Cannot Guarantee

Galerina does not guarantee:

```text
hardware cache coherency behaviour on specific APU models
physical memory latency on specific APU configurations
vendor-specific memory controller behaviour
NUMA topology effects
```

These are hardware concerns. Galerina provides the logical safety guarantee.
The runtime and hardware provide the physical execution guarantee.
The developer must understand that the hardware may introduce constraints the boundary
system cannot anticipate.

---

## Relationship to Contracts

Future contract syntax will include a `contract.memory` section:

```galerina
contract.memory PatientPipeline {
  boundary PatientAnalytics {
    owner: cpu
    readers: [cpu, npu]
    mutation: none
    sensitivity: regulated
  }
  boundary ResultSet {
    owner: npu
    readers: [cpu]
    writers: [npu]
    mutation: npu_then_cpu_read
  }
}
```

This makes memory governance a first-class contract concern alongside capability and
effect governance.

---

## Relationship to Effects

Memory access through boundaries is a governed effect:

```text
memory.shared.read     — reading from a shared boundary
memory.boundary.write  — writing to a mutable boundary
memory.boundary.own    — owning a boundary (lifecycle control)
memory.zero_copy       — using zero-copy access to a unified boundary
```

These effects must be declared. The governance layer proves that declared effects match
actual access patterns before emission.

---

## Relationship to Passive Plans

Boundaries appear in Passive Execution Plans as:

```text
boundary declarations — what regions exist, who owns them
access annotations    — which steps access which boundaries and how
ordering constraints  — which steps must complete before others may access
zero-copy flags       — which accesses can be scheduled without copies
```

The Hardware Planner reads these annotations when selecting CPU, GPU, NPU, or APU targets.
A boundary marked `unified_memory: true` is a signal that APU scheduling may be beneficial.

---

## Relationship to Hardware As Capabilities

Governed memory boundaries help the Hardware Planner:

```text
read_only boundary + multiple readers -> APU zero-copy safe to schedule
mutable boundary + single writer + GPU writer -> GPU-exclusive execution required
sensitivity: regulated + shared GPU -> governance may reject GPU access
sensitivity: public + read_only + NPU -> NPU access approved
```

The boundary declaration feeds directly into hardware placement decisions.
See [Hardware as Governed Capabilities](galerina-hardware-as-capabilities.md).

---

## Runtime Reports

After execution, the runtime produces a memory boundary report:

```json
{
  "boundary": "PatientAnalytics",
  "strategy": "shared_memory",
  "target": "apu_unified",
  "copies_made": 0,
  "readers": ["cpu", "npu"],
  "writers": [],
  "mutation": "none",
  "governance_passed": true,
  "sensitivity_enforced": "regulated",
  "lifetime": "request_scoped",
  "execution_hash": "sha256:d4e5..."
}
```

---

## Audit Proof

The attestation record for boundary execution:

```json
{
  "boundary_name": "PatientAnalytics",
  "boundary_hash": "sha256:c3d4...",
  "access_pattern": "read_only_shared",
  "mutation_proof": "no_write_access_declared_or_executed",
  "target": "apu_unified",
  "zero_copy": true,
  "governance_passed": true,
  "sensitivity": "regulated",
  "policy_version": "3.1"
}
```

An external auditor can verify:

```text
what memory regions existed
who accessed them and how
whether mutations occurred and by whom
whether the execution matched the declaration
whether governance approved the access pattern
```

---

## Stage B Scope

Stage B implements:

```text
logical boundary declarations in source code
ownership and access metadata in the compiler
boundary-aware scheduling in Passive Execution Plans
runtime boundary reporting
governance enforcement on boundary access
```

Stage B does not implement:

```text
arena allocation (comes with native/WASM targets)
physical APU memory layout optimisation
hardware cache coherency management
vendor-specific APU driver integration
```

The logical boundary system is complete and correct in Stage B.
Physical optimisation layers are added as target emitters mature.

---

## Long-Term Vision

Today's typical execution:

```text
CPU allocates
CPU copies to GPU
GPU processes
GPU copies back to CPU
CPU reads result
Two copies, two allocations, synchronisation overhead
```

Galerina long-term execution on APU hardware:

```text
CPU allocates once in unified space
GPU reads directly
GPU writes result in unified space
CPU reads result directly
Zero copies, one allocation, compiler-proven ordering
```

This is not a performance trick. It is the consequence of correct ownership declarations,
compiler-proven access patterns, and runtime-enforced scheduling — all governed, all auditable.

---

## Final Principle

```text
Who owns this memory?
Who may read?
Who may modify?
When may ownership change?

Compiler proves.
Plan describes.
Runtime enforces.
Report records.
Proof verifies.
```

---

## Rules at a Glance

- Boundary declarations MUST specify owner, readers, writers, and mutation policy
- Compiler MUST reject programs where access patterns violate boundary declarations
- Zero-copy access MUST be a compiler-derived consequence, not a developer hint
- Memory access MUST be declared as effects and proved before execution
- Governance policy MUST constrain which units may access sensitive boundaries
- Runtime MUST report boundary strategy, copies made, and governance outcome
- Audit proof MUST include boundary hash, access pattern, and mutation proof
- Locks and barriers MUST NOT appear in application business logic

---

## See Also

- [Hardware as Governed Capabilities](galerina-hardware-as-capabilities.md)
- [Separate Logical Planning From Target Emission](galerina-logical-planning-target-emission.md)
- [AI and Linear Algebra Accelerator Support](ai-linear-algebra-accelerator-support.md)
- [Passive Execution Plans](galerina-passive-execution-plans.md)
- [Static Capability Proofs](galerina-static-capability-proofs.md)
- [Runtime Reports](galerina-passive-execution-plans.md#runtime-reports)
- [Effects System](galerina-effect-checker-architecture.md)
