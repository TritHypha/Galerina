# LogicN — % Completion Audit + New Roadmap (2026-06-22)

Supersedes `logicn-roadmap-and-percent-audit-2026-06-21.md`. Grounded, re-run-this-session audit (workflow
`w9pd2dtvu`, 7 agents): live full suite **53/53 packages · ~5,020 tests · 0 fail** (version.json auto-emit
records 4,993 — counts still drifting up; wire #150). Tiered honesty: only shipped+verified counts as done.

## Overall: **~73%** (weighted)
Weighting by how much each dimension defines whether LogicN *is* what it claims (not equal-weight):

| dimension | % | weight | one-line state |
|---|---|---|---|
| Language / Runtime (lexer→parser→checkers→tri-tier interp→WASM→stdlib) | **82** | 0.28 | Stage-A + governed interpreter ~100% green; Stage-B WASM ~88% fail-closed; self-hosting Axis-B ~80% (only `tokenize` at byte-parity); **real DSS.wasm 0%** |
| Zero-Trust application framework (scaffold→admission/fuse→kernel→transport) | **72** | 0.22 | kernel 87/87, B1-B5 + B5a shipped; **B8 HTTP transport + example-app are design-only → can't serve a real request end-to-end yet** |
| Security & governance posture (fail-closed core, audits, B5a, key custody, DRCM) | **80** | 0.20 | both audits' criticals+highs closed in code; admission/fuse/registry/revocation/trust-anchor real + tested; **SEC-002 mutation gate not built**; DRCM Ph5 gated |
| R&D queue + greenlit build items + open roadmap | **62** | 0.13 | B5a done; #201 in stash (owner map), #202/#216/#217/DOC-004 open |
| Diagnostic-taxonomy remediation + dev-tooling/audit + #219 standards | **34** | 0.10 | scanner+coverage+registry trustworthy now; baseline **EXIT=154**, most enforcers `--soft` or unbuilt; Stages E-J open |
| TODO/ledger accuracy | **96** | 0.07 | §9 self-reconciled this session; 17 stale doc entries (below) |

## The honest gap is concentrated in 3 places
1. **Real DSS.wasm / Wasmtime runtime = 0%** — DRCM Phases 1-7 are Stage-A *simulation*; `dss-supervisor.wasm` is a 115-byte stub; no `wasmtime` dep. (DRCM Phase 5, #102-106 — external-infra + owner gated.)
2. **Developer-facing HTTP transport is design-only** — `logicn-framework-api-server` (B8) + `logicn-framework-example-app` are README/TODO stubs, so the scaffold→build→admit→**serve** path can't carry a real request through the kernel. This drags the framework to 72%.
3. **Taxonomy/standards enforcement is 34%** — the tooling is now trustworthy, but the gate runs `--soft` (baseline 154) and most #219 enforcers (SEC-002 mutation, DOC-004 drift, property/differential/coverage-threshold) aren't built.

## NEW ROADMAP

### NEAR (build-not-research, highest cross-dimension leverage)
- **B8 transport adapter** (`logicn-framework-api-server` from its TODO: types · load-manifest · route-table · read-body-with-limit · create-server) — the single biggest blocker to a *usable* framework (no real HTTP request flows through the kernel without it).
- **Harden the live inbound listener** (#211: request timeout · rate-limit · body-size cap · slowloris guard · honor SecurityPosture) — highest unblocked-security value; today only 405/404/500 (border-gate items 1/9/10/12, buildable now).
- **SEC-002 mutation/red-team gate** + register in `lint-conventions` CHECKS — turns audit fixes from asserted-once into continuously-proven; this exact gap let the B5a fail-open slip. (`fast-check` already present.)
- **H5 fusion-B2 ABI mismatch** (sync `invoke(i32)` → async `HandlerResult`) + one real end-to-end fused-app test — makes a fused package reachable through the kernel; pairs with the transport adapter.
- **#201 EFFECT-006**: surface the pii/phi brand→family map as an explicit AskUserQuestion, then complete + `git stash pop` — largest in-flight item with no commit; unblocks #202.
- **Stage E diagnostic P0-security overloads** (SECRET-002/PRIVACY-002/GOV-004/MONO-001/INV-002/ASSIMILATE-002 → one-code-one-fault) + remove the **MEMORY-001..007 false production-blocking gate** (advertises memory-safety it can't enforce).
- **Apply the consolidated stale-doc fixes** (below) + wire **#150 CI auto-count** — cheap, high-trust; docs currently undersell shipped security and oversell framework readiness.
- **3 remaining dev-tool script fixture tests** (code-index/audit-coverage/gen-code-registry — need a small testable-core extraction) — closes the tooling test gap (codes.mjs done).

### MID
- **Self-hosted Stage-B past lexer**: prove `parser.lln → type-checker.lln → governance-verifier.lln` to WASM byte-parity via the #105 gate — the lever moving Axis-B 80%→100%.
- **Close the 4 WASM codegen gaps**: #200 nested-member walker · #171 None sentinel · #172 `__int_to_str` i32 truncation · run-host string unification.
- **0014 governance-fidelity differential harness** (graph/WASM == walker, byte-identical, fail-closed) — prerequisite for the lean→WASM router + extending Stage-B parity.
- **ML-DSA-65 hybrid signing** over the SHA-256 digest (#34, offline custody) — the remaining PQ gap (verify is PQ-ready; signer still standalone Ed25519).
- **#149 CI secret-scan** (gitleaks/trufflehog in real `.github/workflows/`) + re-sign legacy old-key artifacts — last open key-exposure P0.
- **#216 WASM build-provenance** (version/gitCommit/repoUrl/buildTimestamp/author into manifest-generator — folds TASK-BLD-003) + **#202 transitive capability-mask ⊆** (after #201, avoid stash conflict).
- **Real runnable example-app** + replace the **T-008 `assert.ok(true)`** crash-containment placeholder with a same-process supervisor harness.
- **Remaining #219 enforcers** (DOC-004, then property/differential/coverage-threshold) + drive the scanner baseline 154→0 across Stages F/G/H, then flip `lint-conventions`+scanner `--soft`→CI-enforcing (Stage J) — the bulk of the 34% taxonomy dimension.

### LONG (owner/infra-gated + the one R&D candidate)
- **Real DSS.wasm**: stand up the Wasmtime component-model host (#102-106) — DWI guests under real per-isolate fuel + in-WASM receipt signing (DRCM Phase 5). The single biggest gap to a complete governed runtime. *(External-infra + owner gated — surface as an explicit decision, don't silently park.)*
- **R&D CANDIDATE — Z3/SMT as a "math compiler"**: QF_BV proof of tri-tier i32 conformance (replacing the 3M-random-pairs sampling), then formalize the 0014 differential as translation-validation. The one genuine research item — proofs would have caught the D1/D2/div-zero bugs.
- **#218 non-codes audit dimensions** (#217 capability/syntax · flows/deps layering · governance-rules · effects · contract-clause coverage) — codes is 1 of 6 planned; the path to a whole-language coverage guarantee.
- **#212 kernel→runtime governance-deny bridge** (`governance_deny` KernelErrorCode + X-LogicN-State 503/backpressure) — completes the verdict→HTTP-response story. *(Owner-gated.)*
- **Deferred audit residuals** (GOV-003 dataflow rename, VSC-004/005, CRYPTO-004/005/006, Gate-6 mediums/lows) + design-only R&D tier (#203-210, #205 Kleene-lattice unify) — the long tail to a fully-closed security posture.

## Stale doc entries to fix (todo recheck — 17 found; ledger itself 96% accurate)
HIGH (accuracy-distorting): MEMORY key-custody says revocation is "markdown-only / nothing evaluates key 8eecf4
as Deny" — **STALE**, revocation now enforced at fuse+resolver+bridge (fix done below) · B5a marked "not built"
in app-framework-build residual #1 — **BUILT** (65d8ac9+1ecef1f) · trust-anchor pinning + revocation listed as
"NEXT/TODO" — **SHIPPED**. COUNT DRIFT: ledger/build-roadmap/SOT headers say 4,989/4,128 — authoritative is
version.json 4,993 (live ~5,020); wire #150. STALE-OPEN rows: build-roadmap "Now Open" still lists #128/#68/#72/
#76/#91/#125/#126 as open though DONE; SOT §1 body carries 44/44+48/48 tables + "TEMPLATES NOT IMPLEMENTED";
ledger §1 rollup omits #201-#219; taxonomy §8 cites old baseline V1 23/V3 17 (now V1 17/V3 0). OVERSELL:
example-app/api-server are stubs but framework docs imply shipped. + 3 uncommitted non-mine working-tree edits to
decide. (Full list: task output `w9pd2dtvu.output`.)
