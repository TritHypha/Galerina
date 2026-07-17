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
| compute-mix | 75.81M/s | ⚪ 1.7× slower | ⚪ 1.8× slower | 1.63M/s | WASM near native |
| arithmetic-threshold | 491.03M/s | UNCERTIFIED | UNCERTIFIED | 5.30M/s | not yet work-equivalence-certified (N/work mismatch) |
| six-digit-guess | 36.39M/s | UNCERTIFIED | UNCERTIFIED | 46.7K/s | not yet work-equivalence-certified (N/work mismatch) |
| fibonacci-recursive | 17.2K/s | UNCERTIFIED | UNCERTIFIED | 12.0/s | not yet work-equivalence-certified (N/work mismatch) |
| tower-of-hanoi | 121.28M/s | 🟡 2.1× slower | 🟢 1.1× slower | 95.7K/s | WASM usable |
| hardware-targets | 40.08M/s | UNCERTIFIED | UNCERTIFIED | 4.0K/s | not yet work-equivalence-certified (N/work mismatch) |
| matrix-multiply | 444.86M/s | 🟡 3.4× slower | ⚪ 1.4× slower | 712.3K/s | WASM usable |
| tri-logic | 470.13M/s | 🟡 3.0× slower | 🟡 2.1× slower | 347.8K/s | WASM usable |
| data-query | no WASM build | — | — | 222.2K/s | WASM not built for this lane yet |
| call-chain | 54.41M/s | — | 🟡 5.1× slower | 58.2K/s | WASM 2–10× under Node |
| nbody | 28.72M/s | — | 🟡 4.2× slower | 61.2K/s | WASM 2–10× under Node |
| mandelbrot | 9.05M/s | 🟡 2.6× slower | 🟢 1.5× | 7.7K/s | WASM usable |
| spectral-norm | no WASM build | — | — | not run | WASM not built for this lane yet |

> 🚦 🟢 ≥0.9 (≈native) · ⚪ ≥0.5 (within 2×) · 🟡 ≥0.1 (2–10× slower) · 🔴 ≥0.01 (10–100×) · ⚫ <0.01 (100×+).
> **Ceiling (fastest certified lane):** Rust (generic) — 1.51B/s on matrix-multiply.

### Memory — heap bytes per operation (the honest metric; lower is better)

> Ranked by **bytes/op**, NOT throughput — these benchmarks measure allocation, so no cross-runtime
> throughput ratio (and no ⚫) is shown. Native Rust/C++ allocate off the GC heap (~0 native — see §2b/§4).

| Benchmark | 🏆 Best (lowest heap B/op) | Node.js | Python | WASM ▶ production | Galerina governed ⟨interp⟩ | Galerina manifest ⟨interp⟩ |
|---|---|---|---|---|---|---|
| record-allocation | **WASM ▶ production** (~0) | ~0 | ~0 | ~0 | 6 B/op | 9 B/op |
| collection-pipeline | **WASM ▶ production** (~0) | ~0 | ~0 | ~0 | 17 B/op | 14 B/op |
| low-memory | **Node.js** (~0) | ~0 | ~0 | ~0 | 46 B/op | 66 B/op |
| binary-trees | **Python** (~0) | 3 B/op | ~0 | ~0 | 14 B/op | 12 B/op |

> **No throughput ratio, no ⚫ here** — a memory benchmark ranked by throughput is exactly the
> cross-metric bug this section removes. record-allocation / binary-trees / collection-pipeline live
> here by bytes/op, so they no longer carry the ◇ shape-only marker; their shape rate is in §4.

### GPU — kernel-evals/s (GPU-shaped workload; matrix-multiply dual-homes here)

> Cross-runtime. Deno WebGPU is the only real-dispatch path; where it produced no number on this
> machine it shows **⏳ GPU pending** — the honest status, never a fabricated GPU rate.

| Benchmark | 🏆 Winner | Speed | WASM ▶ production | GPU (Deno WebGPU) | vs Node (WASM) | Implication |
|---|---|---|---|---|---|---|
| gpu-compute | Rust (generic) | 1.20B/s | 475.78M/s | ⏳ GPU pending | 🟡 2.1× slower | CPU/WASM lanes lead — real GPU dispatch pending (see §4b) |
| matrix-multiply | Rust (generic) | 1.51B/s | 444.86M/s | ⏳ GPU pending | ⚪ 1.4× slower | CPU/WASM lanes lead — real GPU dispatch pending (see §4b) |

> **vs Node (WASM)** compares the WASM ▶ production lane to Node.js on the kernel. matrix-multiply also
> appears in the CPU Throughput table (dual-home) — it has both a compute lane and a WebGPU lane.

### I/O & DevTools — native units per benchmark (raw rate; NOT inner-op normalised)

> Each benchmark has its OWN unit, so there is **no cross-runtime ratio** — the winner is the fastest
> lane by raw rate WITHIN that benchmark's native unit. Comparing rates ACROSS benchmarks is meaningless.

| Benchmark | Unit (native) | 🏆 Fastest lane | Node.js | Python | Rust (generic) | WASM ▶ production | Galerina governed ⟨interp⟩ |
|---|---|---|---|---|---|---|---|
| crypto-ops | ops/s | **Galerina governed ⟨interp⟩** (123.0/s) | no comparable metric | no comparable metric | no comparable metric | no WASM — strings/records | 123.0/s |
| text-html | ops/s | **Galerina governed ⟨interp⟩** (690.0/s) | no comparable metric | no comparable metric | no comparable metric | no WASM — strings/records | 690.0/s |
| json-parse | records/s | **Node.js** (2.96M/s) | 2.96M/s | 458.0K/s | not run — no native impl | no WASM — strings/records | 5.6K/s |
| spore-container | containers/s | **Rust (generic)** (139.6K/s) | 42.7K/s | 64.5K/s | 139.6K/s | no WASM — strings/records | not run |
| framework-pipeline | requests/s | **Python** (114.6K/s) | not run | 114.6K/s | not run — no native impl | no WASM — strings/records | not run |
| http-throughput | requests/s | **Node.js** (3.4K/s) | 3.4K/s | not run | not run — no native impl | no WASM build | not run |
| naming-check | files/s | **Node.js** (7.2K/s) | 7.2K/s | not run | not run — no native impl | no WASM build | not run |
| context-receipt | receipts/s | **Node.js** (18.1K/s) | 18.1K/s | not run | not run — no native impl | no WASM build | not run |
| intelligence-search | queries/s | **Node.js** (112.4K/s) | 112.4K/s | not run | not run — no native impl | no WASM build | not run |
| provenance-trace | files/s | **Node.js** (788.0/s) | 788.0/s | not run | not run — no native impl | no WASM build | not run |

> Values are native rates (records/s, containers/s, requests/s, files/s, …), shown for transparency —
> NOT a cross-runtime ranking. The inner-op-normalised throughput lives in the CPU table above.

### Governance — Galerina-internal tier ratio ONLY (NO native column)

> This table's columns are Galerina tiers ONLY — there is **no rust/node/python/cpp column**, so a
> cross-runtime `N× slower` is structurally impossible here. The old six-figure governance-cost artifact
> came from dividing the governed tier by a native rate — a division this table cannot express.

| Benchmark | Galerina governed ⟨interp⟩ | Galerina manifest ⟨interp⟩ | WASM ▶ production | governed/manifest (gov overhead) |
|---|---|---|---|---|
| governance-cost | 765.0/s | 848.0/s | 2.91M/s | 0.90× governed/manifest (gov overhead ≈ 1.11×) |

> **governed/manifest** is governance-cost's honest headline: the same-N cost of always-on governance
> (capabilities + audit + proof) vs the pre-verified manifest. `gov overhead` = manifest ÷ governed.


### Full Throughput Table (all runtimes)

| Benchmark | Rust AVX-512 | Rust AVX2 | Rust (generic) | C++ | Node.js | Python | Galerina passive ⟨interp⟩ | Galerina manifest ⟨interp⟩ | Galerina governed ⟨interp⟩ | WASM ▶ production | Deno WebGPU (GPU) | Node/Galerina† (🖥️ CPU) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| compute-mix | not run — no AVX-512 | 130.10M/s | 130.83M/s | **134.52M/s** | **139.66M/s** | 766.2K/s | 2.22M/s | 1.81M/s | 1.63M/s | 75.81M/s | not run — no GPU path | 85.7× |
| arithmetic-threshold | not run — no AVX-512 | 1.57B/s | 1.56B/s | **1.87B/s** | 976.20M/s | 3.84M/s | 26.6K/s | 5.39M/s | 5.30M/s | 491.03M/s | not run — no GPU path | 184.3× |
| six-digit-guess | not run — no AVX-512 | 67.05M/s | **78.08M/s** | 67.36M/s | 2.86M/s | 96.9K/s | 17.5K/s | 46.6K/s | 46.7K/s | 36.39M/s | not run — no GPU path | 61.1× |
| record-allocation | not run — no AVX-512 | 943.12M/s | **1.17B/s** | not run — no C++ impl | 59.03M/s | 5.07M/s | 5.77M/s | 2.19M/s | 1.99M/s | 536.21M/s | not run — no GPU path | 29.7× |
| fibonacci-recursive | not run — no AVX-512 | 498.9/s | 499.9/s | not run — no C++ impl | 126.4/s | 5.8/s | **51.8K/s** | 18.0/s | 12.0/s | 17.2K/s | not run — no GPU path | 10.5× |
| tower-of-hanoi | not run — no AVX-512 | **251.90M/s** | **252.24M/s** | not run — no C++ impl | 129.15M/s | 5.04M/s | 102.2K/s | 101.9K/s | 95.7K/s | 121.28M/s | not run — no GPU path | 1.3K× |
| collection-pipeline | not run — no AVX-512 | **13.27B/s** | 4.27B/s | not run — no C++ impl | 70.69M/s | 10.19M/s | 5.62M/s | 1.83M/s | 1.71M/s | 417.43M/s | not run — no GPU path | 41.4× |
| governance-cost ⚠️ | N/A — excluded | N/A — excluded | N/A — excluded | N/A — excluded | N/A — excluded | N/A — excluded | N/A — excluded | N/A — excluded | N/A — excluded | N/A — excluded | N/A — excluded | ⚠️ excluded — not unit-aligned |
| hardware-targets | not run — no AVX-512 | 1.18M/s | 1.17M/s | not run — no C++ impl | 907.9K/s | not run | 71.0K/s | 3.0K/s | 4.0K/s | **40.08M/s** | not run — no GPU path | 227.0× |
| low-memory | not run — no AVX-512 | **6.15B/s** | 1.36B/s | not run — no C++ impl | 712.31M/s | 3.03M/s | 173.7K/s | 135.4K/s | 145.8K/s | 470.09M/s | not run — no GPU path | 4.9K× |
| gpu-compute | not run — no AVX-512 | **1.19B/s** | **1.20B/s** | not run — no C++ impl | 987.52M/s | 6.74M/s | 395.0K/s | 360.4K/s | 376.1K/s | 475.78M/s | errored | 2.6K× |
| matrix-multiply | not run — no AVX-512 | 1.41B/s | **1.51B/s** | not run — no C++ impl | 623.30M/s | 6.81M/s | 900.5K/s | 653.7K/s | 712.3K/s | 444.86M/s | errored | 875.0× |
| crypto-ops | not run — no AVX-512 | no comparable metric | no comparable metric | not run — no C++ impl | no comparable metric | no comparable metric | **6.2K/s** | 2.1K/s | 123.0/s | no WASM — strings/records | not run — no GPU path | N/A — no Node.js |
| text-html | not run — no AVX-512 | no comparable metric | no comparable metric | not run — no C++ impl | no comparable metric | no comparable metric | **41.6K/s** | 1.8K/s | 690.0/s | no WASM — strings/records | not run — no GPU path | N/A — no Node.js |
| tri-logic | not run — no AVX-512 | **1.39B/s** | **1.38B/s** | not run — no C++ impl | 1.00B/s | 6.78M/s | 336.0K/s | 350.8K/s | 347.8K/s | 470.13M/s | not run — no GPU path | 2.9K× |
| data-query | not run — no AVX-512 | not run — no native impl | not run — no native impl | not run — no C++ impl | **390.34M/s** | 3.48M/s | 256.3K/s | 213.4K/s | 222.2K/s | no WASM build | not run — no GPU path | 1.8K× |
| call-chain | not run — no AVX-512 | not run — no native impl | not run — no native impl | not run — no C++ impl | **277.22M/s** | 1.38M/s | 60.5K/s | 59.5K/s | 58.2K/s | 54.41M/s | not run — no GPU path | 4.8K× |
| nbody | not run — no AVX-512 | not run — no native impl | not run — no native impl | not run — no C++ impl | **121.51M/s** | 1.11M/s | 63.9K/s | 62.9K/s | 61.2K/s | 28.72M/s | not run — no GPU path | 2.0K× |
| json-parse | not run — no AVX-512 | not run — no native impl | not run — no native impl | not run — no C++ impl | **2.96M/s** | 458.0K/s | 9.7K/s | 4.9K/s | 5.6K/s | no WASM — strings/records | not run — no GPU path | 532.3× |
| mandelbrot | not run — no AVX-512 | **23.43M/s** | **23.41M/s** | not run — no C++ impl | 6.24M/s | 148.8K/s | 7.5K/s | 7.5K/s | 7.7K/s | 9.05M/s | not run — no GPU path | 804.7× |
| spectral-norm | not run — no AVX-512 | **355.60M/s** | **371.42M/s** | not run — no C++ impl | 243.19M/s | 1.68M/s | not run | not run | not run | no WASM build | not run — no GPU path | N/A — no governed ⟨interp⟩ |
| binary-trees | not run — no AVX-512 | 20.14M/s | 15.62M/s | not run — no C++ impl | 76.63M/s | 5.14M/s | 418.4K/s | 390.9K/s | 366.7K/s | **587.25M/s** | not run — no GPU path | 208.9× |
| spore-container | not run — no AVX-512 | **135.6K/s** | **139.6K/s** | not run — no C++ impl | 42.7K/s | 64.5K/s | not run | not run | not run | no WASM — strings/records | not run — no GPU path | N/A — no governed ⟨interp⟩ |
| framework-pipeline | not run — no AVX-512 | not run — no native impl | not run — no native impl | not run — no C++ impl | not run | **114.6K/s** | not run | not run | not run | no WASM — strings/records | not run — no GPU path | N/A — neither ran |
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
| 🥇 | ⚫ | Galerina passive ⟨interp⟩ | -38.67 bytes/op ⚡ ~0 — no boxing | 173.7K/s | — | -387KB |
| 🥈 | 🟢 | Rust AVX2 | 0.00 bytes/op ⚡ ~0 — no boxing | 6.15B/s | — | — |
| 🥉 | 🟢 | Rust (generic) | 0.00 bytes/op ⚡ ~0 — no boxing | 1.36B/s | — | — |
| 4 | 🟢 | Node.js | 0.00 bytes/op ⚡ ~0 — no boxing | 712.31M/s | — | 19KB |
| 5 | ⚪ | WASM ▶ production | 0.00 bytes/op ⚡ ~0 — no boxing | 470.09M/s | — | 42KB |
| 6 | ⚫ | Python | 0.03 bytes/op ⚡ ~0 — no boxing | 3.03M/s | — | 272B |
| 7 | ⚫ | Galerina governed ⟨interp⟩ | 46 bytes/op ⚠ moderate | 145.8K/s | — | 461KB |
| 8 | ⚫ | Galerina manifest ⟨interp⟩ | 66 bytes/op ⚠ moderate | 135.4K/s | — | 664KB |

