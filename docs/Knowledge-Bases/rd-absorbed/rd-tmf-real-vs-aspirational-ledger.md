<!-- ABSORBED R&D SOURCE — verbatim mirror. Galerina is the main library; the R&D repo is upstream/authoring.
     Source: Galerina-R-AND-D/tmf/research/real-vs-aspirational-ledger.md  ·  Pinned: R&D fb68d06 (2026-06-16)
     Integrated Galerina view: galerina-tmf-engine.md  ·  Catalog: galerina-rd-absorption-catalog.md
     Rule: edit the upstream source then re-vendor; do not fork this copy (feedback-auto-import-rd-docs). -->

> **Absorbed R&D source (verbatim).** This is the archived upstream document. Curated/integrated view: `galerina-tmf-engine.md`. See `galerina-rd-absorption-catalog.md` for the full ledger. Internal links below point at the upstream R&D tree.

---
# `.tmf` / TritMesh crypto — real vs. aspirational ledger

**Purpose.** Sort every design claim in `notes/1.md`, `notes/2.md`, `notes/3.md` (and the
four-pillar primitive proposal) into **REAL** (implementable on commodity hardware, citable),
**ASPIRATIONAL** (a legitimate research direction, but unproven / hardware-dependent — keep it,
label it), or **FICTIONAL** (a category error or a claim that cannot be true as stated — cut it).

The test is Galerina's own rule (`CLAUDE.md` + KB `galerina-photonic-tri-substrate-rd-agenda.md`):
*no performance number without a reproducible benchmark and the machine it ran on; bulk compute
may be photonic, but integrity must stay on a deterministic core.*

Legend: ✅ REAL · 🟡 ASPIRATIONAL (keep, labelled) · ❌ FICTIONAL (cut / correct).

---

## A. Cryptography

