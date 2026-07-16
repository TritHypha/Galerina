# Galerina — Papers

This folder holds Galerina's publishable scholarly artifacts, consolidated 2026-07-09 from
`docs/scientific-papers/`, the ZTF KB `defensive-publications/`, and the root `Galerina-ScientificPapers/` stray:

- [`defensive-papers/`](defensive-papers/) — all **36** defensive-publication notes (timestamped prior-art records, novelty *disclaimed*; several are design-stage disclosures, marked as such)
- [`scientific-papers/`](scientific-papers/) — eprint-shaped drafts (currently **4**): 1 superseded measured-negative draft + **3** harness-backed construction disclosures (novelty disclaimed) added 2026-07-16

**Read the standard before adding anything here.**

---

## 1. The standard — what gets published, and what does not

Galerina's binding rule is **"no new cryptography and no new science."** Every crypto/codec primitive is borrowed and standard (FIPS / NIST / RFC / peer-reviewed); what is "new" is **engineering composition, byte-precise specification, and honest measured results.** Consequently:

- **Galerina publishes ZERO flagship and ZERO workshop papers** — by design. A "novel contribution" paper here would fail peer review and damage the project's credibility, because the contribution would not survive an adversarial prior-art search.
- The **only** publishable artifacts are: **defensive-publication notes** (timestamped prior-art records of an engineering composition, novelty *disclaimed*) and, at most, **short measured-negative / experience notes** (eprint-scale) that report a *surprising, decision-relevant negative result* on a *named machine*.

### Honest-tier framework (label every document)

| Tier | Definition | Galerina policy |
|---|---|---|
| **flagship** | top-venue, measured non-obvious result, no close prior art | **none exist** — do not write |
| **workshop** | narrow but real novel contribution | **none landed** — do not write |
| **defensive-pub** | engineering composition of established primitives; published to establish prior art, **novelty disclaimed** | the main artifact type here |
| **measured-negative** | a reproducible negative result on a named machine that isn't a re-confirmation of a known principle | at most ~1 borderline candidate |
| **none** | fully re-derives existing work | keep as repo prior art, do **not** write up |

**Bar for a measured-negative note** (all must hold): a fresh, reproducible benchmark on a **named machine** (e.g. i9-9900K @3.60 GHz, pinned Node + library versions, named scripts, run counts); a **surprising or decision-relevant** negative; and **not** reducible to standards-composition or a textbook fact.

---

## 2. Compliance checklist (UK / US / EU research-integrity & open-science)

Any document in this folder follows the conventions below. These are good-practice alignments, **not** a claim of formal certification or a filed legal prior-art search.

- **Integrity (UK):** UKRI research-integrity policy and the **Concordat to Support Research Integrity** — honesty, rigour, transparency, accountability.
- **Integrity (EU):** the **ALLEA European Code of Conduct for Research Integrity**; **Horizon Europe** open-science obligations.
- **Integrity (US):** **NSF**/federal research-integrity expectations and the **2022 OSTP public-access memo** (free, immediate access to federally-relevant results).
- **Reproducibility & artifact availability:** every quantitative claim names the machine, versions, scripts, and run counts; spec/vectors/harnesses are in-repo and re-runnable.
- **FAIR data (EU):** artifacts are Findable, Accessible, Interoperable, Reusable — in-repo paths, open formats, Apache-2.0.
- **GDPR / personal data:** N/A — no document here processes personal data. (Add a data-protection statement if one ever does.)
- **Citation standard:** cite **primary** sources by authoritative identifier (FIPS/RFC number, DOI, arXiv id). **No fabricated references.** If a citation cannot be verified, it is removed, not kept.
- **AI-assisted-drafting disclosure:** documents drafted with AI assistance under human direction say so in their declarations block, with the grounding (spec/source) stated.
- **Declarations block (required template):** Type/tier · Authorship & AI assistance · Funding (default: none) · Competing interests (default: none) · Data/artifact availability · Licence (Apache-2.0).

