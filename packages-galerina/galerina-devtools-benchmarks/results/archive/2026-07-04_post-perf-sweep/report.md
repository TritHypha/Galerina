# Galerina Benchmark Report

## Key

**Traffic lights** (🚦) compare each runtime to **Node.js** (the production baseline):

| Light | Meaning | Speed vs Node.js |
|---|---|---|
| 🟢 | Green — fast | At or faster than Node.js (within 10%, or quicker) |
| ⚪ | White — comparable | Within 2× of Node.js |
| 🟡 | Yellow — a little slower | 2–10× slower than Node.js |
| 🔴 | Red — much slower | 10–100× slower than Node.js |
| ⚫ | Black — terrible | 100×+ slower than Node.js |

**Medals** (🥇🥈🥉) rank runtimes by throughput within each benchmark — fastest first.

**Runtimes:**
- **Rust (generic / AVX2)** — native compiled baseline (ceiling).
- **Node.js** — V8 JIT (production baseline for traffic lights).
- **Python** — CPython interpreter (comparison floor).
- **WASM ▶ production** — `galerina run` → WAT → WebAssembly. Governance gates compiled IN. **This is the production governed runtime** — the row to read for shipping cost.

> **Taxonomy — read this before the governance numbers.** The three `⟨interp⟩` rows below are **Stage-A interpreter diagnostic tiers**, NOT the production path. They exist to (a) *measure* the cost of pre-planning vs runtime proving, and (b) *verify* the WASM compiler against the reference interpreter. Do not read the interpreter's governed throughput as the shipping governance cost — read the **WASM ▶ production** row for that.
- **Galerina governed ⟨interp⟩** — Stage-A: full governance tree-walker (capabilities + audit + proof rebuilt per call). *Diagnostic worst-case.*
- **Galerina manifest ⟨interp⟩** — Stage-A: pre-verified runtime manifest, governance erased at runtime. *Diagnostic.*
- **Galerina passive ⟨interp⟩** — Stage-A: pre-compiled deployment model with LRU result cache (warm path). *Diagnostic.*

---

## 1. Throughput — Winner per Benchmark

> **🏆 Winner** = fastest runtime for that workload. Medals (🥇🥈🥉) show top 3 in the detail tables below.
> 🖥️ CPU = CPU execution | 🎮 GPU = real GPU dispatch (Deno WebGPU on NVIDIA GeForce RTX 2060)

| Benchmark | 🏆 Winner | Winner Speed | Galerina (governed) | gov ÷ Winner | gov ÷ Python (floor) | Why the winner wins |
|---|---|---|---|---|---|---|
| **compute-mix** | **Galerina passive ⟨interp⟩** 🖥️ | **850.82M/s** | 215.2K/s | 0.00025× (4.0K× slower) | ❌ 0.22× (4.6× slower) | LRU cache warm path (first-call winner: Node.js at 134.27M/s) |
| **arithmetic-threshold** | **WASM ▶ production** 🖥️ | **4.01B/s** | 731.8K/s | 0.00018× (5.5K× slower) | ❌ 0.16× (6.4× slower) | WASM JIT — zero alloc, native-speed compiled |
| **six-digit-guess** | **WASM ▶ production** 🖥️ | **80.60M/s** | 47.0K/s | 0.00058× (1.7K× slower) | ❌ 0.47× (2.1× slower) | WASM JIT — zero alloc, native-speed compiled |
| **record-allocation** | **WASM ▶ production** 🖥️ | **2.34B/s** | 489.7K/s | 0.00021× (4.8K× slower) | ❌ 0.09× (10.7× slower) | WASM JIT — zero alloc, native-speed compiled |
| **fibonacci-recursive** | **Galerina passive ⟨interp⟩** 🖥️ | **83.2K/s** | 11.0/s | 0.00013× (7.6K× slower) | ✅ **1.36×** faster | LRU cache warm path (first-call winner: WASM ▶ production at 45.3K/s) |
| **collection-pipeline** | **Rust AVX2** 🖥️ | **13.10B/s** | 625.0K/s | 0.00005× (21.0K× slower) | ❌ 0.03× (34.4× slower) | Native compiled — LLVM optimised, may auto-vectorise |
| **governance-cost** | **Rust (generic)** 🖥️ | **901.62M/s** | 820.0/s | 0.00000× (1099.5K× slower) | ❌ 0.02× (44.5× slower) | Native compiled — LLVM optimised, may auto-vectorise |
| **hardware-targets** | **WASM ▶ production** 🖥️ | **441.71M/s** | 6.7K/s | 0.00002× (66.3K× slower) | n/a (no Python) | WASM JIT — zero alloc, native-speed compiled |
| **low-memory** | **Rust AVX2** 🖥️ | **6.10B/s** | 122.1K/s | 0.00002× (49.9K× slower) | ❌ 0.02× (45.6× slower) | Native compiled — LLVM optimised, may auto-vectorise |
| **gpu-compute** | **Galerina passive ⟨interp⟩** 🖥️ | **8.35B/s** | 371.8K/s | 0.00004× (22.4K× slower) | ❌ 0.03× (33.7× slower) | LRU cache warm path (first-call winner: WASM ▶ production at 1.56B/s) |
| **matrix-multiply** | ⚠️ not unit-aligned | — | — | — | — | excluded — Galerina/WASM n=32 (1024 cells, 32³ mul-adds), node/python/rust n=64 (4096 cells, 64³), Deno n=128 (16384 cells). Per-cell work (dot-product length n) also differs, so no shared unit is apples-to-apples until n is unified. |
| **crypto-ops** | **Galerina passive ⟨interp⟩** 🖥️ | **19.1K/s** | 274.0/s | 0.0143× (70× slower) | n/a (no Python) | LRU cache warm path (first-call winner: Galerina manifest ⟨interp⟩ at 2.0K/s) |
| **text-html** | **Galerina passive ⟨interp⟩** 🖥️ | **75.7K/s** | 1.0K/s | 0.0132× (76× slower) | n/a (no Python) | LRU cache warm path (first-call winner: Galerina manifest ⟨interp⟩ at 3.2K/s) |
| **tri-logic** | ⚠️ not unit-aligned | — | — | — | — | excluded — Galerina main()=runBulkTri(100000) (100k triples / 300k trit-ops) |
| **data-query** | ⚠️ not unit-aligned | — | — | — | — | excluded — Galerina main()=filterAndCount(1000)+groupByCategory(1000)=2000 record-scans (but galerinaOpsPerRun=1000 undercounts) |
| **call-chain** | **Galerina passive ⟨interp⟩** 🖥️ | **4.99B/s** | 60.8K/s | 0.00001× (82.1K× slower) | ❌ 0.03× (34.4× slower) | LRU cache warm path (first-call winner: Node.js at 307.73M/s) |
| **nbody** | **Galerina passive ⟨interp⟩** 🖥️ | **2.24B/s** | 58.5K/s | 0.00003× (38.3K× slower) | ❌ 0.04× (25.4× slower) | LRU cache warm path (first-call winner: Node.js at 123.09M/s) |
| **json-parse** | **Galerina passive ⟨interp⟩** 🖥️ | **47.30M/s** | 7.4K/s | 0.00016× (6.4K× slower) | ❌ 0.01× (86.3× slower) | LRU cache warm path (first-call winner: Node.js at 3.32M/s) |
| **mandelbrot** | **Galerina passive ⟨interp⟩** 🖥️ | **1.20B/s** | 7.9K/s | 0.00001× (150.6K× slower) | ❌ 0.03× (31.8× slower) | LRU cache warm path (first-call winner: Rust (generic) at 23.39M/s) |
| **spectral-norm** | **Rust (generic)** 🖥️ | **371.32M/s** | — | — | — | Native compiled — LLVM optimised, may auto-vectorise |
| **binary-trees** | **Galerina passive ⟨interp⟩** 🖥️ | **10.90B/s** | 3.75M/s | 0.00034× (2.9K× slower) | ❌ 0.70× (1.4× slower) | LRU cache warm path (first-call winner: Node.js at 75.95M/s) |
| **tmf-container** | **Rust (generic)** 🖥️ | **182.3K/s** | — | — | — | Native compiled — LLVM optimised, may auto-vectorise |
| **framework-pipeline** | **Node.js** 🖥️ | **394.1K/s** | — | — | — | V8 JIT — wins when WASM N/A or string/async workload |
| http-throughput | — | — | — | — | — | No data |
| naming-check | — | — | — | — | — | No data |
| context-receipt | — | — | — | — | — | No data |
| intelligence-search | — | — | — | — | — | No data |
| provenance-trace | — | — | — | — | — | No data |

> **Python floor check:** Galerina (governed) beats Python on **1/14** unit-aligned benchmarks where both ran. Python is the like-for-like floor while the Stage-A runtime is still TypeScript-interpreted; Rust/Zig/WASM are the ceiling. (3 benchmark(s) excluded — not unit-aligned; see §1.6.)

### Full Throughput Table (all runtimes)

| Benchmark | Rust AVX-512 | Rust AVX2 | Rust (generic) | C++ | Node.js | Python | Galerina passive ⟨interp⟩ | Galerina manifest ⟨interp⟩ | Galerina governed ⟨interp⟩ | WASM ▶ production | Deno WebGPU (NVIDIA GeForce RTX 2060) | Node/Galerina† (🖥️ CPU) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| compute-mix | — | 128.94M/s | 130.91M/s | — | 134.27M/s | 985.6K/s | **850.82M/s** | 225.5K/s | 215.2K/s | 122.79M/s | — | 623.9× |
| arithmetic-threshold | — | 1.56B/s | 1.55B/s | — | 959.40M/s | 4.65M/s | 45.0K/s | 852.6K/s | 731.8K/s | **4.01B/s** | — | 1.3K× |
| six-digit-guess | — | 74.34M/s | 76.16M/s | — | 2.81M/s | 99.4K/s | 38.0K/s | 47.3K/s | 47.0K/s | **80.60M/s** | — | 59.7× |
| record-allocation | — | 1.17B/s | 1.17B/s | — | 55.85M/s | 5.26M/s | 1.01B/s | 551.9K/s | 489.7K/s | **2.34B/s** | — | 114.0× |
| fibonacci-recursive | — | 495.6/s | 494.3/s | — | 123.1/s | 8.1/s | **83.2K/s** | 16.0/s | 11.0/s | 45.3K/s | — | 11.2× |
| collection-pipeline | — | **13.10B/s** | 4.28B/s | — | 68.14M/s | 21.48M/s | 1.16B/s | 670.7K/s | 625.0K/s | 2.38B/s | — | 109.0× |
| governance-cost | — | **895.70M/s** | **901.62M/s** | — | 2.11M/s | 36.5K/s | 80.3K/s | 690.0/s | 820.0/s | 16.61M/s | — | -18.8% gov overhead |
| hardware-targets | — | 1.17M/s | 1.17M/s | — | 887.8K/s | — | 108.8K/s | 4.5K/s | 6.7K/s | **441.71M/s** | — | 133.2× |
| low-memory | — | **6.10B/s** | 1.34B/s | — | 709.57M/s | 5.57M/s | 508.00M/s | 115.7K/s | 122.1K/s | 695.66M/s | — | 5.8K× |
| gpu-compute | — | 1.17B/s | 1.18B/s | — | 984.45M/s | 12.53M/s | **8.35B/s** | 380.0K/s | 371.8K/s | 1.56B/s | 4.00M/s | 2.6K× |
| matrix-multiply ⚠️ | — | — | — | — | — | — | — | — | — | — | — | ⚠️ excluded |
| crypto-ops | — | — | — | — | — | — | **19.1K/s** | 2.0K/s | 274.0/s | — | — | — |
| text-html | — | — | — | — | — | — | **75.7K/s** | 3.2K/s | 1.0K/s | — | — | — |
| tri-logic ⚠️ | — | — | — | — | — | — | — | — | — | — | — | ⚠️ excluded |
| data-query ⚠️ | — | — | — | — | — | — | — | — | — | — | — | ⚠️ excluded |
| call-chain | — | — | — | — | 307.73M/s | 2.09M/s | **4.99B/s** | 55.1K/s | 60.8K/s | — | — | 5.1K× |
| nbody | — | — | — | — | 123.09M/s | 1.48M/s | **2.24B/s** | 58.2K/s | 58.5K/s | — | — | 2.1K× |
| json-parse | — | — | — | — | 3.32M/s | 635.0K/s | **47.30M/s** | 9.3K/s | 7.4K/s | — | — | 451.2× |
| mandelbrot | — | — | 23.39M/s | — | 6.23M/s | 252.7K/s | **1.20B/s** | 7.2K/s | 7.9K/s | — | — | 784.2× |
| spectral-norm | — | — | **371.32M/s** | — | 213.17M/s | 2.68M/s | — | — | — | — | — | — |
| binary-trees | — | — | 20.36M/s | — | 75.95M/s | 5.34M/s | **10.90B/s** | 4.18M/s | 3.75M/s | — | — | 20.2× |
| tmf-container | — | — | **182.3K/s** | — | 47.3K/s | 88.1K/s | — | — | — | — | — | — |
| framework-pipeline | — | — | — | — | **394.1K/s** | 120.4K/s | — | — | — | — | — | — |
| http-throughput | — | — | — | — | — | — | — | — | — | — | — | — |
| naming-check | — | — | — | — | — | — | — | — | — | — | — | — |
| context-receipt | — | — | — | — | — | — | — | — | — | — | — | — |
| intelligence-search | — | — | — | — | — | — | — | — | — | — | — | — |
| provenance-trace | — | — | — | — | — | — | — | — | — | — | — | — |

