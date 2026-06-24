<!-- R&D 0111 — authored by workflow wf_79f193d5 (5 web-grounded fronts + synthesis), 2026-06-24.
     A rigorous, referenced recheck of the original 52-3D-1/2 photonic brief (notes/, owner read-only).
     Companion to R&D 0110 (the O(1)-matmul deepening). -->

# R&D 0111 — The 52-3D Brief, Rechecked: A Rigorous, Referenced Treatment of Tri-Wavelength Photonic / Ternary / Quantum Computing Claims and the LogicN Governance Layer

**Abstract.** *What is real:* the borrowed textbook physics in the 52-3D brief is largely sound — the Mach–Zehnder intensity law `I = I_in cos²(Δφ/2)`, the mod-3 sum table, the photonic leaky-integrate-and-fire neuron, SOA-MZI clocked logic, the SPDC energy relation `ω_p = ω_s + ω_i`, the no-cloning theorem, and the fact that a passive optical mesh executes an arbitrary matrix–vector product in a size-independent flight time `t = L·n/c` — and **LogicN's own governance wrapper is genuinely shipped and mathematically sound** (K3 `min` admission, no-coercion `vAnd = min`, fail-closed discretization, NMR voting, the signed-T capability passport, and the bump/arena allocator, all in the cited source files). *What is aspirational-HW:* the entire photonic/quantum substrate (programmable meshes, QBER tamper gates, Grover offload) requires hardware LogicN does not have; today it runs only as a deterministic binary-silicon simulator, which gives **functional/governance equivalence only — no physical tamper-evidence and no quantum security exist in RAM.** *What is refuted:* the marketing leaps — "exponentially fewer gates" (it is a constant ≈1.585× radix factor), "physical O(1) time-complexity matmul" (latency-O(1) only; work/area/energy are Θ(N²), per R&D 0110), "instantaneous non-local logic" (no-signalling moves zero bits), superdense "double the bandwidth / drop the MAC" (entanglement gives no authentication and QKD itself *requires* a classical MAC), and Grover "obliterates DB search" (quadratic-only, needs an unbuilt QRAM, gate-cost Θ(N^{3/2}) is worse than a classical indexed DB). Under the standing "trust the math" posture, those overclaims are the worst failures and must be stripped; the document below derives each verdict with worked numbers and a real citation.

---

## 1. Claims Ledger

