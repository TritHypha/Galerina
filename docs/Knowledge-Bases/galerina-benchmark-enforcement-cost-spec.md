# Benchmark Spec — Hardened-Border Enforcement-Cost Suite

**Package:** `packages-galerina/galerina-devtools-benchmarks` · **Status:** Proposed (2026-06-06) · **Post-P9, non-blocking.**

Measures the *cost of enforcement at the hardened border*, not compute. The existing suite (arithmetic/nbody/matrix) stays the "compute ceiling"; these three become the "enforcement floor", probing the three walls the 58–59× governance figure pays for.

| Wall | What it gates | Benchmark |
|---|---|---|
| Policy decision plane | allow-list + capability + manifest-signature | `governance-tax` |
| Host↔WASM ABI border | `__str_*`/`__array_*` marshalling | `context-switch` |
| Sandbox memory plane | scrub/reset between calls | `memory-sanitizer` ⛔ BLOCKED on #147 |

## 1. `governance-tax` — tax per instruction
- **Workload:** one `i32.add` (only compute) forced through **N policy checks** (allow-list / capability / manifest-signature, cycled), N ∈ {1,4,16,64} → a *slope*, not a point.
- **Metrics:** `governanceTaxNsPerInstruction` (ns/instr, minus ungoverned-add baseline); `governanceTaxNsPerCheck` (ns/check); plus `galerinaOpsPerSecond` for the existing `compare.mjs` extractor; expose `galerinaGoverned` vs `galerinaManifest` for the gov-overhead column.
- **Slot-in:** `benchmarks/governance-tax/{benchmark.spore,node.mjs,python.py,bench-wasm.mjs}`; register `{ id:"governance-tax", dir:"governance-tax", galerinaOpsPerRun:1, passiveCallCount:100 }`.
- **Headline row:** `WASM ▶ production` (gates compiled in). `⟨interp⟩` tiers = diagnostic ceiling only.
- **Honest framing:** N=1 is artificial (no real flow does one add behind one check); the point is the *slope* (ns/added-check) + the *fixed first-check floor* that amortises over real instruction counts. Only the WASM row may be quoted as "the governance tax".

## 2. `context-switch` — host↔WASM border latency
- **Workload:** ~1e6 iterations, each crossing host→WASM (`__str_*`/`__array_*`) doing ~zero WASM work, returning a scalar. Record `borderStringRoundtrips` + `borderArrayRoundtrips` separately.
- **Metrics:** `borderLatencyNsPerRoundtrip` (ns/crossing); `borderRoundtripsPerSecond` (emit as `operationsPerSecond`/`iterationsPerSecond` — already handled by `throughput()`); `marshalNsString` vs `marshalNsArray`.
- **Slot-in:** `benchmarks/context-switch/{node.mjs,bench-wasm.mjs,benchmark.spore?}`; register `{ id:"context-switch", dir:"context-switch", galerinaOpsPerRun:1000000, passiveCallCount:5 }`. `node.mjs` JS call round-trip = "no-border" baseline; delta vs WASM = border tax.
- **Headline row:** `WASM ▶ production` (it's *about* the compiled ABI).
- **Honest framing:** "~no WASM work" is the caveat — real flows amortise the shim; high ns/round-trip only alarms *chatty* patterns. Report next to a "crossings per real request" estimate; never read as a throughput verdict.

## 3. `memory-sanitizer` — sandbox scrub pressure ⛔ BLOCKED on #147
- **Blocked:** without warm-sandbox reuse (#147) every call pays a full instantiate that swamps scrub cost — unmeasurable. Create the directory with a `BLOCKED.md`; do NOT register until #147.
- **Workload (target):** ~1e5 governed calls vs a single warm sandbox, scrubbing dirty pages between calls; sweep {4KiB,64KiB,1MiB}. Trivial useful work so the delta is the scrub.
- **Metrics:** `scrubNsPerCall` (= warm-with-scrub − warm-no-scrub); `scrubThroughputBytesPerSecond` (GB/s); `warmCallsPerSecond` (picked up by `compare.mjs` line 44).
- **Honest framing:** meaningless without #147 — reported earlier it would mislabel instantiate cost as scrub cost (actively dishonest). Emit NO scrub number until #147 lands (same rule that keeps 0% metrics at 0% until real execution).

## Registration touch-points (no extractor/LABEL changes needed)
- `src/runner.mjs` `BENCHMARKS` array — add `governance-tax` + `context-switch` (active), `memory-sanitizer` (commented, #147-gated, like the `http-throughput` exclusion precedent).
- `src/compare.mjs` `GOV_COST_ONLY` — add `"governance-tax"` for the manifest-vs-governed % column.
- `src/compare.mjs` glossary — one row each.
- Result JSON shape unchanged: `{ benchmark, results: { nodejs, python, wasm, galerinaGoverned, galerinaManifest, galerinaPassive } }` + benchmark-specific metric keys.

## Why this proves the 58–59× tax is *efficient*, not just *secure*
Decompose the single blended multiplier into: **(a)** fixed policy-decision floor [§1], **(b)** border-crossing latency [§2], **(c)** memory-isolation scrub [§3]. If (a) amortises to ~constant, (b) is small, and (c) is near `memset` speed, the 58–59× is **enforcement at or near its theoretical floor** — not interpreter waste a better runtime would erase. That turns "governance is expensive" into "governance is *as cheap as enforcement can be*."
