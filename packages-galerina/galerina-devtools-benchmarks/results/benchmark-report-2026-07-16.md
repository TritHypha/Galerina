# Benchmark report — two views

Current run: results/latest.json. Baseline ("last time"): 2026-07-12_posthardening.

## 1. Difference from the last run

117 runtime·benchmark pairs · median |Δ| 4.8% · >10%: 20.

| Benchmark | Runtime | last | now | Δ% |
|---|---|--:|--:|--:|
| record-allocation | Python | 3.1M | 4.7M | +51.6% |
| binary-trees | Python | 5.4M | 2.9M | -47.1% |
| six-digit-guess | Rust | 62.3M | 78.0M | +25.3% |
| gpu-compute | Python | 9.4M | 7.5M | -20.7% |
| record-allocation | Rust AVX2 | 980.1M | 1.16B | +18.2% |
| crypto-ops | Galerina gov | 160 | 131 | -18.1% |
| spore-container | Rust AVX2 | 143.9K | 167.9K | +16.7% |
| governance-cost | Rust AVX2 | 752.0M | 875.6M | +16.4% |
| six-digit-guess | Rust AVX2 | 66.3M | 55.4M | -16.4% |
| governance-cost | Galerina gov | 830 | 697 | -16.0% |
| hardware-targets | WASM prod | 35.3M | 41.0M | +15.9% |
| matrix-multiply | Python | 11.9M | 10.1M | -15.7% |
| low-memory | Galerina gov | 167.0K | 141.4K | -15.3% |
| json-parse | Python | 714.0K | 610.0K | -14.6% |
| tower-of-hanoi | Python | 3.6M | 4.1M | +13.7% |
| mandelbrot | Node.js | 7.1M | 6.2M | -12.2% |
| compute-mix | WASM prod | 80.8M | 71.1M | -12.0% |
| spore-container | Python | 68.3K | 76.1K | +11.4% |
| mandelbrot | Python | 175.2K | 194.7K | +11.1% |
| call-chain | Python | 2.1M | 1.9M | -10.1% |

## 2. Cross-language (current run)

| Benchmark | unit | Rust AVX2 | Rust | C++ | Node.js | WASM prod | Galerina gov | Python |
|---|---|--:|--:|--:|--:|--:|--:|--:|
| compute-mix ✅ | mix-ops/s | 130.6M | 132.1M | 132.8M | 136.7M | 71.1M | 1.7M | 810.3K |
| arithmetic-threshold | per-call | 1.53B | 1.57B | 1.88B | 945.1M | 491.3M | 82 | 4.2M |
| six-digit-guess | per-call | 55.4M | 78.0M | 69.0M | 2.8M | 36.3M | 1 | 89.6K |
| record-allocation ✅ | records/s | 1.16B | 1.17B | — | 56.8M | 552.1M | 2.4M | 4.7M |
| fibonacci-recursive | per-call | 500 | 500 | — | 127 | 17.2K | 15 | 6 |
| tower-of-hanoi ✅ | moves/s | 252.8M | 252.3M | — | 129.8M | 121.4M | 103.9K | 4.1M |
| collection-pipeline ✅ | elements/s | 13.13B | 4.32B | — | 71.0M | 421.0M | 2.1M | 15.1M |
| governance-cost | per-call | 875.6M | 892.5M | — | 2.1M | 3.0M | 697 | 30.8K |
| hardware-targets | per-call | 1.2M | 1.2M | — | 908.3K | 41.0M | 4.1K | — |
| low-memory ✅ | items/s | 6.13B | 1.36B | — | 722.9M | 468.6M | 141.4K | 4.3M |
| gpu-compute ✅ | kernel-evals/s | 1.18B | 1.18B | — | 963.9M | 470.0M | 366.8K | 7.5M |
| matrix-multiply ✅ | mul-adds/s | 1.43B | 1.52B | — | 611.7M | 441.0M | 733.9K | 10.1M |
| crypto-ops | per-call | — | — | — | — | — | 131 | — |
| text-html | per-call | — | — | — | — | — | 699 | — |
| tri-logic ✅ | trit-ops/s | 1.39B | 1.39B | — | 992.2M | 468.9M | 345.5K | 10.3M |
| data-query ✅ | record-scans/s | — | — | — | 392.7M | — | 233.5K | 4.3M |
| call-chain ✅ | chains/s | — | — | — | 308.5M | 54.8M | 58.8K | 1.9M |
| nbody ✅ | force-evals/s | — | — | — | 124.0M | 28.8M | 66.9K | 1.5M |
| json-parse ✅ | records/s | — | — | — | 3.0M | — | 5.6K | 610.0K |
| mandelbrot ✅ | pixels/s | 22.9M | 23.4M | — | 6.2M | 9.1M | 8.0K | 194.7K |
| spectral-norm ✅ | A-evals/s | 365.7M | 372.6M | — | 240.6M | — | — | 2.5M |
| binary-trees ✅ | nodes/s | 18.0M | 20.3M | — | 77.9M | 587.4M | 366.0K | 2.9M |
| spore-container ✅ | containers/s | 167.9K | 149.9K | — | 44.5K | — | — | 76.1K |
| framework-pipeline ✅ | requests/s | — | — | — | — | — | — | 138.1K |
| http-throughput | per-call | — | — | — | — | — | — | — |
| naming-check | per-call | — | — | — | — | — | — | — |
| context-receipt | per-call | — | — | — | — | — | — | — |
| intelligence-search | per-call | — | — | — | — | — | — | — |
| provenance-trace | per-call | — | — | — | — | — | — | — |
