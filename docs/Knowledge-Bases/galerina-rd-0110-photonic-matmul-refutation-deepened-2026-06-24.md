# R&D 0110 — Deepening the TritMesh "O(1)-matmul" refutation (2026-06-24)

> Owner ask: take the one genuinely-measured refutation (the "closest miss" for a paper), **recheck the maths,
> do deep R&D into real projects/literature, and see if it can be improved**. Done via web-enabled workflow
> `wf_2f00b28c` (5 fronts: maths-recheck · real-photonic-hardware · literature-novelty · local-projects-mining ·
> improvement-path + synthesis). Proof under audit: `scripts/rd-aot-tensor-precompute-proof.mjs` (D1–D5).

## 1. Maths verdict — SOUND (re-ran PASS on the named machine), with two tighter bounds

Re-ran on Intel i9-9900K @3.60GHz / node v24.16.0 / win32: all D1–D5 hold, re-derived from first principles, **no
errors**. The v2 harness fixes (xorshift32 over the v1 LCG low-bit artefact; isolated FLOP counters) are legitimate.
- **D1** (closure densifies) is *under-stated*: the real result is an **N-invariant random-digraph percolation
  threshold** — density depends only on out-degree `d` (crosses ~0.5 between d=1 and d=2; supercritical d>1 ⇒ giant
  SCC ⇒ T_reach→~all-ones). The D3 blow-up has a clean closed form **N/d** (512/8 = 64), not an empirical "64×".
- **D2** (apply O(N²)) correct; 5.2×/4.4× per doubling brackets O(N²)≈4× (small-N 5.2× is cache inflation → 4.0).
- **D3/D4/D5** correct (O(N²) mem/O(N³) build; 39.4× fusion fill-in; superposition = exact 2× FLOPs equality).

## 2. The crux — the refutation partly attacks a STRAWMAN (unanimous, high-confidence)

It **conflates LATENCY-O(1) with WORK-O(N²)** and measures only *work* on a *sequential CPU*, then uses that to
rebut a *latency* claim ("single hardware pulse is false"). Serious photonics papers do **not** claim work-O(1):
- Nature 2025 PACE (s41586-025-08786-6): latency "scales **linearly with matrix size**" (O(N)), >10,000 components
  for 64×64 (O(N²) area).
- ONN (s41467-021-27774-8): latency-O(1) per MVM **conditioned on** the matrix already loaded (after O(N²) area + load).

So "O(1)" is **defensible as amortized depth/latency-per-reuse**. What is genuinely false is **O(1) work/energy/area**.

### Sharpened, defensible claim (adopt verbatim — replaces "single pulse is false")
> Applying a dense N×N linear map is **Θ(N²) work on any substrate** that injects N inputs and extracts N outputs
> through O(1)-width transducers (information-theoretic lower bound: each of N outputs depends on N inputs).
> Photonics can deliver **O(1) circuit-depth / O(N) optical-path latency, amortized toward O(1) per reuse** — but
> only after **O(N²) area (modulators), O(N²) energy (photon-MACs + DAC/ADC), and O(N²) weight-load**, with the
> **digital periphery dominating**. On Galerina's sequential CPU/Tower substrate there is **no O(1)**; the precompute
> is the classic amortization trade (wins dense/all-pairs/small/high-reuse, loses sparse/single-source/large/
> low-reuse — exactly the TritMesh governance-matrix regime), not a free lunch.

This is **more general AND more defensible** — it makes a substrate-independent theorem out of a CPU timing (kills
"but it's only emulation") while staying honest that optics *can* be latency-O(1).

## 3. Novelty verdict — NO paper. Every leg is already published (often with stronger evidence).

All five fronts independently reached "defensive-pub, not paper-worthy" at high confidence. The *sharpened* claim
**is the textbook consensus**. Closest prior art:

| Galerina leg | Decisive published prior art (stronger) |
|---|---|
| "apply O(N²) / speed-of-light misleading" | **McMahon, Nat. Rev. Phys. 5, 717 (2023)** (arXiv:2308.00088) — canonical: speed of light "is NOT a key differentiating property". Nature 2025 PACE: latency O(N). |
| "I/O dominates / Amdahl caps it" | **"The Data Conversion Bottleneck…," arXiv:2308.01719** — MEASURED **1.94× median** across 27 benchmarks, 743 real ADC/DAC surveyed (stronger than CPU emulation). Albireo (2405.07266). |
| "sparse→dense closure, O(N²) mem" | Textbook transitive-closure (1960s graph theory). |
| "chain fusion densifies" | Textbook sparse-LA fill-in. |
| "superposition = 2× FLOPs" | Textbook SIMD/GPU predication. |
| ternary "drop the MAC" / O(1) volumetric | **BitNet's own GEMM table** (1.37–6.17× constant, never sub-O(N³)); T-MAC (2410.16144); shot-noise floor Hamerly PRX 9, 021032. |
| system-metric deflation | **arXiv:2511.00186** already does overhead-inclusive correction on real device models. |

