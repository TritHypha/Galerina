# Benchmark report — two views

Current run: results/latest.json. Baseline ("last time"): 2026-07-12_endphase-2026-07-12.

## 1. Difference from the last run

117 runtime·benchmark pairs · median |Δ| 5.4% · >10%: 26.

| Benchmark | Runtime | last | now | Δ% |
|---|---|--:|--:|--:|
| binary-trees | Python | 2.9M | 5.4M | +85.3% |
| json-parse | Python | 450.5K | 714.0K | +58.5% |
| nbody | Python | 1.0M | 1.6M | +49.2% |
| record-allocation | Python | 5.0M | 3.1M | -38.9% |
| binary-trees | Rust | 15.4M | 21.3M | +38.1% |
| call-chain | Python | 1.6M | 2.1M | +34.7% |
| low-memory | Python | 3.5M | 4.5M | +27.3% |
| binary-trees | Galerina gov | 301.3K | 382.1K | +26.8% |
| data-query | Python | 3.5M | 4.3M | +23.2% |
| text-html | Galerina gov | 944 | 733 | -22.4% |
| six-digit-guess | Rust | 78.1M | 62.3M | -20.2% |
| record-allocation | Rust AVX2 | 1.18B | 980.1M | -16.8% |
| binary-trees | Rust AVX2 | 15.1M | 17.5M | +15.9% |
| collection-pipeline | Python | 13.0M | 15.0M | +15.5% |
| data-query | Galerina gov | 220.2K | 253.8K | +15.3% |
| tower-of-hanoi | Galerina gov | 96.2K | 110.8K | +15.2% |
| binary-trees | WASM prod | 549.0M | 616.9M | +12.4% |
| record-allocation | Galerina gov | 2.3M | 2.5M | +11.7% |
| low-memory | Galerina gov | 149.6K | 167.0K | +11.6% |
| six-digit-guess | Python | 84.8K | 94.1K | +10.9% |

## 2. Cross-language (current run)

| Benchmark | unit | Rust AVX2 | Rust | C++ | Node.js | WASM prod | Galerina gov | Python |
|---|---|--:|--:|--:|--:|--:|--:|--:|
| compute-mix ✅ | mix-ops/s | 136.9M | 138.7M | 139.8M | 143.0M | 80.8M | 1.8M | 820.6K |
| arithmetic-threshold | per-call | 1.52B | 1.57B | 1.93B | 986.0M | 517.6M | 83 | 4.2M |
| six-digit-guess | per-call | 66.3M | 62.3M | 70.8M | 3.1M | 38.2M | 1 | 94.1K |
| record-allocation ✅ | records/s | 980.1M | 1.22B | — | 62.4M | 581.4M | 2.5M | 3.1M |
| fibonacci-recursive | per-call | 522 | 521 | — | 132 | 18.2K | 15 | 6 |
| tower-of-hanoi ✅ | moves/s | 264.8M | 265.1M | — | 132.3M | 128.7M | 110.8K | 3.6M |
| collection-pipeline ✅ | elements/s | 13.22B | 4.50B | — | 77.0M | 445.7M | 2.1M | 15.0M |
| governance-cost | per-call | 752.0M | 908.7M | — | 2.2M | 3.0M | 830 | 28.2K |
| hardware-targets | per-call | 1.2M | 1.2M | — | 957.3K | 35.3M | 4.4K | — |
| low-memory ✅ | items/s | 6.16B | 1.34B | — | 726.8M | 487.0M | 167.0K | 4.5M |
| gpu-compute ✅ | kernel-evals/s | 1.25B | 1.25B | — | 993.0M | 496.6M | 366.8K | 9.4M |
| matrix-multiply ✅ | mul-adds/s | 1.47B | 1.54B | — | 643.2M | 464.6M | 726.4K | 11.9M |
| crypto-ops | per-call | — | — | — | — | — | 160 | — |
| text-html | per-call | — | — | — | — | — | 733 | — |
| tri-logic ✅ | trit-ops/s | 1.43B | 1.44B | — | 1.02B | 493.6M | 380.6K | 11.2M |
| data-query ✅ | record-scans/s | — | — | — | 396.2M | — | 253.8K | 4.3M |
| call-chain ✅ | chains/s | — | — | — | 286.0M | 57.9M | 62.4K | 2.1M |
| nbody ✅ | force-evals/s | — | — | — | 125.2M | 30.5M | 72.1K | 1.6M |
| json-parse ✅ | records/s | — | — | — | 3.0M | — | 5.8K | 714.0K |
| mandelbrot ✅ | pixels/s | 24.1M | 24.2M | — | 7.1M | 9.5M | 8.1K | 175.2K |
| spectral-norm ✅ | A-evals/s | 355.6M | 394.9M | — | 247.3M | — | — | 2.3M |
| binary-trees ✅ | nodes/s | 17.5M | 21.3M | — | 79.3M | 616.9M | 382.1K | 5.4M |
| spore-container ✅ | containers/s | 143.9K | 153.0K | — | 49.2K | — | — | 68.3K |
| framework-pipeline ✅ | requests/s | — | — | — | — | — | — | 131.2K |
| http-throughput | per-call | — | — | — | — | — | — | — |
| naming-check | per-call | — | — | — | — | — | — | — |
| context-receipt | per-call | — | — | — | — | — | — | — |
| intelligence-search | per-call | — | — | — | — | — | — | — |
| provenance-trace | per-call | — | — | — | — | — | — | — |
