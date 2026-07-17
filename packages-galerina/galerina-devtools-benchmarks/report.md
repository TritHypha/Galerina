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
| compute-mix | 77.62M/s | ⚪ 1.7× slower | ⚪ 1.7× slower | 1.67M/s | WASM near native |
| arithmetic-threshold | 495.03M/s | UNCERTIFIED | UNCERTIFIED | 5.29M/s | not yet work-equivalence-certified (N/work mismatch) |
| six-digit-guess | 36.60M/s | UNCERTIFIED | UNCERTIFIED | 48.6K/s | not yet work-equivalence-certified (N/work mismatch) |
| fibonacci-recursive | 17.3K/s | UNCERTIFIED | UNCERTIFIED | 13.0/s | not yet work-equivalence-certified (N/work mismatch) |
| tower-of-hanoi | 122.33M/s | 🟡 2.1× slower | 🟢 1.1× slower | 103.4K/s | WASM usable |
| hardware-targets | 37.62M/s | UNCERTIFIED | UNCERTIFIED | 3.4K/s | not yet work-equivalence-certified (N/work mismatch) |
| matrix-multiply | 441.90M/s | 🟡 3.4× slower | ⚪ 1.4× slower | 736.9K/s | WASM usable |
| tri-logic | 470.58M/s | 🟡 3.0× slower | 🟡 2.1× slower | 342.6K/s | WASM usable |
| data-query | no WASM build | — | — | 213.7K/s | WASM not built for this lane yet |
| call-chain | 54.73M/s | — | 🟡 5.1× slower | 56.9K/s | WASM 2–10× under Node |
| nbody | 29.08M/s | — | 🟡 4.3× slower | 64.5K/s | WASM 2–10× under Node |
| mandelbrot | 9.09M/s | 🟡 2.6× slower | 🟢 1.3× | 7.8K/s | WASM usable |
| spectral-norm | no WASM build | — | — | not run | WASM not built for this lane yet |

> 🚦 🟢 ≥0.9 (≈native) · ⚪ ≥0.5 (within 2×) · 🟡 ≥0.1 (2–10× slower) · 🔴 ≥0.01 (10–100×) · ⚫ <0.01 (100×+).
> **Ceiling (fastest certified lane):** Rust (generic) — 1.51B/s on matrix-multiply.

### Memory — heap bytes per operation (the honest metric; lower is better)

> Ranked by **bytes/op**, NOT throughput — these benchmarks measure allocation, so no cross-runtime
> throughput ratio (and no ⚫) is shown. Native Rust/C++ allocate off the GC heap (~0 native — see §2b/§4).

| Benchmark | 🏆 Best (lowest heap B/op) | Node.js | Python | WASM ▶ production | Galerina governed ⟨interp⟩ | Galerina manifest ⟨interp⟩ |
|---|---|---|---|---|---|---|
| record-allocation | **WASM ▶ production** (~0) | 1 B/op | ~0 | ~0 | 6 B/op | 9 B/op |
| collection-pipeline | **WASM ▶ production** (~0) | ~0 | ~0 | ~0 | 17 B/op | 14 B/op |
| low-memory | **Node.js** (~0) | ~0 | ~0 | ~0 | 44 B/op | 62 B/op |
| binary-trees | **Python** (~0) | 3 B/op | ~0 | ~0 | 15 B/op | 12 B/op |

> **No throughput ratio, no ⚫ here** — a memory benchmark ranked by throughput is exactly the
> cross-metric bug this section removes. record-allocation / binary-trees / collection-pipeline live
> here by bytes/op, so they no longer carry the ◇ shape-only marker; their shape rate is in §4.

### GPU — kernel-evals/s (GPU-shaped workload; matrix-multiply dual-homes here)

> Cross-runtime. Deno WebGPU is the only real-dispatch path; where it produced no number on this
> machine it shows **⏳ GPU pending** — the honest status, never a fabricated GPU rate.

| Benchmark | 🏆 Winner | Speed | WASM ▶ production | GPU (Deno WebGPU) | vs Node (WASM) | Implication |
|---|---|---|---|---|---|---|
| gpu-compute | Rust AVX2 | 1.19B/s | 472.31M/s | ⏳ GPU pending | 🟡 2.1× slower | CPU/WASM lanes lead — real GPU dispatch pending (see §4b) |
| matrix-multiply | Rust (generic) | 1.51B/s | 441.90M/s | ⏳ GPU pending | ⚪ 1.4× slower | CPU/WASM lanes lead — real GPU dispatch pending (see §4b) |

> **vs Node (WASM)** compares the WASM ▶ production lane to Node.js on the kernel. matrix-multiply also
> appears in the CPU Throughput table (dual-home) — it has both a compute lane and a WebGPU lane.

### I/O & DevTools — native units per benchmark (raw rate; NOT inner-op normalised)

> Each benchmark has its OWN unit, so there is **no cross-runtime ratio** — the winner is the fastest
> lane by raw rate WITHIN that benchmark's native unit. Comparing rates ACROSS benchmarks is meaningless.

| Benchmark | Unit (native) | 🏆 Fastest lane | Node.js | Python | Rust (generic) | WASM ▶ production | Galerina governed ⟨interp⟩ |
|---|---|---|---|---|---|---|---|
| crypto-ops | ops/s | **Galerina governed ⟨interp⟩** (161.0/s) | no comparable metric | no comparable metric | no comparable metric | no WASM — strings/records | 161.0/s |
| text-html | ops/s | **Galerina governed ⟨interp⟩** (847.0/s) | no comparable metric | no comparable metric | no comparable metric | no WASM — strings/records | 847.0/s |
| json-parse | records/s | **Node.js** (3.09M/s) | 3.09M/s | 467.0K/s | not run — no native impl | no WASM — strings/records | 5.3K/s |
| spore-container | containers/s | **Rust (generic)** (172.6K/s) | 43.5K/s | 74.5K/s | 172.6K/s | no WASM — strings/records | not run |
| framework-pipeline | requests/s | **Python** (108.6K/s) | not run | 108.6K/s | not run — no native impl | no WASM — strings/records | not run |
| http-throughput | requests/s | **Node.js** (3.4K/s) | 3.4K/s | not run | not run — no native impl | no WASM build | not run |
| naming-check | files/s | **Node.js** (7.2K/s) | 7.2K/s | not run | not run — no native impl | no WASM build | not run |
| context-receipt | receipts/s | **Node.js** (18.5K/s) | 18.5K/s | not run | not run — no native impl | no WASM build | not run |
| intelligence-search | queries/s | **Node.js** (107.9K/s) | 107.9K/s | not run | not run — no native impl | no WASM build | not run |
| provenance-trace | files/s | **Node.js** (783.0/s) | 783.0/s | not run | not run — no native impl | no WASM build | not run |

> Values are native rates (records/s, containers/s, requests/s, files/s, …), shown for transparency —
> NOT a cross-runtime ranking. The inner-op-normalised throughput lives in the CPU table above.

### Governance — Galerina-internal tier ratio ONLY (NO native column)

> This table's columns are Galerina tiers ONLY — there is **no rust/node/python/cpp column**, so a
> cross-runtime `N× slower` is structurally impossible here. The old six-figure governance-cost artifact
> came from dividing the governed tier by a native rate — a division this table cannot express.

| Benchmark | Galerina governed ⟨interp⟩ | Galerina manifest ⟨interp⟩ | WASM ▶ production | governed/manifest (gov overhead) |
|---|---|---|---|---|
| governance-cost | 826.0/s | 1.1K/s | 2.91M/s | 0.78× governed/manifest (gov overhead ≈ 1.29×) |

> **governed/manifest** is governance-cost's honest headline: the same-N cost of always-on governance
> (capabilities + audit + proof) vs the pre-verified manifest. `gov overhead` = manifest ÷ governed.


### Full Throughput Table (all runtimes)

| Benchmark | Rust AVX-512 | Rust AVX2 | Rust (generic) | C++ | Node.js | Python | Galerina passive ⟨interp⟩ | Galerina manifest ⟨interp⟩ | Galerina governed ⟨interp⟩ | WASM ▶ production | Deno WebGPU (GPU) | Node/Galerina† (🖥️ CPU) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| compute-mix | not run — no AVX-512 | **130.12M/s** | **132.41M/s** | **133.06M/s** | **135.58M/s** | 761.7K/s | 2.19M/s | 1.79M/s | 1.67M/s | 77.62M/s | not run — no GPU path | 81.0× |
| arithmetic-threshold | not run — no AVX-512 | 1.56B/s | 1.57B/s | **1.88B/s** | 971.84M/s | 3.76M/s | 27.4K/s | 5.35M/s | 5.29M/s | 495.03M/s | not run — no GPU path | 183.6× |
| six-digit-guess | not run — no AVX-512 | 50.85M/s | **78.02M/s** | 68.12M/s | 2.94M/s | 101.6K/s | 15.4K/s | 51.5K/s | 48.6K/s | 36.60M/s | not run — no GPU path | 60.5× |
| record-allocation | not run — no AVX-512 | **1.18B/s** | **1.17B/s** | not run — no C++ impl | 61.02M/s | 4.30M/s | 8.53M/s | 2.10M/s | 2.50M/s | 555.05M/s | not run — no GPU path | 24.4× |
| fibonacci-recursive | not run — no AVX-512 | 502.1/s | 499.6/s | not run — no C++ impl | 128.0/s | 5.1/s | **50.8K/s** | 17.0/s | 13.0/s | 17.3K/s | not run — no GPU path | 9.84× |
| tower-of-hanoi | not run — no AVX-512 | **253.28M/s** | **252.40M/s** | not run — no C++ impl | 129.63M/s | 2.37M/s | 102.9K/s | 98.3K/s | 103.4K/s | 122.33M/s | not run — no GPU path | 1.3K× |
| collection-pipeline | not run — no AVX-512 | **13.23B/s** | 4.33B/s | not run — no C++ impl | 70.58M/s | 13.38M/s | 7.86M/s | 2.32M/s | 2.04M/s | 421.46M/s | not run — no GPU path | 34.7× |
| governance-cost ⚠️ | N/A — excluded | N/A — excluded | N/A — excluded | N/A — excluded | N/A — excluded | N/A — excluded | N/A — excluded | N/A — excluded | N/A — excluded | N/A — excluded | N/A — excluded | ⚠️ excluded — not unit-aligned |
| hardware-targets | not run — no AVX-512 | 1.18M/s | 1.18M/s | not run — no C++ impl | 913.0K/s | not run | 80.4K/s | 3.4K/s | 3.4K/s | **37.62M/s** | not run — no GPU path | 264.8× |
| low-memory | not run — no AVX-512 | **5.86B/s** | 1.35B/s | not run — no C++ impl | 720.11M/s | 2.84M/s | 158.3K/s | 112.9K/s | 161.6K/s | 466.25M/s | not run — no GPU path | 4.5K× |
| gpu-compute | not run — no AVX-512 | **1.19B/s** | **1.19B/s** | not run — no C++ impl | 990.12M/s | 6.38M/s | 381.0K/s | 343.5K/s | 347.6K/s | 472.31M/s | errored | 2.8K× |
| matrix-multiply | not run — no AVX-512 | 1.43B/s | **1.51B/s** | not run — no C++ impl | 619.61M/s | 6.55M/s | 861.1K/s | 650.3K/s | 736.9K/s | 441.90M/s | errored | 840.9× |
| crypto-ops | not run — no AVX-512 | no comparable metric | no comparable metric | not run — no C++ impl | no comparable metric | no comparable metric | **14.2K/s** | 1.8K/s | 161.0/s | no WASM — strings/records | not run — no GPU path | N/A — no Node.js |
| text-html | not run — no AVX-512 | no comparable metric | no comparable metric | not run — no C++ impl | no comparable metric | no comparable metric | **60.6K/s** | 2.7K/s | 847.0/s | no WASM — strings/records | not run — no GPU path | N/A — no Node.js |
| tri-logic | not run — no AVX-512 | **1.39B/s** | **1.39B/s** | not run — no C++ impl | 994.41M/s | 7.33M/s | 354.0K/s | 336.3K/s | 342.6K/s | 470.58M/s | not run — no GPU path | 2.9K× |
| data-query | not run — no AVX-512 | not run — no native impl | not run — no native impl | not run — no C++ impl | **393.27M/s** | 3.15M/s | 264.2K/s | 229.1K/s | 213.7K/s | no WASM build | not run — no GPU path | 1.8K× |
| call-chain | not run — no AVX-512 | not run — no native impl | not run — no native impl | not run — no C++ impl | **279.88M/s** | 1.32M/s | 54.5K/s | 55.7K/s | 56.9K/s | 54.73M/s | not run — no GPU path | 4.9K× |
| nbody | not run — no AVX-512 | not run — no native impl | not run — no native impl | not run — no C++ impl | **123.59M/s** | 1.06M/s | 72.4K/s | 66.8K/s | 64.5K/s | 29.08M/s | not run — no GPU path | 1.9K× |
| json-parse | not run — no AVX-512 | not run — no native impl | not run — no native impl | not run — no C++ impl | **3.09M/s** | 467.0K/s | 9.9K/s | 5.1K/s | 5.3K/s | no WASM — strings/records | not run — no GPU path | 589.0× |
| mandelbrot | not run — no AVX-512 | **23.11M/s** | **23.43M/s** | not run — no C++ impl | 6.84M/s | 142.0K/s | 7.7K/s | 8.4K/s | 7.8K/s | 9.09M/s | not run — no GPU path | 872.0× |
| spectral-norm | not run — no AVX-512 | **366.35M/s** | **371.43M/s** | not run — no C++ impl | 240.30M/s | 1.57M/s | not run | not run | not run | no WASM build | not run — no GPU path | N/A — no governed ⟨interp⟩ |
| binary-trees | not run — no AVX-512 | 15.76M/s | 20.15M/s | not run — no C++ impl | 78.84M/s | 2.87M/s | 391.3K/s | 356.6K/s | 357.0K/s | **589.25M/s** | not run — no GPU path | 220.8× |
| spore-container | not run — no AVX-512 | 160.5K/s | **172.6K/s** | not run — no C++ impl | 43.5K/s | 74.5K/s | not run | not run | not run | no WASM — strings/records | not run — no GPU path | N/A — no governed ⟨interp⟩ |
| framework-pipeline | not run — no AVX-512 | not run — no native impl | not run — no native impl | not run — no C++ impl | not run | **108.6K/s** | not run | not run | not run | no WASM — strings/records | not run — no GPU path | N/A — neither ran |
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
| 🥇 | ⚫ | Galerina passive ⟨interp⟩ | -38.68 bytes/op ⚡ ~0 — no boxing | 158.3K/s | — | -387KB |
| 🥈 | 🟢 | Rust AVX2 | 0.00 bytes/op ⚡ ~0 — no boxing | 5.86B/s | — | — |
| 🥉 | 🟢 | Rust (generic) | 0.00 bytes/op ⚡ ~0 — no boxing | 1.35B/s | — | — |
| 4 | 🟢 | Node.js | 0.00 bytes/op ⚡ ~0 — no boxing | 720.11M/s | — | 8KB |
| 5 | ⚪ | WASM ▶ production | 0.00 bytes/op ⚡ ~0 — no boxing | 466.25M/s | — | 42KB |
| 6 | ⚫ | Python | 0.03 bytes/op ⚡ ~0 — no boxing | 2.84M/s | — | 272B |
| 7 | ⚫ | Galerina governed ⟨interp⟩ | 44 bytes/op ⚠ moderate | 161.6K/s | — | 444KB |
| 8 | ⚫ | Galerina manifest ⟨interp⟩ | 62 bytes/op ⚠ moderate | 112.9K/s | — | 622KB |

