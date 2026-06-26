# Latency is not Work

### Five reproducible measured-negatives on governing photonic / exotic compute substrates

**Defensive-publication note (with one borderline measured-negative) · v0 · 2026-06-25**

---

## ⚠️ Novelty disclaimer — read first

**This is a defensive-publication note, not a flagship or workshop paper, and it claims no novel science.** Four of its five results are **known-physics / information-theoretic consequences** (Amdahl's law, the Θ(N²) cost of a dense linear map, optical Fourier optics, Bragg-selectivity, interpreter-dispatch measurement); the fifth (Result A) is a **borderline measured-negative** that is not yet submission-ready (§9). The contribution is **honest measurement and composition discipline**, not invention. Per the Galerina publishing standard ("no new cryptography and no new science"), the unifying principle ("a parallel/exotic substrate buys latency-depth, not work") is **pre-graded as a known principle**; this note exists to (a) record the measurements precisely and (b) serve as a **timestamped prior-art record** that the *govern-don't-absorb* architecture composes only established results.

> This is engineering triage informed by training knowledge, **not** a filed legal prior-art search or a freedom-to-operate opinion. Confirm novelty/clearance with a qualified professional before any external submission. **Internal recommendation (§ Harm review, separate): do not submit externally as a paper; keep as in-repo prior art / defensive-pub until Result A is re-measured.**

---

## Abstract

A recurring proposal in exotic-compute marketing is that a passive optical (or holographic, or analog) substrate "computes in O(1)" or "lets physics solve the math instantly." We give **five reproducible measured-negatives**, on a **named machine** where applicable, showing that such proposals conflate two different quantities: a parallel/exotic substrate can lower the **latency (circuit depth)** of an operation, but it cannot lower the **work (area · energy · operations)** below the information-theoretic floor, and the mandatory **digital periphery** (DAC inject / ADC readout / re-verify) dominates at the scales that matter. The results span post-quantum signing, photonic GEMM, holographic storage, and CPU interpretation. The architectural consequence — itself a known zero-trust principle, not a claim here — is **Govern, Don't Absorb**: an exotic substrate must be admitted as an *untrusted, degrade-only co-processor*, never folded into the trusted compute path, with cryptography and bit-exact integrity kept on deterministic silicon.

---

## 1. Introduction — latency is not work

Two quantities are routinely conflated. **Latency** is the depth of the computation — how long one pass takes. **Work** is the total area·energy·operations — how much must physically happen. A parallel or analog substrate can shrink *latency* (do many things at once, or in one optical pass), but the *work* is bounded below by information theory and does not move; and the **conversion periphery** (encode the input into the physical field; read the result back out; re-verify it) is itself Θ(N) and tends to dominate. Each result below is an instance of this one statement.

## 2. Result A — photonic acceleration of ML-DSA-65 signing is an Amdahl wash *(borderline measured-negative)*

**Refuted:** "offload the matrix/NTT-heavy part of a post-quantum signature to a photonic MAC for a large speedup." On the named machine the offloadable MAC fraction of ML-DSA-65 (Dilithium) signing is **f ≈ 0.28** — the mod-q reduction, rejection sampling, and SHAKE/Keccak permutation stay digital. By Amdahl, the ideal optical speedup is `1/(1−f) ≈ 1.39×`; the mandatory bit-exact **re-verify** plus the DAC/ADC conversion tax (Meech 2023) collapse the realizable figure to **≈ 0.9×** — a wash or net loss.

## 3. Result B — "compute anything in O(1) by field propagation": latency O(1), work Θ(N²)

Realizing an N-mode unitary `y = T·x` needs a Reck/Clements mesh of **N²/2** Mach-Zehnder interferometers (N=1024 → 523 776 MZIs), plus Θ(N) DAC inject and Θ(N) ADC readout. **Latency = O(1); work / area / energy = Θ(N²).** The idealized 9.4× advantage over a digital GEMM **collapses to ≈ 1.94×** once conversion is priced (Meech 2023). And a linear `T` cannot represent a branch: `z = x·y` is a degree-2 saddle (three zero-product points with `1·1=1` non-coplanar), so governance/logic is **not expressible** on a passive substrate, before any cost argument.

## 4. Result C — "holographic O(1)-read petabyte storage" is neither petabyte nor O(1)

Demonstrated volumetric density is **≈ 9.6 GB/cm³** (lab, ~1% of the 1/λ³ limit) — not petabyte. Random page access is a **Bragg-condition search** over the multiplexing dimension, i.e. Θ(search), **not O(1)**. And **overwrite-erasure is unsound on write-once media**: you cannot prove a secret is gone by overwriting it, so erasure must fall back to a signed crypto-shred attestation (the positive `SPORE-RETAIN-001` gate — never trust a medium's self-reported erase).

## 5. Result D — the same trade on a CPU: "compile the AST into a tensor" loses on both axes

A program AST is a **sparse tree** (V−1 edges) **walked once** (reuse = 1) — the *losing* side of Result B's amortization: a tensorized walker pays Θ(N²) to do the Θ(N) work the tree needs once, and the `z=x·y` non-linearity means a linear map cannot represent a branch anyway. The **measured** interpreter wins all live on the *work* axis a parallel substrate cannot touch: de-coloring the hot path **7.4×**, flat-SoA AST **2.22×**, const-fold + DCE **1.64× / 7.1× fewer nodes** (named machine). Partial-evaluation toward a bytecode VM (the Futamura direction) is the sound work-reducing amortization; matrix-precompute is not. Result B is substrate-independent — it holds for AST walking on silicon exactly as for GEMM on photonics.

## 6. Result E — measure first: the interpreter bottleneck is async coloring, not boxing

**Folk wisdom refuted (named machine):** "value boxing is the interpreter bottleneck." Measured: **NaN-boxing is only 1.15×**, while **de-coloring the async-colored hot path is 7.4×** — the dominant lever by ~6×. A surprising, decision-relevant negative: the optimization folklore reaches for first is far less impactful than the per-node async tax it ignores.

## 7. The principle (known), and the necessary complement

The five results are one statement: **a parallel/exotic substrate buys depth, not work.** The work lower bounds bind on any substrate; the digital periphery dominates.

**Complement — a *reduction* is not a dense map.** A min-fold `allOf = verdicts.reduce(min)` is N→1 with **work Θ(N), depth O(log N)** (min is associative + commutative), so Result B's Ω(N²) bound for *dense maps* does **not** bind it — a reduction's *latency* genuinely is depth-reducible while its *work* stays Θ(N). The lesson is vocabulary: calling a min-fold a "MAC" invites the matmul reading Result B refutes; it is an associative semiring **reduction**, and only its *depth* (never its *work*) is substrate-cheap.

**Architectural consequence (known zero-trust principle, stated not claimed):** admit the substrate as an untrusted, degrade-only Tier-3 co-processor behind a signed-config rail; keep crypto + bit-exact integrity on deterministic silicon (a signature/hash on a noisy lane needs error-correction back to bit-exactness, erasing the analog advantage *and* still requiring a silicon re-verify). The **Safe-Floor Theorem** (`realized_cost ≤ T_digital`, proof imports the real shipped decider, 15/15) makes "never slower than all-digital" structural.

## 8. What is NOT claimed (honesty bar)

- We do **not** have a photonic integrated circuit. The **work lower bounds are proven**; the **absolute optical ns-constants are from the literature (Meech 2023)**, not measured on our silicon. The negatives hold *a fortiori*: even with literature-optimistic optics, the wash / quadratic-work conclusions stand.
- These are **measured negatives / known-physics consequences**, not a new device, algorithm, or cryptography.

## 9. Reproducibility and the open novelty gate

**Named machine:** i9-9900K @ 3.60 GHz, Node v24.16.0, pinned `@noble/post-quantum` 0.6.1. **Scripts (in `Galerina-R-AND-D`):** Result A `lane-a-{baseline,profile,mac-split}.mjs` (10⁴ runs); B `rd-aot-tensor-precompute-proof.mjs`, `rd-photonic-ppu-virtualisation-proof.mjs`; D/E the tree-walker speed-lever benchmarks; principle `rd-0117-safe-floor-theorem-proof.mjs` (15/15). **Primary sources (by authoritative id):** Amdahl (1967); Reck et al. (PRL 1994); Clements et al. (Optica 2016); Goodman, *Introduction to Fourier Optics*; Meech (arXiv:2308.01719, 2023); LightHash, Pai et al. (arXiv:2205.08512); a vectorized Dilithium profile (arXiv:2306.01989); FIPS 203/204; Kleene (1938).

**Open novelty gate (Result A only).** §2's bench is **pure-JS single-thread**, while the published vectorized profile already implies the conclusion in the shipping native/SIMD regime — so as written Result A risks being "a measured composition of an already-implied result" (reviewer-novelty ≈ 0.62). To reach even an eprint-scale measured-negative note, re-measure `f` in a **native/SIMD Dilithium** build (AVX2 liboqs/pqclean). **§§3–7 are not gated** (work-bound / named-machine). Until that re-measurement, Result A is **repo prior art, not a submission.**

---

## Declarations

- **Type / tier:** defensive-publication note; contains one *borderline* measured-negative (Result A) that is **not submission-ready** (§9). Not a flagship or workshop paper (Galerina publishes none, by design).
- **Authorship & AI assistance:** drafted with AI assistance (Claude) under human direction, grounded in the named in-repo scripts/specs and the cited primary sources; all measurements are from the named scripts on the named machine.
- **Funding:** none.
- **Competing interests:** none.
- **Data / artifact availability:** all scripts, specs, and proofs are in-repo (`Galerina-R-AND-D`) and re-runnable on the named machine; this note and its companions live in `docs/scientific-papers/`. Apache-2.0.
- **Licence:** Apache-2.0.
- **Caveat:** triage informed by training knowledge, **not** a filed prior-art search; confirm clearance before any external submission.
