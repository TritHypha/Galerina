<!-- ABSORBED R&D SOURCE — verbatim mirror. Galerina is the main library; the R&D repo is upstream/authoring.
     Source: Galerina-R-AND-D/tmf/research/photonic-lane-A-accelerated-signing.md  ·  Pinned: R&D fb68d06 (2026-06-16)
     Integrated Galerina view: (this archive copy is the primary KB home)  ·  Catalog: galerina-rd-absorption-catalog.md
     Rule: edit the upstream source then re-vendor; do not fork this copy (feedback-auto-import-rd-docs). -->

> **Absorbed R&D source (verbatim).** This is the archived upstream document. See `galerina-rd-absorption-catalog.md` for the full ledger. Internal links below point at the upstream R&D tree.

---
# Lane A — photonic-accelerated lattice signing

> **Status:** R&D findings, research-phase (2026-06-16). **Posture (binding, inherited from
> `ENCRYPTION-RND-FULL-BRIEF.md` and the phase charter):** grounded + cited (FIPS/NIST/RFC/peer-reviewed only);
> honest-core vs aspirational kept strictly separate; **no performance number without a reproducible benchmark +
> the machine it ran on**; no invented crypto; fail-closed (`unknown → deny`).
> **Lane:** photonic-*accelerated* lattice signing — the earnable performance angle.
> **Cross-refs:** `tmf/spec/signature-custody-v0.md` (the #34 hybrid Ed25519 + ML-DSA-65 sig this phase signs
> with), `ENCRYPTION-RND-FULL-BRIEF.md` §3 (crypto-on-core), §10 (two crypto paths); charter
> `RESEARCH-PHASE-photonic-signing-and-trust-capsule.md` §1 Lane A, §4 acceptance criteria.

---

## 0. Bottom line up front