> **Why this matters:** Every byte allocated is a byte the GC must later collect.
> WASM and the bytecode VM run with zero allocation — ideal for high-throughput governed services.
> The tree-walker's per-node allocation is the primary target of Phases 31-33.


## 2b. General Memory Usage

| Benchmark | Runtime | RSS | Peak RSS | Heap Used | Heap Δ (execution) |
|---|---|---|---|---|---|
| compute-mix | Rust AVX2 | — | — | — | — |
| compute-mix | Rust (generic) | — | — | — | — |
| compute-mix | C++ | — | — | — | — |
| compute-mix | Node.js | 46.9MB | 47.2MB | 5.0MB | 949KB |
| compute-mix | Python | — | — | 3KB | 3KB |
| compute-mix | Galerina passive ⟨interp⟩ | 79.8MB | 79.8MB | 16.6MB | 73KB |
| compute-mix | Galerina manifest ⟨interp⟩ | 76.0MB | 76.0MB | 20.4MB | 4.4MB |
| compute-mix | Galerina governed ⟨interp⟩ | 74.6MB | 74.6MB | 20.2MB | 4.5MB |
| compute-mix | WASM ▶ production | 73.1MB | 73.1MB | 15.9MB | 22KB |
| arithmetic-threshold | Rust AVX2 | — | — | — | — |
| arithmetic-threshold | Rust (generic) | — | — | — | — |
| arithmetic-threshold | C++ | — | — | — | — |
| arithmetic-threshold | Node.js | 48.5MB | 48.7MB | 4.3MB | 212KB |
| arithmetic-threshold | Python | — | — | 4KB | 4KB |
| arithmetic-threshold | Galerina passive ⟨interp⟩ | 81.3MB | 81.3MB | 17.0MB | 39KB |
| arithmetic-threshold | Galerina manifest ⟨interp⟩ | 81.1MB | 81.1MB | 17.1MB | 832KB |
| arithmetic-threshold | Galerina governed ⟨interp⟩ | 81.0MB | 81.0MB | 17.0MB | 400KB |
| arithmetic-threshold | WASM ▶ production | 83.2MB | 83.2MB | 16.6MB | 6KB |
| six-digit-guess | Rust AVX2 | — | — | — | — |
| six-digit-guess | Rust (generic) | — | — | — | — |
| six-digit-guess | C++ | — | — | — | — |
| six-digit-guess | Node.js | 53.1MB | 53.1MB | 5.8MB | 1.1MB |
| six-digit-guess | Python | — | — | 583B | 583B |
| six-digit-guess | Galerina passive ⟨interp⟩ | 82.5MB | 82.5MB | 17.2MB | 86KB |
| six-digit-guess | Galerina manifest ⟨interp⟩ | 82.3MB | 82.3MB | 17.7MB | 909KB |
| six-digit-guess | Galerina governed ⟨interp⟩ | 81.8MB | 81.8MB | 17.0MB | 498KB |
| six-digit-guess | WASM ▶ production | 83.8MB | 83.8MB | 16.7MB | 1KB |
| record-allocation | Rust AVX2 | — | — | — | — |
| record-allocation | Rust (generic) | — | — | — | — |
| record-allocation | Node.js | 49.4MB | 49.4MB | 4.4MB | 280KB |
| record-allocation | Python | — | — | 492B | 492B |
| record-allocation | Galerina passive ⟨interp⟩ | 82.2MB | 82.2MB | 17.5MB | 188KB |
| record-allocation | Galerina manifest ⟨interp⟩ | 82.2MB | 82.2MB | 17.0MB | 87KB |
| record-allocation | Galerina governed ⟨interp⟩ | 82.9MB | 82.9MB | 17.0MB | 60KB |
| record-allocation | WASM ▶ production | 84.4MB | 84.4MB | 17.3MB | 50KB |
| fibonacci-recursive | Rust AVX2 | — | — | — | — |
| fibonacci-recursive | Rust (generic) | — | — | — | — |
| fibonacci-recursive | Node.js | 47.8MB | 47.8MB | 4.1MB | 5KB |
| fibonacci-recursive | Python | — | — | 464B | 464B |
| fibonacci-recursive | Galerina passive ⟨interp⟩ | 82.8MB | 82.8MB | 18.9MB | 59KB |
| fibonacci-recursive | Galerina manifest ⟨interp⟩ | 82.8MB | 82.8MB | 18.2MB | 1.1MB |
| fibonacci-recursive | Galerina governed ⟨interp⟩ | 82.4MB | 82.4MB | 18.0MB | 900KB |
| fibonacci-recursive | WASM ▶ production | 84.9MB | 84.9MB | 17.3MB | 3KB |
| tower-of-hanoi | Rust AVX2 | — | — | — | — |
| tower-of-hanoi | Rust (generic) | — | — | — | — |
| tower-of-hanoi | Node.js | 47.7MB | 47.7MB | 4.1MB | 17KB |
| tower-of-hanoi | Python | — | — | 1KB | 1KB |
| tower-of-hanoi | Galerina passive ⟨interp⟩ | 85.5MB | 85.5MB | 22.2MB | 47KB |
| tower-of-hanoi | Galerina manifest ⟨interp⟩ | 84.5MB | 84.5MB | 17.3MB | 1.1MB |
| tower-of-hanoi | Galerina governed ⟨interp⟩ | 84.7MB | 84.7MB | 20.4MB | 4.3MB |
| tower-of-hanoi | WASM ▶ production | 84.9MB | 84.9MB | 16.5MB | 1KB |
| collection-pipeline | Rust AVX2 | — | — | — | — |
| collection-pipeline | Rust (generic) | — | — | — | — |
| collection-pipeline | Node.js | 64.7MB | 64.7MB | 12.3MB | 8.1MB |
| collection-pipeline | Python | — | — | 224B | 224B |
| collection-pipeline | Galerina passive ⟨interp⟩ | 85.8MB | 85.8MB | 16.9MB | 271KB |
| collection-pipeline | Galerina manifest ⟨interp⟩ | 85.8MB | 85.8MB | 16.3MB | 143KB |
| collection-pipeline | Galerina governed ⟨interp⟩ | 86.8MB | 86.8MB | 16.4MB | 167KB |
| collection-pipeline | WASM ▶ production | 87.6MB | 87.6MB | 16.5MB | 24KB |
| governance-cost | Rust AVX2 | — | — | — | — |
| governance-cost | Rust (generic) | — | — | — | — |
| governance-cost | Node.js | 47.7MB | 47.7MB | 4.1MB | 27KB |
| governance-cost | Python | — | — | 272B | 272B |
| governance-cost | Galerina passive ⟨interp⟩ | 87.3MB | 87.3MB | 17.1MB | 495KB |
| governance-cost | Galerina manifest ⟨interp⟩ | 89.2MB | 89.2MB | 16.8MB | 421KB |
| governance-cost | Galerina governed ⟨interp⟩ | 87.4MB | 87.4MB | 16.8MB | 446KB |
| governance-cost | WASM ▶ production | 88.2MB | 88.2MB | 16.6MB | 50KB |
| hardware-targets | Rust AVX2 | — | — | — | — |
| hardware-targets | Rust (generic) | — | — | — | — |
| hardware-targets | Node.js | 49.5MB | 49.5MB | 4.6MB | 446KB |
| hardware-targets | Galerina passive ⟨interp⟩ | 86.1MB | 86.1MB | 17.2MB | 54KB |
| hardware-targets | Galerina manifest ⟨interp⟩ | 86.2MB | 86.2MB | 16.5MB | 82KB |
| hardware-targets | Galerina governed ⟨interp⟩ | 85.8MB | 85.8MB | 16.6MB | 78KB |
| hardware-targets | WASM ▶ production | 88.2MB | 88.2MB | 16.8MB | 72KB |
| low-memory | Rust AVX2 | — | — | — | — |
| low-memory | Rust (generic) | — | — | — | — |
| low-memory | Node.js | 48.0MB | 48.0MB | 4.1MB | 8KB |
| low-memory | Python | — | — | 272B | 272B |
| low-memory | Galerina passive ⟨interp⟩ | 87.8MB | 87.8MB | 17.1MB | -387KB |
| low-memory | Galerina manifest ⟨interp⟩ | 86.7MB | 86.7MB | 17.1MB | 622KB |
| low-memory | Galerina governed ⟨interp⟩ | 86.2MB | 86.2MB | 16.9MB | 444KB |
| low-memory | WASM ▶ production | 88.6MB | 88.6MB | 16.8MB | 42KB |
| gpu-compute | Rust AVX2 | — | — | — | — |
| gpu-compute | Rust (generic) | — | — | — | — |
| gpu-compute | Node.js | 47.7MB | 47.7MB | 4.1MB | 17KB |
| gpu-compute | Python | — | — | 304B | 304B |
| gpu-compute | Galerina passive ⟨interp⟩ | 86.3MB | 86.3MB | 18.0MB | 191KB |
| gpu-compute | Galerina manifest ⟨interp⟩ | 86.1MB | 86.1MB | 17.4MB | 703KB |
| gpu-compute | Galerina governed ⟨interp⟩ | 86.9MB | 86.9MB | 17.5MB | 807KB |
| gpu-compute | WASM ▶ production | 88.4MB | 88.4MB | 16.9MB | 2KB |
| matrix-multiply | Rust AVX2 | — | — | — | — |
| matrix-multiply | Rust (generic) | — | — | — | — |
| matrix-multiply | Node.js | 50.2MB | 50.2MB | 4.2MB | 118KB |
| matrix-multiply | Python | — | — | 392B | 392B |
| matrix-multiply | Galerina passive ⟨interp⟩ | 87.2MB | 87.2MB | 17.0MB | -883KB |
| matrix-multiply | Galerina manifest ⟨interp⟩ | 87.2MB | 87.2MB | 17.7MB | 1.0MB |
| matrix-multiply | Galerina governed ⟨interp⟩ | 88.1MB | 88.1MB | 17.7MB | 957KB |
| matrix-multiply | WASM ▶ production | 89.4MB | 89.4MB | 17.0MB | 3KB |
| crypto-ops | Rust AVX2 | — | — | — | — |
| crypto-ops | Rust (generic) | — | — | — | — |
| crypto-ops | Node.js | 64.7MB | 64.7MB | 10.0MB | 4.5MB |
| crypto-ops | Python | — | — | 208B | 208B |
| crypto-ops | Galerina passive ⟨interp⟩ | 88.1MB | 88.1MB | 17.4MB | 153KB |
| crypto-ops | Galerina manifest ⟨interp⟩ | 87.3MB | 87.3MB | 16.8MB | 92KB |
| crypto-ops | Galerina governed ⟨interp⟩ | 87.3MB | 87.3MB | 16.9MB | 221KB |
| text-html | Rust AVX2 | — | — | — | — |
| text-html | Rust (generic) | — | — | — | — |
| text-html | Node.js | — | — | — | 472KB |
| text-html | Python | — | — | 208B | 208B |
| text-html | Galerina passive ⟨interp⟩ | 88.8MB | 88.8MB | 17.6MB | -399KB |
| text-html | Galerina manifest ⟨interp⟩ | 88.1MB | 88.1MB | 17.2MB | 149KB |
| text-html | Galerina governed ⟨interp⟩ | 88.1MB | 88.1MB | 17.3MB | 169KB |
| tri-logic | Rust AVX2 | — | — | — | — |
| tri-logic | Rust (generic) | — | — | — | — |
| tri-logic | Node.js | — | — | — | 336KB |
| tri-logic | Python | — | — | — | — |
| tri-logic | Galerina passive ⟨interp⟩ | 88.5MB | 88.5MB | 18.7MB | 232KB |
| tri-logic | Galerina manifest ⟨interp⟩ | 88.5MB | 88.5MB | 18.4MB | 1.2MB |
| tri-logic | Galerina governed ⟨interp⟩ | 88.6MB | 88.6MB | 17.8MB | 601KB |
| tri-logic | WASM ▶ production | 91.0MB | 91.0MB | 17.5MB | 1KB |
| data-query | Node.js | — | — | — | 22KB |
| data-query | Python | — | — | — | — |
| data-query | Galerina passive ⟨interp⟩ | 89.6MB | 89.6MB | 18.2MB | -960KB |
| data-query | Galerina manifest ⟨interp⟩ | 89.5MB | 89.5MB | 17.9MB | 679KB |
| data-query | Galerina governed ⟨interp⟩ | 87.7MB | 87.7MB | 18.4MB | 1.2MB |
| call-chain | Node.js | 48.9MB | 48.9MB | 4.4MB | 263KB |
| call-chain | Python | — | — | 368B | 368B |
| call-chain | Galerina passive ⟨interp⟩ | 87.2MB | 87.2MB | 19.1MB | 83KB |
| call-chain | Galerina manifest ⟨interp⟩ | 87.2MB | 87.2MB | 19.3MB | 2.0MB |
| call-chain | Galerina governed ⟨interp⟩ | 87.8MB | 87.8MB | 18.5MB | 1.3MB |
| call-chain | WASM ▶ production | 90.3MB | 90.3MB | 17.5MB | 1KB |
| nbody | Node.js | 49.8MB | 49.8MB | 4.2MB | 30KB |
| nbody | Python | — | — | 624B | 624B |
| nbody | Galerina passive ⟨interp⟩ | 89.0MB | 89.0MB | 17.6MB | -1.9MB |
| nbody | Galerina manifest ⟨interp⟩ | 89.0MB | 89.0MB | 17.6MB | 253KB |
| nbody | Galerina governed ⟨interp⟩ | 87.4MB | 87.4MB | 18.5MB | 1.1MB |
| nbody | WASM ▶ production | 89.7MB | 89.7MB | 17.6MB | 1KB |
| json-parse | Node.js | — | — | — | 255KB |
| json-parse | Python | — | — | 520B | 520B |
| json-parse | Galerina passive ⟨interp⟩ | 94.2MB | 94.2MB | 21.2MB | 426KB |
| json-parse | Galerina manifest ⟨interp⟩ | 90.0MB | 90.0MB | 20.5MB | 2.7MB |
| json-parse | Galerina governed ⟨interp⟩ | 96.3MB | 96.3MB | 18.4MB | 1.0MB |
| mandelbrot | Rust AVX2 | — | — | — | — |
| mandelbrot | Rust (generic) | — | — | — | — |
| mandelbrot | Node.js | 49.8MB | 49.8MB | 4.2MB | 32KB |
| mandelbrot | Python | — | — | 3KB | 3KB |
| mandelbrot | Galerina passive ⟨interp⟩ | 91.6MB | 91.6MB | 19.2MB | 167KB |
| mandelbrot | Galerina manifest ⟨interp⟩ | 91.6MB | 91.6MB | 17.8MB | 148KB |
| mandelbrot | Galerina governed ⟨interp⟩ | 89.3MB | 89.3MB | 20.2MB | 2.2MB |
| mandelbrot | WASM ▶ production | 91.5MB | 91.5MB | 18.2MB | 1KB |
| spectral-norm | Rust AVX2 | — | — | — | — |
| spectral-norm | Rust (generic) | — | — | — | — |
| spectral-norm | Node.js | 49.8MB | 49.8MB | 4.4MB | 294KB |
| spectral-norm | Python | — | — | 4KB | 4KB |
| binary-trees | Rust AVX2 | — | — | — | — |
| binary-trees | Rust (generic) | — | — | — | — |
| binary-trees | Node.js | 49.8MB | 49.8MB | 4.6MB | 429KB |
| binary-trees | Python | — | — | 368B | 368B |
| binary-trees | Galerina passive ⟨interp⟩ | 90.8MB | 90.8MB | 20.1MB | 69KB |
| binary-trees | Galerina manifest ⟨interp⟩ | 90.8MB | 90.8MB | 19.5MB | 1.7MB |
| binary-trees | Galerina governed ⟨interp⟩ | 90.8MB | 90.8MB | 20.0MB | 2.1MB |
| binary-trees | WASM ▶ production | 92.2MB | 92.2MB | 17.9MB | 2KB |
| spore-container | Rust AVX2 | — | — | — | — |
| spore-container | Rust (generic) | — | — | — | — |
| spore-container | Node.js | 65.8MB | 65.8MB | 8.9MB | 1.6MB |
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
| compute-mix | Node.js | 5.00s | 5.01s | 100% | 135.2K ops/CPU-ms |
| compute-mix | Python | 5.05s | 5.05s | 100% | 762.85 ops/CPU-ms |
| compute-mix | Galerina passive ⟨interp⟩ | 0.3ms | 0.0ms | 0% | — |
| compute-mix | Galerina manifest ⟨interp⟩ | 28.0ms | 31.0ms | 111% | 1.6K ops/CPU-ms |
| compute-mix | Galerina governed ⟨interp⟩ | 29.9ms | 47.0ms | 157% | 1.1K ops/CPU-ms |
| compute-mix | WASM ▶ production | 1.29s | 1.28s | 99% | 78.1K ops/CPU-ms |
| arithmetic-threshold | Rust AVX2 | 12.8ms | — | — | — |
| arithmetic-threshold | Rust (generic) | 12.8ms | — | — | — |
| arithmetic-threshold | C++ | 10.6ms | — | — | — |
| arithmetic-threshold | Node.js | 20.6ms | 16.0ms | 78% | 1.25M ops/CPU-ms |
| arithmetic-threshold | Python | 5.32s | 5.31s | 100% | 3.8K ops/CPU-ms |
| arithmetic-threshold | Galerina passive ⟨interp⟩ | 0.1ms | 0.0ms | 0% | — |
| arithmetic-threshold | Galerina manifest ⟨interp⟩ | 11.8ms | 32.0ms | 270% | 2.0K ops/CPU-ms |
| arithmetic-threshold | Galerina governed ⟨interp⟩ | 11.9ms | 32.0ms | 268% | 2.0K ops/CPU-ms |
| arithmetic-threshold | WASM ▶ production | 1.02s | 1.03s | 101% | 490.8K ops/CPU-ms |
| six-digit-guess | Rust AVX2 | 0.8ms | — | — | — |
| six-digit-guess | Rust (generic) | 0.5ms | — | — | — |
| six-digit-guess | C++ | 0.6ms | — | — | — |
| six-digit-guess | Node.js | 14.3ms | 0.0ms | 0% | — |
| six-digit-guess | Python | 414.1ms | 406.3ms | 98% | 103.56 ops/CPU-ms |
| six-digit-guess | Galerina passive ⟨interp⟩ | 0.2ms | 0.0ms | 0% | — |
| six-digit-guess | Galerina manifest ⟨interp⟩ | 816.9ms | 906.0ms | 111% | 46.43 ops/CPU-ms |
| six-digit-guess | Galerina governed ⟨interp⟩ | 864.9ms | 922.0ms | 107% | 45.63 ops/CPU-ms |
| six-digit-guess | WASM ▶ production | 1.15s | 1.16s | 101% | 36.4K ops/CPU-ms |
| record-allocation | Rust AVX2 | 8.5ms | — | — | — |
| record-allocation | Rust (generic) | 8.5ms | — | — | — |
| record-allocation | Node.js | 3.3ms | 0.0ms | 0% | — |
| record-allocation | Python | 46.5ms | 46.9ms | 101% | 4.3K ops/CPU-ms |
| record-allocation | Galerina passive ⟨interp⟩ | 0.3ms | 0.0ms | 0% | — |
| record-allocation | Galerina manifest ⟨interp⟩ | 4.8ms | 0.0ms | 0% | — |
| record-allocation | Galerina governed ⟨interp⟩ | 4.0ms | 0.0ms | 0% | — |
| record-allocation | WASM ▶ production | 1.01s | 1.00s | 99% | 560.0K ops/CPU-ms |
| fibonacci-recursive | Rust AVX2 | 398.3ms | — | — | — |
| fibonacci-recursive | Rust (generic) | 400.4ms | — | — | — |
| fibonacci-recursive | Node.js | 781.5ms | 782.0ms | 100% | 0.13 ops/CPU-ms |
| fibonacci-recursive | Python | 3.96s | 3.95s | 100% | 0.01 ops/CPU-ms |
| fibonacci-recursive | Galerina passive ⟨interp⟩ | 0.1ms | 0.0ms | 0% | — |
| fibonacci-recursive | Galerina manifest ⟨interp⟩ | 58.4ms | 62.0ms | 106% | 0.02 ops/CPU-ms |
| fibonacci-recursive | Galerina governed ⟨interp⟩ | 74.6ms | 62.0ms | 83% | 0.02 ops/CPU-ms |
| fibonacci-recursive | WASM ▶ production | 1.04s | 1.03s | 99% | 17.46 ops/CPU-ms |
| tower-of-hanoi | Rust AVX2 | 517.5ms | — | — | — |
| tower-of-hanoi | Rust (generic) | 519.3ms | — | — | — |
| tower-of-hanoi | Node.js | 101.1ms | 94.0ms | 93% | 139.4K ops/CPU-ms |
| tower-of-hanoi | Python | 552.8ms | 546.9ms | 99% | 2.4K ops/CPU-ms |
| tower-of-hanoi | Galerina passive ⟨interp⟩ | 0.1ms | 0.0ms | 0% | — |
| tower-of-hanoi | Galerina manifest ⟨interp⟩ | 666.6ms | 750.0ms | 113% | 87.38 ops/CPU-ms |
| tower-of-hanoi | Galerina governed ⟨interp⟩ | 633.8ms | 641.0ms | 101% | 102.24 ops/CPU-ms |
| tower-of-hanoi | WASM ▶ production | 1.07s | 1.06s | 99% | 123.3K ops/CPU-ms |
| collection-pipeline | Rust AVX2 | 75.6ms | — | — | — |
| collection-pipeline | Rust (generic) | 231.1ms | — | — | — |
| collection-pipeline | Node.js | 708.4ms | 719.0ms | 101% | 69.5K ops/CPU-ms |
| collection-pipeline | Python | 3.74s | 3.73s | 100% | 13.4K ops/CPU-ms |
| collection-pipeline | Galerina passive ⟨interp⟩ | 0.4ms | 0.0ms | 0% | — |
| collection-pipeline | Galerina manifest ⟨interp⟩ | 4.3ms | 0.0ms | 0% | — |
| collection-pipeline | Galerina governed ⟨interp⟩ | 4.9ms | 0.0ms | 0% | — |
| collection-pipeline | WASM ▶ production | 1.02s | 1.03s | 101% | 417.1K ops/CPU-ms |
| governance-cost | Rust AVX2 | 14.4ms | — | — | — |
| governance-cost | Rust (generic) | 11.2ms | — | — | — |
| governance-cost | Node.js | 47.3ms | 47.0ms | 99% | 2.1K ops/CPU-ms |
| governance-cost | Python | 4.27s | 4.27s | 100% | 23.44 ops/CPU-ms |
| governance-cost | Galerina passive ⟨interp⟩ | 2.3ms | 0.0ms | 0% | — |
| governance-cost | Galerina manifest ⟨interp⟩ | 0.9ms | 0.0ms | 0% | — |
| governance-cost | Galerina governed ⟨interp⟩ | 1.2ms | 0.0ms | 0% | — |
| governance-cost | WASM ▶ production | 1.00s | 1.00s | 100% | 2.9K ops/CPU-ms |
| hardware-targets | Rust AVX2 | 847.1ms | — | — | — |
| hardware-targets | Rust (generic) | 847.6ms | — | — | — |
| hardware-targets | Node.js | 1.10s | 1.09s | 100% | 914.08 ops/CPU-ms |
| hardware-targets | Galerina passive ⟨interp⟩ | 12.4ms | 0.0ms | 0% | — |
| hardware-targets | Galerina manifest ⟨interp⟩ | 0.3ms | 0.0ms | 0% | — |
| hardware-targets | Galerina governed ⟨interp⟩ | 0.3ms | 0.0ms | 0% | — |
| hardware-targets | WASM ▶ production | 1.00s | 1.02s | 102% | 37.0K ops/CPU-ms |
| low-memory | Rust AVX2 | 170.6ms | — | — | — |
| low-memory | Rust (generic) | 739.6ms | — | — | — |
| low-memory | Node.js | 69.4ms | 62.0ms | 89% | 806.4K ops/CPU-ms |
| low-memory | Python | 3.52s | 3.52s | 100% | 2.8K ops/CPU-ms |
| low-memory | Galerina passive ⟨interp⟩ | 0.7ms | 0.0ms | 0% | — |
| low-memory | Galerina manifest ⟨interp⟩ | 88.5ms | 78.0ms | 88% | 128.21 ops/CPU-ms |
| low-memory | Galerina governed ⟨interp⟩ | 61.9ms | 62.0ms | 100% | 161.29 ops/CPU-ms |
| low-memory | WASM ▶ production | 1.01s | 1.00s | 99% | 470.0K ops/CPU-ms |
| gpu-compute | Rust AVX2 | 4.21s | — | — | — |
| gpu-compute | Rust (generic) | 4.21s | — | — | — |
| gpu-compute | Node.js | 505.0ms | 500.0ms | 99% | 1.00M ops/CPU-ms |
| gpu-compute | Python | 7.84s | 7.83s | 100% | 6.4K ops/CPU-ms |
| gpu-compute | Galerina passive ⟨interp⟩ | 0.2ms | 0.0ms | 0% | — |
| gpu-compute | Galerina manifest ⟨interp⟩ | 291.1ms | 313.0ms | 108% | 319.49 ops/CPU-ms |
| gpu-compute | Galerina governed ⟨interp⟩ | 287.6ms | 313.0ms | 109% | 319.49 ops/CPU-ms |
| gpu-compute | WASM ▶ production | 1.06s | 1.06s | 100% | 470.8K ops/CPU-ms |
| matrix-multiply | Rust AVX2 | 91.6ms | — | — | — |
| matrix-multiply | Rust (generic) | 86.6ms | — | — | — |
| matrix-multiply | Node.js | 211.5ms | 234.0ms | 111% | 560.1K ops/CPU-ms |
| matrix-multiply | Python | 2.00s | — | — | — |
| matrix-multiply | Galerina passive ⟨interp⟩ | 0.2ms | 0.0ms | 0% | — |
| matrix-multiply | Galerina manifest ⟨interp⟩ | 50.4ms | 94.0ms | 187% | 348.60 ops/CPU-ms |
| matrix-multiply | Galerina governed ⟨interp⟩ | 44.5ms | 78.0ms | 175% | 420.10 ops/CPU-ms |
| matrix-multiply | WASM ▶ production | 1.04s | 1.05s | 101% | 438.2K ops/CPU-ms |
| crypto-ops | Galerina passive ⟨interp⟩ | 7.0ms | 0.0ms | 0% | — |
| crypto-ops | Galerina manifest ⟨interp⟩ | 0.6ms | 0.0ms | 0% | — |
| crypto-ops | Galerina governed ⟨interp⟩ | 6.2ms | 15.0ms | 241% | 0.07 ops/CPU-ms |
| text-html | Galerina passive ⟨interp⟩ | 1.6ms | 0.0ms | 0% | — |
| text-html | Galerina manifest ⟨interp⟩ | 0.4ms | 0.0ms | 0% | — |
| text-html | Galerina governed ⟨interp⟩ | 1.2ms | 0.0ms | 0% | — |
| tri-logic | Rust AVX2 | 432.1ms | — | — | — |
| tri-logic | Rust (generic) | 431.4ms | — | — | — |
| tri-logic | Node.js | 301.7ms | — | — | — |
| tri-logic | Python | 1.64s | — | — | — |
| tri-logic | Galerina passive ⟨interp⟩ | 1.9ms | 0.0ms | 0% | — |
| tri-logic | Galerina manifest ⟨interp⟩ | 892.1ms | 938.0ms | 105% | 319.83 ops/CPU-ms |
| tri-logic | Galerina governed ⟨interp⟩ | 875.6ms | 891.0ms | 102% | 336.70 ops/CPU-ms |
| tri-logic | WASM ▶ production | 1.28s | 1.27s | 99% | 473.9K ops/CPU-ms |
| data-query | Node.js | 127.1ms | — | — | — |
| data-query | Python | 951.3ms | — | — | — |
| data-query | Galerina passive ⟨interp⟩ | 0.8ms | 0.0ms | 0% | — |
| data-query | Galerina manifest ⟨interp⟩ | 43.6ms | 63.0ms | 144% | 158.73 ops/CPU-ms |
| data-query | Galerina governed ⟨interp⟩ | 46.8ms | 62.0ms | 132% | 161.29 ops/CPU-ms |
| call-chain | Node.js | 7.1ms | 16.0ms | 224% | 125.0K ops/CPU-ms |
| call-chain | Python | 758.4ms | 750.0ms | 99% | 1.3K ops/CPU-ms |
| call-chain | Galerina passive ⟨interp⟩ | 0.1ms | 0.0ms | 0% | — |
| call-chain | Galerina manifest ⟨interp⟩ | 897.5ms | 922.0ms | 103% | 54.23 ops/CPU-ms |
| call-chain | Galerina governed ⟨interp⟩ | 878.4ms | 907.0ms | 103% | 55.13 ops/CPU-ms |
| call-chain | WASM ▶ production | 1.83s | 1.83s | 100% | 54.7K ops/CPU-ms |
| nbody | Node.js | 53.0ms | 62.0ms | 117% | 105.7K ops/CPU-ms |
| nbody | Python | 1.55s | — | — | — |
| nbody | Galerina passive ⟨interp⟩ | 0.3ms | 0.0ms | 0% | — |
| nbody | Galerina manifest ⟨interp⟩ | 490.9ms | 515.0ms | 105% | 63.63 ops/CPU-ms |
| nbody | Galerina governed ⟨interp⟩ | 508.2ms | 531.0ms | 104% | 61.71 ops/CPU-ms |
| nbody | WASM ▶ production | 1.13s | 1.14s | 101% | 28.7K ops/CPU-ms |
| json-parse | Galerina passive ⟨interp⟩ | 0.5ms | 0.0ms | 0% | — |
| json-parse | Galerina manifest ⟨interp⟩ | 98.0ms | 109.0ms | 111% | 4.59 ops/CPU-ms |
| json-parse | Galerina governed ⟨interp⟩ | 95.2ms | 125.0ms | 131% | 4.00 ops/CPU-ms |
| mandelbrot | Rust AVX2 | 141.8ms | — | — | — |
| mandelbrot | Rust (generic) | 139.8ms | — | — | — |
| mandelbrot | Node.js | 478.7ms | 484.0ms | 101% | 6.8K ops/CPU-ms |
| mandelbrot | Python | 23.08s | — | — | — |
| mandelbrot | Galerina passive ⟨interp⟩ | 0.1ms | 0.0ms | 0% | — |
| mandelbrot | Galerina manifest ⟨interp⟩ | 1.96s | 1.99s | 101% | 8.25 ops/CPU-ms |
| mandelbrot | Galerina governed ⟨interp⟩ | 2.09s | 2.13s | 102% | 7.71 ops/CPU-ms |
| mandelbrot | WASM ▶ production | 1.80s | 1.80s | 100% | 9.1K ops/CPU-ms |
| spectral-norm | Rust AVX2 | 27.3ms | — | — | — |
| spectral-norm | Rust (generic) | 26.9ms | — | — | — |
| spectral-norm | Node.js | 41.6ms | 47.0ms | 113% | 212.8K ops/CPU-ms |
| spectral-norm | Python | 6.38s | — | — | — |
| binary-trees | Rust AVX2 | 8.6ms | — | — | — |
| binary-trees | Rust (generic) | 6.7ms | — | — | — |
| binary-trees | Node.js | 1.7ms | 16.0ms | 929% | 8.5K ops/CPU-ms |
| binary-trees | Python | 47.3ms | 46.9ms | 99% | 2.9K ops/CPU-ms |
| binary-trees | Galerina passive ⟨interp⟩ | 0.1ms | 0.0ms | 0% | — |
| binary-trees | Galerina manifest ⟨interp⟩ | 381.0ms | 437.0ms | 115% | 310.88 ops/CPU-ms |
| binary-trees | Galerina governed ⟨interp⟩ | 380.6ms | 375.0ms | 99% | 362.28 ops/CPU-ms |
| binary-trees | WASM ▶ production | 1.15s | 1.16s | 100% | 587.6K ops/CPU-ms |
| spore-container | Rust AVX2 | 1.87s | — | — | — |
| spore-container | Rust (generic) | 1.74s | — | — | — |
| spore-container | Node.js | 6.90s | 8.64s | 125% | 34.72 ops/CPU-ms |
| spore-container | Python | 1.34s | — | — | — |
| framework-pipeline | Python | 1.84s | — | — | — |
| http-throughput | Node.js | 89.0ms | — | — | — |
| naming-check | Node.js | 432.0ms | — | — | — |
| context-receipt | Node.js | 306.0ms | — | — | — |
| intelligence-search | Node.js | 46.0ms | — | — | — |
| provenance-trace | Node.js | 1.98s | — | — | — |

