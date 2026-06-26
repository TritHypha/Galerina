<!-- ABSORBED R&D SOURCE — verbatim mirror. Galerina is the main library; the R&D repo is upstream/authoring.
     Source: Galerina-R-AND-D/tmf/research/external-repos-analysis.md  ·  Pinned: R&D fb68d06 (2026-06-16)
     Integrated Galerina view: galerina-external-idea-mining-2026-06-15.md  ·  Catalog: galerina-rd-absorption-catalog.md
     Rule: edit the upstream source then re-vendor; do not fork this copy (feedback-auto-import-rd-docs). -->

> **Absorbed R&D source (verbatim).** This is the archived upstream document. Curated/integrated view: `galerina-external-idea-mining-2026-06-15.md`. See `galerina-rd-absorption-catalog.md` for the full ledger. Internal links below point at the upstream R&D tree.

---
# External repositories analysis — `C:\wwwprojects\x`

**What this is.** A grounded analysis of the 8 git repos cloned into `C:\wwwprojects\x`, scored for
what they **ground as real** vs. **refute as aspirational** in the `.tmf` / ternary / photonic /
PQC-crypto research. Produced by a 9-agent workflow (one deep-read agent per repo with `file:line`
evidence + a skeptical cross-repo synthesis). Companion to
[real-vs-aspirational-ledger.md](real-vs-aspirational-ledger.md),
[ternary-in-cryptography.md](ternary-in-cryptography.md),
[encryption-architecture.md](encryption-architecture.md).

> **Method honesty.** Findings below are quoted from in-repo source with paths. Two artifacts of the
> automated pass are flagged and **excluded** from the conclusions: (a) one agent cited a project file
> `encryption-on-photonic-substrates.md` that **does not exist** in this folder — its ENOB/“Nature 2025”/
> “Sapphire CHES 2019” claims are plausible but are treated here as **unverified, needs-independent-citation**,
> not as established; (b) a subagent incidentally read the `Galerina-TritMesh` product repo for context — no
> facts from it are load-bearing here, and nothing was written to it.

---

## The 8 repos at a glance

| Repo | Org | What it actually is | Maturity | Bearing on `.tmf` |
|---|---|---|---|---|
| **Model-Optimizer** | NVIDIA | NVFP4/FP8/INT4 quantization (PTQ/QAT), pruning, distillation | production | **Grounds NVFP4** |
| **TransformerEngine** | NVIDIA | FP8/MXFP8/NVFP4 training+inference kernels | production | **Grounds NVFP4** |
| **MiniCPM** | OpenBMB | Efficient edge LLMs; GPTQ/AWQ/NF4 quant | production | Tangential (counter-example) |
| **linear_open_lm** | TRI / Toyota | Linear-attention LM (O(n)) | research | Tangential |
| **Photonic-Neural-Networks** | LIU-Yinyi | NumPy U(N)→MZI circuit synthesis | alpha sim | **Refutes photonic-substrate** |
| **Single-Photon-Detection-NNs** | Cornell / McMahon | PyTorch shot-noise NN emulation | research | **Grounds crypto-on-core** |
| **Photonics-Guide** | mikeroyal | Curated photonics link list (2021) | curated list | Refutes photonic-ALU |
| **awesome_photonics** | joamatab | 100+ photonic EDA/sim tools (gdsfactory) | curated list | Refutes photonic-ALU |

---

## 1. Bottom line

- **The `.tmf` notes got NVFP4 *right*** — verified in NVIDIA source. The "9-byte micro-block"
  (1-byte E4M3 per-block scale + sixteen 4-bit E2M1 elements) **matches modelopt's actual storage
  path**. NVFP4 is good as **one optional payload codec**, never as crypto arithmetic (it is lossy).
- **The deterministic-digital crypto core is correct and *empirically* supported.** The strongest
  external evidence is Cornell's single-photon NN work: real optical inference is **intrinsically
  stochastic** (measured ~10% accuracy floor at single-photon levels). That is concrete, physical
  support for the project's rule — *bulk math may be photonic; integrity/crypto must stay on a
  deterministic digital core.*