A photonic matrix-vector-multiply (MVM) unit can, **in principle**, accelerate the *linear* arithmetic inside
ML-DSA signing (the NTT and matrix products). It can **never** be the signing primitive: a digital signature is
bit-exact and EUF-CMA-unforgeable (one flipped bit ⇒ a different signature ⇒ verification fails), whereas analog
photonics is ~≤6–8-bit and error-tolerant. The honest architecture is therefore **photonic accelerator → re-quantize
to exact integers → digital re-verify**, with the trust boundary held entirely by the digital re-verify gate
(Galerina's role).

**Whether this is a *net* win is, today, a theoretical gap.** No peer-reviewed benchmark exists for the full
photonic-NTT signing loop *including* the ADC/DAC re-quantization overhead. The one closest peer-reviewed result on
exactly this offload-then-requantize pattern (LightHash, hashing not signing) and the one peer-reviewed study of the
conversion tax itself (Meech et al.) both point the same way: **the data-conversion overhead frequently eats the
optical speedup.** Per the guardrail, this lane reports that gap explicitly and **does not synthesize or extrapolate
numbers to fill it.**

> **Update (measured 2026-06-16, §6.5):** the §6.1 digital baseline is now built and run on a stated machine.
> The offloadable (multiply-accumulate) fraction is **`f ≈ 28 %`** (range ~19–38 %; the mod-`q` reduction stays
> digital — it is the re-quantization checkpoint), so the **Amdahl ceiling on the *ideal* photonic sign-latency
> win is ~1.4× (range ~1.23–1.60×)**. Layering on the mandatory re-verify gate (~28 % of sign, photonic-path-
> only) drops even an infinite-MAC net to ~1.1–1.2×, and the ADC/DAC conversion tax (Meech: ~1.9× of an ideal
> 9.4×) takes the realizable net to **≈ 0.9× — a wash or net loss. The lane stops at §6.1.** Numbers are measured,
> not synthesized; scope is ML-DSA-65 sign *latency* (energy / batched / larger-param wins are out of scope, not
> refuted). The photonic full-loop bench (§6.2) is no longer worth building at these sizes.

---

## 1. What is being signed (why exactness is non-negotiable)

This phase signs with the #34 construction: **hybrid Ed25519 + ML-DSA-65 over a 32-byte digest**
(`signature-custody-v0.md` §2.1). For `.tmf` the digest is the TMX-256 `integrity_root`; for Galerina #34 it is a
SHA-256 manifest-body digest. Verification of the ML-DSA-65 half is **two exact checks** (faithful to FIPS-204, not
a single matrix congruence — see `signature-custody-v0.md` §2):

1. a norm bound `‖z‖∞ < γ₁ − β` on the response vector, **and**
2. a challenge-hash match `c̃ == H(μ ‖ w₁')`, where `w₁' = UseHint(h, A·z − c·t₁·2^d)`, `A = ExpandA(ρ)`, and `μ`
   binds the message (our digest) and the per-surface domain-separation `ctx`.

Both checks are over **`Z_q`, `q = 8380417`, exact integers**. A single coefficient off by one fails the norm
check or changes `c̃`. This is the EUF-CMA unforgeability bar; it is the same precision-wall-vs-avalanche argument
that already rejected "photonic SHA-256" (`ENCRYPTION-RND-FULL-BRIEF.md` §3; charter §0, §3). **A photon cannot
*be* the signature.** Photonics is admissible only as an accelerator strictly behind the digital re-verify gate.

---

## 2. The offload boundary in ML-DSA signing

ML-DSA-65 (FIPS-204; the ex-Dilithium "Dilithium3" set) is Fiat-Shamir-with-Aborts over module lattices. Its cost
is dominated by polynomial arithmetic in the ring `R_q = Z_q[X]/(X²⁵⁶+1)` — multiplications done via the NTT
(forward NTT, pointwise multiply, inverse NTT) and the matrix-vector product `A·y` over the `k×ℓ = 6×5` module.
Parameters (FIPS-204, ML-DSA-65): `n=256`, `q=8380417`, `(k,ℓ)=(6,5)`, `η=4`, `γ₁=2¹⁹`, `γ₂=(q−1)/32`, `τ=49`,
`β=τ·η=196`, `ω=55`, `d=13`.

The crux is that signing is a **rejection loop** (Fiat-Shamir with Aborts): each attempt samples a masking vector
`y`, computes `w = A·y`, derives the challenge `c` from a hash of `w₁`, forms `z = y + c·s₁`, and **restarts** if
`z` or the low bits violate their bounds. The z-bound and r0 checks give roughly **~20% success per attempt
(≈5.1 expected repetitions for ML-DSA-65** — FIPS-204 / the CRYSTALS-Dilithium expected-repetitions table; ~4.25
for -44, ~3.85 for -87) — inherent to the scheme. Only the **linear algebra** inside each attempt is photonic-eligible.

| ML-DSA signing op | Photonic-eligible? | Why |
|---|---|---|
| Forward / inverse **NTT** of polynomials | **Eligible (linear)** | NTT is a fixed linear transform (a structured matrix); the bulk multiply is the textbook MVM offload target |
| **Matrix-vector product `A·y`** (`A=ExpandA(ρ)`, `6×5` of degree-256 polys) | **Eligible (linear)** | The single largest dense linear op per attempt — exactly the LightHash/HeavyHash "insert an MVM in the middle" pattern |
| Pointwise multiply in NTT domain | Eligible (linear, low value) | Cheap elementwise; little to gain, conversion tax likely dominates |
| **mod-`q` reduction / re-quantization to `Z_q`** | **MUST stay digital** | The exact-integer reduction *is* the re-quantization checkpoint; analog cannot represent `q=8380417` exactly |
| **Rejection sampling** (`y`, `s₁`, `s₂` from seeds; `ExpandA`, `ExpandMask`) | **MUST stay digital** | Deterministic SHAKE/SHA3 expansion; bit-exact, security-critical |
| **Challenge hash** `c̃ = H(μ‖w₁')` and `SampleInTuple` for `c` | **MUST stay digital** | A hash; same exactness/avalanche bar as the signature itself |
| **Norm/bound checks** (`‖z‖∞`, low-bits, hint weight `ω`) | **MUST stay digital** | The accept/reject decision and the unforgeability boundary; fail-closed |
| **Power2Round / Decompose / MakeHint / UseHint** | MUST stay digital | Bit-exact rounding that the verifier reproduces; one bit off ⇒ reject |

**Offload boundary (the honest-core line):** photonics may compute `A·y` and the NTT butterflies as *analog
approximations*; the result is **immediately ADC-read, re-quantized to exact `Z_q`, and every subsequent step
(reduction, sampling, hashing, bound checks, the final digital re-verify) is digital.** The photonic unit lives
*outside* the trust boundary, behind a deterministic checkpoint. This is the LightHash architecture applied to a
signature instead of a hash.

---

## 3. The LightHash lesson (the directly-relevant peer-reviewed precedent)

LightHash (Pai et al., *Optica* 2023; built on Dubrovsky–Ball–Penkovsky's *Optical Proof of Work*, 2019) is the
closest real implementation of "offload the linear MVM, re-quantize, verify digitally," and it was specifically
co-designed to survive analog imprecision:

- **Design:** a Bitcoin-style proof-of-work with an "arbitrary photonic mesh-based matrix–vector product inserted
  in the middle," computed on a co-designed **6×6 programmable interferometer mesh** (silicon photonics).
- **Precision:** the mesh achieves only **~6-bit effective precision**; the design's whole point is that HeavyHash
  was "highly sensitive to hardware error," so LightHash maps the continuous optical output to **discrete integer
  levels** (threshold/binning + calibration of systematic drift) so that small analog deviations inside a
  quantization bin do not change the digitally-verified result. **This is precisely the re-quantize-to-integers
  step Lane A requires** — and LightHash needed it to function at all.
- **Energy claim:** roughly a **10×** energy improvement vs the best digital ASICs is *projected*, attributed to
  analog photonics' low dynamic power — **not** presented as a fully-measured end-to-end net-power benchmark of the
  whole loop including conversion. Treat the 10× as aspirational, not a measured net win.

**The lesson for signing:** the gain is only ever on the *bulk linear op*, and it is only realizable if (a) the
target tolerates low precision and (b) re-quantization + error-correction overhead does not eat the saving.
HeavyHash/LightHash deliberately *redesigned the workload* to be analog-tolerant. **ML-DSA cannot be redesigned that
way** — its `q`, bounds, and hashes are fixed by FIPS-204; the signature must verify bit-exactly. So the photonic
output must be re-quantized to *full* `Z_q` exactness, which is the most expensive precision regime for analog
conversion, not the friendly low-precision regime LightHash engineered for.

---

## 4. The re-quantization / ADC-DAC tax (why this is likely a wash)

The single most load-bearing peer-reviewed result against a naive "the optics are faster" claim is the
data-conversion bottleneck:

- **Meech, Tsoutsouras & Stanley-Marbell, *The Data Conversion Bottleneck in Analog Computing Accelerators*
  (2023):** for an optical Fourier-transform accelerator across 27 benchmarks, the *ideal* optical speedup
  averaged **9.4×**, but **after accounting for ADC/DAC conversion the median realized speedup was only 1.9×.**
  Large speedups (45–159×) survived only for pure FFT/convolution workloads where conversion is a small fraction
  of total work. Their conclusion: data conversion fundamentally constrains analog accelerators **unless the
  hardware replaces nearly all the digital computation** — which Lane A explicitly does *not* do (the rejection
  loop, sampling, hashing, and re-verify all stay digital).
- Independent corroboration that the conversion units, not the optics, dominate: in state-of-the-art photonic
  accelerators the signal-conversion units (ADC/DAC + O/E) have been reported to consume the majority of chip area
  and a large majority of system energy (e.g. the conversion bottleneck literature around Lightening-Transformer
  and the "data conversion bottleneck" study above). High-precision conversion is the expensive part, and its cost
  rises with required bit-precision.

**Why this bites ML-DSA-65 specifically:**

1. **Exact `Z_q` requires high-precision re-quantization.** ML-DSA needs the linear result reduced mod
   `q=8380417` (a 23-bit modulus). You cannot accept a 6-bit-ish analog answer the way LightHash can; you must
   recover enough precision to land on the *exact* integer, which is the costly conversion regime.
2. **The offloaded fraction is small.** Signing is a rejection loop dominated by SHAKE-based sampling, hashing,
   rounding (Decompose/MakeHint), and bound checks — all of which stay digital. By Meech et al.'s argument, the
   smaller the truly-offloaded fraction, the more conversion overhead dominates and the closer realized speedup
   gets to 1× (a wash) or below.
3. **Mandatory digital re-verify.** Lane A's safety model requires re-verifying the signature digitally after
   re-quantization (the trust gate). That re-verify is itself most of the verify cost, further shrinking the net
   win on the *sign* path.
4. **ML-DSA-65 sizes are modest.** Polynomials are degree-256 over a `6×5` module — small enough that a tuned
   digital NTT on a modern CPU is already fast, leaving little headroom for an MVM offload to beat after the
   conversion tax. (Charter §1 Lane A flags this: "May be a wash for ML-DSA-65 sizes.")

---

## 5. The theoretical gap (guardrail compliance — stated, not filled)

> **GUARDRAIL (verbatim):** "If real-world benchmark data for the full photonic-NTT loop (including ADC/DAC
> re-quantization overhead) does not exist in current literature, state explicitly that it is a theoretical gap.
> Do not synthesize or extrapolate performance numbers to fill the void."

**Finding: it does not exist. This is a theoretical gap.**

- No peer-reviewed paper benchmarks an **end-to-end photonic-NTT inside an ML-DSA / Dilithium signing loop, net of
  ADC/DAC re-quantization and digital re-verify**, on a stated machine. The peer-reviewed photonic-MVM corpus is
  for **ML inference** (e.g. Lightmatter's *Nature* photonic processor, 2025: a real measured datapoint of
  **65.5 TOPS at 78 W electrical + 1.6 W optical** in **ABFP-16**, running BERT/ResNet "out-of-the-box" — but this
  is error-tolerant ML, not exact-integer crypto, and not a signing benchmark). LightHash is the only photonic-PoW
  *hashing* demonstration, not signing.
- The one named vendor pursuing photonic NTT for lattice PQC (**Optalysys**) makes an **architectural/marketing
  claim only** ("process NTTs at speeds and energy efficiency traditional electronics cannot match"), with **no
  published numbers, no ADC/DAC accounting, no reproducible benchmark, no stated machine**, and is oriented toward
  FHE rather than the digital-signature NTT. It does **not** clear this phase's bar. [vendor claim — uncited as
  evidence; recorded only to mark the gap]
