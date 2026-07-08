# The `.spore` Trust-Capsule Format

### A content-addressed, integrity-verified, **quantum-resilient** universal file and communications container

**Defensive-publication note · v0 · 2026-06-23**

---

## ⚠️ Novelty disclaimer — read first

**This is a defensive-publication note, not a flagship or workshop paper, and it makes no claim of novel science or novel cryptography.** Every cryptographic and codec primitive used by `.spore` is **borrowed and standard** (FIPS / NIST / RFC / peer-reviewed): SHAKE256 (FIPS 202), ML-DSA-65 (FIPS 204), ML-KEM (FIPS 203), AES-GCM (NIST SP 800-38D) / AEAD (RFC 5116), Merkle hash trees (Merkle, 1987), and standard media/document codecs (PNG, JPEG, AVIF, Opus, H.264, JSON, XML, …). What `.spore` contributes is **engineering composition and byte-precise specification** — a deterministic, fail-closed wrapping order around bytes the format never interprets. Per the Galerina/TritMesh publishing standard ("no new cryptography and no new science"), `.spore`/TMX-256/KEM-DEM are **pre-graded as engineering composition, not a flagship paper**. This note exists to (a) document the construction precisely and (b) serve as a **timestamped prior-art record** that keeps the composition free.

> This is engineering triage informed by training knowledge, **not** a filed legal prior-art search or a freedom-to-operate opinion. Confirm novelty/clearance with a qualified professional before any external submission.

---

## Abstract

`.spore` ("trust-capsule" file) is a container format that binds an ordered set of payload sections to a single 256-bit cryptographic root via **TMX-256**, a 3-ary Merkle tree built on the FIPS-202 XOF SHAKE256, and (optionally) signs that root with the **quantum-resilient** post-quantum signature **ML-DSA-65** (FIPS 204). Payloads may be confidentiality-sealed with a **KEM-DEM** scheme — a **quantum-resilient** ML-KEM (FIPS 203) key encapsulation plus an AEAD data-encryption mode. The authenticity and confidentiality layers are therefore **quantum-resilient by construction** (NIST PQC standards), with a hybrid Ed25519 + ML-DSA-65 transition form recommended during migration; the integrity hash (SHAKE256, 256-bit) retains a 128-bit security margin against Grover-style quantum search. Crucially, the integrity layer is **codec-agnostic**: TMX-256 hashes a section's bytes opaquely, so `.spore` is **not only a database substrate** — it is a **universal file format and communications container** that carries images, audio, video (with seekable streaming framing), documents (including mathematical and chemical markup), and structured data (JSON/XML/CBOR) under one integrity, authenticity, and confidentiality envelope. This note specifies the construction, its mathematics, its usage, and its security properties, and maps every primitive to its authoritative source.

---

## 1. Introduction — what `.spore` is (and is not)

A `.spore` file is a **trust capsule**: a self-describing container whose entire content collapses to one 256-bit root, so that "are these exactly these bytes, in this order, at these coordinates?" is answerable by a single hash comparison, and "did the right party vouch for them?" is answerable by a single post-quantum signature check.

**`.spore` is three things at once:**

1. **A storage/database substrate** — the original TritMesh use: content-addressed, integrity-verified cells on a logical mesh.
2. **A universal file format** — like an image or document on disk/web, but with built-in tamper-evidence, selective-disclosure proofs, and optional confidentiality. A `.spore` can *be* a photo, an audio clip, a video, a PDF-like document, or a JSON record — wrapped so its integrity and authenticity travel with it.
3. **A communications container** — large payloads (audio/video/bulk data) use a segmented, seekable, anti-truncation streaming mode, so `.spore` can frame a *transmitted* stream the same way it frames a *stored* file. A relay sees opaque ciphertext plus a codec tag; it never sees decoded content.

**What `.spore` is NOT.** It is **not a new image/video/audio codec**: a photo stays JPEG/PNG/AVIF *bytes* and a video stays H.264/AV1 *bytes*; `.spore` adds coordinate-bound integrity, authenticity, and confidentiality **around** those bytes (§6). It is **not** a database engine, query language, or transport protocol. It introduces **no new cryptography** (§"Novelty disclaimer").

