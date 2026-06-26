# Photonic-noise countering + the 17-NOs solutions + a prevention-rule set (2026-06-25)

Two adversarially-verified R&D streams + the prevention/graph rules they produced (the owner's
error→tooling rule, [[galerina-rule-error-to-tooling]]). Both verify-before-build; honest fences.

## Stream 1 — counter photonic noise, or work with it (`wf w33z54eq4`)

Almost the entire toolkit already ships. Net-new is small; the owner's "isolation pipe" splits into a
buildable governance lane + HW-gated differential dual-rail.

| Technique | Counter/Work-with | Status | Note |
|---|---|---|---|
| NMR voting (`majorityVote`/`readVoted`) | counter | ships | only helps pBad<0.5 |
| Freivalds cheap-verify (`freivalds.ts`) | counter | ships | O(k·n²) probe; mismatch → deny + fallback-to-digital |
| No-Coercion degrade-only (`vAnd=min`) | work-with | ships | noise can only lower a verdict |
| precision-routing (`routePrecision`) | work-with | ships | tolerant ops → noisy lane; exact → digital |
| tolerance-witness (`checkGuarantee`) | work-with | ships | declare+verify the band; degrade-only |
| **calibration-attestation** | counter | **build** | sign a `SubstrateModelSnapshot` of *measured* noise (HW can't game tolerance down) |
| **compute-only isolation lane** *(the "isolation pipe")* | work-with | **build** | a hardcoded `compute_only` profile constant + effect-deny binding (crypto/network/ledger denied by omission) |
| **fail-closed dead-zone dispatcher** | work-with | **build** | wire `on_indeterminate` (trap/revote:N/fallback_digital) into `NoisyLane.readVoted` |
| **digital-ECC-after-ADC** | counter | **build** | Hamming SECDED / Reed-Solomon over the post-ADC digital word (`digital-ecc.ts`) |
| differential dual-rail | counter | track (HW) | common-mode rejection — the *physical* isolation pipe |
| repeat-averaging | work-with | track | kills random noise 1/√N, not systematic bias |

**HW-gated (never claimed CPU-side):** real per-lane pBad + lane independence, systematic/common-mode
removal, certified-photonic admission (latent/OFF by design), any *real* speed/noise number (all stay
emulated), the analog→trit ADC chain, measured OP_SENSITIVITY/LANE_PROFILES curves.

**Unconditional fence:** statistical noise-countering is **not** bit-exactness — crypto and any bit-exact
result stay on the digital core no matter how much voting/averaging/ECC is stacked (SPORE-SUBSTRATE-001).

## Stream 2 — the 17 "cannot": is each solvable? (`wf wvpc3yq6g`)

**13/17 already-ship** (use the primitive); **3 constrained-safe builds**; the rest are hard-NO only in
their *original* form.

- **Already-solved (13) — use the shipped mechanism:** `tmf-tensor-segverify`→TMX-256 inclusion proof;
  `tmf-abstain-threshold`→`checkQuorum` distinct-signer M-of-N; `db-k3-null`→`triStateAnd`+INDETERMINATE;
  `int-result-masked`→`partialReturn`/`Masked`; `dom-healthcare`/`fraud`/`ml-selective`/`content-safety`→
  `telemetryToSideSignal` (model **proposes**, degrade-only); `identity-federation`→`allOf` weakest-hop
  min; `scheduler-backpressure`→keep the trap + add the degrade loop; `lattice`/`modal`/`interval`→shipped
  `allOf`/`anyOf`/`routePrecision`.
- **Constrained-safe BUILD (3):** a derived **min-only** effect-tensor (read-only projection, NOT a 2nd
  authority); an **out-of-band** degrade-only confidence attestation; scanner **unresolved-dynamic-edge**
  detection (fold into #40/#149).
- **Hard-NO (original form):** Freivalds-on-crypto-bytes (dominated on speed AND safety); **AI-as-in-path-
  arbiter** (a self-report can never *lift* a verdict); a non-trapping defer *replacing* the trap; a
  coupled/compensatory lattice (breaks No-Coercion); a stateful near-edge hysteresis band.

**Unifying law:** anything untrusted, probabilistic, or derived may only ever **LOWER** a verdict through a
min-fold — never authorize.

## Prevention + graph rules proposed (error→tooling — candidate `SPORE-*`)
These make the mistake classes unwritable / statically locatable. Owner-gated to implement; recorded here.

| Rule | What it enforces |
|---|---|
| **SPORE-NO-COERCION-001** | a file/producer/telemetry/ML operand may enter a verdict ONLY through the degrade-only (≤+1) seam (taint rule) |
| **SPORE-VERIFY-PATH-PURITY** | no float/probabilistic/analog operator on a data-path that feeds an integrity decision (SPORE-SUBSTRATE-001 corollary) |
| **SPORE-GRAPH-BORDER-001** | the package-graph scanner MUST fail-closed on any import/dependency construct it cannot statically resolve (graph rule) |
| **SPORE-QUORUM-001** | a verdict gating an authority/custody/release action MUST come from an identity-aware distinct-signer quorum (not majority) |
| **SPORE-DERIVED-PROJECTION** | any compiled/packed/numeric admission cache may LOWER, never AUTHORIZE — pure function of the authoritative source |
| **SPORE-CONTAINMENT-MONOTONICITY** | a fail-closed resource TRAP (step budget, loop/depth cap) may only be COMPOSED with, never REPLACED by, a soft signal |
| **SPORE-GOV-MONOTONE-MIN-001** | every multi-axis Verdict fold routes through `allOf`/`anyOf` (K3 min/max) over independent operands; no bespoke lattice join |
| **SPORE-NO-COERCION / SPORE-GOV-3VL-002** | any module needing NULL/unknown semantics MUST import the shipped K3 gates, never re-roll three-valued logic |
| **SPORE-NO-RE-ROLL-ROOT** | any new `.tmf` integrity check MUST fold through the canonical `rootFromTopNode`, never a parallel/approximate auth |
| **SPORE-TOLERANCE-MONOTONE-001** | any tolerance/precision/near-edge operand MUST be stateless + monotone-down (no dependence on prior verdict state) |
| **SPORE-GOV-DOMAIN-001** | a domain package MUST NOT define its own ALLOW/DENY/INDETERMINATE collapse — one verdict authority |
| **SPORE-FED-001** | any federated/transitive-trust composition resolves to a top-level `vAnd`/`allOf` min fold |
| **SPORE-NO-ALIAS-OPERATOR** | reject a new operator that reduces to a shipped K3 fold (modal box/diamond, deontic must/may) unless an exact verbatim alias |

*Source: workflows `w33z54eq4` + `wvpc3yq6g` (2026-06-25). Feeds notes/62 +
[[galerina-rule-error-to-tooling]]. Rules are candidates (owner-gated); the cleanest are taint/graph rules
that statically locate any operand reaching an authorize/collapse sink outside the degrade-only seam.*
