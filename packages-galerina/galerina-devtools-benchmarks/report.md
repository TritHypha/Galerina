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
| compute-mix | 77.19M/s | ⚪ 1.7× slower | ⚪ 1.7× slower | 1.67M/s | WASM near native |
| arithmetic-threshold | 488.53M/s | UNCERTIFIED | UNCERTIFIED | 5.28M/s | not yet work-equivalence-certified (N/work mismatch) |
| six-digit-guess | 36.41M/s | UNCERTIFIED | UNCERTIFIED | 41.5K/s | not yet work-equivalence-certified (N/work mismatch) |
| fibonacci-recursive | 17.0K/s | UNCERTIFIED | UNCERTIFIED | 12.0/s | not yet work-equivalence-certified (N/work mismatch) |
| tower-of-hanoi | 120.64M/s | 🟡 2.1× slower | 🟢 1.1× slower | 98.8K/s | WASM usable |
| hardware-targets | 37.05M/s | UNCERTIFIED | UNCERTIFIED | 3.7K/s | not yet work-equivalence-certified (N/work mismatch) |
| matrix-multiply | 439.24M/s | 🟡 3.4× slower | ⚪ 1.4× slower | 717.5K/s | WASM usable |
| tri-logic | 462.81M/s | 🟡 3.0× slower | 🟡 2.1× slower | 325.4K/s | WASM usable |
| data-query | no WASM build | — | — | 204.8K/s | WASM not built for this lane yet |
| call-chain | 53.92M/s | — | 🟡 5.1× slower | 56.3K/s | WASM 2–10× under Node |
| nbody | 28.89M/s | — | 🟡 4.2× slower | 63.6K/s | WASM 2–10× under Node |
| mandelbrot | 8.98M/s | 🟡 2.6× slower | 🟢 1.4× | 7.5K/s | WASM usable |
| spectral-norm | no WASM build | — | — | not run | WASM not built for this lane yet |

> 🚦 🟢 ≥0.9 (≈native) · ⚪ ≥0.5 (within 2×) · 🟡 ≥0.1 (2–10× slower) · 🔴 ≥0.01 (10–100×) · ⚫ <0.01 (100×+).
> **Ceiling (fastest certified lane):** Deno WebGPU (NVIDIA GeForce RTX 2060) — 1.79B/s on matrix-multiply.

### Memory — heap bytes per operation (the honest metric; lower is better)

> Ranked by **bytes/op**, NOT throughput — these benchmarks measure allocation, so no cross-runtime
> throughput ratio (and no ⚫) is shown. Native Rust/C++ allocate off the GC heap (~0 native — see §2b/§4).

| Benchmark | 🏆 Best (lowest heap B/op) | Node.js | Python | WASM ▶ production | Galerina governed ⟨interp⟩ | Galerina manifest ⟨interp⟩ |
|---|---|---|---|---|---|---|
| record-allocation | **WASM ▶ production** (~0) | ~0 | ~0 | ~0 | 6 B/op | 9 B/op |
| collection-pipeline | **WASM ▶ production** (~0) | ~0 | ~0 | ~0 | 17 B/op | 14 B/op |
| low-memory | **Node.js** (~0) | ~0 | ~0 | ~0 | 62 B/op | 45 B/op |
| binary-trees | **Python** (~0) | 3 B/op | ~0 | ~0 | 7 B/op | 12 B/op |

> **No throughput ratio, no ⚫ here** — a memory benchmark ranked by throughput is exactly the
> cross-metric bug this section removes. record-allocation / binary-trees / collection-pipeline live
> here by bytes/op, so they no longer carry the ◇ shape-only marker; their shape rate is in §4.

### GPU — kernel-evals/s (GPU-shaped workload; matrix-multiply dual-homes here)

> Cross-runtime. Deno WebGPU is the only real-dispatch path; where it produced no number on this
> machine it shows **⏳ GPU pending** — the honest status, never a fabricated GPU rate.

| Benchmark | 🏆 Winner | Speed | WASM ▶ production | GPU (Deno WebGPU) | vs Node (WASM) | Implication |
|---|---|---|---|---|---|---|
| gpu-compute | Rust AVX2 | 1.18B/s | 469.73M/s | 4.09M/s | 🟡 2.1× slower | CPU/WASM lanes lead — real GPU dispatch pending (see §4b) |
| matrix-multiply | Deno WebGPU (NVIDIA GeForce RTX 2060) | 1.79B/s | 439.24M/s | 1.79B/s | ⚪ 1.4× slower | real GPU dispatch wins |

> **vs Node (WASM)** compares the WASM ▶ production lane to Node.js on the kernel. matrix-multiply also
> appears in the CPU Throughput table (dual-home) — it has both a compute lane and a WebGPU lane.

### I/O & DevTools — native units per benchmark (raw rate; NOT inner-op normalised)

> Each benchmark has its OWN unit, so there is **no cross-runtime ratio** — the winner is the fastest
> lane by raw rate WITHIN that benchmark's native unit. Comparing rates ACROSS benchmarks is meaningless.

| Benchmark | Unit (native) | 🏆 Fastest lane | Node.js | Python | Rust (generic) | WASM ▶ production | Galerina governed ⟨interp⟩ |
|---|---|---|---|---|---|---|---|
| crypto-ops | ops/s | **Galerina governed ⟨interp⟩** (171.0/s) | no comparable metric | no comparable metric | no comparable metric | no WASM — strings/records | 171.0/s |
| text-html | ops/s | **Galerina governed ⟨interp⟩** (870.0/s) | no comparable metric | no comparable metric | no comparable metric | no WASM — strings/records | 870.0/s |
| json-parse | records/s | **Node.js** (3.38M/s) | 3.38M/s | 443.5K/s | not run — no native impl | no WASM — strings/records | 5.6K/s |
| spore-container | containers/s | **Rust (generic)** (162.6K/s) | 45.5K/s | 64.1K/s | 162.6K/s | no WASM — strings/records | not run |
| framework-pipeline | requests/s | **Python** (106.8K/s) | not run | 106.8K/s | not run — no native impl | no WASM — strings/records | not run |
| http-throughput | requests/s | **Node.js** (3.7K/s) | 3.7K/s | not run | not run — no native impl | no WASM build | not run |
| naming-check | files/s | **Node.js** (7.2K/s) | 7.2K/s | not run | not run — no native impl | no WASM build | not run |
| context-receipt | receipts/s | **Node.js** (18.1K/s) | 18.1K/s | not run | not run — no native impl | no WASM build | not run |
| intelligence-search | queries/s | **Node.js** (108.0K/s) | 108.0K/s | not run | not run — no native impl | no WASM build | not run |
| provenance-trace | files/s | **Node.js** (780.0/s) | 780.0/s | not run | not run — no native impl | no WASM build | not run |

> Values are native rates (records/s, containers/s, requests/s, files/s, …), shown for transparency —
> NOT a cross-runtime ranking. The inner-op-normalised throughput lives in the CPU table above.

### Governance — Galerina-internal tier ratio ONLY (NO native column)

> This table's columns are Galerina tiers ONLY — there is **no rust/node/python/cpp column**, so a
> cross-runtime `N× slower` is structurally impossible here. The old six-figure governance-cost artifact
> came from dividing the governed tier by a native rate — a division this table cannot express.

| Benchmark | Galerina governed ⟨interp⟩ | Galerina manifest ⟨interp⟩ | WASM ▶ production | governed/manifest (gov overhead) |
|---|---|---|---|---|
| governance-cost | 680.0/s | 754.0/s | 2.84M/s | 0.90× governed/manifest (gov overhead ≈ 1.11×) |

> **governed/manifest** is governance-cost's honest headline: the same-N cost of always-on governance
> (capabilities + audit + proof) vs the pre-verified manifest. `gov overhead` = manifest ÷ governed.


### Full Throughput Table (all runtimes)

| Benchmark | Rust AVX-512 | Rust AVX2 | Rust (generic) | C++ | Node.js | Python | Galerina passive ⟨interp⟩ | Galerina manifest ⟨interp⟩ | Galerina governed ⟨interp⟩ | WASM ▶ production | Deno WebGPU (NVIDIA GeForce RTX 2060) | Node/Galerina† (🖥️ CPU) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| compute-mix | not run — no AVX-512 | **129.61M/s** | **130.65M/s** | not run — no C++ impl | **134.71M/s** | 714.7K/s | 2.25M/s | 1.81M/s | 1.67M/s | 77.19M/s | not run — no GPU path | 80.6× |
| arithmetic-threshold | not run — no AVX-512 | **1.56B/s** | **1.56B/s** | not run — no C++ impl | 975.45M/s | 3.82M/s | 28.6K/s | 5.34M/s | 5.28M/s | 488.53M/s | not run — no GPU path | 184.8× |
| six-digit-guess | not run — no AVX-512 | 65.23M/s | **78.07M/s** | not run — no C++ impl | 2.79M/s | 94.0K/s | 22.4K/s | 49.3K/s | 41.5K/s | 36.41M/s | not run — no GPU path | 67.2× |
| record-allocation | not run — no AVX-512 | 944.81M/s | **1.17B/s** | not run — no C++ impl | 56.02M/s | 2.93M/s | 8.43M/s | 2.64M/s | 2.38M/s | 551.83M/s | not run — no GPU path | 23.5× |
| fibonacci-recursive | not run — no AVX-512 | 498.3/s | 499.2/s | not run — no C++ impl | 126.8/s | 4.2/s | **51.7K/s** | 17.0/s | 12.0/s | 17.0K/s | not run — no GPU path | 10.6× |
| tower-of-hanoi | not run — no AVX-512 | **251.93M/s** | **251.71M/s** | not run — no C++ impl | 129.72M/s | 2.59M/s | 100.3K/s | 98.9K/s | 98.8K/s | 120.64M/s | not run — no GPU path | 1.3K× |
| collection-pipeline | not run — no AVX-512 | **13.10B/s** | 4.29B/s | not run — no C++ impl | 69.82M/s | 12.86M/s | 8.15M/s | 1.95M/s | 2.30M/s | 416.11M/s | not run — no GPU path | 30.3× |
| governance-cost ⚠️ | N/A — excluded | N/A — excluded | N/A — excluded | N/A — excluded | N/A — excluded | N/A — excluded | N/A — excluded | N/A — excluded | N/A — excluded | N/A — excluded | N/A — excluded | ⚠️ excluded — not unit-aligned |
| hardware-targets | not run — no AVX-512 | 1.17M/s | 1.17M/s | not run — no C++ impl | 908.3K/s | not run | 69.3K/s | 3.1K/s | 3.7K/s | **37.05M/s** | not run — no GPU path | 245.2× |
| low-memory | not run — no AVX-512 | **6.16B/s** | 1.35B/s | not run — no C++ impl | 715.22M/s | 2.99M/s | 164.3K/s | 119.8K/s | 151.3K/s | 466.90M/s | not run — no GPU path | 4.7K× |
| gpu-compute | not run — no AVX-512 | **1.18B/s** | **1.18B/s** | not run — no C++ impl | 985.65M/s | 6.63M/s | 378.0K/s | 330.4K/s | 328.1K/s | 469.73M/s | 4.09M/s | 3.0K× |
| matrix-multiply | not run — no AVX-512 | 1.40B/s | 1.51B/s | not run — no C++ impl | 617.52M/s | 6.61M/s | 871.0K/s | 656.0K/s | 717.5K/s | 439.24M/s | **1.79B/s** | 860.7× |
| crypto-ops | not run — no AVX-512 | no comparable metric | no comparable metric | not run — no C++ impl | no comparable metric | no comparable metric | **6.3K/s** | 1.9K/s | 171.0/s | no WASM — strings/records | not run — no GPU path | N/A — no Node.js |
| text-html | not run — no AVX-512 | no comparable metric | no comparable metric | not run — no C++ impl | no comparable metric | no comparable metric | **52.1K/s** | 1.9K/s | 870.0/s | no WASM — strings/records | not run — no GPU path | N/A — no Node.js |
| tri-logic | not run — no AVX-512 | **1.37B/s** | **1.38B/s** | not run — no C++ impl | 990.89M/s | 6.97M/s | 336.0K/s | 328.1K/s | 325.4K/s | 462.81M/s | not run — no GPU path | 3.0K× |
| data-query | not run — no AVX-512 | not run — no native impl | not run — no native impl | not run — no C++ impl | **388.45M/s** | 3.80M/s | 262.1K/s | 183.6K/s | 204.8K/s | no WASM build | not run — no GPU path | 1.9K× |
| call-chain | not run — no AVX-512 | not run — no native impl | not run — no native impl | not run — no C++ impl | **274.88M/s** | 1.78M/s | 59.0K/s | 56.4K/s | 56.3K/s | 53.92M/s | not run — no GPU path | 4.9K× |
| nbody | not run — no AVX-512 | not run — no native impl | not run — no native impl | not run — no C++ impl | **121.33M/s** | 1.01M/s | 63.2K/s | 61.5K/s | 63.6K/s | 28.89M/s | not run — no GPU path | 1.9K× |
| json-parse | not run — no AVX-512 | not run — no native impl | not run — no native impl | not run — no C++ impl | **3.38M/s** | 443.5K/s | 9.7K/s | 4.9K/s | 5.6K/s | no WASM — strings/records | not run — no GPU path | 600.3× |
| mandelbrot | not run — no AVX-512 | **23.29M/s** | **23.43M/s** | not run — no C++ impl | 6.24M/s | 146.3K/s | 7.5K/s | 7.4K/s | 7.5K/s | 8.98M/s | not run — no GPU path | 833.6× |
| spectral-norm | not run — no AVX-512 | **360.18M/s** | **372.34M/s** | not run — no C++ impl | 241.41M/s | 1.61M/s | not run | not run | not run | no WASM build | not run — no GPU path | N/A — no governed ⟨interp⟩ |
| binary-trees | not run — no AVX-512 | 20.29M/s | 16.48M/s | not run — no C++ impl | 79.09M/s | 2.89M/s | 392.6K/s | 351.1K/s | 344.4K/s | **586.20M/s** | not run — no GPU path | 229.6× |
| spore-container | not run — no AVX-512 | **159.1K/s** | **162.6K/s** | not run — no C++ impl | 45.5K/s | 64.1K/s | not run | not run | not run | no WASM — strings/records | not run — no GPU path | N/A — no governed ⟨interp⟩ |
| framework-pipeline | not run — no AVX-512 | not run — no native impl | not run — no native impl | not run — no C++ impl | not run | **106.8K/s** | not run | not run | not run | no WASM — strings/records | not run — no GPU path | N/A — neither ran |
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
| 🥇 | ⚫ | Galerina passive ⟨interp⟩ | -38.67 bytes/op ⚡ ~0 — no boxing | 164.3K/s | — | -387KB |
| 🥈 | 🟢 | Rust AVX2 | 0.00 bytes/op ⚡ ~0 — no boxing | 6.16B/s | — | — |
| 🥉 | 🟢 | Rust (generic) | 0.00 bytes/op ⚡ ~0 — no boxing | 1.35B/s | — | — |
| 4 | 🟢 | Node.js | 0.00 bytes/op ⚡ ~0 — no boxing | 715.22M/s | — | 17KB |
| 5 | ⚪ | WASM ▶ production | 0.00 bytes/op ⚡ ~0 — no boxing | 466.90M/s | — | 42KB |
| 6 | ⚫ | Python | 0.03 bytes/op ⚡ ~0 — no boxing | 2.99M/s | — | 272B |
| 7 | ⚫ | Galerina manifest ⟨interp⟩ | 45 bytes/op ⚠ moderate | 119.8K/s | — | 448KB |
| 8 | ⚫ | Galerina governed ⟨interp⟩ | 62 bytes/op ⚠ moderate | 151.3K/s | — | 618KB |

