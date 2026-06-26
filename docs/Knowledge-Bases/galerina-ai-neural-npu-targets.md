# Galerina — AI Neural IR, Quantization and NPU Compute Targets

## Overview

Three closely related features make Galerina a first-class AI and NPU deployment platform:

1. **Neural Operator IR** — `matmul`, `conv2d`, `attention`, `softmax`, `norm` as typed IR nodes with `Tensor<DType, Shape>`; compile-time shape checking; provider-agnostic lowering to CoreML/ONNX Runtime/TensorRT/OpenVINO/NPU
2. **Quantization-Aware Type System** — `Quantized<Float32, Int8>` as a type-level state; no silent precision changes; explicit `quantize`/`dequantize`/`requantize`; accuracy evidence in build reports
3. **`compute target npu`** — first-class governed target class for consumer-device neural accelerators; provider capability manifests; privacy/locality policy; explicit fallback

---

## Part 1: Neural Operator IR

### Problem Without Typed Neural IR

If neural operations are modeled as opaque native calls:

```galerina
native.call("matmul", a, b)    // no shape checking, no backend compatibility
```

The compiler cannot reason about shape compatibility, dtype, memory layout, backend support or precision policy. A dimension mismatch becomes a runtime crash.

### Shape-Typed Neural Operations

```galerina
let a: Tensor<Float32, [32, 128]>
let b: Tensor<Float32, [64, 256]>
let c = neural.matmul(a, b)    // COMPILE ERROR: 128 ≠ 64
```

```text
SPORE-TENSOR-001: matrix dimensions do not align

matmul requires: left [M, K] × right [K, N]
Found:          left [32, 128] × right [64, 256]
Mismatch:       128 ≠ 64
```

### First-Class Neural Operator Set (v1)

```text
matmul / batch_matmul
conv2d
softmax
layer_norm / rms_norm
gelu / relu / silu
add / mul
reshape / transpose
concat / slice
embedding
attention
```

### Attention as First-Class Node

```galerina
neural graph EncoderBlock {
    let out = attention(q, k, v, mask: causal)
}
```

Attention carries semantic metadata: mask type, causal flag, KV cache shape, precision mode, layout. Backends can select fused kernels based on this metadata.

### Shape Typing Rules

```text
matmul:          [M, K] × [K, N]     → [M, N]
batch_matmul:    [B, M, K] × [B, K, N] → [B, M, N]
attention Q×K×V: [B, H, Sq, D] × [B, H, Sk, D] × [B, H, Sk, Dv] → [B, H, Sq, Dv]
```

Symbolic dimensions track shape consistency:

```galerina
flow encode<Batch, Seq, Hidden>(
    x: Tensor<Float32, [Batch, Seq, Hidden]>
) -> Tensor<Float32, [Batch, Seq, Hidden]>
```

Static, symbolic, bounded and dynamic dimensions are all supported.

### IR Node Format

```json
{
  "kind": "NeuralOp",
  "op": "matmul",
  "inputs": ["a", "b"],
  "output": "c",
  "dtype": "Float32",
  "input_shapes": [["batch", "m", "k"], ["batch", "k", "n"]],
  "output_shape": ["batch", "m", "n"],
  "precision_policy": "exact_or_declared"
}
```

### Provider Abstraction

```galerina
neural_backend CoreML {
    supports [matmul, conv2d, softmax, layer_norm]
    dtypes [Float16, Float32, Int8]
    layouts [NHWC]
    dynamic_shapes limited
}
```

Provider lowering path:

```text
Galerina Neural IR → backend capability matcher → CoreML / ONNX Runtime / TensorRT / OpenVINO / CPU / WASM
```

### Diagnostics

| Code | Meaning |
|---|---|
| `SPORE-TENSOR-001` | Matrix dimensions do not align |
| `SPORE-TENSOR-002` | Incompatible tensor ranks |
| `SPORE-TENSOR-003` | Dtype mismatch |
| `SPORE-TENSOR-004` | Layout mismatch |
| `SPORE-TENSOR-005` | Broadcast rule failed |
| `SPORE-TENSOR-006` | Dynamic dimension requires runtime guard |
| `SPORE-TENSOR-007` | Backend does not support operator |
| `SPORE-TENSOR-008` | Backend does not support dtype/layout combination |
| `SPORE-TENSOR-009` | Precision policy would be violated |
| `SPORE-TENSOR-010` | Native neural call lacks shape contract |

