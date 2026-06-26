# Galerina — Cache-Aware Execution

## Status

```
Phase 21+ — Architecture Opportunity
Foundation: Tensor<T,Shape> types, Passive Execution Plans, Governed Memory Boundaries
Highest ROI: TypedArray lowering, shape-specialised kernels, kernel fusion, tensor tiling, SIMD backend
Key principle: "Cache-Aware by Design, not Cache-Aware by Accident"
```

## TL;DR

- Galerina is unusually well-positioned for cache-aware execution because tensor shapes, effects, and memory boundaries are known at compile time
- The compiler should never expose caches to developers — it should use that information internally
- Five highest-ROI optimisations: TypedArray lowering, shape-specialised kernels, kernel fusion, cache-aware tensor tiling, SIMD/WASM backend

---

## The Cache Hierarchy

```
CPU Core
  ↓
L1 Cache    (~32KB–128KB)     Fastest — single-core, lowest latency
  ↓
L2 Cache    (~256KB–2MB)
  ↓
L3 Cache    (~8MB–128MB+)     Shared across cores
  ↓
RAM                            Much slower — cache miss = 100-300 cycle penalty
```

Performance often depends more on **cache hits** than raw CPU speed. One cache miss to RAM can cost as much as 200+ arithmetic operations.

---

## Why Galerina Is Unusually Positioned

Most languages discover optimisation opportunities at **runtime** (JIT, profiling).
Galerina knows them **earlier** because it has:

```
Tensor<Float32, [768]>      → shape known at compile time → 3072 bytes → fits in L1
contract { effects {} }     → pure computation → no side-effectful interruptions in loop
boundary { readonly } blocks → no cache invalidation from writes
Passive Execution Plans     → operation ordering can be chosen for locality
```

Result: **Cache-Aware by Design**, not Cache-Aware by Accident.

---

## Opportunity 1: Cache-Aware Tensor Blocking (Tiling)

**Problem:** A `Tensor<Float32, [1000000]>` processed in one huge pass causes constant cache misses and RAM traffic.

**Solution:** Compiler generates tiled execution:

```yaml
execution:
  strategy: tiled
  tile_size: 4096    # fits in L2 cache
```

Each tile (4096 floats × 4 bytes = 16KB) fits in L1 or L2.
The outer loop over tiles generates temporal locality.

This is how BLAS, TensorRT, and high-performance matrix libraries achieve near-hardware performance.

---

## Opportunity 2: Shape-Aware Loop Generation

```galerina
Tensor<Float32, [768]>
```

Compiler knows: 768 × 4 bytes = **3072 bytes** → fits comfortably in L1 cache.

```galerina
Tensor.dot(a, b)  // a, b: Tensor<Float32, [768]>
```

Emits:

```js
function dot_768(a, b) {  // specialised — no dimension check, fixed loop bound
  let sum = 0.0;
  for (let i = 0; i < 768; i++) sum += a[i] * b[i];
  return sum;
}
```

Instead of `generic_dot(a, b, length)` which checks length every call and has unpredictable loop bounds for branch prediction.

---

## Opportunity 3: Passive Execution Plan Scheduling for Locality

Unordered operations may cause: **Load tensor → Evict → Reload → Evict → Reload**.

A Passive Execution Plan can reorder for locality:

```yaml
steps:
  - load: embedding        # load once, stays in L2/L3
  - op: scale_embedding
  - op: add_bias
  - op: apply_relu
  - release: embedding     # evict only after all ops complete
```

Instead of reloading `embedding` for each operation. Matches how GPU kernel fusion works.

---

## Opportunity 4: Arena-Based Locality

Future governed memory arenas can place related tensors **contiguously in memory**:

```galerina
boundary InferenceArena {
  readonly input:     Tensor<Float32, [1, 768]>
  readonly weights:   Tensor<Float32, [768, 512]>
  readonly bias:      Tensor<Float32, [512]>
}
```

All three tensors allocated together → same cache lines → CPU prefetcher can load them together.
Scattered allocation (heap allocation per tensor) means each access may be a cache miss.

---

## Opportunity 5: Structure of Arrays (SoA)

**Array of Structures (bad for SIMD):**

```galerina
record Vector3 { x: Float32, y: Float32, z: Float32 }
Array<Vector3>   // memory: XYZXYZXYZXYZ
```

**Structure of Arrays (good for SIMD):**

```text
x: [XXXX...]   // all X values contiguous
y: [YYYY...]   // all Y values contiguous
z: [ZZZZ...]   // all Z values contiguous
```