> Triage here is informed by training knowledge, **not** a filed legal prior-art search or freedom-to-operate opinion. Confirm novelty/clearance with a qualified professional before any external submission.

---

## 3. Index of the corpus

### Defensive publications (`defensive-papers/`) — formerly `docs/scientific-papers/`

| Document | Tier | Summary |
|---|---|---|
| [`spore-trust-capsule-format-defensive-publication-2026-06-23.md`](defensive-papers/spore-trust-capsule-format-defensive-publication-2026-06-23.md) | **defensive-pub** | The `.spore` trust-capsule **universal file & communications format** — TMX-256 (3-ary SHAKE256 Merkle-XOF), ML-DSA-65 root signing, KEM-DEM confidentiality, codec-agnostic modalities (image/audio/video/document/structured), streaming. Maths + usage + security + full references; novelty disclaimed. |
| [`latency-is-not-work-measured-negatives-defensive-publication-2026-06-25.md`](defensive-papers/latency-is-not-work-measured-negatives-defensive-publication-2026-06-25.md) | **defensive-pub** + borderline **measured-negative** | Five reproducible measured-negatives that a parallel/exotic substrate buys latency-depth, **not work** (ML-DSA Amdahl wash · photonic GEMM Θ(N²) · holographic ≠ O(1) · tree-as-tensor · interpreter speed-levers) + the Safe-Floor / reduction-≠-matmul complement. Known-physics/info-theoretic; novelty disclaimed. Result A's external-submission novelty gate (native/SIMD re-measure) stays **OPEN** — internal prior-art only. Bundles RD-0117 + RD-0116. |
| [`authenticated-bytes-equal-executed-bytes-materialise-once-defensive-publication-2026-07-04.md`](defensive-papers/authenticated-bytes-equal-executed-bytes-materialise-once-defensive-publication-2026-07-04.md) | **defensive-pub** | **DP-RD-0247** — *authenticated bytes = executed bytes*: a signed-graph / ReBAC authorization object was forged **4×** because the MAC covered one byte-representation while traversal read another (getter / Proxy / `__proto__` / non-enumerable — a TOCTOU-on-*representation*). Fix = **materialise-once** (verify + parse into a frozen snapshot every reader consumes). Ships the reusable metamorphic `divergence-probe`. Novelty disclaimed vs TOCTOU / canonicalization-confusion / RFC 8785. Proofs `graph-spine.mjs` 26/26 + `divergence-probe.mjs` (re-run green). |
| [`bluehammer-unsigned-derived-capability-mask-defensive-publication-2026-07-04.md`](defensive-papers/bluehammer-unsigned-derived-capability-mask-defensive-publication-2026-07-04.md) | **defensive-pub** | **DP-RD-0233** — the unsigned **derived** capability-mask as a Rowhammer / fault-injection privilege-escalation target: even with a signed token, the live derived `grantedCapabilityMask` is un-attested, so one bit-flip = silent escalation. Fix (landed) = re-derive from the signed grant on use + engine-private field + deny-by-default. **Net-new over DP-RD-0225** (covers the token, not the derived scalar); detect-not-prevent — hardware is the only true prevention. Proof `Galerina/proofs/rd-0233-proof.mjs` 13/13 (verified). |
| [`provenance-integrity-is-not-fidelity-defensive-publication-2026-07-04.md`](defensive-papers/provenance-integrity-is-not-fidelity-defensive-publication-2026-07-04.md) | **defensive-pub** | **DP-RD-0129** — *integrity ≠ fidelity*: a valid signature attests authenticity + integrity, **not** that the bytes correctly realize what they claim; two reproduced signed-artifact fail-opens (compiler emitter stub; photonic `hardwareIdentity` label). Acceptance bar = **sign the equivalence *verdict*, not the bytes**. Novelty disclaimed vs SLSA / reproducible-builds / translation-validation. |
| [`interaction-net-parallelism-is-span-not-work-defensive-publication-2026-07-04.md`](defensive-papers/interaction-net-parallelism-is-span-not-work-defensive-publication-2026-07-04.md) | **defensive-pub** | **DP-RD-0257** — *interaction-net parallelism is **span**, not **work***: compiling an authorization/graph/recursive workload to Interaction Combinators / HVM2 / Bend buys latency-under-parallelism, **not** O(1) — the output alone lower-bounds work (Hanoi = 2ⁿ−1 moves; k-hop frontier grows). Also: "**optimal reduction**" is β-step-optimal only and carries Asperti–Mairson non-elementary bookkeeping. Novelty disclaimed vs Lafont 1997 / Lévy / Lamping / Asperti–Mairson / Brent. Machine-checked (17/17). Extends the `latency-is-not-work` note. |
| [`fail-open-taxonomy-signed-green-is-not-safe-defensive-publication-2026-07-08.md`](defensive-papers/fail-open-taxonomy-signed-green-is-not-safe-defensive-publication-2026-07-08.md) | **defensive-pub** | **DP-RD-0269** — the nine-class **fail-open defect taxonomy** for governance-first toolchains (FO-EMIT-INLINE-COMMENT … FO-VERIFY-BY-READING), each class witnessed by a real reproduced defect and paired with a mechanical detector; the meta-lesson *"signed + green ≠ safe — fail-closed must hold by construction and by execution"*. Novelty disclaimed vs Saltzer–Schroeder 1975 / CWE-636·478·862·863 / mutation testing (DeMillo 1978). Detector evidence in-repo (lint + conformance tests); per-class gaps stated honestly. |
| [`physics-as-authority-fallacy-refutation-corpus-defensive-publication-2026-07-08.md`](defensive-papers/physics-as-authority-fallacy-refutation-corpus-defensive-publication-2026-07-08.md) | **defensive-pub** | **DP-RD-0270** — names the **"physics-as-authority"** fallacy class (an unauthenticated physical signal/process property treated as an authorization authority) and records the **ten-family machine-checked refutation corpus** (O(1)-at-light-speed, "exponential" ternary, free WDM channels, photon-as-signature, unhackable sessions, zero-cost DDoS immunity, Malus/Beer–Lambert as auth, biometric authority, optical credentials) + the degrade-only composition rule `min(keyed, physical)` + the rebuttal protocol under which the generating model (Gemini) **conceded all rebuttals** (2026-07-08). Novelty disclaimed vs Kerckhoffs / Shannon / Kleene / Hayes / Rührmair / SP 800-90B. Proof 15/15. |