---

## Part 2: Quantization-Aware Type System

### Problem

Most ML deployment stacks silently change model behavior when:

```text
Float32 weights → Int8 (silent quantization)
operators mix quantized and full-precision tensors
backend chooses a lower-precision kernel without declaration
dequantization happens implicitly
```

Galerina must reject this class of silent precision change.

### Type Model

```galerina
Quantized<Float32, Int8>          // scalar quantized value
QuantizedTensor<Float32, Int8, [batch, hidden]>  // quantized tensor with shape
```

### Explicit Quantize/Dequantize

```galerina
let q: QuantizedTensor<Float32, Int8, [batch, hidden]> =
    quantize<Int8>(x, using: CalibrationProfile.EncoderV1)

let x2: Tensor<Float32, [batch, hidden]> =
    dequantize(q)

// Invalid — no implicit conversion:
let x2: Tensor<Float32, [batch, hidden]> = q   // SPORE-QUANT-001
```

### Quantization Propagation

```galerina
let a: QuantizedTensor<Float32, Int8, [M, K]>
let b: QuantizedTensor<Float32, Int8, [K, N]>
let c: QuantizedTensor<Float32, Int32, [M, N]> = matmul(a, b)
// Int8 × Int8 accumulates into Int32 unless a requantize policy declares otherwise
```

### Precision Policy

```galerina
precision_policy FraudModel {
    allow_int8 true
    allow_int4 false
    require_calibration true
    require_reference_check true
    max_accuracy_drop 0.01
    silent_dequantize "deny"
}
```

### Accuracy Evidence in Build Reports

```json
{
  "model": "FraudModel",
  "reference": "sha256:float32-model",
  "quantized": "sha256:int8-model",
  "scheme": "Int8 per-channel",
  "calibration": "fraud-calibration-v3",
  "accuracy_delta": 0.004,
  "policy_max_delta": 0.01,
  "status": "accepted"
}
```

### Quantization in High-Stakes Flows

For fraud, payment and medical inference, quantization requires explicit governance:

```galerina
secure flow riskDecision(input: RiskInput) -> Decision
effects [ai.inference]
precision_policy FraudQuantizedV3 {
    allow_int8 true
    require_reference_check true
    max_accuracy_drop 0.005
}
```

### Diagnostics

| Code | Meaning |
|---|---|
| `SPORE-QUANT-001` | Quantized value used where full precision required |
| `SPORE-QUANT-002` | Full-precision value used where quantized required |
| `SPORE-QUANT-003` | Incompatible quantization schemes |
| `SPORE-QUANT-004` | Missing calibration profile |
| `SPORE-QUANT-005` | Implicit dequantization forbidden |
| `SPORE-QUANT-006` | Implicit quantization forbidden |
| `SPORE-QUANT-007` | Backend does not support quantization scheme |
| `SPORE-QUANT-008` | Accuracy evidence required by policy |
| `SPORE-QUANT-009` | Quantized accumulation type mismatch |
| `SPORE-QUANT-010` | Precision downgrade not approved |

---

## Part 3: `compute target npu`

### First-Class NPU Target

NPU is not a small GPU. It has narrower operator sets, stricter precision requirements, graph-based compilation and platform-specific runtime APIs.

```galerina
// Basic NPU dispatch
compute target npu {
    result = classifyImage(input)
}

// With fallback
compute target npu fallback [gpu, cpu] {
    result = classifyImage(input)
}

// With governance policy
compute target npu {
    require privacy.local
    allow_precision [Int8, Float16]
    fallback cpu
    verify cpu_reference tolerance 1e-4
    result = runModel(input)
}

// Best-effort selection
compute target best {
    prefer [npu, gpu, cpu]
    require approved_target
    fallback cpu
    result = runModel(input)
}
```

