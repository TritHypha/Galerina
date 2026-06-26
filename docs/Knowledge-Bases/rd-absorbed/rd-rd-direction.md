<!-- ABSORBED R&D SOURCE — verbatim mirror. Galerina is the main library; the R&D repo is upstream/authoring.
     Source: Galerina-R-AND-D/RD-DIRECTION.md  ·  Pinned: R&D fb68d06 (2026-06-16)
     Integrated Galerina view: galerina-rd-adoption-2026-06-16.md  ·  Catalog: galerina-rd-absorption-catalog.md
     Rule: edit the upstream source then re-vendor; do not fork this copy (feedback-auto-import-rd-docs). -->

> **Absorbed R&D source (verbatim).** This is the archived upstream document. Curated/integrated view: `galerina-rd-adoption-2026-06-16.md`. See `galerina-rd-absorption-catalog.md` for the full ledger. Internal links below point at the upstream R&D tree.

---
# Encryption R&D — direction & charter (owner-set 2026-06-16)

> **Purpose of this R&D:** mature the **engine spec + the crypto spec**; Galerina's own job is the
> *governance gate* around it (U1 / pattern-10 already shipped). Highest leverage = the spec Galerina's
> `#34` consumes, **not** building gated engine code. Companion: [`CROSSOVER-encryption-rnd.md`](CROSSOVER-encryption-rnd.md)
> (merged entry point for both tracks). This file records the owner's ranked priorities and framing directives.

---

## 1. Ranked short-term priorities (owner-set, opinionated)