### Defensive publications consolidated in from the ZTF KB (`defensive-papers/`, moved 2026-07-09)

All carry the header `Prior-art disclosure (defensive) · Not a patent claim`; a redirect stub remains at the old
KB location (`ZTF-Knowledge-Bases/defensive-publications/README.md`).

| Document | Disclosed | Subject |
|---|---|---|
| [`dp-rd-0170-l3-cache-colouring-auth-isolation.md`](defensive-papers/dp-rd-0170-l3-cache-colouring-auth-isolation.md) | 2026-07-01 | Cache-partition (colouring) isolation of zero-trust authorization state vs eviction + Prime+Probe side-channels |
| [`dp-rd-0202-arm-pointer-tag-tri-state-honest-bounds.md`](defensive-papers/dp-rd-0202-arm-pointer-tag-tri-state-honest-bounds.md) | 2026-07-01 | Ternary capability state in an ARM top-byte-ignore pointer tag — deny-only pre-filter with honest bounds |
| [`dp-rd-0203-arm-sve2-sme-constant-factor-honesty.md`](defensive-papers/dp-rd-0203-arm-sve2-sme-constant-factor-honesty.md) | 2026-07-01 | ARM SVE2/SME + weak memory ordering for graph/GraphBLAS: constant-factor lane, not an order change |
| [`dp-rd-0204-ast-parameterised-graph-query-injection-safety.md`](defensive-papers/dp-rd-0204-ast-parameterised-graph-query-injection-safety.md) | 2026-07-01 | Injection-safe graph-relational querying by strict AST parameterisation (+ ternary-dot-product-as-auth refuted) |
| [`dp-rd-0209-tri-state-z-partition-layout-and-o1-slice-refutation.md`](defensive-papers/dp-rd-0209-tri-state-z-partition-layout-and-o1-slice-refutation.md) | 2026-07-01 | Tri-state z-partitioned graph-index layout: bounded constant-factor cache win; "O(1) tensor-slice" refuted |
| [`dp-rd-0216-cross-language-ternary-prefilter-forgery-caveat.md`](defensive-papers/dp-rd-0216-cross-language-ternary-prefilter-forgery-caveat.md) | 2026-07-01 | Branchless ternary/tropical engine cross-language (FFI/N-API/WASM) as DENY-ONLY pre-filter — not a security boundary |
| [`dp-rd-0225-rowhammer-signed-hash-detection-detect-not-prevent.md`](defensive-papers/dp-rd-0225-rowhammer-signed-hash-detection-detect-not-prevent.md) | 2026-07-01 | Rowhammer bit-flip detection in a signed capability/index region by re-verification (detect-not-prevent) |
| [`dp-rd-0227-light-ascii-exhaustive-drain-structural-injection-guard.md`](defensive-papers/dp-rd-0227-light-ascii-exhaustive-drain-structural-injection-guard.md) | 2026-07-01 | Light-ASCII graph-authoring syntax with mandatory exhaustive default-drain + structural-parse injection pre-filter |
| [`dp-rd-0229-graph-aot-gate-unreachability-proof-hallucination-block.md`](defensive-papers/dp-rd-0229-graph-aot-gate-unreachability-proof-hallucination-block.md) | 2026-07-01 | AI-authored graph-topology language compiled by an AOT governance gate proving data-flow unreachability |
| [`dp-rd-0271-secure-by-omission-contract-field-defaults.md`](defensive-papers/dp-rd-0271-secure-by-omission-contract-field-defaults.md) | 2026-07-08 | Secure-by-omission governance contracts: fail-closed injected defaults + declare-only-to-override |
| [`dp-rd-0272-schema-lock-and-deny-only-prefilter.md`](defensive-papers/dp-rd-0272-schema-lock-and-deny-only-prefilter.md) | 2026-07-08 | Schema-lock with co-located keyed contract + deny-only prefilter: "a schema match is never an ALLOW" |