- **No performance number is asserted in this document.** Any net-win figure for photonic-accelerated ML-DSA
  signing would be synthesized — the posture forbids it.

**What would close the gap → the benchmark plan (§6).**

---

## 6. Benchmark plan (what would make Lane A "real")

Acceptance (charter §4 Lane A): *a runnable bench — photonic-accelerated sign **net** faster than digital after
re-quantization + a passing digital re-verify; if it's a wash, say so and stop.*

### 6.1 Baseline (must exist first, and is buildable today, no photonics)
Establish the **digital** ML-DSA-65 signing baseline with a vetted library — the same `@noble/post-quantum`
`ml_dsa65` already used for size profiling (`signature-custody-v0.md` §3, §8). Report:

| Metric | How |
|---|---|
| `Sign(sk, 32B digest, ctx)` wall-clock, median + p99 over ≥10⁴ runs | high-res timer; warm cache; signing the `integrity_root` |
| Per-op breakdown (NTT vs `A·y` matmul vs SHAKE sampling vs rounding vs bound checks) | profiler / instrumented build — establishes the *offloadable fraction* `f` |
| Verify wall-clock (the cost the re-verify gate re-pays) | same harness |
| **The exact machine** | CPU model, clock, RAM, OS, library version, single-thread vs SIMD |