> **Why this matters:** Every byte allocated is a byte the GC must later collect.
> WASM and the bytecode VM run with zero allocation — ideal for high-throughput governed services.
> The tree-walker's per-node allocation is the primary target of Phases 31-33.


## 2b. General Memory Usage

| Benchmark | Runtime | RSS | Peak RSS | Heap Used | Heap Δ (execution) |
|---|---|---|---|---|---|
| compute-mix | Rust AVX2 | — | — | — | — |
| compute-mix | Rust (generic) | — | — | — | — |
| compute-mix | Node.js | 44.0MB | 44.0MB | 4.6MB | 559KB |
| compute-mix | Python | — | — | 3KB | 3KB |
| compute-mix | Galerina passive ⟨interp⟩ | 78.3MB | 78.3MB | 16.8MB | 73KB |
| compute-mix | Galerina manifest ⟨interp⟩ | 74.4MB | 74.4MB | 20.6MB | 4.4MB |
| compute-mix | Galerina governed ⟨interp⟩ | 73.4MB | 73.4MB | 20.3MB | 4.5MB |
| compute-mix | WASM ▶ production | 72.3MB | 72.3MB | 16.1MB | 22KB |
| arithmetic-threshold | Rust AVX2 | — | — | — | — |
| arithmetic-threshold | Rust (generic) | — | — | — | — |
| arithmetic-threshold | Node.js | 47.3MB | 47.6MB | 4.3MB | 219KB |
| arithmetic-threshold | Python | — | — | 4KB | 4KB |
| arithmetic-threshold | Galerina passive ⟨interp⟩ | 79.9MB | 79.9MB | 17.2MB | 39KB |
| arithmetic-threshold | Galerina manifest ⟨interp⟩ | 79.7MB | 79.7MB | 17.2MB | 835KB |
| arithmetic-threshold | Galerina governed ⟨interp⟩ | 79.6MB | 79.6MB | 17.2MB | 847KB |
| arithmetic-threshold | WASM ▶ production | 81.9MB | 81.9MB | 16.7MB | 6KB |
| six-digit-guess | Rust AVX2 | — | — | — | — |
| six-digit-guess | Rust (generic) | — | — | — | — |
| six-digit-guess | Node.js | 51.8MB | 51.8MB | 5.8MB | 1.1MB |
| six-digit-guess | Python | — | — | 583B | 583B |
| six-digit-guess | Galerina passive ⟨interp⟩ | 80.7MB | 80.7MB | 19.3MB | 86KB |
| six-digit-guess | Galerina manifest ⟨interp⟩ | 80.4MB | 80.4MB | 17.7MB | 779KB |
| six-digit-guess | Galerina governed ⟨interp⟩ | 80.5MB | 80.5MB | 19.1MB | 2.4MB |
| six-digit-guess | WASM ▶ production | 82.5MB | 82.5MB | 16.9MB | 1KB |
| record-allocation | Rust AVX2 | — | — | — | — |
| record-allocation | Rust (generic) | — | — | — | — |
| record-allocation | Node.js | 48.0MB | 48.0MB | 4.1MB | 27KB |
| record-allocation | Python | — | — | 492B | 492B |
| record-allocation | Galerina passive ⟨interp⟩ | 81.0MB | 81.0MB | 17.7MB | 188KB |
| record-allocation | Galerina manifest ⟨interp⟩ | 80.7MB | 80.7MB | 17.2MB | 86KB |
| record-allocation | Galerina governed ⟨interp⟩ | 81.5MB | 81.5MB | 17.2MB | 60KB |
| record-allocation | WASM ▶ production | 82.9MB | 82.9MB | 17.4MB | 50KB |
| fibonacci-recursive | Rust AVX2 | — | — | — | — |
| fibonacci-recursive | Rust (generic) | — | — | — | — |
| fibonacci-recursive | Node.js | 46.3MB | 46.3MB | 4.1MB | 5KB |
| fibonacci-recursive | Python | — | — | 464B | 464B |
| fibonacci-recursive | Galerina passive ⟨interp⟩ | 81.6MB | 81.6MB | 18.2MB | 59KB |
| fibonacci-recursive | Galerina manifest ⟨interp⟩ | 81.6MB | 81.6MB | 17.5MB | 173KB |
| fibonacci-recursive | Galerina governed ⟨interp⟩ | 81.0MB | 81.0MB | 18.3MB | 1.0MB |
| fibonacci-recursive | WASM ▶ production | 83.2MB | 83.2MB | 17.5MB | 3KB |
| tower-of-hanoi | Rust AVX2 | — | — | — | — |
| tower-of-hanoi | Rust (generic) | — | — | — | — |
| tower-of-hanoi | Node.js | 46.4MB | 46.4MB | 4.1MB | 17KB |
| tower-of-hanoi | Python | — | — | 1KB | 1KB |
| tower-of-hanoi | Galerina passive ⟨interp⟩ | 84.2MB | 84.2MB | 18.3MB | 47KB |
| tower-of-hanoi | Galerina manifest ⟨interp⟩ | 83.3MB | 83.3MB | 17.6MB | 1.2MB |
| tower-of-hanoi | Galerina governed ⟨interp⟩ | 83.6MB | 83.6MB | 18.7MB | 2.3MB |
| tower-of-hanoi | WASM ▶ production | 83.9MB | 83.9MB | 16.7MB | 1KB |
| collection-pipeline | Rust AVX2 | — | — | — | — |
| collection-pipeline | Rust (generic) | — | — | — | — |
| collection-pipeline | Node.js | 63.3MB | 63.3MB | 12.3MB | 8.1MB |
| collection-pipeline | Python | — | — | 224B | 224B |
| collection-pipeline | Galerina passive ⟨interp⟩ | 84.3MB | 84.3MB | 17.1MB | 271KB |
| collection-pipeline | Galerina manifest ⟨interp⟩ | 84.3MB | 84.3MB | 16.5MB | 145KB |
| collection-pipeline | Galerina governed ⟨interp⟩ | 85.3MB | 85.3MB | 16.6MB | 168KB |
| collection-pipeline | WASM ▶ production | 87.2MB | 87.2MB | 16.7MB | 24KB |
| governance-cost | Rust AVX2 | — | — | — | — |
| governance-cost | Rust (generic) | — | — | — | — |
| governance-cost | Node.js | 46.4MB | 46.4MB | 4.1MB | 27KB |
| governance-cost | Python | — | — | 272B | 272B |
| governance-cost | Galerina passive ⟨interp⟩ | 85.4MB | 85.4MB | 17.3MB | 468KB |
| governance-cost | Galerina manifest ⟨interp⟩ | 86.8MB | 86.8MB | 17.0MB | 412KB |
| governance-cost | Galerina governed ⟨interp⟩ | 86.0MB | 86.0MB | 17.0MB | 448KB |
| governance-cost | WASM ▶ production | 87.0MB | 87.0MB | 16.8MB | 52KB |
| hardware-targets | Rust AVX2 | — | — | — | — |
| hardware-targets | Rust (generic) | — | — | — | — |
| hardware-targets | Node.js | 48.2MB | 48.2MB | 4.5MB | 350KB |
| hardware-targets | Galerina passive ⟨interp⟩ | 84.9MB | 84.9MB | 17.4MB | 96KB |
| hardware-targets | Galerina manifest ⟨interp⟩ | 84.6MB | 84.6MB | 16.7MB | 77KB |
| hardware-targets | Galerina governed ⟨interp⟩ | 84.3MB | 84.3MB | 16.8MB | 78KB |
| hardware-targets | WASM ▶ production | 86.7MB | 86.7MB | 17.0MB | 75KB |
| low-memory | Rust AVX2 | — | — | — | — |
| low-memory | Rust (generic) | — | — | — | — |
| low-memory | Node.js | 46.5MB | 46.5MB | 4.1MB | 17KB |
| low-memory | Python | — | — | 272B | 272B |
| low-memory | Galerina passive ⟨interp⟩ | 85.2MB | 85.2MB | 17.1MB | -387KB |
| low-memory | Galerina manifest ⟨interp⟩ | 85.3MB | 85.3MB | 17.2MB | 448KB |
| low-memory | Galerina governed ⟨interp⟩ | 85.1MB | 85.1MB | 17.3MB | 618KB |
| low-memory | WASM ▶ production | 87.4MB | 87.4MB | 17.0MB | 42KB |
| gpu-compute | Rust AVX2 | — | — | — | — |
| gpu-compute | Rust (generic) | — | — | — | — |
| gpu-compute | Node.js | 46.5MB | 46.5MB | 4.1MB | 17KB |
| gpu-compute | Python | — | — | 304B | 304B |
| gpu-compute | Galerina passive ⟨interp⟩ | 85.3MB | 85.3MB | 18.0MB | 191KB |
| gpu-compute | Galerina manifest ⟨interp⟩ | 85.2MB | 85.2MB | 17.4MB | 564KB |
| gpu-compute | Galerina governed ⟨interp⟩ | 86.8MB | 86.8MB | 17.6MB | 721KB |
| gpu-compute | WASM ▶ production | 88.8MB | 88.8MB | 17.1MB | 2KB |
| gpu-compute | Deno WebGPU (NVIDIA GeForce RTX 2060) | — | — | — | — |
| matrix-multiply | Rust AVX2 | — | — | — | — |
| matrix-multiply | Rust (generic) | — | — | — | — |
| matrix-multiply | Node.js | 48.3MB | 48.3MB | 5.1MB | 991KB |
| matrix-multiply | Python | — | — | 392B | 392B |
| matrix-multiply | Galerina passive ⟨interp⟩ | 87.1MB | 87.1MB | 17.1MB | -1.9MB |
| matrix-multiply | Galerina manifest ⟨interp⟩ | 87.1MB | 87.1MB | 17.9MB | 974KB |
| matrix-multiply | Galerina governed ⟨interp⟩ | 85.4MB | 85.4MB | 18.8MB | 1.9MB |
| matrix-multiply | WASM ▶ production | 88.2MB | 88.2MB | 17.1MB | 3KB |
| matrix-multiply | Deno WebGPU (NVIDIA GeForce RTX 2060) | — | — | — | — |
| crypto-ops | Rust AVX2 | — | — | — | — |
| crypto-ops | Rust (generic) | — | — | — | — |
| crypto-ops | Node.js | 62.1MB | 62.1MB | 7.9MB | 2.4MB |
| crypto-ops | Python | — | — | 208B | 208B |
| crypto-ops | Galerina passive ⟨interp⟩ | 86.8MB | 86.8MB | 18.2MB | 590KB |
| crypto-ops | Galerina manifest ⟨interp⟩ | 85.6MB | 85.6MB | 17.1MB | 233KB |
| crypto-ops | Galerina governed ⟨interp⟩ | 85.6MB | 85.6MB | 17.2MB | 322KB |
| text-html | Rust AVX2 | — | — | — | — |
| text-html | Rust (generic) | — | — | — | — |
| text-html | Node.js | — | — | — | 486KB |
| text-html | Python | — | — | 208B | 208B |
| text-html | Galerina passive ⟨interp⟩ | 85.8MB | 85.8MB | 17.8MB | -449KB |
| text-html | Galerina manifest ⟨interp⟩ | 86.9MB | 86.9MB | 17.4MB | 149KB |
| text-html | Galerina governed ⟨interp⟩ | 86.9MB | 86.9MB | 17.5MB | 169KB |
| tri-logic | Rust AVX2 | — | — | — | — |
| tri-logic | Rust (generic) | — | — | — | — |
| tri-logic | Node.js | — | — | — | 326KB |
| tri-logic | Python | — | — | — | — |
| tri-logic | Galerina passive ⟨interp⟩ | 88.0MB | 88.0MB | 18.8MB | 232KB |
| tri-logic | Galerina manifest ⟨interp⟩ | 88.0MB | 88.0MB | 18.5MB | 1.1MB |
| tri-logic | Galerina governed ⟨interp⟩ | 87.7MB | 87.7MB | 18.9MB | 1.6MB |
| tri-logic | WASM ▶ production | 88.7MB | 88.7MB | 17.7MB | 1KB |
| data-query | Node.js | — | — | — | 14KB |
| data-query | Python | — | — | — | — |
| data-query | Galerina passive ⟨interp⟩ | 88.8MB | 88.8MB | 20.8MB | 1.1MB |
| data-query | Galerina manifest ⟨interp⟩ | 87.8MB | 87.8MB | 18.0MB | 624KB |
| data-query | Galerina governed ⟨interp⟩ | 88.8MB | 88.8MB | 19.4MB | 2.0MB |
| call-chain | Node.js | 47.6MB | 47.6MB | 4.4MB | 255KB |
| call-chain | Python | — | — | 368B | 368B |
| call-chain | Galerina passive ⟨interp⟩ | 88.1MB | 88.1MB | 19.2MB | 83KB |
| call-chain | Galerina manifest ⟨interp⟩ | 88.1MB | 88.1MB | 19.5MB | 2.1MB |
| call-chain | Galerina governed ⟨interp⟩ | 88.1MB | 88.1MB | 18.5MB | 1.0MB |
| call-chain | WASM ▶ production | 89.5MB | 89.5MB | 17.7MB | 1KB |
| nbody | Node.js | 48.8MB | 48.8MB | 4.2MB | 30KB |
| nbody | Python | — | — | 624B | 624B |
| nbody | Galerina passive ⟨interp⟩ | 88.2MB | 88.2MB | 17.8MB | -1.9MB |
| nbody | Galerina manifest ⟨interp⟩ | 88.2MB | 88.2MB | 17.9MB | 323KB |
| nbody | Galerina governed ⟨interp⟩ | 88.0MB | 88.0MB | 18.3MB | 754KB |
| nbody | WASM ▶ production | 88.8MB | 88.8MB | 17.8MB | 1KB |
| json-parse | Node.js | — | — | — | 255KB |
| json-parse | Python | — | — | 520B | 520B |
| json-parse | Galerina passive ⟨interp⟩ | 94.4MB | 94.4MB | 18.9MB | -3.8MB |
| json-parse | Galerina manifest ⟨interp⟩ | 87.9MB | 87.9MB | 22.4MB | 4.4MB |
| json-parse | Galerina governed ⟨interp⟩ | 95.2MB | 95.2MB | 19.1MB | 1.6MB |
| mandelbrot | Rust AVX2 | — | — | — | — |
| mandelbrot | Rust (generic) | — | — | — | — |
| mandelbrot | Node.js | 48.5MB | 48.5MB | 5.1MB | 1.0MB |
| mandelbrot | Python | — | — | 3KB | 3KB |
| mandelbrot | Galerina passive ⟨interp⟩ | 90.5MB | 90.5MB | 21.6MB | 167KB |
| mandelbrot | Galerina manifest ⟨interp⟩ | 90.5MB | 90.5MB | 20.2MB | 2.3MB |
| mandelbrot | Galerina governed ⟨interp⟩ | 90.3MB | 90.3MB | 19.4MB | 1.3MB |
| mandelbrot | WASM ▶ production | 95.0MB | 95.0MB | 18.4MB | 1KB |
| spectral-norm | Rust AVX2 | — | — | — | — |
| spectral-norm | Rust (generic) | — | — | — | — |
| spectral-norm | Node.js | 48.4MB | 48.4MB | 4.4MB | 294KB |
| spectral-norm | Python | — | — | 4KB | 4KB |
| binary-trees | Rust AVX2 | — | — | — | — |
| binary-trees | Rust (generic) | — | — | — | — |
| binary-trees | Node.js | 48.5MB | 48.5MB | 4.6MB | 429KB |
| binary-trees | Python | — | — | 368B | 368B |
| binary-trees | Galerina passive ⟨interp⟩ | 90.5MB | 90.5MB | 20.3MB | 69KB |
| binary-trees | Galerina manifest ⟨interp⟩ | 90.5MB | 90.5MB | 19.6MB | 1.6MB |
| binary-trees | Galerina governed ⟨interp⟩ | 91.0MB | 91.0MB | 18.9MB | 975KB |
| binary-trees | WASM ▶ production | 92.7MB | 92.7MB | 18.2MB | 2KB |
| spore-container | Rust AVX2 | — | — | — | — |
| spore-container | Rust (generic) | — | — | — | — |
| spore-container | Node.js | 63.7MB | 63.7MB | 8.9MB | 1.6MB |
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
| compute-mix | Node.js | 3.00s | 3.00s | 100% | 134.7K ops/CPU-ms |
| compute-mix | Python | 3.01s | 2.98s | 99% | 720.42 ops/CPU-ms |
| compute-mix | Galerina passive ⟨interp⟩ | 0.4ms | 0.0ms | 0% | — |
| compute-mix | Galerina manifest ⟨interp⟩ | 27.6ms | 47.0ms | 170% | 1.1K ops/CPU-ms |
| compute-mix | Galerina governed ⟨interp⟩ | 29.9ms | 31.0ms | 104% | 1.6K ops/CPU-ms |
| compute-mix | WASM ▶ production | 1.30s | 1.28s | 99% | 78.1K ops/CPU-ms |
| arithmetic-threshold | Rust AVX2 | 12.8ms | — | — | — |
| arithmetic-threshold | Rust (generic) | 12.8ms | — | — | — |
| arithmetic-threshold | Node.js | 20.5ms | 15.0ms | 73% | 1.33M ops/CPU-ms |
| arithmetic-threshold | Python | 5.24s | 5.23s | 100% | 3.8K ops/CPU-ms |
| arithmetic-threshold | Galerina passive ⟨interp⟩ | 0.1ms | 0.0ms | 0% | — |
| arithmetic-threshold | Galerina manifest ⟨interp⟩ | 11.8ms | 16.0ms | 135% | 4.0K ops/CPU-ms |
| arithmetic-threshold | Galerina governed ⟨interp⟩ | 12.0ms | 15.0ms | 125% | 4.2K ops/CPU-ms |
| arithmetic-threshold | WASM ▶ production | 1.04s | 1.03s | 100% | 490.8K ops/CPU-ms |
| six-digit-guess | Rust AVX2 | 0.6ms | — | — | — |
| six-digit-guess | Rust (generic) | 0.5ms | — | — | — |
| six-digit-guess | Node.js | 15.1ms | 15.0ms | 99% | 2.8K ops/CPU-ms |
| six-digit-guess | Python | 447.6ms | 453.1ms | 101% | 92.84 ops/CPU-ms |
| six-digit-guess | Galerina passive ⟨interp⟩ | 0.1ms | 0.0ms | 0% | — |
| six-digit-guess | Galerina manifest ⟨interp⟩ | 854.1ms | 891.0ms | 104% | 47.22 ops/CPU-ms |
| six-digit-guess | Galerina governed ⟨interp⟩ | 1.01s | 1.08s | 106% | 38.99 ops/CPU-ms |
| six-digit-guess | WASM ▶ production | 1.16s | 1.16s | 100% | 36.4K ops/CPU-ms |
| record-allocation | Rust AVX2 | 10.6ms | — | — | — |
| record-allocation | Rust (generic) | 8.5ms | — | — | — |
| record-allocation | Node.js | 3.6ms | 0.0ms | 0% | — |
| record-allocation | Python | 68.4ms | 78.1ms | 114% | 2.6K ops/CPU-ms |
| record-allocation | Galerina passive ⟨interp⟩ | 0.4ms | 0.0ms | 0% | — |
| record-allocation | Galerina manifest ⟨interp⟩ | 3.8ms | 0.0ms | 0% | — |
| record-allocation | Galerina governed ⟨interp⟩ | 4.2ms | 0.0ms | 0% | — |
| record-allocation | WASM ▶ production | 1.01s | 1.01s | 100% | 551.7K ops/CPU-ms |
| fibonacci-recursive | Rust AVX2 | 401.4ms | — | — | — |
| fibonacci-recursive | Rust (generic) | 400.6ms | — | — | — |
| fibonacci-recursive | Node.js | 788.4ms | 781.0ms | 99% | 0.13 ops/CPU-ms |
| fibonacci-recursive | Python | 4.75s | 4.73s | 100% | 0.00 ops/CPU-ms |
| fibonacci-recursive | Galerina passive ⟨interp⟩ | 0.1ms | 0.0ms | 0% | — |
| fibonacci-recursive | Galerina manifest ⟨interp⟩ | 58.1ms | 62.0ms | 107% | 0.02 ops/CPU-ms |
| fibonacci-recursive | Galerina governed ⟨interp⟩ | 85.4ms | 109.0ms | 128% | 0.01 ops/CPU-ms |
| fibonacci-recursive | WASM ▶ production | 1.06s | 1.06s | 101% | 16.93 ops/CPU-ms |
| tower-of-hanoi | Rust AVX2 | 520.3ms | — | — | — |
| tower-of-hanoi | Rust (generic) | 520.7ms | — | — | — |
| tower-of-hanoi | Node.js | 101.0ms | 94.0ms | 93% | 139.4K ops/CPU-ms |
| tower-of-hanoi | Python | 506.9ms | 500.0ms | 99% | 2.6K ops/CPU-ms |
| tower-of-hanoi | Galerina passive ⟨interp⟩ | 0.1ms | 0.0ms | 0% | — |
| tower-of-hanoi | Galerina manifest ⟨interp⟩ | 662.4ms | 672.0ms | 101% | 97.52 ops/CPU-ms |
| tower-of-hanoi | Galerina governed ⟨interp⟩ | 663.6ms | 750.0ms | 113% | 87.38 ops/CPU-ms |
| tower-of-hanoi | WASM ▶ production | 1.09s | 1.09s | 101% | 119.9K ops/CPU-ms |
| collection-pipeline | Rust AVX2 | 76.3ms | — | — | — |
| collection-pipeline | Rust (generic) | 232.9ms | — | — | — |
| collection-pipeline | Node.js | 716.1ms | 703.0ms | 98% | 71.1K ops/CPU-ms |
| collection-pipeline | Python | 3.89s | 3.89s | 100% | 12.9K ops/CPU-ms |
| collection-pipeline | Galerina passive ⟨interp⟩ | 0.5ms | 0.0ms | 0% | — |
| collection-pipeline | Galerina manifest ⟨interp⟩ | 5.1ms | 31.0ms | 603% | 322.58 ops/CPU-ms |
| collection-pipeline | Galerina governed ⟨interp⟩ | 4.3ms | 0.0ms | 0% | — |
| collection-pipeline | WASM ▶ production | 1.01s | 1.00s | 99% | 420.0K ops/CPU-ms |
| governance-cost | Rust AVX2 | 11.2ms | — | — | — |
| governance-cost | Rust (generic) | 11.2ms | — | — | — |
| governance-cost | Node.js | 47.5ms | 47.0ms | 99% | — |
| governance-cost | Python | 4.80s | 4.80s | 100% | — |
| governance-cost | Galerina passive ⟨interp⟩ | 6.1ms | 0.0ms | 0% | — |
| governance-cost | Galerina manifest ⟨interp⟩ | 1.3ms | 0.0ms | 0% | — |
| governance-cost | Galerina governed ⟨interp⟩ | 1.5ms | 0.0ms | 0% | — |
| governance-cost | WASM ▶ production | 1.00s | 1.01s | 101% | — |
| hardware-targets | Rust AVX2 | 854.8ms | — | — | — |
| hardware-targets | Rust (generic) | 851.6ms | — | — | — |
| hardware-targets | Node.js | 1.10s | 1.11s | 101% | 901.71 ops/CPU-ms |
| hardware-targets | Galerina passive ⟨interp⟩ | 14.4ms | 16.0ms | 111% | — |
| hardware-targets | Galerina manifest ⟨interp⟩ | 0.3ms | 0.0ms | 0% | — |
| hardware-targets | Galerina governed ⟨interp⟩ | 0.3ms | 0.0ms | 0% | — |
| hardware-targets | WASM ▶ production | 1.00s | 1.00s | 100% | 37.0K ops/CPU-ms |
| low-memory | Rust AVX2 | 162.4ms | — | — | — |
| low-memory | Rust (generic) | 739.2ms | — | — | — |
| low-memory | Node.js | 69.9ms | 93.0ms | 133% | 537.6K ops/CPU-ms |
| low-memory | Python | 3.34s | 3.34s | 100% | 3.0K ops/CPU-ms |
| low-memory | Galerina passive ⟨interp⟩ | 0.7ms | 0.0ms | 0% | — |
| low-memory | Galerina manifest ⟨interp⟩ | 83.5ms | 171.0ms | 205% | 58.48 ops/CPU-ms |
| low-memory | Galerina governed ⟨interp⟩ | 66.1ms | 79.0ms | 120% | 126.58 ops/CPU-ms |
| low-memory | WASM ▶ production | 1.01s | 1.01s | 101% | 463.1K ops/CPU-ms |
| gpu-compute | Rust AVX2 | 4.24s | — | — | — |
| gpu-compute | Rust (generic) | 4.24s | — | — | — |
| gpu-compute | Node.js | 507.3ms | 515.0ms | 102% | 970.9K ops/CPU-ms |
| gpu-compute | Python | 7.55s | 7.50s | 99% | 6.7K ops/CPU-ms |
| gpu-compute | Galerina passive ⟨interp⟩ | 0.2ms | 0.0ms | 0% | — |
| gpu-compute | Galerina manifest ⟨interp⟩ | 302.6ms | 406.0ms | 134% | 246.31 ops/CPU-ms |
| gpu-compute | Galerina governed ⟨interp⟩ | 304.8ms | 328.0ms | 108% | 304.88 ops/CPU-ms |
| gpu-compute | WASM ▶ production | 1.06s | 1.06s | 100% | 470.8K ops/CPU-ms |
| gpu-compute | Deno WebGPU (NVIDIA GeForce RTX 2060) | 24.5ms | — | — | — |
| matrix-multiply | Rust AVX2 | 93.7ms | — | — | — |
| matrix-multiply | Rust (generic) | 86.7ms | — | — | — |
| matrix-multiply | Node.js | 212.3ms | 235.0ms | 111% | 557.8K ops/CPU-ms |
| matrix-multiply | Python | 1.98s | — | — | — |
| matrix-multiply | Galerina passive ⟨interp⟩ | 0.2ms | 0.0ms | 0% | — |
| matrix-multiply | Galerina manifest ⟨interp⟩ | 50.0ms | 93.0ms | 186% | 352.34 ops/CPU-ms |
| matrix-multiply | Galerina governed ⟨interp⟩ | 45.7ms | 94.0ms | 206% | 348.60 ops/CPU-ms |
| matrix-multiply | WASM ▶ production | 1.04s | 1.05s | 100% | 438.2K ops/CPU-ms |
| matrix-multiply | Deno WebGPU (NVIDIA GeForce RTX 2060) | 11.7ms | — | — | — |
| crypto-ops | Galerina passive ⟨interp⟩ | 15.8ms | 15.0ms | 95% | — |
| crypto-ops | Galerina manifest ⟨interp⟩ | 0.5ms | 0.0ms | 0% | — |
| crypto-ops | Galerina governed ⟨interp⟩ | 5.9ms | 0.0ms | 0% | — |
| text-html | Galerina passive ⟨interp⟩ | 1.9ms | 0.0ms | 0% | — |
| text-html | Galerina manifest ⟨interp⟩ | 0.5ms | 0.0ms | 0% | — |
| text-html | Galerina governed ⟨interp⟩ | 1.1ms | 0.0ms | 0% | — |
| tri-logic | Rust AVX2 | 437.8ms | — | — | — |
| tri-logic | Rust (generic) | 433.6ms | — | — | — |
| tri-logic | Node.js | 302.8ms | — | — | — |
| tri-logic | Python | 1.72s | — | — | — |
| tri-logic | Galerina passive ⟨interp⟩ | 2.0ms | 0.0ms | 0% | — |
| tri-logic | Galerina manifest ⟨interp⟩ | 914.4ms | 922.0ms | 101% | 325.38 ops/CPU-ms |
| tri-logic | Galerina governed ⟨interp⟩ | 922.0ms | 1.00s | 108% | 300.00 ops/CPU-ms |
| tri-logic | WASM ▶ production | 1.30s | 1.30s | 100% | 462.6K ops/CPU-ms |
| data-query | Node.js | 128.7ms | — | — | — |
| data-query | Python | 788.6ms | — | — | — |
| data-query | Galerina passive ⟨interp⟩ | 1.1ms | 0.0ms | 0% | — |
| data-query | Galerina manifest ⟨interp⟩ | 54.5ms | 63.0ms | 116% | 158.73 ops/CPU-ms |
| data-query | Galerina governed ⟨interp⟩ | 48.8ms | 47.0ms | 96% | 212.77 ops/CPU-ms |
| call-chain | Node.js | 7.3ms | 0.0ms | 0% | — |
| call-chain | Python | 560.2ms | 562.5ms | 100% | 1.8K ops/CPU-ms |
| call-chain | Galerina passive ⟨interp⟩ | 0.1ms | 0.0ms | 0% | — |
| call-chain | Galerina manifest ⟨interp⟩ | 886.6ms | 984.0ms | 111% | 50.81 ops/CPU-ms |
| call-chain | Galerina governed ⟨interp⟩ | 888.0ms | 953.0ms | 107% | 52.47 ops/CPU-ms |
| call-chain | WASM ▶ production | 1.85s | 1.86s | 100% | 53.8K ops/CPU-ms |
| nbody | Node.js | 54.0ms | 47.0ms | 87% | 139.4K ops/CPU-ms |
| nbody | Python | 1.62s | — | — | — |
| nbody | Galerina passive ⟨interp⟩ | 0.3ms | 0.0ms | 0% | — |
| nbody | Galerina manifest ⟨interp⟩ | 532.6ms | 563.0ms | 106% | 58.20 ops/CPU-ms |
| nbody | Galerina governed ⟨interp⟩ | 514.9ms | 563.0ms | 109% | 58.20 ops/CPU-ms |
| nbody | WASM ▶ production | 1.13s | 1.14s | 101% | 28.7K ops/CPU-ms |
| json-parse | Galerina passive ⟨interp⟩ | 0.6ms | 0.0ms | 0% | — |
| json-parse | Galerina manifest ⟨interp⟩ | 102.2ms | 156.0ms | 153% | 3.21 ops/CPU-ms |
| json-parse | Galerina governed ⟨interp⟩ | 88.9ms | 141.0ms | 159% | 3.55 ops/CPU-ms |
| mandelbrot | Rust AVX2 | 140.7ms | — | — | — |
| mandelbrot | Rust (generic) | 139.9ms | — | — | — |
| mandelbrot | Node.js | 524.8ms | 547.0ms | 104% | 6.0K ops/CPU-ms |
| mandelbrot | Python | 22.39s | — | — | — |
| mandelbrot | Galerina passive ⟨interp⟩ | 0.2ms | 0.0ms | 0% | — |
| mandelbrot | Galerina manifest ⟨interp⟩ | 2.22s | 2.20s | 99% | 7.44 ops/CPU-ms |
| mandelbrot | Galerina governed ⟨interp⟩ | 2.19s | 2.20s | 101% | 7.44 ops/CPU-ms |
| mandelbrot | WASM ▶ production | 1.82s | 1.81s | 99% | 9.0K ops/CPU-ms |
| spectral-norm | Rust AVX2 | 27.8ms | — | — | — |
| spectral-norm | Rust (generic) | 26.9ms | — | — | — |
| spectral-norm | Node.js | 41.4ms | 31.0ms | 75% | 322.6K ops/CPU-ms |
| spectral-norm | Python | 6.22s | — | — | — |
| binary-trees | Rust AVX2 | 6.7ms | — | — | — |
| binary-trees | Rust (generic) | 8.2ms | — | — | — |
| binary-trees | Node.js | 1.7ms | 0.0ms | 0% | — |
| binary-trees | Python | 47.0ms | 46.9ms | 100% | 2.9K ops/CPU-ms |
| binary-trees | Galerina passive ⟨interp⟩ | 0.1ms | 0.0ms | 0% | — |
| binary-trees | Galerina manifest ⟨interp⟩ | 386.9ms | 406.0ms | 105% | 334.62 ops/CPU-ms |
| binary-trees | Galerina governed ⟨interp⟩ | 394.5ms | 454.0ms | 115% | 299.24 ops/CPU-ms |
| binary-trees | WASM ▶ production | 1.16s | 1.16s | 100% | 587.6K ops/CPU-ms |
| spore-container | Rust AVX2 | 1.89s | — | — | — |
| spore-container | Rust (generic) | 1.85s | — | — | — |
| spore-container | Node.js | 6.59s | 7.81s | 119% | 38.40 ops/CPU-ms |
| spore-container | Python | 1.56s | — | — | — |
| framework-pipeline | Python | 1.87s | — | — | — |
| http-throughput | Node.js | 82.0ms | — | — | — |
| naming-check | Node.js | 428.0ms | — | — | — |
| context-receipt | Node.js | 312.0ms | — | — | — |
| intelligence-search | Node.js | 46.0ms | — | — | — |
| provenance-trace | Node.js | 1.99s | — | — | — |

