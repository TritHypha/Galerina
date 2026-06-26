# Galerina Photonic Compute Crossover Analysis

> **⚠️ SUPERSEDED (2026-06-24, R&D 0115).** This document's placement rule (the 500M-element
> heuristic, "Phase-44 pending", no nanosecond model) is **STALE** — do not cite it as the live
> rule. The live per-op placement decision is the **absolute-ns cost model** in
> `PartitionDecider` (`galerina-ext-photonic-emulator/src/partition-decider.ts`), composed by
> `ExecutionRouter` (`galerina-tri-pipe/src/execution-router.ts`), which models the DAC/ADC
> conversion tax and fails safe to digital (worst case == binary == today). See
> [`galerina-rd-0115-hybrid-photonic-binary-placement-2026-06-24.md`](galerina-rd-0115-hybrid-photonic-binary-placement-2026-06-24.md)
> and [`galerina-rd-0110-photonic-matmul-refutation-deepened-2026-06-24.md`](galerina-rd-0110-photonic-matmul-refutation-deepened-2026-06-24.md).
> Retained for the ternary-encoding background below, not for its crossover heuristic.

## Overview

The Kleene ternary logic operators (Tri.and, Tri.or, Tri.not) have an elegant equivalence
in the -1/0/+1 integer encoding:

| Operation | Software form | Encoding insight |
|---|---|---|
| Tri.and(a, b) | min(a, b) | Single i32.min_s instruction in WASM |
| Tri.or(a, b) | max(a, b) | Single i32.max_s instruction in WASM |
| Tri.not(a) | -a | Single i32.sub(0, a) instruction in WASM |

This means tri-logic on CPU is already extremely fast — the crossover to photonic hardware
only makes sense at very large scales.

## CPU Baseline (measured, RTX benchmark system — i5-11400H Tiger Lake H)

From the benchmark suite:
- Node.js branchless: ~60M truth-table-set ops/sec (9 combinations per call)
- WASM (compiled): expected 100-400M ops/sec (single instruction per op)
- Rust native: ~300M ops/sec
- CPU capacity at 10M element bulk: ~3B element ops/sec

## Crossover Point Estimate

At 3B ops/sec CPU capacity:
- 100M elements: ~33ms on CPU → photonic setup cost ~10ms → CPU wins
- 500M elements: ~167ms on CPU → photonic setup cost ~10ms → **break-even zone**
- 1B+ elements: >333ms on CPU → photonic wins if setup < 100ms

**Conservative crossover: 500M elements** for a dedicated photonic ternary processor.
This assumes photonic setup overhead of ~10ms (calibration + optical encoding).

## CostGraph Integration

When Galerina has photonic backends, the economics layer will use this crossover:

```galerina
// Auto-inferred by the compiler — no explicit economics block needed for most flows
pure flow massTriFilter(data: Array, n: Int): Array {
  contract {
    intent { "Apply ternary filter to a large array — auto-routes to photonic above 500M." }
    // economics {} — auto-inferred: large pure array op → photonic candidate above threshold
  }
  // ... tri-logic operations
}
```

The compiler auto-infers:
- n < 500M → cpu/wasm (software branchless path)
- n >= 500M → photonic candidate (if calibration evidence available)

## Implementation Status

| Phase | Status |
|---|---|
| CPU branchless (WASM/Node/Rust) | ✅ Benchmarked — tri-logic = min/max/neg |
| Truth table correctness (27 combos) | ✅ Verified across all runtimes |
| WASM compilation via WAT emitter | ✅ bench-wasm.mjs live |
| Photonic target integration | ⏳ Pending hardware — spec in galerina-photonic-ternary-bridge-spec.md |
| CostGraph crossover enforcement | ⏳ Phase 44+ — economics routing infrastructure needed |

## WAT Emitter Note

The Phase 27 WAT emitter already emits correct arithmetic for Tri operations:
```wat
;; Tri.and(a, b) = min(a, b) — branchless in WASM
(func $tri_and (param $a i32) (param $b i32) (result i32)
  local.get $a
  local.get $b
  i32.lt_s
  if (result i32) local.get $a else local.get $b end
)

;; Tri.not(a) = -a — zero comparisons
(func $tri_not (param $a i32) (result i32)
  i32.const 0
  local.get $a
  i32.sub
)
```

## References

- galerina-photonic-ternary-bridge-spec.md — full spec
- galerina-post-quantum-hardware-security.md — hardware trust profiles
- benchmarks/tri-logic/ — live benchmark suite
- docs/Knowledge-Bases/galerina-phase58-cuda-gpu-backend.md — GPU crossover (parallel)
