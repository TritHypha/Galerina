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

## 1. Per-Metric Scoreboards

> Categories: 14 certified · 3 shape-only(→Memory) · 1 internal-ratio(Governance) · 11 uncertified — a cross-runtime ratio is shown only for work-equivalence-certified lanes.

### CPU Throughput — inner-ops/s (cross-runtime; certified lanes only)

> 🚦 **vs Rust / vs Node** compare the **WASM ▶ production** lane to native. A traffic-light ratio
> appears ONLY for work-equivalence-certified benchmarks; `UNCERTIFIED` lanes show raw throughput and
> NO ratio (their N/work is not yet proven equivalent across runtimes).

| Benchmark | WASM ▶ production | vs Rust | vs Node | Galerina governed ⟨interp⟩ | Implication |
|---|---|---|---|---|---|
| compute-mix | 80.89M/s | ⚪ 1.7× slower | ⚪ 1.8× slower | 1.80M/s | WASM near native |
| arithmetic-threshold | 516.04M/s | UNCERTIFIED | UNCERTIFIED | 5.38M/s | not yet work-equivalence-certified (N/work mismatch) |
| six-digit-guess | 38.30M/s | UNCERTIFIED | UNCERTIFIED | 53.4K/s | not yet work-equivalence-certified (N/work mismatch) |
| fibonacci-recursive | 18.1K/s | UNCERTIFIED | UNCERTIFIED | 15.0/s | not yet work-equivalence-certified (N/work mismatch) |
| tower-of-hanoi | 128.19M/s | 🟡 2.1× slower | 🟢 1.0× slower | 105.2K/s | WASM usable |
| hardware-targets | 40.37M/s | UNCERTIFIED | UNCERTIFIED | 4.2K/s | not yet work-equivalence-certified (N/work mismatch) |
| matrix-multiply | 463.74M/s | 🟡 3.3× slower | ⚪ 1.4× slower | 762.9K/s | WASM usable |
| tri-logic | 492.35M/s | 🟡 2.9× slower | 🟡 2.1× slower | 327.2K/s | WASM usable |
| data-query | no WASM build | — | — | 206.5K/s | WASM not built for this lane yet |
| call-chain | 57.62M/s | — | 🟡 5.2× slower | 57.8K/s | WASM 2–10× under Node |
| nbody | 30.56M/s | — | 🟡 4.1× slower | 63.8K/s | WASM 2–10× under Node |
| mandelbrot | 9.41M/s | 🟡 2.6× slower | 🟢 1.3× | 8.0K/s | WASM usable |
| spectral-norm | no WASM build | — | — | not run | WASM not built for this lane yet |

> 🚦 🟢 ≥0.9 (≈native) · ⚪ ≥0.5 (within 2×) · 🟡 ≥0.1 (2–10× slower) · 🔴 ≥0.01 (10–100×) · ⚫ <0.01 (100×+).
> **Ceiling (fastest certified lane):** Rust (generic) — 1.55B/s on matrix-multiply.

### Memory — heap bytes per operation (the honest metric; lower is better)

> Ranked by **bytes/op**, NOT throughput — these benchmarks measure allocation, so no cross-runtime
> throughput ratio (and no ⚫) is shown. Native Rust/C++ allocate off the GC heap (~0 native — see §2b/§4).

| Benchmark | 🏆 Best (lowest heap B/op) | Node.js | Python | WASM ▶ production | Galerina governed ⟨interp⟩ | Galerina manifest ⟨interp⟩ |
|---|---|---|---|---|---|---|
| record-allocation | **WASM ▶ production** (~0) | 1 B/op | ~0 | ~0 | 6 B/op | 8 B/op |
| collection-pipeline | **WASM ▶ production** (~0) | ~0 | ~0 | ~0 | 17 B/op | 17 B/op |
| low-memory | **Node.js** (~0) | ~0 | ~0 | ~0 | 22 B/op | 48 B/op |
| binary-trees | **Python** (~0) | 3 B/op | ~0 | ~0 | 15 B/op | 12 B/op |

> **No throughput ratio, no ⚫ here** — a memory benchmark ranked by throughput is exactly the
> cross-metric bug this section removes. record-allocation / binary-trees / collection-pipeline live
> here by bytes/op, so they no longer carry the ◇ shape-only marker; their shape rate is in §4.

### GPU — kernel-evals/s (GPU-shaped workload; matrix-multiply dual-homes here)

> Cross-runtime. Deno WebGPU is the only real-dispatch path; where it produced no number on this
> machine it shows **⏳ GPU pending** — the honest status, never a fabricated GPU rate.

| Benchmark | 🏆 Winner | Speed | WASM ▶ production | GPU (Deno WebGPU) | vs Node (WASM) | Implication |
|---|---|---|---|---|---|---|
| gpu-compute | Rust AVX2 | 1.25B/s | 497.17M/s | ⏳ GPU pending | 🟡 2.1× slower | CPU/WASM lanes lead — real GPU dispatch pending (see §4b) |
| matrix-multiply | Rust (generic) | 1.55B/s | 463.74M/s | ⏳ GPU pending | ⚪ 1.4× slower | CPU/WASM lanes lead — real GPU dispatch pending (see §4b) |

> **vs Node (WASM)** compares the WASM ▶ production lane to Node.js on the kernel. matrix-multiply also
> appears in the CPU Throughput table (dual-home) — it has both a compute lane and a WebGPU lane.

### I/O & DevTools — native units per benchmark (raw rate; NOT inner-op normalised)

> Each benchmark has its OWN unit, so there is **no cross-runtime ratio** — the winner is the fastest
> lane by raw rate WITHIN that benchmark's native unit. Comparing rates ACROSS benchmarks is meaningless.

| Benchmark | Unit (native) | 🏆 Fastest lane | Node.js | Python | Rust (generic) | WASM ▶ production | Galerina governed ⟨interp⟩ |
|---|---|---|---|---|---|---|---|
| crypto-ops | ops/s | **Galerina governed ⟨interp⟩** (142.0/s) | no comparable metric | no comparable metric | no comparable metric | no WASM — strings/records | 142.0/s |
| text-html | ops/s | **Galerina governed ⟨interp⟩** (800.0/s) | no comparable metric | no comparable metric | no comparable metric | no WASM — strings/records | 800.0/s |
| json-parse | records/s | **Node.js** (3.29M/s) | 3.29M/s | 506.5K/s | not run — no native impl | no WASM — strings/records | 5.6K/s |
| spore-container | containers/s | **Rust (generic)** (133.3K/s) | 46.3K/s | 85.7K/s | 133.3K/s | no WASM — strings/records | not run |
| framework-pipeline | requests/s | **Python** (113.3K/s) | not run | 113.3K/s | not run — no native impl | no WASM — strings/records | not run |
| http-throughput | requests/s | **Node.js** (3.4K/s) | 3.4K/s | not run | not run — no native impl | no WASM build | not run |
| naming-check | files/s | **Node.js** (7.2K/s) | 7.2K/s | not run | not run — no native impl | no WASM build | not run |
| context-receipt | receipts/s | **Node.js** (18.4K/s) | 18.4K/s | not run | not run — no native impl | no WASM build | not run |
| intelligence-search | queries/s | **Node.js** (104.5K/s) | 104.5K/s | not run | not run — no native impl | no WASM build | not run |
| provenance-trace | files/s | **Node.js** (830.0/s) | 830.0/s | not run | not run — no native impl | no WASM build | not run |

> Values are native rates (records/s, containers/s, requests/s, files/s, …), shown for transparency —
> NOT a cross-runtime ranking. The inner-op-normalised throughput lives in the CPU table above.

### Governance — Galerina-internal tier ratio ONLY (NO native column)

> This table's columns are Galerina tiers ONLY — there is **no rust/node/python/cpp column**, so a
> cross-runtime `N× slower` is structurally impossible here. The old six-figure governance-cost artifact
> came from dividing the governed tier by a native rate — a division this table cannot express.

| Benchmark | Galerina governed ⟨interp⟩ | Galerina manifest ⟨interp⟩ | WASM ▶ production | governed/manifest (gov overhead) |
|---|---|---|---|---|
| governance-cost | 812.0/s | 1.1K/s | 3.02M/s | 0.71× governed/manifest (gov overhead ≈ 1.41×) |

> **governed/manifest** is governance-cost's honest headline: the same-N cost of always-on governance
> (capabilities + audit + proof) vs the pre-verified manifest. `gov overhead` = manifest ÷ governed.


### Full Throughput Table (all runtimes)

| Benchmark | Rust AVX-512 | Rust AVX2 | Rust (generic) | C++ | Node.js | Python | Galerina passive ⟨interp⟩ | Galerina manifest ⟨interp⟩ | Galerina governed ⟨interp⟩ | WASM ▶ production | Deno WebGPU (GPU) | Node/Galerina† (🖥️ CPU) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| compute-mix | not run — no AVX-512 | **135.85M/s** | **139.35M/s** | **139.54M/s** | **142.18M/s** | 823.7K/s | 2.35M/s | 1.92M/s | 1.80M/s | 80.89M/s | not run — no GPU path | 79.1× |
| arithmetic-threshold | not run — no AVX-512 | 1.60B/s | 1.60B/s | **1.92B/s** | 1.00B/s | 4.07M/s | 37.3K/s | 5.62M/s | 5.38M/s | 516.04M/s | not run — no GPU path | 186.0× |
| six-digit-guess | not run — no AVX-512 | **75.82M/s** | **79.71M/s** | 68.83M/s | 2.89M/s | 89.2K/s | 12.0K/s | 48.8K/s | 53.4K/s | 38.30M/s | not run — no GPU path | 54.2× |
| record-allocation | not run — no AVX-512 | 920.01M/s | **1.21B/s** | not run — no C++ impl | 58.51M/s | 3.60M/s | 8.32M/s | 2.46M/s | 2.30M/s | 579.16M/s | not run — no GPU path | 25.4× |
| fibonacci-recursive | not run — no AVX-512 | 520.8/s | 515.8/s | not run — no C++ impl | 133.9/s | 5.6/s | **65.1K/s** | 18.0/s | 15.0/s | 18.1K/s | not run — no GPU path | 8.93× |
| tower-of-hanoi | not run — no AVX-512 | **259.97M/s** | **263.94M/s** | not run — no C++ impl | 132.94M/s | 2.87M/s | 112.1K/s | 109.7K/s | 105.2K/s | 128.19M/s | not run — no GPU path | 1.3K× |
| collection-pipeline | not run — no AVX-512 | **13.45B/s** | 4.42B/s | not run — no C++ impl | 76.60M/s | 10.49M/s | 8.30M/s | 2.31M/s | 2.25M/s | 442.43M/s | not run — no GPU path | 34.0× |
| governance-cost ⚠️ | N/A — excluded | N/A — excluded | N/A — excluded | N/A — excluded | N/A — excluded | N/A — excluded | N/A — excluded | N/A — excluded | N/A — excluded | N/A — excluded | N/A — excluded | ⚠️ excluded — not unit-aligned |
| hardware-targets | not run — no AVX-512 | 1.23M/s | 1.24M/s | not run — no C++ impl | 953.1K/s | not run | 73.5K/s | 4.2K/s | 4.2K/s | **40.37M/s** | not run — no GPU path | 228.7× |
| low-memory | not run — no AVX-512 | **6.37B/s** | 1.41B/s | not run — no C++ impl | 718.39M/s | 2.77M/s | 175.5K/s | 126.5K/s | 149.3K/s | 494.49M/s | not run — no GPU path | 4.8K× |
| gpu-compute | not run — no AVX-512 | **1.25B/s** | **1.24B/s** | not run — no C++ impl | 1.04B/s | 6.17M/s | 403.0K/s | 350.4K/s | 340.9K/s | 497.17M/s | errored | 3.0K× |
| matrix-multiply | not run — no AVX-512 | 1.45B/s | **1.55B/s** | not run — no C++ impl | 645.77M/s | 6.47M/s | 867.7K/s | 653.5K/s | 762.9K/s | 463.74M/s | errored | 846.4× |
| crypto-ops | not run — no AVX-512 | no comparable metric | no comparable metric | not run — no C++ impl | no comparable metric | no comparable metric | **5.3K/s** | 1.7K/s | 142.0/s | no WASM — strings/records | not run — no GPU path | N/A — no Node.js |
| text-html | not run — no AVX-512 | no comparable metric | no comparable metric | not run — no C++ impl | no comparable metric | no comparable metric | **47.2K/s** | 2.2K/s | 800.0/s | no WASM — strings/records | not run — no GPU path | N/A — no Node.js |
| tri-logic | not run — no AVX-512 | **1.45B/s** | **1.45B/s** | not run — no C++ impl | 1.04B/s | 8.16M/s | 357.0K/s | 372.2K/s | 327.2K/s | 492.35M/s | not run — no GPU path | 3.2K× |
| data-query | not run — no AVX-512 | not run — no native impl | not run — no native impl | not run — no C++ impl | **403.05M/s** | 3.18M/s | 272.0K/s | 218.2K/s | 206.5K/s | no WASM build | not run — no GPU path | 2.0K× |
| call-chain | not run — no AVX-512 | not run — no native impl | not run — no native impl | not run — no C++ impl | **299.01M/s** | 1.48M/s | 61.5K/s | 56.2K/s | 57.8K/s | 57.62M/s | not run — no GPU path | 5.2K× |
| nbody | not run — no AVX-512 | not run — no native impl | not run — no native impl | not run — no C++ impl | **124.64M/s** | 1.02M/s | 66.2K/s | 64.4K/s | 63.8K/s | 30.56M/s | not run — no GPU path | 2.0K× |
| json-parse | not run — no AVX-512 | not run — no native impl | not run — no native impl | not run — no C++ impl | **3.29M/s** | 506.5K/s | 10.1K/s | 5.1K/s | 5.6K/s | no WASM — strings/records | not run — no GPU path | 584.1× |
| mandelbrot | not run — no AVX-512 | **24.09M/s** | **24.06M/s** | not run — no C++ impl | 7.08M/s | 205.0K/s | 8.7K/s | 8.1K/s | 8.0K/s | 9.41M/s | not run — no GPU path | 881.3× |
| spectral-norm | not run — no AVX-512 | 354.17M/s | **390.93M/s** | not run — no C++ impl | 244.69M/s | 1.81M/s | not run | not run | not run | no WASM build | not run — no GPU path | N/A — no governed ⟨interp⟩ |
| binary-trees | not run — no AVX-512 | 19.69M/s | 20.90M/s | not run — no C++ impl | 81.66M/s | 2.91M/s | 419.8K/s | 369.7K/s | 348.2K/s | **612.70M/s** | not run — no GPU path | 234.5× |
| spore-container | not run — no AVX-512 | **138.0K/s** | **133.3K/s** | not run — no C++ impl | 46.3K/s | 85.7K/s | not run | not run | not run | no WASM — strings/records | not run — no GPU path | N/A — no governed ⟨interp⟩ |
| framework-pipeline | not run — no AVX-512 | not run — no native impl | not run — no native impl | not run — no C++ impl | not run | **113.3K/s** | not run | not run | not run | no WASM — strings/records | not run — no GPU path | N/A — neither ran |
| http-throughput | not run — no AVX-512 | not run — no native impl | not run — no native impl | not run — no C++ impl | no comparable metric | not run | not run | not run | not run | no WASM build | not run — no GPU path | N/A — neither ran |
| naming-check | not run — no AVX-512 | not run — no native impl | not run — no native impl | not run — no C++ impl | no comparable metric | not run | not run | not run | not run | no WASM build | not run — no GPU path | N/A — neither ran |
| context-receipt | not run — no AVX-512 | not run — no native impl | not run — no native impl | not run — no C++ impl | no comparable metric | not run | not run | not run | not run | no WASM build | not run — no GPU path | N/A — neither ran |
| intelligence-search | not run — no AVX-512 | not run — no native impl | not run — no native impl | not run — no C++ impl | no comparable metric | not run | not run | not run | not run | no WASM build | not run — no GPU path | N/A — neither ran |
| provenance-trace | not run — no AVX-512 | not run — no native impl | not run — no native impl | not run — no C++ impl | no comparable metric | not run | not run | not run | not run | no WASM build | not run — no GPU path | N/A — neither ran |