The offloadable fraction `f` (NTT + `A·y` as a share of total sign time) is the **ceiling on any possible photonic
win** (Amdahl): even an infinitely fast optical MVM cannot beat `1/(1−f)`. If `f` is small, **stop here and report
a wash** — no photonics needed to reach the verdict.

### 6.2 Photonic-accelerated path (only if `f` justifies it)
On a real photonic MVM (silicon-photonic mesh / commercial photonic tensor core), measure the **full loop**:

| Stage | What to measure | The tax it must overcome |
|---|---|---|
| DAC: load `y` / poly coeffs into the optical input | latency + energy per conversion | the input-conversion tax |
| Optical MVM (`A·y` and/or NTT butterflies) | optical compute latency + power | the *only* thing optics speeds up |
| ADC: read the analog result | latency + energy; **bit-precision recovered** | the dominant tax (Meech et al.) |
| **Re-quantize to exact `Z_q`** + error-correct to the exact integer | CPU cycles + any retry/error-correction cost | the LightHash precision tax, at full 23-bit `q` |
| Digital remainder: reduction, sampling, hashing, rounding, bound checks, rejection retries | wall-clock | unavoidable digital floor |
| **Digital re-verify** of the produced signature | wall-clock (must return `true`) | the trust-gate cost |

### 6.3 The decision rule (fail-closed, honest)
- **Net win** iff `T_photonic_full_loop < T_digital_baseline` *and* the re-verify passes on every run *and* the
  re-quantization produces the bit-exact integer at the required rate. Report the machine for both sides.
