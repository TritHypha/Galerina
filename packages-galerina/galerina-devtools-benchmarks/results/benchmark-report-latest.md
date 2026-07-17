# Benchmark report — two views

Current run: results/latest.json. Baseline ("last time"): 2026-07-12_posthardening.

## 1. Difference from the last run

117 runtime·benchmark pairs · median |Δ| 5.0% · >10%: 30.

| Benchmark | Runtime | last | now | Δ% |
|---|---|--:|--:|--:|
| record-allocation | Python | 3.1M | 5.1M | +64.8% |
| matrix-multiply | Python | 11.9M | 6.8M | -42.9% |
| tri-logic | Python | 11.2M | 6.8M | -39.6% |
| tower-of-hanoi | Python | 3.6M | 5.0M | +38.7% |
| json-parse | Python | 714.0K | 458.0K | -35.9% |
| call-chain | Python | 2.1M | 1.4M | -34.5% |
| collection-pipeline | Python | 15.0M | 10.2M | -32.2% |
| low-memory | Python | 4.5M | 3.0M | -32.1% |
| nbody | Python | 1.6M | 1.1M | -28.3% |
| gpu-compute | Python | 9.4M | 6.7M | -28.3% |
| binary-trees | Rust | 21.3M | 15.6M | -26.8% |
| six-digit-guess | Rust | 62.3M | 78.1M | +25.4% |
| spectral-norm | Python | 2.3M | 1.7M | -25.3% |
| crypto-ops | Galerina gov | 160 | 123 | -23.1% |
| record-allocation | Galerina gov | 2.5M | 2.0M | -21.7% |
| collection-pipeline | Galerina gov | 2.1M | 1.7M | -20.3% |
| fibonacci-recursive | Galerina gov | 15 | 12 | -20.0% |
| data-query | Python | 4.3M | 3.5M | -19.4% |
| governance-cost | Rust AVX2 | 752.0M | 888.0M | +18.1% |
| nbody | Galerina gov | 72.1K | 61.2K | -15.1% |

## 2. Cross-language (current run)

| Benchmark | unit | Rust AVX2 | Rust | C++ | Node.js | WASM prod | Galerina gov | Python |
|---|---|--:|--:|--:|--:|--:|--:|--:|
| compute-mix ✅ | mix-ops/s | 130.1M | 130.8M | 134.5M | 139.7M | 75.8M | 1.6M | 766.2K |
| arithmetic-threshold | per-call | 1.57B | 1.56B | 1.87B | 976.2M | 491.0M | 84 | 3.8M |
| six-digit-guess | per-call | 67.1M | 78.1M | 67.4M | 2.9M | 36.4M | 1 | 96.9K |
| record-allocation ✅ | records/s | 943.1M | 1.17B | — | 59.0M | 536.2M | 2.0M | 5.1M |
| fibonacci-recursive | per-call | 499 | 500 | — | 126 | 17.2K | 12 | 6 |
| tower-of-hanoi ✅ | moves/s | 251.9M | 252.2M | — | 129.1M | 121.3M | 95.7K | 5.0M |
| collection-pipeline ✅ | elements/s | 13.27B | 4.27B | — | 70.7M | 417.4M | 1.7M | 10.2M |
| governance-cost | gov-factor | 888.0M | 883.7M | — | 2.1M | 2.9M | 765 | 25.1K |
| hardware-targets | per-call | 1.2M | 1.2M | — | 907.9K | 40.1M | 4.0K | — |
| low-memory ✅ | items/s | 6.15B | 1.36B | — | 712.3M | 470.1M | 145.8K | 3.0M |
| gpu-compute ✅ | kernel-evals/s | 1.19B | 1.20B | — | 987.5M | 475.8M | 376.1K | 6.7M |
| matrix-multiply ✅ | mul-adds/s | 1.41B | 1.51B | — | 623.3M | 444.9M | 712.3K | 6.8M |
| crypto-ops | per-call | — | — | — | — | — | 123 | — |
| text-html | per-call | — | — | — | — | — | 692 | — |
| tri-logic ✅ | trit-ops/s | 1.39B | 1.38B | — | 1.00B | 470.1M | 347.8K | 6.8M |
| data-query ✅ | record-scans/s | — | — | — | 390.3M | — | 222.2K | 3.5M |
| call-chain ✅ | chains/s | — | — | — | 277.2M | 54.4M | 58.2K | 1.4M |
| nbody ✅ | force-evals/s | — | — | — | 121.5M | 28.7M | 61.2K | 1.1M |
| json-parse ✅ | records/s | — | — | — | 3.0M | — | 5.6K | 458.0K |
| mandelbrot ✅ | pixels/s | 23.4M | 23.4M | — | 6.2M | 9.1M | 7.7K | 148.8K |
| spectral-norm ✅ | A-evals/s | 355.6M | 371.4M | — | 243.2M | — | — | 1.7M |
| binary-trees ✅ | nodes/s | 20.1M | 15.6M | — | 76.6M | 587.3M | 366.7K | 5.1M |
| spore-container ✅ | containers/s | 135.6K | 139.6K | — | 42.7K | — | — | 64.5K |
| framework-pipeline ✅ | requests/s | — | — | — | — | — | — | 114.6K |
| http-throughput | per-call | — | — | — | — | — | — | — |
| naming-check | per-call | — | — | — | — | — | — | — |
| context-receipt | per-call | — | — | — | — | — | — | — |
| intelligence-search | per-call | — | — | — | — | — | — | — |
| provenance-trace | per-call | — | — | — | — | — | — | — |
