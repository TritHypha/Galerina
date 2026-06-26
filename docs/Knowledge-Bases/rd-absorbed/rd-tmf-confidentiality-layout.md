<!-- ABSORBED R&D SOURCE — verbatim mirror. Galerina is the main library; the R&D repo is upstream/authoring.
     Source: Galerina-R-AND-D/tri-encription/research/SPORE-AMD-024-tmf-confidentiality.md  ·  Pinned: R&D fb68d06 (2026-06-16)
     Integrated Galerina view: galerina-tmf-engine.md  ·  Catalog: galerina-rd-absorption-catalog.md
     Rule: edit the upstream source then re-vendor; do not fork this copy (feedback-auto-import-rd-docs). -->

> **Absorbed R&D source (verbatim).** This is the archived upstream document. Curated/integrated view: `galerina-tmf-engine.md`. See `galerina-rd-absorption-catalog.md` for the full ledger. Internal links below point at the upstream R&D tree.

---
# Engineering Amendment: Sovereign Confidentiality & Geometric Integrity Layout for `.tmf`

- **Document ID:** SPORE-AMD-024
- **Status:** R&D Reference Blueprint / Approved Architecture
- **Security Domain:** Software Governance-Verifier & Cryptographic Invariants
- **Reference Specs:** `SPORE-SUBSTRATE-001` (Crypto-on-Core) · `FIPS-203` (ML-KEM) · `FIPS-204` (ML-DSA) · `NIST SP 800-227` (HPKE / Hybrid KEM)
- **Provenance:** R&D artifact (NOT a monorepo / production scaffold). Grounded in the companion research
  notes in this folder — [`quantum-resilient-tri-encryption.md`](quantum-resilient-tri-encryption.md) and
  [`photonic-sha256-integrity.md`](photonic-sha256-integrity.md) — which carry the citations behind every
  claim below. Byte constants are anchored to FIPS 203; all enforcement is software (the compiler's
  machine-checked governance-verifier), never microcode/firmware.

---

## 1. Core Invariants & Mathematical Alignment

### 1.1 Lattice Coefficient Precision

To preserve mathematical accuracy, the primary ring elements of ML-KEM-768 **do not live as trits**; they
live as integers in the ring **ℤ_q where q = 3329**, requiring 12-bit mod-q **exact digital** arithmetic.

The ternary and small-signed connection within post-quantum cryptography is restricted to:

- **NTRU:** small polynomials whose coefficients are strictly sampled from the **balanced ternary alphabet
  {−1, 0, +1}**.
- **Kyber / ML-KEM:** a **Centered Binomial Distribution (η = 2)** that samples small, signed noise and error
  vectors ranging over the discrete set **{−2, −1, 0, +1, +2}** during key generation and encryption (note:
  5-valued, *not* ternary).

All polynomial operations — ring reductions, the NTT, matrix–vector products — must execute with **zero-error
precision on a deterministic, digital lane** (`SPORE-SUBSTRATE-001`).

### 1.2 Software Governance-Verifier Enforcement

The Strong-Kleene **K3** three-valued calculus ({−1, 0, +1} → Deny, Indeterminate, Allow) is enforced
**purely within the software governance-verifier** at compilation and runtime — **not** by microcode, enclave
firmware, or any hardware ring. If an evaluation yields an indeterminate state (`0`) due to an ambiguous
policy or a missing attestation token, the verifier executes the machine-checked **`collapse(0) == deny`**
invariant, halting execution **before** any `KeyHandle` can trigger decapsulation. Tri-logic decides *whether*
crypto runs; it never touches *how* the cipher math computes.

---

## 2. Proposed `.tmf` Container Layout (Non-Ratified ABI Sketch)

A proposed, non-binding design sketch for adding a confidentiality layer **under** the existing TMX-256
integrity gate. Fixed-width metadata gives O(1) indexability; fixed 1 MB stream chunks preserve O(1) seek to
chunk N. The container **defaults to the hybrid profile** during the post-quantum transition era.

### 2.1 Segment Metadata Layout (32 bytes)

| Field | Width | Notes |
|---|---|---|
| `Section ID` | 64 bits | |
| `Coordinate Block` | 128 bits | aligned to the 16-byte (64-trit) coordinate paradigm |
| `Crypto Profile / Flags` | 32 bits | see below |
| `Epoch / Timeline Tag` | 32 bits | |

**Flags:**
- `Bit 0` — Signed Status (`0 = Unsigned`, `1 = Signed via ML-DSA-65`)
- `Bit 1` — Confidentiality Status (`0 = Cleartext`, `1 = Encrypted via KEM-DEM`)
- **Profile bits** — default **`0x02`** (Hybrid, transition-safe); **`0x01`** reserved as the
  post-transition target.

