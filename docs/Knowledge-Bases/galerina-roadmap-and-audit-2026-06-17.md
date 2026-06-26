# Galerina — Completion % Audit + Roadmap (2026-06-17)

> **⏩ SUPERSEDED 2026-06-21 → [galerina-roadmap-and-percent-audit-2026-06-21.md](galerina-roadmap-and-percent-audit-2026-06-21.md) (53/53 · 4,989).** The 49/49 · 4,518 figures below are a 2026-06-17 historical snapshot — do not cite them as current.

Consolidates: the independent [zero-trust senior-developer audit](../../notes/2026-06-17-zero-trust-senior-developer-project-audit.md), the corrected cross-language benchmarks, the settled-decision reopen-triage, and the active R&D queue. Authoritative test/package counts come from the test runner, not from stale metadata.

## 1. Verified state

| Metric | Verified | Stale claims to fix |
|---|---|---|
| Tests | **4,518** (`npm test`) · core 3,583 | `version.json`=4,346 · `SECURITY.md`=4,481 · README (now fixed)=4,518 |
| Packages | **49/49** green | `version.json`=47 · `SECURITY.md`=48 |
| Border check | fail-closed (0 admitted, 1 denied) | — |
| Dep audit | 0 vulns (compiler, tower-citizen); `galerina-ext-tmf` has no lockfile | — |
| Licences | all permissive/free; `THIRD-PARTY-NOTICES.md` shipped | — |

**Verdict (audit):** *governance-first compiler/runtime prototype with several hardened zero-trust components and a growing tri/photonic compute model — not yet a production-complete zero-trust app, and the Tower is a governed software simulator, not real photonic-CPU virtualisation.*

## 2. Completion % by layer (honest)

