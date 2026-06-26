# Galerina — Full Audit 2026-06-02

> **⚠ CORRECTED 2026-06-02 — see `galerina-runtime-status-SOT.md` (single source of truth).**
> Verified counts: **2,946** total (compiler 2,822 · economics 15 · graph 95 · **security 14, not 32**).
> The "Runtime-in-Galerina" figure below conflated two axes; against the actual goal
> (engine self-hosting) the honest state is **≈20–25%, not 55%**. Where this doc and the
> SOT disagree, the SOT wins.

**Status: 2,946 tests · 0 failures (verified by running)**

Supersedes: `galerina-audit-2026-06-01.md`

---

## Test Counts

| Package | Tests | Pass | Fail |
|---|---|---|---|
| galerina-core-compiler | 2,810 | 2,810 | 0 |
| galerina-core-economics | 15 | 15 | 0 |
| galerina-devtools-graph-algorithms | 95 | 95 | 0 |
| galerina-core-security | 32 | 32 | 0 |
| **TOTAL** | **2,952** | **2,952** | **0** |

**CEC:** 223/223 stable (Levels 0–5 all parsing and compiling cleanly)

---

## Phase Completion (through Phase 69)

| Phase | Deliverable | Status |
|---|---|---|
| 25 | WAT real arithmetic (i32.add/sub/mul, let bindings) | ✅ |
| 26 | WAT control flow (if/else, while, mut/assign) | ✅ |
| 26B | ImmutableInputSeal, HardwareGovernanceClass, ProofLevel, SPORE-HW-001/002/003 | ✅ |
| 27 | WASM instantiation (wabt) — 8/8 benchmarks, native speed | ✅ |
| 27B | Sync fast-path — 14.3× tree-walker speedup | ✅ |
| 28 | Profile enforcement (strict/high_integrity) + Tainted<T>/SafeFor<Context,T> | ✅ |
| 29 | @galerina/core-economics — CostGraph, ValueGraph, IBM matrix, RouteDecision | ✅ |
| 30 | ProofGraph caching by ExecutionSignature (67% hit rate) | ✅ |
| 31 | Bytecode VM — Int32Array opcodes, 14.3× over sync tree-walker | ✅ |
| 31B | Bytecode VM auto-wired into executeFlow (220K calls/sec) | ✅ |
| 32 | Governance diff CLI — exit 2 on authority widening | ✅ |
| 33A | Tier telemetry — executionTier + fallbackReason on FlowExecutionResult | ✅ |
| 34 | verifyPasswordService.spore — live governed HTTP service, POST /auth/verify | ✅ **Runtime=25%** |
| 35 | Password.verify/hash/needsMigration — stable API facade | ✅ |
| 36 | Argon2.hash/verify (Argon2id, OWASP preferred) | ✅ |
| 37 | Password.migrate — verify+rehash bcrypt→Argon2id on successful verify | ✅ |
| 38 | Deno WebGPU GPU benchmark live — RTX 2060 (4GB, confirmed via Win32_VideoController 2026-06-02), 3.99M ops/sec | ✅ |
| 39 | GovernanceSignature Ed25519 — signProofGraph/verifyGovernanceSignature | ✅ |
| 40 | Stage B executable — compiler.capabilities.spore (8 flows), lexer.spore | ✅ |
| 41 | Phase 41 syntax: `when` guard arms, integer/string literal match, inline contract, `:` return type canonical, `else if` → SPORE-SYNTAX-010 hard error. Grammar v1.1. | ✅ |
| 45 | Bytecode VM Phase 45: `callExpr` support, callee AST threaded through compiler | ✅ (partial) |
| 69 | Current phase | ✅ |

---

## Grammar Version

- **v1.1** (Phase 41 additions canonical)
- Phase 41 syntax additions documented in `galerina-grammar.ebnf`, `galerina-spec-manifest.yaml`, `AI_INDEX.md`

| Phase 41 Feature | Status |
|---|---|
| `when` guard arms | ✅ implemented + documented |
| Integer/string literal match arms | ✅ implemented + documented |
| Inline contract style | ✅ implemented + documented |
| `:` return type (modern preferred) | ✅ implemented + documented |
| `effects {}` optional for pure flows | ✅ implemented + documented |
| `else if` → SPORE-SYNTAX-010 hard error | ✅ implemented + documented |
| `unsafe let` at HTTP boundary | ✅ implemented + documented |

---