> †`Node/Galerina > 1` = Node.js faster (the usual case for the Stage-A tree-walker). `< 1` = Galerina faster.
> †fibonacci: Galerina=fib(20), others=fib(30) — different workload depth.
> ⚠️ rows are excluded — their workloads are not unit-aligned across runtimes (see §1.6).
> **Bold** = winner (within 5% of fastest). 🖥️ CPU = CPU execution. 🎮 GPU = Deno WebGPU (GPU).

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
| tower-of-hanoi | ✅ aligned | moves/s | all runtimes normalised to one unit |
| collection-pipeline | ✅ aligned | elements/s | all runtimes normalised to one unit |
| governance-cost | ⚠️ excluded | gov-factor | internal governed/manifest ratio — native baseline does no governance; not cross-runtime by design |
| hardware-targets | — legacy | per-call | not centrally normalised (out of scope) |
| low-memory | ✅ aligned | items/s | all runtimes normalised to one unit |
| gpu-compute | ✅ aligned | kernel-evals/s | all runtimes normalised to one unit |
| matrix-multiply | ✅ aligned | mul-adds/s | all runtimes normalised to one unit |
| crypto-ops | — legacy | per-call | not centrally normalised (out of scope) |
| text-html | — legacy | per-call | not centrally normalised (out of scope) |
| tri-logic | ✅ aligned | trit-ops/s | all runtimes normalised to one unit |
| data-query | ✅ aligned | record-scans/s | all runtimes normalised to one unit |
| call-chain | ✅ aligned | chains/s | all runtimes normalised to one unit |
| nbody | ✅ aligned | force-evals/s | all runtimes normalised to one unit |
| json-parse | ✅ aligned | records/s | all runtimes normalised to one unit |
| mandelbrot | ✅ aligned | pixels/s | all runtimes normalised to one unit |
| spectral-norm | ✅ aligned | A-evals/s | all runtimes normalised to one unit |
| binary-trees | ✅ aligned | nodes/s | all runtimes normalised to one unit |
| spore-container | ✅ aligned | containers/s | all runtimes normalised to one unit |
| framework-pipeline | ✅ aligned | requests/s | all runtimes normalised to one unit |
| http-throughput | — legacy | per-call | not centrally normalised (out of scope) |
| naming-check | — legacy | per-call | not centrally normalised (out of scope) |
| context-receipt | — legacy | per-call | not centrally normalised (out of scope) |
| intelligence-search | — legacy | per-call | not centrally normalised (out of scope) |
| provenance-trace | — legacy | per-call | not centrally normalised (out of scope) |

> **Excluded** benchmarks are dropped from the winner table and the Python-floor check until their
> workloads are realigned across runtimes. Excluding them is what stops false "Galerina wins" on
> mismatched workloads (the same class of bug the unit normalisation fixed for the numeric loops).

## 2. Memory Allocation per Operation (low-memory benchmark)

> **Key metric:** bytes allocated on the JS heap per integer operation.
> WASM and bytecode VM should be near 0. Tree-walker allocates per AST node.

| # | 🚦 | Runtime | Bytes/Op | Throughput | Total Ops | Heap Δ |
|---|---|---|---|---|---|---|
| 🥇 | ⚫ | Galerina passive ⟨interp⟩ | -38.67 bytes/op ⚡ ~0 — no boxing | 175.5K/s | — | -387KB |
| 🥈 | 🟢 | Rust AVX2 | 0.00 bytes/op ⚡ ~0 — no boxing | 6.37B/s | — | — |
| 🥉 | 🟢 | Rust (generic) | 0.00 bytes/op ⚡ ~0 — no boxing | 1.41B/s | — | — |
| 4 | 🟢 | Node.js | 0.00 bytes/op ⚡ ~0 — no boxing | 718.39M/s | — | 16KB |
| 5 | ⚪ | WASM ▶ production | 0.00 bytes/op ⚡ ~0 — no boxing | 494.49M/s | — | 43KB |
| 6 | ⚫ | Python | 0.03 bytes/op ⚡ ~0 — no boxing | 2.77M/s | — | 272B |
| 7 | ⚫ | Galerina governed ⟨interp⟩ | 22 bytes/op ⚠ moderate | 149.3K/s | — | 224KB |
| 8 | ⚫ | Galerina manifest ⟨interp⟩ | 48 bytes/op ⚠ moderate | 126.5K/s | — | 475KB |

> **Why this matters:** Every byte allocated is a byte the GC must later collect.
> WASM and the bytecode VM run with zero allocation — ideal for high-throughput governed services.
> The tree-walker's per-node allocation is the primary target of Phases 31-33.


## 2b. General Memory Usage