- **Production-grade (≈100%):** spec/KB, lexer, parser, governance verifier, contract blocks, value-state checker, DRCM Phases 1–7 (Stage-A sim), CBOR manifests, full test suite, devtools.
- **High (~85–90%):** type checker, effect checker, WAT emitter (#128(a) fail-closed fix landed; `forEachStmt` lowering open), runtime interpreter (diagnostic tier).
- **In progress:** Stage-B WASM self-hosting (`tokenize` byte-parity done; parser/checker/verifier flows remain), PQ & hardware security (~38%), `.tmf` engine (slices 1–3 done, slice 4 = signing/verify-before-read next).
- **Early / template:** target bridges (~22%), AI Inference Tower (~12%, default bridges are governed dev stubs), photonic/ternary (~3%, simulation only), **app/API/framework layer = templates (not complete apps)**, several data/db/web/registry packages documentation-only.

## 3. Priority remediation (from the audit — the "do it" list)

**P0**
1. **Historical signing-key exposure** — old key was in git history (`cb5036d`), rotated to `ab46f4c7…`; history scrub still pending. Finish the scrub or publish a key-compromise remediation record; rotate any signatures derived from the exposed key; add a CI secret scan; replace the `SECURITY.md` contact placeholder.
2. **Live governance plugin denied** — `governance/plugins/groq-inference-v1/manifest.json` has `sourceHash: sha256:pending-galerina-promote` (a network-capable inference plugin). Replace with a real hash, sign, pin the key, and put `border-check` in CI — or remove it from production admission.
3. **Typecheck not reproducible repo-wide** — several packages can't `tsc` cleanly (missing local tsc; `WebAssembly` lib namespace missing for WASM `.d.ts`). Add a root-level typecheck that works from a clean install; make CI not rely on stale `dist`.

**P1** — stale release evidence (sync `version.json`/`SECURITY.md` to 4,518/49 + command provenance; **fail CI on stale counts**) · CLI `verify` must be strict-by-default in production (missing manifest/key, placeholder sig, or verify exception must fail closed; print the profile) · app/framework packages are templates (present honestly) · classify every package `active|template|planned|archived|experimental` and exclude non-active from production counts · keep generated `.exe`/native artifacts out of git (or sign + provenance).

**P2** — `galerina.mjs` (~70 KB) is a large security-sensitive entry point; split high-risk command logic into tested modules, keep the entry as dispatch only.

**Tower-Citizen completion criteria** (audit §): native bridge **`canCommit()` gating before native execution** (currently documented but not called — high-severity bridge-boundary), certified mode must require *certified* (not merely *signed*) manifests, real signed package hashes, packed end-to-end ternary path, fixed-point scale, complete BridgeOp metadata, NVFP4 implemented-or-explicitly-unavailable, mid-compute revocation, `.tmf` verify-before-read, real plugin isolation (current `PluginSandbox` is a validator, not isolation).

## 4. Performance review — how Galerina works, and how to make it competitive

**Why the Stage-A interpreter is the slowest tier (measured, i9-9900K):** it is a TypeScript tree-walker on V8 that **allocates a boxed `{__tag, value}` object per AST node evaluation** and pays a governed frame per flow call. There is no JIT, no monomorphic value representation, no result reuse across calls. CPython's C eval loop beats it on hot numeric loops; native Rust and Galerina's *own* WASM output beat both by 100–1,000×. Governance itself is cheap (~1.6×) — dispatch + allocation dominate.

**The levers (in priority order):**
1. **Route real workloads to the WASM tier (biggest win, already native-class).** The interpreter is a reference oracle; production should AOT-compile to WASM. This is the honest answer to "make Galerina fast."
2. **Graduated `governance: auto` mode (adoption lever).** Default `full`; `auto`/`lean` skip runtime governance for compiler-proved pure/effect-free flows so an ordinary app (e.g. a blog) costs ~zero governance — **without** ever relaxing the hard floor (crypto-on-core, capability gate, secret/PII egress, border). Opt-down must be monotone-safe (never flip Deny→Allow). → R&D job **0011**.
3. **Governance caching** — cache compiled *evaluators* and monomorphic value shapes, **never decisions/verdicts** (#194 GateCache + #127 shape-stable objects). Learn from the benchmark caveat: passive-mode "wins" were LRU cache hits on repeated inputs, not recompute.
4. **Reduce per-node allocation** in the tree-walker (tagged-int / NaN-boxing for the common numeric path) — caps the interpreter's worst case even though WASM is the real answer.

> Net: Galerina does not need to "beat Python" in the interpreter — it needs to **route to WASM by default and offer `auto` governance** so real apps get native-class speed with right-sized assurance.

## 5. R&D queue (dispatched to the `_session-bridge`)

| Job | Topic |
|---|---|
| 0006 | Note 37 — mine n-valued/Belnap-for-audit for extractable value |
| 0007 | Note 38 — elastic-precision: contract-`tolerance` → `routePrecision` + repair the formula |
| 0008 | Note 39 — simulate the zero-trust border *absorbing* .tmf/audit/PCI-DSS (compute model) |
| 0009 | Tri-Pipe heterogeneous engine + Heterogeneous Handoff Invariant (skeptical + corrected maths) |
| 0010 | Nested quantum sim inside the continuous engine (feasibility vs existing ffsim bridge) |
| 0011 | Realistic/partial `governance: auto` mode + caching (adoption) |
| 0012 | Reopened triage watch-items (crypto stopgaps · GateCache honesty · C++ bridge precondition) |
| 0013 | Make Galerina able to express standard benchmarks (B1 recursive-record leaf terminator · B2 mutable arrays · B3 fast-path floats) |
| 0014 | **Tree-walker speedups — lead with the GRAPH IR.** Finish + enable the already-built `ExecutionGraph` register-VM (Phase 29B, `execution-graph.ts`, gated off): lower AST→flat graph once (slot-indexed bindings, NaN-boxed values, no AST re-walk, compile-once disk cache). It bundles slot-scopes + tagged-int + no-re-walk in one mechanism, and its `EFFECT_CALL` op means it can target the **governed** path — gated on a **governance-fidelity differential test** (graph result + audit/effect set byte-identical to the tree-walker, fail-closed). Completing it supersedes separate closure-compilation. Also: bytecode `CALL` opcode (pure tier). Honest ceiling = promote WASM from CLI build to a verified runtime tier. **⚠️ Measured 2026-06-17: the graph currently covers 0% of benchmark flows (all bail to tree-walker via NOP) — the register-VM runtime exists but AST→graph lowering is a stub; effort is L, and closure-compilation may be the lower-risk path to a working speedup.** KB: [galerina-interpreter-speedup-and-json-rd.md](galerina-interpreter-speedup-and-json-rd.md) §A (item 0) |
| 0015 | **JSON performance** — native governed `json.parse` effect (taint/seal-tracked) · activate `views.ts` string views (O(1) split/slice) · WASM JSON path with `__str_split`/`__json_*` host imports + a **simdjson-style branchless byte classifier**. ⚠️ NOT "tri-logic makes JSON faster" — that's a category error (tri-logic = K3 governance verdicts, not parsing); the branchless classifier is SIMD masks, filed decoupled from governance. KB §B/§C |

**Benchmark-driven perf R&D (0014/0015) added 2026-06-17** from the corrected suite: the Stage-A tree-walker is 100–2000× off native on numeric loops and ~450× off Node on JSON (per-node boxing + per-string-op allocation on the worst tier; no native JSON primitive). Several high-value optimizations are **already built but dead/unwired** (tagged-int helpers, `SlottedScope`, ExecutionGraph, WASM-as-build-only) — activation is the near-term lever. Owner hypothesis "tri-logic speeds up JSON" was triaged as a **category error** and explicitly NOT filed as such.

**Key Custody / revocation (Gap B) — SHIPPED 2026-06-17 (core):** `governance/revocations.json` + `revocation-registry.mjs` + fail-closed `v(k)` pre-check in `galerina.mjs verify` → compromised key `8eecf4187ebc9341` now evaluates to **Deny** even with a valid signature; registry is **tamper-evident** (self-signature verify, fail-closed on edit-without-re-sign; owner-signer `governance/sign-revocations.mjs`). NEXT: v2 trust-anchor pinning (rogue-signer fix) → wire `isKeyRevoked` into border-check + bridge-attestation + promote to `galerina-core-security`; Gap A (#110) deferred (ext defaults fail-closed). See [galerina-key-custody-and-rotation.md](galerina-key-custody-and-rotation.md).

**In flight / execution (not R&D):** ML-DSA-65 #34 (key custody #149) · `.tmf` slices 3→4 · ffsim #199 Phase-2 · domain guards (shipped) · ASIC grammar (software half shipped) · benchmark suite overhaul (own worktree session — **DELIVERED 2026-06-17, see §8**).

## 6. Reopen-triage outcome (discipline)

The recent extensions overwhelmingly **confirmed** settled decisions (SHA-256-keep, TMX-rejected-for-core — vindicated by building `.tmf` in *ext*, K3 calculus, the 4 zero-trust mandates, substrate contracts, DRCM locks). Only **#128 WAT fail-open** was a genuine reopen-now (fixed, part a). Parked-with-trigger items (crypto-format versioning ← #149; inter-flow warning + GOV-003 ← one inter-procedural taint engine; mid-compute revocation ← a real long-running use case) stay parked until their triggers fire. Full detail in the session triage.

## 7. Near-term sequence (recommended)

1. P0 secret-history remediation + plugin hash + CI border-check/secret-scan.
2. Repo-wide typecheck reproducibility + sync `version.json`/`SECURITY.md` (fail CI on stale counts).
3. Strict-by-default production `verify`; classify packages; clean native artifacts from the tree.
4. Tower-Citizen P0: enforce `canCommit()` before native execution.
5. `governance: auto` + caching design (0011) → the adoption + performance story.
6. `.tmf` slice 4 (signing / verify-before-read) — folds in crypto-stopgap decisions (0012).

## 8. Benchmark suite overhaul — DELIVERED 2026-06-17 (worktree session handover)

> **Full R&D write-up + THE HARD PATH (honest performance plan):** [galerina-rd-benchmarks-and-performance-2026-06-17.md](galerina-rd-benchmarks-and-performance-2026-06-17.md). Governance-fidelity is the cross-cutting hard invariant; Phase 0 is the only cheap win; Phases 2 (governed-path compilation) and 4 (WASM-as-a-tier) are the L–XL real wins. No tri-logic magic, no flip-on-the-graph (graph lowering measured at 0% coverage).

**What shipped** (`packages-galerina/galerina-devtools-benchmarks`):
1. **Unit-truth fix.** The cross-language comparison was *lying*: compare.mjs pitted Galerina's inner-ops/sec against the other languages' whole-call/sec, producing false "Galerina wins" (nbody showed Galerina "beating" Node ~17× when Node is actually ~1,900× faster; same on collection-pipeline, low-memory, matrix-multiply). New `src/throughput-units.mjs` normalises every runtime to ONE canonical unit/benchmark; `runner.mjs` stamps `normThroughput` + a `units` block and **fails the run on any unit mismatch**; `compare.mjs` reads only the normalised field. **matrix-multiply, tri-logic, data-query are flagged non-comparable & excluded** (different workload sizes/shapes per runtime).
2. **Per-op memory dimension.** Every benchmark now reports heap-allocated-per-op (Node `--expose-gc`+heapUsedDelta; Python `tracemalloc`; native Rust/C++ ~0 by design). compare.mjs §4 has a Heap/op column + per-benchmark memory winner.
3. **New real-world (CLBG) benchmarks:** `mandelbrot` (scaled-int, runs on Galerina's fast path), `spectral-norm` (Node/Python/Rust only), `binary-trees` (allocation/GC — the headline memory benchmark). Plus earlier `tmf-container` (.tmf creation; the Node column **is** the `@galerina/ext-tmf` engine) and `framework-pipeline` (App Kernel vs middleware chain). All checksum-verified byte-identical across runtimes.
4. **Truth guarantee (so it can't silently start lying again):** `npm test` (synthetic normalisation logic, 28 cases) + `npm run audit` (`src/audit.mjs` — cross-language checksum identity, unit alignment, anti-inflation regression over latest.json). `npm run bench` = full run + compare + audit.

**POLICY (owner directive):** when the owner asks for benchmarks, run the **FULL** suite (no `--quick`) with tables **ordered by winners**. `--quick` is CI/dev only.

**R&D / to-do — Galerina is NOT YET able to express standard cross-language benchmarks.** The suite confirmed three language gaps; until closed, Galerina can only compete on integer-scalar kernels (bytecode/WASM tier), and several canonical benchmarks (binary-trees with real nodes, spectral-norm, fannkuch, base64, k-nucleotide) are inexpressible or run only on the slow immutable tree-walker:

| # | Gap | Evidence | Blocks |
|---|---|---|---|
| B1 | **Recursive `record` types have no leaf terminator** (no `null` / `Option<Record>` lowering / payload-carrying enum variant) | binary-trees `.spore` had to fall back to a count-only fused recursion — it cannot allocate a real tree | binary-trees (real nodes), any linked/tree data structure, honest allocation benchmarks |
| B2 | **No mutable indexed arrays** (lists are immutable; `push` returns a new list; tree-walker-only) | spectral-norm excluded (power iteration needs a mutable vector); fannkuch deferred | spectral-norm, fannkuch-redux, in-place sort, sieve, any array kernel |
| B3 | **No native floats on the fast path** (bytecode VM rejects float literals → drops to slow tree-walker; cross-runtime FP also diverges) | every numeric benchmark uses scaled-int ×1000 (nbody, matrix, mandelbrot) | clean float numerics; forces scaled-int workarounds |

(Bitwise `& | ^ << >>` are engine-side **by design** — permanent — which also blocks base64/hashing in `.spore`; not a gap to fix, just a constraint to note.)

Suggested R&D job: *"Make Galerina able to express standard data-structure/array benchmarks"* — prioritise B1 (recursive-record leaf terminator, e.g. `Option<Record>` lowering or a nil node) and B2 (a fixed-size mutable integer array on the bytecode path). B3 (fast-path floats) is lower priority — scaled-int is an acceptable workaround and the honest answer is "route to WASM."
