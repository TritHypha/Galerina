# Galerina — wasmtime Baseline Benchmark Record

**Date:** 2026-06-03  
**Context:** Recorded before `wasmtime galerina.wasm` compilation of the Stage-B runtime.
All figures use the Stage-A TypeScript interpreter running on Node.js v24 (Intel i9-9900K).

When `wasmtime galerina.wasm governance-cost.spore` is wired, compare governed vs these numbers.
The tree-walker overhead (~273K× slower than Rust for governance-cost) should collapse significantly
once Stage-B is compiled to native WASM and governance checks run at compiled speed.

## Key baselines (governed tier = Stage-A tree-walker, Node.js host)

| Benchmark | Current winner | Winner speed | Galerina governed | gov ÷ winner |
|---|---|---|---|---|
| governance-cost | Rust (generic) | **883.56M/s** | 3.2K/s | 0.0000036× (273,900× slower) |
| arithmetic-threshold | WASM Phase 27 | **3.94B/s** | 859.7K/s | 0.00022× (4,600× slower) |
| data-query | **Galerina governed** 🏆 | **228.3K/s** | 228.3K/s | 1.00× (winner) |
| nbody | Galerina passive | 76.7K/s | 62.6K/s | 0.82× |
| compute-mix | Node.js | 130.19M/s | 210.1K/s | 0.0016× (620× slower) |

## What to expect after `wasmtime galerina.wasm`

- `governance-cost` governed: currently **3.2K/s** (tree-walker overhead).
  After Stage-B WASM: target **300–900M/s** (within 1–3× of Rust, same compiled WASM tier as Phase 27).
- `arithmetic-threshold` governed: currently **859.7K/s**.
  After Stage-B WASM: target **2–4B/s** (same tier as the WASM Phase 27 winner).
- The jump from 3.2K/s → ~500M/s on governance-cost would be **~156,000×** improvement.

## Build path to `wasmtime galerina.wasm`
1. Compile `src/self-hosted/runtime.spore` through the Phase 27 WAT emitter → `galerina-runtime.wat`
2. Assemble WAT → `galerina-runtime.wasm` via wabt
3. Run: `wasmtime galerina-runtime.wasm --invoke runProgram <source>`
4. Or build a standalone CLI: `galerina program.spore` (no Node.js, no wasmtime flags)

See: `docs/Knowledge-Bases/galerina-selfhosting-roadmap-axisB.md`

---

## UPDATE 2026-06-03 — wasmtime pipeline confirmed working

```bash
node galerina.mjs build benchmarks/governance-cost/benchmark.spore
wasmtime --invoke main build/benchmark.wasm
# → 5050  (correct: triangleNumber(100) = sum 1..100)
```

**Measured improvement on governance-cost:**

| Path | Throughput | vs baseline |
|---|---|---|
| Stage-A tree-walker (governed) | 3,200 ops/sec | 1× (baseline) |
| WASM via Node.js instantiate | 1,882,000 ops/sec | **588×** |
| wasmtime CLI | verified correct | same binary |

The governance-cost flow (sumHelper + triangleNumber) compiles to 133 bytes of WASM.
Stage-B WAT emitter handles: i32 arithmetic, recursive calls, if/else, local.get/set.
Strings + records still use Stage-A path; see galerina-wasmtime-roadmap.md for next steps.
