# Galerina R&D write-up — benchmark truth + performance, and THE HARD PATH (2026-06-17)

Consolidated report of the benchmark/performance R&D done in the worktree session. Companion docs: [galerina-interpreter-speedup-and-json-rd.md](galerina-interpreter-speedup-and-json-rd.md) (technical detail + cites), roadmap [galerina-roadmap-and-audit-2026-06-17.md](galerina-roadmap-and-audit-2026-06-17.md) §8 + R&D jobs 0013/0014/0015. All numbers are from a full extended run on i9-9900K (16c), archived at `packages-galerina/galerina-devtools-benchmarks/results/archive/2026-06-17_extended/`.

---

## 1. What was done

1. **Fixed a benchmark that was lying.** The cross-language comparison pitted Galerina's *inner-ops/sec* against the other languages' *whole-call/sec*, manufacturing false "Galerina wins" (nbody appeared to beat Node ~17× when Node is actually ~1,900× faster; same on collection-pipeline, low-memory, matrix-multiply). New `src/throughput-units.mjs` normalises every runtime to one canonical unit per benchmark; the runner stamps it and **fails the run on any unit mismatch**. Three workloads (matrix-multiply, tri-logic, data-query) are flagged **non-comparable** (different sizes/shapes per language) and excluded from winner claims.
2. **Added a memory dimension.** Every benchmark now reports heap-allocated-per-op (Node `--expose-gc`+heapUsedDelta, Python `tracemalloc`, native ~0). Makes the tree-walker's per-node boxing visible.
3. **Added real-world (CLBG) benchmarks.** mandelbrot, binary-trees, spectral-norm (+ earlier tmf-container, framework-pipeline) — all checksum-verified byte-identical across runtimes.
4. **Built a truth guarantee.** `npm test` (28 synthetic logic cases) + `npm run audit` (cross-language checksum identity, unit alignment, anti-inflation regression). `npm run snapshot -- <label>` archives runs for trend comparison.
5. **Investigated how to make it faster** (this report) and **measured the graph experiment** (§3).

---

## 2. The measured reality (why Galerina is slow)

The Stage-A interpreter is a **TypeScript tree-walker on V8** that **allocates a boxed `{__tag,value}` per AST-node eval** and pays a **governed frame per flow call** (deadline check, scope Maps, audit record with timestamps). No JIT, no monomorphic values, no result reuse.

| Workload | Winner | Galerina governed vs winner | vs Python |
|---|---|---|---|
| nbody | Node 123M force-evals/s | ~2,100× slower | 25× slower |
| collection-pipeline | Rust 13.1B elem/s | ~21,000× | 34× slower |
| mandelbrot | Rust 23.4M px/s | ~3,000× | 32× slower |
| JSON (json-parse) | Node 3.3M rec/s | ~450× | ~90× slower |

Heap/op makes the cause concrete: tree-walker **71.6 B/op** (record-allocation), **82.6 B/op** (mandelbrot) vs native ~0, Node ≤ 3 B/op. **Governance itself is cheap (~1.6×); dispatch + allocation dominate.** The three execution tiers today: bytecode VM (i32-only, ~14× the tree-walker, but rejects all calls/strings/records/floats), sync tree-walker (~2.7×, no strings/stdlib), async governed tree-walker (the slow always-on path that runs everything real).

**JSON specifically:** runs on the *worst* tier (async governed), every `split`/`slice`/`length` allocates fresh boxed strings, and there is **no first-class `json.parse`** — only an undocumented `json.decode` branch the benchmark avoids to stay deterministic.

---

## 3. The graph experiment — measured, not assumed

Galerina ships an `ExecutionGraph` (Phase 29B): a register-VM graph IR with slot-indexed bindings, NaN-boxing, disk cache, and an `EFFECT_CALL` op (so it *could* carry governance). On paper it bundles several speedups in one mechanism.

**Measured 2026-06-17:** ran every benchmark `main()` through `executeFlow({ egraphFastPath:true })` and recorded the actual tier. **All 16 flows fell back to `tree` — 0% graph coverage**, including a trivial `sum 1..100`. egraph and tree timings were identical (the graph bailed via `NOP` every time, then ran the tree-walker).

**Conclusion:** the register-VM *runtime* exists and works, but the **AST→graph *lowering* is a stub** — it emits `NOP` on basic `while`/`if`/`return`/flow-call shapes. "Use a graph" is the right architecture, but it is **not a flip-a-flag win**; it is a real lowering build. The experiment's value was stopping us from filing a misleadingly cheap R&D job.

---

## 4. Honest verdicts on the shortcuts considered

- **"Tri-logic makes JSON faster" — category error.** Tri-logic is the K3 *governance verdict* calculus (allow/deny/unknown→deny); it never touches parsing. The real adjacent idea is **simdjson-style branchless byte classification** (SIMD masks, not ternary logic), filed decoupled from governance.
- **"Galerina passive wins" — not a real win.** Those winner rows are LRU **cache hits** on repeated input, not recompute. Excluded from honest winner ranking.
- **"The graph is ~60% built" — too generous.** Runtime exists; lowering covers 0% (§3).
- **The pre-fix baseline (`full-suite-2026-06-16.json`) is not trustworthy** for Galerina throughput (it has the inflated numbers).

