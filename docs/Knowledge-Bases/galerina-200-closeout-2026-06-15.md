# #200 / P10 — Post-P9 Integrity, Doc-Reconciliation & Graph-Indexing Close-Out (2026-06-15)

**Milestone driver:** the 15-step audit SOP, run end-to-end. **Verified state (executed this session):**
**48/48 packages · 4,360 tests · 0 fail** (`node scripts/run-all-tests.cjs`); project graph **3,533 nodes /
3,969 edges / 1,856 files** after the #177 fix. Supersedes the stale 44/44·4,128 (ledger header) and
47/47·4,346 (SOT) figures. Authoritative source: [galerina-runtime-status-SOT.md](galerina-runtime-status-SOT.md).

---

## 1. What this cycle did (constructive, all verified)

| Item | Result |
|---|---|
| `.td`→`.spore` migration audit | ✅ complete — **0 legacy `.td` files** (399 `.spore`) |
| Doc reconciliation | ✅ SOT count 47→48/4,346→4,360; ledger header+rollup; **#143/#145 un-staled (P9 done)**; **#199 corrected (Phase 0+1 shipped)** |
| FFSM `SESSION-HANDOFF.md` | ✅ "⚠️ SUPERSEDED" banner — it told a cold session to "start at Phase 0", but Phase 0+1 shipped & tested (12 tests). Prevented a re-build of already-shipped work |
| **#177 graph fix** | ✅ `createFileNode` + `extractLogicnSymbols` (galerina-source nodes) + 3 new pkgs in workspace → `.spore` packages now index (api-protocol-rest 0→35, substrate-math 0→48, ext-bridge-quantum 3→170 refs; 1,312 `.spore` node-paths, was 0) |
| `SecretSinkMonitor` dead duplicate | ✅ deleted (user/side-session) → graph regenerated, dead node gone |
| Full-repo deep audit | ✅ 14-cluster, 43 agents → **48 confirmed / 1 refuted**, adversarially verified |
| External idea mining | ✅ 8 repos → 12 ranked governance ideas ([galerina-external-idea-mining-2026-06-15.md](galerina-external-idea-mining-2026-06-15.md)) |

---

## 2. Audit findings — 48 confirmed (10 HIGH · 17 MED · 21 LOW), 1 refuted

**Dominant theme — the "GateCache class":** built-and-tested but wired into **no execution path**. ~12 of 48.

