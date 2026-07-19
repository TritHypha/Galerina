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
| compute-mix | 77.01M/s | ⚪ 1.7× slower | ⚪ 1.8× slower | 1.64M/s | WASM near native |
| arithmetic-threshold | 491.64M/s | UNCERTIFIED | UNCERTIFIED | 5.06M/s | not yet work-equivalence-certified (N/work mismatch) |
| six-digit-guess | 35.85M/s | UNCERTIFIED | UNCERTIFIED | 45.6K/s | not yet work-equivalence-certified (N/work mismatch) |
| fibonacci-recursive | 17.0K/s | UNCERTIFIED | UNCERTIFIED | 13.0/s | not yet work-equivalence-certified (N/work mismatch) |
| tower-of-hanoi | 121.88M/s | 🟡 2.1× slower | 🟢 1.1× slower | 92.9K/s | WASM usable |
| hardware-targets | 39.44M/s | UNCERTIFIED | UNCERTIFIED | 3.2K/s | not yet work-equivalence-certified (N/work mismatch) |
| matrix-multiply | 439.20M/s | 🟡 3.4× slower | ⚪ 1.4× slower | 710.3K/s | WASM usable |
| tri-logic | 464.18M/s | 🟡 3.0× slower | 🟡 2.1× slower | 327.2K/s | WASM usable |
| data-query | no WASM build | — | — | 232.8K/s | WASM not built for this lane yet |
| call-chain | 54.56M/s | — | 🟡 4.8× slower | 52.8K/s | WASM 2–10× under Node |
| nbody | 29.06M/s | — | 🟡 4.3× slower | 60.3K/s | WASM 2–10× under Node |
| mandelbrot | 9.02M/s | 🟡 2.6× slower | 🟢 1.4× | 7.2K/s | WASM usable |
| spectral-norm | no WASM build | — | — | not run | WASM not built for this lane yet |

> 🚦 🟢 ≥0.9 (≈native) · ⚪ ≥0.5 (within 2×) · 🟡 ≥0.1 (2–10× slower) · 🔴 ≥0.01 (10–100×) · ⚫ <0.01 (100×+).
> **Ceiling (fastest certified lane):** Deno WebGPU (NVIDIA GeForce RTX 2060) — 1.67B/s on matrix-multiply.

### Memory — heap bytes per operation (the honest metric; lower is better)

> Ranked by **bytes/op**, NOT throughput — these benchmarks measure allocation, so no cross-runtime
> throughput ratio (and no ⚫) is shown. Native Rust/C++ allocate off the GC heap (~0 native — see §2b/§4).

| Benchmark | 🏆 Best (lowest heap B/op) | Node.js | Python | WASM ▶ production | Galerina governed ⟨interp⟩ | Galerina manifest ⟨interp⟩ |
|---|---|---|---|---|---|---|
| record-allocation | **WASM ▶ production** (~0) | 1 B/op | ~0 | ~0 | 6 B/op | 9 B/op |
| collection-pipeline | **WASM ▶ production** (~0) | ~0 | ~0 | ~0 | 17 B/op | 14 B/op |
| low-memory | **Node.js** (~0) | ~0 | ~0 | ~0 | 41 B/op | 44 B/op |
| binary-trees | **Python** (~0) | 3 B/op | ~0 | ~0 | 16 B/op | 13 B/op |

> **No throughput ratio, no ⚫ here** — a memory benchmark ranked by throughput is exactly the
> cross-metric bug this section removes. record-allocation / binary-trees / collection-pipeline live
> here by bytes/op, so they no longer carry the ◇ shape-only marker; their shape rate is in §4.

### GPU — kernel-evals/s (GPU-shaped workload; matrix-multiply dual-homes here)

> Cross-runtime. Deno WebGPU is the only real-dispatch path; where it produced no number on this
> machine it shows **⏳ GPU pending** — the honest status, never a fabricated GPU rate.

| Benchmark | 🏆 Winner | Speed | WASM ▶ production | GPU (Deno WebGPU) | vs Node (WASM) | Implication |
|---|---|---|---|---|---|---|
| gpu-compute | Rust (generic) | 1.18B/s | 466.79M/s | 4.13M/s | 🟡 2.1× slower | CPU/WASM lanes lead — real GPU dispatch pending (see §4b) |
| matrix-multiply | Deno WebGPU (NVIDIA GeForce RTX 2060) | 1.67B/s | 439.20M/s | 1.67B/s | ⚪ 1.4× slower | real GPU dispatch wins |

> **vs Node (WASM)** compares the WASM ▶ production lane to Node.js on the kernel. matrix-multiply also
> appears in the CPU Throughput table (dual-home) — it has both a compute lane and a WebGPU lane.

### I/O & DevTools — native units per benchmark (raw rate; NOT inner-op normalised)

> Each benchmark has its OWN unit, so there is **no cross-runtime ratio** — the winner is the fastest
> lane by raw rate WITHIN that benchmark's native unit. Comparing rates ACROSS benchmarks is meaningless.

| Benchmark | Unit (native) | 🏆 Fastest lane | Node.js | Python | Rust (generic) | WASM ▶ production | Galerina governed ⟨interp⟩ |
|---|---|---|---|---|---|---|---|
| crypto-ops | ops/s | **Galerina governed ⟨interp⟩** (213.0/s) | no comparable metric | no comparable metric | no comparable metric | no WASM — strings/records | 213.0/s |
| text-html | ops/s | **Galerina governed ⟨interp⟩** (917.0/s) | no comparable metric | no comparable metric | no comparable metric | no WASM — strings/records | 917.0/s |
| json-parse | records/s | **Node.js** (3.24M/s) | 3.24M/s | 467.0K/s | not run — no native impl | no WASM — strings/records | 5.6K/s |
| spore-container | containers/s | **Rust (generic)** (133.0K/s) | 41.8K/s | 62.8K/s | 133.0K/s | no WASM — strings/records | not run |
| framework-pipeline | requests/s | **Python** (111.5K/s) | not run | 111.5K/s | not run — no native impl | no WASM — strings/records | not run |
| http-throughput | requests/s | **Node.js** (3.6K/s) | 3.6K/s | not run | not run — no native impl | no WASM build | not run |
| naming-check | files/s | **Node.js** (6.8K/s) | 6.8K/s | not run | not run — no native impl | no WASM build | not run |
| context-receipt | receipts/s | **Node.js** (17.4K/s) | 17.4K/s | not run | not run — no native impl | no WASM build | not run |
| intelligence-search | queries/s | **Node.js** (113.1K/s) | 113.1K/s | not run | not run — no native impl | no WASM build | not run |
| provenance-trace | files/s | **Node.js** (770.0/s) | 770.0/s | not run | not run — no native impl | no WASM build | not run |

> Values are native rates (records/s, containers/s, requests/s, files/s, …), shown for transparency —
> NOT a cross-runtime ranking. The inner-op-normalised throughput lives in the CPU table above.

### Governance — Galerina-internal tier ratio ONLY (NO native column)

> This table's columns are Galerina tiers ONLY — there is **no rust/node/python/cpp column**, so a
> cross-runtime `N× slower` is structurally impossible here. The old six-figure governance-cost artifact
> came from dividing the governed tier by a native rate — a division this table cannot express.

| Benchmark | Galerina governed ⟨interp⟩ | Galerina manifest ⟨interp⟩ | WASM ▶ production | governed/manifest (gov overhead) |
|---|---|---|---|---|
| governance-cost | 741.0/s | 811.0/s | 2.94M/s | 0.91× governed/manifest (gov overhead ≈ 1.09×) |

> **governed/manifest** is governance-cost's honest headline: the same-N cost of always-on governance
> (capabilities + audit + proof) vs the pre-verified manifest. `gov overhead` = manifest ÷ governed.


### Full Throughput Table (all runtimes)

| Benchmark | Rust AVX-512 | Rust AVX2 | Rust (generic) | C++ | Node.js | Python | Galerina passive ⟨interp⟩ | Galerina manifest ⟨interp⟩ | Galerina governed ⟨interp⟩ | WASM ▶ production | Deno WebGPU (NVIDIA GeForce RTX 2060) | Node/Galerina† (🖥️ CPU) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| compute-mix | not run — no AVX-512 | **130.42M/s** | **132.15M/s** | **132.54M/s** | **135.51M/s** | 823.8K/s | 2.16M/s | 1.75M/s | 1.64M/s | 77.01M/s | not run — no GPU path | 82.8× |
| arithmetic-threshold | not run — no AVX-512 | 1.56B/s | 1.57B/s | **1.88B/s** | 971.99M/s | 4.18M/s | 31.4K/s | 5.09M/s | 5.06M/s | 491.64M/s | not run — no GPU path | 192.3× |
| six-digit-guess | not run — no AVX-512 | **75.15M/s** | **78.02M/s** | 68.85M/s | 2.74M/s | 87.0K/s | 13.9K/s | 48.3K/s | 45.6K/s | 35.85M/s | not run — no GPU path | 60.2× |
| record-allocation | not run — no AVX-512 | **1.17B/s** | **1.17B/s** | not run — no C++ impl | 52.53M/s | 5.55M/s | 8.42M/s | 2.44M/s | 2.41M/s | 550.93M/s | not run — no GPU path | 21.8× |
| fibonacci-recursive | not run — no AVX-512 | 499.7/s | 497.5/s | not run — no C++ impl | 127.1/s | 6.4/s | **52.0K/s** | 17.0/s | 13.0/s | 17.0K/s | not run — no GPU path | 9.78× |
| tower-of-hanoi | not run — no AVX-512 | **251.42M/s** | **252.59M/s** | not run — no C++ impl | 129.78M/s | 4.01M/s | 100.3K/s | 98.3K/s | 92.9K/s | 121.88M/s | not run — no GPU path | 1.4K× |
| collection-pipeline | not run — no AVX-512 | **13.29B/s** | 4.31B/s | not run — no C++ impl | 69.85M/s | 10.48M/s | 8.11M/s | 2.46M/s | 2.24M/s | 417.51M/s | not run — no GPU path | 31.2× |
| governance-cost ⚠️ | N/A — excluded | N/A — excluded | N/A — excluded | N/A — excluded | N/A — excluded | N/A — excluded | N/A — excluded | N/A — excluded | N/A — excluded | N/A — excluded | N/A — excluded | ⚠️ excluded — not unit-aligned |
| hardware-targets | not run — no AVX-512 | 1.17M/s | 1.18M/s | not run — no C++ impl | 908.3K/s | not run | 78.8K/s | 3.3K/s | 3.2K/s | **39.44M/s** | not run — no GPU path | 281.6× |
| low-memory | not run — no AVX-512 | **5.87B/s** | 1.35B/s | not run — no C++ impl | 704.05M/s | 3.48M/s | 161.2K/s | 118.7K/s | 140.0K/s | 471.69M/s | not run — no GPU path | 5.0K× |
| gpu-compute | not run — no AVX-512 | **1.18B/s** | **1.18B/s** | not run — no C++ impl | 984.75M/s | 5.89M/s | 371.0K/s | 338.8K/s | 330.6K/s | 466.79M/s | 4.13M/s | 3.0K× |
| matrix-multiply | not run — no AVX-512 | 1.43B/s | 1.50B/s | not run — no C++ impl | 613.21M/s | 7.16M/s | 892.9K/s | 697.5K/s | 710.3K/s | 439.20M/s | **1.67B/s** | 863.3× |
| crypto-ops | not run — no AVX-512 | no comparable metric | no comparable metric | not run — no C++ impl | no comparable metric | no comparable metric | **5.7K/s** | 1.8K/s | 213.0/s | no WASM — strings/records | not run — no GPU path | N/A — no Node.js |
| text-html | not run — no AVX-512 | no comparable metric | no comparable metric | not run — no C++ impl | no comparable metric | no comparable metric | **50.0K/s** | 2.4K/s | 917.0/s | no WASM — strings/records | not run — no GPU path | N/A — no Node.js |
| tri-logic | not run — no AVX-512 | **1.38B/s** | **1.35B/s** | not run — no C++ impl | 993.08M/s | 12.97M/s | 345.0K/s | 334.3K/s | 327.2K/s | 464.18M/s | not run — no GPU path | 3.0K× |
| data-query | not run — no AVX-512 | not run — no native impl | not run — no native impl | not run — no C++ impl | **387.43M/s** | 3.25M/s | 266.9K/s | 234.0K/s | 232.8K/s | no WASM build | not run — no GPU path | 1.7K× |
| call-chain | not run — no AVX-512 | not run — no native impl | not run — no native impl | not run — no C++ impl | **260.96M/s** | 1.50M/s | 60.0K/s | 53.8K/s | 52.8K/s | 54.56M/s | not run — no GPU path | 4.9K× |
| nbody | not run — no AVX-512 | not run — no native impl | not run — no native impl | not run — no C++ impl | **124.02M/s** | 1.08M/s | 61.3K/s | 60.3K/s | 60.3K/s | 29.06M/s | not run — no GPU path | 2.1K× |
| json-parse | not run — no AVX-512 | not run — no native impl | not run — no native impl | not run — no C++ impl | **3.24M/s** | 467.0K/s | 9.3K/s | 5.5K/s | 5.6K/s | no WASM — strings/records | not run — no GPU path | 582.2× |
| mandelbrot | not run — no AVX-512 | **23.38M/s** | **23.46M/s** | not run — no C++ impl | 6.25M/s | 153.8K/s | 7.5K/s | 7.4K/s | 7.2K/s | 9.02M/s | not run — no GPU path | 866.2× |
| spectral-norm | not run — no AVX-512 | **371.88M/s** | **377.23M/s** | not run — no C++ impl | 241.11M/s | 1.68M/s | not run | not run | not run | no WASM build | not run — no GPU path | N/A — no governed ⟨interp⟩ |
| binary-trees | not run — no AVX-512 | 20.10M/s | 20.40M/s | not run — no C++ impl | 70.50M/s | 2.86M/s | 385.8K/s | 354.3K/s | 359.1K/s | **583.75M/s** | not run — no GPU path | 196.3× |
| spore-container | not run — no AVX-512 | **132.2K/s** | **133.0K/s** | not run — no C++ impl | 41.8K/s | 62.8K/s | not run | not run | not run | no WASM — strings/records | not run — no GPU path | N/A — no governed ⟨interp⟩ |
| framework-pipeline | not run — no AVX-512 | not run — no native impl | not run — no native impl | not run — no C++ impl | not run | **111.5K/s** | not run | not run | not run | no WASM — strings/records | not run — no GPU path | N/A — neither ran |
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
| 🥇 | ⚫ | Galerina passive ⟨interp⟩ | -38.70 bytes/op ⚡ ~0 — no boxing | 161.2K/s | — | -387KB |
| 🥈 | 🟢 | Rust AVX2 | 0.00 bytes/op ⚡ ~0 — no boxing | 5.87B/s | — | — |
| 🥉 | 🟢 | Rust (generic) | 0.00 bytes/op ⚡ ~0 — no boxing | 1.35B/s | — | — |
| 4 | 🟢 | Node.js | 0.00 bytes/op ⚡ ~0 — no boxing | 704.05M/s | — | 16KB |
| 5 | ⚪ | WASM ▶ production | 0.00 bytes/op ⚡ ~0 — no boxing | 471.69M/s | — | 44KB |
| 6 | ⚫ | Python | 0.03 bytes/op ⚡ ~0 — no boxing | 3.48M/s | — | 272B |
| 7 | ⚫ | Galerina governed ⟨interp⟩ | 41 bytes/op ⚠ moderate | 140.0K/s | — | 411KB |
| 8 | ⚫ | Galerina manifest ⟨interp⟩ | 44 bytes/op ⚠ moderate | 118.7K/s | — | 443KB |

