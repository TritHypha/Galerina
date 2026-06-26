# Galerina — Tensor and Numeric Performance Architecture

## Status

```
Phase 21+ — Performance lowering roadmap
Foundation: Tensor<T, Shape> types (implemented), pure flow qualification (implemented)
TypedArray lowering, kernel fusion, WASM backend: Phase 21+
Key principle: governance outside the hot loop, typed numeric payload inside
```

## TL;DR

- Galerina can be **significantly faster for math/AI workloads** by emitting predictable, typed, low-allocation code
- V8 optimises heavily when: object shapes are stable, array element kinds are fixed, TypedArrays are used for numeric data
- `Tensor<Float32, [N]>` → `Float32Array` — fixed-layout, monomorphic, V8-optimisable
- **Claim scope**: "Near-native for math/AI workloads via typed numeric lowering" — NOT "near-native for all programs"

---

## The Core Principle

```text
Governance outside the hot loop.
Typed numeric payload inside the hot loop.
Runtime proof around the execution.
```

Security checks happen BEFORE the numeric loop. The tight inner loop has:
- No capabilityHost calls
- No dynamic dispatch
- No object allocation per element
- No protected-value metadata checks

---

## TypedArray Lowering

`Tensor<Float32, [768]>` lowers to `Float32Array` of length 768.

### Source
```galerina
pure flow dotProduct(
  a: Tensor<Float32, [768]>,
  b: Tensor<Float32, [768]>
) -> Float32 {
  return Tensor.dot(a, b)
}
```

### Emitted (Phase 21 target)
```js
function dotProduct(a, b) {
  // a: Float32Array, b: Float32Array — stable types, V8 optimises
  let sum = 0.0;
  for (let i = 0; i < 768; i++) {
    sum += a[i] * b[i];
  }
  return sum;
}
```

V8 TypedArrays are specifically designed for fixed-layout binary numeric data.
Accessing `Float32Array[i]` is a direct memory load, no boxing, no property lookup.

---

## GovernedValue Separates Payload from Metadata

For protected tensors, do NOT store governance metadata on every element:

```galerina
let embedding: protected Tensor<Float32, [768]> =
  validate.embedding(rawEmbedding)?
```

**Wrong**: wrap every float in a governance object.

**Correct**:
```typescript
GovernedValue {
  state: "protected"
  type: "Tensor<Float32, [768]>"
  payload: Float32Array   // ← the actual numeric data, compact
}
```

Security metadata is stored **once on the wrapper**, not per-element.
The inner loop sees only the `Float32Array` payload.

---

## Pure-Flow Hot Loop Emission

A pure flow with no effects can emit clean numeric code:

```galerina
pure flow normalize(values: Tensor<Float32, [N]>) -> Tensor<Float32, [N]> {
  ...
}
```

The compiler knows: no capabilityHost calls, no audit writes, no network, no DB.
Therefore the emitted loop can be:

```js
function normalize(values) {
  const out = new Float32Array(values.length);
  let sum = 0.0;
  for (let i = 0; i < values.length; i++) sum += values[i] * values[i];
  const norm = Math.sqrt(sum);
  for (let i = 0; i < values.length; i++) out[i] = values[i] / norm;
  return out;
}
```

No capability checks, no governance overhead inside the loop.
Security was verified at the boundary (validate.embedding) before this flow ran.

---

## Shape-Specialised Functions

For fixed shapes, generate specialised rather than generic:

```text
matmul_4x4(a, b)       // specialised for 4×4 matrices
dot_768(a, b)          // specialised for 768-dim vectors
normalize_1536(v)      // specialised for 1536-dim embeddings
```

Instead of one generic `matmul(a, b, rows, cols, inner)` that re-checks shape every call.

Shape is known at compile time from `Tensor<Float32, [4, 4]>`. No runtime dimension checks needed.

---

## Kernel Fusion

Instead of three separate loops with intermediate allocations:

