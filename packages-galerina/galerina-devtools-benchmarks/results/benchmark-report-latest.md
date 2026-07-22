# Benchmark report — two views

Current run: results/latest.json. Baseline ("last time"): 2026-07-21_post-wat-lowering.

## 1. Difference from the last run

114 runtime·benchmark pairs · median |Δ| 1.4% · >10%: 15.

| Benchmark | Runtime | last | now | Δ% |
|---|---|--:|--:|--:|
| binary-trees | Python | 2.9M | 5.3M | +82.8% |
| record-allocation | Python | 2.9M | 4.2M | +43.3% |
| matrix-multiply | Python | 6.6M | 9.0M | +36.0% |
| crypto-ops | Galerina gov | 171 | 121 | -29.2% |
| governance-cost | Galerina gov | 680 | 850 | +25.0% |
| binary-trees | Rust | 16.5M | 20.5M | +24.4% |
| record-allocation | Rust AVX2 | 944.8M | 1.18B | +24.4% |
| collection-pipeline | Python | 12.9M | 10.1M | -21.3% |
| nbody | Python | 1.0M | 1.2M | +17.3% |
| json-parse | Galerina gov | 5.6K | 4.7K | -16.0% |
| call-chain | Node.js | 274.9M | 317.4M | +15.5% |
| low-memory | Python | 3.0M | 3.4M | +14.0% |
| governance-cost | Python | 20.8K | 23.5K | +12.7% |
| gpu-compute | Python | 6.6M | 7.5M | +12.6% |
| spectral-norm | Python | 1.6M | 1.8M | +11.4% |
| json-parse | Python | 443.5K | 486.5K | +9.7% |
| collection-pipeline | Galerina gov | 2.3M | 2.1M | -9.6% |
| spore-container | Rust AVX2 | 159.1K | 173.7K | +9.2% |
| data-query | Python | 3.8M | 3.5M | -8.8% |
| fibonacci-recursive | Galerina gov | 12 | 13 | +8.3% |

## 2. Cross-language (current run)

| Benchmark | unit | Rust AVX2 | Rust | C++ | Node.js | WASM prod | Galerina gov | Python |
|---|---|--:|--:|--:|--:|--:|--:|--:|
| compute-mix ✅ | mix-ops/s | 129.7M | 132.0M | 132.2M | 135.1M | 77.1M | 1.7M | 772.0K |
| arithmetic-threshold | per-call | 1.57B | 1.57B | 1.88B | 972.9M | 491.5M | 79 | 3.8M |
| six-digit-guess | per-call | 67.0M | 78.0M | 68.1M | 2.8M | 36.4M | 1 | 96.9K |
| record-allocation ✅ | records/s | 1.18B | 1.17B | — | 58.3M | 549.7M | 2.3M | 4.2M |
| fibonacci-recursive | per-call | 496 | 491 | — | 127 | 17.2K | 13 | 4 |
| tower-of-hanoi ✅ | moves/s | 251.7M | 252.3M | — | 127.6M | 120.6M | 98.5K | 2.5M |
| collection-pipeline ✅ | elements/s | 13.27B | 4.32B | — | 70.0M | 414.0M | 2.1M | 10.1M |
| governance-cost | gov-factor | 823.0M | 890.0M | — | 2.1M | 3.1M | 850 | 23.5K |
| hardware-targets | per-call | 1.2M | 1.2M | — | 899.5K | 36.5M | 3.8K | — |
| low-memory ✅ | items/s | 6.08B | 1.35B | — | 691.7M | 461.5M | 154.4K | 3.4M |
| gpu-compute ✅ | kernel-evals/s | 1.18B | 1.18B | — | 987.3M | 469.6M | 332.9K | 7.5M |
| matrix-multiply ✅ | mul-adds/s | 1.40B | 1.51B | — | 622.2M | 440.1M | 706.2K | 9.0M |
| crypto-ops | per-call | — | — | — | — | — | 121 | — |
| text-html | per-call | — | — | — | — | — | 886 | — |
| tri-logic ✅ | trit-ops/s | 1.38B | 1.38B | — | 990.8M | 465.9M | 329.9K | 6.8M |
| data-query ✅ | record-scans/s | — | — | — | 390.0M | — | 207.9K | 3.5M |
| call-chain ✅ | chains/s | — | — | — | 317.4M | 54.4M | 57.1K | 1.8M |
| nbody ✅ | force-evals/s | — | — | — | 123.0M | 29.1M | 64.5K | 1.2M |
| json-parse ✅ | records/s | — | — | — | 3.2M | — | 4.7K | 486.5K |
| mandelbrot ✅ | pixels/s | 22.9M | 23.4M | — | 6.3M | 9.1M | 7.5K | 141.3K |
| spectral-norm ✅ | A-evals/s | 371.9M | 370.5M | — | 239.9M | — | — | 1.8M |
| binary-trees ✅ | nodes/s | 20.1M | 20.5M | — | 80.2M | 590.7M | 359.4K | 5.3M |
| spore-container ✅ | containers/s | 173.7K | 166.6K | — | 44.0K | — | — | 65.9K |
| framework-pipeline ✅ | requests/s | — | — | — | — | — | — | 108.6K |
| http-throughput | per-call | — | — | — | — | — | — | — |
| naming-check | per-call | — | — | — | — | — | — | — |
| context-receipt | per-call | — | — | — | — | — | — | — |
| intelligence-search | per-call | — | — | — | — | — | — | — |
| provenance-trace | per-call | — | — | — | — | — | — | — |