> **Why this matters:** Every byte allocated is a byte the GC must later collect.
> WASM and the bytecode VM run with zero allocation — ideal for high-throughput governed services.
> The tree-walker's per-node allocation is the primary target of Phases 31-33.


## 2b. General Memory Usage

| Benchmark | Runtime | RSS | Peak RSS | Heap Used | Heap Δ (execution) |
|---|---|---|---|---|---|
| compute-mix | Rust AVX2 | — | — | — | — |
| compute-mix | Rust (generic) | — | — | — | — |
| compute-mix | C++ | — | — | — | — |
| compute-mix | Node.js | 44.1MB | 44.4MB | 5.0MB | 948KB |
| compute-mix | Python | — | — | 3KB | 3KB |
| compute-mix | Galerina passive ⟨interp⟩ | 77.8MB | 77.8MB | 16.8MB | 73KB |
| compute-mix | Galerina manifest ⟨interp⟩ | 74.0MB | 74.0MB | 20.6MB | 4.5MB |
| compute-mix | Galerina governed ⟨interp⟩ | 72.9MB | 72.9MB | 20.3MB | 4.5MB |
| compute-mix | WASM ▶ production | 71.7MB | 71.7MB | 16.0MB | 22KB |
| arithmetic-threshold | Rust AVX2 | — | — | — | — |
| arithmetic-threshold | Rust (generic) | — | — | — | — |
| arithmetic-threshold | C++ | — | — | — | — |
| arithmetic-threshold | Node.js | 47.1MB | 47.3MB | 4.3MB | 214KB |
| arithmetic-threshold | Python | — | — | 4KB | 4KB |
| arithmetic-threshold | Galerina passive ⟨interp⟩ | 79.3MB | 79.3MB | 17.2MB | 39KB |
| arithmetic-threshold | Galerina manifest ⟨interp⟩ | 79.0MB | 79.0MB | 17.2MB | 839KB |
| arithmetic-threshold | Galerina governed ⟨interp⟩ | 79.3MB | 79.3MB | 17.2MB | 851KB |
| arithmetic-threshold | WASM ▶ production | 81.3MB | 81.3MB | 16.7MB | 6KB |
| six-digit-guess | Rust AVX2 | — | — | — | — |
| six-digit-guess | Rust (generic) | — | — | — | — |
| six-digit-guess | C++ | — | — | — | — |
| six-digit-guess | Node.js | 51.9MB | 51.9MB | 5.8MB | 1.1MB |
| six-digit-guess | Python | — | — | 583B | 583B |
| six-digit-guess | Galerina passive ⟨interp⟩ | 80.1MB | 80.1MB | 17.3MB | -2.0MB |
| six-digit-guess | Galerina manifest ⟨interp⟩ | 80.3MB | 80.3MB | 17.8MB | 843KB |
| six-digit-guess | Galerina governed ⟨interp⟩ | 80.3MB | 80.3MB | 17.0MB | 440KB |
| six-digit-guess | WASM ▶ production | 82.0MB | 82.0MB | 16.9MB | 1KB |
| record-allocation | Rust AVX2 | — | — | — | — |
| record-allocation | Rust (generic) | — | — | — | — |
| record-allocation | Node.js | 48.4MB | 48.4MB | 4.4MB | 294KB |
| record-allocation | Python | — | — | 492B | 492B |
| record-allocation | Galerina passive ⟨interp⟩ | 80.6MB | 80.6MB | 17.6MB | 188KB |
| record-allocation | Galerina manifest ⟨interp⟩ | 80.5MB | 80.5MB | 17.2MB | 88KB |
| record-allocation | Galerina governed ⟨interp⟩ | 81.4MB | 81.4MB | 17.2MB | 60KB |
| record-allocation | WASM ▶ production | 82.9MB | 82.9MB | 17.4MB | 50KB |
| fibonacci-recursive | Rust AVX2 | — | — | — | — |
| fibonacci-recursive | Rust (generic) | — | — | — | — |
| fibonacci-recursive | Node.js | 46.4MB | 46.4MB | 4.1MB | 5KB |
| fibonacci-recursive | Python | — | — | 464B | 464B |
| fibonacci-recursive | Galerina passive ⟨interp⟩ | 81.0MB | 81.0MB | 19.1MB | 59KB |
| fibonacci-recursive | Galerina manifest ⟨interp⟩ | 80.9MB | 80.9MB | 18.4MB | 1.1MB |
| fibonacci-recursive | Galerina governed ⟨interp⟩ | 80.7MB | 80.7MB | 18.2MB | 1.0MB |
| fibonacci-recursive | WASM ▶ production | 82.8MB | 82.8MB | 17.5MB | 3KB |
| tower-of-hanoi | Rust AVX2 | — | — | — | — |
| tower-of-hanoi | Rust (generic) | — | — | — | — |
| tower-of-hanoi | Node.js | 46.5MB | 46.5MB | 4.1MB | 17KB |
| tower-of-hanoi | Python | — | — | 1KB | 1KB |
| tower-of-hanoi | Galerina passive ⟨interp⟩ | 84.3MB | 84.3MB | 18.3MB | 47KB |
| tower-of-hanoi | Galerina manifest ⟨interp⟩ | 83.3MB | 83.3MB | 17.5MB | 1.2MB |
| tower-of-hanoi | Galerina governed ⟨interp⟩ | 83.4MB | 83.4MB | 18.7MB | 2.4MB |
| tower-of-hanoi | WASM ▶ production | 83.3MB | 83.3MB | 16.7MB | 1KB |
| collection-pipeline | Rust AVX2 | — | — | — | — |
| collection-pipeline | Rust (generic) | — | — | — | — |
| collection-pipeline | Node.js | 63.3MB | 63.3MB | 12.3MB | 8.1MB |
| collection-pipeline | Python | — | — | 224B | 224B |
| collection-pipeline | Galerina passive ⟨interp⟩ | 84.2MB | 84.2MB | 17.1MB | 271KB |
| collection-pipeline | Galerina manifest ⟨interp⟩ | 84.2MB | 84.2MB | 16.5MB | 140KB |
| collection-pipeline | Galerina governed ⟨interp⟩ | 85.3MB | 85.3MB | 16.6MB | 167KB |
| collection-pipeline | WASM ▶ production | 86.2MB | 86.2MB | 16.7MB | 24KB |
| governance-cost | Rust AVX2 | — | — | — | — |
| governance-cost | Rust (generic) | — | — | — | — |
| governance-cost | Node.js | 46.3MB | 46.3MB | 4.1MB | 26KB |
| governance-cost | Python | — | — | 272B | 272B |
| governance-cost | Galerina passive ⟨interp⟩ | 85.5MB | 85.5MB | 17.3MB | 495KB |
| governance-cost | Galerina manifest ⟨interp⟩ | 86.9MB | 86.9MB | 16.9MB | 417KB |
| governance-cost | Galerina governed ⟨interp⟩ | 85.7MB | 85.7MB | 17.0MB | 446KB |
| governance-cost | WASM ▶ production | 86.6MB | 86.6MB | 16.8MB | 50KB |
| hardware-targets | Rust AVX2 | — | — | — | — |
| hardware-targets | Rust (generic) | — | — | — | — |
| hardware-targets | Node.js | 48.2MB | 48.2MB | 4.5MB | 383KB |
| hardware-targets | Galerina passive ⟨interp⟩ | 84.7MB | 84.7MB | 16.8MB | -492KB |
| hardware-targets | Galerina manifest ⟨interp⟩ | 84.6MB | 84.6MB | 16.7MB | 82KB |
| hardware-targets | Galerina governed ⟨interp⟩ | 84.2MB | 84.2MB | 16.7MB | 78KB |
| hardware-targets | WASM ▶ production | 86.8MB | 86.8MB | 17.0MB | 85KB |
| low-memory | Rust AVX2 | — | — | — | — |
| low-memory | Rust (generic) | — | — | — | — |
| low-memory | Node.js | 46.7MB | 46.7MB | 4.1MB | 16KB |
| low-memory | Python | — | — | 272B | 272B |
| low-memory | Galerina passive ⟨interp⟩ | 84.4MB | 84.4MB | 17.1MB | -387KB |
| low-memory | Galerina manifest ⟨interp⟩ | 84.8MB | 84.8MB | 17.1MB | 443KB |
| low-memory | Galerina governed ⟨interp⟩ | 84.5MB | 84.5MB | 17.1MB | 411KB |
| low-memory | WASM ▶ production | 86.9MB | 86.9MB | 17.0MB | 44KB |
| gpu-compute | Rust AVX2 | — | — | — | — |
| gpu-compute | Rust (generic) | — | — | — | — |
| gpu-compute | Node.js | 46.5MB | 46.5MB | 4.1MB | 17KB |
| gpu-compute | Python | — | — | 304B | 304B |
| gpu-compute | Galerina passive ⟨interp⟩ | 84.9MB | 84.9MB | 19.1MB | 191KB |
| gpu-compute | Galerina manifest ⟨interp⟩ | 84.8MB | 84.8MB | 17.4MB | 640KB |
| gpu-compute | Galerina governed ⟨interp⟩ | 84.6MB | 84.6MB | 17.7MB | 932KB |
| gpu-compute | WASM ▶ production | 87.4MB | 87.4MB | 17.0MB | 2KB |
| gpu-compute | Deno WebGPU (NVIDIA GeForce RTX 2060) | — | — | — | — |
| matrix-multiply | Rust AVX2 | — | — | — | — |
| matrix-multiply | Rust (generic) | — | — | — | — |
| matrix-multiply | Node.js | 48.7MB | 48.7MB | 5.1MB | 957KB |
| matrix-multiply | Python | — | — | 392B | 392B |
| matrix-multiply | Galerina passive ⟨interp⟩ | 85.3MB | 85.3MB | 17.1MB | -1.9MB |
| matrix-multiply | Galerina manifest ⟨interp⟩ | 85.3MB | 85.3MB | 17.9MB | 1.0MB |
| matrix-multiply | Galerina governed ⟨interp⟩ | 85.0MB | 85.0MB | 18.8MB | 2.0MB |
| matrix-multiply | WASM ▶ production | 87.2MB | 87.2MB | 17.1MB | 3KB |
| matrix-multiply | Deno WebGPU (NVIDIA GeForce RTX 2060) | — | — | — | — |
| crypto-ops | Rust AVX2 | — | — | — | — |
| crypto-ops | Rust (generic) | — | — | — | — |
| crypto-ops | Node.js | 62.0MB | 62.0MB | 8.0MB | 2.4MB |
| crypto-ops | Python | — | — | 208B | 208B |
| crypto-ops | Galerina passive ⟨interp⟩ | 85.5MB | 85.5MB | 18.2MB | 627KB |
| crypto-ops | Galerina manifest ⟨interp⟩ | 85.6MB | 85.6MB | 17.1MB | 281KB |
| crypto-ops | Galerina governed ⟨interp⟩ | 85.6MB | 85.6MB | 17.1MB | 322KB |
| text-html | Rust AVX2 | — | — | — | — |
| text-html | Rust (generic) | — | — | — | — |
| text-html | Node.js | — | — | — | 472KB |
| text-html | Python | — | — | 208B | 208B |
| text-html | Galerina passive ⟨interp⟩ | 85.3MB | 85.3MB | 17.8MB | -399KB |
| text-html | Galerina manifest ⟨interp⟩ | 85.1MB | 85.1MB | 17.4MB | 149KB |
| text-html | Galerina governed ⟨interp⟩ | 85.6MB | 85.6MB | 17.4MB | 169KB |
| tri-logic | Rust AVX2 | — | — | — | — |
| tri-logic | Rust (generic) | — | — | — | — |
| tri-logic | Node.js | — | — | — | 355KB |
| tri-logic | Python | — | — | — | — |
| tri-logic | Galerina passive ⟨interp⟩ | 87.3MB | 87.3MB | 18.9MB | 231KB |
| tri-logic | Galerina manifest ⟨interp⟩ | 87.2MB | 87.2MB | 18.6MB | 1.3MB |
| tri-logic | Galerina governed ⟨interp⟩ | 87.0MB | 87.0MB | 19.0MB | 1.6MB |
| tri-logic | WASM ▶ production | 88.5MB | 88.5MB | 17.6MB | 1KB |
| data-query | Node.js | — | — | — | 22KB |
| data-query | Python | — | — | — | — |
| data-query | Galerina passive ⟨interp⟩ | 88.1MB | 88.1MB | 18.5MB | -962KB |
| data-query | Galerina manifest ⟨interp⟩ | 86.4MB | 86.4MB | 18.0MB | 640KB |
| data-query | Galerina governed ⟨interp⟩ | 87.8MB | 87.8MB | 18.6MB | 1.2MB |
| call-chain | Node.js | 47.5MB | 47.5MB | 4.4MB | 241KB |
| call-chain | Python | — | — | 368B | 368B |
| call-chain | Galerina passive ⟨interp⟩ | 87.5MB | 87.5MB | 21.3MB | 83KB |
| call-chain | Galerina manifest ⟨interp⟩ | 87.5MB | 87.5MB | 19.4MB | 2.0MB |
| call-chain | Galerina governed ⟨interp⟩ | 87.6MB | 87.6MB | 18.6MB | 1.2MB |
| call-chain | WASM ▶ production | 89.8MB | 89.8MB | 17.7MB | 1KB |
| nbody | Node.js | 48.7MB | 48.7MB | 4.2MB | 30KB |
| nbody | Python | — | — | 624B | 624B |
| nbody | Galerina passive ⟨interp⟩ | 87.6MB | 87.6MB | 17.8MB | -1.9MB |
| nbody | Galerina manifest ⟨interp⟩ | 87.6MB | 87.6MB | 17.8MB | 294KB |
| nbody | Galerina governed ⟨interp⟩ | 87.5MB | 87.5MB | 18.1MB | 574KB |
| nbody | WASM ▶ production | 88.5MB | 88.5MB | 17.8MB | 1KB |
| json-parse | Node.js | — | — | — | 255KB |
| json-parse | Python | — | — | 520B | 520B |
| json-parse | Galerina passive ⟨interp⟩ | 94.6MB | 94.6MB | 21.0MB | 426KB |
| json-parse | Galerina manifest ⟨interp⟩ | 87.4MB | 87.4MB | 20.3MB | 2.3MB |
| json-parse | Galerina governed ⟨interp⟩ | 95.2MB | 95.2MB | 19.1MB | 1.6MB |
| mandelbrot | Rust AVX2 | — | — | — | — |
| mandelbrot | Rust (generic) | — | — | — | — |
| mandelbrot | Node.js | 48.5MB | 48.5MB | 4.6MB | 431KB |
| mandelbrot | Python | — | — | 3KB | 3KB |
| mandelbrot | Galerina passive ⟨interp⟩ | 90.8MB | 90.8MB | 21.6MB | 167KB |
| mandelbrot | Galerina manifest ⟨interp⟩ | 90.8MB | 90.8MB | 20.2MB | 2.3MB |
| mandelbrot | Galerina governed ⟨interp⟩ | 90.0MB | 90.0MB | 20.3MB | 2.2MB |
| mandelbrot | WASM ▶ production | 95.2MB | 95.2MB | 18.4MB | 1KB |
| spectral-norm | Rust AVX2 | — | — | — | — |
| spectral-norm | Rust (generic) | — | — | — | — |
| spectral-norm | Node.js | 48.5MB | 48.5MB | 4.4MB | 293KB |
| spectral-norm | Python | — | — | 4KB | 4KB |
| binary-trees | Rust AVX2 | — | — | — | — |
| binary-trees | Rust (generic) | — | — | — | — |
| binary-trees | Node.js | 48.6MB | 48.6MB | 4.6MB | 429KB |
| binary-trees | Python | — | — | 368B | 368B |
| binary-trees | Galerina passive ⟨interp⟩ | 91.0MB | 91.0MB | 18.4MB | 69KB |
| binary-trees | Galerina manifest ⟨interp⟩ | 91.0MB | 91.0MB | 19.8MB | 1.8MB |
| binary-trees | Galerina governed ⟨interp⟩ | 90.2MB | 90.2MB | 20.1MB | 2.1MB |
| binary-trees | WASM ▶ production | 93.1MB | 93.1MB | 18.2MB | 2KB |
| spore-container | Rust AVX2 | — | — | — | — |
| spore-container | Rust (generic) | — | — | — | — |
| spore-container | Node.js | 64.5MB | 64.5MB | 8.9MB | 1.7MB |
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
| compute-mix | Node.js | 5.00s | 5.00s | 100% | 135.5K ops/CPU-ms |
| compute-mix | Python | 5.04s | 5.03s | 100% | 824.84 ops/CPU-ms |
| compute-mix | Galerina passive ⟨interp⟩ | 0.3ms | 0.0ms | 0% | — |
| compute-mix | Galerina manifest ⟨interp⟩ | 28.6ms | 16.0ms | 56% | 3.1K ops/CPU-ms |
| compute-mix | Galerina governed ⟨interp⟩ | 30.6ms | 47.0ms | 154% | 1.1K ops/CPU-ms |
| compute-mix | WASM ▶ production | 1.30s | 1.30s | 100% | 77.1K ops/CPU-ms |
| arithmetic-threshold | Rust AVX2 | 12.8ms | — | — | — |
| arithmetic-threshold | Rust (generic) | 12.8ms | — | — | — |
| arithmetic-threshold | C++ | 10.6ms | — | — | — |
| arithmetic-threshold | Node.js | 20.6ms | 15.0ms | 73% | 1.33M ops/CPU-ms |
| arithmetic-threshold | Python | 4.79s | 4.80s | 100% | 4.2K ops/CPU-ms |
| arithmetic-threshold | Galerina passive ⟨interp⟩ | 0.1ms | 0.0ms | 0% | — |
| arithmetic-threshold | Galerina manifest ⟨interp⟩ | 12.4ms | 30.0ms | 241% | 2.1K ops/CPU-ms |
| arithmetic-threshold | Galerina governed ⟨interp⟩ | 12.5ms | 31.0ms | 248% | 2.0K ops/CPU-ms |
| arithmetic-threshold | WASM ▶ production | 1.03s | 1.03s | 100% | 490.3K ops/CPU-ms |
| six-digit-guess | Rust AVX2 | 0.6ms | — | — | — |
| six-digit-guess | Rust (generic) | 0.5ms | — | — | — |
| six-digit-guess | C++ | 0.6ms | — | — | — |
| six-digit-guess | Node.js | 15.3ms | 31.0ms | 202% | 1.4K ops/CPU-ms |
| six-digit-guess | Python | 483.3ms | 484.4ms | 100% | 86.85 ops/CPU-ms |
| six-digit-guess | Galerina passive ⟨interp⟩ | 0.2ms | 0.0ms | 0% | — |
| six-digit-guess | Galerina manifest ⟨interp⟩ | 870.3ms | 938.0ms | 108% | 44.85 ops/CPU-ms |
| six-digit-guess | Galerina governed ⟨interp⟩ | 922.9ms | 921.0ms | 100% | 45.68 ops/CPU-ms |
| six-digit-guess | WASM ▶ production | 1.17s | 1.19s | 101% | 35.4K ops/CPU-ms |
| record-allocation | Rust AVX2 | 8.6ms | — | — | — |
| record-allocation | Rust (generic) | 8.5ms | — | — | — |
| record-allocation | Node.js | 3.8ms | 31.0ms | 814% | 6.5K ops/CPU-ms |
| record-allocation | Python | 36.0ms | 31.3ms | 87% | 6.4K ops/CPU-ms |
| record-allocation | Galerina passive ⟨interp⟩ | 0.3ms | 0.0ms | 0% | — |
| record-allocation | Galerina manifest ⟨interp⟩ | 4.1ms | 16.0ms | 390% | 625.00 ops/CPU-ms |
| record-allocation | Galerina governed ⟨interp⟩ | 4.2ms | 0.0ms | 0% | — |
| record-allocation | WASM ▶ production | 1.02s | 1.01s | 100% | 551.7K ops/CPU-ms |
| fibonacci-recursive | Rust AVX2 | 400.3ms | — | — | — |
| fibonacci-recursive | Rust (generic) | 402.0ms | — | — | — |
| fibonacci-recursive | Node.js | 786.9ms | 781.0ms | 99% | 0.13 ops/CPU-ms |
| fibonacci-recursive | Python | 3.13s | 3.13s | 100% | 0.01 ops/CPU-ms |
| fibonacci-recursive | Galerina passive ⟨interp⟩ | 0.1ms | 0.0ms | 0% | — |
| fibonacci-recursive | Galerina manifest ⟨interp⟩ | 57.8ms | 63.0ms | 109% | 0.02 ops/CPU-ms |
| fibonacci-recursive | Galerina governed ⟨interp⟩ | 79.7ms | 78.0ms | 98% | 0.01 ops/CPU-ms |
| fibonacci-recursive | WASM ▶ production | 1.06s | 1.05s | 99% | 17.19 ops/CPU-ms |
| tower-of-hanoi | Rust AVX2 | 521.3ms | — | — | — |
| tower-of-hanoi | Rust (generic) | 518.9ms | — | — | — |
| tower-of-hanoi | Node.js | 101.0ms | 94.0ms | 93% | 139.4K ops/CPU-ms |
| tower-of-hanoi | Python | 326.7ms | 328.1ms | 100% | 4.0K ops/CPU-ms |
| tower-of-hanoi | Galerina passive ⟨interp⟩ | 0.1ms | 0.0ms | 0% | — |
| tower-of-hanoi | Galerina manifest ⟨interp⟩ | 667.0ms | 688.0ms | 103% | 95.25 ops/CPU-ms |
| tower-of-hanoi | Galerina governed ⟨interp⟩ | 705.7ms | 718.0ms | 102% | 91.27 ops/CPU-ms |
| tower-of-hanoi | WASM ▶ production | 1.08s | 1.08s | 100% | 121.6K ops/CPU-ms |
| collection-pipeline | Rust AVX2 | 75.2ms | — | — | — |
| collection-pipeline | Rust (generic) | 232.1ms | — | — | — |
| collection-pipeline | Node.js | 715.8ms | 720.0ms | 101% | 69.4K ops/CPU-ms |
| collection-pipeline | Python | 4.77s | 4.77s | 100% | 10.5K ops/CPU-ms |
| collection-pipeline | Galerina passive ⟨interp⟩ | 0.4ms | 0.0ms | 0% | — |
| collection-pipeline | Galerina manifest ⟨interp⟩ | 4.1ms | 0.0ms | 0% | — |
| collection-pipeline | Galerina governed ⟨interp⟩ | 4.5ms | 0.0ms | 0% | — |
| collection-pipeline | WASM ▶ production | 1.01s | 1.00s | 99% | 420.0K ops/CPU-ms |
| governance-cost | Rust AVX2 | 11.0ms | — | — | — |
| governance-cost | Rust (generic) | 11.3ms | — | — | — |
| governance-cost | Node.js | 47.0ms | 47.0ms | 100% | — |
| governance-cost | Python | 4.91s | 4.91s | 100% | — |
| governance-cost | Galerina passive ⟨interp⟩ | 2.2ms | 0.0ms | 0% | — |
| governance-cost | Galerina manifest ⟨interp⟩ | 1.2ms | 0.0ms | 0% | — |
| governance-cost | Galerina governed ⟨interp⟩ | 1.4ms | 0.0ms | 0% | — |
| governance-cost | WASM ▶ production | 1.00s | 1.01s | 101% | — |
| hardware-targets | Rust AVX2 | 853.0ms | — | — | — |
| hardware-targets | Rust (generic) | 848.3ms | — | — | — |
| hardware-targets | Node.js | 1.10s | 1.11s | 101% | 901.71 ops/CPU-ms |
| hardware-targets | Galerina passive ⟨interp⟩ | 12.7ms | 16.0ms | 126% | — |
| hardware-targets | Galerina manifest ⟨interp⟩ | 0.3ms | 0.0ms | 0% | — |
| hardware-targets | Galerina governed ⟨interp⟩ | 0.3ms | 0.0ms | 0% | — |
| hardware-targets | WASM ▶ production | 1.00s | 1.02s | 102% | 38.8K ops/CPU-ms |
| low-memory | Rust AVX2 | 170.4ms | — | — | — |
| low-memory | Rust (generic) | 740.0ms | — | — | — |
| low-memory | Node.js | 71.0ms | 78.0ms | 110% | 641.0K ops/CPU-ms |
| low-memory | Python | 2.88s | 2.86s | 99% | 3.5K ops/CPU-ms |
| low-memory | Galerina passive ⟨interp⟩ | 0.7ms | 0.0ms | 0% | — |
| low-memory | Galerina manifest ⟨interp⟩ | 84.2ms | 187.0ms | 222% | 53.48 ops/CPU-ms |
| low-memory | Galerina governed ⟨interp⟩ | 71.4ms | 63.0ms | 88% | 158.73 ops/CPU-ms |
| low-memory | WASM ▶ production | 1.02s | 1.03s | 101% | 465.1K ops/CPU-ms |
| gpu-compute | Rust AVX2 | 4.25s | — | — | — |
| gpu-compute | Rust (generic) | 4.24s | — | — | — |
| gpu-compute | Node.js | 507.7ms | 500.0ms | 98% | 1.00M ops/CPU-ms |
| gpu-compute | Python | 8.49s | 8.50s | 100% | 5.9K ops/CPU-ms |
| gpu-compute | Galerina passive ⟨interp⟩ | 0.2ms | 0.0ms | 0% | — |
| gpu-compute | Galerina manifest ⟨interp⟩ | 295.2ms | 359.0ms | 122% | 278.55 ops/CPU-ms |
| gpu-compute | Galerina governed ⟨interp⟩ | 302.5ms | 329.0ms | 109% | 303.95 ops/CPU-ms |
| gpu-compute | WASM ▶ production | 1.07s | 1.08s | 101% | 463.4K ops/CPU-ms |
| gpu-compute | Deno WebGPU (NVIDIA GeForce RTX 2060) | 24.2ms | — | — | — |
| matrix-multiply | Rust AVX2 | 91.9ms | — | — | — |
| matrix-multiply | Rust (generic) | 87.3ms | — | — | — |
| matrix-multiply | Node.js | 213.7ms | 203.0ms | 95% | 645.7K ops/CPU-ms |
| matrix-multiply | Python | 1.83s | — | — | — |
| matrix-multiply | Galerina passive ⟨interp⟩ | 0.3ms | 0.0ms | 0% | — |
| matrix-multiply | Galerina manifest ⟨interp⟩ | 47.0ms | 140.0ms | 298% | 234.06 ops/CPU-ms |
| matrix-multiply | Galerina governed ⟨interp⟩ | 46.1ms | 94.0ms | 204% | 348.60 ops/CPU-ms |
| matrix-multiply | WASM ▶ production | 1.04s | 1.05s | 100% | 438.2K ops/CPU-ms |
| matrix-multiply | Deno WebGPU (NVIDIA GeForce RTX 2060) | 12.5ms | — | — | — |
| crypto-ops | Galerina passive ⟨interp⟩ | 17.6ms | 16.0ms | 91% | — |
| crypto-ops | Galerina manifest ⟨interp⟩ | 0.6ms | 0.0ms | 0% | — |
| crypto-ops | Galerina governed ⟨interp⟩ | 4.7ms | 16.0ms | 341% | 0.06 ops/CPU-ms |
| text-html | Galerina passive ⟨interp⟩ | 2.0ms | 0.0ms | 0% | — |
| text-html | Galerina manifest ⟨interp⟩ | 0.4ms | 0.0ms | 0% | — |
| text-html | Galerina governed ⟨interp⟩ | 1.1ms | 0.0ms | 0% | — |
| tri-logic | Rust AVX2 | 433.8ms | — | — | — |
| tri-logic | Rust (generic) | 444.1ms | — | — | — |
| tri-logic | Node.js | 302.1ms | — | — | — |
| tri-logic | Python | 925.4ms | — | — | — |
| tri-logic | Galerina passive ⟨interp⟩ | 1.9ms | 0.0ms | 0% | — |
| tri-logic | Galerina manifest ⟨interp⟩ | 897.4ms | 891.0ms | 99% | 336.70 ops/CPU-ms |
| tri-logic | Galerina governed ⟨interp⟩ | 916.8ms | 922.0ms | 101% | 325.38 ops/CPU-ms |
| tri-logic | WASM ▶ production | 1.29s | 1.28s | 99% | 468.4K ops/CPU-ms |
| data-query | Node.js | 129.1ms | — | — | — |
| data-query | Python | 922.0ms | — | — | — |
| data-query | Galerina passive ⟨interp⟩ | 1.2ms | 0.0ms | 0% | — |
| data-query | Galerina manifest ⟨interp⟩ | 42.7ms | 32.0ms | 75% | 312.50 ops/CPU-ms |
| data-query | Galerina governed ⟨interp⟩ | 43.0ms | 47.0ms | 109% | 212.77 ops/CPU-ms |
| call-chain | Node.js | 7.7ms | 0.0ms | 0% | — |
| call-chain | Python | 664.5ms | 671.9ms | 101% | 1.5K ops/CPU-ms |
| call-chain | Galerina passive ⟨interp⟩ | 0.1ms | 0.0ms | 0% | — |
| call-chain | Galerina manifest ⟨interp⟩ | 929.3ms | 953.0ms | 103% | 52.47 ops/CPU-ms |
| call-chain | Galerina governed ⟨interp⟩ | 947.6ms | 938.0ms | 99% | 53.30 ops/CPU-ms |
| call-chain | WASM ▶ production | 1.83s | 1.83s | 100% | 54.7K ops/CPU-ms |
| nbody | Node.js | 52.8ms | 62.0ms | 117% | 105.7K ops/CPU-ms |
| nbody | Python | 1.51s | — | — | — |
| nbody | Galerina passive ⟨interp⟩ | 0.3ms | 0.0ms | 0% | — |
| nbody | Galerina manifest ⟨interp⟩ | 543.8ms | 578.0ms | 106% | 56.69 ops/CPU-ms |
| nbody | Galerina governed ⟨interp⟩ | 543.8ms | 578.0ms | 106% | 56.69 ops/CPU-ms |
| nbody | WASM ▶ production | 1.13s | 1.14s | 101% | 28.7K ops/CPU-ms |
| json-parse | Galerina passive ⟨interp⟩ | 0.7ms | 0.0ms | 0% | — |
| json-parse | Galerina manifest ⟨interp⟩ | 90.5ms | 156.0ms | 172% | 3.20 ops/CPU-ms |
| json-parse | Galerina governed ⟨interp⟩ | 89.8ms | 109.0ms | 121% | 4.59 ops/CPU-ms |
| mandelbrot | Rust AVX2 | 140.2ms | — | — | — |
| mandelbrot | Rust (generic) | 139.7ms | — | — | — |
| mandelbrot | Node.js | 524.3ms | 516.0ms | 98% | 6.4K ops/CPU-ms |
| mandelbrot | Python | 21.31s | — | — | — |
| mandelbrot | Galerina passive ⟨interp⟩ | 0.2ms | 0.0ms | 0% | — |
| mandelbrot | Galerina manifest ⟨interp⟩ | 2.21s | 2.23s | 101% | 7.33 ops/CPU-ms |
| mandelbrot | Galerina governed ⟨interp⟩ | 2.27s | 2.28s | 100% | 7.18 ops/CPU-ms |
| mandelbrot | WASM ▶ production | 1.82s | 1.81s | 100% | 9.0K ops/CPU-ms |
| spectral-norm | Rust AVX2 | 26.9ms | — | — | — |
| spectral-norm | Rust (generic) | 26.5ms | — | — | — |
| spectral-norm | Node.js | 41.5ms | 47.0ms | 113% | 212.8K ops/CPU-ms |
| spectral-norm | Python | 5.95s | — | — | — |
| binary-trees | Rust AVX2 | 6.8ms | — | — | — |
| binary-trees | Rust (generic) | 6.7ms | — | — | — |
| binary-trees | Node.js | 1.9ms | 0.0ms | 0% | — |
| binary-trees | Python | 47.5ms | 46.9ms | 99% | 2.9K ops/CPU-ms |
| binary-trees | Galerina passive ⟨interp⟩ | 0.1ms | 0.0ms | 0% | — |
| binary-trees | Galerina manifest ⟨interp⟩ | 383.4ms | 375.0ms | 98% | 362.28 ops/CPU-ms |
| binary-trees | Galerina governed ⟨interp⟩ | 378.4ms | 405.0ms | 107% | 335.44 ops/CPU-ms |
| binary-trees | WASM ▶ production | 1.16s | 1.17s | 101% | 579.6K ops/CPU-ms |
| spore-container | Rust AVX2 | 2.27s | — | — | — |
| spore-container | Rust (generic) | 2.25s | — | — | — |
| spore-container | Node.js | 7.17s | 8.36s | 117% | 35.89 ops/CPU-ms |
| spore-container | Python | 1.59s | — | — | — |
| framework-pipeline | Python | 1.79s | — | — | — |
| http-throughput | Node.js | 83.0ms | — | — | — |
| naming-check | Node.js | 458.0ms | — | — | — |
| context-receipt | Node.js | 324.0ms | — | — | — |
| intelligence-search | Node.js | 44.0ms | — | — | — |
| provenance-trace | Node.js | 2.01s | — | — | — |