With SoA, one SIMD register loads 4 X values simultaneously.
With AoS, a SIMD register loads X1, Y1, Z1, and padding — wasting 75% of register capacity.

The compiler can transparently transform `Array<Vector3>` into SoA layout when it detects AI/physics/graphics workloads.

---

## Opportunity 6: Read-Only Boundary Optimisation

```galerina
boundary Embeddings {
  readonly vectors: Array<Tensor<Float32, [768]>>
}
```

The compiler knows: **no writes, no cache invalidation, no synchronisation needed**.

Runtime can aggressively cache and prefetch. Cache coherency overhead (significant on multi-core) is eliminated for read-only regions.

---

## Opportunity 7: Cache Affinity Hints (Internal to Planner)

```yaml
memory:
  affinity:
    l1: high     # hot inner-loop tensor → prefer L1
    l2: high     # working set fits in L2
    l3: medium   # model weights in L3
```

Not developer-facing. Used by CPU/WASM/GPU planners for data placement decisions.
The developer writes `Tensor<Float32, [768]>` and the planner deduces L1-affinity from the 3KB size.

---

## Opportunity 8: Hot Loop Isolation (Highest Immediate ROI)

**Bad — effects break cache-friendly optimisation:**

```galerina
for each vector {
  database.read(...)  // cache-busting, capability call
  math(...)
}
```

**Good — separate governed I/O from pure computation:**

```galerina
let data = Database.loadAll()?    // governed I/O once

pure flow processVectors(data) -> Result  // no effects, no capability calls
```

The compiler sees `pure flow` → generates a tight, cache-friendly kernel.
This aligns directly with **Static Capability Proofs**: pure code = no interruptions from governance checks inside the hot path.

---

## Opportunity 9: Automatic SIMD Generation (Phase 22+)

```galerina
Tensor.dot(a, b)  // a, b: Tensor<Float32, [1024]>
```

Could lower to, depending on target:

| Target | SIMD width | Elements/instruction |
|---|---|---|
| Scalar JS | 1 | 1 |
| WASM SIMD (v128) | 128-bit | 4 × Float32 |
| AVX2 | 256-bit | 8 × Float32 |
| AVX-512 | 512-bit | 16 × Float32 |
| ARM NEON | 128-bit | 4 × Float32 |

The source stays `Tensor.dot(a, b)`. Target selection is a passive execution plan concern.

---

## Implementation Priority (Highest ROI First)

| Priority | Optimisation | Phase | Expected gain |
|---|---|---|---|
| 1 | TypedArray lowering (`Float32Array`) | 21A | 2-5× for numeric |
| 2 | Shape-specialised kernels (`dot_768`) | 21B | 1.5-3× for fixed-shape |
| 3 | Kernel fusion (no intermediate allocation) | 21C | 1.5-2× for chained ops |
| 4 | Cache-aware tensor tiling | 21D | 2-10× for large tensors |
| 5 | WASM SIMD backend | 22 | 4× for float32 (4 elements/instruction) |

These five alone would deliver far more real-world performance than exotic approaches while fitting naturally into Galerina's governance architecture.

---

## What Galerina Does NOT Do

- Does NOT expose cache levels to developers (`cache.l1.allocate()` — not a concept)
- Does NOT require developers to know cache line sizes
- Does NOT break the governance model for performance
- Does NOT claim to outperform hand-tuned C++/CUDA

**The correct claim:**
> Galerina can optimise for cache locality automatically because typed tensor shapes, pure-flow isolation, and governed memory boundaries are known at compile time. The compiler exploits this information without requiring developers to reason about hardware caches.

---

## Relationship to Existing Galerina Concepts

| Galerina Concept | Cache Opportunity |
|---|---|
| `Tensor<Float32, [N]>` | Shape-aware loop generation, L1-fit detection |
| `pure flow` | Hot loop isolation, no capability interruptions |
| `boundary { readonly }` | Aggressive caching, no invalidation overhead |
| Passive Execution Plans | Operation scheduling for locality |
| Governed Memory Boundaries | Arena allocation, contiguous tensor placement |
| `contract.targets { prefer [wasm] }` | SIMD backend selection |

---

## See Also

- `galerina-tensor-numeric-performance.md` — TypedArray lowering, kernel fusion, shape specialisation
- `galerina-ai-memory-efficiency.md` — tensor arenas, activation lifetime, quantisation
- `galerina-hardware-as-capabilities.md` — compute target selection
- `galerina-passive-execution-plans.md` — operation scheduling foundation
- `galerina-governed-apu-memory.md` — contiguous tensor allocation on APUs
