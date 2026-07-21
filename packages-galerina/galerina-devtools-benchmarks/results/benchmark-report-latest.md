# Benchmark report — two views

Current run: results/latest.json. Baseline ("last time"): 2026-07-12_posthardening.

## 1. Difference from the last run

114 runtime·benchmark pairs · median |Δ| 5.7% · >10%: 34.

| Benchmark | Runtime | last | now | Δ% |
|---|---|--:|--:|--:|
| binary-trees | Python | 5.4M | 2.9M | -46.7% |
| matrix-multiply | Python | 11.9M | 6.6M | -44.6% |
| tri-logic | Python | 11.2M | 7.0M | -38.0% |
| json-parse | Python | 714.0K | 443.5K | -37.9% |
| nbody | Python | 1.6M | 1.0M | -35.0% |
| low-memory | Python | 4.5M | 3.0M | -33.1% |
| gpu-compute | Python | 9.4M | 6.6M | -29.5% |
| tower-of-hanoi | Python | 3.6M | 2.6M | -28.8% |
| spectral-norm | Python | 2.3M | 1.6M | -28.7% |
| fibonacci-recursive | Python | 6 | 4 | -28.0% |
| governance-cost | Python | 28.2K | 20.8K | -26.0% |
| six-digit-guess | Rust | 62.3M | 78.1M | +25.4% |
| binary-trees | Rust | 21.3M | 16.5M | -22.8% |
| fibonacci-recursive | Galerina gov | 15 | 12 | -20.0% |
| data-query | Galerina gov | 253.8K | 204.8K | -19.3% |
| governance-cost | Rust AVX2 | 752.0M | 893.7M | +18.8% |
| text-html | Galerina gov | 733 | 871 | +18.8% |
| framework-pipeline | Python | 131.2K | 106.8K | -18.6% |
| governance-cost | Galerina gov | 830 | 680 | -18.1% |
| mandelbrot | Python | 175.2K | 146.3K | -16.5% |

## 2. Cross-language (current run)

| Benchmark | unit | Rust AVX2 | Rust | C++ | Node.js | WASM prod | Galerina gov | Python |
|---|---|--:|--:|--:|--:|--:|--:|--:|
| compute-mix ✅ | mix-ops/s | 129.6M | 130.6M | — | 134.7M | 77.2M | 1.7M | 714.7K |
| arithmetic-threshold | per-call | 1.56B | 1.56B | — | 975.4M | 488.5M | 83 | 3.8M |
| six-digit-guess | per-call | 65.2M | 78.1M | — | 2.8M | 36.4M | 1 | 94.0K |
| record-allocation ✅ | records/s | 944.8M | 1.17B | — | 56.0M | 551.8M | 2.4M | 2.9M |
| fibonacci-recursive | per-call | 498 | 499 | — | 127 | 17.0K | 12 | 4 |
| tower-of-hanoi ✅ | moves/s | 251.9M | 251.7M | — | 129.7M | 120.6M | 98.8K | 2.6M |
| collection-pipeline ✅ | elements/s | 13.10B | 4.29B | — | 69.8M | 416.1M | 2.3M | 12.9M |
| governance-cost | gov-factor | 893.7M | 893.0M | — | 2.1M | 2.8M | 680 | 20.8K |
| hardware-targets | per-call | 1.2M | 1.2M | — | 908.3K | 37.0M | 3.7K | — |
| low-memory ✅ | items/s | 6.16B | 1.35B | — | 715.2M | 466.9M | 151.3K | 3.0M |
| gpu-compute ✅ | kernel-evals/s | 1.18B | 1.18B | — | 985.7M | 469.7M | 328.1K | 6.6M |
| matrix-multiply ✅ | mul-adds/s | 1.40B | 1.51B | — | 617.5M | 439.2M | 717.5K | 6.6M |
| crypto-ops | per-call | — | — | — | — | — | 171 | — |
| text-html | per-call | — | — | — | — | — | 871 | — |
| tri-logic ✅ | trit-ops/s | 1.37B | 1.38B | — | 990.9M | 462.8M | 325.4K | 7.0M |
| data-query ✅ | record-scans/s | — | — | — | 388.5M | — | 204.8K | 3.8M |
| call-chain ✅ | chains/s | — | — | — | 274.9M | 53.9M | 56.3K | 1.8M |
| nbody ✅ | force-evals/s | — | — | — | 121.3M | 28.9M | 63.6K | 1.0M |
| json-parse ✅ | records/s | — | — | — | 3.4M | — | 5.6K | 443.5K |
| mandelbrot ✅ | pixels/s | 23.3M | 23.4M | — | 6.2M | 9.0M | 7.5K | 146.3K |
| spectral-norm ✅ | A-evals/s | 360.2M | 372.3M | — | 241.4M | — | — | 1.6M |
| binary-trees ✅ | nodes/s | 20.3M | 16.5M | — | 79.1M | 586.2M | 344.4K | 2.9M |
| spore-container ✅ | containers/s | 159.1K | 162.6K | — | 45.5K | — | — | 64.1K |
| framework-pipeline ✅ | requests/s | — | — | — | — | — | — | 106.8K |
| http-throughput | per-call | — | — | — | — | — | — | — |
| naming-check | per-call | — | — | — | — | — | — | — |
| context-receipt | per-call | — | — | — | — | — | — | — |
| intelligence-search | per-call | — | — | — | — | — | — | — |
| provenance-trace | per-call | — | — | — | — | — | — | — |
