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
| compute-mix | 77.12M/s | ⚪ 1.7× slower | ⚪ 1.8× slower | 1.69M/s | WASM near native |
| arithmetic-threshold | 491.50M/s | UNCERTIFIED | UNCERTIFIED | 5.02M/s | not yet work-equivalence-certified (N/work mismatch) |
| six-digit-guess | 36.41M/s | UNCERTIFIED | UNCERTIFIED | 46.0K/s | not yet work-equivalence-certified (N/work mismatch) |
| fibonacci-recursive | 17.2K/s | UNCERTIFIED | UNCERTIFIED | 13.0/s | not yet work-equivalence-certified (N/work mismatch) |
| tower-of-hanoi | 120.62M/s | 🟡 2.1× slower | 🟢 1.1× slower | 98.5K/s | WASM usable |
| hardware-targets | 36.53M/s | UNCERTIFIED | UNCERTIFIED | 3.8K/s | not yet work-equivalence-certified (N/work mismatch) |
| matrix-multiply | 440.09M/s | 🟡 3.4× slower | ⚪ 1.4× slower | 706.2K/s | WASM usable |
| tri-logic | 465.92M/s | 🟡 3.0× slower | 🟡 2.1× slower | 329.9K/s | WASM usable |
| data-query | no WASM build | — | — | 207.9K/s | WASM not built for this lane yet |
| call-chain | 54.37M/s | — | 🟡 5.8× slower | 57.1K/s | WASM 2–10× under Node |
| nbody | 29.09M/s | — | 🟡 4.2× slower | 64.5K/s | WASM 2–10× under Node |
| mandelbrot | 9.08M/s | 🟡 2.6× slower | 🟢 1.5× | 7.5K/s | WASM usable |
| spectral-norm | no WASM build | — | — | not run | WASM not built for this lane yet |

> 🚦 🟢 ≥0.9 (≈native) · ⚪ ≥0.5 (within 2×) · 🟡 ≥0.1 (2–10× slower) · 🔴 ≥0.01 (10–100×) · ⚫ <0.01 (100×+).
> **Ceiling (fastest certified lane):** Deno WebGPU (NVIDIA GeForce RTX 2060) — 1.68B/s on matrix-multiply.

### Memory — heap bytes per operation (the honest metric; lower is better)

> Ranked by **bytes/op**, NOT throughput — these benchmarks measure allocation, so no cross-runtime
> throughput ratio (and no ⚫) is shown. Native Rust/C++ allocate off the GC heap (~0 native — see §2b/§4).

| Benchmark | 🏆 Best (lowest heap B/op) | Node.js | Python | WASM ▶ production | Galerina governed ⟨interp⟩ | Galerina manifest ⟨interp⟩ |
|---|---|---|---|---|---|---|
| record-allocation | **WASM ▶ production** (~0) | 1 B/op | ~0 | ~0 | 6 B/op | 8 B/op |
| collection-pipeline | **WASM ▶ production** (~0) | ~0 | ~0 | ~0 | 16 B/op | 14 B/op |
| low-memory | **Node.js** (~0) | ~0 | ~0 | ~0 | 45 B/op | 42 B/op |
| binary-trees | **Python** (~0) | 3 B/op | ~0 | ~0 | 16 B/op | 12 B/op |

> **No throughput ratio, no ⚫ here** — a memory benchmark ranked by throughput is exactly the
> cross-metric bug this section removes. record-allocation / binary-trees / collection-pipeline live
> here by bytes/op, so they no longer carry the ◇ shape-only marker; their shape rate is in §4.

### GPU — kernel-evals/s (GPU-shaped workload; matrix-multiply dual-homes here)

> Cross-runtime. Deno WebGPU is the only real-dispatch path; where it produced no number on this
> machine it shows **⏳ GPU pending** — the honest status, never a fabricated GPU rate.

| Benchmark | 🏆 Winner | Speed | WASM ▶ production | GPU (Deno WebGPU) | vs Node (WASM) | Implication |
|---|---|---|---|---|---|---|
| gpu-compute | Rust AVX2 | 1.18B/s | 469.64M/s | 3.72M/s | 🟡 2.1× slower | CPU/WASM lanes lead — real GPU dispatch pending (see §4b) |
| matrix-multiply | Deno WebGPU (NVIDIA GeForce RTX 2060) | 1.68B/s | 440.09M/s | 1.68B/s | ⚪ 1.4× slower | real GPU dispatch wins |

> **vs Node (WASM)** compares the WASM ▶ production lane to Node.js on the kernel. matrix-multiply also
> appears in the CPU Throughput table (dual-home) — it has both a compute lane and a WebGPU lane.

### I/O & DevTools — native units per benchmark (raw rate; NOT inner-op normalised)

> Each benchmark has its OWN unit, so there is **no cross-runtime ratio** — the winner is the fastest
> lane by raw rate WITHIN that benchmark's native unit. Comparing rates ACROSS benchmarks is meaningless.

| Benchmark | Unit (native) | 🏆 Fastest lane | Node.js | Python | Rust (generic) | WASM ▶ production | Galerina governed ⟨interp⟩ |
|---|---|---|---|---|---|---|---|
| crypto-ops | ops/s | **Galerina governed ⟨interp⟩** (121.0/s) | no comparable metric | no comparable metric | no comparable metric | no WASM — strings/records | 121.0/s |
| text-html | ops/s | **Galerina governed ⟨interp⟩** (885.0/s) | no comparable metric | no comparable metric | no comparable metric | no WASM — strings/records | 885.0/s |
| json-parse | records/s | **Node.js** (3.18M/s) | 3.18M/s | 486.5K/s | not run — no native impl | no WASM — strings/records | 4.7K/s |
| spore-container | containers/s | **Rust (generic)** (166.6K/s) | 44.0K/s | 65.9K/s | 166.6K/s | no WASM — strings/records | not run |
| framework-pipeline | requests/s | **Python** (108.6K/s) | not run | 108.6K/s | not run — no native impl | no WASM — strings/records | not run |
| http-throughput | requests/s | **Node.js** (3.6K/s) | 3.6K/s | not run | not run — no native impl | no WASM build | not run |
| naming-check | files/s | **Node.js** (7.1K/s) | 7.1K/s | not run | not run — no native impl | no WASM build | not run |
| context-receipt | receipts/s | **Node.js** (18.7K/s) | 18.7K/s | not run | not run — no native impl | no WASM build | not run |
| intelligence-search | queries/s | **Node.js** (109.1K/s) | 109.1K/s | not run | not run — no native impl | no WASM build | not run |
| provenance-trace | files/s | **Node.js** (777.0/s) | 777.0/s | not run | not run — no native impl | no WASM build | not run |

> Values are native rates (records/s, containers/s, requests/s, files/s, …), shown for transparency —
> NOT a cross-runtime ranking. The inner-op-normalised throughput lives in the CPU table above.

### Governance — Galerina-internal tier ratio ONLY (NO native column)

> This table's columns are Galerina tiers ONLY — there is **no rust/node/python/cpp column**, so a
> cross-runtime `N× slower` is structurally impossible here. The old six-figure governance-cost artifact
> came from dividing the governed tier by a native rate — a division this table cannot express.

| Benchmark | Galerina governed ⟨interp⟩ | Galerina manifest ⟨interp⟩ | WASM ▶ production | governed/manifest (gov overhead) |
|---|---|---|---|---|
| governance-cost | 850.0/s | 878.0/s | 3.06M/s | 0.97× governed/manifest (gov overhead ≈ 1.03×) |

> **governed/manifest** is governance-cost's honest headline: the same-N cost of always-on governance
> (capabilities + audit + proof) vs the pre-verified manifest. `gov overhead` = manifest ÷ governed.


### Full Throughput Table (all runtimes)

| Benchmark | Rust AVX-512 | Rust AVX2 | Rust (generic) | C++ | Node.js | Python | Galerina passive ⟨interp⟩ | Galerina manifest ⟨interp⟩ | Galerina governed ⟨interp⟩ | WASM ▶ production | Deno WebGPU (NVIDIA GeForce RTX 2060) | Node/Galerina† (🖥️ CPU) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| compute-mix | not run — no AVX-512 | **129.68M/s** | **131.99M/s** | **132.17M/s** | **135.14M/s** | 772.0K/s | 2.16M/s | 1.75M/s | 1.69M/s | 77.12M/s | not run — no GPU path | 79.8× |
| arithmetic-threshold | not run — no AVX-512 | 1.57B/s | 1.57B/s | **1.88B/s** | 972.90M/s | 3.80M/s | 42.8K/s | 5.08M/s | 5.02M/s | 491.50M/s | not run — no GPU path | 194.0× |
| six-digit-guess | not run — no AVX-512 | 67.02M/s | **78.04M/s** | 68.11M/s | 2.84M/s | 96.9K/s | 15.9K/s | 46.2K/s | 46.0K/s | 36.41M/s | not run — no GPU path | 61.7× |
| record-allocation | not run — no AVX-512 | **1.18B/s** | **1.17B/s** | not run — no C++ impl | 58.35M/s | 4.19M/s | 8.04M/s | 2.57M/s | 2.31M/s | 549.69M/s | not run — no GPU path | 25.2× |
| fibonacci-recursive | not run — no AVX-512 | 495.6/s | 491.2/s | not run — no C++ impl | 126.7/s | 4.5/s | **72.3K/s** | 18.0/s | 13.0/s | 17.2K/s | not run — no GPU path | 9.75× |
| tower-of-hanoi | not run — no AVX-512 | **251.69M/s** | **252.33M/s** | not run — no C++ impl | 127.64M/s | 2.51M/s | 101.6K/s | 99.2K/s | 98.5K/s | 120.62M/s | not run — no GPU path | 1.3K× |
| collection-pipeline | not run — no AVX-512 | **13.27B/s** | 4.32B/s | not run — no C++ impl | 70.00M/s | 10.12M/s | 8.38M/s | 2.43M/s | 2.08M/s | 414.02M/s | not run — no GPU path | 33.6× |
| governance-cost ⚠️ | N/A — excluded | N/A — excluded | N/A — excluded | N/A — excluded | N/A — excluded | N/A — excluded | N/A — excluded | N/A — excluded | N/A — excluded | N/A — excluded | N/A — excluded | ⚠️ excluded — not unit-aligned |
| hardware-targets | not run — no AVX-512 | 1.18M/s | 1.17M/s | not run — no C++ impl | 899.5K/s | not run | 113.2K/s | 4.3K/s | 3.8K/s | **36.53M/s** | not run — no GPU path | 233.9× |
| low-memory | not run — no AVX-512 | **6.08B/s** | 1.35B/s | not run — no C++ impl | 691.71M/s | 3.41M/s | 168.0K/s | 115.5K/s | 154.4K/s | 461.54M/s | not run — no GPU path | 4.5K× |
| gpu-compute | not run — no AVX-512 | **1.18B/s** | **1.18B/s** | not run — no C++ impl | 987.29M/s | 7.46M/s | 373.0K/s | 333.8K/s | 332.9K/s | 469.64M/s | 3.72M/s | 3.0K× |
| matrix-multiply | not run — no AVX-512 | 1.40B/s | 1.51B/s | not run — no C++ impl | 622.20M/s | 8.99M/s | 916.5K/s | 705.1K/s | 706.2K/s | 440.09M/s | **1.68B/s** | 881.1× |
| crypto-ops | not run — no AVX-512 | no comparable metric | no comparable metric | not run — no C++ impl | no comparable metric | no comparable metric | **6.1K/s** | 2.0K/s | 121.0/s | no WASM — strings/records | not run — no GPU path | N/A — no Node.js |
| text-html | not run — no AVX-512 | no comparable metric | no comparable metric | not run — no C++ impl | no comparable metric | no comparable metric | **61.0K/s** | 2.4K/s | 885.0/s | no WASM — strings/records | not run — no GPU path | N/A — no Node.js |
| tri-logic | not run — no AVX-512 | **1.38B/s** | **1.38B/s** | not run — no C++ impl | 990.79M/s | 6.76M/s | 351.0K/s | 320.2K/s | 329.9K/s | 465.92M/s | not run — no GPU path | 3.0K× |
| data-query | not run — no AVX-512 | not run — no native impl | not run — no native impl | not run — no C++ impl | **389.99M/s** | 3.47M/s | 276.4K/s | 213.8K/s | 207.9K/s | no WASM build | not run — no GPU path | 1.9K× |
| call-chain | not run — no AVX-512 | not run — no native impl | not run — no native impl | not run — no C++ impl | **317.43M/s** | 1.76M/s | 59.5K/s | 58.5K/s | 57.1K/s | 54.37M/s | not run — no GPU path | 5.6K× |
| nbody | not run — no AVX-512 | not run — no native impl | not run — no native impl | not run — no C++ impl | **122.98M/s** | 1.19M/s | 65.2K/s | 68.0K/s | 64.5K/s | 29.09M/s | not run — no GPU path | 1.9K× |
| json-parse | not run — no AVX-512 | not run — no native impl | not run — no native impl | not run — no C++ impl | **3.18M/s** | 486.5K/s | 10.1K/s | 5.2K/s | 4.7K/s | no WASM — strings/records | not run — no GPU path | 673.6× |
| mandelbrot | not run — no AVX-512 | **22.85M/s** | **23.38M/s** | not run — no C++ impl | 6.25M/s | 141.3K/s | 7.7K/s | 7.9K/s | 7.5K/s | 9.08M/s | not run — no GPU path | 828.6× |
| spectral-norm | not run — no AVX-512 | **371.92M/s** | **370.50M/s** | not run — no C++ impl | 239.90M/s | 1.79M/s | not run | not run | not run | no WASM build | not run — no GPU path | N/A — no governed ⟨interp⟩ |
| binary-trees | not run — no AVX-512 | 20.10M/s | 20.50M/s | not run — no C++ impl | 80.18M/s | 5.28M/s | 410.3K/s | 370.5K/s | 359.4K/s | **590.74M/s** | not run — no GPU path | 223.1× |
| spore-container | not run — no AVX-512 | **173.7K/s** | **166.6K/s** | not run — no C++ impl | 44.0K/s | 65.9K/s | not run | not run | not run | no WASM — strings/records | not run — no GPU path | N/A — no governed ⟨interp⟩ |
| framework-pipeline | not run — no AVX-512 | not run — no native impl | not run — no native impl | not run — no C++ impl | not run | **108.6K/s** | not run | not run | not run | no WASM — strings/records | not run — no GPU path | N/A — neither ran |
| http-throughput | not run — no AVX-512 | not run — no native impl | not run — no native impl | not run — no C++ impl | no comparable metric | not run | not run | not run | not run | no WASM build | not run — no GPU path | N/A — neither ran |
| naming-check | not run — no AVX-512 | not run — no native impl | not run — no native impl | not run — no C++ impl | no comparable metric | not run | not run | not run | not run | no WASM build | not run — no GPU path | N/A — neither ran |
| context-receipt | not run — no AVX-512 | not run — no native impl | not run — no native impl | not run — no C++ impl | no comparable metric | not run | not run | not run | not run | no WASM build | not run — no GPU path | N/A — neither ran |
| intelligence-search | not run — no AVX-512 | not run — no native impl | not run — no native impl | not run — no C++ impl | no comparable metric | not run | not run | not run | not run | no WASM build | not run — no GPU path | N/A — neither ran |
| provenance-trace | not run — no AVX-512 | not run — no native impl | not run — no native impl | not run — no C++ impl | no comparable metric | not run | not run | not run | not run | no WASM build | not run — no GPU path | N/A — neither ran |

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
| 🥇 | ⚫ | Galerina passive ⟨interp⟩ | -40.18 bytes/op ⚡ ~0 — no boxing | 168.0K/s | — | -402KB |
| 🥈 | 🟢 | Rust AVX2 | 0.00 bytes/op ⚡ ~0 — no boxing | 6.08B/s | — | — |
| 🥉 | 🟢 | Rust (generic) | 0.00 bytes/op ⚡ ~0 — no boxing | 1.35B/s | — | — |
| 4 | 🟢 | Node.js | 0.00 bytes/op ⚡ ~0 — no boxing | 691.71M/s | — | 19KB |
| 5 | ⚪ | WASM ▶ production | 0.00 bytes/op ⚡ ~0 — no boxing | 461.54M/s | — | 44KB |
| 6 | ⚫ | Python | 0.03 bytes/op ⚡ ~0 — no boxing | 3.41M/s | — | 272B |
| 7 | ⚫ | Galerina manifest ⟨interp⟩ | 42 bytes/op ⚠ moderate | 115.5K/s | — | 423KB |
| 8 | ⚫ | Galerina governed ⟨interp⟩ | 45 bytes/op ⚠ moderate | 154.4K/s | — | 454KB |