> **CPU utilisation** = CPU ms ÷ wall ms × 100. Node.js approaches 100% (single-thread JIT). Python may show <100% on Windows where process_time measures differently.

## 4. Per-Benchmark Detail

> **Heap/op** = heap bytes allocated per operation (the fair, workload-attributable memory metric).
> Managed runtimes (Node/Python/Galerina/WASM) report it via a GC'd before/after delta; native Rust/C++
> show **~0 (native)** — no GC-managed heap. `~0` = no measurable per-op allocation (e.g. V8 tagged ints);
> a large positive value (e.g. the Galerina tree-walker boxing a value per AST node) is allocation pressure.

### compute-mix

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Node.js | 134.71M/s | 3.00s | 3.00s | 44.0MB | ~0 | 188.5× | 1.00× |
| 🥈 | 🟢 | Rust (generic) | 130.65M/s | 5.00s | — | — | ~0 (native) | 182.8× | 0.97× |
| 🥉 | 🟢 | Rust AVX2 | 129.61M/s | 5.00s | — | — | ~0 (native) | 181.4× | 0.96× |
| 4 | ⚪ | WASM ▶ production | 77.19M/s | 1.30s | 1.28s | 72.3MB | ~0 | 108.0× | 0.57× |
| 5 | 🔴 | Galerina passive ⟨interp⟩ | 2.25M/s | 0.4ms | 0.0ms | 78.3MB | 90 B/op | 3.15× | 0.02× |
| 6 | 🔴 | Galerina manifest ⟨interp⟩ | 1.81M/s | 27.6ms | 47.0ms | 74.4MB | 89 B/op | 2.53× | 0.01× |
| 7 | 🔴 | Galerina governed ⟨interp⟩ | 1.67M/s | 29.9ms | 31.0ms | 73.4MB | 89 B/op | 2.34× | 0.01× |
| 8 | ⚫ | Python | 714.7K/s | 3.01s | 2.98s | — | ~0 | 1.00× | 0.01× |