- **"Ternary ⇒ lattice crypto" stays refuted.** No repo shows ternary arithmetic in crypto. NVFP4's
  E2M1 has **8 magnitudes** {0,.5,1,1.5,2,3,4,6}, not 3 ternary states; ML-KEM/ML-DSA use ℤ_q
  (q=3329 / 8380417) with an O(n·log n) NTT. The only ternary↔lattice link remains **NTRU (p=3, non-FIPS)**.
- **"12.5M RPS / single clock cycle / Ternary Photonic CPU" stays refuted.** Across four photonics
  repos there is **zero deployed photonic ALU** — only simulation, lab demo, and link lists.
- **Genuine balanced-ternary is real for NN *weights* (BitNet), not crypto** — and even that is
  *documentation, not implementation* in the repos examined (MiniCPM names BitCPM4 1.58-bit but ships
  GPTQ/AWQ/NF4). The real ternary wins for `.tmf` are **three-valued governance logic** and a modest
  **storage** density, not arithmetic speed.

---

## 2. NVFP4 — the notes are correct (and why the digests appeared to conflict)

Three agents touched NVFP4 and seemed to disagree (9 bytes vs. 8 bytes vs. "FP32 scale"). The conflict
is a **storage-path vs. compute-path** confusion; resolved against source, the notes hold up.

**Verified facts (NVIDIA source):**
- **Block = 16 elements.** `NVFP4_BLOCK_SCALING_SIZE = 16` (TransformerEngine `constants.py:177`);
  `_NVFP4_BLOCK = 16` (modelopt).
- **Element = E2M1, 4-bit.** `kFloat4E2M1` (TransformerEngine `constants.py:46`). 16 × 4 bit = **8 bytes**,
  two nibbles/byte. Representable magnitudes **{0, 0.5, 1, 1.5, 2, 3, 4, 6}** (8 values).
- **Per-block scale = E4M3, 1 byte.** `modelopt/.../qtensor/nvfp4_tensor.py:31-44`
  `_cast_per_block_scale_to_fp8(...)` clamps to E4M3FN range `[2⁻⁹, 448]` and casts `.to(torch.float8_e4m3fn)`.
- **Two-level scaling.** Per-block E4M3 scale × a per-tensor FP32 global (`amax/6`) — `nvfp4_tensor.py:142-188`.

⇒ **1 (E4M3 scale) + 8 (16×E2M1) = 9 bytes** is a faithful description of NVFP4's storage/export block.
`notes/1.md §3.D` and the Rust `Nvfp4Block` struct are **accurate**.