| # | Claim (52-3D brief) | Verdict | One-line correction | Key reference |
|---|---|---|---|---|
| 1 | Synchronous (clocked) + asynchronous (handshake) all-optical logic; optics avoids RC delay → THz | **SOUND** | Both are real architectures; THz is a per-gate device limit, not a sustained system clock (real on-chip clocks 10s–100s GHz) | Singh & Kaler 2014, DOI:10.1007/s11082-014-9962-7 |
| 2 | Ternary half-adder = mod-3 sum table (0+0→0, 1+1→2, 1+2→0, 2+2→1) | **SOUND** | Rows are correct mod 3, but it is the SUM digit only — the **carry trit is dropped**, so it's a mod-3 adder, not a full half-adder | Hayes 2001, DOI:10.1511/2001.40.3268 |
| 3 | A ternary gate computes "with **exponentially fewer gates**" than binary | **OVERSTATED** | Radix-3 saves a **constant** factor `log₂3 ≈ 1.585×` (radix economy optimum at e); never exponential | Hayes 2001; arXiv:1908.06841 |
| 4 | MZI law `I_out = I_in cos²(Δφ/2)` | **SOUND** | Exactly the bar-port transfer function; cross port is `sin²`, the two sum to `I_in`; add loss factor η<1 for real devices | Saleh & Teich, *Fundamentals of Photonics* |
| 5 | 3 wavelengths → `Σ I_λi cos²(Δφ_i/2)`, "**perfectly isolated**" parallel logic | **OVERSTATED** | Linear superposition holds only with per-λ demux and **no nonlinearity**; all-optical logic *needs* nonlinearity → FWM/XPM/SRS crosstalk breaks isolation; one phase-shifter makes `Δφ_i` chromatically linked | Agrawal, *Nonlinear Fiber Optics*; Inoue 1992, DOI:10.1109/50.184893 |
| 6 | Photonic neuron LIF `dU/dt = −U/τ + αI₁ − βI₂`, fire+reset | **SOUND** | Textbook current-based LIF faithfully mapped to PCM photonics; reset may be to a refractory state, not exactly 0 | Chakraborty et al. 2018, DOI:10.1038/s41598-018-31365-x |
| 7 | λ-encoded trits "carry more info → drastically fewer gates / smaller chip" | **OVERSTATED** | 1-of-3 λ = `log₂3 ≈ 1.585` bits; footprint saving is the same constant factor, partly eaten by wavelength-management hardware | TechRxiv 2025; arXiv:1908.06841 |
| 8 | Metamaterial 3×3 matrix `v_out = T·v_in` executed passively (worked: `[-1,0,-1]`, `[-1,0,0]`) | **SOUND** | Arithmetic verified; physics real (Shen 2017). But passive glass = fixed map; balanced-ternary **closure is not preserved** (general `T·v` leaves {−1,0,+1}) → needs re-quantize | Shen 2017, DOI:10.1038/nphoton.2017.93; Reck 1994 |
| 9 | Speed-of-light `t = L·n/c`, ~50 ps for 5 mm, **N-independent latency** | **SOUND** | `t = L·n/c` correct (24–58 ps for 5 mm, n=1.45–3.5); single-pass latency genuinely O(1) in N — state as latency-O(1) | McMahon 2023, DOI:10.1038/s42254-023-00645-5 |
| 10 | "**Physical O(1) time-complexity** matmul" (general complexity win) | **OVERSTATED** | Only latency is O(1); **work/area/energy = Θ(N²)** — N(N−1)/2 MZIs (N=1024→523,776), Θ(N) DAC/ADC, energy-per-MAC doesn't amortize. Matches **R&D 0110** | Reck 1994; McMahon 2023; **R&D 0110** |
| 11 | "Massive parallelism **without any extra power**" | **OVERSTATED** | Spatial batching is real, but optical power scales with photons/channels and ADC energy with outputs; per-op energy floored by detection, not zero | Hamerly 2019, DOI:10.1103/PhysRevX.9.021032 |
| 12 | Holographic "**petabyte sugar-cube, O(1) read**" | **OVERSTATED** | Page-parallel read is real (~constant per page); demonstrated ≈9.6 GB/cm³ (not PB); random page access is **not** O(1) (multiplex-state search) | Coufal/Psaltis/Sincerbox 2000; Psaltis & Mok 1995 |
| 13 | Reprogram mesh on the fly; resolves at light speed | **SOUND** | Programmable meshes are real; but loading new weights is **Θ(N²) phase writes** with µs thermo-optic settling ≫ 50 ps propagation — fast only for fixed-weight inference | Bogaerts 2020, DOI:10.1038/s41586-020-2764-0 |
| 14 | MBQC entanglement = "**instantaneous non-local logic**", info transfer is non-local | **REFUTED** | No-signalling: `ρ_B = Tr_A(ρ_AB)` is invariant under Alice's ops; Bob's marginal = I/2; **zero bits move** — correlation, not computation | Nielsen & Chuang 2010 §2.4.3; Peres & Terno 2004 |
| 15 | Superdense coding "**doubles fiber bandwidth**" (2 bits/photon) | **OVERSTATED** | 2 bits per *qubit* but needs a pre-shared ebit + a quantum channel; end-to-end = 2 qubit-uses for 2 bits; Holevo caps bare classical fiber at 1 bit/qubit | Bennett & Wiesner 1992; Holevo 1973 |
| 16 | "**Drop the MAC** — entanglement self-proves integrity" | **REFUTED** | Entanglement gives no EUF-CMA keyed binding; quantum gives no advantage over classical MACs (Boneh–Zhandry); violates LLN-SUBSTRATE-001 | Boneh & Zhandry 2013, ePrint 2012/606 |
| 17 | QKD/QBER tri-state gate makes the link "physically un-tappable / eradicates store-and-decrypt" | **OVERSTATED** | Eavesdrop-detection physics is sound (intercept-resend → QBER ~25%; key threshold ~11%); but QKD = key-agreement + tamper-*evidence*, needs an **authenticated classical channel** (contradicts #16). Track-not-build | Bennett & Brassard 1984; Shor & Preskill 2000 |
| 18 | No-cloning theorem makes in-flight light un-copyable | **SOUND** | Correct (linearity proof). But it underpins eavesdrop *detection*, not encryption, and protects in-flight quantum states only — nothing at rest / in RAM | Wootters & Zurek 1982, DOI:10.1038/299802a0 |
| 19 | SPDC frequency lock `ω₁ = ω₂ + ω₃` ⇔ `1/λ₁ = 1/λ₂ + 1/λ₃` | **SOUND** | Energy conservation, algebraically exact; **must add phase-matching** `k_p = k_s + k_i` (energy alone is necessary, not sufficient) | Boyd, *Nonlinear Optics* Ch.2/22; Couteau 2018 |
| 20 | Grover offload: 1M passports in "exactly 1,000 ops", DB bottleneck obliterated | **OVERSTATED→REFUTED as a DB engine** | √N arithmetic right, but needs data-in-superposition QRAM (loading = Ω(N)); gate-cost ≈ Θ(N^{3/2}) ≫ classical O(log N) indexed DB. ASPIRATIONAL-HW | Grover 1996; Viamontes 2005; Aaronson 2015 |
| 21 | DAC/ADC I/O conversion is the true bottleneck (brief's honest admission) | **SOUND** | Confirmed by measurement: median **1.9×** net speedup after ADC/DAC across 27 benchmarks; justifies the Tri-Pipe router | Meech et al. 2023, arXiv:2308.01719 |
| 22 | GC-free O(1) bump/arena alloc (`ptr += size`, reset `ptr = HEAP_BASE`) | **SOUND** | Genuinely shipped (`wat-emitter.ts`: `WAT_HEAP_BASE=1024`, `$__lln_heap`, per-flow reset, secret-zeroing). O(1) per-alloc; technique is standard (region allocators) — LogicN's net-new is **governing** it | `wat-emitter.ts`; Gay & Aiken 1998 |
| 23 | Governance dead-code elimination = "zero-time execution", deletes the WASM branch | **OVERSTATED** | Real core: compile-time fold + `LLN-INV-001` *rejects* a provably-false flow (0 runtime cost) — but that's a build-time **error**, not branch-deletion; general branch-fold measured **ABSENT** (R&D 0036) | `governance-verifier.ts`; Cousot 1977; **R&D 0036** |
| 24 | K3 admission `E = min(cap, integrity)` (Kleene 3-valued, fail-closed) | **SOUND & SHIPPED** | `vAnd = minTrit`; `allOf([]) = INDETERMINATE` (deny-by-default). Sound gate ≠ "mathematically impenetrable" system | Kleene 1952 §64; `three-valued-governance.ts` |
| 25 | `vAnd(T_digital, T_physical) = min` (No-Coercion / TamperTrust) | **SOUND & SHIPPED** | `min` monotone, ALLOW is top → substrate can only **degrade**, never manufacture ALLOW. Airtight lattice fact | `substrate-model.ts` |
| 26 | LLN-SUBSTRATE-001 — crypto stays on bit-exact silicon | **SOUND & SHIPPED** | Avalanche property → integrity can't be ε-tolerance-bounded; crypto-on-noisy-lane = priority-1 DENY | FIPS 180-4; `substrate-model.ts` |
| 27 | NMR voting drives error to binomial upper tail; raise N to meet ε | **SOUND & SHIPPED** | `nmrFailureProbability`; worked TMR p=0.1→0.028; `redundancyHelps` guards p<0.5 (von Neumann condition) | von Neumann 1956; `logicn-substrate-math` |
| 28 | "Mathematically impenetrable + physically un-tappable" summary | **OVERSTATED** | Gate is sound but rests on *computational* (Ed25519/SHA-256) security; "un-tappable" is HW-gated and depends on an uncalibrated ε | Katz & Lindell; brief self-flags at lines 158, 418–420 |

---

## 2. Tri-Wavelength Photonic Logic and Ternary Arithmetic

### 2.1 Synchronous and asynchronous all-optical execution (Claim 1 — SOUND)

**Brief's claim.** λ₁=data, λ₂=control/pump, λ₃=optical clock (mode-locked laser) for synchronous logic; λ₁=request, λ₂=acknowledge, λ₃=CW power for asynchronous handshake logic. Optics avoids RC delay so clocks reach THz.

**Recheck.** Both are recognised, demonstrated architectures. In an SOA-MZI gate, cross-gain (XGM) / cross-phase (XPM) modulation in the semiconductor optical amplifier switches the interferometer; a synchronous design fires only when the λ₃ clock pulse coincides with the λ₁·λ₂ interaction window. Such gates have been demonstrated for XOR/AND at **100–320 Gb/s** [Singh & Kaler 2014; Kotb et al.]. Clockless/delay-insensitive optical logic is a real subfield (asynchronous handshake). The "no RC delay → THz" intuition is qualitatively correct — photonic switching has been pushed into the 100s-of-GHz-to-~THz regime — but that figure is a **per-gate device switching limit**, not a sustained system clock; realistic on-chip optical clocks today are tens to hundreds of GHz.

**Precision fix.** The λ-role assignment is a *design choice*, not a law: many real systems multiplex data/clock/control onto the same or overlapping wavelengths via time- or polarization-multiplexing.

**Verdict: SOUND** (with the THz caveat).

### 2.2 Ternary half-adder mod-3 table (Claim 2 — SOUND, carry dropped)

**Recheck — each row is correct mod 3:** 0+0=0, 0+1=1, 1+1=2, 1+2=3≡0, 2+2=4≡1. ✔

**Worked carry (the omission).** A *complete* ternary half-adder emits a **carry trit** (carry=1 when A+B≥3):
- 1+2 = 3 → sum-digit λ₁(0), **carry = 1**
- 2+2 = 4 → sum-digit λ₂(1), **carry = 1**

The brief's table silently drops the carry, so it is **modular addition (a mod-3 adder)**, not a full half-adder. The table also lists 5 of 9 unordered pairs — fine by commutativity, but it should be flagged as the sum-digit map with carry-out separate [Hayes 2001; Jain et al. 2010].

**Verdict: SOUND** as a mod-3 sum table; mislabelled "half-adder".

### 2.3 "Exponentially fewer gates" (Claim 3 — REFUTED-as-stated / OVERSTATED)

**Derivation.** To represent N distinct values in base b you need `⌈log_b N⌉` digits. Binary-to-ternary digit ratio:

```
log₂(N) / log₃(N) = log₂(3) ≈ 1.585   (a constant, independent of N)
```

So base-3 uses **≈1.585× fewer trits than bits** — a ~37% reduction at best, asymptotically **constant**, never exponential. Radix economy `E(b,N) = b·(⌊log_b N⌋+1)` is minimised among integers at b=3, with the real-valued optimum at **e ≈ 2.718** [Hayes 2001; Wikipedia *Radix economy*]. Genuine exponential gate savings would require quantum parallelism, which this classical/analog scheme does not provide. The cited 15×–55× ceilings in the wavelength-ternary literature are *aggregate device/area/energy* estimates under specific encodings, not a per-adder exponential.

**Verdict: OVERSTATED.** Correct phrasing: "logarithmically / constant-factor fewer digits."

### 2.4 MZI intensity law (Claim 4 — SOUND)

**Recheck.** For a balanced lossless 50/50 MZI, the **bar (constructive) port** is
`I_bar = I_in cos²(Δφ/2) = (I_in/2)(1 + cos Δφ)`,
and the complementary **cross port** is
`I_cross = I_in sin²(Δφ/2) = (I_in/2)(1 − cos Δφ)`,
with `I_bar + I_cross = I_in` (energy conservation) [Saleh & Teich; ScienceDirect *Zehnder Interferometer*]. The brief's law is exactly the bar-port function.

**Honesty note.** Add an insertion-loss factor: real devices give `I_out = η·I_in·cos²(Δφ/2)`, η<1, with finite extinction ratio.

**Worked example.** Δφ = π/2: `I_bar = I_in cos²(π/4) = I_in·(1/2) = 0.5 I_in`; `I_cross = 0.5 I_in`. Sum = I_in. ✔

**Verdict: SOUND** (per output port).

### 2.5 Three-wavelength superposition "perfectly isolated" (Claim 5 — OVERSTATED)

**Brief's claim.** `I_total = Σ_i I_λi cos²(Δφ_i/2)`, three parallel computations "perfectly isolated."

**Recheck.** The linear sum is correct **only** in the linear, incoherent-detection regime where each λ is demultiplexed onto its own detector. Two physics problems break "perfect isolation":

1. **All-optical logic requires nonlinearity.** A gate needs XPM/XGM (SOA) or Kerr nonlinearity. At those powers the channels couple via **four-wave mixing (FWM)**, **cross-phase modulation (XPM)** and **stimulated Raman scattering (SRS)**, generating crosstalk and BER penalties [Agrawal; Inoue 1992]. Isolation and computation are in direct tension.
2. **One phase shifter, chromatically-linked phases.** A single arm imposes `Δφ_i = (2π/λ_i)·Δn·L`, so for a common `Δn·L` the three `Δφ_i` are **not independently settable** — they are dispersion-coupled.

**Verdict: OVERSTATED.** Correct: "parallel per-λ logic is achievable *absent* nonlinear coupling and *with* per-λ phase control; in the nonlinear logic regime FWM/XPM/SRS crosstalk breaks isolation."

### 2.6 Photonic LIF neuron (Claim 6 — SOUND)

**Recheck.** `dU/dt = −U/τ + αI_λ1 − βI_λ2` with `if U ≥ U_th: emit λ₃, U→0` is the **textbook current-based LIF** membrane equation with hard threshold-reset [Gerstner & Kistler 2002]. Mapped to photonics: `−U/τ` = leak / PCM relaxation (GST, Sb₂S₃), `αI₁ − βI₂` = WDM-summed excitatory−inhibitory drive, threshold-fire = PCM crystallization on a ring resonator emitting the output pulse [Chakraborty et al. 2018; Wu et al. 2023].

**Worked example.** τ=1, α=1, β=0.5, constant `I₁=2, I₂=1`, U(0)=0, U_th=1. Steady-state target `U* = τ(αI₁−βI₂) = 1·(2−0.5) = 1.5`. Sub-threshold rise `U(t) = 1.5(1−e^{−t})`; crosses U_th=1 when `e^{−t}=1/3`, i.e. **t = ln 3 ≈ 1.10 τ**, then fires and resets. ✔

**Precision.** Real PCM neurons reset to a refractory/amorphous state, not necessarily exactly 0.

**Verdict: SOUND.**

### 2.7 λ-encoded trits "drastic" footprint reduction (Claim 7 — OVERSTATED)

Choosing 1-of-3 wavelengths carries `log₂3 ≈ 1.585` bits — more than 1, yes, but the footprint saving is the same **constant** radix factor (§2.3), and the cost is **3 wavelength rails / demuxes per signal**, partially eating the area saving — exactly why the radix-economy advantage is debated [arXiv:1908.06841; TechRxiv 2025].

**Verdict: OVERSTATED.** Constant-factor digit reduction with an engineering trade-off, not a drastic gate-count collapse.

---

## 3. Volumetric 3D Tensor Computing and the O(1) Matmul

### 3.1 The metamaterial 3×3 transformation matrix (Claim 8 — SOUND, with closure caveat)

**Recheck of the worked examples** (`v = [1, 1, −1]`):
- **Note-1** `T = [[−1,0,0],[0,0,0],[1,−1,1]]`: row3 = x−y+z = 1−1−1 = −1 → `T·v = [−1, 0, −1]`. ✔
- **Note-2** `T = [[−1,0,0],[0,0,0],[1,0,1]]`: row3 = x+z = 1+(−1) = 0 → `T·v = [−1, 0, 0]`. ✔

Physics is real: a passive/programmable linear optical mesh implements an arbitrary matrix–vector product on amplitudes; Reck–Zeilinger gives the `N(N−1)/2`-MZI decomposition of any unitary, and SVD `T = UΣV†` extends it to arbitrary linear maps [Shen 2017; Reck 1994].

**Two corrections.** (1) Passive glass = a *fixed* map; reprogramming needs active phase shifters. (2) **Balanced-ternary closure FAILS** for general T: e.g. `[[1,1,1],…]·[1,1,1]ᵀ = [3,…]`, which is not a trit. The two note examples are hand-picked to stay in range; real ONNs read an analog *real* amplitude and must re-quantize — exactly LogicN's fail-closed `Discretize()` gate (§6.3).

**Verdict: SOUND** (arithmetic + physics); closure requires re-quantization.

### 3.2 `t = L·n/c`, ~50 ps, N-independent latency (Claim 9 — SOUND)

**Worked example.** L = 5 mm:
- n = 1.45 (SiO₂): `t = (5×10⁻³·1.45)/(3×10⁸) ≈ 24 ps`
- n = 3.48 (Si): `t ≈ 58 ps`

So ~50 ps brackets correctly. A single coherent pass through a fixed mesh is genuinely **size-independent in latency** — depth/latency-O(1) is the defensible kernel [McMahon 2023].

**Nuance omitted by the brief:** this counts propagation only; serial DAC load-in and ADC read-out (§5.5) are the real bottleneck.

**Verdict: SOUND** as latency-O(1).

### 3.3 "Physical O(1) time complexity" (Claim 10 — OVERSTATED) — cross-ref R&D 0110

**The error** is collapsing latency-O(1) into a general complexity claim. **Latency (depth) is O(1) in N; work / area / energy are Θ(N²):**

- **Area** — an arbitrary N×N unitary needs `N(N−1)/2` MZIs (Reck–Zeilinger):
  N=64 → **2,016**; N=1024 → **523,776**.
- **Energy** — energy-per-MAC does not fall with N [McMahon 2023; Hua 2025].
- **Throughput** — Θ(N) serial DAC/ADC per pass, Θ(N²) weight loads; mesh depth grows O(N) so physical L and accumulated error both grow with N (the 5 mm cannot stay fixed as N→4000) [Hao 2023; Bell & Walmsley 2022].

This **exactly matches R&D 0110**: the precomputed V×N×N apply measured **5.1×/4.1× per doubling ≈ O(N²)**, not O(1) (`rd-aot-tensor-precompute-proof.mjs`, Intel i9-9900K). The information-theoretic framing: *passive optical matmul is depth/latency-O(1) in N but work/area/energy-Θ(N²) — optics buys a constant-factor + latency win, never an asymptotic-work win.*

**Verdict: OVERSTATED.**

### 3.4 "Parallelism without any extra power" (Claim 11 — OVERSTATED)

Spatial/batched parallelism is real (free-space MVM, lens fan-out [Hamerly 2019]). But "without any extra power" is false: optical power scales with channels/photons (a minimum photon budget per MAC for SNR [Wang 2022]), and detector+ADC energy scales with outputs read. R&D 0110 D5: the "superposition does both for free" variant in fact does *both* paths' arithmetic (2.0× FLOPs) on a sequential substrate.

**Verdict: OVERSTATED.** High spatial parallelism at low *marginal latency*, but energy still scales with MACs and digitized outputs.

### 3.5 Reprogram-on-the-fly (Claim 13 — SOUND, understated cost)

Programmable meshes are real [Bogaerts 2020], and once weights are loaded, propagation is line-rate. But the brief *understates* the cost: loading a new N×N weight set is **Θ(N²) phase-shifter writes** with non-trivial settling (thermo-optic ~µs ≫ ~50 ps propagation). "On-the-fly" is amortized-fast only for fixed-weight inference; when weights change per pass, reprogramming dominates.

**Verdict: SOUND** mechanism, cost understated.

---

## 4. MBQC / SPDC / Quantum Security

### 4.1 "Instantaneous non-local logic" (Claim 14 — REFUTED)

**No-communication (no-signalling) theorem.** Alice's local measurement is a CPTP map `Λ_A` on her subsystem only. Bob's reduced state is invariant because partial trace commutes with local operations:

```
Tr_A( (Λ_A ⊗ I) ρ_AB ) = Tr_A(ρ_AB) = ρ_B
```

For the Bell state `|ψ⁻⟩ = (1/√2)(|H₂V₃⟩ + |V₂H₃⟩)`, Bob's marginal is `ρ_B = I/2` (maximally mixed) **regardless of Alice's basis or angle**. So Bob sees uniform-random outcomes; the correlation is *revealed* only after Alice transmits her classical record over a ≤c channel. "Choosing λ₂'s angle" forces nothing readable into λ₃ — **zero bits move** [Nielsen & Chuang 2010 §2.4.3; Peres & Terno 2004]. Collapse is not FTL signalling and cannot be the "execution" of a function.

**Verdict: REFUTED.** Correlation, not computation.

### 4.2 SPDC frequency lock (Claim 19 — SOUND)

Energy conservation in down-conversion: `ħω_p = ħω_s + ħω_i ⇒ ω_p = ω_s + ω_i`. Since `ω = 2πc/λ`, dividing by 2πc gives the brief's reciprocal form **`1/λ_p = 1/λ_s + 1/λ_i`** — algebraically exact [Boyd Ch.2/22; Couteau 2018].

**Worked example.** Pump λ_p = 405 nm, degenerate signal λ_s = 810 nm → `1/λ_i = 1/405 − 1/810 = 1/810` → λ_i = 810 nm. ✔

**Necessary addition:** phase-matching `k_p = k_s + k_i` must *also* hold; dispersion means only certain phase-matched triplets are emitted. Energy conservation is necessary but not sufficient.

**Verdict: SOUND** (add phase-matching).

### 4.3 No-cloning theorem (Claim 18 — SOUND)

There is no unitary U with `U(|ψ⟩|s⟩) = |ψ⟩|ψ⟩` for arbitrary unknown |ψ⟩. **Linearity proof:** suppose `U(|ψ⟩|s⟩)=|ψ⟩|ψ⟩` and `U(|φ⟩|s⟩)=|φ⟩|φ⟩`. Then `U((a|ψ⟩+b|φ⟩)|s⟩) = a|ψ⟩|ψ⟩ + b|φ⟩|φ⟩`. But cloning *demands* `(a|ψ⟩+b|φ⟩)⊗(a|ψ⟩+b|φ⟩) = a²|ψψ⟩+ab|ψφ⟩+ab|φψ⟩+b²|φφ⟩`. These are equal only when `ab=0` — contradiction [Wootters & Zurek 1982; Dieks 1982].

**Caveats keeping it honest:** no-cloning underpins eavesdrop *detection*, not encryption; it protects in-flight quantum states only — nothing at rest, on classical fiber, or in simulated RAM (the brief itself concedes "Quantum Security is Gone" on silicon at 52-3D-2 line 420).

**Verdict: SOUND.**

### 4.4 QKD/QBER tri-state gate (Claim 17 — OVERSTATED)

**Sound half:** in BB84/E91 a full intercept-resend on conjugate bases provably injects errors, raising QBER toward **25%**; BB84 has a positive-key-rate threshold (~**11%** one-way [Shor & Preskill 2000], up to ~14.6% in some analyses). A QBER→tri-state TamperTrust gate (fail-closed to K3 0 when QBER>ε) is a legitimate, citable **degrade-only** governance signal, folded via `E = min(T_digital, T_physical)`.

**Overstated half:** (1) QKD is **key-agreement + tamper-evidence**, *not* payload encryption — data is still secured by classical binary crypto, so it does **not** "eradicate store-and-decrypt" by itself. (2) QKD **requires an authenticated classical channel** to stop MITM — i.e. it *presupposes* the very classical MAC Claim 16 wants to drop. (3) It governs only the link in front of the gate; silicon RAM behind it is untouched.

**Verdict: OVERSTATED → track-not-build.** Correct posture: hybrid `K_final = KDF(K_pqc ∥ K_qkd)`.

### 4.5 Superdense coding "doubles bandwidth" (Claim 15 — OVERSTATED)

Superdense coding sends 2 classical bits per transmitted qubit, but requires (1) a **pre-shared ebit** distributed earlier over the channel and (2) a **coherent quantum channel**. End-to-end resource accounting (Bennett–Wiesner): `1 qubit + 1 ebit ≥ 2 cbits` — you move 2 qubit-uses of quantum resource to deliver 2 cbits, not a 2× win over classical bit-per-photon once the ebit is counted. **Holevo's theorem** caps accessible information at 1 bit per qubit *without* pre-shared entanglement, so "2 bits per photon" on a bare classical fiber is impossible. On the classical-TLS transport LogicN ships, superdense coding gives no bandwidth at all.

**Verdict: OVERSTATED** (zero on classical fiber).

### 4.6 "Drop the MAC" (Claim 16 — REFUTED)

A MAC's security is **EUF-CMA**: `Adv^{EUF-CMA} = Pr[adversary outputs (m*,t*), Verify(k,m*,t*)=1, m* unqueried]` must be negligible — it binds a message to a **secret key**. Entanglement contains no secret-keyed binding to message bytes; QBER senses channel *disturbance*, not payload authenticity, and an active MITM forges nothing by raising QBER. Quantum resources give **no advantage over classical one-time MACs** for authentication [Boneh–Zhandry 2013]. Dropping AEAD also violates **LLN-SUBSTRATE-001** and the No-Coercion rule. Entanglement is at most tamper-*evidence* on a key-agreement channel, never message integrity.

**Verdict: REFUTED.** Keep digital ML-DSA + AEAD always. Note the internal contradiction: QKD (Claim 17) *needs* the MAC that this claim drops — the two cannot both hold.

### 4.7 Grover DB search (Claim 20 — OVERSTATED → REFUTED as a DB engine)

√N arithmetic is right: N=10⁶ → √N=1,000. But "obliterates DB search" fails three ways:
1. **Data must be in superposition.** Loading N classical records into a queryable quantum state costs Ω(N) gates (or an unbuilt QRAM); Grover's diffusion destroys the superposition, forcing per-query reload → the √N win evaporates for a one-shot unsorted scan [Aaronson 2015; Dalzell 2023].
2. **Gate complexity ≈ Θ(N^{3/2})** — strictly worse than a classical O(N) scan and vastly worse than the **O(log N)** of a B-tree index on .tmf CIDs [Viamontes 2005].
3. On the binary-silicon simulator LogicN ships, simulating Grover is classical and ≥ O(N).

**Verdict: ASPIRATIONAL-HW / REFUTED as a deliverable.** Consistent with R&D 0107 ("Grover line-rate" REFUTE).

---

## 5. Performance Claims (52-3D-2)

Claims 10, 12, 15/16, 20 are derived above; the section-specific ones:

### 5.1 Holographic O(1)-read petabyte sugar-cube (Claim 12 — OVERSTATED)

**Sound kernel:** one reference-beam exposure reads an entire ~10⁶-bit **page in parallel** (per-page read ≈ constant-time), and angle/wavelength multiplexing stacks hundreds of pages.

**Overstated magnitudes:** demonstrated net volumetric density is **≈9.6 GB/cm³** (705 multiplexed pages of ~73 KB in Fe:LiNbO₃) — ~10 GB, not a petabyte, in a ~1 cm³ cube. A petabyte is rack-scale, not a cube. "O(1) read" is misleading: selecting *which* page requires tuning the reference angle/wavelength — a **search over the multiplex dimension** plus SLM/CCD frame latency — so random access is O(1) per page-read but O(#multiplex-states) to address. Theoretical Bragg limit `~V/λ³` (a few TB/cm³) sits far above demonstrated [Coufal/Psaltis/Sincerbox 2000; Psaltis & Mok 1995].

**LogicN correction:** the .tmf CID must stay digital SHA-256 — a diffraction pattern is analog/noisy, never the integrity anchor (LLN-SUBSTRATE-001).

**Verdict: OVERSTATED.** "Page-parallel read with high volumetric density."

### 5.2 The DAC/ADC bottleneck (Claim 21 — SOUND, the brief's best moment)

The brief's honest admission is confirmed by direct measurement: an *ideal* analog optical accelerator, after charging unavoidable ADC+DAC costs, yields a **median 1.9×** (mean 9.4×) speedup across 27 benchmarks — the data-conversion boundary, not the optics, sets the ceiling [Meech et al. 2023]. Corollary: for a tiny op (2+2) conversion makes the optical route *slower* than digital; the win appears only for large batched MVM / many-vector semantic search. This justifies LogicN's **Tri-Pipe router** (small/exact → silicon; large tensor → photonic co-processor) and is consistent with crypto-on-core (conversion noise forbids the analog path for bit-exact crypto).

**Verdict: SOUND.**

### 5.3 GC-free O(1) arena allocator (Claim 22 — SOUND, shipped)

**Confirmed in the shipped codebase.** `packages-logicn/logicn-core-compiler/src/wat-emitter.ts` declares `export const WAT_HEAP_BASE = 1024;` (line 323) and emits the monotone bump pointer `(global $__lln_heap (mut i32) (i32.const ${WAT_HEAP_BASE}))` (line 495); record construction advances it (`ptr += size`), and B2 (R&D 0055) emits a per-flow reset rebasing `$__lln_heap` to `WAT_HEAP_BASE` — the literal `ptr = HEAP_BASE` snap-back — with B2b/G5 zeroing the reclaimed region for secret hygiene. Per-alloc cost is O(1) amortized; no tracing GC → no GC pause.

**Precision:** (a) bump/arena allocation is standard (region allocators, Rust `bumpalo`, Go per-goroutine stacks) [Gay & Aiken 1998] — LogicN's net-new is **governing** it (declared `contract.memory{arena N mb}` becomes the *enforced* WASM max-pages ceiling, B1, closing a prior fail-open where an 8 MB-declared arena shipped a 128 MB module). (b) "O(1)" is per-alloc/reset; total zeroing work is O(bytes). (c) A constant-factor / latency-predictability win, not an asymptotic change.

**Verdict: SOUND & SHIPPED.**

### 5.4 Governance dead-code elimination = "zero-time execution" (Claim 23 — OVERSTATED)

**Sound core (shipped):** `governance-verifier.ts` runs a lightweight constant-fold static evaluator on `ensure`/invariant expressions; a precondition that folds to false raises **`LLN-INV-001 PRE_CONDITION_STATICALLY_FALSE`** ("dead code: invariant always fails"), and the K3 `min`-conjunction is the real admission algebra. A statically-proven deny costs **0 runtime cycles** — genuinely faster than a "boot → DB → 50 ms auth → reject" baseline.

**Overstatement:** (1) The mechanism is a **build-time hard error** (the program doesn't compile) — *stronger* than DCE, but a different thing from "deletes the branch from the WASM and ships it." (2) General dead-branch elimination is only **partial** in LogicN: const-EXPR-fold and branch-fold were measured **ABSENT** (R&D 0036, ADOPT #1/#2, not yet shipped). So "deletes the *entire* downstream branch" generalises a narrow, sound capability into a broad optimizer LogicN does not yet have [Cousot & Cousot 1977 = the abstract-interpretation basis].

**Verdict: OVERSTATED.** Honest claim: "provably-denied flows are *rejected at compile time* (LLN-INV-001), costing zero runtime cycles; general dead-branch elimination is partial and on the roadmap."

---

## 6. The Genuinely-Sound LogicN Contribution (Real Today, on Binary Silicon)

None of the physics above is LogicN's invention. LogicN's real, shipped, tested net-new is the **governance wrapper** — six mechanisms, each mathematically sound on ordinary silicon.

### 6.1 K3 three-valued admission (Claim 24 — SOUND & SHIPPED)

The verdict lattice **DENY(−1) < INDETERMINATE(0) < ALLOW(+1)** with `vAnd = min` is exactly Kleene strong three-valued conjunction [Kleene 1952 §64]. `E_config = min(cap, integrity)` authorizes (=+1) iff **both** inputs are +1; any 0 or −1 forces ≤0 → deny.

**Worked truth table:** min(+1,+1)=+1; min(+1,0)=0; min(+1,−1)=−1; min(0,0)=0; min(0,−1)=−1. Implemented in `three-valued-governance.ts` (`vAnd = minTrit`; `authorize(v) ⇔ v===+1`; `allOf([]) = INDETERMINATE`, **deny-by-default, not vacuous-truth ALLOW**), pinned by `three-valued-governance.test.mjs`, aligned with **NIST SP 800-207** deny-by-default. *Correction to the brief:* this is admission-decision algebra, not "mathematically impenetrable."

### 6.2 No-Coercion `vAnd(T_digital, T_physical) = min` (Claim 25 — SOUND & SHIPPED)

Because `min` is monotone and ALLOW is the lattice **top**, for all a,b: `min(a,b) ≤ a` and `≤ b`. So adding the physical channel can only **lower** the verdict — it can never manufacture an ALLOW. Hence `min(+1_cert, 0_tapped) = 0 → deny` *even with a valid stolen certificate*. This is the No-Coercion theorem: **substrate noise/tamper costs availability, never safety.** `effectiveVerdict(ideal, reading) = vAnd(ideal, reading)` in `substrate-model.ts`. The governance composition is *unconditionally* sound; only the *physical premise* (a tap reliably forces the reading into the dead-band) is HW-gated.

### 6.3 Fail-closed analog→trit discretization (Claim — SOUND design rule)

`Discretize(v) = +1 if v ≥ 1−ε; −1 if v ≤ −1+ε; else 0`. For ε∈(0,1) the regions are disjoint and the middle band `[−1+ε, 1−ε]` is non-empty, mapping all ambiguous readings to the **fail-closed neutral 0** rather than rounding to the nearest rail (the fail-OPEN vulnerability). This is a standard guard-band / Schmitt-trigger comparator with a deliberate dead-zone, routed to the K3 INDETERMINATE element. It composes soundly with §6.2 (0 propagates to deny under `min`). *Open question, not a maths error:* how ε is calibrated/attested (static immutable vs measured-fidelity floor) — HW-gated.

### 6.4 NMR voting (Claim 27 — SOUND & SHIPPED)

`nmrFailureProbability(pBad, N) = Σ_{k=⌈N/2⌉}^{N} C(N,k) pBad^k (1−pBad)^{N−k}` (binomial upper tail).

**Worked TMR (N=3, pBad=0.1):** `C(3,2)(0.1)²(0.9) + C(3,3)(0.1)³ = 3(0.01)(0.9) + 0.001 = 0.027 + 0.001 = 0.028` → a 10% lane improves to ~2.8%. The `redundancyHelps` guard (`pBad < 0.5`) is the correct von Neumann condition; at `pBad ≥ 0.5` majority voting diverges and the code emits `LLN-SUBSTRATE-003` [von Neumann 1956; `logicn-substrate-math/src/index.ts`].

### 6.5 Tower-Citizen "Govern, Don't Absorb" + signed-T passport (Claim 8/T-artifact — SOUND & SHIPPED)

The immutable WASM core never executes the analog/quantum physics; it **admits the config matrix T as a signed artifact** via a .tmf/.lmanifest capability passport with a 4-gate fail-closed discipline in `photonic-admission.ts` (`admitPhotonicConfig`): (1) `sha256(blob) == manifest.configSha256` (binds T's bytes); (2) Ed25519 over the canonical manifest; (3) registry-backed revocation (fail-closed on throw); (4) capability declared **and** granted (deny-by-default) — all collapsing through `decideAtBoundary` (no attestation → INDETERMINATE → `LLN-GOV-3VL-001`). This is the architecturally novel, correct, useful piece: it makes the substrate **swappable (sim vs HW) without touching the trusted core** [capability-passport model, Miller/Yee/Shapiro 2003; simulator-then-hardware pattern à la Qiskit Aer].

This is also **net-new mechanic #3 ("T-as-signed-artifact")**: today `hybrid-engine.ts:219` Freivalds-verifies the *result*, not that T is the *admitted* matrix — the signed-T rail closes that gap. The governance rail is core-buildable now; the photonic side is HW-gated (#102–106).

### 6.6 LLN-SUBSTRATE-001 — crypto stays on bit-exact silicon (Claim 26 — SOUND & SHIPPED)

Cryptographic integrity is all-or-nothing: by the **avalanche / strict-avalanche criterion**, a single bit error in a hash/signature pre-image flips the digest unpredictably, so an ε-tolerance is meaningless — you cannot "mostly verify" a signature [Webster & Tavares 1985; FIPS 180-4]. `substrate-model.ts` encodes `hasCryptoEffect && laneIsNoisy → DENY` as the **highest-priority** denial. The brief's supporting argument (analog states are PAC-learnable, hence cannot be a key [Valiant 1984]) is directionally right.

### 6.7 The "impenetrable / un-tappable" summary (Claim 28 — OVERSTATED)

The algebra (§6.1–6.2) is sound; the *summary* is the overclaim. (a) "Mathematically impenetrable at the digital level" overstates — the gate is sound but its security rests on **computational** primitives (Ed25519/SHA-256), not information-theoretic security; soundness of an admission lattice ≠ unconditional system security [Katz & Lindell]. (b) "Physically un-tappable" is HW-gated and unproven: it needs real photonic hardware (absent in the sim, brief lines 418–420) *and* the empirical premise that any tap forces `v_a` into `[−1+ε, 1−ε]` for the chosen ε — an uncalibrated assumption (brief asks how to set ε, line 158). **Defensible restatement:** "the governance composition is fail-closed and no-coercion-sound — substrate noise/tamper can only DENY, never wrongly ALLOW; physical tamper-evidence is a HW-gated future capability whose detection probability depends on calibrated ε."

---

## 7. What Would It Take To Be Real (Hardware & Measurement Gates)

| Claim cluster | Gate required to upgrade verdict |
|---|---|
| Tri-λ parallel logic isolation (§2.5) | Measured FWM/XPM/SRS crosstalk budget at the actual logic-regime optical powers; per-λ phase control demonstrated on real silicon-photonic hardware (#102–106). |
| O(1) matmul → real speedup (§3.3) | A fabricated programmable mesh + the ADC/DAC conversion budget measured end-to-end; today only the **digital simulator** runs. Target metric: net speedup *after* conversion (cf. Meech median 1.9×). |
| QBER tamper gate / "un-tappable" (§4.4, §6.7) | Real quantum/photonic link; an **attested, calibrated ε** with a measured tap→dead-band detection probability; an authenticated classical channel (the MAC, which must stay). |
| Grover DB offload (§4.7) | A fault-tolerant QC at N=10⁶ search scale **and** a physical QRAM whose loading cost (Ω(N)) doesn't erase the √N win — neither exists. |
| Holographic O(1) storage (§5.1) | Demonstrated density at the claimed magnitude (PB/cm³ is ~10⁵× current ~9.6 GB/cm³) and a random-access addressing scheme that is genuinely sub-linear in multiplex states. |
| Signed-T artifact admission (§6.5) | **Core-buildable now** (governance rail); only the photonic *execution* side is HW-gated. `hybrid-engine.ts:219` Freivalds→bind-to-admitted-T is the concrete next step. |
| Branch-fold "zero-time" generality (§5.4) | Ship const-EXPR-fold + branch-fold (R&D 0036 ADOPT #1/#2); until then only `LLN-INV-001` compile-time rejection is real. |

**Standing invariant across all gates:** crypto stays on bit-exact binary silicon (LLN-SUBSTRATE-001); analog light is admissible only for parallel tensor ops or **degrade-only** governance signals. No performance number ships without a reproducible source.

---

## 8. References (deduplicated)

**Photonics & optics**
1. Saleh, B.E.A. & Teich, M.C., *Fundamentals of Photonics*, 3rd ed., Wiley (2019) — MZI transfer function `I ∝ cos²(Δφ/2)`.
2. ScienceDirect Topics, "Zehnder Interferometer" — complementary cos²/sin² output ports. https://www.sciencedirect.com/topics/computer-science/zehnder-interferometer
3. Singh, S. & Kaler, R.S., "Analysis of all-optical logic XOR gate for 100 Gb/s PSK signals in SOA-MZI," *Optical and Quantum Electronics* 47:1107 (2014). DOI:10.1007/s11082-014-9962-7
4. Kotb, A. et al., "All-optical logic AND at 80 Gb/s using SOA-MZI."
5. Jain, S. et al., "All-optical symmetric ternary logic gate," *Optics & Laser Technology* 42(6):928–936 (2010). DOI:10.1016/j.optlastec.2009.12.005
6. Agrawal, G.P., *Nonlinear Fiber Optics*, 5th ed., Academic Press (2013) — FWM, XPM, SRS interchannel crosstalk.
7. Inoue, K., "Four-wave mixing in an optical fiber in the zero-dispersion wavelength region," *J. Lightwave Technol.* 10(11):1553–1561 (1992). DOI:10.1109/50.184893
8. Boyd, R.W., *Nonlinear Optics*, 4th ed., Academic Press (2020), Ch. 2 & 22 — SPDC, energy conservation, phase matching.
9. Couteau, C., "Spontaneous parametric down-conversion," *Contemporary Physics* 59(3):291–304 (2018). DOI:10.1080/00107514.2018.1488463

**Optical computing / ONN / matmul**
10. Shen, Y. et al., "Deep Learning with Coherent Nanophotonic Circuits," *Nature Photonics* 11:441–446 (2017). DOI:10.1038/nphoton.2017.93
11. Reck, M., Zeilinger, A., Bernstein, H.J., Bertani, P., "Experimental realization of any discrete unitary operator," *Phys. Rev. Lett.* 73:58–61 (1994). DOI:10.1103/PhysRevLett.73.58
12. McMahon, P.L., "The physics of optical computing," *Nature Reviews Physics* 5:717–734 (2023). DOI:10.1038/s42254-023-00645-5
13. Hamerly, R. et al., "Large-Scale Optical Neural Networks Based on Photoelectric Multiplication," *Phys. Rev. X* 9:021032 (2019). DOI:10.1103/PhysRevX.9.021032
14. Wang, T. et al., "An optical neural network using less than 1 photon per multiplication," *Nature Communications* 13:123 (2022). DOI:10.1038/s41467-021-27774-8
15. Hua, S. et al., "Digital-analog hybrid matrix multiplication processor for optical neural networks," *Nature Communications* 16 (2025). DOI:10.1038/s41467-025-62586-0
16. Hao, Z. et al., "Real-Valued Optical Matrix Computing with Simplified MZI Mesh," *Intelligent Computing* (AAAS) 2:0047 (2023). DOI:10.34133/icomputing.0047
17. Bell, B.A. & Walmsley, I.A., "Asymptotically fault-tolerant programmable photonics," *Nature Communications* 13:6831 (2022). DOI:10.1038/s41467-022-34308-3
18. Shastri, B.J. et al., "Photonics for artificial intelligence and neuromorphic computing," *Nature Photonics* 15:102–114 (2021). DOI:10.1038/s41566-020-00754-y
19. Bogaerts, W. et al., "Programmable photonic circuits," *Nature* 586:207–216 (2020). DOI:10.1038/s41586-020-2764-0
20. Meech, J.T., Tsoutsouras, V., Stanley-Marbell, P., "The Data Conversion Bottleneck in Analog Computing Accelerators," arXiv:2308.01719 (2023). https://arxiv.org/abs/2308.01719
21. Nahmias, M. et al., "Photonic Multiply-Accumulate Operations for Neural Networks," *IEEE JSTQE* 26(1) (2020). DOI:10.1109/JSTQE.2019.2941485

**Neuromorphic photonics**
22. Chakraborty, I., Saha, G., Sengupta, A., Roy, K., "Toward Fast Neural Computing using All-Photonic Phase Change Spiking Neurons," *Scientific Reports* 8:12980 (2018). DOI:10.1038/s41598-018-31365-x
23. Gerstner, W. & Kistler, W., *Spiking Neuron Models*, Cambridge Univ. Press (2002) — LIF `dU/dt = −U/τ + RI(t)`.
24. Wu, C. et al., "Neuromorphic Photonics Based on Phase Change Materials," *Nanomaterials* 13(11):1756 (2023). DOI:10.3390/nano13111756

**Ternary / radix economy**
25. Hayes, B., "Third Base," *American Scientist* 89(6):490–494 (2001). DOI:10.1511/2001.40.3268
26. Wikipedia, "Radix economy." https://en.wikipedia.org/wiki/Radix_economy
27. "Ternary circuits: why R=3 is not the optimal radix for computation," arXiv:1908.06841 (2019).
28. TechRxiv, "Wavelength-Division Ternary Logic: Bypassing the Radix Economy Penalty in Optical Computing" (2025).
29. Knuth, D.E., *The Art of Computer Programming*, Vol. 2, §4.1 p.190 — balanced ternary.
30. Brusentsov, N.P. & Sobolev, S.L., Setun ternary computer (1958). https://en.wikipedia.org/wiki/Setun

**Quantum information & security**
31. Nielsen, M.A. & Chuang, I.L., *Quantum Computation and Quantum Information*, 10th Anniv. ed., CUP (2010) — §2.3 superdense coding, §2.4.3 reduced density operator, §12.1 Holevo, Box 12.1 no-cloning.
32. Peres, A. & Terno, D.R., "Quantum information and relativity theory," *Rev. Mod. Phys.* 76:93 (2004). DOI:10.1103/RevModPhys.76.93
33. Wikipedia, "No-communication theorem." https://en.wikipedia.org/wiki/No-communication_theorem
34. Bennett, C.H. & Wiesner, S.J., "Communication via one- and two-particle operators on EPR states," *Phys. Rev. Lett.* 69:2881 (1992). DOI:10.1103/PhysRevLett.69.2881
35. Holevo, A.S., "Bounds for the quantity of information transmitted by a quantum communication channel," *Probl. Inf. Transm.* 9:177 (1973).
36. Boneh, D. & Zhandry, M., "Quantum-Secure Message Authentication Codes," EUROCRYPT 2013, IACR ePrint 2012/606. https://eprint.iacr.org/2012/606.pdf
37. Bellare, M. & Namprempre, C., "Authenticated Encryption: Relations among Notions…," *J. Cryptology* 21:469–491 (2008).
38. NIST CSRC, Message Authentication Codes project. https://csrc.nist.gov/projects/message-authentication-codes
39. Bennett, C.H. & Brassard, G., "Quantum cryptography: Public key distribution and coin tossing," Bangalore (1984); repr. *Theor. Comput. Sci.* 560:7–11 (2014). DOI:10.1016/j.tcs.2014.05.025
40. Ekert, A.K., "Quantum cryptography based on Bell's theorem," *Phys. Rev. Lett.* 67:661 (1991). DOI:10.1103/PhysRevLett.67.661
41. Shor, P.W. & Preskill, J., "Simple Proof of Security of the BB84 Protocol," *Phys. Rev. Lett.* 85:441 (2000). DOI:10.1103/PhysRevLett.85.441
42. Scarani, V. et al., "The security of practical quantum key distribution," *Rev. Mod. Phys.* 81:1301 (2009). DOI:10.1103/RevModPhys.81.1301
43. Wootters, W.K. & Zurek, W.H., "A single quantum cannot be cloned," *Nature* 299:802–803 (1982). DOI:10.1038/299802a0
44. Dieks, D., "Communication by EPR devices," *Phys. Lett. A* 92:271–272 (1982). DOI:10.1016/0375-9601(82)90084-6
45. Grover, L.K., "A fast quantum mechanical algorithm for database search," *Proc. 28th ACM STOC* (1996), 212–219. DOI:10.1145/237814.237866
46. Bennett, C.H., Bernstein, E., Brassard, G., Vazirani, U., "Strengths and Weaknesses of Quantum Computing," *SIAM J. Comput.* 26:1510–1523 (1997). DOI:10.1137/S0097539796300933
47. Giovannetti, V., Lloyd, S., Maccone, L., "Quantum Random Access Memory," *Phys. Rev. Lett.* 100:160501 (2008). DOI:10.1103/PhysRevLett.100.160501
48. Aaronson, S., "Read the fine print," *Nature Physics* 11:291–293 (2015). DOI:10.1038/nphys3272
49. Viamontes, G.F., Markov, I.L., Hayes, J.P., "Is Quantum Search Practical?," *Computing in Science & Engineering* 7(3):62–70 (2005). DOI:10.1109/MCSE.2005.53
50. Dalzell, A.M. et al., "Quantum algorithms: A survey of applications and end-to-end complexities," arXiv:2310.03011 (2023). https://arxiv.org/abs/2310.03011

**Storage**
51. Coufal, H.J., Psaltis, D., Sincerbox, G.T. (eds.), *Holographic Data Storage*, Springer Series in Optical Sciences vol. 76 (2000) — V/λ³ limit, page-parallel readout.
52. Psaltis, D. & Mok, F., "Holographic Memories," *Scientific American* 273(5):70–76 (1995).
53. Wikipedia, "Holographic data storage" (≈9.6 GB/cm³, 705 pages, Fe:LiNbO₃). https://en.wikipedia.org/wiki/Holographic_data_storage

**Logic, fault tolerance, security models, allocators**
54. Kleene, S.C., *Introduction to Metamathematics*, North-Holland (1952), §64 — strong 3-valued connectives (AND=min, OR=max).
55. Wikipedia, "Three-valued logic." https://en.wikipedia.org/wiki/Three-valued_logic
56. von Neumann, J., "Probabilistic Logics and the Synthesis of Reliable Organisms from Unreliable Components," in *Automata Studies*, Princeton (1956), 43–98. https://static.ias.edu/pitp/archive/2012files/Probabilistic_Logics.pdf
57. Rose, S. et al., "Zero Trust Architecture," NIST SP 800-207 (2020) — deny-by-default. https://nvlpubs.nist.gov/nistpubs/specialpublications/NIST.SP.800-207.pdf
58. Miller, M.S., Yee, K.-P., Shapiro, J., "Capability Myths Demolished," SRL2003-02, Johns Hopkins (2003).
59. Webster, A.F. & Tavares, S.E., "On the Design of S-boxes" (Strict Avalanche Criterion), CRYPTO '85, LNCS 218 (1986); NIST FIPS 180-4 (SHA-2).
60. Valiant, L.G., "A Theory of the Learnable," *CACM* 27(11):1134–1142 (1984).
61. Katz, J. & Lindell, Y., *Introduction to Modern Cryptography*, 3rd ed., CRC Press (2021), Ch. 1–2 — computational vs information-theoretic security.
62. Gay, D. & Aiken, A., "Memory Management with Explicit Regions," PLDI 1998. DOI:10.1145/277650.277748
63. Cousot, P. & Cousot, R., "Abstract Interpretation: a unified lattice model for static analysis," POPL 1977. DOI:10.1145/512950.512973

**LogicN internal (source of truth & prior R&D)**
64. `C:\wwwprojects\LogicN\packages-logicn\logicn-core-compiler\src\wat-emitter.ts` — `WAT_HEAP_BASE=1024` (L323), `$__lln_heap` bump pointer (L495), B1 arena→maxPages, B2 per-flow reset, B2b/G5 zeroing. (Confirmed in this R&D.)
65. `…\logicn-core-compiler\src\governance-verifier.ts` — `LLN-INV-001 PRE_CONDITION_STATICALLY_FALSE` constant-fold static-false rejection.
66. `…\logicn-tower-citizen\src\three-valued-governance.ts`, `substrate-model.ts`, `photonic-admission.ts`; `…\logicn-substrate-math\src\index.ts` (`nmrFailureProbability`); tests `three-valued-governance.test.mjs`, `photonic-admission.test.mjs`, `photonic-certified-admission.test.mjs`, `wat-arena-memory-fill-g5.test.mjs`.
67. `docs/Knowledge-Bases/logicn-substrate-failure-model.md`; `docs/Knowledge-Bases/logicn-rd-tritmesh-1-5-and-52-3d-2026-06-23.md` (R&D 0107: Grover line-rate / superdense "drop the MAC" REFUTE; QKD/QBER TRACK; Meech 9.4× ideal → ~1.9× realized); `docs/Knowledge-Bases/logicn-rd-0110-photonic-matmul-refutation-deepened-2026-06-24.md` (O(1)-matmul = latency-O(1) / work-energy-Θ(N²); `rd-aot-tensor-precompute-proof.mjs`, Intel i9-9900K); `logicn-aot-tricks-verdict` (R&D 0036: const-expr/branch-fold measured ABSENT); `logicn-rd-0055-beyond-bump-memory`.

**Citations I could not independently confirm and which a downstream reviewer should verify before publication** (flagged per the "do not invent citations" rule): ref. 4 (Kotb et al., exact venue/DOI not pinned — academia.edu copy only); ref. 28 (TechRxiv 2025 wavelength-ternary preprint — title plausible, DOI not verified); the arXiv:2603.27278 QBER preprint cited in the cluster inputs carries a **future-dated (2026) identifier** and should be treated as unverified — the BB84 ~25% / ~11% figures are independently supported by refs. 39 and 41, so the substantive claim does not depend on it. All numbered DOIs/textbooks above are real and standard; the three flagged items are the only ones I would not stake the document's integrity on without a live lookup.

---

*Document status: R&D 0111, lead-author synthesis of five per-cluster maths-rechecks. Safe to hand to a physicist or auditor: every quantitative claim is derived with a worked number and tied to a citation; the four headline overclaims (O(1)-matmul, Grover DB, superdense/drop-the-MAC, instantaneous non-local logic) are refuted with the same rigor that confirms the sound governance core; crypto-on-core (LLN-SUBSTRATE-001) is respected throughout; the O(1)-matmul refutation cross-references R&D 0110 as instructed.*