> **Why this matters:** Every byte allocated is a byte the GC must later collect.
> WASM and the bytecode VM run with zero allocation — ideal for high-throughput governed services.
> The tree-walker's per-node allocation is the primary target of Phases 31-33.


## 2b. General Memory Usage

| Benchmark | Runtime | RSS | Peak RSS | Heap Used | Heap Δ (execution) |
|---|---|---|---|---|---|
| compute-mix | Rust AVX2 | — | — | — | — |
| compute-mix | Rust (generic) | — | — | — | — |
| compute-mix | C++ | — | — | — | — |
| compute-mix | Node.js | 46.8MB | 47.0MB | 5.0MB | 946KB |
| compute-mix | Python | — | — | 3KB | 3KB |
| compute-mix | Galerina passive ⟨interp⟩ | 79.7MB | 79.7MB | 17.1MB | 62KB |
| compute-mix | Galerina manifest ⟨interp⟩ | 75.9MB | 75.9MB | 20.8MB | 4.5MB |
| compute-mix | Galerina governed ⟨interp⟩ | 74.6MB | 74.6MB | 20.5MB | 4.5MB |
| compute-mix | WASM ▶ production | 75.1MB | 75.1MB | 16.3MB | 22KB |
| arithmetic-threshold | Rust AVX2 | — | — | — | — |
| arithmetic-threshold | Rust (generic) | — | — | — | — |
| arithmetic-threshold | C++ | — | — | — | — |
| arithmetic-threshold | Node.js | 48.5MB | 48.7MB | 4.3MB | 212KB |
| arithmetic-threshold | Python | — | — | 4KB | 4KB |
| arithmetic-threshold | Galerina passive ⟨interp⟩ | 81.3MB | 81.3MB | 17.5MB | 37KB |
| arithmetic-threshold | Galerina manifest ⟨interp⟩ | 81.2MB | 81.2MB | 17.5MB | 860KB |
| arithmetic-threshold | Galerina governed ⟨interp⟩ | 81.1MB | 81.1MB | 17.4MB | 862KB |
| arithmetic-threshold | WASM ▶ production | 83.3MB | 83.3MB | 16.9MB | 6KB |
| six-digit-guess | Rust AVX2 | — | — | — | — |
| six-digit-guess | Rust (generic) | — | — | — | — |
| six-digit-guess | C++ | — | — | — | — |
| six-digit-guess | Node.js | 53.2MB | 53.2MB | 5.9MB | 1.2MB |
| six-digit-guess | Python | — | — | 583B | 583B |
| six-digit-guess | Galerina passive ⟨interp⟩ | 81.9MB | 81.9MB | 17.5MB | -2.0MB |
| six-digit-guess | Galerina manifest ⟨interp⟩ | 82.4MB | 82.4MB | 18.0MB | 788KB |
| six-digit-guess | Galerina governed ⟨interp⟩ | 82.1MB | 82.1MB | 18.6MB | 1.7MB |
| six-digit-guess | WASM ▶ production | 83.9MB | 83.9MB | 17.1MB | 1KB |
| record-allocation | Rust AVX2 | — | — | — | — |
| record-allocation | Rust (generic) | — | — | — | — |
| record-allocation | Node.js | 49.3MB | 49.3MB | 4.4MB | 238KB |
| record-allocation | Python | — | — | 492B | 492B |
| record-allocation | Galerina passive ⟨interp⟩ | 82.3MB | 82.3MB | 17.9MB | 167KB |
| record-allocation | Galerina manifest ⟨interp⟩ | 82.3MB | 82.3MB | 17.4MB | 84KB |
| record-allocation | Galerina governed ⟨interp⟩ | 83.1MB | 83.1MB | 17.4MB | 55KB |
| record-allocation | WASM ▶ production | 84.8MB | 84.8MB | 17.7MB | 50KB |
| fibonacci-recursive | Rust AVX2 | — | — | — | — |
| fibonacci-recursive | Rust (generic) | — | — | — | — |
| fibonacci-recursive | Node.js | 47.6MB | 47.6MB | 4.1MB | 5KB |
| fibonacci-recursive | Python | — | — | 464B | 464B |
| fibonacci-recursive | Galerina passive ⟨interp⟩ | 83.1MB | 83.1MB | 19.5MB | 55KB |
| fibonacci-recursive | Galerina manifest ⟨interp⟩ | 83.1MB | 83.1MB | 17.8MB | 241KB |
| fibonacci-recursive | Galerina governed ⟨interp⟩ | 82.8MB | 82.8MB | 18.5MB | 977KB |
| fibonacci-recursive | WASM ▶ production | 84.6MB | 84.6MB | 17.8MB | 3KB |
| tower-of-hanoi | Rust AVX2 | — | — | — | — |
| tower-of-hanoi | Rust (generic) | — | — | — | — |
| tower-of-hanoi | Node.js | 47.7MB | 47.7MB | 4.1MB | 17KB |
| tower-of-hanoi | Python | — | — | 1KB | 1KB |
| tower-of-hanoi | Galerina passive ⟨interp⟩ | 85.7MB | 85.7MB | 22.6MB | 46KB |
| tower-of-hanoi | Galerina manifest ⟨interp⟩ | 84.7MB | 84.7MB | 17.8MB | 1.1MB |
| tower-of-hanoi | Galerina governed ⟨interp⟩ | 84.9MB | 84.9MB | 19.0MB | 2.4MB |
| tower-of-hanoi | WASM ▶ production | 84.7MB | 84.7MB | 17.0MB | 1KB |
| collection-pipeline | Rust AVX2 | — | — | — | — |
| collection-pipeline | Rust (generic) | — | — | — | — |
| collection-pipeline | Node.js | 64.7MB | 64.7MB | 12.3MB | 8.1MB |
| collection-pipeline | Python | — | — | 224B | 224B |
| collection-pipeline | Galerina passive ⟨interp⟩ | 85.6MB | 85.6MB | 17.3MB | 249KB |
| collection-pipeline | Galerina manifest ⟨interp⟩ | 85.6MB | 85.6MB | 16.7MB | 137KB |
| collection-pipeline | Galerina governed ⟨interp⟩ | 87.0MB | 87.0MB | 16.8MB | 163KB |
| collection-pipeline | WASM ▶ production | 88.5MB | 88.5MB | 16.9MB | 24KB |
| governance-cost | Rust AVX2 | — | — | — | — |
| governance-cost | Rust (generic) | — | — | — | — |
| governance-cost | Node.js | 47.6MB | 47.6MB | 4.1MB | 26KB |
| governance-cost | Python | — | — | 272B | 272B |
| governance-cost | Galerina passive ⟨interp⟩ | 86.8MB | 86.8MB | 17.5MB | 430KB |
| governance-cost | Galerina manifest ⟨interp⟩ | 89.1MB | 89.1MB | 17.2MB | 415KB |
| governance-cost | Galerina governed ⟨interp⟩ | 87.2MB | 87.2MB | 17.2MB | 442KB |
| governance-cost | WASM ▶ production | 87.9MB | 87.9MB | 17.1MB | 50KB |
| hardware-targets | Rust AVX2 | — | — | — | — |
| hardware-targets | Rust (generic) | — | — | — | — |
| hardware-targets | Node.js | 49.6MB | 49.6MB | 4.5MB | 394KB |
| hardware-targets | Galerina passive ⟨interp⟩ | 86.1MB | 86.1MB | 18.5MB | 916KB |
| hardware-targets | Galerina manifest ⟨interp⟩ | 86.2MB | 86.2MB | 16.9MB | 73KB |
| hardware-targets | Galerina governed ⟨interp⟩ | 86.1MB | 86.1MB | 17.0MB | 74KB |
| hardware-targets | WASM ▶ production | 88.5MB | 88.5MB | 17.3MB | 85KB |
| low-memory | Rust AVX2 | — | — | — | — |
| low-memory | Rust (generic) | — | — | — | — |
| low-memory | Node.js | 47.7MB | 47.7MB | 4.1MB | 19KB |
| low-memory | Python | — | — | 272B | 272B |
| low-memory | Galerina passive ⟨interp⟩ | 87.4MB | 87.4MB | 17.3MB | -402KB |
| low-memory | Galerina manifest ⟨interp⟩ | 86.2MB | 86.2MB | 17.4MB | 423KB |
| low-memory | Galerina governed ⟨interp⟩ | 86.0MB | 86.0MB | 17.3MB | 454KB |
| low-memory | WASM ▶ production | 88.4MB | 88.4MB | 17.2MB | 44KB |
| gpu-compute | Rust AVX2 | — | — | — | — |
| gpu-compute | Rust (generic) | — | — | — | — |
| gpu-compute | Node.js | 48.1MB | 48.1MB | 4.1MB | 17KB |
| gpu-compute | Python | — | — | 304B | 304B |
| gpu-compute | Galerina passive ⟨interp⟩ | 86.5MB | 86.5MB | 18.3MB | 184KB |
| gpu-compute | Galerina manifest ⟨interp⟩ | 86.5MB | 86.5MB | 17.7MB | 695KB |
| gpu-compute | Galerina governed ⟨interp⟩ | 86.3MB | 86.3MB | 17.8MB | 721KB |
| gpu-compute | WASM ▶ production | 89.1MB | 89.1MB | 17.3MB | 2KB |
| gpu-compute | Deno WebGPU (NVIDIA GeForce RTX 2060) | — | — | — | — |
| matrix-multiply | Rust AVX2 | — | — | — | — |
| matrix-multiply | Rust (generic) | — | — | — | — |
| matrix-multiply | Node.js | 49.7MB | 49.7MB | 4.6MB | 438KB |
| matrix-multiply | Python | — | — | 392B | 392B |
| matrix-multiply | Galerina passive ⟨interp⟩ | 86.3MB | 86.3MB | 17.4MB | -887KB |
| matrix-multiply | Galerina manifest ⟨interp⟩ | 86.3MB | 86.3MB | 18.1MB | 1.0MB |
| matrix-multiply | Galerina governed ⟨interp⟩ | 86.2MB | 86.2MB | 18.0MB | 906KB |
| matrix-multiply | WASM ▶ production | 89.4MB | 89.4MB | 17.3MB | 3KB |
| matrix-multiply | Deno WebGPU (NVIDIA GeForce RTX 2060) | — | — | — | — |
| crypto-ops | Rust AVX2 | — | — | — | — |
| crypto-ops | Rust (generic) | — | — | — | — |
| crypto-ops | Node.js | 63.1MB | 63.1MB | 7.9MB | 2.4MB |
| crypto-ops | Python | — | — | 208B | 208B |
| crypto-ops | Galerina passive ⟨interp⟩ | 86.6MB | 86.6MB | 18.5MB | 657KB |
| crypto-ops | Galerina manifest ⟨interp⟩ | 86.7MB | 86.7MB | 17.4MB | 235KB |
| crypto-ops | Galerina governed ⟨interp⟩ | 86.7MB | 86.7MB | 17.4MB | 325KB |
| text-html | Rust AVX2 | — | — | — | — |
| text-html | Rust (generic) | — | — | — | — |
| text-html | Node.js | — | — | — | 472KB |
| text-html | Python | — | — | 208B | 208B |
| text-html | Galerina passive ⟨interp⟩ | 86.5MB | 86.5MB | 18.0MB | -475KB |
| text-html | Galerina manifest ⟨interp⟩ | 87.6MB | 87.6MB | 17.6MB | 146KB |
| text-html | Galerina governed ⟨interp⟩ | 87.6MB | 87.6MB | 17.7MB | 167KB |
| tri-logic | Rust AVX2 | — | — | — | — |
| tri-logic | Rust (generic) | — | — | — | — |
| tri-logic | Node.js | — | — | — | 344KB |
| tri-logic | Python | — | — | — | — |
| tri-logic | Galerina passive ⟨interp⟩ | 87.6MB | 87.6MB | 18.1MB | 157KB |
| tri-logic | Galerina manifest ⟨interp⟩ | 87.3MB | 87.3MB | 17.9MB | 222KB |
| tri-logic | Galerina governed ⟨interp⟩ | 87.4MB | 87.4MB | 18.4MB | 819KB |
| tri-logic | WASM ▶ production | 91.3MB | 91.3MB | 17.9MB | 1KB |
| data-query | Node.js | — | — | — | 22KB |
| data-query | Python | — | — | — | — |
| data-query | Galerina passive ⟨interp⟩ | 89.9MB | 89.9MB | 20.5MB | 1.1MB |
| data-query | Galerina manifest ⟨interp⟩ | 88.2MB | 88.2MB | 18.2MB | 499KB |
| data-query | Galerina governed ⟨interp⟩ | 88.2MB | 88.2MB | 19.7MB | 2.0MB |
| call-chain | Node.js | 48.4MB | 48.4MB | 4.1MB | 11KB |
| call-chain | Python | — | — | 368B | 368B |
| call-chain | Galerina passive ⟨interp⟩ | 87.6MB | 87.6MB | 21.6MB | 79KB |
| call-chain | Galerina manifest ⟨interp⟩ | 87.6MB | 87.6MB | 19.8MB | 2.1MB |
| call-chain | Galerina governed ⟨interp⟩ | 87.5MB | 87.5MB | 18.8MB | 1.1MB |
| call-chain | WASM ▶ production | 90.9MB | 90.9MB | 18.0MB | 1KB |
| nbody | Node.js | 49.8MB | 49.8MB | 4.2MB | 30KB |
| nbody | Python | — | — | 624B | 624B |
| nbody | Galerina passive ⟨interp⟩ | 90.0MB | 90.0MB | 18.2MB | -1.9MB |
| nbody | Galerina manifest ⟨interp⟩ | 90.0MB | 90.0MB | 18.2MB | 385KB |
| nbody | Galerina governed ⟨interp⟩ | 89.8MB | 89.8MB | 18.3MB | 526KB |
| nbody | WASM ▶ production | 90.1MB | 90.1MB | 18.1MB | 1KB |
| json-parse | Node.js | — | — | — | 255KB |
| json-parse | Python | — | — | 520B | 520B |
| json-parse | Galerina passive ⟨interp⟩ | 95.5MB | 95.5MB | 22.8MB | 411KB |
| json-parse | Galerina manifest ⟨interp⟩ | 89.4MB | 89.4MB | 20.5MB | 2.2MB |
| json-parse | Galerina governed ⟨interp⟩ | 96.7MB | 96.7MB | 19.3MB | 1.5MB |
| mandelbrot | Rust AVX2 | — | — | — | — |
| mandelbrot | Rust (generic) | — | — | — | — |
| mandelbrot | Node.js | 49.8MB | 49.8MB | 4.3MB | 174KB |
| mandelbrot | Python | — | — | 3KB | 3KB |
| mandelbrot | Galerina passive ⟨interp⟩ | 92.1MB | 92.1MB | 19.7MB | 163KB |
| mandelbrot | Galerina manifest ⟨interp⟩ | 92.1MB | 92.1MB | 22.4MB | 4.2MB |
| mandelbrot | Galerina governed ⟨interp⟩ | 91.9MB | 91.9MB | 19.6MB | 1.2MB |
| mandelbrot | WASM ▶ production | 92.7MB | 92.7MB | 18.7MB | 1KB |
| spectral-norm | Rust AVX2 | — | — | — | — |
| spectral-norm | Rust (generic) | — | — | — | — |
| spectral-norm | Node.js | 49.6MB | 49.6MB | 4.4MB | 294KB |
| spectral-norm | Python | — | — | 4KB | 4KB |
| binary-trees | Rust AVX2 | — | — | — | — |
| binary-trees | Rust (generic) | — | — | — | — |
| binary-trees | Node.js | 49.7MB | 49.7MB | 4.6MB | 429KB |
| binary-trees | Python | — | — | 368B | 368B |
| binary-trees | Galerina passive ⟨interp⟩ | 92.2MB | 92.2MB | 18.5MB | -4.1MB |
| binary-trees | Galerina manifest ⟨interp⟩ | 92.2MB | 92.2MB | 19.8MB | 1.6MB |
| binary-trees | Galerina governed ⟨interp⟩ | 92.0MB | 92.0MB | 20.4MB | 2.2MB |
| binary-trees | WASM ▶ production | 93.0MB | 93.0MB | 18.5MB | 2KB |
| spore-container | Rust AVX2 | — | — | — | — |
| spore-container | Rust (generic) | — | — | — | — |
| spore-container | Node.js | 65.6MB | 65.6MB | 9.0MB | 1.7MB |
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
| compute-mix | Node.js | 5.00s | 5.00s | 100% | 135.1K ops/CPU-ms |
| compute-mix | Python | 5.05s | 5.05s | 100% | 772.76 ops/CPU-ms |
| compute-mix | Galerina passive ⟨interp⟩ | 0.3ms | 0.0ms | 0% | — |
| compute-mix | Galerina manifest ⟨interp⟩ | 28.6ms | 47.0ms | 164% | 1.1K ops/CPU-ms |
| compute-mix | Galerina governed ⟨interp⟩ | 29.5ms | 31.0ms | 105% | 1.6K ops/CPU-ms |
| compute-mix | WASM ▶ production | 1.30s | 1.30s | 100% | 77.1K ops/CPU-ms |
| arithmetic-threshold | Rust AVX2 | 12.8ms | — | — | — |
| arithmetic-threshold | Rust (generic) | 12.8ms | — | — | — |
| arithmetic-threshold | C++ | 10.6ms | — | — | — |
| arithmetic-threshold | Node.js | 20.6ms | 47.0ms | 229% | 425.5K ops/CPU-ms |
| arithmetic-threshold | Python | 5.26s | 5.25s | 100% | 3.8K ops/CPU-ms |
| arithmetic-threshold | Galerina passive ⟨interp⟩ | 0.1ms | 0.0ms | 0% | — |
| arithmetic-threshold | Galerina manifest ⟨interp⟩ | 12.4ms | 32.0ms | 257% | 2.0K ops/CPU-ms |
| arithmetic-threshold | Galerina governed ⟨interp⟩ | 12.6ms | 31.0ms | 246% | 2.0K ops/CPU-ms |
| arithmetic-threshold | WASM ▶ production | 1.03s | 1.03s | 100% | 490.8K ops/CPU-ms |
| six-digit-guess | Rust AVX2 | 0.6ms | — | — | — |
| six-digit-guess | Rust (generic) | 0.5ms | — | — | — |
| six-digit-guess | C++ | 0.6ms | — | — | — |
| six-digit-guess | Node.js | 14.8ms | 31.0ms | 209% | 1.4K ops/CPU-ms |
| six-digit-guess | Python | 434.2ms | 437.5ms | 101% | 96.16 ops/CPU-ms |
| six-digit-guess | Galerina passive ⟨interp⟩ | 0.2ms | 0.0ms | 0% | — |
| six-digit-guess | Galerina manifest ⟨interp⟩ | 911.0ms | 938.0ms | 103% | 44.85 ops/CPU-ms |
| six-digit-guess | Galerina governed ⟨interp⟩ | 914.8ms | 999.0ms | 109% | 42.11 ops/CPU-ms |
| six-digit-guess | WASM ▶ production | 1.16s | 1.16s | 100% | 36.4K ops/CPU-ms |
| record-allocation | Rust AVX2 | 8.5ms | — | — | — |
| record-allocation | Rust (generic) | 8.5ms | — | — | — |
| record-allocation | Node.js | 3.4ms | 31.0ms | 904% | 6.5K ops/CPU-ms |
| record-allocation | Python | 47.7ms | 46.9ms | 98% | 4.3K ops/CPU-ms |
| record-allocation | Galerina passive ⟨interp⟩ | 0.2ms | 0.0ms | 0% | — |
| record-allocation | Galerina manifest ⟨interp⟩ | 3.9ms | 0.0ms | 0% | — |
| record-allocation | Galerina governed ⟨interp⟩ | 4.3ms | 31.0ms | 718% | 322.58 ops/CPU-ms |
| record-allocation | WASM ▶ production | 1.00s | 1.02s | 102% | 541.3K ops/CPU-ms |
| fibonacci-recursive | Rust AVX2 | 403.6ms | — | — | — |
| fibonacci-recursive | Rust (generic) | 407.1ms | — | — | — |
| fibonacci-recursive | Node.js | 789.0ms | 797.0ms | 101% | 0.13 ops/CPU-ms |
| fibonacci-recursive | Python | 4.49s | 4.48s | 100% | 0.00 ops/CPU-ms |
| fibonacci-recursive | Galerina passive ⟨interp⟩ | 0.1ms | 0.0ms | 0% | — |
| fibonacci-recursive | Galerina manifest ⟨interp⟩ | 54.8ms | 125.0ms | 228% | 0.01 ops/CPU-ms |
| fibonacci-recursive | Galerina governed ⟨interp⟩ | 76.5ms | 125.0ms | 163% | 0.01 ops/CPU-ms |
| fibonacci-recursive | WASM ▶ production | 1.05s | 1.05s | 100% | 17.19 ops/CPU-ms |
| tower-of-hanoi | Rust AVX2 | 520.8ms | — | — | — |
| tower-of-hanoi | Rust (generic) | 519.4ms | — | — | — |
| tower-of-hanoi | Node.js | 102.7ms | 109.0ms | 106% | 120.2K ops/CPU-ms |
| tower-of-hanoi | Python | 523.2ms | 531.3ms | 102% | 2.5K ops/CPU-ms |
| tower-of-hanoi | Galerina passive ⟨interp⟩ | 0.1ms | 0.0ms | 0% | — |
| tower-of-hanoi | Galerina manifest ⟨interp⟩ | 660.9ms | 735.0ms | 111% | 89.16 ops/CPU-ms |
| tower-of-hanoi | Galerina governed ⟨interp⟩ | 665.5ms | 672.0ms | 101% | 97.52 ops/CPU-ms |
| tower-of-hanoi | WASM ▶ production | 1.09s | 1.08s | 99% | 121.6K ops/CPU-ms |
| collection-pipeline | Rust AVX2 | 75.3ms | — | — | — |
| collection-pipeline | Rust (generic) | 231.7ms | — | — | — |
| collection-pipeline | Node.js | 714.3ms | 719.0ms | 101% | 69.5K ops/CPU-ms |
| collection-pipeline | Python | 4.94s | 4.94s | 100% | 10.1K ops/CPU-ms |
| collection-pipeline | Galerina passive ⟨interp⟩ | 0.3ms | 0.0ms | 0% | — |
| collection-pipeline | Galerina manifest ⟨interp⟩ | 4.1ms | 0.0ms | 0% | — |
| collection-pipeline | Galerina governed ⟨interp⟩ | 4.8ms | 0.0ms | 0% | — |
| collection-pipeline | WASM ▶ production | 1.01s | 1.00s | 99% | 420.0K ops/CPU-ms |
| governance-cost | Rust AVX2 | 12.2ms | — | — | — |
| governance-cost | Rust (generic) | 11.2ms | — | — | — |
| governance-cost | Node.js | 46.9ms | 47.0ms | 100% | — |
| governance-cost | Python | 4.26s | 4.27s | 100% | — |
| governance-cost | Galerina passive ⟨interp⟩ | 1.7ms | 0.0ms | 0% | — |
| governance-cost | Galerina manifest ⟨interp⟩ | 1.1ms | 0.0ms | 0% | — |
| governance-cost | Galerina governed ⟨interp⟩ | 1.2ms | 0.0ms | 0% | — |
| governance-cost | WASM ▶ production | 1.00s | 1.00s | 100% | — |
| hardware-targets | Rust AVX2 | 849.8ms | — | — | — |
| hardware-targets | Rust (generic) | 852.0ms | — | — | — |
| hardware-targets | Node.js | 1.11s | 1.11s | 100% | 901.71 ops/CPU-ms |
| hardware-targets | Galerina passive ⟨interp⟩ | 8.8ms | 0.0ms | 0% | — |
| hardware-targets | Galerina manifest ⟨interp⟩ | 0.2ms | 0.0ms | 0% | — |
| hardware-targets | Galerina governed ⟨interp⟩ | 0.3ms | 0.0ms | 0% | — |
| hardware-targets | WASM ▶ production | 1.00s | 1.01s | 101% | 36.0K ops/CPU-ms |
| low-memory | Rust AVX2 | 164.5ms | — | — | — |
| low-memory | Rust (generic) | 743.0ms | — | — | — |
| low-memory | Node.js | 72.3ms | 62.0ms | 86% | 806.5K ops/CPU-ms |
| low-memory | Python | 2.93s | 2.92s | 100% | 3.4K ops/CPU-ms |
| low-memory | Galerina passive ⟨interp⟩ | 0.6ms | 0.0ms | 0% | — |
| low-memory | Galerina manifest ⟨interp⟩ | 86.6ms | 125.0ms | 144% | 80.00 ops/CPU-ms |
| low-memory | Galerina governed ⟨interp⟩ | 64.8ms | 62.0ms | 96% | 161.29 ops/CPU-ms |
| low-memory | WASM ▶ production | 1.02s | 1.01s | 100% | 463.1K ops/CPU-ms |
| gpu-compute | Rust AVX2 | 4.24s | — | — | — |
| gpu-compute | Rust (generic) | 4.24s | — | — | — |
| gpu-compute | Node.js | 506.4ms | 500.0ms | 99% | 1.00M ops/CPU-ms |
| gpu-compute | Python | 6.70s | 6.69s | 100% | 7.5K ops/CPU-ms |
| gpu-compute | Galerina passive ⟨interp⟩ | 0.2ms | 0.0ms | 0% | — |
| gpu-compute | Galerina manifest ⟨interp⟩ | 299.6ms | 391.0ms | 131% | 255.75 ops/CPU-ms |
| gpu-compute | Galerina governed ⟨interp⟩ | 300.4ms | 344.0ms | 115% | 290.70 ops/CPU-ms |
| gpu-compute | WASM ▶ production | 1.06s | 1.06s | 100% | 470.8K ops/CPU-ms |
| gpu-compute | Deno WebGPU (NVIDIA GeForce RTX 2060) | 26.9ms | — | — | — |
| matrix-multiply | Rust AVX2 | 93.8ms | — | — | — |
| matrix-multiply | Rust (generic) | 86.8ms | — | — | — |
| matrix-multiply | Node.js | 210.7ms | 204.0ms | 97% | 642.5K ops/CPU-ms |
| matrix-multiply | Python | 1.46s | — | — | — |
| matrix-multiply | Galerina passive ⟨interp⟩ | 0.2ms | 0.0ms | 0% | — |
| matrix-multiply | Galerina manifest ⟨interp⟩ | 46.5ms | 140.0ms | 301% | 234.06 ops/CPU-ms |
| matrix-multiply | Galerina governed ⟨interp⟩ | 46.4ms | 94.0ms | 203% | 348.60 ops/CPU-ms |
| matrix-multiply | WASM ▶ production | 1.04s | 1.05s | 100% | 438.2K ops/CPU-ms |
| matrix-multiply | Deno WebGPU (NVIDIA GeForce RTX 2060) | 12.5ms | — | — | — |
| crypto-ops | Galerina passive ⟨interp⟩ | 16.5ms | 31.0ms | 188% | — |
| crypto-ops | Galerina manifest ⟨interp⟩ | 0.5ms | 79.0ms | 15490% | 0.01 ops/CPU-ms |
| crypto-ops | Galerina governed ⟨interp⟩ | 8.2ms | 0.0ms | 0% | — |
| text-html | Galerina passive ⟨interp⟩ | 1.6ms | 0.0ms | 0% | — |
| text-html | Galerina manifest ⟨interp⟩ | 0.4ms | 0.0ms | 0% | — |
| text-html | Galerina governed ⟨interp⟩ | 1.1ms | 0.0ms | 0% | — |
| tri-logic | Rust AVX2 | 433.5ms | — | — | — |
| tri-logic | Rust (generic) | 436.1ms | — | — | — |
| tri-logic | Node.js | 302.8ms | — | — | — |
| tri-logic | Python | 1.77s | — | — | — |
| tri-logic | Galerina passive ⟨interp⟩ | 1.4ms | 0.0ms | 0% | — |
| tri-logic | Galerina manifest ⟨interp⟩ | 937.0ms | 970.0ms | 104% | 309.28 ops/CPU-ms |
| tri-logic | Galerina governed ⟨interp⟩ | 909.4ms | 984.0ms | 108% | 304.88 ops/CPU-ms |
| tri-logic | WASM ▶ production | 1.29s | 1.28s | 99% | 468.4K ops/CPU-ms |
| data-query | Node.js | 128.2ms | — | — | — |
| data-query | Python | 864.6ms | — | — | — |
| data-query | Galerina passive ⟨interp⟩ | 0.7ms | 0.0ms | 0% | — |
| data-query | Galerina manifest ⟨interp⟩ | 46.8ms | 47.0ms | 100% | 212.77 ops/CPU-ms |
| data-query | Galerina governed ⟨interp⟩ | 48.1ms | 94.0ms | 195% | 106.38 ops/CPU-ms |
| call-chain | Node.js | 6.3ms | 15.0ms | 238% | 133.3K ops/CPU-ms |
| call-chain | Python | 568.9ms | 578.1ms | 102% | 1.7K ops/CPU-ms |
| call-chain | Galerina passive ⟨interp⟩ | 0.1ms | 0.0ms | 0% | — |
| call-chain | Galerina manifest ⟨interp⟩ | 854.1ms | 859.0ms | 101% | 58.21 ops/CPU-ms |
| call-chain | Galerina governed ⟨interp⟩ | 875.5ms | 891.0ms | 102% | 56.12 ops/CPU-ms |
| call-chain | WASM ▶ production | 1.84s | 1.81s | 99% | 55.2K ops/CPU-ms |
| nbody | Node.js | 53.3ms | 47.0ms | 88% | 139.4K ops/CPU-ms |
| nbody | Python | 1.38s | — | — | — |
| nbody | Galerina passive ⟨interp⟩ | 0.3ms | 0.0ms | 0% | — |
| nbody | Galerina manifest ⟨interp⟩ | 481.8ms | 546.0ms | 113% | 60.01 ops/CPU-ms |
| nbody | Galerina governed ⟨interp⟩ | 507.8ms | 516.0ms | 102% | 63.50 ops/CPU-ms |
| nbody | WASM ▶ production | 1.13s | 1.13s | 100% | 29.1K ops/CPU-ms |
| json-parse | Galerina passive ⟨interp⟩ | 0.4ms | 0.0ms | 0% | — |
| json-parse | Galerina manifest ⟨interp⟩ | 95.6ms | 157.0ms | 164% | 3.18 ops/CPU-ms |
| json-parse | Galerina governed ⟨interp⟩ | 105.8ms | 157.0ms | 148% | 3.18 ops/CPU-ms |
| mandelbrot | Rust AVX2 | 143.4ms | — | — | — |
| mandelbrot | Rust (generic) | 140.2ms | — | — | — |
| mandelbrot | Node.js | 524.2ms | 547.0ms | 104% | 6.0K ops/CPU-ms |
| mandelbrot | Python | 23.20s | — | — | — |
| mandelbrot | Galerina passive ⟨interp⟩ | 0.2ms | 0.0ms | 0% | — |
| mandelbrot | Galerina manifest ⟨interp⟩ | 2.09s | 2.16s | 103% | 7.60 ops/CPU-ms |
| mandelbrot | Galerina governed ⟨interp⟩ | 2.17s | 2.20s | 101% | 7.44 ops/CPU-ms |
| mandelbrot | WASM ▶ production | 1.81s | 1.81s | 100% | 9.0K ops/CPU-ms |
| spectral-norm | Rust AVX2 | 26.9ms | — | — | — |
| spectral-norm | Rust (generic) | 27.0ms | — | — | — |
| spectral-norm | Node.js | 41.7ms | 47.0ms | 113% | 212.8K ops/CPU-ms |
| spectral-norm | Python | 5.58s | — | — | — |
| binary-trees | Rust AVX2 | 6.8ms | — | — | — |
| binary-trees | Rust (generic) | 6.6ms | — | — | — |
| binary-trees | Node.js | 1.7ms | 0.0ms | 0% | — |
| binary-trees | Python | 25.7ms | 15.6ms | 61% | 8.7K ops/CPU-ms |
| binary-trees | Galerina passive ⟨interp⟩ | 0.2ms | 0.0ms | 0% | — |
| binary-trees | Galerina manifest ⟨interp⟩ | 366.7ms | 453.0ms | 124% | 299.90 ops/CPU-ms |
| binary-trees | Galerina governed ⟨interp⟩ | 378.0ms | 375.0ms | 99% | 362.28 ops/CPU-ms |
| binary-trees | WASM ▶ production | 1.15s | 1.16s | 101% | 587.6K ops/CPU-ms |
| spore-container | Rust AVX2 | 1.73s | — | — | — |
| spore-container | Rust (generic) | 1.80s | — | — | — |
| spore-container | Node.js | 6.82s | 7.89s | 116% | 38.02 ops/CPU-ms |
| spore-container | Python | 1.52s | — | — | — |
| framework-pipeline | Python | 1.84s | — | — | — |
| http-throughput | Node.js | 83.0ms | — | — | — |
| naming-check | Node.js | 436.0ms | — | — | — |
| context-receipt | Node.js | 302.0ms | — | — | — |
| intelligence-search | Node.js | 46.0ms | — | — | — |
| provenance-trace | Node.js | 2.00s | — | — | — |