> †`Node/Galerina > 1` = Node.js faster (the usual case for the Stage-A tree-walker). `< 1` = Galerina faster.
> †fibonacci: Galerina=fib(20), others=fib(30) — different workload depth.
> ⚠️ rows are excluded — their workloads are not unit-aligned across runtimes (see §1.6).
> **Bold** = winner (within 5% of fastest). 🖥️ CPU = CPU execution. 🎮 GPU = Deno WebGPU (NVIDIA GeForce RTX 2060).

## 1.6 Unit Alignment Check

> Throughput is only meaningful when every runtime measures the **same unit**. This
> table is the report-side view of the `assertBenchmarkUnits` guard in `throughput-units.mjs`.

| Benchmark | Status | Unit | Notes |
|---|---|---|---|
| compute-mix | ✅ aligned | mix-ops/s | all runtimes normalised to one unit |
| arithmetic-threshold | — legacy | per-call | not centrally normalised (out of scope) |
| six-digit-guess | — legacy | per-call | not centrally normalised (out of scope) |
| record-allocation | ✅ aligned | records/s | all runtimes normalised to one unit |
| fibonacci-recursive | — legacy | per-call | not centrally normalised (out of scope) |
| collection-pipeline | ✅ aligned | elements/s | all runtimes normalised to one unit |
| governance-cost | — legacy | per-call | not centrally normalised (out of scope) |
| hardware-targets | — legacy | per-call | not centrally normalised (out of scope) |
| low-memory | ✅ aligned | items/s | all runtimes normalised to one unit |
| gpu-compute | ✅ aligned | kernel-evals/s | all runtimes normalised to one unit |
| matrix-multiply | ⚠️ excluded | cells/s | workload SIZE differs by runtime — Galerina/WASM n=32 (1024 cells, 32³ mul-adds), node/python/rust n=64 (4096 cells, 64³), Deno n=128 (16384 cells). Per-cell work (dot-product length n) also differs, so no shared unit is apples-to-apples until n is unified. |
| crypto-ops | — legacy | per-call | not centrally normalised (out of scope) |
| text-html | — legacy | per-call | not centrally normalised (out of scope) |
| tri-logic | ⚠️ excluded | trit-ops/s | incomparable workloads — Galerina main()=runBulkTri(100000) (100k triples / 300k trit-ops); node/python/rust run nested 9-element truth-table micro-benches plus a separate 10M bulk; galerinaOpsPerRun=27000 (≈27 truth-table combos ×1000) corresponds to none of these. Needs a common bulk-N trit-op path on every runtime. |
| data-query | ⚠️ excluded | records/s | incomparable — Galerina main()=filterAndCount(1000)+groupByCategory(1000)=2000 record-scans (but galerinaOpsPerRun=1000 undercounts); node/python run 7 separate query micro-benches nested under results.* with no single representative. Needs a main() recount + a chosen representative query before the numbers compare. |
| call-chain | ✅ aligned | chains/s | all runtimes normalised to one unit |
| nbody | ✅ aligned | force-evals/s | all runtimes normalised to one unit |
| json-parse | ✅ aligned | records/s | all runtimes normalised to one unit |
| mandelbrot | ✅ aligned | pixels/s | all runtimes normalised to one unit |
| spectral-norm | ✅ aligned | A-evals/s | all runtimes normalised to one unit |
| binary-trees | ✅ aligned | nodes/s | all runtimes normalised to one unit |
| tmf-container | ✅ aligned | containers/s | all runtimes normalised to one unit |
| framework-pipeline | ✅ aligned | requests/s | all runtimes normalised to one unit |
| http-throughput | — legacy | per-call | not centrally normalised (out of scope) |
| naming-check | — legacy | per-call | not centrally normalised (out of scope) |
| context-receipt | — legacy | per-call | not centrally normalised (out of scope) |
| intelligence-search | — legacy | per-call | not centrally normalised (out of scope) |
| provenance-trace | — legacy | per-call | not centrally normalised (out of scope) |

> **Excluded** benchmarks are dropped from the winner table and the Python-floor check until their
> workloads are realigned across runtimes. Excluding them is what stops false "Galerina wins" on
> mismatched workloads (the same class of bug the unit normalisation fixed for the numeric loops).

## 1.5 Traffic Light Summary

> 🟢 = at/near best | ⚪ = within 2× | 🟡 = 2-10× slower | 🔴 = 10-100× slower | ⚫ = 100×+ slower

| Benchmark | WASM (Phase 27) | vs Rust | vs Node.js | Galerina governed | vs Rust | vs Node | Implication |
|---|---|---|---|---|---|---|---|
| compute-mix | 122.79M/s | 🟢 1.1× slower | 🟢 1.1× slower | 215.2K/s | ⚫ 608.3× slower | ⚫ 623.9× slower | WASM = native speed | governed needs sync |
| arithmetic-threshold | 4.01B/s | 🟢 2.6× | 🟢 4.2× | 731.8K/s | ⚫ 2129.8× slower | ⚫ 1311.0× slower | WASM = native speed | governed needs sync |
| six-digit-guess | 80.60M/s | 🟢 1.1× | 🟢 28.7× | 47.0K/s | ⚫ 1619.6× slower | 🔴 59.7× slower | WASM = native speed | governed slow |
| record-allocation | 2.34B/s | 🟢 2.0× | 🟢 41.8× | 489.7K/s | ⚫ 2392.8× slower | ⚫ 114.0× slower | WASM = native speed | governed needs sync |
| fibonacci-recursive | 45.3K/s | 🟢 91.5× | 🟢 368.4× | 11.0/s | 🔴 45.1× slower | 🔴 11.2× slower | WASM = native speed | governed slow |
| collection-pipeline | 2.38B/s | 🟡 5.5× slower | 🟢 34.9× | 625.0K/s | ⚫ 20953.6× slower | ⚫ 109.0× slower | WASM usable | governed needs sync |
| governance-cost | 16.61M/s | 🔴 54.3× slower | 🟢 7.9× | 820.0/s | ⚫ 1099531.3× slower | ⚫ 2572.5× slower | WASM lags native | governed needs sync |
| hardware-targets | 441.71M/s | 🟢 376.7× | 🟢 497.5× | 6.7K/s | ⚫ 175.9× slower | ⚫ 133.2× slower | WASM = native speed | governed needs sync |
| low-memory | 695.66M/s | 🟡 8.8× slower | 🟢 1.0× slower | 122.1K/s | ⚫ 49942.7× slower | ⚫ 5811.3× slower | WASM usable | governed needs sync |
| gpu-compute | 1.56B/s | 🟢 1.3× | 🟢 1.6× | 371.8K/s | ⚫ 3165.1× slower | ⚫ 2647.5× slower | WASM = native speed | governed needs sync |
| crypto-ops | pending | — | — | 274.0/s | — | — |  |
| text-html | pending | — | — | 1.0K/s | — | — |  |
| call-chain | pending | — | — | 60.8K/s | — | ⚫ 5061.1× slower | governed needs sync |
| nbody | pending | — | — | 58.5K/s | — | ⚫ 2103.2× slower | governed needs sync |
| json-parse | pending | — | — | 7.4K/s | — | ⚫ 451.2× slower | governed needs sync |
| mandelbrot | pending | — | — | 7.9K/s | ⚫ 2945.2× slower | ⚫ 784.2× slower | governed needs sync |
| binary-trees | pending | — | — | 3.75M/s | 🟡 5.4× slower | 🔴 20.2× slower | governed slow |

## 2. Memory Allocation per Operation (low-memory benchmark)

> **Key metric:** bytes allocated on the JS heap per integer operation.
> WASM and bytecode VM should be near 0. Tree-walker allocates per AST node.

| # | 🚦 | Runtime | Bytes/Op | Throughput | Total Ops | Heap Δ |
|---|---|---|---|---|---|---|
| 🥇 | ⚪ | Galerina passive ⟨interp⟩ | -70.60 bytes/op ⚡ ~0 — no boxing | 508.00M/s | — | -706KB |
| 🥈 | 🟢 | Rust AVX2 | 0.00 bytes/op ⚡ ~0 — no boxing | 6.10B/s | — | — |
| 🥉 | 🟢 | Rust (generic) | 0.00 bytes/op ⚡ ~0 — no boxing | 1.34B/s | — | — |
| 4 | 🟢 | Node.js | 0.00 bytes/op ⚡ ~0 — no boxing | 709.57M/s | — | 17KB |
| 5 | 🟢 | WASM ▶ production | 0.00 bytes/op ⚡ ~0 — no boxing | 695.66M/s | — | 41KB |
| 6 | ⚫ | Python | 0.03 bytes/op ⚡ ~0 — no boxing | 5.57M/s | — | 272B |
| 7 | ⚫ | Galerina governed ⟨interp⟩ | 66 bytes/op ⚠ moderate | 122.1K/s | — | 656KB |
| 8 | ⚫ | Galerina manifest ⟨interp⟩ | 87 bytes/op ⚠ moderate | 115.7K/s | — | 869KB |

> **Why this matters:** Every byte allocated is a byte the GC must later collect.
> WASM and the bytecode VM run with zero allocation — ideal for high-throughput governed services.
> The tree-walker's per-node allocation is the primary target of Phases 31-33.


## 2b. General Memory Usage

