# Benchmark report — two views

Current run: results/latest.json. Baseline ("last time"): 2026-07-12_posthardening.

## 1. Difference from the last run

117 runtime·benchmark pairs · median |Δ| 5.5% · >10%: 39.

| Benchmark | Runtime | last | now | Δ% |
|---|---|--:|--:|--:|
| record-allocation | Python | 3.1M | 5.6M | +80.5% |
| binary-trees | Python | 5.4M | 2.9M | -47.2% |
| matrix-multiply | Python | 11.9M | 7.2M | -40.0% |
| gpu-compute | Python | 9.4M | 5.9M | -37.4% |
| json-parse | Python | 714.0K | 467.0K | -34.6% |
| crypto-ops | Galerina gov | 160 | 213 | +33.1% |
| nbody | Python | 1.6M | 1.1M | -30.3% |
| collection-pipeline | Python | 15.0M | 10.5M | -30.2% |
| call-chain | Python | 2.1M | 1.5M | -28.7% |
| governance-cost | Python | 28.2K | 20.4K | -27.7% |
| spectral-norm | Python | 2.3M | 1.7M | -25.5% |
| six-digit-guess | Rust | 62.3M | 78.0M | +25.3% |
| hardware-targets | Galerina gov | 4.4K | 3.3K | -25.2% |
| text-html | Galerina gov | 733 | 914 | +24.7% |
| data-query | Python | 4.3M | 3.3M | -24.7% |
| low-memory | Python | 4.5M | 3.5M | -22.2% |
| governance-cost | Rust AVX2 | 752.0M | 906.2M | +20.5% |
| record-allocation | Rust AVX2 | 980.1M | 1.17B | +19.2% |
| nbody | Galerina gov | 72.1K | 60.3K | -16.4% |
| tower-of-hanoi | Galerina gov | 110.8K | 92.9K | -16.2% |

## 2. Cross-language (current run)

| Benchmark | unit | Rust AVX2 | Rust | C++ | Node.js | WASM prod | Galerina gov | Python |
|---|---|--:|--:|--:|--:|--:|--:|--:|
| compute-mix ✅ | mix-ops/s | 130.4M | 132.2M | 132.5M | 135.5M | 77.0M | 1.6M | 823.8K |
| arithmetic-threshold | per-call | 1.56B | 1.57B | 1.88B | 972.0M | 491.6M | 80 | 4.2M |
| six-digit-guess | per-call | 75.2M | 78.0M | 68.9M | 2.7M | 35.9M | 1 | 87.0K |
| record-allocation ✅ | records/s | 1.17B | 1.17B | — | 52.5M | 550.9M | 2.4M | 5.6M |
| fibonacci-recursive | per-call | 500 | 498 | — | 127 | 17.0K | 13 | 6 |
| tower-of-hanoi ✅ | moves/s | 251.4M | 252.6M | — | 129.8M | 121.9M | 92.9K | 4.0M |
| collection-pipeline ✅ | elements/s | 13.29B | 4.31B | — | 69.8M | 417.5M | 2.2M | 10.5M |
| governance-cost | gov-factor | 906.2M | 887.1M | — | 2.1M | 2.9M | 741 | 20.4K |
| hardware-targets | per-call | 1.2M | 1.2M | — | 908.3K | 39.4M | 3.3K | — |
| low-memory ✅ | items/s | 5.87B | 1.35B | — | 704.1M | 471.7M | 140.0K | 3.5M |
| gpu-compute ✅ | kernel-evals/s | 1.18B | 1.18B | — | 984.7M | 466.8M | 330.6K | 5.9M |
| matrix-multiply ✅ | mul-adds/s | 1.43B | 1.50B | — | 613.2M | 439.2M | 710.3K | 7.2M |
| crypto-ops | per-call | — | — | — | — | — | 213 | — |
| text-html | per-call | — | — | — | — | — | 914 | — |
| tri-logic ✅ | trit-ops/s | 1.38B | 1.35B | — | 993.1M | 464.2M | 327.2K | 13.0M |
| data-query ✅ | record-scans/s | — | — | — | 387.4M | — | 232.8K | 3.3M |
| call-chain ✅ | chains/s | — | — | — | 261.0M | 54.6M | 52.8K | 1.5M |
| nbody ✅ | force-evals/s | — | — | — | 124.0M | 29.1M | 60.3K | 1.1M |
| json-parse ✅ | records/s | — | — | — | 3.2M | — | 5.6K | 467.0K |
| mandelbrot ✅ | pixels/s | 23.4M | 23.5M | — | 6.2M | 9.0M | 7.2K | 153.8K |
| spectral-norm ✅ | A-evals/s | 371.9M | 377.2M | — | 241.1M | — | — | 1.7M |
| binary-trees ✅ | nodes/s | 20.1M | 20.4M | — | 70.5M | 583.7M | 359.1K | 2.9M |
| spore-container ✅ | containers/s | 132.2K | 133.0K | — | 41.8K | — | — | 62.8K |
| framework-pipeline ✅ | requests/s | — | — | — | — | — | — | 111.5K |
| http-throughput | per-call | — | — | — | — | — | — | — |
| naming-check | per-call | — | — | — | — | — | — | — |
| context-receipt | per-call | — | — | — | — | — | — | — |
| intelligence-search | per-call | — | — | — | — | — | — | — |
| provenance-trace | per-call | — | — | — | — | — | — | — |
