# Benchmark suite — handover to the hub/main session (2026-06-17)

Worktree session deliverable. Authoritative roadmap entry: `docs/Knowledge-Bases/logicn-roadmap-and-audit-2026-06-17.md` §8. Memories: `logicn-benchmark-suite`, `feedback-benchmark-full-run`.

## OWNER POLICY (do this in the main session)
When the owner asks for benchmarks: run the **FULL** suite (no `--quick`), tables **ordered by winners**, plus the audit.
- `npm run bench` = `node --expose-gc src/runner.mjs` (full) → `compare` → `audit`.
- Never use `run:quick` for owner-facing results (it's CI/dev only: 3s compute-mix, reduced iterations).

## What changed
1. **Unit-truth fix.** `src/throughput-units.mjs` normalises every runtime to ONE unit/benchmark. Killed the false "LogicN wins" (was comparing LogicN inner-ops/sec vs others' whole-call/sec). `runner.mjs` stamps `normThroughput`+`units` and **fails the run on a unit mismatch**. matrix-multiply, tri-logic, data-query are **non-comparable → flagged & excluded**.
2. **Per-op memory dimension.** Every benchmark reports heap-allocated-per-op (Node `--expose-gc`+heapUsedDelta; Python `tracemalloc`; native ~0). `compare.mjs` §4 has a **Heap/op** column + per-benchmark memory winner.
3. **New real-world (CLBG) benchmarks** (all checksum-verified byte-identical across runtimes): `mandelbrot` (230132), `binary-trees` (135854), `spectral-norm` (6647). Plus earlier `tmf-container`, `framework-pipeline`.
4. **Truth guarantee:** `npm test` (28 synthetic logic cases) + `npm run audit` (cross-language checksum identity, unit alignment, anti-inflation regression over `latest.json`). **Both pass.**

## Headline results (full extended run, i9; see report.md for the full tables)
- **Anti-inflation regression holds** — Node beats the LogicN tree-walker on every numeric loop: nbody 2103×, low-memory 5811×, compute-mix 624×, mandelbrot 784×, collection-pipeline 109×.
- **Winners** are mostly WASM/Rust (native) or Node; the "LogicN passive wins" rows are LRU **cache-hit** artifacts (pre-existing, honestly labelled — the real first-call winner is shown).
- **New benchmarks:** mandelbrot 🥇 Rust 23.4M px/s (Node 6.2M, LogicN gov ~7.9K — 192× behind Node, 209 B/op boxing); binary-trees 🥇 Node 76M nodes/s (Rust 20M, LogicN 3.75M count-only); spectral-norm 🥇 Rust 371M (Node 213M, Python 2.7M; no LogicN).
- LogicN (governed) beats Python on only **fibonacci** (1.36× — but that's fib(20) vs fib(30), documented). Everywhere else it's the honest floor-or-below.

## ⚠️ LogicN is NOT YET able to express standard cross-language benchmarks
Confirmed three language gaps (full detail + suggested R&D job in roadmap §8):
- **B1 — recursive `record` types have no leaf terminator** (no null / `Option<Record>` lowering / payload-enum). binary-trees couldn't allocate a real tree; its `.lln` is a count-only fused recursion. Blocks any tree/linked structure + honest allocation benchmarks.
- **B2 — no mutable indexed arrays** (lists immutable, tree-walker-only). Excluded spectral-norm; defers fannkuch, sort, sieve, k-nucleotide.
- **B3 — no native floats on the fast path** (bytecode VM rejects floats → all numeric benchmarks use scaled-int ×1000).
- (Bitwise ops are engine-side **by design** — constraint, not a gap; blocks base64/hashing in `.lln`.)
→ Prioritise B1 then B2. B3 is low priority (scaled-int works; the real answer is route-to-WASM).

## Verify
```
cd packages-logicn/logicn-devtools-benchmarks
npm test          # synthetic truth logic (28 cases)
npm run audit     # truth invariants over results/latest.json
npm run bench     # full run + compare + audit (owner-facing)
```
