# `.tmf` modalities & codec registry — v0 (rich media + structured data)

**Status:** Draft, buildable. Extends [`tmf-container-v0.md`](tmf-container-v0.md) §4 (the `modality` plane +
codec note) into a full **codec registry** so a `.tmf` section can carry images, audio, video, streamed media,
mathematical equations, chemical structures, JSON and XML — without changing the integrity, authenticity, or
confidentiality layers. Companion to [`tmf-encryption-v0.md`](tmf-encryption-v0.md) (the STREAM mode large
media uses) and [`nvfp4-codec-v0.md`](nvfp4-codec-v0.md) (one tensor codec). Reference generator:
[`_vectors/gen_modality_codecs.py`](_vectors/gen_modality_codecs.py).

> **The one rule (codec-agnostic integrity).** TMX-256 hashes a section's **payload bytes opaquely** — it
> never parses or interprets them. So *every* modality and codec is integrity-protected and signable
> identically, and adding a codec changes **nothing** in the TMX / ML-DSA / KEM-DEM layers. A codec is
> **metadata that says how to interpret bytes**, not a change to how they are protected.

---

## 1. Three honesty points up front
- **`.tmf` wraps codecs; it does not replace them.** A photo stays JPEG/PNG/AVIF *bytes*; a video stays
  H.264/AV1 *bytes*. `.tmf` adds coordinate-bound integrity, authenticity, confidentiality, and (optionally)
  streaming framing **around** those bytes. It is not a new image/video codec.
- **"Lossless" is about the cryptographic path, not the codec.** The AEAD decrypts to the *exact* stored
  bytes and TMX verifies them bit-for-bit, so the `.tmf` path is lossless. If the *encoder* upstream was lossy
  (JPEG, Opus, H.264, NVFP4), that lossiness happened **before** `.tmf` and is out of scope — `.tmf` stores
  and returns whatever encoded bytes it was given, exactly.
- **No in-network semantic interpretation.** Parsing/rendering/validating a payload (decoding a video,
  evaluating an equation, canonicalizing a molecule, querying JSON) happens at **trusted endpoints only** —
  the same metadata-minimization rule as [`tmf-encryption-v0.md`](tmf-encryption-v0.md) §5 (verdict 5). A
  router sees opaque ciphertext + the codec tag, never the decoded content.

---

## 2. `modality` plane (u16) — extends container §4.2
The coarse data plane (what *kind* of thing the bytes are). v0 container defined `0`–`4`; this adds the
media/document/structured planes:

| Val | Modality | Carries |
|---|---|---|
| `0` | Vector | embeddings / tensors (codecs: NVFP4, f32, f16, bf16) |
| `1` | Graph | node/edge structures |
| `2` | Attribute | typed key/value attributes |
| `3` | Blob | opaque bytes (fallback for any codec) |
| `4` | Relation | tabular / relational rows |
| `5` | **Image** | still images / photos |
| `6` | **Audio** | sound |
| `7` | **Video** | moving images (usually with `dem_mode=STREAM`) |
| `8` | **Document** | rendered/markup documents incl. **math equations** and **chemical structures** |
| `9` | **Structured** | machine-readable trees: **JSON, XML**, CBOR, … |

`modality` is bound into the TMX leaf (container §3), so it cannot be relabelled under a valid signed root.

---

## 3. `codec` registry (u16) — the specific format within a modality
v0 container said codec was "application-defined." This pins a **codec discriminator** carried in the v1
section descriptor (alongside the `tmf-encryption-v0.md` §4 crypto descriptor), grouped by range. Unknown
codecs remain *readable and verifiable* (TMX is codec-agnostic); only interpretation needs the codec.

| Range | Group | Codecs (`codec` value → format) |
|---|---|---|
| `0x0000` | raw | `0x0000` opaque bytes |
| `0x01xx` | Image | `0x0101` PNG · `0x0102` JPEG · `0x0103` WebP · `0x0104` AVIF · `0x0105` TIFF · `0x0106` GIF |
| `0x02xx` | Audio | `0x0201` Opus · `0x0202` AAC · `0x0203` FLAC · `0x0204` PCM/WAV · `0x0205` MP3 |
| `0x03xx` | Video | `0x0301` H.264/AVC · `0x0302` H.265/HEVC · `0x0303` AV1 · `0x0304` VP9 · `0x0310` MP4 · `0x0311` Matroska/WebM |
| `0x04xx` | Math | `0x0401` MathML · `0x0402` LaTeX · `0x0403` OMML · `0x0404` AsciiMath |
| `0x05xx` | Chemistry | `0x0501` SMILES · `0x0502` InChI · `0x0503` MOL/SDF (CTfile) · `0x0504` CML · `0x0505` PDB · `0x0506` MOL2 |
| `0x06xx` | Structured | `0x0601` JSON · `0x0602` NDJSON · `0x0603` XML · `0x0604` CBOR · `0x0605` Protobuf · `0x0606` YAML |
| `0x07xx` | Tensor | `0x0701` NVFP4 (see `nvfp4-codec-v0.md`) · `0x0702` f32 · `0x0703` f16 · `0x0704` bf16 |