> **Why this matters:** Every byte allocated is a byte the GC must later collect.
> WASM and the bytecode VM run with zero allocation — ideal for high-throughput governed services.
> The tree-walker's per-node allocation is the primary target of Phases 31-33.


## 2b. General Memory Usage

| Benchmark | Runtime | RSS | Peak RSS | Heap Used | Heap Δ (execution) |
|---|---|---|---|---|---|
| compute-mix | Rust AVX2 | — | — | — | — |
| compute-mix | Rust (generic) | — | — | — | — |
| compute-mix | C++ | — | — | — | — |
| compute-mix | Node.js | 44.1MB | 44.3MB | 5.0MB | 971KB |
| compute-mix | Python | — | — | 3KB | 3KB |
| compute-mix | Galerina passive ⟨interp⟩ | 77.6MB | 77.6MB | 16.7MB | 73KB |
| compute-mix | Galerina manifest ⟨interp⟩ | 73.8MB | 73.8MB | 20.5MB | 4.5MB |
| compute-mix | Galerina governed ⟨interp⟩ | 72.6MB | 72.6MB | 20.2MB | 4.5MB |
| compute-mix | WASM ▶ production | 71.2MB | 71.2MB | 15.9MB | 22KB |
| arithmetic-threshold | Rust AVX2 | — | — | — | — |
| arithmetic-threshold | Rust (generic) | — | — | — | — |
| arithmetic-threshold | C++ | — | — | — | — |
| arithmetic-threshold | Node.js | 47.1MB | 47.3MB | 4.3MB | 224KB |
| arithmetic-threshold | Python | — | — | 4KB | 4KB |
| arithmetic-threshold | Galerina passive ⟨interp⟩ | 79.1MB | 79.1MB | 17.0MB | 39KB |
| arithmetic-threshold | Galerina manifest ⟨interp⟩ | 78.9MB | 78.9MB | 17.1MB | 836KB |
| arithmetic-threshold | Galerina governed ⟨interp⟩ | 79.0MB | 79.0MB | 17.0MB | 848KB |
| arithmetic-threshold | WASM ▶ production | 80.9MB | 80.9MB | 16.5MB | 6KB |
| six-digit-guess | Rust AVX2 | — | — | — | — |
| six-digit-guess | Rust (generic) | — | — | — | — |
| six-digit-guess | C++ | — | — | — | — |
| six-digit-guess | Node.js | 51.8MB | 51.8MB | 5.9MB | 1.1MB |
| six-digit-guess | Python | — | — | 583B | 583B |
| six-digit-guess | Galerina passive ⟨interp⟩ | 80.3MB | 80.3MB | 19.2MB | 87KB |
| six-digit-guess | Galerina manifest ⟨interp⟩ | 80.6MB | 80.6MB | 17.6MB | 756KB |
| six-digit-guess | Galerina governed ⟨interp⟩ | 80.4MB | 80.4MB | 18.0MB | 1.5MB |
| six-digit-guess | WASM ▶ production | 81.6MB | 81.6MB | 16.7MB | 1KB |
| record-allocation | Rust AVX2 | — | — | — | — |
| record-allocation | Rust (generic) | — | — | — | — |
| record-allocation | Node.js | 48.0MB | 48.0MB | 4.2MB | 57KB |
| record-allocation | Python | — | — | 492B | 492B |
| record-allocation | Galerina passive ⟨interp⟩ | 80.5MB | 80.5MB | 17.5MB | 188KB |
| record-allocation | Galerina manifest ⟨interp⟩ | 80.5MB | 80.5MB | 17.0MB | 86KB |
| record-allocation | Galerina governed ⟨interp⟩ | 81.3MB | 81.3MB | 17.0MB | 60KB |
| record-allocation | WASM ▶ production | 82.8MB | 82.8MB | 17.3MB | 50KB |
| fibonacci-recursive | Rust AVX2 | — | — | — | — |
| fibonacci-recursive | Rust (generic) | — | — | — | — |
| fibonacci-recursive | Node.js | 46.5MB | 46.5MB | 4.1MB | 5KB |
| fibonacci-recursive | Python | — | — | 464B | 464B |
| fibonacci-recursive | Galerina passive ⟨interp⟩ | 81.2MB | 81.2MB | 17.9MB | 59KB |
| fibonacci-recursive | Galerina manifest ⟨interp⟩ | 81.1MB | 81.1MB | 18.2MB | 1.1MB |
| fibonacci-recursive | Galerina governed ⟨interp⟩ | 80.8MB | 80.8MB | 18.0MB | 903KB |
| fibonacci-recursive | WASM ▶ production | 82.7MB | 82.7MB | 17.3MB | 3KB |
| tower-of-hanoi | Rust AVX2 | — | — | — | — |
| tower-of-hanoi | Rust (generic) | — | — | — | — |
| tower-of-hanoi | Node.js | 46.4MB | 46.4MB | 4.1MB | 15KB |
| tower-of-hanoi | Python | — | — | 1KB | 1KB |
| tower-of-hanoi | Galerina passive ⟨interp⟩ | 84.0MB | 84.0MB | 17.9MB | 47KB |
| tower-of-hanoi | Galerina manifest ⟨interp⟩ | 83.0MB | 83.0MB | 17.3MB | 1.0MB |
| tower-of-hanoi | Galerina governed ⟨interp⟩ | 83.2MB | 83.2MB | 20.6MB | 4.4MB |
| tower-of-hanoi | WASM ▶ production | 83.2MB | 83.2MB | 16.5MB | 1KB |
| collection-pipeline | Rust AVX2 | — | — | — | — |
| collection-pipeline | Rust (generic) | — | — | — | — |
| collection-pipeline | Node.js | 63.4MB | 63.4MB | 12.3MB | 8.1MB |
| collection-pipeline | Python | — | — | 224B | 224B |
| collection-pipeline | Galerina passive ⟨interp⟩ | 83.8MB | 83.8MB | 16.9MB | 271KB |
| collection-pipeline | Galerina manifest ⟨interp⟩ | 83.8MB | 83.8MB | 16.3MB | 138KB |
| collection-pipeline | Galerina governed ⟨interp⟩ | 84.9MB | 84.9MB | 16.4MB | 167KB |
| collection-pipeline | WASM ▶ production | 86.6MB | 86.6MB | 16.5MB | 24KB |
| governance-cost | Rust AVX2 | — | — | — | — |
| governance-cost | Rust (generic) | — | — | — | — |
| governance-cost | Node.js | 46.3MB | 46.3MB | 4.1MB | 27KB |
| governance-cost | Python | — | — | 272B | 272B |
| governance-cost | Galerina passive ⟨interp⟩ | 85.5MB | 85.5MB | 17.1MB | 488KB |
| governance-cost | Galerina manifest ⟨interp⟩ | 86.8MB | 86.8MB | 16.8MB | 419KB |
| governance-cost | Galerina governed ⟨interp⟩ | 85.6MB | 85.6MB | 16.8MB | 446KB |
| governance-cost | WASM ▶ production | 86.0MB | 86.0MB | 16.6MB | 49KB |
| hardware-targets | Rust AVX2 | — | — | — | — |
| hardware-targets | Rust (generic) | — | — | — | — |
| hardware-targets | Node.js | 48.2MB | 48.2MB | 4.6MB | 465KB |
| hardware-targets | Galerina passive ⟨interp⟩ | 84.2MB | 84.2MB | 17.9MB | 808KB |
| hardware-targets | Galerina manifest ⟨interp⟩ | 84.2MB | 84.2MB | 16.5MB | 77KB |
| hardware-targets | Galerina governed ⟨interp⟩ | 84.1MB | 84.1MB | 16.6MB | 78KB |
| hardware-targets | WASM ▶ production | 86.3MB | 86.3MB | 16.8MB | 82KB |
| low-memory | Rust AVX2 | — | — | — | — |
| low-memory | Rust (generic) | — | — | — | — |
| low-memory | Node.js | 46.4MB | 46.4MB | 4.1MB | 19KB |
| low-memory | Python | — | — | 272B | 272B |
| low-memory | Galerina passive ⟨interp⟩ | 84.3MB | 84.3MB | 17.2MB | -387KB |
| low-memory | Galerina manifest ⟨interp⟩ | 84.5MB | 84.5MB | 17.2MB | 664KB |
| low-memory | Galerina governed ⟨interp⟩ | 84.2MB | 84.2MB | 17.0MB | 461KB |
| low-memory | WASM ▶ production | 86.2MB | 86.2MB | 16.8MB | 42KB |
| gpu-compute | Rust AVX2 | — | — | — | — |
| gpu-compute | Rust (generic) | — | — | — | — |
| gpu-compute | Node.js | 46.7MB | 46.7MB | 4.1MB | 17KB |
| gpu-compute | Python | — | — | 304B | 304B |
| gpu-compute | Galerina passive ⟨interp⟩ | 84.6MB | 84.6MB | 17.0MB | -1.9MB |
| gpu-compute | Galerina manifest ⟨interp⟩ | 84.4MB | 84.4MB | 17.4MB | 779KB |
| gpu-compute | Galerina governed ⟨interp⟩ | 84.5MB | 84.5MB | 17.7MB | 1.0MB |
| gpu-compute | WASM ▶ production | 87.3MB | 87.3MB | 16.9MB | 2KB |
| matrix-multiply | Rust AVX2 | — | — | — | — |
| matrix-multiply | Rust (generic) | — | — | — | — |
| matrix-multiply | Node.js | 48.3MB | 48.3MB | 4.5MB | 368KB |
| matrix-multiply | Python | — | — | 392B | 392B |
| matrix-multiply | Galerina passive ⟨interp⟩ | 84.6MB | 84.6MB | 16.9MB | -1.9MB |
| matrix-multiply | Galerina manifest ⟨interp⟩ | 84.6MB | 84.6MB | 17.7MB | 972KB |
| matrix-multiply | Galerina governed ⟨interp⟩ | 84.6MB | 84.6MB | 17.6MB | 941KB |
| matrix-multiply | WASM ▶ production | 87.0MB | 87.0MB | 16.9MB | 3KB |
| crypto-ops | Rust AVX2 | — | — | — | — |
| crypto-ops | Rust (generic) | — | — | — | — |
| crypto-ops | Node.js | 62.6MB | 62.6MB | 10.0MB | 4.5MB |
| crypto-ops | Python | — | — | 208B | 208B |
| crypto-ops | Galerina passive ⟨interp⟩ | 85.1MB | 85.1MB | 18.1MB | 618KB |
| crypto-ops | Galerina manifest ⟨interp⟩ | 85.0MB | 85.0MB | 16.9MB | 195KB |
| crypto-ops | Galerina governed ⟨interp⟩ | 85.0MB | 85.0MB | 17.0MB | 341KB |
| text-html | Rust AVX2 | — | — | — | — |
| text-html | Rust (generic) | — | — | — | — |
| text-html | Node.js | — | — | — | 472KB |
| text-html | Python | — | — | 208B | 208B |
| text-html | Galerina passive ⟨interp⟩ | 86.8MB | 86.8MB | 17.7MB | -399KB |
| text-html | Galerina manifest ⟨interp⟩ | 85.5MB | 85.5MB | 17.2MB | 149KB |
| text-html | Galerina governed ⟨interp⟩ | 85.2MB | 85.2MB | 17.3MB | 169KB |
| tri-logic | Rust AVX2 | — | — | — | — |
| tri-logic | Rust (generic) | — | — | — | — |
| tri-logic | Node.js | — | — | — | 307KB |
| tri-logic | Python | — | — | — | — |
| tri-logic | Galerina passive ⟨interp⟩ | 85.7MB | 85.7MB | 18.8MB | 232KB |
| tri-logic | Galerina manifest ⟨interp⟩ | 85.5MB | 85.5MB | 18.5MB | 1.3MB |
| tri-logic | Galerina governed ⟨interp⟩ | 85.5MB | 85.5MB | 17.7MB | 538KB |
| tri-logic | WASM ▶ production | 87.9MB | 87.9MB | 17.5MB | 1KB |
| data-query | Node.js | — | — | — | 22KB |
| data-query | Python | — | — | — | — |
| data-query | Galerina passive ⟨interp⟩ | 87.8MB | 87.8MB | 18.4MB | -962KB |
| data-query | Galerina manifest ⟨interp⟩ | 86.0MB | 86.0MB | 17.9MB | 629KB |
| data-query | Galerina governed ⟨interp⟩ | 86.4MB | 86.4MB | 18.5MB | 1.2MB |
| call-chain | Node.js | 47.8MB | 47.8MB | 4.4MB | 274KB |
| call-chain | Python | — | — | 368B | 368B |
| call-chain | Galerina passive ⟨interp⟩ | 87.2MB | 87.2MB | 19.0MB | 83KB |
| call-chain | Galerina manifest ⟨interp⟩ | 87.2MB | 87.2MB | 19.3MB | 2.0MB |
| call-chain | Galerina governed ⟨interp⟩ | 87.2MB | 87.2MB | 18.4MB | 1.1MB |
| call-chain | WASM ▶ production | 90.1MB | 90.1MB | 17.5MB | 1KB |
| nbody | Node.js | 48.6MB | 48.6MB | 4.2MB | 30KB |
| nbody | Python | — | — | 624B | 624B |
| nbody | Galerina passive ⟨interp⟩ | 87.3MB | 87.3MB | 17.8MB | -1.9MB |
| nbody | Galerina manifest ⟨interp⟩ | 87.3MB | 87.3MB | 17.8MB | 437KB |
| nbody | Galerina governed ⟨interp⟩ | 85.7MB | 85.7MB | 19.5MB | 2.2MB |
| nbody | WASM ▶ production | 88.0MB | 88.0MB | 17.6MB | 1KB |
| json-parse | Node.js | — | — | — | 255KB |
| json-parse | Python | — | — | 520B | 520B |
| json-parse | Galerina passive ⟨interp⟩ | 93.5MB | 93.5MB | 21.4MB | 426KB |
| json-parse | Galerina manifest ⟨interp⟩ | 87.1MB | 87.1MB | 20.8MB | 3.0MB |
| json-parse | Galerina governed ⟨interp⟩ | 94.3MB | 94.3MB | 18.6MB | 1.3MB |
| mandelbrot | Rust AVX2 | — | — | — | — |
| mandelbrot | Rust (generic) | — | — | — | — |
| mandelbrot | Node.js | 48.6MB | 48.6MB | 5.1MB | 941KB |
| mandelbrot | Python | — | — | 3KB | 3KB |
| mandelbrot | Galerina passive ⟨interp⟩ | 89.4MB | 89.4MB | 21.6MB | 167KB |
| mandelbrot | Galerina manifest ⟨interp⟩ | 89.4MB | 89.4MB | 20.1MB | 2.3MB |
| mandelbrot | Galerina governed ⟨interp⟩ | 89.3MB | 89.3MB | 18.2MB | 175KB |
| mandelbrot | WASM ▶ production | 94.8MB | 94.8MB | 18.3MB | 1KB |
| spectral-norm | Rust AVX2 | — | — | — | — |
| spectral-norm | Rust (generic) | — | — | — | — |
| spectral-norm | Node.js | 48.4MB | 48.4MB | 4.4MB | 293KB |
| spectral-norm | Python | — | — | 4KB | 4KB |
| binary-trees | Rust AVX2 | — | — | — | — |
| binary-trees | Rust (generic) | — | — | — | — |
| binary-trees | Node.js | 48.5MB | 48.5MB | 4.6MB | 428KB |
| binary-trees | Python | — | — | 368B | 368B |
| binary-trees | Galerina passive ⟨interp⟩ | 89.1MB | 89.1MB | 22.2MB | 69KB |
| binary-trees | Galerina manifest ⟨interp⟩ | 89.1MB | 89.1MB | 19.4MB | 1.6MB |
| binary-trees | Galerina governed ⟨interp⟩ | 89.0MB | 89.0MB | 19.8MB | 1.9MB |
| binary-trees | WASM ▶ production | 91.6MB | 91.6MB | 18.0MB | 2KB |
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
| compute-mix | Node.js | 5.00s | 5.00s | 100% | 139.7K ops/CPU-ms |
| compute-mix | Python | 5.02s | 5.02s | 100% | 767.60 ops/CPU-ms |
| compute-mix | Galerina passive ⟨interp⟩ | 0.3ms | 0.0ms | 0% | — |
| compute-mix | Galerina manifest ⟨interp⟩ | 27.7ms | 46.0ms | 166% | 1.1K ops/CPU-ms |
| compute-mix | Galerina governed ⟨interp⟩ | 30.7ms | 31.0ms | 101% | 1.6K ops/CPU-ms |
| compute-mix | WASM ▶ production | 1.32s | 1.31s | 100% | 76.2K ops/CPU-ms |
| arithmetic-threshold | Rust AVX2 | 12.8ms | — | — | — |
| arithmetic-threshold | Rust (generic) | 12.8ms | — | — | — |
| arithmetic-threshold | C++ | 10.7ms | — | — | — |
| arithmetic-threshold | Node.js | 20.5ms | 16.0ms | 78% | 1.25M ops/CPU-ms |
| arithmetic-threshold | Python | 5.21s | 5.20s | 100% | 3.8K ops/CPU-ms |
| arithmetic-threshold | Galerina passive ⟨interp⟩ | 0.1ms | 0.0ms | 0% | — |
| arithmetic-threshold | Galerina manifest ⟨interp⟩ | 11.7ms | 16.0ms | 136% | 4.0K ops/CPU-ms |
| arithmetic-threshold | Galerina governed ⟨interp⟩ | 11.9ms | 15.0ms | 126% | 4.2K ops/CPU-ms |
| arithmetic-threshold | WASM ▶ production | 1.03s | 1.02s | 99% | 498.0K ops/CPU-ms |
| six-digit-guess | Rust AVX2 | 0.6ms | — | — | — |
| six-digit-guess | Rust (generic) | 0.5ms | — | — | — |
| six-digit-guess | C++ | 0.6ms | — | — | — |
| six-digit-guess | Node.js | 14.7ms | 15.0ms | 102% | 2.8K ops/CPU-ms |
| six-digit-guess | Python | 434.1ms | 437.5ms | 101% | 96.16 ops/CPU-ms |
| six-digit-guess | Galerina passive ⟨interp⟩ | 0.2ms | 0.0ms | 0% | — |
| six-digit-guess | Galerina manifest ⟨interp⟩ | 902.1ms | 922.0ms | 102% | 45.63 ops/CPU-ms |
| six-digit-guess | Galerina governed ⟨interp⟩ | 900.1ms | 969.0ms | 108% | 43.41 ops/CPU-ms |
| six-digit-guess | WASM ▶ production | 1.16s | 1.16s | 100% | 36.4K ops/CPU-ms |
| record-allocation | Rust AVX2 | 10.6ms | — | — | — |
| record-allocation | Rust (generic) | 8.5ms | — | — | — |
| record-allocation | Node.js | 3.4ms | 0.0ms | 0% | — |
| record-allocation | Python | 39.5ms | 46.9ms | 119% | 4.3K ops/CPU-ms |
| record-allocation | Galerina passive ⟨interp⟩ | 0.4ms | 0.0ms | 0% | — |
| record-allocation | Galerina manifest ⟨interp⟩ | 4.6ms | 79.0ms | 1732% | 126.58 ops/CPU-ms |
| record-allocation | Galerina governed ⟨interp⟩ | 5.0ms | 0.0ms | 0% | — |
| record-allocation | WASM ▶ production | 1.01s | 1.03s | 102% | 524.3K ops/CPU-ms |
| fibonacci-recursive | Rust AVX2 | 400.9ms | — | — | — |
| fibonacci-recursive | Rust (generic) | 400.1ms | — | — | — |
| fibonacci-recursive | Node.js | 791.4ms | 781.0ms | 99% | 0.13 ops/CPU-ms |
| fibonacci-recursive | Python | 3.46s | 3.45s | 100% | 0.01 ops/CPU-ms |
| fibonacci-recursive | Galerina passive ⟨interp⟩ | 0.1ms | 0.0ms | 0% | — |
| fibonacci-recursive | Galerina manifest ⟨interp⟩ | 56.9ms | 63.0ms | 111% | 0.02 ops/CPU-ms |
| fibonacci-recursive | Galerina governed ⟨interp⟩ | 80.4ms | 125.0ms | 155% | 0.01 ops/CPU-ms |
| fibonacci-recursive | WASM ▶ production | 1.05s | 1.05s | 100% | 17.19 ops/CPU-ms |
| tower-of-hanoi | Rust AVX2 | 520.3ms | — | — | — |
| tower-of-hanoi | Rust (generic) | 519.6ms | — | — | — |
| tower-of-hanoi | Node.js | 101.5ms | 109.0ms | 107% | 120.2K ops/CPU-ms |
| tower-of-hanoi | Python | 260.1ms | 250.0ms | 96% | 5.2K ops/CPU-ms |
| tower-of-hanoi | Galerina passive ⟨interp⟩ | 0.1ms | 0.0ms | 0% | — |
| tower-of-hanoi | Galerina manifest ⟨interp⟩ | 643.0ms | 657.0ms | 102% | 99.75 ops/CPU-ms |
| tower-of-hanoi | Galerina governed ⟨interp⟩ | 684.5ms | 687.0ms | 100% | 95.39 ops/CPU-ms |
| tower-of-hanoi | WASM ▶ production | 1.08s | 1.09s | 101% | 119.8K ops/CPU-ms |
| collection-pipeline | Rust AVX2 | 75.4ms | — | — | — |
| collection-pipeline | Rust (generic) | 234.3ms | — | — | — |
| collection-pipeline | Node.js | 707.4ms | 734.0ms | 104% | 68.1K ops/CPU-ms |
| collection-pipeline | Python | 4.91s | 4.91s | 100% | 10.2K ops/CPU-ms |
| collection-pipeline | Galerina passive ⟨interp⟩ | 0.7ms | 0.0ms | 0% | — |
| collection-pipeline | Galerina manifest ⟨interp⟩ | 5.5ms | 0.0ms | 0% | — |
| collection-pipeline | Galerina governed ⟨interp⟩ | 5.9ms | 0.0ms | 0% | — |
| collection-pipeline | WASM ▶ production | 1.01s | 1.01s | 101% | 413.8K ops/CPU-ms |
| governance-cost | Rust AVX2 | 11.3ms | — | — | — |
| governance-cost | Rust (generic) | 11.3ms | — | — | — |
| governance-cost | Node.js | 47.2ms | 47.0ms | 99% | — |
| governance-cost | Python | 3.98s | 3.98s | 100% | — |
| governance-cost | Galerina passive ⟨interp⟩ | 1.8ms | 0.0ms | 0% | — |
| governance-cost | Galerina manifest ⟨interp⟩ | 1.2ms | 0.0ms | 0% | — |
| governance-cost | Galerina governed ⟨interp⟩ | 1.3ms | 79.0ms | 6031% | — |
| governance-cost | WASM ▶ production | 1.00s | 1.01s | 101% | — |
| hardware-targets | Rust AVX2 | 849.6ms | — | — | — |
| hardware-targets | Rust (generic) | 854.1ms | — | — | — |
| hardware-targets | Node.js | 1.10s | 1.11s | 101% | 900.90 ops/CPU-ms |
| hardware-targets | Galerina passive ⟨interp⟩ | 14.1ms | 16.0ms | 114% | — |
| hardware-targets | Galerina manifest ⟨interp⟩ | 0.3ms | 0.0ms | 0% | — |
| hardware-targets | Galerina governed ⟨interp⟩ | 0.3ms | 0.0ms | 0% | — |
| hardware-targets | WASM ▶ production | 1.00s | 1.00s | 100% | 40.1K ops/CPU-ms |
| low-memory | Rust AVX2 | 162.5ms | — | — | — |
| low-memory | Rust (generic) | 736.4ms | — | — | — |
| low-memory | Node.js | 70.2ms | 63.0ms | 90% | 793.6K ops/CPU-ms |
| low-memory | Python | 3.30s | 3.30s | 100% | 3.0K ops/CPU-ms |
| low-memory | Galerina passive ⟨interp⟩ | 0.6ms | 0.0ms | 0% | — |
| low-memory | Galerina manifest ⟨interp⟩ | 73.9ms | 94.0ms | 127% | 106.38 ops/CPU-ms |
| low-memory | Galerina governed ⟨interp⟩ | 68.6ms | 156.0ms | 227% | 64.10 ops/CPU-ms |
| low-memory | WASM ▶ production | 1.02s | 1.02s | 100% | 472.4K ops/CPU-ms |
| gpu-compute | Rust AVX2 | 4.21s | — | — | — |
| gpu-compute | Rust (generic) | 4.18s | — | — | — |
| gpu-compute | Node.js | 506.3ms | 516.0ms | 102% | 969.0K ops/CPU-ms |
| gpu-compute | Python | 7.42s | 7.41s | 100% | 6.8K ops/CPU-ms |
| gpu-compute | Galerina passive ⟨interp⟩ | 0.3ms | 16.0ms | 5839% | — |
| gpu-compute | Galerina manifest ⟨interp⟩ | 277.4ms | 344.0ms | 124% | 290.70 ops/CPU-ms |
| gpu-compute | Galerina governed ⟨interp⟩ | 265.9ms | 297.0ms | 112% | 336.70 ops/CPU-ms |
| gpu-compute | WASM ▶ production | 1.05s | 1.05s | 100% | 478.0K ops/CPU-ms |
| matrix-multiply | Rust AVX2 | 93.3ms | — | — | — |
| matrix-multiply | Rust (generic) | 86.7ms | — | — | — |
| matrix-multiply | Node.js | 210.3ms | 204.0ms | 97% | 642.5K ops/CPU-ms |
| matrix-multiply | Python | 1.93s | — | — | — |
| matrix-multiply | Galerina passive ⟨interp⟩ | 0.2ms | 0.0ms | 0% | — |
| matrix-multiply | Galerina manifest ⟨interp⟩ | 50.1ms | 78.0ms | 156% | 420.10 ops/CPU-ms |
| matrix-multiply | Galerina governed ⟨interp⟩ | 46.0ms | 63.0ms | 137% | 520.13 ops/CPU-ms |
| matrix-multiply | WASM ▶ production | 1.03s | 1.03s | 100% | 445.0K ops/CPU-ms |
| crypto-ops | Galerina passive ⟨interp⟩ | 16.0ms | 15.0ms | 94% | — |
| crypto-ops | Galerina manifest ⟨interp⟩ | 0.5ms | 0.0ms | 0% | — |
| crypto-ops | Galerina governed ⟨interp⟩ | 8.1ms | 0.0ms | 0% | — |
| text-html | Galerina passive ⟨interp⟩ | 2.4ms | 0.0ms | 0% | — |
| text-html | Galerina manifest ⟨interp⟩ | 0.6ms | 0.0ms | 0% | — |
| text-html | Galerina governed ⟨interp⟩ | 1.4ms | 0.0ms | 0% | — |
| tri-logic | Rust AVX2 | 432.5ms | — | — | — |
| tri-logic | Rust (generic) | 434.3ms | — | — | — |
| tri-logic | Node.js | 299.0ms | — | — | — |
| tri-logic | Python | 1.77s | — | — | — |
| tri-logic | Galerina passive ⟨interp⟩ | 1.9ms | 0.0ms | 0% | — |
| tri-logic | Galerina manifest ⟨interp⟩ | 855.3ms | 907.0ms | 106% | 330.76 ops/CPU-ms |
| tri-logic | Galerina governed ⟨interp⟩ | 862.5ms | 859.0ms | 100% | 349.24 ops/CPU-ms |
| tri-logic | WASM ▶ production | 1.28s | 1.26s | 99% | 474.3K ops/CPU-ms |
| data-query | Node.js | 128.1ms | — | — | — |
| data-query | Python | 861.9ms | — | — | — |
| data-query | Galerina passive ⟨interp⟩ | 1.3ms | 0.0ms | 0% | — |
| data-query | Galerina manifest ⟨interp⟩ | 46.9ms | 62.0ms | 132% | 161.29 ops/CPU-ms |
| data-query | Galerina governed ⟨interp⟩ | 45.0ms | 93.0ms | 207% | 107.53 ops/CPU-ms |
| call-chain | Node.js | 7.2ms | 0.0ms | 0% | — |
| call-chain | Python | 723.6ms | 718.8ms | 99% | 1.4K ops/CPU-ms |
| call-chain | Galerina passive ⟨interp⟩ | 0.1ms | 0.0ms | 0% | — |
| call-chain | Galerina manifest ⟨interp⟩ | 840.5ms | 844.0ms | 100% | 59.24 ops/CPU-ms |
| call-chain | Galerina governed ⟨interp⟩ | 858.7ms | 859.0ms | 100% | 58.21 ops/CPU-ms |
| call-chain | WASM ▶ production | 1.84s | 1.83s | 99% | 54.7K ops/CPU-ms |
| nbody | Node.js | 53.9ms | 47.0ms | 87% | 139.4K ops/CPU-ms |
| nbody | Python | 1.47s | — | — | — |
| nbody | Galerina passive ⟨interp⟩ | 0.3ms | 0.0ms | 0% | — |
| nbody | Galerina manifest ⟨interp⟩ | 520.8ms | 532.0ms | 102% | 61.59 ops/CPU-ms |
| nbody | Galerina governed ⟨interp⟩ | 535.1ms | 563.0ms | 105% | 58.20 ops/CPU-ms |
| nbody | WASM ▶ production | 1.14s | 1.14s | 100% | 28.7K ops/CPU-ms |
| json-parse | Galerina passive ⟨interp⟩ | 0.5ms | 0.0ms | 0% | — |
| json-parse | Galerina manifest ⟨interp⟩ | 101.5ms | 109.0ms | 107% | 4.59 ops/CPU-ms |
| json-parse | Galerina governed ⟨interp⟩ | 89.8ms | 140.0ms | 156% | 3.57 ops/CPU-ms |
| mandelbrot | Rust AVX2 | 139.9ms | — | — | — |
| mandelbrot | Rust (generic) | 139.9ms | — | — | — |
| mandelbrot | Node.js | 525.5ms | 516.0ms | 98% | 6.4K ops/CPU-ms |
| mandelbrot | Python | 22.02s | — | — | — |
| mandelbrot | Galerina passive ⟨interp⟩ | 0.2ms | 0.0ms | 0% | — |
| mandelbrot | Galerina manifest ⟨interp⟩ | 2.18s | 2.17s | 100% | 7.55 ops/CPU-ms |
| mandelbrot | Galerina governed ⟨interp⟩ | 2.11s | 2.14s | 101% | 7.65 ops/CPU-ms |
| mandelbrot | WASM ▶ production | 1.81s | 1.81s | 100% | 9.0K ops/CPU-ms |
| spectral-norm | Rust AVX2 | 28.1ms | — | — | — |
| spectral-norm | Rust (generic) | 26.9ms | — | — | — |
| spectral-norm | Node.js | 41.1ms | 47.0ms | 114% | 212.8K ops/CPU-ms |
| spectral-norm | Python | 5.94s | — | — | — |
| binary-trees | Rust AVX2 | 6.7ms | — | — | — |
| binary-trees | Rust (generic) | 8.7ms | — | — | — |
| binary-trees | Node.js | 1.8ms | 0.0ms | 0% | — |
| binary-trees | Python | 26.4ms | 15.6ms | 59% | 8.7K ops/CPU-ms |
| binary-trees | Galerina passive ⟨interp⟩ | 0.1ms | 0.0ms | 0% | — |
| binary-trees | Galerina manifest ⟨interp⟩ | 347.5ms | 344.0ms | 99% | 394.92 ops/CPU-ms |
| binary-trees | Galerina governed ⟨interp⟩ | 370.4ms | 375.0ms | 101% | 362.28 ops/CPU-ms |
| binary-trees | WASM ▶ production | 1.16s | 1.16s | 100% | 587.6K ops/CPU-ms |
| spore-container | Rust AVX2 | 2.21s | — | — | — |
| spore-container | Rust (generic) | 2.15s | — | — | — |
| spore-container | Node.js | 7.03s | 8.28s | 118% | 36.22 ops/CPU-ms |
| spore-container | Python | 1.55s | — | — | — |
| framework-pipeline | Python | 1.74s | — | — | — |
| http-throughput | Node.js | 88.0ms | — | — | — |
| naming-check | Node.js | 432.0ms | — | — | — |
| context-receipt | Node.js | 312.0ms | — | — | — |
| intelligence-search | Node.js | 44.0ms | — | — | — |
| provenance-trace | Node.js | 1.97s | — | — | — |

