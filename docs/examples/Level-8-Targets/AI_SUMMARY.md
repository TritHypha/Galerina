## What this level teaches

- All compute targets in depth: `cpu`, `gpu`, `npu`, `wasm`, `photonic`, `quantum`
- `compute target best { prefer [...] fallback cpu }` — adaptive runtime selection
- Explicit single-target syntax: `compute target cpu { fallback cpu }`
- `deny [...]` list to exclude specific targets (e.g. `deny [remote.execution]`)
- Why `fallback` is mandatory for every non-CPU target
- Photonic target: `prefer [photonic, npu, gpu, cpu]` with full classical fallback chain
- Quantum target: `prefer [quantum]` with simulation fallback (`prefer [quantum_simulation, cpu]`)
- Deterministic runtime vs adaptive runtime — when each applies
- `target plan` blocks for multi-stage compute pipelines
- `SPORE-TARGET-001` — missing fallback when targeting non-CPU hardware
- `SPORE-HINT-COMPUTE-001` — informational nudge for AI flows without a target preference

## Canonical patterns

```spore
// Explicit CPU: latency-sensitive deterministic workload
compute target cpu { fallback cpu }

// Adaptive with full photonic fallback chain
compute target best { prefer [photonic, npu, gpu, cpu] fallback cpu }
```

```spore
// Photonic preference with complete classical fallback
guarded flow runOptical(input: Tensor<Float32, [Batch, 1024]>) -> RunOpticalResult
contract {
  types { type RunOpticalResult = Result<Tensor<Float32, [Batch, 512]>, AiError> }
  intent { "Run optical model with full classical fallback chain for maximum portability." }
  effects { ai.inference }
}
{
  compute target best { prefer [photonic, npu, gpu, cpu] fallback cpu }
  return OpticalProjection.forward(input)?
}
```

## Do not use in this level

- `result of X else Y` (proposal only — use `Result<T, E>`)
- Declaring a compute target with no `fallback` for non-CPU targets — triggers `SPORE-TARGET-001`
- `authority` blocks (Level 9)
- `contract set` as a multi-flow governance template (Level 5)
- Omitting `ai.inference` from the effects block when calling a model under a compute target

## Key diagnostics this level demonstrates

| Code | Meaning |
|------|---------|
| `SPORE-TARGET-001` | Non-CPU compute target declared without a `fallback` |
| `SPORE-HINT-COMPUTE-001` | Flow uses `ai.inference` but declares no compute target preference |
| `SPORE-EFFECT-001` | Model call made without `ai.inference` in `effects` |

## Example IDs at this level

401-target-cpu, 402-target-gpu, 403-target-npu, 404-target-wasm, 405-target-photonic, 406-target-quantum, 407-target-best-prefer, 408-target-deny-remote, 409-target-deny-list, 410-adaptive-runtime, 411-deterministic-runtime, 412-target-photonic-with-fallback, 413-target-quantum-simulation, 414-target-no-fallback-invalid, 415-target-summary, 416-target-fallback-missing
