# Benchmark report — two views

Current run: results/latest.json. Baseline ("last time"): 2026-07-12_posthardening.

## 1. Difference from the last run

117 runtime·benchmark pairs · median |Δ| 4.8% · >10%: 29.

| Benchmark | Runtime | last | now | Δ% |
|---|---|--:|--:|--:|
| binary-trees | Python | 5.4M | 2.9M | -47.0% |
| matrix-multiply | Python | 11.9M | 6.6M | -45.1% |
| record-allocation | Python | 3.1M | 4.3M | +40.0% |
| call-chain | Python | 2.1M | 1.3M | -37.5% |
| low-memory | Python | 4.5M | 2.8M | -36.4% |
| tri-logic | Python | 11.2M | 7.3M | -34.8% |
| tower-of-hanoi | Python | 3.6M | 2.4M | -34.7% |
| json-parse | Python | 714.0K | 467.0K | -34.6% |
| gpu-compute | Python | 9.4M | 6.4M | -32.2% |
| nbody | Python | 1.6M | 1.1M | -31.9% |
| spectral-norm | Python | 2.3M | 1.6M | -30.5% |
| data-query | Python | 4.3M | 3.2M | -27.0% |
| six-digit-guess | Rust | 62.3M | 78.0M | +25.3% |
| six-digit-guess | Rust AVX2 | 66.3M | 50.8M | -23.3% |
| hardware-targets | Galerina gov | 4.4K | 3.4K | -21.9% |
| record-allocation | Rust AVX2 | 980.1M | 1.18B | +20.1% |
| mandelbrot | Python | 175.2K | 142.0K | -18.9% |
| framework-pipeline | Python | 131.2K | 108.6K | -17.2% |
| governance-cost | Python | 28.2K | 23.4K | -16.8% |
| text-html | Galerina gov | 733 | 850 | +16.0% |

## 2. Cross-language (current run)

| Benchmark | unit | Rust AVX2 | Rust | C++ | Node.js | WASM prod | Galerina gov | Python |
|---|---|--:|--:|--:|--:|--:|--:|--:|
| compute-mix ✅ | mix-ops/s | 130.1M | 132.4M | 133.1M | 135.6M | 77.6M | 1.7M | 761.7K |
| arithmetic-threshold | per-call | 1.56B | 1.57B | 1.88B | 971.8M | 495.0M | 84 | 3.8M |
| six-digit-guess | per-call | 50.8M | 78.0M | 68.1M | 2.9M | 36.6M | 1 | 101.6K |
| record-allocation ✅ | records/s | 1.18B | 1.17B | — | 61.0M | 555.0M | 2.5M | 4.3M |
| fibonacci-recursive | per-call | 502 | 500 | — | 128 | 17.3K | 13 | 5 |
| tower-of-hanoi ✅ | moves/s | 253.3M | 252.4M | — | 129.6M | 122.3M | 103.4K | 2.4M |
| collection-pipeline ✅ | elements/s | 13.23B | 4.33B | — | 70.6M | 421.5M | 2.0M | 13.4M |
| governance-cost | per-call | 695.5M | 889.9M | — | 2.1M | 2.9M | 827 | 23.4K |
| hardware-targets | per-call | 1.2M | 1.2M | — | 913.0K | 37.6M | 3.4K | — |
| low-memory ✅ | items/s | 5.86B | 1.35B | — | 720.1M | 466.3M | 161.6K | 2.8M |
| gpu-compute ✅ | kernel-evals/s | 1.19B | 1.19B | — | 990.1M | 472.3M | 347.6K | 6.4M |
| matrix-multiply ✅ | mul-adds/s | 1.43B | 1.51B | — | 619.6M | 441.9M | 736.9K | 6.6M |
| crypto-ops | per-call | — | — | — | — | — | 161 | — |
| text-html | per-call | — | — | — | — | — | 850 | — |
| tri-logic ✅ | trit-ops/s | 1.39B | 1.39B | — | 994.4M | 470.6M | 342.6K | 7.3M |
| data-query ✅ | record-scans/s | — | — | — | 393.3M | — | 213.7K | 3.2M |
| call-chain ✅ | chains/s | — | — | — | 279.9M | 54.7M | 56.9K | 1.3M |
| nbody ✅ | force-evals/s | — | — | — | 123.6M | 29.1M | 64.5K | 1.1M |
| json-parse ✅ | records/s | — | — | — | 3.1M | — | 5.3K | 467.0K |
| mandelbrot ✅ | pixels/s | 23.1M | 23.4M | — | 6.8M | 9.1M | 7.8K | 142.0K |
| spectral-norm ✅ | A-evals/s | 366.4M | 371.4M | — | 240.3M | — | — | 1.6M |
| binary-trees ✅ | nodes/s | 15.8M | 20.1M | — | 78.8M | 589.2M | 357.0K | 2.9M |
| spore-container ✅ | containers/s | 160.5K | 172.6K | — | 43.5K | — | — | 74.5K |
| framework-pipeline ✅ | requests/s | — | — | — | — | — | — | 108.6K |
| http-throughput | per-call | — | — | — | — | — | — | — |
| naming-check | per-call | — | — | — | — | — | — | — |
| context-receipt | per-call | — | — | — | — | — | — | — |
| intelligence-search | per-call | — | — | — | — | — | — | — |
| provenance-trace | per-call | — | — | — | — | — | — | — |