> **Positioning — an honest aspiration, not a claim.** Combining *all* of {content-addressed integrity, quantum-resilient post-quantum authenticity, confidentiality, selective-disclosure inclusion proofs, universal media/document/structured modality, and seekable streaming for communications} in **one fail-closed format** is unusual — most real systems assemble these from several *separate* formats and layers stacked by hand. In that sense `.spore` aims to be a "unicorn" format: the rare single capsule that does all of it at once. **Whether it earns that status is for adoption and independent measurement to decide — not this note.** Consistent with the novelty disclaimer above, this document claims only the construction and its stated properties; it does **not** claim `.spore` is the best, fastest, or a uniquely novel format. The engineering value is the *composition discipline* (a deterministic, byte-precise, fail-closed wrapping order over borrowed standards), not an invention.

> **Crypto-on-core boundary (FUNGI-SUBSTRATE-001).** Every cryptographic operation in `.spore` — the SHAKE256 hashing, the ML-DSA signature, the KEM-DEM seal — runs on the **digital/binary** substrate and is **bit-exact and reproducible**. The "ternary" in TMX (the 3-ary tree shape) is a *data-structure modelling choice*, **not** a use of analog/photonic/ternary hardware in the cryptographic path, and carries **no performance claim** (§5.3). This separation is a hard line: analog/probabilistic substrates never carry a cryptographic operation.

---

## 2. The grounded stack

`.spore` composes four independent, standard layers. A change at one layer does not disturb the others — this is what lets the format carry arbitrary media without touching its security core.

```
  payload bytes (any modality/codec — image, audio, video, document, JSON, tensor, …)
     └─ confidentiality :  KEM-DEM seal       (ML-KEM encapsulation + AEAD DEM; STREAM mode for large media)  → ciphertext
          └─ integrity   :  TMX-256 leaf over the (cipher)text bytes, codec-agnostic (§5)                      → 256-bit root
               └─ authenticity : ML-DSA-65 (FIPS 204) signature over the root (sign-the-hash, never replace it)→ signature
                    └─ governance : a fail-closed verify-before-release gate (Galerina `.fungi`)                    → release
```

**Spec-vs-shipped honesty (v0).** The integrity core (TMX-256) and container are **specified with reproducible test vectors and buildable today on commodity hardware**. The ML-DSA-65 signature requires a *vetted* FIPS-204 implementation — a hand-rolled signer must never ship; until a vetted library is wired the signing step is marked **Blocked**, and any placeholder must be explicitly labelled non-cryptographic and rejected outside test profiles. KEM-DEM confidentiality and the custody/threshold features are specified (`tmf-encryption-v0.md`, `signature-custody-v0.md`, `threshold-custody-v0.md`) with parts in progress. This note specifies the format; it does not claim more than the engine ships.

---

## 3. Mathematics

### 3.1 Notation and primitives

| Symbol | Meaning |
|---|---|
| `SHAKE256(M, 32)` | FIPS-202 SHAKE256 of message `M`, squeezed to 32 bytes |
| `LE16/LE32/LE64(x)` | unsigned little-endian integer, 2 / 4 / 8 bytes |
| `LP(b)` | length-prefixed bytes `= LE32(len(b)) ∥ b` |
| `∥` | byte concatenation |
| `H = 32`, `ARITY = 3` | digest length (256-bit); tree fan-in |

Domain-separation tags (ASCII, length-prefixed): `TAG_ABSENT = "TMX-ABSENT-v0"`, `TAG_LEAF = "TMX-LEAF-v0"`, `TAG_NODE = "TMX-NODE-v0"`, `TAG_ROOT = "TMX-ROOT-v0"`.

**Injective encoding.** Every variable-length field is wrapped in `LP(·)`. Concatenating variable-length fields without a per-field length prefix is a classic domain-separation hazard (two different field splits can yield the same byte string); `LP(·)` everywhere makes the encoding **injective**, so distinct inputs never collide on encoding alone. *(This corrected a real bug in the source notes, which length-prefixed only some fields.)*

