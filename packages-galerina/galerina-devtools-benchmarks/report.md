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
| compute-mix | 76.54M/s | ⚪ 1.7× slower | ⚪ 1.8× slower | 1.66M/s | WASM near native |
| arithmetic-threshold | 487.46M/s | UNCERTIFIED | UNCERTIFIED | 5.26M/s | not yet work-equivalence-certified (N/work mismatch) |
| six-digit-guess | 36.06M/s | UNCERTIFIED | UNCERTIFIED | 45.9K/s | not yet work-equivalence-certified (N/work mismatch) |
| fibonacci-recursive | 17.1K/s | UNCERTIFIED | UNCERTIFIED | 13.0/s | not yet work-equivalence-certified (N/work mismatch) |
| tower-of-hanoi | 121.28M/s | 🟡 2.1× slower | 🟢 1.1× slower | 98.1K/s | WASM usable |
| hardware-targets | 37.68M/s | UNCERTIFIED | UNCERTIFIED | 2.3K/s | not yet work-equivalence-certified (N/work mismatch) |
| matrix-multiply | 431.53M/s | 🟡 3.5× slower | ⚪ 1.4× slower | 680.4K/s | WASM usable |
| tri-logic | 462.00M/s | 🟡 3.0× slower | 🟡 2.1× slower | 328.9K/s | WASM usable |
| data-query | no WASM build | — | — | 201.4K/s | WASM not built for this lane yet |
| call-chain | 54.45M/s | — | 🟡 5.8× slower | 55.2K/s | WASM 2–10× under Node |
| nbody | 29.09M/s | — | 🟡 4.2× slower | 61.9K/s | WASM 2–10× under Node |
| mandelbrot | 8.88M/s | 🟡 2.6× slower | 🟢 1.4× | 7.6K/s | WASM usable |
| spectral-norm | no WASM build | — | — | not run | WASM not built for this lane yet |

> 🚦 🟢 ≥0.9 (≈native) · ⚪ ≥0.5 (within 2×) · 🟡 ≥0.1 (2–10× slower) · 🔴 ≥0.01 (10–100×) · ⚫ <0.01 (100×+).
> **Ceiling (fastest certified lane):** Deno WebGPU (NVIDIA GeForce RTX 2060) — 1.75B/s on matrix-multiply.

### Memory — heap bytes per operation (the honest metric; lower is better)

> Ranked by **bytes/op**, NOT throughput — these benchmarks measure allocation, so no cross-runtime
> throughput ratio (and no ⚫) is shown. Native Rust/C++ allocate off the GC heap (~0 native — see §2b/§4).

| Benchmark | 🏆 Best (lowest heap B/op) | Node.js | Python | WASM ▶ production | Galerina governed ⟨interp⟩ | Galerina manifest ⟨interp⟩ |
|---|---|---|---|---|---|---|
| record-allocation | **WASM ▶ production** (~0) | ~0 | ~0 | ~0 | 6 B/op | 8 B/op |
| collection-pipeline | **WASM ▶ production** (~0) | ~0 | ~0 | ~0 | 17 B/op | 14 B/op |
| low-memory | **Node.js** (~0) | ~0 | ~0 | ~0 | 41 B/op | 41 B/op |
| binary-trees | **Python** (~0) | 3 B/op | ~0 | ~0 | 8 B/op | 12 B/op |

> **No throughput ratio, no ⚫ here** — a memory benchmark ranked by throughput is exactly the
> cross-metric bug this section removes. record-allocation / binary-trees / collection-pipeline live
> here by bytes/op, so they no longer carry the ◇ shape-only marker; their shape rate is in §4.

### GPU — kernel-evals/s (GPU-shaped workload; matrix-multiply dual-homes here)

> Cross-runtime. Deno WebGPU is the only real-dispatch path; where it produced no number on this
> machine it shows **⏳ GPU pending** — the honest status, never a fabricated GPU rate.

| Benchmark | 🏆 Winner | Speed | WASM ▶ production | GPU (Deno WebGPU) | vs Node (WASM) | Implication |
|---|---|---|---|---|---|---|
| gpu-compute | Rust AVX2 | 1.18B/s | 465.91M/s | 4.05M/s | 🟡 2.1× slower | CPU/WASM lanes lead — real GPU dispatch pending (see §4b) |
| matrix-multiply | Deno WebGPU (NVIDIA GeForce RTX 2060) | 1.75B/s | 431.53M/s | 1.75B/s | ⚪ 1.4× slower | real GPU dispatch wins |

> **vs Node (WASM)** compares the WASM ▶ production lane to Node.js on the kernel. matrix-multiply also
> appears in the CPU Throughput table (dual-home) — it has both a compute lane and a WebGPU lane.

### I/O & DevTools — native units per benchmark (raw rate; NOT inner-op normalised)

> Each benchmark has its OWN unit, so there is **no cross-runtime ratio** — the winner is the fastest
> lane by raw rate WITHIN that benchmark's native unit. Comparing rates ACROSS benchmarks is meaningless.

| Benchmark | Unit (native) | 🏆 Fastest lane | Node.js | Python | Rust (generic) | WASM ▶ production | Galerina governed ⟨interp⟩ |
|---|---|---|---|---|---|---|---|
| crypto-ops | ops/s | **Galerina governed ⟨interp⟩** (190.0/s) | no comparable metric | no comparable metric | no comparable metric | no WASM — strings/records | 190.0/s |
| text-html | ops/s | **Galerina governed ⟨interp⟩** (990.0/s) | no comparable metric | no comparable metric | no comparable metric | no WASM — strings/records | 990.0/s |
| json-parse | records/s | **Node.js** (3.02M/s) | 3.02M/s | 500.5K/s | not run — no native impl | no WASM — strings/records | 5.3K/s |
| spore-container | containers/s | **Rust (generic)** (126.9K/s) | 43.1K/s | 70.0K/s | 126.9K/s | no WASM — strings/records | not run |
| framework-pipeline | requests/s | **Python** (117.5K/s) | not run | 117.5K/s | not run — no native impl | no WASM — strings/records | not run |
| http-throughput | requests/s | **Node.js** (3.4K/s) | 3.4K/s | not run | not run — no native impl | no WASM build | not run |
| naming-check | files/s | **Node.js** (7.2K/s) | 7.2K/s | not run | not run — no native impl | no WASM build | not run |
| context-receipt | receipts/s | **Node.js** (18.5K/s) | 18.5K/s | not run | not run — no native impl | no WASM build | not run |
| intelligence-search | queries/s | **Node.js** (107.5K/s) | 107.5K/s | not run | not run — no native impl | no WASM build | not run |
| provenance-trace | files/s | **Node.js** (766.0/s) | 766.0/s | not run | not run — no native impl | no WASM build | not run |

> Values are native rates (records/s, containers/s, requests/s, files/s, …), shown for transparency —
> NOT a cross-runtime ranking. The inner-op-normalised throughput lives in the CPU table above.

### Governance — Galerina-internal tier ratio ONLY (NO native column)

> This table's columns are Galerina tiers ONLY — there is **no rust/node/python/cpp column**, so a
> cross-runtime `N× slower` is structurally impossible here. The old six-figure governance-cost artifact
> came from dividing the governed tier by a native rate — a division this table cannot express.

| Benchmark | Galerina governed ⟨interp⟩ | Galerina manifest ⟨interp⟩ | WASM ▶ production | governed/manifest (gov overhead) |
|---|---|---|---|---|
| governance-cost | 697.0/s | 847.0/s | 2.87M/s | 0.82× governed/manifest (gov overhead ≈ 1.22×) |

> **governed/manifest** is governance-cost's honest headline: the same-N cost of always-on governance
> (capabilities + audit + proof) vs the pre-verified manifest. `gov overhead` = manifest ÷ governed.


### Full Throughput Table (all runtimes)

| Benchmark | Rust AVX-512 | Rust AVX2 | Rust (generic) | C++ | Node.js | Python | Galerina passive ⟨interp⟩ | Galerina manifest ⟨interp⟩ | Galerina governed ⟨interp⟩ | WASM ▶ production | Deno WebGPU (NVIDIA GeForce RTX 2060) | Node/Galerina† (🖥️ CPU) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| compute-mix | not run — no AVX-512 | **129.26M/s** | **131.80M/s** | **131.93M/s** | **135.12M/s** | 750.2K/s | 2.21M/s | 1.79M/s | 1.66M/s | 76.54M/s | not run — no GPU path | 81.2× |
| arithmetic-threshold | not run — no AVX-512 | 1.57B/s | 1.57B/s | **1.88B/s** | 968.18M/s | 4.16M/s | 32.1K/s | 5.23M/s | 5.26M/s | 487.46M/s | not run — no GPU path | 184.2× |
| six-digit-guess | not run — no AVX-512 | 73.48M/s | **77.84M/s** | 68.43M/s | 2.82M/s | 104.9K/s | 21.0K/s | 45.2K/s | 45.9K/s | 36.06M/s | not run — no GPU path | 61.5× |
| record-allocation | not run — no AVX-512 | **1.18B/s** | **1.18B/s** | not run — no C++ impl | 55.00M/s | 3.98M/s | 8.23M/s | 2.62M/s | 2.33M/s | 548.98M/s | not run — no GPU path | 23.6× |
| fibonacci-recursive | not run — no AVX-512 | 499.9/s | 499.5/s | not run — no C++ impl | 127.0/s | 5.9/s | **50.4K/s** | 18.0/s | 13.0/s | 17.1K/s | not run — no GPU path | 9.77× |
| tower-of-hanoi | not run — no AVX-512 | **252.25M/s** | **245.61M/s** | not run — no C++ impl | 129.79M/s | 3.05M/s | 102.2K/s | 101.9K/s | 98.1K/s | 121.28M/s | not run — no GPU path | 1.3K× |
| collection-pipeline | not run — no AVX-512 | **13.26B/s** | 4.30B/s | not run — no C++ impl | 69.29M/s | 11.44M/s | 8.20M/s | 2.33M/s | 2.12M/s | 419.79M/s | not run — no GPU path | 32.6× |
| governance-cost ⚠️ | N/A — excluded | N/A — excluded | N/A — excluded | N/A — excluded | N/A — excluded | N/A — excluded | N/A — excluded | N/A — excluded | N/A — excluded | N/A — excluded | N/A — excluded | ⚠️ excluded — not unit-aligned |
| hardware-targets | not run — no AVX-512 | 1.17M/s | 1.18M/s | not run — no C++ impl | 907.2K/s | not run | 79.0K/s | 3.3K/s | 2.3K/s | **37.68M/s** | not run — no GPU path | 399.1× |
| low-memory | not run — no AVX-512 | **6.16B/s** | 1.35B/s | not run — no C++ impl | 711.57M/s | 2.92M/s | 166.7K/s | 121.1K/s | 140.3K/s | 465.61M/s | not run — no GPU path | 5.1K× |
| gpu-compute | not run — no AVX-512 | **1.18B/s** | **1.18B/s** | not run — no C++ impl | 985.22M/s | 6.69M/s | 391.0K/s | 346.6K/s | 343.9K/s | 465.91M/s | 4.05M/s | 2.9K× |
| matrix-multiply | not run — no AVX-512 | 1.43B/s | 1.51B/s | not run — no C++ impl | 610.54M/s | 7.48M/s | 887.0K/s | 669.8K/s | 680.4K/s | 431.53M/s | **1.75B/s** | 897.3× |
| crypto-ops | not run — no AVX-512 | no comparable metric | no comparable metric | not run — no C++ impl | no comparable metric | no comparable metric | **6.3K/s** | 2.0K/s | 190.0/s | no WASM — strings/records | not run — no GPU path | N/A — no Node.js |
| text-html | not run — no AVX-512 | no comparable metric | no comparable metric | not run — no C++ impl | no comparable metric | no comparable metric | **57.4K/s** | 2.0K/s | 990.0/s | no WASM — strings/records | not run — no GPU path | N/A — no Node.js |
| tri-logic | not run — no AVX-512 | **1.38B/s** | **1.38B/s** | not run — no C++ impl | 991.56M/s | 8.21M/s | 342.0K/s | 344.0K/s | 328.9K/s | 462.00M/s | not run — no GPU path | 3.0K× |
| data-query | not run — no AVX-512 | not run — no native impl | not run — no native impl | not run — no C++ impl | **385.01M/s** | 3.93M/s | 264.5K/s | 216.1K/s | 201.4K/s | no WASM build | not run — no GPU path | 1.9K× |
| call-chain | not run — no AVX-512 | not run — no native impl | not run — no native impl | not run — no C++ impl | **316.06M/s** | 1.50M/s | 59.0K/s | 53.3K/s | 55.2K/s | 54.45M/s | not run — no GPU path | 5.7K× |
| nbody | not run — no AVX-512 | not run — no native impl | not run — no native impl | not run — no C++ impl | **122.49M/s** | 1.07M/s | 65.2K/s | 62.5K/s | 61.9K/s | 29.09M/s | not run — no GPU path | 2.0K× |
| json-parse | not run — no AVX-512 | not run — no native impl | not run — no native impl | not run — no C++ impl | **3.02M/s** | 500.5K/s | 9.6K/s | 5.1K/s | 5.3K/s | no WASM — strings/records | not run — no GPU path | 569.7× |
| mandelbrot | not run — no AVX-512 | **23.43M/s** | **23.42M/s** | not run — no C++ impl | 6.24M/s | 169.2K/s | 7.9K/s | 7.6K/s | 7.6K/s | 8.88M/s | not run — no GPU path | 820.0× |
| spectral-norm | not run — no AVX-512 | **371.35M/s** | **368.16M/s** | not run — no C++ impl | 242.09M/s | 1.92M/s | not run | not run | not run | no WASM build | not run — no GPU path | N/A — no governed ⟨interp⟩ |
| binary-trees | not run — no AVX-512 | 14.57M/s | 15.32M/s | not run — no C++ impl | 67.30M/s | 3.62M/s | 430.7K/s | 347.2K/s | 358.5K/s | **582.56M/s** | not run — no GPU path | 187.7× |
| spore-container | not run — no AVX-512 | **125.3K/s** | **126.9K/s** | not run — no C++ impl | 43.1K/s | 70.0K/s | not run | not run | not run | no WASM — strings/records | not run — no GPU path | N/A — no governed ⟨interp⟩ |
| framework-pipeline | not run — no AVX-512 | not run — no native impl | not run — no native impl | not run — no C++ impl | not run | **117.5K/s** | not run | not run | not run | no WASM — strings/records | not run — no GPU path | N/A — neither ran |
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
| 🥇 | ⚫ | Galerina passive ⟨interp⟩ | -38.63 bytes/op ⚡ ~0 — no boxing | 166.7K/s | — | -386KB |
| 🥈 | 🟢 | Rust AVX2 | 0.00 bytes/op ⚡ ~0 — no boxing | 6.16B/s | — | — |
| 🥉 | 🟢 | Rust (generic) | 0.00 bytes/op ⚡ ~0 — no boxing | 1.35B/s | — | — |
| 4 | 🟢 | Node.js | 0.00 bytes/op ⚡ ~0 — no boxing | 711.57M/s | — | 19KB |
| 5 | ⚪ | WASM ▶ production | 0.00 bytes/op ⚡ ~0 — no boxing | 465.61M/s | — | 42KB |
| 6 | ⚫ | Python | 0.03 bytes/op ⚡ ~0 — no boxing | 2.92M/s | — | 272B |
| 7 | ⚫ | Galerina manifest ⟨interp⟩ | 41 bytes/op ⚠ moderate | 121.1K/s | — | 408KB |
| 8 | ⚫ | Galerina governed ⟨interp⟩ | 41 bytes/op ⚠ moderate | 140.3K/s | — | 415KB |

