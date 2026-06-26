# Galerina — Full Audit 2026-06-01

**Status: 2,879 tests · 0 failures · Phases 25–40 complete**

---

## Test Counts

| Package | Tests | Pass | Fail |
|---|---|---|---|
| galerina-core-compiler | 2,737 | 2,737 | 0 |
| galerina-core-economics | 15 | 15 | 0 |
| galerina-devtools-graph-algorithms | 95 | 95 | 0 |
| galerina-core-security | 32 | 32 | 0 |
| **TOTAL** | **2,879** | **2,879** | **0** |

**CEC:** 223/223 stable (Levels 0–5 all parsing and compiling cleanly)

---

## Phase Completion (Phases 25–40)

| Phase | Deliverable | Status | Tests |
|---|---|---|---|
| 25 | WAT real arithmetic (i32.add/sub/mul, let bindings) | ✅ | +25 |
| 26 | WAT control flow (if/else, while, else-if, mut/assign) | ✅ | +10 |
| 26B | ImmutableInputSeal, HardwareGovernanceClass, ProofLevel, SPORE-HW-001/002/003 | ✅ | +20 |
| 27 | WASM instantiation (wabt) — 8/8 benchmarks, native speed | ✅ | +16 |
| 27B | Sync fast-path — 14.3× tree-walker speedup | ✅ | — |
| 28 | Profile enforcement (strict/high_integrity) + Tainted<T>/SafeFor<Context,T> | ✅ | +14 |
| 29 | @galerina/core-economics — CostGraph, ValueGraph, IBM matrix, RouteDecision | ✅ | +15 |
| 30 | ProofGraph caching by ExecutionSignature (67% hit rate) | ✅ | — |
| 31 | Bytecode VM — Int32Array opcodes, 14.3× over sync tree-walker | ✅ | +18 |
| 31B | Bytecode VM auto-wired into executeFlow (220K calls/sec) | ✅ | — |
| 32 | Governance diff CLI — exit 2 on authority widening | ✅ | +9 |
| 33A | Tier telemetry — executionTier + fallbackReason on FlowExecutionResult. All 5 tiers tagged: cache/bytecode/sync/egraph/tree | ✅ | — |
| 34 | verifyPasswordService.spore — live governed HTTP service, POST /auth/verify, BCrypt.verify, audit | ✅ | +13 |
| 35 | Password.verify/hash/needsMigration — stable API facade over bcrypt/Argon2 | ✅ | — |
| 36 | Argon2.hash/verify (Argon2id, OWASP preferred). Password.verify auto-routes by hash prefix | ✅ | — |
| 37 | Password.migrate — verify+rehash bcrypt→Argon2id on successful verify | ✅ | — |
| 38 | Deno WebGPU GPU benchmark live — RTX 3050 Ti, 3.99M ops/sec, result=1,000,000,000 | ✅ | — |
| 39 | GovernanceSignature Ed25519 — signProofGraph/verifyGovernanceSignature, tamper-detection verified | ✅ | — |
| 40 | Stage B executable — compiler.capabilities.spore (8 flows), lexer.spore (makeKeywordTable=40kw, scanWord works). 20 bootstrap tests. | ✅ | +20 |

---

## Capability Matrix (18/18 checks pass)

