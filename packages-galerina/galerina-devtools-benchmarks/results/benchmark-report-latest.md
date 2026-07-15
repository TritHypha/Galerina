# Benchmark report — two views

Current run: results/latest.json. Baseline ("last time"): 2026-07-12_posthardening.

## 1. Difference from the last run

117 runtime·benchmark pairs · median |Δ| 1.8% · >10%: 18.

| Benchmark | Runtime | last | now | Δ% |
|---|---|--:|--:|--:|
| json-parse | Python | 714.0K | 510.5K | -28.5% |
| six-digit-guess | Rust | 62.3M | 79.7M | +28.0% |
| tri-logic | Python | 11.2M | 8.2M | -27.0% |
| binary-trees | Rust | 21.3M | 16.2M | -23.9% |
| binary-trees | Python | 5.4M | 4.2M | -23.2% |
| gpu-compute | Python | 9.4M | 7.3M | -22.4% |
| matrix-multiply | Python | 11.9M | 9.3M | -22.1% |
| collection-pipeline | Python | 15.0M | 18.2M | +21.4% |
| tower-of-hanoi | Python | 3.6M | 2.9M | -21.2% |
| record-allocation | Rust AVX2 | 980.1M | 773.2M | -21.1% |
| nbody | Python | 1.6M | 1.2M | -20.7% |
| six-digit-guess | Rust AVX2 | 66.3M | 53.1M | -19.9% |
| record-allocation | Python | 3.1M | 3.7M | +19.7% |
| binary-trees | Rust AVX2 | 17.5M | 20.9M | +19.3% |
| low-memory | Python | 4.5M | 3.7M | -18.2% |
| data-query | Galerina gov | 253.8K | 210.8K | -16.9% |
| low-memory | Galerina gov | 167.0K | 149.5K | -10.5% |
| nbody | Galerina gov | 72.1K | 64.8K | -10.2% |
| six-digit-guess | Python | 94.1K | 103.2K | +9.6% |
| call-chain | Python | 2.1M | 1.9M | -8.8% |

## 2. Cross-language (current run)

| Benchmark | unit | Rust AVX2 | Rust | C++ | Node.js | WASM prod | Galerina gov | Python |
|---|---|--:|--:|--:|--:|--:|--:|--:|
| compute-mix ✅ | mix-ops/s | 136.2M | 139.5M | 140.1M | 143.0M | 81.8M | 1.8M | 810.8K |
| arithmetic-threshold | per-call | 1.50B | 1.60B | 1.93B | 992.2M | 515.1M | 82 | 4.3M |
| six-digit-guess | per-call | 53.1M | 79.7M | 69.5M | 3.1M | 37.9M | 1 | 103.2K |
| record-allocation ✅ | records/s | 773.2M | 1.17B | — | 58.6M | 578.4M | 2.5M | 3.7M |
| fibonacci-recursive | per-call | 516 | 520 | — | 126 | 18.2K | 14 | 6 |
| tower-of-hanoi ✅ | moves/s | 262.2M | 264.2M | — | 132.9M | 128.0M | 107.2K | 2.9M |
| collection-pipeline ✅ | elements/s | 13.94B | 4.49B | — | 76.7M | 442.3M | 2.1M | 18.2M |
| governance-cost | per-call | 734.8M | 911.5M | — | 2.1M | 3.0M | 817 | 26.2K |
| hardware-targets | per-call | 1.2M | 1.2M | — | 960.0K | 35.9M | 4.3K | — |
| low-memory ✅ | items/s | 6.04B | 1.38B | — | 718.3M | 468.8M | 149.5K | 3.7M |
| gpu-compute ✅ | kernel-evals/s | 1.25B | 1.24B | — | 1.03B | 497.3M | 366.6K | 7.3M |
| matrix-multiply ✅ | mul-adds/s | 1.50B | 1.57B | — | 631.9M | 463.8M | 782.6K | 9.3M |
| crypto-ops | per-call | — | — | — | — | — | 151 | — |
| text-html | per-call | — | — | — | — | — | 710 | — |
| tri-logic ✅ | trit-ops/s | 1.44B | 1.44B | — | 1.02B | 493.3M | 355.9K | 8.2M |
| data-query ✅ | record-scans/s | — | — | — | 388.6M | — | 210.8K | 4.0M |
| call-chain ✅ | chains/s | — | — | — | 293.8M | 57.2M | 56.9K | 1.9M |
| nbody ✅ | force-evals/s | — | — | — | 125.1M | 30.4M | 64.8K | 1.2M |
| json-parse ✅ | records/s | — | — | — | 3.0M | — | 6.0K | 510.5K |
| mandelbrot ✅ | pixels/s | 23.8M | 24.2M | — | 6.6M | 9.6M | 8.0K | 162.9K |
| spectral-norm ✅ | A-evals/s | 379.0M | 393.8M | — | 245.3M | — | — | 2.1M |
| binary-trees ✅ | nodes/s | 20.9M | 16.2M | — | 83.1M | 619.3M | 373.4K | 4.2M |
| spore-container ✅ | containers/s | 141.1K | 150.0K | — | 47.4K | — | — | 70.1K |
| framework-pipeline ✅ | requests/s | — | — | — | — | — | — | 125.0K |
| http-throughput | per-call | — | — | — | — | — | — | — |
| naming-check | per-call | — | — | — | — | — | — | — |
| context-receipt | per-call | — | — | — | — | — | — | — |
| intelligence-search | per-call | — | — | — | — | — | — | — |
| provenance-trace | per-call | — | — | — | — | — | — | — |