> **Why this matters:** Every byte allocated is a byte the GC must later collect.
> WASM and the bytecode VM run with zero allocation — ideal for high-throughput governed services.
> The tree-walker's per-node allocation is the primary target of Phases 31-33.


## 2b. General Memory Usage

| Benchmark | Runtime | RSS | Peak RSS | Heap Used | Heap Δ (execution) |
|---|---|---|---|---|---|
| compute-mix | Rust AVX2 | — | — | — | — |
| compute-mix | Rust (generic) | — | — | — | — |
| compute-mix | C++ | — | — | — | — |
| compute-mix | Node.js | 44.1MB | 44.3MB | 5.0MB | 946KB |
| compute-mix | Python | — | — | 3KB | 3KB |
| compute-mix | Galerina passive ⟨interp⟩ | 78.1MB | 78.1MB | 16.7MB | 73KB |
| compute-mix | Galerina manifest ⟨interp⟩ | 74.1MB | 74.1MB | 20.5MB | 4.4MB |
| compute-mix | Galerina governed ⟨interp⟩ | 72.9MB | 72.9MB | 20.2MB | 4.5MB |
| compute-mix | WASM ▶ production | 72.0MB | 72.0MB | 16.0MB | 22KB |
| arithmetic-threshold | Rust AVX2 | — | — | — | — |
| arithmetic-threshold | Rust (generic) | — | — | — | — |
| arithmetic-threshold | C++ | — | — | — | — |
| arithmetic-threshold | Node.js | 47.3MB | 47.6MB | 4.3MB | 212KB |
| arithmetic-threshold | Python | — | — | 4KB | 4KB |
| arithmetic-threshold | Galerina passive ⟨interp⟩ | 79.4MB | 79.4MB | 17.1MB | 39KB |
| arithmetic-threshold | Galerina manifest ⟨interp⟩ | 79.2MB | 79.2MB | 17.1MB | 829KB |
| arithmetic-threshold | Galerina governed ⟨interp⟩ | 79.2MB | 79.2MB | 17.1MB | 839KB |
| arithmetic-threshold | WASM ▶ production | 81.2MB | 81.2MB | 16.6MB | 6KB |
| six-digit-guess | Rust AVX2 | — | — | — | — |
| six-digit-guess | Rust (generic) | — | — | — | — |
| six-digit-guess | C++ | — | — | — | — |
| six-digit-guess | Node.js | 51.9MB | 51.9MB | 5.9MB | 1.1MB |
| six-digit-guess | Python | — | — | 583B | 583B |
| six-digit-guess | Galerina passive ⟨interp⟩ | 80.2MB | 80.2MB | 19.2MB | 87KB |
| six-digit-guess | Galerina manifest ⟨interp⟩ | 80.5MB | 80.5MB | 17.6MB | 727KB |
| six-digit-guess | Galerina governed ⟨interp⟩ | 80.2MB | 80.2MB | 17.0MB | 457KB |
| six-digit-guess | WASM ▶ production | 81.7MB | 81.7MB | 16.8MB | 1KB |
| record-allocation | Rust AVX2 | — | — | — | — |
| record-allocation | Rust (generic) | — | — | — | — |
| record-allocation | Node.js | 48.0MB | 48.0MB | 4.2MB | 38KB |
| record-allocation | Python | — | — | 492B | 492B |
| record-allocation | Galerina passive ⟨interp⟩ | 80.6MB | 80.6MB | 17.5MB | 188KB |
| record-allocation | Galerina manifest ⟨interp⟩ | 80.5MB | 80.5MB | 17.1MB | 84KB |
| record-allocation | Galerina governed ⟨interp⟩ | 81.3MB | 81.3MB | 17.1MB | 60KB |
| record-allocation | WASM ▶ production | 82.8MB | 82.8MB | 17.4MB | 50KB |
| fibonacci-recursive | Rust AVX2 | — | — | — | — |
| fibonacci-recursive | Rust (generic) | — | — | — | — |
| fibonacci-recursive | Node.js | 46.4MB | 46.4MB | 4.1MB | 5KB |
| fibonacci-recursive | Python | — | — | 464B | 464B |
| fibonacci-recursive | Galerina passive ⟨interp⟩ | 81.2MB | 81.2MB | 19.2MB | 59KB |
| fibonacci-recursive | Galerina manifest ⟨interp⟩ | 81.2MB | 81.2MB | 17.5MB | 245KB |
| fibonacci-recursive | Galerina governed ⟨interp⟩ | 80.6MB | 80.6MB | 18.1MB | 976KB |
| fibonacci-recursive | WASM ▶ production | 82.9MB | 82.9MB | 17.4MB | 3KB |
| tower-of-hanoi | Rust AVX2 | — | — | — | — |
| tower-of-hanoi | Rust (generic) | — | — | — | — |
| tower-of-hanoi | Node.js | 46.5MB | 46.5MB | 4.1MB | 17KB |
| tower-of-hanoi | Python | — | — | 1KB | 1KB |
| tower-of-hanoi | Galerina passive ⟨interp⟩ | 84.1MB | 84.1MB | 22.2MB | 47KB |
| tower-of-hanoi | Galerina manifest ⟨interp⟩ | 83.2MB | 83.2MB | 17.3MB | 1.1MB |
| tower-of-hanoi | Galerina governed ⟨interp⟩ | 83.5MB | 83.5MB | 17.5MB | 1.2MB |
| tower-of-hanoi | WASM ▶ production | 82.9MB | 82.9MB | 16.6MB | 1KB |
| collection-pipeline | Rust AVX2 | — | — | — | — |
| collection-pipeline | Rust (generic) | — | — | — | — |
| collection-pipeline | Node.js | 63.2MB | 63.2MB | 12.3MB | 8.1MB |
| collection-pipeline | Python | — | — | 224B | 224B |
| collection-pipeline | Galerina passive ⟨interp⟩ | 83.9MB | 83.9MB | 17.0MB | 271KB |
| collection-pipeline | Galerina manifest ⟨interp⟩ | 83.9MB | 83.9MB | 16.4MB | 142KB |
| collection-pipeline | Galerina governed ⟨interp⟩ | 85.1MB | 85.1MB | 16.5MB | 167KB |
| collection-pipeline | WASM ▶ production | 86.4MB | 86.4MB | 16.6MB | 24KB |
| governance-cost | Rust AVX2 | — | — | — | — |
| governance-cost | Rust (generic) | — | — | — | — |
| governance-cost | Node.js | 46.5MB | 46.5MB | 4.1MB | 26KB |
| governance-cost | Python | — | — | 272B | 272B |
| governance-cost | Galerina passive ⟨interp⟩ | 85.3MB | 85.3MB | 17.2MB | 477KB |
| governance-cost | Galerina manifest ⟨interp⟩ | 87.3MB | 87.3MB | 16.9MB | 419KB |
| governance-cost | Galerina governed ⟨interp⟩ | 85.7MB | 85.7MB | 16.9MB | 448KB |
| governance-cost | WASM ▶ production | 86.1MB | 86.1MB | 16.7MB | 50KB |
| hardware-targets | Rust AVX2 | — | — | — | — |
| hardware-targets | Rust (generic) | — | — | — | — |
| hardware-targets | Node.js | 48.4MB | 48.4MB | 4.5MB | 410KB |
| hardware-targets | Galerina passive ⟨interp⟩ | 84.4MB | 84.4MB | 17.2MB | 41KB |
| hardware-targets | Galerina manifest ⟨interp⟩ | 84.2MB | 84.2MB | 16.6MB | 77KB |
| hardware-targets | Galerina governed ⟨interp⟩ | 84.1MB | 84.1MB | 16.7MB | 78KB |
| hardware-targets | WASM ▶ production | 86.1MB | 86.1MB | 16.9MB | 79KB |
| low-memory | Rust AVX2 | — | — | — | — |
| low-memory | Rust (generic) | — | — | — | — |
| low-memory | Node.js | 46.8MB | 46.8MB | 4.1MB | 19KB |
| low-memory | Python | — | — | 272B | 272B |
| low-memory | Galerina passive ⟨interp⟩ | 85.7MB | 85.7MB | 17.0MB | -386KB |
| low-memory | Galerina manifest ⟨interp⟩ | 84.6MB | 84.6MB | 17.0MB | 408KB |
| low-memory | Galerina governed ⟨interp⟩ | 84.4MB | 84.4MB | 17.0MB | 415KB |
| low-memory | WASM ▶ production | 86.7MB | 86.7MB | 16.9MB | 42KB |
| gpu-compute | Rust AVX2 | — | — | — | — |
| gpu-compute | Rust (generic) | — | — | — | — |
| gpu-compute | Node.js | 46.5MB | 46.5MB | 4.1MB | 17KB |
| gpu-compute | Python | — | — | 304B | 304B |
| gpu-compute | Galerina passive ⟨interp⟩ | 86.1MB | 86.1MB | 19.0MB | 191KB |
| gpu-compute | Galerina manifest ⟨interp⟩ | 86.1MB | 86.1MB | 17.3MB | 640KB |
| gpu-compute | Galerina governed ⟨interp⟩ | 84.3MB | 84.3MB | 17.6MB | 860KB |
| gpu-compute | WASM ▶ production | 87.2MB | 87.2MB | 17.0MB | 2KB |
| gpu-compute | Deno WebGPU (NVIDIA GeForce RTX 2060) | — | — | — | — |
| matrix-multiply | Rust AVX2 | — | — | — | — |
| matrix-multiply | Rust (generic) | — | — | — | — |
| matrix-multiply | Node.js | 48.6MB | 48.6MB | 4.6MB | 491KB |
| matrix-multiply | Python | — | — | 392B | 392B |
| matrix-multiply | Galerina passive ⟨interp⟩ | 84.7MB | 84.7MB | 17.0MB | -1.9MB |
| matrix-multiply | Galerina manifest ⟨interp⟩ | 84.7MB | 84.7MB | 17.7MB | 999KB |
| matrix-multiply | Galerina governed ⟨interp⟩ | 86.2MB | 86.2MB | 17.6MB | 903KB |
| matrix-multiply | WASM ▶ production | 88.3MB | 88.3MB | 17.0MB | 3KB |
| matrix-multiply | Deno WebGPU (NVIDIA GeForce RTX 2060) | — | — | — | — |
| crypto-ops | Rust AVX2 | — | — | — | — |
| crypto-ops | Rust (generic) | — | — | — | — |
| crypto-ops | Node.js | 62.1MB | 62.1MB | 7.9MB | 2.4MB |
| crypto-ops | Python | — | — | 208B | 208B |
| crypto-ops | Galerina passive ⟨interp⟩ | 84.8MB | 84.8MB | 18.1MB | 632KB |
| crypto-ops | Galerina manifest ⟨interp⟩ | 84.7MB | 84.7MB | 17.0MB | 248KB |
| crypto-ops | Galerina governed ⟨interp⟩ | 84.7MB | 84.7MB | 17.0MB | 322KB |
| text-html | Rust AVX2 | — | — | — | — |
| text-html | Rust (generic) | — | — | — | — |
| text-html | Node.js | — | — | — | 486KB |
| text-html | Python | — | — | 208B | 208B |
| text-html | Galerina passive ⟨interp⟩ | 86.8MB | 86.8MB | 17.7MB | -399KB |
| text-html | Galerina manifest ⟨interp⟩ | 85.2MB | 85.2MB | 17.3MB | 149KB |
| text-html | Galerina governed ⟨interp⟩ | 85.0MB | 85.0MB | 17.3MB | 169KB |
| tri-logic | Rust AVX2 | — | — | — | — |
| tri-logic | Rust (generic) | — | — | — | — |
| tri-logic | Node.js | — | — | — | 277KB |
| tri-logic | Python | — | — | — | — |
| tri-logic | Galerina passive ⟨interp⟩ | 85.4MB | 85.4MB | 18.9MB | 232KB |
| tri-logic | Galerina manifest ⟨interp⟩ | 84.8MB | 84.8MB | 18.6MB | 1.3MB |
| tri-logic | Galerina governed ⟨interp⟩ | 85.1MB | 85.1MB | 18.8MB | 1.5MB |
| tri-logic | WASM ▶ production | 89.0MB | 89.0MB | 17.5MB | 1KB |
| data-query | Node.js | — | — | — | 9KB |
| data-query | Python | — | — | — | — |
| data-query | Galerina passive ⟨interp⟩ | 85.7MB | 85.7MB | 20.3MB | 1.1MB |
| data-query | Galerina manifest ⟨interp⟩ | 85.7MB | 85.7MB | 17.8MB | 578KB |
| data-query | Galerina governed ⟨interp⟩ | 86.2MB | 86.2MB | 19.3MB | 2.0MB |
| call-chain | Node.js | 47.2MB | 47.2MB | 4.1MB | 14KB |
| call-chain | Python | — | — | 368B | 368B |
| call-chain | Galerina passive ⟨interp⟩ | 85.6MB | 85.6MB | 21.1MB | 83KB |
| call-chain | Galerina manifest ⟨interp⟩ | 85.6MB | 85.6MB | 19.4MB | 2.0MB |
| call-chain | Galerina governed ⟨interp⟩ | 86.2MB | 86.2MB | 18.4MB | 1.1MB |
| call-chain | WASM ▶ production | 88.5MB | 88.5MB | 17.6MB | 1KB |
| nbody | Node.js | 48.8MB | 48.8MB | 4.2MB | 30KB |
| nbody | Python | — | — | 624B | 624B |
| nbody | Galerina passive ⟨interp⟩ | 87.0MB | 87.0MB | 17.8MB | -1.9MB |
| nbody | Galerina manifest ⟨interp⟩ | 87.0MB | 87.0MB | 17.8MB | 431KB |
| nbody | Galerina governed ⟨interp⟩ | 85.3MB | 85.3MB | 19.0MB | 1.6MB |
| nbody | WASM ▶ production | 88.2MB | 88.2MB | 17.7MB | 1KB |
| json-parse | Node.js | — | — | — | 255KB |
| json-parse | Python | — | — | 520B | 520B |
| json-parse | Galerina passive ⟨interp⟩ | 92.9MB | 92.9MB | 18.7MB | -3.8MB |
| json-parse | Galerina manifest ⟨interp⟩ | 88.3MB | 88.3MB | 22.3MB | 4.4MB |
| json-parse | Galerina governed ⟨interp⟩ | 94.2MB | 94.2MB | 19.0MB | 1.6MB |
| mandelbrot | Rust AVX2 | — | — | — | — |
| mandelbrot | Rust (generic) | — | — | — | — |
| mandelbrot | Node.js | 48.4MB | 48.4MB | 5.1MB | 1.0MB |
| mandelbrot | Python | — | — | 3KB | 3KB |
| mandelbrot | Galerina passive ⟨interp⟩ | 89.1MB | 89.1MB | 21.5MB | 167KB |
| mandelbrot | Galerina manifest ⟨interp⟩ | 89.1MB | 89.1MB | 20.1MB | 2.3MB |
| mandelbrot | Galerina governed ⟨interp⟩ | 89.0MB | 89.0MB | 18.2MB | 148KB |
| mandelbrot | WASM ▶ production | 96.1MB | 96.1MB | 18.3MB | 1KB |
| spectral-norm | Rust AVX2 | — | — | — | — |
| spectral-norm | Rust (generic) | — | — | — | — |
| spectral-norm | Node.js | 48.8MB | 48.8MB | 4.4MB | 293KB |
| spectral-norm | Python | — | — | 4KB | 4KB |
| binary-trees | Rust AVX2 | — | — | — | — |
| binary-trees | Rust (generic) | — | — | — | — |
| binary-trees | Node.js | 48.3MB | 48.3MB | 4.6MB | 429KB |
| binary-trees | Python | — | — | 368B | 368B |
| binary-trees | Galerina passive ⟨interp⟩ | 89.4MB | 89.4MB | 20.2MB | 69KB |
| binary-trees | Galerina manifest ⟨interp⟩ | 89.4MB | 89.4MB | 19.5MB | 1.6MB |
| binary-trees | Galerina governed ⟨interp⟩ | 89.9MB | 89.9MB | 18.9MB | 1.1MB |
| binary-trees | WASM ▶ production | 91.5MB | 91.5MB | 18.1MB | 2KB |
| spore-container | Rust AVX2 | — | — | — | — |
| spore-container | Rust (generic) | — | — | — | — |
| spore-container | Node.js | 63.0MB | 63.0MB | 8.8MB | 1.6MB |
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
| compute-mix | Python | 5.07s | 5.06s | 100% | 750.62 ops/CPU-ms |
| compute-mix | Galerina passive ⟨interp⟩ | 0.3ms | 0.0ms | 0% | — |
| compute-mix | Galerina manifest ⟨interp⟩ | 28.0ms | 31.0ms | 111% | 1.6K ops/CPU-ms |
| compute-mix | Galerina governed ⟨interp⟩ | 30.1ms | 63.0ms | 210% | 793.65 ops/CPU-ms |
| compute-mix | WASM ▶ production | 1.31s | 1.31s | 100% | 76.2K ops/CPU-ms |
| arithmetic-threshold | Rust AVX2 | 12.8ms | — | — | — |
| arithmetic-threshold | Rust (generic) | 12.8ms | — | — | — |
| arithmetic-threshold | C++ | 10.6ms | — | — | — |
| arithmetic-threshold | Node.js | 20.7ms | 15.0ms | 73% | 1.33M ops/CPU-ms |
| arithmetic-threshold | Python | 4.80s | 4.80s | 100% | 4.2K ops/CPU-ms |
| arithmetic-threshold | Galerina passive ⟨interp⟩ | 0.1ms | 0.0ms | 0% | — |
| arithmetic-threshold | Galerina manifest ⟨interp⟩ | 12.1ms | 31.0ms | 256% | 2.0K ops/CPU-ms |
| arithmetic-threshold | Galerina governed ⟨interp⟩ | 12.0ms | 16.0ms | 133% | 4.0K ops/CPU-ms |
| arithmetic-threshold | WASM ▶ production | 1.04s | 1.05s | 101% | 483.7K ops/CPU-ms |
| six-digit-guess | Rust AVX2 | 0.6ms | — | — | — |
| six-digit-guess | Rust (generic) | 0.5ms | — | — | — |
| six-digit-guess | C++ | 0.6ms | — | — | — |
| six-digit-guess | Node.js | 14.9ms | 32.0ms | 215% | 1.3K ops/CPU-ms |
| six-digit-guess | Python | 400.9ms | 406.3ms | 101% | 103.56 ops/CPU-ms |
| six-digit-guess | Galerina passive ⟨interp⟩ | 0.1ms | 0.0ms | 0% | — |
| six-digit-guess | Galerina manifest ⟨interp⟩ | 930.6ms | 953.0ms | 102% | 44.14 ops/CPU-ms |
| six-digit-guess | Galerina governed ⟨interp⟩ | 917.3ms | 985.0ms | 107% | 42.71 ops/CPU-ms |
| six-digit-guess | WASM ▶ production | 1.17s | 1.16s | 99% | 36.4K ops/CPU-ms |
| record-allocation | Rust AVX2 | 8.5ms | — | — | — |
| record-allocation | Rust (generic) | 8.5ms | — | — | — |
| record-allocation | Node.js | 3.6ms | 0.0ms | 0% | — |
| record-allocation | Python | 50.3ms | 62.5ms | 124% | 3.2K ops/CPU-ms |
| record-allocation | Galerina passive ⟨interp⟩ | 0.3ms | 0.0ms | 0% | — |
| record-allocation | Galerina manifest ⟨interp⟩ | 3.8ms | 0.0ms | 0% | — |
| record-allocation | Galerina governed ⟨interp⟩ | 4.3ms | 0.0ms | 0% | — |
| record-allocation | WASM ▶ production | 1.00s | 1.01s | 101% | 541.9K ops/CPU-ms |
| fibonacci-recursive | Rust AVX2 | 400.1ms | — | — | — |
| fibonacci-recursive | Rust (generic) | 400.4ms | — | — | — |
| fibonacci-recursive | Node.js | 787.2ms | 797.0ms | 101% | 0.13 ops/CPU-ms |
| fibonacci-recursive | Python | 3.41s | 3.41s | 100% | 0.01 ops/CPU-ms |
| fibonacci-recursive | Galerina passive ⟨interp⟩ | 0.1ms | 16.0ms | 16162% | — |
| fibonacci-recursive | Galerina manifest ⟨interp⟩ | 56.8ms | 79.0ms | 139% | 0.01 ops/CPU-ms |
| fibonacci-recursive | Galerina governed ⟨interp⟩ | 75.2ms | 93.0ms | 124% | 0.01 ops/CPU-ms |
| fibonacci-recursive | WASM ▶ production | 1.05s | 1.05s | 100% | 17.19 ops/CPU-ms |
| tower-of-hanoi | Rust AVX2 | 519.6ms | — | — | — |
| tower-of-hanoi | Rust (generic) | 533.6ms | — | — | — |
| tower-of-hanoi | Node.js | 101.0ms | 94.0ms | 93% | 139.4K ops/CPU-ms |
| tower-of-hanoi | Python | 429.5ms | 421.9ms | 98% | 3.1K ops/CPU-ms |
| tower-of-hanoi | Galerina passive ⟨interp⟩ | 0.1ms | 0.0ms | 0% | — |
| tower-of-hanoi | Galerina manifest ⟨interp⟩ | 643.3ms | 687.0ms | 107% | 95.39 ops/CPU-ms |
| tower-of-hanoi | Galerina governed ⟨interp⟩ | 667.9ms | 734.0ms | 110% | 89.29 ops/CPU-ms |
| tower-of-hanoi | WASM ▶ production | 1.08s | 1.08s | 100% | 121.6K ops/CPU-ms |
| collection-pipeline | Rust AVX2 | 75.4ms | — | — | — |
| collection-pipeline | Rust (generic) | 232.7ms | — | — | — |
| collection-pipeline | Node.js | 721.6ms | 719.0ms | 100% | 69.5K ops/CPU-ms |
| collection-pipeline | Python | 4.37s | 4.38s | 100% | 11.4K ops/CPU-ms |
| collection-pipeline | Galerina passive ⟨interp⟩ | 0.3ms | 0.0ms | 0% | — |
| collection-pipeline | Galerina manifest ⟨interp⟩ | 4.3ms | 0.0ms | 0% | — |
| collection-pipeline | Galerina governed ⟨interp⟩ | 4.7ms | 31.0ms | 658% | 322.58 ops/CPU-ms |
| collection-pipeline | WASM ▶ production | 1.00s | 1.00s | 100% | 420.0K ops/CPU-ms |
| governance-cost | Rust AVX2 | 11.0ms | — | — | — |
| governance-cost | Rust (generic) | 11.3ms | — | — | — |
| governance-cost | Node.js | 47.0ms | 47.0ms | 100% | — |
| governance-cost | Python | 3.90s | 3.91s | 100% | — |
| governance-cost | Galerina passive ⟨interp⟩ | 2.2ms | 0.0ms | 0% | — |
| governance-cost | Galerina manifest ⟨interp⟩ | 1.2ms | 0.0ms | 0% | — |
| governance-cost | Galerina governed ⟨interp⟩ | 1.4ms | 0.0ms | 0% | — |
| governance-cost | WASM ▶ production | 1.00s | 1.02s | 102% | — |
| hardware-targets | Rust AVX2 | 851.6ms | — | — | — |
| hardware-targets | Rust (generic) | 850.7ms | — | — | — |
| hardware-targets | Node.js | 1.10s | 1.11s | 101% | 900.90 ops/CPU-ms |
| hardware-targets | Galerina passive ⟨interp⟩ | 12.7ms | 47.0ms | 371% | — |
| hardware-targets | Galerina manifest ⟨interp⟩ | 0.3ms | 0.0ms | 0% | — |
| hardware-targets | Galerina governed ⟨interp⟩ | 0.4ms | 0.0ms | 0% | — |
| hardware-targets | WASM ▶ production | 1.00s | 1.01s | 101% | 37.1K ops/CPU-ms |
| low-memory | Rust AVX2 | 162.4ms | — | — | — |
| low-memory | Rust (generic) | 742.2ms | — | — | — |
| low-memory | Node.js | 70.3ms | 62.0ms | 88% | 806.5K ops/CPU-ms |
| low-memory | Python | 3.42s | 3.42s | 100% | 2.9K ops/CPU-ms |
| low-memory | Galerina passive ⟨interp⟩ | 0.7ms | 0.0ms | 0% | — |
| low-memory | Galerina manifest ⟨interp⟩ | 82.6ms | 156.0ms | 189% | 64.10 ops/CPU-ms |
| low-memory | Galerina governed ⟨interp⟩ | 71.3ms | 140.0ms | 196% | 71.43 ops/CPU-ms |
| low-memory | WASM ▶ production | 1.01s | 1.02s | 101% | 462.6K ops/CPU-ms |
| gpu-compute | Rust AVX2 | 4.24s | — | — | — |
| gpu-compute | Rust (generic) | 4.24s | — | — | — |
| gpu-compute | Node.js | 507.5ms | 500.0ms | 99% | 1000.0K ops/CPU-ms |
| gpu-compute | Python | 7.47s | 7.47s | 100% | 6.7K ops/CPU-ms |
| gpu-compute | Galerina passive ⟨interp⟩ | 0.2ms | 0.0ms | 0% | — |
| gpu-compute | Galerina manifest ⟨interp⟩ | 288.5ms | 375.0ms | 130% | 266.67 ops/CPU-ms |
| gpu-compute | Galerina governed ⟨interp⟩ | 290.8ms | 344.0ms | 118% | 290.70 ops/CPU-ms |
| gpu-compute | WASM ▶ production | 1.07s | 1.08s | 101% | 463.4K ops/CPU-ms |
| gpu-compute | Deno WebGPU (NVIDIA GeForce RTX 2060) | 24.7ms | — | — | — |
| matrix-multiply | Rust AVX2 | 91.9ms | — | — | — |
| matrix-multiply | Rust (generic) | 87.1ms | — | — | — |
| matrix-multiply | Node.js | 214.7ms | 250.0ms | 116% | 524.3K ops/CPU-ms |
| matrix-multiply | Python | 1.75s | — | — | — |
| matrix-multiply | Galerina passive ⟨interp⟩ | 0.2ms | 16.0ms | 6584% | — |
| matrix-multiply | Galerina manifest ⟨interp⟩ | 48.9ms | 47.0ms | 96% | 697.19 ops/CPU-ms |
| matrix-multiply | Galerina governed ⟨interp⟩ | 48.2ms | 109.0ms | 226% | 300.62 ops/CPU-ms |
| matrix-multiply | WASM ▶ production | 1.06s | 1.06s | 100% | 431.6K ops/CPU-ms |
| matrix-multiply | Deno WebGPU (NVIDIA GeForce RTX 2060) | 12.0ms | — | — | — |
| crypto-ops | Galerina passive ⟨interp⟩ | 15.9ms | 15.0ms | 94% | — |
| crypto-ops | Galerina manifest ⟨interp⟩ | 0.5ms | 0.0ms | 0% | — |
| crypto-ops | Galerina governed ⟨interp⟩ | 5.3ms | 0.0ms | 0% | — |
| text-html | Galerina passive ⟨interp⟩ | 1.7ms | 0.0ms | 0% | — |
| text-html | Galerina manifest ⟨interp⟩ | 0.5ms | 0.0ms | 0% | — |
| text-html | Galerina governed ⟨interp⟩ | 1.0ms | 0.0ms | 0% | — |
| tri-logic | Rust AVX2 | 433.7ms | — | — | — |
| tri-logic | Rust (generic) | 433.3ms | — | — | — |
| tri-logic | Node.js | 302.6ms | — | — | — |
| tri-logic | Python | 1.46s | — | — | — |
| tri-logic | Galerina passive ⟨interp⟩ | 2.0ms | 0.0ms | 0% | — |
| tri-logic | Galerina manifest ⟨interp⟩ | 872.1ms | 937.0ms | 107% | 320.17 ops/CPU-ms |
| tri-logic | Galerina governed ⟨interp⟩ | 912.0ms | 922.0ms | 101% | 325.38 ops/CPU-ms |
| tri-logic | WASM ▶ production | 1.30s | 1.30s | 100% | 462.6K ops/CPU-ms |
| data-query | Node.js | 129.9ms | — | — | — |
| data-query | Python | 763.7ms | — | — | — |
| data-query | Galerina passive ⟨interp⟩ | 1.2ms | 0.0ms | 0% | — |
| data-query | Galerina manifest ⟨interp⟩ | 46.3ms | 63.0ms | 136% | 158.73 ops/CPU-ms |
| data-query | Galerina governed ⟨interp⟩ | 49.6ms | 47.0ms | 95% | 212.77 ops/CPU-ms |
| call-chain | Node.js | 6.3ms | 0.0ms | 0% | — |
| call-chain | Python | 667.0ms | 656.3ms | 98% | 1.5K ops/CPU-ms |
| call-chain | Galerina passive ⟨interp⟩ | 0.1ms | 0.0ms | 0% | — |
| call-chain | Galerina manifest ⟨interp⟩ | 937.6ms | 953.0ms | 102% | 52.47 ops/CPU-ms |
| call-chain | Galerina governed ⟨interp⟩ | 906.5ms | 969.0ms | 107% | 51.60 ops/CPU-ms |
| call-chain | WASM ▶ production | 1.84s | 1.84s | 100% | 54.2K ops/CPU-ms |
| nbody | Node.js | 53.5ms | 63.0ms | 118% | 104.0K ops/CPU-ms |
| nbody | Python | 1.53s | — | — | — |
| nbody | Galerina passive ⟨interp⟩ | 0.3ms | 0.0ms | 0% | — |
| nbody | Galerina manifest ⟨interp⟩ | 524.0ms | 594.0ms | 113% | 55.17 ops/CPU-ms |
| nbody | Galerina governed ⟨interp⟩ | 529.0ms | 609.0ms | 115% | 53.81 ops/CPU-ms |
| nbody | WASM ▶ production | 1.13s | 1.13s | 100% | 29.1K ops/CPU-ms |
| json-parse | Galerina passive ⟨interp⟩ | 0.6ms | 0.0ms | 0% | — |
| json-parse | Galerina manifest ⟨interp⟩ | 98.5ms | 125.0ms | 127% | 4.00 ops/CPU-ms |
| json-parse | Galerina governed ⟨interp⟩ | 94.3ms | 125.0ms | 133% | 4.00 ops/CPU-ms |
| mandelbrot | Rust AVX2 | 139.9ms | — | — | — |
| mandelbrot | Rust (generic) | 139.9ms | — | — | — |
| mandelbrot | Node.js | 525.1ms | 563.0ms | 107% | 5.8K ops/CPU-ms |
| mandelbrot | Python | 19.37s | — | — | — |
| mandelbrot | Galerina passive ⟨interp⟩ | 0.2ms | 0.0ms | 0% | — |
| mandelbrot | Galerina manifest ⟨interp⟩ | 2.16s | 2.16s | 100% | 7.60 ops/CPU-ms |
| mandelbrot | Galerina governed ⟨interp⟩ | 2.15s | 2.16s | 100% | 7.60 ops/CPU-ms |
| mandelbrot | WASM ▶ production | 1.84s | 1.84s | 100% | 8.9K ops/CPU-ms |
| spectral-norm | Rust AVX2 | 26.9ms | — | — | — |
| spectral-norm | Rust (generic) | 27.2ms | — | — | — |
| spectral-norm | Node.js | 41.3ms | 47.0ms | 114% | 212.8K ops/CPU-ms |
| spectral-norm | Python | 5.22s | — | — | — |
| binary-trees | Rust AVX2 | 9.3ms | — | — | — |
| binary-trees | Rust (generic) | 8.9ms | — | — | — |
| binary-trees | Node.js | 2.0ms | 0.0ms | 0% | — |
| binary-trees | Python | 37.6ms | 31.3ms | 83% | 4.3K ops/CPU-ms |
| binary-trees | Galerina passive ⟨interp⟩ | 0.1ms | 0.0ms | 0% | — |
| binary-trees | Galerina manifest ⟨interp⟩ | 391.3ms | 391.0ms | 100% | 347.45 ops/CPU-ms |
| binary-trees | Galerina governed ⟨interp⟩ | 378.9ms | 437.0ms | 115% | 310.88 ops/CPU-ms |
| binary-trees | WASM ▶ production | 1.17s | 1.17s | 101% | 579.6K ops/CPU-ms |
| spore-container | Rust AVX2 | 2.39s | — | — | — |
| spore-container | Rust (generic) | 2.36s | — | — | — |
| spore-container | Node.js | 6.96s | 8.30s | 119% | 36.16 ops/CPU-ms |
| spore-container | Python | 1.43s | — | — | — |
| framework-pipeline | Python | 1.70s | — | — | — |
| http-throughput | Node.js | 88.0ms | — | — | — |
| naming-check | Node.js | 433.0ms | — | — | — |
| context-receipt | Node.js | 305.0ms | — | — | — |
| intelligence-search | Node.js | 47.0ms | — | — | — |
| provenance-trace | Node.js | 2.02s | — | — | — |

