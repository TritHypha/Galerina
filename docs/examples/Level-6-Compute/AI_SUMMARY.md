## What this level teaches

- `Tensor<T, Shape>` as the primary type for numeric compute workloads
- `compute target` block syntax: `compute target best { prefer [...] fallback cpu }`
- Hardware targets available: `cpu`, `gpu`, `npu`, `wasm`, `photonic`, `quantum`
- `prefer [...]` ordered list — runtime picks the first available target
- `deny [...]` list — prevents dispatch to named targets (e.g. `deny [remote.execution]`)
- `fallback cpu` as the mandatory safety net when a preferred target is unavailable
- Explicit single-target syntax: `compute target gpu { fallback cpu }`
- `Money<C>` arithmetic within compute-heavy flows (VAT, financial modelling)
- `Decimal` precision for financial calculations
- `SPORE-HINT-COMPUTE-001` — informational hint when `ai.inference` is used without a compute target preference

## Canonical patterns

```spore
// Prefer NPU or GPU with mandatory CPU fallback
pure flow embedText(text: String) -> Tensor<Float32, [1, 768]>
  with compute target best { prefer [npu, gpu, cpu] fallback cpu }
{
  return EmbeddingModel.embed(text)
}
```

```spore
// Explicit GPU target for known-large workload
pure flow processImage(pixels: Tensor<Float32, [3, 224, 224]>) -> Tensor<Float32, [1000]>
  with compute target gpu { fallback cpu }
{
  return ImageClassifierModel.forward(pixels)
}
```

## Do not use in this level

- `result of X else Y` (proposal only — use `Result<T, E>`)
- Omitting `fallback cpu` when targeting `npu` or `gpu` — required for portability
- `authority` blocks (Level 9)
- `contract set` (Level 5 concern; use plain `contract` here)
- `compute target quantum` without simulation fallback (covered more fully in Level 8)

## Key diagnostics this level demonstrates

| Code | Meaning |
|------|---------|
| `SPORE-HINT-COMPUTE-001` | Flow uses `ai.inference` but no compute target preference declared; NPU/GPU would improve performance |
| `SPORE-TARGET-001` | Compute target declared without a required `fallback` |
| `SPORE-TYPE-006` | `Tensor` declared without two type parameters |
| `SPORE-TYPE-004` | Cross-currency `Money` arithmetic — currency mismatch at compile time |

## Example IDs at this level

301-compute-target-best, 302-compute-deny-remote, 303-compute-gpu-explicit, 304-tensor-basic, 305-tensor-dynamic-shape, 306-tensor-arity-invalid, 307-vector-type, 308-matrix-type, 309-compute-photonic, 310-compute-fallback-required, 311-money-vat-calculation, 312-money-invalid-cross-currency, 313-decimal-precision, 314-compute-npu-ai-inference, 315-compute-summary, 316-invalid-tensor-add, 317-money-cross-currency-compute, 318-compute-hint-missing, 319-money-times-decimal, 320-statistics-stdlib