> **CPU utilisation** = CPU ms ÷ wall ms × 100. Node.js approaches 100% (single-thread JIT). Python may show <100% on Windows where process_time measures differently.

## 4. Per-Benchmark Detail

> **Heap/op** = heap bytes allocated per operation (the fair, workload-attributable memory metric).
> Managed runtimes (Node/Python/Galerina/WASM) report it via a GC'd before/after delta; native Rust/C++
> show **~0 (native)** — no GC-managed heap. `~0` = no measurable per-op allocation (e.g. V8 tagged ints);
> a large positive value (e.g. the Galerina tree-walker boxing a value per AST node) is allocation pressure.

### compute-mix

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Node.js | 135.51M/s | 5.00s | 5.00s | 44.1MB | ~0 | 164.5× | 1.00× |
| 🥈 | 🟢 | C++ | 132.54M/s | 30.00s | — | — | ~0 (native) | 160.9× | 0.98× |
| 🥉 | 🟢 | Rust (generic) | 132.15M/s | 5.00s | — | — | ~0 (native) | 160.4× | 0.98× |
| 4 | 🟢 | Rust AVX2 | 130.42M/s | 5.00s | — | — | ~0 (native) | 158.3× | 0.96× |
| 5 | ⚪ | WASM ▶ production | 77.01M/s | 1.30s | 1.30s | 71.7MB | ~0 | 93.5× | 0.57× |
| 6 | 🔴 | Galerina passive ⟨interp⟩ | 2.16M/s | 0.3ms | 0.0ms | 77.8MB | 108 B/op | 2.62× | 0.02× |
| 7 | 🔴 | Galerina manifest ⟨interp⟩ | 1.75M/s | 28.6ms | 16.0ms | 74.0MB | 90 B/op | 2.12× | 0.01× |
| 8 | 🔴 | Galerina governed ⟨interp⟩ | 1.64M/s | 30.6ms | 47.0ms | 72.9MB | 89 B/op | 1.99× | 0.01× |
| 9 | ⚫ | Python | 823.8K/s | 5.04s | 5.03s | — | ~0 | 1.00× | 0.01× |