> **CPU utilisation** = CPU ms ÷ wall ms × 100. Node.js approaches 100% (single-thread JIT). Python may show <100% on Windows where process_time measures differently.

## 4. Per-Benchmark Detail

> **Heap/op** = heap bytes allocated per operation (the fair, workload-attributable memory metric).
> Managed runtimes (Node/Python/Galerina/WASM) report it via a GC'd before/after delta; native Rust/C++
> show **~0 (native)** — no GC-managed heap. `~0` = no measurable per-op allocation (e.g. V8 tagged ints);
> a large positive value (e.g. the Galerina tree-walker boxing a value per AST node) is allocation pressure.

### compute-mix

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Node.js | 135.58M/s | 5.00s | 5.01s | 46.9MB | ~0 | 178.0× | 1.00× |
| 🥈 | 🟢 | C++ | 133.06M/s | 30.00s | — | — | ~0 (native) | 174.7× | 0.98× |
| 🥉 | 🟢 | Rust (generic) | 132.41M/s | 5.00s | — | — | ~0 (native) | 173.8× | 0.98× |
| 4 | 🟢 | Rust AVX2 | 130.12M/s | 5.00s | — | — | ~0 (native) | 170.8× | 0.96× |
| 5 | ⚪ | WASM ▶ production | 77.62M/s | 1.29s | 1.28s | 73.1MB | ~0 | 101.9× | 0.57× |
| 6 | 🔴 | Galerina passive ⟨interp⟩ | 2.19M/s | 0.3ms | 0.0ms | 79.8MB | 98 B/op | 2.88× | 0.02× |
| 7 | 🔴 | Galerina manifest ⟨interp⟩ | 1.79M/s | 28.0ms | 31.0ms | 76.0MB | 89 B/op | 2.35× | 0.01× |
| 8 | 🔴 | Galerina governed ⟨interp⟩ | 1.67M/s | 29.9ms | 47.0ms | 74.6MB | 90 B/op | 2.20× | 0.01× |
| 9 | ⚫ | Python | 761.7K/s | 5.05s | 5.05s | — | ~0 | 1.00× | 0.01× |

