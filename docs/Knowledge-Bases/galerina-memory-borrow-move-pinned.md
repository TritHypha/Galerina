# Galerina — Borrow, Move and Pinned Memory Semantics

> **⚠️ NON-GOAL / DESIGN-ONLY (0034 verdict, 2026-06-18).** The full Rust-style borrow checker described
> below is **not** Galerina's memory-safety model and is **not enforced**: `SPORE-MEMORY-001..008` are declared
> but never emitted, and the `borrow`/`borrow mut` examples here parse/compile clean but are unenforced (corrected #65). Galerina's actual, shipped
> safety spine is **"Governed Capability + Ternary-Tagged Memory"** — value-state/taint + effect/capability
> passes, plus the runtime ternary tombstoning + per-allocation **generation tags** (use-after-free guard,
> shipped `692e62d`). See **`galerina-memory-safety-model.md`** for the canonical model. This document is kept
> for reference on the *heterogeneous-domain transfer* problem (GPU VRAM / WASM linear memory / edge), which
> the capability model addresses differently. ~~The one live sliver worth building is `move` + `USE_AFTER_MOVE` linearity~~ — **superseded by #65:** `USE_AFTER_MOVE` (SPORE-MEMORY-001) is honest-retired as RESERVED (value-semantics → non-class); the consume-once guarantee already ships as `SPORE-AFFINE-001`. Everything here is non-goal.

## Overview

Heterogeneous compute introduces multiple memory domains:

```text
CPU memory          GPU VRAM
shared memory       edge device memory
distributed memory  WASM linear memory
```

Data movement between these domains is expensive and error-prone. Galerina requires
explicit ownership and memory-transfer semantics to make GPU planning safe, enable
zero-copy execution, and support deterministic scheduling.

Without borrow/move/pinned semantics, the memory model exists only as design documentation.
The parser and compiler must enforce it.

---

## Three Ownership Primitives

### Borrow

Temporary access without ownership transfer:

```galerina
borrow tensor -> gpu_kernel()
borrow mut tensor -> transform()
```

Properties:
```text
no ownership transfer
read-only or scoped mutable access
avoids unnecessary copies
compiler-enforced lifetime safety
```

### Move

Explicit ownership transfer — source becomes invalid:

```galerina
move tensor -> gpu_memory
```

Properties:
```text
source is no longer accessible after move
enables deterministic resource ownership
avoids double-frees
improves runtime planning
```

### Pinned Memory

Memory regions locked for high-performance DMA transfer:

```galerina
pinned Tensor<Float16, [1024, 1024]>
pinned buffer<Float16>(1024)
```

Properties:
```text
optimized DMA transfer
reduced transfer latency
zero-copy interoperability
accelerator-friendly allocation
```

---

## Ownership States

Every value has an explicit ownership state tracked by the compiler:

| State | Description |
|---|---|
| `owned` | Normal owned value on its own lifetime |
| `borrowed` | Temporary access; original owner retains ownership |
| `borrowed mut` | Exclusive mutable access for a scope |
| `moved` | Ownership transferred; source invalid |
| `pinned` | Locked in memory for device transfer |
| `shared` | Explicitly shared runtime-managed value |

---

## Zero-Copy Execution

```galerina
borrow pinned tensor -> inference_engine
```

Zero-copy allows compute targets to operate directly on shared/pinned memory:

```text
no allocation copy
accelerator reads from pinned CPU memory
or both operate on shared device memory
```

---

## Compiler Enforcement

### Track Ownership Through Control Flow

```galerina
move tensor -> gpu

tensor.read()     // COMPILE ERROR: tensor was moved
```

```text
ERROR: SPORE-OWN-001: moved value used after move
  `tensor` moved here: move tensor -> gpu
  `tensor` used again here: tensor.read()
```

### Prevent Borrow/Move Conflicts

```galerina
let ref = borrow tensor
move tensor -> gpu   // COMPILE ERROR: cannot move while borrowed
```

### Validate Lifetimes

```galerina
let result = {
  borrow tensor -> inference()
  // borrow expires at end of block
}
// tensor is owned again here
```

---

## Placement-Aware Ownership

Ownership interacts with compute placement:

```galerina
move tensor -> placement gpu   // owned by GPU
```

Transfer policies:

```galerina
transfer async tensor -> gpu
transfer zero_copy tensor -> inference_engine
```

---

## AST Node Vocabulary (committed in Phase 3)

The following node kinds are added to `AstNodeKind` in `galerina-core/src/index.ts`.
Phase 4 parses into this vocabulary; Phase 5 uses it for lifetime analysis.

| AstNodeKind | Syntax form | Meaning |
|---|---|---|
| `borrowExpr` | `borrow x` | Immutable temporary access; no ownership transfer |
| `borrowMutExpr` | `borrow mut x` | Exclusive mutable access within a scope |
| `moveExpr` | `move x` | Explicit ownership transfer; source invalidated |
| `pinnedDecl` | `pinned x` | Memory locked for DMA / accelerator transfer |
| `ownershipTransfer` | `x -> y` | Ownership transfer to a named target |
| `configMemoryBlock` | `memory { ... }` (manifest) | Project/runtime memory config (boot.spore) |
| `borrowScopeBlock` | `memory { ... }` (code) | Code-level ownership/borrow scope block |

> **Phase boundary:** `borrowExpr`, `borrowMutExpr`, `moveExpr`, `pinnedDecl`,
> and `ownershipTransfer` are declared in Phase 3 to give the parser its target
> vocabulary. Parser production rules for these nodes are implemented in Phase 4.
> Full lifetime/borrow analysis is implemented in Phase 5.

---

## Compiler Analysis Passes

```text
lifetime analysis        — determine live ranges for each owned value
ownership propagation    — track ownership state through all control paths
move validation          — ensure moved values are not used afterward
borrow checking          — ensure borrows do not outlive owners
pinned memory planning   — identify pinnable allocations
transfer optimization    — minimize copies; batch transfers; colocate compute
```

---

## Multi-Target Ownership

| Target | Requirement |
|---|---|
| GPU | Pinned buffers, transfer scheduling, ownership tracking |
| WASM | Explicit linear memory safety, transfer-aware compilation |
| Edge devices | Constrained memory planning, deterministic allocation |
| Distributed | Explicit ownership boundaries, transfer-safe serialization |

---

## Future Extensions

```galerina
// Shared memory regions
shared tensor

// Placement-aware move
move tensor -> placement gpu

// Async transfer
transfer async tensor -> gpu_memory

// Remote borrow across nodes
remote borrow tensor from node "worker-2"
```

---

## Diagnostics

The canonical memory-checker diagnostic series is `SPORE-MEMORY-*`, defined in
`galerina-core-compiler/src/index.ts`. The former `SPORE-OWN-*` codes are retired;
the mapping below shows their equivalents.

| Code | Name | Meaning | Former alias |
|---|---|---|---|
| `SPORE-MEMORY-001` | `USE_AFTER_MOVE` | Moved value used after ownership transferred | `SPORE-OWN-001` |
| `SPORE-MEMORY-002` | `BORROW_AFTER_MOVE` | Cannot borrow a value after ownership has moved | `SPORE-OWN-002` |
| `SPORE-MEMORY-003` | `BORROW_ESCAPES_SCOPE` | Borrowed reference cannot outlive its owner | `SPORE-OWN-003` |
| `SPORE-MEMORY-004` | `READONLY_MUTATION` | Cannot mutate a value through a readonly reference | — |
| `SPORE-MEMORY-005` | `MUTABLE_ALIAS` | A mutable borrow cannot coexist with another active borrow | — |
| `SPORE-MEMORY-006` | `BOUNDS_VIOLATION` | Index may be outside collection bounds | — |
| `SPORE-MEMORY-007` | `UNCHECKED_ACCESS_OUTSIDE_UNSAFE` | Unchecked access must be inside an approved unsafe block | `SPORE-OWN-004` |
| `SPORE-MEMORY-008` | `UNSAFE_MEMORY_REQUIRES_FALLBACK` | Unsafe memory operation must declare a safe fallback | — |

> **Note:** `SPORE-OWN-005` (shared value synchronization) and `SPORE-OWN-006`
> (transfer requires ownership) are post-v1 diagnostics covering `shared` and
> `transfer` keywords. They will be added to the `SPORE-MEMORY-*` series when
> those keywords are activated.

---

## Architecture Placement

| Layer | Responsibility |
|---|---|
| `galerina-core` | Ownership primitives: `borrow`, `move`, `pinned`; ownership state model |
| `galerina-core-compiler` | Lifetime analysis, borrow checking, move validation, transfer optimization |
| `galerina-core-runtime` | Pinned memory allocator, transfer scheduling, DMA integration |
| `galerina-core-compute` | Target-aware placement hints, zero-copy path planning |
| `galerina-target-gpu` | GPU-specific pinned memory and transfer ABI |
| `galerina-core-reports` | Ownership/transfer report: moves, borrows, pinned regions |
