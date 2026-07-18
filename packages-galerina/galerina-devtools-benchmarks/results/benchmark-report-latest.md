# Benchmark report — two views

Current run: results/latest.json. Baseline ("last time"): 2026-07-12_posthardening.

## 1. Difference from the last run

117 runtime·benchmark pairs · median |Δ| 1.8% · >10%: 27.

| Benchmark | Runtime | last | now | Δ% |
|---|---|--:|--:|--:|
| binary-trees | Python | 5.4M | 2.9M | -46.3% |
| matrix-multiply | Python | 11.9M | 6.5M | -45.8% |
| low-memory | Python | 4.5M | 2.8M | -38.0% |
| gpu-compute | Python | 9.4M | 6.2M | -34.3% |
| nbody | Python | 1.6M | 1.0M | -34.1% |
| collection-pipeline | Python | 15.0M | 10.5M | -30.2% |
| call-chain | Python | 2.1M | 1.5M | -29.8% |
| json-parse | Python | 714.0K | 506.5K | -29.1% |
| six-digit-guess | Rust | 62.3M | 79.7M | +28.0% |
| tri-logic | Python | 11.2M | 8.2M | -27.4% |
| data-query | Python | 4.3M | 3.2M | -26.4% |
| governance-cost | Python | 28.2K | 20.7K | -26.4% |
| spore-container | Python | 68.3K | 85.7K | +25.5% |
| tower-of-hanoi | Python | 3.6M | 2.9M | -21.0% |
| spectral-norm | Python | 2.3M | 1.8M | -19.6% |
| data-query | Galerina gov | 253.8K | 206.5K | -18.6% |
| record-allocation | Python | 3.1M | 3.6M | +17.2% |
| mandelbrot | Python | 175.2K | 205.0K | +17.0% |
| six-digit-guess | Rust AVX2 | 66.3M | 75.8M | +14.4% |
| hardware-targets | WASM prod | 35.3M | 40.4M | +14.3% |

## 2. Cross-language (current run)

| Benchmark | unit | Rust AVX2 | Rust | C++ | Node.js | WASM prod | Galerina gov | Python |
|---|---|--:|--:|--:|--:|--:|--:|--:|
| compute-mix ✅ | mix-ops/s | 135.8M | 139.3M | 139.5M | 142.2M | 80.9M | 1.8M | 823.7K |
| arithmetic-threshold | per-call | 1.60B | 1.60B | 1.92B | 1.00B | 516.0M | 85 | 4.1M |
| six-digit-guess | per-call | 75.8M | 79.7M | 68.8M | 2.9M | 38.3M | 1 | 89.2K |
| record-allocation ✅ | records/s | 920.0M | 1.21B | — | 58.5M | 579.2M | 2.3M | 3.6M |
| fibonacci-recursive | per-call | 521 | 516 | — | 134 | 18.1K | 15 | 6 |
| tower-of-hanoi ✅ | moves/s | 260.0M | 263.9M | — | 132.9M | 128.2M | 105.2K | 2.9M |
| collection-pipeline ✅ | elements/s | 13.45B | 4.42B | — | 76.6M | 442.4M | 2.3M | 10.5M |
| governance-cost | gov-factor | 797.6M | 901.2M | — | 2.2M | 3.0M | 812 | 20.7K |
| hardware-targets | per-call | 1.2M | 1.2M | — | 953.1K | 40.4M | 4.1K | — |
| low-memory ✅ | items/s | 6.37B | 1.41B | — | 718.4M | 494.5M | 149.3K | 2.8M |
| gpu-compute ✅ | kernel-evals/s | 1.25B | 1.24B | — | 1.04B | 497.2M | 340.9K | 6.2M |
| matrix-multiply ✅ | mul-adds/s | 1.45B | 1.55B | — | 645.8M | 463.7M | 762.9K | 6.5M |
| crypto-ops | per-call | — | — | — | — | — | 142 | — |
| text-html | per-call | — | — | — | — | — | 801 | — |
| tri-logic ✅ | trit-ops/s | 1.45B | 1.45B | — | 1.04B | 492.3M | 327.2K | 8.2M |
| data-query ✅ | record-scans/s | — | — | — | 403.1M | — | 206.5K | 3.2M |
| call-chain ✅ | chains/s | — | — | — | 299.0M | 57.6M | 57.8K | 1.5M |
| nbody ✅ | force-evals/s | — | — | — | 124.6M | 30.6M | 63.8K | 1.0M |
| json-parse ✅ | records/s | — | — | — | 3.3M | — | 5.6K | 506.5K |
| mandelbrot ✅ | pixels/s | 24.1M | 24.1M | — | 7.1M | 9.4M | 8.0K | 205.0K |
| spectral-norm ✅ | A-evals/s | 354.2M | 390.9M | — | 244.7M | — | — | 1.8M |
| binary-trees ✅ | nodes/s | 19.7M | 20.9M | — | 81.7M | 612.7M | 348.2K | 2.9M |
| spore-container ✅ | containers/s | 138.0K | 133.3K | — | 46.3K | — | — | 85.7K |
| framework-pipeline ✅ | requests/s | — | — | — | — | — | — | 113.3K |
| http-throughput | per-call | — | — | — | — | — | — | — |
| naming-check | per-call | — | — | — | — | — | — | — |
| context-receipt | per-call | — | — | — | — | — | — | — |
| intelligence-search | per-call | — | — | — | — | — | — | — |
| provenance-trace | per-call | — | — | — | — | — | — | — |
