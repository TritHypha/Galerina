# Benchmark report — 2026-07-16 close run

Full-suite run at the 2026-07-16 closing cycle (Galerina `main` @ `7f0b1a1a`, dist + fused
packages freshly rebuilt). 29 benchmarks; **noise-gate PASSED** (control spread 0.3% ≤ 8%,
median 9.27 ms, IQR 0.3% — the session is measurable). Raw data: `results/latest.json`,
archived into the recurring series as `results/history/run-2026-07-16T17-03-51.json`.

## Headline correction — the "996% vs native" figure does NOT survive verification

The closing-cycle chart showed **record-allocation WASM at 996% of Node.js**. Owner asked "?".
Verified against the benchmark sources — the workloads are **not equivalent**, and the figure
must not be cited as an allocation win:

| Lane | What each iteration actually does |
|---|---|
| node.mjs | `const rec = { x: i, y: i*2, z: i+1 }` — a **real heap object allocation** |
| benchmark.fungi → WASM | three `let` Int bindings — compiled to **register locals, no allocation** |
| benchmark.fungi → interpreter | the same bindings each allocate a `{__tag,value}` box (allocation IS measured there) |
| bench.rs | struct of 3 ints — effectively registers too (1.19 B/s ≈ pure ALU loop) |

So 996% = *a WASM scalar loop vs V8 object allocation* — apples-to-oranges. The honest
same-work comparison is **WASM 556 M/s vs Rust 1.19 B/s = 47%**. The runner's unit-alignment
gate passed because it checks the unit *label* (`records/s`), not work equivalence — a new
defect class (**work-equivalence drift**), now tagged per-lane in `src/history.mjs
WORK_EQUIVALENCE` and corrected in the benchmark's own header.

Classification of the three ">100% of Node" bars from the chart:

| Benchmark | Chart figure | Verdict |
|---|---:|---|
| record-allocation | 996% | **shape-only** — allocation elided in the WASM lane (header was under-documented; now fixed) |
| binary-trees | 748% | **shape-only, already documented in-corpus** — "COUNT-ONLY form", heap node elided, recursion shape (135,854 calls) + checksum preserved |
| collection-pipeline | 593% | **shape-only, already documented in-corpus** — fused while-loop vs Node's materialized filter/map arrays |
| mandelbrot | 131% | **plausibly genuine** — pure arithmetic in both lanes, same work |

**Corrected honest headline: the Galerina WASM backend runs ~47–94% of native on
work-equivalent benchmarks** (tower-of-hanoi 94%, matrix-multiply 72%, low-memory 66%,
compute-mix 57%, gpu-compute 48%, tri-logic 47%), with mandelbrot at 131% the one credible
beats-native lane. The shape-only lanes remain valid for what they measure (loop/recursion
shape parity, and per-binding boxing on the interpreter lanes) — just not as cross-runtime
allocation comparisons.

## Cross-runtime results (normThroughput, benchmarks with a native baseline)

| Benchmark | Unit | Node.js | WASM | % of Node | Governed (K3) | Gov % of Node |
|---|---|---:|---:|---:|---:|---:|
| compute-mix | mix-ops/s | 135.2M | 77.5M | 57.3% | 1.70M | 1.257% |
| record-allocation | records/s | 55.8M | 556.1M | *shape-only* | 2.49M | 4.455% |
| tower-of-hanoi | moves/s | 130.0M | 121.7M | 93.6% | 101.9K | 0.078% |
| collection-pipeline | elements/s | 71.2M | 422.1M | *shape-only* | 2.44M | 3.427% |
| low-memory | items/s | 710.7M | 469.6M | 66.1% | 140.6K | 0.020% |
| gpu-compute | kernel-evals/s | 986.5M | 474.4M | 48.1% | 338.1K | 0.034% |
| matrix-multiply | mul-adds/s | 614.4M | 442.7M | 72.1% | 734.4K | 0.120% |
| tri-logic | trit-ops/s | 1.006B | 474.1M | 47.1% | 349.4K | 0.035% |
| data-query | record-scans/s | 390.1M | — | — | 216.5K | 0.056% |
| call-chain | chains/s | 318.1M | 55.0M | 17.3% | 55.0K | 0.017% |
| nbody | force-evals/s | 123.1M | 29.4M | 23.9% | 65.8K | 0.053% |
| json-parse | records/s | 3.46M | — | — | 5.5K | 0.159% |
| mandelbrot | pixels/s | 6.88M | 9.00M | 130.7% | 7.1K | 0.103% |
| spectral-norm | A-evals/s | 243.7M | — | — | — | — |
| binary-trees | nodes/s | 79.1M | 591.5M | *shape-only* | 398.8K | 0.504% |
| spore-container | containers/s | 43.6K | — | — | — | — |

Governed (K3) execution sits at **0.02–4.5% of native** — the deliberate per-operation
governance admission cost, consistent with prior runs (no regression class).

## Diff since day start and since last run (new recurring series)

Produced by the new `npm run history` (src/history.mjs) — snapshots every run into
`results/history/`, diffs vs the previous entry and the first entry of the same local day,
against the recorded noise floor:

- **Since day start** (vs the night-close run, 08:35) and **since last run** (vs the 12:55
  day run): **no attribution-grade regression in any wasm/governed lane.** Every top mover
  falls in a known noise class:
  - the CPython −23…−35% class (documented noise, moves as a block across unrelated benches);
  - the passive cold-call lanes (±30–47% — 20-call samples, structurally high variance);
  - micro-duration lanes where even the **rustAvx2 native control** swung +31%
    (governance-cost) — the class the queued fixed-time/median-of-N rig (#63) eliminates.
- Full per-lane data: `results/history/diff-latest.json` (152 lanes tracked).

## Recurring measurement discipline (new this session)

1. **`npm run history`** (benchmarks pkg) — auto-snapshot + since-last/day-start diffs with
   noise-floor annotation and shape-only lane tags. Self-tested (`--self-test`, 4/4).
2. **`npm run audit:percent-history`** (repo root) — same recurrence for the % audit:
   snapshots `component-health --json` percentAudit (ship/zt/build + per-row pcts) into
   `build/audit-history/`, diffs vs previous snapshot and day-first in percentage points.
   Seeded 2026-07-16T17-27-27 (ship 97.9 · zt 78 · build 75); the next % audit shows deltas.
   Self-tested (4/4).

Durability: the **% audit series is committed** (`build/audit-history/` is tracked). The bench
`results/history/` run-series is **local by pre-existing design** (`.gitignore` line 9 —
run-churn stays out of the repo); the durable cross-machine bench record remains the tracked
`full-suite-*.json` snapshots + the deliberate `results/archive/` baselines, which the history
tool auto-seeds from on any fresh clone.