| Benchmark | Runtime | RSS | Peak RSS | Heap Used | Heap Δ (execution) |
|---|---|---|---|---|---|
| compute-mix | Rust AVX2 | — | — | — | — |
| compute-mix | Rust (generic) | — | — | — | — |
| compute-mix | Node.js | 41.3MB | 41.5MB | 5.0MB | 941KB |
| compute-mix | Python | — | — | 3KB | 3KB |
| compute-mix | Galerina passive ⟨interp⟩ | 76.8MB | 76.8MB | 18.1MB | 20KB |
| compute-mix | Galerina manifest ⟨interp⟩ | 76.8MB | 76.8MB | 16.0MB | 926KB |
| compute-mix | Galerina governed ⟨interp⟩ | 76.6MB | 76.6MB | 16.4MB | 1.6MB |
| compute-mix | WASM ▶ production | 71.2MB | 71.2MB | 14.7MB | 21KB |
| arithmetic-threshold | Rust AVX2 | — | — | — | — |
| arithmetic-threshold | Rust (generic) | — | — | — | — |
| arithmetic-threshold | Node.js | 47.0MB | 47.2MB | 4.3MB | 208KB |
| arithmetic-threshold | Python | — | — | 4KB | 4KB |
| arithmetic-threshold | Galerina passive ⟨interp⟩ | 77.5MB | 77.5MB | 15.8MB | 9KB |
| arithmetic-threshold | Galerina manifest ⟨interp⟩ | 77.5MB | 77.5MB | 16.9MB | 1.6MB |
| arithmetic-threshold | Galerina governed ⟨interp⟩ | 77.5MB | 77.5MB | 15.8MB | 214KB |
| arithmetic-threshold | WASM ▶ production | 78.0MB | 78.0MB | 17.8MB | 27KB |
| six-digit-guess | Rust AVX2 | — | — | — | — |
| six-digit-guess | Rust (generic) | — | — | — | — |
| six-digit-guess | Node.js | 51.8MB | 51.8MB | 5.8MB | 1.1MB |
| six-digit-guess | Python | — | — | 583B | 583B |
| six-digit-guess | Galerina passive ⟨interp⟩ | 79.5MB | 79.5MB | 17.0MB | 37KB |
| six-digit-guess | Galerina manifest ⟨interp⟩ | 79.3MB | 79.3MB | 16.2MB | 548KB |
| six-digit-guess | Galerina governed ⟨interp⟩ | 79.0MB | 79.0MB | 16.3MB | 784KB |
| six-digit-guess | WASM ▶ production | 77.9MB | 77.9MB | 15.9MB | 1KB |
| record-allocation | Rust AVX2 | — | — | — | — |
| record-allocation | Rust (generic) | — | — | — | — |
| record-allocation | Node.js | 48.1MB | 48.1MB | 4.4MB | 288KB |
| record-allocation | Python | — | — | 492B | 492B |
| record-allocation | Galerina passive ⟨interp⟩ | 79.9MB | 79.9MB | 16.7MB | 57KB |
| record-allocation | Galerina manifest ⟨interp⟩ | 79.2MB | 79.2MB | 16.5MB | 710KB |
| record-allocation | Galerina governed ⟨interp⟩ | 79.9MB | 79.9MB | 16.6MB | 716KB |
| record-allocation | WASM ▶ production | 79.0MB | 79.0MB | 16.3MB | 47KB |
| fibonacci-recursive | Rust AVX2 | — | — | — | — |
| fibonacci-recursive | Rust (generic) | — | — | — | — |
| fibonacci-recursive | Node.js | 46.2MB | 46.2MB | 4.1MB | 5KB |
| fibonacci-recursive | Python | — | — | 464B | 464B |
| fibonacci-recursive | Galerina passive ⟨interp⟩ | 80.0MB | 80.0MB | 16.5MB | 32KB |
| fibonacci-recursive | Galerina manifest ⟨interp⟩ | 79.5MB | 79.5MB | 17.3MB | 1.4MB |
| fibonacci-recursive | Galerina governed ⟨interp⟩ | 79.8MB | 79.8MB | 17.0MB | 1.1MB |
| fibonacci-recursive | WASM ▶ production | 79.6MB | 79.6MB | 16.4MB | 42KB |
| collection-pipeline | Rust AVX2 | — | — | — | — |
| collection-pipeline | Rust (generic) | — | — | — | — |
| collection-pipeline | Node.js | 63.1MB | 63.1MB | 12.3MB | 8.1MB |
| collection-pipeline | Python | — | — | 224B | 224B |
| collection-pipeline | Galerina passive ⟨interp⟩ | 79.4MB | 79.4MB | 16.7MB | 86KB |
| collection-pipeline | Galerina manifest ⟨interp⟩ | 79.3MB | 79.3MB | 16.1MB | 108KB |
| collection-pipeline | Galerina governed ⟨interp⟩ | 80.3MB | 80.3MB | 16.1MB | 93KB |
| collection-pipeline | WASM ▶ production | 79.8MB | 79.8MB | 16.8MB | 41KB |
| governance-cost | Rust AVX2 | — | — | — | — |
| governance-cost | Rust (generic) | — | — | — | — |
| governance-cost | Node.js | 46.1MB | 46.1MB | 4.1MB | 24KB |
| governance-cost | Python | — | — | 272B | 272B |
| governance-cost | Galerina passive ⟨interp⟩ | 81.3MB | 81.3MB | 17.2MB | 833KB |
| governance-cost | Galerina manifest ⟨interp⟩ | 82.8MB | 82.8MB | 16.5MB | 445KB |
| governance-cost | Galerina governed ⟨interp⟩ | 81.0MB | 81.0MB | 16.6MB | 463KB |
| governance-cost | WASM ▶ production | 79.7MB | 79.7MB | 16.5MB | 51KB |
| hardware-targets | Rust AVX2 | — | — | — | — |
| hardware-targets | Rust (generic) | — | — | — | — |
| hardware-targets | Node.js | 48.0MB | 48.0MB | 4.5MB | 410KB |
| hardware-targets | Galerina passive ⟨interp⟩ | 80.5MB | 80.5MB | 16.7MB | 50KB |
| hardware-targets | Galerina manifest ⟨interp⟩ | 80.3MB | 80.3MB | 16.2MB | 36KB |
| hardware-targets | Galerina governed ⟨interp⟩ | 80.0MB | 80.0MB | 16.2MB | 36KB |
| hardware-targets | WASM ▶ production | 79.9MB | 79.9MB | 17.6MB | 152KB |
| low-memory | Rust AVX2 | — | — | — | — |
| low-memory | Rust (generic) | — | — | — | — |
| low-memory | Node.js | 46.3MB | 46.3MB | 4.1MB | 17KB |
| low-memory | Python | — | — | 272B | 272B |
| low-memory | Galerina passive ⟨interp⟩ | 80.7MB | 80.7MB | 16.7MB | -706KB |
| low-memory | Galerina manifest ⟨interp⟩ | 80.4MB | 80.4MB | 17.1MB | 869KB |
| low-memory | Galerina governed ⟨interp⟩ | 80.5MB | 80.5MB | 16.9MB | 656KB |
| low-memory | WASM ▶ production | 80.2MB | 80.2MB | 16.5MB | 41KB |
| gpu-compute | Rust AVX2 | — | — | — | — |
| gpu-compute | Rust (generic) | — | — | — | — |
| gpu-compute | Node.js | 46.3MB | 46.3MB | 4.1MB | 16KB |
| gpu-compute | Python | — | — | 304B | 304B |
| gpu-compute | Galerina passive ⟨interp⟩ | 80.6MB | 80.6MB | 16.6MB | 101KB |
| gpu-compute | Galerina manifest ⟨interp⟩ | 80.6MB | 80.6MB | 16.7MB | 411KB |
| gpu-compute | Galerina governed ⟨interp⟩ | 80.3MB | 80.3MB | 16.5MB | 202KB |
| gpu-compute | WASM ▶ production | 80.3MB | 80.3MB | 16.8MB | 3KB |
| gpu-compute | Deno WebGPU (NVIDIA GeForce RTX 2060) | — | — | — | — |
| matrix-multiply | Rust AVX2 | — | — | — | — |
| matrix-multiply | Rust (generic) | — | — | — | — |
| matrix-multiply | Node.js | 48.7MB | 48.7MB | 4.3MB | 143KB |
| matrix-multiply | Python | — | — | 392B | 392B |
| matrix-multiply | Galerina passive ⟨interp⟩ | 81.2MB | 81.2MB | 17.0MB | 84KB |
| matrix-multiply | Galerina manifest ⟨interp⟩ | 81.2MB | 81.2MB | 17.1MB | 770KB |
| matrix-multiply | Galerina governed ⟨interp⟩ | 80.2MB | 80.2MB | 17.1MB | 738KB |
| matrix-multiply | WASM ▶ production | 80.4MB | 80.4MB | 16.9MB | 41KB |
| matrix-multiply | Deno WebGPU (NVIDIA GeForce RTX 2060) | — | — | — | — |
| crypto-ops | Rust AVX2 | — | — | — | — |
| crypto-ops | Rust (generic) | — | — | — | — |
| crypto-ops | Node.js | — | — | — | — |
| crypto-ops | Python | — | — | 208B | 208B |
| crypto-ops | Galerina passive ⟨interp⟩ | 81.8MB | 81.8MB | 17.4MB | 550KB |
| crypto-ops | Galerina manifest ⟨interp⟩ | 81.4MB | 81.4MB | 16.5MB | 85KB |
| crypto-ops | Galerina governed ⟨interp⟩ | 81.4MB | 81.4MB | 16.5MB | 209KB |
| text-html | Rust AVX2 | — | — | — | — |
| text-html | Rust (generic) | — | — | — | — |
| text-html | Node.js | — | — | — | 470KB |
| text-html | Python | — | — | 208B | 208B |
| text-html | Galerina passive ⟨interp⟩ | 80.8MB | 80.8MB | 17.1MB | -367KB |
| text-html | Galerina manifest ⟨interp⟩ | 82.0MB | 82.0MB | 16.8MB | 116KB |
| text-html | Galerina governed ⟨interp⟩ | 82.0MB | 82.0MB | 16.9MB | 133KB |
| tri-logic | Rust AVX2 | — | — | — | — |
| tri-logic | Rust (generic) | — | — | — | — |
| tri-logic | Node.js | — | — | — | 1.0MB |
| tri-logic | Python | — | — | 360B | 360B |
| tri-logic | Galerina passive ⟨interp⟩ | 81.2MB | 81.2MB | 17.3MB | -1.7MB |
| tri-logic | Galerina manifest ⟨interp⟩ | 81.2MB | 81.2MB | 18.9MB | 2.0MB |
| tri-logic | Galerina governed ⟨interp⟩ | 80.7MB | 80.7MB | 19.0MB | 2.2MB |
| tri-logic | WASM ▶ production | 80.6MB | 80.6MB | 17.6MB | 2KB |
| data-query | Node.js | — | — | — | 168KB |
| data-query | Python | — | — | 312B | 312B |
| data-query | Galerina passive ⟨interp⟩ | 83.2MB | 83.2MB | 17.4MB | 233KB |
| data-query | Galerina manifest ⟨interp⟩ | 82.5MB | 82.5MB | 20.8MB | 4.0MB |
| data-query | Galerina governed ⟨interp⟩ | 82.2MB | 82.2MB | 20.8MB | 4.0MB |
| call-chain | Node.js | 46.9MB | 46.9MB | 4.1MB | 11KB |
| call-chain | Python | — | — | 368B | 368B |
| call-chain | Galerina passive ⟨interp⟩ | 92.8MB | 92.8MB | 22.7MB | 18KB |
| call-chain | Galerina manifest ⟨interp⟩ | 92.8MB | 92.8MB | 17.9MB | 998KB |
| call-chain | Galerina governed ⟨interp⟩ | 83.2MB | 83.2MB | 18.1MB | 1.2MB |
| nbody | Node.js | 48.3MB | 48.3MB | 4.2MB | 30KB |
| nbody | Python | — | — | 624B | 624B |
| nbody | Galerina passive ⟨interp⟩ | 93.2MB | 93.2MB | 18.1MB | 33KB |
| nbody | Galerina manifest ⟨interp⟩ | 93.2MB | 93.2MB | 18.1MB | 1.2MB |
| nbody | Galerina governed ⟨interp⟩ | 91.1MB | 91.1MB | 17.2MB | 274KB |
| json-parse | Node.js | — | — | — | 252KB |
| json-parse | Python | — | — | 520B | 520B |
| json-parse | Galerina passive ⟨interp⟩ | 92.9MB | 92.9MB | 21.5MB | 80KB |
| json-parse | Galerina manifest ⟨interp⟩ | 92.7MB | 92.7MB | 19.2MB | 1.9MB |
| json-parse | Galerina governed ⟨interp⟩ | 99.0MB | 99.0MB | 20.2MB | 3.3MB |
| mandelbrot | Rust (generic) | — | — | — | — |
| mandelbrot | Node.js | 48.2MB | 48.2MB | 4.8MB | 736KB |
| mandelbrot | Python | — | — | 3KB | 3KB |
| mandelbrot | Galerina passive ⟨interp⟩ | 94.4MB | 94.4MB | 20.6MB | 27KB |
| mandelbrot | Galerina manifest ⟨interp⟩ | 94.4MB | 94.4MB | 20.6MB | 3.4MB |
| mandelbrot | Galerina governed ⟨interp⟩ | 93.9MB | 93.9MB | 18.7MB | 1.4MB |
| spectral-norm | Rust (generic) | — | — | — | — |
| spectral-norm | Node.js | 48.0MB | 48.0MB | 4.4MB | 294KB |
| spectral-norm | Python | — | — | 4KB | 4KB |
| binary-trees | Rust (generic) | — | — | — | — |
| binary-trees | Node.js | 48.3MB | 48.3MB | 4.5MB | 427KB |
| binary-trees | Python | — | — | 368B | 368B |
| binary-trees | Galerina passive ⟨interp⟩ | 93.7MB | 93.7MB | 17.6MB | 14KB |
| binary-trees | Galerina manifest ⟨interp⟩ | 93.7MB | 93.7MB | 18.3MB | 1.1MB |
| binary-trees | Galerina governed ⟨interp⟩ | 93.7MB | 93.7MB | 19.3MB | 2.1MB |
| tmf-container | Rust (generic) | — | — | — | — |
| tmf-container | Node.js | 63.8MB | 63.8MB | 10.5MB | 3.5MB |
| tmf-container | Python | — | — | 5KB | 5KB |
| framework-pipeline | Node.js | 69.7MB | 69.7MB | 11.6MB | 6.3MB |
| framework-pipeline | Python | — | — | 2KB | 2KB |
| http-throughput | Node.js | — | — | — | — |
| naming-check | Node.js | — | — | — | — |
| context-receipt | Node.js | — | — | — | — |
| intelligence-search | Node.js | — | — | — | — |
| provenance-trace | Node.js | — | — | — | — |

