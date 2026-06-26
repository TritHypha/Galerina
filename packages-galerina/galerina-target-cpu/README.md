# Galerina Target CPU

`galerina-target-cpu` is the package for CPU target capability and fallback planning.

It belongs in:

```text
/packages-galerina/galerina-target-cpu
```

Use this package for:

```text
CPU architecture detection contracts
x86-64 and ARM64 capability descriptions
SIMD feature reports
threading policy
memory limits
CPU fallback reports
CPU AI inference target planning
```

## Boundary

`galerina-target-cpu` should not implement kernels directly. Optimized CPU kernel
descriptions belong in `galerina-cpu-kernels`; AI model adapters belong in `galerina-ai`
and `galerina-ai-lowbit`.

## Contracts

The package includes typed contracts for CPU feature probes, SIMD capability,
threading policy, low-bit CPU path checks, fallback selection diagnostics and
calibration reports.

Final rule:

```text
galerina-target-cpu decides whether the CPU can run the work.
galerina-cpu-kernels describes optimized CPU kernels.
galerina-ai-lowbit describes low-bit AI backend inference plans.
```