> 🧠 **Lowest heap/op:** WASM ▶ production (~0) · **highest:** Galerina passive ⟨interp⟩ (90 B/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### arithmetic-threshold

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Rust (generic) | 1.56B/s | 12.8ms | — | — | ~0 (native) | 410.1× | 1.60× |
| 🥈 | 🟢 | Rust AVX2 | 1.56B/s | 12.8ms | — | — | ~0 (native) | 409.9× | 1.60× |
| 🥉 | 🟢 | Node.js | 975.45M/s | 20.5ms | 15.0ms | 47.3MB | ~0 | 255.7× | 1.00× |
| 4 | ⚪ | WASM ▶ production | 488.53M/s | 1.04s | 1.03s | 81.9MB | ~0 | 128.0× | 0.50× |
| 5 | ⚫ | Galerina manifest ⟨interp⟩ | 5.34M/s | 11.8ms | 16.0ms | 79.7MB | 13 B/op | 1.40× | 0.01× |
| 6 | ⚫ | Galerina governed ⟨interp⟩ | 5.28M/s | 12.0ms | 15.0ms | 79.6MB | 13 B/op | 1.38× | 0.01× |
| 7 | ⚫ | Python | 3.82M/s | 5.24s | 5.23s | — | ~0 | 1.00× | 0.00× |
| 8 | ⚫ | Galerina passive ⟨interp⟩ | 28.6K/s | 0.1ms | 0.0ms | 79.9MB | 12.8 KB/op | 0.01× | 0.00× |

> 🧠 **Lowest heap/op:** WASM ▶ production (~0) · **highest:** Galerina passive ⟨interp⟩ (12.8 KB/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### six-digit-guess

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Rust (generic) | 78.07M/s | 0.5ms | — | — | ~0 (native) | 830.6× | 28.0× |
| 🥈 | 🟢 | Rust AVX2 | 65.23M/s | 0.6ms | — | — | ~0 (native) | 694.1× | 23.4× |
| 🥉 | 🟢 | WASM ▶ production | 36.41M/s | 1.16s | 1.16s | 82.5MB | ~0 | 387.4× | 13.1× |
| 4 | 🟢 | Node.js | 2.79M/s | 15.1ms | 15.0ms | 51.8MB | 27 B/op | 29.6× | 1.00× |
| 5 | 🔴 | Python | 94.0K/s | 447.6ms | 453.1ms | — | ~0 | 1.00× | 0.03× |
| 6 | 🔴 | Galerina manifest ⟨interp⟩ | 49.3K/s | 854.1ms | 891.0ms | 80.4MB | 19 B/op | 0.52× | 0.02× |
| 7 | 🔴 | Galerina governed ⟨interp⟩ | 41.5K/s | 1.01s | 1.08s | 80.5MB | 57 B/op | 0.44× | 0.01× |
| 8 | ⚫ | Galerina passive ⟨interp⟩ | 22.4K/s | 0.1ms | 0.0ms | 80.7MB | 28.1 KB/op | 0.24× | 0.01× |

> 🧠 **Lowest heap/op:** WASM ▶ production (~0) · **highest:** Galerina passive ⟨interp⟩ (28.1 KB/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### record-allocation

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Rust (generic) | 1.17B/s | 8.5ms | — | — | ~0 (native) | 401.1× | 20.9× |
| 🥈 | 🟢 | Rust AVX2 | 944.81M/s | 10.6ms | — | — | ~0 (native) | 323.0× | 16.9× |
| 🥉 | 🟢 | WASM ▶ production | 551.83M/s | 1.01s | 1.01s | 82.9MB | ~0 | 188.6× | 9.85× |
| 4 | 🟢 | Node.js | 56.02M/s | 3.6ms | 0.0ms | 48.0MB | ~0 | 19.1× | 1.00× |
| 5 | 🟡 | Galerina passive ⟨interp⟩ | 8.43M/s | 0.4ms | 0.0ms | 81.0MB | 60 B/op | 2.88× | 0.15× |
| 6 | 🔴 | Python | 2.93M/s | 68.4ms | 78.1ms | — | ~0 | 1.00× | 0.05× |
| 7 | 🔴 | Galerina manifest ⟨interp⟩ | 2.64M/s | 3.8ms | 0.0ms | 80.7MB | 9 B/op | 0.90× | 0.05× |
| 8 | 🔴 | Galerina governed ⟨interp⟩ | 2.38M/s | 4.2ms | 0.0ms | 81.5MB | 6 B/op | 0.81× | 0.04× |

> 🧠 **Lowest heap/op:** WASM ▶ production (~0) · **highest:** Galerina passive ⟨interp⟩ (60 B/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### fibonacci-recursive

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Galerina passive ⟨interp⟩ | 51.7K/s | 0.1ms | 0.0ms | 81.6MB | 11.5 KB/op | 12.3K× | 407.6× |
| 🥈 | 🟢 | WASM ▶ production | 17.0K/s | 1.06s | 1.06s | 83.2MB | ~0 | 4.0K× | 134.3× |
| 🥉 | 🟢 | Rust (generic) | 499.2/s | 400.6ms | — | — | ~0 (native) | 118.6× | 3.94× |
| 4 | 🟢 | Rust AVX2 | 498.3/s | 401.4ms | — | — | ~0 (native) | 118.4× | 3.93× |
| 5 | 🟢 | Node.js | 126.8/s | 788.4ms | 781.0ms | 46.3MB | 53 B/op | 30.1× | 1.00× |
| 6 | 🟡 | Galerina manifest ⟨interp⟩ | 17.0/s | 58.1ms | 62.0ms | 81.6MB | 171.4 KB/op | 4.04× | 0.13× |
| 7 | 🔴 | Galerina governed ⟨interp⟩ | 12.0/s | 85.4ms | 109.0ms | 81.0MB | 969.3 KB/op | 2.85× | 0.09× |
| 8 | 🔴 | Python | 4.2/s | 4.75s | 4.73s | — | 23 B/op | 1.00× | 0.03× |

> 🧠 **Lowest heap/op:** WASM ▶ production (~0) · **highest:** Galerina governed ⟨interp⟩ (969.3 KB/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### tower-of-hanoi

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Rust AVX2 | 251.93M/s | 520.3ms | — | — | ~0 (native) | 97.4× | 1.94× |
| 🥈 | 🟢 | Rust (generic) | 251.71M/s | 520.7ms | — | — | ~0 (native) | 97.3× | 1.94× |
| 🥉 | 🟢 | Node.js | 129.72M/s | 101.0ms | 94.0ms | 46.4MB | ~0 | 50.2× | 1.00× |
| 4 | 🟢 | WASM ▶ production | 120.64M/s | 1.09s | 1.09s | 83.9MB | ~0 | 46.7× | 0.93× |
| 5 | 🔴 | Python | 2.59M/s | 506.9ms | 500.0ms | — | ~0 | 1.00× | 0.02× |
| 6 | ⚫ | Galerina passive ⟨interp⟩ | 100.3K/s | 0.1ms | 0.0ms | 84.2MB | 7.4 KB/op | 0.04× | 0.00× |
| 7 | ⚫ | Galerina manifest ⟨interp⟩ | 98.9K/s | 662.4ms | 672.0ms | 83.3MB | 19 B/op | 0.04× | 0.00× |
| 8 | ⚫ | Galerina governed ⟨interp⟩ | 98.8K/s | 663.6ms | 750.0ms | 83.6MB | 36 B/op | 0.04× | 0.00× |

> 🧠 **Lowest heap/op:** WASM ▶ production (~0) · **highest:** Galerina passive ⟨interp⟩ (7.4 KB/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### collection-pipeline

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Rust AVX2 | 13.10B/s | 76.3ms | — | — | ~0 (native) | 1.0K× | 187.6× |
| 🥈 | 🟢 | Rust (generic) | 4.29B/s | 232.9ms | — | — | ~0 (native) | 333.8× | 61.5× |
| 🥉 | 🟢 | WASM ▶ production | 416.11M/s | 1.01s | 1.00s | 87.2MB | ~0 | 32.4× | 5.96× |
| 4 | 🟢 | Node.js | 69.82M/s | 716.1ms | 703.0ms | 63.3MB | ~0 | 5.43× | 1.00× |
| 5 | 🟡 | Python | 12.86M/s | 3.89s | 3.89s | — | ~0 | 1.00× | 0.18× |
| 6 | 🟡 | Galerina passive ⟨interp⟩ | 8.15M/s | 0.5ms | 0.0ms | 84.3MB | 65 B/op | 0.63× | 0.12× |
| 7 | 🔴 | Galerina governed ⟨interp⟩ | 2.30M/s | 4.3ms | 0.0ms | 85.3MB | 17 B/op | 0.18× | 0.03× |
| 8 | 🔴 | Galerina manifest ⟨interp⟩ | 1.95M/s | 5.1ms | 31.0ms | 84.3MB | 14 B/op | 0.15× | 0.03× |

> 🧠 **Lowest heap/op:** WASM ▶ production (~0) · **highest:** Galerina passive ⟨interp⟩ (65 B/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### governance-cost ⚠️ (excluded — not unit-aligned)

> internal governed/manifest ratio — native baseline does no governance; not cross-runtime by design

| Runtime | Raw reported throughput (native unit — **NOT comparable**) | Wall |
|---|---|---|
| Rust AVX2 | 893.73M/s | 11.2ms |
| Rust (generic) | 893.05M/s | 11.2ms |
| Node.js | 2.11M/s | 47.5ms |
| Python | 20.8K/s | 4.80s |
| Galerina passive ⟨interp⟩ | 1.9K/s | 6.1ms |
| Galerina manifest ⟨interp⟩ | 754.0/s | 1.3ms |
| Galerina governed ⟨interp⟩ | 680.0/s | 1.5ms |
| WASM ▶ production | 2.84M/s | 1.00s |

### hardware-targets

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | WASM ▶ production | 37.05M/s | 1.00s | 1.00s | 86.7MB | ~0 | — | 40.8× |
| 🥈 | 🟢 | Rust (generic) | 1.17M/s | 851.6ms | — | — | ~0 (native) | — | 1.29× |
| 🥉 | 🟢 | Rust AVX2 | 1.17M/s | 854.8ms | — | — | ~0 (native) | — | 1.29× |
| 4 | 🟢 | Node.js | 908.3K/s | 1.10s | 1.11s | 48.2MB | ~0 | — | 1.00× |
| 5 | 🔴 | Galerina passive ⟨interp⟩ | 69.3K/s | 14.4ms | 16.0ms | 84.9MB | 96 B/op | — | 0.08× |
| 6 | ⚫ | Galerina governed ⟨interp⟩ | 3.7K/s | 0.3ms | 0.0ms | 84.3MB | 76.0 KB/op | — | 0.00× |
| 7 | ⚫ | Galerina manifest ⟨interp⟩ | 3.1K/s | 0.3ms | 0.0ms | 84.6MB | 75.1 KB/op | — | 0.00× |

> 🧠 **Lowest heap/op:** WASM ▶ production (~0) · **highest:** Galerina governed ⟨interp⟩ (76.0 KB/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### low-memory

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Rust AVX2 | 6.16B/s | 162.4ms | — | — | ~0 | 2.1K× | 8.61× |
| 🥈 | 🟢 | Rust (generic) | 1.35B/s | 739.2ms | — | — | ~0 | 452.5× | 1.89× |
| 🥉 | 🟢 | Node.js | 715.22M/s | 69.9ms | 93.0ms | 46.5MB | ~0 | 239.2× | 1.00× |
| 4 | ⚪ | WASM ▶ production | 466.90M/s | 1.01s | 1.01s | 87.4MB | ~0 | 156.2× | 0.65× |
| 5 | ⚫ | Python | 2.99M/s | 3.34s | 3.34s | — | ~0 | 1.00× | 0.00× |
| 6 | ⚫ | Galerina passive ⟨interp⟩ | 164.3K/s | 0.7ms | 0.0ms | 85.2MB | -3.3 KB/op | 0.05× | 0.00× |
| 7 | ⚫ | Galerina governed ⟨interp⟩ | 151.3K/s | 66.1ms | 79.0ms | 85.1MB | 62 B/op | 0.05× | 0.00× |
| 8 | ⚫ | Galerina manifest ⟨interp⟩ | 119.8K/s | 83.5ms | 171.0ms | 85.3MB | 45 B/op | 0.04× | 0.00× |

> 🧠 **Lowest heap/op:** Galerina passive ⟨interp⟩ (-3.3 KB/op) · **highest:** Galerina governed ⟨interp⟩ (62 B/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### gpu-compute

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Rust AVX2 | 1.18B/s | 4.24s | — | — | ~0 (native) | 177.9× | 1.20× |
| 🥈 | 🟢 | Rust (generic) | 1.18B/s | 4.24s | — | — | ~0 (native) | 177.8× | 1.20× |
| 🥉 | 🟢 | Node.js | 985.65M/s | 507.3ms | 515.0ms | 46.5MB | ~0 | 148.8× | 1.00× |
| 4 | 🟡 | WASM ▶ production | 469.73M/s | 1.06s | 1.06s | 88.8MB | ~0 | 70.9× | 0.48× |
| 5 | ⚫ | Python | 6.63M/s | 7.55s | 7.50s | — | ~0 | 1.00× | 0.01× |
| 6 | ⚫ | Deno WebGPU (NVIDIA GeForce RTX 2060) | 4.09M/s | 24.5ms | — | — | — | 0.62× | 0.00× |
| 7 | ⚫ | Galerina passive ⟨interp⟩ | 378.0K/s | 0.2ms | 0.0ms | 85.3MB | 2.3 KB/op | 0.06× | 0.00× |
| 8 | ⚫ | Galerina manifest ⟨interp⟩ | 330.4K/s | 302.6ms | 406.0ms | 85.2MB | 6 B/op | 0.05× | 0.00× |
| 9 | ⚫ | Galerina governed ⟨interp⟩ | 328.1K/s | 304.8ms | 328.0ms | 86.8MB | 7 B/op | 0.05× | 0.00× |

> 🧠 **Lowest heap/op:** WASM ▶ production (~0) · **highest:** Galerina passive ⟨interp⟩ (2.3 KB/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### matrix-multiply

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Deno WebGPU (NVIDIA GeForce RTX 2060) | 1.79B/s | 11.7ms | — | — | — | 271.4× | 2.90× |
| 🥈 | 🟢 | Rust (generic) | 1.51B/s | 86.7ms | — | — | ~0 (native) | 228.8× | 2.45× |
| 🥉 | 🟢 | Rust AVX2 | 1.40B/s | 93.7ms | — | — | ~0 (native) | 211.6× | 2.27× |
| 4 | 🟢 | Node.js | 617.52M/s | 212.3ms | 235.0ms | 48.3MB | ~0 | 93.4× | 1.00× |
| 5 | ⚪ | WASM ▶ production | 439.24M/s | 1.04s | 1.05s | 88.2MB | ~0 | 66.5× | 0.71× |
| 6 | 🔴 | Python | 6.61M/s | 1.98s | — | — | 8 B/op | 1.00× | 0.01× |
| 7 | ⚫ | Galerina passive ⟨interp⟩ | 871.0K/s | 0.2ms | 0.0ms | 87.1MB | -8.9 KB/op | 0.13× | 0.00× |
| 8 | ⚫ | Galerina governed ⟨interp⟩ | 717.5K/s | 45.7ms | 94.0ms | 85.4MB | 59 B/op | 0.11× | 0.00× |
| 9 | ⚫ | Galerina manifest ⟨interp⟩ | 656.0K/s | 50.0ms | 93.0ms | 87.1MB | 30 B/op | 0.10× | 0.00× |

> 🧠 **Lowest heap/op:** Galerina passive ⟨interp⟩ (-8.9 KB/op) · **highest:** Galerina governed ⟨interp⟩ (59 B/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### crypto-ops

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Galerina passive ⟨interp⟩ | 6.3K/s | 15.8ms | 15.0ms | 86.8MB | 5.8 KB/op | — | — |
| 🥈 | 🟡 | Galerina manifest ⟨interp⟩ | 1.9K/s | 0.5ms | 0.0ms | 85.6MB | 227.1 KB/op | — | — |
| 🥉 | 🔴 | Galerina governed ⟨interp⟩ | 171.0/s | 5.9ms | 0.0ms | 85.6MB | 313.8 KB/op | — | — |

> 🧠 **Lowest heap/op:** Galerina passive ⟨interp⟩ (5.8 KB/op) · **highest:** Galerina governed ⟨interp⟩ (313.8 KB/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### text-html

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Galerina passive ⟨interp⟩ | 52.1K/s | 1.9ms | 0.0ms | 85.8MB | -4.4 KB/op | — | — |
| 🥈 | 🔴 | Galerina manifest ⟨interp⟩ | 1.9K/s | 0.5ms | 0.0ms | 86.9MB | 145.2 KB/op | — | — |
| 🥉 | 🔴 | Galerina governed ⟨interp⟩ | 870.0/s | 1.1ms | 0.0ms | 86.9MB | 165.0 KB/op | — | — |

> 🧠 **Lowest heap/op:** Galerina passive ⟨interp⟩ (-4.4 KB/op) · **highest:** Galerina governed ⟨interp⟩ (165.0 KB/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### tri-logic

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Rust (generic) | 1.38B/s | 433.6ms | — | — | ~0 (native) | 198.5× | 1.40× |
| 🥈 | 🟢 | Rust AVX2 | 1.37B/s | 437.8ms | — | — | ~0 (native) | 196.6× | 1.38× |
| 🥉 | 🟢 | Node.js | 990.89M/s | 302.8ms | — | — | ~0 | 142.2× | 1.00× |
| 4 | 🟡 | WASM ▶ production | 462.81M/s | 1.30s | 1.30s | 88.7MB | ~0 | 66.4× | 0.47× |
| 5 | ⚫ | Python | 6.97M/s | 1.72s | — | — | — | 1.00× | 0.01× |
| 6 | ⚫ | Galerina passive ⟨interp⟩ | 336.0K/s | 2.0ms | 0.0ms | 88.0MB | 353 B/op | 0.05× | 0.00× |
| 7 | ⚫ | Galerina manifest ⟨interp⟩ | 328.1K/s | 914.4ms | 922.0ms | 88.0MB | 4 B/op | 0.05× | 0.00× |
| 8 | ⚫ | Galerina governed ⟨interp⟩ | 325.4K/s | 922.0ms | 1.00s | 87.7MB | 5 B/op | 0.05× | 0.00× |

> 🧠 **Lowest heap/op:** WASM ▶ production (~0) · **highest:** Galerina passive ⟨interp⟩ (353 B/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### data-query

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Node.js | 388.45M/s | 128.7ms | — | — | ~0 | 102.1× | 1.00× |
| 🥈 | ⚫ | Python | 3.80M/s | 788.6ms | — | — | — | 1.00× | 0.01× |
| 🥉 | ⚫ | Galerina passive ⟨interp⟩ | 262.1K/s | 1.1ms | 0.0ms | 88.8MB | 3.9 KB/op | 0.07× | 0.00× |
| 4 | ⚫ | Galerina governed ⟨interp⟩ | 204.8K/s | 48.8ms | 47.0ms | 88.8MB | 196 B/op | 0.05× | 0.00× |
| 5 | ⚫ | Galerina manifest ⟨interp⟩ | 183.6K/s | 54.5ms | 63.0ms | 87.8MB | 62 B/op | 0.05× | 0.00× |

> 🧠 **Lowest heap/op:** Node.js (~0) · **highest:** Galerina passive ⟨interp⟩ (3.9 KB/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### call-chain

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Node.js | 274.88M/s | 7.3ms | 0.0ms | 47.6MB | ~0 | 154.0× | 1.00× |
| 🥈 | 🟡 | WASM ▶ production | 53.92M/s | 1.85s | 1.86s | 89.5MB | ~0 | 30.2× | 0.20× |
| 🥉 | ⚫ | Python | 1.78M/s | 560.2ms | 562.5ms | — | ~0 | 1.00× | 0.01× |
| 4 | ⚫ | Galerina passive ⟨interp⟩ | 59.0K/s | 0.1ms | 0.0ms | 88.1MB | 12.3 KB/op | 0.03× | 0.00× |
| 5 | ⚫ | Galerina manifest ⟨interp⟩ | 56.4K/s | 886.6ms | 984.0ms | 88.1MB | 41 B/op | 0.03× | 0.00× |
| 6 | ⚫ | Galerina governed ⟨interp⟩ | 56.3K/s | 888.0ms | 953.0ms | 88.1MB | 21 B/op | 0.03× | 0.00× |

> 🧠 **Lowest heap/op:** WASM ▶ production (~0) · **highest:** Galerina passive ⟨interp⟩ (12.3 KB/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### nbody

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Node.js | 121.33M/s | 54.0ms | 47.0ms | 48.8MB | ~0 | 119.9× | 1.00× |
| 🥈 | 🟡 | WASM ▶ production | 28.89M/s | 1.13s | 1.14s | 88.8MB | ~0 | 28.6× | 0.24× |
| 🥉 | ⚫ | Python | 1.01M/s | 1.62s | — | — | 12 B/op | 1.00× | 0.01× |
| 4 | ⚫ | Galerina governed ⟨interp⟩ | 63.6K/s | 514.9ms | 563.0ms | 88.0MB | 23 B/op | 0.06× | 0.00× |
| 5 | ⚫ | Galerina passive ⟨interp⟩ | 63.2K/s | 0.3ms | 0.0ms | 88.2MB | -97.0 KB/op | 0.06× | 0.00× |
| 6 | ⚫ | Galerina manifest ⟨interp⟩ | 61.5K/s | 532.6ms | 563.0ms | 88.2MB | 10 B/op | 0.06× | 0.00× |

> 🧠 **Lowest heap/op:** Galerina passive ⟨interp⟩ (-97.0 KB/op) · **highest:** Galerina governed ⟨interp⟩ (23 B/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### json-parse

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Node.js | 3.38M/s | — | — | — | — | 7.62× | 1.00× |
| 🥈 | 🟡 | Python | 443.5K/s | — | — | — | 1 B/op | 1.00× | 0.13× |
| 🥉 | ⚫ | Galerina passive ⟨interp⟩ | 9.7K/s | 0.6ms | 0.0ms | 94.4MB | -605.7 KB/op | 0.02× | 0.00× |
| 4 | ⚫ | Galerina governed ⟨interp⟩ | 5.6K/s | 88.9ms | 141.0ms | 95.2MB | 3.1 KB/op | 0.01× | 0.00× |
| 5 | ⚫ | Galerina manifest ⟨interp⟩ | 4.9K/s | 102.2ms | 156.0ms | 87.9MB | 8.7 KB/op | 0.01× | 0.00× |

> 🧠 **Lowest heap/op:** Galerina passive ⟨interp⟩ (-605.7 KB/op) · **highest:** Galerina manifest ⟨interp⟩ (8.7 KB/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### mandelbrot

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Rust (generic) | 23.43M/s | 139.9ms | — | — | ~0 (native) | 160.1× | 3.75× |
| 🥈 | 🟢 | Rust AVX2 | 23.29M/s | 140.7ms | — | — | ~0 (native) | 159.2× | 3.73× |
| 🥉 | 🟢 | WASM ▶ production | 8.98M/s | 1.82s | 1.81s | 95.0MB | ~0 | 61.4× | 1.44× |
| 4 | 🟢 | Node.js | 6.24M/s | 524.8ms | 547.0ms | 48.5MB | ~0 | 42.7× | 1.00× |
| 5 | 🔴 | Python | 146.3K/s | 22.39s | — | — | ~0 | 1.00× | 0.02× |
| 6 | ⚫ | Galerina passive ⟨interp⟩ | 7.5K/s | 0.2ms | 0.0ms | 90.5MB | 111.5 KB/op | 0.05× | 0.00× |
| 7 | ⚫ | Galerina governed ⟨interp⟩ | 7.5K/s | 2.19s | 2.20s | 90.3MB | 78 B/op | 0.05× | 0.00× |
| 8 | ⚫ | Galerina manifest ⟨interp⟩ | 7.4K/s | 2.22s | 2.20s | 90.5MB | 138 B/op | 0.05× | 0.00× |

> 🧠 **Lowest heap/op:** WASM ▶ production (~0) · **highest:** Galerina passive ⟨interp⟩ (111.5 KB/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### spectral-norm

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Rust (generic) | 372.34M/s | 26.9ms | — | — | ~0 (native) | 231.5× | 1.54× |
| 🥈 | 🟢 | Rust AVX2 | 360.18M/s | 27.8ms | — | — | ~0 (native) | 224.0× | 1.49× |
| 🥉 | 🟢 | Node.js | 241.41M/s | 41.4ms | 31.0ms | 48.4MB | ~0 | 150.1× | 1.00× |
| 4 | ⚫ | Python | 1.61M/s | 6.22s | — | — | ~0 | 1.00× | 0.01× |

> 🧠 **Lowest heap/op:** Python (~0) · **highest:** Node.js (~0). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### binary-trees

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | WASM ▶ production | 586.20M/s | 1.16s | 1.16s | 92.7MB | ~0 | 202.8× | 7.41× |
| 🥈 | 🟢 | Node.js | 79.09M/s | 1.7ms | 0.0ms | 48.5MB | 3 B/op | 27.4× | 1.00× |
| 🥉 | 🟡 | Rust AVX2 | 20.29M/s | 6.7ms | — | — | ~0 (native) | 7.02× | 0.26× |
| 4 | 🟡 | Rust (generic) | 16.48M/s | 8.2ms | — | — | ~0 (native) | 5.70× | 0.21× |
| 5 | 🔴 | Python | 2.89M/s | 47.0ms | 46.9ms | — | ~0 | 1.00× | 0.04× |
| 6 | ⚫ | Galerina passive ⟨interp⟩ | 392.6K/s | 0.1ms | 0.0ms | 90.5MB | 1.8 KB/op | 0.14× | 0.00× |
| 7 | ⚫ | Galerina manifest ⟨interp⟩ | 351.1K/s | 386.9ms | 406.0ms | 90.5MB | 12 B/op | 0.12× | 0.00× |
| 8 | ⚫ | Galerina governed ⟨interp⟩ | 344.4K/s | 394.5ms | 454.0ms | 91.0MB | 7 B/op | 0.12× | 0.00× |

> 🧠 **Lowest heap/op:** Python (~0) · **highest:** Galerina passive ⟨interp⟩ (1.8 KB/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### spore-container

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Rust (generic) | 162.6K/s | 1.85s | — | — | ~0 (native) | 2.54× | 3.57× |
| 🥈 | 🟢 | Rust AVX2 | 159.1K/s | 1.89s | — | — | ~0 (native) | 2.48× | 3.49× |
| 🥉 | 🟢 | Python | 64.1K/s | 1.56s | — | — | ~0 | 1.00× | 1.41× |
| 4 | 🟢 | Node.js | 45.5K/s | 6.59s | 7.81s | 63.7MB | 5 B/op | 0.71× | 1.00× |

> 🧠 **Lowest heap/op:** Python (~0) · **highest:** Node.js (5 B/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### framework-pipeline

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Python | 106.8K/s | 1.87s | — | — | ~0 | 1.00× | — |

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
| 🥈 | 🟢 | Rust (generic) | 🖥️ CPU (cpu (serial)) | 1.18B/s | 4.24s | 1.20× |
| 🥉 | 🟢 | Node.js | 🖥️ CPU (cpu (serial)) | 985.65M/s | 507.3ms | 1.00× |
| 4 | 🟡 | WASM ▶ production | 🖥️ CPU (cpu (wasm)) | 469.73M/s | 1.06s | 0.48× |
| 5 | ⚫ | Python | 🖥️ CPU (cpu (serial)) | 6.63M/s | 7.55s | 0.01× |
| 6 | ⚫ | Deno WebGPU (NVIDIA GeForce RTX 2060) | 🎮 GPU (gpu (WebGPU — NVIDIA GeForce RTX 2060)) | 4.09M/s | 24.5ms | 0.00× |
| 7 | ⚫ | Galerina passive ⟨interp⟩ | 🖥️ CPU (cpu) | 378.0K/s | 0.2ms | 0.00× |
| 8 | ⚫ | Galerina manifest ⟨interp⟩ | 🖥️ CPU (cpu) | 330.4K/s | 302.6ms | 0.00× |
| 9 | ⚫ | Galerina governed ⟨interp⟩ | 🖥️ CPU (cpu) | 328.1K/s | 304.8ms | 0.00× |

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
| **compute-mix** | Node.js | **🏆 winner** | **🏆 winner** | **🏆 winner** | **188× slower** | **60× slower** | **74× slower** | **81× slower** | 2× slower | not run — no GPU path |
| **arithmetic-threshold** | Rust (generic) | **🏆 winner** | **🏆 winner** | 2× slower | **410× slower** | **54.8K× slower** | **293× slower** | **296× slower** | 3× slower | not run — no GPU path |
| **six-digit-guess** | Rust (generic) | 1.2× slower | **🏆 winner** | **28× slower** | **831× slower** | **3.5K× slower** | **1.6K× slower** | **1.9K× slower** | 2× slower | not run — no GPU path |
| **record-allocation** | Rust (generic) | 1.2× slower | **🏆 winner** | **21× slower** | **401× slower** | **139× slower** | **445× slower** | **493× slower** | 2× slower | not run — no GPU path |
| **fibonacci-recursive** | Galerina passive ⟨interp⟩ | **104× slower** | **104× slower** | **408× slower** | **12.3K× slower** | **🏆 winner** | **3.0K× slower** | **4.3K× slower** | 3× slower | not run — no GPU path |
| **tower-of-hanoi** | Rust AVX2 | **🏆 winner** | **🏆 winner** | 2× slower | **97× slower** | **2.5K× slower** | **2.5K× slower** | **2.6K× slower** | 2× slower | not run — no GPU path |
| **collection-pipeline** | Rust AVX2 | **🏆 winner** | 3× slower | **188× slower** | **1.0K× slower** | **1.6K× slower** | **6.7K× slower** | **5.7K× slower** | **31× slower** | not run — no GPU path |
| **hardware-targets** | WASM ▶ production | **32× slower** | **32× slower** | **41× slower** | not run | **534× slower** | **11.9K× slower** | **10.0K× slower** | **🏆 winner** | not run — no GPU path |
| **low-memory** | Rust AVX2 | **🏆 winner** | 5× slower | 9× slower | **2.1K× slower** | **37.5K× slower** | **51.4K× slower** | **40.7K× slower** | **13× slower** | not run — no GPU path |
| **gpu-compute** | Rust AVX2 | **🏆 winner** | **🏆 winner** | 1.2× slower | **178× slower** | **3.1K× slower** | **3.6K× slower** | **3.6K× slower** | 3× slower | **288× slower** |
| **matrix-multiply** | Deno WebGPU (NVIDIA GeForce RTX 2060) | 1.3× slower | 1.2× slower | 3× slower | **271× slower** | **2.1K× slower** | **2.7K× slower** | **2.5K× slower** | 4× slower | **🏆 winner** |
| **crypto-ops** | Galerina passive ⟨interp⟩ | no comparable metric | no comparable metric | no comparable metric | no comparable metric | **🏆 winner** | 3× slower | **37× slower** | no WASM — strings/records | not run — no GPU path |
| **text-html** | Galerina passive ⟨interp⟩ | no comparable metric | no comparable metric | no comparable metric | no comparable metric | **🏆 winner** | **28× slower** | **60× slower** | no WASM — strings/records | not run — no GPU path |
| **tri-logic** | Rust (generic) | **🏆 winner** | **🏆 winner** | 1.4× slower | **199× slower** | **4.1K× slower** | **4.2K× slower** | **4.3K× slower** | 3× slower | not run — no GPU path |
| **data-query** | Node.js | not run — no native impl | not run — no native impl | **🏆 winner** | **102× slower** | **1.5K× slower** | **2.1K× slower** | **1.9K× slower** | no WASM build | not run — no GPU path |
| **call-chain** | Node.js | not run — no native impl | not run — no native impl | **🏆 winner** | **154× slower** | **4.7K× slower** | **4.9K× slower** | **4.9K× slower** | 5× slower | not run — no GPU path |
| **nbody** | Node.js | not run — no native impl | not run — no native impl | **🏆 winner** | **120× slower** | **1.9K× slower** | **2.0K× slower** | **1.9K× slower** | 4× slower | not run — no GPU path |
| **json-parse** | Node.js | not run — no native impl | not run — no native impl | **🏆 winner** | 8× slower | **347× slower** | **690× slower** | **600× slower** | no WASM — strings/records | not run — no GPU path |
| **mandelbrot** | Rust (generic) | **🏆 winner** | **🏆 winner** | 4× slower | **160× slower** | **3.1K× slower** | **3.2K× slower** | **3.1K× slower** | 3× slower | not run — no GPU path |
| **spectral-norm** | Rust (generic) | **🏆 winner** | **🏆 winner** | 2× slower | **232× slower** | not run | not run | not run | no WASM build | not run — no GPU path |
| **binary-trees** | WASM ▶ production | **29× slower** | **36× slower** | 7× slower | **203× slower** | **1.5K× slower** | **1.7K× slower** | **1.7K× slower** | **🏆 winner** | not run — no GPU path |
| **spore-container** | Rust (generic) | **🏆 winner** | **🏆 winner** | 4× slower | 3× slower | not run | not run | not run | no WASM — strings/records | not run — no GPU path |
| **framework-pipeline** | Python | not run — no native impl | not run — no native impl | not run | **🏆 winner** | not run | not run | not run | no WASM — strings/records | not run — no GPU path |

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
| 🥇 | Node.js | 134.71M/s | 🏆 winner | 188× faster |
| 🥈 | Rust (generic) | 130.65M/s | 1.0× slower | 183× faster |
| 🥉 | Rust AVX2 | 129.61M/s | 1.0× slower | 181× faster |
| 4 | WASM ▶ production | 77.19M/s | 1.7× slower | 108× faster |
| 5 | Galerina passive ⟨interp⟩ ⚠️cache | 2.25M/s | 60× slower | 3.1× faster |
| 6 | Galerina manifest ⟨interp⟩ | 1.81M/s | 74× slower | 2.5× faster |
| 7 | Galerina governed ⟨interp⟩ | 1.67M/s | 81× slower | 2.3× faster |
| 8 | Python | 714.7K/s | 188× slower | — (slowest) |

### arithmetic-threshold
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | Rust (generic) | 1.56B/s | 🏆 winner | 54.8K× faster |
| 🥈 | Rust AVX2 | 1.56B/s | 1.0× slower | 54.7K× faster |
| 🥉 | Node.js | 975.45M/s | 1.6× slower | 34.1K× faster |
| 4 | WASM ▶ production | 488.53M/s | 3.2× slower | 17.1K× faster |
| 5 | Galerina manifest ⟨interp⟩ | 5.34M/s | 293× slower | 187× faster |
| 6 | Galerina governed ⟨interp⟩ | 5.28M/s | 296× slower | 185× faster |
| 7 | Python | 3.82M/s | 410× slower | 134× faster |
| 8 | Galerina passive ⟨interp⟩ ⚠️cache | 28.6K/s | 54.8K× slower | — (slowest) |

### six-digit-guess
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | Rust (generic) | 78.07M/s | 🏆 winner | 3.5K× faster |
| 🥈 | Rust AVX2 | 65.23M/s | 1.2× slower | 2.9K× faster |
| 🥉 | WASM ▶ production | 36.41M/s | 2.1× slower | 1.6K× faster |
| 4 | Node.js | 2.79M/s | 28× slower | 124× faster |
| 5 | Python | 94.0K/s | 831× slower | 4.2× faster |
| 6 | Galerina manifest ⟨interp⟩ | 49.3K/s | 1.6K× slower | 2.2× faster |
| 7 | Galerina governed ⟨interp⟩ | 41.5K/s | 1.9K× slower | 1.9× faster |
| 8 | Galerina passive ⟨interp⟩ ⚠️cache | 22.4K/s | 3.5K× slower | — (slowest) |

### record-allocation
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | Rust (generic) | 1.17B/s | 🏆 winner | 493× faster |
| 🥈 | Rust AVX2 | 944.81M/s | 1.2× slower | 397× faster |
| 🥉 | WASM ▶ production | 551.83M/s | 2.1× slower | 232× faster |
| 4 | Node.js | 56.02M/s | 21× slower | 24× faster |
| 5 | Galerina passive ⟨interp⟩ ⚠️cache | 8.43M/s | 139× slower | 3.5× faster |
| 6 | Python | 2.93M/s | 401× slower | 1.2× faster |
| 7 | Galerina manifest ⟨interp⟩ | 2.64M/s | 445× slower | 1.1× faster |
| 8 | Galerina governed ⟨interp⟩ | 2.38M/s | 493× slower | — (slowest) |

### fibonacci-recursive
> 🏆 cache-hit "winner" is Galerina passive (memoised); **real compute winner: WASM ▶ production at 17.0K/s**.
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | Galerina passive ⟨interp⟩ ⚠️cache | 51.7K/s | 🏆 winner | 12.3K× faster |
| 🥈 | WASM ▶ production | 17.0K/s | 3.0× slower | 4.0K× faster |
| 🥉 | Rust (generic) | 499.2/s | 104× slower | 119× faster |
| 4 | Rust AVX2 | 498.3/s | 104× slower | 118× faster |
| 5 | Node.js | 126.8/s | 408× slower | 30× faster |
| 6 | Galerina manifest ⟨interp⟩ | 17.0/s | 3.0K× slower | 4.0× faster |
| 7 | Galerina governed ⟨interp⟩ | 12.0/s | 4.3K× slower | 2.9× faster |
| 8 | Python | 4.2/s | 12.3K× slower | — (slowest) |

### tower-of-hanoi
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | Rust AVX2 | 251.93M/s | 🏆 winner | 2.6K× faster |
| 🥈 | Rust (generic) | 251.71M/s | 1.0× slower | 2.5K× faster |
| 🥉 | Node.js | 129.72M/s | 1.9× slower | 1.3K× faster |
| 4 | WASM ▶ production | 120.64M/s | 2.1× slower | 1.2K× faster |
| 5 | Python | 2.59M/s | 97× slower | 26× faster |
| 6 | Galerina passive ⟨interp⟩ ⚠️cache | 100.3K/s | 2.5K× slower | 1.0× faster |
| 7 | Galerina manifest ⟨interp⟩ | 98.9K/s | 2.5K× slower | 1.0× faster |
| 8 | Galerina governed ⟨interp⟩ | 98.8K/s | 2.6K× slower | — (slowest) |

### collection-pipeline
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | Rust AVX2 | 13.10B/s | 🏆 winner | 6.7K× faster |
| 🥈 | Rust (generic) | 4.29B/s | 3.1× slower | 2.2K× faster |
| 🥉 | WASM ▶ production | 416.11M/s | 31× slower | 214× faster |
| 4 | Node.js | 69.82M/s | 188× slower | 36× faster |
| 5 | Python | 12.86M/s | 1.0K× slower | 6.6× faster |
| 6 | Galerina passive ⟨interp⟩ ⚠️cache | 8.15M/s | 1.6K× slower | 4.2× faster |
| 7 | Galerina governed ⟨interp⟩ | 2.30M/s | 5.7K× slower | 1.2× faster |
| 8 | Galerina manifest ⟨interp⟩ | 1.95M/s | 6.7K× slower | — (slowest) |

### hardware-targets
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | WASM ▶ production | 37.05M/s | 🏆 winner | 11.9K× faster |
| 🥈 | Rust (generic) | 1.17M/s | 32× slower | 376× faster |
| 🥉 | Rust AVX2 | 1.17M/s | 32× slower | 374× faster |
| 4 | Node.js | 908.3K/s | 41× slower | 291× faster |
| 5 | Galerina passive ⟨interp⟩ ⚠️cache | 69.3K/s | 534× slower | 22× faster |
| 6 | Galerina governed ⟨interp⟩ | 3.7K/s | 10.0K× slower | 1.2× faster |
| 7 | Galerina manifest ⟨interp⟩ | 3.1K/s | 11.9K× slower | — (slowest) |

### low-memory
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | Rust AVX2 | 6.16B/s | 🏆 winner | 51.4K× faster |
| 🥈 | Rust (generic) | 1.35B/s | 4.6× slower | 11.3K× faster |
| 🥉 | Node.js | 715.22M/s | 8.6× slower | 6.0K× faster |
| 4 | WASM ▶ production | 466.90M/s | 13× slower | 3.9K× faster |
| 5 | Python | 2.99M/s | 2.1K× slower | 25× faster |
| 6 | Galerina passive ⟨interp⟩ ⚠️cache | 164.3K/s | 37.5K× slower | 1.4× faster |
| 7 | Galerina governed ⟨interp⟩ | 151.3K/s | 40.7K× slower | 1.3× faster |
| 8 | Galerina manifest ⟨interp⟩ | 119.8K/s | 51.4K× slower | — (slowest) |

### gpu-compute
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | Rust AVX2 | 1.18B/s | 🏆 winner | 3.6K× faster |
| 🥈 | Rust (generic) | 1.18B/s | 1.0× slower | 3.6K× faster |
| 🥉 | Node.js | 985.65M/s | 1.2× slower | 3.0K× faster |
| 4 | WASM ▶ production | 469.73M/s | 2.5× slower | 1.4K× faster |
| 5 | Python | 6.63M/s | 178× slower | 20× faster |
| 6 | Deno WebGPU (NVIDIA GeForce RTX 2060) | 4.09M/s | 288× slower | 12× faster |
| 7 | Galerina passive ⟨interp⟩ ⚠️cache | 378.0K/s | 3.1K× slower | 1.2× faster |
| 8 | Galerina manifest ⟨interp⟩ | 330.4K/s | 3.6K× slower | 1.0× faster |
| 9 | Galerina governed ⟨interp⟩ | 328.1K/s | 3.6K× slower | — (slowest) |

### matrix-multiply
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | Deno WebGPU (NVIDIA GeForce RTX 2060) | 1.79B/s | 🏆 winner | 2.7K× faster |
| 🥈 | Rust (generic) | 1.51B/s | 1.2× slower | 2.3K× faster |
| 🥉 | Rust AVX2 | 1.40B/s | 1.3× slower | 2.1K× faster |
| 4 | Node.js | 617.52M/s | 2.9× slower | 941× faster |
| 5 | WASM ▶ production | 439.24M/s | 4.1× slower | 670× faster |
| 6 | Python | 6.61M/s | 271× slower | 10× faster |
| 7 | Galerina passive ⟨interp⟩ ⚠️cache | 871.0K/s | 2.1K× slower | 1.3× faster |
| 8 | Galerina governed ⟨interp⟩ | 717.5K/s | 2.5K× slower | 1.1× faster |
| 9 | Galerina manifest ⟨interp⟩ | 656.0K/s | 2.7K× slower | — (slowest) |

### crypto-ops
> 🏆 cache-hit "winner" is Galerina passive (memoised); **real compute winner: Galerina manifest ⟨interp⟩ at 1.9K/s**.
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | Galerina passive ⟨interp⟩ ⚠️cache | 6.3K/s | 🏆 winner | 37× faster |
| 🥈 | Galerina manifest ⟨interp⟩ | 1.9K/s | 3.4× slower | 11× faster |
| 🥉 | Galerina governed ⟨interp⟩ | 171.0/s | 37× slower | — (slowest) |

### text-html
> 🏆 cache-hit "winner" is Galerina passive (memoised); **real compute winner: Galerina manifest ⟨interp⟩ at 1.9K/s**.
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | Galerina passive ⟨interp⟩ ⚠️cache | 52.1K/s | 🏆 winner | 60× faster |
| 🥈 | Galerina manifest ⟨interp⟩ | 1.9K/s | 28× slower | 2.1× faster |
| 🥉 | Galerina governed ⟨interp⟩ | 870.0/s | 60× slower | — (slowest) |

### tri-logic
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | Rust (generic) | 1.38B/s | 🏆 winner | 4.3K× faster |
| 🥈 | Rust AVX2 | 1.37B/s | 1.0× slower | 4.2K× faster |
| 🥉 | Node.js | 990.89M/s | 1.4× slower | 3.0K× faster |
| 4 | WASM ▶ production | 462.81M/s | 3.0× slower | 1.4K× faster |
| 5 | Python | 6.97M/s | 199× slower | 21× faster |
| 6 | Galerina passive ⟨interp⟩ ⚠️cache | 336.0K/s | 4.1K× slower | 1.0× faster |
| 7 | Galerina manifest ⟨interp⟩ | 328.1K/s | 4.2K× slower | 1.0× faster |
| 8 | Galerina governed ⟨interp⟩ | 325.4K/s | 4.3K× slower | — (slowest) |

### data-query
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | Node.js | 388.45M/s | 🏆 winner | 2.1K× faster |
| 🥈 | Python | 3.80M/s | 102× slower | 21× faster |
| 🥉 | Galerina passive ⟨interp⟩ ⚠️cache | 262.1K/s | 1.5K× slower | 1.4× faster |
| 4 | Galerina governed ⟨interp⟩ | 204.8K/s | 1.9K× slower | 1.1× faster |
| 5 | Galerina manifest ⟨interp⟩ | 183.6K/s | 2.1K× slower | — (slowest) |

### call-chain
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | Node.js | 274.88M/s | 🏆 winner | 4.9K× faster |
| 🥈 | WASM ▶ production | 53.92M/s | 5.1× slower | 958× faster |
| 🥉 | Python | 1.78M/s | 154× slower | 32× faster |
| 4 | Galerina passive ⟨interp⟩ ⚠️cache | 59.0K/s | 4.7K× slower | 1.0× faster |
| 5 | Galerina manifest ⟨interp⟩ | 56.4K/s | 4.9K× slower | 1.0× faster |
| 6 | Galerina governed ⟨interp⟩ | 56.3K/s | 4.9K× slower | — (slowest) |

### nbody
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | Node.js | 121.33M/s | 🏆 winner | 2.0K× faster |
| 🥈 | WASM ▶ production | 28.89M/s | 4.2× slower | 470× faster |
| 🥉 | Python | 1.01M/s | 120× slower | 16× faster |
| 4 | Galerina governed ⟨interp⟩ | 63.6K/s | 1.9K× slower | 1.0× faster |
| 5 | Galerina passive ⟨interp⟩ ⚠️cache | 63.2K/s | 1.9K× slower | 1.0× faster |
| 6 | Galerina manifest ⟨interp⟩ | 61.5K/s | 2.0K× slower | — (slowest) |

### json-parse
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | Node.js | 3.38M/s | 🏆 winner | 690× faster |
| 🥈 | Python | 443.5K/s | 7.6× slower | 91× faster |
| 🥉 | Galerina passive ⟨interp⟩ ⚠️cache | 9.7K/s | 347× slower | 2.0× faster |
| 4 | Galerina governed ⟨interp⟩ | 5.6K/s | 600× slower | 1.1× faster |
| 5 | Galerina manifest ⟨interp⟩ | 4.9K/s | 690× slower | — (slowest) |

### mandelbrot
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | Rust (generic) | 23.43M/s | 🏆 winner | 3.2K× faster |
| 🥈 | Rust AVX2 | 23.29M/s | 1.0× slower | 3.2K× faster |
| 🥉 | WASM ▶ production | 8.98M/s | 2.6× slower | 1.2K× faster |
| 4 | Node.js | 6.24M/s | 3.8× slower | 845× faster |
| 5 | Python | 146.3K/s | 160× slower | 20× faster |
| 6 | Galerina passive ⟨interp⟩ ⚠️cache | 7.5K/s | 3.1K× slower | 1.0× faster |
| 7 | Galerina governed ⟨interp⟩ | 7.5K/s | 3.1K× slower | 1.0× faster |
| 8 | Galerina manifest ⟨interp⟩ | 7.4K/s | 3.2K× slower | — (slowest) |

### spectral-norm
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | Rust (generic) | 372.34M/s | 🏆 winner | 232× faster |
| 🥈 | Rust AVX2 | 360.18M/s | 1.0× slower | 224× faster |
| 🥉 | Node.js | 241.41M/s | 1.5× slower | 150× faster |
| 4 | Python | 1.61M/s | 232× slower | — (slowest) |

### binary-trees
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | WASM ▶ production | 586.20M/s | 🏆 winner | 1.7K× faster |
| 🥈 | Node.js | 79.09M/s | 7.4× slower | 230× faster |
| 🥉 | Rust AVX2 | 20.29M/s | 29× slower | 59× faster |
| 4 | Rust (generic) | 16.48M/s | 36× slower | 48× faster |
| 5 | Python | 2.89M/s | 203× slower | 8.4× faster |
| 6 | Galerina passive ⟨interp⟩ ⚠️cache | 392.6K/s | 1.5K× slower | 1.1× faster |
| 7 | Galerina manifest ⟨interp⟩ | 351.1K/s | 1.7K× slower | 1.0× faster |
| 8 | Galerina governed ⟨interp⟩ | 344.4K/s | 1.7K× slower | — (slowest) |

### spore-container
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | Rust (generic) | 162.6K/s | 🏆 winner | 3.6× faster |
| 🥈 | Rust AVX2 | 159.1K/s | 1.0× slower | 3.5× faster |
| 🥉 | Python | 64.1K/s | 2.5× slower | 1.4× faster |
| 4 | Node.js | 45.5K/s | 3.6× slower | — (slowest) |

### framework-pipeline
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | Python | 106.8K/s | 🏆 winner | — (slowest) |


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

