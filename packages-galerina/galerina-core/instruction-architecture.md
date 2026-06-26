# Galerina Instruction Architecture Notes

This document defines the early instruction-architecture direction for Galerina.

Galerina is not a photonic-only language. The compatibility baseline is normal binary
CPU execution. Photonic, GPU and ternary outputs start as compiler plans,
compatibility checks and simulations until real backends are selected.

## Baseline Contract

Every Galerina implementation should preserve this target order:

```text
1. CPU / binary compatibility
2. WebAssembly portability where available
3. GPU planning for practical acceleration
4. Photonic planning for future optical accelerators
5. Ternary simulation for 3-way logic and signal modelling
```

## Galerina IR Classes

The prototype separates source operations into broad IR classes:

| IR class | CPU binary | WASM | GPU plan | Photonic plan | Ternary sim |
|---|---:|---:|---:|---:|---:|
| Control flow | yes | yes | limited | limited | limited |
| Typed JSON/API boundary | yes | yes | no | no | no |
| File, network, database I/O | yes | limited | no | no | no |
| Pure scalar maths | yes | yes | yes | maybe | maybe |
| Vector/matrix/tensor maths | yes | yes | yes | plan | maybe |
| Signal transforms | yes | maybe | yes | plan | yes |
| Secret handling | yes | limited | no | no | no |

## Compute Block Rule

`compute` blocks mark code that may be split from ordinary CPU execution:

```Galerina
compute target photonic {
  fallback gpu
  fallback cpu

  output = signalTransform(input)
}
```

ALOwed operations are pure maths, vector, matrix, tensor, model and signal
operations. I/O, secrets, environment reads, database calls and mutable global
state must stay outside the compute block.

## Photonic Planning

The v0.1 compiler does not claim real photonic execution. It can emit a
photonic plan that records:

- source file and line
- preferred target
- fallback target order
- operations that look accelerator-compatible
- operations that block photonic planning

## Accelerator Verification

Galerina does not assume photonic, GPU, ternary or quantum targets produce mysterious
external data. Accelerator outputs are local computation results.

The real risks are practical target risks:

- signal noise
- precision loss
- analogue drift
- calibration errors
- thermal effects
- target mismatch
- wrong fallback target
- rounding differences
- hardware-specific behaviour

Rule:

```text
Accelerator output must be verifiable against CPU reference output where practical.
```

Example:

```Galerina
compute target best verify cpu_reference {
  prefer photonic
  fallback gpu
  fallback cpu

  result = fraudModel(features)
}
```

The compiler/runtime should report:

- CPU reference result
- GPU result where available
- photonic planned result where available
- precision difference
- confidence level
- fallback reason
- source location

## Accelerator Error Correction Policy

Galerina error correction for accelerators means:

```text
detect divergence
measure precision difference
compare against CPU reference where practical
retry only when the runtime marks the error transient
fallback to the next declared target
fallback to CPU reference when available
fail closed when tolerance or confidence rules are violated
route security or business decisions to Review when confidence is low
```

This is not a claim that Galerina already implements hardware-level photonic error
correction. Real hardware correction depends on the backend and device. Galerina's
language responsibility is to make correction policy explicit, source-mapped,
reported and reproducible.

Precision and verification data belongs in target and precision reports, not in
unsupported claims about external or mysterious data sources.

## CPU Backwards Compatibility

If a preferred accelerator target is unavailable, the compiler report must show
the fallback path. A Galerina program should remain useful on a normal CPU unless the
developer explicitly opts into a future target that has no fallback.