### Defensive publications added 2026-07-10 (RD-0301 / RD-0309 — landed via main after the gate-6 + SSRF fixes)

These trace to shipped, tested constructions in `galerina-core-network`; the SSRF note's Galerina-specific
socket-pinning residual is **redacted** per the harm filter. Cleared for publication by the R&D do-not-publish
register (§1 allow-list).

| Document | Disclosed | Subject |
|---|---|---|
| [`dp-rd-0301a-egress-ssrf-numeric-ip-and-dns-rebind-guard.md`](defensive-papers/dp-rd-0301a-egress-ssrf-numeric-ip-and-dns-rebind-guard.md) | 2026-07-10 | Deny-by-default SSRF egress guard: all IPv4-numeric + four IPv6-embedded-v4 encodings normalised to one canonical-octet range table (incl. the WHATWG-URL hex-hextet canonicalization bypass) + a connect-time per-resolved-address DNS-rebind recheck; metadata gated independently. Construction + honest limits; socket-pin residual redacted. |
| [`dp-rd-0301b-cert-gate-k3-revocation-unknown-deny-fold.md`](defensive-papers/dp-rd-0301b-cert-gate-k3-revocation-unknown-deny-fold.md) | 2026-07-10 | A four-factor K3 channel-trust fold (pin · chain · validity-window · revocation) where every un-provable factor defaults to INDETERMINATE and a `min`-fold denies the channel — revocation-unknown collapses **by algebra, not a flag** (freshness-required-for-ALLOW), countering the web's documented revocation soft-fail (CWE-299). Fail-closed posture disclosure. |
| [`dp-rd-0309-photonic-substrate-cannot-host-pq-authentication.md`](defensive-papers/dp-rd-0309-photonic-substrate-cannot-host-pq-authentication.md) | 2026-07-10 | **Refutation (negative result):** three independent arguments (hardware precision · encoding≠encryption · public-observable forgeability) that a photonic/analog substrate cannot host a PQ-crypto trust *decision*, only bulk error-tolerant compute outside the gate + the degrade-only `min(digital, physical)` fold. Only standard NIST params cited; discloses no weakness. |

