# R&D 0113 — Tower-citizen, deepened: K3 maths recheck, compliance, and the 0110 cross-compare

**Date:** 2026-06-24 · **Workflow:** `wkmyodj4u` · **Status:** R&D record (no build; one rename recommendation — see §5)
**Posture:** verify-before-build · trust the math · fail-closed (unknown→deny) · No-Coercion · crypto-on-core (LLN-SUBSTRATE-001)
**Companion docs:** [`logicn-three-valued-governance.md`](logicn-three-valued-governance.md) · [`logicn-substrate-failure-model.md`](logicn-substrate-failure-model.md) · [`logicn-tree-walker-speed-and-photonic-governance.md`](logicn-tree-walker-speed-and-photonic-governance.md) · [`logicn-rd-0110-photonic-matmul-refutation-deepened-2026-06-24.md`](logicn-rd-0110-photonic-matmul-refutation-deepened-2026-06-24.md) · [`logicn-formal-verification-direction.md`](logicn-formal-verification-direction.md)

> Owner ask: "do the same with tower-citizen and the TritMesh O(1)-matmul refutation (0110) — recheck maths/compliance, deep research, extend, cross-compare."

---

## 1) MATHS RECHECK — verdict: SOUND, zero errors across four independent re-derivations; 145/145 tests pass on a clean build

