# Low-Bit AI Backends

## Summary

Galerina should expose stable AI compute intent, not a vendor or research project name.
Application code should request `low_bit_ai` or, when it specifically needs a
ternary model family, `ternary_ai`. The runtime can then choose BitNet today,
another low-bit backend later, or a CPU reference fallback without asking
developers to rename Galerina source code.

Primary references:

- https://github.com/microsoft/BitNet
- https://github.com/microsoft/BitNet/blob/main/src/README.md
- https://arxiv.org/abs/2402.17764

## Package Split

```text
galerina-ai
  generic AI inference contracts, model metadata, safety policy and reports

galerina-ai-lowbit
  low-bit model references, backend selection and inference reports

galerina-target-cpu
  CPU feature, SIMD, threading, memory and fallback capability contracts

galerina-cpu-kernels
  optimized CPU kernel contracts for GEMM, GEMV, matrix and low-bit work

galerina-core-compute
  target preference, fallback and target selection reports
```

BitNet remains useful, but it is a backend inside `galerina-ai-lowbit`, not a target
name in Galerina syntax and not part of `galerina-core`.

## Compute Policy

Recommended target order for AI inference:

```text
prefer gpu
fallback npu
fallback low_bit_ai
fallback cpu.generic
report true
```

For explicitly ternary-capable models:

```text
prefer ternary_ai
fallback low_bit_ai
fallback cpu.generic
report true
```

Selection rules:

```text
1. Use GPU or NPU when available, permitted and compatible with the model.
2. Use low_bit_ai when a compatible low-bit backend and model are available.
3. Use ternary_ai only when the model uses a supported ternary weight format.
4. Use cpu.generic only when a normal CPU backend is acceptable.
5. Reject the plan if fallback is required and no compatible backend exists.
6. Always emit a target selection report with the selected backend.
```

## Backend Configuration

Runtime configuration may prefer BitNet without exposing it in source syntax:

```text
low_bit_ai {
  backend auto
  allow ["bitnet", "cpu_reference", "future_standard"]
  device cpu
}
```

This keeps old projects stable if BitNet is replaced by a better standard later.

## Safety Rules

AI inference declarations should include:

```text
model path
model format
weight format
quantization
context token limit
output token limit
memory estimate
thread limit
timeout
selected target report
selected backend report
```

AI output is untrusted by default. It must not directly approve payments, grant
access, change security policy or make other high-impact decisions.
Deterministic application policy must decide how AI output is used.

## Ternary Boundary

BitNet b1.58 uses ternary model weights. Galerina `Tri` also uses a three-state value
shape, but the meaning is different:

```text
galerina-core-logic
  language-level Tri, Galerina, Decision and Omni semantics

galerina-ai-lowbit
  model-level low-bit and ternary weights for AI inference
```

Do not make `galerina-core-logic` depend on BitNet or any AI backend.

## Report Shape

```json
{
  "flow": "summariseText",
  "requested": "compute auto",
  "target": "low_bit_ai",
  "backend": "bitnet",
  "device": "cpu",
  "reason": "GPU unavailable; low-bit AI backend selected for compatible ternary model",
  "model": "BitNet-b1.58-2B-4T",
  "weightFormat": "ternary_b1_58",
  "quantization": "i2_s",
  "embeddingQuantization": "q6_k",
  "threads": 8,
  "fallback": true,
  "warnings": []
}
```

## Recommendation

Use generic Galerina source syntax:

```text
compute auto { prefer low_bit_ai fallback cpu }
compute target ternary_ai fallback cpu
```

Use BitNet as one backend:

```text
target low_bit_ai
backend bitnet
device cpu
```

Final rule: BitNet is a backend, not a language feature.