> **CPU utilisation** = CPU ms ÷ wall ms × 100. Node.js approaches 100% (single-thread JIT). Python may show <100% on Windows where process_time measures differently.

## 4. Per-Benchmark Detail

> **Heap/op** = heap bytes allocated per operation (the fair, workload-attributable memory metric).
> Managed runtimes (Node/Python/Galerina/WASM) report it via a GC'd before/after delta; native Rust/C++
> show **~0 (native)** — no GC-managed heap. `~0` = no measurable per-op allocation (e.g. V8 tagged ints);
> a large positive value (e.g. the Galerina tree-walker boxing a value per AST node) is allocation pressure.

### compute-mix

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Node.js | 135.14M/s | 5.00s | 5.00s | 46.8MB | ~0 | 175.0× | 1.00× |
| 🥈 | 🟢 | C++ | 132.17M/s | 30.00s | — | — | ~0 (native) | 171.2× | 0.98× |
| 🥉 | 🟢 | Rust (generic) | 131.99M/s | 5.00s | — | — | ~0 (native) | 171.0× | 0.98× |
| 4 | 🟢 | Rust AVX2 | 129.68M/s | 5.00s | — | — | ~0 (native) | 168.0× | 0.96× |
| 5 | ⚪ | WASM ▶ production | 77.12M/s | 1.30s | 1.30s | 75.1MB | ~0 | 99.9× | 0.57× |
| 6 | 🔴 | Galerina passive ⟨interp⟩ | 2.16M/s | 0.3ms | 0.0ms | 79.7MB | 85 B/op | 2.79× | 0.02× |
| 7 | 🔴 | Galerina manifest ⟨interp⟩ | 1.75M/s | 28.6ms | 47.0ms | 75.9MB | 90 B/op | 2.26× | 0.01× |
| 8 | 🔴 | Galerina governed ⟨interp⟩ | 1.69M/s | 29.5ms | 31.0ms | 74.6MB | 90 B/op | 2.19× | 0.01× |
| 9 | ⚫ | Python | 772.0K/s | 5.05s | 5.05s | — | ~0 | 1.00× | 0.01× |