### Defensive publications added 2026-07-12 (RD-0353/0358/0361/0364 — the RD-0257→0367 screening batch)

Screened via the R&D paper-worthiness review `galerina-rd-paper-worthiness-review-0257-0367-2026-07-12` (KB). All defensive-pub tier, novelty disclaimed; Galerina-internal threat tables and implementation-status residuals **redacted** per the harm filter. Cleared by the R&D do-not-publish register (§1 allow-list).

| Document | Disclosed | Subject |
|---|---|---|
| [`dp-rd-0364-governed-ai-inference-output-unverified-by-construction.md`](defensive-papers/dp-rd-0364-governed-ai-inference-output-unverified-by-construction.md) | 2026-07-12 | A ternary epistemic type-state (PROVEN/UNKNOWN/REFUTED) that types **ML-inference output `Unverified`-by-construction** — a model answer is a claim, not a fact; contagious-min under composition, discharge-only-lift, denied at trust boundaries, so an LLM output is **evidence, never a verdict** and prompt-injection cannot mint authority. + per-call governance envelope (content-addressed identity tiers, deny-by-default inference effects, prompt-egress-as-data-egress, fail-closed cost caps). Design-stage. |
| [`dp-rd-0358-compiler-enforced-fail-closed-memory-residency-ceiling.md`](defensive-papers/dp-rd-0358-compiler-enforced-fail-closed-memory-residency-ceiling.md) | 2026-07-12 | A **compiler-enforced, fail-closed memory-residency ceiling** (`register-only`<`no-dram-spill`<`no-swap`<`no-disk` + erase-on-exit + constant-time), **auto-derived** as a deterministic pure function of type/effect, inside the attestation boundary before signing, inspectable — so "a secret spilled past its tier" is **unrepresentable** (REJECT or a governed downgrade that re-types the value REFUTED). Cold-boot / remanence / residency-integral models cited. Threat tables + status **redacted**. Design-stage. |
| [`dp-rd-0353-hallmark-open-types-mandatory-assay-gate.md`](defensive-papers/dp-rd-0353-hallmark-open-types-mandatory-assay-gate.md) | 2026-07-12 | **Hallmark open types** — developer-mintable **nominal** types over a base representation, obtainable **only** through a mandatory declared assay gate (raw→type is a compile REJECT), operations deny-by-default, reserved-name guard, taint-transparent. Carries the validated-domain-value invariant in the type system ("parse, don't validate" as a first-class language mechanism). Shipped construction. |
| [`dp-rd-0361-fail-closed-differential-cutover-and-cross-layer-algebra-conformance.md`](defensive-papers/dp-rd-0361-fail-closed-differential-cutover-and-cross-layer-algebra-conformance.md) | 2026-07-12 | A **fail-closed cutover method** promoting a verified implementation to authority against a **retained reference oracle** (divergence = REJECT + audit; no post-flip runtime fallback; atomic evidence-gated flip; measured shadow→differential→authoritative state-machine) + a **cross-layer algebra-conformance gate** (pinned bijection · full truth table · algebra-law checks · anti-neuter self-test) proving two non-dependent implementations identical. Migration *status* redacted. |