| # | Claim (source) | Verdict | Grounded correction |
|---|---|---|---|
| A1 | 3-ary Merkle tree XOF over coordinate-bound leaves (`1.md §4`) | ✅ | Sound and now concretely specified with test vectors — see [`../spec/tmx-256-construction-v0.md`](../spec/tmx-256-construction-v0.md). |
| A2 | Sign **over** the root with ML-DSA-65 (FIPS 204) (`1.md §4.3`, `3.md §4.2`) | ✅ | Correct order (hash then sign). ML-DSA-65 is FIPS 204, finalized Aug 2024. |
| A3 | Bind TVCID + modality into the leaf to stop cell-swaps (`1.md §4.1`) | ✅ | Textbook position-binding. v0 also binds `kind`. |
| A4 | "Rejects word-serial hashing **like SHA-256**" / replace SHA-256 (`3.md §4`, `1.md §4`) | ❌ | SHA-256 is *not* the enemy. It is FIPS-180-4, Grover-resistant at 128-bit, and Galerina explicitly **keeps** it (`galerina-quantum-resistance-posture.md`). TMX uses SHAKE256 because it's an **XOF/tree-friendly**, not because SHA-256 is broken. Don't frame this as "replacing" SHA-256. |
| A5 | "The signature **is** the memory address" (earlier notes; implied by `3.md` routing) | ❌ | Category error. A signature needs a private key, isn't derivable from content, and isn't stable across signers — it cannot be a content address or cache key. (Galerina flagged this in notes 31.) |
| A6 | ML-DSA "continuously verifies **millions** of stream signatures, immune to timing leaks, branchless O(1)" (`primitive proposal §2`) | 🟡/❌ | Constant-time ML-DSA verification is real and good (mitigates timing side channels). "Millions/sec, O(1), single clock cycle" is a **throughput claim with no benchmark** — cut the number, keep "constant-time, side-channel-resistant implementation." |
| A7 | ML-KEM (FIPS 203) for key exchange (`primitive proposal §1`) | ✅ | Correct primitive for confidentiality. Recommend **hybrid** X25519+ML-KEM-768 during transition. Note Galerina currently has **no confidentiality layer** — this is genuinely new scope. |
| A8 | "ML-KEM coefficients are clamped to balanced base-3 {+1,−1,0}; ntt_mul does it multiplication-free, O(1)" (`primitive proposal §1`) | ❌ | ML-KEM works in ℤ_q with **q = 3329** (12-bit coefficients); secret/error terms come from a **centered binomial** distribution (e.g. [−2,2]/[−3,3]), not {−1,0,+1}. The NTT is **O(n log n)**, not O(1). The "1.58-bit ternary maps directly" mapping is **false for ML-KEM/ML-DSA**. (It *is* partly true for **NTRU** — see A12.) |
| A9 | Ascon for symmetric bulk encryption (`primitive proposal §3`) | ✅ | Ascon is the NIST Lightweight Crypto winner, now **SP 800-232** (final Aug 2025). Use **Ascon-AEAD128** (the standard's name; "Ascon-128a" is the old CAESAR name). Good for edge/IoT and side-channel-friendly. |
| A10 | "Ascon maps seamlessly to carry-free addition-only **ternary** hardware" (`primitive proposal §3`) | ❌ | Ascon's permutation is **binary** (GF(2) AND/XOR/rotate). It does not map to ternary addition. Pick Ascon for its real merits (lightweight, side-channel-friendly), not a ternary story. |
| A11 | ZK-SNARKs (Groth16/Plonk) for blind queries (`primitive proposal §4`) | ✅ (scoped) | Real and appropriate for private query parameters. **Not** NIST-standardized; Groth16 needs a per-circuit trusted setup, Plonk a universal one. Treat as an optional privacy add-on, not core integrity. |
| A12 | "The database mesh **is** the arithmetic circuit, so verifying the ZK proof = evaluating the query — the same wave operation" (`primitive proposal §4`) | ❌ | Category error. Evaluating a query and verifying a SNARK are different operations over different objects; a SNARK proves a statement about a computation, it is not the computation. R1CS/arithmetic-circuit framing is real; "verification is free because the data is already a circuit" is not. |
| A13 | Coefficient/ternary link to lattice crypto in general | 🟡 | **Partly real via NTRU**: NTRU uses **ternary polynomials** (coeffs in {−1,0,1}) with small modulus **p = 3**, and influenced Kyber/Falcon. So "ternary ↔ lattice" is not baseless — but it applies to **NTRU**, not to the standardized ML-KEM/ML-DSA. See [`ternary-in-cryptography.md`](ternary-in-cryptography.md). |
| A14 | "In-cache self-healing / Matrix Neighborhood Convolution repairs flipped trits while reading" (`3.md §5.2`, `1.md`) | 🟡→❌ in gate | Legitimate **only** as an *availability* feature for **non-trust** data, **outside** the verification gate, and any repaired byte must re-verify against the signed root or be rejected. A reconstruction path *inside* the trust gate is an attacker target — **forbidden**. |
| A15 | "Lattice signature breaks parity → infected region drops to 0 → malware deletes itself" (`30-notes-3`, echoed) | ❌ | Cryptographic fan-fiction. A signature check returns valid/invalid; it does not cause memory to self-erase. Keep the real behavior: **detect → fail closed**. |

## B. Performance & hardware

| # | Claim (source) | Verdict | Grounded correction |
|---|---|---|---|
| B1 | "**12,500,000 RPS**, sub-**0.01 ms** P99" (`3.md §1`) | ❌ | No benchmark, no machine, no methodology. Unusable as stated. Any future number must name the hardware and be reproducible. |
| B2 | "Single hardware clock cycle" matrix/lattice/dot-product (`2.md`, `3.md §2.2`) | ❌ | Physically false for these operations on any real CPU; a marketing flourish. |
| B3 | "Systolic Tensor Arrays … in a single clock cycle"; "Ternary Photonic CPU" (`2.md`, `3.md`) | 🟡 | Photonic/ternary substrates are **real but immature research**, and where real optics are modeled they are **noisy/stochastic**: Cornell's single-photon NN inference shows a measured ~10% accuracy floor (arXiv:2307.15712), and the 4 photonics repos in `C:\wwwprojects\x` contain **zero deployed photonic ALU** (simulation/lab/list only; see [external-repos-analysis.md](external-repos-analysis.md) §4). Keep as a clearly-labelled aspirational track, never load-bearing — and note the noise is *positive evidence* that **crypto must stay on a deterministic core**. |
| B4 | "Trits act as immediate **physical electrical switch routes**; O(1) hardware jump-tables route packets" (`2.md §1`, `3.md §2.1`) | ❌ | There is no such network hardware. Routing is done by ordinary NICs/switches. An in-file "jump table" is just an offset table (fine); "the trit physically *is* the route" is fiction. |
| B5 | "Kernel-bypass Virtio-Trit DMA into L1/L2 cache" (`2.md`, `3.md §2.2`) | 🟡 | Kernel-bypass I/O is real (DPDK, io_uring, RDMA), and you *cannot* DMA "into L1/L2" — caches aren't addressable targets. Keep "kernel-bypass transport" as a real option; cut "DMA into cache registers." |
| B6 | "Zero-serialization / zero-decode streaming because wire layout == cache layout" (`2.md §2`, `3.md §2.1`) | 🟡 | Zero-copy / fixed-layout parsing is real and worth doing. But cross-machine you still need endianness/versioning discipline, and "zero decode ever" overstates it. Keep zero-copy; drop "zero overhead." |
| B7 | "3.5× more data in hot cache than a key-value store" (`30-notes-3`) | ❌ | No benchmark. The genuine, *measured* fact is storage density: 5 trits/byte ≈ **1% overhead** vs. ideal ternary (`log₂3 ≈ 1.585` bits/trit). That is a storage statement, not a speed one. |

## C. Data model & format

| # | Claim (source) | Verdict | Grounded correction |
|---|---|---|---|
| C1 | Balanced ternary {−1,0,+1}; single zero; cheap negation (`1.md §2`) | ✅ | Real and the honest reason to be ternary: native three-valued logic + sign symmetry. Not a speed claim. |
| C2 | Trit packing into bytes (`1.md §2.1` uses **2 bits/trit → 4 trits/byte**) | ✅ but suboptimal | 2-bit packing wastes 25% (1 of 4 states unused). The denser honest option is **5 trits/byte** (`3⁵ = 243 ≤ 256`) ≈ 1% overhead. Choose per goal: 2-bit = fast random access; 5/byte = compact. Record as an open question. |
| C3 | "Value 0 → `0b10` → storage controller does a hardware bypass → **0 bits allocated**" (`1.md §2.2`) | ❌ | Self-contradictory: you can't both store a 2-bit code *and* allocate 0 bits. Sparsity savings are real but come from a **sparse encoding** (store only non-zero coords), not a magic voltage that occupies no space. |
| C4 | TVCID = 3-set spatial coordinate ID `[X,Y,T]` (`1.md §3.B`, `entity.spore`) | ✅ | Reasonable coordinate-ID design. "The ID **is** the memory address → O(1) route, no index" is the same A5 fiction; keep TVCID as a key, not a physical address. |
| C5 | Fixed-width, rigid container; PNG-style magic; no variable-length parser ambiguity (`1.md §3`, `3.md §2.1`) | ✅ | Good robustness instincts; v0 keeps the PNG-style 8-byte magic and length-prefixed sections. (Note: fully fixed-width 1 KB wire cells trade simplicity for padding waste — an engineering choice, not a security one.) |
| C6 | Mandatory 9-byte NVFP4 micro-blocks as the payload unit (`1.md §3.D`) | ✅ format / 🟡 coupling | **The 9-byte block is VERIFIED-correct** in NVIDIA source: 16×E2M1 (8 bytes) + 1-byte **E4M3** per-block scale (`Model-Optimizer/.../nvfp4_tensor.py:31-44`; `TransformerEngine constants.py:46,177`) — see [external-repos-analysis.md](external-repos-analysis.md) §2. NVFP4 is real, production (Nemotron-3, MLPerf v5.1) and a fine codec for vector/tensor modalities — **but it is lossy** (never crypto bytes) and must not be the *mandatory* container unit: TMX hashes opaque payload bytes; modality picks the codec. (MXFP4 ≠ NVFP4: 32-elem/E8M0.) |
| C7 | ".tmf renders JPEG/MP4/WAV/JSON obsolete; a Multi-Modal Data Crystal" (`30-notes-3`) | ❌ | Marketing. A new container does not obsolete mature codecs; at best it wraps them. |

## D. Zero-trust / governance (mostly REAL — this is the strong part)

| # | Claim (source) | Verdict | Grounded correction |
|---|---|---|---|
| D1 | Three-valued authorization allow/deny/unknown, `unknown → deny` (`3.md §3`, governance .spore) | ✅ | Real and **proved** in Galerina (`galerina-three-valued-governance.md`): Kleene K3, `collapse(0)=deny`, No-Coercion theorem. This is the genuine "tri-logic" win. |
| D2 | Compile-time fusion of governance off the hot path ("Tri-Pipe") (`2.md §3.A`, `3.md §3.1`) | ✅ | Matches Galerina's real model (compile-time effect/taint/governance verification). Sound design DNA. |
| D3 | Fail-closed everywhere; integrity mismatch aborts (`3.md §3.C`) | ✅ | Correct posture; aligns with NIST SP 800-207 "never trust, always verify" and Galerina deny-by-default. |
| D4 | "App **must** be in Galerina or it's insecure" (`2.md §3`, `3.md §3`) | 🟡 | Overstated. Galerina governance is a strong fit, but a `.tmf`/PQC stack can be implemented and secured in other languages. Keep "Galerina is the natural governance host," drop "must, or else." |

## E. Photonic-era signing (research-phase 2026-06-16; charter `..\..\RESEARCH-PHASE-photonic-signing-and-trust-capsule.md`)

| # | Claim | Verdict | Grounded correction |
|---|---|---|---|
| E1 | A photonic/analog computation that **is** the digital signature ("the photon signs it") | ❌ | Same precision-wall-vs-unforgeability argument that killed "photonic SHA-256": a signature needs bit-exact, deterministic, error-free arithmetic (one flipped bit ⇒ verify fails); analog photonics is ~≤10-bit/error-tolerant. A photon cannot *be* the signature. The primitive stays **digital** (Ed25519 + ML-DSA-65, #34). |
| E2 | Photonic signing presented with a performance claim and **no** reproducible benchmark + machine | ❌ | Cut the number. Lane A (photonic-*accelerated* lattice signing) is the only earnable perf angle, and only behind a reproducible benchmark *after* re-quantization + digital re-verify — see [`photonic-lane-A-accelerated-signing.md`](photonic-lane-A-accelerated-signing.md). If no such benchmark exists in the literature, it stays a labelled theoretical gap. |
| E3 | Photonic-**accelerated** lattice signing (offload the linear NTT/matmul, re-quantize, digital re-verify) | 🟡 | Legitimate research direction (LightHash/HeavyHash pattern). Real **only** as an accelerator behind the deterministic re-verify gate, never the trust boundary; may be a net wash after the re-quantization tax. Lane A. |
| E4 | Quantum Digital Signatures (QDS / MDI-QDS) as a different, information-theoretic signing paradigm | 🟡 | Real academic field (Gottesman–Chuang 2001 + MDI-QDS); honest blockers — quantum channels/hardware, tiny throughput, **no PKI**, repudiation/transferability semantics ≠ classical non-repudiation. **Track, don't build** (Tier-B cold path). Lane B. |
| E5 | Optical-PUF as a "physical signature" / sole authenticator | 🟡→❌ as sole | Real as **defense-in-depth hardware binding under** the digital sig (sender-constraint), but **not** a digital signature: no public verifiability without an enrollment DB, no classical non-repudiation, and **noisy optical PUFs are polynomial-time ML-learnable** — never sole custody. Lane C. |
| E6 | QRNG for FIPS-204 hedged-signing / keygen entropy | ✅ (scoped) | Real but peripheral — an entropy source *outside* the cipher, behind SP 800-90B health-tests + a DRBG conditioner (never raw QRNG into keys). Lane D. |
| E7 | The **Governed Trust Capsule** (CWT/COSE profile besting JWT, signed by the #34 hybrid) | ✅ | The near-term, deployable artifact: standards-based (RFC 8392/8152), digital primitive, photonics only *around* it (PUF/QRNG/ANN, scoped). See [`../spec/governed-trust-capsule-v0.md`](../spec/governed-trust-capsule-v0.md). |

---

## Bottom line

- **Keep and build:** the 3-ary coordinate-bound TMX tree (✅), sign-the-root with ML-DSA-65
  (✅), the four real primitives ML-KEM / ML-DSA / Ascon / ZK-SNARK (✅, scoped), balanced
  ternary as a *modeling* choice (✅), and three-valued fail-closed governance (✅, the strongest
  asset).
- **Keep but label aspirational:** photonic/ternary acceleration, kernel-bypass transport,
  out-of-gate self-healing for availability. Never load-bearing, never a perf headline.
- **Cut or correct:** every fixed throughput/latency number, "single clock cycle," "signature
  is the address," "replace SHA-256," the ternary-maps-to-ML-KEM claim, "verifying the SNARK =
  running the query," self-erasing malware, and DMA-into-cache.

## Sources
- NIST SP 800-207, *Zero Trust Architecture* — https://csrc.nist.gov/pubs/sp/800/207/final
- FIPS 203 (ML-KEM) — https://csrc.nist.gov/pubs/fips/203/final · FIPS 204 (ML-DSA) — https://csrc.nist.gov/pubs/fips/204/final
- NIST SP 800-232 (Ascon) — https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-232.pdf
- NTRU (ternary polynomials, p=3): Hoffstein–Pipher–Silverman 1998 — https://www.ntru.org/f/hps98.pdf
- Galerina KB: `galerina-quantum-resistance-posture.md`, `galerina-three-valued-governance.md`, `galerina-photonic-tri-substrate-rd-agenda.md` (read 2026-06-15)