- **Correctness gate (hard):** any run whose photonic-then-requantized result does **not** match the
  digital-only signature, or whose digital re-verify returns `false`, is a **failure of the accelerator**, not a
  tolerated approximation. Fail-closed: an accelerator that cannot reproduce the exact signature is rejected.
- **If it's a wash or worse, say so and stop** (charter §4). Do not ship a photonic-signing performance claim
  without this bench + machine (charter §3 honest ledger).

### 6.4 Galerina's role (the part this project actually owns)
Galerina does **not** build the accelerator. Galerina owns **governance + the deterministic re-verify gate**: the
host-call boundary that (a) invokes the vetted FIPS-204 verifier on the re-quantized signature, (b) treats any
mismatch/`unknown` as `deny` (K3 three-valued, charter §2), and (c) keeps the photonic unit strictly outside the
trust boundary. Crypto cannot live in `.spore` (the governance language rejects even bitwise `^`,
`signature-custody-v0.md` §7); the accelerator is even further out — an untrusted external compute resource whose
output is only ever *checked*, never *trusted*.

---

## 6.5 §6.1 baseline — RESULTS (measured 2026-06-16)

> Measured with the vetted `@noble/post-quantum` `ml_dsa65` already used for size profiling, in
> `tri-encription/bench/` — `lane-a-baseline.mjs` (wall-clock), `lane-a-profile.mjs` + `lane-a-attribute.mjs`
> (offloadable fraction `f` by CPU self-time attribution). Pure-JS, single-thread, **order-of-magnitude on the
> stated machine — not a native/WASM or production ceiling.** Raw output: `bench/lane-a-baseline-result.txt`,
> `bench/lane-a-fraction-result.txt`.

**Machine:** Intel Core i9-9900K @ 3.60 GHz · 16 threads · Node v24.16.0 · win32 x64 · `@noble/post-quantum`
0.6.1 (pure JS, single thread). ML-DSA-65 signature = 3309 B (confirmed at runtime).

### Wall-clock — `Sign(sk, 32 B digest)` and `Verify`, 10⁴ runs each
| Op | ops/s | mean | p50 | p90 | p99 | p99.9 | max |
|---|---|---|---|---|---|---|---|
| **sign** | 178 | 5.63 ms | 4.53 | 10.37 | 18.91 | 26.67 | 42.63 (ms) |
| **verify** | 639 | 1.566 ms | 1.556 | 1.604 | 1.796 | 2.279 | 2.752 (ms) |

