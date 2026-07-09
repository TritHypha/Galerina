# Benchmark snapshots — archive for trend comparison

Dated, self-contained snapshots of **full** benchmark runs, kept so results can be compared over time.

## Layout
```
results/archive/<YYYY-MM-DD>_<label>/
  results.json   # raw latest.json — re-comparable; carries normThroughput + a units block per benchmark
  report.md      # rendered comparison report (winner tables, heap/op memory)
  meta.json      # machine (cpu/cores/mem), git commit, node version, unit-check status
```

## Save a snapshot
Run the **full** suite first (never `--quick` for an archived run), then:
```
npm run run                 # full extended run → results/latest.json + report.md (via compare)
npm run compare             # (if you need to (re)render report.md)
npm run snapshot -- <label> # e.g. extended | baseline | post-wasm | post-gateCache
```
`snapshot` copies `latest.json` + `report.md` into a dated folder and writes `meta.json`. It refuses to overwrite an existing label.

## Compare two runs later
- **Same machine only.** Throughput is machine-specific (these are i9-9900K, 16c). Cross-machine numbers are not comparable.
- Diff two `results.json` by each benchmark's **`normThroughput`** (the unit-normalized canonical field) for an apples-to-apples delta — do NOT diff raw `operationsPerSecond`/`iterationsPerSecond` (mixed units; that was the original bug).
- A run is only trustworthy if `meta.json.unitCheck` is all `PASS`/`FLAGGED` (never `FAIL`). Re-validate any run with `npm run audit`.

## Saved runs
| Folder | Date | Machine | Note |
|---|---|---|---|
| `2026-06-17_extended/` | 2026-06-17 | i9-9900K 16c | **First truth-audited full run.** Unit-normalized + heap/op memory dimension; 24 cross-language benchmarks (incl. new mandelbrot/binary-trees/spectral-norm/spore-container/framework-pipeline) + devtools. `npm run audit` PASS. |

## Legacy flat snapshots (pre-archive, in `../`)
- `../full-suite-2026-06-16.json` — full run **BEFORE the unit-normalization fix**. Its Galerina throughput numbers are **inflated** (the "Galerina wins" bug); do not trust/compare its Galerina rows. Kept only for historical reference.
- `../crypto-ops-postaudit.json`, `../crypto-ops-pq-2026-06-16.json`, `../baseline-governance-cost-2026-06-16.json` — targeted single-benchmark snapshots.