### 2.2 Encapsulated Key Block (`ct_kem` Allocation)

- **Profile `0x02` (Default — Hybrid X25519 + ML-KEM-768):** exactly **1120 bytes** = 1088-byte ML-KEM-768
  ciphertext + 32-byte X25519 ephemeral public key.
- **Profile `0x01` (Post-Transition — Standalone ML-KEM-768):** strictly **1088 bytes** (per FIPS 203).

### 2.3 Symmetric DEM Sub-Layout Configurations

**AEAD suite (ratified 2026-06-16) — a registry selector distinct from the KEM profile above:** **default =
AES-256-GCM** (256-bit Grover margin, AES-NI throughput, suite-consistent with the level-3 ML-KEM-768/
ML-DSA-65); **Ascon-AEAD128** (SP 800-232) is the **constrained/embedded** profile; **ChaCha20-Poly1305** is
the no-AES-NI alternate (XChaCha20-Poly1305 where random/extended nonces are needed). The AEAD tag is
**committing** — `H(K_aead)` is bound into the AAD. The single-shot vs STREAM sub-layouts below apply to
whichever suite is selected.

**Profile `0x01` — Single-Shot Payload Block** (small/fixed API packets, localized attributes):

- `Initialization Vector / Nonce`: 96 bits
- `Authentication Tag`: 128 bits (AES-256-GCM)
- `Ciphertext Payload`: continuous byte stream

**Profile `0x02` — Segmented STREAM Payload Block** (large media: image / audio / video) — structurally
defeats truncation, chunk-reordering, and splice/rollback:

- `Segment Payload Chunk Size`: 32 bits (default 1 MB segments)
- `Payload Stream Layout`: an unbroken sequential array of structured frames, each chunk carrying its own
  cryptographic framing:

```
+-----------------------------------------------------------------------+
|  Chunk 0 (1 MB Plaintext) -> AEAD.Seal()                              |
|  - Nonce: 96 bits [ 64-bit Random Prefix || 31-bit Index 0 || 0 ]     |
|  - Tag: 128 bits (appended to the end of Chunk 0 ciphertext)          |
+-----------------------------------------------------------------------+
|  Chunk 1 (1 MB Plaintext) -> AEAD.Seal()                              |
|  - Nonce: 96 bits [ 64-bit Random Prefix || 31-bit Index 1 || 0 ]     |
|  - Tag: 128 bits (appended to the end of Chunk 1 ciphertext)          |
+-----------------------------------------------------------------------+
|  Chunk N (Final Plaintext Segment) -> AEAD.Seal()                     |
|  - Nonce: 96 bits [ 64-bit Random Prefix || 31-bit Index N || 1 ]     |  <-- Last Flag = 1
|  - Tag: 128 bits (appended to the end of Chunk N ciphertext)          |
+-----------------------------------------------------------------------+
```

The 64-bit random prefix guarantees cross-stream nonce uniqueness; the 31-bit monotone index guarantees
within-stream uniqueness (≤ 2³¹ chunks ⇒ ~2 PB at 1 MB/chunk); the 1-bit last-flag makes the final segment
unforgeable, so a dropped trailing chunk fails its tag (anti-truncation).

---

## 3. Verified Verify-Before-Decrypt Pipeline

A software-enforced, fail-closed state machine. Steps 1–2 are tightly bound: because the signature signs
*over* the root hash, the root is recomputed from the ciphertext leaves **first**, then the signature is
evaluated over it, and the recomputed root is confirmed equal to the signed root — trapping a leaf-swap that
carries a stale-but-valid signature.

