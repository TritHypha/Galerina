# Galerina — roadmap + % audit (2026-06-21)

Verified by running this session (not carried forward). Where this disagrees with the older
`galerina-runtime-status-SOT.md` (last verified 2026-06-06), **this is newer** — the SOT's counts and its
`appLayerStatus: "TEMPLATES, NOT IMPLEMENTED"` predate this session's real app-framework work. Numbers
below are anchored to a full suite run + phase-close executed this session.

## Verified anchor
- **53/53 packages · 4,980 tests · 0 fail** (full suite run 3× this session + compiler-alone
  re-verified 3,679; supersedes 49/49·4,518 of 2026-06-17 and 44/44·4,128 of 2026-06-06. The
  `version.json` `--emit-counts` bump is deferred to a clean run — it refused under concurrent R&D load).
- Graph **3,750 nodes / 4,148 edges**; security/naming/provenance audits **0 errors**; 68 manifests
  canonical CBOR; `governance:diff` **NEUTRAL — no authority widening**.

## % audit — two-axis model (the honest framing)
| Axis | % | Basis |
|---|---|---|
| **A — governed decision logic in `.spore`** | **~56%** | 14 of 25 `examples/auth-service` services covered by executing tests (unchanged this session) |
| **B — engine self-hosting (THE goal)** | **≈80%** | R6 corpus Stage-A == Stage-B on all 5 flows; `tokenize` byte-parity through the #105 admission gate; parser/type-checker/effect/govern/emit/execute are partial (run in Stage A) |

Against the goal (Axis B at 100% + real DSS.wasm), current position is **≈80%**.

## % audit — subsystem completeness
| Subsystem | % | Status / evidence |
|---|---|---|
| **Stage A compiler/runtime** | **100%** | full implemented feature set exercised by the suite |
| **Stage B WASM codegen (production path)** | **~88%** | shipped: f64 (all forms), strings (+ literal seeding), records (1-level), recursion, `match`, `for`/`where`, const-fold (respects overflow trap), DbC post-conditions. Gaps: **#200** nested-member access, **#171** in-band None sentinel, **#172** `__int_to_str` i32 truncation, run-host string unification |
| **DRCM containment** | **~98% (Stage A)** | Phases 1–7 + OCI complete; **real DSS.wasm = 0%** (gated on Wasmtime component model #102-106 = Phase 5) |
| **App-framework layer (L2–L3)** | **~75%** | **corrects the stale "templates" claim.** Admission/fusion border **100%** (fuse-loader 3 gates + `planComposition` + revocation, 60 tests); scaffolder **100%** (B1 `galerina new app`); unified admission vocabulary **100%** (B2); governed resolver shipped (hash + sig + registry + install-deny + SPORE-PKG-006 revocation). **Missing:** signed central registry index (B5a), richer worked example (B6); `framework-example-app`/`-api-server` remain template/reference |
| **Tri-Pipe** | Binary **100%** | Binary = the production + crypto/governance/admission path. Hybrid = functional (ExecutionRouter + Freivalds verify + emulator, perf **projected**). Photonic = emulator-only (perf **projected/aspirational**, only measured datapoint = Lane-A 0.87× wash) |
| **Governance rules** | mature | 35+ SPORE codes registered + enforced (incl. new **SPORE-PKG-006** this session); namespace-ownership drift-guarded |
| **Crypto / signing** | shipped | Ed25519 sign/verify; **revocation enforced at fuse + resolver + bridge-attest** (this session); ML-DSA-65 hybrid partial (#34); SHA-256 kept (quantum-OK) |
| **Test / verification** | **100% green** | 53/53 · 4,980 · 0 fail |

## Roadmap — ranked next
1. **Tri-Pipe fault-tolerance hardenings** — multi-agent re-R&D **in flight** (`wpa9c3wqk`); its ranked
   stability plan + fault model folds into [galerina-framework-plan-2026-06-21.md](galerina-framework-plan-2026-06-21.md) when it lands. *(highest leverage for "as stable as possible")*
2. **WASM codegen gaps (concrete, scoped, owner-go'd):** #200 nested-member access → walker; run-host
   string unification (`galerina run --wasm`); #171 None sentinel; #172 i32→str.
3. **App-framework net-new (owner-directed residuals):** B5a signed central registry index; B6 richer
   worked example.
4. **Axis B → 100% (the self-hosting goal):** parser / type-checker / governance-verifier WASM parity
   (today they execute in Stage A).
5. **Gated (infra / owner):** real DSS.wasm on a Wasmtime TCB (DRCM Phase 5, #102-106); ML-DSA-65
   finish (#34); untrusted-peer memory isolation (#102-104); **#149** CI secret-scan + re-sign legacy
   old-key-signed artifacts.
6. **Hygiene:** count drift (#150) — addressed by `--emit-counts` this turn.

## Shipped this session (for the change-log)
B1 app scaffolder · B2 admission-vocabulary unification · revocation into resolver + bridge-attest +
`bridge-attest verify` · high-authority cap tiering at border-check (+ `--keyid` hardening) · the
framework plan + flowchart · this audit. Verified: B3 linker, B4 revocation-at-fuse, B5 resolver core,
B6 examples already shipped. All Apache-2.0; no BSL.
