# LogicN — Interpreter (tree-walker) speedup + JSON performance R&D (2026-06-17)

R&D brief spun out of the corrected benchmark suite. Goal: make the Stage-A interpreter less slow and JSON processing usable, **without ever relaxing the hard governance floor** (crypto-on-core, capability gate, secret/PII egress, border, audit). The honest ceiling is AOT-to-WASM; interpreter tricks only raise the floor of the worst case. Cites are `file:line` under `packages-logicn/logicn-core-compiler/src` (as-of research; may drift).

## Why it's slow (verified)
The async governed tree-walker (`interpreter.ts` `Interpreter` class, `evalExpr`/`executeStatement` big `switch`) **allocates a boxed `{__tag,value}` object per AST-node eval** (`interpreter.ts:19-42`) and pays a **governed frame per flow call** (deadline check + scope Maps + `ExecutionAuditRecord` with `Date` timestamps — `runFlow` `interpreter.ts:840`, `buildResult` `983-1021`). Scopes are `Map`-per-block with linear lookup (`1024-1037`); the sync tier even copies the whole scope per block (`new Map(this.scope)` `interpreter.ts:350`).

## Current state — what's already optimized vs dead/unwired (don't re-propose; DO activate)
| Mechanism | Status | Cite |
|---|---|---|
| Pure-flow LRU result cache ("passive") | **Live** (pure fast path only) | `pure-flow-cache.ts` |
| Bytecode VM (i32-only, alloc-free loop) | **Live but gated**; rejects strings/records/floats and **all `callExpr`** (no CALL opcode) | `bytecode-vm.ts:263-273` |
| Sync tree-walker (no async tax) | Live, gated | `interpreter.ts:303-532` |
| O(1) binary-op dispatch map; int pool; singleton bools | Live | `interpreter.ts:83-151,51-65` |
| Tier selection (cache→VM→sync→egraph→governed) | Live; fast path needs `pureFastPath` + `isPureEffectFree` | `interpreter.ts:2525-2730` |
| **Tagged-int / NaN-box helpers** | **DEAD** (defined, unused — walker still boxes) | `interpreter.ts:196-235` |
| **SlottedScope / assignSlots** (O(1) array bindings) | **NOT WIRED** | `interpreter.ts:2748-2801` |
| **ExecutionGraph** linear IR + slot VM | **Built, gated OFF** (bails on NOP) | `execution-graph.ts` |
| `tryWhileFastPath`, `register-vm.ts` | **Stubs** | `interpreter.ts:2832`, `register-vm.ts` |
| **WASM AOT** (wat-emitter→assembler→runtime) | **A `logicn build` CLI command, NOT a runtime tier**; strings/records are opaque i32 handles; no JSON host import | `cli.ts:741-912`, `wasm-runtime.ts` |

## A. Tree-walker speedup techniques (ranked by impact × feasibility-under-governance)