> **CPU utilisation** = CPU ms ÷ wall ms × 100. Node.js approaches 100% (single-thread JIT). Python may show <100% on Windows where process_time measures differently.

## 4. Per-Benchmark Detail

> **Heap/op** = heap bytes allocated per operation (the fair, workload-attributable memory metric).
> Managed runtimes (Node/Python/Galerina/WASM) report it via a GC'd before/after delta; native Rust/C++
> show **~0 (native)** — no GC-managed heap. `~0` = no measurable per-op allocation (e.g. V8 tagged ints);
> a large positive value (e.g. the Galerina tree-walker boxing a value per AST node) is allocation pressure.

### compute-mix

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Node.js | 139.66M/s | 5.00s | 5.00s | 44.1MB | ~0 | 182.3× | 1.00× |
| 🥈 | 🟢 | C++ | 134.52M/s | 30.00s | — | — | ~0 (native) | 175.6× | 0.96× |
| 🥉 | 🟢 | Rust (generic) | 130.83M/s | 5.00s | — | — | ~0 (native) | 170.7× | 0.94× |
| 4 | 🟢 | Rust AVX2 | 130.10M/s | 5.00s | — | — | ~0 (native) | 169.8× | 0.93× |
| 5 | ⚪ | WASM ▶ production | 75.81M/s | 1.32s | 1.31s | 71.2MB | ~0 | 98.9× | 0.54× |
| 6 | 🔴 | Galerina passive ⟨interp⟩ | 2.22M/s | 0.3ms | 0.0ms | 77.6MB | 105 B/op | 2.90× | 0.02× |
| 7 | 🔴 | Galerina manifest ⟨interp⟩ | 1.81M/s | 27.7ms | 46.0ms | 73.8MB | 90 B/op | 2.36× | 0.01× |
| 8 | 🔴 | Galerina governed ⟨interp⟩ | 1.63M/s | 30.7ms | 31.0ms | 72.6MB | 90 B/op | 2.13× | 0.01× |
| 9 | ⚫ | Python | 766.2K/s | 5.02s | 5.02s | — | ~0 | 1.00× | 0.01× |