The `codec` is advisory for the integrity/crypto layers and authoritative for the endpoint that interprets the
bytes. It is bound into the AEAD AAD context (encryption §4) so it cannot be swapped on an encrypted section.

---

## 4. Large media & streaming — reuse, don't reinvent
Audio/video (and any payload over the chunk size) use the **segmented STREAM AEAD** already specified in
[`tmf-encryption-v0.md`](tmf-encryption-v0.md) §6 (`dem_mode=0x02`): fixed chunks (default 1 MB), each sealed
with a position-derived nonce (`prefix8 ‖ BE-u32((index<<1)|last)`). This gives media exactly what it needs:
- **seekable** to chunk *N* (fixed chunk size ⇒ O(1) offset);
- **anti-truncation / anti-reorder / anti-splice** (the 1-bit last-flag + monotone index make a dropped or
  shuffled chunk fail its tag) — important for tamper-evident audio/video;
- **progressive verify-before-render**: each chunk is integrity+AEAD-checked before it is handed to the
  decoder, so a corrupt/forged chunk never reaches the media pipeline.

The codec (`0x02xx`/`0x03xx`) is unchanged by streaming — STREAM frames the *encoded* bytes; the decoder sees
the original elementary stream after the gate.

---

## 5. Math, chemistry, JSON, XML — structured text planes
These are **UTF-8 text codecs**, opaque to TMX, interpreted at trusted endpoints:
- **Math (`modality=8`, `0x04xx`):** MathML (XML-based, renderable), LaTeX, OMML (Office), AsciiMath — a
  "complex equation" is just its markup bytes; validation/rendering is endpoint-side.
- **Chemistry (`modality=8`, `0x05xx`):** a "complex chemical chain" is a line notation or connection table —
  **SMILES**/**InChI** (string), **MOL/SDF**, **CML** (XML), **PDB**, MOL2. Canonicalization (e.g. InChI
  normalization) and substructure search are **endpoint** operations, never in-network (a structure is
  content, and content stays confidential — verdict 5).
- **JSON (`0x0601`) / XML (`0x0603`):** carried as bytes; an endpoint parses. For integrity that must survive
  re-serialization, store the **exact canonical bytes** that were hashed (don't re-emit then re-hash) — TMX
  binds the bytes, not the abstract tree, so a whitespace/key-order change is a (correctly) detected mismatch.

---

## 6. How the layers compose (nothing new below the codec)
```
payload bytes (any modality/codec)
   └─ confidentiality:  KEM-DEM seal  (encryption §2–4; STREAM for large media §4)      → ciphertext
        └─ integrity:   TMX-256 leaf over the CIPHERTEXT bytes (codec-agnostic)         → root
             └─ authenticity: ML-DSA-65 / level-5 {ML-DSA-87, SLH-DSA} over the root     → signature
                  └─ governance: K3 verify-before-decrypt gate (k3-policy.lln)           → release
```
A new codec touches only the top line. This is why the codec registry is a v0 *addition*, not a breaking
change: the container's golden vector, the TMX root construction, the signature block, and the KEM-DEM
pipeline are all unaffected.

---

## 7. Golden vector — the codec-agnostic property (`gen_modality_codecs.py`)
The generator proves the central claim **byte-for-byte**: the TMX leaf over a payload is **independent of the
declared `codec`** (codec is metadata, not hashed content), yet **bound to `kind`/`modality`** (those *are*
in the leaf). So a codec relabel does not change the leaf, but a modality relabel does — exactly the intended
separation. It also prints the modality + codec registries. Stdlib SHAKE256 only.

---

## 8. Sources / prior art (formats referenced, not redefined)
PNG/JPEG/WebP/AVIF/TIFF/GIF; Opus (RFC 6716), AAC, FLAC, WAV, MP3; H.264 (ITU-T H.264), HEVC (H.265), AV1
(AOMedia), VP9, ISO-BMFF/MP4, Matroska/WebM; MathML (W3C), LaTeX, OMML; SMILES (Daylight), InChI (IUPAC),
MOL/SDF & CTfile (BIOVIA), CML, PDB (wwPDB), MOL2; JSON (RFC 8259), NDJSON, XML (W3C), CBOR (RFC 8949),
Protocol Buffers, YAML. `.tmf` carries these as opaque payloads; it neither modifies nor re-specifies them.
