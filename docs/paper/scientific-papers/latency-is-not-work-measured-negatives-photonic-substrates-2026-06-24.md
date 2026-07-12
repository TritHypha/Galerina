# Latency is not work: measured negatives on governing photonic / exotic substrates

**Type:** short measurement note / eprint draft (target: IACR ePrint or arXiv cs.CR / quant-ph, 3–5 pp).
**Status:** DRAFT — clears the *measured-negative on a named machine* bar; one novelty gate open (§7).
**Date:** 2026-06-24. **Standing rule:** LogicN publishes only reproducible measured-negatives; no new crypto/science.

> **Superseded (2026-06-25):** this LogicN-era eprint draft was re-issued the next day — rebranded, novelty
> disclaimer added, same five results — as the defensive-publication note
> [`latency-is-not-work-measured-negatives-defensive-publication-2026-06-25.md`](../defensive-papers/latency-is-not-work-measured-negatives-defensive-publication-2026-06-25.md).
> Retained here (historical text unedited below) as the eprint-*shaped* draft of the project's single
> external-submission candidate: Result A, submittable only after the native/SIMD re-measurement (§7).

> **Thesis.** A passive optical / exotic substrate can reduce the **latency (circuit depth)** of a computation, but it cannot reduce the **work (area·energy·operations)** below the information-theoretic floor, and the mandatory **digital periphery** (DAC inject / ADC readout / re-verify) dominates at the scales that matter. We give five independent, reproducible measured-negatives for substrate proposals that conflate the two — across post-quantum signing, photonic GEMM, holographic storage, and CPU interpretation — and draw the architectural consequence: an exotic substrate must be **governed as an untrusted co-processor**, never **absorbed** into the trusted compute path.

## 1. Result A — photonic acceleration of ML-DSA-65 signing is an Amdahl wash

**Claim refuted:** "offload the matrix/NTT-heavy part of a post-quantum signature to a photonic MAC for a large speedup."

**Measurement (named machine):** i9-9900K @ 3.60 GHz, Node v24.16.0, `@noble/post-quantum` 0.6.1, 10⁴ runs, scripts `lane-a-baseline/profile/mac-split.mjs`. The offloadable MAC fraction of ML-DSA-65 (Dilithium) signing is **f ≈ 0.28** — the mod-q reduction, rejection sampling, and SHAKE/Keccak permutation (the dominant cost) **stay digital**.

**Amdahl ceiling.** With offloadable fraction `f` and an idealized infinite-speed optical lane, the best achievable speedup is

```
S_ideal = 1 / (1 − f) = 1 / (1 − 0.28) ≈ 1.39×
```

i.e. an upper bound of ~1.4×, *before* any cost of moving to/from the optical domain. Adding (a) the **mandatory re-verify gate** (a signature computed on a noisy lane must be checked bit-exactly on silicon — see §4) and (b) the **DAC/ADC conversion tax** (Meech 2023, arXiv:2308.01719) collapses the realizable figure to **≈ 0.9×** — a wash or net loss. The "accelerator" is slower than not using it.

## 2. Result B — "compute anything in O(1) by field propagation": latency O(1), work Θ(N²)

**Claim refuted:** a photonic mesh applies a linear map `y = T·x` "in O(1)", so arbitrary computation is O(1).

**Analysis (reproducible: `rd-aot-tensor-precompute-proof.mjs`, `rd-photonic-ppu-virtualisation-proof.mjs`).** Realizing an N-mode unitary requires a Reck/Clements mesh of **N²/2 Mach-Zehnder interferometers** (N=1024 → 523 776 MZIs), plus Θ(N) DAC inject and Θ(N) ADC readout. So:

```
latency  = O(1)        (one pass of the field through fixed-depth optics)
work     = Θ(N²)       (modulator area, weight-load, energy)
```

Only the *latency* is constant; the *work / area / energy* is quadratic. The idealized `9.4×` advantage measured against a digital GEMM **collapses to ≈ 1.94×** once the DAC/ADC conversion bottleneck is priced (Meech 2023). And a linear `T` cannot represent a non-linear primitive at all: the AND / multiply `z = x·y` is a degree-2 saddle (three zero-product points with `1·1=1` non-coplanar), so no linear map reproduces it — branching/governance is **not expressible** on a passive substrate before any cost argument.

## 3. Result C — "holographic O(1)-read petabyte storage" is neither petabyte nor O(1)

**Claim refuted:** a holographic medium gives O(1) random-access reads at petabyte density.