---

## 5. THE HARD PATH

There is no shortcut to "fast Galerina." The cheap win is small; the real wins are L–XL and gated by one non-negotiable constraint.

### The cross-cutting hard invariant (what makes this *hard*, not just "optimize an interpreter")
> **Governance fidelity.** Every faster tier must produce a result **and an audit/effect/capability trail byte-identical to the reference tree-walker**, fail-closed on any divergence, proven by **differential tests across the whole corpus**. You may not go fast by skipping a capability check, dropping an effect, or thinning the audit trail. This gate sits on top of every phase below and is **most of the cost** — it is the price of "fast *and still zero-trust*."

### Phase 0 — the only genuinely cheap win (do first; proves the harness)
- Wire the dead `SlottedScope` + remove the per-block `new Map(scope)` copy. **Effort S · risk low.**
- Helps every tier; no governance-semantics change. Exit: measurable delta vs `2026-06-17_extended`, suite + audit still green.

### Phase 1 — pure-tier coverage (safe speedups, no governance risk)
- Bytecode VM: implement the `CALL` opcode → promotes fib/nbody/mandelbrot/tri-logic to the ~14× tier. Activate the dead tagged-int path to kill `{__tag,value}` boxing in the sync walker. **Effort M · risk low** (these tiers run only pure+effect-free flows — governance already erased there).
- Hard part: VM/sync correctness. Gate with differential tests vs the tree-walker on pure flows. Exit: pure numeric benchmarks leave the `tree` tier; measurable.

### Phase 2 — the governed-path speedup (the genuinely hard interpreter work)
- Pick **one** vehicle. The experiment (§3) shows the graph is a stub, so **closure-compilation is the recommended lower-risk vehicle** for a *working* governed speedup; completing the ExecutionGraph lowering is the alternative (more complete, higher risk, L).
- **Build the governance-fidelity differential harness FIRST**, then the compiler. Cover the full language (control flow, flow calls + returns, records, strings, match, effects).
- **Effort L · risk HIGH** (this runs effectful flows — a wrong lowering is a *governance* bug, the cardinal sin). Exit: governed flows run compiled with byte-identical audit + measurable speedup; audit/test green.

### Phase 3 — JSON (a concrete, high-value workload)
- Native governed `json.parse` **effect** routed through `CapabilityHost`, with the parsed tree **taint/seal-tagged** (it's untrusted input — ties to SPORE-PRIVACY-002). String **views** to kill split/slice allocation. **Effort M.**
- Hard part: taint/effect propagation on parsed data is governance, not just speed. Exit: JSON workloads use the governed primitive; hand-rolled split is the fallback.

### Phase 4 — the ceiling: WASM as a *verified runtime tier* (the big one)
- Promote WASM from a `galerina build` CLI command to a tier in `executeFlow`.
- Hard parts, all real: (a) lower strings/records as real values, not opaque i32 handles; (b) **carry governance across the WASM boundary** — capability gates, effects, audit — with module **attestation** (signed/verified, effects provable); (c) host imports for strings/JSON + a branchless classifier; (d) effectful flows are currently `unreachable`-stubbed.
- **Effort XL · risk HIGH.** The governance-across-the-boundary is the crux — this is where "native-class speed *and still zero-trust*" is won or lost. Exit: governed flows AOT-compiled to attested WASM, within small multiples of native, audit-equivalent. **This is the honest long-term answer to "make Galerina fast."**

### Phase 5 — capability gaps (so real workloads are even expressible)
- B1 recursive `record` leaf terminator (no null/`Option<Record>`/payload-enum today) · B2 mutable indexed arrays (lists are immutable) · B3 fast-path floats (bytecode VM rejects → scaled-int everywhere). **Effort M each.** Needed for binary-trees (real nodes), spectral-norm, fannkuch, sort, sieve.

### The honest bottom line
- **Phase 0** is the only cheap thing, and it's small.
- **Phases 2 and 4** are the real wins and they are L–XL, fronted by the differential-fidelity harness that is most of the work.
- **There is no governance-free shortcut, no tri-logic magic, and no "flip on the graph."** The reason this is hard is precisely the reason Galerina exists: you have to prove you went fast *without* dropping a single governance guarantee.
- Sequencing: Phase 0 → Phase 1 (quick credibility) → build the fidelity harness → Phase 2 **or** jump to Phase 4 if you accept the XL cost for the real ceiling → Phase 3 + Phase 5 as workload-driven.

---

## 6. Artifacts (where things live)
- Suite + fixes: `packages-galerina/galerina-devtools-benchmarks/` (`src/throughput-units.mjs`, `src/audit.mjs`, `test/`, `src/snapshot.mjs`, `report.md`, `HANDOVER.md`).
- Archived baseline: `results/archive/2026-06-17_extended/` (re-comparable; `meta.json` has machine/git/audit status).
- R&D detail: `docs/Knowledge-Bases/galerina-interpreter-speedup-and-json-rd.md`; jobs 0013/0014/0015 in the roadmap §5.
- Verify any run: `npm test && npm run audit`. Full owner-facing run: `npm run bench`.