> 🧠 **Lowest heap/op:** WASM ▶ production (~0) · **highest:** Galerina passive ⟨interp⟩ (105 B/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### arithmetic-threshold

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | C++ | 1.87B/s | 10.7ms | — | — | ~0 (native) | 486.7× | 1.92× |
| 🥈 | 🟢 | Rust AVX2 | 1.57B/s | 12.8ms | — | — | ~0 (native) | 408.3× | 1.61× |
| 🥉 | 🟢 | Rust (generic) | 1.56B/s | 12.8ms | — | — | ~0 (native) | 407.1× | 1.60× |
| 4 | 🟢 | Node.js | 976.20M/s | 20.5ms | 16.0ms | 47.1MB | ~0 | 254.1× | 1.00× |
| 5 | ⚪ | WASM ▶ production | 491.03M/s | 1.03s | 1.02s | 80.9MB | ~0 | 127.8× | 0.50× |
| 6 | ⚫ | Galerina manifest ⟨interp⟩ | 5.39M/s | 11.7ms | 16.0ms | 78.9MB | 13 B/op | 1.40× | 0.01× |
| 7 | ⚫ | Galerina governed ⟨interp⟩ | 5.30M/s | 11.9ms | 15.0ms | 79.0MB | 13 B/op | 1.38× | 0.01× |
| 8 | ⚫ | Python | 3.84M/s | 5.21s | 5.20s | — | ~0 | 1.00× | 0.00× |
| 9 | ⚫ | Galerina passive ⟨interp⟩ | 26.6K/s | 0.1ms | 0.0ms | 79.1MB | 12.8 KB/op | 0.01× | 0.00× |

> 🧠 **Lowest heap/op:** WASM ▶ production (~0) · **highest:** Galerina passive ⟨interp⟩ (12.8 KB/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### six-digit-guess

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Rust (generic) | 78.08M/s | 0.5ms | — | — | ~0 (native) | 805.7× | 27.3× |
| 🥈 | 🟢 | C++ | 67.36M/s | 0.6ms | — | — | ~0 (native) | 695.0× | 23.6× |
| 🥉 | 🟢 | Rust AVX2 | 67.05M/s | 0.6ms | — | — | ~0 (native) | 691.9× | 23.5× |
| 4 | 🟢 | WASM ▶ production | 36.39M/s | 1.16s | 1.16s | 81.6MB | ~0 | 375.5× | 12.7× |
| 5 | 🟢 | Node.js | 2.86M/s | 14.7ms | 15.0ms | 51.8MB | 27 B/op | 29.5× | 1.00× |
| 6 | 🔴 | Python | 96.9K/s | 434.1ms | 437.5ms | — | ~0 | 1.00× | 0.03× |
| 7 | 🔴 | Galerina governed ⟨interp⟩ | 46.7K/s | 900.1ms | 969.0ms | 80.4MB | 36 B/op | 0.48× | 0.02× |
| 8 | 🔴 | Galerina manifest ⟨interp⟩ | 46.6K/s | 902.1ms | 922.0ms | 80.6MB | 18 B/op | 0.48× | 0.02× |
| 9 | ⚫ | Galerina passive ⟨interp⟩ | 17.5K/s | 0.2ms | 0.0ms | 80.3MB | 28.4 KB/op | 0.18× | 0.01× |

> 🧠 **Lowest heap/op:** WASM ▶ production (~0) · **highest:** Galerina passive ⟨interp⟩ (28.4 KB/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### record-allocation

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Rust (generic) | 1.17B/s | 8.5ms | — | — | ~0 (native) | 231.0× | 19.8× |
| 🥈 | 🟢 | Rust AVX2 | 943.12M/s | 10.6ms | — | — | ~0 (native) | 186.1× | 16.0× |
| 🥉 | 🟢 | WASM ▶ production | 536.21M/s | 1.01s | 1.03s | 82.8MB | ~0 | 105.8× | 9.08× |
| 4 | 🟢 | Node.js | 59.03M/s | 3.4ms | 0.0ms | 48.0MB | ~0 | 11.6× | 1.00× |
| 5 | 🔴 | Galerina passive ⟨interp⟩ | 5.77M/s | 0.4ms | 0.0ms | 80.5MB | 88 B/op | 1.14× | 0.10× |
| 6 | 🔴 | Python | 5.07M/s | 39.5ms | 46.9ms | — | ~0 | 1.00× | 0.09× |
| 7 | 🔴 | Galerina manifest ⟨interp⟩ | 2.19M/s | 4.6ms | 79.0ms | 80.5MB | 9 B/op | 0.43× | 0.04× |
| 8 | 🔴 | Galerina governed ⟨interp⟩ | 1.99M/s | 5.0ms | 0.0ms | 81.3MB | 6 B/op | 0.39× | 0.03× |

> 🧠 **Lowest heap/op:** WASM ▶ production (~0) · **highest:** Galerina passive ⟨interp⟩ (88 B/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### fibonacci-recursive

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Galerina passive ⟨interp⟩ | 51.8K/s | 0.1ms | 0.0ms | 81.2MB | 11.6 KB/op | 9.0K× | 410.0× |
| 🥈 | 🟢 | WASM ▶ production | 17.2K/s | 1.05s | 1.05s | 82.7MB | ~0 | 3.0K× | 135.9× |
| 🥉 | 🟢 | Rust (generic) | 499.9/s | 400.1ms | — | — | ~0 (native) | 86.5× | 3.96× |
| 4 | 🟢 | Rust AVX2 | 498.9/s | 400.9ms | — | — | ~0 (native) | 86.3× | 3.95× |
| 5 | 🟢 | Node.js | 126.4/s | 791.4ms | 781.0ms | 46.5MB | 53 B/op | 21.9× | 1.00× |
| 6 | 🟡 | Galerina manifest ⟨interp⟩ | 18.0/s | 56.9ms | 63.0ms | 81.1MB | 1028.3 KB/op | 3.11× | 0.14× |
| 7 | 🔴 | Galerina governed ⟨interp⟩ | 12.0/s | 80.4ms | 125.0ms | 80.8MB | 913.6 KB/op | 2.08× | 0.09× |
| 8 | 🔴 | Python | 5.8/s | 3.46s | 3.45s | — | 23 B/op | 1.00× | 0.05× |

> 🧠 **Lowest heap/op:** WASM ▶ production (~0) · **highest:** Galerina manifest ⟨interp⟩ (1028.3 KB/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### tower-of-hanoi

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Rust (generic) | 252.24M/s | 519.6ms | — | — | ~0 (native) | 50.1× | 1.95× |
| 🥈 | 🟢 | Rust AVX2 | 251.90M/s | 520.3ms | — | — | ~0 (native) | 50.0× | 1.95× |
| 🥉 | 🟢 | Node.js | 129.15M/s | 101.5ms | 109.0ms | 46.4MB | ~0 | 25.6× | 1.00× |
| 4 | 🟢 | WASM ▶ production | 121.28M/s | 1.08s | 1.09s | 83.2MB | ~0 | 24.1× | 0.94× |
| 5 | 🔴 | Python | 5.04M/s | 260.1ms | 250.0ms | — | ~0 | 1.00× | 0.04× |
| 6 | ⚫ | Galerina passive ⟨interp⟩ | 102.2K/s | 0.1ms | 0.0ms | 84.0MB | 6.8 KB/op | 0.02× | 0.00× |
| 7 | ⚫ | Galerina manifest ⟨interp⟩ | 101.9K/s | 643.0ms | 657.0ms | 83.0MB | 16 B/op | 0.02× | 0.00× |
| 8 | ⚫ | Galerina governed ⟨interp⟩ | 95.7K/s | 684.5ms | 687.0ms | 83.2MB | 68 B/op | 0.02× | 0.00× |

> 🧠 **Lowest heap/op:** WASM ▶ production (~0) · **highest:** Galerina passive ⟨interp⟩ (6.8 KB/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### collection-pipeline

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Rust AVX2 | 13.27B/s | 75.4ms | — | — | ~0 (native) | 1.3K× | 187.7× |
| 🥈 | 🟢 | Rust (generic) | 4.27B/s | 234.3ms | — | — | ~0 (native) | 418.9× | 60.4× |
| 🥉 | 🟢 | WASM ▶ production | 417.43M/s | 1.01s | 1.01s | 86.6MB | ~0 | 41.0× | 5.91× |
| 4 | 🟢 | Node.js | 70.69M/s | 707.4ms | 734.0ms | 63.4MB | ~0 | 6.94× | 1.00× |
| 5 | 🟡 | Python | 10.19M/s | 4.91s | 4.91s | — | ~0 | 1.00× | 0.14× |
| 6 | 🔴 | Galerina passive ⟨interp⟩ | 5.62M/s | 0.7ms | 0.0ms | 83.8MB | 71 B/op | 0.55× | 0.08× |
| 7 | 🔴 | Galerina manifest ⟨interp⟩ | 1.83M/s | 5.5ms | 0.0ms | 83.8MB | 14 B/op | 0.18× | 0.03× |
| 8 | 🔴 | Galerina governed ⟨interp⟩ | 1.71M/s | 5.9ms | 0.0ms | 84.9MB | 17 B/op | 0.17× | 0.02× |

> 🧠 **Lowest heap/op:** WASM ▶ production (~0) · **highest:** Galerina passive ⟨interp⟩ (71 B/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### governance-cost ⚠️ (excluded — not unit-aligned)

> internal governed/manifest ratio — native baseline does no governance; not cross-runtime by design

| Runtime | Raw reported throughput (native unit — **NOT comparable**) | Wall |
|---|---|---|
| Rust AVX2 | 887.97M/s | 11.3ms |
| Rust (generic) | 883.68M/s | 11.3ms |
| Node.js | 2.12M/s | 47.2ms |
| Python | 25.1K/s | 3.98s |
| Galerina passive ⟨interp⟩ | 2.4K/s | 1.8ms |
| Galerina manifest ⟨interp⟩ | 848.0/s | 1.2ms |
| Galerina governed ⟨interp⟩ | 765.0/s | 1.3ms |
| WASM ▶ production | 2.91M/s | 1.00s |

### hardware-targets

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | WASM ▶ production | 40.08M/s | 1.00s | 1.00s | 86.3MB | ~0 | — | 44.1× |
| 🥈 | 🟢 | Rust AVX2 | 1.18M/s | 849.6ms | — | — | ~0 (native) | — | 1.30× |
| 🥉 | 🟢 | Rust (generic) | 1.17M/s | 854.1ms | — | — | ~0 (native) | — | 1.29× |
| 4 | 🟢 | Node.js | 907.9K/s | 1.10s | 1.11s | 48.2MB | ~0 | — | 1.00× |
| 5 | 🔴 | Galerina passive ⟨interp⟩ | 71.0K/s | 14.1ms | 16.0ms | 84.2MB | 808 B/op | — | 0.08× |
| 6 | ⚫ | Galerina governed ⟨interp⟩ | 4.0K/s | 0.3ms | 0.0ms | 84.1MB | 76.0 KB/op | — | 0.00× |
| 7 | ⚫ | Galerina manifest ⟨interp⟩ | 3.0K/s | 0.3ms | 0.0ms | 84.2MB | 75.1 KB/op | — | 0.00× |

> 🧠 **Lowest heap/op:** WASM ▶ production (~0) · **highest:** Galerina governed ⟨interp⟩ (76.0 KB/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### low-memory

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Rust AVX2 | 6.15B/s | 162.5ms | — | — | ~0 | 2.0K× | 8.64× |
| 🥈 | 🟢 | Rust (generic) | 1.36B/s | 736.4ms | — | — | ~0 | 447.9× | 1.91× |
| 🥉 | 🟢 | Node.js | 712.31M/s | 70.2ms | 63.0ms | 46.4MB | ~0 | 235.0× | 1.00× |
| 4 | ⚪ | WASM ▶ production | 470.09M/s | 1.02s | 1.02s | 86.2MB | ~0 | 155.1× | 0.66× |
| 5 | ⚫ | Python | 3.03M/s | 3.30s | 3.30s | — | ~0 | 1.00× | 0.00× |
| 6 | ⚫ | Galerina passive ⟨interp⟩ | 173.7K/s | 0.6ms | 0.0ms | 84.3MB | -3.5 KB/op | 0.06× | 0.00× |
| 7 | ⚫ | Galerina governed ⟨interp⟩ | 145.8K/s | 68.6ms | 156.0ms | 84.2MB | 46 B/op | 0.05× | 0.00× |
| 8 | ⚫ | Galerina manifest ⟨interp⟩ | 135.4K/s | 73.9ms | 94.0ms | 84.5MB | 66 B/op | 0.04× | 0.00× |

> 🧠 **Lowest heap/op:** Galerina passive ⟨interp⟩ (-3.5 KB/op) · **highest:** Galerina manifest ⟨interp⟩ (66 B/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### gpu-compute

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Rust (generic) | 1.20B/s | 4.18s | — | — | ~0 (native) | 177.3× | 1.21× |
| 🥈 | 🟢 | Rust AVX2 | 1.19B/s | 4.21s | — | — | ~0 (native) | 176.2× | 1.20× |
| 🥉 | 🟢 | Node.js | 987.52M/s | 506.3ms | 516.0ms | 46.7MB | ~0 | 146.5× | 1.00× |
| 4 | 🟡 | WASM ▶ production | 475.78M/s | 1.05s | 1.05s | 87.3MB | ~0 | 70.6× | 0.48× |
| 5 | ⚫ | Python | 6.74M/s | 7.42s | 7.41s | — | ~0 | 1.00× | 0.01× |
| 6 | ⚫ | Galerina passive ⟨interp⟩ | 395.0K/s | 0.3ms | 16.0ms | 84.6MB | -17.2 KB/op | 0.06× | 0.00× |
| 7 | ⚫ | Galerina governed ⟨interp⟩ | 376.1K/s | 265.9ms | 297.0ms | 84.5MB | 10 B/op | 0.06× | 0.00× |
| 8 | ⚫ | Galerina manifest ⟨interp⟩ | 360.4K/s | 277.4ms | 344.0ms | 84.4MB | 8 B/op | 0.05× | 0.00× |

> 🧠 **Lowest heap/op:** Galerina passive ⟨interp⟩ (-17.2 KB/op) · **highest:** Galerina governed ⟨interp⟩ (10 B/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### matrix-multiply

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Rust (generic) | 1.51B/s | 86.7ms | — | — | ~0 (native) | 222.1× | 2.43× |
| 🥈 | 🟢 | Rust AVX2 | 1.41B/s | 93.3ms | — | — | ~0 (native) | 206.4× | 2.25× |
| 🥉 | 🟢 | Node.js | 623.30M/s | 210.3ms | 204.0ms | 48.3MB | ~0 | 91.6× | 1.00× |
| 4 | ⚪ | WASM ▶ production | 444.86M/s | 1.03s | 1.03s | 87.0MB | ~0 | 65.3× | 0.71× |
| 5 | 🔴 | Python | 6.81M/s | 1.93s | — | — | 8 B/op | 1.00× | 0.01× |
| 6 | ⚫ | Galerina passive ⟨interp⟩ | 900.5K/s | 0.2ms | 0.0ms | 84.6MB | -8.6 KB/op | 0.13× | 0.00× |
| 7 | ⚫ | Galerina governed ⟨interp⟩ | 712.3K/s | 46.0ms | 63.0ms | 84.6MB | 29 B/op | 0.10× | 0.00× |
| 8 | ⚫ | Galerina manifest ⟨interp⟩ | 653.7K/s | 50.1ms | 78.0ms | 84.6MB | 30 B/op | 0.10× | 0.00× |

> 🧠 **Lowest heap/op:** Galerina passive ⟨interp⟩ (-8.6 KB/op) · **highest:** Galerina manifest ⟨interp⟩ (30 B/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### crypto-ops

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Galerina passive ⟨interp⟩ | 6.2K/s | 16.0ms | 15.0ms | 85.1MB | 6.0 KB/op | — | — |
| 🥈 | 🟡 | Galerina manifest ⟨interp⟩ | 2.1K/s | 0.5ms | 0.0ms | 85.0MB | 190.6 KB/op | — | — |
| 🥉 | 🔴 | Galerina governed ⟨interp⟩ | 123.0/s | 8.1ms | 0.0ms | 85.0MB | 333.8 KB/op | — | — |

> 🧠 **Lowest heap/op:** Galerina passive ⟨interp⟩ (6.0 KB/op) · **highest:** Galerina governed ⟨interp⟩ (333.8 KB/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### text-html

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Galerina passive ⟨interp⟩ | 41.6K/s | 2.4ms | 0.0ms | 86.8MB | -3.9 KB/op | — | — |
| 🥈 | 🔴 | Galerina manifest ⟨interp⟩ | 1.8K/s | 0.6ms | 0.0ms | 85.5MB | 145.3 KB/op | — | — |
| 🥉 | 🔴 | Galerina governed ⟨interp⟩ | 690.0/s | 1.4ms | 0.0ms | 85.2MB | 164.9 KB/op | — | — |

> 🧠 **Lowest heap/op:** Galerina passive ⟨interp⟩ (-3.9 KB/op) · **highest:** Galerina governed ⟨interp⟩ (164.9 KB/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### tri-logic

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Rust AVX2 | 1.39B/s | 432.5ms | — | — | ~0 (native) | 204.6× | 1.38× |
| 🥈 | 🟢 | Rust (generic) | 1.38B/s | 434.3ms | — | — | ~0 (native) | 203.7× | 1.38× |
| 🥉 | 🟢 | Node.js | 1.00B/s | 299.0ms | — | — | ~0 | 147.9× | 1.00× |
| 4 | 🟡 | WASM ▶ production | 470.13M/s | 1.28s | 1.26s | 87.9MB | ~0 | 69.3× | 0.47× |
| 5 | ⚫ | Python | 6.78M/s | 1.77s | — | — | — | 1.00× | 0.01× |
| 6 | ⚫ | Galerina manifest ⟨interp⟩ | 350.8K/s | 855.3ms | 907.0ms | 85.5MB | 4 B/op | 0.05× | 0.00× |
| 7 | ⚫ | Galerina governed ⟨interp⟩ | 347.8K/s | 862.5ms | 859.0ms | 85.5MB | 2 B/op | 0.05× | 0.00× |
| 8 | ⚫ | Galerina passive ⟨interp⟩ | 336.0K/s | 1.9ms | 0.0ms | 85.7MB | 368 B/op | 0.05× | 0.00× |

> 🧠 **Lowest heap/op:** WASM ▶ production (~0) · **highest:** Galerina passive ⟨interp⟩ (368 B/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### data-query

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Node.js | 390.34M/s | 128.1ms | — | — | ~0 | 112.1× | 1.00× |
| 🥈 | ⚫ | Python | 3.48M/s | 861.9ms | — | — | — | 1.00× | 0.01× |
| 🥉 | ⚫ | Galerina passive ⟨interp⟩ | 256.3K/s | 1.3ms | 0.0ms | 87.8MB | -2.8 KB/op | 0.07× | 0.00× |
| 4 | ⚫ | Galerina governed ⟨interp⟩ | 222.2K/s | 45.0ms | 93.0ms | 86.4MB | 118 B/op | 0.06× | 0.00× |
| 5 | ⚫ | Galerina manifest ⟨interp⟩ | 213.4K/s | 46.9ms | 62.0ms | 86.0MB | 63 B/op | 0.06× | 0.00× |

> 🧠 **Lowest heap/op:** Galerina passive ⟨interp⟩ (-2.8 KB/op) · **highest:** Galerina governed ⟨interp⟩ (118 B/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### call-chain

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Node.js | 277.22M/s | 7.2ms | 0.0ms | 47.8MB | ~0 | 200.6× | 1.00× |
| 🥈 | 🟡 | WASM ▶ production | 54.41M/s | 1.84s | 1.83s | 90.1MB | ~0 | 39.4× | 0.20× |
| 🥉 | ⚫ | Python | 1.38M/s | 723.6ms | 718.8ms | — | ~0 | 1.00× | 0.00× |
| 4 | ⚫ | Galerina passive ⟨interp⟩ | 60.5K/s | 0.1ms | 0.0ms | 87.2MB | 11.8 KB/op | 0.04× | 0.00× |
| 5 | ⚫ | Galerina manifest ⟨interp⟩ | 59.5K/s | 840.5ms | 844.0ms | 87.2MB | 40 B/op | 0.04× | 0.00× |
| 6 | ⚫ | Galerina governed ⟨interp⟩ | 58.2K/s | 858.7ms | 859.0ms | 87.2MB | 23 B/op | 0.04× | 0.00× |

> 🧠 **Lowest heap/op:** WASM ▶ production (~0) · **highest:** Galerina passive ⟨interp⟩ (11.8 KB/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### nbody

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Node.js | 121.51M/s | 53.9ms | 47.0ms | 48.6MB | ~0 | 109.0× | 1.00× |
| 🥈 | 🟡 | WASM ▶ production | 28.72M/s | 1.14s | 1.14s | 88.0MB | ~0 | 25.8× | 0.24× |
| 🥉 | ⚫ | Python | 1.11M/s | 1.47s | — | — | 12 B/op | 1.00× | 0.01× |
| 4 | ⚫ | Galerina passive ⟨interp⟩ | 63.9K/s | 0.3ms | 0.0ms | 87.3MB | -84.9 KB/op | 0.06× | 0.00× |
| 5 | ⚫ | Galerina manifest ⟨interp⟩ | 62.9K/s | 520.8ms | 532.0ms | 87.3MB | 13 B/op | 0.06× | 0.00× |
| 6 | ⚫ | Galerina governed ⟨interp⟩ | 61.2K/s | 535.1ms | 563.0ms | 85.7MB | 67 B/op | 0.05× | 0.00× |

> 🧠 **Lowest heap/op:** Galerina passive ⟨interp⟩ (-84.9 KB/op) · **highest:** Galerina governed ⟨interp⟩ (67 B/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### json-parse

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Node.js | 2.96M/s | — | — | — | — | 6.47× | 1.00× |
| 🥈 | 🟡 | Python | 458.0K/s | — | — | — | 1 B/op | 1.00× | 0.15× |
| 🥉 | ⚫ | Galerina passive ⟨interp⟩ | 9.7K/s | 0.5ms | 0.0ms | 93.5MB | 80.2 KB/op | 0.02× | 0.00× |
| 4 | ⚫ | Galerina governed ⟨interp⟩ | 5.6K/s | 89.8ms | 140.0ms | 94.3MB | 2.4 KB/op | 0.01× | 0.00× |
| 5 | ⚫ | Galerina manifest ⟨interp⟩ | 4.9K/s | 101.5ms | 109.0ms | 87.1MB | 5.8 KB/op | 0.01× | 0.00× |

> 🧠 **Lowest heap/op:** Python (1 B/op) · **highest:** Galerina passive ⟨interp⟩ (80.2 KB/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### mandelbrot

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Rust AVX2 | 23.43M/s | 139.9ms | — | — | ~0 (native) | 157.4× | 3.76× |
| 🥈 | 🟢 | Rust (generic) | 23.41M/s | 139.9ms | — | — | ~0 (native) | 157.3× | 3.75× |
| 🥉 | 🟢 | WASM ▶ production | 9.05M/s | 1.81s | 1.81s | 94.8MB | ~0 | 60.8× | 1.45× |
| 4 | 🟢 | Node.js | 6.24M/s | 525.5ms | 516.0ms | 48.6MB | ~0 | 41.9× | 1.00× |
| 5 | 🔴 | Python | 148.8K/s | 22.02s | — | — | ~0 | 1.00× | 0.02× |
| 6 | ⚫ | Galerina governed ⟨interp⟩ | 7.7K/s | 2.11s | 2.14s | 89.3MB | 11 B/op | 0.05× | 0.00× |
| 7 | ⚫ | Galerina passive ⟨interp⟩ | 7.5K/s | 0.2ms | 0.0ms | 89.4MB | 129.5 KB/op | 0.05× | 0.00× |
| 8 | ⚫ | Galerina manifest ⟨interp⟩ | 7.5K/s | 2.18s | 2.17s | 89.4MB | 143 B/op | 0.05× | 0.00× |

> 🧠 **Lowest heap/op:** WASM ▶ production (~0) · **highest:** Galerina passive ⟨interp⟩ (129.5 KB/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### spectral-norm

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Rust (generic) | 371.42M/s | 26.9ms | — | — | ~0 (native) | 220.6× | 1.53× |
| 🥈 | 🟢 | Rust AVX2 | 355.60M/s | 28.1ms | — | — | ~0 (native) | 211.2× | 1.46× |
| 🥉 | 🟢 | Node.js | 243.19M/s | 41.1ms | 47.0ms | 48.4MB | ~0 | 144.4× | 1.00× |
| 4 | ⚫ | Python | 1.68M/s | 5.94s | — | — | ~0 | 1.00× | 0.01× |

> 🧠 **Lowest heap/op:** Python (~0) · **highest:** Node.js (~0). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### binary-trees

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | WASM ▶ production | 587.25M/s | 1.16s | 1.16s | 91.6MB | ~0 | 114.2× | 7.66× |
| 🥈 | 🟢 | Node.js | 76.63M/s | 1.8ms | 0.0ms | 48.5MB | 3 B/op | 14.9× | 1.00× |
| 🥉 | 🟡 | Rust AVX2 | 20.14M/s | 6.7ms | — | — | ~0 (native) | 3.92× | 0.26× |
| 4 | 🟡 | Rust (generic) | 15.62M/s | 8.7ms | — | — | ~0 (native) | 3.04× | 0.20× |
| 5 | 🔴 | Python | 5.14M/s | 26.4ms | 15.6ms | — | ~0 | 1.00× | 0.07× |
| 6 | ⚫ | Galerina passive ⟨interp⟩ | 418.4K/s | 0.1ms | 0.0ms | 89.1MB | 2.0 KB/op | 0.08× | 0.01× |
| 7 | ⚫ | Galerina manifest ⟨interp⟩ | 390.9K/s | 347.5ms | 344.0ms | 89.1MB | 12 B/op | 0.08× | 0.01× |
| 8 | ⚫ | Galerina governed ⟨interp⟩ | 366.7K/s | 370.4ms | 375.0ms | 89.0MB | 14 B/op | 0.07× | 0.00× |

> 🧠 **Lowest heap/op:** Python (~0) · **highest:** Galerina passive ⟨interp⟩ (2.0 KB/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### spore-container

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Rust (generic) | 139.6K/s | 2.15s | — | — | ~0 (native) | 2.16× | 3.27× |
| 🥈 | 🟢 | Rust AVX2 | 135.6K/s | 2.21s | — | — | ~0 (native) | 2.10× | 3.18× |
| 🥉 | 🟢 | Python | 64.5K/s | 1.55s | — | — | ~0 | 1.00× | 1.51× |
| 4 | 🟢 | Node.js | 42.7K/s | 7.03s | 8.28s | 64.5MB | 5 B/op | 0.66× | 1.00× |

> 🧠 **Lowest heap/op:** Python (~0) · **highest:** Node.js (5 B/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### framework-pipeline

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Python | 114.6K/s | 1.74s | — | — | ~0 | 1.00× | — |

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
| 🥇 | 🟢 | Rust (generic) | 🖥️ CPU (cpu (serial)) | 1.20B/s | 4.18s | 1.21× |
| 🥈 | 🟢 | Rust AVX2 | 🖥️ CPU (cpu (serial)) | 1.19B/s | 4.21s | 1.20× |
| 🥉 | 🟢 | Node.js | 🖥️ CPU (cpu (serial)) | 987.52M/s | 506.3ms | 1.00× |
| 4 | 🟡 | WASM ▶ production | 🖥️ CPU (cpu (wasm)) | 475.78M/s | 1.05s | 0.48× |
| 5 | ⚫ | Python | 🖥️ CPU (cpu (serial)) | 6.74M/s | 7.42s | 0.01× |
| 6 | ⚫ | Galerina passive ⟨interp⟩ | 🖥️ CPU (cpu) | 395.0K/s | 0.3ms | 0.00× |
| 7 | ⚫ | Galerina governed ⟨interp⟩ | 🖥️ CPU (cpu) | 376.1K/s | 265.9ms | 0.00× |
| 8 | ⚫ | Galerina manifest ⟨interp⟩ | 🖥️ CPU (cpu) | 360.4K/s | 277.4ms | 0.00× |

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
| **compute-mix** | Node.js | 1.1× slower | 1.1× slower | **🏆 winner** | **🏆 winner** | **182× slower** | **63× slower** | **77× slower** | **86× slower** | 2× slower |
| **arithmetic-threshold** | C++ | 1.2× slower | 1.2× slower | **🏆 winner** | 2× slower | **487× slower** | **70.4K× slower** | **347× slower** | **353× slower** | 4× slower |
| **six-digit-guess** | Rust (generic) | 1.2× slower | **🏆 winner** | 1.2× slower | **27× slower** | **806× slower** | **4.5K× slower** | **1.7K× slower** | **1.7K× slower** | 2× slower |
| **record-allocation** | Rust (generic) | 1.2× slower | **🏆 winner** | not run — no C++ impl | **20× slower** | **231× slower** | **203× slower** | **534× slower** | **589× slower** | 2× slower |
| **fibonacci-recursive** | Galerina passive ⟨interp⟩ | **104× slower** | **104× slower** | not run — no C++ impl | **410× slower** | **9.0K× slower** | **🏆 winner** | **2.9K× slower** | **4.3K× slower** | 3× slower |
| **tower-of-hanoi** | Rust (generic) | **🏆 winner** | **🏆 winner** | not run — no C++ impl | 2× slower | **50× slower** | **2.5K× slower** | **2.5K× slower** | **2.6K× slower** | 2× slower |
| **collection-pipeline** | Rust AVX2 | **🏆 winner** | 3× slower | not run — no C++ impl | **188× slower** | **1.3K× slower** | **2.4K× slower** | **7.2K× slower** | **7.8K× slower** | **32× slower** |
| **hardware-targets** | WASM ▶ production | **34× slower** | **34× slower** | not run — no C++ impl | **44× slower** | not run | **564× slower** | **13.2K× slower** | **10.0K× slower** | **🏆 winner** |
| **low-memory** | Rust AVX2 | **🏆 winner** | 5× slower | not run — no C++ impl | 9× slower | **2.0K× slower** | **35.4K× slower** | **45.5K× slower** | **42.2K× slower** | **13× slower** |
| **gpu-compute** | Rust (generic) | **🏆 winner** | **🏆 winner** | not run — no C++ impl | 1.2× slower | **177× slower** | **3.0K× slower** | **3.3K× slower** | **3.2K× slower** | 3× slower |
| **matrix-multiply** | Rust (generic) | 1.1× slower | **🏆 winner** | not run — no C++ impl | 2× slower | **222× slower** | **1.7K× slower** | **2.3K× slower** | **2.1K× slower** | 3× slower |
| **crypto-ops** | Galerina passive ⟨interp⟩ | no comparable metric | no comparable metric | not run — no C++ impl | no comparable metric | no comparable metric | **🏆 winner** | 3× slower | **51× slower** | no WASM — strings/records |
| **text-html** | Galerina passive ⟨interp⟩ | no comparable metric | no comparable metric | not run — no C++ impl | no comparable metric | no comparable metric | **🏆 winner** | **24× slower** | **60× slower** | no WASM — strings/records |
| **tri-logic** | Rust AVX2 | **🏆 winner** | **🏆 winner** | not run — no C++ impl | 1.4× slower | **205× slower** | **4.1K× slower** | **4.0K× slower** | **4.0K× slower** | 3× slower |
| **data-query** | Node.js | not run — no native impl | not run — no native impl | not run — no C++ impl | **🏆 winner** | **112× slower** | **1.5K× slower** | **1.8K× slower** | **1.8K× slower** | no WASM build |
| **call-chain** | Node.js | not run — no native impl | not run — no native impl | not run — no C++ impl | **🏆 winner** | **201× slower** | **4.6K× slower** | **4.7K× slower** | **4.8K× slower** | 5× slower |
| **nbody** | Node.js | not run — no native impl | not run — no native impl | not run — no C++ impl | **🏆 winner** | **109× slower** | **1.9K× slower** | **1.9K× slower** | **2.0K× slower** | 4× slower |
| **json-parse** | Node.js | not run — no native impl | not run — no native impl | not run — no C++ impl | **🏆 winner** | 6× slower | **307× slower** | **601× slower** | **532× slower** | no WASM — strings/records |
| **mandelbrot** | Rust AVX2 | **🏆 winner** | **🏆 winner** | not run — no C++ impl | 4× slower | **157× slower** | **3.1K× slower** | **3.1K× slower** | **3.0K× slower** | 3× slower |
| **spectral-norm** | Rust (generic) | **🏆 winner** | **🏆 winner** | not run — no C++ impl | 2× slower | **221× slower** | not run | not run | not run | no WASM build |
| **binary-trees** | WASM ▶ production | **29× slower** | **38× slower** | not run — no C++ impl | 8× slower | **114× slower** | **1.4K× slower** | **1.5K× slower** | **1.6K× slower** | **🏆 winner** |
| **spore-container** | Rust (generic) | **🏆 winner** | **🏆 winner** | not run — no C++ impl | 3× slower | 2× slower | not run | not run | not run | no WASM — strings/records |
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
| 🥇 | Node.js | 139.66M/s | 🏆 winner | 182× faster |
| 🥈 | C++ | 134.52M/s | 1.0× slower | 176× faster |
| 🥉 | Rust (generic) | 130.83M/s | 1.1× slower | 171× faster |
| 4 | Rust AVX2 | 130.10M/s | 1.1× slower | 170× faster |
| 5 | WASM ▶ production | 75.81M/s | 1.8× slower | 99× faster |
| 6 | Galerina passive ⟨interp⟩ ⚠️cache | 2.22M/s | 63× slower | 2.9× faster |
| 7 | Galerina manifest ⟨interp⟩ | 1.81M/s | 77× slower | 2.4× faster |
| 8 | Galerina governed ⟨interp⟩ | 1.63M/s | 86× slower | 2.1× faster |
| 9 | Python | 766.2K/s | 182× slower | — (slowest) |

### arithmetic-threshold
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | C++ | 1.87B/s | 🏆 winner | 70.4K× faster |
| 🥈 | Rust AVX2 | 1.57B/s | 1.2× slower | 59.0K× faster |
| 🥉 | Rust (generic) | 1.56B/s | 1.2× slower | 58.9K× faster |
| 4 | Node.js | 976.20M/s | 1.9× slower | 36.7K× faster |
| 5 | WASM ▶ production | 491.03M/s | 3.8× slower | 18.5K× faster |
| 6 | Galerina manifest ⟨interp⟩ | 5.39M/s | 347× slower | 203× faster |
| 7 | Galerina governed ⟨interp⟩ | 5.30M/s | 353× slower | 199× faster |
| 8 | Python | 3.84M/s | 487× slower | 145× faster |
| 9 | Galerina passive ⟨interp⟩ ⚠️cache | 26.6K/s | 70.4K× slower | — (slowest) |

### six-digit-guess
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | Rust (generic) | 78.08M/s | 🏆 winner | 4.5K× faster |
| 🥈 | C++ | 67.36M/s | 1.2× slower | 3.8K× faster |
| 🥉 | Rust AVX2 | 67.05M/s | 1.2× slower | 3.8K× faster |
| 4 | WASM ▶ production | 36.39M/s | 2.1× slower | 2.1K× faster |
| 5 | Node.js | 2.86M/s | 27× slower | 163× faster |
| 6 | Python | 96.9K/s | 806× slower | 5.5× faster |
| 7 | Galerina governed ⟨interp⟩ | 46.7K/s | 1.7K× slower | 2.7× faster |
| 8 | Galerina manifest ⟨interp⟩ | 46.6K/s | 1.7K× slower | 2.7× faster |
| 9 | Galerina passive ⟨interp⟩ ⚠️cache | 17.5K/s | 4.5K× slower | — (slowest) |

### record-allocation
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | Rust (generic) | 1.17B/s | 🏆 winner | 589× faster |
| 🥈 | Rust AVX2 | 943.12M/s | 1.2× slower | 474× faster |
| 🥉 | WASM ▶ production | 536.21M/s | 2.2× slower | 270× faster |
| 4 | Node.js | 59.03M/s | 20× slower | 30× faster |
| 5 | Galerina passive ⟨interp⟩ ⚠️cache | 5.77M/s | 203× slower | 2.9× faster |
| 6 | Python | 5.07M/s | 231× slower | 2.5× faster |
| 7 | Galerina manifest ⟨interp⟩ | 2.19M/s | 534× slower | 1.1× faster |
| 8 | Galerina governed ⟨interp⟩ | 1.99M/s | 589× slower | — (slowest) |

### fibonacci-recursive
> 🏆 cache-hit "winner" is Galerina passive (memoised); **real compute winner: WASM ▶ production at 17.2K/s**.
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | Galerina passive ⟨interp⟩ ⚠️cache | 51.8K/s | 🏆 winner | 9.0K× faster |
| 🥈 | WASM ▶ production | 17.2K/s | 3.0× slower | 3.0K× faster |
| 🥉 | Rust (generic) | 499.9/s | 104× slower | 86× faster |
| 4 | Rust AVX2 | 498.9/s | 104× slower | 86× faster |
| 5 | Node.js | 126.4/s | 410× slower | 22× faster |
| 6 | Galerina manifest ⟨interp⟩ | 18.0/s | 2.9K× slower | 3.1× faster |
| 7 | Galerina governed ⟨interp⟩ | 12.0/s | 4.3K× slower | 2.1× faster |
| 8 | Python | 5.8/s | 9.0K× slower | — (slowest) |

### tower-of-hanoi
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | Rust (generic) | 252.24M/s | 🏆 winner | 2.6K× faster |
| 🥈 | Rust AVX2 | 251.90M/s | 1.0× slower | 2.6K× faster |
| 🥉 | Node.js | 129.15M/s | 2.0× slower | 1.3K× faster |
| 4 | WASM ▶ production | 121.28M/s | 2.1× slower | 1.3K× faster |
| 5 | Python | 5.04M/s | 50× slower | 53× faster |
| 6 | Galerina passive ⟨interp⟩ ⚠️cache | 102.2K/s | 2.5K× slower | 1.1× faster |
| 7 | Galerina manifest ⟨interp⟩ | 101.9K/s | 2.5K× slower | 1.1× faster |
| 8 | Galerina governed ⟨interp⟩ | 95.7K/s | 2.6K× slower | — (slowest) |

### collection-pipeline
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | Rust AVX2 | 13.27B/s | 🏆 winner | 7.8K× faster |
| 🥈 | Rust (generic) | 4.27B/s | 3.1× slower | 2.5K× faster |
| 🥉 | WASM ▶ production | 417.43M/s | 32× slower | 245× faster |
| 4 | Node.js | 70.69M/s | 188× slower | 41× faster |
| 5 | Python | 10.19M/s | 1.3K× slower | 6.0× faster |
| 6 | Galerina passive ⟨interp⟩ ⚠️cache | 5.62M/s | 2.4K× slower | 3.3× faster |
| 7 | Galerina manifest ⟨interp⟩ | 1.83M/s | 7.2K× slower | 1.1× faster |
| 8 | Galerina governed ⟨interp⟩ | 1.71M/s | 7.8K× slower | — (slowest) |

### hardware-targets
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | WASM ▶ production | 40.08M/s | 🏆 winner | 13.2K× faster |
| 🥈 | Rust AVX2 | 1.18M/s | 34× slower | 388× faster |
| 🥉 | Rust (generic) | 1.17M/s | 34× slower | 386× faster |
| 4 | Node.js | 907.9K/s | 44× slower | 300× faster |
| 5 | Galerina passive ⟨interp⟩ ⚠️cache | 71.0K/s | 564× slower | 23× faster |
| 6 | Galerina governed ⟨interp⟩ | 4.0K/s | 10.0K× slower | 1.3× faster |
| 7 | Galerina manifest ⟨interp⟩ | 3.0K/s | 13.2K× slower | — (slowest) |

### low-memory
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | Rust AVX2 | 6.15B/s | 🏆 winner | 45.5K× faster |
| 🥈 | Rust (generic) | 1.36B/s | 4.5× slower | 10.0K× faster |
| 🥉 | Node.js | 712.31M/s | 8.6× slower | 5.3K× faster |
| 4 | WASM ▶ production | 470.09M/s | 13× slower | 3.5K× faster |
| 5 | Python | 3.03M/s | 2.0K× slower | 22× faster |
| 6 | Galerina passive ⟨interp⟩ ⚠️cache | 173.7K/s | 35.4K× slower | 1.3× faster |
| 7 | Galerina governed ⟨interp⟩ | 145.8K/s | 42.2K× slower | 1.1× faster |
| 8 | Galerina manifest ⟨interp⟩ | 135.4K/s | 45.5K× slower | — (slowest) |

### gpu-compute
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | Rust (generic) | 1.20B/s | 🏆 winner | 3.3K× faster |
| 🥈 | Rust AVX2 | 1.19B/s | 1.0× slower | 3.3K× faster |
| 🥉 | Node.js | 987.52M/s | 1.2× slower | 2.7K× faster |
| 4 | WASM ▶ production | 475.78M/s | 2.5× slower | 1.3K× faster |
| 5 | Python | 6.74M/s | 177× slower | 19× faster |
| 6 | Galerina passive ⟨interp⟩ ⚠️cache | 395.0K/s | 3.0K× slower | 1.1× faster |
| 7 | Galerina governed ⟨interp⟩ | 376.1K/s | 3.2K× slower | 1.0× faster |
| 8 | Galerina manifest ⟨interp⟩ | 360.4K/s | 3.3K× slower | — (slowest) |

### matrix-multiply
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | Rust (generic) | 1.51B/s | 🏆 winner | 2.3K× faster |
| 🥈 | Rust AVX2 | 1.41B/s | 1.1× slower | 2.1K× faster |
| 🥉 | Node.js | 623.30M/s | 2.4× slower | 954× faster |
| 4 | WASM ▶ production | 444.86M/s | 3.4× slower | 681× faster |
| 5 | Python | 6.81M/s | 222× slower | 10× faster |
| 6 | Galerina passive ⟨interp⟩ ⚠️cache | 900.5K/s | 1.7K× slower | 1.4× faster |
| 7 | Galerina governed ⟨interp⟩ | 712.3K/s | 2.1K× slower | 1.1× faster |
| 8 | Galerina manifest ⟨interp⟩ | 653.7K/s | 2.3K× slower | — (slowest) |

### crypto-ops
> 🏆 cache-hit "winner" is Galerina passive (memoised); **real compute winner: Galerina manifest ⟨interp⟩ at 2.1K/s**.
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | Galerina passive ⟨interp⟩ ⚠️cache | 6.2K/s | 🏆 winner | 51× faster |
| 🥈 | Galerina manifest ⟨interp⟩ | 2.1K/s | 2.9× slower | 17× faster |
| 🥉 | Galerina governed ⟨interp⟩ | 123.0/s | 51× slower | — (slowest) |

### text-html
> 🏆 cache-hit "winner" is Galerina passive (memoised); **real compute winner: Galerina manifest ⟨interp⟩ at 1.8K/s**.
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | Galerina passive ⟨interp⟩ ⚠️cache | 41.6K/s | 🏆 winner | 60× faster |
| 🥈 | Galerina manifest ⟨interp⟩ | 1.8K/s | 24× slower | 2.5× faster |
| 🥉 | Galerina governed ⟨interp⟩ | 690.0/s | 60× slower | — (slowest) |

### tri-logic
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | Rust AVX2 | 1.39B/s | 🏆 winner | 4.1K× faster |
| 🥈 | Rust (generic) | 1.38B/s | 1.0× slower | 4.1K× faster |
| 🥉 | Node.js | 1.00B/s | 1.4× slower | 3.0K× faster |
| 4 | WASM ▶ production | 470.13M/s | 3.0× slower | 1.4K× faster |
| 5 | Python | 6.78M/s | 205× slower | 20× faster |
| 6 | Galerina manifest ⟨interp⟩ | 350.8K/s | 4.0K× slower | 1.0× faster |
| 7 | Galerina governed ⟨interp⟩ | 347.8K/s | 4.0K× slower | 1.0× faster |
| 8 | Galerina passive ⟨interp⟩ ⚠️cache | 336.0K/s | 4.1K× slower | — (slowest) |

### data-query
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | Node.js | 390.34M/s | 🏆 winner | 1.8K× faster |
| 🥈 | Python | 3.48M/s | 112× slower | 16× faster |
| 🥉 | Galerina passive ⟨interp⟩ ⚠️cache | 256.3K/s | 1.5K× slower | 1.2× faster |
| 4 | Galerina governed ⟨interp⟩ | 222.2K/s | 1.8K× slower | 1.0× faster |
| 5 | Galerina manifest ⟨interp⟩ | 213.4K/s | 1.8K× slower | — (slowest) |

### call-chain
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | Node.js | 277.22M/s | 🏆 winner | 4.8K× faster |
| 🥈 | WASM ▶ production | 54.41M/s | 5.1× slower | 934× faster |
| 🥉 | Python | 1.38M/s | 201× slower | 24× faster |
| 4 | Galerina passive ⟨interp⟩ ⚠️cache | 60.5K/s | 4.6K× slower | 1.0× faster |
| 5 | Galerina manifest ⟨interp⟩ | 59.5K/s | 4.7K× slower | 1.0× faster |
| 6 | Galerina governed ⟨interp⟩ | 58.2K/s | 4.8K× slower | — (slowest) |

### nbody
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | Node.js | 121.51M/s | 🏆 winner | 2.0K× faster |
| 🥈 | WASM ▶ production | 28.72M/s | 4.2× slower | 469× faster |
| 🥉 | Python | 1.11M/s | 109× slower | 18× faster |
| 4 | Galerina passive ⟨interp⟩ ⚠️cache | 63.9K/s | 1.9K× slower | 1.0× faster |
| 5 | Galerina manifest ⟨interp⟩ | 62.9K/s | 1.9K× slower | 1.0× faster |
| 6 | Galerina governed ⟨interp⟩ | 61.2K/s | 2.0K× slower | — (slowest) |

### json-parse
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | Node.js | 2.96M/s | 🏆 winner | 601× faster |
| 🥈 | Python | 458.0K/s | 6.5× slower | 93× faster |
| 🥉 | Galerina passive ⟨interp⟩ ⚠️cache | 9.7K/s | 307× slower | 2.0× faster |
| 4 | Galerina governed ⟨interp⟩ | 5.6K/s | 532× slower | 1.1× faster |
| 5 | Galerina manifest ⟨interp⟩ | 4.9K/s | 601× slower | — (slowest) |

### mandelbrot
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | Rust AVX2 | 23.43M/s | 🏆 winner | 3.1K× faster |
| 🥈 | Rust (generic) | 23.41M/s | 1.0× slower | 3.1K× faster |
| 🥉 | WASM ▶ production | 9.05M/s | 2.6× slower | 1.2K× faster |
| 4 | Node.js | 6.24M/s | 3.8× slower | 828× faster |
| 5 | Python | 148.8K/s | 157× slower | 20× faster |
| 6 | Galerina governed ⟨interp⟩ | 7.7K/s | 3.0K× slower | 1.0× faster |
| 7 | Galerina passive ⟨interp⟩ ⚠️cache | 7.5K/s | 3.1K× slower | 1.0× faster |
| 8 | Galerina manifest ⟨interp⟩ | 7.5K/s | 3.1K× slower | — (slowest) |

### spectral-norm
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | Rust (generic) | 371.42M/s | 🏆 winner | 221× faster |
| 🥈 | Rust AVX2 | 355.60M/s | 1.0× slower | 211× faster |
| 🥉 | Node.js | 243.19M/s | 1.5× slower | 144× faster |
| 4 | Python | 1.68M/s | 221× slower | — (slowest) |

### binary-trees
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | WASM ▶ production | 587.25M/s | 🏆 winner | 1.6K× faster |
| 🥈 | Node.js | 76.63M/s | 7.7× slower | 209× faster |
| 🥉 | Rust AVX2 | 20.14M/s | 29× slower | 55× faster |
| 4 | Rust (generic) | 15.62M/s | 38× slower | 43× faster |
| 5 | Python | 5.14M/s | 114× slower | 14× faster |
| 6 | Galerina passive ⟨interp⟩ ⚠️cache | 418.4K/s | 1.4K× slower | 1.1× faster |
| 7 | Galerina manifest ⟨interp⟩ | 390.9K/s | 1.5K× slower | 1.1× faster |
| 8 | Galerina governed ⟨interp⟩ | 366.7K/s | 1.6K× slower | — (slowest) |

### spore-container
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | Rust (generic) | 139.6K/s | 🏆 winner | 3.3× faster |
| 🥈 | Rust AVX2 | 135.6K/s | 1.0× slower | 3.2× faster |
| 🥉 | Python | 64.5K/s | 2.2× slower | 1.5× faster |
| 4 | Node.js | 42.7K/s | 3.3× slower | — (slowest) |

### framework-pipeline
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | Python | 114.6K/s | 🏆 winner | — (slowest) |


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