```galerina
let a = Tensor.scale(x, 0.5)
let b = Tensor.add(a, bias)
let c = Tensor.relu(b)
```

Emit one fused loop:

```js
for (let i = 0; i < n; i++) {
  out[i] = Math.max(0, x[i] * 0.5 + bias[i]);
}
```

Eliminates: 2 intermediate `Float32Array` allocations, 2 extra passes through memory.
For large tensors, memory bandwidth is the bottleneck — fusion halves it.

---

## TensorScratchPool (Stage B on V8)

For Stage B (Node.js/V8), avoid full native arenas but use reusable scratch buffers:

```typescript
class TensorScratchPool {
  getFloat32(length: number): Float32Array  // returns reusable buffer
  release(buffer: Float32Array): void        // returns to pool
}
```

The same `Float32Array` is reused across forward passes instead of re-allocating.
Later, WASM/native targets implement true arenas.

---

## WASM Numeric Backend (Phase 21)

For heavier math, split:

```text
JS wrapper → handles governance and capability boundaries
WASM kernel → handles tight numeric loops with SIMD
```

```typescript
// JS (governance layer)
async function matmul(a: GovernedValue, b: GovernedValue): GovernedValue {
  capabilityHost.check("ai.inference");  // governance check once
  const result = wasmKernel.matmul(a.payload, b.payload, ...);  // WASM SIMD
  return { state: "protected", payload: result };
}
```

WebAssembly 2.0 SIMD processes 128 bits per instruction.
For float32: 4 elements simultaneously per SIMD lane.

---

## Target-Aware Lowering

```galerina
contract {
  targets {
    prefer [npu, gpu, wasm, cpu]
    fallback cpu
  }
}
```

The same Galerina flow lowers to different targets:

| Target | Lowering |
|---|---|
| CPU JS | `Float32Array` loop |
| WASM | SIMD kernel |
| GPU | WebGPU/CUDA kernel |
| NPU | inference graph |

Source code is unchanged. The governance contract is identical. Only the execution target changes.

---

## Implementation Roadmap

```
Phase 21A: TypedArray lowering
  Tensor<Float32, [N]> → Float32Array in emitted JS
  GovernedValue separates payload from metadata
  Pure-flow hot loop emission (no capabilityHost inside loop)

Phase 21B: Shape specialisation
  Fixed-shape Tensor types → specialised emitted functions
  Bounds checks removed when shape is statically known

Phase 21C: Kernel fusion
  Consecutive element-wise ops → fused single-pass loop
  Intermediate allocation elimination

Phase 21D: TensorScratchPool
  Reusable Float32Array pool for temporary tensors
  Arena-style release on flow completion

Phase 22: WASM SIMD backend
  JS wrapper + WASM numeric kernel split
  128-bit SIMD for float32 (4 elements per instruction)

Phase 23: GPU/NPU lowering
  WebGPU compute shaders
  NPU inference graph export
```

---

## What Can Be Claimed

**Safe claim:**
> Galerina can make AI/ML and math workloads faster by proving safety and governance before execution, then emitting compact typed numeric plans that avoid unnecessary allocation, dynamic dispatch, and repeated runtime checks.

**Not claimed:**
- Near-native performance for all programs (not true for general JS)
- Matching hand-optimised CUDA (not the goal)
- Better than PyTorch on GPU (different target)

**The actual differentiator:**
> Governance is verified once, before execution. The hot path has no overhead from safety checks, protected-value wrappers, or capability validation.

---

## See Also

- `galerina-ai-memory-efficiency.md` — memory planning for AI workloads
- `galerina-hardware-as-capabilities.md` — target selection (GPU/NPU/WASM)
- `galerina-passive-execution-plans.md` — plan-based execution enabling these optimisations
- `galerina-governed-memory-blocks.md` — GovernedValue and arena memory
- `galerina-logical-planning-target-emission.md` — separating understanding from execution
