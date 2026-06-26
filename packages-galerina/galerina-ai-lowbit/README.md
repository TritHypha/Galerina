# Galerina Low-Bit AI

`galerina-ai-lowbit` is the package for low-bit AI inference contracts.

It belongs in:

```text
/packages-galerina/galerina-ai-lowbit
```

Use this package for:

```text
low-bit AI model metadata
1-bit, 1.58-bit, 2-bit, 3-bit and 4-bit model references
ternary model weight declarations
generic backend adapter contracts
BitNet backend compatibility
CPU reference fallback contracts
thread, timeout and memory limits
low-bit AI inference reports
low-bit AI safety diagnostics
local AI review backend compatibility
```

## Backend Role

Galerina syntax should name the intent, not one implementation:

```text
compute target low_bit_ai
compute target ternary_ai
compute auto { prefer low_bit_ai fallback cpu }
```

Backends can then be selected by configuration or runtime planning:

```text
bitnet
cpu_reference
future_standard
ternary_native
gpu_kernel
npu_kernel
```

BitNet is useful as a current backend for compatible 1.58-bit / ternary models,
but it must not become a language feature or target name.

Low-bit AI may also support local advisory review over deterministic Galerina
reports. This is useful for explanation and audit narratives, but it must not be
treated as compiler proof or runtime authority.

Reference sources:

- https://github.com/microsoft/BitNet
- https://github.com/microsoft/BitNet/blob/main/src/README.md
- https://arxiv.org/abs/2402.17764

## Boundary

`galerina-ai-lowbit` does not define Galerina `Tri` semantics. Low-bit and ternary AI
weights are model weights; Galerina `Tri` and `Galerina` belong in `galerina-core-logic`.

`galerina-ai-lowbit` should not own generic AI contracts, CPU feature detection or
kernel implementations. Those belong in `galerina-ai`, `galerina-target-cpu` and
`galerina-cpu-kernels`.

## Contracts

The package includes typed contracts for model references, backend adapter
compatibility, runtime limits, benchmark samples, validation diagnostics and
inference reports.

Final rule:

```text
galerina-ai-lowbit adapts low-bit AI inference.
bitnet is one backend inside galerina-ai-lowbit.
local low-bit AI review is advisory only.
galerina-ai defines generic AI inference contracts.
galerina-core-logic defines language-level ternary logic.
```
