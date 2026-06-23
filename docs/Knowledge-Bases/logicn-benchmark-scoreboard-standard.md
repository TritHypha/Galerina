# Benchmark scoreboard — presentation standard (the RULE)

**Owner rule 2026-06-23.** Every benchmark scoreboard presented for LogicN — in chat, docs, or a report —
MUST use the format below. It is now **enforced by the tool**: `npm run compare` emits it as section **§1.5
"Scoreboard — production-ceiling winner-ordered"** (`src/compare.mjs`). **Don't hand-roll a scoreboard — run
`compare` and quote §1.5.** This codifies what was previously only the
[scoreboard-slowdown feedback](#) and prevents the two ways a LogicN scoreboard lies.

## The required columns
| Benchmark | 🏆 Winner (ceiling) | Speed | WASM▶prod: rank · ×slower | gov⟨interp⟩: ×slower |

1. **Winner-ordered** — group/sort rows by the winning runtime (not alphabetical by benchmark).
2. **Winner = the PRODUCTION ceiling.** The fastest of the real runtimes (Rust/AVX2/AVX-512, C++, Node.js,
   Python, **WASM ▶ production**, Deno-GPU).
3. **LogicN ×slower vs the winner — BOTH tiers, always** (the standing rule): the shipping path **WASM ▶
   production** *and* the diagnostic **governed ⟨interp⟩**. Never present winner/runner-up without the
   LogicN-slowdown column.
4. **Rank** — where WASM ▶ production placed among the production runtimes (`3rd/6`, `slowest`, `1st (won)`).
5. **Winner tally** + the **excluded** (not unit-aligned) and **insufficient-data** lists — **no silent caps.**

## The two lies this prevents
1. **The diagnostic-tier "win."** The three `⟨interp⟩` rows — **LogicN passive** (LRU-cache warm path),
   **manifest**, **governed** — are **Stage-A diagnostic probes, NOT the production path.** A warm-cache tier
   "winning" a benchmark is meaningless. **They CANNOT be the winner.** Read **WASM ▶ production** for the real
   shipping cost; **governed ⟨interp⟩** is the diagnostic worst-case only.
2. **The lying unit.** A per-second number is apples-to-apples ONLY if every runtime ran an **identical op mix
   at an identical op count per call.** The suite's `assertBenchmarkUnits` (`throughput-units.mjs`) enforces one
   shared unit per benchmark; a benchmark whose workload SHAPE/SIZE differs across runtimes is marked
   `comparable: false` and **excluded** (with its reason) — never relabeled into a fake comparison. (Example
   fix: matrix-multiply → `mul-adds/s`, a size-invariant unit; tri-logic/data-query stay excluded pending
   genuine workload unification — R&D 0092.)

## How to produce it
```
cd packages-logicn/logicn-devtools-benchmarks
npm run run        # full measure (writes results/latest.json)
npm run compare    # → §1.5 is the canonical scoreboard; quote it verbatim
npm run audit      # asserts checksums agree + units aligned + exclusions intact
```
For a re-presentation without re-measuring, `npm run compare` re-reads `results/latest.json`. **Always include
§1.5's winner tally + excluded/insufficient-data lines** — dropping them re-introduces the silent-cap lie.

> Related: the standing `feedback-scoreboard-logicn-slowdown-column` (every scoreboard shows ×slower vs winner)
> · `logicn-benchmark-suite` (unit-truth history) · R&D 0092 (tri-logic/data-query workload unification).
