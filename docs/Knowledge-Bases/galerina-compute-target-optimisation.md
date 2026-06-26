# Galerina Compute Target Optimisation

## Status

```
Adopted — Phase 8A implementation complete
See: galerina-adaptive-runtime-profiles.md for runtime behaviour
```

## TL;DR
- Tensor shape inference belongs in the GIR, not the source language
- `ai.inference` effects automatically suggest NPU/GPU preference (SPORE-HINT-COMPUTE-001)
- Photonic compatibility is a GIR planning flag, never a source-level type annotation

---

## Core Boundary

```
Source declares intent and constraints.
GIR carries planning metadata.
Target bridge handles hardware-specific lowering.
Runtime proves what happened.
```

The compiler may suggest or plan target use. The compiler must not silently
change governance, add effects, or override `deny [remote.execution]`.

---

## 1. Tensor Shape Inference — Implemented

When the compiler knows the type annotation of a tensor binding, it records the
element type and shape in the GIR for compute planning.

### What the GIR carries

```yaml
flow:
  name: classifyMessage
  tensors:
    - name: embedding
      type: "Tensor<Float32, [1, 768]>"
      elementType: Float32
      shape: "[1, 768]"
      photonic_compatible: true
    - name: weights
      type: "Tensor<Int8, [OutFeatures, InFeatures]>"
      elementType: Int8
      shape: "[OutFeatures, InFeatures]"
      photonic_compatible: false   # Int8 needs dequantization for photonic
```

### Photonic compatibility rules (Phase 8A)

| Element type | Photonic compatible | Notes |
|---|---|---|
| `Float16` | ✅ | Half precision, common for inference |
| `Float32` | ✅ | Standard float, photonic-ready |
| `Float` | ✅ | Platform float |
| `Int8` | ❌ | Quantized — requires dequantization at photonic bridge |
| `Int32`/`Int64` | ❌ | Integer tensors not native to photonic compute |
| `AnyTensor` | ❌ | Element type unknown — cannot confirm |

### Source stays clean

```galerina
// Source: type annotation is the only tensor-related syntax
let embedding: Tensor<Float32, [1, 768]> = EmbeddingModel.embed(text)?

// No source changes needed — GIR records compatibility automatically
```

Photonic-specific details (wavelength domains, phase angles, optical paths) belong
in the photonic target bridge (`galerina-target-photonic`), not in Galerina source.

---

## 2. Effect → Target Affinity — Implemented (SPORE-HINT-COMPUTE-001)

When a flow declares `ai.inference` but has no `compute target` block, the
governance verifier emits an info-level planning hint.

### Example hint

```text
SPORE-HINT-COMPUTE-001 COMPUTE_TARGET_MISSING_FOR_AI_INFERENCE [info]

Flow 'classifyMessage' uses ai.inference but has no compute target preference.
NPU or GPU acceleration would improve performance.

Suggested fix:
  compute target best {
    prefer [npu, gpu, cpu]
    fallback cpu
  }
```

### Important: this is a hint, not a governance rule

| Allowed | Not allowed |
|---|---|
| Diagnostic hint | Silently choosing remote AI |
| Planner suggestion | Adding undeclared effects |
| IDE quick fix | Ignoring `deny [remote.execution]` |

The hint fires at severity `"info"` — it does not block compilation or execution.
It can be silenced by adding an explicit `compute target` block (even `compute target cpu { }`).

### GIR target affinity

When the governance verifier's hint fires, the GIR also carries a `target_affinity`
entry computed from the flow's declared effects:

```yaml
flow:
  name: classifyMessage
  target_affinity:
    suggested:
      - photonic   # when all tensors are photonic-compatible
      - npu
      - gpu
      - cpu
    reason: "ai.inference effect benefits from NPU or GPU acceleration"
```

This is planning metadata for the runtime/target planner. It does not grant
authority to use any target — `compute target { prefer [...] }` in source
is always required for governed target selection.

---

## 3. Photonic Compatibility Flag — Implemented

The GIR carries `photonic_compatible: bool` per tensor binding. This flag is
set by the GIR emitter based on the element type (Float16/Float32 = true,
Int8/AnyTensor = false).

### What photonic bridges consume

```yaml
tensors:
  - name: embedding
    photonic_compatible: true
    elementType: Float32
    shape: "[1, 768]"
```

The photonic bridge reads `photonic_compatible` and decides:
- `true` → can plan optical routing, wavelength-domain allocation
- `false` → must fall back to classical compute or run dequantization first

### What Galerina source never contains

```galerina
// Wrong — never add photonic-specific syntax to source
let wavelengthEmbedding: PhotonicTensor<[1, 768]> = ...   // NOT Galerina
let optical: wavelength Tensor<Float32> = ...               // NOT Galerina
```

Wavelength domain, phase angles, and optical paths are **bridge internals**,
not source language concerns. The source stays stable as new photonic hardware
emerges.

---

## GIR Schema Extensions

### GIRTensorInfo

```typescript
interface GIRTensorInfo {
  name: string;
  type: string;           // Full annotation: "Tensor<Float32, [Batch, 768]>"
  elementType: string;    // Extracted: "Float32"
  shape: string;          // Extracted: "[Batch, 768]" or "DynamicShape"
  photonic_compatible: boolean;
}
```

### GIRTargetAffinity

```typescript
interface GIRTargetAffinity {
  suggested: string[];    // ["photonic", "npu", "gpu", "cpu"]
  reason: string;         // "ai.inference effect benefits from NPU..."
}
```

Both are optional additions to `GIRFlow` — absent when not applicable.

---

## Phase Roadmap

| Feature | Phase | Status |
|---|---|---|
| GIR tensor metadata (type, shape, photonic_compatible) | 8A | ✅ Implemented |
| SPORE-HINT-COMPUTE-001 (ai.inference without compute target) | 8A | ✅ Implemented |
| GIR target_affinity hint from effects | 8A | ✅ Implemented |
| Tensor shape compatibility checking (matmul dimension alignment) | 8B | Planned |
| Quantized type checking (Int8 in photonic context) | 8B | Planned |
| Adaptive runtime target learning | 8+ | See galerina-adaptive-runtime-profiles.md |

---

## See Also

- `docs/Knowledge-Bases/galerina-gir-schema.md` — full GIR schema
- `docs/Knowledge-Bases/galerina-tensor-arity-decision.md` — Tensor<T, Shape> arity
- `docs/Knowledge-Bases/galerina-adaptive-runtime-profiles.md` — runtime target learning
- `docs/Knowledge-Bases/galerina-quantum-target-bridge.md` — quantum target architecture
- `docs/Knowledge-Bases/galerina-core-photonic-v02.md` — photonic compute