Sign is heavy-tailed (p99 = 4.2× p50) — the Fiat-Shamir-with-aborts rejection loop (variable iterations, §2).
Verify is tight (no rejection loop). **The mandatory digital re-verify gate (§6.4) costs ≈ 1.566 ms ≈ 28 % of
mean sign time** — it re-pays a large share of any sign-side saving (the §6.2 sign-path tax, confirmed).

### Offloadable fraction `f` (the Amdahl ceiling)
Method: V8 sampling profiler (`--cpu-prof`, 100 µs interval, **23,151 samples over 15.4 s of pure signing**),
self-time bucketed by `(function, file:line)`. `LINEAR` = the **only** photonic-eligible work (forward/inverse
NTT butterflies in `fft.js` + `MultiplyNTTs`); everything else is digital must-stay (§2 table). Full per-leaf
breakdown is printed by the harness so the bucketing is auditable.

| Bucket | Share | What |
|---|---|---|
| **LINEAR (offloadable)** | **37.7 %** | NTT fwd/inv (35.4 % `fft.js` butterfly + 1.4 % inv-NTT) + `MultiplyNTTs` 0.8 % |
| SAMPLE_HASH (digital) | 31.0 % | SHAKE/Keccak — `ExpandA`, `ExpandMask`, `SampleInBall`, μ/c̃ hashing (`keccakP` alone 29.2 %) |
| ORCH (digital) | 17.1 % | sign rejection-loop control + array slicing (a pure-JS artifact) |
| ROUND_CHECK (digital) | 7.2 % | `HighBits`/`LowBits` (Decompose), `polyChknorm`, hint, bit-packing |
| GLUE (digital) | 6.2 % | poly add/sub, alloc, byte↔u32 |
| NONCOMPUTE | 0.9 % | GC, `(program)`, OS entropy |

- **`f` (raw profile) = 37.7 %** of all sign CPU time is in `LINEAR` (NTT + `MultiplyNTTs`). **This is a loose
  UPPER bound, not the offloadable fraction:** V8 inlines the mod-`q` reduction *into* the butterfly leaf
  (`fft.js:268` = 94 % of `LINEAR`), and **mod-`q` is the §2 re-quantization checkpoint that MUST stay digital**
  after an optical multiply-accumulate — it cannot be offloaded. An optical MVM removes only the
  **multiply-accumulate (MAC)**, never the reduction. (Found by the adversarial verification pass; the raw 37.7 %
  credited digital re-quantization to the offloadable bucket.)
- **Correcting for it** (`lane-a-mac-split.mjs`, same machine — a faithful DIF butterfly timed *with* vs *without*
  the `% q`): the mod-`q` reduction is **~22 %** of butterfly time, the offloadable MAC ~78 %. Removing mod-`q`
  (plus the pure-mod inverse-NTT normalize loop, 1.4 %) gives the **true offloadable fraction `f ≈ 28 %` →
  Amdahl ceiling ≈ 1.40×**. The MAC/mod split is JIT/impl-sensitive in pure JS — an independent microbench in
  verification put mod-`q` higher (~48 % → `f ≈ 19 %`, ceiling ~1.23×) — so honestly **`f ∈ ~19–38 %`, ceiling
  ∈ ~1.23–1.60×**, realistic centre **~28 % / 1.40×**. Caching `A` across signatures (removing the per-signature
  `ExpandA` SHAKE subtree, measured 14.4 % inclusive — `@noble` already expands `A` once per *signature*, not per
  attempt, so this is a fair sensitivity) nudges the ceiling up by a similar small factor; it does not change the
  verdict.
- The offloadable mass is the **NTT transforms** (`fft.js`, 35 %), *not* the pointwise `A·y` multiply
  (`MultiplyNTTs`, 0.8 %): in `@noble`, `A·y` is realised as `NTT⁻¹(NTT(A) ∘ NTT(y))`, so the §2 "single largest
  dense linear op" lives *inside* the NTT, and the real photonic target is "the NTT", not the pointwise step.

