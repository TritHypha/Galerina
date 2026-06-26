<!-- ABSORBED R&D SOURCE — verbatim mirror. Galerina is the main library; the R&D repo is upstream/authoring.
     Source: Galerina-R-AND-D/NOVELTY-AND-IP-ASSESSMENT.md  ·  Pinned: R&D fb68d06 (2026-06-16)
     Integrated Galerina view: (this archive copy is the primary KB home)  ·  Catalog: galerina-rd-absorption-catalog.md
     Rule: edit the upstream source then re-vendor; do not fork this copy (feedback-auto-import-rd-docs). -->

> **Absorbed R&D source (verbatim).** This is the archived upstream document. See `galerina-rd-absorption-catalog.md` for the full ledger. Internal links below point at the upstream R&D tree.

---
# Novelty & IP assessment — what is genuinely new vs borrowed, and the "keep it free" path

> **Status:** R&D assessment, 2026-06-16. **Posture (binding):** grounded, honest-core vs aspirational kept
> strictly separate, no over-claiming. **Important caveat:** this novelty read is from **training-time domain
> knowledge, NOT a fresh systematic prior-art search.** Before any publish/patent decision, the specific item
> should be prior-art-checked against current literature. Under-claiming novelty is the deliberate, conservative
> error here.

## 0. Headline
There is **no new cryptography and no new science in this project — by design.** The binding rule was *"no
invented crypto; FIPS/NIST/RFC/peer-reviewed primitives only."* So every cryptographic and codec building block is
**borrowed and standard**. What is "new" is **engineering composition + byte-precise specification + honest
negative results** — valuable, but not the kind of novelty that earns a crypto paper or survives a patent
novelty/non-obviousness exam. That is a *feature* (trust comes from using vetted primitives), not a shortfall.

## 1. Cryptographic primitives & codecs — 100% borrowed

| Component | Source | New? |
|---|---|---|
| ML-KEM-768/1024, ML-DSA-65/87, SLH-DSA | FIPS 203 / 204 / 205 | Borrowed |
| AES-256-GCM · ChaCha20-/XChaCha20-Poly1305 · Ascon | SP 800-38D · RFC 8439 / draft-irtf-cfrg-xchacha · SP 800-232 | Borrowed |
| SHAKE256 / SHA-3, SHA-256 | FIPS 202 / 180 | Borrowed |
| KEM-DEM / HPKE, X25519 / P-384 / Ed25519 | RFC 9180, SP 800-227, RFC 7748 / 8032 | Borrowed |
| **CTX committing-AEAD** (the CMT-1 work) | **Chan–Rogaway, ESORICS 2022 (eprint 2022/1260)** | Borrowed transform |
| Reed–Solomon erasure; symmetric hash ratchet | classical; Signal / TLS-1.3 key schedule | Borrowed |
| HNSW ANN; COSE/CWT (+ RFC 9964 ML-DSA) | Malkov–Yashunin 2018; IETF | Borrowed |
| NVFP4 + all modality codecs (PNG/AVIF/Opus/H.265/SMILES/CBOR…) | NVIDIA modelopt + existing standards | Borrowed (`.tmf` only *wraps* them) |

→ **None of this warrants a paper or patent.** Composing standard primitives is prior art by definition.

## 2. Constructions / format / governance — engineering compositions (weak-to-no novelty)

| Component | Closest prior art | Honest novelty | Paper / Patent? |
|---|---|---|---|
| **TMX-256** (3-ary SHAKE256 tree, coordinate-bound leaves) | tree hashing (KT128, BLAKE3) + domain separation | a parameterization, not a new idea | No |
| **`.tmf` container/format** | file-format & systems engineering | coherent spec, not invention | No |
| **KEM-DEM layer** (3 orthogonal selectors, AAD-committing, SHAKE256 KDF) | standard HPKE-style composition | engineering | No |
| **`+1` history chain** (hash-linked signed segments, key-erasure ratchet, crypto-erasure) | append-only logs + ratchets | combination of known parts | No |
| **`+1` on-wire packaging + strict-membership** | Merkle / append-log framing | the "head-sig ≠ table membership" catch is a standard Merkle consideration | No |
| **K3 governance gate** (Kleene 3-valued, `collapse(0)=deny`, fail-closed) | Kleene logic (1938) + fail-closed design | application of known logic | No |
| **MeshQL zone-typed compiler** (no-semantic-before-gate, opaque-pushdown / semantic-residual, egress redaction) | IFC/taint typing (Jif), predicate pushdown, encrypted DBs (CryptDB) | sensible design over dense prior art | Maybe a systems *workshop* note if built out; not patentable |
| **Privacy-as-compile-time-effect** (DP-budget effect, purpose-taint) | type-systems-for-DP (Fuzz/DFuzz/Duet, Reed–Pierce 2010) + GDPR Art 5 | borrowed academic ground, applied | No |
| **Governed Trust Capsule** (COSE/CWT profile) | RFC 9964 profiling | engineering | No |

## 3. Findings / negative results — the only genuinely citable material