### 3.2 Leaf — coordinate / modality / kind binding

```
leaf = SHAKE256( LP(TAG_LEAF) ∥ LE16(kind) ∥ LE16(modality) ∥ LP(coord) ∥ LP(payload), 32 )
```

The section's `kind`, `modality`, and `coord` (an opaque coordinate identifier; TMX never interprets it) are **inside** the hashed input. A valid leaf therefore cannot be lifted from one `(kind, modality, coord)` and replanted at another — that changes the leaf and breaks the root. This is the textbook **position-binding / domain-separation** property. *(v0 binds `kind` in addition to `modality`/`coord`, so a section cannot be silently relabelled `data → index` under a valid tree.)*

### 3.3 Internal node (3-ary) and the ABSENT sentinel

```
node   = SHAKE256( LP(TAG_NODE) ∥ child0 ∥ child1 ∥ child2, 32 )
ABSENT = SHAKE256( LP(TAG_ABSENT), 32 )
```

Children are fixed 32-byte digests, so no inter-child length prefix is needed. Short final groups are padded with the explicit, public, "nothing-up-my-sleeve" **ABSENT** digest so arity is always exactly 3 and the tree shape is deterministic for any leaf count. *(This replaced a source-note error that conflated the **data** trit value `0` with a **hash-tree padding node** — two different things. ABSENT being a fixed, non-secret, domain-tagged constant is safe: it is syntactically distinct from any leaf or node input.)*

**Why 3-ary rather than binary.** It matches the ternary theme and yields shorter trees (`log₃ n` vs `log₂ n`). On a single CPU core a 3-ary XOF tree is **not faster** than a serial hash — it does strictly more work. The 3-ary shape is a **modelling** choice, **not** a speed claim, and depends on no special hardware.

### 3.4 Tree shape (deterministic for any n ≥ 1)

Given ordered leaf digests `L₀ … L_{n-1}` (section order = leaf order): reduce in groups of 3 (padding the last group with `ABSENT`), each triple → one `node` (`⌈n/3⌉` nodes); repeat until one node remains (`top_node`). **Always reduce at least once** — even a single leaf becomes `NODE(L₀, ABSENT, ABSENT)`, so `top_node` is always a NODE-domain digest and a raw leaf can never be reinterpreted as an interior node (a second-preimage-hygiene point). Section order is thus bound into the root.

### 3.5 Root — binds the header, never itself

```
root = SHAKE256( LP(TAG_ROOT) ∥ LP(header_core) ∥ top_node, 32 )
```

where `header_core = file[0 .. 24)` — the container bytes **before** the stored `integrity_root` field. The root binds the fixed header (profile/version/flags/section-count), the leaf order, and every leaf's `(kind, modality, coord, payload)`; it **excludes** the `integrity_root` and signature block, so it never binds itself. *(This corrected a load-bearing circularity bug in the source: earlier drafts hashed the whole header into the root while also storing the root inside that header.)* The root is a **logical** content fingerprint: it deliberately does not bind physical byte offsets, so a file can be re-serialized/compacted without changing its root; layout tampering is still caught at read time because a moved payload makes a recomputed leaf mismatch the signed leaf hash.

### 3.6 Signing the root — ML-DSA-65 (FIPS 204)

```
signature = ML-DSA-65.Sign(sk, root)            // input IS the 32-byte root
ok        = ML-DSA-65.Verify(pk, root, signature)
```

Hash and signature are **distinct** and combined in the NIST-recommended order — **sign over the hash; never replace the hash with a signature.** An *unsigned* `.spore` detects accidental corruption and supports inclusion proofs but gives no protection against an adversary who rewrites the whole file (they recompute a consistent root). A *signed* `.spore` gives **post-quantum authenticity**: the trust chain is `signature → root → top_node → … → leaf_hash(i) → recompute from (kind, modality, coord, payload)`; break any link and verification fails closed. A **hybrid Ed25519 + ML-DSA-65** dual signature is the recommended transition form during PQ migration.