| Benchmark | Runtime | RSS | Peak RSS | Heap Used | Heap Δ (execution) |
|---|---|---|---|---|---|
| compute-mix | Rust AVX2 | — | — | — | — |
| compute-mix | Rust (generic) | — | — | — | — |
| compute-mix | C++ | — | — | — | — |
| compute-mix | Node.js | 44.1MB | 44.4MB | 5.0MB | 985KB |
| compute-mix | Python | — | — | 3KB | 3KB |
| compute-mix | Galerina passive ⟨interp⟩ | 78.0MB | 78.0MB | 16.7MB | 73KB |
| compute-mix | Galerina manifest ⟨interp⟩ | 74.2MB | 74.2MB | 20.5MB | 4.4MB |
| compute-mix | Galerina governed ⟨interp⟩ | 73.0MB | 73.0MB | 20.2MB | 4.5MB |
| compute-mix | WASM ▶ production | 71.7MB | 71.7MB | 16.0MB | 22KB |
| arithmetic-threshold | Rust AVX2 | — | — | — | — |
| arithmetic-threshold | Rust (generic) | — | — | — | — |
| arithmetic-threshold | C++ | — | — | — | — |
| arithmetic-threshold | Node.js | 47.1MB | 47.4MB | 4.3MB | 201KB |
| arithmetic-threshold | Python | — | — | 4KB | 4KB |
| arithmetic-threshold | Galerina passive ⟨interp⟩ | 79.6MB | 79.6MB | 17.1MB | 39KB |
| arithmetic-threshold | Galerina manifest ⟨interp⟩ | 79.3MB | 79.3MB | 17.1MB | 837KB |
| arithmetic-threshold | Galerina governed ⟨interp⟩ | 78.9MB | 78.9MB | 17.1MB | 855KB |
| arithmetic-threshold | WASM ▶ production | 81.6MB | 81.6MB | 16.6MB | 6KB |
| six-digit-guess | Rust AVX2 | — | — | — | — |
| six-digit-guess | Rust (generic) | — | — | — | — |
| six-digit-guess | C++ | — | — | — | — |
| six-digit-guess | Node.js | 51.8MB | 51.8MB | 5.8MB | 1.1MB |
| six-digit-guess | Python | — | — | 583B | 583B |
| six-digit-guess | Galerina passive ⟨interp⟩ | 80.5MB | 80.5MB | 17.2MB | -2.0MB |
| six-digit-guess | Galerina manifest ⟨interp⟩ | 80.2MB | 80.2MB | 17.7MB | 843KB |
| six-digit-guess | Galerina governed ⟨interp⟩ | 80.2MB | 80.2MB | 16.9MB | 438KB |
| six-digit-guess | WASM ▶ production | 82.0MB | 82.0MB | 16.8MB | 1KB |
| record-allocation | Rust AVX2 | — | — | — | — |
| record-allocation | Rust (generic) | — | — | — | — |
| record-allocation | Node.js | 48.2MB | 48.2MB | 4.4MB | 267KB |
| record-allocation | Python | — | — | 492B | 492B |
| record-allocation | Galerina passive ⟨interp⟩ | 80.6MB | 80.6MB | 17.5MB | 188KB |
| record-allocation | Galerina manifest ⟨interp⟩ | 80.5MB | 80.5MB | 17.0MB | 84KB |
| record-allocation | Galerina governed ⟨interp⟩ | 81.4MB | 81.4MB | 17.1MB | 60KB |
| record-allocation | WASM ▶ production | 83.0MB | 83.0MB | 17.3MB | 50KB |
| fibonacci-recursive | Rust AVX2 | — | — | — | — |
| fibonacci-recursive | Rust (generic) | — | — | — | — |
| fibonacci-recursive | Node.js | 46.4MB | 46.4MB | 4.1MB | 5KB |
| fibonacci-recursive | Python | — | — | 464B | 464B |
| fibonacci-recursive | Galerina passive ⟨interp⟩ | 81.4MB | 81.4MB | 17.9MB | 59KB |
| fibonacci-recursive | Galerina manifest ⟨interp⟩ | 81.4MB | 81.4MB | 18.3MB | 1.1MB |
| fibonacci-recursive | Galerina governed ⟨interp⟩ | 80.9MB | 80.9MB | 18.1MB | 979KB |
| fibonacci-recursive | WASM ▶ production | 83.3MB | 83.3MB | 17.4MB | 3KB |
| tower-of-hanoi | Rust AVX2 | — | — | — | — |
| tower-of-hanoi | Rust (generic) | — | — | — | — |
| tower-of-hanoi | Node.js | 46.4MB | 46.4MB | 4.1MB | 15KB |
| tower-of-hanoi | Python | — | — | 1KB | 1KB |
| tower-of-hanoi | Galerina passive ⟨interp⟩ | 84.6MB | 84.6MB | 22.3MB | 47KB |
| tower-of-hanoi | Galerina manifest ⟨interp⟩ | 83.6MB | 83.6MB | 17.4MB | 1.2MB |
| tower-of-hanoi | Galerina governed ⟨interp⟩ | 83.6MB | 83.6MB | 17.6MB | 1.4MB |
| tower-of-hanoi | WASM ▶ production | 83.7MB | 83.7MB | 16.6MB | 1KB |
| collection-pipeline | Rust AVX2 | — | — | — | — |
| collection-pipeline | Rust (generic) | — | — | — | — |
| collection-pipeline | Node.js | 63.3MB | 63.3MB | 12.3MB | 8.1MB |
| collection-pipeline | Python | — | — | 224B | 224B |
| collection-pipeline | Galerina passive ⟨interp⟩ | 84.2MB | 84.2MB | 17.0MB | 271KB |
| collection-pipeline | Galerina manifest ⟨interp⟩ | 84.2MB | 84.2MB | 16.4MB | 165KB |
| collection-pipeline | Galerina governed ⟨interp⟩ | 87.2MB | 87.2MB | 16.4MB | 167KB |
| collection-pipeline | WASM ▶ production | 87.0MB | 87.0MB | 16.5MB | 24KB |
| governance-cost | Rust AVX2 | — | — | — | — |
| governance-cost | Rust (generic) | — | — | — | — |
| governance-cost | Node.js | 46.4MB | 46.4MB | 4.1MB | 26KB |
| governance-cost | Python | — | — | 272B | 272B |
| governance-cost | Galerina passive ⟨interp⟩ | 86.6MB | 86.6MB | 17.2MB | 499KB |
| governance-cost | Galerina manifest ⟨interp⟩ | 87.4MB | 87.4MB | 16.8MB | 420KB |
| governance-cost | Galerina governed ⟨interp⟩ | 85.7MB | 85.7MB | 16.8MB | 446KB |
| governance-cost | WASM ▶ production | 86.7MB | 86.7MB | 16.7MB | 49KB |
| hardware-targets | Rust AVX2 | — | — | — | — |
| hardware-targets | Rust (generic) | — | — | — | — |
| hardware-targets | Node.js | 48.2MB | 48.2MB | 4.5MB | 349KB |
| hardware-targets | Galerina passive ⟨interp⟩ | 84.6MB | 84.6MB | 16.8MB | -322KB |
| hardware-targets | Galerina manifest ⟨interp⟩ | 84.4MB | 84.4MB | 16.6MB | 77KB |
| hardware-targets | Galerina governed ⟨interp⟩ | 84.3MB | 84.3MB | 16.6MB | 78KB |
| hardware-targets | WASM ▶ production | 86.7MB | 86.7MB | 16.9MB | 83KB |
| low-memory | Rust AVX2 | — | — | — | — |
| low-memory | Rust (generic) | — | — | — | — |
| low-memory | Node.js | 46.4MB | 46.4MB | 4.1MB | 16KB |
| low-memory | Python | — | — | 272B | 272B |
| low-memory | Galerina passive ⟨interp⟩ | 84.6MB | 84.6MB | 17.0MB | -387KB |
| low-memory | Galerina manifest ⟨interp⟩ | 85.0MB | 85.0MB | 17.1MB | 475KB |
| low-memory | Galerina governed ⟨interp⟩ | 84.6MB | 84.6MB | 16.8MB | 224KB |
| low-memory | WASM ▶ production | 87.1MB | 87.1MB | 16.8MB | 43KB |
| gpu-compute | Rust AVX2 | — | — | — | — |
| gpu-compute | Rust (generic) | — | — | — | — |
| gpu-compute | Node.js | 46.6MB | 46.6MB | 4.1MB | 17KB |
| gpu-compute | Python | — | — | 304B | 304B |
| gpu-compute | Galerina passive ⟨interp⟩ | 85.0MB | 85.0MB | 17.8MB | 191KB |
| gpu-compute | Galerina manifest ⟨interp⟩ | 84.9MB | 84.9MB | 17.2MB | 561KB |
| gpu-compute | Galerina governed ⟨interp⟩ | 85.0MB | 85.0MB | 17.5MB | 770KB |
| gpu-compute | WASM ▶ production | 87.7MB | 87.7MB | 16.9MB | 2KB |
| matrix-multiply | Rust AVX2 | — | — | — | — |
| matrix-multiply | Rust (generic) | — | — | — | — |
| matrix-multiply | Node.js | 48.5MB | 48.5MB | 4.4MB | 224KB |
| matrix-multiply | Python | — | — | 392B | 392B |
| matrix-multiply | Galerina passive ⟨interp⟩ | 85.5MB | 85.5MB | 17.0MB | -883KB |
| matrix-multiply | Galerina manifest ⟨interp⟩ | 85.4MB | 85.4MB | 17.7MB | 990KB |
| matrix-multiply | Galerina governed ⟨interp⟩ | 86.8MB | 86.8MB | 17.7MB | 955KB |
| matrix-multiply | WASM ▶ production | 87.8MB | 87.8MB | 17.0MB | 3KB |
| crypto-ops | Rust AVX2 | — | — | — | — |
| crypto-ops | Rust (generic) | — | — | — | — |
| crypto-ops | Node.js | 63.0MB | 63.0MB | 10.0MB | 4.5MB |
| crypto-ops | Python | — | — | 208B | 208B |
| crypto-ops | Galerina passive ⟨interp⟩ | 86.0MB | 86.0MB | 18.1MB | 627KB |
| crypto-ops | Galerina manifest ⟨interp⟩ | 85.8MB | 85.8MB | 17.0MB | 249KB |
| crypto-ops | Galerina governed ⟨interp⟩ | 85.8MB | 85.8MB | 17.0MB | 322KB |
| text-html | Rust AVX2 | — | — | — | — |
| text-html | Rust (generic) | — | — | — | — |
| text-html | Node.js | — | — | — | 472KB |
| text-html | Python | — | — | 208B | 208B |
| text-html | Galerina passive ⟨interp⟩ | 87.9MB | 87.9MB | 17.7MB | -415KB |
| text-html | Galerina manifest ⟨interp⟩ | 86.3MB | 86.3MB | 17.3MB | 149KB |
| text-html | Galerina governed ⟨interp⟩ | 86.2MB | 86.2MB | 17.3MB | 169KB |
| tri-logic | Rust AVX2 | — | — | — | — |
| tri-logic | Rust (generic) | — | — | — | — |
| tri-logic | Node.js | — | — | — | 266KB |
| tri-logic | Python | — | — | — | — |
| tri-logic | Galerina passive ⟨interp⟩ | 86.7MB | 86.7MB | 17.9MB | 232KB |
| tri-logic | Galerina manifest ⟨interp⟩ | 86.5MB | 86.5MB | 17.7MB | 389KB |
| tri-logic | Galerina governed ⟨interp⟩ | 86.5MB | 86.5MB | 17.9MB | 699KB |
| tri-logic | WASM ▶ production | 90.2MB | 90.2MB | 17.5MB | 1KB |
| data-query | Node.js | — | — | — | 22KB |
| data-query | Python | — | — | — | — |
| data-query | Galerina passive ⟨interp⟩ | 87.1MB | 87.1MB | 20.0MB | 1.1MB |
| data-query | Galerina manifest ⟨interp⟩ | 87.1MB | 87.1MB | 17.7MB | 497KB |
| data-query | Galerina governed ⟨interp⟩ | 87.2MB | 87.2MB | 19.3MB | 2.0MB |
| call-chain | Node.js | 47.2MB | 47.2MB | 4.2MB | 43KB |
| call-chain | Python | — | — | 368B | 368B |
| call-chain | Galerina passive ⟨interp⟩ | 86.7MB | 86.7MB | 19.0MB | 83KB |
| call-chain | Galerina manifest ⟨interp⟩ | 86.7MB | 86.7MB | 19.3MB | 2.0MB |
| call-chain | Galerina governed ⟨interp⟩ | 86.7MB | 86.7MB | 18.3MB | 963KB |
| call-chain | WASM ▶ production | 90.1MB | 90.1MB | 17.6MB | 1KB |
| nbody | Node.js | 48.5MB | 48.5MB | 4.2MB | 30KB |
| nbody | Python | — | — | 624B | 624B |
| nbody | Galerina passive ⟨interp⟩ | 86.7MB | 86.7MB | 17.6MB | -1.9MB |
| nbody | Galerina manifest ⟨interp⟩ | 86.6MB | 86.6MB | 17.6MB | 253KB |
| nbody | Galerina governed ⟨interp⟩ | 86.6MB | 86.6MB | 18.0MB | 575KB |
| nbody | WASM ▶ production | 89.0MB | 89.0MB | 17.6MB | 1KB |
| json-parse | Node.js | — | — | — | 255KB |
| json-parse | Python | — | — | 520B | 520B |
| json-parse | Galerina passive ⟨interp⟩ | 94.3MB | 94.3MB | 20.8MB | 426KB |
| json-parse | Galerina manifest ⟨interp⟩ | 89.4MB | 89.4MB | 20.1MB | 2.3MB |
| json-parse | Galerina governed ⟨interp⟩ | 95.3MB | 95.3MB | 19.0MB | 1.6MB |
| mandelbrot | Rust AVX2 | — | — | — | — |
| mandelbrot | Rust (generic) | — | — | — | — |
| mandelbrot | Node.js | 48.4MB | 48.4MB | 4.2MB | 32KB |
| mandelbrot | Python | — | — | 3KB | 3KB |
| mandelbrot | Galerina passive ⟨interp⟩ | 91.4MB | 91.4MB | 19.4MB | 167KB |
| mandelbrot | Galerina manifest ⟨interp⟩ | 91.4MB | 91.4MB | 18.0MB | 194KB |
| mandelbrot | Galerina governed ⟨interp⟩ | 90.8MB | 90.8MB | 18.2MB | 174KB |
| mandelbrot | WASM ▶ production | 90.8MB | 90.8MB | 18.3MB | 1KB |
| spectral-norm | Rust AVX2 | — | — | — | — |
| spectral-norm | Rust (generic) | — | — | — | — |
| spectral-norm | Node.js | 48.9MB | 48.9MB | 4.4MB | 294KB |
| spectral-norm | Python | — | — | 4KB | 4KB |
| binary-trees | Rust AVX2 | — | — | — | — |
| binary-trees | Rust (generic) | — | — | — | — |
| binary-trees | Node.js | 48.5MB | 48.5MB | 4.6MB | 428KB |
| binary-trees | Python | — | — | 368B | 368B |
| binary-trees | Galerina passive ⟨interp⟩ | 89.7MB | 89.7MB | 20.2MB | 69KB |
| binary-trees | Galerina manifest ⟨interp⟩ | 89.7MB | 89.7MB | 19.4MB | 1.7MB |
| binary-trees | Galerina governed ⟨interp⟩ | 90.5MB | 90.5MB | 19.8MB | 2.0MB |
| binary-trees | WASM ▶ production | 93.5MB | 93.5MB | 18.0MB | 2KB |
| spore-container | Rust AVX2 | — | — | — | — |
| spore-container | Rust (generic) | — | — | — | — |
| spore-container | Node.js | 64.5MB | 64.5MB | 8.8MB | 1.6MB |
| spore-container | Python | — | — | 5KB | 5KB |
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
| compute-mix | C++ | 30.00s | — | — | — |
| compute-mix | Node.js | 5.00s | 5.02s | 100% | 141.7K ops/CPU-ms |
| compute-mix | Python | 5.04s | 5.03s | 100% | 824.84 ops/CPU-ms |
| compute-mix | Galerina passive ⟨interp⟩ | 0.3ms | 0.0ms | 0% | — |
| compute-mix | Galerina manifest ⟨interp⟩ | 26.1ms | 31.0ms | 119% | 1.6K ops/CPU-ms |
| compute-mix | Galerina governed ⟨interp⟩ | 27.8ms | 32.0ms | 115% | 1.6K ops/CPU-ms |
| compute-mix | WASM ▶ production | 1.24s | 1.23s | 100% | 81.0K ops/CPU-ms |
| arithmetic-threshold | Rust AVX2 | 12.5ms | — | — | — |
| arithmetic-threshold | Rust (generic) | 12.5ms | — | — | — |
| arithmetic-threshold | C++ | 10.4ms | — | — | — |
| arithmetic-threshold | Node.js | 20.0ms | 31.0ms | 155% | 645.2K ops/CPU-ms |
| arithmetic-threshold | Python | 4.91s | 4.91s | 100% | 4.1K ops/CPU-ms |
| arithmetic-threshold | Galerina passive ⟨interp⟩ | 0.1ms | 0.0ms | 0% | — |
| arithmetic-threshold | Galerina manifest ⟨interp⟩ | 11.3ms | 31.0ms | 276% | 2.0K ops/CPU-ms |
| arithmetic-threshold | Galerina governed ⟨interp⟩ | 11.8ms | 32.0ms | 272% | 2.0K ops/CPU-ms |
| arithmetic-threshold | WASM ▶ production | 1.10s | 1.09s | 99% | 520.8K ops/CPU-ms |
| six-digit-guess | Rust AVX2 | 0.6ms | — | — | — |
| six-digit-guess | Rust (generic) | 0.5ms | — | — | — |
| six-digit-guess | C++ | 0.6ms | — | — | — |
| six-digit-guess | Node.js | 14.6ms | 16.0ms | 110% | 2.6K ops/CPU-ms |
| six-digit-guess | Python | 471.6ms | 468.8ms | 99% | 89.75 ops/CPU-ms |
| six-digit-guess | Galerina passive ⟨interp⟩ | 0.3ms | 0.0ms | 0% | — |
| six-digit-guess | Galerina manifest ⟨interp⟩ | 862.2ms | 937.0ms | 109% | 44.90 ops/CPU-ms |
| six-digit-guess | Galerina governed ⟨interp⟩ | 788.5ms | 797.0ms | 101% | 52.78 ops/CPU-ms |
| six-digit-guess | WASM ▶ production | 1.10s | 1.09s | 100% | 38.5K ops/CPU-ms |
| record-allocation | Rust AVX2 | 10.9ms | — | — | — |
| record-allocation | Rust (generic) | 8.3ms | — | — | — |
| record-allocation | Node.js | 3.4ms | 0.0ms | 0% | — |
| record-allocation | Python | 55.5ms | 46.9ms | 84% | 4.3K ops/CPU-ms |
| record-allocation | Galerina passive ⟨interp⟩ | 0.4ms | 0.0ms | 0% | — |
| record-allocation | Galerina manifest ⟨interp⟩ | 4.1ms | 78.0ms | 1916% | 128.21 ops/CPU-ms |
| record-allocation | Galerina governed ⟨interp⟩ | 4.3ms | 0.0ms | 0% | — |
| record-allocation | WASM ▶ production | 1.00s | 1.02s | 101% | 570.9K ops/CPU-ms |
| fibonacci-recursive | Rust AVX2 | 384.0ms | — | — | — |
| fibonacci-recursive | Rust (generic) | 387.8ms | — | — | — |
| fibonacci-recursive | Node.js | 746.7ms | 734.0ms | 98% | 0.14 ops/CPU-ms |
| fibonacci-recursive | Python | 3.55s | 3.56s | 100% | 0.01 ops/CPU-ms |
| fibonacci-recursive | Galerina passive ⟨interp⟩ | 0.1ms | 0.0ms | 0% | — |
| fibonacci-recursive | Galerina manifest ⟨interp⟩ | 54.3ms | 63.0ms | 116% | 0.02 ops/CPU-ms |
| fibonacci-recursive | Galerina governed ⟨interp⟩ | 65.5ms | 155.0ms | 237% | 0.01 ops/CPU-ms |
| fibonacci-recursive | WASM ▶ production | 1.05s | 1.05s | 99% | 18.15 ops/CPU-ms |
| tower-of-hanoi | Rust AVX2 | 504.2ms | — | — | — |
| tower-of-hanoi | Rust (generic) | 496.6ms | — | — | — |
| tower-of-hanoi | Node.js | 98.6ms | 94.0ms | 95% | 139.4K ops/CPU-ms |
| tower-of-hanoi | Python | 456.7ms | 453.1ms | 99% | 2.9K ops/CPU-ms |
| tower-of-hanoi | Galerina passive ⟨interp⟩ | 0.1ms | 0.0ms | 0% | — |
| tower-of-hanoi | Galerina manifest ⟨interp⟩ | 597.5ms | 610.0ms | 102% | 107.43 ops/CPU-ms |
| tower-of-hanoi | Galerina governed ⟨interp⟩ | 623.1ms | 656.0ms | 105% | 99.90 ops/CPU-ms |
| tower-of-hanoi | WASM ▶ production | 1.02s | 1.02s | 99% | 129.0K ops/CPU-ms |
| collection-pipeline | Rust AVX2 | 74.4ms | — | — | — |
| collection-pipeline | Rust (generic) | 226.0ms | — | — | — |
| collection-pipeline | Node.js | 652.8ms | 657.0ms | 101% | 76.1K ops/CPU-ms |
| collection-pipeline | Python | 4.77s | 4.77s | 100% | 10.5K ops/CPU-ms |
| collection-pipeline | Galerina passive ⟨interp⟩ | 0.3ms | 16.0ms | 4878% | — |
| collection-pipeline | Galerina manifest ⟨interp⟩ | 4.3ms | 0.0ms | 0% | — |
| collection-pipeline | Galerina governed ⟨interp⟩ | 4.4ms | 62.0ms | 1396% | 161.29 ops/CPU-ms |
| collection-pipeline | WASM ▶ production | 1.02s | 1.02s | 100% | 442.9K ops/CPU-ms |
| governance-cost | Rust AVX2 | 12.5ms | — | — | — |
| governance-cost | Rust (generic) | 11.1ms | — | — | — |
| governance-cost | Node.js | 46.2ms | 47.0ms | 102% | — |
| governance-cost | Python | 4.82s | 4.81s | 100% | — |
| governance-cost | Galerina passive ⟨interp⟩ | 1.9ms | 0.0ms | 0% | — |
| governance-cost | Galerina manifest ⟨interp⟩ | 0.9ms | 0.0ms | 0% | — |
| governance-cost | Galerina governed ⟨interp⟩ | 1.2ms | 0.0ms | 0% | — |
| governance-cost | WASM ▶ production | 1.00s | 1.02s | 102% | — |
| hardware-targets | Rust AVX2 | 809.7ms | — | — | — |
| hardware-targets | Rust (generic) | 808.3ms | — | — | — |
| hardware-targets | Node.js | 1.05s | 1.05s | 100% | 955.11 ops/CPU-ms |
| hardware-targets | Galerina passive ⟨interp⟩ | 13.6ms | 47.0ms | 346% | — |
| hardware-targets | Galerina manifest ⟨interp⟩ | 0.2ms | 0.0ms | 0% | — |
| hardware-targets | Galerina governed ⟨interp⟩ | 0.2ms | 0.0ms | 0% | — |
| hardware-targets | WASM ▶ production | 1.00s | 1.00s | 100% | 40.4K ops/CPU-ms |
| low-memory | Rust AVX2 | 157.0ms | — | — | — |
| low-memory | Rust (generic) | 707.9ms | — | — | — |
| low-memory | Node.js | 69.6ms | 94.0ms | 135% | 531.9K ops/CPU-ms |
| low-memory | Python | 3.61s | 3.61s | 100% | 2.8K ops/CPU-ms |
| low-memory | Galerina passive ⟨interp⟩ | 0.6ms | 0.0ms | 0% | — |
| low-memory | Galerina manifest ⟨interp⟩ | 79.0ms | 125.0ms | 158% | 80.00 ops/CPU-ms |
| low-memory | Galerina governed ⟨interp⟩ | 67.0ms | 63.0ms | 94% | 158.73 ops/CPU-ms |
| low-memory | WASM ▶ production | 1.01s | 1.00s | 99% | 500.0K ops/CPU-ms |
| gpu-compute | Rust AVX2 | 4.01s | — | — | — |
| gpu-compute | Rust (generic) | 4.03s | — | — | — |
| gpu-compute | Node.js | 482.2ms | 484.0ms | 100% | 1.03M ops/CPU-ms |
| gpu-compute | Python | 8.10s | 8.09s | 100% | 6.2K ops/CPU-ms |
| gpu-compute | Galerina passive ⟨interp⟩ | 0.2ms | 0.0ms | 0% | — |
| gpu-compute | Galerina manifest ⟨interp⟩ | 285.4ms | 343.0ms | 120% | 291.55 ops/CPU-ms |
| gpu-compute | Galerina governed ⟨interp⟩ | 293.3ms | 360.0ms | 123% | 277.78 ops/CPU-ms |
| gpu-compute | WASM ▶ production | 1.01s | 1.00s | 99% | 500.0K ops/CPU-ms |
| matrix-multiply | Rust AVX2 | 90.1ms | — | — | — |
| matrix-multiply | Rust (generic) | 84.7ms | — | — | — |
| matrix-multiply | Node.js | 203.0ms | 204.0ms | 101% | 642.5K ops/CPU-ms |
| matrix-multiply | Python | 2.03s | — | — | — |
| matrix-multiply | Galerina passive ⟨interp⟩ | 0.2ms | 0.0ms | 0% | — |
| matrix-multiply | Galerina manifest ⟨interp⟩ | 50.1ms | 46.0ms | 92% | 712.35 ops/CPU-ms |
| matrix-multiply | Galerina governed ⟨interp⟩ | 43.0ms | 63.0ms | 147% | 520.13 ops/CPU-ms |
| matrix-multiply | WASM ▶ production | 1.06s | 1.06s | 100% | 462.8K ops/CPU-ms |
| crypto-ops | Galerina passive ⟨interp⟩ | 19.0ms | 16.0ms | 84% | — |
| crypto-ops | Galerina manifest ⟨interp⟩ | 0.6ms | 0.0ms | 0% | — |
| crypto-ops | Galerina governed ⟨interp⟩ | 7.0ms | 16.0ms | 227% | 0.06 ops/CPU-ms |
| text-html | Galerina passive ⟨interp⟩ | 2.1ms | 0.0ms | 0% | — |
| text-html | Galerina manifest ⟨interp⟩ | 0.5ms | 0.0ms | 0% | — |
| text-html | Galerina governed ⟨interp⟩ | 1.3ms | 0.0ms | 0% | — |
| tri-logic | Rust AVX2 | 414.6ms | — | — | — |
| tri-logic | Rust (generic) | 413.5ms | — | — | — |
| tri-logic | Node.js | 288.9ms | — | — | — |
| tri-logic | Python | 1.47s | — | — | — |
| tri-logic | Galerina passive ⟨interp⟩ | 1.6ms | 0.0ms | 0% | — |
| tri-logic | Galerina manifest ⟨interp⟩ | 806.1ms | 859.0ms | 107% | 349.24 ops/CPU-ms |
| tri-logic | Galerina governed ⟨interp⟩ | 916.9ms | 969.0ms | 106% | 309.60 ops/CPU-ms |
| tri-logic | WASM ▶ production | 1.22s | 1.22s | 100% | 492.2K ops/CPU-ms |
| data-query | Node.js | 124.1ms | — | — | — |
| data-query | Python | 944.1ms | — | — | — |
| data-query | Galerina passive ⟨interp⟩ | 0.8ms | 0.0ms | 0% | — |
| data-query | Galerina manifest ⟨interp⟩ | 45.8ms | 94.0ms | 205% | 106.38 ops/CPU-ms |
| data-query | Galerina governed ⟨interp⟩ | 48.4ms | 47.0ms | 97% | 212.77 ops/CPU-ms |
| call-chain | Node.js | 6.7ms | 15.0ms | 224% | 133.3K ops/CPU-ms |
| call-chain | Python | 674.6ms | 687.5ms | 102% | 1.5K ops/CPU-ms |
| call-chain | Galerina passive ⟨interp⟩ | 0.1ms | 0.0ms | 0% | — |
| call-chain | Galerina manifest ⟨interp⟩ | 889.5ms | 922.0ms | 104% | 54.23 ops/CPU-ms |
| call-chain | Galerina governed ⟨interp⟩ | 864.7ms | 937.0ms | 108% | 53.36 ops/CPU-ms |
| call-chain | WASM ▶ production | 1.74s | 1.74s | 100% | 57.6K ops/CPU-ms |
| nbody | Node.js | 52.6ms | 63.0ms | 120% | 104.0K ops/CPU-ms |
| nbody | Python | 1.60s | — | — | — |
| nbody | Galerina passive ⟨interp⟩ | 0.3ms | 0.0ms | 0% | — |
| nbody | Galerina manifest ⟨interp⟩ | 509.2ms | 547.0ms | 107% | 59.90 ops/CPU-ms |
| nbody | Galerina governed ⟨interp⟩ | 513.8ms | 547.0ms | 106% | 59.90 ops/CPU-ms |
| nbody | WASM ▶ production | 1.07s | 1.08s | 101% | 30.4K ops/CPU-ms |
| json-parse | Galerina passive ⟨interp⟩ | 0.5ms | 0.0ms | 0% | — |
| json-parse | Galerina manifest ⟨interp⟩ | 98.3ms | 109.0ms | 111% | 4.59 ops/CPU-ms |
| json-parse | Galerina governed ⟨interp⟩ | 88.7ms | 156.0ms | 176% | 3.20 ops/CPU-ms |
| mandelbrot | Rust AVX2 | 136.0ms | — | — | — |
| mandelbrot | Rust (generic) | 136.2ms | — | — | — |
| mandelbrot | Node.js | 463.0ms | 469.0ms | 101% | 7.0K ops/CPU-ms |
| mandelbrot | Python | 15.99s | — | — | — |
| mandelbrot | Galerina passive ⟨interp⟩ | 0.2ms | 0.0ms | 0% | — |
| mandelbrot | Galerina manifest ⟨interp⟩ | 2.03s | 2.06s | 102% | 7.94 ops/CPU-ms |
| mandelbrot | Galerina governed ⟨interp⟩ | 2.04s | 2.08s | 102% | 7.88 ops/CPU-ms |
| mandelbrot | WASM ▶ production | 1.74s | 1.73s | 100% | 9.4K ops/CPU-ms |
| spectral-norm | Rust AVX2 | 28.2ms | — | — | — |
| spectral-norm | Rust (generic) | 25.6ms | — | — | — |
| spectral-norm | Node.js | 40.9ms | 47.0ms | 115% | 212.8K ops/CPU-ms |
| spectral-norm | Python | 5.52s | — | — | — |
| binary-trees | Rust AVX2 | 6.9ms | — | — | — |
| binary-trees | Rust (generic) | 6.5ms | — | — | — |
| binary-trees | Node.js | 1.7ms | 0.0ms | 0% | — |
| binary-trees | Python | 46.7ms | 46.9ms | 100% | 2.9K ops/CPU-ms |
| binary-trees | Galerina passive ⟨interp⟩ | 0.1ms | 0.0ms | 0% | — |
| binary-trees | Galerina manifest ⟨interp⟩ | 367.5ms | 438.0ms | 119% | 310.17 ops/CPU-ms |
| binary-trees | Galerina governed ⟨interp⟩ | 390.2ms | 437.0ms | 112% | 310.88 ops/CPU-ms |
| binary-trees | WASM ▶ production | 1.11s | 1.11s | 100% | 612.5K ops/CPU-ms |
| spore-container | Rust AVX2 | 2.17s | — | — | — |
| spore-container | Rust (generic) | 2.25s | — | — | — |
| spore-container | Node.js | 6.48s | 7.95s | 123% | 37.72 ops/CPU-ms |
| spore-container | Python | 1.17s | — | — | — |
| framework-pipeline | Python | 1.77s | — | — | — |
| http-throughput | Node.js | 88.0ms | — | — | — |
| naming-check | Node.js | 432.0ms | — | — | — |
| context-receipt | Node.js | 307.0ms | — | — | — |
| intelligence-search | Node.js | 48.0ms | — | — | — |
| provenance-trace | Node.js | 1.87s | — | — | — |

