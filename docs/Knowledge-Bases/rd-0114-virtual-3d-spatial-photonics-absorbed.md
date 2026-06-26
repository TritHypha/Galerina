<!-- ABSORBED from R&D 0114 (Galerina-R-AND-D, worker; commit 3cea4bb) into the production KB on 2026-06-25.
     Adversarially honesty-audited (0 overclaims, bar held), maths spot-verified. It CONVERGES with the
     hub's own honest results: the realized-~1.91× ceiling matches the emulator run in
     galerina-percent-audit-roadmap-2026-06-25-v2.md / galerina-integer-types-and-lowering.md §appendix, and
     the "carries the value payload but NEVER the decision" governance is exactly the
     [untrusted-governed-lane.md] principle (No-Coercion: the MAC semiring ≠ the Kleene K3 meet). This is the
     deep honest answer to the owner's "virtual 3D / even 2 waves" question — buildable line + 7 hard walls.
     Hardware stays TRACK-not-build; the buildable step is the WDM-batched-MAC emulator extension. -->

# Virtual 3D-Spatial Photonics ("Even 2 Waves") for High-Value Compute — the Honest Maths, the Buildable Line, and the Hard Walls

**R&D grounding document — 2026-06-25**
**Direction-C / photonic-tri-governance**

> **HONESTY-BAR BANNER (both fences, non-negotiable — this is R&D grounding; production is READ-ONLY).**
>
> **PHYSICS FENCE.** Optics here is a *precision-limited analog accelerator* (~8-bit ENOB, non-deterministic readout), **never** a free oracle and **never** a crypto / hash / sign operand. **latency-O(1) is not work-O(1):** light transit is N-independent in *latency*, but the *work* is Θ(N²) matrix load + Θ(N) I/O, and the 2ⁿ state-space wall is substrate-invariant. The realized ceiling is the **measured ~1.91×** (9.40× ideal × 0.203 conversion-tax retention), not "instant / same-clock-cycle / speeds silicon cannot match" — that framing is the refuted overclaim.
>
> **REFRAME FENCE.** "Virtual 3D spatial" is **not** literal 3D free-space angles (two beams crossing in free space are non-interacting bosons — no gate without a STRUCTURE like an MZI). ">6 wave vectors" = multiplexing degrees of freedom (WDM wavelength / polarization / spatial mode), **not** 3D spatial angles. The honest virtual-3D is a **3-index tensor**: ≥2 REAL axes (a spatial MZI mesh) + ≥1 SYNTHETIC axis (a frequency/wavelength lattice via WDM, time-bin, or mode) — i.e. **synthetic-dimension photonics** (Yuan–Lin–Fan). "Even 2 waves" = a minimal **2-site synthetic frequency lattice** (a beamsplitter/coupled-mode unitary in synthetic space) = the minimal virtual extra dimension.
>
> **ZERO-TRUST FENCE.** A faster/analog photonic lane is **admitted, never trusted** — governed as an untrusted **Tier-3 compute-only lane** (deny-by-default, zero crypto/network/ledger reach), **degrade-only** (its result is a degrade-only operand under a signed `toleranceWitness`, never a verdict/key). Crypto stays Binary / bit-exact (`SPORE-SUBSTRATE-001`). The only photonic artifact in the production tree is `galerina-ext-photonic-emulator`, an HONEST emulator (`executedNatively=false`, `deterministic=false`, `determinismMode="tolerance"`) — it MODELS, it does not natively execute.

---

## Executive verdict (the one-paragraph answer)

**Can virtual-3D-spatial / "even-2-waves" photonics do high-value compute?** Yes — as a **precision-limited analog MAC accelerator on a 3-index tensor** (2 real spatial axes via a Clements MZI mesh + ≥1 synthetic axis via WDM wavelengths), governed as an untrusted Tier-3 lane and built today on an honest CPU-side emulator. **No** — it is **not** a literal 3D free-space logic, **not** a free oracle, **not** an asymptotic-O(1) primitive, and **never** a crypto / hash / sign / verdict operand. The light-transit *latency* is O(1) but the *work* is Θ(N²) mesh load + Θ(N) I/O, and the precision floor (~8-bit ENOB, systematic) is unbeatable by voting. **Where it wins:** large N (above the crossover N\* ≈ 20), high synthetic reuse K (one expensive mesh build amortized across many products), heavily batched MAC-dominated kernels — and even there the honest ceiling is the **measured ~1.9×**, not "instant." **Where it loses:** small N, low K, low-MAC-fraction "wash" kernels, or anything needing bit-exactness. Every "instant / free / O(1) / 3D-angle-logic / analog-as-crypto / votes-beat-the-floor / photonic-verdict" framing is refused for substrate-invariant reasons; building a PIC moves none of these walls. The durable, transferable result is the **type / governance shape** (fail-closed discretizer + degrade-only K3 fold + category→wavelength-lane partition + signed tolerance witness), not the optics; the HW speed/energy wins are strictly additive on top of an already-proven kernel.

---

## §1 The question and the honest reframe

### 1.1 The question

We ask whether a **virtual 3D-spatial photonic substrate** — built from synthetic dimensions, in the limit "even just 2 waves" — is a sound architecture for high-value compute. The answer the maths forces:

> **Yes** as a precision-limited analog MAC accelerator on a 3-index tensor (2 real spatial axes + ≥1 synthetic axis), governed as an untrusted lane; **NO** as a literal 3D free-space logic, a free oracle, or an asymptotic-O(1) compute primitive.

### 1.2 The reframe, made precise — virtual-3D is a 3-index tensor

Define the compute object as a **rank-3 tensor**

$$
T \in \mathbb{C}^{N \times N \times K}, \qquad T[i,j,k],
$$

with the index assignment that is the entire honest content of "virtual 3D":

- **$i,j$ — two REAL physical axes.** A planar coherent photonic mesh: $i$ indexes input optical modes (waveguides / a modulator array), $j$ indexes output modes (detector channels). A configured $N$-mode Mach–Zehnder (MZI) mesh realizes one $N\times N$ slice $W^{(k)}[i,j]$ (§2). These are *spatial* in the literal silicon sense.
- **$k$ — one (or more) SYNTHETIC axis.** A lattice of $K$ internal states of the *same* spatial mode — wavelength channels (WDM), time bins, or transverse modes — each carrying an independent slice (§2.4). This is a **synthetic dimension** in the established Yuan–Lin–Fan sense: a coordinate built from a mode quantum number, not from a position in 3-space.

A single optical pass evaluates a **batched / contracted matrix product**

$$
y_k[j] \;=\; \sum_{i=1}^{N} W^{(k)}[i,j]\, x_k[i], \qquad k = 1,\dots,K . \tag{1.1}
$$

The "3D volume" is this $(i,j,k)$ index cube; the third dimension is *synthetic*, realized as parallel mode-channels, not as a third free-space angle.

### 1.3 Why literal free-space-angle logic FAILS (the refutation that forces the reframe)

Take the naive picture: two beams cross in free space at an angle; their crossing is "a gate," and ">6 directions" gives new logical states. The field equations kill this:

1. **Linearity → no interaction.** In a linear, source-free dielectric the optical field obeys the homogeneous wave equation
$$
\nabla^2 \mathbf{E} - \frac{n^2}{c^2}\,\partial_t^2 \mathbf{E} = 0 ,
$$
which is **linear**, so superposition holds exactly: $\mathbf{E}_{\text{tot}} = \mathbf{E}_1 + \mathbf{E}_2$. Two beams **add** and then **separate unchanged** — they pass *through* each other. Photons are non-interacting bosons in linear media; there is no $\mathbf{E}_1 \!\cdot\! \mathbf{E}_2$ term, hence no AND/multiply, hence **no gate** from crossing alone.
2. **A gate needs a STRUCTURE — a confined, phase-controlled unitary.** Interaction requires *co-confining* the modes in a structure whose geometry mixes them: a beamsplitter / directional coupler / MZI. Only then does relative phase produce constructive/destructive interference at a *defined* output port. The unitary is a property of the **device**, not of two angles in air.
3. **Nonlinearity is not free.** A genuine field–field product needs a $\chi^{(2)}/\chi^{(3)}$ nonlinear medium with high intensity, phase-matching, and loss — i.e. active, lossy, precision-limited elements. Passive linear optics **composes linear maps only**: it can do $Wx$, it cannot do $A\!\cdot\!A$, a general nonlinearity, or a Boolean gate "for free."