> **Heap Δ** = heap after minus heap before execution. Negative means GC reclaimed memory during the run.
> **Galerina:** each tree-walker node evaluation allocates a new GalerinaValue object — visible as positive heap delta.

## 3. CPU Efficiency

| Benchmark | Runtime | Wall time | CPU time | CPU utilisation | Ops/CPU-ms |
|---|---|---|---|---|---|
| compute-mix | Rust AVX2 | 5.00s | — | — | — |
| compute-mix | Rust (generic) | 5.00s | — | — | — |
| compute-mix | Node.js | 5.00s | 5.00s | 100% | 134.3K ops/CPU-ms |
| compute-mix | Python | 5.02s | 5.02s | 100% | 986.92 ops/CPU-ms |
| compute-mix | Galerina passive ⟨interp⟩ | 0.2ms | 0.0ms | 0% | — |
| compute-mix | Galerina manifest ⟨interp⟩ | 221.7ms | 234.0ms | 106% | 213.68 ops/CPU-ms |
| compute-mix | Galerina governed ⟨interp⟩ | 232.3ms | 235.0ms | 101% | 212.77 ops/CPU-ms |
| compute-mix | WASM ▶ production | 1.22s | 1.22s | 100% | 123.1K ops/CPU-ms |
| arithmetic-threshold | Rust AVX2 | 12.8ms | — | — | — |
| arithmetic-threshold | Rust (generic) | 12.9ms | — | — | — |
| arithmetic-threshold | Node.js | 20.8ms | 16.0ms | 77% | 1.25M ops/CPU-ms |
| arithmetic-threshold | Python | 4.30s | 4.30s | 100% | 4.7K ops/CPU-ms |
| arithmetic-threshold | Galerina passive ⟨interp⟩ | 0.1ms | 0.0ms | 0% | — |
| arithmetic-threshold | Galerina manifest ⟨interp⟩ | 74.2ms | 125.0ms | 169% | 505.98 ops/CPU-ms |
| arithmetic-threshold | Galerina governed ⟨interp⟩ | 86.4ms | 78.0ms | 90% | 810.87 ops/CPU-ms |
| arithmetic-threshold | WASM ▶ production | 1.01s | 1.01s | 100% | 3.99M ops/CPU-ms |
| six-digit-guess | Rust AVX2 | 0.6ms | — | — | — |
| six-digit-guess | Rust (generic) | 0.6ms | — | — | — |
| six-digit-guess | Node.js | 15.0ms | 47.0ms | 314% | 895.11 ops/CPU-ms |
| six-digit-guess | Python | 423.2ms | 421.9ms | 100% | 99.72 ops/CPU-ms |
| six-digit-guess | Galerina passive ⟨interp⟩ | 0.1ms | 0.0ms | 0% | — |
| six-digit-guess | Galerina manifest ⟨interp⟩ | 889.6ms | 953.0ms | 107% | 44.14 ops/CPU-ms |
| six-digit-guess | Galerina governed ⟨interp⟩ | 894.6ms | 969.0ms | 108% | 43.41 ops/CPU-ms |
| six-digit-guess | WASM ▶ production | 1.04s | 1.05s | 100% | 80.4K ops/CPU-ms |
| record-allocation | Rust AVX2 | 8.5ms | — | — | — |
| record-allocation | Rust (generic) | 8.5ms | — | — | — |
| record-allocation | Node.js | 3.6ms | 0.0ms | 0% | — |
| record-allocation | Python | 38.0ms | 31.3ms | 82% | 6.4K ops/CPU-ms |
| record-allocation | Galerina passive ⟨interp⟩ | 0.2ms | 0.0ms | 0% | — |
| record-allocation | Galerina manifest ⟨interp⟩ | 18.1ms | 16.0ms | 88% | 625.00 ops/CPU-ms |
| record-allocation | Galerina governed ⟨interp⟩ | 20.4ms | 47.0ms | 230% | 212.77 ops/CPU-ms |
| record-allocation | WASM ▶ production | 1.00s | 1.00s | 100% | 2.34M ops/CPU-ms |
| fibonacci-recursive | Rust AVX2 | 403.5ms | — | — | — |
| fibonacci-recursive | Rust (generic) | 404.6ms | — | — | — |
| fibonacci-recursive | Node.js | 812.6ms | 797.0ms | 98% | 0.13 ops/CPU-ms |
| fibonacci-recursive | Python | 2.48s | 2.48s | 100% | 0.01 ops/CPU-ms |
| fibonacci-recursive | Galerina passive ⟨interp⟩ | 0.1ms | 0.0ms | 0% | — |
| fibonacci-recursive | Galerina manifest ⟨interp⟩ | 62.7ms | 109.0ms | 174% | 0.01 ops/CPU-ms |
| fibonacci-recursive | Galerina governed ⟨interp⟩ | 90.8ms | 140.0ms | 154% | 0.01 ops/CPU-ms |
| fibonacci-recursive | WASM ▶ production | 1.01s | 1.02s | 100% | 45.28 ops/CPU-ms |
| collection-pipeline | Rust AVX2 | 76.4ms | — | — | — |
| collection-pipeline | Rust (generic) | 233.7ms | — | — | — |
| collection-pipeline | Node.js | 733.8ms | 719.0ms | 98% | 69.5K ops/CPU-ms |
| collection-pipeline | Python | 2.33s | 2.33s | 100% | 21.5K ops/CPU-ms |
| collection-pipeline | Galerina passive ⟨interp⟩ | 0.3ms | 0.0ms | 0% | — |
| collection-pipeline | Galerina manifest ⟨interp⟩ | 14.9ms | 16.0ms | 107% | 625.00 ops/CPU-ms |
| collection-pipeline | Galerina governed ⟨interp⟩ | 16.0ms | 15.0ms | 94% | 666.67 ops/CPU-ms |
| collection-pipeline | WASM ▶ production | 1.00s | 1.02s | 101% | 2.35M ops/CPU-ms |
| governance-cost | Rust AVX2 | 11.2ms | — | — | — |
| governance-cost | Rust (generic) | 11.1ms | — | — | — |
| governance-cost | Node.js | 47.4ms | 47.0ms | 99% | 2.1K ops/CPU-ms |
| governance-cost | Python | 2.74s | 2.75s | 100% | 36.36 ops/CPU-ms |
| governance-cost | Galerina passive ⟨interp⟩ | 1.2ms | 0.0ms | 0% | — |
| governance-cost | Galerina manifest ⟨interp⟩ | 1.4ms | 0.0ms | 0% | — |
| governance-cost | Galerina governed ⟨interp⟩ | 1.2ms | 0.0ms | 0% | — |
| governance-cost | WASM ▶ production | 1.00s | 1.00s | 100% | 16.6K ops/CPU-ms |
| hardware-targets | Rust AVX2 | 852.8ms | — | — | — |
| hardware-targets | Rust (generic) | 853.0ms | — | — | — |
| hardware-targets | Node.js | 1.13s | 1.13s | 100% | 888.89 ops/CPU-ms |
| hardware-targets | Galerina passive ⟨interp⟩ | 9.2ms | 0.0ms | 0% | — |
| hardware-targets | Galerina manifest ⟨interp⟩ | 0.2ms | 0.0ms | 0% | — |
| hardware-targets | Galerina governed ⟨interp⟩ | 0.1ms | 0.0ms | 0% | — |
| hardware-targets | WASM ▶ production | 1.00s | 1.02s | 102% | 434.8K ops/CPU-ms |
| low-memory | Rust AVX2 | 164.0ms | — | — | — |
| low-memory | Rust (generic) | 743.8ms | — | — | — |
| low-memory | Node.js | 70.5ms | 62.0ms | 88% | 806.5K ops/CPU-ms |
| low-memory | Python | 1.80s | 1.80s | 100% | 5.6K ops/CPU-ms |
| low-memory | Galerina passive ⟨interp⟩ | 0.4ms | 0.0ms | 0% | — |
| low-memory | Galerina manifest ⟨interp⟩ | 86.4ms | 93.0ms | 108% | 107.53 ops/CPU-ms |
| low-memory | Galerina governed ⟨interp⟩ | 81.9ms | 157.0ms | 192% | 63.69 ops/CPU-ms |
| low-memory | WASM ▶ production | 1.01s | 1.02s | 101% | 689.0K ops/CPU-ms |
| gpu-compute | Rust AVX2 | 4.27s | — | — | — |
| gpu-compute | Rust (generic) | 4.25s | — | — | — |
| gpu-compute | Node.js | 507.9ms | 500.0ms | 98% | 1000.0K ops/CPU-ms |
| gpu-compute | Python | 3.99s | 3.98s | 100% | 12.5K ops/CPU-ms |
| gpu-compute | Galerina passive ⟨interp⟩ | 0.1ms | 0.0ms | 0% | — |
| gpu-compute | Galerina manifest ⟨interp⟩ | 263.1ms | 250.0ms | 95% | 400.00 ops/CPU-ms |
| gpu-compute | Galerina governed ⟨interp⟩ | 268.9ms | 311.0ms | 116% | 321.54 ops/CPU-ms |
| gpu-compute | WASM ▶ production | 1.03s | 1.03s | 100% | 1.55M ops/CPU-ms |
| gpu-compute | Deno WebGPU (NVIDIA GeForce RTX 2060) | 25.0ms | — | — | — |
| matrix-multiply | Rust AVX2 | 91.6ms | — | — | — |
| matrix-multiply | Rust (generic) | 86.9ms | — | — | — |
| matrix-multiply | Node.js | 217.4ms | 219.0ms | 101% | — |
| matrix-multiply | Python | 1.35s | — | — | — |
| matrix-multiply | Galerina passive ⟨interp⟩ | 0.1ms | 0.0ms | 0% | — |
| matrix-multiply | Galerina manifest ⟨interp⟩ | 57.6ms | 63.0ms | 109% | — |
| matrix-multiply | Galerina governed ⟨interp⟩ | 55.0ms | 78.0ms | 142% | — |
| matrix-multiply | WASM ▶ production | 1.01s | 1.01s | 101% | — |
| matrix-multiply | Deno WebGPU (NVIDIA GeForce RTX 2060) | 12.5ms | — | — | — |
| crypto-ops | Galerina passive ⟨interp⟩ | 5.2ms | 0.0ms | 0% | — |
| crypto-ops | Galerina manifest ⟨interp⟩ | 0.5ms | 0.0ms | 0% | — |
| crypto-ops | Galerina governed ⟨interp⟩ | 3.6ms | 0.0ms | 0% | — |
| text-html | Galerina passive ⟨interp⟩ | 1.3ms | 0.0ms | 0% | — |
| text-html | Galerina manifest ⟨interp⟩ | 0.3ms | 0.0ms | 0% | — |
| text-html | Galerina governed ⟨interp⟩ | 1.0ms | 0.0ms | 0% | — |
| tri-logic | Galerina passive ⟨interp⟩ | 0.9ms | 0.0ms | 0% | — |
| tri-logic | Galerina manifest ⟨interp⟩ | 817.7ms | 844.0ms | 103% | — |
| tri-logic | Galerina governed ⟨interp⟩ | 865.4ms | 891.0ms | 103% | — |
| tri-logic | WASM ▶ production | 1.16s | 1.16s | 100% | — |
| data-query | Galerina passive ⟨interp⟩ | 0.4ms | 0.0ms | 0% | — |
| data-query | Galerina manifest ⟨interp⟩ | 7.6ms | 0.0ms | 0% | — |
| data-query | Galerina governed ⟨interp⟩ | 7.9ms | 0.0ms | 0% | — |
| call-chain | Node.js | 6.5ms | 0.0ms | 0% | — |
| call-chain | Python | 477.8ms | 468.8ms | 98% | 2.1K ops/CPU-ms |
| call-chain | Galerina passive ⟨interp⟩ | 0.1ms | 0.0ms | 0% | — |
| call-chain | Galerina manifest ⟨interp⟩ | 907.7ms | 938.0ms | 103% | 53.30 ops/CPU-ms |
| call-chain | Galerina governed ⟨interp⟩ | 822.3ms | 890.0ms | 108% | 56.18 ops/CPU-ms |
| nbody | Node.js | 53.2ms | 63.0ms | 118% | 104.0K ops/CPU-ms |
| nbody | Python | 1.10s | — | — | — |
| nbody | Galerina passive ⟨interp⟩ | 0.1ms | 0.0ms | 0% | — |
| nbody | Galerina manifest ⟨interp⟩ | 563.3ms | 594.0ms | 105% | 55.17 ops/CPU-ms |
| nbody | Galerina governed ⟨interp⟩ | 559.9ms | 562.0ms | 100% | 58.31 ops/CPU-ms |
| json-parse | Galerina passive ⟨interp⟩ | 0.2ms | 0.0ms | 0% | — |
| json-parse | Galerina manifest ⟨interp⟩ | 53.5ms | 63.0ms | 118% | 7.94 ops/CPU-ms |
| json-parse | Galerina governed ⟨interp⟩ | 68.0ms | 109.0ms | 160% | 4.59 ops/CPU-ms |
| mandelbrot | Rust (generic) | 140.1ms | — | — | — |
| mandelbrot | Node.js | 526.2ms | 516.0ms | 98% | 6.4K ops/CPU-ms |
| mandelbrot | Python | 12.97s | — | — | — |
| mandelbrot | Galerina passive ⟨interp⟩ | 0.1ms | 0.0ms | 0% | — |
| mandelbrot | Galerina manifest ⟨interp⟩ | 2.26s | 2.30s | 102% | 7.13 ops/CPU-ms |
| mandelbrot | Galerina governed ⟨interp⟩ | 2.06s | 2.08s | 101% | 7.88 ops/CPU-ms |
| spectral-norm | Rust (generic) | 26.9ms | — | — | — |
| spectral-norm | Node.js | 46.9ms | 47.0ms | 100% | 212.8K ops/CPU-ms |
| spectral-norm | Python | 3.74s | — | — | — |
| binary-trees | Rust (generic) | 6.7ms | — | — | — |
| binary-trees | Node.js | 1.8ms | 0.0ms | 0% | — |
| binary-trees | Python | 25.5ms | 31.3ms | 123% | 4.3K ops/CPU-ms |
| binary-trees | Galerina passive ⟨interp⟩ | 0.0ms | 0.0ms | 0% | — |
| binary-trees | Galerina manifest ⟨interp⟩ | 32.5ms | 63.0ms | 194% | 2.2K ops/CPU-ms |
| binary-trees | Galerina governed ⟨interp⟩ | 36.2ms | 47.0ms | 130% | 2.9K ops/CPU-ms |
| tmf-container | Rust (generic) | 1.65s | — | — | — |
| tmf-container | Node.js | 6.34s | 7.73s | 122% | 38.79 ops/CPU-ms |
| tmf-container | Python | 1.13s | — | — | — |
| framework-pipeline | Node.js | 507.5ms | 1.13s | 222% | 177.78 ops/CPU-ms |
| framework-pipeline | Python | 1.66s | — | — | — |
| http-throughput | Node.js | 80.0ms | — | — | — |
| naming-check | Node.js | 279.0ms | — | — | — |
| context-receipt | Node.js | 191.0ms | — | — | — |
| intelligence-search | Node.js | 34.0ms | — | — | — |
| provenance-trace | Node.js | 971.0ms | — | — | — |

