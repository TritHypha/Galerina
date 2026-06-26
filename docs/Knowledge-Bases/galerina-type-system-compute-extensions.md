# Galerina — Type System Extensions for Heterogeneous Compute

## Overview

Galerina's current type system is insufficient for heterogeneous compute, AI-native execution
and accelerator interoperability. Three categories of foundational types are missing:

1. **Complete numeric tower** — Float16, BFloat16, Int8/16/32/64, UInt8/16/32/64
2. **First-class Tensor type** — shape-typed, compile-time validated
3. **SIMD/vector lane types** — Vec4, Vec8, warp/wavefront operations

These are not optional enhancements. They are foundational systems-level requirements
for GPU execution, ML inference, SIMD kernels and tensor compilation.

---

## Part 1: Complete Numeric Tower

### Missing Types (CRITICAL)

```text
Float16
BFloat16

Int8     UInt8
Int16    UInt16
Int32    UInt32
Int64    UInt64
```

### Why They Matter

Modern AI and heterogeneous compute workloads operate almost entirely on:

```text
Float16   — tensor cores, GPU inference, mixed-precision AI
BFloat16  — TPUs, large-scale training, transformer inference
Int8      — quantized inference, SIMD pipelines, low-latency edge AI
UInt8     — byte-level data pipelines, image tensors
```

Without them:
- Galerina cannot represent modern compute workloads accurately
- Memory optimization is impossible
- Accelerator compatibility breaks
- Quantized models cannot compile safely

### Syntax

```galerina
let weight: Float16 = 0.5h
let bias: BFloat16 = 0.1bf
let token: UInt8 = 255u8
let index: Int32 = 42i32
let embedding: Int64 = 768i64
```

### Required AST Additions

```text
Float16Type    BFloat16Type
Int8Type       UInt8Type
Int16Type      UInt16Type
Int32Type      UInt32Type
Int64Type      UInt64Type
```

---

## Part 2: First-Class Tensor Type

### Problem (CRITICAL)

Without tensor types, shape mismatches fail at runtime instead of compile time:

```text
matmul(a, b)  →  runtime panic on shape mismatch
```

With tensor types:

```text
COMPILE ERROR: Tensor shapes incompatible for matmul
  a: Tensor<Float32, [batch, 512]>
  b: Tensor<Float32, [768, hidden]>
  dimension 512 ≠ 768
```

### Syntax

```galerina
// Basic tensor
let weights: Tensor<Float32, [1024, 768]>

// Semantic shapes
let activations: Tensor<Float16, [batch, seq, hidden]>

// GPU-placed
let gpuTensor: Tensor<Float16, [batch, hidden]> placement gpu

// Quantized
let quantized: Tensor<Int8, [batch, hidden]>
```

### Compiler Responsibilities

```text
validate tensor shapes at call sites
enforce broadcasting rules
optimize memory layouts
infer tensor compatibility
lower tensors into accelerator-native IR
```

### Required AST Additions

```text
TensorType
TensorShape
TensorDimension          (fixed integer or symbolic dimension name)
TensorExpression
TensorOperation
```

---

## Part 3: SIMD / Vector Lane Types

### Problem (IMPORTANT)

GPU and SIMD architectures operate using:

```text
NVIDIA warps (32 lanes)
AMD wavefronts (64 lanes)
AVX vectors
NEON SIMD
WASM SIMD
```

Without vector types, the compiler cannot:
- reason about parallel lanes
- identify vectorization opportunities
- optimize memory coalescing
- emit correct warp-level synchronization

### Syntax

```galerina
// Vector types
let v4: Vec4<Float32>
let v8: Vec8<Int16>
let v16: Vec16<UInt8>

// Lane operations
shuffle lanes(v4, mask: [3, 2, 1, 0])

// Masked operations
masked load (v8, mask: activeMask)
masked store (v8, mask: activeMask)

// Warp-level compute
let sum = warp_reduce(v4, op: add)
let total = wavefront_sum(v8)
```

### Required AST Additions

```text
VectorType
SIMDExpression
LaneOperation
MaskedLoad
MaskedStore
WarpOperation
WavefrontOperation
```

### Compiler Responsibilities

```text
infer vectorization opportunities
lower vector operations to accelerator instructions
optimize lane utilization
support SIMD-aware scheduling
enable memory coalescing
```

---

## Priority Order

| Priority | Capability | Consequence If Missing |
|---|---|---|
| CRITICAL | Complete numeric tower | No quantized AI or accelerator compatibility |
| CRITICAL | First-class tensor type | Runtime shape failures instead of compiler guarantees |
| IMPORTANT | SIMD/vector lane types | No structural GPU/vector optimization |

### Immediate (Phase 4/5)

1. Complete numeric tower — all integer and floating-point sizes
2. First-class tensor type — `Tensor<Type, Shape>`
3. Tensor shape validation at call sites

### Next Phase (Phase 5/6)

4. SIMD/vector lane types — `Vec4<T>`, `Vec8<T>`
5. Warp/wavefront operations
6. Vector-aware optimizer passes

---

## Architecture Placement

| Layer | Responsibility |
|---|---|
| `galerina-core` | Type definitions: numeric tower, `Tensor<T,S>`, `Vec<N,T>` |
| `galerina-core-compiler` | Shape validation, tensor type checking, SIMD legality |
| `galerina-core-compute` | Accelerator-aware type lowering |
| `galerina-target-gpu` | GPU tensor/vector IR and kernel lowering |
| `galerina-target-wasm` | WASM SIMD lowering |
| `galerina-core-reports` | Tensor shape report, SIMD utilization report |