### Defensive publications added 2026-07-16 (RD-0409 / 0417 / 0438 / 0441 — the paper-review sweep batch)

Screened via the R&D paper-review sweep (KB RD-0444); all defensive-pub tier, novelty disclaimed, design-stage as
marked. Harm-filter verified independently by main before publication — no Galerina-specific weakness, gap map, or
live finding disclosed.

| Document | Disclosed | Subject |
|---|---|---|
| [`dp-rd-0409-assurance-relocation-hot-cold-split-for-proofs.md`](defensive-papers/dp-rd-0409-assurance-relocation-hot-cold-split-for-proofs.md) | 2026-07-16 | **DP-RD-0409** — *assurance relocation*: the hot/cold code split applied to **proofs** — relocate expensive proofs off the warm path (deferred/async evidence, pending-proof as a fail-closed third state, cold-section compilation of governance paths), signed per-dataset profile with protected-class unreachability, effect-release gated on durable audit. Lower the overhead, never the guarantee; perf empirical (measured per workload). Design-stage. |
| [`dp-rd-0417-topology-is-not-authority-reach-is-not-reasoning.md`](defensive-papers/dp-rd-0417-topology-is-not-authority-reach-is-not-reasoning.md) | 2026-07-16 | **DP-RD-0417** — *topology is not authority; reach is not reasoning*: a graph edge proves reach, never authorization; traversal needs a separately-signed capability against the signed schema spine. Corollaries: structure-as-disclosure under the zone model, budget-bounded walks (CWE-400), whole-hyperedge admission, and the AI-retrieval restatement (vectors advisory / signed graph authoritative — retrieval-injection structurally dead). Design-stage. |
| [`dp-rd-0438-derived-structures-inherit-the-gate.md`](defensive-papers/dp-rd-0438-derived-structures-inherit-the-gate.md) | 2026-07-16 | **DP-RD-0438** — *derived structures inherit the gate*: every index/view/cache/replica/CDC/backup/embedding inherits the strictest gate of its sources, at creation and at read (verdict = min of sources — an algebra, not a policy lookup); derivation itself is governed; the derived-structure set is an enumerable census (derivation outside it refuses). Closes the derived-copy redaction bypass by construction; min-rule machine-checked in the SP-RD-0439 harness. Design-stage. |
| [`dp-rd-0441-governed-low-latency-patterns.md`](defensive-papers/dp-rd-0441-governed-low-latency-patterns.md) | 2026-07-16 | **DP-RD-0441** — *governed low-latency patterns*: four constructions that keep their speed shape while the trust boundary is made explicit + fail-closed — the governed seqlock queue (torn-read-as-third-state, bounded/non-blocking-by-contract, per-consumer redaction), copy-not-pointers framing, self-describing signed headers (quarantine-on-unknown-version), and the kernel-bypass boundary rule (bypass moves the boundary into userspace, never removes it). Numbers deferred to measured benchmarks. Design-stage. |

### Design-stage defensive publications (filed 2026-07-09 — mechanisms specified, not yet implemented)

Each states its DESIGN-STAGE status in its header and cites the KB RD doc it timestamps; update their status
lines when the mechanisms land.