| Finding | Rests on | Why useful | Publishable? |
|---|---|---|---|
| **Lane A: photonic ML-DSA-65 signing is a wash by Amdahl** (`f≈28%`, ideal ceiling ~1.4×; conversion tax + re-verify → net ≈0.9×) | Amdahl + Meech 2023 + LightHash 2023, applied to *signing* + a fresh measured datapoint + reproducible bench | a clean **negative result** that saves people a dead end | **Best candidate** — a *short measurement note / eprint*, not a flagship paper (confirms-with-numbers what Meech/LightHash imply) |
| "Photon can't *be* the signature / no photonic SHA-256" | precision-wall vs avalanche & EUF-CMA bit-exactness | kills a tempting wrong idea | No — known principle |
| Cleartext embeddings ≈ plaintext → **no leak-free in-network semantic routing** | vec2text (Morris et al. 2023), applied | killed a headline "feature" | No — borrowed result |
| DP ≠ anonymization (declassify → governed `aggregate`) | NIST SP 800-226 | corrects a common over-claim | No |

## 4. Paper vs Patent vs Defensive Publication — the actual guidance

The instinct *"keep it free for people"* points to the **wrong tool if it reaches for a patent**:

- **A patent *restricts*.** Making something free *via* a patent needs a defensive patent **plus** a royalty-free
  pledge — expensive, slow, and pointless for work built on standards that wouldn't clear novelty anyway.
- **A defensive publication is the right tool.** A public, **timestamped disclosure** becomes prior art and
  **blocks anyone (including you) from later patenting it** → it stays free permanently. The public git repo
  already does most of this.
- **To harden "free forever":** (1) **Apache-2.0** on the repo — it carries an *express patent grant* so
  contributors can't later patent-troll it (CC0 for pure spec text is an alternative); (2) optionally post the one
  real finding (**Lane A**) to **arXiv / IACR eprint / TechRxiv** — a single act that timestamps it as prior art
  and makes it citable.

## 5. Recommendation
- **Patent: none.** Not viable (standards-composition; obviousness/prior-art) and counter to "keep it free".
- **Paper: at most one short measurement note** — Lane A — and only if you want it citable.
- **License: Apache-2.0** (patent grant) is the highest-leverage "keep it free" move.
- The project's value is **trustworthiness + reproducibility + honest negative results**, not invention.

---

## Appendix A — Case study: why the external "`.tmf` patentability spec" must NOT be used
An external AI-generated "TritMesh Format Architecture & Patentability Specification" was circulated (2026-06-16).
It is confident and well-formatted but **largely fabricated, and it contradicts this project's own verified
ledger.** It is recorded here as a worked example of exactly the over-claiming this project's posture exists to
prevent. **Do not adopt any of its framing into the specs or any filing.**

| Claim in that document | Reality (this project's specs/verdicts) |
|---|---|
| "Phase Collapse → **absolute zero-bit physical footprint**"; "voltage signature natively flags a bypass" | **Physically false.** A 2-bit pair is 2 bits for any value; you cannot store a positional value in zero bits. Sparsity saves space only by omitting zeros **and paying for indices**. Software formats do not control storage-controller voltages. |
| "**Hardware-Level Transformation** / alters memory allocation on storage media" | Fabricated. A file format does not physically alter hardware allocation. This is the fake-physicality dodge for the *Alice/Mayo* abstract-idea bar — the legally radioactive part. |
| "**Zero-Decode** Processor Streaming / bypasses CPU decompression entirely" | Contradicted by the doc's **own NVFP4 decode formula**. NVFP4 is lossy quantization — it must be dequantized; our spec bars it from integrity-bearing bytes. |
| "**Physical Tri-State Routing**: TMX-256 maps onto optical phase shifts / ternary gates" | **The opposite of our settled verdict.** We *rejected* photonic hashing (precision wall vs avalanche; a photon can't *be* the digest). TMX-256 is SHAKE256, **bit-exact on the digital core**. |
| ML-DSA "**M · D_root ≡ S (mod q)**" | **Wrong crypto.** Real ML-DSA verify is **two exact checks** (norm bound ‖z‖∞ < γ₁−β **and** challenge-hash c̃ == H(μ‖w₁')). `photonic-lane-A` §1 says verbatim *"not a single matrix congruence."* |
| Magic `0x6E 0x88` | Real magic is `0x89 'T' 'M' 'F' 0x0D 0x0A 0x1A 0x0A` (`tmf-container-v0` §2). |
| "256-trit Attribute Layer = **searchable** semantic metadata" (cleartext) | Contradicts **verdict 5**: embeddings invert to ~plaintext (vec2text ~92%) ⇒ they **must be encrypted**, never searchable cleartext metadata. |
| Balanced ternary as the **storage substrate** with magic compression | Ternary's only honest crypto role is NTRU/ML-KEM polynomials (exact, digital); tri-logic is the **governance gate**, not the cipher/storage substrate. |

**Strategic problems, beyond the technical errors:** (1) the "dress abstract math as physical hardware
transformation" coaching is **inequitable-conduct risk** if filed knowingly false; (2) a patent **restricts** —
the opposite of the stated goal; (3) it fails novelty anyway (standards-composition). The honest path is §4 above.