- **Genuine strong-Kleene K3.** Verdict ∈ {−1 DENY, 0 INDETERMINATE, +1 ALLOW}; `vAnd = minTrit`, `vOr = maxTrit`, delegated to one shared trit algebra (`logicn-substrate-math`). This is Kleene 1952, cited in-code, not reinvented.
- **The one deliberate divergence from pure lattice algebra is in the SAFE direction and test-pinned:** `allOf([]) = INDETERMINATE` (deny-by-default), overriding the lattice empty-meet = ⊤ = ALLOW. Intentional fail-safe; correct for an admission gate.
- **`decideAtBoundary`** collapses INDETERMINATE → deny and **always** emits `LLN-GOV-3VL-001` — never silent (meets the posture's "never-silent" standard).
- **G-gap primitives sound:** quorum (distinct-signer M-of-N → K3, anti-Sybil de-dup, equivocation→INDETERMINATE, clean-shortfall→DENY); lease (TTL/caveat, macaroons-style); partial-return (per-field K3); the 4-gate signed-config admission rail (`admitPhotonicConfig`: hash-pin + Ed25519 + revocation + capability, deny-by-default).
- **Substrate fold = exact von Neumann residual** with the correct `pBad < 0.5` guard (NMR closed form); `vAnd` makes the substrate operand **degrade-only** (availability-not-safety) — a *proved* monotonicity theorem, not a standard library construction.

**No maths errors found.** Every header claim matches the code; **no perf number is asserted without a bench** (the posture's own "overclaims are the worst failure" standard is met).

## 2) WHAT IS GENUINELY DISTINCTIVE vs STANDARD (honestly bounded)

**Distinctive (the defensible delta):**
1. **The composition** — one K3 trit threaded uniformly through admission (photonic), delegation (lease), threshold (quorum), per-field response (partial-return), and substrate noise, all collapsing through one fail-closed `decideAtBoundary`.
2. **The degrade-only substrate fold** — von Neumann reliability + Kleene monotonicity → a proved *availability-not-safety* theorem for an analog operand (not a standard construction in the surveyed literature).
3. **The signed-T admission rail** — code-signing the *transformation blob* that reprograms a co-processor **before** apply, closing a hot-swap injection hole that result-verification (à la Freivalds) cannot.

**Standard (cited in-code, not reinvented):** K3 (Kleene 1952); the "Indeterminate" vocabulary (XACML 3.0); threshold (Shamir); TTL/caveat (macaroons); majority/NMR (von Neumann 1956); reduction-as-semiring (tropical / min-plus). The crypto is **not** reinvented.

## 3) COMPLIANCE / HONEST LIMITS (expressivity, not soundness)

1. **No Belnap conflict value** — a glut (ALLOW vs DENY in conflict) is collapsed into INDETERMINATE, losing Bruns–Huth conflict-analyzability. Acceptable for a gate; noted.
2. **No Boolean complement** — excluded-middle fails by design (it is K3, not classical).
3. **No-Coercion is discipline-on-callers, not type-enforced** — until a recommended `effectiveVerdict`-only lint lands, a caller *could* read a raw trit and bypass the degrade-only guarantee.
4. **Honesty-ledger flag:** the cited equivalence bench `governance-tmac-poc.mjs` ("200004/200004") lives in the **R&D repo, not in `C:\wwwprojects\LogicN`** (Glob for `*tmac*.mjs` in-tree = none). The exactness *claim* is re-derivable from `minTrit` associativity, but the *number* is asserted-from-doc, not reproduced in-tree — closed by extension (1) in §4.

## 4) HIGHEST-VALUE EXTENSION — mechanize K3 soundness + No-Coercion + fail-closed in Z3/Lean (all four research fronts agree)

~1–2 days, CPU-only, no HW/owner gate. Converts the package's two flagship guarantees from prose+fuzz to a **finite-domain proof** that becomes a CI gate; because every downstream module inherits "not re-proved here," it closes all of them at once. Two in-tree witnesses proposed:
- `scripts/rd-0113-k3-soundness-proof.mjs` — exhaustive 3ⁿ enumeration of K3 soundness + monotonicity / No-Coercion (`vAnd` degrade-only).
- `scripts/rd-0113-governance-reduction-proof.mjs` — re-derive associativity by exhaustive 3³ enumeration; prove left-fold == balanced-tree-fold; count comparisons (Θ(N)) and critical-path (O(log N)) on a named machine; + a corpus-measured Amdahl/cross-over bound (mirroring 0110) showing even a *free* optical min-fold core is conversion-dominated at governance-clause scale. This closes the §3(4) "cited bench not in main tree" gap.

## 5) CROSS-COMPARE WITH 0110 — does the O(1)-matmul refutation HELP or HURT governance-as-T-MAC?

**Verdict: 0110 HELPS the honest framing and HURTS only an overclaim the shipped doc never actually made. It disambiguates "game-changer" rather than confirming or killing it.**

**The structural fact.** The governance "T-MAC" is mechanically a **REDUCTION, not a dense matmul.** `allOf`/`anyOf` = `verdicts.reduce(vAnd)` — a left-fold of `minTrit` over N trits: **N→1, work Θ(N), depth O(log N)** (re-associable: `min` is associative + commutative). `tmacVector` is BitNet add/sub/skip — also a single-accumulator O(N), sparse reduction. The object 0110 refutes — applying a **dense N×N map** (Θ(N²) work / Θ(N²) modulator area / Θ(N²) weight-load / O(N) optical latency, digital periphery dominating) — is a **different operator**. 0110's information-theoretic **Ω(N²)** lower bound is for N-output dense maps and **does not bind** an N→1 reduction (floor Ω(N) work / Ω(log N) depth). The two results are **consistent — different operators.**

**Which side of 0110's cross-over?** The governance reduction is ternary + sparse + associative (a *better* photonic candidate than fp64 dense matmul) **but small** (a flow has a handful-to-hundreds of clauses, not 4096-wide layers), **single-shot** (each admission its own vector, ~zero weight reuse), and **N→1** (no Θ(N²) compute to amortize the O(N) load against — *the load IS the work*). So it lands on the **LOSING side for latency/throughput**: low arithmetic intensity, no reuse to amortize the DAC/ADC tax. For a min-fold the per-element optical op is trivially cheap, so the conversion overhead dominates **even harder** than in the matmul case. The Amdahl/data-conversion bound (arXiv:2308.01719, ~1.94× median over 27 benches) caps it regardless. A photonic parallel reduction buys **depth/latency** (O(log N) prefix, even O(1) single-stage fan-in) but **work stays Θ(N)** — the information-theoretic floor.

**What survives — and it genuinely does.** The defensible claim is **purely mathematical and already in-doc** ([`logicn-tree-walker-speed-and-photonic-governance.md`](logicn-tree-walker-speed-and-photonic-governance.md) §3, which already disclaims the speed half): governance composition is an **associative ternary-semiring reduction (min-fold)** — exact, tree-reducible (fold-fusion lemma), audit-collapsible (one transition per *vector*, not per node), and No-Coercion-safe (`vAnd` degrade-only). A **correctness-and-structure win**, HW-gated, unclaimed for perf — fully consistent with 0110. 0110 **kills** only any drift toward "the substrate makes governance *fast* / O(1)."

**The one latent risk 0110 surfaces is VOCABULARY.** Calling a min-fold a **"MAC" / "T-MAC"** invites the matmul reading 0110 just spent a workflow refuting. **Recommendation (no code change): the doc should say "associative ternary-semiring REDUCTION (min-fold), not a matrix-vector multiply," adopt 0110's depth-vs-work table explicitly** (depth O(log N) optically achievable; work Θ(N) irreducible; periphery-dominated), and pin "game-changer" to associativity / parallelism / auditability / no-coercion — **never** to throughput.

## 6) BOTTOM LINE + paper / defensive-pub note

`logicn-tower-citizen` is **mathematically sound with zero errors across four independent re-derivations and 145/145 passing tests on a clean build.** Genuine strong-Kleene K3, one shared trit algebra, deny-by-default / no-coercion / crypto-on-core / never-silent all structurally realized; the single deliberate divergence (empty-fold → INDETERMINATE) is safe-direction and test-pinned.

- **Defensive-pub (recommended):** the *combination* — "a single fail-closed K3 verdict algebra as the uniform spine across admission/delegation/threshold/partial-return/substrate, with a proved degrade-only (availability-not-safety) substrate fold and a signed-transform admission rail." The defensible-but-unpatentable delta; publishing pins prior art.
- **Measured-negative note (paper-worthy, the 0110 line):** "governance-as-T-MAC is an associative ternary-semiring reduction — a depth/parallelism/auditability win, **not** a photonic throughput win; the data-conversion bound dominates a cheap-per-element fold even harder than a dense matmul, and at governance-clause scale there is no reuse to amortize." Land it *with* the in-tree `rd-0113-governance-reduction-proof.mjs` so the claim is bench-backed.
- **No patents** (framework, no new crypto/science). **No new flagship paper** beyond the measured-negative note.

**The single highest-value next step (all four fronts agree):** mechanize the K3 soundness + No-Coercion + fail-closed theorem in Z3/Lean (§4) — CPU-only, no gate, becomes a CI gate, closes every downstream module at once.

**Key files:** `logicn-tower-citizen/src/{three-valued-governance,tpl-simulator,quorum,lease,partial-return,photonic-admission,bridge-attestation,substrate-model}.ts` · `logicn-substrate-math/src/index.ts`.
**Proposed net-new:** `scripts/rd-0113-k3-soundness-proof.mjs` + `scripts/rd-0113-governance-reduction-proof.mjs`.