```
                  [ INBOUND CIPHERTEXT CHUNK (.tmf) ]
                                   │
                                   ▼
        ┌─────────────────────────────────────────────────────┐
        │ 1. INTEGRITY SCAN: Recompute TMX-256 Root            │
        │    - generated from the stored ciphertext leaves     │
        └──────────────────────────┬──────────────────────────┘
                                   │ Root reconstructed
                                   ▼
        ┌─────────────────────────────────────────────────────┐
        │ 2. AUTHENTICITY GATE: Verify ML-DSA-65 Signature     │
        │    - signature evaluated over the recomputed root    │
        │    - confirm Recomputed == Signed Root Target        │
        └──────────────────────────┬──────────────────────────┘
                                   │ Match (else Halt / Zeroize)
                                   ▼
        ┌─────────────────────────────────────────────────────┐
        │ 3. GOVERNANCE VERIFIER: Evaluate K3 Key-Release      │
        │    - verified via software Strong-Kleene calculus    │
        └──────────────────────────┬──────────────────────────┘
                                   │ Allow (+1)   [0 / -1 ⇒ deny]
                                   ▼
        ┌─────────────────────────────────────────────────────┐
        │ 4. CONFIDENTIALITY ENGINE: Decapsulate KEM Key       │
        │    - Profile 0x02 extracts X25519 + ML-KEM-768       │
        │    - derive K_aead via SHAKE256 (context-bound HKDF) │
        └──────────────────────────┬──────────────────────────┘
                                   │
                                   ▼
        ┌─────────────────────────────────────────────────────┐
        │ 5. EMISSION GATE: Open STREAM Cipher Sequence        │
        │    - sequentially verify chunk tags, then clear text │
        └─────────────────────────────────────────────────────┘
```

### 3.1 Zero-Trust Erasure-Coded Availability

On physical bit-rot or sector degradation, recovery occurs strictly **outside the trust gate** via
content-agnostic **Reed-Solomon erasure coding operating exclusively on ciphertext bytes**. Parity blocks are
computed from the encrypted stream and carry zero plaintext entropy, so they are safe across untrusted,
multi-tenant networks.

The reconstructed chunk is treated as **unverified external input**, barred from decryption or processing
until it is passed **backward to Step 1 (Integrity Scan)**. The verifier recomputes the TMX-256 root over the
repaired ciphertext; if it fails to align perfectly with the ML-DSA-65-signed root from Step 2, the system
triggers an immediate **phase collapse to state `0`**, failing closed and denying access.

```
       [ DEGRADED / CORRUPT STORAGE CELL ]
                       │
                       ▼
   1. Read extant ciphertext + parity segments
                       │
                       ▼
   2. Reed-Solomon Galois-field repair  (encrypted bytes only)
                       │
                       ▼
   3. Forward reconstructed segment to ingress
                       │
                       ▼
   4. RE-VERIFY → Step 1 Integrity Scan: recompute TMX-256 root
        match signed root?  ── no ──▶ phase collapse to 0 / hard freeze
                       │ yes
                       ▼
        admit (then governance gate, then decapsulate)
```

---

## 4. Open Questions (carried forward — non-binding)

1. **Committing AEAD — RESOLVED (2026-06-16).** AES-256-GCM is not key-committing, so the design **binds
   `H(K_aead)` into the AEAD associated data** (committing construction) to prevent key/ciphertext-substitution
   attacks. KDF is **SHAKE256 + domain-separation context** (KMAC256 the FIPS-friendly alternate).
2. **Metadata confidentiality — RESOLVED (2026-06-16): in-network semantic routing is dropped.** Cleartext
   embeddings are reconstructable to ~plaintext (vec2text ~92% on 32-token text), so the Vector/Attribute
   (embedding) sections are **encrypted inside the DEM**, never exposed as a cleartext in-network routing
   layer; fine semantic filtering happens **only at trusted, post-verify endpoints**. Any cleartext routing
   coordinate (TVCID used as AAD) MUST be opaque/non-semantic. See `metadata-confidentiality.md`.
3. **Optical PUF as ML-DSA-65 key custody** — viable hardware root-of-trust at the edge, but ML-modeling
   attacks make it defense-in-depth, not sole custody.
4. **Higher-assurance / fallback profiles** — a future `0x03` (ML-KEM-1024 + ML-DSA-87, NIST level 5) and a
   conservative hash-based signature fallback (SLH-DSA / FIPS 205) for long-lived artifacts.
5. **AAD binding** — confirm the per-section AAD binds `TVCID ‖ modality ‖ crypto_profile ‖ epoch` so a
   ciphertext section cannot be lifted/replanted or decrypted under the wrong context.
6. **Compute-on-encrypted (FHE)** for encrypted-similarity over attribute vectors — digital research track
   only; not a near-term `.tmf` feature.

---

## Cross-references

`quantum-resilient-tri-encryption.md` (the confidentiality design + KEM-DEM rationale) ·
`photonic-sha256-integrity.md` (why the digest stays digital; photonics = QRNG/PUF/LSH outside the gate) ·
Galerina KBs: `galerina-substrate-failure-model.md` (`SPORE-SUBSTRATE-001`), `galerina-quantum-resistance-posture.md`
(keep SHA-256; PQ the signature), `galerina-three-valued-governance.md` (K3 fail-closed proofs),
`galerina-ext-bridge-quantum-design.md` (FFSM #199 — sign `sha256(output)` on the deterministic core).