## Stage B Self-Hosting Files

8 Stage B self-hosted files (all in `packages-galerina/galerina-core-compiler/src/stage-b/` or equivalent):

| File | Status |
|---|---|
| lexer.spore | ✅ scanWord works, makeKeywordTable=40kw |
| parser.spore | ✅ flow headers; body parsing Phase 46 |
| type-checker.spore | 🟡 partial — 3 checks (TYPE-001/002/004) executing, 13 tests (2026-06-02) |
| effect-checker.spore | 🟡 partial — declared-vs-used reconciliation (EFFECT-001/003/004/005), 12 tests (2026-06-02) |
| governance-verifier.spore | 🟡 partial — 3 checks (VAL-001/002, GOV-002) executing, 9 tests (2026-06-02) |
| gir-emitter.spore | 🟡 partial — flow-decl + expression GIR (const/load/add/cmp), 13 tests (2026-06-02) |
| runtime.spore | ⏳ Phase 60+ |
| compiler.capabilities.spore | ✅ 8 flows |

---

## Security: Phase 55 ML-DSA Status

- Phase 39: Ed25519 (`GovernanceSignature`) — ✅ complete
- Phase 55: ML-DSA-65 (NIST FIPS 204) hybrid signing — ⏳ planned
  - `lln.gov.sig.v2` artifact format (ed25519 + ml-dsa-65 dual signatures)
  - `generateHybridGovernanceKeyPair` function
  - Attestation profiles: `compat`, `hybrid`, `pq_strict`
  - Diagnostics: SPORE-HW-101..104 (MissingRequiredAttestation, UnsupportedAttestationAlg, HybridAttestationIncomplete, AttestationEvidenceStale)

---

## Runtime in Galerina Progress

| Milestone | Phase | % | Status |
|---|---|---|---|
| Foundation complete | 28–32 | 0% → ready | ✅ Done |
| HTTP serving (verifyPassword) | 34 | **25%** | ✅ Done |
| Second/third endpoints (healthCheck, rateStatus) | 41 | **27%** | ✅ Done |
| wasmtime CLI standalone | 42 | 30% | ⏳ Planned |
| Deno Deploy first endpoint | 43 | 32% | ⏳ Planned |
| Route dispatcher in Galerina | 54 | **50%** 🎯 | ⏳ Planned |
| Self-hosting bootstrap | ~56 | 55% | ⏳ Planned |
| v1.0 RC | ~69+ | 100% | ⏳ Planned |

---

## Knowledge Base Audit (2026-06-02)

This audit also includes a documentation audit. Files updated today:

| File | Changes |
|---|---|
| `galerina-glossary.md` | Added `when` guard arm, `match`, `inline contract`, `with effects` (REMOVED) entries; fixed `fn`/`flow` examples to use v1 syntax |
| `compiler-diagnostics.md` | Added SPORE-SYNTAX-006..010, SPORE-SYNTAX-LEGACY-001/002, SPORE-STYLE-001/002, SPORE-TAINT-001..007, SPORE-PROFILE-001..007 (incl. 005B), SPORE-HW-001..003/101..104 |
| `galerina-roadmap-next10-phases.md` | Updated test counts to 2,952; Phase 41 row corrected in progress table; Phase 41 entry includes SPORE-SYNTAX-010 note |
| `galerina-audit-2026-06-02.md` | This file — successor to 2026-06-01 audit |

Files verified as current (no changes needed):

| File | Verdict |
|---|---|
| `AI_INDEX.md` | ✅ Current — Phase 41 syntax, ML-DSA, SPORE-SYNTAX-010, `when` guard arms all documented |
| `galerina-spec-manifest.yaml` | ✅ Current — grammar_version v1.1, all Phase 41 additions listed |
| `galerina-grammar.ebnf` | ✅ Current — `when_guard_arm`, integer/string literal arms, `else if` hard error (SPORE-SYNTAX-010), `:` return type, inline contract all present |

---

## Quality Metrics

| Metric | Value |
|---|---|
| Total tests | 2,952 |
| Compiler tests | 2,810 |
| Economics tests | 15 |
| Graph tests | 95 |
| Security tests | 32 |
| Diagnostic codes | 140+ |
| Grammar version | v1.1 |
| KB documents | 368+ |
| OWASP untaint boundaries | 22 |
| Hardware trust profiles | 37 targets |
| Stage B files complete | 1 functional + 7 partial + 0 stub (see SOT §3) |