| Document | Disclosed | Subject |
|---|---|---|
| [`dp-rd-0283-0286-conservation-checked-buses-and-field-routed-objects.md`](defensive-papers/dp-rd-0283-0286-conservation-checked-buses-and-field-routed-objects.md) | 2026-07-09 | Conservation laws for drawn governance graphs: Σin = Σout + Σdrained buses + every-field-routed objects (silent drop / mass assignment unrepresentable) |
| [`dp-rd-0285-tristate-route-resolution-ambiguity-refusal.md`](defensive-papers/dp-rd-0285-tristate-route-resolution-ambiguity-refusal.md) | 2026-07-09 | K3 route dispatch over signed manifests: ambiguous match = governed hold (never first-match-wins) + `route_overlap` build lint + materialise-once requests |
| [`dp-rd-0285b-signed-capability-bounded-mcp-tool-manifests.md`](defensive-papers/dp-rd-0285b-signed-capability-bounded-mcp-tool-manifests.md) | 2026-07-09 | AI tool manifests derived from compiler-checked effect/budget contracts and bound into the signed artifact (anti tool-poisoning / rug-pull) |
| [`dp-rd-0295a-construction-first-security-coverage-scorecard.md`](defensive-papers/dp-rd-0295a-construction-first-security-coverage-scorecard.md) | 2026-07-09 | **Methodology** — scoring a construction-first language against a public attack taxonomy with *unrepresentable-by-construction* as a category distinct from detect/prevent + a mandatory residuals column (not a measured paper) |
| [`dp-rd-0295b-k3-governed-ai-toxic-flow-lattice.md`](defensive-papers/dp-rd-0295b-k3-governed-ai-toxic-flow-lattice.md) | 2026-07-09 | K3 three-valued verdict on the **composition** of AI tool calls over a sensitivity-label lattice (kills toxic-flow: individually-safe tools composing into exfiltration); extends dp-rd-0285b per-tool → per-flow |
| [`dp-rd-0295c-spore-at-rest-integrity-rollback-and-key-commitment.md`](defensive-papers/dp-rd-0295c-spore-at-rest-integrity-rollback-and-key-commitment.md) | 2026-07-09 | At-rest integrity for an encrypted **database file**: monotone-epoch rollback resistance (external anchor) + CMT-4 partitioning-oracle resistance + version-pinned suite; honest gating on deferred ML-DSA signing |

> **Scientific papers from the 2026-07-09 R&D batch (RD-0283..0296): NONE.** Nothing carries a fresh
> named-machine measurement, so per §1 nothing qualifies beyond defensive-pub tier — including the RD-0295a
> coverage scorecard, which is a **methodology** disclosure (a coverage enumeration is not a measurement). The
> first candidate to change that remains the RD-0285j dispatch benchmark (numbers before speed claims).

### Construction disclosures (harness-backed, `scientific-papers/`) — added 2026-07-16

Eprint-shaped **prior-art disclosures with machine-checked harnesses** (construction + proof, novelty *disclaimed* —
these are prior-art records, **not** the flagship/workshop novelty claims §1 forbids). Each cites a re-runnable
harness; **all three re-run green under main's own hand 2026-07-16** (counts below). Harm-filter verified
independently before publication. (Tiered defensive-pub by §1; filed here because they are eprint-shaped + harness-backed.)

| Document | Harness (re-run 2026-07-16) | Subject |
|---|---|---|
| [`sp-rd-0412-two-tier-twin-verification-for-self-hosting-compilers.md`](scientific-papers/sp-rd-0412-two-tier-twin-verification-for-self-hosting-compilers.md) | `scripts/audit-twin-emit-parity.mjs --self-test` → **9/9** | **SP-RD-0412** — two-tier twin verification for self-hosting compilers: the four naive-differential failure modes (hand-built-node fiction · untested-position blind spot · semantic squat · un-twinnable construct) + the method (parser-coverage pre-gate + differential + real-parser pipeline + per-position raw-diagnostic grounding) + the two fail-closed CI gates (source-scanned emit-set parity, name parity). Novelty disclaimed. |
| [`sp-rd-0433-confusable-safe-cross-script-identity-value-layer.md`](scientific-papers/sp-rd-0433-confusable-safe-cross-script-identity-value-layer.md) | `…/symbols-cross-script/verify-symbols.mjs` → **13/13** | **SP-RD-0433** — confusable-safe cross-script identity at the value layer: identity on an immutable canonical key (NFKC + Unicode default case-fold, never locale), deny invisibles/bidi, single-script confinement with non-Latin first-class, UTS #39 skeleton-collision as counterfeit detector, three-valued verdict — with the value-layer-only boundary (don't widen an ASCII identifier lexer). Novelty disclaimed. |
| [`sp-rd-0439-third-state-fail-closed-calculus-executable-and-the-seqlock-equivalence.md`](scientific-papers/sp-rd-0439-third-state-fail-closed-calculus-executable-and-the-seqlock-equivalence.md) | `…/third-state-fail-closed/verify-third-state.mjs` → **19/19** | **SP-RD-0439** — a three-valued fail-closed calculus for data-system primitives (Kleene min/max/sign-flip · boundary-only collapse · derived-takes-min · exits only via proof or denial) + its equivalence to the seqlock read re-check (torn read = third state; re-check = boundary collapse; retry = the promoting proof). K3-classical, **not** a qubit claim. Novelty disclaimed. |