**Analysis (RD-0116).** Demonstrated volumetric density is **≈ 9.6 GB/cm³** (lab, ~1% of the 1/λ³ limit) — not petabyte. Random page access is a **Bragg-condition search** over the multiplexing dimension (angle/wavelength), i.e. Θ(search), **not O(1)**. Separately, **overwrite-erasure is unsound on write-once / WORM-like media**: you cannot prove a secret is gone by overwriting it, so erasure must fall back to a signed crypto-shred attestation (this spawned the positive `LLN-RETAIN-001` gate — never trust a medium's self-reported erase).

## 4. Result D — the same trade on a CPU: "compile the AST into a tensor" loses on both axes

**Claim refuted (RD-0112, named machine):** "flatten an interpreter's expression tree into a matrix and evaluate the program in O(1)."

A program AST is a **sparse tree** (V−1 edges) **walked once** (reuse = 1) — squarely the *losing* side of the latency-vs-work amortization of Result B: applying a dense N×N map is Θ(N²) work, so a tensorized walker pays Θ(N²) to do the Θ(N) work the tree actually needs, **once**. And the `z = x·y` non-linearity (Result B) means a linear map cannot even represent a branch. The **measured** interpreter wins all live on the *work* axis a parallel substrate cannot touch: de-coloring the hot path **7.4×**, flat-SoA AST **2.22×**, const-fold + DCE **1.64× / 7.1× fewer nodes**. Partial-evaluation toward a bytecode VM (the Futamura direction) is the *sound* work-reducing amortization; matrix-precompute is not. Result B is substrate-independent: it holds for AST walking on silicon exactly as for GEMM on photonics.

## 5. Result E — measure first: the interpreter bottleneck is async coloring, not boxing

**Folk wisdom refuted (RD-0112, named machine):** "value boxing is the interpreter bottleneck, so NaN-boxing is the big win." Measured: **NaN-boxing is only 1.15×**, while **de-coloring the async-colored hot path is 7.4×** — the dominant lever by ~6×. A surprising, decision-relevant negative: the optimization the folklore reaches for first (boxing) is far less impactful than the per-node async tax it ignores. Optimize what you measured, not what you assumed.

## 6. The unifying principle, and why it forces "Govern, Don't Absorb"

The results are one statement: **a parallel/exotic substrate buys depth, not work.** The work lower bounds (Θ(N²) for a dense map; the non-offloadable digital fraction of a signature; the Bragg search for a holographic read; the sparse single-use AST) bind on *any* substrate, and the **digital periphery dominates** (conversion, re-verify, control flow).

**The necessary complement (RD-0113) — a reduction is *not* a dense map.** The governance verdict fold `allOf = verdicts.reduce(min)` is N→1 with **work Θ(N), depth O(log N)** (min is associative + commutative), so Result B's Ω(N²) lower bound for dense maps does **not** bind it: a reduction's *latency* genuinely is depth-reducible while its *work* stays Θ(N). The lesson is in the vocabulary — calling a min-fold a "MAC" / "T-MAC" invites the matmul reading Result B refutes. It is an associative ternary-semiring **reduction**, and only its *depth* (never its *work*) is substrate-cheap. Two corollaries with security weight:

- **Crypto stays digital.** A signature/hash on a noisy analog lane needs error-correction back to bit-exactness, which erases the analog advantage *and* still requires a silicon re-verify — so the crypto MUST run on the deterministic core (we enforce this as a compile-time rule).
- **Safe-Floor Theorem.** For every well-typed kernel, `realized_cost(decide(kernel)) ≤ T_digital`, strict only on a branch that was *proven* faster — so a hybrid dispatcher can leave wins unclaimed but can **never be slower than all-digital** (proof imports the real shipped decider, 15/15: `rd-0117-safe-floor-theorem-proof.mjs`).

The architectural consequence: the substrate is admitted as an **untrusted, degrade-only Tier-3 co-processor** behind a signed-config rail — governed, not absorbed.

## 7. What is NOT claimed (honesty bar)

- We do **not** have a photonic integrated circuit. The **work lower bounds are proven**; the **absolute optical ns-constants are from the literature (Meech 2023) and conservative aspirational envelopes**, not measured on our silicon. The negatives hold *a fortiori*: even with literature-optimistic optics, the wash/quadratic-work conclusions stand.
- These are **measured negatives / known-physics consequences**, not a new device or algorithm. No new crypto, no new science.

## 8. Reproducibility

Named machine i9-9900K @ 3.60 GHz, Node v24.16.0, pinned `@noble/post-quantum` 0.6.1. Scripts (in `LogicN-R-AND-D`): **A** `lane-a-{baseline,profile,mac-split}.mjs` (10⁴ runs); **B** `rd-aot-tensor-precompute-proof.mjs`, `rd-photonic-ppu-virtualisation-proof.mjs`; **D/E** the tree-walker speed-lever benchmarks (de-color 7.4× / SoA 2.22× / const-fold+DCE 1.64× / NaN-box 1.15×, per `logicn-tree-walker-speed-and-photonic-governance` + `logicn-aot-tricks-verdict`); **principle** `rd-0117-safe-floor-theorem-proof.mjs` (15/15) and the RD-0113 T-MAC-as-reduction re-derivation (`tower-citizen` 145/145). Prior art to cite: LightHash (Pai et al., Optica 2023, arXiv:2205.08512); Meech 2023 (arXiv:2308.01719); a vectorized Dilithium profile (arXiv:2306.01989); Ertl & Gregg (interpreter dispatch); Amdahl (1967).

## 9. Open novelty gate (before submission)

§1's bench is **pure-JS single-thread**, while the published vectorized profile already implies the same conclusion in the shipping native/SIMD regime — so as written §1 risks being "a measured composition of an already-implied result" (reviewer-novelty confidence ≈ 0.62). **To submit:** re-measure the offloadable fraction `f` in a **native/SIMD Dilithium** build (e.g. liboqs/pqclean with AVX2) and show the wash holds where production crypto actually runs. **§2–§6 are not gated** (work-bound and named-machine measurements). **Until that re-measurement, this is an internal draft**, not a submission.

---

*Companion pre-graded **NO PAPER** (do not write up; kept as repo prior art / defensive-pub): the K3 resolution-boundary / "third execution paradigm" (RD-0122/0125/0109) is an application of Kleene three-valued logic (1938) — concept settled, doubly red-teamed, defensive-pub only; trit-0 masking (0037) — Apache-Arrow validity-bitmap pattern + the SQL 3VL Unknown-vs-absent pitfall; photon-cannot-be-the-signature; cleartext-embeddings ≈ plaintext (vec2text); DP ≠ anonymization (NIST SP 800-226); .spore / TMX-256 / KEM-DEM = standards composition.*