### 3.7 Confidentiality — KEM-DEM

Confidentiality (optional) uses a standard **KEM-DEM** construction: a post-quantum KEM (ML-KEM, FIPS 203) encapsulates a fresh symmetric key, and a **DEM** (an AEAD — AES-GCM per NIST SP 800-38D, under the RFC 5116 AEAD interface) seals the payload. TMX-256 hashes the **ciphertext** bytes, so integrity and authenticity are computed over what is actually stored/transmitted, and the codec tag is bound into the AEAD associated data so it cannot be swapped on an encrypted section. Large media use the **segmented STREAM mode** (§6).

### 3.8 Inclusion (Merkle) proofs

To prove section `i` is in a signed file without shipping the whole file, the verifier receives `header_core`, `leaf_hash_i` (or the data to recompute it), and the sibling digests along the path from leaf `i` to the root (2 siblings per level for a 3-ary tree). It recomputes `top_node`, then `root`, then checks the ML-DSA-65 signature. This is a standard Merkle inclusion proof (cf. RFC 6962 for the certificate-transparency formulation) and enables **selective disclosure** and **streaming verification**.

---

## 4. Modalities and codecs — why `.spore` is a *universal* file and comms format

Because TMX-256 hashes payload bytes **opaquely**, every modality and codec is integrity-protected and signable *identically*, and adding a codec changes **nothing** in the TMX / ML-DSA / KEM-DEM layers. The `modality` plane (u16, bound into the leaf) and a `codec` discriminator (u16, bound into the AEAD context) say *how to interpret* bytes — not *how they are protected*.

| `modality` | Carries | Example codecs (registry) |
|---|---|---|
| 5 Image | still images / photos | PNG, JPEG, WebP, AVIF, TIFF, GIF |
| 6 Audio | sound | Opus (RFC 6716), AAC, FLAC, PCM/WAV, MP3 |
| 7 Video | moving images (usually streamed) | H.264 (ITU-T H.264), HEVC/H.265, AV1, VP9, MP4/ISO-BMFF, Matroska/WebM |
| 8 Document | rendered/markup docs incl. **math** & **chemistry** | MathML (W3C), LaTeX, OMML · SMILES, InChI (IUPAC), MOL/SDF, CML, PDB |
| 9 Structured | machine-readable trees | JSON (RFC 8259), NDJSON, XML (W3C), CBOR (RFC 8949), Protobuf, YAML |
| 0,3,7 Tensor/Blob | embeddings / opaque bytes | NVFP4, f32/f16/bf16, raw |

Three honesty points govern this: **(a)** `.spore` *wraps* codecs, it does not replace them — a photo stays JPEG bytes; **(b)** "lossless" refers to the cryptographic path only (the AEAD decrypts to the exact stored bytes and TMX verifies them bit-for-bit) — upstream encoder lossiness (JPEG, Opus) happened *before* `.spore` and is out of scope; **(c)** parsing/rendering/validating a payload (decoding a video, evaluating an equation, querying JSON) happens at **trusted endpoints only** — a relay sees opaque ciphertext + a codec tag, never decoded content (metadata minimisation).

**Communications / streaming.** Audio, video, and any payload above the chunk size use a **segmented STREAM AEAD** (fixed chunks, default 1 MB; each sealed with a position-derived nonce `prefix8 ∥ BE-u32((index<<1)|last)`). This gives transmitted media exactly what it needs: **seekable** to chunk *N* (O(1) offset from the fixed chunk size); **anti-truncation / anti-reorder / anti-splice** (the 1-bit last-flag + monotone index make a dropped or shuffled chunk fail its tag); and **progressive verify-before-render** (each chunk is integrity- and AEAD-checked before the decoder sees it, so a forged chunk never reaches the media pipeline). The codec is unchanged by streaming — STREAM frames the *encoded* bytes.

---

## 5. Usage

