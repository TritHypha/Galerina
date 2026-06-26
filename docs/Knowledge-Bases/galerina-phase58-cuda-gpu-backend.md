# Galerina Phase 58 — CUDA GPU Backend

## Status

CUDA v13.3 detected on this machine. `nvcc` is **not in PATH**.

GPU: NVIDIA RTX 3050 Ti (detected via system query).  
CUDA version: 13.3 (toolkit installed at default location).

## Fix Required

Add the CUDA bin directory to the system PATH:

```
C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v13.3\bin
```

**Steps (Windows 11):**
1. Open System Properties → Advanced → Environment Variables
2. Under "System variables", select `Path` and click Edit
3. Add: `C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v13.3\bin`
4. Click OK, restart terminal
5. Verify: `nvcc --version`

## What Phase 58 Enables

Phase 58 introduces the CUDA GPU backend for Galerina integer compute kernels. Once `nvcc` is reachable on PATH, the compiler can emit CUDA C kernels from Galerina `compute` blocks and compile them with `nvcc` at build time.

Target operations:
- Integer arithmetic (addition, multiplication, modular reduction)
- Bitwise operations (AND, OR, XOR, shift)
- Array reduction and scan (sum, max, count)
- Hash preimage computation (candidate GPU acceleration target)

These are the same operations benchmarked in the Deno WebGPU harness in Phase 42.

## Expected Performance

| Backend          | Ops/sec       | Notes                                  |
|------------------|---------------|----------------------------------------|
| Deno WebGPU      | ~4.17M        | Current baseline (Phase 42 benchmark)  |
| CUDA RTX 3050 Ti | 100B+         | Projected; 2,400 CUDA cores @ 1.7 GHz |

The RTX 3050 Ti has 2,400 CUDA cores with a base clock of ~1.695 GHz. For simple integer ops (e.g., 32-bit additions), throughput is bounded by memory bandwidth and warp occupancy, but peak arithmetic throughput exceeds 100 billion integer ops/sec.

## Implementation Plan

Two implementation paths are available once PATH is fixed:

### Option A: Rust `cudarc` crate (preferred)

```toml
# Cargo.toml
[dependencies]
cudarc = "0.12"
```

- Typesafe CUDA kernel loading from Rust
- Aligns with the Galerina WASM-governs, native-accelerates architecture
- Phase 58 emits PTX or CUDA C from Galerina `compute` blocks; Rust host calls the kernel
- No Python runtime dependency

### Option B: Python CuPy

```python
import cupy as cp
x = cp.arange(1_000_000_000, dtype=cp.int32)
result = cp.sum(x)
```

- Faster prototyping, NumPy-compatible API
- Suitable for benchmark validation before Rust integration
- Requires Python 3.10+ and `pip install cupy-cuda13x`

## Current State

- Benchmark harness: ready (adapted from Phase 42 Deno WebGPU harness)
- GPU: detected (RTX 3050 Ti)
- CUDA toolkit: installed (v13.3)
- Blocker: `nvcc` not in PATH — one-line fix above
- Next step: fix PATH, run `nvcc --version`, then invoke Phase 58 kernel emit

## Relation to Galerina Architecture

This phase is consistent with the hybrid WASM architecture rule:

> WASM governs; native accelerates.

The governance layer (WASM) remains authoritative. CUDA kernels are invoked only from within `compute` blocks that have been approved by the effect checker (Phase 57) and cleared by the governance verifier (Phase 56). The `ai.infer` and future `compute.gpu` effects will gate CUDA kernel dispatch.

## References

- Phase 42: Deno WebGPU benchmark harness (4.17M ops/sec baseline)
- Phase 56: Governance verifier stub (`governanceVerifierService.spore`)
- Phase 57: Effect checker stub (`effectCheckerService.spore`)
- Phase 60: Full runtime effect + governance enforcement (target)
- CUDA toolkit: https://developer.nvidia.com/cuda-downloads
- cudarc: https://github.com/coreylowman/cudarc
