# Galerina Integrity Audit — #1–#197 / P1–P9 (2026-06-15)

**Method:** 12-agent workflow audited ~148 task claims across 11 areas against real code, then the
4 high-severity findings were **re-verified by hand** (file:line) before being recorded here — so two
audit errors were caught and corrected (marked ⚠️ below). Read this over the raw audit.
**Suite at audit time:** 46/46 packages · 4,282 tests · 0 fail.

---

## Verdict
The language + runtime **core is genuinely real and well-tested** — ~95 of ~120 distinct task IDs
were independently confirmed in code with tests (Stage-A features, Tower-native primitives, the six
sentinels, DRCM Stage-A simulation, Stage-B self-hosting, P9 tokenize byte-parity, devtools/CLI). The
gaps are concentrated on the **security/crypto + wiring axis**, and a few `[completed]` flags overclaim.
"Production-ready / v1.0" (#117) is **aspirational**: it's contradicted by the unauthenticated cert-profile,
the env-gated/Ed25519-only manifest signing vs the ML-DSA-65 claim, and the committed signing key (#149).

## Verified real gaps (priority order)

| # | Finding | Severity | Status |
|---|---|---|---|
| 1 | **Cert-profile not in the WASM signature pre-image.** `wasm-runtime.ts:83` `signWasm` signs **only the wasm bytes**; `profile` is an unsigned attestation field, yet `verifyWasm:100` gates admission on it. A same-key `dev` binary relabeled `"certified"` passes. | **HIGH** | **Real, in-repo fixable** — include `profile` (+ optionally pinned hash) in the signed pre-image; reconstruct in verify. |
| 2 | **#149 committed signing key** recoverable from git history (`cb5036d:.env.galerina-signing`, key `8eecf418…`). | **HIGH** | Real, **needs user go-ahead** — destructive history scrub + rotation + CI secret-scan. |
| 3 | **#108/#117 signing claim overstated.** `galerina build` *does* real **Ed25519** signing (`galerina.mjs:1102-1125`, env-gated) — but the task title + README say **ML-DSA-65**. Real ML-DSA-65 sign exists (`proof-graph.ts:690`) but is **not** in the manifest path; CBOR-vs-JSON signature coverage unconfirmed. | MED | ✅ **RESOLVED 2026-06-15** — README (4 spots) + `galerina-task-ledger.md` line 98 now state *Ed25519 live / ML-DSA-65 planned (#34)*; SOT §9 was already honest. (Code was already honest: `manifest-generator.ts:608-616` placeholder comment.) The CBOR-vs-JSON signature-coverage question remains open. |
| 4 | **GateCache built-but-unwired** (`gate-cache.ts`; `hybrid-engine.ts:249` bypasses it). | MED | **By design** (opt-in; cache key ~38× slower than the branchless compile) — keep-document, #179. The canonical "GateCache class". |
| 5 | **`galerina new` verb missing.** Scaffolder *script* exists (`scripts/galerina-new.mjs`) but no `new` command in `galerina.mjs`. | LOW-MED | Wire a `galerina new` subcommand → the script. |
| 6 | **#110 secrets{} rotation unwired.** `SecretsRotationManager` (`rotation-manager.ts`) built + tested, not connected to the compiler `secrets {}` grammar/verifier. | MED | Auto-completable wiring. |
| 7 | **#148 `policy {}` in-contract dropped.** Parser emits `policyDecl` but `verifyAccessBlocks` only scans `accessDecl`. | MED | ~10-line verifier fix. |
| 8 | **#105 negative paths thin.** Disallowed host-import → raw `LinkError`, not a tested `CRITICAL_SECURITY_VIOLATION`; no import-closure/attestation-freshness (replay) check. | MED | In-repo hardening + tests. |
| 9 | **CBOR Tags 410/414 declared-only; Tag 415 `mmcpStubs` always empty.** Registered but not actively serialized/populated. | LOW | Either serialize or downgrade the `[completed]` claim. |

## ⚠️ Audit errors I corrected (verified false/overstated)
- **"Both manifest signatures are placeholder / ML-DSA never called"** — **overstated.** Real Ed25519
  signing is wired in `galerina build` (`galerina.mjs:1102-1125`); real ML-DSA-65 sign exists in
  `proof-graph.ts:690`. The `manifest-generator.ts:611` placeholder is the *unsigned-default*, overwritten
  when keys are set. The true nuance is the **Ed25519-vs-ML-DSA-65 naming** (row 3), not "no crypto".
- **"GovernanceEnforcer/TPLSimulator is a second unwired gate"** — **false.** Both are invoked in the
  real ternary inference path: `bitnet-cpu-bridge.ts:58`, `bitnet-gpu-bridge.ts:39`,
  `bridge/stub-provider.ts:47/65`. The audit only checked `hybrid-engine.ts`. (A separate determinism
  nit — `execute()` outputHash timestamp — may be worth a look, but the gate is wired.)

## Outstanding (pending) — auto-completable vs blocked
**Auto-completable in-repo:** `#69` (per-floor graphs), `#110` (rotation wiring), `#148` (verifier fix),
`#155` (npm workspaces), `#177` (graph-index fusable pkgs), `#179` (wiring/dead-code — **LEDGER + posture
done this session**; fusion deferred by decision), plus rows 1/5/7/8 above.
**Blocked on external infra / user decision:** `#102/#103/#104/#106` (real Wasmtime component-model + fuel
+ DSS.wasm signing), `#147` (warm-sandbox/MSan design), `#157` (forensic diagnostics — large),
`#158` (clean-room VQ plugin — user decision), `#149` (destructive scrub — user action).

## Code-review recommendation (answering the user's question)
**Yes — and this audit *was* that review.** Scope a focused **"wiring + claim-truth"** pass (effort high,
not green-field): (A) the built-but-unwired/dead-export sweep (`#179` — GateCache is the template; rows
4/9 are the same class); (B) the security/crypto claim-vs-code audit (rows 1/3/8). **Do not auto-fix the
TCB/key items without sign-off** — row 1 (signature pre-image) and `#149` (key scrub) change the trust
base and need explicit approval.

## Cross-refs
`galerina-techdebt-gaps-review.md` (overlaps — note its #149-#191 scheme ≠ the task-ledger #1-#179) ·
`galerina-runtime-status-SOT.md` · `galerina-continuation-brief-2026-06-15.md` · `build/bench-report.md`.
