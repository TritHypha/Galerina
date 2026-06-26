# Galerina — % completion audit + roadmap (2026-06-24, v2, adversarially verified)

**Method:** 7 subsystem assessors → an independent adversarial honesty pass per area (each rosy % handed to a skeptic told to *refute* it by reading the code) → todo reconciliation → synthesis. Every number is the **lower, adversarially-adjusted** figure. Most-secure framing: **under-claim, never over-claim.** Supersedes the morning `galerina-percent-audit-roadmap-2026-06-24.md` and consolidates the roadmap-doc sprawl — **this is the current source of truth.**

## Headline

> **~84% shippable · ~63% full-vision.**

Net-flat-to-up at the system level vs the prior ~82.5/63–66 baseline: the CI / SBOM / observability / PQ-verify-floor / app-fusion-revocation / border-evidence work shipped this cycle genuinely raised the floor, while adversarial re-grounding trimmed several areas 1–3 pts for gaps that live *inside* the area. The 84/63 is the honest, evidence-grounded post-cycle position.

## Per-area (shippable / full-vision, adversarially adjusted)

| Area | S | FV | Honest read |
|---|---|---|---|
| **Stage-A compiler** | 90 | 68 | Real, large, wired pipeline (parser 5549L, K3 verifier 3676L, WAT emit 3219L). Pure-flow WASM is **genuinely emitted to real wabt bytes + executed in a real VM** (16/16) — *not* tokenize-only at the emitter. Fail-closed throughout (`(unreachable)` traps; `executeWASMFlow` declines on ANY diagnostic, #163 closed). Trimmed for two in-area gaps: cross-flow secret/embedding is `warning`, and self-hosting in WASM is tokenize-only. |
| **Runtime** | 87 | 65 | Pure-i32 flows byte-exact across walker≡bytecode≡real-WASM (fidelity 6/6, `Object.is` catches −0); i32 traps overflow/div0/INT32_MIN÷−1; walker+bytecode enforce iteration caps + wall-clock deadline. Trimmed: **real-WASM tier has no fuel/epoch/interrupt** (runaway loop hangs host); the rigorous differential is pure-i32 only; `register-vm.ts` is a confirmed stub (real fast tier = bytecode-vm). |
| **Governance + security** | 86 | 65 | Hybrid Ed25519+ML-DSA-65 real + no-silent-downgrade on proof-graph/attestation/bridge surfaces; K3 deny-by-default enforced; egress fail-closed *intra*-flow; 200+/200+ tests. Trimmed for three would-be-marketed gaps: **false production memory-gate**, **fuse-loader border Ed25519-only**, **cross-flow egress warning-only**. Shamir = 0 impl; admission rails fail-closed but HW-gated shelf-ware; single static trust-anchor root. |
| **Framework** | 85 | 65 | Real fail-closed e2e: scaffold → fuse a signed wasm (sha256+Ed25519+revocation) → 12-step deny-by-default kernel → HTTP 200 with K3 + mutual-TLS (93/93, 17/17, 7/7). Fusion revocation wired this cycle. Aspirational: fusion border Ed25519-only, signed registry has **zero live consumers**, composed-module isolation is shared-JS-heap until #102-106. Not yet CI-defended. |
| **Devtools + CI** | 80 | 60 | **CI now EXISTS** (closes the #149 headline): conventions.yml (6 jobs) + secret-scan.yml (gitleaks, fail-closed). But judged on what CI *enforces*: the umbrella runs `--soft` (report-only) over a 291-violation baseline; only 4 zero-baseline lints + a graph-integrity self-test + secret-scan truly enforce. The two heaviest guards (audit-mutation SEC-002, check-gate-injection) are wired into **zero workflows** despite version.json claiming gate-injection "fails CI". |
| **Ext + substrate** | 79 | 58 | Governance *shell* + tmf slices 1–3 (incl. **real hybrid X25519+ML-KEM-768 KEM-DEM**, golden-verified) + photonic A/B/C governance are real + tested. Trimmed because every flagship bridge's **headline payload is an honest placeholder**: bitnet stub string, snarkjs "NOT a ZK proof", quantum `executedNatively:false`, .tmf slice-4 signing spec-only, cpp no .node addon. Supply-chain smell: ext-tmf borrows @noble with no declared dep. |
| **Self-host + .tmf + DRCM** | 75 | 53 | Galerina-runs-Galerina is **real but TS-interpreted** (21/21 value-parity); in real WASM it is **tokenize-only**. .tmf confidentiality/integrity/history real (49/49); signing + inclusion not built (inclusion.ts confirmed absent; a signed .tmf is fail-closed *rejected*). DRCM/DSS has **zero runtime** (compiles to `(unreachable)`, #102-106-gated). r6-corpus = 8/10 green / 2 red (stale fixtures). |

*Weighting:* compiler 0.22, runtime 0.18, governance 0.18, framework 0.12, devtools-ci 0.12 (deliberately heavy — un-enforced gates undermine every green checkmark), ext 0.10, selfhost 0.08.

## Must-asterisk — the honest caveats (truth-in-capability)

These read as "done" but require an asterisk. Saying them without the caveat is an over-claim:

1. **"Compiles to / runs in WASM"** — TRUE for pure-i32 (some f64/string) flows (real binaries, real VM, byte-exact). FALSE end-to-end: effectful flows are TS-interpreted; **self-hosting in WASM is tokenize-only**.
2. **"PQ-signed end to end"** — FALSE at the runtime borders. Hybrid is real on compiler/attestation/bridge/verify surfaces; the **app-fusion border + both substrate admission rails are Ed25519-only**.
3. **"Enforces memory safety in production"** — **FALSE for the substantive checks.** SPORE-MEMORY-001/002/003/007 are PRODUCTION_BLOCKERS with **no emitter**; only the 008 line-lint fires. ← *single most important.*
4. **"Zero-trust egress is fail-closed"** — TRUE intra-flow; **cross-flow** secret/embedding propagation is hardcoded `warning` with no production escalation. A residual exfiltration hole.
5. **"CI enforces quality gates"** — partly report-only (`--soft` over 291 baseline); SEC-002 mutation + gate-injection wired into zero workflows.
6. **"#149 (no-CI) closed"** — only secret-scan done; full per-package test CI deferred.
7. **"Flagship ext bridges run real compute"** — FALSE; payloads are honest placeholders (bitnet/snarkjs/quantum/cpp).
8. **".tmf golden-standard / signed"** — confidentiality+integrity+history real; **signing + inclusion not built** (proves WHAT, not WHO).
9. **"M-of-N quorum custody"** — decision only; Shamir split/combine zero impl.
10. **"Governs real photonic/storage hardware"** — aspirational; rails fail-closed but no live consumer; switch attestation caller-asserted, not verified.
11. **"DRCM / DSS containment"** — governed source + spec that compile-checks; **zero runtime**.
12. **"register VM is a third tier"** — stub emitting one `(unreachable)` per flow.
13. **"Deadline/limit on all tiers"** — TRUE on walker+bytecode; **real-WASM tier has no fuel/epoch/interrupt**.

## Roadmap

### NOW (unblocked, highest zero-trust leverage)

> **STATUS — 2026-06-25 session close: NOW-1/2/3/5/6 DONE; only NOW-4 remains.**
> - **NOW-1 ✅** false production memory-gate fixed (SPORE-MEMORY-001/002/003/007 RESERVED, no emitter) + `scripts/audit-production-blockers.mjs` enforcing CI cross-ref so it can't recur (`69b2769`, `7e784a5`).
> - **NOW-2 ✅** cross-flow SPORE-SECRET-002 / SPORE-PRIVACY-002 now fail-CLOSED (error) in production (`c66955a`).
> - **NOW-3 ✅** `check-gate-injection.mjs` wired enforcing in conventions.yml + self-test (`3d146e7`).
> - **NOW-4 ⬜ OPEN** — quarantine the env-local signing-key CLI test behind a clean-key fixture + wire the compiler suite into CI. *The last NOW item; CI/test-hygiene, no security hole.*
> - **NOW-5 ✅** `ext-tmf/src/inclusion.ts` TMX-256 Merkle inclusion proofs (selective disclosure) — golden-verified vs root `43386e64…`, full suite 61/61 (`6a1ac1c`).
> - **NOW-6 ✅** the 2 RED r6-corpus fixtures gated with explicit `validate.*` (demonstrates the pattern, not a silence) → r6-parity 10/10 (`5adc99e`).
> - **Also this session:** RD-0126 **A-2 built** (PartitionDecider derives isCrypto from effects, `8d8bdd7`) / **A-1 refuted** (false gap — per-flow lanes, `6738e94`); **5 new enforcing CI lints** (doc-drift · name-collisions · graph-integrity · production-blockers · gate-injection) + `governance/name-registry.json` + `scripts/graph-all.mjs` (all 3 graph generators); the measured-negatives written as a **defensive-pub note** (`docs/scientific-papers/latency-is-not-work-…-2026-06-25.md` — NOT a flagship: would harm credibility per the repo standard; external submission gated on a native/SIMD `f` re-measurement); cross-platform `.env.tmf` brief + 3D-spatial-photonics brief sent to R&D.

1. **Fix the FALSE production memory-gate** — mark SPORE-MEMORY-001/002/003/007 RESERVED + drop from PRODUCTION_BLOCKERS (they have no emitter), OR wire real move/borrow detectors; **add a CI cross-ref that fails when any production-blocking code is non-emittable.** *The gate advertises memory-safety it cannot detect — truth-in-capability is the foundation of every other claim.* ← **single most important.**
2. **Escalate cross-flow SPORE-SECRET-002 / SPORE-PRIVACY-002 warning→error in production** (mirror the boundary-input escalation ~L1716) or add inter-procedural seal/redact discharge. *Closes the residual credential/embedding exfiltration path.*
3. **Wire `check-gate-injection.mjs` into conventions.yml as an enforcing job** (version.json already mandates it). *Makes "a caller that skips revocationCheck" fail CI — highest-leverage unblocked CI hardening.*
4. **Quarantine the env-local signing-key CLI test + add WAT-emitter test isolation, then wire the compiler suite into CI.** *Makes every "gate runs clean" claim self-defending.*
5. **Build `ext-tmf/src/inclusion.ts`** to the inclusion-proof-v0 spec + golden vectors (no #34/HW dep). *Selective-disclosure / verify-one-section — the core .tmf zero-trust value prop.*
6. **Repair the 2 RED root r6-corpus assertions** (r6-03, r6-05 trip SPORE-VALUESTATE-008) with a real gate that discharges the boundary input before AuditLog.write; add tests/r6-corpus to CI. *Closes a genuine taint hole + self-defends the self-hosting parity gate.*

### NEXT
- ML-DSA-65 hybrid verify on the fuse-loader border + both substrate rails (no-silent-downgrade, `certified` profile) — last Ed25519-only quantum-vulnerable LIVE admission surface.
- Wire the signed central registry e2e into the example-app host fuse path + a "forked-but-signed pkg REFUSED" test — closes a supply-chain hole.
- Security-tier CI job running `audit-mutation.mjs --full` — the only proof the fail-closed gates STAY fail-closed under edit.
- Execute the baseline→0 plan (131 V5 name-case + 105 spore-quality + 28 doc-drift via #150 + 3 provenance), then drop `--soft`.
- Implement Shamir M-of-N split/combine + schedule revocation-registry v3 (trust-anchor rotation).
- Surface SPORE-VALUESTATE-008 / SPORE-TIER-001 as dev escalate-only + wire declared-tier⊇inferred-min; fix the dead SPORE-DAG-002.
- Declare ext-tmf's @noble deps instead of borrowing from a sibling node_modules (supply-chain/reproducibility).

### LATER
- Full per-package test-suite CI (the other half of #149).
- Fuel/epoch/interrupt deadline in wasm-runtime.ts (the one tier with no limit enforcement).
- Extend P9 real-WASM byte-parity to the parser stage + widen the fidelity differential to f64/string (after #170/#171).
- .tmf slice-4 hybrid signing over the TMX root + the Governed Trust Capsule (when #34 lands).
- Promote dss-supervisor/trap-handler to `secure` tier; DSS.wasm under a Wasmtime TCB (#102-106).

## Single most important action

**Fix the false production memory-gate (NOW-1)** + the CI cross-ref that forbids any production-blocking code from being non-emittable. Unlike the Ed25519-only borders (real fail-closed crypto, just not yet PQ) or tokenize-only self-hosting (an honest scope), this is an **unenforced guarantee actively presented as enforced** — the exact over-claim a most-secure audit must eliminate first, and the CI cross-ref structurally prevents it recurring.
