# Galerina — Tensor Arity Decision

## Status

```
Phase 7 prerequisite — resolved before 7A implementation begins
Decision: Tensor<T, Shape> is canonical. Bare Tensor is not valid source syntax.
```

---

## Decision

Galerina adopts:

```galerina
Tensor<T, Shape>
```

as the canonical tensor type form with **arity 2**.

Bare `Tensor` without type parameters is not valid source syntax.

```
Tensor<Float32, [1, 128]>   // valid
Tensor                       // invalid — SPORE-TYPE-009
Tensor<Float32>              // invalid — SPORE-TYPE-009 (expected 2 args)
```

---

## Canonical Syntax

### Fixed shape

```galerina
let embedding: Tensor<Float32, [1, 768]>
```

### Batch-polymorphic shape

```galerina
let batch: Tensor<Float32, [Batch, 768]>
```

### Dynamic shape (element type known, shape unknown)

```galerina
let output: Tensor<Float32, DynamicShape>
```

### Fully erased tensor (type and shape unknown)

```galerina
let handle: AnyTensor
```

### Quantized tensor

```galerina
let weights: Tensor<Int8, [OutFeatures, InFeatures]>
```

### Shape-polymorphic flow

```galerina
flow normalize<S>(input: Tensor<Float32, S>) -> Tensor<Float32, S>
```

---

## Why Not Bare `Tensor`

A bare tensor type hides two critical facts:

1. What is the element type?
2. What is the shape?

Those facts matter for:
- matrix/tensor operation validation
- shape compatibility checking
- model input/output contract verification
- accelerator lowering decisions
- safe memory layout planning
- operator compatibility
- runtime target planning

Pushing those checks to runtime instead of compile time is not aligned with
Galerina's governance-first design.

---

## Why Not Backend Parameters

Galerina does **not** include device, layout, or backend in the tensor type:

```galerina
// Wrong — backend details are not tensor type parameters
Tensor<T, Shape, Device>
Tensor<T, Shape, Layout>
Tensor<T, Shape, PhotonicMode>
```

Those are execution-planning concerns. They belong in `compute target` governance blocks:

```galerina
let signal: Tensor<Float32, [Batch, Features]>

compute target photonic {
  precision approximate
  calibration required
  fallback cpu
}
```

The tensor type describes the portable semantic value.
The compute policy describes where and how it may execute.

This separation keeps the type system stable as hardware evolves.

---

## `AnyTensor` — Erased Tensor Form

When both element type and shape are unknown, use `AnyTensor`:

```galerina
let handle: AnyTensor = dynamicLoad()
```

`AnyTensor` is a zero-arity built-in type. It does not accept type parameters.
It is the explicitly-erased form, not an alias for bare `Tensor`.

---

## Unknown Shape

When element type is known but shape is dynamic, use `DynamicShape`:

```galerina
let output: Tensor<Float32, DynamicShape>
```

When parts of the shape are symbolic (e.g. batch dimension):

```galerina
let input: Tensor<Float32, [Batch, 768]>
```

---

## Diagnostic Rules

| Source | Diagnostic |
|---|---|
| `Tensor` (bare, no args) | `SPORE-TYPE-009` — expects 2 type arguments |
| `Tensor<Float32>` (one arg) | `SPORE-TYPE-009` — expects 2 type arguments |
| `Tensor<Float32, [1,128], Gpu>` (three args) | `SPORE-TYPE-009` — expects 2 type arguments |
| `Tensor<Float32, [1, 128]>` | valid |
| `Tensor<Int8, DynamicShape>` | valid |

Suggested diagnostic message:

```
SPORE-TYPE-009: InvalidGenericInstantiation

Tensor expects 2 type parameters: Tensor<ElementType, Shape>
Received: Tensor
```

---

## Required Spec Updates

The following documents have been updated to reflect this decision:

- `docs/Knowledge-Bases/formal-type-system-spec.md`
  - Built-in types table: `Tensor<T, Shape>` and `AnyTensor`
  - Generic arity table: `Tensor: 2`
- `docs/Knowledge-Bases/generic-types.md`
  - Compute-oriented generics table updated
  - Valid/invalid examples added

---

## Future Hardware Compatibility

No language can guarantee that future hardware accepts today's type model.
Galerina maximises compatibility by separating:

1. **Portable semantic type** — `Tensor<T, Shape>` at the source level
2. **Runtime execution policy** — `compute target { prefer [npu, gpu, photonic, cpu] }`
3. **Backend-specific lowering** — GPU, NPU, TPU, WASM, photonic backends

This keeps the type system stable while allowing runtime targets to evolve independently.
Photonic, optical, quantum, and future accelerator backends attach via the compute target
governance block, not by extending the tensor arity.

---

## Phase 7A / 7B Compiler Impact

### Phase 7A (doc + type-registry only)

- `Tensor` added to `GENERIC_ARITY` with value `2`
- `AnyTensor` added to `BUILT_IN_TYPES` as zero-arity
- No tensor-specific semantic checks yet

### Phase 7B (operator checking)

- Tensor operator rules defined only after the tensor shape model is stable
- Shape compatibility checks (`matmul` dimension alignment) are a later phase

---

## See Also

- `docs/Knowledge-Bases/formal-type-system-spec.md` — canonical type definitions
- `docs/Knowledge-Bases/generic-types.md` — tensor usage examples
- `docs/Knowledge-Bases/ai-linear-algebra-accelerator-support.md`
- `docs/Knowledge-Bases/galerina-core-compute-v02.md`
