# Galerina Benchmark Snapshot — 2026-06-24 (v1.0.0-beta.2)

Full cross-language run (`packages-galerina/galerina-devtools-benchmarks`, `npm run run` → `compare` → `audit`).
Env: Windows, NVIDIA GeForce RTX 2060 (Deno WebGPU). **Truth audit: PASSED** (14 comparable benchmarks
unit-aligned; `tri-logic`/`data-query` correctly excluded as non-unit-aligned). Raw data: `results/latest.json`;
full 1,050-line report: `build/bench-full-2026-06-24.txt`.

## How to read the Galerina rows (critical)

Galerina reports 5 rows but only **`WASM ▶ production`** is the real shipping runtime. The three `⟨interp⟩`
rows are Stage-A **diagnostic tiers**, not the production path:
- `Galerina passive ⟨interp⟩` — pre-compiled + **LRU warm-cache** (memoized = reduced work; its "wins" are NOT real compute).
- `Galerina manifest ⟨interp⟩` — pre-verified manifest, governance erased at runtime (diagnostic).
- `Galerina governed ⟨interp⟩` — full per-call proof rebuild (the **diagnostic worst-case**, intentionally slowest).

Do **not** trust `normThroughput` for the `galerina*` rows (it over-counts reduced-work runtimes). Use native
`operationsPerSecond` + the `WASM ▶ production` row.

## Production-ceiling scoreboard (winner-ordered)

| Benchmark | 🏆 Winner (ceiling) | Speed | WASM▶prod | gov⟨interp⟩ |
|---|---|---|---|---|
| hardware-targets | **WASM ▶ production** | 47.80M/s | **won** | 9.1K× |
| fibonacci-recursive | **WASM ▶ production** | 17.2K/s | **won** | 1.0K× |
| matrix-multiply | Deno WebGPU (RTX 2060) | 1.79B/s | 3.8× slower | 2.2K× |
| call-chain | Node.js | 316.63M/s | — | — |
| compute-mix | Node.js | 135.07M/s | — | — |
| nbody | Node.js | 123.28M/s | — | 1.5K× |
| binary-trees | Node.js | 74.67M/s | — | 16× |
| json-parse | Node.js | 3.39M/s | — | 542× |
| arithmetic-threshold | Rust (generic) | 1.57B/s | — | — |
| gpu-compute | Rust (generic) | 1.18B/s | 2.3× slower | 2.9K× |
| record-allocation | Rust (generic) | 1.17B/s | 1.9× slower | 452× |
| spectral-norm | Rust (generic) | 371.12M/s | — | — |
| six-digit-guess | Rust (generic) | 78.02M/s | 2.0× slower | 1.4K× |
| mandelbrot | Rust (generic) | 23.40M/s | — | 2.5K× |
| tmf-container | Rust (generic) | 183.0K/s | — | — |
| collection-pipeline | Rust AVX2 | 13.26B/s | 60× slower | 5.1K× |
| low-memory | Rust AVX2 | 5.79B/s | 13× slower | 36.8K× |
| governance-cost | Rust AVX2 | 889.73M/s | 299× slower | 1040.6K× |

**Winner tally (production ceiling):** Rust generic ×7 · Node.js ×5 · Rust AVX2 ×3 · WASM▶production ×2 · Deno WebGPU ×1.

## Slowest per benchmark

- **Slowest production language = Python in 16/19** measurable benchmarks (the CPython "comparison floor"). Exceptions:
  `hardware-targets` (no Python ran → Node 911.3K/s) and `tmf-container` (Node 48.9K/s — that column **is**
  `@galerina/ext-tmf`).
- **Slowest overall = a Galerina `⟨interp⟩` diagnostic tier** in ~14/22 — by design (per-call proof rebuild), e.g.
  `governance-cost` governed 855/s, `crypto-ops` governed 368/s. Not the shipping path.

## Takeaways

1. **`WASM ▶ production` is native-competitive** — wins `hardware-targets` outright (47.8M/s), within 1.9–3.8× of
   native on record-allocation / matrix / six-digit / gpu-compute. Heavy governance kernels (governance-cost 299×,
   collection-pipeline 60×) are the honest cost of compiled-in governance.
2. **Governed `⟨interp⟩` is the diagnostic floor** — anti-inflation confirms it never beats Node (nbody 1549×,
   low-memory 4554×, mandelbrot 651×). Healthy: a governed interpreter SHOULD be slower than raw V8.
3. **No regression** vs the 2026-06-22 baseline — expected, since this cycle's changes (hybrid signing, tier-floor,
   semver) are compile-time / manifest-level, not runtime; committed WASM is byte-identical after recompiling.

## Open benchmark debt

- `crypto-ops` / `text-html` ran only Galerina tiers (<2 production runtimes) → scoreboard-excluded for insufficient comparison.
- `tri-logic` / `data-query` need a common bulk-N path across runtimes before their numbers compare (workload-equivalence, R&D 0039).