> **0. Finish + enable the `ExecutionGraph` register-VM (graph IR) — the highest-leverage move, and ~60% already built.** *(impact L · effort M · gov: needs differential proof, see below)*
> `execution-graph.ts` (262 LoC) lowers a flow's AST **once** to a flat graph of register ops (`LOAD_CONST/LOAD_SLOT/STORE_SLOT/BINOP/UNOP/CALL/EFFECT_CALL/NOP`) with **Int16 slot indices replacing `Map` scope lookups**, a constants pool, an `effectMask`, and **memory+disk caching of compiled graphs** (`getOrLoadGraph/storeGraph`). `runFromGraph` (`interpreter.ts:2475`) executes it **without re-walking the AST**, using **NaN-boxing** (no `{__tag,value}` alloc). So this ONE mechanism bundles techniques 1–3 below (no-re-walk + slot scopes + unboxed values) **plus** compile-once-persist.
> **Why it's off:** any construct it can't lower yet emits `NOP` → `runFromGraph` returns `null` → falls back to the tree-walker; it's gated behind `egraphFastPath` (default false) so it currently accelerates nothing. **The work:** (a) complete the lowering so common constructs (records, member/stdlib calls, `match`, `while` edge cases) stop emitting `NOP`; (b) it already has an **`EFFECT_CALL` (capability-gated, effect-recording) op**, so unlike the int-only bytecode VM it *can target the slow GOVERNED path* — but that requires proving **governance fidelity**: a differential test that the graph's result **and audit trail / effect set** are byte-identical to the tree-walker's for every flow, fail-closed on mismatch (a wrong graph = a governance bug, the cardinal sin). (c) Graduate `egraphFastPath` to default for flows it fully covers; measure vs the `2026-06-17_extended` baseline.
> **Relationship to the others:** completing the graph **supersedes building closure-compilation (#1) separately** (the graph is the more complete vehicle) and realises #2/#3 inside it. WASM (#8) remains the long-term ceiling, but the graph is the near-term win for the *governed* interpreter (WASM-as-a-tier can't run effectful flows yet).
>
> **⚠️ EMPIRICAL REALITY CHECK (measured 2026-06-17).** Ran every benchmark `main()` through `executeFlow({ egraphFastPath:true })` and recorded the actual `executionTier`: **all 16 flows fell back to `tree` — 0% graph coverage**, including a trivial `sum 1..100`. egraph and tree timings were identical (the graph bailed via `NOP` every time). So the earlier "~60% built" was too generous: the *register-VM runtime* (slots, NaN-box, disk cache, `EFFECT_CALL`) exists and executes, but the **AST→graph lowering covers essentially nothing** — even basic `while`/`if`/`return`/flow-call shapes emit `NOP`. **Revised effort: L (not M).** The real work is writing the lowering (control flow, flow calls + returns, records/strings) + governance-fidelity differential tests — not "finish a few NOP cases." Honest implication: closure-compilation (#1) may reach a *working* governed-path speedup with less risk than completing the graph lowering, and WASM (#8) is still the ceiling — re-weigh graph-completion against those before committing.

1. **Closure ("continuation") compilation** — compile AST→nested `(scope)=>value` closures once; governed nodes capture enforcer/audit calls so the floor is preserved. Removes per-node `switch` + string re-parse. Classic 2–4× win; helps the **governed** path too. *(impact L · effort M · gov full)*
2. **Kill per-node `{__tag,value}` allocation** — wire the already-dead tagged-int path (`196-235`) into the sync walker + binary dispatch; intern small floats/strings. The #1 cost, currently unrealized. *(L · M · full)*
3. **Slot-array scopes; remove `new Map(this.scope)` per block** — `SlottedScope` exists but unused; the sync per-block scope copy (`:350`) is quadratic in loop bodies (taxes JSON directly). *(M · S · full)*
4. **Expand bytecode VM: implement the `CALL` opcode**, then a string/record lane. CALL alone promotes fib/nbody/mandelbrot/tri-logic (int + intra-module calls) from sync walker to the ~14× VM. VM only runs pure+effect-free flows → governance-safe. *(L numeric / M strings · M→L · pure-tier)*
5. **Compile-time constant folding / CSE / loop-invariant hoist** (e.g. json-parse re-evals `pairs.length()` each iter). *(M · M · full)*
6. **Inline caching + monomorphic shapes** for field/method/stdlib dispatch (`evalCall` rebuilds `receiver.method` strings each call; `callStdlib` is sequential awaited probes). Big win for stdlib-heavy (JSON) code. *(M · M · full)*
7. Dispatch tuning (superinstructions/peephole; finish egraph). Marginal — V8 `switch` is already near-optimal, no computed-goto in JS. *(S–M · S · pure-tier)*
8. **The real answer — promote WASM to a verified runtime tier** (it's only a build command today). Interpreter tricks won't close a 100–2000× numeric gap; AOT-WASM gets within small multiples of native. *(L · L · full, heavy)*

## B. JSON processing fixes (ranked)
JSON today runs on the **async governed tree-walker** (string member-calls bail out of both fast tiers); each `split`/`length`/`slice` allocates fresh boxed strings (`stdlib.ts:297-353`), and there is **no first-class `json.parse`** — only an undocumented `json.decode` branch (`interpreter.ts:1540-1550`) the benchmark deliberately avoids to stay deterministic. Measured: governed ≈ 7,357 records/s vs Node ≈ 3.3M (~450×).
1. **Native governed `json.parse` effect (taint/seal-tracked)** — expose via `CapabilityHost`/`resolveCapabilityEffect` so it's auditable and the result tree carries source taint (ties to LLN-PRIVACY-002 / SealTaint). Reuses JS `JSON.parse`+`jsObjectToLogicN`, but as a declared effect, not a `pure` stdlib call. **Highest-value JSON fix.** *(L · M)*
2. **String views to kill split/slice allocation** — activate the dormant `views.ts` `StringView`; back strings with offset/length over a shared buffer → O(1) slices. *(M · M)*
3. **Route string/JSON flows to WASM + add `__str_split`/`__json_*` host imports + a simdjson-style branchless byte classifier.** Path to native-class throughput, behind the existing attested-WASM admission. *(L · L)*
4. Stopgaps: ASCII-fast-path `length` (avoid `[...s].length` spread), memoize `split`/`length`, hoist invariants. *(S · S)*

## C. HONEST verdict — "tri-logic should make JSON faster" = category error
`three-valued-governance.ts` is a **Kleene K3 governance-verdict calculus** (`ALLOW/+1 · DENY/-1 · INDETERMINATE/0`, `vAnd=min vOr=max vNot=neg`, INDETERMINATE→deny, `LLN-GOV-3VL-001`). It decides **authorization at trust boundaries** and never touches strings, the eval loop, or the stdlib. **There is no path by which 3-valued governance speeds up parsing.** Do NOT file a "tri-logic → faster JSON" job.
- **The real adjacent kernel (separate, not "tri-logic"):** simdjson-style **branchless byte classification** — build a SIMD bitmask of structural bytes (`{ } [ ] : ,`, quote/whitespace state) and process branchlessly. That's **SIMD masks + bit-parallelism, not ternary logic**; the only commonality with the tri encoding is "branch elimination." File it as its own job under the **WASM JSON path** (B.3), explicitly decoupled from governance tri-logic.
- The existing `{-1,0,+1}` Int8 tri encoding (Kleene = `min/max/neg`, branchless) IS a good candidate to lower to WASM — but that speeds up **governance gate evaluation**, not parsing.

## → Roadmap R&D jobs (see logicn-roadmap-and-audit-2026-06-17.md §5)
- **0014 — Tree-walker speedups:** bytecode `CALL` opcode (A4) · closure-compilation (A1) · activate dead tagged-int path (A2) · wire SlottedScope + drop per-block Map copy (A3). Near-term; raises the worst-case floor.
- **0015 — JSON performance:** native governed `json.parse` effect with taint/seal (B1) · activate `views.ts` string views (B2) · WASM JSON path with `__str_split`/`__json_*` + simdjson-style branchless classifier (B3). The classifier is its own sub-item, **NOT** under tri-logic (see §C).
- Cross-cutting: **promote WASM from CLI build to a verified runtime tier** (A8) is the honest long-term answer for both — already partly built (`wat-emitter.ts`).
