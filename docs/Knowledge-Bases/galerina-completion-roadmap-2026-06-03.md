# Galerina — Completion Roadmap (2026-06-03)

Six layers to 100%. Priority order: KB first, WASM last.

---

## Phase 1 — Specification / KB (99% → 100%)
**Goal:** Every new concept from this session fully indexed; wasmtime path documented.

| # | Task | Status |
|---|---|---|
| 1.1 | wasmtime KB doc — Stage-B to WASM build path, baseline numbers | pending |
| 1.2 | MEMORY.md — index all new KB docs from this session | pending |
| 1.3 | Contract authoring guide — add cyber_physical_hardening + liability rows, update checklist | pending |
| 1.4 | CEC check — verify 39 examples still parse clean, no regressions | pending |

---

## Phase 2 — Contract Blocks (95% → 100%)
**Goal:** All 16 contract sub-blocks parsed + validated; not just retained in AST.

| # | Task | Status |
|---|---|---|
| 2.1 | `request {}` content validation — `accepts`, `requires` field checking | pending |
| 2.2 | `response {}` content validation — `returns`, `denies` field checking (extend SPORE-GOV-003) | pending |
| 2.3 | `limits {}` enforcement — validate that declared CPU/memory/time limits are syntactically correct and warn if limits are unreachable given the security profile | pending |
| 2.4 | `authority {}` deep validation — validate that `requires` references known capabilities; warn on overly broad authority (no `reason` = SPORE-GOV-007 already, but add `requires *` detection) | pending |
| 2.5 | `observability {}` and `model {}` and `context {}` blocks — currently parsed/retained but not validated; add basic validation | pending |

---

## Phase 3 — Governance Verifier (88% → 100%)
**Goal:** All deferred diagnostics implemented; epilogue auto-policy live.

| # | Task | Status |
|---|---|---|
| 3.1 | SPORE-GOV-006 GOVERNANCE_PROOF_REQUIRED_BUT_MISSING — high-risk flow (high max_risk_liability) with no epilogue {} fires a warning | pending |
| 3.2 | Epilogue auto-policy — governance verifier auto-assigns sha256_seal to the ProofGraph when economics.max_risk_liability ≥ threshold, without requiring explicit epilogue {} declaration | pending |
| 3.3 | `decreases` keyword — parser recognises `pure flow f(n: Int) decreases n { ... }` signature modifier; governance verifier enforces SPORE-TERM-001 (decreasing metric) | pending |
| 3.4 | SPORE-TERM-001 MISSING_TERMINATION_PROOF — fires warning when a recursive flow in `strict` profile lacks a `decreases` annotation | pending |
| 3.5 | SPORE-GOV-001 INTENT_BEHAVIOR_MISMATCH — heuristic: fire warning when intent string contains action verbs that contradict declared effects (e.g. intent says "read only" but effects include `database.write`) | pending |

---

## Phase 4 — Value-state checker (90% → 100%)
**Goal:** All taint propagation paths covered; source_from annotation.

| # | Task | Status |
|---|---|---|
| 4.1 | List taint propagation — `.append(tainted)`, `.map(fn_using_tainted)`, `.filter(fn)` all propagate taint to the result list | pending |
| 4.2 | Deep nested record field taint — `record.field.subfield` access propagates taint if any level is tainted | pending |
| 4.3 | Inter-flow taint tracking — if flow A calls flow B with a tainted argument, flow B's parameter is marked tainted (cross-flow taint inference) | pending |
| 4.4 | `source_from` annotation — `param: Type source_from Network.ClientSocket` declares the param's origin; auto-infers `unsafe`-equivalent taint without requiring explicit `unsafe let` at the call site | pending |

---

## Phase 5 — DevTools (90% → 100%)
**Goal:** All devtools packages at production quality; snarkjs real prover.

| # | Task | Status |
|---|---|---|
| 5.1 | `galerina-ext-proof-snarkjs` Phase 2 — real Groth16 circuit with snarkjs `plonk` fallback; actual proof verification; remove PENDING stub label | pending |
| 5.2 | `galerina-devtools-intelligence` — differential re-indexing (SHA-256 file stamps; only re-index changed files); W3C PROV serialisation mode in `devtools-provenance` | pending |
| 5.3 | `devtools-naming` — fix the 28 findings in auth-service examples where possible; distinguish intentional short names (loop counters) from real violations | pending |
| 5.4 | `devtools-context` receipts — add `--diff` mode (show receipt delta between two versions); improve token reduction % tracking | pending |

---

## Phase 6 — WASM Execution (96% → 100%)
**Goal:** `wasmtime galerina.wasm program.spore` works. governance-cost jumps from 3.2K/s → ~500M/s.

| # | Task | Status |
|---|---|---|
| 6.1 | Compile `runtime.spore` through Phase 27 WAT emitter → `galerina-runtime.wat` | pending |
| 6.2 | Assemble `galerina-runtime.wat` → `galerina-runtime.wasm` via wabt | pending |
| 6.3 | WASI host shim — expose `wasi:filesystem` + `wasi:cli` to `galerina-runtime.wasm` so it can read `.spore` source files | pending |
| 6.4 | `wasmtime galerina-runtime.wasm <program.spore>` — end-to-end run | pending |
| 6.5 | Benchmark: governance-cost governed via wasmtime vs baseline 3.2K/s | pending |
| 6.6 | WASM SIMD expansion — f32x4, i8x16 shuffle, vectorised string ops for text-html + matrix-multiply | pending |

---

## Baseline for Phase 6 comparison (2026-06-03)

| Benchmark | Current (Stage-A tree-walker) | Target (Stage-B WASM) |
|---|---|---|
| governance-cost governed | **3.2K/s** | ~500M/s |
| arithmetic-threshold governed | **859.7K/s** | ~3–4B/s |
| data-query governed (winner) | **228.3K/s** | 228K+ (maintain lead) |
| nbody governed | **62.6K/s** | >62.6K/s |