### Capability Declaration

```galerina
secure flow runLocalModel(input: ModelInput) -> Result<ModelOutput, InferenceError>
effects [compute.inference]
capabilities [compute.npu] {
    // ...
}
```

### Provider Architecture

```text
abstract:  target npu

providers:
  apple_ane      (CoreML)
  qualcomm_hexagon
  intel_npu
  mediatek_apu
  vendor_npu     (custom accelerator)
```

Provider capability manifests:

```json
{
  "target": "npu",
  "provider": "apple_ane",
  "supports": {
    "ops": ["conv2d", "matmul", "attention", "softmax", "layer_norm"],
    "dtypes": ["Float16", "Int8"],
    "dynamic_shapes": "limited",
    "layouts": ["NHWC"]
  }
}
```

### Privacy/Locality Policy

NPU enables strong local-only inference guarantees:

```galerina
compute target npu {
    require local_execution
    deny network.external
    fallback deny    // fail rather than send data to cloud
}
```

### Fallback Must Be Explicit and Reported

```text
requested target: npu
selected target:  cpu
reason:           provider unavailable at runtime
fallback allowed: yes
```

Silent fallback is dangerous — it may change performance, privacy, cost and precision assumptions without any visibility.

### NPU Requires Typed Neural IR

```galerina
// Bad — opaque native call
compute target npu { native.call("run_model", input) }

// Good — typed neural graph
compute target npu { result = neural.graph FraudModel(input) }
```

### Diagnostics

| Code | Meaning |
|---|---|
| `SPORE-NPU-001` | NPU target unavailable for deployment platform |
| `SPORE-NPU-002` | Operator unsupported by selected NPU provider |
| `SPORE-NPU-003` | Dtype unsupported by selected NPU provider |
| `SPORE-NPU-004` | Dynamic shape unsupported by selected NPU provider |
| `SPORE-NPU-005` | Quantization required for NPU target |
| `SPORE-NPU-006` | Fallback required but not declared |
| `SPORE-NPU-007` | Selected provider would violate precision policy |
| `SPORE-NPU-008` | Selected provider cannot satisfy memory budget |
| `SPORE-NPU-009` | Runtime fallback occurred and was reported |
| `SPORE-NPU-010` | NPU target requested but neural IR is opaque native call |

---

## 5-Stage Rollout

| Stage | Neural IR | Quantization | NPU |
|---|---|---|---|
| 1 | `Tensor<T, Shape>`, basic shape rules, matmul | `Quantized<Source, Storage>`, explicit convert | NPU target kind + reports |
| 2 | Full v1 operator set, attention | `QuantizedTensor`, operator signatures | Neural IR requirement for NPU |
| 3 | Reports, CPU reference | Precision policy + accuracy evidence | Quantization-aware NPU planning |
| 4 | ONNX Runtime lowering | First backend lowering | First provider backend |
| 5 | Provider backends (CoreML, TensorRT, OpenVINO) | Low-bit modes (Int4, ternary) | Multi-provider profiles |

---

## Architecture Placement

| Layer | Responsibility |
|---|---|
| `galerina-core` | Type system hooks for `Tensor<T,S>`, `Quantized<Src,Storage>` |
| `galerina-core-vector` | `Tensor`, shape symbols, layout primitives |
| `galerina-ai-neural` | Neural operator definitions, model graph contracts |
| `galerina-ai-lowbit` | Low-bit, Int4, ternary quantization modes |
| `galerina-core-compute` | Compute planning, budgets, target selection |
| `galerina-target-ai-accelerator` | NPU/TPU/AI-chip backend profile planning |
| `galerina-target-gpu` | GPU lowering and kernel mapping |
| `galerina-target-cpu` | CPU fallback kernels and SIMD reports |
| `galerina-core-reports` | Neural graph reports, quantization reports, target compatibility reports |
| Provider packages | `galerina-backend-coreml`, `galerina-backend-onnxruntime`, `galerina-backend-tensorrt`, `galerina-backend-openvino` |