**Consequence — ">6 wave vectors" is multiplexing, not 3D-spatial logic.** Adding wave-vectors $\mathbf{k}_m$ (more angles), wavelengths $\lambda_m$, or polarizations adds **orthogonal channels** — *degrees of freedom for bandwidth*, by mode orthogonality

$$
\langle \psi_m \mid \psi_{m'}\rangle = \delta_{mm'} \quad\Rightarrow\quad \text{independent parallel lanes (DOF), not new logical states.}
$$

So the honest "virtual 3rd dimension" is a **synthetic axis $k$ over orthogonal mode-channels** (§2.4), and "even 2 waves" is the **minimal 2-site synthetic lattice** — a single beamsplitter/coupled-mode unitary in synthetic space (§2.5).

---

## §2 The maths — the optical MAC, the WDM synthetic axis, the 2-wave minimal case

### 2.1 The 2×2 MZI transfer matrix (the atom)

The mesh is built from one reconfigurable element: a Mach–Zehnder interferometer = two 50:50 directional couplers around two phase shifters $\theta$ (internal) and $\phi$ (external). A 50:50 coupler and a phase screen are

$$
B = \frac{1}{\sqrt{2}}\begin{pmatrix} 1 & i \\ i & 1 \end{pmatrix}, \qquad
P(\alpha) = \begin{pmatrix} e^{i\alpha} & 0 \\ 0 & 1 \end{pmatrix}.
$$

Cascading coupler · internal-phase · coupler · external-phase gives the **MZI transfer matrix**

$$
U_{\mathrm{MZI}}(\theta,\phi) \;=\; P(\phi)\,B\,P(\theta)\,B
\;=\; i\,e^{i\theta/2}
\begin{pmatrix}
e^{i\phi}\sin\frac{\theta}{2} & e^{i\phi}\cos\frac{\theta}{2}\\[2pt]
\cos\frac{\theta}{2} & -\sin\frac{\theta}{2}
\end{pmatrix}. \tag{2.1}
$$

$U_{\mathrm{MZI}}\in U(2)$ is **unitary** ($U^\dagger U = I$, lossless): $\theta$ sets the split ratio (the "transmittance" knob $\cos^2\frac{\theta}{2}$), $\phi$ sets the relative output phase. This is the physical home of a balanced trit on *one rail*: $\theta=0$ (pass, "+1"), $\theta=\pi$ with $\phi=\pi$ (inverted/destructive, "−1"), $\theta=\pi/2$ (3 dB split, "0"/half-power) — but only ever as a **precision-limited analog** amplitude, ~8-bit, noisy at readout (§3.4), never a clean digital verdict.

### 2.2 Reck / Clements decomposition: any $U(N)$ from $O(N^2)$ MZIs

Any $N\times N$ unitary factorizes into a product of 2×2 rotations embedded in $N$ dimensions (the photonic Givens/QR decomposition):

$$
U \;=\; D \prod_{(m,n)\in\mathcal{S}} T_{mn}(\theta_{mn},\phi_{mn}), \qquad
|\mathcal{S}| = \binom{N}{2} = \frac{N(N-1)}{2} = O(N^2), \tag{2.2}
$$

where $T_{mn}$ is $U_{\mathrm{MZI}}$ acting on rails $(m,n)$ (identity elsewhere) and $D$ is a diagonal phase screen. **Reck** (1994) gives a triangular mesh; **Clements** (2016) gives a symmetric rectangular mesh of optical depth $N$ with the same $\binom{N}{2}$ count and better loss/robustness uniformity. **The count $O(N^2)$ is load-bearing for §3:** programming the mesh is $\Theta(N^2)$ phase settings — this is the matrix-load tax, not a free O(1).

### 2.3 General (non-unitary) $W$ via SVD over two meshes + attenuators

An arbitrary real/complex weight matrix $W$ (the thing a neural layer or a governance reduction needs) is **not** unitary. Use its singular value decomposition

$$
W = U\,\Sigma\,V^\dagger, \tag{2.3}
$$

with $U,V$ unitary (one Clements mesh each, eq. 2.2) and $\Sigma = \mathrm{diag}(\sigma_1,\dots,\sigma_N)\ge 0$ a bank of **single-mode attenuators/amplifiers** (the only lossy elements). Then $y = Wx = U(\Sigma(V^\dagger x))$: three optical stages — rotate ($V^\dagger$), scale ($\Sigma$), rotate ($U$). Hardware cost $= 2\binom{N}{2}$ MZIs $+\, N$ attenuators $= \Theta(N^2)$.

### 2.4 The synthetic 3rd axis via WDM — $K$ wavelengths = $K$ parallel MACs

Run $K$ wavelengths $\{\lambda_1,\dots,\lambda_K\}$ through the *same* spatial mesh simultaneously. By WDM orthogonality each $\lambda_k$ is an independent channel carrying its own $(W^{(k)}, x^{(k)})$ (within the crosstalk budget). One pass yields

$$
\boxed{\;y^{(k)} = W^{(k)} x^{(k)}, \quad k=1,\dots,K\;}\qquad\text{($K$ parallel MACs, one mesh, one transit).} \tag{2.4}
$$

**The wavelength axis $k$ IS the synthetic tensor / batch dimension** of $T[i,j,k]$ (§1.2). This is precisely the realized speedup mechanism: amortize the (expensive, $\Theta(N^2)$) mesh build across $K$ products. If the mesh is shared ($W^{(k)}\!\equiv\!W$), one load serves $K$ inputs — the high-$K$-reuse regime where photonics actually wins (§3).

### 2.5 The 2-wave minimal case = a 2-site synthetic-frequency lattice

Make the synthetic axis *dynamical*. An electro-optic (EO) phase modulator driven at the free-spectral-range frequency $\Omega$ couples **adjacent frequency modes** $\omega_n = \omega_0 + n\Omega$ (sidebands), giving a tight-binding Hamiltonian on the frequency lattice (Yuan–Lin–Fan synthetic frequency dimension):

$$
\boxed{\;H \;=\; \sum_{n}\Big[\, t\,\big(a^\dagger_{n+1} a_n + a^\dagger_n a_{n+1}\big) \;+\; V_n\, a^\dagger_n a_n \,\Big]\;} \tag{2.5}
$$

where $a^\dagger_n,a_n$ create/annihilate a photon in frequency mode $n$, $t\propto$ EO modulation depth is the **hopping** between neighbouring frequencies, and $V_n$ is the on-site potential. The modulator literally builds a **lattice in frequency space**; the photon "moves" along the synthetic axis.

**Truncate to 2 modes ($n\in\{0,1\}$): a 2-site lattice.**

$$
H_2 = \begin{pmatrix} V_0 & t \\ t & V_1 \end{pmatrix}
\;\xrightarrow{\;U_2=e^{-iH_2\tau}\;}\;
U_2 \in U(2). \tag{2.6}
$$

With $V_0=V_1$ (degenerate, on resonance), $U_2 = e^{-iV_0\tau}\big(\cos(t\tau)\,I - i\sin(t\tau)\,\sigma_x\big)$ — a **rotation between the two frequency modes**, i.e. a **beamsplitter unitary in synthetic space**. The mixing angle $t\tau$ is the synthetic split ratio. So:

> **"Even 2 waves" = a 2-site synthetic frequency lattice = one coupled-mode/beamsplitter unitary = the minimal virtual extra dimension.** It is the synthetic-axis twin of the spatial MZI (eq. 2.1) — same $U(2)$, different (frequency) basis.

### 2.6 The full rank-3 contraction (real + synthetic together)

