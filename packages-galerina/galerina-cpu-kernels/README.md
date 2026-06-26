# Galerina CPU Kernels

`galerina-cpu-kernels` is the package for optimized CPU kernel contracts.

It belongs in:

```text
/packages-galerina/galerina-cpu-kernels
```

Use this package for:

```text
GEMM and GEMV kernel descriptions
vector dot product plans
matrix multiplication plans
low-bit operation contracts
ternary operation contracts
threading and tiling plans
cache-aware block sizes
embedding quantization planning
kernel benchmark reports
```

## Boundary

`galerina-cpu-kernels` describes CPU kernels and their constraints. It should not own
AI model metadata, target selection policy or Galerina language syntax.

## Contracts

The package includes typed contracts for kernel plans, native ABI metadata,
benchmark samples, calibration cache entries and low-bit kernel diagnostics.

Final rule:

```text
galerina-cpu-kernels describes optimized CPU kernels.
galerina-target-cpu describes CPU capability and fallback selection.
galerina-ai-lowbit chooses low-bit backend kernel requirements.
```