> **CPU utilisation** = CPU ms ÷ wall ms × 100. Node.js approaches 100% (single-thread JIT). Python may show <100% on Windows where process_time measures differently.

## 4. Per-Benchmark Detail

> **Heap/op** = heap bytes allocated per operation (the fair, workload-attributable memory metric).
> Managed runtimes (Node/Python/Galerina/WASM) report it via a GC'd before/after delta; native Rust/C++
> show **~0 (native)** — no GC-managed heap. `~0` = no measurable per-op allocation (e.g. V8 tagged ints);
> a large positive value (e.g. the Galerina tree-walker boxing a value per AST node) is allocation pressure.

### compute-mix

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Galerina passive ⟨interp⟩ | 850.82M/s | 0.2ms | 0.0ms | 76.8MB | ~0 | 863.3× | 6.34× |
| 🥈 | 🟢 | Node.js | 134.27M/s | 5.00s | 5.00s | 41.3MB | ~0 | 136.2× | 1.00× |
| 🥉 | 🟢 | Rust (generic) | 130.91M/s | 5.00s | — | — | ~0 (native) | 132.8× | 0.97× |
| 4 | 🟢 | Rust AVX2 | 128.94M/s | 5.00s | — | — | ~0 (native) | 130.8× | 0.96× |
| 5 | 🟢 | WASM ▶ production | 122.79M/s | 1.22s | 1.22s | 71.2MB | ~0 | 124.6× | 0.91× |
| 6 | ⚫ | Python | 985.6K/s | 5.02s | 5.02s | — | ~0 | 1.00× | 0.01× |
| 7 | ⚫ | Galerina manifest ⟨interp⟩ | 225.5K/s | 221.7ms | 234.0ms | 76.8MB | 19 B/op | 0.23× | 0.00× |
| 8 | ⚫ | Galerina governed ⟨interp⟩ | 215.2K/s | 232.3ms | 235.0ms | 76.6MB | 33 B/op | 0.22× | 0.00× |