> 🧠 **Lowest heap/op:** WASM ▶ production (~0) · **highest:** Galerina passive ⟨interp⟩ (108 B/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### arithmetic-threshold

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | C++ | 1.88B/s | 10.6ms | — | — | ~0 (native) | 450.6× | 1.94× |
| 🥈 | 🟢 | Rust (generic) | 1.57B/s | 12.8ms | — | — | ~0 (native) | 374.9× | 1.61× |
| 🥉 | 🟢 | Rust AVX2 | 1.56B/s | 12.8ms | — | — | ~0 (native) | 374.3× | 1.61× |
| 4 | 🟢 | Node.js | 971.99M/s | 20.6ms | 15.0ms | 47.1MB | ~0 | 232.8× | 1.00× |
| 5 | ⚪ | WASM ▶ production | 491.64M/s | 1.03s | 1.03s | 81.3MB | ~0 | 117.7× | 0.51× |
| 6 | ⚫ | Galerina manifest ⟨interp⟩ | 5.09M/s | 12.4ms | 30.0ms | 79.0MB | 13 B/op | 1.22× | 0.01× |
| 7 | ⚫ | Galerina governed ⟨interp⟩ | 5.06M/s | 12.5ms | 31.0ms | 79.3MB | 13 B/op | 1.21× | 0.01× |
| 8 | ⚫ | Python | 4.18M/s | 4.79s | 4.80s | — | ~0 | 1.00× | 0.00× |
| 9 | ⚫ | Galerina passive ⟨interp⟩ | 31.4K/s | 0.1ms | 0.0ms | 79.3MB | 12.9 KB/op | 0.01× | 0.00× |

> 🧠 **Lowest heap/op:** WASM ▶ production (~0) · **highest:** Galerina passive ⟨interp⟩ (12.9 KB/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### six-digit-guess

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Rust (generic) | 78.02M/s | 0.5ms | — | — | ~0 (native) | 896.4× | 28.4× |
| 🥈 | 🟢 | Rust AVX2 | 75.15M/s | 0.6ms | — | — | ~0 (native) | 863.4× | 27.4× |
| 🥉 | 🟢 | C++ | 68.85M/s | 0.6ms | — | — | ~0 (native) | 791.0× | 25.1× |
| 4 | 🟢 | WASM ▶ production | 35.85M/s | 1.17s | 1.19s | 82.0MB | ~0 | 411.9× | 13.1× |
| 5 | 🟢 | Node.js | 2.74M/s | 15.3ms | 31.0ms | 51.9MB | 27 B/op | 31.5× | 1.00× |
| 6 | 🔴 | Python | 87.0K/s | 483.3ms | 484.4ms | — | ~0 | 1.00× | 0.03× |
| 7 | 🔴 | Galerina manifest ⟨interp⟩ | 48.3K/s | 870.3ms | 938.0ms | 80.3MB | 20 B/op | 0.56× | 0.02× |
| 8 | 🔴 | Galerina governed ⟨interp⟩ | 45.6K/s | 922.9ms | 921.0ms | 80.3MB | 10 B/op | 0.52× | 0.02× |
| 9 | ⚫ | Galerina passive ⟨interp⟩ | 13.9K/s | 0.2ms | 0.0ms | 80.1MB | -653.8 KB/op | 0.16× | 0.01× |

> 🧠 **Lowest heap/op:** Galerina passive ⟨interp⟩ (-653.8 KB/op) · **highest:** Node.js (27 B/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### record-allocation

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Rust (generic) | 1.17B/s | 8.5ms | — | — | ~0 (native) | 210.8× | 22.3× |
| 🥈 | 🟢 | Rust AVX2 | 1.17B/s | 8.6ms | — | — | ~0 (native) | 210.4× | 22.2× |
| 🥉 | 🟢 | WASM ▶ production | 550.93M/s | 1.02s | 1.01s | 82.9MB | ~0 | 99.3× | 10.5× |
| 4 | 🟢 | Node.js | 52.53M/s | 3.8ms | 31.0ms | 48.4MB | 1 B/op | 9.46× | 1.00× |
| 5 | 🟡 | Galerina passive ⟨interp⟩ | 8.42M/s | 0.3ms | 0.0ms | 80.6MB | 76 B/op | 1.52× | 0.16× |
| 6 | 🟡 | Python | 5.55M/s | 36.0ms | 31.3ms | — | ~0 | 1.00× | 0.11× |
| 7 | 🔴 | Galerina manifest ⟨interp⟩ | 2.44M/s | 4.1ms | 16.0ms | 80.5MB | 9 B/op | 0.44× | 0.05× |
| 8 | 🔴 | Galerina governed ⟨interp⟩ | 2.41M/s | 4.2ms | 0.0ms | 81.4MB | 6 B/op | 0.43× | 0.05× |

> 🧠 **Lowest heap/op:** WASM ▶ production (~0) · **highest:** Galerina passive ⟨interp⟩ (76 B/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### fibonacci-recursive

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Galerina passive ⟨interp⟩ | 52.0K/s | 0.1ms | 0.0ms | 81.0MB | 11.5 KB/op | 8.1K× | 409.4× |
| 🥈 | 🟢 | WASM ▶ production | 17.0K/s | 1.06s | 1.05s | 82.8MB | ~0 | 2.7K× | 133.8× |
| 🥉 | 🟢 | Rust AVX2 | 499.7/s | 400.3ms | — | — | ~0 (native) | 78.2× | 3.93× |
| 4 | 🟢 | Rust (generic) | 497.5/s | 402.0ms | — | — | ~0 (native) | 77.9× | 3.92× |
| 5 | 🟢 | Node.js | 127.1/s | 786.9ms | 781.0ms | 46.4MB | 53 B/op | 19.9× | 1.00× |
| 6 | 🟡 | Galerina manifest ⟨interp⟩ | 17.0/s | 57.8ms | 63.0ms | 80.9MB | 1097.8 KB/op | 2.66× | 0.13× |
| 7 | 🟡 | Galerina governed ⟨interp⟩ | 13.0/s | 79.7ms | 78.0ms | 80.7MB | 949.0 KB/op | 2.03× | 0.10× |
| 8 | 🔴 | Python | 6.4/s | 3.13s | 3.13s | — | 23 B/op | 1.00× | 0.05× |

> 🧠 **Lowest heap/op:** WASM ▶ production (~0) · **highest:** Galerina manifest ⟨interp⟩ (1097.8 KB/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### tower-of-hanoi

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Rust (generic) | 252.59M/s | 518.9ms | — | — | ~0 (native) | 63.0× | 1.95× |
| 🥈 | 🟢 | Rust AVX2 | 251.42M/s | 521.3ms | — | — | ~0 (native) | 62.7× | 1.94× |
| 🥉 | 🟢 | Node.js | 129.78M/s | 101.0ms | 94.0ms | 46.5MB | ~0 | 32.3× | 1.00× |
| 4 | 🟢 | WASM ▶ production | 121.88M/s | 1.08s | 1.08s | 83.3MB | ~0 | 30.4× | 0.94× |
| 5 | 🔴 | Python | 4.01M/s | 326.7ms | 328.1ms | — | ~0 | 1.00× | 0.03× |
| 6 | ⚫ | Galerina passive ⟨interp⟩ | 100.3K/s | 0.1ms | 0.0ms | 84.3MB | 7.5 KB/op | 0.02× | 0.00× |
| 7 | ⚫ | Galerina manifest ⟨interp⟩ | 98.3K/s | 667.0ms | 688.0ms | 83.3MB | 18 B/op | 0.02× | 0.00× |
| 8 | ⚫ | Galerina governed ⟨interp⟩ | 92.9K/s | 705.7ms | 718.0ms | 83.4MB | 37 B/op | 0.02× | 0.00× |

> 🧠 **Lowest heap/op:** WASM ▶ production (~0) · **highest:** Galerina passive ⟨interp⟩ (7.5 KB/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### collection-pipeline

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Rust AVX2 | 13.29B/s | 75.2ms | — | — | ~0 (native) | 1.3K× | 190.3× |
| 🥈 | 🟢 | Rust (generic) | 4.31B/s | 232.1ms | — | — | ~0 (native) | 411.1× | 61.7× |
| 🥉 | 🟢 | WASM ▶ production | 417.51M/s | 1.01s | 1.00s | 86.2MB | ~0 | 39.8× | 5.98× |
| 4 | 🟢 | Node.js | 69.85M/s | 715.8ms | 720.0ms | 63.3MB | ~0 | 6.66× | 1.00× |
| 5 | 🟡 | Python | 10.48M/s | 4.77s | 4.77s | — | ~0 | 1.00× | 0.15× |
| 6 | 🟡 | Galerina passive ⟨interp⟩ | 8.11M/s | 0.4ms | 0.0ms | 84.2MB | 81 B/op | 0.77× | 0.12× |
| 7 | 🔴 | Galerina manifest ⟨interp⟩ | 2.46M/s | 4.1ms | 0.0ms | 84.2MB | 14 B/op | 0.23× | 0.04× |
| 8 | 🔴 | Galerina governed ⟨interp⟩ | 2.24M/s | 4.5ms | 0.0ms | 85.3MB | 17 B/op | 0.21× | 0.03× |

> 🧠 **Lowest heap/op:** WASM ▶ production (~0) · **highest:** Galerina passive ⟨interp⟩ (81 B/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### governance-cost ⚠️ (excluded — not unit-aligned)

> internal governed/manifest ratio — native baseline does no governance; not cross-runtime by design

| Runtime | Raw reported throughput (native unit — **NOT comparable**) | Wall |
|---|---|---|
| Rust AVX2 | 906.23M/s | 11.0ms |
| Rust (generic) | 887.06M/s | 11.3ms |
| Node.js | 2.13M/s | 47.0ms |
| Python | 20.4K/s | 4.91s |
| Galerina passive ⟨interp⟩ | 2.0K/s | 2.2ms |
| Galerina manifest ⟨interp⟩ | 811.0/s | 1.2ms |
| Galerina governed ⟨interp⟩ | 741.0/s | 1.4ms |
| WASM ▶ production | 2.94M/s | 1.00s |

### hardware-targets

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | WASM ▶ production | 39.44M/s | 1.00s | 1.02s | 86.8MB | ~0 | — | 43.4× |
| 🥈 | 🟢 | Rust (generic) | 1.18M/s | 848.3ms | — | — | ~0 (native) | — | 1.30× |
| 🥉 | 🟢 | Rust AVX2 | 1.17M/s | 853.0ms | — | — | ~0 (native) | — | 1.29× |
| 4 | 🟢 | Node.js | 908.3K/s | 1.10s | 1.11s | 48.2MB | ~0 | — | 1.00× |
| 5 | 🔴 | Galerina passive ⟨interp⟩ | 78.8K/s | 12.7ms | 16.0ms | 84.7MB | -492 B/op | — | 0.09× |
| 6 | ⚫ | Galerina manifest ⟨interp⟩ | 3.3K/s | 0.3ms | 0.0ms | 84.6MB | 79.9 KB/op | — | 0.00× |
| 7 | ⚫ | Galerina governed ⟨interp⟩ | 3.2K/s | 0.3ms | 0.0ms | 84.2MB | 76.0 KB/op | — | 0.00× |

> 🧠 **Lowest heap/op:** Galerina passive ⟨interp⟩ (-492 B/op) · **highest:** Galerina manifest ⟨interp⟩ (79.9 KB/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### low-memory

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Rust AVX2 | 5.87B/s | 170.4ms | — | — | ~0 | 1.7K× | 8.34× |
| 🥈 | 🟢 | Rust (generic) | 1.35B/s | 740.0ms | — | — | ~0 | 388.6× | 1.92× |
| 🥉 | 🟢 | Node.js | 704.05M/s | 71.0ms | 78.0ms | 46.7MB | ~0 | 202.5× | 1.00× |
| 4 | ⚪ | WASM ▶ production | 471.69M/s | 1.02s | 1.03s | 86.9MB | ~0 | 135.7× | 0.67× |
| 5 | ⚫ | Python | 3.48M/s | 2.88s | 2.86s | — | ~0 | 1.00× | 0.00× |
| 6 | ⚫ | Galerina passive ⟨interp⟩ | 161.2K/s | 0.7ms | 0.0ms | 84.4MB | -3.5 KB/op | 0.05× | 0.00× |
| 7 | ⚫ | Galerina governed ⟨interp⟩ | 140.0K/s | 71.4ms | 63.0ms | 84.5MB | 41 B/op | 0.04× | 0.00× |
| 8 | ⚫ | Galerina manifest ⟨interp⟩ | 118.7K/s | 84.2ms | 187.0ms | 84.8MB | 44 B/op | 0.03× | 0.00× |

> 🧠 **Lowest heap/op:** Galerina passive ⟨interp⟩ (-3.5 KB/op) · **highest:** Galerina manifest ⟨interp⟩ (44 B/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### gpu-compute

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Rust (generic) | 1.18B/s | 4.24s | — | — | ~0 (native) | 200.1× | 1.20× |
| 🥈 | 🟢 | Rust AVX2 | 1.18B/s | 4.25s | — | — | ~0 (native) | 200.0× | 1.20× |
| 🥉 | 🟢 | Node.js | 984.75M/s | 507.7ms | 500.0ms | 46.5MB | ~0 | 167.3× | 1.00× |
| 4 | 🟡 | WASM ▶ production | 466.79M/s | 1.07s | 1.08s | 87.4MB | ~0 | 79.3× | 0.47× |
| 5 | ⚫ | Python | 5.89M/s | 8.49s | 8.50s | — | ~0 | 1.00× | 0.01× |
| 6 | ⚫ | Deno WebGPU (NVIDIA GeForce RTX 2060) | 4.13M/s | 24.2ms | — | — | — | 0.70× | 0.00× |
| 7 | ⚫ | Galerina passive ⟨interp⟩ | 371.0K/s | 0.2ms | 0.0ms | 84.9MB | 2.3 KB/op | 0.06× | 0.00× |
| 8 | ⚫ | Galerina manifest ⟨interp⟩ | 338.8K/s | 295.2ms | 359.0ms | 84.8MB | 6 B/op | 0.06× | 0.00× |
| 9 | ⚫ | Galerina governed ⟨interp⟩ | 330.6K/s | 302.5ms | 329.0ms | 84.6MB | 9 B/op | 0.06× | 0.00× |

> 🧠 **Lowest heap/op:** WASM ▶ production (~0) · **highest:** Galerina passive ⟨interp⟩ (2.3 KB/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### matrix-multiply

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Deno WebGPU (NVIDIA GeForce RTX 2060) | 1.67B/s | 12.5ms | — | — | — | 233.9× | 2.73× |
| 🥈 | 🟢 | Rust (generic) | 1.50B/s | 87.3ms | — | — | ~0 (native) | 209.8× | 2.45× |
| 🥉 | 🟢 | Rust AVX2 | 1.43B/s | 91.9ms | — | — | ~0 (native) | 199.3× | 2.33× |
| 4 | 🟢 | Node.js | 613.21M/s | 213.7ms | 203.0ms | 48.7MB | ~0 | 85.7× | 1.00× |
| 5 | ⚪ | WASM ▶ production | 439.20M/s | 1.04s | 1.05s | 87.2MB | ~0 | 61.3× | 0.72× |
| 6 | 🔴 | Python | 7.16M/s | 1.83s | — | — | 8 B/op | 1.00× | 0.01× |
| 7 | ⚫ | Galerina passive ⟨interp⟩ | 892.9K/s | 0.3ms | 0.0ms | 85.3MB | -8.3 KB/op | 0.12× | 0.00× |
| 8 | ⚫ | Galerina governed ⟨interp⟩ | 710.3K/s | 46.1ms | 94.0ms | 85.0MB | 60 B/op | 0.10× | 0.00× |
| 9 | ⚫ | Galerina manifest ⟨interp⟩ | 697.5K/s | 47.0ms | 140.0ms | 85.3MB | 31 B/op | 0.10× | 0.00× |

> 🧠 **Lowest heap/op:** Galerina passive ⟨interp⟩ (-8.3 KB/op) · **highest:** Galerina governed ⟨interp⟩ (60 B/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### crypto-ops

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Galerina passive ⟨interp⟩ | 5.7K/s | 17.6ms | 16.0ms | 85.5MB | 6.1 KB/op | — | — |
| 🥈 | 🟡 | Galerina manifest ⟨interp⟩ | 1.8K/s | 0.6ms | 0.0ms | 85.6MB | 274.2 KB/op | — | — |
| 🥉 | 🔴 | Galerina governed ⟨interp⟩ | 213.0/s | 4.7ms | 16.0ms | 85.6MB | 314.8 KB/op | — | — |

> 🧠 **Lowest heap/op:** Galerina passive ⟨interp⟩ (6.1 KB/op) · **highest:** Galerina governed ⟨interp⟩ (314.8 KB/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### text-html

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Galerina passive ⟨interp⟩ | 50.0K/s | 2.0ms | 0.0ms | 85.3MB | -3.9 KB/op | — | — |
| 🥈 | 🔴 | Galerina manifest ⟨interp⟩ | 2.4K/s | 0.4ms | 0.0ms | 85.1MB | 145.3 KB/op | — | — |
| 🥉 | 🔴 | Galerina governed ⟨interp⟩ | 917.0/s | 1.1ms | 0.0ms | 85.6MB | 165.1 KB/op | — | — |

> 🧠 **Lowest heap/op:** Galerina passive ⟨interp⟩ (-3.9 KB/op) · **highest:** Galerina governed ⟨interp⟩ (165.1 KB/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### tri-logic

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Rust AVX2 | 1.38B/s | 433.8ms | — | — | ~0 (native) | 106.6× | 1.39× |
| 🥈 | 🟢 | Rust (generic) | 1.35B/s | 444.1ms | — | — | ~0 (native) | 104.2× | 1.36× |
| 🥉 | 🟢 | Node.js | 993.08M/s | 302.1ms | — | — | ~0 | 76.6× | 1.00× |
| 4 | 🟡 | WASM ▶ production | 464.18M/s | 1.29s | 1.28s | 88.5MB | ~0 | 35.8× | 0.47× |
| 5 | 🔴 | Python | 12.97M/s | 925.4ms | — | — | — | 1.00× | 0.01× |
| 6 | ⚫ | Galerina passive ⟨interp⟩ | 345.0K/s | 1.9ms | 0.0ms | 87.3MB | 352 B/op | 0.03× | 0.00× |
| 7 | ⚫ | Galerina manifest ⟨interp⟩ | 334.3K/s | 897.4ms | 891.0ms | 87.2MB | 4 B/op | 0.03× | 0.00× |
| 8 | ⚫ | Galerina governed ⟨interp⟩ | 327.2K/s | 916.8ms | 922.0ms | 87.0MB | 5 B/op | 0.03× | 0.00× |

> 🧠 **Lowest heap/op:** WASM ▶ production (~0) · **highest:** Galerina passive ⟨interp⟩ (352 B/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### data-query

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Node.js | 387.43M/s | 129.1ms | — | — | ~0 | 119.1× | 1.00× |
| 🥈 | ⚫ | Python | 3.25M/s | 922.0ms | — | — | — | 1.00× | 0.01× |
| 🥉 | ⚫ | Galerina passive ⟨interp⟩ | 266.9K/s | 1.2ms | 0.0ms | 88.1MB | -3.0 KB/op | 0.08× | 0.00× |
| 4 | ⚫ | Galerina manifest ⟨interp⟩ | 234.0K/s | 42.7ms | 32.0ms | 86.4MB | 64 B/op | 0.07× | 0.00× |
| 5 | ⚫ | Galerina governed ⟨interp⟩ | 232.8K/s | 43.0ms | 47.0ms | 87.8MB | 123 B/op | 0.07× | 0.00× |

> 🧠 **Lowest heap/op:** Galerina passive ⟨interp⟩ (-3.0 KB/op) · **highest:** Galerina governed ⟨interp⟩ (123 B/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### call-chain

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Node.js | 260.96M/s | 7.7ms | 0.0ms | 47.5MB | ~0 | 173.4× | 1.00× |
| 🥈 | 🟡 | WASM ▶ production | 54.56M/s | 1.83s | 1.83s | 89.8MB | ~0 | 36.3× | 0.21× |
| 🥉 | ⚫ | Python | 1.50M/s | 664.5ms | 671.9ms | — | ~0 | 1.00× | 0.01× |
| 4 | ⚫ | Galerina passive ⟨interp⟩ | 60.0K/s | 0.1ms | 0.0ms | 87.5MB | 11.5 KB/op | 0.04× | 0.00× |
| 5 | ⚫ | Galerina manifest ⟨interp⟩ | 53.8K/s | 929.3ms | 953.0ms | 87.5MB | 40 B/op | 0.04× | 0.00× |
| 6 | ⚫ | Galerina governed ⟨interp⟩ | 52.8K/s | 947.6ms | 938.0ms | 87.6MB | 24 B/op | 0.04× | 0.00× |

> 🧠 **Lowest heap/op:** WASM ▶ production (~0) · **highest:** Galerina passive ⟨interp⟩ (11.5 KB/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### nbody

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Node.js | 124.02M/s | 52.8ms | 62.0ms | 48.7MB | ~0 | 114.4× | 1.00× |
| 🥈 | 🟡 | WASM ▶ production | 29.06M/s | 1.13s | 1.14s | 88.5MB | ~0 | 26.8× | 0.23× |
| 🥉 | ⚫ | Python | 1.08M/s | 1.51s | — | — | 12 B/op | 1.00× | 0.01× |
| 4 | ⚫ | Galerina passive ⟨interp⟩ | 61.3K/s | 0.3ms | 0.0ms | 87.6MB | -98.2 KB/op | 0.06× | 0.00× |
| 5 | ⚫ | Galerina governed ⟨interp⟩ | 60.3K/s | 543.8ms | 578.0ms | 87.5MB | 18 B/op | 0.06× | 0.00× |
| 6 | ⚫ | Galerina manifest ⟨interp⟩ | 60.3K/s | 543.8ms | 578.0ms | 87.6MB | 9 B/op | 0.06× | 0.00× |

> 🧠 **Lowest heap/op:** Galerina passive ⟨interp⟩ (-98.2 KB/op) · **highest:** Galerina governed ⟨interp⟩ (18 B/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### json-parse

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Node.js | 3.24M/s | — | — | — | — | 6.94× | 1.00× |
| 🥈 | 🟡 | Python | 467.0K/s | — | — | — | 1 B/op | 1.00× | 0.14× |
| 🥉 | ⚫ | Galerina passive ⟨interp⟩ | 9.3K/s | 0.7ms | 0.0ms | 94.6MB | 63.8 KB/op | 0.02× | 0.00× |
| 4 | ⚫ | Galerina governed ⟨interp⟩ | 5.6K/s | 89.8ms | 109.0ms | 95.2MB | 3.1 KB/op | 0.01× | 0.00× |
| 5 | ⚫ | Galerina manifest ⟨interp⟩ | 5.5K/s | 90.5ms | 156.0ms | 87.4MB | 4.6 KB/op | 0.01× | 0.00× |

> 🧠 **Lowest heap/op:** Python (1 B/op) · **highest:** Galerina passive ⟨interp⟩ (63.8 KB/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### mandelbrot

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Rust (generic) | 23.46M/s | 139.7ms | — | — | ~0 (native) | 152.6× | 3.75× |
| 🥈 | 🟢 | Rust AVX2 | 23.38M/s | 140.2ms | — | — | ~0 (native) | 152.0× | 3.74× |
| 🥉 | 🟢 | WASM ▶ production | 9.02M/s | 1.82s | 1.81s | 95.2MB | ~0 | 58.7× | 1.44× |
| 4 | 🟢 | Node.js | 6.25M/s | 524.3ms | 516.0ms | 48.5MB | ~0 | 40.6× | 1.00× |
| 5 | 🔴 | Python | 153.8K/s | 21.31s | — | — | ~0 | 1.00× | 0.02× |
| 6 | ⚫ | Galerina passive ⟨interp⟩ | 7.5K/s | 0.2ms | 0.0ms | 90.8MB | 110.4 KB/op | 0.05× | 0.00× |
| 7 | ⚫ | Galerina manifest ⟨interp⟩ | 7.4K/s | 2.21s | 2.23s | 90.8MB | 140 B/op | 0.05× | 0.00× |
| 8 | ⚫ | Galerina governed ⟨interp⟩ | 7.2K/s | 2.27s | 2.28s | 90.0MB | 136 B/op | 0.05× | 0.00× |

> 🧠 **Lowest heap/op:** WASM ▶ production (~0) · **highest:** Galerina passive ⟨interp⟩ (110.4 KB/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### spectral-norm

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Rust (generic) | 377.23M/s | 26.5ms | — | — | ~0 (native) | 224.5× | 1.56× |
| 🥈 | 🟢 | Rust AVX2 | 371.88M/s | 26.9ms | — | — | ~0 (native) | 221.3× | 1.54× |
| 🥉 | 🟢 | Node.js | 241.11M/s | 41.5ms | 47.0ms | 48.5MB | ~0 | 143.5× | 1.00× |
| 4 | ⚫ | Python | 1.68M/s | 5.95s | — | — | ~0 | 1.00× | 0.01× |

> 🧠 **Lowest heap/op:** Python (~0) · **highest:** Node.js (~0). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### binary-trees

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | WASM ▶ production | 583.75M/s | 1.16s | 1.17s | 93.1MB | ~0 | 204.2× | 8.28× |
| 🥈 | 🟢 | Node.js | 70.50M/s | 1.9ms | 0.0ms | 48.6MB | 3 B/op | 24.7× | 1.00× |
| 🥉 | 🟡 | Rust (generic) | 20.40M/s | 6.7ms | — | — | ~0 (native) | 7.14× | 0.29× |
| 4 | 🟡 | Rust AVX2 | 20.10M/s | 6.8ms | — | — | ~0 (native) | 7.03× | 0.29× |
| 5 | 🔴 | Python | 2.86M/s | 47.5ms | 46.9ms | — | ~0 | 1.00× | 0.04× |
| 6 | ⚫ | Galerina passive ⟨interp⟩ | 385.8K/s | 0.1ms | 0.0ms | 91.0MB | 1.7 KB/op | 0.13× | 0.01× |
| 7 | ⚫ | Galerina governed ⟨interp⟩ | 359.1K/s | 378.4ms | 405.0ms | 90.2MB | 16 B/op | 0.13× | 0.01× |
| 8 | ⚫ | Galerina manifest ⟨interp⟩ | 354.3K/s | 383.4ms | 375.0ms | 91.0MB | 13 B/op | 0.12× | 0.01× |

> 🧠 **Lowest heap/op:** Python (~0) · **highest:** Galerina passive ⟨interp⟩ (1.7 KB/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### spore-container

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Rust (generic) | 133.0K/s | 2.25s | — | — | ~0 (native) | 2.12× | 3.18× |
| 🥈 | 🟢 | Rust AVX2 | 132.2K/s | 2.27s | — | — | ~0 (native) | 2.11× | 3.16× |
| 🥉 | 🟢 | Python | 62.8K/s | 1.59s | — | — | ~0 | 1.00× | 1.50× |
| 4 | 🟢 | Node.js | 41.8K/s | 7.17s | 8.36s | 64.5MB | 6 B/op | 0.67× | 1.00× |

> 🧠 **Lowest heap/op:** Python (~0) · **highest:** Node.js (6 B/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### framework-pipeline

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Python | 111.5K/s | 1.79s | — | — | ~0 | 1.00× | — |

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
| 🥇 | 🟢 | Rust (generic) | 🖥️ CPU (cpu (serial)) | 1.18B/s | 4.24s | 1.20× |
| 🥈 | 🟢 | Rust AVX2 | 🖥️ CPU (cpu (serial)) | 1.18B/s | 4.25s | 1.20× |
| 🥉 | 🟢 | Node.js | 🖥️ CPU (cpu (serial)) | 984.75M/s | 507.7ms | 1.00× |
| 4 | 🟡 | WASM ▶ production | 🖥️ CPU (cpu (wasm)) | 466.79M/s | 1.07s | 0.47× |
| 5 | ⚫ | Python | 🖥️ CPU (cpu (serial)) | 5.89M/s | 8.49s | 0.01× |
| 6 | ⚫ | Deno WebGPU (NVIDIA GeForce RTX 2060) | 🎮 GPU (gpu (WebGPU — NVIDIA GeForce RTX 2060)) | 4.13M/s | 24.2ms | 0.00× |
| 7 | ⚫ | Galerina passive ⟨interp⟩ | 🖥️ CPU (cpu) | 371.0K/s | 0.2ms | 0.00× |
| 8 | ⚫ | Galerina manifest ⟨interp⟩ | 🖥️ CPU (cpu) | 338.8K/s | 295.2ms | 0.00× |
| 9 | ⚫ | Galerina governed ⟨interp⟩ | 🖥️ CPU (cpu) | 330.6K/s | 302.5ms | 0.00× |

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
| **compute-mix** | Node.js | **🏆 winner** | **🏆 winner** | **🏆 winner** | **🏆 winner** | **164× slower** | **63× slower** | **78× slower** | **83× slower** | 2× slower | not run — no GPU path |
| **arithmetic-threshold** | C++ | 1.2× slower | 1.2× slower | **🏆 winner** | 2× slower | **451× slower** | **59.9K× slower** | **370× slower** | **372× slower** | 4× slower | not run — no GPU path |
| **six-digit-guess** | Rust (generic) | **🏆 winner** | **🏆 winner** | 1.1× slower | **28× slower** | **896× slower** | **5.6K× slower** | **1.6K× slower** | **1.7K× slower** | 2× slower | not run — no GPU path |
| **record-allocation** | Rust (generic) | **🏆 winner** | **🏆 winner** | not run — no C++ impl | **22× slower** | **211× slower** | **139× slower** | **480× slower** | **486× slower** | 2× slower | not run — no GPU path |
| **fibonacci-recursive** | Galerina passive ⟨interp⟩ | **104× slower** | **105× slower** | not run — no C++ impl | **409× slower** | **8.1K× slower** | **🏆 winner** | **3.1K× slower** | **4.0K× slower** | 3× slower | not run — no GPU path |
| **tower-of-hanoi** | Rust (generic) | **🏆 winner** | **🏆 winner** | not run — no C++ impl | 2× slower | **63× slower** | **2.5K× slower** | **2.6K× slower** | **2.7K× slower** | 2× slower | not run — no GPU path |
| **collection-pipeline** | Rust AVX2 | **🏆 winner** | 3× slower | not run — no C++ impl | **190× slower** | **1.3K× slower** | **1.6K× slower** | **5.4K× slower** | **5.9K× slower** | **32× slower** | not run — no GPU path |
| **hardware-targets** | WASM ▶ production | **34× slower** | **33× slower** | not run — no C++ impl | **43× slower** | not run | **501× slower** | **11.8K× slower** | **12.2K× slower** | **🏆 winner** | not run — no GPU path |
| **low-memory** | Rust AVX2 | **🏆 winner** | 4× slower | not run — no C++ impl | 8× slower | **1.7K× slower** | **36.4K× slower** | **49.4K× slower** | **41.9K× slower** | **12× slower** | not run — no GPU path |
| **gpu-compute** | Rust (generic) | **🏆 winner** | **🏆 winner** | not run — no C++ impl | 1.2× slower | **200× slower** | **3.2K× slower** | **3.5K× slower** | **3.6K× slower** | 3× slower | **286× slower** |
| **matrix-multiply** | Deno WebGPU (NVIDIA GeForce RTX 2060) | 1.2× slower | 1.1× slower | not run — no C++ impl | 3× slower | **234× slower** | **1.9K× slower** | **2.4K× slower** | **2.4K× slower** | 4× slower | **🏆 winner** |
| **crypto-ops** | Galerina passive ⟨interp⟩ | no comparable metric | no comparable metric | not run — no C++ impl | no comparable metric | no comparable metric | **🏆 winner** | 3× slower | **27× slower** | no WASM — strings/records | not run — no GPU path |
| **text-html** | Galerina passive ⟨interp⟩ | no comparable metric | no comparable metric | not run — no C++ impl | no comparable metric | no comparable metric | **🏆 winner** | **21× slower** | **55× slower** | no WASM — strings/records | not run — no GPU path |
| **tri-logic** | Rust AVX2 | **🏆 winner** | **🏆 winner** | not run — no C++ impl | 1.4× slower | **107× slower** | **4.0K× slower** | **4.1K× slower** | **4.2K× slower** | 3× slower | not run — no GPU path |
| **data-query** | Node.js | not run — no native impl | not run — no native impl | not run — no C++ impl | **🏆 winner** | **119× slower** | **1.5K× slower** | **1.7K× slower** | **1.7K× slower** | no WASM build | not run — no GPU path |
| **call-chain** | Node.js | not run — no native impl | not run — no native impl | not run — no C++ impl | **🏆 winner** | **173× slower** | **4.3K× slower** | **4.9K× slower** | **4.9K× slower** | 5× slower | not run — no GPU path |
| **nbody** | Node.js | not run — no native impl | not run — no native impl | not run — no C++ impl | **🏆 winner** | **114× slower** | **2.0K× slower** | **2.1K× slower** | **2.1K× slower** | 4× slower | not run — no GPU path |
| **json-parse** | Node.js | not run — no native impl | not run — no native impl | not run — no C++ impl | **🏆 winner** | 7× slower | **348× slower** | **587× slower** | **582× slower** | no WASM — strings/records | not run — no GPU path |
| **mandelbrot** | Rust (generic) | **🏆 winner** | **🏆 winner** | not run — no C++ impl | 4× slower | **153× slower** | **3.1K× slower** | **3.2K× slower** | **3.3K× slower** | 3× slower | not run — no GPU path |
| **spectral-norm** | Rust (generic) | **🏆 winner** | **🏆 winner** | not run — no C++ impl | 2× slower | **224× slower** | not run | not run | not run | no WASM build | not run — no GPU path |
| **binary-trees** | WASM ▶ production | **29× slower** | **29× slower** | not run — no C++ impl | 8× slower | **204× slower** | **1.5K× slower** | **1.6K× slower** | **1.6K× slower** | **🏆 winner** | not run — no GPU path |
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
| 🥇 | Node.js | 135.51M/s | 🏆 winner | 164× faster |
| 🥈 | C++ | 132.54M/s | 1.0× slower | 161× faster |
| 🥉 | Rust (generic) | 132.15M/s | 1.0× slower | 160× faster |
| 4 | Rust AVX2 | 130.42M/s | 1.0× slower | 158× faster |
| 5 | WASM ▶ production | 77.01M/s | 1.8× slower | 93× faster |
| 6 | Galerina passive ⟨interp⟩ ⚠️cache | 2.16M/s | 63× slower | 2.6× faster |
| 7 | Galerina manifest ⟨interp⟩ | 1.75M/s | 78× slower | 2.1× faster |
| 8 | Galerina governed ⟨interp⟩ | 1.64M/s | 83× slower | 2.0× faster |
| 9 | Python | 823.8K/s | 164× slower | — (slowest) |

### arithmetic-threshold
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | C++ | 1.88B/s | 🏆 winner | 59.9K× faster |
| 🥈 | Rust (generic) | 1.57B/s | 1.2× slower | 49.8K× faster |
| 🥉 | Rust AVX2 | 1.56B/s | 1.2× slower | 49.8K× faster |
| 4 | Node.js | 971.99M/s | 1.9× slower | 30.9K× faster |
| 5 | WASM ▶ production | 491.64M/s | 3.8× slower | 15.7K× faster |
| 6 | Galerina manifest ⟨interp⟩ | 5.09M/s | 370× slower | 162× faster |
| 7 | Galerina governed ⟨interp⟩ | 5.06M/s | 372× slower | 161× faster |
| 8 | Python | 4.18M/s | 451× slower | 133× faster |
| 9 | Galerina passive ⟨interp⟩ ⚠️cache | 31.4K/s | 59.9K× slower | — (slowest) |

### six-digit-guess
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | Rust (generic) | 78.02M/s | 🏆 winner | 5.6K× faster |
| 🥈 | Rust AVX2 | 75.15M/s | 1.0× slower | 5.4K× faster |
| 🥉 | C++ | 68.85M/s | 1.1× slower | 4.9K× faster |
| 4 | WASM ▶ production | 35.85M/s | 2.2× slower | 2.6K× faster |
| 5 | Node.js | 2.74M/s | 28× slower | 197× faster |
| 6 | Python | 87.0K/s | 896× slower | 6.2× faster |
| 7 | Galerina manifest ⟨interp⟩ | 48.3K/s | 1.6K× slower | 3.5× faster |
| 8 | Galerina governed ⟨interp⟩ | 45.6K/s | 1.7K× slower | 3.3× faster |
| 9 | Galerina passive ⟨interp⟩ ⚠️cache | 13.9K/s | 5.6K× slower | — (slowest) |

### record-allocation
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | Rust (generic) | 1.17B/s | 🏆 winner | 486× faster |
| 🥈 | Rust AVX2 | 1.17B/s | 1.0× slower | 485× faster |
| 🥉 | WASM ▶ production | 550.93M/s | 2.1× slower | 229× faster |
| 4 | Node.js | 52.53M/s | 22× slower | 22× faster |
| 5 | Galerina passive ⟨interp⟩ ⚠️cache | 8.42M/s | 139× slower | 3.5× faster |
| 6 | Python | 5.55M/s | 211× slower | 2.3× faster |
| 7 | Galerina manifest ⟨interp⟩ | 2.44M/s | 480× slower | 1.0× faster |
| 8 | Galerina governed ⟨interp⟩ | 2.41M/s | 486× slower | — (slowest) |

### fibonacci-recursive
> 🏆 cache-hit "winner" is Galerina passive (memoised); **real compute winner: WASM ▶ production at 17.0K/s**.
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | Galerina passive ⟨interp⟩ ⚠️cache | 52.0K/s | 🏆 winner | 8.1K× faster |
| 🥈 | WASM ▶ production | 17.0K/s | 3.1× slower | 2.7K× faster |
| 🥉 | Rust AVX2 | 499.7/s | 104× slower | 78× faster |
| 4 | Rust (generic) | 497.5/s | 105× slower | 78× faster |
| 5 | Node.js | 127.1/s | 409× slower | 20× faster |
| 6 | Galerina manifest ⟨interp⟩ | 17.0/s | 3.1K× slower | 2.7× faster |
| 7 | Galerina governed ⟨interp⟩ | 13.0/s | 4.0K× slower | 2.0× faster |
| 8 | Python | 6.4/s | 8.1K× slower | — (slowest) |

### tower-of-hanoi
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | Rust (generic) | 252.59M/s | 🏆 winner | 2.7K× faster |
| 🥈 | Rust AVX2 | 251.42M/s | 1.0× slower | 2.7K× faster |
| 🥉 | Node.js | 129.78M/s | 1.9× slower | 1.4K× faster |
| 4 | WASM ▶ production | 121.88M/s | 2.1× slower | 1.3K× faster |
| 5 | Python | 4.01M/s | 63× slower | 43× faster |
| 6 | Galerina passive ⟨interp⟩ ⚠️cache | 100.3K/s | 2.5K× slower | 1.1× faster |
| 7 | Galerina manifest ⟨interp⟩ | 98.3K/s | 2.6K× slower | 1.1× faster |
| 8 | Galerina governed ⟨interp⟩ | 92.9K/s | 2.7K× slower | — (slowest) |

### collection-pipeline
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | Rust AVX2 | 13.29B/s | 🏆 winner | 5.9K× faster |
| 🥈 | Rust (generic) | 4.31B/s | 3.1× slower | 1.9K× faster |
| 🥉 | WASM ▶ production | 417.51M/s | 32× slower | 186× faster |
| 4 | Node.js | 69.85M/s | 190× slower | 31× faster |
| 5 | Python | 10.48M/s | 1.3K× slower | 4.7× faster |
| 6 | Galerina passive ⟨interp⟩ ⚠️cache | 8.11M/s | 1.6K× slower | 3.6× faster |
| 7 | Galerina manifest ⟨interp⟩ | 2.46M/s | 5.4K× slower | 1.1× faster |
| 8 | Galerina governed ⟨interp⟩ | 2.24M/s | 5.9K× slower | — (slowest) |

### hardware-targets
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | WASM ▶ production | 39.44M/s | 🏆 winner | 12.2K× faster |
| 🥈 | Rust (generic) | 1.18M/s | 33× slower | 365× faster |
| 🥉 | Rust AVX2 | 1.17M/s | 34× slower | 363× faster |
| 4 | Node.js | 908.3K/s | 43× slower | 282× faster |
| 5 | Galerina passive ⟨interp⟩ ⚠️cache | 78.8K/s | 501× slower | 24× faster |
| 6 | Galerina manifest ⟨interp⟩ | 3.3K/s | 11.8K× slower | 1.0× faster |
| 7 | Galerina governed ⟨interp⟩ | 3.2K/s | 12.2K× slower | — (slowest) |

### low-memory
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | Rust AVX2 | 5.87B/s | 🏆 winner | 49.4K× faster |
| 🥈 | Rust (generic) | 1.35B/s | 4.3× slower | 11.4K× faster |
| 🥉 | Node.js | 704.05M/s | 8.3× slower | 5.9K× faster |
| 4 | WASM ▶ production | 471.69M/s | 12× slower | 4.0K× faster |
| 5 | Python | 3.48M/s | 1.7K× slower | 29× faster |
| 6 | Galerina passive ⟨interp⟩ ⚠️cache | 161.2K/s | 36.4K× slower | 1.4× faster |
| 7 | Galerina governed ⟨interp⟩ | 140.0K/s | 41.9K× slower | 1.2× faster |
| 8 | Galerina manifest ⟨interp⟩ | 118.7K/s | 49.4K× slower | — (slowest) |

### gpu-compute
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | Rust (generic) | 1.18B/s | 🏆 winner | 3.6K× faster |
| 🥈 | Rust AVX2 | 1.18B/s | 1.0× slower | 3.6K× faster |
| 🥉 | Node.js | 984.75M/s | 1.2× slower | 3.0K× faster |
| 4 | WASM ▶ production | 466.79M/s | 2.5× slower | 1.4K× faster |
| 5 | Python | 5.89M/s | 200× slower | 18× faster |
| 6 | Deno WebGPU (NVIDIA GeForce RTX 2060) | 4.13M/s | 286× slower | 12× faster |
| 7 | Galerina passive ⟨interp⟩ ⚠️cache | 371.0K/s | 3.2K× slower | 1.1× faster |
| 8 | Galerina manifest ⟨interp⟩ | 338.8K/s | 3.5K× slower | 1.0× faster |
| 9 | Galerina governed ⟨interp⟩ | 330.6K/s | 3.6K× slower | — (slowest) |

### matrix-multiply
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | Deno WebGPU (NVIDIA GeForce RTX 2060) | 1.67B/s | 🏆 winner | 2.4K× faster |
| 🥈 | Rust (generic) | 1.50B/s | 1.1× slower | 2.2K× faster |
| 🥉 | Rust AVX2 | 1.43B/s | 1.2× slower | 2.0K× faster |
| 4 | Node.js | 613.21M/s | 2.7× slower | 879× faster |
| 5 | WASM ▶ production | 439.20M/s | 3.8× slower | 630× faster |
| 6 | Python | 7.16M/s | 234× slower | 10× faster |
| 7 | Galerina passive ⟨interp⟩ ⚠️cache | 892.9K/s | 1.9K× slower | 1.3× faster |
| 8 | Galerina governed ⟨interp⟩ | 710.3K/s | 2.4K× slower | 1.0× faster |
| 9 | Galerina manifest ⟨interp⟩ | 697.5K/s | 2.4K× slower | — (slowest) |

### crypto-ops
> 🏆 cache-hit "winner" is Galerina passive (memoised); **real compute winner: Galerina manifest ⟨interp⟩ at 1.8K/s**.
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | Galerina passive ⟨interp⟩ ⚠️cache | 5.7K/s | 🏆 winner | 27× faster |
| 🥈 | Galerina manifest ⟨interp⟩ | 1.8K/s | 3.2× slower | 8.4× faster |
| 🥉 | Galerina governed ⟨interp⟩ | 213.0/s | 27× slower | — (slowest) |

### text-html
> 🏆 cache-hit "winner" is Galerina passive (memoised); **real compute winner: Galerina manifest ⟨interp⟩ at 2.4K/s**.
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | Galerina passive ⟨interp⟩ ⚠️cache | 50.0K/s | 🏆 winner | 55× faster |
| 🥈 | Galerina manifest ⟨interp⟩ | 2.4K/s | 21× slower | 2.6× faster |
| 🥉 | Galerina governed ⟨interp⟩ | 917.0/s | 55× slower | — (slowest) |

### tri-logic
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | Rust AVX2 | 1.38B/s | 🏆 winner | 4.2K× faster |
| 🥈 | Rust (generic) | 1.35B/s | 1.0× slower | 4.1K× faster |
| 🥉 | Node.js | 993.08M/s | 1.4× slower | 3.0K× faster |
| 4 | WASM ▶ production | 464.18M/s | 3.0× slower | 1.4K× faster |
| 5 | Python | 12.97M/s | 107× slower | 40× faster |
| 6 | Galerina passive ⟨interp⟩ ⚠️cache | 345.0K/s | 4.0K× slower | 1.1× faster |
| 7 | Galerina manifest ⟨interp⟩ | 334.3K/s | 4.1K× slower | 1.0× faster |
| 8 | Galerina governed ⟨interp⟩ | 327.2K/s | 4.2K× slower | — (slowest) |

### data-query
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | Node.js | 387.43M/s | 🏆 winner | 1.7K× faster |
| 🥈 | Python | 3.25M/s | 119× slower | 14× faster |
| 🥉 | Galerina passive ⟨interp⟩ ⚠️cache | 266.9K/s | 1.5K× slower | 1.1× faster |
| 4 | Galerina manifest ⟨interp⟩ | 234.0K/s | 1.7K× slower | 1.0× faster |
| 5 | Galerina governed ⟨interp⟩ | 232.8K/s | 1.7K× slower | — (slowest) |

### call-chain
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | Node.js | 260.96M/s | 🏆 winner | 4.9K× faster |
| 🥈 | WASM ▶ production | 54.56M/s | 4.8× slower | 1.0K× faster |
| 🥉 | Python | 1.50M/s | 173× slower | 29× faster |
| 4 | Galerina passive ⟨interp⟩ ⚠️cache | 60.0K/s | 4.3K× slower | 1.1× faster |
| 5 | Galerina manifest ⟨interp⟩ | 53.8K/s | 4.9K× slower | 1.0× faster |
| 6 | Galerina governed ⟨interp⟩ | 52.8K/s | 4.9K× slower | — (slowest) |

### nbody
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | Node.js | 124.02M/s | 🏆 winner | 2.1K× faster |
| 🥈 | WASM ▶ production | 29.06M/s | 4.3× slower | 482× faster |
| 🥉 | Python | 1.08M/s | 114× slower | 18× faster |
| 4 | Galerina passive ⟨interp⟩ ⚠️cache | 61.3K/s | 2.0K× slower | 1.0× faster |
| 5 | Galerina governed ⟨interp⟩ | 60.3K/s | 2.1K× slower | 1.0× faster |
| 6 | Galerina manifest ⟨interp⟩ | 60.3K/s | 2.1K× slower | — (slowest) |

### json-parse
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | Node.js | 3.24M/s | 🏆 winner | 587× faster |
| 🥈 | Python | 467.0K/s | 6.9× slower | 85× faster |
| 🥉 | Galerina passive ⟨interp⟩ ⚠️cache | 9.3K/s | 348× slower | 1.7× faster |
| 4 | Galerina governed ⟨interp⟩ | 5.6K/s | 582× slower | 1.0× faster |
| 5 | Galerina manifest ⟨interp⟩ | 5.5K/s | 587× slower | — (slowest) |

### mandelbrot
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | Rust (generic) | 23.46M/s | 🏆 winner | 3.3K× faster |
| 🥈 | Rust AVX2 | 23.38M/s | 1.0× slower | 3.2K× faster |
| 🥉 | WASM ▶ production | 9.02M/s | 2.6× slower | 1.3K× faster |
| 4 | Node.js | 6.25M/s | 3.8× slower | 866× faster |
| 5 | Python | 153.8K/s | 153× slower | 21× faster |
| 6 | Galerina passive ⟨interp⟩ ⚠️cache | 7.5K/s | 3.1K× slower | 1.0× faster |
| 7 | Galerina manifest ⟨interp⟩ | 7.4K/s | 3.2K× slower | 1.0× faster |
| 8 | Galerina governed ⟨interp⟩ | 7.2K/s | 3.3K× slower | — (slowest) |

### spectral-norm
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | Rust (generic) | 377.23M/s | 🏆 winner | 224× faster |
| 🥈 | Rust AVX2 | 371.88M/s | 1.0× slower | 221× faster |
| 🥉 | Node.js | 241.11M/s | 1.6× slower | 143× faster |
| 4 | Python | 1.68M/s | 224× slower | — (slowest) |

### binary-trees
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | WASM ▶ production | 583.75M/s | 🏆 winner | 1.6K× faster |
| 🥈 | Node.js | 70.50M/s | 8.3× slower | 199× faster |
| 🥉 | Rust (generic) | 20.40M/s | 29× slower | 58× faster |
| 4 | Rust AVX2 | 20.10M/s | 29× slower | 57× faster |
| 5 | Python | 2.86M/s | 204× slower | 8.1× faster |
| 6 | Galerina passive ⟨interp⟩ ⚠️cache | 385.8K/s | 1.5K× slower | 1.1× faster |
| 7 | Galerina governed ⟨interp⟩ | 359.1K/s | 1.6K× slower | 1.0× faster |
| 8 | Galerina manifest ⟨interp⟩ | 354.3K/s | 1.6K× slower | — (slowest) |

### spore-container
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | Rust (generic) | 133.0K/s | 🏆 winner | 3.2× faster |
| 🥈 | Rust AVX2 | 132.2K/s | 1.0× slower | 3.2× faster |
| 🥉 | Python | 62.8K/s | 2.1× slower | 1.5× faster |
| 4 | Node.js | 41.8K/s | 3.2× slower | — (slowest) |

### framework-pipeline
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | Python | 111.5K/s | 🏆 winner | — (slowest) |


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

