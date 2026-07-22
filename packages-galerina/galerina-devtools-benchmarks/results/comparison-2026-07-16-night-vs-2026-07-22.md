# Benchmark comparison — 2026-07-16-night → 2026-07-22

Current: `results/latest.json` (2026-07-22). Earlier baseline: `results/full-suite-2026-07-16-night.json`.
Metric: **normThroughput** (higher = faster), paired by `benchmark|runtime`.

## Summary

- **112** runtime·benchmark pairs present in both runs · median |Δ| **5.2%** · pairs >10%: **23**
- present only NOW (new lanes): 2 — gpu-compute|denoWebGpu, matrix-multiply|denoWebGpu
- present only in the 2026-07-16-night baseline (dropped): 0

> ⚠ **Read against the noise floor.** A ~6-day gap spans machine reboots, thermal state, and background load; this run in particular was taken with concurrent foreground work (a full regen/audit cycle). Treat |Δ| within a runtime's own control band as noise — especially the **Python** lane (a warmup-sensitive interpreter that historically swings ±30–80% run-to-run) and any **per-call** metric at low absolute counts. A mover is only real if it clears the control spread AND the work is equivalent across runs.

## Movers (|Δ| ≥ 10%), largest first

| Benchmark | Runtime | 2026-07-16-night | 2026-07-22 | Δ% |
|---|---|--:|--:|--:|
| collection-pipeline | python | 17.1M | 10.1M | -41.0% |
| mandelbrot | python | 198.4K | 141.3K | -28.8% |
| gpu-compute | python | 10.4M | 7.5M | -28.0% |
| tower-of-hanoi | python | 3.5M | 2.5M | -27.4% |
| json-parse | galerinaGoverned | 6.4K | 4.7K | -26.1% |
| framework-pipeline | python | 143.5K | 108.6K | -24.3% |
| tri-logic | python | 8.9M | 6.8M | -24.1% |
| record-allocation | rustAvx2 | 952.9M | 1.18B | +23.3% |
| binary-trees | python | 4.3M | 5.3M | +22.3% |
| nbody | python | 1.5M | 1.2M | -19.2% |
| spore-container | python | 81.0K | 65.9K | -18.6% |
| record-allocation | python | 5.1M | 4.2M | -18.4% |
| compute-mix | python | 922.8K | 772.0K | -16.3% |
| data-query | galerinaManifest | 253.0K | 213.8K | -15.5% |
| spectral-norm | python | 2.1M | 1.8M | -15.1% |
| matrix-multiply | python | 10.3M | 9.0M | -13.0% |
| tri-logic | galerinaManifest | 365.2K | 320.2K | -12.3% |
| mandelbrot | nodejs | 7.1M | 6.3M | -12.2% |
| binary-trees | galerinaManifest | 419.8K | 370.5K | -11.7% |
| call-chain | nodejs | 285.6M | 317.4M | +11.2% |
| spore-container | nodejs | 49.1K | 44.0K | -10.4% |
| spore-container | rust | 151.3K | 166.6K | +10.1% |
| record-allocation | galerinaPassive | 8.9M | 8.0M | -10.1% |

## Stable (|Δ| < 10%): 89 pairs

Everything not listed above moved less than 10% — i.e. within noise for this horizon.