> **CPU utilisation** = CPU ms ÷ wall ms × 100. Node.js approaches 100% (single-thread JIT). Python may show <100% on Windows where process_time measures differently.

## 4. Per-Benchmark Detail

> **Heap/op** = heap bytes allocated per operation (the fair, workload-attributable memory metric).
> Managed runtimes (Node/Python/Galerina/WASM) report it via a GC'd before/after delta; native Rust/C++
> show **~0 (native)** — no GC-managed heap. `~0` = no measurable per-op allocation (e.g. V8 tagged ints);
> a large positive value (e.g. the Galerina tree-walker boxing a value per AST node) is allocation pressure.

### compute-mix

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Node.js | 135.12M/s | 5.00s | 5.00s | 44.1MB | ~0 | 180.1× | 1.00× |
| 🥈 | 🟢 | C++ | 131.93M/s | 30.00s | — | — | ~0 (native) | 175.9× | 0.98× |
| 🥉 | 🟢 | Rust (generic) | 131.80M/s | 5.00s | — | — | ~0 (native) | 175.7× | 0.98× |
| 4 | 🟢 | Rust AVX2 | 129.26M/s | 5.00s | — | — | ~0 (native) | 172.3× | 0.96× |
| 5 | ⚪ | WASM ▶ production | 76.54M/s | 1.31s | 1.31s | 72.0MB | ~0 | 102.0× | 0.57× |
| 6 | 🔴 | Galerina passive ⟨interp⟩ | 2.21M/s | 0.3ms | 0.0ms | 78.1MB | 100 B/op | 2.95× | 0.02× |
| 7 | 🔴 | Galerina manifest ⟨interp⟩ | 1.79M/s | 28.0ms | 31.0ms | 74.1MB | 89 B/op | 2.38× | 0.01× |
| 8 | 🔴 | Galerina governed ⟨interp⟩ | 1.66M/s | 30.1ms | 63.0ms | 72.9MB | 89 B/op | 2.22× | 0.01× |
| 9 | ⚫ | Python | 750.2K/s | 5.07s | 5.06s | — | ~0 | 1.00× | 0.01× |

