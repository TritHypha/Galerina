# Galerina roadmap (2026-06-25, post security-hardening session)

> ## ✅ SHIPPED since this doc (2026-06-26 autonomous session)
> - **#149** — Hardened Border wired ENFORCING in CI (`scripts/audit-package-border.mjs` + `hardened-border`
>   job): zero-trust, re-scans every package FROM SOURCE, self-tested, fail-closed. Workspace 93/0. (`24322f0`,
>   drift `fe25a4c`.)
> - **#38** — pre-governance import-path traversal (`SPORE-IMPORT-005`, two-layer containment) + uniform
>   read-size guard (`SPORE-IMPORT-006` + manifest cap), fail-closed. (`170eb8a`, `ab99b46`.)
> - **Compute-only fence** — `SPORE-SUBSTRATE-005`: a noisy/photonic lane is deny-by-default compute-only (no
>   network/persistence/secret/process reach); allowlist = compute.*/ai.inference/random/clock/audit. (`346f8ee`.)
> - **Owner-gated builds landed:** `vAndTensor`, `consensusTritN` + `ConfidenceVerdict`, dead-zone dispatcher,
>   calibration-attestation core (signed `SubstrateModelSnapshot` follow-up #50, Ed25519).
> - **Owner decisions 2026-06-26:** focus = owner-gated roadmap; #34 Ed25519-only for now (keep
>   `SPORE-CRYPTO-PQ-001` enforced); UInt64 unlock (u64-arith) AUTHORIZED; build supply-chain attestation core.
> - **Remaining owner-gated queue:** prevention-rules (incl. `SPORE-NO-COERCION-001`, `SPORE-QUORUM-001`),
>   digital-ECC, `@galerina/ext-attestation` core, u64-arith. Shamir SSS stays blocked (ML-DSA deferred).

**Status:** v1.0.0-beta.2 · **~88% shippable / ~63% full-vision** · 60 packages · compiler suite 3,916/0.
This session closed the threat-model's two criticals + most highs (C1, C2, H1, H2, H7, H8) plus several
fresh fail-opens (substrate-lane ×2, `constantTimeEquals`, init-env scan-evasion, false-✅ on empty `.spore`).
Supersedes the count claims in older roadmap docs.

## 🔒 NOW — security hardening (most-secure-first, #36)
Remaining threat-model findings — all touch the **manifest/admission verification** code, so verify-before-
build each against the live path:
- **H3** — hybrid-PQ signed manifest treated as UNSIGNED by the fuse loader (PQ upgrade silently turns OFF
  signature verification at load). Add a hybrid branch to `verifyManifestSignature`.
- **H4** — verifier inconsistency: `galerina build`/verify validates a hybrid manifest; the kernel fuse loader
  does not. Factor ONE shared `verifyManifestSignature` used by both.
- **H5 / H6** — photonic admission confused-deputy (`certifiedAttestation` is a caller-supplied literal, not a
  verified signed manifest) + duck-typed offload port not attestation-gated.
- **P1 / P2** — gate signing on the faithful-compile check (extends C2); surface EFFECT-003 / STDLIB-002 as
  hard errors in ALL modes.

> **Done this session:** C1 ✅ · C2 ✅ · H1 ✅ · H2 ✅ · H7 ✅ · H8 ✅ — both criticals + the alias/DoS/
> crypto-hygiene highs.

## 🛠 NEXT — correctness & coverage
- **WASM-emit gaps** *(highest leverage)* — close the "no WASM build / stub" emitter gaps so string/record/
  recursion flows lower faithfully. This is both the real perf story (the benchmark "no WASM build" rows)
  AND the root cause behind C2 (the basic examples ship signed stubs).
- **#45 [owner-gated]** — typechecker silent-ALLOW (`isAssignmentCompatible` returns true on an
  undeterminable type). Design = audited INDETERMINATE, upgradable-to-error under strict (not a hard flip).
- **#37** — docs-review compiler bugs (Decimal-is-f64 → wrong VAT) + ~53 example breakages.
- **#32 / #33** — arrays/objects (record field-order divergence) + syntax-sweep ZT fail-opens (NaN-Float,
  bare-tail invariant).
- **#39** — 0112 R1 (trit-REJECT tombstone fill: `free()` 0xFF=ENC_ILLEGAL vs trit-correct REJECT).
- **#38** — pre-governance import-path traversal + uniform read-size guard (3 directory-scan read sites).

## 🚀 NEXT — infrastructure
- **#149** — wire `graph --check` **fail-closed in CI** (the last governance gate still manually enforced;
  now unblocked, border 93/0). Pairs with the new **`SPORE-GRAPH-BORDER-001`** rule (scanner fails closed on
  any unresolvable import). Sequencing: repair the committed-FAIL baselines + the example-app blind-scanner
  first (scanner-worker lane), then gate CI.
- **#35** — photonic-vs-standard A/B benchmark mode (per benchmark).

## 🧩 OWNER-GATED builds (R&D net-new, adversarially verified — pick by value)
- **`vAndTensor`** — deny-by-default tensor verdict-shaper (ZT 90); thin arity wrapper over scalar `vAnd`.
- **Supply-chain attestation adapter** — in-toto/SLSA+SBOM, explicit ABSTAIN for missing attestors (ZT 86).
- **Photonic-noise builds** — calibration-attestation (signed `SubstrateModelSnapshot`), compute-only
  isolation lane (named `compute_only` profile constant), fail-closed dead-zone dispatcher, digital-ECC-
  after-ADC.
- **`consensusTritN` / `ConfidenceVerdict`** — abstain-aware quorum + probability-vector verdict (notes/62).
- **GF(2⁸) Shamir SSS ext custody module** — blocked on `.tmf` slice-4 ML-DSA signing.
- **The 13 prevention/graph rules** (error→tooling) — `SPORE-NO-COERCION-001`, `SPORE-VERIFY-PATH-PURITY`,
  `SPORE-QUORUM-001`, `SPORE-DERIVED-PROJECTION`, `SPORE-GOV-3VL-002`, etc.

## 🌅 LATER — HW / research / #34 gated
- **UInt64 lift** — needs `u64-arith` (Int64 already lifted this cycle). Stays gated.
- **#34** — finish ML-DSA-65 over the SHA-256 digest + `.tmf` slice-4 signing + hybrid Trust Capsule; add
  ML-DSA verify to the fuse-loader RUNTIME border (currently Ed25519-only at app fusion).
- **#102–106** — real `DSS.wasm` / Wasmtime TCB / in-sandbox isolation; real photonic PIC (PPU reprogram
  seam). Until then the Tower is a governed software simulator + emulator, `executedNatively=false`.
- **Self-hosting (P9 → Post-P9)** — extend byte-parity from `tokenize` (done) to parser/type-checker/
  governance-verifier; full self-hosted-compiler-in-WASM is the long pole.

## The through-line
The recurring bug class closed this session — substrate-lane, crypto-regex, init-env, C1 — is one shape:
**a gate that matches by NAME is defeated by a rename; resolve through bindings/variants first, fail-closed.**
The remaining crypto/admission cluster (H3–H6) is the sibling class: **a verifier the build runs but the
loader doesn't** — factor one shared verifier.

*Source: session 2026-06-25. Supersedes `galerina-percent-audit-roadmap-2026-06-24-v2.md` for the NOW list.*