> 🧠 **Lowest heap/op:** WASM ▶ production (~0) · **highest:** Galerina governed ⟨interp⟩ (33 B/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### arithmetic-threshold

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | WASM ▶ production | 4.01B/s | 1.01s | 1.01s | 78.0MB | ~0 | 861.6× | 4.18× |
| 🥈 | 🟢 | Rust AVX2 | 1.56B/s | 12.8ms | — | — | ~0 (native) | 335.1× | 1.62× |
| 🥉 | 🟢 | Rust (generic) | 1.55B/s | 12.9ms | — | — | ~0 (native) | 333.6× | 1.62× |
| 4 | 🟢 | Node.js | 959.40M/s | 20.8ms | 16.0ms | 47.0MB | ~0 | 206.3× | 1.00× |
| 5 | ⚫ | Python | 4.65M/s | 4.30s | 4.30s | — | ~0 | 1.00× | 0.00× |
| 6 | ⚫ | Galerina manifest ⟨interp⟩ | 852.6K/s | 74.2ms | 125.0ms | 77.5MB | 25 B/op | 0.18× | 0.00× |
| 7 | ⚫ | Galerina governed ⟨interp⟩ | 731.8K/s | 86.4ms | 78.0ms | 77.5MB | 3 B/op | 0.16× | 0.00× |
| 8 | ⚫ | Galerina passive ⟨interp⟩ | 45.0K/s | 0.1ms | 0.0ms | 77.5MB | 3.0 KB/op | 0.01× | 0.00× |

> 🧠 **Lowest heap/op:** WASM ▶ production (~0) · **highest:** Galerina passive ⟨interp⟩ (3.0 KB/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### six-digit-guess

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | WASM ▶ production | 80.60M/s | 1.04s | 1.05s | 77.9MB | ~0 | 810.8× | 28.7× |
| 🥈 | 🟢 | Rust (generic) | 76.16M/s | 0.6ms | — | — | ~0 (native) | 766.1× | 27.1× |
| 🥉 | 🟢 | Rust AVX2 | 74.34M/s | 0.6ms | — | — | ~0 (native) | 747.9× | 26.5× |
| 4 | 🟢 | Node.js | 2.81M/s | 15.0ms | 47.0ms | 51.8MB | 27 B/op | 28.3× | 1.00× |
| 5 | 🔴 | Python | 99.4K/s | 423.2ms | 421.9ms | — | ~0 | 1.00× | 0.04× |
| 6 | 🔴 | Galerina manifest ⟨interp⟩ | 47.3K/s | 889.6ms | 953.0ms | 79.3MB | 13 B/op | 0.48× | 0.02× |
| 7 | 🔴 | Galerina governed ⟨interp⟩ | 47.0K/s | 894.6ms | 969.0ms | 79.0MB | 19 B/op | 0.47× | 0.02× |
| 8 | 🔴 | Galerina passive ⟨interp⟩ | 38.0K/s | 0.1ms | 0.0ms | 79.5MB | 11.9 KB/op | 0.38× | 0.01× |

> 🧠 **Lowest heap/op:** WASM ▶ production (~0) · **highest:** Galerina passive ⟨interp⟩ (11.9 KB/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### record-allocation

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | WASM ▶ production | 2.34B/s | 1.00s | 1.00s | 79.0MB | ~0 | 444.1× | 41.8× |
| 🥈 | 🟢 | Rust AVX2 | 1.17B/s | 8.5ms | — | — | ~0 (native) | 222.7× | 21.0× |
| 🥉 | 🟢 | Rust (generic) | 1.17B/s | 8.5ms | — | — | ~0 (native) | 222.6× | 21.0× |
| 4 | 🟢 | Galerina passive ⟨interp⟩ | 1.01B/s | 0.2ms | 0.0ms | 79.9MB | ~0 | 191.8× | 18.1× |
| 5 | 🟢 | Node.js | 55.85M/s | 3.6ms | 0.0ms | 48.1MB | 1 B/op | 10.6× | 1.00× |
| 6 | 🔴 | Python | 5.26M/s | 38.0ms | 31.3ms | — | ~0 | 1.00× | 0.09× |
| 7 | ⚫ | Galerina manifest ⟨interp⟩ | 551.9K/s | 18.1ms | 16.0ms | 79.2MB | 71 B/op | 0.10× | 0.01× |
| 8 | ⚫ | Galerina governed ⟨interp⟩ | 489.7K/s | 20.4ms | 47.0ms | 79.9MB | 72 B/op | 0.09× | 0.01× |

> 🧠 **Lowest heap/op:** WASM ▶ production (~0) · **highest:** Galerina governed ⟨interp⟩ (72 B/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### fibonacci-recursive

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Galerina passive ⟨interp⟩ | 83.2K/s | 0.1ms | 0.0ms | 80.0MB | 6.3 KB/op | 10.3K× | 676.0× |
| 🥈 | 🟢 | WASM ▶ production | 45.3K/s | 1.01s | 1.02s | 79.6MB | ~0 | 5.6K× | 368.4× |
| 🥉 | 🟢 | Rust AVX2 | 495.6/s | 403.5ms | — | — | ~0 (native) | 61.4× | 4.03× |
| 4 | 🟢 | Rust (generic) | 494.3/s | 404.6ms | — | — | ~0 (native) | 61.2× | 4.02× |
| 5 | 🟢 | Node.js | 123.1/s | 812.6ms | 797.0ms | 46.2MB | 53 B/op | 15.2× | 1.00× |
| 6 | 🟡 | Galerina manifest ⟨interp⟩ | 16.0/s | 62.7ms | 109.0ms | 79.5MB | 1326.1 KB/op | 1.98× | 0.13× |
| 7 | 🔴 | Galerina governed ⟨interp⟩ | 11.0/s | 90.8ms | 140.0ms | 79.8MB | 1046.5 KB/op | 1.36× | 0.09× |
| 8 | 🔴 | Python | 8.1/s | 2.48s | 2.48s | — | 23 B/op | 1.00× | 0.07× |

> 🧠 **Lowest heap/op:** WASM ▶ production (~0) · **highest:** Galerina manifest ⟨interp⟩ (1326.1 KB/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### collection-pipeline

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Rust AVX2 | 13.10B/s | 76.4ms | — | — | ~0 (native) | 609.8× | 192.2× |
| 🥈 | 🟢 | Rust (generic) | 4.28B/s | 233.7ms | — | — | ~0 (native) | 199.3× | 62.8× |
| 🥉 | 🟢 | WASM ▶ production | 2.38B/s | 1.00s | 1.02s | 79.8MB | ~0 | 110.9× | 34.9× |
| 4 | 🟢 | Galerina passive ⟨interp⟩ | 1.16B/s | 0.3ms | 0.0ms | 79.4MB | ~0 | 54.2× | 17.1× |
| 5 | 🟢 | Node.js | 68.14M/s | 733.8ms | 719.0ms | 63.1MB | ~0 | 3.17× | 1.00× |
| 6 | 🟡 | Python | 21.48M/s | 2.33s | 2.33s | — | ~0 | 1.00× | 0.32× |
| 7 | ⚫ | Galerina manifest ⟨interp⟩ | 670.7K/s | 14.9ms | 16.0ms | 79.3MB | 11 B/op | 0.03× | 0.01× |
| 8 | ⚫ | Galerina governed ⟨interp⟩ | 625.0K/s | 16.0ms | 15.0ms | 80.3MB | 9 B/op | 0.03× | 0.01× |

> 🧠 **Lowest heap/op:** WASM ▶ production (~0) · **highest:** Galerina manifest ⟨interp⟩ (11 B/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### governance-cost

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Rust (generic) | 901.62M/s | 11.1ms | — | — | ~0 (native) | 24.7K× | 427.4× |
| 🥈 | 🟢 | Rust AVX2 | 895.70M/s | 11.2ms | — | — | ~0 (native) | 24.6K× | 424.6× |
| 🥉 | 🟢 | WASM ▶ production | 16.61M/s | 1.00s | 1.00s | 79.7MB | ~0 | 455.2× | 7.87× |
| 4 | 🟢 | Node.js | 2.11M/s | 47.4ms | 47.0ms | 46.1MB | ~0 | 57.8× | 1.00× |
| 5 | 🔴 | Galerina passive ⟨interp⟩ | 80.3K/s | 1.2ms | 0.0ms | 81.3MB | 8.1 KB/op | 2.20× | 0.04× |
| 6 | 🔴 | Python | 36.5K/s | 2.74s | 2.75s | — | ~0 | 1.00× | 0.02× |
| 7 | ⚫ | Galerina governed ⟨interp⟩ | 820.0/s | 1.2ms | 0.0ms | 81.0MB | 451.7 KB/op | 0.02× | 0.00× |
| 8 | ⚫ | Galerina manifest ⟨interp⟩ | 690.0/s | 1.4ms | 0.0ms | 82.8MB | 434.2 KB/op | 0.02× | 0.00× |

> 🧠 **Lowest heap/op:** WASM ▶ production (~0) · **highest:** Galerina governed ⟨interp⟩ (451.7 KB/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### hardware-targets

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | WASM ▶ production | 441.71M/s | 1.00s | 1.02s | 79.9MB | ~0 | — | 497.5× |
| 🥈 | 🟢 | Rust AVX2 | 1.17M/s | 852.8ms | — | — | ~0 (native) | — | 1.32× |
| 🥉 | 🟢 | Rust (generic) | 1.17M/s | 853.0ms | — | — | ~0 (native) | — | 1.32× |
| 4 | 🟢 | Node.js | 887.8K/s | 1.13s | 1.13s | 48.0MB | ~0 | — | 1.00× |
| 5 | 🟡 | Galerina passive ⟨interp⟩ | 108.8K/s | 9.2ms | 0.0ms | 80.5MB | 50 B/op | — | 0.12× |
| 6 | ⚫ | Galerina governed ⟨interp⟩ | 6.7K/s | 0.1ms | 0.0ms | 80.0MB | 35.6 KB/op | — | 0.01× |
| 7 | ⚫ | Galerina manifest ⟨interp⟩ | 4.5K/s | 0.2ms | 0.0ms | 80.3MB | 35.6 KB/op | — | 0.01× |

> 🧠 **Lowest heap/op:** WASM ▶ production (~0) · **highest:** Galerina manifest ⟨interp⟩ (35.6 KB/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### low-memory

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Rust AVX2 | 6.10B/s | 164.0ms | — | — | ~0 | 1.1K× | 8.59× |
| 🥈 | 🟢 | Rust (generic) | 1.34B/s | 743.8ms | — | — | ~0 | 241.4× | 1.89× |
| 🥉 | 🟢 | Node.js | 709.57M/s | 70.5ms | 62.0ms | 46.3MB | ~0 | 127.4× | 1.00× |
| 4 | 🟢 | WASM ▶ production | 695.66M/s | 1.01s | 1.02s | 80.2MB | ~0 | 124.9× | 0.98× |
| 5 | ⚪ | Galerina passive ⟨interp⟩ | 508.00M/s | 0.4ms | 0.0ms | 80.7MB | -4 B/op | 91.2× | 0.72× |
| 6 | ⚫ | Python | 5.57M/s | 1.80s | 1.80s | — | ~0 | 1.00× | 0.01× |
| 7 | ⚫ | Galerina governed ⟨interp⟩ | 122.1K/s | 81.9ms | 157.0ms | 80.5MB | 66 B/op | 0.02× | 0.00× |
| 8 | ⚫ | Galerina manifest ⟨interp⟩ | 115.7K/s | 86.4ms | 93.0ms | 80.4MB | 87 B/op | 0.02× | 0.00× |

> 🧠 **Lowest heap/op:** Galerina passive ⟨interp⟩ (-4 B/op) · **highest:** Galerina manifest ⟨interp⟩ (87 B/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### gpu-compute

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Galerina passive ⟨interp⟩ | 8.35B/s | 0.1ms | 0.0ms | 80.6MB | ~0 | 666.4× | 8.48× |
| 🥈 | 🟢 | WASM ▶ production | 1.56B/s | 1.03s | 1.03s | 80.3MB | ~0 | 124.3× | 1.58× |
| 🥉 | 🟢 | Rust (generic) | 1.18B/s | 4.25s | — | — | ~0 (native) | 94.0× | 1.20× |
| 4 | 🟢 | Rust AVX2 | 1.17B/s | 4.27s | — | — | ~0 (native) | 93.5× | 1.19× |
| 5 | 🟢 | Node.js | 984.45M/s | 507.9ms | 500.0ms | 46.3MB | ~0 | 78.6× | 1.00× |
| 6 | 🔴 | Python | 12.53M/s | 3.99s | 3.98s | — | ~0 | 1.00× | 0.01× |
| 7 | ⚫ | Deno WebGPU (NVIDIA GeForce RTX 2060) | 4.00M/s | 25.0ms | — | — | — | 0.32× | 0.00× |
| 8 | ⚫ | Galerina manifest ⟨interp⟩ | 380.0K/s | 263.1ms | 250.0ms | 80.6MB | 4 B/op | 0.03× | 0.00× |
| 9 | ⚫ | Galerina governed ⟨interp⟩ | 371.8K/s | 268.9ms | 311.0ms | 80.3MB | 2 B/op | 0.03× | 0.00× |

> 🧠 **Lowest heap/op:** WASM ▶ production (~0) · **highest:** Galerina manifest ⟨interp⟩ (4 B/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### matrix-multiply ⚠️ (excluded — not unit-aligned)

> workload SIZE differs by runtime — Galerina/WASM n=32 (1024 cells, 32³ mul-adds), node/python/rust n=64 (4096 cells, 64³), Deno n=128 (16384 cells). Per-cell work (dot-product length n) also differs, so no shared unit is apples-to-apples until n is unified.

| Runtime | Raw reported throughput (native unit — **NOT comparable**) | Wall |
|---|---|---|
| Rust AVX2 | 5.5K/s | 91.6ms |
| Rust (generic) | 5.8K/s | 86.9ms |
| Node.js | 2.3K/s | 217.4ms |
| Python | 37.1/s | 1.35s |
| Galerina passive ⟨interp⟩ | 58.7K/s | 0.1ms |
| Galerina manifest ⟨interp⟩ | 17.0/s | 57.6ms |
| Galerina governed ⟨interp⟩ | 18.0/s | 55.0ms |
| WASM ▶ production | 73.29M/s | 1.01s |
| Deno WebGPU (NVIDIA GeForce RTX 2060) | 802.0/s | 12.5ms |

### crypto-ops

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Galerina passive ⟨interp⟩ | 19.1K/s | 5.2ms | 0.0ms | 81.8MB | 5.4 KB/op | — | — |
| 🥈 | 🟡 | Galerina manifest ⟨interp⟩ | 2.0K/s | 0.5ms | 0.0ms | 81.4MB | 82.8 KB/op | — | — |
| 🥉 | 🔴 | Galerina governed ⟨interp⟩ | 274.0/s | 3.6ms | 0.0ms | 81.4MB | 204.0 KB/op | — | — |

> 🧠 **Lowest heap/op:** Galerina passive ⟨interp⟩ (5.4 KB/op) · **highest:** Galerina governed ⟨interp⟩ (204.0 KB/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### text-html

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Galerina passive ⟨interp⟩ | 75.7K/s | 1.3ms | 0.0ms | 80.8MB | -3.6 KB/op | — | — |
| 🥈 | 🔴 | Galerina manifest ⟨interp⟩ | 3.2K/s | 0.3ms | 0.0ms | 82.0MB | 113.5 KB/op | — | — |
| 🥉 | 🔴 | Galerina governed ⟨interp⟩ | 1.0K/s | 1.0ms | 0.0ms | 82.0MB | 129.7 KB/op | — | — |

> 🧠 **Lowest heap/op:** Galerina passive ⟨interp⟩ (-3.6 KB/op) · **highest:** Galerina governed ⟨interp⟩ (129.7 KB/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### tri-logic ⚠️ (excluded — not unit-aligned)

> incomparable workloads — Galerina main()=runBulkTri(100000) (100k triples / 300k trit-ops); node/python/rust run nested 9-element truth-table micro-benches plus a separate 10M bulk; galerinaOpsPerRun=27000 (≈27 truth-table combos ×1000) corresponds to none of these. Needs a common bulk-N trit-op path on every runtime.

| Runtime | Raw reported throughput (native unit — **NOT comparable**) | Wall |
|---|---|---|
| Rust AVX2 | — | — |
| Rust (generic) | — | — |
| Node.js | — | — |
| Python | — | — |
| Galerina passive ⟨interp⟩ | 113.7K/s | 0.9ms |
| Galerina manifest ⟨interp⟩ | 1.0/s | 817.7ms |
| Galerina governed ⟨interp⟩ | 1.0/s | 865.4ms |
| WASM ▶ production | 518.52M/s | 1.16s |

### data-query ⚠️ (excluded — not unit-aligned)

> incomparable — Galerina main()=filterAndCount(1000)+groupByCategory(1000)=2000 record-scans (but galerinaOpsPerRun=1000 undercounts); node/python run 7 separate query micro-benches nested under results.* with no single representative. Needs a main() recount + a chosen representative query before the numbers compare.

| Runtime | Raw reported throughput (native unit — **NOT comparable**) | Wall |
|---|---|---|
| Node.js | — | — |
| Python | — | — |
| Galerina passive ⟨interp⟩ | 112.3K/s | 0.4ms |
| Galerina manifest ⟨interp⟩ | 132.0/s | 7.6ms |
| Galerina governed ⟨interp⟩ | 126.0/s | 7.9ms |

### call-chain

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Galerina passive ⟨interp⟩ | 4.99B/s | 0.1ms | 0.0ms | 92.8MB | ~0 | 2.4K× | 16.2× |
| 🥈 | 🟢 | Node.js | 307.73M/s | 6.5ms | 0.0ms | 46.9MB | ~0 | 147.0× | 1.00× |
| 🥉 | ⚫ | Python | 2.09M/s | 477.8ms | 468.8ms | — | ~0 | 1.00× | 0.01× |
| 4 | ⚫ | Galerina governed ⟨interp⟩ | 60.8K/s | 822.3ms | 890.0ms | 83.2MB | 24 B/op | 0.03× | 0.00× |
| 5 | ⚫ | Galerina manifest ⟨interp⟩ | 55.1K/s | 907.7ms | 938.0ms | 92.8MB | 20 B/op | 0.03× | 0.00× |

> 🧠 **Lowest heap/op:** Node.js (~0) · **highest:** Galerina governed ⟨interp⟩ (24 B/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### nbody

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Galerina passive ⟨interp⟩ | 2.24B/s | 0.1ms | 0.0ms | 93.2MB | ~0 | 1.5K× | 18.2× |
| 🥈 | 🟢 | Node.js | 123.09M/s | 53.2ms | 63.0ms | 48.3MB | ~0 | 82.9× | 1.00× |
| 🥉 | 🔴 | Python | 1.48M/s | 1.10s | — | — | 12 B/op | 1.00× | 0.01× |
| 4 | ⚫ | Galerina governed ⟨interp⟩ | 58.5K/s | 559.9ms | 562.0ms | 91.1MB | 8 B/op | 0.04× | 0.00× |
| 5 | ⚫ | Galerina manifest ⟨interp⟩ | 58.2K/s | 563.3ms | 594.0ms | 93.2MB | 36 B/op | 0.04× | 0.00× |

> 🧠 **Lowest heap/op:** Node.js (~0) · **highest:** Galerina manifest ⟨interp⟩ (36 B/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### json-parse

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Galerina passive ⟨interp⟩ | 47.30M/s | 0.2ms | 0.0ms | 92.9MB | 8 B/op | 74.5× | 14.3× |
| 🥈 | 🟢 | Node.js | 3.32M/s | — | — | — | — | 5.23× | 1.00× |
| 🥉 | 🟡 | Python | 635.0K/s | — | — | — | 1 B/op | 1.00× | 0.19× |
| 4 | ⚫ | Galerina manifest ⟨interp⟩ | 9.3K/s | 53.5ms | 63.0ms | 92.7MB | 3.7 KB/op | 0.01× | 0.00× |
| 5 | ⚫ | Galerina governed ⟨interp⟩ | 7.4K/s | 68.0ms | 109.0ms | 99.0MB | 6.4 KB/op | 0.01× | 0.00× |

> 🧠 **Lowest heap/op:** Python (1 B/op) · **highest:** Galerina governed ⟨interp⟩ (6.4 KB/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### mandelbrot

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Galerina passive ⟨interp⟩ | 1.20B/s | 0.1ms | 0.0ms | 94.4MB | ~0 | 4.7K× | 192.0× |
| 🥈 | 🟢 | Rust (generic) | 23.39M/s | 140.1ms | — | — | ~0 (native) | 92.5× | 3.76× |
| 🥉 | 🟢 | Node.js | 6.23M/s | 526.2ms | 516.0ms | 48.2MB | ~0 | 24.6× | 1.00× |
| 4 | 🔴 | Python | 252.7K/s | 12.97s | — | — | ~0 | 1.00× | 0.04× |
| 5 | ⚫ | Galerina governed ⟨interp⟩ | 7.9K/s | 2.06s | 2.08s | 93.9MB | 83 B/op | 0.03× | 0.00× |
| 6 | ⚫ | Galerina manifest ⟨interp⟩ | 7.2K/s | 2.26s | 2.30s | 94.4MB | 209 B/op | 0.03× | 0.00× |

> 🧠 **Lowest heap/op:** Python (~0) · **highest:** Galerina manifest ⟨interp⟩ (209 B/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### spectral-norm

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Rust (generic) | 371.32M/s | 26.9ms | — | — | ~0 (native) | 138.7× | 1.74× |
| 🥈 | 🟢 | Node.js | 213.17M/s | 46.9ms | 47.0ms | 48.0MB | ~0 | 79.6× | 1.00× |
| 🥉 | 🔴 | Python | 2.68M/s | 3.74s | — | — | ~0 | 1.00× | 0.01× |

> 🧠 **Lowest heap/op:** Python (~0) · **highest:** Node.js (~0). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### binary-trees

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Galerina passive ⟨interp⟩ | 10.90B/s | 0.0ms | 0.0ms | 93.7MB | ~0 | 2.0K× | 143.5× |
| 🥈 | 🟢 | Node.js | 75.95M/s | 1.8ms | 0.0ms | 48.3MB | 3 B/op | 14.2× | 1.00× |
| 🥉 | 🟡 | Rust (generic) | 20.36M/s | 6.7ms | — | — | ~0 (native) | 3.81× | 0.27× |
| 4 | 🔴 | Python | 5.34M/s | 25.5ms | 31.3ms | — | ~0 | 1.00× | 0.07× |
| 5 | 🔴 | Galerina manifest ⟨interp⟩ | 4.18M/s | 32.5ms | 63.0ms | 93.7MB | 8 B/op | 0.78× | 0.06× |
| 6 | 🔴 | Galerina governed ⟨interp⟩ | 3.75M/s | 36.2ms | 47.0ms | 93.7MB | 15 B/op | 0.70× | 0.05× |

> 🧠 **Lowest heap/op:** Python (~0) · **highest:** Galerina governed ⟨interp⟩ (15 B/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### tmf-container

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Rust (generic) | 182.3K/s | 1.65s | — | — | ~0 (native) | 2.07× | 3.86× |
| 🥈 | 🟢 | Python | 88.1K/s | 1.13s | — | — | ~0 | 1.00× | 1.86× |
| 🥉 | 🟢 | Node.js | 47.3K/s | 6.34s | 7.73s | 63.8MB | 12 B/op | 0.54× | 1.00× |

> 🧠 **Lowest heap/op:** Python (~0) · **highest:** Node.js (12 B/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### framework-pipeline

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Node.js | 394.1K/s | 507.5ms | 1.13s | 69.7MB | 32 B/op | 3.27× | 1.00× |
| 🥈 | 🟡 | Python | 120.4K/s | 1.66s | — | — | ~0 | 1.00× | 0.31× |

> 🧠 **Lowest heap/op:** Python (~0) · **highest:** Node.js (32 B/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### http-throughput

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|

### naming-check

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|

### context-receipt

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|

### intelligence-search

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|

### provenance-trace

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|


## 4b. GPU-Compute Workload (parallel map-reduce)

> A **GPU-shaped** workload: a per-element kernel `f(i)=i*2+1` applied across 100,000 elements + reduction.
> On a GPU this parallelises across thousands of threads. 🖥️ CPU = running on CPU; 🎮 GPU = real GPU dispatch.

**GPU detected:** NVIDIA GeForce RTX 2060 (driver 610.47, 6144 MiB)
**Compute toolchain:** NVIDIA GeForce RTX 2060 — GPU compute available.
**Deno WebGPU:** ✅ available — real GPU dispatch enabled (NVIDIA GeForce RTX 2060)
**Galerina GPU backend:** `not-implemented` — gpu-plan.ts emits a WGSL skeleton only; no dispatch path (pending Phase 38).

| # | 🚦 | Runtime | Device (🖥️ CPU / 🎮 GPU) | Throughput (kernel ops/s) | Wall | vs Node |
|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Galerina passive ⟨interp⟩ | 🖥️ CPU (cpu) | 8.35B/s | 0.1ms | 8.48× |
| 🥈 | 🟢 | WASM ▶ production | 🖥️ CPU (cpu (wasm)) | 1.56B/s | 1.03s | 1.58× |
| 🥉 | 🟢 | Rust (generic) | 🖥️ CPU (cpu (serial)) | 1.18B/s | 4.25s | 1.20× |
| 4 | 🟢 | Rust AVX2 | 🖥️ CPU (cpu (serial)) | 1.17B/s | 4.27s | 1.19× |
| 5 | 🟢 | Node.js | 🖥️ CPU (cpu (serial)) | 984.45M/s | 507.9ms | 1.00× |
| 6 | 🔴 | Python | 🖥️ CPU (cpu (serial)) | 12.53M/s | 3.99s | 0.01× |
| 7 | ⚫ | Deno WebGPU (NVIDIA GeForce RTX 2060) | 🎮 GPU (gpu (WebGPU — NVIDIA GeForce RTX 2060)) | 4.00M/s | 25.0ms | 0.00× |
| 8 | ⚫ | Galerina manifest ⟨interp⟩ | 🖥️ CPU (cpu) | 380.0K/s | 263.1ms | 0.00× |
| 9 | ⚫ | Galerina governed ⟨interp⟩ | 🖥️ CPU (cpu) | 371.8K/s | 268.9ms | 0.00× |

**GPU execution status (this machine):**

| Runtime | GPU path | Device | Status |
|---|---|---|---|
| Rust | wgpu (Vulkan/D3D12) | 🖥️ CPU (GPU pending) | 🔧 buildable (cargo present, harness pending) |
| Python | torch CUDA / cupy | 🖥️ CPU (GPU pending) | ⏳ toolchain required (CPU-only torch) |
| Node.js | WebGPU | 🖥️ CPU only | ⏳ toolchain required (no navigator.gpu in Node.js) |
| Deno | WebGPU (built-in) | 🎮 GPU (NVIDIA GeForce RTX 2060) | ✅ available — real GPU dispatch detected (Phase 38 ready) |
| **Galerina** | WebGPUComputePlan → WGSL | 🖥️ CPU (GPU pending) | ❌ **pending Phase 38** — stub only, no measured number (by design) |

> Per the project's honesty rule (same as the Runtime-in-Galerina 0% metric): no GPU number is shown until a backend actually executes. Galerina's real result on this workload is its **WASM/CPU** row above.
> 🖥️ CPU = running on CPU cores. 🎮 GPU = real GPU dispatch via WebGPU/WGSL. Deno WebGPU is the only path currently capable of real GPU execution.

## 5. Key Observations

**Throughput gap (general):**
- Rust and Node.js JIT compile to native machine code — tree-walker cannot compete on hot arithmetic loops.
- Python CPython is 5-100× faster than Galerina on integer-intensive workloads.
- Galerina governed ≈ Galerina manifest — governance overhead is low; tree-walker dispatch dominates.

**collection-pipeline: the old "Galerina wins 43×" was a UNIT bug, now fixed:**
- That claim compared Galerina's *elements/sec* against the other languages' *whole-pipeline-passes/sec* —
  off by the per-pass element count (size = 10,000). Apples to oranges.
- Normalised to elements/sec for every runtime, the tree-walker no longer beats Node.js or Python here.
- Node/Python still pay real intermediate-array allocation for `.filter().map().reduce()`, but V8/CPython
  per-element throughput dwarfs the Stage-A interpreter once the units match.
- **Lesson:** normalise units before declaring a winner — a big `opsPerRun` multiplier flatters whoever it's applied to.

**fibonacci-recursive: different workloads:**
- Node.js/Rust/Python benchmark: fib(30) = 832040, ~2.7M recursive calls per invocation.
- Galerina benchmark: fib(20) = 6765, ~21K recursive calls per invocation (fib(30) would take ~19s/call).
- Calls/sec are not directly comparable — structural complexity differs by ~130×.
- Comparable result: Galerina handles ~1M+ AST node evaluations per second for recursive dispatch.

**Memory:**
- Galerina tree-walker allocates a new `{ __tag, value }` object per AST node — visible as heap growth.
- Negative heap delta = GC ran during execution and reclaimed more than was allocated.
- Node.js V8 JIT uses native tagged integers (no boxing) — heap stays flat on numeric workloads.

**passive mode: pre-compiled deployment throughput:**
- Galerina (passive) warm = LRU cache hits: steady-state deployment model (same input, same output).
- Galerina (passive) cold = execution without cache: different input each call, no cache benefit.
- Passive warm is typically 10-50× faster than governed — governance amortized, cache serves result.
- Passive cold shows pure execution cost: governance was pre-verified at compile time.

**hardware-targets: AVX2 vs generic for float dot product:**
- On i5-11400H (Tiger Lake H): generic x86 ≈ AVX2 for small arrays (both auto-vectorize to SSE4.2).
- Real AVX2 advantage appears on large tensors (L2/L3 cache boundary crossing, 16K+ float elements).
- WASM Phase 27: once WebAssembly.instantiate is wired, WASM SIMD 128 will show 10-100× over tree-walker.

**governance-cost: measuring the governance tax:**
- This benchmark isolates the overhead of the governance layer (ProofGraph + capability checking + audit).
- Key metric: galerinaGoverned/galerinaManifest ratio. Current baseline: ~2-3× slower (37% of manifest speed).
- Governance overhead sources: ProofGraph construction, GovernanceFlags bitmask, capability lookup, audit event.
- Target (Phase 30): <1.2× overhead via compile-time governance caching and proof reuse.

**Phase 25 projection (WASM):**
- Phase 25 WASM real arithmetic: pure flows now emit i32.add/sub/mul/div instead of (local.get $p0) stubs.
- Expected: 10-100× speedup for numeric pure flows when executed via WebAssembly.instantiate.
- collection-pipeline Galerina result already shows what the model delivers at the right abstraction level.

## 6. Distance from Winner — Every Runtime vs 🏆

> How much slower (or faster) is each runtime compared to the winner of that benchmark?
> **1.0×** = tied with winner. **2.0×** = half the speed. **100×** = one hundred times slower.

| Benchmark | 🏆 Winner | Rust AVX2 | Rust (generic) | Node.js | Python | Galerina passive ⟨interp⟩ | Galerina manifest ⟨interp⟩ | Galerina governed ⟨interp⟩ | WASM ▶ production | Deno WebGPU (NVIDIA GeForce RTX 2060) |
|---|---|---|---|---|---|---|---|---|---|---|
| **compute-mix** | Galerina passive ⟨interp⟩ | 7× slower | 6× slower | 6× slower | **863× slower** | **🏆 winner** | **3.8K× slower** | **4.0K× slower** | 7× slower | — |
| **arithmetic-threshold** | WASM ▶ production | 3× slower | 3× slower | 4× slower | **862× slower** | **89.1K× slower** | **4.7K× slower** | **5.5K× slower** | **🏆 winner** | — |
| **six-digit-guess** | WASM ▶ production | 1.1× slower | 1.1× slower | **29× slower** | **811× slower** | **2.1K× slower** | **1.7K× slower** | **1.7K× slower** | **🏆 winner** | — |
| **record-allocation** | WASM ▶ production | 2× slower | 2× slower | **42× slower** | **444× slower** | 2× slower | **4.2K× slower** | **4.8K× slower** | **🏆 winner** | — |
| **fibonacci-recursive** | Galerina passive ⟨interp⟩ | **168× slower** | **168× slower** | **676× slower** | **10.3K× slower** | **🏆 winner** | **5.2K× slower** | **7.6K× slower** | 2× slower | — |
| **collection-pipeline** | Rust AVX2 | **🏆 winner** | 3× slower | **192× slower** | **610× slower** | **11× slower** | **19.5K× slower** | **21.0K× slower** | 6× slower | — |
| **governance-cost** | Rust (generic) | **🏆 winner** | **🏆 winner** | **427× slower** | **24.7K× slower** | **11.2K× slower** | **1306.7K× slower** | **1099.5K× slower** | **54× slower** | — |
| **hardware-targets** | WASM ▶ production | **377× slower** | **377× slower** | **498× slower** | — | **4.1K× slower** | **97.2K× slower** | **66.3K× slower** | **🏆 winner** | — |
| **low-memory** | Rust AVX2 | **🏆 winner** | 5× slower | 9× slower | **1.1K× slower** | **12× slower** | **52.7K× slower** | **49.9K× slower** | 9× slower | — |
| **gpu-compute** | Galerina passive ⟨interp⟩ | 7× slower | 7× slower | 8× slower | **666× slower** | **🏆 winner** | **22.0K× slower** | **22.4K× slower** | 5× slower | **2.1K× slower** |
| **crypto-ops** | Galerina passive ⟨interp⟩ | — | — | — | — | **🏆 winner** | 10× slower | **70× slower** | — | — |
| **text-html** | Galerina passive ⟨interp⟩ | — | — | — | — | **🏆 winner** | **23× slower** | **76× slower** | — | — |
| **call-chain** | Galerina passive ⟨interp⟩ | — | — | **16× slower** | **2.4K× slower** | **🏆 winner** | **90.6K× slower** | **82.1K× slower** | — | — |
| **nbody** | Galerina passive ⟨interp⟩ | — | — | **18× slower** | **1.5K× slower** | **🏆 winner** | **38.6K× slower** | **38.3K× slower** | — | — |
| **json-parse** | Galerina passive ⟨interp⟩ | — | — | **14× slower** | **74× slower** | **🏆 winner** | **5.1K× slower** | **6.4K× slower** | — | — |
| **mandelbrot** | Galerina passive ⟨interp⟩ | — | **51× slower** | **192× slower** | **4.7K× slower** | **🏆 winner** | **165.0K× slower** | **150.6K× slower** | — | — |
| **spectral-norm** | Rust (generic) | — | **🏆 winner** | 2× slower | **139× slower** | — | — | — | — | — |
| **binary-trees** | Galerina passive ⟨interp⟩ | — | **535× slower** | **143× slower** | **2.0K× slower** | **🏆 winner** | **2.6K× slower** | **2.9K× slower** | — | — |
| **tmf-container** | Rust (generic) | — | **🏆 winner** | 4× slower | 2× slower | — | — | — | — | — |
| **framework-pipeline** | Node.js | — | — | **🏆 winner** | 3× slower | — | — | — | — | — |

> Bold = significantly behind (>10×). Blanks = benchmark not run for this runtime.
> Fibonacci passive is excluded from 'winner' comparison — LRU cache hit is not a fair race.
> gpu-compute GPU: NVIDIA GeForce RTX 2060 slower than CPU at 100K elements (setup overhead dominates — crossover ~500K elements).

---

## Benchmark Glossary — what each benchmark measures

| Benchmark | What it measures | Why it matters |
|---|---|---|
| **arithmetic-threshold** | Integer arithmetic loop: count operations above a threshold at 4B/s | Raw CPU / WASM JIT ceiling — the fastest possible pure number-crunching |
| **call-chain** | Flow-to-flow call chain (A→B→C→D): function-call overhead | Real programs call multiple governed flows; this isolates dispatch cost |
| **collection-pipeline** | Functional pipeline: filter → map → reduce over 10K integer records | Data transformation throughput — the bread-and-butter of governed APIs |
| **compute-mix** | Mixed workload: string ops, conditionals, arithmetic, object creation | Closest to real-world application code; no single hot path |
| **crypto-ops** | SHA-256 hashing, HMAC, Ed25519 sign+verify (via stdlib) | Performance of governed cryptographic operations (used in every secure flow) |
| **data-query** | Filter + sort + aggregate over 1K records with governance checks | ⚠️ excluded — not unit-aligned (Galerina main() ≠ the 7 native query micro-benches) |
| **fibonacci-recursive** | Recursive fib(20): tail-call and LRU cache warm path | Tests recursion overhead + caching benefit across governed/passive/WASM tiers |
| **governance-cost** | Sum 1..100 (triangle number) with full governance verification overhead | Directly measures the cost of Galerina's contract{} checking vs raw arithmetic |
| **gpu-compute** | Parallel map-reduce kernel (100K elements) via Deno WebGPU | GPU dispatch throughput on RTX 2060 — the WASM/GPU crossover point |
| **hardware-targets** | Dispatch to 5 hardware targets: CPU/GPU/NPU/WASM/fallback | Route decision overhead when contract.targets{} selects execution path |
| **http-throughput** | Sequential HTTP requests/sec to a governed localhost endpoint | Server throughput — how fast Galerina can handle real HTTP requests |
| **json-parse** | Parse 500 JSON records: split on comma, split on colon, accumulate | Real I/O parsing workload — string-heavy, cache-friendly on repeat calls |
| **tmf-container** | Create the canonical .tmf trust-container (TMX-256 SHAKE Merkle + LE packing). **The "Node.js" column IS Galerina's `@galerina/ext-tmf` engine** (pure TS/Node); Python/Rust are byte-identical reference writers — all assert the same golden root | Can other languages create a .tmf, and how fast? Honest SHAKE256+packing race (the engine is pure Node, so it has no separate interpreter column) |
| **framework-pipeline** | One full governed request through the **Galerina App Kernel's fixed 12-gate pipeline** (route→policy→size→content-type→auth→decode→idempotency→concurrency→dispatch→encode→audit). **The "Node.js" column IS the App Kernel** (no middleware chain); Python is an equivalent sync gate chain | "Native framework, no middleware" vs a middleware chain — measures pipeline cost in-process (no sockets). The structural win is fewer deps + non-reorderable gates, not raw speed |
| **low-memory** | Process 10K items with strict heap budget (measures bytes/op) | Memory efficiency — critical for edge/embedded deployment targets |
| **matrix-multiply** | 32×32 integer GEMM (matrix multiplication) | Scientific / ML workload: dense arithmetic, benefits from SIMD/GPU |
| **nbody** | N-body gravitational force: pairwise O(N²) physics simulation | Compute-heavy scientific workload — measured in force-evals/sec; Node/Python (native loops) are far faster than the tree-walker |
| **record-allocation** | Create 10K records at 2.3B/s: struct construction throughput | Memory allocation cost under governance — critical for high-frequency APIs |
| **six-digit-guess** | Brute-force 6-digit PIN search with early exit | Branch-heavy search — tests conditional execution + JIT branch prediction |
| **text-html** | HTML template rendering: string interpolation + escaping | Web/rendering workload — string manipulation under governance |
| **tri-logic** | Balanced ternary (base-3) logic operations: trit arithmetic | Photonic/ternary compute path — future hardware target validation |
| **naming-check** | FUNGI-NAMING checker over 27 auth-service .fungi files | DevTools throughput: how fast the naming linter processes a codebase |
| **context-receipt** | Context Receipt generation: 51–97% token reduction per flow | AI context window generation speed — how fast receipts are produced |
| **intelligence-search** | BM25 hybrid code search: index 81 flows, 10 queries/run | Code search latency — how fast galerina search responds |
| **provenance-trace** | Data lineage graph: source→transform→sink for 27 files | Compliance evidence generation speed — how fast the audit trail is built |

(node:40504) [DEP0190] DeprecationWarning: Passing args to a child process with shell option true can lead to security vulnerabilities, as the arguments are not escaped, only concatenated.
(Use `node --trace-deprecation ...` to show where the warning was created)