> 🧠 **Lowest heap/op:** WASM ▶ production (~0) · **highest:** Galerina passive ⟨interp⟩ (98 B/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### arithmetic-threshold

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | C++ | 1.88B/s | 10.6ms | — | — | ~0 (native) | 499.4× | 1.93× |
| 🥈 | 🟢 | Rust (generic) | 1.57B/s | 12.8ms | — | — | ~0 (native) | 416.3× | 1.61× |
| 🥉 | 🟢 | Rust AVX2 | 1.56B/s | 12.8ms | — | — | ~0 (native) | 415.7× | 1.61× |
| 4 | 🟢 | Node.js | 971.84M/s | 20.6ms | 16.0ms | 48.5MB | ~0 | 258.3× | 1.00× |
| 5 | ⚪ | WASM ▶ production | 495.03M/s | 1.02s | 1.03s | 83.2MB | ~0 | 131.6× | 0.51× |
| 6 | ⚫ | Galerina manifest ⟨interp⟩ | 5.35M/s | 11.8ms | 32.0ms | 81.1MB | 13 B/op | 1.42× | 0.01× |
| 7 | ⚫ | Galerina governed ⟨interp⟩ | 5.29M/s | 11.9ms | 32.0ms | 81.0MB | 6 B/op | 1.41× | 0.01× |
| 8 | ⚫ | Python | 3.76M/s | 5.32s | 5.31s | — | ~0 | 1.00× | 0.00× |
| 9 | ⚫ | Galerina passive ⟨interp⟩ | 27.4K/s | 0.1ms | 0.0ms | 81.3MB | 12.8 KB/op | 0.01× | 0.00× |

> 🧠 **Lowest heap/op:** WASM ▶ production (~0) · **highest:** Galerina passive ⟨interp⟩ (12.8 KB/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### six-digit-guess

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Rust (generic) | 78.02M/s | 0.5ms | — | — | ~0 (native) | 767.9× | 26.5× |
| 🥈 | 🟢 | C++ | 68.12M/s | 0.6ms | — | — | ~0 (native) | 670.4× | 23.1× |
| 🥉 | 🟢 | Rust AVX2 | 50.85M/s | 0.8ms | — | — | ~0 (native) | 500.4× | 17.3× |
| 4 | 🟢 | WASM ▶ production | 36.60M/s | 1.15s | 1.16s | 83.8MB | ~0 | 360.2× | 12.4× |
| 5 | 🟢 | Node.js | 2.94M/s | 14.3ms | 0.0ms | 53.1MB | 27 B/op | 29.0× | 1.00× |
| 6 | 🔴 | Python | 101.6K/s | 414.1ms | 406.3ms | — | ~0 | 1.00× | 0.03× |
| 7 | 🔴 | Galerina manifest ⟨interp⟩ | 51.5K/s | 816.9ms | 906.0ms | 82.3MB | 22 B/op | 0.51× | 0.02× |
| 8 | 🔴 | Galerina governed ⟨interp⟩ | 48.6K/s | 864.9ms | 922.0ms | 81.8MB | 12 B/op | 0.48× | 0.02× |
| 9 | ⚫ | Galerina passive ⟨interp⟩ | 15.4K/s | 0.2ms | 0.0ms | 82.5MB | 28.1 KB/op | 0.15× | 0.01× |

> 🧠 **Lowest heap/op:** WASM ▶ production (~0) · **highest:** Galerina passive ⟨interp⟩ (28.1 KB/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### record-allocation

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Rust AVX2 | 1.18B/s | 8.5ms | — | — | ~0 (native) | 273.5× | 19.3× |
| 🥈 | 🟢 | Rust (generic) | 1.17B/s | 8.5ms | — | — | ~0 (native) | 273.0× | 19.3× |
| 🥉 | 🟢 | WASM ▶ production | 555.05M/s | 1.01s | 1.00s | 84.4MB | ~0 | 129.0× | 9.10× |
| 4 | 🟢 | Node.js | 61.02M/s | 3.3ms | 0.0ms | 49.4MB | 1 B/op | 14.2× | 1.00× |
| 5 | 🟡 | Galerina passive ⟨interp⟩ | 8.53M/s | 0.3ms | 0.0ms | 82.2MB | 76 B/op | 1.98× | 0.14× |
| 6 | 🔴 | Python | 4.30M/s | 46.5ms | 46.9ms | — | ~0 | 1.00× | 0.07× |
| 7 | 🔴 | Galerina governed ⟨interp⟩ | 2.50M/s | 4.0ms | 0.0ms | 82.9MB | 6 B/op | 0.58× | 0.04× |
| 8 | 🔴 | Galerina manifest ⟨interp⟩ | 2.10M/s | 4.8ms | 0.0ms | 82.2MB | 9 B/op | 0.49× | 0.03× |

> 🧠 **Lowest heap/op:** WASM ▶ production (~0) · **highest:** Galerina passive ⟨interp⟩ (76 B/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### fibonacci-recursive

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Galerina passive ⟨interp⟩ | 50.8K/s | 0.1ms | 0.0ms | 82.8MB | 11.6 KB/op | 10.0K× | 396.7× |
| 🥈 | 🟢 | WASM ▶ production | 17.3K/s | 1.04s | 1.03s | 84.9MB | ~0 | 3.4K× | 135.2× |
| 🥉 | 🟢 | Rust AVX2 | 502.1/s | 398.3ms | — | — | ~0 (native) | 99.2× | 3.92× |
| 4 | 🟢 | Rust (generic) | 499.6/s | 400.4ms | — | — | ~0 (native) | 98.7× | 3.90× |
| 5 | 🟢 | Node.js | 128.0/s | 781.5ms | 782.0ms | 47.8MB | 53 B/op | 25.3× | 1.00× |
| 6 | 🟡 | Galerina manifest ⟨interp⟩ | 17.0/s | 58.4ms | 62.0ms | 82.8MB | 1055.4 KB/op | 3.36× | 0.13× |
| 7 | 🟡 | Galerina governed ⟨interp⟩ | 13.0/s | 74.6ms | 62.0ms | 82.4MB | 906.1 KB/op | 2.57× | 0.10× |
| 8 | 🔴 | Python | 5.1/s | 3.96s | 3.95s | — | 23 B/op | 1.00× | 0.04× |

> 🧠 **Lowest heap/op:** WASM ▶ production (~0) · **highest:** Galerina manifest ⟨interp⟩ (1055.4 KB/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### tower-of-hanoi

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Rust AVX2 | 253.28M/s | 517.5ms | — | — | ~0 (native) | 106.8× | 1.95× |
| 🥈 | 🟢 | Rust (generic) | 252.40M/s | 519.3ms | — | — | ~0 (native) | 106.4× | 1.95× |
| 🥉 | 🟢 | Node.js | 129.63M/s | 101.1ms | 94.0ms | 47.7MB | ~0 | 54.7× | 1.00× |
| 4 | 🟢 | WASM ▶ production | 122.33M/s | 1.07s | 1.06s | 84.9MB | ~0 | 51.6× | 0.94× |
| 5 | 🔴 | Python | 2.37M/s | 552.8ms | 546.9ms | — | ~0 | 1.00× | 0.02× |
| 6 | ⚫ | Galerina governed ⟨interp⟩ | 103.4K/s | 633.8ms | 641.0ms | 84.7MB | 65 B/op | 0.04× | 0.00× |
| 7 | ⚫ | Galerina passive ⟨interp⟩ | 102.9K/s | 0.1ms | 0.0ms | 85.5MB | 7.4 KB/op | 0.04× | 0.00× |
| 8 | ⚫ | Galerina manifest ⟨interp⟩ | 98.3K/s | 666.6ms | 750.0ms | 84.5MB | 16 B/op | 0.04× | 0.00× |

> 🧠 **Lowest heap/op:** WASM ▶ production (~0) · **highest:** Galerina passive ⟨interp⟩ (7.4 KB/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### collection-pipeline

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Rust AVX2 | 13.23B/s | 75.6ms | — | — | ~0 (native) | 989.1× | 187.5× |
| 🥈 | 🟢 | Rust (generic) | 4.33B/s | 231.1ms | — | — | ~0 (native) | 323.4× | 61.3× |
| 🥉 | 🟢 | WASM ▶ production | 421.46M/s | 1.02s | 1.03s | 87.6MB | ~0 | 31.5× | 5.97× |
| 4 | 🟢 | Node.js | 70.58M/s | 708.4ms | 719.0ms | 64.7MB | ~0 | 5.28× | 1.00× |
| 5 | 🟡 | Python | 13.38M/s | 3.74s | 3.73s | — | ~0 | 1.00× | 0.19× |
| 6 | 🟡 | Galerina passive ⟨interp⟩ | 7.86M/s | 0.4ms | 0.0ms | 85.8MB | 97 B/op | 0.59× | 0.11× |
| 7 | 🔴 | Galerina manifest ⟨interp⟩ | 2.32M/s | 4.3ms | 0.0ms | 85.8MB | 14 B/op | 0.17× | 0.03× |
| 8 | 🔴 | Galerina governed ⟨interp⟩ | 2.04M/s | 4.9ms | 0.0ms | 86.8MB | 17 B/op | 0.15× | 0.03× |

> 🧠 **Lowest heap/op:** WASM ▶ production (~0) · **highest:** Galerina passive ⟨interp⟩ (97 B/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### governance-cost ⚠️ (excluded — not unit-aligned)

> internal governed/manifest ratio — native baseline does no governance; not cross-runtime by design

| Runtime | Raw reported throughput (native unit — **NOT comparable**) | Wall |
|---|---|---|
| Rust AVX2 | — | 14.4ms |
| Rust (generic) | — | 11.2ms |
| Node.js | — | 47.3ms |
| Python | — | 4.27s |
| Galerina passive ⟨interp⟩ | — | 2.3ms |
| Galerina manifest ⟨interp⟩ | — | 0.9ms |
| Galerina governed ⟨interp⟩ | — | 1.2ms |
| WASM ▶ production | — | 1.00s |

### hardware-targets

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | WASM ▶ production | 37.62M/s | 1.00s | 1.02s | 88.2MB | ~0 | — | 41.2× |
| 🥈 | 🟢 | Rust AVX2 | 1.18M/s | 847.1ms | — | — | ~0 (native) | — | 1.29× |
| 🥉 | 🟢 | Rust (generic) | 1.18M/s | 847.6ms | — | — | ~0 (native) | — | 1.29× |
| 4 | 🟢 | Node.js | 913.0K/s | 1.10s | 1.09s | 49.5MB | ~0 | — | 1.00× |
| 5 | 🔴 | Galerina passive ⟨interp⟩ | 80.4K/s | 12.4ms | 0.0ms | 86.1MB | 54 B/op | — | 0.09× |
| 6 | ⚫ | Galerina manifest ⟨interp⟩ | 3.4K/s | 0.3ms | 0.0ms | 86.2MB | 79.9 KB/op | — | 0.00× |
| 7 | ⚫ | Galerina governed ⟨interp⟩ | 3.4K/s | 0.3ms | 0.0ms | 85.8MB | 76.0 KB/op | — | 0.00× |

> 🧠 **Lowest heap/op:** WASM ▶ production (~0) · **highest:** Galerina manifest ⟨interp⟩ (79.9 KB/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### low-memory

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Rust AVX2 | 5.86B/s | 170.6ms | — | — | ~0 | 2.1K× | 8.14× |
| 🥈 | 🟢 | Rust (generic) | 1.35B/s | 739.6ms | — | — | ~0 | 475.7× | 1.88× |
| 🥉 | 🟢 | Node.js | 720.11M/s | 69.4ms | 62.0ms | 48.0MB | ~0 | 253.3× | 1.00× |
| 4 | ⚪ | WASM ▶ production | 466.25M/s | 1.01s | 1.00s | 88.6MB | ~0 | 164.0× | 0.65× |
| 5 | ⚫ | Python | 2.84M/s | 3.52s | 3.52s | — | ~0 | 1.00× | 0.00× |
| 6 | ⚫ | Galerina governed ⟨interp⟩ | 161.6K/s | 61.9ms | 62.0ms | 86.2MB | 44 B/op | 0.06× | 0.00× |
| 7 | ⚫ | Galerina passive ⟨interp⟩ | 158.3K/s | 0.7ms | 0.0ms | 87.8MB | -3.4 KB/op | 0.06× | 0.00× |
| 8 | ⚫ | Galerina manifest ⟨interp⟩ | 112.9K/s | 88.5ms | 78.0ms | 86.7MB | 62 B/op | 0.04× | 0.00× |

> 🧠 **Lowest heap/op:** Galerina passive ⟨interp⟩ (-3.4 KB/op) · **highest:** Galerina manifest ⟨interp⟩ (62 B/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### gpu-compute

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Rust AVX2 | 1.19B/s | 4.21s | — | — | ~0 (native) | 186.2× | 1.20× |
| 🥈 | 🟢 | Rust (generic) | 1.19B/s | 4.21s | — | — | ~0 (native) | 186.1× | 1.20× |
| 🥉 | 🟢 | Node.js | 990.12M/s | 505.0ms | 500.0ms | 47.7MB | ~0 | 155.3× | 1.00× |
| 4 | 🟡 | WASM ▶ production | 472.31M/s | 1.06s | 1.06s | 88.4MB | ~0 | 74.1× | 0.48× |
| 5 | ⚫ | Python | 6.38M/s | 7.84s | 7.83s | — | ~0 | 1.00× | 0.01× |
| 6 | ⚫ | Galerina passive ⟨interp⟩ | 381.0K/s | 0.2ms | 0.0ms | 86.3MB | 2.3 KB/op | 0.06× | 0.00× |
| 7 | ⚫ | Galerina governed ⟨interp⟩ | 347.6K/s | 287.6ms | 313.0ms | 86.9MB | 8 B/op | 0.05× | 0.00× |
| 8 | ⚫ | Galerina manifest ⟨interp⟩ | 343.5K/s | 291.1ms | 313.0ms | 86.1MB | 7 B/op | 0.05× | 0.00× |

> 🧠 **Lowest heap/op:** WASM ▶ production (~0) · **highest:** Galerina passive ⟨interp⟩ (2.3 KB/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### matrix-multiply

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Rust (generic) | 1.51B/s | 86.6ms | — | — | ~0 (native) | 231.1× | 2.44× |
| 🥈 | 🟢 | Rust AVX2 | 1.43B/s | 91.6ms | — | — | ~0 (native) | 218.4× | 2.31× |
| 🥉 | 🟢 | Node.js | 619.61M/s | 211.5ms | 234.0ms | 50.2MB | ~0 | 94.6× | 1.00× |
| 4 | ⚪ | WASM ▶ production | 441.90M/s | 1.04s | 1.05s | 89.4MB | ~0 | 67.5× | 0.71× |
| 5 | 🔴 | Python | 6.55M/s | 2.00s | — | — | 8 B/op | 1.00× | 0.01× |
| 6 | ⚫ | Galerina passive ⟨interp⟩ | 861.1K/s | 0.2ms | 0.0ms | 87.2MB | -4.4 KB/op | 0.13× | 0.00× |
| 7 | ⚫ | Galerina governed ⟨interp⟩ | 736.9K/s | 44.5ms | 78.0ms | 88.1MB | 29 B/op | 0.11× | 0.00× |
| 8 | ⚫ | Galerina manifest ⟨interp⟩ | 650.3K/s | 50.4ms | 94.0ms | 87.2MB | 31 B/op | 0.10× | 0.00× |

> 🧠 **Lowest heap/op:** Galerina passive ⟨interp⟩ (-4.4 KB/op) · **highest:** Galerina manifest ⟨interp⟩ (31 B/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### crypto-ops

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Galerina passive ⟨interp⟩ | 14.2K/s | 7.0ms | 0.0ms | 88.1MB | 1.5 KB/op | — | — |
| 🥈 | 🟡 | Galerina manifest ⟨interp⟩ | 1.8K/s | 0.6ms | 0.0ms | 87.3MB | 89.8 KB/op | — | — |
| 🥉 | 🔴 | Galerina governed ⟨interp⟩ | 161.0/s | 6.2ms | 15.0ms | 87.3MB | 215.0 KB/op | — | — |

> 🧠 **Lowest heap/op:** Galerina passive ⟨interp⟩ (1.5 KB/op) · **highest:** Galerina governed ⟨interp⟩ (215.0 KB/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### text-html

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Galerina passive ⟨interp⟩ | 60.6K/s | 1.6ms | 0.0ms | 88.8MB | -3.9 KB/op | — | — |
| 🥈 | 🔴 | Galerina manifest ⟨interp⟩ | 2.7K/s | 0.4ms | 0.0ms | 88.1MB | 145.2 KB/op | — | — |
| 🥉 | 🔴 | Galerina governed ⟨interp⟩ | 847.0/s | 1.2ms | 0.0ms | 88.1MB | 164.7 KB/op | — | — |

> 🧠 **Lowest heap/op:** Galerina passive ⟨interp⟩ (-3.9 KB/op) · **highest:** Galerina governed ⟨interp⟩ (164.7 KB/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### tri-logic

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Rust (generic) | 1.39B/s | 431.4ms | — | — | ~0 (native) | 189.9× | 1.40× |
| 🥈 | 🟢 | Rust AVX2 | 1.39B/s | 432.1ms | — | — | ~0 (native) | 189.5× | 1.40× |
| 🥉 | 🟢 | Node.js | 994.41M/s | 301.7ms | — | — | ~0 | 135.7× | 1.00× |
| 4 | 🟡 | WASM ▶ production | 470.58M/s | 1.28s | 1.27s | 91.0MB | ~0 | 64.2× | 0.47× |
| 5 | ⚫ | Python | 7.33M/s | 1.64s | — | — | — | 1.00× | 0.01× |
| 6 | ⚫ | Galerina passive ⟨interp⟩ | 354.0K/s | 1.9ms | 0.0ms | 88.5MB | 346 B/op | 0.05× | 0.00× |
| 7 | ⚫ | Galerina governed ⟨interp⟩ | 342.6K/s | 875.6ms | 891.0ms | 88.6MB | 2 B/op | 0.05× | 0.00× |
| 8 | ⚫ | Galerina manifest ⟨interp⟩ | 336.3K/s | 892.1ms | 938.0ms | 88.5MB | 4 B/op | 0.05× | 0.00× |

> 🧠 **Lowest heap/op:** WASM ▶ production (~0) · **highest:** Galerina passive ⟨interp⟩ (346 B/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### data-query

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Node.js | 393.27M/s | 127.1ms | — | — | ~0 | 124.7× | 1.00× |
| 🥈 | ⚫ | Python | 3.15M/s | 951.3ms | — | — | — | 1.00× | 0.01× |
| 🥉 | ⚫ | Galerina passive ⟨interp⟩ | 264.2K/s | 0.8ms | 0.0ms | 89.6MB | -4.5 KB/op | 0.08× | 0.00× |
| 4 | ⚫ | Galerina manifest ⟨interp⟩ | 229.1K/s | 43.6ms | 63.0ms | 89.5MB | 68 B/op | 0.07× | 0.00× |
| 5 | ⚫ | Galerina governed ⟨interp⟩ | 213.7K/s | 46.8ms | 62.0ms | 87.7MB | 117 B/op | 0.07× | 0.00× |

> 🧠 **Lowest heap/op:** Galerina passive ⟨interp⟩ (-4.5 KB/op) · **highest:** Galerina governed ⟨interp⟩ (117 B/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### call-chain

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Node.js | 279.88M/s | 7.1ms | 16.0ms | 48.9MB | ~0 | 212.3× | 1.00× |
| 🥈 | 🟡 | WASM ▶ production | 54.73M/s | 1.83s | 1.83s | 90.3MB | ~0 | 41.5× | 0.20× |
| 🥉 | ⚫ | Python | 1.32M/s | 758.4ms | 750.0ms | — | ~0 | 1.00× | 0.00× |
| 4 | ⚫ | Galerina governed ⟨interp⟩ | 56.9K/s | 878.4ms | 907.0ms | 87.8MB | 25 B/op | 0.04× | 0.00× |
| 5 | ⚫ | Galerina manifest ⟨interp⟩ | 55.7K/s | 897.5ms | 922.0ms | 87.2MB | 41 B/op | 0.04× | 0.00× |
| 6 | ⚫ | Galerina passive ⟨interp⟩ | 54.5K/s | 0.1ms | 0.0ms | 87.2MB | 19.7 KB/op | 0.04× | 0.00× |

> 🧠 **Lowest heap/op:** WASM ▶ production (~0) · **highest:** Galerina passive ⟨interp⟩ (19.7 KB/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### nbody

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Node.js | 123.59M/s | 53.0ms | 62.0ms | 49.8MB | ~0 | 116.7× | 1.00× |
| 🥈 | 🟡 | WASM ▶ production | 29.08M/s | 1.13s | 1.14s | 89.7MB | ~0 | 27.5× | 0.24× |
| 🥉 | ⚫ | Python | 1.06M/s | 1.55s | — | — | 12 B/op | 1.00× | 0.01× |
| 4 | ⚫ | Galerina passive ⟨interp⟩ | 72.4K/s | 0.3ms | 0.0ms | 89.0MB | -85.6 KB/op | 0.07× | 0.00× |
| 5 | ⚫ | Galerina manifest ⟨interp⟩ | 66.8K/s | 490.9ms | 515.0ms | 89.0MB | 8 B/op | 0.06× | 0.00× |
| 6 | ⚫ | Galerina governed ⟨interp⟩ | 64.5K/s | 508.2ms | 531.0ms | 87.4MB | 34 B/op | 0.06× | 0.00× |

> 🧠 **Lowest heap/op:** Galerina passive ⟨interp⟩ (-85.6 KB/op) · **highest:** Galerina governed ⟨interp⟩ (34 B/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### json-parse

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Node.js | 3.09M/s | — | — | — | — | 6.63× | 1.00× |
| 🥈 | 🟡 | Python | 467.0K/s | — | — | — | 1 B/op | 1.00× | 0.15× |
| 🥉 | ⚫ | Galerina passive ⟨interp⟩ | 9.9K/s | 0.5ms | 0.0ms | 94.2MB | 88.6 KB/op | 0.02× | 0.00× |
| 4 | ⚫ | Galerina governed ⟨interp⟩ | 5.3K/s | 95.2ms | 125.0ms | 96.3MB | 2.0 KB/op | 0.01× | 0.00× |
| 5 | ⚫ | Galerina manifest ⟨interp⟩ | 5.1K/s | 98.0ms | 109.0ms | 90.0MB | 5.3 KB/op | 0.01× | 0.00× |

> 🧠 **Lowest heap/op:** Python (1 B/op) · **highest:** Galerina passive ⟨interp⟩ (88.6 KB/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### mandelbrot

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Rust (generic) | 23.43M/s | 139.8ms | — | — | ~0 (native) | 165.0× | 3.42× |
| 🥈 | 🟢 | Rust AVX2 | 23.11M/s | 141.8ms | — | — | ~0 (native) | 162.7× | 3.38× |
| 🥉 | 🟢 | WASM ▶ production | 9.09M/s | 1.80s | 1.80s | 91.5MB | ~0 | 64.0× | 1.33× |
| 4 | 🟢 | Node.js | 6.84M/s | 478.7ms | 484.0ms | 49.8MB | ~0 | 48.2× | 1.00× |
| 5 | 🔴 | Python | 142.0K/s | 23.08s | — | — | ~0 | 1.00× | 0.02× |
| 6 | ⚫ | Galerina manifest ⟨interp⟩ | 8.4K/s | 1.96s | 1.99s | 91.6MB | 9 B/op | 0.06× | 0.00× |
| 7 | ⚫ | Galerina governed ⟨interp⟩ | 7.8K/s | 2.09s | 2.13s | 89.3MB | 135 B/op | 0.06× | 0.00× |
| 8 | ⚫ | Galerina passive ⟨interp⟩ | 7.7K/s | 0.1ms | 0.0ms | 91.6MB | 212.4 KB/op | 0.05× | 0.00× |

> 🧠 **Lowest heap/op:** WASM ▶ production (~0) · **highest:** Galerina passive ⟨interp⟩ (212.4 KB/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### spectral-norm

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Rust (generic) | 371.43M/s | 26.9ms | — | — | ~0 (native) | 237.1× | 1.55× |
| 🥈 | 🟢 | Rust AVX2 | 366.35M/s | 27.3ms | — | — | ~0 (native) | 233.8× | 1.52× |
| 🥉 | 🟢 | Node.js | 240.30M/s | 41.6ms | 47.0ms | 49.8MB | ~0 | 153.4× | 1.00× |
| 4 | ⚫ | Python | 1.57M/s | 6.38s | — | — | ~0 | 1.00× | 0.01× |

> 🧠 **Lowest heap/op:** Python (~0) · **highest:** Node.js (~0). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### binary-trees

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | WASM ▶ production | 589.25M/s | 1.15s | 1.16s | 92.2MB | ~0 | 205.2× | 7.47× |
| 🥈 | 🟢 | Node.js | 78.84M/s | 1.7ms | 16.0ms | 49.8MB | 3 B/op | 27.5× | 1.00× |
| 🥉 | 🟡 | Rust (generic) | 20.15M/s | 6.7ms | — | — | ~0 (native) | 7.02× | 0.26× |
| 4 | 🟡 | Rust AVX2 | 15.76M/s | 8.6ms | — | — | ~0 (native) | 5.49× | 0.20× |
| 5 | 🔴 | Python | 2.87M/s | 47.3ms | 46.9ms | — | ~0 | 1.00× | 0.04× |
| 6 | ⚫ | Galerina passive ⟨interp⟩ | 391.3K/s | 0.1ms | 0.0ms | 90.8MB | 1.9 KB/op | 0.14× | 0.00× |
| 7 | ⚫ | Galerina governed ⟨interp⟩ | 357.0K/s | 380.6ms | 375.0ms | 90.8MB | 15 B/op | 0.12× | 0.00× |
| 8 | ⚫ | Galerina manifest ⟨interp⟩ | 356.6K/s | 381.0ms | 437.0ms | 90.8MB | 12 B/op | 0.12× | 0.00× |

> 🧠 **Lowest heap/op:** Python (~0) · **highest:** Galerina passive ⟨interp⟩ (1.9 KB/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

### spore-container

| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |
|---|---|---|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Rust (generic) | 172.6K/s | 1.74s | — | — | ~0 (native) | 2.32× | 3.97× |
| 🥈 | 🟢 | Rust AVX2 | 160.5K/s | 1.87s | — | — | ~0 (native) | 2.15× | 3.69× |
| 🥉 | 🟢 | Python | 74.5K/s | 1.34s | — | — | ~0 | 1.00× | 1.71× |
| 4 | 🟢 | Node.js | 43.5K/s | 6.90s | 8.64s | 65.8MB | 5 B/op | 0.58× | 1.00× |

> 🧠 **Lowest heap/op:** Python (~0) · **highest:** Node.js (5 B/op). Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.

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
**Compute toolchain:** NVIDIA GeForce RTX 2060 present, but NO compute toolchain installed (CUDA/torch-cuda/Deno all absent). GPU cells = 'toolchain required'.
**Deno WebGPU:** ⏳ not installed
**Galerina GPU backend:** `not-implemented` — gpu-plan.ts emits a WGSL skeleton only; no dispatch path (pending Phase 38).

| # | 🚦 | Runtime | Device (🖥️ CPU / 🎮 GPU) | Throughput (kernel ops/s) | Wall | vs Node |
|---|---|---|---|---|---|---|
| 🥇 | 🟢 | Rust AVX2 | 🖥️ CPU (cpu (serial)) | 1.19B/s | 4.21s | 1.20× |
| 🥈 | 🟢 | Rust (generic) | 🖥️ CPU (cpu (serial)) | 1.19B/s | 4.21s | 1.20× |
| 🥉 | 🟢 | Node.js | 🖥️ CPU (cpu (serial)) | 990.12M/s | 505.0ms | 1.00× |
| 4 | 🟡 | WASM ▶ production | 🖥️ CPU (cpu (wasm)) | 472.31M/s | 1.06s | 0.48× |
| 5 | ⚫ | Python | 🖥️ CPU (cpu (serial)) | 6.38M/s | 7.84s | 0.01× |
| 6 | ⚫ | Galerina passive ⟨interp⟩ | 🖥️ CPU (cpu) | 381.0K/s | 0.2ms | 0.00× |
| 7 | ⚫ | Galerina governed ⟨interp⟩ | 🖥️ CPU (cpu) | 347.6K/s | 287.6ms | 0.00× |
| 8 | ⚫ | Galerina manifest ⟨interp⟩ | 🖥️ CPU (cpu) | 343.5K/s | 291.1ms | 0.00× |

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
| **compute-mix** | Node.js | **🏆 winner** | **🏆 winner** | **🏆 winner** | **🏆 winner** | **178× slower** | **62× slower** | **76× slower** | **81× slower** | 2× slower |
| **arithmetic-threshold** | C++ | 1.2× slower | 1.2× slower | **🏆 winner** | 2× slower | **499× slower** | **68.6K× slower** | **351× slower** | **355× slower** | 4× slower |
| **six-digit-guess** | Rust (generic) | 2× slower | **🏆 winner** | 1.1× slower | **27× slower** | **768× slower** | **5.1K× slower** | **1.5K× slower** | **1.6K× slower** | 2× slower |
| **record-allocation** | Rust AVX2 | **🏆 winner** | **🏆 winner** | not run — no C++ impl | **19× slower** | **273× slower** | **138× slower** | **560× slower** | **471× slower** | 2× slower |
| **fibonacci-recursive** | Galerina passive ⟨interp⟩ | **101× slower** | **102× slower** | not run — no C++ impl | **397× slower** | **10.0K× slower** | **🏆 winner** | **3.0K× slower** | **3.9K× slower** | 3× slower |
| **tower-of-hanoi** | Rust AVX2 | **🏆 winner** | **🏆 winner** | not run — no C++ impl | 2× slower | **107× slower** | **2.5K× slower** | **2.6K× slower** | **2.4K× slower** | 2× slower |
| **collection-pipeline** | Rust AVX2 | **🏆 winner** | 3× slower | not run — no C++ impl | **187× slower** | **989× slower** | **1.7K× slower** | **5.7K× slower** | **6.5K× slower** | **31× slower** |
| **hardware-targets** | WASM ▶ production | **32× slower** | **32× slower** | not run — no C++ impl | **41× slower** | not run | **468× slower** | **10.9K× slower** | **10.9K× slower** | **🏆 winner** |
| **low-memory** | Rust AVX2 | **🏆 winner** | 4× slower | not run — no C++ impl | 8× slower | **2.1K× slower** | **37.0K× slower** | **51.9K× slower** | **36.3K× slower** | **13× slower** |
| **gpu-compute** | Rust AVX2 | **🏆 winner** | **🏆 winner** | not run — no C++ impl | 1.2× slower | **186× slower** | **3.1K× slower** | **3.5K× slower** | **3.4K× slower** | 3× slower |
| **matrix-multiply** | Rust (generic) | 1.1× slower | **🏆 winner** | not run — no C++ impl | 2× slower | **231× slower** | **1.8K× slower** | **2.3K× slower** | **2.1K× slower** | 3× slower |
| **crypto-ops** | Galerina passive ⟨interp⟩ | no comparable metric | no comparable metric | not run — no C++ impl | no comparable metric | no comparable metric | **🏆 winner** | 8× slower | **88× slower** | no WASM — strings/records |
| **text-html** | Galerina passive ⟨interp⟩ | no comparable metric | no comparable metric | not run — no C++ impl | no comparable metric | no comparable metric | **🏆 winner** | **22× slower** | **72× slower** | no WASM — strings/records |
| **tri-logic** | Rust (generic) | **🏆 winner** | **🏆 winner** | not run — no C++ impl | 1.4× slower | **190× slower** | **3.9K× slower** | **4.1K× slower** | **4.1K× slower** | 3× slower |
| **data-query** | Node.js | not run — no native impl | not run — no native impl | not run — no C++ impl | **🏆 winner** | **125× slower** | **1.5K× slower** | **1.7K× slower** | **1.8K× slower** | no WASM build |
| **call-chain** | Node.js | not run — no native impl | not run — no native impl | not run — no C++ impl | **🏆 winner** | **212× slower** | **5.1K× slower** | **5.0K× slower** | **4.9K× slower** | 5× slower |
| **nbody** | Node.js | not run — no native impl | not run — no native impl | not run — no C++ impl | **🏆 winner** | **117× slower** | **1.7K× slower** | **1.9K× slower** | **1.9K× slower** | 4× slower |
| **json-parse** | Node.js | not run — no native impl | not run — no native impl | not run — no C++ impl | **🏆 winner** | 7× slower | **312× slower** | **607× slower** | **589× slower** | no WASM — strings/records |
| **mandelbrot** | Rust (generic) | **🏆 winner** | **🏆 winner** | not run — no C++ impl | 3× slower | **165× slower** | **3.0K× slower** | **2.8K× slower** | **3.0K× slower** | 3× slower |
| **spectral-norm** | Rust (generic) | **🏆 winner** | **🏆 winner** | not run — no C++ impl | 2× slower | **237× slower** | not run | not run | not run | no WASM build |
| **binary-trees** | WASM ▶ production | **37× slower** | **29× slower** | not run — no C++ impl | 7× slower | **205× slower** | **1.5K× slower** | **1.7K× slower** | **1.7K× slower** | **🏆 winner** |
| **spore-container** | Rust (generic) | 1.1× slower | **🏆 winner** | not run — no C++ impl | 4× slower | 2× slower | not run | not run | not run | no WASM — strings/records |
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
| 🥇 | Node.js | 135.58M/s | 🏆 winner | 178× faster |
| 🥈 | C++ | 133.06M/s | 1.0× slower | 175× faster |
| 🥉 | Rust (generic) | 132.41M/s | 1.0× slower | 174× faster |
| 4 | Rust AVX2 | 130.12M/s | 1.0× slower | 171× faster |
| 5 | WASM ▶ production | 77.62M/s | 1.7× slower | 102× faster |
| 6 | Galerina passive ⟨interp⟩ ⚠️cache | 2.19M/s | 62× slower | 2.9× faster |
| 7 | Galerina manifest ⟨interp⟩ | 1.79M/s | 76× slower | 2.3× faster |
| 8 | Galerina governed ⟨interp⟩ | 1.67M/s | 81× slower | 2.2× faster |
| 9 | Python | 761.7K/s | 178× slower | — (slowest) |

### arithmetic-threshold
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | C++ | 1.88B/s | 🏆 winner | 68.6K× faster |
| 🥈 | Rust (generic) | 1.57B/s | 1.2× slower | 57.2K× faster |
| 🥉 | Rust AVX2 | 1.56B/s | 1.2× slower | 57.1K× faster |
| 4 | Node.js | 971.84M/s | 1.9× slower | 35.5K× faster |
| 5 | WASM ▶ production | 495.03M/s | 3.8× slower | 18.1K× faster |
| 6 | Galerina manifest ⟨interp⟩ | 5.35M/s | 351× slower | 195× faster |
| 7 | Galerina governed ⟨interp⟩ | 5.29M/s | 355× slower | 193× faster |
| 8 | Python | 3.76M/s | 499× slower | 137× faster |
| 9 | Galerina passive ⟨interp⟩ ⚠️cache | 27.4K/s | 68.6K× slower | — (slowest) |

### six-digit-guess
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | Rust (generic) | 78.02M/s | 🏆 winner | 5.1K× faster |
| 🥈 | C++ | 68.12M/s | 1.1× slower | 4.4K× faster |
| 🥉 | Rust AVX2 | 50.85M/s | 1.5× slower | 3.3K× faster |
| 4 | WASM ▶ production | 36.60M/s | 2.1× slower | 2.4K× faster |
| 5 | Node.js | 2.94M/s | 27× slower | 191× faster |
| 6 | Python | 101.6K/s | 768× slower | 6.6× faster |
| 7 | Galerina manifest ⟨interp⟩ | 51.5K/s | 1.5K× slower | 3.3× faster |
| 8 | Galerina governed ⟨interp⟩ | 48.6K/s | 1.6K× slower | 3.2× faster |
| 9 | Galerina passive ⟨interp⟩ ⚠️cache | 15.4K/s | 5.1K× slower | — (slowest) |

### record-allocation
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | Rust AVX2 | 1.18B/s | 🏆 winner | 560× faster |
| 🥈 | Rust (generic) | 1.17B/s | 1.0× slower | 559× faster |
| 🥉 | WASM ▶ production | 555.05M/s | 2.1× slower | 264× faster |
| 4 | Node.js | 61.02M/s | 19× slower | 29× faster |
| 5 | Galerina passive ⟨interp⟩ ⚠️cache | 8.53M/s | 138× slower | 4.1× faster |
| 6 | Python | 4.30M/s | 273× slower | 2.0× faster |
| 7 | Galerina governed ⟨interp⟩ | 2.50M/s | 471× slower | 1.2× faster |
| 8 | Galerina manifest ⟨interp⟩ | 2.10M/s | 560× slower | — (slowest) |

### fibonacci-recursive
> 🏆 cache-hit "winner" is Galerina passive (memoised); **real compute winner: WASM ▶ production at 17.3K/s**.
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | Galerina passive ⟨interp⟩ ⚠️cache | 50.8K/s | 🏆 winner | 10.0K× faster |
| 🥈 | WASM ▶ production | 17.3K/s | 2.9× slower | 3.4K× faster |
| 🥉 | Rust AVX2 | 502.1/s | 101× slower | 99× faster |
| 4 | Rust (generic) | 499.6/s | 102× slower | 99× faster |
| 5 | Node.js | 128.0/s | 397× slower | 25× faster |
| 6 | Galerina manifest ⟨interp⟩ | 17.0/s | 3.0K× slower | 3.4× faster |
| 7 | Galerina governed ⟨interp⟩ | 13.0/s | 3.9K× slower | 2.6× faster |
| 8 | Python | 5.1/s | 10.0K× slower | — (slowest) |

### tower-of-hanoi
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | Rust AVX2 | 253.28M/s | 🏆 winner | 2.6K× faster |
| 🥈 | Rust (generic) | 252.40M/s | 1.0× slower | 2.6K× faster |
| 🥉 | Node.js | 129.63M/s | 2.0× slower | 1.3K× faster |
| 4 | WASM ▶ production | 122.33M/s | 2.1× slower | 1.2K× faster |
| 5 | Python | 2.37M/s | 107× slower | 24× faster |
| 6 | Galerina governed ⟨interp⟩ | 103.4K/s | 2.4K× slower | 1.1× faster |
| 7 | Galerina passive ⟨interp⟩ ⚠️cache | 102.9K/s | 2.5K× slower | 1.0× faster |
| 8 | Galerina manifest ⟨interp⟩ | 98.3K/s | 2.6K× slower | — (slowest) |

### collection-pipeline
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | Rust AVX2 | 13.23B/s | 🏆 winner | 6.5K× faster |
| 🥈 | Rust (generic) | 4.33B/s | 3.1× slower | 2.1K× faster |
| 🥉 | WASM ▶ production | 421.46M/s | 31× slower | 207× faster |
| 4 | Node.js | 70.58M/s | 187× slower | 35× faster |
| 5 | Python | 13.38M/s | 989× slower | 6.6× faster |
| 6 | Galerina passive ⟨interp⟩ ⚠️cache | 7.86M/s | 1.7K× slower | 3.9× faster |
| 7 | Galerina manifest ⟨interp⟩ | 2.32M/s | 5.7K× slower | 1.1× faster |
| 8 | Galerina governed ⟨interp⟩ | 2.04M/s | 6.5K× slower | — (slowest) |

### hardware-targets
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | WASM ▶ production | 37.62M/s | 🏆 winner | 10.9K× faster |
| 🥈 | Rust AVX2 | 1.18M/s | 32× slower | 342× faster |
| 🥉 | Rust (generic) | 1.18M/s | 32× slower | 342× faster |
| 4 | Node.js | 913.0K/s | 41× slower | 265× faster |
| 5 | Galerina passive ⟨interp⟩ ⚠️cache | 80.4K/s | 468× slower | 23× faster |
| 6 | Galerina manifest ⟨interp⟩ | 3.4K/s | 10.9K× slower | 1.0× faster |
| 7 | Galerina governed ⟨interp⟩ | 3.4K/s | 10.9K× slower | — (slowest) |

### low-memory
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | Rust AVX2 | 5.86B/s | 🏆 winner | 51.9K× faster |
| 🥈 | Rust (generic) | 1.35B/s | 4.3× slower | 12.0K× faster |
| 🥉 | Node.js | 720.11M/s | 8.1× slower | 6.4K× faster |
| 4 | WASM ▶ production | 466.25M/s | 13× slower | 4.1K× faster |
| 5 | Python | 2.84M/s | 2.1K× slower | 25× faster |
| 6 | Galerina governed ⟨interp⟩ | 161.6K/s | 36.3K× slower | 1.4× faster |
| 7 | Galerina passive ⟨interp⟩ ⚠️cache | 158.3K/s | 37.0K× slower | 1.4× faster |
| 8 | Galerina manifest ⟨interp⟩ | 112.9K/s | 51.9K× slower | — (slowest) |

### gpu-compute
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | Rust AVX2 | 1.19B/s | 🏆 winner | 3.5K× faster |
| 🥈 | Rust (generic) | 1.19B/s | 1.0× slower | 3.5K× faster |
| 🥉 | Node.js | 990.12M/s | 1.2× slower | 2.9K× faster |
| 4 | WASM ▶ production | 472.31M/s | 2.5× slower | 1.4K× faster |
| 5 | Python | 6.38M/s | 186× slower | 19× faster |
| 6 | Galerina passive ⟨interp⟩ ⚠️cache | 381.0K/s | 3.1K× slower | 1.1× faster |
| 7 | Galerina governed ⟨interp⟩ | 347.6K/s | 3.4K× slower | 1.0× faster |
| 8 | Galerina manifest ⟨interp⟩ | 343.5K/s | 3.5K× slower | — (slowest) |

### matrix-multiply
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | Rust (generic) | 1.51B/s | 🏆 winner | 2.3K× faster |
| 🥈 | Rust AVX2 | 1.43B/s | 1.1× slower | 2.2K× faster |
| 🥉 | Node.js | 619.61M/s | 2.4× slower | 953× faster |
| 4 | WASM ▶ production | 441.90M/s | 3.4× slower | 680× faster |
| 5 | Python | 6.55M/s | 231× slower | 10× faster |
| 6 | Galerina passive ⟨interp⟩ ⚠️cache | 861.1K/s | 1.8K× slower | 1.3× faster |
| 7 | Galerina governed ⟨interp⟩ | 736.9K/s | 2.1K× slower | 1.1× faster |
| 8 | Galerina manifest ⟨interp⟩ | 650.3K/s | 2.3K× slower | — (slowest) |

### crypto-ops
> 🏆 cache-hit "winner" is Galerina passive (memoised); **real compute winner: Galerina manifest ⟨interp⟩ at 1.8K/s**.
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | Galerina passive ⟨interp⟩ ⚠️cache | 14.2K/s | 🏆 winner | 88× faster |
| 🥈 | Galerina manifest ⟨interp⟩ | 1.8K/s | 8.1× slower | 11× faster |
| 🥉 | Galerina governed ⟨interp⟩ | 161.0/s | 88× slower | — (slowest) |

### text-html
> 🏆 cache-hit "winner" is Galerina passive (memoised); **real compute winner: Galerina manifest ⟨interp⟩ at 2.7K/s**.
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | Galerina passive ⟨interp⟩ ⚠️cache | 60.6K/s | 🏆 winner | 72× faster |
| 🥈 | Galerina manifest ⟨interp⟩ | 2.7K/s | 22× slower | 3.2× faster |
| 🥉 | Galerina governed ⟨interp⟩ | 847.0/s | 72× slower | — (slowest) |

### tri-logic
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | Rust (generic) | 1.39B/s | 🏆 winner | 4.1K× faster |
| 🥈 | Rust AVX2 | 1.39B/s | 1.0× slower | 4.1K× faster |
| 🥉 | Node.js | 994.41M/s | 1.4× slower | 3.0K× faster |
| 4 | WASM ▶ production | 470.58M/s | 3.0× slower | 1.4K× faster |
| 5 | Python | 7.33M/s | 190× slower | 22× faster |
| 6 | Galerina passive ⟨interp⟩ ⚠️cache | 354.0K/s | 3.9K× slower | 1.1× faster |
| 7 | Galerina governed ⟨interp⟩ | 342.6K/s | 4.1K× slower | 1.0× faster |
| 8 | Galerina manifest ⟨interp⟩ | 336.3K/s | 4.1K× slower | — (slowest) |

### data-query
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | Node.js | 393.27M/s | 🏆 winner | 1.8K× faster |
| 🥈 | Python | 3.15M/s | 125× slower | 15× faster |
| 🥉 | Galerina passive ⟨interp⟩ ⚠️cache | 264.2K/s | 1.5K× slower | 1.2× faster |
| 4 | Galerina manifest ⟨interp⟩ | 229.1K/s | 1.7K× slower | 1.1× faster |
| 5 | Galerina governed ⟨interp⟩ | 213.7K/s | 1.8K× slower | — (slowest) |

### call-chain
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | Node.js | 279.88M/s | 🏆 winner | 5.1K× faster |
| 🥈 | WASM ▶ production | 54.73M/s | 5.1× slower | 1.0K× faster |
| 🥉 | Python | 1.32M/s | 212× slower | 24× faster |
| 4 | Galerina governed ⟨interp⟩ | 56.9K/s | 4.9K× slower | 1.0× faster |
| 5 | Galerina manifest ⟨interp⟩ | 55.7K/s | 5.0K× slower | 1.0× faster |
| 6 | Galerina passive ⟨interp⟩ ⚠️cache | 54.5K/s | 5.1K× slower | — (slowest) |

### nbody
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | Node.js | 123.59M/s | 🏆 winner | 1.9K× faster |
| 🥈 | WASM ▶ production | 29.08M/s | 4.3× slower | 451× faster |
| 🥉 | Python | 1.06M/s | 117× slower | 16× faster |
| 4 | Galerina passive ⟨interp⟩ ⚠️cache | 72.4K/s | 1.7K× slower | 1.1× faster |
| 5 | Galerina manifest ⟨interp⟩ | 66.8K/s | 1.9K× slower | 1.0× faster |
| 6 | Galerina governed ⟨interp⟩ | 64.5K/s | 1.9K× slower | — (slowest) |

### json-parse
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | Node.js | 3.09M/s | 🏆 winner | 607× faster |
| 🥈 | Python | 467.0K/s | 6.6× slower | 92× faster |
| 🥉 | Galerina passive ⟨interp⟩ ⚠️cache | 9.9K/s | 312× slower | 1.9× faster |
| 4 | Galerina governed ⟨interp⟩ | 5.3K/s | 589× slower | 1.0× faster |
| 5 | Galerina manifest ⟨interp⟩ | 5.1K/s | 607× slower | — (slowest) |

### mandelbrot
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | Rust (generic) | 23.43M/s | 🏆 winner | 3.0K× faster |
| 🥈 | Rust AVX2 | 23.11M/s | 1.0× slower | 3.0K× faster |
| 🥉 | WASM ▶ production | 9.09M/s | 2.6× slower | 1.2K× faster |
| 4 | Node.js | 6.84M/s | 3.4× slower | 889× faster |
| 5 | Python | 142.0K/s | 165× slower | 18× faster |
| 6 | Galerina manifest ⟨interp⟩ | 8.4K/s | 2.8K× slower | 1.1× faster |
| 7 | Galerina governed ⟨interp⟩ | 7.8K/s | 3.0K× slower | 1.0× faster |
| 8 | Galerina passive ⟨interp⟩ ⚠️cache | 7.7K/s | 3.0K× slower | — (slowest) |

### spectral-norm
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | Rust (generic) | 371.43M/s | 🏆 winner | 237× faster |
| 🥈 | Rust AVX2 | 366.35M/s | 1.0× slower | 234× faster |
| 🥉 | Node.js | 240.30M/s | 1.5× slower | 153× faster |
| 4 | Python | 1.57M/s | 237× slower | — (slowest) |

### binary-trees
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | WASM ▶ production | 589.25M/s | 🏆 winner | 1.7K× faster |
| 🥈 | Node.js | 78.84M/s | 7.5× slower | 221× faster |
| 🥉 | Rust (generic) | 20.15M/s | 29× slower | 56× faster |
| 4 | Rust AVX2 | 15.76M/s | 37× slower | 44× faster |
| 5 | Python | 2.87M/s | 205× slower | 8.1× faster |
| 6 | Galerina passive ⟨interp⟩ ⚠️cache | 391.3K/s | 1.5K× slower | 1.1× faster |
| 7 | Galerina governed ⟨interp⟩ | 357.0K/s | 1.7K× slower | 1.0× faster |
| 8 | Galerina manifest ⟨interp⟩ | 356.6K/s | 1.7K× slower | — (slowest) |

### spore-container
| # | Runtime | Throughput | ×vs winner | ×vs slowest |
|---|---|---|---|---|
| 🥇 | Rust (generic) | 172.6K/s | 🏆 winner | 4.0× faster |
| 🥈 | Rust AVX2 | 160.5K/s | 1.1× slower | 3.7× faster |
| 🥉 | Python | 74.5K/s | 2.3× slower | 1.7× faster |
| 4 | Node.js | 43.5K/s | 4.0× slower | — (slowest) |

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