> 🧠 **Lowest heap/op:** WASM ▶ production (~0) · **highest:** Galerina manifest ⟨interp⟩ (90 B/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### arithmetic-threshold

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | C++ | 1.88B/s | 10.6ms | — | — | ~0 (native) | 494.8× | 1.93× |
| 🥈 | 🟢 | Rust AVX2 | 1.57B/s | 12.8ms | — | — | ~0 (native) | 412.3× | 1.61× |
| 🥉 | 🟢 | Rust (generic) | 1.57B/s | 12.8ms | — | — | ~0 (native) | 412.0× | 1.61× |
| 4 | 🟢 | Node.js | 972.90M/s | 20.6ms | 47.0ms | 48.5MB | ~0 | 255.8× | 1.00× |
| 5 | ⚪ | WASM ▶ production | 491.50M/s | 1.03s | 1.03s | 83.3MB | ~0 | 129.2× | 0.51× |
| 6 | ⚫ | Galerina manifest ⟨interp⟩ | 5.08M/s | 12.4ms | 32.0ms | 81.2MB | 14 B/op | 1.34× | 0.01× |
| 7 | ⚫ | Galerina governed ⟨interp⟩ | 5.02M/s | 12.6ms | 31.0ms | 81.1MB | 14 B/op | 1.32× | 0.01× |
| 8 | ⚫ | Python | 3.80M/s | 5.26s | 5.25s | — | ~0 | 1.00× | 0.00× |
| 9 | ⚫ | Galerina passive ⟨interp⟩ | 42.8K/s | 0.1ms | 0.0ms | 81.3MB | 12.1 KB/op | 0.01× | 0.00× |

> 🧠 **Lowest heap/op:** WASM ▶ production (~0) · **highest:** Galerina passive ⟨interp⟩ (12.1 KB/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### six-digit-guess

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Rust (generic) | 78.04M/s | 0.5ms | — | — | ~0 (native) | 805.4× | 27.5× |
| 🥈 | 🟢 | C++ | 68.11M/s | 0.6ms | — | — | ~0 (native) | 702.9× | 24.0× |
| 🥉 | 🟢 | Rust AVX2 | 67.02M/s | 0.6ms | — | — | ~0 (native) | 691.7× | 23.6× |
| 4 | 🟢 | WASM ▶ production | 36.41M/s | 1.16s | 1.16s | 83.9MB | ~0 | 375.8× | 12.8× |
| 5 | 🟢 | Node.js | 2.84M/s | 14.8ms | 31.0ms | 53.2MB | 28 B/op | 29.3× | 1.00× |
| 6 | 🔴 | Python | 96.9K/s | 434.2ms | 437.5ms | — | ~0 | 1.00× | 0.03× |
| 7 | 🔴 | Galerina manifest ⟨interp⟩ | 46.2K/s | 911.0ms | 938.0ms | 82.4MB | 19 B/op | 0.48× | 0.02× |
| 8 | 🔴 | Galerina governed ⟨interp⟩ | 46.0K/s | 914.8ms | 999.0ms | 82.1MB | 40 B/op | 0.47× | 0.02× |
| 9 | ⚫ | Galerina passive ⟨interp⟩ | 15.9K/s | 0.2ms | 0.0ms | 81.9MB | -655.0 KB/op | 0.16× | 0.01× |

> 🧠 **Lowest heap/op:** Galerina passive ⟨interp⟩ (-655.0 KB/op) · **highest:** Galerina governed ⟨interp⟩ (40 B/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### record-allocation

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Rust AVX2 | 1.18B/s | 8.5ms | — | — | ~0 (native) | 280.3× | 20.1× |
| 🥈 | 🟢 | Rust (generic) | 1.17B/s | 8.5ms | — | — | ~0 (native) | 280.1× | 20.1× |
| 🥉 | 🟢 | WASM ▶ production | 549.69M/s | 1.00s | 1.02s | 84.8MB | ~0 | 131.1× | 9.42× |
| 4 | 🟢 | Node.js | 58.35M/s | 3.4ms | 31.0ms | 49.3MB | 1 B/op | 13.9× | 1.00× |
| 5 | 🟡 | Galerina passive ⟨interp⟩ | 8.04M/s | 0.2ms | 0.0ms | 82.3MB | 109 B/op | 1.92× | 0.14× |
| 6 | 🔴 | Python | 4.19M/s | 47.7ms | 46.9ms | — | ~0 | 1.00× | 0.07× |
| 7 | 🔴 | Galerina manifest ⟨interp⟩ | 2.57M/s | 3.9ms | 0.0ms | 82.3MB | 8 B/op | 0.61× | 0.04× |
| 8 | 🔴 | Galerina governed ⟨interp⟩ | 2.31M/s | 4.3ms | 31.0ms | 83.1MB | 6 B/op | 0.55× | 0.04× |

> 🧠 **Lowest heap/op:** WASM ▶ production (~0) · **highest:** Galerina passive ⟨interp⟩ (109 B/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### fibonacci-recursive

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Galerina passive ⟨interp⟩ | 72.3K/s | 0.1ms | 0.0ms | 83.1MB | 10.8 KB/op | 16.2K× | 570.1× |
| 🥈 | 🟢 | WASM ▶ production | 17.2K/s | 1.05s | 1.05s | 84.6MB | ~0 | 3.8K× | 135.4× |
| 🥉 | 🟢 | Rust AVX2 | 495.6/s | 403.6ms | — | — | ~0 (native) | 111.1× | 3.91× |
| 4 | 🟢 | Rust (generic) | 491.2/s | 407.1ms | — | — | ~0 (native) | 110.1× | 3.88× |
| 5 | 🟢 | Node.js | 126.7/s | 789.0ms | 797.0ms | 47.6MB | 53 B/op | 28.4× | 1.00× |
| 6 | 🟡 | Galerina manifest ⟨interp⟩ | 18.0/s | 54.8ms | 125.0ms | 83.1MB | 238.4 KB/op | 4.04× | 0.14× |
| 7 | 🟡 | Galerina governed ⟨interp⟩ | 13.0/s | 76.5ms | 125.0ms | 82.8MB | 959.1 KB/op | 2.91× | 0.10× |
| 8 | 🔴 | Python | 4.5/s | 4.49s | 4.48s | — | 23 B/op | 1.00× | 0.04× |

> 🧠 **Lowest heap/op:** WASM ▶ production (~0) · **highest:** Galerina governed ⟨interp⟩ (959.1 KB/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### tower-of-hanoi

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Rust (generic) | 252.33M/s | 519.4ms | — | — | ~0 (native) | 100.7× | 1.98× |
| 🥈 | 🟢 | Rust AVX2 | 251.69M/s | 520.8ms | — | — | ~0 (native) | 100.5× | 1.97× |
| 🥉 | 🟢 | Node.js | 127.64M/s | 102.7ms | 109.0ms | 47.7MB | ~0 | 50.9× | 1.00× |
| 4 | 🟢 | WASM ▶ production | 120.62M/s | 1.09s | 1.08s | 84.7MB | ~0 | 48.1× | 0.95× |
| 5 | 🔴 | Python | 2.51M/s | 523.2ms | 531.3ms | — | ~0 | 1.00× | 0.02× |
| 6 | ⚫ | Galerina passive ⟨interp⟩ | 101.6K/s | 0.1ms | 0.0ms | 85.7MB | 5.7 KB/op | 0.04× | 0.00× |
| 7 | ⚫ | Galerina manifest ⟨interp⟩ | 99.2K/s | 660.9ms | 735.0ms | 84.7MB | 17 B/op | 0.04× | 0.00× |
| 8 | ⚫ | Galerina governed ⟨interp⟩ | 98.5K/s | 665.5ms | 672.0ms | 84.9MB | 37 B/op | 0.04× | 0.00× |

> 🧠 **Lowest heap/op:** WASM ▶ production (~0) · **highest:** Galerina passive ⟨interp⟩ (5.7 KB/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### collection-pipeline

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Rust AVX2 | 13.27B/s | 75.3ms | — | — | ~0 (native) | 1.3K× | 189.6× |
| 🥈 | 🟢 | Rust (generic) | 4.32B/s | 231.7ms | — | — | ~0 (native) | 426.5× | 61.6× |
| 🥉 | 🟢 | WASM ▶ production | 414.02M/s | 1.01s | 1.00s | 88.5MB | ~0 | 40.9× | 5.91× |
| 4 | 🟢 | Node.js | 70.00M/s | 714.3ms | 719.0ms | 64.7MB | ~0 | 6.92× | 1.00× |
| 5 | 🟡 | Python | 10.12M/s | 4.94s | 4.94s | — | ~0 | 1.00× | 0.14× |
| 6 | 🟡 | Galerina passive ⟨interp⟩ | 8.38M/s | 0.3ms | 0.0ms | 85.6MB | 113 B/op | 0.83× | 0.12× |
| 7 | 🔴 | Galerina manifest ⟨interp⟩ | 2.43M/s | 4.1ms | 0.0ms | 85.6MB | 14 B/op | 0.24× | 0.03× |
| 8 | 🔴 | Galerina governed ⟨interp⟩ | 2.08M/s | 4.8ms | 0.0ms | 87.0MB | 16 B/op | 0.21× | 0.03× |

> 🧠 **Lowest heap/op:** WASM ▶ production (~0) · **highest:** Galerina passive ⟨interp⟩ (113 B/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### governance-cost ⚠️ (excluded — not unit-aligned)

> internal governed/manifest ratio — native baseline does no governance; not cross-runtime by design

| Runtime | Raw reported throughput (native unit — **NOT comparable**) | Wall |
|---|---|---|
| Rust AVX2 | 823.00M/s | 12.2ms |
| Rust (generic) | 890.00M/s | 11.2ms |
| Node.js | 2.13M/s | 46.9ms |
| Python | 23.5K/s | 4.26s |
| Galerina passive ⟨interp⟩ | 2.1K/s | 1.7ms |
| Galerina manifest ⟨interp⟩ | 878.0/s | 1.1ms |
| Galerina governed ⟨interp⟩ | 850.0/s | 1.2ms |
| WASM ▶ production | 3.06M/s | 1.00s |

### hardware-targets

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | WASM ▶ production | 36.53M/s | 1.00s | 1.01s | 88.5MB | ~0 | — | 40.6× |
| 🥈 | 🟢 | Rust AVX2 | 1.18M/s | 849.8ms | — | — | ~0 (native) | — | 1.31× |
| 🥉 | 🟢 | Rust (generic) | 1.17M/s | 852.0ms | — | — | ~0 (native) | — | 1.30× |
| 4 | 🟢 | Node.js | 899.5K/s | 1.11s | 1.11s | 49.6MB | ~0 | — | 1.00× |
| 5 | 🟡 | Galerina passive ⟨interp⟩ | 113.2K/s | 8.8ms | 0.0ms | 86.1MB | 916 B/op | — | 0.13× |
| 6 | ⚫ | Galerina manifest ⟨interp⟩ | 4.3K/s | 0.2ms | 0.0ms | 86.2MB | 71.1 KB/op | — | 0.00× |
| 7 | ⚫ | Galerina governed ⟨interp⟩ | 3.8K/s | 0.3ms | 0.0ms | 86.1MB | 71.9 KB/op | — | 0.00× |

> 🧠 **Lowest heap/op:** WASM ▶ production (~0) · **highest:** Galerina governed ⟨interp⟩ (71.9 KB/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### low-memory

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Rust AVX2 | 6.08B/s | 164.5ms | — | — | ~0 | 1.8K× | 8.79× |
| 🥈 | 🟢 | Rust (generic) | 1.35B/s | 743.0ms | — | — | ~0 | 395.0× | 1.95× |
| 🥉 | 🟢 | Node.js | 691.71M/s | 72.3ms | 62.0ms | 47.7MB | ~0 | 203.0× | 1.00× |
| 4 | ⚪ | WASM ▶ production | 461.54M/s | 1.02s | 1.01s | 88.4MB | ~0 | 135.4× | 0.67× |
| 5 | ⚫ | Python | 3.41M/s | 2.93s | 2.92s | — | ~0 | 1.00× | 0.00× |
| 6 | ⚫ | Galerina passive ⟨interp⟩ | 168.0K/s | 0.6ms | 0.0ms | 87.4MB | -4.0 KB/op | 0.05× | 0.00× |
| 7 | ⚫ | Galerina governed ⟨interp⟩ | 154.4K/s | 64.8ms | 62.0ms | 86.0MB | 45 B/op | 0.05× | 0.00× |
| 8 | ⚫ | Galerina manifest ⟨interp⟩ | 115.5K/s | 86.6ms | 125.0ms | 86.2MB | 42 B/op | 0.03× | 0.00× |

> 🧠 **Lowest heap/op:** Galerina passive ⟨interp⟩ (-4.0 KB/op) · **highest:** Galerina governed ⟨interp⟩ (45 B/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### gpu-compute

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Rust AVX2 | 1.18B/s | 4.24s | — | — | ~0 (native) | 158.2× | 1.20× |
| 🥈 | 🟢 | Rust (generic) | 1.18B/s | 4.24s | — | — | ~0 (native) | 157.9× | 1.19× |
| 🥉 | 🟢 | Node.js | 987.29M/s | 506.4ms | 500.0ms | 48.1MB | ~0 | 132.3× | 1.00× |
| 4 | 🟡 | WASM ▶ production | 469.64M/s | 1.06s | 1.06s | 89.1MB | ~0 | 62.9× | 0.48× |
| 5 | ⚫ | Python | 7.46M/s | 6.70s | 6.69s | — | ~0 | 1.00× | 0.01× |
| 6 | ⚫ | Deno WebGPU (NVIDIA GeForce RTX 2060) | 3.72M/s | 26.9ms | — | — | — | 0.50× | 0.00× |
| 7 | ⚫ | Galerina passive ⟨interp⟩ | 373.0K/s | 0.2ms | 0.0ms | 86.5MB | 3.0 KB/op | 0.05× | 0.00× |
| 8 | ⚫ | Galerina manifest ⟨interp⟩ | 333.8K/s | 299.6ms | 391.0ms | 86.5MB | 7 B/op | 0.04× | 0.00× |
| 9 | ⚫ | Galerina governed ⟨interp⟩ | 332.9K/s | 300.4ms | 344.0ms | 86.3MB | 7 B/op | 0.04× | 0.00× |

> 🧠 **Lowest heap/op:** WASM ▶ production (~0) · **highest:** Galerina passive ⟨interp⟩ (3.0 KB/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### matrix-multiply

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Deno WebGPU (NVIDIA GeForce RTX 2060) | 1.68B/s | 12.5ms | — | — | — | 186.5× | 2.69× |
| 🥈 | 🟢 | Rust (generic) | 1.51B/s | 86.8ms | — | — | ~0 (native) | 168.0× | 2.43× |
| 🥉 | 🟢 | Rust AVX2 | 1.40B/s | 93.8ms | — | — | ~0 (native) | 155.5× | 2.25× |
| 4 | 🟢 | Node.js | 622.20M/s | 210.7ms | 204.0ms | 49.7MB | ~0 | 69.2× | 1.00× |
| 5 | ⚪ | WASM ▶ production | 440.09M/s | 1.04s | 1.05s | 89.4MB | ~0 | 49.0× | 0.71× |
| 6 | 🔴 | Python | 8.99M/s | 1.46s | — | — | 8 B/op | 1.00× | 0.01× |
| 7 | ⚫ | Galerina passive ⟨interp⟩ | 916.5K/s | 0.2ms | 0.0ms | 86.3MB | -4.8 KB/op | 0.10× | 0.00× |
| 8 | ⚫ | Galerina governed ⟨interp⟩ | 706.2K/s | 46.4ms | 94.0ms | 86.2MB | 28 B/op | 0.08× | 0.00× |
| 9 | ⚫ | Galerina manifest ⟨interp⟩ | 705.1K/s | 46.5ms | 140.0ms | 86.3MB | 31 B/op | 0.08× | 0.00× |

> 🧠 **Lowest heap/op:** Galerina passive ⟨interp⟩ (-4.8 KB/op) · **highest:** Galerina manifest ⟨interp⟩ (31 B/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### crypto-ops

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Galerina passive ⟨interp⟩ | 6.1K/s | 16.5ms | 31.0ms | 86.6MB | 6.4 KB/op | — | — |
| 🥈 | 🟡 | Galerina manifest ⟨interp⟩ | 2.0K/s | 0.5ms | 79.0ms | 86.7MB | 229.5 KB/op | — | — |
| 🥉 | 🔴 | Galerina governed ⟨interp⟩ | 121.0/s | 8.2ms | 0.0ms | 86.7MB | 318.1 KB/op | — | — |

> 🧠 **Lowest heap/op:** Galerina passive ⟨interp⟩ (6.4 KB/op) · **highest:** Galerina governed ⟨interp⟩ (318.1 KB/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### text-html

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Galerina passive ⟨interp⟩ | 61.0K/s | 1.6ms | 0.0ms | 86.5MB | -4.6 KB/op | — | — |
| 🥈 | 🔴 | Galerina manifest ⟨interp⟩ | 2.4K/s | 0.4ms | 0.0ms | 87.6MB | 142.5 KB/op | — | — |
| 🥉 | 🔴 | Galerina governed ⟨interp⟩ | 885.0/s | 1.1ms | 0.0ms | 87.6MB | 162.6 KB/op | — | — |

> 🧠 **Lowest heap/op:** Galerina passive ⟨interp⟩ (-4.6 KB/op) · **highest:** Galerina governed ⟨interp⟩ (162.6 KB/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### tri-logic

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Rust AVX2 | 1.38B/s | 433.5ms | — | — | ~0 (native) | 204.7× | 1.40× |
| 🥈 | 🟢 | Rust (generic) | 1.38B/s | 436.1ms | — | — | ~0 (native) | 203.5× | 1.39× |
| 🥉 | 🟢 | Node.js | 990.79M/s | 302.8ms | — | — | ~0 | 146.5× | 1.00× |
| 4 | 🟡 | WASM ▶ production | 465.92M/s | 1.29s | 1.28s | 91.3MB | ~0 | 68.9× | 0.47× |
| 5 | ⚫ | Python | 6.76M/s | 1.77s | — | — | — | 1.00× | 0.01× |
| 6 | ⚫ | Galerina passive ⟨interp⟩ | 351.0K/s | 1.4ms | 0.0ms | 87.6MB | 311 B/op | 0.05× | 0.00× |
| 7 | ⚫ | Galerina governed ⟨interp⟩ | 329.9K/s | 909.4ms | 984.0ms | 87.4MB | 3 B/op | 0.05× | 0.00× |
| 8 | ⚫ | Galerina manifest ⟨interp⟩ | 320.2K/s | 937.0ms | 970.0ms | 87.3MB | ~0 | 0.05× | 0.00× |

> 🧠 **Lowest heap/op:** WASM ▶ production (~0) · **highest:** Galerina passive ⟨interp⟩ (311 B/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### data-query

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Node.js | 389.99M/s | 128.2ms | — | — | ~0 | 112.4× | 1.00× |
| 🥈 | ⚫ | Python | 3.47M/s | 864.6ms | — | — | — | 1.00× | 0.01× |
| 🥉 | ⚫ | Galerina passive ⟨interp⟩ | 276.4K/s | 0.7ms | 0.0ms | 89.9MB | 5.3 KB/op | 0.08× | 0.00× |
| 4 | ⚫ | Galerina manifest ⟨interp⟩ | 213.8K/s | 46.8ms | 47.0ms | 88.2MB | 50 B/op | 0.06× | 0.00× |
| 5 | ⚫ | Galerina governed ⟨interp⟩ | 207.9K/s | 48.1ms | 94.0ms | 88.2MB | 197 B/op | 0.06× | 0.00× |

> 🧠 **Lowest heap/op:** Node.js (~0) · **highest:** Galerina passive ⟨interp⟩ (5.3 KB/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### call-chain

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Node.js | 317.43M/s | 6.3ms | 15.0ms | 48.4MB | ~0 | 180.6× | 1.00× |
| 🥈 | 🟡 | WASM ▶ production | 54.37M/s | 1.84s | 1.81s | 90.9MB | ~0 | 30.9× | 0.17× |
| 🥉 | ⚫ | Python | 1.76M/s | 568.9ms | 578.1ms | — | ~0 | 1.00× | 0.01× |
| 4 | ⚫ | Galerina passive ⟨interp⟩ | 59.5K/s | 0.1ms | 0.0ms | 87.6MB | 14.6 KB/op | 0.03× | 0.00× |
| 5 | ⚫ | Galerina manifest ⟨interp⟩ | 58.5K/s | 854.1ms | 859.0ms | 87.6MB | 42 B/op | 0.03× | 0.00× |
| 6 | ⚫ | Galerina governed ⟨interp⟩ | 57.1K/s | 875.5ms | 891.0ms | 87.5MB | 22 B/op | 0.03× | 0.00× |

> 🧠 **Lowest heap/op:** WASM ▶ production (~0) · **highest:** Galerina passive ⟨interp⟩ (14.6 KB/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### nbody

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Node.js | 122.98M/s | 53.3ms | 47.0ms | 49.8MB | ~0 | 103.6× | 1.00× |
| 🥈 | 🟡 | WASM ▶ production | 29.09M/s | 1.13s | 1.13s | 90.1MB | ~0 | 24.5× | 0.24× |
| 🥉 | ⚫ | Python | 1.19M/s | 1.38s | — | — | 12 B/op | 1.00× | 0.01× |
| 4 | ⚫ | Galerina manifest ⟨interp⟩ | 68.0K/s | 481.8ms | 546.0ms | 90.0MB | 12 B/op | 0.06× | 0.00× |
| 5 | ⚫ | Galerina passive ⟨interp⟩ | 65.2K/s | 0.3ms | 0.0ms | 90.0MB | -85.1 KB/op | 0.05× | 0.00× |
| 6 | ⚫ | Galerina governed ⟨interp⟩ | 64.5K/s | 507.8ms | 516.0ms | 89.8MB | 16 B/op | 0.05× | 0.00× |

> 🧠 **Lowest heap/op:** Galerina passive ⟨interp⟩ (-85.1 KB/op) · **highest:** Galerina governed ⟨interp⟩ (16 B/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### json-parse

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Node.js | 3.18M/s | — | — | — | — | 6.54× | 1.00× |
| 🥈 | 🟡 | Python | 486.5K/s | — | — | — | 1 B/op | 1.00× | 0.15× |
| 🥉 | ⚫ | Galerina passive ⟨interp⟩ | 10.1K/s | 0.4ms | 0.0ms | 95.5MB | 108.9 KB/op | 0.02× | 0.00× |
| 4 | ⚫ | Galerina manifest ⟨interp⟩ | 5.2K/s | 95.6ms | 157.0ms | 89.4MB | 4.3 KB/op | 0.01× | 0.00× |
| 5 | ⚫ | Galerina governed ⟨interp⟩ | 4.7K/s | 105.8ms | 157.0ms | 96.7MB | 3.0 KB/op | 0.01× | 0.00× |

> 🧠 **Lowest heap/op:** Python (1 B/op) · **highest:** Galerina passive ⟨interp⟩ (108.9 KB/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### mandelbrot

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Rust (generic) | 23.38M/s | 140.2ms | — | — | ~0 (native) | 165.5× | 3.74× |
| 🥈 | 🟢 | Rust AVX2 | 22.85M/s | 143.4ms | — | — | ~0 (native) | 161.8× | 3.66× |
| 🥉 | 🟢 | WASM ▶ production | 9.08M/s | 1.81s | 1.81s | 92.7MB | ~0 | 64.2× | 1.45× |
| 4 | 🟢 | Node.js | 6.25M/s | 524.2ms | 547.0ms | 49.8MB | ~0 | 44.3× | 1.00× |
| 5 | 🔴 | Python | 141.3K/s | 23.20s | — | — | ~0 | 1.00× | 0.02× |
| 6 | ⚫ | Galerina manifest ⟨interp⟩ | 7.9K/s | 2.09s | 2.16s | 92.1MB | 256 B/op | 0.06× | 0.00× |
| 7 | ⚫ | Galerina passive ⟨interp⟩ | 7.7K/s | 0.2ms | 0.0ms | 92.1MB | 122.5 KB/op | 0.05× | 0.00× |
| 8 | ⚫ | Galerina governed ⟨interp⟩ | 7.5K/s | 2.17s | 2.20s | 91.9MB | 74 B/op | 0.05× | 0.00× |

> 🧠 **Lowest heap/op:** WASM ▶ production (~0) · **highest:** Galerina passive ⟨interp⟩ (122.5 KB/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### spectral-norm

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Rust AVX2 | 371.92M/s | 26.9ms | — | — | ~0 (native) | 207.6× | 1.55× |
| 🥈 | 🟢 | Rust (generic) | 370.50M/s | 27.0ms | — | — | ~0 (native) | 206.8× | 1.54× |
| 🥉 | 🟢 | Node.js | 239.90M/s | 41.7ms | 47.0ms | 49.6MB | ~0 | 133.9× | 1.00× |
| 4 | ⚫ | Python | 1.79M/s | 5.58s | — | — | ~0 | 1.00× | 0.01× |

> 🧠 **Lowest heap/op:** Python (~0) · **highest:** Node.js (~0). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### binary-trees

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | WASM ▶ production | 590.74M/s | 1.15s | 1.16s | 93.0MB | ~0 | 111.8× | 7.37× |
| 🥈 | 🟢 | Node.js | 80.18M/s | 1.7ms | 0.0ms | 49.7MB | 3 B/op | 15.2× | 1.00× |
| 🥉 | 🟡 | Rust (generic) | 20.50M/s | 6.6ms | — | — | ~0 (native) | 3.88× | 0.26× |
| 4 | 🟡 | Rust AVX2 | 20.10M/s | 6.8ms | — | — | ~0 (native) | 3.80× | 0.25× |
| 5 | 🔴 | Python | 5.28M/s | 25.7ms | 15.6ms | — | ~0 | 1.00× | 0.07× |
| 6 | ⚫ | Galerina passive ⟨interp⟩ | 410.3K/s | 0.2ms | 0.0ms | 92.2MB | -64.2 KB/op | 0.08× | 0.01× |
| 7 | ⚫ | Galerina manifest ⟨interp⟩ | 370.5K/s | 366.7ms | 453.0ms | 92.2MB | 12 B/op | 0.07× | 0.00× |
| 8 | ⚫ | Galerina governed ⟨interp⟩ | 359.4K/s | 378.0ms | 375.0ms | 92.0MB | 16 B/op | 0.07× | 0.00× |

> 🧠 **Lowest heap/op:** Galerina passive ⟨interp⟩ (-64.2 KB/op) · **highest:** Galerina governed ⟨interp⟩ (16 B/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### spore-container

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Rust AVX2 | 173.7K/s | 1.73s | — | — | ~0 (native) | 2.63× | 3.95× |
| 🥈 | 🟢 | Rust (generic) | 166.6K/s | 1.80s | — | — | ~0 (native) | 2.53× | 3.78× |
| 🥉 | 🟢 | Python | 65.9K/s | 1.52s | — | — | ~0 | 1.00× | 1.50× |
| 4 | 🟢 | Node.js | 44.0K/s | 6.82s | 7.89s | 65.6MB | 6 B/op | 0.67× | 1.00× |

> 🧠 **Lowest heap/op:** Python (~0) · **highest:** Node.js (6 B/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### framework-pipeline

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Python | 108.6K/s | 1.84s | — | — | ~0 | 1.00× | — |

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
**Compute toolchain:** NVIDIA GeForce RTX 2060 — GPU compute available.
**Deno WebGPU:** ✅ available — real GPU dispatch enabled (NVIDIA GeForce RTX 2060)
**Galerina GPU backend:** `not-implemented` — gpu-plan.ts emits a WGSL skeleton only; no dispatch path (pending Phase 38).

| # | 🚦 | Runtime | Device (🖥️ CPU / 🎮 GPU) | Throughput (kernel ops/s) | Wall | vs Node |
|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Rust AVX2 | 🖥️ CPU (cpu (serial)) | 1.18B/s | 4.24s | 1.20× |
| 🥈 | 🟢 | Rust (generic) | 🖥️ CPU (cpu (serial)) | 1.18B/s | 4.24s | 1.19× |
| 🥉 | 🟢 | Node.js | 🖥️ CPU (cpu (serial)) | 987.29M/s | 506.4ms | 1.00× |
| 4 | 🟡 | WASM ▶ production | 🖥️ CPU (cpu (wasm)) | 469.64M/s | 1.06s | 0.48× |
| 5 | ⚫ | Python | 🖥️ CPU (cpu (serial)) | 7.46M/s | 6.70s | 0.01× |
| 6 | ⚫ | Deno WebGPU (NVIDIA GeForce RTX 2060) | 🎮 GPU (gpu (WebGPU — NVIDIA GeForce RTX 2060)) | 3.72M/s | 26.9ms | 0.00× |
| 7 | ⚫ | Galerina passive ⟨interp⟩ | 🖥️ CPU (cpu) | 373.0K/s | 0.2ms | 0.00× |
| 8 | ⚫ | Galerina manifest ⟨interp⟩ | 🖥️ CPU (cpu) | 333.8K/s | 299.6ms | 0.00× |
| 9 | ⚫ | Galerina governed ⟨interp⟩ | 🖥️ CPU (cpu) | 332.9K/s | 300.4ms | 0.00× |

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

| Benchmark | 🏆 Winner | Rust AVX2 | Rust (generic) | C++ | Node.js | Python | Galerina passive ⟨interp⟩ | Galerina manifest ⟨interp⟩ | Galerina governed ⟨interp⟩ | WASM ▶ production | Deno WebGPU (NVIDIA GeForce RTX 2060) |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **compute-mix** | Node.js | **🏆 winner** | **🏆 winner** | **🏆 winner** | **🏆 winner** | **175× slower** | **63× slower** | **77× slower** | **80× slower** | 2× slower | not run — no GPU path |
| **arithmetic-threshold** | C++ | 1.2× slower | 1.2× slower | **🏆 winner** | 2× slower | **495× slower** | **44.0K× slower** | **370× slower** | **375× slower** | 4× slower | not run — no GPU path |
| **six-digit-guess** | Rust (generic) | 1.2× slower | **🏆 winner** | 1.1× slower | **27× slower** | **805× slower** | **4.9K× slower** | **1.7K× slower** | **1.7K× slower** | 2× slower | not run — no GPU path |
| **record-allocation** | Rust AVX2 | **🏆 winner** | **🏆 winner** | not run — no C++ impl | **20× slower** | **280× slower** | **146× slower** | **457× slower** | **508× slower** | 2× slower | not run — no GPU path |
| **fibonacci-recursive** | Galerina passive ⟨interp⟩ | **146× slower** | **147× slower** | not run — no C++ impl | **570× slower** | **16.2K× slower** | **🏆 winner** | **4.0K× slower** | **5.6K× slower** | 4× slower | not run — no GPU path |
| **tower-of-hanoi** | Rust (generic) | **🏆 winner** | **🏆 winner** | not run — no C++ impl | 2× slower | **101× slower** | **2.5K× slower** | **2.5K× slower** | **2.6K× slower** | 2× slower | not run — no GPU path |
| **collection-pipeline** | Rust AVX2 | **🏆 winner** | 3× slower | not run — no C++ impl | **190× slower** | **1.3K× slower** | **1.6K× slower** | **5.5K× slower** | **6.4K× slower** | **32× slower** | not run — no GPU path |
| **hardware-targets** | WASM ▶ production | **31× slower** | **31× slower** | not run — no C++ impl | **41× slower** | not run | **323× slower** | **8.4K× slower** | **9.5K× slower** | **🏆 winner** | not run — no GPU path |
| **low-memory** | Rust AVX2 | **🏆 winner** | 5× slower | not run — no C++ impl | 9× slower | **1.8K× slower** | **36.2K× slower** | **52.7K× slower** | **39.4K× slower** | **13× slower** | not run — no GPU path |
| **gpu-compute** | Rust AVX2 | **🏆 winner** | **🏆 winner** | not run — no C++ impl | 1.2× slower | **158× slower** | **3.2K× slower** | **3.5K× slower** | **3.5K× slower** | 3× slower | **317× slower** |
| **matrix-multiply** | Deno WebGPU (NVIDIA GeForce RTX 2060) | 1.2× slower | 1.1× slower | not run — no C++ impl | 3× slower | **186× slower** | **1.8K× slower** | **2.4K× slower** | **2.4K× slower** | 4× slower | **🏆 winner** |
| **crypto-ops** | Galerina passive ⟨interp⟩ | no comparable metric | no comparable metric | not run — no C++ impl | no comparable metric | no comparable metric | **🏆 winner** | 3× slower | **50× slower** | no WASM — strings/records | not run — no GPU path |
| **text-html** | Galerina passive ⟨interp⟩ | no comparable metric | no comparable metric | not run — no C++ impl | no comparable metric | no comparable metric | **🏆 winner** | **25× slower** | **69× slower** | no WASM — strings/records | not run — no GPU path |
| **tri-logic** | Rust AVX2 | **🏆 winner** | **🏆 winner** | not run — no C++ impl | 1.4× slower | **205× slower** | **3.9K× slower** | **4.3K× slower** | **4.2K× slower** | 3× slower | not run — no GPU path |
| **data-query** | Node.js | not run — no native impl | not run — no native impl | not run — no C++ impl | **🏆 winner** | **112× slower** | **1.4K× slower** | **1.8K× slower** | **1.9K× slower** | no WASM build | not run — no GPU path |
| **call-chain** | Node.js | not run — no native impl | not run — no native impl | not run — no C++ impl | **🏆 winner** | **181× slower** | **5.3K× slower** | **5.4K× slower** | **5.6K× slower** | 6× slower | not run — no GPU path |
| **nbody** | Node.js | not run — no native impl | not run — no native impl | not run — no C++ impl | **🏆 winner** | **104× slower** | **1.9K× slower** | **1.8K× slower** | **1.9K× slower** | 4× slower | not run — no GPU path |
| **json-parse** | Node.js | not run — no native impl | not run — no native impl | not run — no C++ impl | **🏆 winner** | 7× slower | **316× slower** | **609× slower** | **674× slower** | no WASM — strings/records | not run — no GPU path |
| **mandelbrot** | Rust (generic) | **🏆 winner** | **🏆 winner** | not run — no C++ impl | 4× slower | **165× slower** | **3.0K× slower** | **3.0K× slower** | **3.1K× slower** | 3× slower | not run — no GPU path |
| **spectral-norm** | Rust AVX2 | **🏆 winner** | **🏆 winner** | not run — no C++ impl | 2× slower | **208× slower** | not run | not run | not run | no WASM build | not run — no GPU path |
| **binary-trees** | WASM ▶ production | **29× slower** | **29× slower** | not run — no C++ impl | 7× slower | **112× slower** | **1.4K× slower** | **1.6K× slower** | **1.6K× slower** | **🏆 winner** | not run — no GPU path |
| **spore-container** | Rust AVX2 | **🏆 winner** | **🏆 winner** | not run — no C++ impl | 4× slower | 3× slower | not run | not run | not run | no WASM — strings/records | not run — no GPU path |
| **framework-pipeline** | Python | not run — no native impl | not run — no native impl | not run — no C++ impl | not run | **🏆 winner** | not run | not run | not run | no WASM — strings/records | not run — no GPU path |

> Bold = significantly behind (>10×). A non-numeric cell states why that runtime has no figure (e.g. "not run — no native impl", "errored", "no WASM build") — never a silent blank.
> Fibonacci passive is excluded from 'winner' comparison — LRU cache hit is not a fair race.
> gpu-compute GPU: NVIDIA GeForce RTX 2060 slower than CPU at 100K elements (setup overhead dominates — crossover ~500K elements).

## 7. Per-Benchmark Scoreboard — Winner → Slowest (full spread)

> Every runtime that ran, ranked fastest→slowest, with distance from the winner AND from the slowest.
> ⚠️ **`Galerina passive ⟨interp⟩` figures are LRU cache-HIT rates** (a memoised result for a repeated
> input), **not compute** — flagged `⚠️cache` below. Read the first non-cache row for the real compute winner.

### compute-mix
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | Node.js | 135.14M/s | 🏆 winner | 175× faster |
| 🥈 | C++ | 132.17M/s | 1.0× slower | 171× faster |
| 🥉 | Rust (generic) | 131.99M/s | 1.0× slower | 171× faster |
| 4 | Rust AVX2 | 129.68M/s | 1.0× slower | 168× faster |
| 5 | WASM ▶ production | 77.12M/s | 1.8× slower | 100× faster |
| 6 | Galerina passive ⟨interp⟩ ⚠️cache | 2.16M/s | 63× slower | 2.8× faster |
| 7 | Galerina manifest ⟨interp⟩ | 1.75M/s | 77× slower | 2.3× faster |
| 8 | Galerina governed ⟨interp⟩ | 1.69M/s | 80× slower | 2.2× faster |
| 9 | Python | 772.0K/s | 175× slower | — (slowest) |

### arithmetic-threshold
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | C++ | 1.88B/s | 🏆 winner | 44.0K× faster |
| 🥈 | Rust AVX2 | 1.57B/s | 1.2× slower | 36.6K× faster |
| 🥉 | Rust (generic) | 1.57B/s | 1.2× slower | 36.6K× faster |
| 4 | Node.js | 972.90M/s | 1.9× slower | 22.7K× faster |
| 5 | WASM ▶ production | 491.50M/s | 3.8× slower | 11.5K× faster |
| 6 | Galerina manifest ⟨interp⟩ | 5.08M/s | 370× slower | 119× faster |
| 7 | Galerina governed ⟨interp⟩ | 5.02M/s | 375× slower | 117× faster |
| 8 | Python | 3.80M/s | 495× slower | 89× faster |
| 9 | Galerina passive ⟨interp⟩ ⚠️cache | 42.8K/s | 44.0K× slower | — (slowest) |

### six-digit-guess
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | Rust (generic) | 78.04M/s | 🏆 winner | 4.9K× faster |
| 🥈 | C++ | 68.11M/s | 1.1× slower | 4.3K× faster |
| 🥉 | Rust AVX2 | 67.02M/s | 1.2× slower | 4.2K× faster |
| 4 | WASM ▶ production | 36.41M/s | 2.1× slower | 2.3K× faster |
| 5 | Node.js | 2.84M/s | 27× slower | 178× faster |
| 6 | Python | 96.9K/s | 805× slower | 6.1× faster |
| 7 | Galerina manifest ⟨interp⟩ | 46.2K/s | 1.7K× slower | 2.9× faster |
| 8 | Galerina governed ⟨interp⟩ | 46.0K/s | 1.7K× slower | 2.9× faster |
| 9 | Galerina passive ⟨interp⟩ ⚠️cache | 15.9K/s | 4.9K× slower | — (slowest) |

### record-allocation
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | Rust AVX2 | 1.18B/s | 🏆 winner | 508× faster |
| 🥈 | Rust (generic) | 1.17B/s | 1.0× slower | 507× faster |
| 🥉 | WASM ▶ production | 549.69M/s | 2.1× slower | 237× faster |
| 4 | Node.js | 58.35M/s | 20× slower | 25× faster |
| 5 | Galerina passive ⟨interp⟩ ⚠️cache | 8.04M/s | 146× slower | 3.5× faster |
| 6 | Python | 4.19M/s | 280× slower | 1.8× faster |
| 7 | Galerina manifest ⟨interp⟩ | 2.57M/s | 457× slower | 1.1× faster |
| 8 | Galerina governed ⟨interp⟩ | 2.31M/s | 508× slower | — (slowest) |

### fibonacci-recursive
> 🏆 cache-hit "winner" is Galerina passive (memoised); **real compute winner: WASM ▶ production at 17.2K/s**.
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | Galerina passive ⟨interp⟩ ⚠️cache | 72.3K/s | 🏆 winner | 16.2K× faster |
| 🥈 | WASM ▶ production | 17.2K/s | 4.2× slower | 3.8K× faster |
| 🥉 | Rust AVX2 | 495.6/s | 146× slower | 111× faster |
| 4 | Rust (generic) | 491.2/s | 147× slower | 110× faster |
| 5 | Node.js | 126.7/s | 570× slower | 28× faster |
| 6 | Galerina manifest ⟨interp⟩ | 18.0/s | 4.0K× slower | 4.0× faster |
| 7 | Galerina governed ⟨interp⟩ | 13.0/s | 5.6K× slower | 2.9× faster |
| 8 | Python | 4.5/s | 16.2K× slower | — (slowest) |

### tower-of-hanoi
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | Rust (generic) | 252.33M/s | 🏆 winner | 2.6K× faster |
| 🥈 | Rust AVX2 | 251.69M/s | 1.0× slower | 2.6K× faster |
| 🥉 | Node.js | 127.64M/s | 2.0× slower | 1.3K× faster |
| 4 | WASM ▶ production | 120.62M/s | 2.1× slower | 1.2K× faster |
| 5 | Python | 2.51M/s | 101× slower | 25× faster |
| 6 | Galerina passive ⟨interp⟩ ⚠️cache | 101.6K/s | 2.5K× slower | 1.0× faster |
| 7 | Galerina manifest ⟨interp⟩ | 99.2K/s | 2.5K× slower | 1.0× faster |
| 8 | Galerina governed ⟨interp⟩ | 98.5K/s | 2.6K× slower | — (slowest) |

### collection-pipeline
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | Rust AVX2 | 13.27B/s | 🏆 winner | 6.4K× faster |
| 🥈 | Rust (generic) | 4.32B/s | 3.1× slower | 2.1K× faster |
| 🥉 | WASM ▶ production | 414.02M/s | 32× slower | 199× faster |
| 4 | Node.js | 70.00M/s | 190× slower | 34× faster |
| 5 | Python | 10.12M/s | 1.3K× slower | 4.9× faster |
| 6 | Galerina passive ⟨interp⟩ ⚠️cache | 8.38M/s | 1.6K× slower | 4.0× faster |
| 7 | Galerina manifest ⟨interp⟩ | 2.43M/s | 5.5K× slower | 1.2× faster |
| 8 | Galerina governed ⟨interp⟩ | 2.08M/s | 6.4K× slower | — (slowest) |

### hardware-targets
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | WASM ▶ production | 36.53M/s | 🏆 winner | 9.5K× faster |
| 🥈 | Rust AVX2 | 1.18M/s | 31× slower | 306× faster |
| 🥉 | Rust (generic) | 1.17M/s | 31× slower | 305× faster |
| 4 | Node.js | 899.5K/s | 41× slower | 234× faster |
| 5 | Galerina passive ⟨interp⟩ ⚠️cache | 113.2K/s | 323× slower | 29× faster |
| 6 | Galerina manifest ⟨interp⟩ | 4.3K/s | 8.4K× slower | 1.1× faster |
| 7 | Galerina governed ⟨interp⟩ | 3.8K/s | 9.5K× slower | — (slowest) |

### low-memory
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | Rust AVX2 | 6.08B/s | 🏆 winner | 52.7K× faster |
| 🥈 | Rust (generic) | 1.35B/s | 4.5× slower | 11.7K× faster |
| 🥉 | Node.js | 691.71M/s | 8.8× slower | 6.0K× faster |
| 4 | WASM ▶ production | 461.54M/s | 13× slower | 4.0K× faster |
| 5 | Python | 3.41M/s | 1.8K× slower | 30× faster |
| 6 | Galerina passive ⟨interp⟩ ⚠️cache | 168.0K/s | 36.2K× slower | 1.5× faster |
| 7 | Galerina governed ⟨interp⟩ | 154.4K/s | 39.4K× slower | 1.3× faster |
| 8 | Galerina manifest ⟨interp⟩ | 115.5K/s | 52.7K× slower | — (slowest) |

### gpu-compute
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | Rust AVX2 | 1.18B/s | 🏆 winner | 3.5K× faster |
| 🥈 | Rust (generic) | 1.18B/s | 1.0× slower | 3.5K× faster |
| 🥉 | Node.js | 987.29M/s | 1.2× slower | 3.0K× faster |
| 4 | WASM ▶ production | 469.64M/s | 2.5× slower | 1.4K× faster |
| 5 | Python | 7.46M/s | 158× slower | 22× faster |
| 6 | Deno WebGPU (NVIDIA GeForce RTX 2060) | 3.72M/s | 317× slower | 11× faster |
| 7 | Galerina passive ⟨interp⟩ ⚠️cache | 373.0K/s | 3.2K× slower | 1.1× faster |
| 8 | Galerina manifest ⟨interp⟩ | 333.8K/s | 3.5K× slower | 1.0× faster |
| 9 | Galerina governed ⟨interp⟩ | 332.9K/s | 3.5K× slower | — (slowest) |

### matrix-multiply
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | Deno WebGPU (NVIDIA GeForce RTX 2060) | 1.68B/s | 🏆 winner | 2.4K× faster |
| 🥈 | Rust (generic) | 1.51B/s | 1.1× slower | 2.1K× faster |
| 🥉 | Rust AVX2 | 1.40B/s | 1.2× slower | 2.0K× faster |
| 4 | Node.js | 622.20M/s | 2.7× slower | 882× faster |
| 5 | WASM ▶ production | 440.09M/s | 3.8× slower | 624× faster |
| 6 | Python | 8.99M/s | 186× slower | 13× faster |
| 7 | Galerina passive ⟨interp⟩ ⚠️cache | 916.5K/s | 1.8K× slower | 1.3× faster |
| 8 | Galerina governed ⟨interp⟩ | 706.2K/s | 2.4K× slower | 1.0× faster |
| 9 | Galerina manifest ⟨interp⟩ | 705.1K/s | 2.4K× slower | — (slowest) |

### crypto-ops
> 🏆 cache-hit "winner" is Galerina passive (memoised); **real compute winner: Galerina manifest ⟨interp⟩ at 2.0K/s**.
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | Galerina passive ⟨interp⟩ ⚠️cache | 6.1K/s | 🏆 winner | 50× faster |
| 🥈 | Galerina manifest ⟨interp⟩ | 2.0K/s | 3.1× slower | 16× faster |
| 🥉 | Galerina governed ⟨interp⟩ | 121.0/s | 50× slower | — (slowest) |

### text-html
> 🏆 cache-hit "winner" is Galerina passive (memoised); **real compute winner: Galerina manifest ⟨interp⟩ at 2.4K/s**.
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | Galerina passive ⟨interp⟩ ⚠️cache | 61.0K/s | 🏆 winner | 69× faster |
| 🥈 | Galerina manifest ⟨interp⟩ | 2.4K/s | 25× slower | 2.8× faster |
| 🥉 | Galerina governed ⟨interp⟩ | 885.0/s | 69× slower | — (slowest) |

### tri-logic
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | Rust AVX2 | 1.38B/s | 🏆 winner | 4.3K× faster |
| 🥈 | Rust (generic) | 1.38B/s | 1.0× slower | 4.3K× faster |
| 🥉 | Node.js | 990.79M/s | 1.4× slower | 3.1K× faster |
| 4 | WASM ▶ production | 465.92M/s | 3.0× slower | 1.5K× faster |
| 5 | Python | 6.76M/s | 205× slower | 21× faster |
| 6 | Galerina passive ⟨interp⟩ ⚠️cache | 351.0K/s | 3.9K× slower | 1.1× faster |
| 7 | Galerina governed ⟨interp⟩ | 329.9K/s | 4.2K× slower | 1.0× faster |
| 8 | Galerina manifest ⟨interp⟩ | 320.2K/s | 4.3K× slower | — (slowest) |

### data-query
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | Node.js | 389.99M/s | 🏆 winner | 1.9K× faster |
| 🥈 | Python | 3.47M/s | 112× slower | 17× faster |
| 🥉 | Galerina passive ⟨interp⟩ ⚠️cache | 276.4K/s | 1.4K× slower | 1.3× faster |
| 4 | Galerina manifest ⟨interp⟩ | 213.8K/s | 1.8K× slower | 1.0× faster |
| 5 | Galerina governed ⟨interp⟩ | 207.9K/s | 1.9K× slower | — (slowest) |

### call-chain
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | Node.js | 317.43M/s | 🏆 winner | 5.6K× faster |
| 🥈 | WASM ▶ production | 54.37M/s | 5.8× slower | 952× faster |
| 🥉 | Python | 1.76M/s | 181× slower | 31× faster |
| 4 | Galerina passive ⟨interp⟩ ⚠️cache | 59.5K/s | 5.3K× slower | 1.0× faster |
| 5 | Galerina manifest ⟨interp⟩ | 58.5K/s | 5.4K× slower | 1.0× faster |
| 6 | Galerina governed ⟨interp⟩ | 57.1K/s | 5.6K× slower | — (slowest) |

### nbody
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | Node.js | 122.98M/s | 🏆 winner | 1.9K× faster |
| 🥈 | WASM ▶ production | 29.09M/s | 4.2× slower | 451× faster |
| 🥉 | Python | 1.19M/s | 104× slower | 18× faster |
| 4 | Galerina manifest ⟨interp⟩ | 68.0K/s | 1.8K× slower | 1.1× faster |
| 5 | Galerina passive ⟨interp⟩ ⚠️cache | 65.2K/s | 1.9K× slower | 1.0× faster |
| 6 | Galerina governed ⟨interp⟩ | 64.5K/s | 1.9K× slower | — (slowest) |

### json-parse
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | Node.js | 3.18M/s | 🏆 winner | 674× faster |
| 🥈 | Python | 486.5K/s | 6.5× slower | 103× faster |
| 🥉 | Galerina passive ⟨interp⟩ ⚠️cache | 10.1K/s | 316× slower | 2.1× faster |
| 4 | Galerina manifest ⟨interp⟩ | 5.2K/s | 609× slower | 1.1× faster |
| 5 | Galerina governed ⟨interp⟩ | 4.7K/s | 674× slower | — (slowest) |

### mandelbrot
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | Rust (generic) | 23.38M/s | 🏆 winner | 3.1K× faster |
| 🥈 | Rust AVX2 | 22.85M/s | 1.0× slower | 3.0K× faster |
| 🥉 | WASM ▶ production | 9.08M/s | 2.6× slower | 1.2K× faster |
| 4 | Node.js | 6.25M/s | 3.7× slower | 829× faster |
| 5 | Python | 141.3K/s | 165× slower | 19× faster |
| 6 | Galerina manifest ⟨interp⟩ | 7.9K/s | 3.0K× slower | 1.0× faster |
| 7 | Galerina passive ⟨interp⟩ ⚠️cache | 7.7K/s | 3.0K× slower | 1.0× faster |
| 8 | Galerina governed ⟨interp⟩ | 7.5K/s | 3.1K× slower | — (slowest) |

### spectral-norm
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | Rust AVX2 | 371.92M/s | 🏆 winner | 208× faster |
| 🥈 | Rust (generic) | 370.50M/s | 1.0× slower | 207× faster |
| 🥉 | Node.js | 239.90M/s | 1.6× slower | 134× faster |
| 4 | Python | 1.79M/s | 208× slower | — (slowest) |

### binary-trees
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | WASM ▶ production | 590.74M/s | 🏆 winner | 1.6K× faster |
| 🥈 | Node.js | 80.18M/s | 7.4× slower | 223× faster |
| 🥉 | Rust (generic) | 20.50M/s | 29× slower | 57× faster |
| 4 | Rust AVX2 | 20.10M/s | 29× slower | 56× faster |
| 5 | Python | 5.28M/s | 112× slower | 15× faster |
| 6 | Galerina passive ⟨interp⟩ ⚠️cache | 410.3K/s | 1.4K× slower | 1.1× faster |
| 7 | Galerina manifest ⟨interp⟩ | 370.5K/s | 1.6K× slower | 1.0× faster |
| 8 | Galerina governed ⟨interp⟩ | 359.4K/s | 1.6K× slower | — (slowest) |

### spore-container
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | Rust AVX2 | 173.7K/s | 🏆 winner | 3.9× faster |
| 🥈 | Rust (generic) | 166.6K/s | 1.0× slower | 3.8× faster |
| 🥉 | Python | 65.9K/s | 2.6× slower | 1.5× faster |
| 4 | Node.js | 44.0K/s | 3.9× slower | — (slowest) |

### framework-pipeline
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | Python | 108.6K/s | 🏆 winner | — (slowest) |


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