Let the synthetic 2-mode coupler $U_2[k,k']$ act on the wavelength index while the spatial mesh $W[i,j]$ acts on the mode index. The full operation on the rank-3 tensor input $X[i,k]$ is the **two-axis contraction**

$$
Y[j,k] \;=\; \sum_{i}\sum_{k'} W[i,j]\, U_2[k,k']\, X[i,k']
\;=\; \big(W \,X\, U_2^{\mathsf T}\big)[j,k]. \tag{2.7}
$$

The spatial mesh contracts the $i$-axis ($Wx$ per channel); the synthetic coupler contracts/mixes the $k$-axis (entangling the 2 wavelength lanes). That is a genuine **rank-3 tensor contraction realized in one optical structure** — the precise, honest meaning of "virtual 3D compute with 2 waves." With $U_2=I$ it degrades to the $K$ independent MACs of eq. (2.4).

### 2.7 The semiring hard fence (load-bearing for §3/§4/§7)

The contraction (2.7) is over the **$(+,\times)$ field semiring**. The K3 *governance* reduction is the **Kleene K3 meet (min)** — a *different* algebra. On $[\text{ALLOW},\text{ALLOW},\text{DENY}] = [+1,+1,-1]$, the K3 meet $\min=\text{DENY}$ but $(+,\times)$-consensus $=\text{ALLOW}$: they **disagree**. Therefore the optical MAC may carry only the **value/weighted payload**; the release **decision** must stay on the digital meet/join gates. The MAC is never the verdict.

> **Provenance note (audit fix).** The grounded anchor for this fence is the K3 $\mathrm{vAnd}=\min$ Kleene-meet / No-Coercion result (Direction-A, 0070) and the "associative ternary semiring reduction" framing in `photonic-ppu-virtualisation-no-hold-back.md`. We say "Kleene K3 meet (min)" rather than the loose "(min,max) semiring" shorthand to be exact: the governance lattice is the K3 meet/join on $\{-1,0,+1\}$ with DENY as the absorbing element of the meet.

### 2.8 Encoding and readout (the boundary where digits meet light)

- **Encode $x$:** map each $x_i$ onto a mode amplitude/phase via a modulator (Mach–Zehnder or micro-ring), driven by a **DAC** at $\Theta(N)$ conversions per vector. Signed/complex inputs need **coherent** amplitude+phase encoding.
- **Readout $y$:** two regimes.
  - **Coherent / signed:** **homodyne** detection against a local-oscillator reference recovers the *complex* field $y_j = |y_j|e^{i\arg y_j}$ — required because a bare photodiode loses sign/phase.
  - **Intensity only:** a photodiode yields $|y_j|^2$ (square-law), discarding sign.
  Either way readout is $\Theta(N)$ **ADC** conversions, each at finite ENOB (§3.4). The emulator encodes exactly this op: `acc += a[i]` for $w{=}{+}1$, `acc −= a[i]` for $w{=}{-}1$, skip for $0$, $\times$ scale — then injects the analog impairments (`emulator.ts: tmacPhotonic`).

**Honest read of §2:** the mesh computes $y=Ux$ (or $Wx$ via SVD) in one light-transit, but it costs $\Theta(N^2)$ to *build* the operator and $\Theta(N)$ at each I/O boundary, at ~8-bit precision. The unitary is real; the "free" is not.

---

## §3 The I/O-tax, the crossover, and the precision floor

### 3.1 The category error, stated and refuted — latency-O(1) ≠ work-O(1)

The light transit through a mesh of physical length $L$ is

$$
t_{\text{prop}} = \frac{n_{\text{eff}} L}{c}, \tag{3.1}
$$

which is **independent of $N$**. The overclaim reads this as "O(1) compute, instant, same clock cycle, speeds silicon cannot match." It is false, because *propagation latency is not the work*:

- **Matrix load is $\Theta(N^2)$.** Programming the mesh sets $\binom{N}{2}=O(N^2)$ MZI phases (eq. 2.2).
- **Encode is $\Theta(N)$.** $N$ DAC conversions to modulate $x$.
- **Readout is $\Theta(N)$.** $N$ ADC conversions to digitize $y$.

So even with $t_{\text{prop}}=O(1)$ **latency**, the **work** per matrix–vector product is $\Theta(N^2)$ (build) $+\,\Theta(N)$ (I/O), and the $2^n$ state-space wall is **substrate-invariant** — light does not shrink it. "Instant / free oracle" is refuted; the defensible statement is a **per-MAC constant-factor advantage above a crossover**, never asymptotic O(1).

### 3.2 The explicit cost model (absolute ns, anchored to the hub cost model 0053)

Price one **batched matmul-class job**: a job that performs $K$ matrix–vector products that together constitute (or are amortized like) an $N\times N$ matmul workload, at size $N$.

**Photonic lane:**

$$
\boxed{\,t_{\text{photonic}}(N,K) \;=\; \underbrace{t_{\text{setup}} + N^2\,t_{\text{phase}}}_{\text{mesh build (amortized over the job)}} \;+\; K\big(\,\underbrace{N\,t_{\text{DAC}}}_{\text{encode}} + \underbrace{t_{\text{prop}}}_{\text{transit}} + \underbrace{N\,t_{\text{ADC}}}_{\text{readout}}\,\big) \;+\; \underbrace{R\cdot K\,t_{\text{vote}}}_{\text{NMR redundancy}} \;+\; \underbrace{k\,N^2\,t_{\text{verify}}}_{\text{Freivalds re-check}}\, } \tag{3.2}
$$

> **AUDIT FIX — the digital lane must be stated at the workload's true arithmetic complexity, and this document makes that explicit.** The crossover the hub proved (0053/M1, `N*≈20.1` at `R=1`) arises from a **GEMM regime**: a single $N\times N$ matmul is $N^3$ MACs, against a photonic optical-compute term that is $O(N^2)$ (a WDM-parallel inner-product bank — one optical pass produces an $N$-vector of inner products, and $N$ such passes / a WDM-batched set produce the matmul). **Therefore, for the regime in which $N^\*$ is derived, the digital lane is the $O(N^3)$ matmul cost, not an $O(N^2)$ matvec:**

$$
\boxed{\;t_{\text{digital}}^{\text{(matmul / GEMM)}}(N) \;=\; \frac{c_d\,N^3}{\Pi}\;}\qquad\text{($N\times N$ matmul} = N^3 \text{ MACs; the regime 0053 actually proves).} \tag{3.3a}
$$

For contrast, the **per-matvec** digital cost (one $N\times N \cdot N\times 1$ product = $N^2$ MACs, $K$ of them) is

$$
t_{\text{digital}}^{\text{(matvec)}}(N,K) \;=\; \frac{K\,N^2\,t_{\text{MAC}}}{\Pi}. \tag{3.3b}
$$

These are **different models** and they yield **different crossovers** — that distinction is exactly the audit-flagged defect we are repairing. The $N^\*\approx20$ of eq. (3.4) belongs to the **matmul** model (3.3a), not the matvec model (3.3b).

Terms in (3.2): $t_{\text{setup}}$ laser/mesh warm-up; $N^2 t_{\text{phase}}$ the load tax; $t_{\text{DAC}},t_{\text{ADC}}$ per-sample conversion (**the Meech tax — these dominate**); $R$ the N-modular vote count (§3.5); $k$ the Freivalds probes; $t_{\text{verify}}$ the $O(kN^2)$ re-check (cheap vs $O(N^3)$, so verification never washes the gain — corpus C1, "4.3× cheaper than the $O(n^3)$ op at $n=256$").

### 3.3 The crossover $N^\*$, derived honestly from the matmul regime

Set the photonic optical-compute term (the $O(N^2)$ WDM-parallel inner-product bank plus its Freivalds re-check) equal to the digital **matmul** cost (3.3a). Writing the photonic side's $N^2$-coefficient as $c_{\text{opt}}$ (optical compute per element) and the re-check coefficient as $c_{\text{verify}}\,k$, and the digital matmul coefficient as $c_d$ per MAC:

$$
\underbrace{c_d\,N^3}_{\text{digital matmul (3.3a)}}\;=\;\underbrace{(c_{\text{opt}} + c_{\text{verify}}\,k)\,R\,N^2}_{\text{photonic } O(N^2)\text{ compute + re-check, } R \text{ votes}}.
$$

The $N^2$ cancels cleanly on both sides, leaving

$$
\boxed{\;N^\* \;=\; \frac{(c_{\text{opt}} + c_{\text{verify}}\,k)\,R}{c_d}\;}\qquad\text{(0053/M1; }N^\*\approx 20\text{ at }R{=}1\text{).} \tag{3.4}
$$

> **This is the honest derivation.** It is the $N^3$-vs-$N^2$ break-even — **not** "set eq. (3.2) = the per-matvec eq. (3.3b) and solve," which would cancel the $N^2$ on both sides and yield **no** $N^\*$ of this form. **One-line reader note (audit fix):** $N^\*\approx20$ specifically reflects the **$O(N^3)$-matmul-vs-$O(N^2)$-optical** regime of 0053. In a *pure* matvec workload (3.3b), the crossover is instead the **per-MAC Meech-tax break-even** (the point at which the conversion tax per element stops dominating), not the $N^3/N^2$ one. A reader who cross-multiplies eq. (3.2) against the matvec cost (3.3b) and tries to recover $N^\*=20$ will fail — and should: the two are not the same model.

### 3.4 The realized ceiling — the empirical anchor

The point-numbers the hub pins are internally consistent with the $O(N^3)$ matmul model: at $n=161$, digital $= 0.30 \times 161^3 = 1{,}251{,}984$ ns and photonic-with-verify $= 157{,}278$ ns (ratio $\approx 7.96\times$ on that single point). **We do NOT claim 7.96× as the realized headline** — it is a single un-tax-adjusted point. The defensible realized ceiling is:

$$
S_{\text{realized}} \;=\; 9.40 \times 0.203 \;\approx\; \mathbf{1.91\times}\qquad(\text{Meech arXiv:2308.01719; 0053/M1, 20\% retention}). \tag{3.5}
$$

The *ideal* per-MAC optical advantage is **9.40×**, but after the DAC/ADC conversion tax only **~20.3%** is retained, collapsing it to ~1.91×.

- **Below $N^\*$ → digital wins** (the DAC/ADC tax dominates a small product). The router **refuses** to offload; worst case is "stayed digital," never a slowdown (0053/M2: 0 mis-routes over $N{=}1..4096\times R\in\{1,3,9,25\}$; **DISMISSED** "photonics is always faster" — at $n{=}8$ photonic 546 ns ≥ digital 154 ns).
- **Above $N^\*$ → photonic wins** (the $\Theta(N^2)$ build amortizes; at $n{=}161$ photonic-with-verify 157 278 ns < digital 1 251 984 ns).

A wash-band kernel (low MAC fraction $f$) reproduces the measured **~0.87× net** (Lane-A wash, $f{\approx}0.28,\;S{=}10,\;\text{tax}{=}0.40$) — the router correctly **refuses** it.

### 3.5 Redundancy moves the crossover right (cost of buying back precision)

Each vote $R$ adds work *and* raises $N^\*$ (eq. 3.4 is linear in $R$): $N^\*: 20\to60\to181$ for $R{=}1,3,9$ (0053/M4). Buying precision by averaging is not free — it pushes the win-region to larger $N$. And it only works for *zero-mean* noise; against a **systematic** floor it never converges (§3.6) — the lane is then simply **refused**.

### 3.6 The precision floor — ~8-bit ENOB, unbeatable by voting

**Closed-form analog variance (random part).** The emulator's first-principles, MC-validated variance of the unquantized analog MAC about the exact value is

$$
\boxed{\;\mathrm{Var}\big[\hat y\big] \;=\; \sigma_{\text{phase}}^2 \sum_{i:\,w_i\neq 0} a_i^2 \;+\; \sigma_{\text{readout}}^2\;} \tag{3.6}
$$

($\sigma_{\text{phase}}$ = MZI phase-drift → per-active-element multiplicative gain error; $\sigma_{\text{readout}}$ = photodiode **shot** + **Johnson–Nyquist thermal** noise). Measured 0.349 vs predicted 0.350 over 200k draws (0053/E2).

**N-modular voting beats only the random part (1/N law).** Averaging $R$ independent readouts cuts the **zero-mean** variance by exactly $1/R$:

$$
\mathrm{Var}\big[\bar y_R\big] = \frac{\mathrm{Var}[\hat y]}{R}\qquad(\text{measured } \mathrm{Var}_1/\mathrm{Var}_4=3.94\approx4,\ \mathrm{Var}_1/\mathrm{Var}_{16}=15.88\approx16). \tag{3.7}
$$

**The systematic ADC-quantization floor (what voting CANNOT beat).** A finite-ENOB ADC over the MAC dynamic range $\pm R_{\text{dyn}}=\pm N\!\cdot\!\text{ACT}_{\max}$ has uniform step

$$
\mathrm{LSB} = \frac{2\,R_{\text{dyn}}}{2^{\,b}} = \frac{2 N\,\text{ACT}_{\max}}{2^{b}}, \qquad |\varepsilon_{\text{quant}}| \le \frac{\mathrm{LSB}}{2}. \tag{3.8}
$$

This residual is **deterministic given the input** — a *bias*, not zero-mean noise. Therefore averaging is powerless against it:

$$
\bar\varepsilon_{\text{quant},R} = \frac{1}{R}\sum_{r=1}^{R}\varepsilon_{\text{quant}} = \varepsilon_{\text{quant}} \quad\text{(constant in }R\text{)} \;\Rightarrow\; \mathrm{Var}\ \text{shrinks, the floor does not.} \tag{3.9}
$$

The empirical signature: sweeping nominal ADC bits, RMS error falls sharply while resolution-limited (**5.9× from 2→8 bits**) then **flattens** (RMS@8bit / RMS@16bit = 1.05×) — the knee sits empirically at **8 bits**, on the cited **~4–8 ENOB wall** (McMahon ≤10 / Garg 4–8; `ENOB_CEILING=8`). **Past the wall, more nominal bits buy nothing.**

**requiredRedundancy → ∞ (the formal "refuse" condition).** To meet tolerance $\tau$:

$$
R_{\text{req}} = \left\lceil \frac{\mathrm{Var}[\hat y]}{\tau^2 - \varepsilon_{\text{sys}}^2}\right\rceil, \qquad
\boxed{\;\varepsilon_{\text{sys}} \ge \tau \;\Rightarrow\; R_{\text{req}} \to \infty\;} \tag{3.10}
$$

If the **systematic** floor $\varepsilon_{\text{sys}}$ already exceeds tolerance, the denominator is $\le 0$ and **no finite vote count converges** — the lane is refused. This is the mathematical statement of fail-closed: **a lane that cannot read its result within the governance error budget abstains.**

**Therefore: degrade-only operand, never bit-exact, never crypto.**

$$
\hat y = \underbrace{y_{\text{exact}}}_{\text{truth}} + \underbrace{\eta_{\text{random}}}_{\downarrow\,1/R} + \underbrace{\varepsilon_{\text{sys}}}_{\text{irreducible floor}}, \qquad \text{ENOB} \lesssim 8.
$$

It is **never bit-exact** ($\varepsilon_{\text{sys}}\neq0$ at any finite ENOB) ⇒ the emulator honestly reports `deterministic=false`, `executedNatively=false`, `determinismMode="tolerance"`; `assertDeterminism()` correctly **throws** on a photonic result. A crypto hash/signature needs **exact, avalanche-sensitive** bit equality; a one-LSB analog error flips the digest — so **no crypto/hash/sign on the lane** (`SPORE-SUBSTRATE-001`). Crypto stays Binary/bit-exact; photonics is QRNG/PUF/LSH/tensor **outside** the gate.

---

## §4 WHY — the one genuinely buildable high-value-compute line

**The line: a wavelength-parallel batched MAC (a synthetic-dimension tensor accelerator), governed as an untrusted Tier-3 lane, built on the honest emulator first (Rung-2, no PIC).**

Concretely, the buildable object is the rank-3 tensor `T[i,j,k]` of §1.2 — two REAL spatial axes `(i,j)` realized by a Clements MZI mesh (`y = Ux`, general `W = UΣV†` via SVD, §2.2–§2.3), and one SYNTHETIC axis `k` realized by WDM wavelength channels (§2.4, eq. 2.4) — executed today inside `galerina-ext-photonic-emulator` (the Rung-2 emulator that mirrors `tmacVector` byte-for-byte and injects the real impairments), routed by the D2 cost-model partition decider, fail-closed to the exact digital core.

**The regime where it is a real win, stated precisely:**

1. **Large `N`, above the crossover `N* = (c_opt + c_verify·k)·R / c_d` (eq. 3.4; `N* ≈ 20` at `R=1`).** Below `N*` the digital lane wins because the `Θ(N)` DAC/ADC conversion tax dominates a small product (0053/M2: at `n=8`, photonic 546 ns ≥ digital 154 ns); the router refuses to offload and the worst case is "stayed digital," never a slowdown. Above `N*` the `Θ(N²)` mesh-build amortizes and photonic wins (at `n=161`, photonic-with-verify 157 278 ns < digital 1 251 984 ns). **This crossover is the $O(N^3)$-matmul-vs-$O(N^2)$-optical break-even (§3.3), not a matvec one.**
2. **High synthetic reuse `K` — the wavelength axis is the batch/tensor dimension.** One expensive `Θ(N²)` mesh build (the `binom(N,2) = O(N²)` MZI phase settings of eq. 2.2) serves `K` products in a single light-transit (eq. 2.4: `y⁽ᵏ⁾ = W⁽ᵏ⁾ x⁽ᵏ⁾` for `k=1..K`). With a shared mesh (`W⁽ᵏ⁾ ≡ W`) one load serves `K` inputs — this amortization IS the realized speedup mechanism.
3. **Heavily batched, MAC-dominated kernels** — ML inference layers, batched linear algebra, tensor contractions. Low-MAC-fraction "wash" kernels (e.g. `f ≈ 0.28`) reproduce the measured ~0.87× net loss (0053/M3) and the router correctly **refuses** them.

**The honest ceiling, never exceeded: the measured ~1.91× realized (eq. 3.5).** A constant-factor advantage above a crossover — never "instant," never asymptotic O(1).

**Why this is buildable now and both fences hold:**

- **Rung-2, no PIC required.** The emulator MODELS the device; it carries the real precision wall (closed-form variance eq. 3.6, the ENOB≤8 knee §3.6, energy-bounded WDM crosstalk) without any silicon. It reports `executedNatively=false`, `deterministic=false`, `determinismMode="tolerance"` (`photonic-bridge.ts`) — honest about being a model, not a measurement. All HW-measured numbers stay EXCLUDED until a named PIC (Rung 4).
- **Untrusted Tier-3 lane, admitted-not-trusted.** `lane:"photonic"` is a first-class shipped `SubstrateLane` (`substrate-inference.ts`); governance, the discretizer, and the fold stay on the exact digital core. The photonic result is a **degrade-only operand** under a signed `toleranceWitness`: via the K3 meet `E_final = min(T_digital, r)` with the dead-zone discretizer `r ∈ {+1,0,−1}` (ambiguity → 0 → DENY), the analog reading can only confirm or degrade a verdict, never upgrade a non-ALLOW to ALLOW (the 0070 No-Coercion result). Fail-closed to the exact digital path on any out-of-tolerance, ineligible, unattested, or NaN-cost branch.
- **Crypto stays Binary/bit-exact (`SPORE-SUBSTRATE-001`).** The MAC carries the value/weighted payload only — it never touches a hash, key, signature, or release decision (the `(+,×)` MAC semiring ≠ the Kleene K3 meet governance algebra, §2.7).

**The durable, transferable result is the type/governance shape, not the optics** — a verified fail-closed discretizer + degrade-only K3 fold + category→wavelength-lane partition + signed tolerance witness that any future volumetric/holographic/quantum substrate must satisfy. The HW wins (speed/energy) are strictly additive and aspirational on top of an already-correct, already-proven kernel.

---

## §5 WHY NOT — the hard walls (each with its physics reason)

Each is a refused framing. The wall is substrate-invariant: building a PIC does not move any of them.

| # | Refused claim | The hard wall (physics / maths reason) |
|---|---|---|
| **W1** | **Literal 3D free-space angle logic** — "two beams cross at an angle, the crossing is a gate; >6 directions = new logical states." | **Linear superposition → no interaction (§1.3).** In a linear source-free dielectric the field obeys the homogeneous wave equation, so `E_tot = E_1 + E_2`: beams ADD and separate UNCHANGED — non-interacting bosons, no `E_1·E_2` term, hence no AND/multiply, **no gate from crossing alone**. A gate needs a confined, phase-controlled STRUCTURE (a directional coupler / MZI); the unitary is a property of the device, not of two angles in air. |
| **W2** | **Instant / zero-latency / same-clock-cycle / "speeds silicon cannot match."** | **latency-O(1) ≠ work-O(1) (§3.1).** Light transit `t_prop = n_eff·L/c` is N-independent in LATENCY, but the WORK is `Θ(N²)` mesh load + `Θ(N)` I/O. The realized ceiling is the measured ~1.91× (eq. 3.5), not "instant"; below `N*` photonic is strictly slower (0053/M2). The note self-refutes: it states the I/O-tax caveat then over-rides it with the O(1) framing. |
| **W3** | **O(1) volumetric / holographic read** — "shine a reference laser, the answer diffracts out instantly, regardless of 4×4 or 4000×4000." | **The I/O is the work, and it is not free (§3.1).** Encoding an N×N operator costs `O(N²)` modulator settings; reading N outputs costs `Θ(N)` ADC conversions at finite ENOB; reference-beam steering, page addressing, and error-correction are the real cost. "O(1) read" is the canonical "shine light in → free computation" overclaim. |
| **W4** | **">6 wave vectors as 3D-spatial angles"** — more `k`-vectors/wavelengths/polarizations create new 3D logical states. | **Mode orthogonality → multiplexing DOF, not 3D logic (§1.3).** `⟨ψ_m|ψ_m'⟩ = δ_mm'`: extra wave-vectors are INDEPENDENT PARALLEL LANES (bandwidth DOF), not new logical states or free-space angles. The honest "virtual 3rd dimension" is the SYNTHETIC axis `k` over orthogonal mode-channels (§2.4–§2.5); "even 2 waves" = a minimal 2-site synthetic frequency lattice = one beamsplitter unitary `U₂ ∈ U(2)` (eq. 2.6), not a 3D angle. |
| **W5** | **Analog photonics as a crypto / hash / key operand** (photonic SHA-256, phase-as-credential, QBER/entanglement as a tamper seal replacing MAC/AEAD). | **The systematic precision floor (§3.6).** A finite-ENOB ADC has an irreducible quantization bias `\|ε_quant\| ≤ LSB/2` (eq. 3.8) that is deterministic given the input, so `ENOB ≲ 8` and the result is **never bit-exact**. A crypto hash/signature needs exact, avalanche-sensitive bit equality — a one-LSB analog error flips the digest. `assertDeterminism()` correctly THROWS on a photonic result. Crypto stays Binary/bit-exact (`SPORE-SUBSTRATE-001`); photonics is QRNG/PUF/LSH/tensor OUTSIDE the gate. (Also: optical PUFs are PAC-learnable, so "physically un-tappable" is an overclaim — tamper-EVIDENT degrade-only at most.) |
| **W6** | **"More votes beat a systematic floor"** — N-modular voting always reduces error to spec. | **Averaging kills only the zero-mean part (§3.6).** N-modular voting cuts the RANDOM variance by exactly `1/R` (eq. 3.7, measured `Var₁/Var₁₆ = 15.88 ≈ 16`), but the quantization residual is a BIAS, not noise: `mean(ε_quant) over R = ε_quant` (constant in R, eq. 3.9) — the variance shrinks, the floor does not. If `ε_sys ≥ τ`, then `R_req → ∞` (eq. 3.10) and the lane is REFUSED. Buying precision by voting also pushes `N*` right (`20→60→181` for `R=1,3,9`); never free. |
| **W7** | **Any photonic verdict or key** — the analog lane decides release, or yields key material. | **Semiring mismatch + degrade-only fold (§2.7, §3.6).** The optical MAC is the `(+,×)` field semiring; the K3 governance reduction is the Kleene K3 meet (min) — on `[ALLOW,ALLOW,DENY]` they DISAGREE (`min=DENY`, consensus=ALLOW). So the MAC may carry only the value, never the decision. The lawful role is the degrade-only operand under `E_final = min(T_digital, r)`: it can only confirm or degrade, never upgrade a non-ALLOW to ALLOW (0070 No-Coercion). A lane that cannot read within the governance error budget abstains (dead-zone → 0 → DENY). The verdict and any key stay on the Binary, bit-exact digital core. |

---

## §6 Worked numerical examples (concrete numbers a reader can check)

> Every number below is reproducible from the spine: the ternary MAC (`w∈{−1,0,+1}`, skip-on-zero), the MZI unitary eq. (2.1), the WDM batch eq. (2.4), the 2-site synthetic unitary eq. (2.6), the cost model eqs. (3.2)–(3.3), the crossover eq. (3.4), and the quantization step eq. (3.8), which in the emulator is exactly `LSB = 2·adcRange(N)/2^b` with `adcRange(N)=N·ACT_MAX` (`emulator.ts: quantStep`, round-to-nearest). All photonic readings are **degrade-only operands under a signed `toleranceWitness`** — never verdicts, keys, or hashes.

### 6(a) A 2-wavelength (K=2) 2×2 batched MAC

**The two slices of `T[i,j,k]`, `k∈{1,2}`.** Two wavelengths `λ₁, λ₂` share one 2-mode spatial MZI mesh; each carries its own ternary weight slice and input (eq. 2.4). Keep both as **unitary** slices so a *single* MZI realizes each (no SVD attenuator bank needed at N=2):

$$
W^{(1)} = \tfrac{1}{\sqrt2}\begin{pmatrix} 1 & 1 \\ 1 & -1\end{pmatrix}\ (\text{Hadamard}),\qquad
W^{(2)} = \begin{pmatrix} 0 & 1 \\ 1 & 0\end{pmatrix}\ (\text{swap}),
$$
$$
x^{(1)} = \begin{pmatrix} 2 \\ -1\end{pmatrix}\ \text{on }\lambda_1,\qquad
x^{(2)} = \begin{pmatrix} 3 \\ \ 1\end{pmatrix}\ \text{on }\lambda_2 .
$$

**Exact parallel outputs (eq. 2.4), one spatial transit:**

$$
y^{(1)} = W^{(1)}x^{(1)} = \tfrac{1}{\sqrt2}\begin{pmatrix} 2+(-1)\\ 2-(-1)\end{pmatrix} = \tfrac{1}{\sqrt2}\begin{pmatrix} 1\\ 3\end{pmatrix} \approx \begin{pmatrix} 0.7071\\ 2.1213\end{pmatrix},\qquad
y^{(2)} = W^{(2)}x^{(2)} = \begin{pmatrix} 1\\ 3\end{pmatrix}.
$$

**MZI phase settings (eq. 2.1).** Split ratio `cos²(θ/2)`:

- `W^{(1)}` (Hadamard, 50:50): **`θ = π/2`** ⇒ `sin(θ/2)=cos(θ/2)=1/√2` (the 3 dB / "0"-trit balanced split), with phase screen `φ=0` plus a fixed output `D=diag(1,−1)` to set the Hadamard sign pattern.
- `W^{(2)}` (swap, full cross): **`θ = π`** ⇒ `sin(θ/2)=1, cos(θ/2)=0` (bar→cross), `φ=0`.

On the WDM lane these phase patterns are not retuned per wavelength; the *same physical mesh* is dispersion-engineered so each `λ_k` sees its assigned slice within the crosstalk budget. The honest realization shares one `Θ(N²)` build across `K=2` products.

**Encode / readout step count.** Per slice, `N=2`:

| Step | Count formula | K=2, N=2 |
|---|---|---|
| Mesh build (phase sets, **amortized over K**) | `N(N−1)/2 = 1` MZI ⇒ 1 phase pair, set **once** | 1 (shared) |
| Encode (DAC) | `K·N` | **4** conversions |
| Optical transit | `K·t_prop` (latency-O(1) each) | 2 transits (parallel-capable) |
| Readout (ADC) | `K·N` | **4** conversions (homodyne — signed/√2 terms need phase) |

Signed/irrational outputs (`±1/√2`) **require coherent homodyne** readout (a bare photodiode gives `|y|²` and loses the sign of the `−1` rail).

**~8-bit quantized result vs exact (eq. 3.8).** With `ACT_MAX = 3` (the largest `|xᵢ|` here) and `N=2`, the ADC dynamic range is `adcRange = N·ACT_MAX = 6`, so at `b = 8` bits:

$$
\mathrm{LSB} = \frac{2\cdot 6}{2^{8}} = \frac{12}{256} = 0.046875,\qquad |\varepsilon_{\text{quant}}| \le \mathrm{LSB}/2 = 0.0234.
$$

Round each exact component to the nearest multiple of `0.046875` (the emulator's `Math.round(s/lsb)*lsb`):

| Output | Exact | Nearest `k·LSB` | 8-bit value | Abs error |
|---|---|---|---|---|
| `y^{(1)}_1` | 0.70711 | `15·LSB` | 0.70313 | 0.00398 |
| `y^{(1)}_2` | 2.12132 | `45·LSB` | 2.10938 | 0.01194 |
| `y^{(2)}_1` | 1.00000 | `21·LSB`=0.98438 / `22·LSB`=1.03125 | 0.98438 | 0.01562 |
| `y^{(2)}_2` | 3.00000 | `64·LSB` | 3.00000 | 0.00000 |

Every error is `≤ LSB/2 = 0.0234` — a **systematic** bias (deterministic in the input), so N-modular voting cannot remove it (eq. 3.9). Even the integer-exact `y^{(2)}_1 = 1` lands **off-grid** (`1/0.046875 = 21.33`), giving a 0.0156 floor that no averaging clears. This is precisely why the result is bit-inexact and **never** admissible as a hash/key operand (§3.6); it is a degrade-only number.

### 6(b) The minimal 2-site synthetic-frequency-lattice beamsplitter (the "2 waves" virtual dimension)

Take the synthetic axis itself as the compute object (§2.5): an EO modulator at the FSR couples two adjacent frequency modes `n∈{0,1}`, on resonance (`V₀=V₁`, trivial global phase `V₀τ=0`), hopping `t`, evolution time `τ`:

$$
H_2 = \begin{pmatrix} 0 & t \\ t & 0\end{pmatrix},\qquad
U_2 = e^{-iH_2\tau} = \cos(t\tau)\,I - i\sin(t\tau)\,\sigma_x
= \begin{pmatrix} \cos(t\tau) & -i\sin(t\tau)\\ -i\sin(t\tau) & \cos(t\tau)\end{pmatrix}.
$$

**Pick a balanced synthetic split: `tτ = π/4`** ⇒ `cos = sin = 1/√2`:

$$
U_2 = \tfrac{1}{\sqrt2}\begin{pmatrix} 1 & -i\\ -i & 1\end{pmatrix}\quad(\text{a beamsplitter in frequency space; } U_2^\dagger U_2 = I).
$$

**Input/output.** Inject a photon purely in the low frequency mode, `|ψ_in⟩ = (1,0)ᵀ`:

$$
|\psi_{\text{out}}\rangle = U_2\,|\psi_{\text{in}}\rangle = \tfrac{1}{\sqrt2}\begin{pmatrix} 1\\ -i\end{pmatrix}
\ \Rightarrow\ P(\omega_0)=\tfrac12,\quad P(\omega_1)=\tfrac12 .
$$

The photon is now coherently split 50/50 across **two wavelengths** with a `−i` (quarter-wave) relative phase — energy "hopped" along the synthetic axis without any second spatial waveguide. This is the smallest genuinely "virtual extra-dimensional" operation: one `U(2)` realized in frequency, the synthetic twin of the spatial MZI of 6(a). For the full rank-3 contraction, this `U_2` is exactly the `U_2[k,k']` that mixes the wavelength index in `Y[j,k] = Σᵢ Σ_{k'} W[i,j] U_2[k,k'] X[i,k']` (eq. 2.7); with `tτ=0` it is the identity and the lanes decouple to the independent MACs of 6(a). Honest fence: this beamsplitter carries **value/amplitude** only — `(+,×)` field semiring, not the K3 governance algebra, so it never emits a release verdict (§2.7).

### 6(c) High-value-compute case study: one batched ML inference layer

**Setup.** A dense layer `y = Wx`, ternary (BitNet-style) weights `W∈{−1,0,+1}^{N×N}`, `N = 256`, run over a batch of `K = 512` activation vectors (the synthetic/WDM reuse dimension — one expensive mesh build amortized across the batch; the *only* regime where photonics can win, §3.4). Crossover from eq. (3.4) at `R=1`: `N* ≈ 20`. Here **`N = 256 ≫ N* ≈ 20`**, so the offload is in the win-region.

**Cost-model verdict.** The per-MAC *ideal* optical advantage is **9.40×**, but the DAC/ADC conversion tax retains only **20.3%**, so the **realized** ceiling is

$$
S_{\text{realized}} = 9.40 \times 0.203 \approx \mathbf{1.91\times}\quad(\text{Meech arXiv:2308.01719; eq. 3.5}).
$$

The hub's single-point matmul anchor (at `n=161`, photonic-with-verify `157{,}278` ns vs digital `0.30·161^3 = 1{,}251{,}984` ns ⇒ ~7.96× on that point, $O(N^3)$ model) is **not** the realized claim; the defensible, batch-amortized headline is the **~1.9× realized**.

| Quantity | Value | Source |
|---|---|---|
| `N` | 256 | given |
| `K` (batch / synthetic reuse) | 512 | given |
| Crossover `N*` (R=1) | ≈ 20 | eq. 3.4, 0053/M1 (O(N³)-matmul-vs-O(N²)-optical regime) |
| Regime | `N ≫ N*`, high `K`, MAC-dominated ⇒ **router offloads** | §3.4 |
| Realized speedup `t_digital / t_photonic` | **≈ 1.9×** | eq. 3.5 |
| `t_photonic` structure | `t_setup + N²t_phase` (built **once**) `+ K(N·t_DAC + t_prop + N·t_ADC) + Freivalds k·N²·t_verify` | eq. 3.2 |
| `t_digital` (matmul regime) | `c_d·N³/Π` | eq. 3.3a |

The `Θ(N²)=65{,}536`-phase mesh build is paid **once** and amortized; encode/readout cost `K·N = 131{,}072` DAC + `131{,}072` ADC conversions — the `Θ(N)`-per-product I/O tax that caps the gain at ~1.9% (the conversions, not the `t_prop = n_eff L/c` transit, dominate; latency-O(1) ≠ work-O(1), §3.1). Freivalds re-check is `O(kN²) ≪ O(N³)`, so verification never washes the win.

**Crossover verdict.** Offload **accepted**: `256 ≫ 20`, batched, MAC-dominated. Had this been `N = 8` (below `N*`), the router would **refuse** — at `n=8` photonic `546` ns ≥ digital `154` ns (0053/M2); worst case is "stayed digital."

**Precision caveat (the load-bearing fence).** With `N=256`, the ADC dynamic range is `adcRange = N·ACT_MAX` and `LSB = 2N·ACT_MAX/2^b`; sweeping bits, RMS error falls **5.9× from 2→8 bits** then **flattens** (RMS@8 / RMS@16 = 1.05×) — the knee sits on the **~4–8 ENOB wall**. Past 8 bits more nominal bits buy nothing because the residual is a **systematic** quantization bias (eq. 3.9); if `ε_sys ≥ τ` (the layer's error budget), then `R_req → ∞` and the lane is **refused** (eq. 3.10, fail-closed). Therefore the layer's output is admitted as an **~8-bit, non-deterministic, degrade-only operand under a signed `toleranceWitness`** — the emulator reports `executedNatively=false, deterministic=false, determinismMode="tolerance"`, `assertDeterminism()` throws, and a Freivalds tolerance re-verify gates the number before any downstream use. The *value* may feed the next layer; the release **decision** and any crypto stay Binary / bit-exact on the digital core (`SPORE-SUBSTRATE-001`). "Instant / same-clock-cycle / speeds silicon cannot match" is refuted at every `N`; the honest ceiling for this layer is the measured **~1.9×**.

---

## §7 Governance & zero-trust — admitted, never trusted

The maths of §1–§3 establishes *what* the photonic lane can compute (a ~8-bit, non-deterministic, $\Theta(N^2)$-load MAC) and *what it cannot be* (bit-exact, a verdict, a key, a hash). This section is the **governance contract**: how a precision-limited analog accelerator is **admitted** into a zero-trust system **without ever being trusted**. The design principle is *Govern, Don't Absorb* — Galerina does not become the hardware and does not invent crypto; it **fences** an untrusted guest. Every mechanism is buildable CPU-side today.

### 7.1 The compute-only Tier-3 capability lane (deny-by-default)

The photonic substrate declares exactly one capability — *photonic/optical compute* — and **everything else is denied by omission**. Zero crypto, zero network, zero ledger (`.tmf`) reach.

```
contract { @experimental_profile { compute_only } effects { math.matmul } }
// crypto.* / network.* / ledger.write DENIED by omission (deny-by-default)
```

Enforced fail-closed by the partition decider's **eligibility gate, evaluated FIRST**, before any cost/benefit routing: *"crypto / control-flow / explicitly-digital never offload"* (`partition-decider.ts`, returning `"INELIGIBLE: crypto/control-flow stays on the digital core (SPORE-SUBSTRATE-001)"`). The crypto determination is **derived authoritatively from the kernel's declared effect footprint**, not the caller's word: a mis-wired/hostile caller passing `isCrypto:false` on a kernel that declares any `crypto.*` effect **still routes to digital** (`declaresCrypto && !kernel.isCrypto` → still ineligible; RD-0126 A-2). The `crypto.` prefix match is a **deliberately conservative superset** — it can only ever keep *more* work on the digital core, never less. Deny-by-default: an empty/unknown capability resolves to INDETERMINATE → DENY (no vacuous allow).

### 7.2 Verify-before-decrypt on binary silicon FIRST — plaintext only after K3 ALLOW

The ordering is load-bearing and is what makes the lane sellable to CISOs. The photonic lane **never** touches ciphertext, keys, or the release decision:

1. **Binary silicon does verify-before-decrypt.** The K3 gate runs on the bit-exact digital core: signature/integrity verification (SHA-256 + ML-DSA-65/Ed25519) and the policy fold produce a verdict $\in\{+1,0,-1\}$. **Plaintext is produced only after a definite K3 ALLOW** ($v=+1$); INDETERMINATE or DENY fails closed (`authorize(v) \Leftrightarrow v=+1`).
2. **Only then do the decrypted numbers go to the photonic lane.** The lane sees plaintext *values*, never keys, never ciphertext, never the gate.
3. **The result returns as an untrusted, degrade-only operand** (§7.3), bounded by a signed `toleranceWitness` if consumed downstream.

> **Crypto + keys never leave the binary core.** The light path is downstream of the gate, never inside it.

### 7.3 The degrade-only operand under a signed `toleranceWitness`

Two complementary mechanisms enforce degrade-only:

- **K3 meet (can only confirm or degrade).** The lawful combination of an analog reading $r$ with the digital verdict is the Kleene meet $E_{\text{final}} = \mathrm{vAnd}(T_{\text{digital}}, r) = \min(T_{\text{digital}}, r)$ (dead-zone discretizer $r\in\{+1,0,-1\}$, ambiguity → $0$ → DENY). By the **No-Coercion theorem** (100k seeded fuzz: replacing every $0$ leaf with $-1$ never changes a definite verdict), a substrate reading can **confirm or degrade** but **never upgrade** a $0$/$-1$ into the $+1$ that authorizes. Hence: **substrate noise costs availability (a legitimate ALLOW denied), never safety (an illegitimate ALLOW granted).**
- **Signed `toleranceWitness` + re-verify-on-core.** A consumed photonic value is admitted only against a signed `toleranceWitness` binding the declared error band to a **measured** curve (`epsilonMeasured`, `stdDev`, `redundancyN`, `noiseModelId`). The witness is `dev`-only until `calibrate()` runs a real bifurcated-parity sweep and replaces the placeholder with the measured `maxRelativeResidual` — **calibration-as-attestation** — and a non-bifurcation-conformant lane (any binary≠photonic *decision* divergence) is **refused outright**: *"refusing to calibrate/attest a divergent lane."* At consume time the runner does a cheap exact recompute + tolerance check; **out-of-tolerance fails closed**: *"re-verify FAILED → DENY photonic, fall back to digital (fail-closed)"*. Worst case is "stayed digital," never a trusted wrong answer.

This is the formal "refuse" condition of §3.6 made operational: when $\varepsilon_{\text{sys}}\ge\tau$, $R_{\text{req}}\to\infty$ and the lane **abstains**.

### 7.4 Crypto-on-core (`SPORE-SUBSTRATE-001`)

The durable rule: **a flow with a `Hash`/`Sign`/crypto effect must run on a deterministic (digital) lane, never a noisy/photonic one** — integrity requires **bit-exactness** and cannot be "tolerated" at an error rate. This is `SPORE-SUBSTRATE-001` (`CRYPTO_ON_NOISY_LANE`, always-error severity), the highest-priority substrate invariant (priority `001 > 004 > 003 > 002`). It is the governance realization of §3.6: a one-LSB analog error flips an avalanche-sensitive digest, so photonic-SHA-256 is a category error and is **rejected**. Photonics may serve QRNG/PUF/LSH/tensor roles **outside** the gate; the digest, signature, and key handling stay Binary and bit-exact **on the core**. The rule governs *where* crypto executes and changes *nothing* about the crypto itself.

### 7.5 The honest emulator as the Rung-2 prove-it-CPU-side path

There is exactly **one** photonic artifact in the production tree — `galerina-ext-photonic-emulator` — an **honest emulator**, not a native executor. Its manifest reports, by construction:

- `executedNatively = false` — emulated, not a real PIC;
- `deterministic = false` — analog, **not** bit-exact across machines, so `assertDeterminism()` **correctly throws** (which is *why* the separate tolerance re-verify exists);
- `determinismMode = "tolerance"` — admissible only when fully pinned (finite positive tolerance + `pinnedEnvHash` + `backendArtifactHash`, and with a witness, `tolerance ≥ epsilonMeasured`).

This is the **Rung-2 "prove it CPU-side" path**: the emulator *models* the MZI/WDM/optical impairments and injects the §3 analog variance + quantization floor, so the governance is **demonstrated working — fail-closed, deny-by-default, degrade-only — without any silicon**. It MODELS; it does not natively execute. The PPU offload port is HW-gated and never built speculatively; the emulator lets a buyer *see the fence operate* before a PIC exists.

### 7.6 Mapping to the seven NIST SP 800-207 zero-trust tenets

The governed photonic lane **strengthens** the tenets it touches because it is fenced; the **only** tenets it could *cost* are availability/observability ones — bounded and audited, never silent.

| # | NIST SP 800-207 tenet | Effect | How |
|---|---|---|---|
| 1 | All data sources & compute services are resources | **Strengthens** | The lane is a first-class, capability-scoped **Tier-3 resource** (`@experimental_profile { compute_only }`), not an unmanaged appliance. |
| 2 | All communication secured regardless of network location | **Neutral / strengthens** | Zero network reach (deny-by-default); never originates/terminates communication. Keys/ciphertext never reach it (§7.2). |
| 3 | Access granted per-session | **Strengthens** | Each offload is a per-session, per-kernel routing decision through the eligibility gate + tolerance re-verify; nothing standing-granted. Fail-closed on any uncertainty. |
| 4 | Access governed by dynamic policy | **Strengthens** | The K3 verdict + signed `toleranceWitness` (bound to a **measured** noise curve) are dynamic, attested attributes; an uncalibrated/divergent lane is **refused**. |
| 5 | Monitor & measure integrity/posture | **Cost → mitigated** | A non-deterministic asset has **no bit-exact integrity self-attestation** — the one genuine tension. Mitigated by calibration-as-attestation + per-consume re-verify on core; integrity is asserted by the **digital recompute**, not by the lane. Flagged honestly. |
| 6 | Authn/authz dynamic, enforced before access | **Strengthens (load-bearing)** | **Verify-before-decrypt on binary silicon FIRST**: plaintext exists only after a definite K3 ALLOW; the lane is strictly downstream of authn/authz and can never be on the authorization path (No-Coercion). Crypto-on-core keeps all auth primitives bit-exact. |
| 7 | Collect asset-state info to improve posture | **Mixed → audited** | **Strengthens** posture data via the measured noise model + parity report + `toleranceWitness` telemetry. **Potential cost:** an analog readout is intrinsically noisier to observe — but every degrade/refuse is **audited, never silent** (records an INDETERMINATE→DENY collapse with a reason string). |

**Net zero-trust verdict.** The governed photonic lane **strengthens tenets 1, 3, 4, 6**, is **neutral on tenet 2**, and carries a **bounded, audited cost on tenets 5 and 7** — costs mitigated by re-verify-on-core + calibration-as-attestation and never concealed. The most-secure choice and the most-marketable choice coincide: the fence is the feature, and *getting around* zero-trust would delete the one property that makes governed photonic compute sellable.

---

## §8 Verdict — the honest buildable line, the walls, and the next CPU-side step

**The buildable line.** Build the **wavelength-parallel batched MAC** (a synthetic-dimension rank-3 tensor accelerator: 2 real Clements-MZI axes + ≥1 WDM synthetic axis, down to the "2 waves" = 2-site synthetic-frequency-lattice minimal case) **on the honest emulator first** (`galerina-ext-photonic-emulator`, Rung-2, no PIC). Route it **only above the crossover** `N* ≈ 20` (the honest $O(N^3)$-matmul-vs-$O(N^2)$-optical break-even, §3.3), for **high-`K`, MAC-dominated, batched** kernels. Expect **at most the measured ~1.9×** realized (eq. 3.5). Govern it as an **untrusted Tier-3 degrade-only lane** under a signed `toleranceWitness`, with **crypto and the release verdict kept Binary and bit-exact** on the digital core (`SPORE-SUBSTRATE-001`).

**The walls (substrate-invariant — a PIC moves none of them).** W1 no free-space-angle logic (linear superposition / non-interacting bosons); W2/W3 no instant/O(1)/free-volumetric-read (latency-O(1) ≠ work-O(1); Θ(N²) load + Θ(N) I/O); W4 ">6 wave vectors" = multiplexing DOF, not 3D angles (mode orthogonality); W5 no crypto/hash/key on the lane (systematic ~8-bit floor, never bit-exact); W6 votes cannot beat a systematic bias (1/R kills only zero-mean noise); W7 no photonic verdict/key (semiring mismatch + degrade-only No-Coercion fold).

**The durable result is the governance shape, not the optics:** a verified fail-closed discretizer + degrade-only K3 fold + category→wavelength-lane partition + signed tolerance witness + crypto-on-core invariant. Any future volumetric/holographic/quantum substrate must satisfy the same contract; the HW speed/energy wins are strictly additive on top of an already-proven kernel.

**Next CPU-side step (Rung-2, no silicon).** Exercise the emulator on the §6(c) batched-inference workload at `N=256, K=512`: (i) confirm the partition decider offloads (`N ≫ N*`) and refuses a matched `N=8` / wash-`f≈0.28` control; (ii) sweep ADC bits to reproduce the 5.9× (2→8) / 1.05× (8→16) knee and the closed-form variance (eq. 3.6) against MC; (iii) run `calibrate()` to mint a real `toleranceWitness` from a bifurcated-parity sweep and verify a deliberately divergent lane is refused; (iv) confirm `assertDeterminism()` throws and the runner's out-of-tolerance path falls back to digital fail-closed. That demonstrates the entire fence operating — admitted, never trusted — with no PIC in the tree.

---

*R&D grounding document. Production (`C:\wwwprojects\Galerina`) is READ-ONLY from R&D. Empirical anchors: hub cost model 0053; Meech arXiv:2308.01719 (9.4× ideal / 1.91× realized); McMahon arXiv:2308.00088 (≤10-bit); Garg arXiv:2102.06365 (4–8 ENOB); synthetic dimensions per Yuan–Lin–Fan. Audit fixes applied: crossover reconciled to the explicit $O(N^3)$-matmul-vs-$O(N^2)$-optical regime (eqs. 3.3a/3.3b/3.4); semiring fence re-pinned to the Kleene K3 meet / No-Coercion (0070) with the loose "(min,max) semiring" shorthand corrected.*