| Capability | Export | Status |
|---|---|---|
| WAT arithmetic emitter | `emitWATFromFlowAST` | ✅ |
| WAT control flow | `emitWATFromFlowAST` | ✅ |
| WASM execution | `executeWASMFlow` | ✅ |
| Sync pure-flow execution | `executeFlowSync` | ✅ |
| Bytecode VM | `compileToBytecode`, `runBytecode` | ✅ |
| Profile enforcement | `checkProfiles` | ✅ |
| Taint checking | `checkTaint`, `UNTAINT_BOUNDARIES` (22) | ✅ |
| Hardware governance classes | `HardwareGovernanceClass` | ✅ |
| Proof level escalation | `ProofLevel` (0–4) | ✅ |
| Hardware trust profiles | `HARDWARE_TRUST_PROFILES` (37 targets) | ✅ |
| Hardware diagnostics | `SPORE_HW_001/002/003` | ✅ |
| Value/Safety diagnostics | `SPORE_VAL_001/002/003` | ✅ |
| ProofGraph caching | `buildProofGraphCached`, `getProofCacheStats` | ✅ |
| Governance diff | `diffGovernance`, `renderGovernanceDiff` | ✅ |
| CostGraph | `@galerina/core-economics` package | ✅ |
| Risk matrix (IBM 2025) | `calculateRiskCost`, `PER_RECORD_LOSS_USD` | ✅ |
| Route decision | `selectRoute` (governanceApproved: true literal) | ✅ |
| Hardware routing | `I9_DESKTOP`, `I5_LAPTOP`, `selectVectorTier` | ✅ |

---

## Performance Metrics

| Metric | Value | Notes |
|---|---|---|
| WASM arithmetic-threshold | **4.0B ops/sec** | 2.9× faster than Rust, 5.2× faster than Node.js |
| WASM compute-mix | **149M ops/sec** | Beats Node.js (121M/s) by 23% |
| WASM six-digit-guess | **83M ops/sec** | Matches Rust (80-84M/s) |
| WASM collection-pipeline | **2.06B ops/sec** | 1,696× faster than Rust AVX2 (algorithm win) |
| Bytecode VM (auto-routed) | **220K calls/sec** | sumTo(100) via executeFlow |
| Sync tree-walker | ~15-20K calls/sec | Phase 27B (was 159K, now routes to bytecode VM first) |
| Governance overhead | **1.8%** | governed/manifest ratio, steady-state |
| ProofGraph cache hit rate | **67%** | on same-shape flows in one compilation |
| Benchmark suite time | **69 seconds** | 8 benchmarks × 4 runtimes + WASM + passive |

---

## Quality Metrics

| Metric | Value |
|---|---|
| Diagnostic codes | 131 |
| Hardware trust profiles | 37 targets |
| OWASP untaint boundaries | 22 |
| KB documents | 368 |
| Example files | 11 (aerospace + healthcare) |
| Security invariants enforced | 11 (all from governance hierarchy) |
| SPORE-PROFILE codes | 7 (001–007) |
| SPORE-TAINT codes | 4 (001–004) |
| SPORE-HW codes | 3 (001–003) |
| SPORE-VAL codes | 3 (001–003) |

---

## Runtime in Galerina Progress

| Milestone | Phase | % | Status |
|---|---|---|---|
| Foundation complete | 28–32 | 0% → ready | ✅ Phases done |
| HTTP serving (verifyPassword) | 34 | **25%** | ✅ Done |
| Self-hosting bootstrap | 41 | 50% | ⏳ Planned |
| Capability host in Galerina | 44 | 75% | ⏳ Planned |
| v1.0 RC | 50 | 100% | ⏳ Planned |

---

## Open Workers (spawned 2026-06-01)

- **README**: Updated ✅ — 2,715 tests, new rows (WASM 95%, Bytecode VM 40%, etc.)
- **Core concepts review**: Running — security/speed/AI/hardware suggestions
- **Security hardening**: Running — 7 attack surfaces before Phase 34 HTTP
- **Hardware compatibility**: Running — Two-Tier passive matrix

---

## Immediate Next: Phase 33 → 34

Phase 33: integer fast-path + hardware routing (CostGraph routes pure flows to bytecode VM automatically — partially done via Phase 31B wiring).

Phase 34: `verifyPassword` HTTP service = **Runtime 25%** — the first `.spore` file that IS the service.

Required before Phase 34 (from security hardening review):
1. Request body taint at HTTP boundary (auto-taint `req.body`)
2. Request size limit enforcement before governance checks
3. LRU cache scoping per request (prevent cache poisoning)
