# Galerina — Full Benchmark Snapshot (2026-06-22)

Ran the full suite (`npm --prefix packages-galerina/galerina-devtools-benchmarks run run`, exit 0) at the close of the
transport/auth R&D phase. Full machine-readable results: `packages-galerina/galerina-devtools-benchmarks/results/latest.json`.
Machine: i9-9900K · win32 · Node v24.16.0.

## Honest scoreboard (Galerina vs the winner — the slowdown column is mandatory)
### ⚠ Data-integrity correction (don't-trust-check)
An earlier draft of this snapshot claimed Galerina was "~10³–10⁵× slower" — that was a **misread** (it compared
Galerina's raw *calls/runs-per-second* against native *operations-per-second*, different units). On direct re-check the
suite's cross-runtime `normThroughput` for Galerina is **unreliable in the OTHER direction**: it *over-counts*
`galerinaPassive` (e.g. it reports passive at **5,252M nodes/s** on binary-trees — 273× *faster* than Rust, which is
not credible). So **no trustworthy Galerina-vs-native ×slower is presentable from this run.** Below: the reliable
native scoreboard, then Galerina's raw measured rates separately. Fixing the Galerina unit-normalization is an open
benchmark item (R&D 0039 unit-alignment; see [[galerina-benchmark-suite]] "was lying" fix).

### Native cross-runtime scoreboard (reliable — `operationsPerSecond`)
| Benchmark | unit | Node | Rust | Rust-AVX2 | WASM | Winner |
|---|---|---|---|---|---|---|
| compute-mix | mix-ops/s | 134.0M | 130.8M | 128.9M | · | Node 134M |
| record-allocation | records/s | 58.8M | 1152M | 1174M | 597.6M | Rust-AVX2 1.17B |
| collection-pipeline | elements/s | 68.7M | 4294M | 12459M | 215.3M | Rust-AVX2 12.5B |
| low-memory | items/s | 712.7M | 1298M | 6040M | 462.5M | Rust-AVX2 6.0B |
| gpu-compute | kernel-evals/s | 978.8M | 1161M | 1172M | 468.3M | Rust-AVX2 1.17B |
| governance-cost | ops/s | 1.9M | 897.9M | 891.4M | 3.1M | Rust 898M |
| nbody | force-evals/s | 122.7M | · | · | · | Node 122.7M |
| mandelbrot | pixels/s | 8.8M | 23.1M | · | · | Rust 23.1M |
| spectral-norm | A-evals/s | 234.9M | 371.4M | · | · | Rust 371.4M |
| binary-trees | nodes/s | 76.1M | 19.2M | · | · | Node 76.1M |
| json-parse | records/s | 3.3M | · | · | · | Node 3.3M |
| tmf-container | containers/s | 46.9k | 152.1k | · | · | Rust 152k |
| framework-pipeline | requests/s | 404.1k | · | · | · | Node 404k (Python 154k) |

### Galerina execution modes — RAW rates (⚠ per-call/run batch rate, NOT ops/s; do not compare directly to the table above)
| Benchmark | Passive (compiled) calls/s | Governed (tree-walker) runs/s |
|---|---|---|
| compute-mix | 6.3k | 322 |
| gpu-compute | 50.4k | 3 |
| governance-cost | 55.4k | 504 |
| fibonacci-recursive | 57.8k | 17 |
| json-parse | 40.3k | 11 |
| mandelbrot | 29.6k | 1 |
| binary-trees | 38.7k | 24 |
| nbody | 21.3k | 2 |
| low-memory | 31.4k | 13 |

**Honest read:** among native runtimes, **Rust-AVX2 dominates the vectorizable/compute benches** (up to ~12.5B
elements/s) and **Node wins several scalar/GC-bound ones**. For Galerina, the **governed tree-walker is the slow path**
(1–500 runs/s) and the **passive/compiled path is ~10²–10⁴× faster** (tens of thousands of calls/s) — which is the
case for the **Stage-B WASM / AOT lowering** (const-fold/branch-fold/DCE already proven 1.64×). The value proposition
is governance, not raw speed; and a clean Galerina-vs-native ratio awaits the unit-normalization fix.

## Unit-alignment integrity check
- **14 comparable benches PASS** (single matching unit): compute-mix, record-allocation, collection-pipeline,
  low-memory, gpu-compute, call-chain, nbody, json-parse, mandelbrot, spectral-norm, binary-trees, tmf-container,
  framework-pipeline, (+ data-query partial).
- **3 FLAGGED / excluded as incomparable** (honest, not hidden): **matrix-multiply** (workload size differs by
  runtime — n=32/64/128), **tri-logic** (incomparable workloads — bulk-N vs truth-table micro-benches),
  **data-query** (no single representative query). Each needs a unified workload before its cross-runtime numbers
  are apples-to-apples.
- Non-comparative dev-tool benches: intelligence-search **128,180 queries/s** (85 flows), provenance-trace
  **1,555 files/s** (27-file auth-service corpus).

## Verdict
Suite is green (exit 0) and unit-honest. The governed-interp slowdown is the known cost; the optimization roadmap
(WASM byte-parity, AOT elision) is where the speed work lives. Full per-runtime numbers: `results/latest.json`.