**Reconciling the dissent (don't pick a false winner):**
- TransformerEngine's *"8 bytes, FP32 scale, not 9"* describes the **GEMM compute path**, where the
  block scale is carried in high-precision FP32 (plus a per-tensor FP32 global); E4M3 appears there only
  as an intermediate clamp dtype. Correct for the kernel, not for the on-disk block.
- The **MXFP4 ≠ NVFP4** point matters: **MXFP4** (OCP microscaling) = **32-element** blocks with an
  **E8M0** (8-bit, power-of-two) scale; two NVFP4 blocks tile into one MXFP4 region. The MiniCPM digest's
  claim that MXFP4 "contradicts the 9-byte NVFP4 block" is an **over-reach** — different format (see §6).

**Caveats that still stand (from the ledger):**
- **NVFP4 is lossy** (modelopt `fp4_round_magnitude` has rounding error) → usable for *vectors/tensors*,
  **never** for any integrity/crypto bytes or the signed root.
- **Don't hard-code NVFP4 as the mandatory container payload unit** (ledger C6). TMX should hash **opaque
  payload bytes**; modality selects a codec. NVFP4 is *one* good option for embedding/tensor modalities.
- Production reality: NVFP4 is deployed (Nemotron-3, DeepSeek-R1-FP4, Llama-3.3-70B-FP4; MLPerf v5.1) and
  **requires Blackwell GPUs + TensorRT-LLM** — i.e. it's a *GPU* format, not evidence for a ternary/photonic CPU.

---

## 3. Ternary / BitNet — real for NN weights, not crypto, and barely present here

- **Genuine ternary {−1,0,+1} appears only as documentation, not implementation, in these repos.**
  MiniCPM *names* BitCPM4 as 1.58-bit ternary (`docs/README-legacy.md:16`) but ships standard **GPTQ
  (int4, group 128) / AWQ (w_bit 4) / BitsAndBytes NF4**, and the BitCPM4 models are "fake-quantized"
  (QAT), not hard ternary arithmetic. Model-Optimizer, TransformerEngine, linear_open_lm: **zero** ternary.
- **NVFP4 is not ternary.** E2M1 = 8 magnitudes, not 3 states. (Settles any "1.58-bit ≈ NVFP4" conflation.)
- **Confirms ledger A8/A13:** ML-KEM/ML-DSA are not ternary; the only legitimate ternary↔lattice link is
  **NTRU (p=3)**, which is **non-FIPS**.
- **The real ternary wins for `.tmf`** (unchanged): (1) **three-valued governance logic**
  (allow/deny/unknown, `unknown→deny`, proved in Galerina); (2) a **storage** choice — honest density is
  **5 trits/byte ≈ 1%** overhead, not the notes' 2-bit packing (25% waste, ledger C2).

---

## 4. Photonic compute — maturity verdict: simulation/lab only, and *noisy*

Across four photonics-touching repos the ladder is **simulation > lab demo > curated list**. **Deployed
photonic ALU: zero.** And where real optics are modeled, they are **stochastic/low-precision** — which is
the key result: it *supports* keeping crypto off the photonic lane.

| Repo | What it is | Determinism | Bearing on the crypto-on-core rule |
|---|---|---|---|
| **Photonic-Neural-Networks** | Pure NumPy/SciPy U(N)→MZI **circuit-topology synthesis** (Reck/Clements). No hardware. | Deterministic linear algebra; loss/crosstalk are *sim params*, default 0 dB | Solves circuit *architecture*; orthogonal to compute. No crypto. |
| **Single-Photon-Detection-NNs** (Cornell/McMahon, arXiv:2307.15712) | PyTorch **shot-noise emulation** (`torch.bernoulli/poisson`) of optical inference. No optics in-repo. | **Intrinsically stochastic** forward pass; P(detect)=1−e^(−\|x\|); ~10% MNIST accuracy floor at K=1 (80.13% vs 90.70%) | **Strongest evidence FOR the rule** — real photon statistics are noisy; exact modular crypto cannot survive it. |
| **Photonics-Guide** (2021) | Curated links. Intel/IBM silicon photonics = **interconnects/packaging**, not ALUs; Lightmatter claims unverified. | n/a | Even industry pointers are about *moving* photons, not *computing logic* with them. |
| **awesome_photonics** | 100+ photonic **EDA/simulation** tools (gdsfactory, FDTD, mode solvers, inverse design). | n/a (design tools) | Photonics is a real *fabrication/design* field — **no general-compute CPU product**. |

**Takeaway:** photonic computing today is (a) interconnects (real, but not logic), (b) analog
matrix-multiply / optical inference that is **noisy/stochastic** and tuned for *error-tolerant* AI, or
(c) design/simulation tooling. All three are fine homes for **bulk** `.tmf` math (ANN vector search,
NVFP4 tensor ops). None can carry an exact SHAKE256 tree or ML-KEM/ML-DSA modular arithmetic without
changing the result. The project's invariant is exactly right and now has *empirical* backing.

---

## 5. Efficient models (MiniCPM, linear_open_lm) — honestly tangential

- **linear_open_lm** (TRI/Toyota): linear-attention fork of OpenLM, O(n) sequence complexity via a
  `lightning_attn` Triton kernel, O(1)-state recurrent inference. Real algorithmic efficiency, but
  **no quantization, no ternary, no crypto, no photonics** (grep-confirmed). Relevance to `.tmf`: ~none.
- **MiniCPM** (OpenBMB): strong efficient edge LLMs (MiniCPM5-1B, ~80 tok/s on Intel Core Ultra via
  OpenVINO; SALA hybrid attention 3.5×). Value to `.tmf`: a **counter-example** — a serious efficiency
  stack uses standard GPTQ/AWQ/NF4, *not* NVFP4 and *not* ternary. Useful for calibrating how aspirational
  "ternary everywhere" is.

Keep both as background on the **bulk-compute / AI lane**; neither grounds nor refutes a crypto claim.

---

## 6. Honesty flags (over-reaches in the automated pass — corrected)

1. **MiniCPM digest: "MXFP4 contradicts the 9-byte NVFP4 block."** Over-reach — argues from **MXFP4**
   (32-elem, E8M0), a *different* format. Verified against modelopt source that NVFP4's per-block scale
   **is** 1-byte E4M3, so the 9-byte block is correct. → downgrade to **neutral-context**.
2. **TransformerEngine digest: "8 bytes, NOT 9 bytes."** True for the **compute path** (FP32 scale), not
   the storage block. Reconcilable, not a refutation.
3. **One agent cited `encryption-on-photonic-substrates.md`** (a file that does not exist here) for
   "analog optics 4–8 ENOB / Nature 2025 / Sapphire CHES 2019 / ~40-orders-of-magnitude precision gap."
   These are **plausible and probably real**, but are **excluded** from the verified findings until
   independently cited. (The qualitative conclusion — analog optics are low-precision — is independently
   supported by the Cornell shot-noise result.)
4. **"Absence of crypto = evidence" pattern.** Several digests scored "no crypto code here" as
   grounds/refutes. Absence of crypto in a quantization or attention library is **expected and
   uninformative** → treat as neutral.

The `.tmf` **ledger itself** checked out against its sources and remains the most honest document in the set.

---

## 7. Impact on the `.tmf` design (ledger updates applied)

- **C6 (NVFP4 block):** upgrade from "🟡 unverified" to **"✅ verified-correct as a codec, with the
  over-coupling caveat"** — the 9-byte block is real; just don't mandate it as the container payload unit.
- **B3 (photonic substrate):** strengthen with the **Cornell shot-noise measurement** as empirical
  support that photonic compute is noisy ⇒ crypto stays deterministic. Still aspirational as *hardware*.
- **A8/A13 (ternary↔lattice):** reaffirmed — NVFP4≠ternary; ML-KEM/ML-DSA≠ternary; NTRU is the only link.
- No change to the grounded stack: **TMX-256 (SHAKE256) → ML-DSA-65 over the root; confidentiality
  (ML-KEM/Ascon) deferred; three-valued fail-closed gate; crypto on a deterministic digital lane.**

## 8. Sources (verified in-repo + external)

**Verified source code:**
- `x/Model-Optimizer/modelopt/torch/quantization/qtensor/nvfp4_tensor.py:31-44,142-188` — NVFP4 E4M3 per-block scale + two-level scaling.
- `x/TransformerEngine/transformer_engine/pytorch/constants.py:46,177` — `kFloat4E2M1`, `NVFP4_BLOCK_SCALING_SIZE=16`.
- `x/Single-Photon-Detection-Neural-Networks/src/PhotonActivation.py` + README accuracy table — shot-noise model, K=1 80.13% vs K→∞ 90.70% (MNIST).
- `x/Photonic-Neural-Networks/pnn/methods/reck.py`, `pnn/utils/ublock.py` — deterministic U(N)→MZI synthesis; loss params default 0 dB.
- `x/MiniCPM/docs/README-legacy.md:16` (BitCPM4 1.58-bit, documented not implemented); `x/MiniCPM/quantize/{gptq,awq}_quantize.py` (standard int4).
- `x/linear_open_lm/open_lm/model.py:304-352` — linear/lightning attention.

**External standards / papers:**
- NIST FIPS 203 (ML-KEM, q=3329), FIPS 204 (ML-DSA, q=8380417), SP 800-232 (Ascon), SP 800-207 (Zero Trust).
- NTRU ternary polynomials p=3 — Hoffstein–Pipher–Silverman 1998 (only legitimate ternary↔lattice link).
- arXiv:2307.15712 (Single-Photon-Detection NNs, Cornell/McMahon).
- arXiv:2509.25149 (Pretraining LLMs with NVFP4), arXiv:2512.20856 (Nemotron-3).

**Excluded / unverified:** `encryption-on-photonic-substrates.md` (non-existent internal file — see §6.3);
Photonics-Guide (2021 link list, no technical depth); linear_open_lm / MiniCPM as crypto evidence (tangential).