**Producing a `.spore`.** (1) Encode each payload with its native codec (JPEG, Opus, JSON, …). (2) Optionally KEM-DEM-seal each section. (3) Compute each leaf (§3.2) over the stored (cipher)text bytes with its `(kind, modality, coord)`. (4) Build the 3-ary tree (§3.4) → `top_node` → `root` (§3.5). (5) Optionally sign the root with ML-DSA-65 (§3.6). (6) Write the container: header (`header_core` + `integrity_root`), section table (one 56-byte descriptor per section, carrying `kind/modality/coord_len/blob_off/blob_len/leaf_hash`), payload region, and signature block.

**Verifying a `.spore` (fail-closed reader).**

```
1. Check MAGIC (0x89 'T' 'M' 'F' 0x0D 0x0A 0x1A 0x0A — a PNG-style guard that detects CRLF/text-mode mangling); else BadMagic.
2. Check version_major supported; else UnsupportedVersion.
3. For each section i: recompute leaf(kind_i, modality_i, coord_i, payload_i); if ≠ stored leaf_hash_i → IntegrityError.
4. Recompute top_node and root' = SHAKE256(LP(TAG_ROOT) ∥ LP(file[0..24)) ∥ top_node); if root' ≠ integrity_root → IntegrityError.
5. If flags.signed and not ML-DSA-65.Verify(pk, integrity_root, signature) → AuthError.
6. Accept.
```

Every mismatch is a **hard, fail-closed error**; there is **no self-healing in the trust path**. (Availability-oriented repair, if any, is for non-trust data only and must re-verify against the signed root or be rejected.) **Web/comms usage** is the same pipeline with the STREAM mode (§4): a browser or relay verifies each chunk before rendering, and a signed `.spore` proves both integrity and origin without trusting the transport.

---

## 6. Security properties and threat model

| Property | Provided by | Assumption |
|---|---|---|
| **Integrity / tamper-evidence** | TMX-256 root over all leaves | SHAKE256 collision/second-preimage resistance (256-bit) |
| **Position binding** | `(kind, modality, coord)` inside each leaf; order inside the tree | injective `LP(·)` encoding |
| **Authenticity (origin)** | ML-DSA-65 over the root | a vetted FIPS-204 implementation + sound key custody |
| **Post-quantum posture** | ML-DSA-65 signatures + ML-KEM key encapsulation | lattice assumptions per FIPS 203/204; hybrid with Ed25519 during migration |
| **Confidentiality** | KEM-DEM (ML-KEM + AEAD); codec bound in AAD | AEAD security (SP 800-38D); endpoint-only decryption |
| **Selective disclosure** | Merkle inclusion proofs (§3.8) | same hash assumption |
| **Anti-truncation / reorder / splice (streams)** | position-derived nonce + last-flag + monotone index | AEAD nonce-uniqueness |

**Honest limits.** An *unsigned* `.spore` does not resist a whole-file rewrite. The root does not bind physical byte layout (by design). Endpoint security (key custody, decoder hardening) is out of the format's scope. The signing layer is **Blocked** until a vetted FIPS-204 library is wired; do not infer shipped PQ authenticity from this spec alone.

---

## 7. Reproducibility

TMX-256-SHAKE v0 ships **golden test vectors** generated with only Python's standard-library `hashlib.shake_256` (FIPS 202); any conforming implementation in any language must match them (e.g. `ABSENT = 1758f20e…d563`; a 2-section worked example with `integrity_root = 43386e64…5212`; a tamper case where flipping `modality 0→1` changes the root and fails verification). Reproduce with the vendored generator (`spec/_vectors/gen_tmx_vectors.py`); the inclusion-proof and modality-codec generators reconstruct the same root. The full byte-precise spec lives in `packages-galerina/galerina-ext-tmf/spec/` (`tmx-256-construction-v0.md`, `tmf-container-v0.md`, `tmf-encryption-v0.md`, `tmf-modalities-v0.md`, `inclusion-proof-v0.md`, custody specs).

---

