<!-- ABSORBED R&D SOURCE — verbatim mirror. Galerina is the main library; the R&D repo is upstream/authoring.
     Source: Galerina-R-AND-D/tri-encription/research/photonic-sha256-integrity.md  ·  Pinned: R&D fb68d06 (2026-06-16)
     Integrated Galerina view: galerina-hardware-future-substrates.md  ·  Catalog: galerina-rd-absorption-catalog.md
     Rule: edit the upstream source then re-vendor; do not fork this copy (feedback-auto-import-rd-docs). -->

> **Absorbed R&D source (verbatim).** This is the archived upstream document. Curated/integrated view: `galerina-hardware-future-substrates.md`. See `galerina-rd-absorption-catalog.md` for the full ledger. Internal links below point at the upstream R&D tree.

---
# Is there a "photonic SHA-256"? — Integrity hashing on a photonic substrate (R&D)

> **Status:** Research note (grounded, cited, adversarially verified). **Date:** 2026-06-15.
> **Question:** Is there — or can there be — a *photonic version of SHA-256*: a SHA-256/SHA-3-grade
> cryptographic integrity hash that runs on a photonic substrate? And if not, what is the honest
> photonic-compatible integrity architecture?
> **Posture (per request):** commodity/grounded first; every claim cited; the core verdict claims were
> stress-tested by independent agents tasked to *falsify* them.
> **Guardrails:** no invented crypto; sharply distinguish **cryptographic** (SHA-256/SHA-3-grade,
> keyless, collision-resistant, bit-exact) vs **physical** (PUF/speckle) vs **approximate** (LSH/CAM) vs
> **acceleration** (offload a sub-step). Builds on the crypto-on-core invariant
> ([`SPORE-SUBSTRATE-001`](#9-reconciliation-with-the-galerina--tritmesh-framing)) and the companion
> [`quantum-resilient-tri-encryption.md`](quantum-resilient-tri-encryption.md).

---

## 0. Verdict (TL;DR)

**There is no photonic SHA-256 — and there should not be one. The cryptographic digest stays digital and
bit-exact on a deterministic core; photonics' honest contributions to integrity sit *outside* the hash,
at the trust edge and the hot path, and every photonic-derived value re-verifies against the digital
digest, fail-closed.**

The four candidate readings of "photonic SHA-256," each adversarially tested:

| Reading | Verdict | Why |
|---|---|---|
| **1. Analog optical SHA-256** (compute the hash in the analog optical domain) | **Impossible** | Analog optics is ≤~10 effective bits and *error-tolerant by design*; a hash needs zero-error, bit-exact reproducibility (strict avalanche). Irreconcilable. [[McMahon]] [[Garg]] |
| **2. Digital-optical SHA-256** (bit-exact Boolean logic carried by light) | **Possible in principle, pointless in practice** | Optical logic gates are Turing-complete, so a bit-exact optical hash *would* satisfy crypto-on-core — but it is "digital that happens to use light," immature (SOTA ≈ a 2-bit multi-chip CPU), and loses to CMOS on energy/density with **no** cryptographic advantage. [[Miller]] [[HuaCPU]] |
| **3. "Optical hash" / optical one-way function** (speckle, PUF, scattering) | **Not cryptographic** | These are *physical* authentication primitives — noisy, device-bound, need fuzzy extractors, some **provably learnable in polynomial time**; "collision resistance" claims are simulation-only and benchmark against *broken* hashes (MD5/SHA-1). [[Pappu]] [[LearnPUF]] [[ScatterHash]] |
| **4. Photonic "hashing" in the wild** (LightHash / HeavyHash / optical PoW) | **Acceleration only — the crypto stays digital** | The optics computes the *linear matrix-multiply*; the actual Keccak/SHA-3 hashing and bit-exact verification run on a **digital** die, and it's a *modified* error-tolerant scheme, not SHA-256. [[LightHash]] [[BIP52]] |

**Quantum angle:** SHA-256 is already Grover-acceptable (quadratic speedup → ~128-bit, and Grover barely
parallelizes), so a "photonic/quantum SHA-256" buys **zero** quantum benefit on the hash. The quantum work
belongs on the **signature** (ML-DSA-65) over the digital digest. [[Valsorda]] [[NSA-CNSA]]

**The honest "photonic version" of integrity** is an *architecture*, not a hash (see [§7](#7-the-honest-photonic-version-of-integrity)):

> **Digital SHA-256/SHA-3 root on a deterministic core, signed by ML-DSA-65** — with photonics confined to
> (a) **QRNG** entropy for keys/salts/nonces, (b) an **optical PUF** as hardware root-of-trust / key
> custody at the edge, and (c) **optical LSH/CAM** for non-trust addressing on the hot path. Every
> photonic-derived value is re-verified against the digital digest; mismatch ⇒ fail closed.

---

## 1. The question, made precise

"Photonic SHA-256" can mean four very different things, and the whole answer depends on keeping them apart:

1. **Analog optical hash** — encode the message as light intensities/phases and compute the digest through
   an analog optical transform. (§2)
2. **Digital-optical hash** — build SHA-256/Keccak from bit-exact, clocked, signal-restored *optical
   Boolean gates* (light carrying discrete 0/1). (§3)
3. **Optical one-way function / "optical hash"** — speckle, multiple-scattering, or PUF-style physical maps
   marketed as hashes. (§4)
4. **Photonic acceleration of a digital hash** — offload one sub-step (e.g. a matrix-multiply) to optics
   while the cryptographic hashing stays digital. (§5)

Only (1) and (2) would be a *literal* photonic SHA-256. (3) and (4) are different primitives that borrow the
word "hash." The verdict differs sharply by reading, so the rest of this note takes them in turn.

---

## 2. Reading 1 — Analog optical SHA-256: impossible (the exactness wall)

Analog photonic compute and cryptographic hashing have **directly opposed** core requirements:

- **Analog optics is low-precision and error-tolerant *by design*.** McMahon's authoritative review states
  flatly: *"it is difficult to achieve an effective precision greater than 10 bits in any analog computer,
  including analog optical computers,"* so *"applications of analog optical computers should be robust to
  this level of noise"* — and *"we only know how to achieve error-free machines with digital logic."*
  [[McMahon]] The ceiling is set by physics: shot noise (quantum nature of photodetection) and thermal
  (Johnson–Nyquist) noise, with effective precision typically **4–8 bits**; near the floor *"electrical
  noise may cause bit flips in the least-significant bits."* [[Garg]] Representing exact high-precision
  values "necessitates significantly higher SNR compared to digital systems," with cost growing roughly
  exponentially in bit-depth. [[Garg]] [[Stroev]]
- **Cryptographic hashing demands the opposite.** A hash is deterministic and exhibits the **strict
  avalanche criterion**: a single input bit-flip flips each output bit with probability ½ (for SHA-256, an
  expected Hamming distance of 128/256 output bits). [[SAC]] So *any* analog rounding/noise error in any
  intermediate word produces a totally different, useless digest — there is **no error budget**, no graceful
  degradation, and no error correction.

Real photonic hardware confirms the low-bit regime: 2025's analog optical computer operates on *"synthetic
3-bit to 8-bit precision"* instances; "all-analog" photonic chips target vision/inference, not exact
arithmetic. [[AOC2025]] [[AllAnalog]]

**Conclusion:** an analog photonic substrate cannot compute SHA-256 (or any keyless cryptographic hash)
bit-exactly. This is a physics-level mismatch, not an engineering gap. *(Adversarially verified — claim
confirmed; see [§8](#8-adversarial-verification--we-tried-to-prove-this-wrong).)*

---

## 3. Reading 2 — Digital-optical SHA-256: possible in principle, pointless in practice

If you abandon analog operation and build **clocked, signal-restored, bit-exact optical Boolean gates**, the
exactness objection disappears — a complete optical gate set is Turing-equivalent, so SHA-256 (Merkle–Damgård)
or the Keccak/SHA-3 permutation *could* in principle be implemented and would satisfy crypto-on-core. But this
is exotic with no advantage:

- Deterministic all-optical gates (AND/OR/NOT/NAND/XOR, 1–2-bit full-adders) exist as **isolated lab demos**
  in SOAs, microrings, and photonic crystals. The most ambitious recent system is a **2-bit SUBLEQ processor
  across *multiple* discrete chips at sub-GHz** (Hua et al. 2024), whose authors concede *"a single fully
  monolithic PIC for a general-purpose, all-optical processor is not feasible at the current time."*
  [[HuaCPU]]
- David Miller's authoritative critique sets six criteria (cascadability, fan-out/gain, logic-level
  restoration, I/O isolation, no critical biasing, loss-independent levels) and concludes *"nearly all
  proposals for optical logic fail on most of these criteria,"* with optics' real advantage in
  *interconnect*, *"not so much in the logic itself."* Energy is decisive: all-optical logic *"cannot
  reasonably be proposed... if it consumes more energy than silicon transistors,"* and CMOS already runs at
  the femtojoule level. [[Miller]]

> **The key point:** "in principle a hash could be built from optical gates" is true but **vacuous as an
> advantage claim**. A bit-exact digital-optical hash is just digital computing in a different medium — it
> confers no cryptographic-integrity property a silicon SHA-256 core does not already provide, and today it
> is a lab curiosity far less mature and less efficient than a commodity CMOS hash core. For a fail-closed
> integrity gate it would add an attacker-relevant analog-error surface for zero benefit.

*(Terahertz/femtosecond single-gate speed numbers in photonic-crystal papers are simulation/single-device
figures — not a working hash pipeline, and they ignore exactly the cascadability/fan-out/energy criteria
Miller flags. Do not cite them as a hashing-rate advantage.)*

---

## 4. Reading 3 — "Optical hashes" and optical one-way functions are **not** cryptographic

This is the **naming trap**. The literature's "optical hash function" / "optical one-way function" almost
always denotes a *physical* primitive, not a cryptographic one:

- The foundational paper is literally titled *"Physical One-Way Functions"* (Pappu et al., **Science 2002**):
  shine a laser through a disordered token, read the speckle. The "one-way-ness" is *physical unclonability
  of the token*, **not** collision-resistance over attacker-chosen digital messages. It is the seed of the
  optical PUF (see §7), not a keyless hash anyone can recompute. [[Pappu]]
- Speckle is **noisy and not bit-exact**: *"the chaotic behavior of speckle causes reproducibility problems,
  and cryptographic protocols require either zero noise or very low noise"*; stable keys need a **fuzzy
  extractor** (error-correcting helper data) just to reproduce a value. [[Skoric]] This is the opposite of a
  hash's zero-error determinism.
- **Decisive adversarial result:** a class of optical PUFs *"can be learned to arbitrary precision with
  arbitrarily high probability, even in the presence of noise, given polynomially many challenge–response
  pairs and polynomially bounded computational power"* — i.e. **polynomial-time learnable**, breaking the
  one-way/unclonable premise (and connecting it to Learning-With-Errors). [[LearnPUF]]
- The papers that *do* claim SHA-grade behavior (multiple-scattering / speckle "optical hash," Acta Physica
  Sinica 2021, Applied Optics 2022; equal-modulus-decomposition "authentication hash," Optics Comm. 2018)
  report only **empirical avalanche/collision statistics from numerical simulation**, with no formal
  collision-resistance proof, often **benchmarking against MD5/SHA-1 — themselves cryptographically broken**;
  the EMD construction has documented phase-retrieval key-recovery attacks. [[ScatterHash]] [[EMDHash]]
- Photonic **content-addressable memory** and **locality-sensitive hashing** (OptiCAM ~100 ps/search;
  silicon ternary CAM; nonlinear Hamming-distance engines) are **similarity / approximate-match** primitives
  by construction — fast and genuinely photonic-friendly, but with **no collision resistance** and no
  bit-exact guarantee. They are the *opposite* of a cryptographic hash. [[OptiCAM]]

The lone primitive explicitly branded a *"quantum-resistant photonic hash"* (arXiv:2409.19932) is built on
**Gaussian boson sampling**: its output comes from quantum measurement *sampling* (≈10⁵ shots, error ∝
N_shot^−½ — **not** bit-exact), security is *conjectured* on GBS hardness (not a collision-resistance proof),
properties are shown empirically (N ≤ 16 modes), and **it has no experimental implementation**. It is a
different, unbuilt primitive, not a SHA-256 replacement. [[GBSHash]]

**Conclusion:** no keyless, bit-exact, collision-resistant SHA-256-grade *photonic* hash exists. The
"optical hashes" are physical (device-bound, noisy, fuzzy-extractor-dependent, sometimes learnable) or
simulation-grade. *(Adversarially verified — confirmed.)*

---

## 5. Reading 4 — Photonic "hashing" in the wild = accelerate the linear step, digital does the crypto

The one substantive body of "photonic + cryptographic hashing" work is **Optical Proof-of-Work**
(HeavyHash / kHeavyHash / **LightHash**, used by Kaspa, described in **BIP-0052**). Critically, it **does not
hash optically**:

- The construction is **`Keccak(SHA-3) → integer matrix-multiply → Keccak(SHA-3)`**. Only the middle
  matrix-vector multiply is the photonic target; **both Keccak hashes run on a digital die** and supply all
  the cryptographic security. [[BIP52]] [[Kaspa]]
- **LightHash** (Bandyopadhyay/Pai/Hamerly et al., arXiv:2205.08512, **Optica 2023**) is explicit: the
  photonic MZI mesh computes only *"integer matrix-vector operations,"* deliberately a *"robust **discrete
  analog**"* scheme *"sufficiently tolerant to systematic error (calibration, loss, coupling, phase)"* so
  multiple noisy devices reach the **same integer** result; the title is *"**digitally-verifiable** photonic
  computing."* The authors note *"any error in the bits output by analog hardware renders an entire hash
  verification invalid,"* which is *why* they had to invent an error-tolerant, integer-quantized, modified
  scheme — **not** standard SHA-256 computed in light. [[LightHash]]
- The **Keccak-f[1600] permutation is structurally hostile to analog photonics**: 24 rounds of θ/ρ/π/χ/ι =
  bitwise XOR, rotations, and a nonlinear AND-based χ over a fixed 1600-bit state, with full avalanche and
  zero error tolerance. No published all-optical Keccak or SHA-256 compression function exists; only
  component-level optical XOR/AND gates and optical AES sub-operations have been demonstrated. [[NTT-AES]]
- **The "all-optical SHA-256" patents** (e.g. US 12,219,050; US 12,493,316 / US 2024/0004417) and vendor
  copy overstate what is computed in light: on inspection they describe **optical acceleration of the MAC
  step bracketed by digital hashing**, not all-optical SHA. Treat "implements SHA-256 all-optically" as a
  category error unless it explicitly means digital-optical logic. [[oPoWpatent]]

**Conclusion:** there is **no** photonic acceleration of SHA-256/Keccak and **no** demonstrated bit-exact
optical cryptographic digest. A small niche reuses an optical matrix-multiply *inside an otherwise-digital
hash* — which fits a fail-closed design but provides none of the cryptographic integrity itself. *(This is
the one claim the verifier softened: from "essentially no published role" to the precise statement above.)*

---

## 6. The quantum angle — a "photonic/quantum SHA-256" buys nothing on the hash

- **SHA-256's quantum posture is mild.** Grover gives only a **quadratic** speedup, reducing preimage
  security from ~256 to ~128 bits — a level NIST treats as safe (AES-128 is NIST PQC level 1). [[NSA-CNSA]]
  And the "halving" is itself pessimistic: **Grover barely parallelizes**, so a real preimage attack costs
  ~2¹⁰⁴·⁵ in depth-width product (on the order of trillions of ~724-qubit circuits running a decade) — far
  above the naive 2⁶⁴. Effective quantum security of a 256-bit hash is well above 128 bits in practice.
  [[Valsorda]] So "make the hash photonic/quantum" solves a non-problem and would *forfeit* the bit-exactness
  hashing needs.
- **"Quantum hashing"/quantum fingerprinting** (Gottesman–Chuang; Ablayev et al.) is a real primitive but
  outputs a **quantum state**, not a classical digest: it can't be stored, transmitted classically, or
  compared with a bitwise check (equality is a SWAP test on quantum hardware), and it has a one-way-vs-
  collision-resistance trade-off. Its use is communication-complexity and QKD privacy amplification — **not**
  tamper-evidence. [[QHash]]
- **Where photonics genuinely contributes:** **QRNG** (quantum random number generation) is *deployed and
  certified* (ID Quantique Quantis; Quside; 18.8 Gbps integrated photonic QRNG) — but that is **entropy** for
  keys/salts/nonces, **not** integrity. **QKD** distributes key material but is explicitly **not** recommended
  as a standalone solution by NSA/NCSC/ANSSI/BSI (no source authentication, special hardware); the consensus
  path is PQC. [[QRNG]] [[NSA-CNSA]]

So the quantum-resistance budget belongs on the **signature over the digital digest** (ML-DSA-65), exactly the
established Galerina posture — not on a "photonic hash."

---

## 7. The honest "photonic version" of integrity

There is no photonic hash to build. The defensible "photonic version" is an **architecture** that keeps the
cryptographic digest digital and puts photonics where it is genuinely strong — at the trust **edge** and the
non-trust **hot path** — with everything re-verified against the digital digest:

```
                 ┌──────────────────────────────────────────────────────────┐
  TRUST GATE     │  DIGITAL DETERMINISTIC CORE  (bit-exact, fail-closed)      │
  (irreplaceable)│   SHA-256 / SHA-3 leaf+root  →  ML-DSA-65 signature        │  ← the integrity anchor
                 └───────────────▲───────────────────────────▲──────────────┘
                                 │ re-verify (mismatch ⇒ deny) │ signs over the root
        ┌────────────────────────┴───────┐        ┌───────────┴────────────────┐
 EDGE   │  Optical PUF                    │  ENTROPY  │  Photonic QRNG          │
 (RoT)  │  hardware root-of-trust /       │        │  vacuum/phase-noise →      │
        │  unclonable device identity /   │        │  keys, salts, nonces       │  ← real, deployed
        │  custody the ML-DSA-65 key      │        └────────────────────────────┘
        └─────────────────────────────────┘
 HOT    ┌─────────────────────────────────────────────────────────────────────┐
 PATH   │  Optical LSH / CAM — APPROXIMATE addressing, dedup, similarity        │  ← non-cryptographic;
        │  (a candidate is only a POINTER; the bytes still verify on the core)  │     never the trust anchor
        └─────────────────────────────────────────────────────────────────────┘
```

- **Digest + signature stay digital** (SHA-256/SHA-3 keyless bit-exact root, ML-DSA-65 over the root). This is
  the crypto-on-core invariant, now empirically reconfirmed (§§2–6).
- **Optical PUF → hardware root-of-trust / key custody** (prototype-maturity silicon-photonic PUFs exist,
  ~7000-bit keys, cloning probability <10⁻³⁰ — but those are *identity* metrics, not collision bounds; need
  fuzzy extractors; attackable by ML modeling, so defense-in-depth only). It can bind device identity and
  custody/derive the ML-DSA-65 key so no key sits in plaintext — but it must stay **outside** the hash path.
  [[SiPhPUF]] [[LearnPUF]]
- **QRNG → entropy** for keys/salts/nonces (deployed, certified). [[QRNG]]
- **Optical LSH/CAM → non-trust addressing** on the hot path; any candidate it returns is only a pointer into
  data that is then verified against the signed digital digest. [[OptiCAM]]

Every photonic-derived value crosses back into the trust gate only after re-verifying against the digital
digest; on mismatch it is `unknown → deny` (fail closed). Photonics serves availability, identity, and
entropy — **never** the cryptographic integrity decision itself.

---

## 8. Adversarial verification — we tried to prove this wrong

Four independent agents were tasked to **refute** the core claims by hunting for a real cryptographic photonic
hash. **All four claims survived** (`refuted: false`), and the strongest apparent counterexample confirmed the
verdict:

| Claim | Result | Strongest attempted counterexample → why it fails |
|---|---|---|
| No SHA-256/SHA-3-grade keyless, collision-resistant, bit-exact hash runs natively on an **analog** photonic substrate | **confirmed** | **LightHash** — but it's a *modified* error-tolerant scheme, integer-quantized, with the digest from **digital** SHA-3 [[LightHash]] |
| Optical PUFs / "optical hashes" are physical/approximate, **not** SHA-256 replacements | **confirmed** | GBS "photonic hash" — conjectured security, ≈10⁵ shots (not bit-exact), unbuilt [[GBSHash]] |
| Bit-exact hashing needs a deterministic digital lane; analog (~4–10 bits) can't meet it | **confirmed** | Every real "photonic hash" re-imposes exactness via a digital/quantization step [[LightHash]] |
| Photonics has no real role accelerating SHA-256/Keccak; its honest roles are LSH/PUF/QRNG, digest on a deterministic core | **confirmed (nuance)** | Softened to: *no SHA/Keccak acceleration and no demonstrated optical collision-resistant digest; a niche reuses optical matmul inside an otherwise-digital hash* |

The fact that the leading, peer-reviewed, *real-hardware* effort (LightHash) **deliberately keeps the hash
digital and only offloads the linear matmul** is the single most decisive piece of evidence: the people most
motivated to build a photonic hash concluded the cryptographic part must stay digital.

---

## 9. Reconciliation with the Galerina / TritMesh framing

- **Crypto-on-core, empirically reconfirmed.** This independently re-derives `SPORE-SUBSTRATE-001 /
  CRYPTO_ON_NOISY_LANE` from the photonic-hashing literature: integrity must run bit-exact on a deterministic
  lane; a noisy/photonic lane is forbidden. The rule isn't conservative caution — it's what the physics and
  the real photonic-crypto efforts both confirm.
- **Resolves the KB contradiction** I flagged earlier: `galerina-hardware-future-substrates.md:63` ("Encryption
  → Photonic matrix operations") should be corrected — *encryption/hashing is not a photonic-plane operation*;
  only error-tolerant linear algebra is. (See the companion tri-encryption note.)
- **Consistent with FFSM (#199):** ffsim runs on a `lane: noisy` tolerance lane, but the Epilogue Receipt
  signs `sha256(output)` on the deterministic core — exactly the split this note endorses. A "photonic
  SHA-256" would have *broken* that design; keeping the digest digital preserves it.
- **The "photonic version of SHA-256" the project should adopt** is therefore: *keep SHA-256/SHA-3 digital and
  bit-exact; PQ-upgrade the signature (ML-DSA-65) over the digest; use photonics for QRNG entropy, an optical
  PUF root-of-trust, and optical LSH addressing — outside the hash, re-verified against it.*

---

## 10. Open questions

1. **Optical PUF as ML-DSA-65 key custody** — is a silicon-photonic PUF + fuzzy extractor a *better* root of
   trust than a TPM/HSM for a photonic node, given the ML-modeling-attack surface? (Defense-in-depth, not
   sole custody.)
2. **Digital-optical hashing, ever worth it?** Only if all-optical logic ever beats CMOS on energy *and*
   density *and* cascadability — currently not close (§3). Track, don't pursue.
3. **Optical LSH on the hot path** — quantify the recall/latency of optical CAM for `.tmf` addressing, and
   pin the re-verification cost (every hit must re-verify against the digital digest).
4. **QRNG sourcing** — which certified photonic QRNG (and health-test/SP 800-90B compliance) for key/salt
   entropy?

---

## 11. Sources

**Photonic precision / exactness wall**
- [[McMahon]] P. L. McMahon, *The physics of optical computing*, **Nature Reviews Physics** 6:717–734 (2024); arXiv:2308.00088 — <https://arxiv.org/abs/2308.00088>
- [[Garg]] S. Garg et al., *Dynamic Precision Analog Computing for Neural Networks*, **IEEE JSTQE** (2023); arXiv:2102.06365 — <https://arxiv.org/abs/2102.06365>
- [[Stroev]] Stroev & Berloff, *Analog Photonic Computing for Information Processing, Inference and Optimisation* (2023); arXiv:2301.11760 — <https://arxiv.org/abs/2301.11760>
- [[SAC]] *Strict Avalanche Criterion of SHA-256* (2024) — <https://www.researchgate.net/publication/383898186>; GeeksforGeeks, *Avalanche Effect in Cryptography*
- [[AOC2025]] *Analog optical computer for AI inference and combinatorial optimization*, **Nature** 641 (2025) — <https://www.nature.com/articles/s41586-025-09430-z>
- [[AllAnalog]] *All-analog photoelectronic chip for high-speed vision tasks*, **Nature** 623 (2023) — <https://www.nature.com/articles/s41586-023-06558-8>

**Digital all-optical logic**
- [[Miller]] D. A. B. Miller, *Are optical transistors the logical next step?*, **Nature Photonics** 4:3–5 (2010) — <https://www.nature.com/articles/nphoton.2009.240> (full text: <https://ee.stanford.edu/~dabm/379.pdf>)
- [[HuaCPU]] M. Hua et al., *An All-Optical General-Purpose CPU and Optical Computer Architecture*, arXiv:2403.00045 (2024) — <https://arxiv.org/html/2403.00045v1>

**Optical hashes / one-way functions / PUFs**
- [[Pappu]] Pappu, Recht, Taylor, Gershenfeld, *Physical One-Way Functions*, **Science** 297:2026–2030 (2002) — <https://www.science.org/doi/10.1126/science.1074376>
- [[Skoric]] B. Škorić, *The entropy of keys derived from laser speckle*, arXiv:0710.5002 — <https://arxiv.org/pdf/0710.5002>
- [[LearnPUF]] *Polynomial Bounds for Learning Noisy Optical Physical Unclonable Functions and Connections to Learning With Errors*, arXiv:2308.09199 — <https://arxiv.org/abs/2308.09199>
- [[ScatterHash]] *Optical Hash function based on multiple scattering media*, Acta Physica Sinica 70 (2021); *Parallel optical hash...* , Applied Optics 61(18):5457 (2022) — <https://opg.optica.org/ao/abstract.cfm?uri=ao-61-18-5457>
- [[EMDHash]] *An optical Hash function construction based on equal modulus decomposition...*, Optics Communications 428:7 (2018) — <https://www.sciencedirect.com/science/article/abs/pii/S0030401818306199>
- [[GBSHash]] *A Quantum-Resistant Photonic Hash Function* (Gaussian boson sampling), arXiv:2409.19932 — <https://arxiv.org/html/2409.19932v1>
- [[OptiCAM]] *OptiCAM: An optical content-addressable memory architecture for ultra-fast pattern matching*, APL Photonics 10:126116 (2025) — <https://pubs.aip.org/aip/app/article/10/12/126116/3374814>
- [[SiPhPUF]] *Hardware assurance with silicon photonic physical unclonable functions*, **Scientific Reports** (2024) — <https://www.nature.com/articles/s41598-024-72922-x>

**Photonic "hashing" in the wild (acceleration)**
- [[LightHash]] Bandyopadhyay/Pai/Hamerly et al., *Experimental evaluation of digitally-verifiable photonic computing for blockchain and cryptocurrency*, **Optica** 10:552 (2023); arXiv:2205.08512 — <https://arxiv.org/abs/2205.08512>
- [[BIP52]] *BIP-0052: Optical Proof-of-Work* (Kaspa) — <https://github.com/bitcoin/bips/blob/master/bip-0052.mediawiki>
- [[Kaspa]] kHeavyHash PoW (Keccak–matmul–Keccak) — <https://kaspa-lens.com/kaspa-wiki/kaspa-technology-and-features/kheavyhash-proof-of-work-algorithm/>
- [[NTT-AES]] NTT R&D, *Cryptographic Circuit Technology Consisting of Optical Logic Gates* — <https://www.rd.ntt/e/research/JN202111_16211.html>
- [[oPoWpatent]] US 2024/0004417 A1, *Photonic Blockchain Based on Optical Proof-of-Work* — <https://patents.justia.com/patent/20240004417>

**Quantum angle**
- [[Valsorda]] F. Valsorda, *Quantum Computers Are Not a Threat to 128-bit Symmetric Keys* (2023) — <https://words.filippo.io/128-bits/>
- [[NSA-CNSA]] NSA *CNSA 2.0 FAQ* (2024) — QKD not recommended for NSS; SHA quantum posture — <https://media.defense.gov/2022/Sep/07/2003071836/-1/-1/0/CSI_CNSA_2.0_FAQ_.PDF>
- [[QHash]] Ablayev et al., *Quantum Fingerprinting and Quantum Hashing* (2016/2017) — <https://www.intechopen.com/chapters/56986>
- [[QRNG]] X. Huang et al., *18.8 Gbps real-time QRNG with a photonic integrated chip* (2021); ID Quantique Quantis; Quside

**Internal cross-refs:** `quantum-resilient-tri-encryption.md` (companion) · `Galerina/docs/Knowledge-Bases/galerina-substrate-failure-model.md` (`SPORE-SUBSTRATE-001`) · `galerina-quantum-resistance-posture.md` (keep SHA-256; PQ the signature) · `galerina-ext-bridge-quantum-design.md` (FFSM #199 — sign `sha256(output)` on the deterministic core).