### HIGH (10) — 2 resolved this cycle, 8 open
| # | Finding | Status |
|---|---|---|
| H1 | **cert-profile outside the signed pre-image** → `requireCertifiedProfile` is forgeable (dev→certified escalation returns ok) `wasm-runtime.ts:79-116` | 🔴 **OPEN — TCB, user-gated** |
| H2 | **inline `policy{ allow/deny }` parsed but enforced by no checker** (fail-open, deny-by-default violation) `governance-verifier.ts:3159` vs `parser.ts:2672` | 🔴 **OPEN — needs parser work, not naive wiring** |
| H3 | manifest labelled `Ed25519+ML-DSA-65` but both fields are placeholders — generator signs nothing `manifest-generator.ts:604-612` | 🟠 OPEN — honesty fix |
| H4 | working ML-DSA-65 hybrid signing wired NOWHERE; "blocked on FIPS 204" refuted by in-repo `@noble/post-quantum` `proof-graph.ts:583-771` | 🟠 OPEN |
| H5 | Fusion **B2 ABI mismatch** — fused sync `invoke(i32)` never bridged to kernel async `HandlerResult` `fuse-loader.ts:92,454` | 🟠 OPEN — decision A/B/C/D |
| H6 | #177 graph drops all `.spore` files | ✅ **FIXED this cycle** |
| H7 | dead duplicate `SecretSinkMonitor` `core-security/src/sink-monitor.ts` | ✅ **FIXED (deleted)** |
| H8 | `target-*` TS cluster wired nowhere; no real codegen backend despite "target backend" framing | 🟡 OPEN — scaffold relabel (#155-adjacent) |
| H9 | layer-design doc marks fusion-B2 seam-wiring "DONE+verified" but no seam code exists `galerina-framework-layer-design.md:365` | 🟠 OPEN — doc honesty |

### MED (17) — selected
- **#105 admission gate wired into NO production path** (export+test only) `wasm-runtime.ts:328` → wire or label test-only.
- **BitNetCpuBridge.canCommit() never called** by `execute()` — native ternary path runs ungoverned `bitnet-cpu-bridge.ts:89`.
- **SecretsRotationManager (#110) not wired** to the compiler `secrets{}` grammar; **secrets{} credential body dropped at parse** (only NAME survives) `parser.ts:4538`.
- `ext-proof-snarkjs` prover wired nowhere; `ext-bridge-bitnet` superseded scaffold (not `InferenceBridge`).
- manifest header claims `.lmanifest = Binary CBOR (signing target)` but CLI emits JSON and signs neither.
- **LEXER_PARITY_STATUS.md overclaims** "full parity / PARITY_ACHIEVED=true" on one trivial input.
- `intelligence-search` benchmark reimplements BM25 inline instead of exercising `@galerina/devtools-intelligence`.
- **data-*/db-* (17 pkgs) template-only** yet registered as workspace members + doc-mapped.
- 2 self-described hook scripts point at a nonexistent path (dead).

### LOW (21) — themes: README overclaims (data-query "SQL denied by default", ai cache contracts, ai-neural exports) that don't exist in code; non-constant-time HMAC compare in `integrity-monitor.ts:65` (sibling uses `timingSafeEqual`); quantum bridge deep-relative-dist import instead of package name; egress "tamper-evident" test under the public all-zero HMAC key.

---

## 3. % completion by module (honest, evidence-based)

> The project declares **93 packages; 48 have tests (~52%)**, ~45 are template-only scaffolds. Package
> count overstates breadth — the *core product* is far more complete than the raw ratio suggests.

| Module group | Completion | Basis |
|---|---|---|
| Core compiler — **Stage A** (lex/parse/typecheck/effect/govern/manifest/CBOR/interp) | **~100%** of implemented feature set | 3,361 tests; SOT §2 |
| Core compiler — **WASM emitter** (Stage A→WASM) | **~60%** | tokenize byte-parity done (P9); parser/typechecker/govern WASM parity pending |
| **Self-hosting (Stage B / Axis B — the real goal)** | **~80%** | R6 corpus Stage A==Stage B; SOT §5/§7 |
| **Tower-citizen** (Brain governance) | **~90%** | 173 tests; all primitives — minus wiring gaps (#105 not in prod path, one bridge `canCommit` uncalled, GateCache opt-in) |
| **Six sentinels** | **~100%** | 6/6 pkgs, 117 tests, fail-closed |
| **Bridges** (cpp/bitnet/quantum/contract/proof/secrets) | **~70%** | cpp real; quantum Ph0/1 (Ph2 ext-gated); bitnet scaffold; proof/secrets built-but-unwired |
| **Substrate / 3-valued / noise lane** | **~95%** | shipped + tested; B2 float64 lane-noise profile open |
| **DRCM** (Stage-A simulation) | **~98%** | Phases 1–7 + OCI |
| DRCM **real runtime** (DSS.wasm/wasmtime) | **0%** | external infra (#102–106) |
| **Crypto / attestation** | **~70%** | Ed25519 live; ML-DSA-65 exists but **not** in manifest path; cert-profile pre-image gap (H1) |
| **Devtools** (graph/bench/security/naming/pci/…) | **~90%** | mostly real + tested; #177 fixed this cycle |
| **Framework** (app-kernel + fuse) | **~75%** | app-kernel real (38 tests), fuse pipeline real; api-server/example-app scaffolds; fusion B2 gap |
| **Peripheral** (data/db/web/ai-ext/targets — ~28 pkgs) | **~10%** | template-only scaffolds = roadmap |
| **Enterprise compliance** (10 pkgs) | **~5%** | README+package.json scaffolds |

**Net read:** the **core product** (governance-first language + governed inference tower + sentinels +
Stage-A/DRCM-sim) is **~85–90%** on its implemented scope. Headline gaps: real DSS.wasm (external),
crypto/attestation hardening (H1/H3/H4), and the WASM-parity tail of self-hosting. The peripheral package
surface is mostly scaffolding (future roadmap), not regressions.

---

## 4. Cleanup manifest (flagged — execute when convenient)

| Target | Size / count | Action |
|---|---|---|
| `test-output.txt` (repo root) | **409 KB** stale | delete |
| `packages-galerina/galerina-core-compiler/ClaragonwwwLOtest-output.txt` | mangled old-Laragon-path junk | delete (if still present) |
| `test_lexer*.mjs` + `test_substrate*.mjs` (compiler root) | **5** scratch files | delete (redundant with `tests/`) |
| `*.pdb` in benchmark dirs | **24** files (~32 MB debug symbols) | gitignore + delete (not needed to run `.exe`) |
| orphan `build/*.wasm` (e.g. `galerina-governance-cost.wasm` 2026-06-03) | several | not used by the runner (compiles fresh) — safe to clear |
| `core-security/src/dss/*.spore` (13 files) | uncompiled scaffold in shipped `src/` | move out of `src/` (gated on #38-41/#76) |

---

## 5. Roadmap & technical debt

### A. Immediate in-repo (safe, no infra, no TCB)
- **New lane (the externally-validated one): "calibration-as-attestation"** — idea-mining #5→#2+#12→#3+#4→#1; extends the shipped `BridgeManifest` + `DeterminismMode "tolerance"`. (Spike: `precision{}`/measured-tolerance contract + failing `contract.test.mjs` fixture.)
- **Honesty pass (#179-class):** H3/H4 ML-DSA naming; manifest CBOR/JSON header; LEXER_PARITY downgrade; gate-cache benchmark overclaim; `canCommit()` wiring-or-docstring; scaffold relabeling; README overclaims.
- **#105** admission gate → wire into the real CLI/fuse exec path, or explicitly label test-only.
- **#177 follow-on:** add the remaining ~34 real packages to `galerina.workspace.json` (tower-citizen, sentinels, most devtools, bridges) — they're absent from the graph (tied to #155 npm-workspaces).
- Cleanup manifest (§4).

### B. User-gated (decisions / trust base)
- **H1** cert-profile in the signed pre-image (changes trust base).
- **#149** key **rotation** + CI secret-scan + force-push the rewritten history (scrub ≠ rotation — the leaked `.env.galerina-signing` must be treated compromised).
- **H2** `policy{}` fail-open enforcement (parser-level, not naive wiring — a naive verifier hook here becomes dead code, AST-verified).
- **H5** fusion B2 ABI mismatch — pick option A/B/C/D.
- **#110/#148** secrets rotation + contract `policy{}` (parser work).

### C. External-infra-gated
- Real **DSS.wasm / Wasmtime** component + fuel (#102–106).
- **ffsim Phase 2** worker (`ffsim_worker.py` + child_process, pinned Linux venv) (#199).
- **ML-DSA-65** wired into the manifest signing path (#34/#107-109).

### D. Technical debt introduced / surfaced this cycle
- `galerina.workspace.json` still omits ~34 real packages (graph under-coverage) — partial fix only.
- `packages-galerina/galerina-devtools-project-graph/` is a **nested git repo** (own `.git`) → untracked by parent; decide: absorb (remove nested `.git`) or make a submodule.
- Graph grew to 3,533 nodes — renderers/CLI verified fine at scale, but watch perf if it 2×'s again.

---

## 6. #200 status

**Constructive deliverables DONE & verified:** migration audit · doc reconciliation · #177 graph fix ·
sink-monitor consolidation · full audit (48 findings) · external idea mining (12 ideas) · % completion ·
roadmap. **Deferred to you (TCB/decisions):** H1, H2, H5, #149. **External-infra-gated:** DSS.wasm,
ffsim Ph2, ML-DSA manifest wiring. Suite green (48/48·4,360·0). Benchmark: no runtime path changed →
2026-06-15 15:45 `build/bench-report.md` stands (harness confirmed compiling the correct fresh `.spore`).
**P10/#200 = the in-repo close-out is COMPLETE; the open items are the next roadmap, not this milestone.**