### Eprint drafts (`scientific-papers/`)

| Document | Tier | Status |
|---|---|---|
| [`latency-is-not-work-measured-negatives-photonic-substrates-2026-06-24.md`](scientific-papers/latency-is-not-work-measured-negatives-photonic-substrates-2026-06-24.md) | eprint draft (measured-negative) | **Superseded 2026-06-25** by the defensive-pub note above (rebranded + novelty disclaimer; same five results). Retained as the eprint-*shaped* draft of the one external-submission candidate (Result A), which stays gated on the native/SIMD re-measurement. |

### Companion defensive-publication notes (in the `Galerina-Patens/` repo)

| Note | Tier | Summary |
|---|---|---|
| note-01 — No-Coercion degrade-only K3 composition | defensive-pub | absorbing a continuous/telemetry trust signal into a fail-closed Kleene meet (`e = vAnd(t*,r) ≤ t*`). Cites/disclaims vs Zdancewic-Myers, Bruns-Huth, Birgisson. |
| note-02 — Prove-own-maths methodology + measured-negative catalogue | defensive-pub | PROVEN/SAMPLED/ASSERTED evidence grading; Z3 i32 conformance as translation validation. Cites/disclaims vs Pnueli/Necula, SLSA, Livshits. |
| note-03 — Crypto-on-core rejected-path record | defensive-pub | why analog entropy cannot enter a KDF and an optical PUF cannot be a sole auth factor. Cites/disclaims vs NIST SP 800-90A/B, Rührmair PUF-modeling. |

### Measured-negative candidate (not yet written — needs a re-measurement)

| Candidate | Tier | Status |
|---|---|---|
| Lane A — "Photonic acceleration of ML-DSA-65 signing is an Amdahl latency-wash" | measured-negative (**borderline**) | f≈28% offloadable ⇒ ideal ~1.4×, realisable ~0.9× (wash). **Now captured as Result A of the `latency-is-not-work` defensive-pub note above** (bundled with 4 known-physics negatives). Only becomes externally submittable after a **native/SIMD Dilithium re-measurement** (the vectorised-Dilithium profile arXiv:2306.01989 already implies it; reviewer-novelty ~0.62). **Repo prior art only** until re-measured. |

### Pre-graded NO-PAPER (kept as repo prior art only — with the one-line reason)

- **`.spore` / TMX-256 / KEM-DEM as a flagship** — engineering composition of borrowed standards (this folder publishes the *defensive* version above, not a novelty claim).
- **Photonic SHA-256 / "the photon IS the signature"** — physically/architecturally rejected; crypto stays digital on-core.
- **K3 governance gate as novel** — application of Kleene three-valued logic (1938).
- **Differential privacy ≈ anonymisation** — known-false (NIST SP 800-226).
- **Cleartext embeddings ≈ confidential** — vec2text shows embeddings ≈ plaintext.

---

*Maintained as part of the Galerina KB. The patents-decision rationale lives in `Galerina-Patens/README.md` (zero patents, on purpose); the full paper-worthiness assessments live in `../../../ZTF-Knowledge-Bases/galerina-paper-worthiness-assessment-2026-06-23.md` and the IP/paper strategy memory.*