> **CPU utilisation** = CPU ms ÷ wall ms × 100. Node.js approaches 100% (single-thread JIT). Python may show <100% on Windows where process_time measures differently.

## 4. Per-Benchmark Detail

> **Heap/op** = heap bytes allocated per operation (the fair, workload-attributable memory metric).
> Managed runtimes (Node/Python/Galerina/WASM) report it via a GC'd before/after delta; native Rust/C++
> show **~0 (native)** — no GC-managed heap. `~0` = no measurable per-op allocation (e.g. V8 tagged ints);
> a large positive value (e.g. the Galerina tree-walker boxing a value per AST node) is allocation pressure.

### compute-mix

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Node.js | 142.18M/s | 5.00s | 5.02s | 44.1MB | ~0 | 172.6× | 1.00× |
| 🥈 | 🟢 | C++ | 139.54M/s | 30.00s | — | — | ~0 (native) | 169.4× | 0.98× |
| 🥉 | 🟢 | Rust (generic) | 139.35M/s | 5.00s | — | — | ~0 (native) | 169.2× | 0.98× |
| 4 | 🟢 | Rust AVX2 | 135.85M/s | 5.00s | — | — | ~0 (native) | 164.9× | 0.96× |
| 5 | ⚪ | WASM ▶ production | 80.89M/s | 1.24s | 1.23s | 71.7MB | ~0 | 98.2× | 0.57× |
| 6 | 🔴 | Galerina passive ⟨interp⟩ | 2.35M/s | 0.3ms | 0.0ms | 78.0MB | 89 B/op | 2.85× | 0.02× |
| 7 | 🔴 | Galerina manifest ⟨interp⟩ | 1.92M/s | 26.1ms | 31.0ms | 74.2MB | 89 B/op | 2.33× | 0.01× |
| 8 | 🔴 | Galerina governed ⟨interp⟩ | 1.80M/s | 27.8ms | 32.0ms | 73.0MB | 90 B/op | 2.18× | 0.01× |
| 9 | ⚫ | Python | 823.7K/s | 5.04s | 5.03s | — | ~0 | 1.00× | 0.01× |