## 8. Prior art `.spore` composes (cited, and disclaimed as the basis — no novelty claimed over these)

- **Merkle, R. C.** "A Digital Signature Based on a Conventional Encryption Function." *CRYPTO '87*, LNCS 293, 1988 — hash trees / inclusion proofs.
- **NIST FIPS 202**, *SHA-3 Standard: Permutation-Based Hash and Extendable-Output Functions* (SHAKE256). https://csrc.nist.gov/pubs/fips/202/final
- **NIST SP 800-185**, *cSHAKE, KMAC, TupleHash, ParallelHash*. https://nvlpubs.nist.gov/nistpubs/specialpublications/nist.sp.800-185.pdf
- **NIST FIPS 203**, *Module-Lattice-Based Key-Encapsulation Mechanism Standard* (ML-KEM). https://csrc.nist.gov/pubs/fips/203/final
- **NIST FIPS 204**, *Module-Lattice-Based Digital Signature Standard* (ML-DSA). https://csrc.nist.gov/pubs/fips/204/final
- **NIST SP 800-38D**, *Galois/Counter Mode (GCM) and GMAC*. https://csrc.nist.gov/pubs/sp/800/38/d/final
- **RFC 5116**, *An Interface and Algorithms for Authenticated Encryption* (AEAD). https://www.rfc-editor.org/rfc/rfc5116
- **RFC 6962**, *Certificate Transparency* — Merkle inclusion-proof formulation. https://www.rfc-editor.org/rfc/rfc6962
- **RFC 9861**, *KangarooTwelve and TurboSHAKE* (reserved non-FIPS speed profile only). https://www.rfc-editor.org/rfc/rfc9861.html
- Media/document/structured codecs carried as opaque payloads, neither modified nor re-specified: **RFC 6716** (Opus), **ITU-T H.264** / H.265, **AOMedia AV1**, ISO-BMFF/MP4, Matroska/WebM; **RFC 8259** (JSON), **RFC 8949** (CBOR), **W3C** XML & MathML; **IUPAC InChI**, Daylight SMILES, BIOVIA CTfile/MOL.
- Kleene three-valued logic (Kleene, 1938) underlies the Galerina K3 verify-before-release governance gate (out of scope here; cited for completeness).

---

## 9. Limitations and explicitly-out-of-scope

No `ntt_mul`, no "O(1) single clock cycle," no systolic/photonic path, no NVFP4 hard-coding in the integrity layer, no "signature = address," no hash replacement, and no in-gate self-healing — TMX-256 is plain SHAKE256 on a CPU. Parallelising the tree across hardware lanes is a *future, benchmarked* optimisation, not part of the format, and must never be implied to be faster without a measurement on named hardware. The 3-ary shape carries no performance claim.

---

## 10. Declarations (research-integrity compliance)

- **Type:** Defensive-publication note / timestamped prior-art record. **Not** a flagship/workshop paper; no novelty claimed (see disclaimer).
- **Authorship & AI assistance:** drafted with AI assistance (Claude) under human direction, grounded line-by-line in the vendored `.spore` v0 specification; all cryptographic claims trace to the cited FIPS/RFC/peer-reviewed sources.
- **Funding:** none. **Competing interests:** none declared.
- **Data / artifact availability:** the byte-precise specification, reference generators, and golden vectors are in `packages-galerina/galerina-ext-tmf/spec/`; results reproduce with stdlib SHAKE256.
- **Licence:** Apache-2.0 (consistent with the project's defensive-publication + patent-grant strategy).
- **Standards alignment:** see `docs/scientific-papers/README.md` for the UK (UKRI / Concordat to Support Research Integrity), US (OSTP 2022 public-access; NSF reproducibility), and EU (ALLEA European Code of Conduct; Horizon Europe open science; FAIR) checklist this note follows.

---

*Companion: the three defensive-publication notes in `Galerina-Patens/` (No-Coercion K3 composition; prove-own-maths + measured negatives; crypto-on-core rejected paths). Index and publishing standard: `docs/scientific-papers/README.md`.*