### Verdict (decision rule §6.3): **a wash — record it and stop.**
Amdahl caps the *ideal* sign-latency speedup (infinitely fast optical MAC, conversion-free) at only **~1.4×
(range ~1.23–1.60×)**. The two unavoidable digital costs then collapse even that:
1. the **mandatory re-verify gate** — ≈ 1.566 ms ≈ **28 % of mean sign**. This is a tax **specific to the
   photonic path**: a pure-digital signer trusts its own deterministic core and does *not* re-verify, whereas the
   photonic path *must* (the accelerator is untrusted, §6.4) — so it is an added cost, not a double-count of
   sign-internal time. With it, even an *infinite* MAC nets only **~1.1–1.2×** (independent end-to-end model).
2. the **ADC/DAC conversion tax** — Meech et al.: median realized **1.9× of an ideal 9.4×** (≈ 80 % of the optical
   gain eaten), and ML-DSA's exact-`Z_q`, 23-bit-`q` re-quantization is the **worst-case, highest-precision**
   conversion regime (§4). With a finite, Meech-style MAC the modelled net is **≈ 0.9× — a net loss.**

So the realizable net is **≤ ~1× (a wash) or below** — a ~1.2–1.6× Amdahl ceiling, finished off by the re-verify
gate and the conversion tax. **§6.1 is settled** — the posture-compliant outcome (§6.3, charter §4). No §6.2
photonic bench is warranted at ML-DSA-65 sizes on this evidence.

**Scope of this verdict (what is NOT claimed):** this is for **ML-DSA-65 sign *latency* on commodity, single-
thread, pure-JS hardware**. It does **not** refute — these are out of scope, not disproven — (a) an **energy /
J-per-signature** win (LightHash projects ~10× energy, §3); (b) **batched/amortized** signing that spreads the
per-signature DAC load and `ExpandA` across many signatures; or (c) **larger lattice parameters** where the NTT
share — and thus `f` — grows. The wash is a *latency* verdict at these sizes, not "photonics never helps signing".

**Caveat — direction of the pure-JS bias:** the 17.1 % `ORCH` overhead is a pure-JS artifact; a native/SIMD signer
(AVX2 Keccak + vectorized NTT) speeds **both** `LINEAR` and `SAMPLE_HASH`, so the net effect on `f` is itself an
estimate. The expectation that `f` does not *grow* natively rests on the irreducible SHAKE expansion
(`ExpandA`/`ExpandMask`) dominating optimized Dilithium signing — directionally supported but **not measured
here** (a native bench would confirm). Either way it points the conservative way for the wash verdict.

---

## 7. Honest risk register

| Risk | Severity | Note |
|---|---|---|
| Re-quantization + error-correction eats the gain | **High** | The LightHash lesson + Meech et al.'s median-1.9×-after-conversion finding; exact `Z_q` is the costly precision regime |
| Offloadable fraction `f` is small for ML-DSA-65 | **High** | Small polys (deg-256, 6×5 module); tuned digital NTT already fast; Amdahl caps the win at `1/(1−f)` |
| Mandatory digital re-verify shrinks the net sign-side win | Medium | The trust gate re-pays much of the verify cost |
| Vendor numbers mistaken for benchmarks | Medium | Optalysys / press releases are claims, not reproducible benches; never cite as performance evidence |
| Treating analog output as the signature | **Fatal (rejected)** | A photon cannot be the signature; precision wall vs EUF-CMA. Already in the honesty ledger (charter §3) |

---

## 8. Verdict

- **Honest-core (defensible now):** the offload boundary in §2 is correct and the safety architecture (photonic
  MVM → re-quantize to exact `Z_q` → digital re-verify, photonics outside the trust gate) is sound and matches the
  one real precedent (LightHash). Galerina's deliverable here is the **governance + deterministic re-verify gate**,
  which is buildable independent of any photonics.
- **Aspirational (unproven):** that photonic acceleration yields a *net* speedup for ML-DSA-65 signing. There is
  **no benchmark** for the full photonic-NTT signing loop with ADC/DAC overhead — a **theoretical gap**. The two
  most relevant peer-reviewed results (LightHash; the data-conversion bottleneck study) both suggest the
  conversion tax likely eats the gain at ML-DSA-65 sizes. **No number is asserted.**