> 🧠 **Lowest heap/op:** WASM ▶ production (~0) · **highest:** Galerina governed ⟨interp⟩ (90 B/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### arithmetic-threshold

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | C++ | 1.92B/s | 10.4ms | — | — | ~0 (native) | 472.2× | 1.92× |
| 🥈 | 🟢 | Rust (generic) | 1.60B/s | 12.5ms | — | — | ~0 (native) | 392.7× | 1.60× |
| 🥉 | 🟢 | Rust AVX2 | 1.60B/s | 12.5ms | — | — | ~0 (native) | 392.6× | 1.60× |
| 4 | 🟢 | Node.js | 1.00B/s | 20.0ms | 31.0ms | 47.1MB | ~0 | 245.8× | 1.00× |
| 5 | ⚪ | WASM ▶ production | 516.04M/s | 1.10s | 1.09s | 81.6MB | ~0 | 126.7× | 0.52× |
| 6 | ⚫ | Galerina manifest ⟨interp⟩ | 5.62M/s | 11.3ms | 31.0ms | 79.3MB | 13 B/op | 1.38× | 0.01× |
| 7 | ⚫ | Galerina governed ⟨interp⟩ | 5.38M/s | 11.8ms | 32.0ms | 78.9MB | 14 B/op | 1.32× | 0.01× |
| 8 | ⚫ | Python | 4.07M/s | 4.91s | 4.91s | — | ~0 | 1.00× | 0.00× |
| 9 | ⚫ | Galerina passive ⟨interp⟩ | 37.3K/s | 0.1ms | 0.0ms | 79.6MB | 12.7 KB/op | 0.01× | 0.00× |

> 🧠 **Lowest heap/op:** WASM ▶ production (~0) · **highest:** Galerina passive ⟨interp⟩ (12.7 KB/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### six-digit-guess

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Rust (generic) | 79.71M/s | 0.5ms | — | — | ~0 (native) | 893.5× | 27.6× |
| 🥈 | 🟢 | Rust AVX2 | 75.82M/s | 0.6ms | — | — | ~0 (native) | 849.9× | 26.2× |
| 🥉 | 🟢 | C++ | 68.83M/s | 0.6ms | — | — | ~0 (native) | 771.6× | 23.8× |
| 4 | 🟢 | WASM ▶ production | 38.30M/s | 1.10s | 1.09s | 82.0MB | ~0 | 429.3× | 13.3× |
| 5 | 🟢 | Node.js | 2.89M/s | 14.6ms | 16.0ms | 51.8MB | 26 B/op | 32.4× | 1.00× |
| 6 | 🔴 | Python | 89.2K/s | 471.6ms | 468.8ms | — | ~0 | 1.00× | 0.03× |
| 7 | 🔴 | Galerina governed ⟨interp⟩ | 53.4K/s | 788.5ms | 797.0ms | 80.2MB | 10 B/op | 0.60× | 0.02× |
| 8 | 🔴 | Galerina manifest ⟨interp⟩ | 48.8K/s | 862.2ms | 937.0ms | 80.2MB | 20 B/op | 0.55× | 0.02× |
| 9 | ⚫ | Galerina passive ⟨interp⟩ | 12.0K/s | 0.3ms | 0.0ms | 80.5MB | -652.7 KB/op | 0.13× | 0.00× |

> 🧠 **Lowest heap/op:** Galerina passive ⟨interp⟩ (-652.7 KB/op) · **highest:** Node.js (26 B/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### record-allocation

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Rust (generic) | 1.21B/s | 8.3ms | — | — | ~0 (native) | 336.4× | 20.7× |
| 🥈 | 🟢 | Rust AVX2 | 920.01M/s | 10.9ms | — | — | ~0 (native) | 255.3× | 15.7× |
| 🥉 | 🟢 | WASM ▶ production | 579.16M/s | 1.00s | 1.02s | 83.0MB | ~0 | 160.7× | 9.90× |
| 4 | 🟢 | Node.js | 58.51M/s | 3.4ms | 0.0ms | 48.2MB | 1 B/op | 16.2× | 1.00× |
| 5 | 🟡 | Galerina passive ⟨interp⟩ | 8.32M/s | 0.4ms | 0.0ms | 80.6MB | 61 B/op | 2.31× | 0.14× |
| 6 | 🔴 | Python | 3.60M/s | 55.5ms | 46.9ms | — | ~0 | 1.00× | 0.06× |
| 7 | 🔴 | Galerina manifest ⟨interp⟩ | 2.46M/s | 4.1ms | 78.0ms | 80.5MB | 8 B/op | 0.68× | 0.04× |
| 8 | 🔴 | Galerina governed ⟨interp⟩ | 2.30M/s | 4.3ms | 0.0ms | 81.4MB | 6 B/op | 0.64× | 0.04× |

> 🧠 **Lowest heap/op:** WASM ▶ production (~0) · **highest:** Galerina passive ⟨interp⟩ (61 B/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### fibonacci-recursive

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Galerina passive ⟨interp⟩ | 65.1K/s | 0.1ms | 0.0ms | 81.4MB | 11.5 KB/op | 11.6K× | 486.1× |
| 🥈 | 🟢 | WASM ▶ production | 18.1K/s | 1.05s | 1.05s | 83.3MB | ~0 | 3.2K× | 134.8× |
| 🥉 | 🟢 | Rust AVX2 | 520.8/s | 384.0ms | — | — | ~0 (native) | 92.5× | 3.89× |
| 4 | 🟢 | Rust (generic) | 515.8/s | 387.8ms | — | — | ~0 (native) | 91.6× | 3.85× |
| 5 | 🟢 | Node.js | 133.9/s | 746.7ms | 734.0ms | 46.4MB | 53 B/op | 23.8× | 1.00× |
| 6 | 🟡 | Galerina manifest ⟨interp⟩ | 18.0/s | 54.3ms | 63.0ms | 81.4MB | 1116.1 KB/op | 3.20× | 0.13× |
| 7 | 🟡 | Galerina governed ⟨interp⟩ | 15.0/s | 65.5ms | 155.0ms | 80.9MB | 972.8 KB/op | 2.66× | 0.11× |
| 8 | 🔴 | Python | 5.6/s | 3.55s | 3.56s | — | 23 B/op | 1.00× | 0.04× |

> 🧠 **Lowest heap/op:** WASM ▶ production (~0) · **highest:** Galerina manifest ⟨interp⟩ (1116.1 KB/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### tower-of-hanoi

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Rust (generic) | 263.94M/s | 496.6ms | — | — | ~0 (native) | 92.0× | 1.99× |
| 🥈 | 🟢 | Rust AVX2 | 259.97M/s | 504.2ms | — | — | ~0 (native) | 90.6× | 1.96× |
| 🥉 | 🟢 | Node.js | 132.94M/s | 98.6ms | 94.0ms | 46.4MB | ~0 | 46.3× | 1.00× |
| 4 | 🟢 | WASM ▶ production | 128.19M/s | 1.02s | 1.02s | 83.7MB | ~0 | 44.7× | 0.96× |
| 5 | 🔴 | Python | 2.87M/s | 456.7ms | 453.1ms | — | ~0 | 1.00× | 0.02× |
| 6 | ⚫ | Galerina passive ⟨interp⟩ | 112.1K/s | 0.1ms | 0.0ms | 84.6MB | 6.8 KB/op | 0.04× | 0.00× |
| 7 | ⚫ | Galerina manifest ⟨interp⟩ | 109.7K/s | 597.5ms | 610.0ms | 83.6MB | 18 B/op | 0.04× | 0.00× |
| 8 | ⚫ | Galerina governed ⟨interp⟩ | 105.2K/s | 623.1ms | 656.0ms | 83.6MB | 21 B/op | 0.04× | 0.00× |

> 🧠 **Lowest heap/op:** WASM ▶ production (~0) · **highest:** Galerina passive ⟨interp⟩ (6.8 KB/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### collection-pipeline

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Rust AVX2 | 13.45B/s | 74.4ms | — | — | ~0 (native) | 1.3K× | 175.6× |
| 🥈 | 🟢 | Rust (generic) | 4.42B/s | 226.0ms | — | — | ~0 (native) | 421.9× | 57.8× |
| 🥉 | 🟢 | WASM ▶ production | 442.43M/s | 1.02s | 1.02s | 87.0MB | ~0 | 42.2× | 5.78× |
| 4 | 🟢 | Node.js | 76.60M/s | 652.8ms | 657.0ms | 63.3MB | ~0 | 7.30× | 1.00× |
| 5 | 🟡 | Python | 10.49M/s | 4.77s | 4.77s | — | ~0 | 1.00× | 0.14× |
| 6 | 🟡 | Galerina passive ⟨interp⟩ | 8.30M/s | 0.3ms | 16.0ms | 84.2MB | 99 B/op | 0.79× | 0.11× |
| 7 | 🔴 | Galerina manifest ⟨interp⟩ | 2.31M/s | 4.3ms | 0.0ms | 84.2MB | 17 B/op | 0.22× | 0.03× |
| 8 | 🔴 | Galerina governed ⟨interp⟩ | 2.25M/s | 4.4ms | 62.0ms | 87.2MB | 17 B/op | 0.21× | 0.03× |

> 🧠 **Lowest heap/op:** WASM ▶ production (~0) · **highest:** Galerina passive ⟨interp⟩ (99 B/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### governance-cost ⚠️ (excluded — not unit-aligned)

> internal governed/manifest ratio — native baseline does no governance; not cross-runtime by design

| Runtime | Raw reported throughput (native unit — **NOT comparable**) | Wall |
|---|---|---|
| Rust AVX2 | 797.58M/s | 12.5ms |
| Rust (generic) | 901.23M/s | 11.1ms |
| Node.js | 2.16M/s | 46.2ms |
| Python | 20.7K/s | 4.82s |
| Galerina passive ⟨interp⟩ | 2.5K/s | 1.9ms |
| Galerina manifest ⟨interp⟩ | 1.1K/s | 0.9ms |
| Galerina governed ⟨interp⟩ | 812.0/s | 1.2ms |
| WASM ▶ production | 3.02M/s | 1.00s |

### hardware-targets

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | WASM ▶ production | 40.37M/s | 1.00s | 1.00s | 86.7MB | ~0 | — | 42.4× |
| 🥈 | 🟢 | Rust (generic) | 1.24M/s | 808.3ms | — | — | ~0 (native) | — | 1.30× |
| 🥉 | 🟢 | Rust AVX2 | 1.23M/s | 809.7ms | — | — | ~0 (native) | — | 1.30× |
| 4 | 🟢 | Node.js | 953.1K/s | 1.05s | 1.05s | 48.2MB | ~0 | — | 1.00× |
| 5 | 🔴 | Galerina passive ⟨interp⟩ | 73.5K/s | 13.6ms | 47.0ms | 84.6MB | -322 B/op | — | 0.08× |
| 6 | ⚫ | Galerina manifest ⟨interp⟩ | 4.2K/s | 0.2ms | 0.0ms | 84.4MB | 75.1 KB/op | — | 0.00× |
| 7 | ⚫ | Galerina governed ⟨interp⟩ | 4.2K/s | 0.2ms | 0.0ms | 84.3MB | 76.0 KB/op | — | 0.00× |

> 🧠 **Lowest heap/op:** Galerina passive ⟨interp⟩ (-322 B/op) · **highest:** Galerina governed ⟨interp⟩ (76.0 KB/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### low-memory

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Rust AVX2 | 6.37B/s | 157.0ms | — | — | ~0 | 2.3K× | 8.86× |
| 🥈 | 🟢 | Rust (generic) | 1.41B/s | 707.9ms | — | — | ~0 | 510.1× | 1.97× |
| 🥉 | 🟢 | Node.js | 718.39M/s | 69.6ms | 94.0ms | 46.4MB | ~0 | 259.4× | 1.00× |
| 4 | ⚪ | WASM ▶ production | 494.49M/s | 1.01s | 1.00s | 87.1MB | ~0 | 178.6× | 0.69× |
| 5 | ⚫ | Python | 2.77M/s | 3.61s | 3.61s | — | ~0 | 1.00× | 0.00× |
| 6 | ⚫ | Galerina passive ⟨interp⟩ | 175.5K/s | 0.6ms | 0.0ms | 84.6MB | -3.4 KB/op | 0.06× | 0.00× |
| 7 | ⚫ | Galerina governed ⟨interp⟩ | 149.3K/s | 67.0ms | 63.0ms | 84.6MB | 22 B/op | 0.05× | 0.00× |
| 8 | ⚫ | Galerina manifest ⟨interp⟩ | 126.5K/s | 79.0ms | 125.0ms | 85.0MB | 48 B/op | 0.05× | 0.00× |

> 🧠 **Lowest heap/op:** Galerina passive ⟨interp⟩ (-3.4 KB/op) · **highest:** Galerina manifest ⟨interp⟩ (48 B/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### gpu-compute

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Rust AVX2 | 1.25B/s | 4.01s | — | — | ~0 (native) | 201.8× | 1.20× |
| 🥈 | 🟢 | Rust (generic) | 1.24B/s | 4.03s | — | — | ~0 (native) | 200.8× | 1.20× |
| 🥉 | 🟢 | Node.js | 1.04B/s | 482.2ms | 484.0ms | 46.6MB | ~0 | 167.9× | 1.00× |
| 4 | 🟡 | WASM ▶ production | 497.17M/s | 1.01s | 1.00s | 87.7MB | ~0 | 80.5× | 0.48× |
| 5 | ⚫ | Python | 6.17M/s | 8.10s | 8.09s | — | ~0 | 1.00× | 0.01× |
| 6 | ⚫ | Galerina passive ⟨interp⟩ | 403.0K/s | 0.2ms | 0.0ms | 85.0MB | 2.7 KB/op | 0.07× | 0.00× |
| 7 | ⚫ | Galerina manifest ⟨interp⟩ | 350.4K/s | 285.4ms | 343.0ms | 84.9MB | 6 B/op | 0.06× | 0.00× |
| 8 | ⚫ | Galerina governed ⟨interp⟩ | 340.9K/s | 293.3ms | 360.0ms | 85.0MB | 8 B/op | 0.06× | 0.00× |

> 🧠 **Lowest heap/op:** WASM ▶ production (~0) · **highest:** Galerina passive ⟨interp⟩ (2.7 KB/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### matrix-multiply

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Rust (generic) | 1.55B/s | 84.7ms | — | — | ~0 (native) | 239.1× | 2.40× |
| 🥈 | 🟢 | Rust AVX2 | 1.45B/s | 90.1ms | — | — | ~0 (native) | 224.8× | 2.25× |
| 🥉 | 🟢 | Node.js | 645.77M/s | 203.0ms | 204.0ms | 48.5MB | ~0 | 99.8× | 1.00× |
| 4 | ⚪ | WASM ▶ production | 463.74M/s | 1.06s | 1.06s | 87.8MB | ~0 | 71.7× | 0.72× |
| 5 | 🔴 | Python | 6.47M/s | 2.03s | — | — | 8 B/op | 1.00× | 0.01× |
| 6 | ⚫ | Galerina passive ⟨interp⟩ | 867.7K/s | 0.2ms | 0.0ms | 85.5MB | -4.3 KB/op | 0.13× | 0.00× |
| 7 | ⚫ | Galerina governed ⟨interp⟩ | 762.9K/s | 43.0ms | 63.0ms | 86.8MB | 29 B/op | 0.12× | 0.00× |
| 8 | ⚫ | Galerina manifest ⟨interp⟩ | 653.5K/s | 50.1ms | 46.0ms | 85.4MB | 30 B/op | 0.10× | 0.00× |

> 🧠 **Lowest heap/op:** Galerina passive ⟨interp⟩ (-4.3 KB/op) · **highest:** Galerina manifest ⟨interp⟩ (30 B/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### crypto-ops

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Galerina passive ⟨interp⟩ | 5.3K/s | 19.0ms | 16.0ms | 86.0MB | 6.1 KB/op | — | — |
| 🥈 | 🟡 | Galerina manifest ⟨interp⟩ | 1.7K/s | 0.6ms | 0.0ms | 85.8MB | 243.5 KB/op | — | — |
| 🥉 | 🔴 | Galerina governed ⟨interp⟩ | 142.0/s | 7.0ms | 16.0ms | 85.8MB | 313.7 KB/op | — | — |

> 🧠 **Lowest heap/op:** Galerina passive ⟨interp⟩ (6.1 KB/op) · **highest:** Galerina governed ⟨interp⟩ (313.7 KB/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### text-html

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Galerina passive ⟨interp⟩ | 47.2K/s | 2.1ms | 0.0ms | 87.9MB | -4.1 KB/op | — | — |
| 🥈 | 🔴 | Galerina manifest ⟨interp⟩ | 2.2K/s | 0.5ms | 0.0ms | 86.3MB | 145.3 KB/op | — | — |
| 🥉 | 🔴 | Galerina governed ⟨interp⟩ | 800.0/s | 1.3ms | 0.0ms | 86.2MB | 165.0 KB/op | — | — |

> 🧠 **Lowest heap/op:** Galerina passive ⟨interp⟩ (-4.1 KB/op) · **highest:** Galerina governed ⟨interp⟩ (165.0 KB/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### tri-logic

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Rust (generic) | 1.45B/s | 413.5ms | — | — | ~0 (native) | 177.8× | 1.40× |
| 🥈 | 🟢 | Rust AVX2 | 1.45B/s | 414.6ms | — | — | ~0 (native) | 177.4× | 1.39× |
| 🥉 | 🟢 | Node.js | 1.04B/s | 288.9ms | — | — | ~0 | 127.3× | 1.00× |
| 4 | 🟡 | WASM ▶ production | 492.35M/s | 1.22s | 1.22s | 90.2MB | ~0 | 60.3× | 0.47× |
| 5 | ⚫ | Python | 8.16M/s | 1.47s | — | — | — | 1.00× | 0.01× |
| 6 | ⚫ | Galerina manifest ⟨interp⟩ | 372.2K/s | 806.1ms | 859.0ms | 86.5MB | 1 B/op | 0.05× | 0.00× |
| 7 | ⚫ | Galerina passive ⟨interp⟩ | 357.0K/s | 1.6ms | 0.0ms | 86.7MB | 396 B/op | 0.04× | 0.00× |
| 8 | ⚫ | Galerina governed ⟨interp⟩ | 327.2K/s | 916.9ms | 969.0ms | 86.5MB | 2 B/op | 0.04× | 0.00× |

> 🧠 **Lowest heap/op:** WASM ▶ production (~0) · **highest:** Galerina passive ⟨interp⟩ (396 B/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### data-query

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Node.js | 403.05M/s | 124.1ms | — | — | ~0 | 126.8× | 1.00× |
| 🥈 | ⚫ | Python | 3.18M/s | 944.1ms | — | — | — | 1.00× | 0.01× |
| 🥉 | ⚫ | Galerina passive ⟨interp⟩ | 272.0K/s | 0.8ms | 0.0ms | 87.1MB | 5.4 KB/op | 0.09× | 0.00× |
| 4 | ⚫ | Galerina manifest ⟨interp⟩ | 218.2K/s | 45.8ms | 94.0ms | 87.1MB | 50 B/op | 0.07× | 0.00× |
| 5 | ⚫ | Galerina governed ⟨interp⟩ | 206.5K/s | 48.4ms | 47.0ms | 87.2MB | 198 B/op | 0.06× | 0.00× |

> 🧠 **Lowest heap/op:** Node.js (~0) · **highest:** Galerina passive ⟨interp⟩ (5.4 KB/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### call-chain

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Node.js | 299.01M/s | 6.7ms | 15.0ms | 47.2MB | ~0 | 201.7× | 1.00× |
| 🥈 | 🟡 | WASM ▶ production | 57.62M/s | 1.74s | 1.74s | 90.1MB | ~0 | 38.9× | 0.19× |
| 🥉 | ⚫ | Python | 1.48M/s | 674.6ms | 687.5ms | — | ~0 | 1.00× | 0.00× |
| 4 | ⚫ | Galerina passive ⟨interp⟩ | 61.5K/s | 0.1ms | 0.0ms | 86.7MB | 10.1 KB/op | 0.04× | 0.00× |
| 5 | ⚫ | Galerina governed ⟨interp⟩ | 57.8K/s | 864.7ms | 937.0ms | 86.7MB | 19 B/op | 0.04× | 0.00× |
| 6 | ⚫ | Galerina manifest ⟨interp⟩ | 56.2K/s | 889.5ms | 922.0ms | 86.7MB | 40 B/op | 0.04× | 0.00× |

> 🧠 **Lowest heap/op:** WASM ▶ production (~0) · **highest:** Galerina passive ⟨interp⟩ (10.1 KB/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### nbody

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Node.js | 124.64M/s | 52.6ms | 63.0ms | 48.5MB | ~0 | 121.7× | 1.00× |
| 🥈 | 🟡 | WASM ▶ production | 30.56M/s | 1.07s | 1.08s | 89.0MB | ~0 | 29.8× | 0.25× |
| 🥉 | ⚫ | Python | 1.02M/s | 1.60s | — | — | 12 B/op | 1.00× | 0.01× |
| 4 | ⚫ | Galerina passive ⟨interp⟩ | 66.2K/s | 0.3ms | 0.0ms | 86.7MB | -98.7 KB/op | 0.06× | 0.00× |
| 5 | ⚫ | Galerina manifest ⟨interp⟩ | 64.4K/s | 509.2ms | 547.0ms | 86.6MB | 8 B/op | 0.06× | 0.00× |
| 6 | ⚫ | Galerina governed ⟨interp⟩ | 63.8K/s | 513.8ms | 547.0ms | 86.6MB | 18 B/op | 0.06× | 0.00× |

> 🧠 **Lowest heap/op:** Galerina passive ⟨interp⟩ (-98.7 KB/op) · **highest:** Galerina governed ⟨interp⟩ (18 B/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### json-parse

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Node.js | 3.29M/s | — | — | — | — | 6.50× | 1.00× |
| 🥈 | 🟡 | Python | 506.5K/s | — | — | — | 1 B/op | 1.00× | 0.15× |
| 🥉 | ⚫ | Galerina passive ⟨interp⟩ | 10.1K/s | 0.5ms | 0.0ms | 94.3MB | 76.5 KB/op | 0.02× | 0.00× |
| 4 | ⚫ | Galerina governed ⟨interp⟩ | 5.6K/s | 88.7ms | 156.0ms | 95.3MB | 3.1 KB/op | 0.01× | 0.00× |
| 5 | ⚫ | Galerina manifest ⟨interp⟩ | 5.1K/s | 98.3ms | 109.0ms | 89.4MB | 4.4 KB/op | 0.01× | 0.00× |

> 🧠 **Lowest heap/op:** Python (1 B/op) · **highest:** Galerina passive ⟨interp⟩ (76.5 KB/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### mandelbrot

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Rust AVX2 | 24.09M/s | 136.0ms | — | — | ~0 (native) | 117.5× | 3.40× |
| 🥈 | 🟢 | Rust (generic) | 24.06M/s | 136.2ms | — | — | ~0 (native) | 117.4× | 3.40× |
| 🥉 | 🟢 | WASM ▶ production | 9.41M/s | 1.74s | 1.73s | 90.8MB | ~0 | 45.9× | 1.33× |
| 4 | 🟢 | Node.js | 7.08M/s | 463.0ms | 469.0ms | 48.4MB | ~0 | 34.5× | 1.00× |
| 5 | 🔴 | Python | 205.0K/s | 15.99s | — | — | ~0 | 1.00× | 0.03× |
| 6 | ⚫ | Galerina passive ⟨interp⟩ | 8.7K/s | 0.2ms | 0.0ms | 91.4MB | 103.7 KB/op | 0.04× | 0.00× |
| 7 | ⚫ | Galerina manifest ⟨interp⟩ | 8.1K/s | 2.03s | 2.06s | 91.4MB | 12 B/op | 0.04× | 0.00× |
| 8 | ⚫ | Galerina governed ⟨interp⟩ | 8.0K/s | 2.04s | 2.08s | 90.8MB | 11 B/op | 0.04× | 0.00× |

> 🧠 **Lowest heap/op:** WASM ▶ production (~0) · **highest:** Galerina passive ⟨interp⟩ (103.7 KB/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### spectral-norm

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Rust (generic) | 390.93M/s | 25.6ms | — | — | ~0 (native) | 215.6× | 1.60× |
| 🥈 | 🟢 | Rust AVX2 | 354.17M/s | 28.2ms | — | — | ~0 (native) | 195.3× | 1.45× |
| 🥉 | 🟢 | Node.js | 244.69M/s | 40.9ms | 47.0ms | 48.9MB | ~0 | 135.0× | 1.00× |
| 4 | ⚫ | Python | 1.81M/s | 5.52s | — | — | ~0 | 1.00× | 0.01× |

> 🧠 **Lowest heap/op:** Python (~0) · **highest:** Node.js (~0). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### binary-trees

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | WASM ▶ production | 612.70M/s | 1.11s | 1.11s | 93.5MB | ~0 | 210.5× | 7.50× |
| 🥈 | 🟢 | Node.js | 81.66M/s | 1.7ms | 0.0ms | 48.5MB | 3 B/op | 28.1× | 1.00× |
| 🥉 | 🟡 | Rust (generic) | 20.90M/s | 6.5ms | — | — | ~0 (native) | 7.18× | 0.26× |
| 4 | 🟡 | Rust AVX2 | 19.69M/s | 6.9ms | — | — | ~0 (native) | 6.76× | 0.24× |
| 5 | 🔴 | Python | 2.91M/s | 46.7ms | 46.9ms | — | ~0 | 1.00× | 0.04× |
| 6 | ⚫ | Galerina passive ⟨interp⟩ | 419.8K/s | 0.1ms | 0.0ms | 89.7MB | 1.9 KB/op | 0.14× | 0.01× |
| 7 | ⚫ | Galerina manifest ⟨interp⟩ | 369.7K/s | 367.5ms | 438.0ms | 89.7MB | 12 B/op | 0.13× | 0.00× |
| 8 | ⚫ | Galerina governed ⟨interp⟩ | 348.2K/s | 390.2ms | 437.0ms | 90.5MB | 15 B/op | 0.12× | 0.00× |

> 🧠 **Lowest heap/op:** Python (~0) · **highest:** Galerina passive ⟨interp⟩ (1.9 KB/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### spore-container

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Rust AVX2 | 138.0K/s | 2.17s | — | — | ~0 (native) | 1.61× | 2.98× |
| 🥈 | 🟢 | Rust (generic) | 133.3K/s | 2.25s | — | — | ~0 (native) | 1.55× | 2.88× |
| 🥉 | 🟢 | Python | 85.7K/s | 1.17s | — | — | ~0 | 1.00× | 1.85× |
| 4 | 🟢 | Node.js | 46.3K/s | 6.48s | 7.95s | 64.5MB | 5 B/op | 0.54× | 1.00× |

> 🧠 **Lowest heap/op:** Python (~0) · **highest:** Node.js (5 B/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### framework-pipeline

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Python | 113.3K/s | 1.77s | — | — | ~0 | 1.00× | — |

> 🧠 **Lowest heap/op:** Python (~0). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

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

**GPU detected:** NVIDIA GeForce RTX 2060 (driver 610.74, 6144 MiB)
**Compute toolchain:** NVIDIA GeForce RTX 2060 present, but NO compute toolchain installed (CUDA/torch-cuda/Deno all absent). GPU cells = 'toolchain required'.
**Deno WebGPU:** ⏳ not installed
**Galerina GPU backend:** `not-implemented` — gpu-plan.ts emits a WGSL skeleton only; no dispatch path (pending Phase 38).

| # | 🚦 | Runtime | Device (🖥️ CPU / 🎮 GPU) | Throughput (kernel ops/s) | Wall | vs Node |
|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Rust AVX2 | 🖥️ CPU (cpu (serial)) | 1.25B/s | 4.01s | 1.20× |
| 🥈 | 🟢 | Rust (generic) | 🖥️ CPU (cpu (serial)) | 1.24B/s | 4.03s | 1.20× |
| 🥉 | 🟢 | Node.js | 🖥️ CPU (cpu (serial)) | 1.04B/s | 482.2ms | 1.00× |
| 4 | 🟡 | WASM ▶ production | 🖥️ CPU (cpu (wasm)) | 497.17M/s | 1.01s | 0.48× |
| 5 | ⚫ | Python | 🖥️ CPU (cpu (serial)) | 6.17M/s | 8.10s | 0.01× |
| 6 | ⚫ | Galerina passive ⟨interp⟩ | 🖥️ CPU (cpu) | 403.0K/s | 0.2ms | 0.00× |
| 7 | ⚫ | Galerina manifest ⟨interp⟩ | 🖥️ CPU (cpu) | 350.4K/s | 285.4ms | 0.00× |
| 8 | ⚫ | Galerina governed ⟨interp⟩ | 🖥️ CPU (cpu) | 340.9K/s | 293.3ms | 0.00× |

**GPU execution status (this machine):**

| Runtime | GPU path | Device | Status |
|---|---|---|---|
| Rust | wgpu (Vulkan/D3D12) | 🖥️ CPU (GPU pending) | 🔧 buildable (cargo present, harness pending) |
| Python | torch CUDA / cupy | 🖥️ CPU (GPU pending) | ⏳ toolchain required (CPU-only torch) |
| Node.js | WebGPU | 🖥️ CPU only | ⏳ toolchain required (no navigator.gpu in Node.js) |
| Deno | WebGPU (built-in) | 🖥️ CPU | ⏳ not installed |
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

| Benchmark | 🏆 Winner | Rust AVX2 | Rust (generic) | C++ | Node.js | Python | Galerina passive ⟨interp⟩ | Galerina manifest ⟨interp⟩ | Galerina governed ⟨interp⟩ | WASM ▶ production |
|---|---|---|---|---|---|---|---|---|---|---|
| **compute-mix** | Node.js | **🏆 winner** | **🏆 winner** | **🏆 winner** | **🏆 winner** | **173× slower** | **61× slower** | **74× slower** | **79× slower** | 2× slower |
| **arithmetic-threshold** | C++ | 1.2× slower | 1.2× slower | **🏆 winner** | 2× slower | **472× slower** | **51.6K× slower** | **342× slower** | **357× slower** | 4× slower |
| **six-digit-guess** | Rust (generic) | 1.1× slower | **🏆 winner** | 1.2× slower | **28× slower** | **894× slower** | **6.6K× slower** | **1.6K× slower** | **1.5K× slower** | 2× slower |
| **record-allocation** | Rust (generic) | 1.3× slower | **🏆 winner** | not run — no C++ impl | **21× slower** | **336× slower** | **146× slower** | **493× slower** | **526× slower** | 2× slower |
| **fibonacci-recursive** | Galerina passive ⟨interp⟩ | **125× slower** | **126× slower** | not run — no C++ impl | **486× slower** | **11.6K× slower** | **🏆 winner** | **3.6K× slower** | **4.3K× slower** | 4× slower |
| **tower-of-hanoi** | Rust (generic) | **🏆 winner** | **🏆 winner** | not run — no C++ impl | 2× slower | **92× slower** | **2.4K× slower** | **2.4K× slower** | **2.5K× slower** | 2× slower |
| **collection-pipeline** | Rust AVX2 | **🏆 winner** | 3× slower | not run — no C++ impl | **176× slower** | **1.3K× slower** | **1.6K× slower** | **5.8K× slower** | **6.0K× slower** | **30× slower** |
| **hardware-targets** | WASM ▶ production | **33× slower** | **33× slower** | not run — no C++ impl | **42× slower** | not run | **549× slower** | **9.7K× slower** | **9.7K× slower** | **🏆 winner** |
| **low-memory** | Rust AVX2 | **🏆 winner** | 5× slower | not run — no C++ impl | 9× slower | **2.3K× slower** | **36.3K× slower** | **50.3K× slower** | **42.7K× slower** | **13× slower** |
| **gpu-compute** | Rust AVX2 | **🏆 winner** | **🏆 winner** | not run — no C++ impl | 1.2× slower | **202× slower** | **3.1K× slower** | **3.6K× slower** | **3.7K× slower** | 3× slower |
| **matrix-multiply** | Rust (generic) | 1.1× slower | **🏆 winner** | not run — no C++ impl | 2× slower | **239× slower** | **1.8K× slower** | **2.4K× slower** | **2.0K× slower** | 3× slower |
| **crypto-ops** | Galerina passive ⟨interp⟩ | no comparable metric | no comparable metric | not run — no C++ impl | no comparable metric | no comparable metric | **🏆 winner** | 3× slower | **37× slower** | no WASM — strings/records |
| **text-html** | Galerina passive ⟨interp⟩ | no comparable metric | no comparable metric | not run — no C++ impl | no comparable metric | no comparable metric | **🏆 winner** | **21× slower** | **59× slower** | no WASM — strings/records |
| **tri-logic** | Rust (generic) | **🏆 winner** | **🏆 winner** | not run — no C++ impl | 1.4× slower | **178× slower** | **4.1K× slower** | **3.9K× slower** | **4.4K× slower** | 3× slower |
| **data-query** | Node.js | not run — no native impl | not run — no native impl | not run — no C++ impl | **🏆 winner** | **127× slower** | **1.5K× slower** | **1.8K× slower** | **2.0K× slower** | no WASM build |
| **call-chain** | Node.js | not run — no native impl | not run — no native impl | not run — no C++ impl | **🏆 winner** | **202× slower** | **4.9K× slower** | **5.3K× slower** | **5.2K× slower** | 5× slower |
| **nbody** | Node.js | not run — no native impl | not run — no native impl | not run — no C++ impl | **🏆 winner** | **122× slower** | **1.9K× slower** | **1.9K× slower** | **2.0K× slower** | 4× slower |
| **json-parse** | Node.js | not run — no native impl | not run — no native impl | not run — no C++ impl | **🏆 winner** | 6× slower | **325× slower** | **647× slower** | **584× slower** | no WASM — strings/records |
| **mandelbrot** | Rust AVX2 | **🏆 winner** | **🏆 winner** | not run — no C++ impl | 3× slower | **118× slower** | **2.8K× slower** | **3.0K× slower** | **3.0K× slower** | 3× slower |
| **spectral-norm** | Rust (generic) | 1.1× slower | **🏆 winner** | not run — no C++ impl | 2× slower | **216× slower** | not run | not run | not run | no WASM build |
| **binary-trees** | WASM ▶ production | **31× slower** | **29× slower** | not run — no C++ impl | 8× slower | **210× slower** | **1.5K× slower** | **1.7K× slower** | **1.8K× slower** | **🏆 winner** |
| **spore-container** | Rust AVX2 | **🏆 winner** | **🏆 winner** | not run — no C++ impl | 3× slower | 2× slower | not run | not run | not run | no WASM — strings/records |
| **framework-pipeline** | Python | not run — no native impl | not run — no native impl | not run — no C++ impl | not run | **🏆 winner** | not run | not run | not run | no WASM — strings/records |

> Bold = significantly behind (>10×). A non-numeric cell states why that runtime has no figure (e.g. "not run — no native impl", "errored", "no WASM build") — never a silent blank.
> Fibonacci passive is excluded from 'winner' comparison — LRU cache hit is not a fair race.
> gpu-compute GPU: GPU slower than CPU at 100K elements (setup overhead dominates — crossover ~500K elements).

## 7. Per-Benchmark Scoreboard — Winner → Slowest (full spread)

> Every runtime that ran, ranked fastest→slowest, with distance from the winner AND from the slowest.
> ⚠️ **`Galerina passive ⟨interp⟩` figures are LRU cache-HIT rates** (a memoised result for a repeated
> input), **not compute** — flagged `⚠️cache` below. Read the first non-cache row for the real compute winner.

### compute-mix
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | Node.js | 142.18M/s | 🏆 winner | 173× faster |
| 🥈 | C++ | 139.54M/s | 1.0× slower | 169× faster |
| 🥉 | Rust (generic) | 139.35M/s | 1.0× slower | 169× faster |
| 4 | Rust AVX2 | 135.85M/s | 1.0× slower | 165× faster |
| 5 | WASM ▶ production | 80.89M/s | 1.8× slower | 98× faster |
| 6 | Galerina passive ⟨interp⟩ ⚠️cache | 2.35M/s | 61× slower | 2.9× faster |
| 7 | Galerina manifest ⟨interp⟩ | 1.92M/s | 74× slower | 2.3× faster |
| 8 | Galerina governed ⟨interp⟩ | 1.80M/s | 79× slower | 2.2× faster |
| 9 | Python | 823.7K/s | 173× slower | — (slowest) |

### arithmetic-threshold
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | C++ | 1.92B/s | 🏆 winner | 51.6K× faster |
| 🥈 | Rust (generic) | 1.60B/s | 1.2× slower | 42.9K× faster |
| 🥉 | Rust AVX2 | 1.60B/s | 1.2× slower | 42.9K× faster |
| 4 | Node.js | 1.00B/s | 1.9× slower | 26.9K× faster |
| 5 | WASM ▶ production | 516.04M/s | 3.7× slower | 13.8K× faster |
| 6 | Galerina manifest ⟨interp⟩ | 5.62M/s | 342× slower | 151× faster |
| 7 | Galerina governed ⟨interp⟩ | 5.38M/s | 357× slower | 144× faster |
| 8 | Python | 4.07M/s | 472× slower | 109× faster |
| 9 | Galerina passive ⟨interp⟩ ⚠️cache | 37.3K/s | 51.6K× slower | — (slowest) |

### six-digit-guess
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | Rust (generic) | 79.71M/s | 🏆 winner | 6.6K× faster |
| 🥈 | Rust AVX2 | 75.82M/s | 1.1× slower | 6.3K× faster |
| 🥉 | C++ | 68.83M/s | 1.2× slower | 5.7K× faster |
| 4 | WASM ▶ production | 38.30M/s | 2.1× slower | 3.2K× faster |
| 5 | Node.js | 2.89M/s | 28× slower | 241× faster |
| 6 | Python | 89.2K/s | 894× slower | 7.4× faster |
| 7 | Galerina governed ⟨interp⟩ | 53.4K/s | 1.5K× slower | 4.4× faster |
| 8 | Galerina manifest ⟨interp⟩ | 48.8K/s | 1.6K× slower | 4.1× faster |
| 9 | Galerina passive ⟨interp⟩ ⚠️cache | 12.0K/s | 6.6K× slower | — (slowest) |

### record-allocation
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | Rust (generic) | 1.21B/s | 🏆 winner | 526× faster |
| 🥈 | Rust AVX2 | 920.01M/s | 1.3× slower | 399× faster |
| 🥉 | WASM ▶ production | 579.16M/s | 2.1× slower | 251× faster |
| 4 | Node.js | 58.51M/s | 21× slower | 25× faster |
| 5 | Galerina passive ⟨interp⟩ ⚠️cache | 8.32M/s | 146× slower | 3.6× faster |
| 6 | Python | 3.60M/s | 336× slower | 1.6× faster |
| 7 | Galerina manifest ⟨interp⟩ | 2.46M/s | 493× slower | 1.1× faster |
| 8 | Galerina governed ⟨interp⟩ | 2.30M/s | 526× slower | — (slowest) |

### fibonacci-recursive
> 🏆 cache-hit "winner" is Galerina passive (memoised); **real compute winner: WASM ▶ production at 18.1K/s**.
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | Galerina passive ⟨interp⟩ ⚠️cache | 65.1K/s | 🏆 winner | 11.6K× faster |
| 🥈 | WASM ▶ production | 18.1K/s | 3.6× slower | 3.2K× faster |
| 🥉 | Rust AVX2 | 520.8/s | 125× slower | 93× faster |
| 4 | Rust (generic) | 515.8/s | 126× slower | 92× faster |
| 5 | Node.js | 133.9/s | 486× slower | 24× faster |
| 6 | Galerina manifest ⟨interp⟩ | 18.0/s | 3.6K× slower | 3.2× faster |
| 7 | Galerina governed ⟨interp⟩ | 15.0/s | 4.3K× slower | 2.7× faster |
| 8 | Python | 5.6/s | 11.6K× slower | — (slowest) |

### tower-of-hanoi
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | Rust (generic) | 263.94M/s | 🏆 winner | 2.5K× faster |
| 🥈 | Rust AVX2 | 259.97M/s | 1.0× slower | 2.5K× faster |
| 🥉 | Node.js | 132.94M/s | 2.0× slower | 1.3K× faster |
| 4 | WASM ▶ production | 128.19M/s | 2.1× slower | 1.2K× faster |
| 5 | Python | 2.87M/s | 92× slower | 27× faster |
| 6 | Galerina passive ⟨interp⟩ ⚠️cache | 112.1K/s | 2.4K× slower | 1.1× faster |
| 7 | Galerina manifest ⟨interp⟩ | 109.7K/s | 2.4K× slower | 1.0× faster |
| 8 | Galerina governed ⟨interp⟩ | 105.2K/s | 2.5K× slower | — (slowest) |

### collection-pipeline
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | Rust AVX2 | 13.45B/s | 🏆 winner | 6.0K× faster |
| 🥈 | Rust (generic) | 4.42B/s | 3.0× slower | 2.0K× faster |
| 🥉 | WASM ▶ production | 442.43M/s | 30× slower | 196× faster |
| 4 | Node.js | 76.60M/s | 176× slower | 34× faster |
| 5 | Python | 10.49M/s | 1.3K× slower | 4.7× faster |
| 6 | Galerina passive ⟨interp⟩ ⚠️cache | 8.30M/s | 1.6K× slower | 3.7× faster |
| 7 | Galerina manifest ⟨interp⟩ | 2.31M/s | 5.8K× slower | 1.0× faster |
| 8 | Galerina governed ⟨interp⟩ | 2.25M/s | 6.0K× slower | — (slowest) |

### hardware-targets
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | WASM ▶ production | 40.37M/s | 🏆 winner | 9.7K× faster |
| 🥈 | Rust (generic) | 1.24M/s | 33× slower | 297× faster |
| 🥉 | Rust AVX2 | 1.23M/s | 33× slower | 296× faster |
| 4 | Node.js | 953.1K/s | 42× slower | 229× faster |
| 5 | Galerina passive ⟨interp⟩ ⚠️cache | 73.5K/s | 549× slower | 18× faster |
| 6 | Galerina manifest ⟨interp⟩ | 4.2K/s | 9.7K× slower | 1.0× faster |
| 7 | Galerina governed ⟨interp⟩ | 4.2K/s | 9.7K× slower | — (slowest) |

### low-memory
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | Rust AVX2 | 6.37B/s | 🏆 winner | 50.3K× faster |
| 🥈 | Rust (generic) | 1.41B/s | 4.5× slower | 11.2K× faster |
| 🥉 | Node.js | 718.39M/s | 8.9× slower | 5.7K× faster |
| 4 | WASM ▶ production | 494.49M/s | 13× slower | 3.9K× faster |
| 5 | Python | 2.77M/s | 2.3K× slower | 22× faster |
| 6 | Galerina passive ⟨interp⟩ ⚠️cache | 175.5K/s | 36.3K× slower | 1.4× faster |
| 7 | Galerina governed ⟨interp⟩ | 149.3K/s | 42.7K× slower | 1.2× faster |
| 8 | Galerina manifest ⟨interp⟩ | 126.5K/s | 50.3K× slower | — (slowest) |

### gpu-compute
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | Rust AVX2 | 1.25B/s | 🏆 winner | 3.7K× faster |
| 🥈 | Rust (generic) | 1.24B/s | 1.0× slower | 3.6K× faster |
| 🥉 | Node.js | 1.04B/s | 1.2× slower | 3.0K× faster |
| 4 | WASM ▶ production | 497.17M/s | 2.5× slower | 1.5K× faster |
| 5 | Python | 6.17M/s | 202× slower | 18× faster |
| 6 | Galerina passive ⟨interp⟩ ⚠️cache | 403.0K/s | 3.1K× slower | 1.2× faster |
| 7 | Galerina manifest ⟨interp⟩ | 350.4K/s | 3.6K× slower | 1.0× faster |
| 8 | Galerina governed ⟨interp⟩ | 340.9K/s | 3.7K× slower | — (slowest) |

### matrix-multiply
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | Rust (generic) | 1.55B/s | 🏆 winner | 2.4K× faster |
| 🥈 | Rust AVX2 | 1.45B/s | 1.1× slower | 2.2K× faster |
| 🥉 | Node.js | 645.77M/s | 2.4× slower | 988× faster |
| 4 | WASM ▶ production | 463.74M/s | 3.3× slower | 710× faster |
| 5 | Python | 6.47M/s | 239× slower | 9.9× faster |
| 6 | Galerina passive ⟨interp⟩ ⚠️cache | 867.7K/s | 1.8K× slower | 1.3× faster |
| 7 | Galerina governed ⟨interp⟩ | 762.9K/s | 2.0K× slower | 1.2× faster |
| 8 | Galerina manifest ⟨interp⟩ | 653.5K/s | 2.4K× slower | — (slowest) |

### crypto-ops
> 🏆 cache-hit "winner" is Galerina passive (memoised); **real compute winner: Galerina manifest ⟨interp⟩ at 1.7K/s**.
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | Galerina passive ⟨interp⟩ ⚠️cache | 5.3K/s | 🏆 winner | 37× faster |
| 🥈 | Galerina manifest ⟨interp⟩ | 1.7K/s | 3.1× slower | 12× faster |
| 🥉 | Galerina governed ⟨interp⟩ | 142.0/s | 37× slower | — (slowest) |

### text-html
> 🏆 cache-hit "winner" is Galerina passive (memoised); **real compute winner: Galerina manifest ⟨interp⟩ at 2.2K/s**.
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | Galerina passive ⟨interp⟩ ⚠️cache | 47.2K/s | 🏆 winner | 59× faster |
| 🥈 | Galerina manifest ⟨interp⟩ | 2.2K/s | 21× slower | 2.8× faster |
| 🥉 | Galerina governed ⟨interp⟩ | 800.0/s | 59× slower | — (slowest) |

### tri-logic
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | Rust (generic) | 1.45B/s | 🏆 winner | 4.4K× faster |
| 🥈 | Rust AVX2 | 1.45B/s | 1.0× slower | 4.4K× faster |
| 🥉 | Node.js | 1.04B/s | 1.4× slower | 3.2K× faster |
| 4 | WASM ▶ production | 492.35M/s | 2.9× slower | 1.5K× faster |
| 5 | Python | 8.16M/s | 178× slower | 25× faster |
| 6 | Galerina manifest ⟨interp⟩ | 372.2K/s | 3.9K× slower | 1.1× faster |
| 7 | Galerina passive ⟨interp⟩ ⚠️cache | 357.0K/s | 4.1K× slower | 1.1× faster |
| 8 | Galerina governed ⟨interp⟩ | 327.2K/s | 4.4K× slower | — (slowest) |

### data-query
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | Node.js | 403.05M/s | 🏆 winner | 2.0K× faster |
| 🥈 | Python | 3.18M/s | 127× slower | 15× faster |
| 🥉 | Galerina passive ⟨interp⟩ ⚠️cache | 272.0K/s | 1.5K× slower | 1.3× faster |
| 4 | Galerina manifest ⟨interp⟩ | 218.2K/s | 1.8K× slower | 1.1× faster |
| 5 | Galerina governed ⟨interp⟩ | 206.5K/s | 2.0K× slower | — (slowest) |

### call-chain
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | Node.js | 299.01M/s | 🏆 winner | 5.3K× faster |
| 🥈 | WASM ▶ production | 57.62M/s | 5.2× slower | 1.0K× faster |
| 🥉 | Python | 1.48M/s | 202× slower | 26× faster |
| 4 | Galerina passive ⟨interp⟩ ⚠️cache | 61.5K/s | 4.9K× slower | 1.1× faster |
| 5 | Galerina governed ⟨interp⟩ | 57.8K/s | 5.2K× slower | 1.0× faster |
| 6 | Galerina manifest ⟨interp⟩ | 56.2K/s | 5.3K× slower | — (slowest) |

### nbody
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | Node.js | 124.64M/s | 🏆 winner | 2.0K× faster |
| 🥈 | WASM ▶ production | 30.56M/s | 4.1× slower | 479× faster |
| 🥉 | Python | 1.02M/s | 122× slower | 16× faster |
| 4 | Galerina passive ⟨interp⟩ ⚠️cache | 66.2K/s | 1.9K× slower | 1.0× faster |
| 5 | Galerina manifest ⟨interp⟩ | 64.4K/s | 1.9K× slower | 1.0× faster |
| 6 | Galerina governed ⟨interp⟩ | 63.8K/s | 2.0K× slower | — (slowest) |

### json-parse
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | Node.js | 3.29M/s | 🏆 winner | 647× faster |
| 🥈 | Python | 506.5K/s | 6.5× slower | 100× faster |
| 🥉 | Galerina passive ⟨interp⟩ ⚠️cache | 10.1K/s | 325× slower | 2.0× faster |
| 4 | Galerina governed ⟨interp⟩ | 5.6K/s | 584× slower | 1.1× faster |
| 5 | Galerina manifest ⟨interp⟩ | 5.1K/s | 647× slower | — (slowest) |

### mandelbrot
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | Rust AVX2 | 24.09M/s | 🏆 winner | 3.0K× faster |
| 🥈 | Rust (generic) | 24.06M/s | 1.0× slower | 3.0K× faster |
| 🥉 | WASM ▶ production | 9.41M/s | 2.6× slower | 1.2K× faster |
| 4 | Node.js | 7.08M/s | 3.4× slower | 881× faster |
| 5 | Python | 205.0K/s | 118× slower | 26× faster |
| 6 | Galerina passive ⟨interp⟩ ⚠️cache | 8.7K/s | 2.8K× slower | 1.1× faster |
| 7 | Galerina manifest ⟨interp⟩ | 8.1K/s | 3.0K× slower | 1.0× faster |
| 8 | Galerina governed ⟨interp⟩ | 8.0K/s | 3.0K× slower | — (slowest) |

### spectral-norm
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | Rust (generic) | 390.93M/s | 🏆 winner | 216× faster |
| 🥈 | Rust AVX2 | 354.17M/s | 1.1× slower | 195× faster |
| 🥉 | Node.js | 244.69M/s | 1.6× slower | 135× faster |
| 4 | Python | 1.81M/s | 216× slower | — (slowest) |

### binary-trees
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | WASM ▶ production | 612.70M/s | 🏆 winner | 1.8K× faster |
| 🥈 | Node.js | 81.66M/s | 7.5× slower | 235× faster |
| 🥉 | Rust (generic) | 20.90M/s | 29× slower | 60× faster |
| 4 | Rust AVX2 | 19.69M/s | 31× slower | 57× faster |
| 5 | Python | 2.91M/s | 210× slower | 8.4× faster |
| 6 | Galerina passive ⟨interp⟩ ⚠️cache | 419.8K/s | 1.5K× slower | 1.2× faster |
| 7 | Galerina manifest ⟨interp⟩ | 369.7K/s | 1.7K× slower | 1.1× faster |
| 8 | Galerina governed ⟨interp⟩ | 348.2K/s | 1.8K× slower | — (slowest) |

### spore-container
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | Rust AVX2 | 138.0K/s | 🏆 winner | 3.0× faster |
| 🥈 | Rust (generic) | 133.3K/s | 1.0× slower | 2.9× faster |
| 🥉 | Python | 85.7K/s | 1.6× slower | 1.9× faster |
| 4 | Node.js | 46.3K/s | 3.0× slower | — (slowest) |

### framework-pipeline
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | Python | 113.3K/s | 🏆 winner | — (slowest) |


---

## Benchmark Glossary — what each benchmark measures

| Benchmark | What it measures | Why it matters |
|---|---|---|
| **arithmetic-threshold** | Integer arithmetic loop: count operations above a threshold at 4B/s | Raw CPU / WASM JIT ceiling — the fastest possible pure number-crunching |
| **call-chain** | Flow-to-flow call chain (A→B→C→D): function-call overhead | Real programs call multiple governed flows; this isolates dispatch cost |
| **collection-pipeline** | Functional pipeline: filter → map → reduce over 10K integer records | Data transformation throughput — the bread-and-butter of governed APIs |
| **compute-mix** | Mixed workload: string ops, conditionals, arithmetic, object creation | Closest to real-world application code; no single hot path |
| **crypto-ops** | SHA-256 hashing, HMAC, Ed25519 sign+verify (via stdlib) | Performance of governed cryptographic operations (used in every secure flow) |
| **data-query** | `scanRecords(10K)`: one pass — filter (WHERE amount>threshold) + GROUP BY category — the same bulk-N scan on every runtime | Governed data-query throughput in record-scans/sec (aligned 2026-07-11); the `Tainted<String>` query path is a compile-time cost layered on top |
| **fibonacci-recursive** | Recursive fib(20): tail-call and LRU cache warm path | Tests recursion overhead + caching benefit across governed/passive/WASM tiers |
| **governance-cost** | Sum 1..100 (triangle number) with full governance verification overhead | Directly measures the cost of Galerina's contract{} checking vs raw arithmetic |
| **gpu-compute** | Parallel map-reduce kernel (100K elements) via Deno WebGPU | GPU dispatch throughput on RTX 2060 — the WASM/GPU crossover point |
| **hardware-targets** | Dispatch to 5 hardware targets: CPU/GPU/NPU/WASM/fallback | Route decision overhead when contract.targets{} selects execution path |
| **http-throughput** | Sequential HTTP requests/sec to a governed localhost endpoint | Server throughput — how fast Galerina can handle real HTTP requests |
| **json-parse** | Parse 500 JSON records: split on comma, split on colon, accumulate | Real I/O parsing workload — string-heavy, cache-friendly on repeat calls |
| **spore-container** | Create the canonical .spore trust-container (TMX-256 SHAKE Merkle + LE packing). **The "Node.js" column IS Galerina's `@galerina/ext-spore` engine** (pure TS/Node); Python/Rust are byte-identical reference writers — all assert the same golden root | Can other languages create a .spore, and how fast? Honest SHAKE256+packing race (the engine is pure Node, so it has no separate interpreter column) |
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