The misconception is **already corrected in print (McMahon) and already measured (2308.01719)**, and Galerina's
target is **internal AI-authored marketing**, not a literature misconception — so there is no external misconception
to correct. Fails the standing bar (`measured-negative on a named machine correcting a literature misconception`).

## 4. Improvement plan (the "improve it" deliverable) — ordered; all CPU-measurable except #10

| # | Action | Effort | Proves | HW-blocked |
|---|---|---|---|---|
| 1 | **Fix the latency-vs-work conflation** — re-scope to §1, drop "single pulse is false", add a depth-vs-work table + D2b synthetic DAC/ADC + N²-load term. **Integrity-critical.** | S | refutation correct without overclaiming vs optics | No |
| 2 | **Tighten D1 to a theorem** — sweep N∈{128…8192}×d∈{1…8}; show N-invariance, ~0.5 crossover, exact N/d blow-up. | S | densification is a percolation threshold, not a lucky seed | No |
| 3 | **Reframe D2 as an information-theoretic Ω(N²) lower bound** (any O(1)-transducer substrate). | S | kills "O(1) optical matmul" by counting, immune to "it's emulation" | No |
| 4 | **Pair the two benches** — `rd-aot-tensor-precompute-proof.mjs` + corpus sibling `treewalker-speed/photonic-claims-audit.mjs` into one self-verifying runner. | S | two independent witnesses to the same negative | No |
| 5 | **int8-ternary GEMV vs f64 GEMV microbench** (N=128/256/512). | S | ternary win is a bounded constant (reproduces BitNet 1.37–6.17× locally) | No |
| 6 | **Literature-anchored comparison table** in the KB (each D-claim → published source). | M | prior-art coverage complete ⇒ defensive-pub is honest+grounded | No |
| 7 | D6: structured/low-rank head-on (rank-r⇒O(Nr); butterfly⇒O(N log N)) then show Galerina matrices densify (D4) ⇒ shortcut doesn't apply here. | M | turns a generic refutation into a **workload-specific** measured-negative | No |
| 8 | **Amdahl on Galerina's OWN workload** — measure matmul-fraction p of real governed flows + use **real TritMesh reachability/routing matrices** (density/query-mix/reuse). | M | even a *free* photonic core can't deliver marketed end-to-end speedup on this workload — **the only genuinely-new, unpublished part** | No |
| 9 | Quantified cross-over inequality `reuse·core_saving > conversion_overhead` anchored to published pJ numbers. | M | pins the TritMesh regime on the losing side | No |
| 10 | Real photonic testbed / calibrated device model. | L/XL | the only way to measure a *photonic* negative honestly | **YES** (and pre-empted by McMahon / 2308.01719) |

**Honesty ledger (mandatory):** tag every claim **Tier-A = MEASURED-ON-CPU** (substrate-independent where noted) vs
**Tier-B = ARGUED-FROM-LITERATURE-WITH-CITATION** (needs real HW to measure). This is the single most important
integrity upgrade and what keeps "trust the math" intact.

## 5. Honest go/no-go

**NO-GO for a flagship paper. Recommendation: STAY DEFENSIVE-PUB but HARDEN the artifact** (execute #1–#6, all
S/M, CPU-now). The refutation, even sharpened, re-derives published results; Galerina's CPU emulation *cannot in
principle* measure a *photonic* negative (it measures JS on an i9-9900K).

**The ONE genuinely-unpublished sliver is NOT photonics physics (saturated) — it is Galerina's own workload** (Action #8):
- **Title (workshop note only, if wanted):** *"Amdahl Eats the Optics: Why Governed Dataflow Gets No Asymptotic
  Win From a Free Linear-Algebra Core."*
- **Claim:** on a representative corpus of governed Galerina flows the matmul-fraction p is small enough that even an
  idealized **free O(1) optical MVM core** is Amdahl-capped below ~1.1×; and the governance matrices are
  small/sparse/single-source/low-reuse (densify under D1/D4) ⇒ on the losing side of the published photonic cross-over.
- **Single most important experiment:** measure p + the matrix-property distribution on **real production TritMesh
  matrices**, named machine, seeded — true and unpublished *because it is about Galerina's workload, not optics*.

Do **not** pursue a photonics-physics paper (pre-empted, HW-blocked). Saying "the math re-derives published
results" plainly *is* the win condition for a "trust the math" brand.

**Status:** R&D 0110 = defensive-pub (confirmed). Build actions #1–#6 are queued as the buildable improvement set.
Source workflow `wf_2f00b28c`. Supersedes the paper-question's "closest miss" framing for this item.