- **Action — DONE (2026-06-16):** the §6.1 *digital* baseline + offloadable-fraction measurement is built and run
  (§6.5). It **settles the question:** the measured offloadable (MAC) fraction `f ≈ 28 %` (range ~19–38 %; mod-`q`
  stays digital) caps the *ideal* sign-latency win at **~1.4×ceiling**; the photonic-path-only re-verify gate and
  the ADC/DAC conversion tax take the realizable net to **≈ 0.9× — a wash or net loss**. Per §6.3 / charter §4
  this is recorded and the lane stops here; **no §6.2 photonic bench is warranted** at ML-DSA-65 *latency* sizes
  on this evidence (energy / batched / larger-param regimes are out of scope, not refuted). (The honest-core
  deliverable — the governance + deterministic re-verify gate, §6.4 — remains valid, independent of the negative
  perf result.)

---

## Sources

Peer-reviewed / primary, retrieved this run:

- Sunil Pai, Taewon Park, Marshall Ball, Bogdan Penkovsky, Michael Dubrovsky, Nathnael Abebe, Maziyar
  Milanizadeh, Francesco Morichetti, Andrea Melloni, Shanhui Fan, Olav Solgaard, David A. B. Miller,
  *Experimental evaluation of digitally verifiable photonic computing for blockchain and cryptocurrency* (LightHash),
  **Optica 10(5):552, 2023**, DOI 10.1364/OPTICA.476173 —
  https://dabm.stanford.edu/wp-content/uploads/2023/04/J291.pdf
  (6×6 interferometer mesh, ~6-bit precision, discrete-integer re-quantization + error correction, ~10× energy
  projected.)
- Michael Dubrovsky, Marshall Ball, Bogdan Penkovsky, *Optical Proof of Work*, **2019**, arXiv:1911.05193 —
  https://arxiv.org/abs/1911.05193 (HeavyHash; inserting a photonic MVM into PoW; CAPEX-not-OPEX mining.)
- James T. Meech, Vasileios Tsoutsouras, Phillip Stanley-Marbell, *The Data Conversion Bottleneck in Analog
  Computing Accelerators*, **2023**, arXiv:2308.01719 — https://arxiv.org/abs/2308.01719
  (Ideal 9.4× → median **1.9×** realized after ADC/DAC across 27 benchmarks; conversion constrains analog
  accelerators unless they replace nearly all digital compute.)
- Lightmatter et al., *Universal photonic artificial intelligence acceleration*, **Nature, 2025** —
  measured **65.5 TOPS @ 78 W electrical + 1.6 W optical**, ABFP-16, BERT/ResNet out-of-the-box. Real photonic-MVM
  datapoint, but ML inference (error-tolerant), not exact-integer crypto.
  https://radicaldatascience.wordpress.com/wp-content/uploads/2025/04/nature-paper-_universal-photonic-artificial-intelligence-acceleration_.pdf
  (publisher: https://www.nature.com/)

Standards / specs (canonical):

- **FIPS 204**, *Module-Lattice-Based Digital Signature Standard (ML-DSA)*, NIST, 2024 —
  https://csrc.nist.gov/pubs/fips/204/final (parameters, NTT, rejection sampling, two-check verification.)
- RFC 8032, *Edwards-Curve Digital Signature Algorithm (EdDSA)* — https://www.rfc-editor.org/rfc/rfc8032
  (Ed25519, the classical half of the #34 hybrid.)

Not cited as evidence (recorded only to mark the gap):

- Optalysys, *Post-Quantum Cryptography and Photonics* — vendor/architectural claim, **no published numbers, no
  ADC/DAC accounting, no reproducible benchmark, FHE-oriented**. Does not meet this phase's grounding bar.
  https://optalysys.com/resource/post-quantum-cryptography-and-photonics-a-future-proof-approach-to-security/