> 🧠 **Lowest heap/op:** WASM ▶ production (~0) · **highest:** Galerina passive ⟨interp⟩ (100 B/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### arithmetic-threshold

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | C++ | 1.88B/s | 10.6ms | — | — | ~0 (native) | 452.1× | 1.94× |
| 🥈 | 🟢 | Rust (generic) | 1.57B/s | 12.8ms | — | — | ~0 (native) | 376.3× | 1.62× |
| 🥉 | 🟢 | Rust AVX2 | 1.57B/s | 12.8ms | — | — | ~0 (native) | 376.0× | 1.62× |
| 4 | 🟢 | Node.js | 968.18M/s | 20.7ms | 15.0ms | 47.3MB | ~0 | 232.5× | 1.00× |
| 5 | ⚪ | WASM ▶ production | 487.46M/s | 1.04s | 1.05s | 81.2MB | ~0 | 117.1× | 0.50× |
| 6 | ⚫ | Galerina governed ⟨interp⟩ | 5.26M/s | 12.0ms | 16.0ms | 79.2MB | 13 B/op | 1.26× | 0.01× |
| 7 | ⚫ | Galerina manifest ⟨interp⟩ | 5.23M/s | 12.1ms | 31.0ms | 79.2MB | 13 B/op | 1.26× | 0.01× |
| 8 | ⚫ | Python | 4.16M/s | 4.80s | 4.80s | — | ~0 | 1.00× | 0.00× |
| 9 | ⚫ | Galerina passive ⟨interp⟩ | 32.1K/s | 0.1ms | 0.0ms | 79.4MB | 12.7 KB/op | 0.01× | 0.00× |

> 🧠 **Lowest heap/op:** WASM ▶ production (~0) · **highest:** Galerina passive ⟨interp⟩ (12.7 KB/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### six-digit-guess

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Rust (generic) | 77.84M/s | 0.5ms | — | — | ~0 (native) | 741.7× | 27.6× |
| 🥈 | 🟢 | Rust AVX2 | 73.48M/s | 0.6ms | — | — | ~0 (native) | 700.2× | 26.0× |
| 🥉 | 🟢 | C++ | 68.43M/s | 0.6ms | — | — | ~0 (native) | 652.1× | 24.2× |
| 4 | 🟢 | WASM ▶ production | 36.06M/s | 1.17s | 1.16s | 81.7MB | ~0 | 343.6× | 12.8× |
| 5 | 🟢 | Node.js | 2.82M/s | 14.9ms | 32.0ms | 51.9MB | 27 B/op | 26.9× | 1.00× |
| 6 | 🔴 | Python | 104.9K/s | 400.9ms | 406.3ms | — | ~0 | 1.00× | 0.04× |
| 7 | 🔴 | Galerina governed ⟨interp⟩ | 45.9K/s | 917.3ms | 985.0ms | 80.2MB | 11 B/op | 0.44× | 0.02× |
| 8 | 🔴 | Galerina manifest ⟨interp⟩ | 45.2K/s | 930.6ms | 953.0ms | 80.5MB | 17 B/op | 0.43× | 0.02× |
| 9 | ⚫ | Galerina passive ⟨interp⟩ | 21.0K/s | 0.1ms | 0.0ms | 80.2MB | 28.3 KB/op | 0.20× | 0.01× |

> 🧠 **Lowest heap/op:** WASM ▶ production (~0) · **highest:** Galerina passive ⟨interp⟩ (28.3 KB/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### record-allocation

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Rust (generic) | 1.18B/s | 8.5ms | — | — | ~0 (native) | 295.8× | 21.4× |
| 🥈 | 🟢 | Rust AVX2 | 1.18B/s | 8.5ms | — | — | ~0 (native) | 295.8× | 21.4× |
| 🥉 | 🟢 | WASM ▶ production | 548.98M/s | 1.00s | 1.01s | 82.8MB | ~0 | 138.0× | 9.98× |
| 4 | 🟢 | Node.js | 55.00M/s | 3.6ms | 0.0ms | 48.0MB | ~0 | 13.8× | 1.00× |
| 5 | 🟡 | Galerina passive ⟨interp⟩ | 8.23M/s | 0.3ms | 0.0ms | 80.6MB | 67 B/op | 2.07× | 0.15× |
| 6 | 🔴 | Python | 3.98M/s | 50.3ms | 62.5ms | — | ~0 | 1.00× | 0.07× |
| 7 | 🔴 | Galerina manifest ⟨interp⟩ | 2.62M/s | 3.8ms | 0.0ms | 80.5MB | 8 B/op | 0.66× | 0.05× |
| 8 | 🔴 | Galerina governed ⟨interp⟩ | 2.33M/s | 4.3ms | 0.0ms | 81.3MB | 6 B/op | 0.59× | 0.04× |

> 🧠 **Lowest heap/op:** WASM ▶ production (~0) · **highest:** Galerina passive ⟨interp⟩ (67 B/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### fibonacci-recursive

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Galerina passive ⟨interp⟩ | 50.4K/s | 0.1ms | 16.0ms | 81.2MB | 11.6 KB/op | 8.6K× | 396.4× |
| 🥈 | 🟢 | WASM ▶ production | 17.1K/s | 1.05s | 1.05s | 82.9MB | ~0 | 2.9K× | 134.9× |
| 🥉 | 🟢 | Rust AVX2 | 499.9/s | 400.1ms | — | — | ~0 (native) | 85.3× | 3.94× |
| 4 | 🟢 | Rust (generic) | 499.5/s | 400.4ms | — | — | ~0 (native) | 85.2× | 3.93× |
| 5 | 🟢 | Node.js | 127.0/s | 787.2ms | 797.0ms | 46.4MB | 53 B/op | 21.7× | 1.00× |
| 6 | 🟡 | Galerina manifest ⟨interp⟩ | 18.0/s | 56.8ms | 79.0ms | 81.2MB | 233.5 KB/op | 3.07× | 0.14× |
| 7 | 🟡 | Galerina governed ⟨interp⟩ | 13.0/s | 75.2ms | 93.0ms | 80.6MB | 975.4 KB/op | 2.22× | 0.10× |
| 8 | 🔴 | Python | 5.9/s | 3.41s | 3.41s | — | 23 B/op | 1.00× | 0.05× |

> 🧠 **Lowest heap/op:** WASM ▶ production (~0) · **highest:** Galerina governed ⟨interp⟩ (975.4 KB/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### tower-of-hanoi

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Rust AVX2 | 252.25M/s | 519.6ms | — | — | ~0 (native) | 82.7× | 1.94× |
| 🥈 | 🟢 | Rust (generic) | 245.61M/s | 533.6ms | — | — | ~0 (native) | 80.5× | 1.89× |
| 🥉 | 🟢 | Node.js | 129.79M/s | 101.0ms | 94.0ms | 46.5MB | ~0 | 42.5× | 1.00× |
| 4 | 🟢 | WASM ▶ production | 121.28M/s | 1.08s | 1.08s | 82.9MB | ~0 | 39.7× | 0.93× |
| 5 | 🔴 | Python | 3.05M/s | 429.5ms | 421.9ms | — | ~0 | 1.00× | 0.02× |
| 6 | ⚫ | Galerina passive ⟨interp⟩ | 102.2K/s | 0.1ms | 0.0ms | 84.1MB | 6.8 KB/op | 0.03× | 0.00× |
| 7 | ⚫ | Galerina manifest ⟨interp⟩ | 101.9K/s | 643.3ms | 687.0ms | 83.2MB | 16 B/op | 0.03× | 0.00× |
| 8 | ⚫ | Galerina governed ⟨interp⟩ | 98.1K/s | 667.9ms | 734.0ms | 83.5MB | 18 B/op | 0.03× | 0.00× |

> 🧠 **Lowest heap/op:** WASM ▶ production (~0) · **highest:** Galerina passive ⟨interp⟩ (6.8 KB/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### collection-pipeline

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Rust AVX2 | 13.26B/s | 75.4ms | — | — | ~0 (native) | 1.2K× | 191.4× |
| 🥈 | 🟢 | Rust (generic) | 4.30B/s | 232.7ms | — | — | ~0 (native) | 375.6× | 62.0× |
| 🥉 | 🟢 | WASM ▶ production | 419.79M/s | 1.00s | 1.00s | 86.4MB | ~0 | 36.7× | 6.06× |
| 4 | 🟢 | Node.js | 69.29M/s | 721.6ms | 719.0ms | 63.2MB | ~0 | 6.06× | 1.00× |
| 5 | 🟡 | Python | 11.44M/s | 4.37s | 4.38s | — | ~0 | 1.00× | 0.17× |
| 6 | 🟡 | Galerina passive ⟨interp⟩ | 8.20M/s | 0.3ms | 0.0ms | 83.9MB | 96 B/op | 0.72× | 0.12× |
| 7 | 🔴 | Galerina manifest ⟨interp⟩ | 2.33M/s | 4.3ms | 0.0ms | 83.9MB | 14 B/op | 0.20× | 0.03× |
| 8 | 🔴 | Galerina governed ⟨interp⟩ | 2.12M/s | 4.7ms | 31.0ms | 85.1MB | 17 B/op | 0.19× | 0.03× |

> 🧠 **Lowest heap/op:** WASM ▶ production (~0) · **highest:** Galerina passive ⟨interp⟩ (96 B/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### governance-cost ⚠️ (excluded — not unit-aligned)

> internal governed/manifest ratio — native baseline does no governance; not cross-runtime by design

| Runtime | Raw reported throughput (native unit — **NOT comparable**) | Wall |
|---|---|---|
| Rust AVX2 | 906.36M/s | 11.0ms |
| Rust (generic) | 888.24M/s | 11.3ms |
| Node.js | 2.13M/s | 47.0ms |
| Python | 25.7K/s | 3.90s |
| Galerina passive ⟨interp⟩ | 2.0K/s | 2.2ms |
| Galerina manifest ⟨interp⟩ | 847.0/s | 1.2ms |
| Galerina governed ⟨interp⟩ | 697.0/s | 1.4ms |
| WASM ▶ production | 2.87M/s | 1.00s |

### hardware-targets

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | WASM ▶ production | 37.68M/s | 1.00s | 1.01s | 86.1MB | ~0 | — | 41.5× |
| 🥈 | 🟢 | Rust (generic) | 1.18M/s | 850.7ms | — | — | ~0 (native) | — | 1.30× |
| 🥉 | 🟢 | Rust AVX2 | 1.17M/s | 851.6ms | — | — | ~0 (native) | — | 1.29× |
| 4 | 🟢 | Node.js | 907.2K/s | 1.10s | 1.11s | 48.4MB | ~0 | — | 1.00× |
| 5 | 🔴 | Galerina passive ⟨interp⟩ | 79.0K/s | 12.7ms | 47.0ms | 84.4MB | 41 B/op | — | 0.09× |
| 6 | ⚫ | Galerina manifest ⟨interp⟩ | 3.3K/s | 0.3ms | 0.0ms | 84.2MB | 75.1 KB/op | — | 0.00× |
| 7 | ⚫ | Galerina governed ⟨interp⟩ | 2.3K/s | 0.4ms | 0.0ms | 84.1MB | 76.0 KB/op | — | 0.00× |

> 🧠 **Lowest heap/op:** WASM ▶ production (~0) · **highest:** Galerina governed ⟨interp⟩ (76.0 KB/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### low-memory

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Rust AVX2 | 6.16B/s | 162.4ms | — | — | ~0 | 2.1K× | 8.65× |
| 🥈 | 🟢 | Rust (generic) | 1.35B/s | 742.2ms | — | — | ~0 | 461.0× | 1.89× |
| 🥉 | 🟢 | Node.js | 711.57M/s | 70.3ms | 62.0ms | 46.8MB | ~0 | 243.5× | 1.00× |
| 4 | ⚪ | WASM ▶ production | 465.61M/s | 1.01s | 1.02s | 86.7MB | ~0 | 159.3× | 0.65× |
| 5 | ⚫ | Python | 2.92M/s | 3.42s | 3.42s | — | ~0 | 1.00× | 0.00× |
| 6 | ⚫ | Galerina passive ⟨interp⟩ | 166.7K/s | 0.7ms | 0.0ms | 85.7MB | -3.0 KB/op | 0.06× | 0.00× |
| 7 | ⚫ | Galerina governed ⟨interp⟩ | 140.3K/s | 71.3ms | 140.0ms | 84.4MB | 41 B/op | 0.05× | 0.00× |
| 8 | ⚫ | Galerina manifest ⟨interp⟩ | 121.1K/s | 82.6ms | 156.0ms | 84.6MB | 41 B/op | 0.04× | 0.00× |

> 🧠 **Lowest heap/op:** Galerina passive ⟨interp⟩ (-3.0 KB/op) · **highest:** Galerina governed ⟨interp⟩ (41 B/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### gpu-compute

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Rust AVX2 | 1.18B/s | 4.24s | — | — | ~0 (native) | 176.4× | 1.20× |
| 🥈 | 🟢 | Rust (generic) | 1.18B/s | 4.24s | — | — | ~0 (native) | 176.2× | 1.20× |
| 🥉 | 🟢 | Node.js | 985.22M/s | 507.5ms | 500.0ms | 46.5MB | ~0 | 147.2× | 1.00× |
| 4 | 🟡 | WASM ▶ production | 465.91M/s | 1.07s | 1.08s | 87.2MB | ~0 | 69.6× | 0.47× |
| 5 | ⚫ | Python | 6.69M/s | 7.47s | 7.47s | — | ~0 | 1.00× | 0.01× |
| 6 | ⚫ | Deno WebGPU (NVIDIA GeForce RTX 2060) | 4.05M/s | 24.7ms | — | — | — | 0.61× | 0.00× |
| 7 | ⚫ | Galerina passive ⟨interp⟩ | 391.0K/s | 0.2ms | 0.0ms | 86.1MB | 2.5 KB/op | 0.06× | 0.00× |
| 8 | ⚫ | Galerina manifest ⟨interp⟩ | 346.6K/s | 288.5ms | 375.0ms | 86.1MB | 6 B/op | 0.05× | 0.00× |
| 9 | ⚫ | Galerina governed ⟨interp⟩ | 343.9K/s | 290.8ms | 344.0ms | 84.3MB | 9 B/op | 0.05× | 0.00× |

> 🧠 **Lowest heap/op:** WASM ▶ production (~0) · **highest:** Galerina passive ⟨interp⟩ (2.5 KB/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### matrix-multiply

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Deno WebGPU (NVIDIA GeForce RTX 2060) | 1.75B/s | 12.0ms | — | — | — | 234.2× | 2.87× |
| 🥈 | 🟢 | Rust (generic) | 1.51B/s | 87.1ms | — | — | ~0 (native) | 201.1× | 2.47× |
| 🥉 | 🟢 | Rust AVX2 | 1.43B/s | 91.9ms | — | — | ~0 (native) | 190.5× | 2.34× |
| 4 | 🟢 | Node.js | 610.54M/s | 214.7ms | 250.0ms | 48.6MB | ~0 | 81.6× | 1.00× |
| 5 | ⚪ | WASM ▶ production | 431.53M/s | 1.06s | 1.06s | 88.3MB | ~0 | 57.7× | 0.71× |
| 6 | 🔴 | Python | 7.48M/s | 1.75s | — | — | 8 B/op | 1.00× | 0.01× |
| 7 | ⚫ | Galerina passive ⟨interp⟩ | 887.0K/s | 0.2ms | 16.0ms | 84.7MB | -8.7 KB/op | 0.12× | 0.00× |
| 8 | ⚫ | Galerina governed ⟨interp⟩ | 680.4K/s | 48.2ms | 109.0ms | 86.2MB | 28 B/op | 0.09× | 0.00× |
| 9 | ⚫ | Galerina manifest ⟨interp⟩ | 669.8K/s | 48.9ms | 47.0ms | 84.7MB | 30 B/op | 0.09× | 0.00× |

> 🧠 **Lowest heap/op:** Galerina passive ⟨interp⟩ (-8.7 KB/op) · **highest:** Galerina manifest ⟨interp⟩ (30 B/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### crypto-ops

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Galerina passive ⟨interp⟩ | 6.3K/s | 15.9ms | 15.0ms | 84.8MB | 6.2 KB/op | — | — |
| 🥈 | 🟡 | Galerina manifest ⟨interp⟩ | 2.0K/s | 0.5ms | 0.0ms | 84.7MB | 242.5 KB/op | — | — |
| 🥉 | 🔴 | Galerina governed ⟨interp⟩ | 190.0/s | 5.3ms | 0.0ms | 84.7MB | 314.1 KB/op | — | — |

> 🧠 **Lowest heap/op:** Galerina passive ⟨interp⟩ (6.2 KB/op) · **highest:** Galerina governed ⟨interp⟩ (314.1 KB/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### text-html

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Galerina passive ⟨interp⟩ | 57.4K/s | 1.7ms | 0.0ms | 86.8MB | -3.9 KB/op | — | — |
| 🥈 | 🔴 | Galerina manifest ⟨interp⟩ | 2.0K/s | 0.5ms | 0.0ms | 85.2MB | 145.2 KB/op | — | — |
| 🥉 | 🔴 | Galerina governed ⟨interp⟩ | 990.0/s | 1.0ms | 0.0ms | 85.0MB | 165.1 KB/op | — | — |

> 🧠 **Lowest heap/op:** Galerina passive ⟨interp⟩ (-3.9 KB/op) · **highest:** Galerina governed ⟨interp⟩ (165.1 KB/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### tri-logic

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Rust (generic) | 1.38B/s | 433.3ms | — | — | ~0 (native) | 168.7× | 1.40× |
| 🥈 | 🟢 | Rust AVX2 | 1.38B/s | 433.7ms | — | — | ~0 (native) | 168.6× | 1.40× |
| 🥉 | 🟢 | Node.js | 991.56M/s | 302.6ms | — | — | ~0 | 120.8× | 1.00× |
| 4 | 🟡 | WASM ▶ production | 462.00M/s | 1.30s | 1.30s | 89.0MB | ~0 | 56.3× | 0.47× |
| 5 | ⚫ | Python | 8.21M/s | 1.46s | — | — | — | 1.00× | 0.01× |
| 6 | ⚫ | Galerina manifest ⟨interp⟩ | 344.0K/s | 872.1ms | 937.0ms | 84.8MB | 4 B/op | 0.04× | 0.00× |
| 7 | ⚫ | Galerina passive ⟨interp⟩ | 342.0K/s | 2.0ms | 0.0ms | 85.4MB | 347 B/op | 0.04× | 0.00× |
| 8 | ⚫ | Galerina governed ⟨interp⟩ | 328.9K/s | 912.0ms | 922.0ms | 85.1MB | 5 B/op | 0.04× | 0.00× |

> 🧠 **Lowest heap/op:** WASM ▶ production (~0) · **highest:** Galerina passive ⟨interp⟩ (347 B/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### data-query

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Node.js | 385.01M/s | 129.9ms | — | — | ~0 | 98.0× | 1.00× |
| 🥈 | 🔴 | Python | 3.93M/s | 763.7ms | — | — | — | 1.00× | 0.01× |
| 🥉 | ⚫ | Galerina passive ⟨interp⟩ | 264.5K/s | 1.2ms | 0.0ms | 85.7MB | 3.4 KB/op | 0.07× | 0.00× |
| 4 | ⚫ | Galerina manifest ⟨interp⟩ | 216.1K/s | 46.3ms | 63.0ms | 85.7MB | 58 B/op | 0.06× | 0.00× |
| 5 | ⚫ | Galerina governed ⟨interp⟩ | 201.4K/s | 49.6ms | 47.0ms | 86.2MB | 202 B/op | 0.05× | 0.00× |

> 🧠 **Lowest heap/op:** Node.js (~0) · **highest:** Galerina passive ⟨interp⟩ (3.4 KB/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### call-chain

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Node.js | 316.06M/s | 6.3ms | 0.0ms | 47.2MB | ~0 | 210.8× | 1.00× |
| 🥈 | 🟡 | WASM ▶ production | 54.45M/s | 1.84s | 1.84s | 88.5MB | ~0 | 36.3× | 0.17× |
| 🥉 | ⚫ | Python | 1.50M/s | 667.0ms | 656.3ms | — | ~0 | 1.00× | 0.00× |
| 4 | ⚫ | Galerina passive ⟨interp⟩ | 59.0K/s | 0.1ms | 0.0ms | 85.6MB | 12.6 KB/op | 0.04× | 0.00× |
| 5 | ⚫ | Galerina governed ⟨interp⟩ | 55.2K/s | 906.5ms | 969.0ms | 86.2MB | 23 B/op | 0.04× | 0.00× |
| 6 | ⚫ | Galerina manifest ⟨interp⟩ | 53.3K/s | 937.6ms | 953.0ms | 85.6MB | 41 B/op | 0.04× | 0.00× |

> 🧠 **Lowest heap/op:** WASM ▶ production (~0) · **highest:** Galerina passive ⟨interp⟩ (12.6 KB/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### nbody

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Node.js | 122.49M/s | 53.5ms | 63.0ms | 48.8MB | ~0 | 114.3× | 1.00× |
| 🥈 | 🟡 | WASM ▶ production | 29.09M/s | 1.13s | 1.13s | 88.2MB | ~0 | 27.1× | 0.24× |
| 🥉 | ⚫ | Python | 1.07M/s | 1.53s | — | — | 12 B/op | 1.00× | 0.01× |
| 4 | ⚫ | Galerina passive ⟨interp⟩ | 65.2K/s | 0.3ms | 0.0ms | 87.0MB | -86.5 KB/op | 0.06× | 0.00× |
| 5 | ⚫ | Galerina manifest ⟨interp⟩ | 62.5K/s | 524.0ms | 594.0ms | 87.0MB | 13 B/op | 0.06× | 0.00× |
| 6 | ⚫ | Galerina governed ⟨interp⟩ | 61.9K/s | 529.0ms | 609.0ms | 85.3MB | 48 B/op | 0.06× | 0.00× |

> 🧠 **Lowest heap/op:** Galerina passive ⟨interp⟩ (-86.5 KB/op) · **highest:** Galerina governed ⟨interp⟩ (48 B/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### json-parse

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Node.js | 3.02M/s | — | — | — | — | 6.04× | 1.00× |
| 🥈 | 🟡 | Python | 500.5K/s | — | — | — | 1 B/op | 1.00× | 0.17× |
| 🥉 | ⚫ | Galerina passive ⟨interp⟩ | 9.6K/s | 0.6ms | 0.0ms | 92.9MB | -595.1 KB/op | 0.02× | 0.00× |
| 4 | ⚫ | Galerina governed ⟨interp⟩ | 5.3K/s | 94.3ms | 125.0ms | 94.2MB | 3.1 KB/op | 0.01× | 0.00× |
| 5 | ⚫ | Galerina manifest ⟨interp⟩ | 5.1K/s | 98.5ms | 125.0ms | 88.3MB | 8.7 KB/op | 0.01× | 0.00× |

> 🧠 **Lowest heap/op:** Galerina passive ⟨interp⟩ (-595.1 KB/op) · **highest:** Galerina manifest ⟨interp⟩ (8.7 KB/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### mandelbrot

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Rust AVX2 | 23.43M/s | 139.9ms | — | — | ~0 (native) | 138.5× | 3.75× |
| 🥈 | 🟢 | Rust (generic) | 23.42M/s | 139.9ms | — | — | ~0 (native) | 138.4× | 3.75× |
| 🥉 | 🟢 | WASM ▶ production | 8.88M/s | 1.84s | 1.84s | 96.1MB | ~0 | 52.5× | 1.42× |
| 4 | 🟢 | Node.js | 6.24M/s | 525.1ms | 563.0ms | 48.4MB | ~0 | 36.9× | 1.00× |
| 5 | 🔴 | Python | 169.2K/s | 19.37s | — | — | ~0 | 1.00× | 0.03× |
| 6 | ⚫ | Galerina passive ⟨interp⟩ | 7.9K/s | 0.2ms | 0.0ms | 89.1MB | 114.6 KB/op | 0.05× | 0.00× |
| 7 | ⚫ | Galerina governed ⟨interp⟩ | 7.6K/s | 2.15s | 2.16s | 89.0MB | 9 B/op | 0.04× | 0.00× |
| 8 | ⚫ | Galerina manifest ⟨interp⟩ | 7.6K/s | 2.16s | 2.16s | 89.1MB | 142 B/op | 0.04× | 0.00× |

> 🧠 **Lowest heap/op:** WASM ▶ production (~0) · **highest:** Galerina passive ⟨interp⟩ (114.6 KB/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### spectral-norm

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Rust AVX2 | 371.35M/s | 26.9ms | — | — | ~0 (native) | 193.8× | 1.53× |
| 🥈 | 🟢 | Rust (generic) | 368.16M/s | 27.2ms | — | — | ~0 (native) | 192.1× | 1.52× |
| 🥉 | 🟢 | Node.js | 242.09M/s | 41.3ms | 47.0ms | 48.8MB | ~0 | 126.3× | 1.00× |
| 4 | ⚫ | Python | 1.92M/s | 5.22s | — | — | ~0 | 1.00× | 0.01× |

> 🧠 **Lowest heap/op:** Python (~0) · **highest:** Node.js (~0). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### binary-trees

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | WASM ▶ production | 582.56M/s | 1.17s | 1.17s | 91.5MB | ~0 | 161.1× | 8.66× |
| 🥈 | 🟢 | Node.js | 67.30M/s | 2.0ms | 0.0ms | 48.3MB | 3 B/op | 18.6× | 1.00× |
| 🥉 | 🟡 | Rust (generic) | 15.32M/s | 8.9ms | — | — | ~0 (native) | 4.24× | 0.23× |
| 4 | 🟡 | Rust AVX2 | 14.57M/s | 9.3ms | — | — | ~0 (native) | 4.03× | 0.22× |
| 5 | 🔴 | Python | 3.62M/s | 37.6ms | 31.3ms | — | ~0 | 1.00× | 0.05× |
| 6 | ⚫ | Galerina passive ⟨interp⟩ | 430.7K/s | 0.1ms | 0.0ms | 89.4MB | 1.6 KB/op | 0.12× | 0.01× |
| 7 | ⚫ | Galerina governed ⟨interp⟩ | 358.5K/s | 378.9ms | 437.0ms | 89.9MB | 8 B/op | 0.10× | 0.01× |
| 8 | ⚫ | Galerina manifest ⟨interp⟩ | 347.2K/s | 391.3ms | 391.0ms | 89.4MB | 12 B/op | 0.10× | 0.01× |

> 🧠 **Lowest heap/op:** Python (~0) · **highest:** Galerina passive ⟨interp⟩ (1.6 KB/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### spore-container

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Rust (generic) | 126.9K/s | 2.36s | — | — | ~0 (native) | 1.81× | 2.94× |
| 🥈 | 🟢 | Rust AVX2 | 125.3K/s | 2.39s | — | — | ~0 (native) | 1.79× | 2.91× |
| 🥉 | 🟢 | Python | 70.0K/s | 1.43s | — | — | ~0 | 1.00× | 1.62× |
| 4 | 🟢 | Node.js | 43.1K/s | 6.96s | 8.30s | 63.0MB | 5 B/op | 0.62× | 1.00× |

> 🧠 **Lowest heap/op:** Python (~0) · **highest:** Node.js (5 B/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### framework-pipeline

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Python | 117.5K/s | 1.70s | — | — | ~0 | 1.00× | — |

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
| 🥉 | 🟢 | Node.js | 🖥️ CPU (cpu (serial)) | 985.22M/s | 507.5ms | 1.00× |
| 4 | 🟡 | WASM ▶ production | 🖥️ CPU (cpu (wasm)) | 465.91M/s | 1.07s | 0.47× |
| 5 | ⚫ | Python | 🖥️ CPU (cpu (serial)) | 6.69M/s | 7.47s | 0.01× |
| 6 | ⚫ | Deno WebGPU (NVIDIA GeForce RTX 2060) | 🎮 GPU (gpu (WebGPU — NVIDIA GeForce RTX 2060)) | 4.05M/s | 24.7ms | 0.00× |
| 7 | ⚫ | Galerina passive ⟨interp⟩ | 🖥️ CPU (cpu) | 391.0K/s | 0.2ms | 0.00× |
| 8 | ⚫ | Galerina manifest ⟨interp⟩ | 🖥️ CPU (cpu) | 346.6K/s | 288.5ms | 0.00× |
| 9 | ⚫ | Galerina governed ⟨interp⟩ | 🖥️ CPU (cpu) | 343.9K/s | 290.8ms | 0.00× |

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
| **compute-mix** | Node.js | **🏆 winner** | **🏆 winner** | **🏆 winner** | **🏆 winner** | **180× slower** | **61× slower** | **76× slower** | **81× slower** | 2× slower | not run — no GPU path |
| **arithmetic-threshold** | C++ | 1.2× slower | 1.2× slower | **🏆 winner** | 2× slower | **452× slower** | **58.7K× slower** | **360× slower** | **358× slower** | 4× slower | not run — no GPU path |
| **six-digit-guess** | Rust (generic) | 1.1× slower | **🏆 winner** | 1.1× slower | **28× slower** | **742× slower** | **3.7K× slower** | **1.7K× slower** | **1.7K× slower** | 2× slower | not run — no GPU path |
| **record-allocation** | Rust (generic) | **🏆 winner** | **🏆 winner** | not run — no C++ impl | **21× slower** | **296× slower** | **143× slower** | **448× slower** | **505× slower** | 2× slower | not run — no GPU path |
| **fibonacci-recursive** | Galerina passive ⟨interp⟩ | **101× slower** | **101× slower** | not run — no C++ impl | **396× slower** | **8.6K× slower** | **🏆 winner** | **2.8K× slower** | **3.9K× slower** | 3× slower | not run — no GPU path |
| **tower-of-hanoi** | Rust AVX2 | **🏆 winner** | **🏆 winner** | not run — no C++ impl | 2× slower | **83× slower** | **2.5K× slower** | **2.5K× slower** | **2.6K× slower** | 2× slower | not run — no GPU path |
| **collection-pipeline** | Rust AVX2 | **🏆 winner** | 3× slower | not run — no C++ impl | **191× slower** | **1.2K× slower** | **1.6K× slower** | **5.7K× slower** | **6.2K× slower** | **32× slower** | not run — no GPU path |
| **hardware-targets** | WASM ▶ production | **32× slower** | **32× slower** | not run — no C++ impl | **42× slower** | not run | **477× slower** | **11.3K× slower** | **16.6K× slower** | **🏆 winner** | not run — no GPU path |
| **low-memory** | Rust AVX2 | **🏆 winner** | 5× slower | not run — no C++ impl | 9× slower | **2.1K× slower** | **36.9K× slower** | **50.8K× slower** | **43.9K× slower** | **13× slower** | not run — no GPU path |
| **gpu-compute** | Rust AVX2 | **🏆 winner** | **🏆 winner** | not run — no C++ impl | 1.2× slower | **176× slower** | **3.0K× slower** | **3.4K× slower** | **3.4K× slower** | 3× slower | **291× slower** |
| **matrix-multiply** | Deno WebGPU (NVIDIA GeForce RTX 2060) | 1.2× slower | 1.2× slower | not run — no C++ impl | 3× slower | **234× slower** | **2.0K× slower** | **2.6K× slower** | **2.6K× slower** | 4× slower | **🏆 winner** |
| **crypto-ops** | Galerina passive ⟨interp⟩ | no comparable metric | no comparable metric | not run — no C++ impl | no comparable metric | no comparable metric | **🏆 winner** | 3× slower | **33× slower** | no WASM — strings/records | not run — no GPU path |
| **text-html** | Galerina passive ⟨interp⟩ | no comparable metric | no comparable metric | not run — no C++ impl | no comparable metric | no comparable metric | **🏆 winner** | **28× slower** | **58× slower** | no WASM — strings/records | not run — no GPU path |
| **tri-logic** | Rust (generic) | **🏆 winner** | **🏆 winner** | not run — no C++ impl | 1.4× slower | **169× slower** | **4.0K× slower** | **4.0K× slower** | **4.2K× slower** | 3× slower | not run — no GPU path |
| **data-query** | Node.js | not run — no native impl | not run — no native impl | not run — no C++ impl | **🏆 winner** | **98× slower** | **1.5K× slower** | **1.8K× slower** | **1.9K× slower** | no WASM build | not run — no GPU path |
| **call-chain** | Node.js | not run — no native impl | not run — no native impl | not run — no C++ impl | **🏆 winner** | **211× slower** | **5.4K× slower** | **5.9K× slower** | **5.7K× slower** | 6× slower | not run — no GPU path |
| **nbody** | Node.js | not run — no native impl | not run — no native impl | not run — no C++ impl | **🏆 winner** | **114× slower** | **1.9K× slower** | **2.0K× slower** | **2.0K× slower** | 4× slower | not run — no GPU path |
| **json-parse** | Node.js | not run — no native impl | not run — no native impl | not run — no C++ impl | **🏆 winner** | 6× slower | **316× slower** | **595× slower** | **570× slower** | no WASM — strings/records | not run — no GPU path |
| **mandelbrot** | Rust AVX2 | **🏆 winner** | **🏆 winner** | not run — no C++ impl | 4× slower | **138× slower** | **3.0K× slower** | **3.1K× slower** | **3.1K× slower** | 3× slower | not run — no GPU path |
| **spectral-norm** | Rust AVX2 | **🏆 winner** | **🏆 winner** | not run — no C++ impl | 2× slower | **194× slower** | not run | not run | not run | no WASM build | not run — no GPU path |
| **binary-trees** | WASM ▶ production | **40× slower** | **38× slower** | not run — no C++ impl | 9× slower | **161× slower** | **1.4K× slower** | **1.7K× slower** | **1.6K× slower** | **🏆 winner** | not run — no GPU path |
| **spore-container** | Rust (generic) | **🏆 winner** | **🏆 winner** | not run — no C++ impl | 3× slower | 2× slower | not run | not run | not run | no WASM — strings/records | not run — no GPU path |
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
| 🥇 | Node.js | 135.12M/s | 🏆 winner | 180× faster |
| 🥈 | C++ | 131.93M/s | 1.0× slower | 176× faster |
| 🥉 | Rust (generic) | 131.80M/s | 1.0× slower | 176× faster |
| 4 | Rust AVX2 | 129.26M/s | 1.0× slower | 172× faster |
| 5 | WASM ▶ production | 76.54M/s | 1.8× slower | 102× faster |
| 6 | Galerina passive ⟨interp⟩ ⚠️cache | 2.21M/s | 61× slower | 2.9× faster |
| 7 | Galerina manifest ⟨interp⟩ | 1.79M/s | 76× slower | 2.4× faster |
| 8 | Galerina governed ⟨interp⟩ | 1.66M/s | 81× slower | 2.2× faster |
| 9 | Python | 750.2K/s | 180× slower | — (slowest) |

### arithmetic-threshold
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | C++ | 1.88B/s | 🏆 winner | 58.7K× faster |
| 🥈 | Rust (generic) | 1.57B/s | 1.2× slower | 48.8K× faster |
| 🥉 | Rust AVX2 | 1.57B/s | 1.2× slower | 48.8K× faster |
| 4 | Node.js | 968.18M/s | 1.9× slower | 30.2K× faster |
| 5 | WASM ▶ production | 487.46M/s | 3.9× slower | 15.2K× faster |
| 6 | Galerina governed ⟨interp⟩ | 5.26M/s | 358× slower | 164× faster |
| 7 | Galerina manifest ⟨interp⟩ | 5.23M/s | 360× slower | 163× faster |
| 8 | Python | 4.16M/s | 452× slower | 130× faster |
| 9 | Galerina passive ⟨interp⟩ ⚠️cache | 32.1K/s | 58.7K× slower | — (slowest) |

### six-digit-guess
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | Rust (generic) | 77.84M/s | 🏆 winner | 3.7K× faster |
| 🥈 | Rust AVX2 | 73.48M/s | 1.1× slower | 3.5K× faster |
| 🥉 | C++ | 68.43M/s | 1.1× slower | 3.3K× faster |
| 4 | WASM ▶ production | 36.06M/s | 2.2× slower | 1.7K× faster |
| 5 | Node.js | 2.82M/s | 28× slower | 134× faster |
| 6 | Python | 104.9K/s | 742× slower | 5.0× faster |
| 7 | Galerina governed ⟨interp⟩ | 45.9K/s | 1.7K× slower | 2.2× faster |
| 8 | Galerina manifest ⟨interp⟩ | 45.2K/s | 1.7K× slower | 2.2× faster |
| 9 | Galerina passive ⟨interp⟩ ⚠️cache | 21.0K/s | 3.7K× slower | — (slowest) |

### record-allocation
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | Rust (generic) | 1.18B/s | 🏆 winner | 505× faster |
| 🥈 | Rust AVX2 | 1.18B/s | 1.0× slower | 505× faster |
| 🥉 | WASM ▶ production | 548.98M/s | 2.1× slower | 236× faster |
| 4 | Node.js | 55.00M/s | 21× slower | 24× faster |
| 5 | Galerina passive ⟨interp⟩ ⚠️cache | 8.23M/s | 143× slower | 3.5× faster |
| 6 | Python | 3.98M/s | 296× slower | 1.7× faster |
| 7 | Galerina manifest ⟨interp⟩ | 2.62M/s | 448× slower | 1.1× faster |
| 8 | Galerina governed ⟨interp⟩ | 2.33M/s | 505× slower | — (slowest) |

### fibonacci-recursive
> 🏆 cache-hit "winner" is Galerina passive (memoised); **real compute winner: WASM ▶ production at 17.1K/s**.
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | Galerina passive ⟨interp⟩ ⚠️cache | 50.4K/s | 🏆 winner | 8.6K× faster |
| 🥈 | WASM ▶ production | 17.1K/s | 2.9× slower | 2.9K× faster |
| 🥉 | Rust AVX2 | 499.9/s | 101× slower | 85× faster |
| 4 | Rust (generic) | 499.5/s | 101× slower | 85× faster |
| 5 | Node.js | 127.0/s | 396× slower | 22× faster |
| 6 | Galerina manifest ⟨interp⟩ | 18.0/s | 2.8K× slower | 3.1× faster |
| 7 | Galerina governed ⟨interp⟩ | 13.0/s | 3.9K× slower | 2.2× faster |
| 8 | Python | 5.9/s | 8.6K× slower | — (slowest) |

### tower-of-hanoi
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | Rust AVX2 | 252.25M/s | 🏆 winner | 2.6K× faster |
| 🥈 | Rust (generic) | 245.61M/s | 1.0× slower | 2.5K× faster |
| 🥉 | Node.js | 129.79M/s | 1.9× slower | 1.3K× faster |
| 4 | WASM ▶ production | 121.28M/s | 2.1× slower | 1.2K× faster |
| 5 | Python | 3.05M/s | 83× slower | 31× faster |
| 6 | Galerina passive ⟨interp⟩ ⚠️cache | 102.2K/s | 2.5K× slower | 1.0× faster |
| 7 | Galerina manifest ⟨interp⟩ | 101.9K/s | 2.5K× slower | 1.0× faster |
| 8 | Galerina governed ⟨interp⟩ | 98.1K/s | 2.6K× slower | — (slowest) |

### collection-pipeline
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | Rust AVX2 | 13.26B/s | 🏆 winner | 6.2K× faster |
| 🥈 | Rust (generic) | 4.30B/s | 3.1× slower | 2.0K× faster |
| 🥉 | WASM ▶ production | 419.79M/s | 32× slower | 198× faster |
| 4 | Node.js | 69.29M/s | 191× slower | 33× faster |
| 5 | Python | 11.44M/s | 1.2K× slower | 5.4× faster |
| 6 | Galerina passive ⟨interp⟩ ⚠️cache | 8.20M/s | 1.6K× slower | 3.9× faster |
| 7 | Galerina manifest ⟨interp⟩ | 2.33M/s | 5.7K× slower | 1.1× faster |
| 8 | Galerina governed ⟨interp⟩ | 2.12M/s | 6.2K× slower | — (slowest) |

### hardware-targets
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | WASM ▶ production | 37.68M/s | 🏆 winner | 16.6K× faster |
| 🥈 | Rust (generic) | 1.18M/s | 32× slower | 517× faster |
| 🥉 | Rust AVX2 | 1.17M/s | 32× slower | 517× faster |
| 4 | Node.js | 907.2K/s | 42× slower | 399× faster |
| 5 | Galerina passive ⟨interp⟩ ⚠️cache | 79.0K/s | 477× slower | 35× faster |
| 6 | Galerina manifest ⟨interp⟩ | 3.3K/s | 11.3K× slower | 1.5× faster |
| 7 | Galerina governed ⟨interp⟩ | 2.3K/s | 16.6K× slower | — (slowest) |

### low-memory
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | Rust AVX2 | 6.16B/s | 🏆 winner | 50.8K× faster |
| 🥈 | Rust (generic) | 1.35B/s | 4.6× slower | 11.1K× faster |
| 🥉 | Node.js | 711.57M/s | 8.7× slower | 5.9K× faster |
| 4 | WASM ▶ production | 465.61M/s | 13× slower | 3.8K× faster |
| 5 | Python | 2.92M/s | 2.1K× slower | 24× faster |
| 6 | Galerina passive ⟨interp⟩ ⚠️cache | 166.7K/s | 36.9K× slower | 1.4× faster |
| 7 | Galerina governed ⟨interp⟩ | 140.3K/s | 43.9K× slower | 1.2× faster |
| 8 | Galerina manifest ⟨interp⟩ | 121.1K/s | 50.8K× slower | — (slowest) |

### gpu-compute
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | Rust AVX2 | 1.18B/s | 🏆 winner | 3.4K× faster |
| 🥈 | Rust (generic) | 1.18B/s | 1.0× slower | 3.4K× faster |
| 🥉 | Node.js | 985.22M/s | 1.2× slower | 2.9K× faster |
| 4 | WASM ▶ production | 465.91M/s | 2.5× slower | 1.4K× faster |
| 5 | Python | 6.69M/s | 176× slower | 19× faster |
| 6 | Deno WebGPU (NVIDIA GeForce RTX 2060) | 4.05M/s | 291× slower | 12× faster |
| 7 | Galerina passive ⟨interp⟩ ⚠️cache | 391.0K/s | 3.0K× slower | 1.1× faster |
| 8 | Galerina manifest ⟨interp⟩ | 346.6K/s | 3.4K× slower | 1.0× faster |
| 9 | Galerina governed ⟨interp⟩ | 343.9K/s | 3.4K× slower | — (slowest) |

### matrix-multiply
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | Deno WebGPU (NVIDIA GeForce RTX 2060) | 1.75B/s | 🏆 winner | 2.6K× faster |
| 🥈 | Rust (generic) | 1.51B/s | 1.2× slower | 2.2K× faster |
| 🥉 | Rust AVX2 | 1.43B/s | 1.2× slower | 2.1K× faster |
| 4 | Node.js | 610.54M/s | 2.9× slower | 911× faster |
| 5 | WASM ▶ production | 431.53M/s | 4.1× slower | 644× faster |
| 6 | Python | 7.48M/s | 234× slower | 11× faster |
| 7 | Galerina passive ⟨interp⟩ ⚠️cache | 887.0K/s | 2.0K× slower | 1.3× faster |
| 8 | Galerina governed ⟨interp⟩ | 680.4K/s | 2.6K× slower | 1.0× faster |
| 9 | Galerina manifest ⟨interp⟩ | 669.8K/s | 2.6K× slower | — (slowest) |

### crypto-ops
> 🏆 cache-hit "winner" is Galerina passive (memoised); **real compute winner: Galerina manifest ⟨interp⟩ at 2.0K/s**.
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | Galerina passive ⟨interp⟩ ⚠️cache | 6.3K/s | 🏆 winner | 33× faster |
| 🥈 | Galerina manifest ⟨interp⟩ | 2.0K/s | 3.1× slower | 11× faster |
| 🥉 | Galerina governed ⟨interp⟩ | 190.0/s | 33× slower | — (slowest) |

### text-html
> 🏆 cache-hit "winner" is Galerina passive (memoised); **real compute winner: Galerina manifest ⟨interp⟩ at 2.0K/s**.
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | Galerina passive ⟨interp⟩ ⚠️cache | 57.4K/s | 🏆 winner | 58× faster |
| 🥈 | Galerina manifest ⟨interp⟩ | 2.0K/s | 28× slower | 2.1× faster |
| 🥉 | Galerina governed ⟨interp⟩ | 990.0/s | 58× slower | — (slowest) |

### tri-logic
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | Rust (generic) | 1.38B/s | 🏆 winner | 4.2K× faster |
| 🥈 | Rust AVX2 | 1.38B/s | 1.0× slower | 4.2K× faster |
| 🥉 | Node.js | 991.56M/s | 1.4× slower | 3.0K× faster |
| 4 | WASM ▶ production | 462.00M/s | 3.0× slower | 1.4K× faster |
| 5 | Python | 8.21M/s | 169× slower | 25× faster |
| 6 | Galerina manifest ⟨interp⟩ | 344.0K/s | 4.0K× slower | 1.0× faster |
| 7 | Galerina passive ⟨interp⟩ ⚠️cache | 342.0K/s | 4.0K× slower | 1.0× faster |
| 8 | Galerina governed ⟨interp⟩ | 328.9K/s | 4.2K× slower | — (slowest) |

### data-query
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | Node.js | 385.01M/s | 🏆 winner | 1.9K× faster |
| 🥈 | Python | 3.93M/s | 98× slower | 19× faster |
| 🥉 | Galerina passive ⟨interp⟩ ⚠️cache | 264.5K/s | 1.5K× slower | 1.3× faster |
| 4 | Galerina manifest ⟨interp⟩ | 216.1K/s | 1.8K× slower | 1.1× faster |
| 5 | Galerina governed ⟨interp⟩ | 201.4K/s | 1.9K× slower | — (slowest) |

### call-chain
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | Node.js | 316.06M/s | 🏆 winner | 5.9K× faster |
| 🥈 | WASM ▶ production | 54.45M/s | 5.8× slower | 1.0K× faster |
| 🥉 | Python | 1.50M/s | 211× slower | 28× faster |
| 4 | Galerina passive ⟨interp⟩ ⚠️cache | 59.0K/s | 5.4K× slower | 1.1× faster |
| 5 | Galerina governed ⟨interp⟩ | 55.2K/s | 5.7K× slower | 1.0× faster |
| 6 | Galerina manifest ⟨interp⟩ | 53.3K/s | 5.9K× slower | — (slowest) |

### nbody
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | Node.js | 122.49M/s | 🏆 winner | 2.0K× faster |
| 🥈 | WASM ▶ production | 29.09M/s | 4.2× slower | 470× faster |
| 🥉 | Python | 1.07M/s | 114× slower | 17× faster |
| 4 | Galerina passive ⟨interp⟩ ⚠️cache | 65.2K/s | 1.9K× slower | 1.1× faster |
| 5 | Galerina manifest ⟨interp⟩ | 62.5K/s | 2.0K× slower | 1.0× faster |
| 6 | Galerina governed ⟨interp⟩ | 61.9K/s | 2.0K× slower | — (slowest) |

### json-parse
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | Node.js | 3.02M/s | 🏆 winner | 595× faster |
| 🥈 | Python | 500.5K/s | 6.0× slower | 99× faster |
| 🥉 | Galerina passive ⟨interp⟩ ⚠️cache | 9.6K/s | 316× slower | 1.9× faster |
| 4 | Galerina governed ⟨interp⟩ | 5.3K/s | 570× slower | 1.0× faster |
| 5 | Galerina manifest ⟨interp⟩ | 5.1K/s | 595× slower | — (slowest) |

### mandelbrot
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | Rust AVX2 | 23.43M/s | 🏆 winner | 3.1K× faster |
| 🥈 | Rust (generic) | 23.42M/s | 1.0× slower | 3.1K× faster |
| 🥉 | WASM ▶ production | 8.88M/s | 2.6× slower | 1.2K× faster |
| 4 | Node.js | 6.24M/s | 3.8× slower | 823× faster |
| 5 | Python | 169.2K/s | 138× slower | 22× faster |
| 6 | Galerina passive ⟨interp⟩ ⚠️cache | 7.9K/s | 3.0K× slower | 1.0× faster |
| 7 | Galerina governed ⟨interp⟩ | 7.6K/s | 3.1K× slower | 1.0× faster |
| 8 | Galerina manifest ⟨interp⟩ | 7.6K/s | 3.1K× slower | — (slowest) |

### spectral-norm
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | Rust AVX2 | 371.35M/s | 🏆 winner | 194× faster |
| 🥈 | Rust (generic) | 368.16M/s | 1.0× slower | 192× faster |
| 🥉 | Node.js | 242.09M/s | 1.5× slower | 126× faster |
| 4 | Python | 1.92M/s | 194× slower | — (slowest) |

### binary-trees
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | WASM ▶ production | 582.56M/s | 🏆 winner | 1.7K× faster |
| 🥈 | Node.js | 67.30M/s | 8.7× slower | 194× faster |
| 🥉 | Rust (generic) | 15.32M/s | 38× slower | 44× faster |
| 4 | Rust AVX2 | 14.57M/s | 40× slower | 42× faster |
| 5 | Python | 3.62M/s | 161× slower | 10× faster |
| 6 | Galerina passive ⟨interp⟩ ⚠️cache | 430.7K/s | 1.4K× slower | 1.2× faster |
| 7 | Galerina governed ⟨interp⟩ | 358.5K/s | 1.6K× slower | 1.0× faster |
| 8 | Galerina manifest ⟨interp⟩ | 347.2K/s | 1.7K× slower | — (slowest) |

### spore-container
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | Rust (generic) | 126.9K/s | 🏆 winner | 2.9× faster |
| 🥈 | Rust AVX2 | 125.3K/s | 1.0× slower | 2.9× faster |
| 🥉 | Python | 70.0K/s | 1.8× slower | 1.6× faster |
| 4 | Node.js | 43.1K/s | 2.9× slower | — (slowest) |

### framework-pipeline
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | Python | 117.5K/s | 🏆 winner | — (slowest) |


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