1. **TASK 2 — ML-DSA-65 + key-custody spec.** *The one that matters most.* Byte-precise, FIPS-204-correct,
   with a structural golden vector. It is the only R&D output that directly unblocks shipping Galerina code:
   **task #34** (ML-DSA-65 over the SHA-256 digest, hybrid with Ed25519). Freeze it correct → #34 becomes a
   safe mechanical port with zero crypto-invention and zero FIPS-204 mistakes.
   **Status: ✅ FROZEN 2026-06-16** — `tmf/spec/signature-custody-v0.md` carries the corrected FIPS-204
   verification (norm-bound + `c̃ == H(μ‖w₁')`, *not* `M·D ≡ S (mod q)`) and a new §2.1 making explicit that
   the construction is generic ("hybrid Ed25519 + ML-DSA-65 over a **32-byte digest**" — `.tmf` digest = TMX
   root, **#34 digest = SHA-256**), with pure-ML-DSA (not HashML-DSA) + a domain-separation context. Structural
   golden vector reproduces byte-for-byte.
2. **Keep the golden-vector conformance oracle airtight.** Completeness + the "anyone can implement this in
   any language and match the bytes" property — that is what makes Galerina adoption *safe*.
   **Status: ✅ confirmed 2026-06-16** — all four generators (`gen_tmx_vectors`, `gen_tmf_container`,
   `gen_nvfp4_block`, `gen_sig_block`) re-run and reproduce their committed `*_vectors.txt` exactly.
3. **(Lower) Firm up the metadata-minimization design.** Verdict 5 (encrypt-the-attribute-vector, filter at
   trusted endpoints) is what a future Galerina governance rule (U2 / `#204`) would enforce; settling it in R&D
   de-risks that rule. **Status: settled** in `tri-encription/research/metadata-confidentiality.md` (adversarially
   verified); ratified into the blueprint + `encryption-architecture.md` §0.

## 2. Explicitly NOT yet (deferred by owner)

- **`.tmf` Rust engine (`libtmf_core`)** — gated on the production go; building it now is premature. *(See §3.1
  — the engine-language preference has also shifted toward Galerina + a host crypto lib, away from Rust.)*
- **Confidentiality build (KEM-DEM impl)** and the **MeshQL / ANN DB layer** — deferred until a real
  requirement, not speculative. (Design + spec only for now.)

> Decision ratified (owner vote = yes): **freeze TASK 2 as the next deliverable, ahead of any engine work.** Done.

---

## 3. Framing directives (captured)

### 3.1 Prefer Galerina over Rust
Rust is **not usable in the main project**, so the engine-language fork (D2) is re-pointed: **prefer Galerina +
a governed host crypto library over a Rust engine.** Crypto itself cannot be pure `.spore` (proven —
`galerina check` rejects even bitwise `^`, `tri-encription/spore/probe-no-bitwise.spore`), so the cryptographic
primitives run as a **vetted host library invoked across the Galerina governance/capability boundary** (the
seam: Galerina governs *whether* it runs; the host lib computes the exact bytes). For `#34` the natural,
no-new-dependency path is Galerina's existing attestation host-call surface — **`@noble/post-quantum`
(`ml_dsa65` + `ed25519`) is already a Galerina dependency**, so no Rust and no new crate are needed.

### 3.2 Two crypto paths (honestly mapped onto crypto-on-core)

The request is two paths: **(A)** fast enough for the runtime hot path; **(B)** much stronger, generation
speed irrelevant. Mapped onto what is *actually* achievable (crypto must be bit-exact on a deterministic
core — verdict 2; there is **no fast analog-photonic cipher**):

- **Path A — fast (runtime / hot path), deterministic-digital:**
  - **Symmetric AEAD on the core with hardware acceleration** — AES-256-GCM via AES-NI measured at
    **1,273 MB/s** on the i9-9900K (34× the pure-JS floor): genuinely fast, the per-message confidentiality
    path. (ChaCha20-Poly1305 where AES-NI is absent.)
  - **The tri-logic K3 governance gate** — `allow/deny/unknown→deny`, `collapse(0)=deny`, single-instruction
    `min/max` trits: the fast *authorization* decision around the crypto (this is the real "tri" speed win).
  - **"Photonic" contribution stays OUTSIDE the trust gate:** non-crypto bulk (ANN/vector search on decrypted,
    re-verified plaintext), plus **QRNG** entropy and an **optical-PUF** hardware root-of-trust. Photonics
    never computes the cipher/hash (it is ~≤10-bit, error-tolerant; crypto needs zero-error).
- **Path B — strong (slow generation OK), cold path:**
  - **Higher-assurance PQ profile `0x03`: ML-KEM-1024 + ML-DSA-87** (NIST level 5) for long-lived
    confidentiality/signatures; **SLH-DSA (FIPS 205)** hash-based as the conservative signature backup.
  - These are once-per-artifact/cold-path ops, so keygen/sign latency is irrelevant — exactly where the
    "much stronger, doesn't need to be fast" requirement lands.
  - **FHE** (compute-on-encrypted) is a separate **digital, research-grade** track (never line-rate; verdict in
    `metadata-confidentiality.md`) — not a near-term feature.

> Honest line: the "fast" path is fast **digital** crypto (AES-NI) + the tri-logic gate; the "strong" path is
> slow **PQ/level-5** crypto on the cold path. Neither runs the cipher on analog photonics.

### 3.3 `.tmf` format requirements
- **History `+1` (append-only timeline):** each `+1` append is its own AEAD-sealed, signed segment whose AAD
  binds the **previous segment's root** (hash-linked chain) → immutable, tamper-evident order. **Forward
  secrecy** via per-epoch key rotation (`rotate every Nd` + a KDF ratchet); **crypto-erasure** (drop a
  segment key) honours right-to-be-forgotten without breaking the chain.
- **Self-healing:** **Reed-Solomon erasure coding over ciphertext, *outside* the trust gate**, then **re-verify
  the reconstructed bytes against the ML-DSA-65-signed TMX root** — mismatch ⇒ `unknown(0) → deny`, fail
  closed. **Never** the source notes' in-cache neighbourhood-convolution (it fabricates unsigned data and is an
  in-gate attacker target). Validated by the bench self-heal test.
- **Lossless encryption:** the cryptographic path is **exact/lossless** — AEAD decrypts to the *exact*
  plaintext bytes; integrity bytes are never lossy. The *only* lossy element is the **opt-in NVFP4 `Vector`
  codec** (a data-representation choice for embeddings/tensors), which is **never used for integrity bytes and
  is opaque to TMX** — so "lossless encryption" holds regardless of payload codec.

### 3.4 `.tmf` in communications (DB connection, API-to-API)
The `.tmf` container doubles as a **wire format** (same byte layout at rest and on the wire — no
serialize/deserialize gap). Encryption work targets this: the **KEM-DEM confidentiality + verify-before-decrypt
gate** apply to **data-in-transit** too (DB connections, API↔API), with **streaming AEAD** for large media and
per-message/per-section keys. The **metadata-minimization verdict applies on the wire**: do not expose
cleartext semantic/embedding layers to in-network routers; filter at trusted endpoints. (This is a sanctioned
place to do encryption R&D once a real requirement lands — currently design + spec only, per §2.)

---

## 4. Cross-cutting (every phase)
Honest-core / aspirational split · crypto + integrity stay on the deterministic core · fail-closed
(`unknown → deny`) · no performance number without a reproducible benchmark + the machine · no invented crypto
(adopt FIPS/NIST primitives) · golden vectors are the cross-language oracle.
