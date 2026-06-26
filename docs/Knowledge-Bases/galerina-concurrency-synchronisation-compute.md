# Galerina — Concurrency and Synchronisation for Heterogeneous Compute

## Overview

Galerina's existing concurrency model (`parallelBlock`, `workerDecl`, `channelDecl`,
`async/await`) is primarily CPU-oriented. Three critical categories are missing for
heterogeneous compute and GPU execution safety:

1. **Atomic operations** — thread-safe memory coordination for GPU/SIMD
2. **Barriers and memory fences** — synchronisation points and memory visibility
3. **Multi-stream GPU execution** — overlapping compute + transfer for throughput

These are not optional enhancements. Without them, GPU correctness cannot be guaranteed
and accelerator throughput cannot be achieved.

---

## Gap 1: No Atomic Operations (CRITICAL)

### Problem

GPU and SIMD compute depend heavily on atomics for:

```text
histograms
reductions
lock-free queues
sparse tensor updates
parallel graph traversal
concurrent memory coordination
```

Without atomic operations, two threads updating the same memory location produce
undefined behavior regardless of the type system.

### Desired Syntax

```galerina
atomicAdd(histogram[bucket], 1)
atomicAdd(counter, 1)
compareAndSwap(lock, expected: 0, value: 1)
fetchAndOr(flags, mask)
atomicMin(minBuffer[idx], value)
atomicExchange(register, newValue)
```

### Required AST Additions

```text
AtomicOperation
AtomicAdd
CompareAndSwap
FetchAndOr
FetchAndAdd
AtomicMin
AtomicMax
AtomicExchange
```

### Compiler Responsibilities

```text
validate atomic-safe memory regions
optimize accelerator lowering
infer synchronisation requirements
prevent invalid concurrent access
```

---

## Gap 2: No Explicit Barriers or Memory Fences (CRITICAL)

### Problem

GPU thread blocks operate on shared memory using cooperative computation, staged
reductions and tiled matrix multiplication. Without explicit synchronisation:

```text
memory writes may not be visible to other threads
execution order becomes nondeterministic
race conditions occur silently
```

There is no equivalent to `CUDA __syncthreads()`, Vulkan barriers or memory fences.

### Desired Syntax

```galerina
barrier()           // full thread-group barrier
memoryFence()       // ensure memory visibility
sync threads        // thread-group synchronisation

// Scoped shared memory access
shared {
    buffer[i] = value
    barrier()
    result = buffer[(i + 1) % N]
}
```

### Required AST Additions

```text
BarrierExpression
MemoryFence
ThreadSync
SharedMemoryBarrier
```

### Type System Implications

The type system should understand:
- shared memory regions
- synchronisation domains
- visibility guarantees
- thread ownership boundaries

Without synchronisation-aware typing, concurrency bugs remain runtime-only failures.

---

## Gap 3: Multi-Stream GPU Execution Not Modelled (IMPORTANT)

### Problem

Modern GPUs execute work concurrently across multiple streams. Real GPU throughput
comes from overlapping compute and data transfer:

```text
compute kernel running while data transfers occur
multiple inference kernels executing simultaneously
asynchronous tensor streaming
pipelined accelerator scheduling
```

Galerina currently assumes one compute target and one sequential scheduling path.

### Desired Syntax

```galerina
// Declare streams
stream computeStream
stream transferStream

// Launch and transfer concurrently
launch kernel on computeStream
transfer tensor on transferStream

// Synchronise
await computeStream
await transferStream

// Concurrent inference pipelines
stream inference_a
stream inference_b

launch FraudModel(batchA) on inference_a
launch FraudModel(batchB) on inference_b
await [inference_a, inference_b]
```

### Required AST Additions

```text
GPUStream
StreamLaunch
StreamTransfer
StreamAwait
ConcurrentKernel
```

### Runtime Responsibilities

```text
schedule concurrent kernels
overlap compute + transfer
optimise stream utilisation
manage stream synchronisation
minimise idle accelerator time
```

### Future Extensions

```galerina
// Stream priorities
stream high_priority inference
stream low_priority background

// Async transfer policies
transfer async tensor -> gpu_buffer
transfer zero_copy pinned_tensor -> device

// Stream affinity
placement gpu:0 stream inference_primary
```

---

## GPU Concurrency Model Summary

| Primitive | Priority | Consequence If Missing |
|---|---|---|
| Atomic operations | CRITICAL | Unsafe concurrent GPU execution, corrupted reductions |
| Barriers + memory fences | CRITICAL | Undefined shared-memory behavior, silent race conditions |
| Multi-stream GPU execution | IMPORTANT | Poor accelerator throughput, underutilised hardware |

---

## Priority Order

### Immediate

1. Atomic operations (`atomicAdd`, `compareAndSwap`, `fetchAndOr`)
2. Barriers + memory fences (`barrier()`, `memoryFence()`, `sync threads`)
3. Synchronisation-aware compiler validation

### Next Phase

4. GPU stream model
5. Concurrent kernel scheduling
6. Overlap compute + transfer orchestration

---

## Relationship to Existing Concurrency

The existing `async/await`, `parallelBlock`, `workerDecl` and `channelDecl` model
covers CPU concurrency. GPU concurrency sits alongside it with distinct primitives:

```text
CPU concurrency:
  async/await      — task suspension and continuation
  parallelBlock    — parallel CPU task groups
  workerDecl       — worker pool threads
  channelDecl      — message-passing channels

GPU concurrency:
  atomic operations — lock-free coordination across warps
  barriers          — thread-group synchronisation
  streams           — concurrent compute + transfer queues
```

These are not replacements; they are complementary layers.

---

## Diagnostics

| Code | Meaning |
|---|---|
| `SPORE-GPU-SYNC-001` | Shared memory written without barrier before read |
| `SPORE-GPU-SYNC-002` | Atomic operation on non-atomic memory region |
| `SPORE-GPU-SYNC-003` | Stream awaited after stream was already completed |
| `SPORE-GPU-SYNC-004` | Concurrent kernels on same stream must be sequential |
| `SPORE-GPU-SYNC-005` | Memory fence required before cross-stream visibility |

---

## Architecture Placement

| Layer | Responsibility |
|---|---|
| `galerina-core` | Atomic type, barrier syntax, stream type definitions |
| `galerina-core-compiler` | Synchronisation analysis, race detection, stream ordering |
| `galerina-core-compute` | Stream scheduling model, concurrency planner |
| `galerina-target-gpu` | GPU-specific atomics, warp-level barriers, CUDA/Vulkan stream mapping |
| `galerina-core-runtime` | Stream lifecycle, synchronisation enforcement |
| `galerina-core-reports` | Stream utilisation report, synchronisation safety report |
