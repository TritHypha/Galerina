<!-- ABSORBED R&D SOURCE — verbatim mirror. Galerina is the main library; the R&D repo is upstream/authoring.
     Source: Galerina-R-AND-D/ENCRYPTION-RND-FULL-BRIEF.md  ·  Pinned: R&D fb68d06 (2026-06-16)
     Integrated Galerina view: galerina-tmf-engine.md  ·  Catalog: galerina-rd-absorption-catalog.md
     Rule: edit the upstream source then re-vendor; do not fork this copy (feedback-auto-import-rd-docs). -->

> **Absorbed R&D source (verbatim).** This is the archived upstream document. Curated/integrated view: `galerina-tmf-engine.md`. See `galerina-rd-absorption-catalog.md` for the full ledger. Internal links below point at the upstream R&D tree.

---
# TritMesh `.tmf` Encryption R&D — Full Brief (resume-from-cold)

> **What this is.** A single, self-contained explanation of the *entire* `.tmf` encryption / integrity /
> authenticity R&D effort — written so that after a context `/clear` you (or a fresh session) can rebuild the
> whole picture from this one file, then dive into the byte-exact specs only when needed.
> **Date:** 2026-06-16. **Author posture (binding):** grounded, cited, adversarially verified; honest-core vs
> aspirational kept strictly separate; **no performance number without a reproducible benchmark + the machine
> it ran on**; **no invented crypto** (FIPS/NIST/RFC primitives only); fail-closed (`unknown → deny`).
>
> **How it relates to the other top-level docs** (this file does not replace them — it explains them):
> - [`CROSSOVER-encryption-rnd.md`](CROSSOVER-encryption-rnd.md) — the terse **merged index/reconciliation** of both tracks.
> - [`RD-DIRECTION.md`](RD-DIRECTION.md) — the **owner's ranked priorities + framing directives** (the charter).
> - This file — the **full narrative**: what each piece is, why, what's proven, what's open, and the 3 Galerina gaps in full.

---

## 0. Orientation — the 60-second version

We are designing a **quantum-resilient, zero-trust** security layer for the `.tmf` (TritMesh Format) data
fabric that runs on the (photonic) **Galerina** substrate. The work splits into four cryptographic jobs —
**integrity, authenticity, confidentiality, availability** — plus a **three-valued governance gate** that
decides *whether* any key is released. Everything cryptographic runs **bit-exact on a deterministic digital
core**; photonics and tri-logic have real but *bounded* roles **around** the crypto, never inside it.

State as of this writing:
- **Integrity (TMX-256)** — specced, byte-exact, golden-vectored. **Ship-ready.**
- **Authenticity (ML-DSA-65 + Ed25519 hybrid + custody)** — spec **FROZEN** (this is **TASK 2**, which directly
  unblocks Galerina **task #34**); real signing is *Blocked* only on wiring a vetted library.
- **Confidentiality (KEM-DEM)** — now a **byte-precise, oracle-backed spec** (`tmf-encryption-v0.md`), promoted
  this session from a design sketch; real KEM/AEAD bytes await a vetted lib.
- **Availability (Reed-Solomon erasure)** — designed + benched; outside the trust gate, re-verified.
- **Governance (K3 tri-logic gate)** — proven fail-closed; cloned in real `.spore`, runs on WASM.

Two independent derivations (a byte-precise spec track and a measured-benchmark + runnable-`.spore` track) reached
the **same** security core — the strongest validation available here.

---

## 1. The mission, and the source material

The driving question: *given the Galerina governance lessons, what can encryption actually look like on a
photonic/ternary substrate for `.tmf`, and is the ecosystem's own design honest?*

The work began from brainstorm notes (`notes/1.md · 2.md · 3.md`, byte-identical across both track folders).
Those notes mixed real ideas with aspirational/impossible claims. A large part of the value here was **triage**:
keeping what is real and standards-grounded, and explicitly rejecting what is not (see §8, the honesty ledger).

---

## 2. The two tracks and how they merged

| Track | Folder | Emphasis | State |
|---|---|---|---|
| **`.tmf` spec track** | `tmf\` | Byte-precise **format** + **integrity/authenticity** + reference vectors | spec-complete (real signing Blocked on a vetted lib) |
| **tri-encryption track** | `tri-encription\` | **Confidentiality** design + **measured benchmark** + **runnable `.spore`** + threat literature | done; 11/11 tests + `galerina check` clean |

Both started from the same notes and corrected them the same way. They are **complementary, not contradictory**:
the spec track produced the byte-exact container + signature/custody that the confidentiality track *refers to*;
the confidentiality track produced the encryption layer the spec track *deferred*, plus a measured benchmark and
a runnable governance clone. They are now under one owner; the canonical index is `CROSSOVER-encryption-rnd.md`,
and as of this session the confidentiality design has been **promoted into the spec track** as a byte-precise
spec (`tmf/spec/tmf-encryption-v0.md`), so both tracks now share one oracle-backed format.

Adjacent R&D (referenced, not merged): `FFSM\` (governed `ffsim` quantum-sim bridge, task #199) and
`photonic-tri-governance\` (the three-valued K3 governance the `.spore` clone exercises).

---

## 3. The one principle everything rests on: crypto-on-core (`SPORE-SUBSTRATE-001`)

**Cryptography and integrity must run bit-exact on a deterministic digital core.** Analog photonics is
~≤10-bit and error-tolerant; hashing/keying/signing need zero-error bit-exactness, so the avalanche/precision
walls make a photonic cipher or hash impossible-as-a-trust-primitive. Photonics keeps **real but bounded**
roles strictly *outside* the trust gate:
- **QRNG** — quantum entropy for key generation.
- **Optical-PUF** — a hardware device root-of-trust (defense-in-depth for key custody; ML-modeling attacks mean
  it is not sole custody).
- **Optical-LSH / photonic ANN** — non-trust addressing / bulk vector search on *already-decrypted, re-verified*
  plaintext (the only place a photonic *performance* claim could ever be earned, and only behind a benchmark).

This was independently re-derived from both the photonic-hashing literature and the lattice/encryption
literature — physics and real systems agree. One KB line that contradicted it
(`galerina-hardware-future-substrates.md:63`, "Encryption → Photonic matrix operations") was found and **already
corrected** to "Always CPU (deterministic core)."

---

## 4. Consolidated findings (the verdicts, explained)

The five core verdicts (tri-encryption numbering) / eleven consolidated findings (crossover F1–F11):

1. **Confidentiality is genuinely missing.** Galerina/`.tmf` *sign + integrity-check* but do **not** encrypt. The
   fix is the standards-only **KEM-DEM / HPKE** stack (NIST SP 800-227, RFC 9180): **ML-KEM-768** (NIST level-3,
   matching ML-DSA-65), hybrid **X25519 + ML-KEM-768** during the PQC transition → **SHAKE256 KDF** →
   **AES-256-GCM / streaming AEAD**, layered **under** the TMX-256 + ML-DSA-65 gate, **verify-before-decrypt**,
   fail-closed. Quantum risk is correctly scoped to **harvest-now-decrypt-later** → PQ KEM from day one.

2. **No "photonic SHA-256" — and there shouldn't be.** Analog optical hashing is impossible (precision wall vs
   avalanche); digital-optical is exotic with no advantage; "optical hashes"/PUFs are physical/approximate, some
   provably learnable; the real artifacts (LightHash/HeavyHash) keep Keccak digital and only offload the linear
   matmul. **SHA-256 is already Grover-acceptable**, so a photonic hash buys nothing. The digest stays digital;
   photonics = QRNG/PUF/LSH outside the hash, re-verified.

3. **Tri-logic belongs in the key-release *gate*, not the cipher.** Galerina's strong-Kleene **K3** calculus is
   *proven* fail-closed (`authorize(v) ⇔ v=+1`; `collapse(0)=deny`; No-Coercion theorem). It decides *whether* a
   key releases. The only honest "trit in the crypto" is that **NTRU/ML-KEM** polynomials are already
   balanced-ternary/small-signed — but computed **exactly and digitally**. An analog-trit cipher would be
   unvetted, crypto-on-core-violating "invented crypto" — **rejected**.

4. **"Self-healing" = Reed-Solomon erasure coding on ciphertext, *outside* the gate + re-verify.** The notes'
   in-cache neighbourhood-convolution self-heal **fabricates unsigned data**, can't apply to ciphertext, and is
   an in-gate attacker target. Replaced by RS erasure on encrypted bytes (parity carries zero plaintext
   entropy), with **mandatory re-verification of the recovered bytes against the ML-DSA-65-signed TMX root** —
   mismatch ⇒ verdict `0` ⇒ fail closed. Validated by the bench self-heal test (recover → re-verify →
   forged-repair-fails-closed).

5. **Cleartext semantic embeddings on the wire ≈ plaintext.** vec2text recovers ~92% of short text exactly
   ("sharing embeddings ≈ sharing the documents"); every encrypted-search alternative (SSE/OPE/encrypted-ANN)
   leaks and isn't line-rate; FHE/FE/PIR are orders too slow *and* invert zero-trust. So **no leak-free
   in-network semantic routing exists.** Answer: **metadata minimization** — encrypt the attribute/embedding
   vector inside the payload, expose only opaque integrity/authenticity metadata, and **filter at trusted
   endpoints only**. This **kills the notes' "firewalls filter on meaning in-network" headline feature**, by
   design.

Additional consolidated findings: ML-DSA-65 signs **over the root** (hybrid with Ed25519, AND verification);
the **NVFP4 `Vector` codec is real** (9-byte block = 16×E2M1 + 1×E4M3) but opt-in, lossy → never integrity
bytes, opaque to TMX; and the full honesty ledger of rejected claims (§8).

---

## 5. The architecture — the four jobs + the governance gate

> **Golden rule:** *integrity answers "are these the exact bytes?", authenticity "did the right key-holder vouch?",
> confidentiality "can only the intended party read?"* — three distinct jobs, never blurred, combined in the
> NIST-recommended order, all under a tri-logic gate that decides *whether* the key releases at all.

```
INTEGRITY      TMX-256 = 3-ary SHAKE256 tree XOF over coordinate-bound leaves        (fail-closed)
AUTHENTICITY   ML-DSA-65 (FIPS 204) signs the root — hybrid with Ed25519 in transition (AND verify)
CONFIDENTIALITY ML-KEM-768 (FIPS 203) + SHAKE256 KDF + AAD-committing AEAD registry   (KEM-DEM, v1)
AVAILABILITY   Reed-Solomon erasure on ciphertext, OUTSIDE the gate, re-verify vs signed root
GOVERNANCE     K3 three-valued verdict: allow(+1)/deny(-1)/unknown(0); unknown → deny  (proven)
HARD LINE      crypto + integrity stay on a deterministic core; photonics = bulk math / entropy / PUF only
```

### 5.1 Integrity — TMX-256 (`tmx-256-construction-v0.md`) — SHIP
A 3-ary (ARITY=3) tree of **SHAKE256** XOF digests over **coordinate-bound** leaves. Each leaf =
`SHAKE256(LP("TMX-LEAF-v0") ‖ kind ‖ modality ‖ LP(coord) ‖ LP(payload))`; internal node =
`SHAKE256(LP("TMX-NODE-v0") ‖ c0 ‖ c1 ‖ c2)` (missing children = a fixed `ABSENT` digest); root =
`SHAKE256(LP("TMX-ROOT-v0") ‖ LP(header_core) ‖ top_node)`. The root **binds the header and every leaf and
section order, but never itself**. `LP(x) = u32le(len(x)) ‖ x`. Published golden root:
`43386e644c7b53aa0900cda21c15acd15f30b3fdf997950e39e7dd3dbc685212`. Any change to any byte/coordinate/order
changes the root.

### 5.2 The container — `tmf-container-v0.md`
The on-disk **and** on-wire byte layout (same bytes at rest and in transit — no serialize/deserialize gap).
56-byte header: `MAGIC` (`89 'T' 'M' 'F' 0D 0A 1A 0A`, PNG-style guard), `version_major/minor` u16,
`tmx_profile` u16 (0=SHAKE256 default), `flags` u16 (bit0=signed), `section_count` u64, then the 32-byte
`integrity_root`. `header_core` = bytes[0:24) (everything but the root) — so flags/profile/count can't be
swapped under a valid signed root. Then a section table (56-byte entries: kind, modality, coord_len, blob
off/len, leaf_hash), the payload region, and the optional signature block. **Fail-closed reader** with
mandatory bounds checks *before* any hashing. Golden container: 2 sections, 203 bytes, root equals the TMX
golden root (the two specs are provably consistent).

### 5.3 Authenticity — `signature-custody-v0.md` — **TASK 2, FROZEN, #34-ready**
This is the **owner's #1 priority** because it directly unblocks shipping Galerina code (**task #34**).

- **What is signed:** the **32-byte digest**, signed *over* — never re-hashing the file, never substituting a
  signature for a hash or an address. The block is **generic**: `.tmf` signs the **TMX root**; **#34** signs a
  **SHA-256** manifest digest — *same construction*, only the digest function differs.
- **The hybrid:** default `sig_count=2`, algs `{Ed25519, ML-DSA-65}`, verification = **logical AND** (you stay
  authentic if *either* primitive holds — Ed25519 covers a hypothetical ML-DSA flaw today, ML-DSA covers the
  quantum future). `flags.signed` + the algs are bound under the signed root, so the PQ half can't be silently
  dropped (no downgrade).
- **FIPS-204 done correctly (the easy-to-get-wrong parts):** use **pure ML-DSA** (`ML-DSA.Sign(sk, M, ctx)` with
  `M` = the 32-byte digest) — **not** HashML-DSA (the pre-hash variant is for large messages; here the message
  *is* a digest). Pass a **domain-separation context** `ctx` (e.g. `"tmf-root-v0"`) so one key can't be
  cross-protocol-confused between a TMX root and a SHA-256 manifest digest. Verification is the **two-check**
  form: norm bound `‖z‖∞ < γ₁ − β` **and** challenge-hash match `c̃ == H(μ ‖ w₁')` — **not** the explainer's
  bogus `M·D_root ≡ S (mod q)` single congruence (that was corrected).
- **Sizes (FIPS 204, ML-DSA-65):** pubkey 1952 B, signature 3309 B, secret key 4032 B. (Ed25519: 32 B / 64 B.)
- **Custody:** signing keys live in an **HSM/KMS** (never in a repo/`.tmf`/source); reuse the existing
  `BridgeManifest`/`BridgeAttestation` idiom; `key_id` like `tmf-key-YYYY-MM`; rotation with an overlap window;
  **revocation ⇒ `AuthError` even if the signature is cryptographically valid** (the one place a valid signature
  is still refused — intentional, fail-closed). Public keys resolve via the **Trust Capsule / out-of-band PKI**,
  never trusted from the file.
- **Status:** spec frozen; real signing is **Blocked only on wiring a vetted FIPS-204/Ed25519 library** — and
  the natural path needs **no Rust and no new crate**: `@noble/post-quantum` (`ml_dsa65` + `ed25519`) is
  *already* a Galerina dependency, invoked across the Galerina governance/capability boundary. Until wired, readers
  **reject every signed file** (never a silent downgrade); the golden vector is **structural** (placeholder
  keys of the correct sizes, never shipped as real signatures).

### 5.4 Inclusion proof — `inclusion-proof-v0.md` (Phase 1c)
A byte-precise TMX-256 **Merkle-path** wire format + verifier: a single section can be proven bound under the
signed root **without shipping the whole file** (selective disclosure / streaming verification). 133-byte
proofs reconstruct the published root; tamper / wrong-leaf fail closed.

### 5.5 Confidentiality — `tmf-encryption-v0.md` (NEW this session; the v1 layer)
Promoted from the `SPORE-AMD-024` blueprint into the byte-precise, oracle-backed spec track. **Layered *under* the
integrity+authenticity gate** — the integrity root is recomputed from the **ciphertext** leaves, the signature
is verified over it, the K3 verdict must be `ALLOW(+1)`, and only **then** does any key decapsulate. Key design
decisions, all matched byte-for-byte to the verified `@noble` bench:

- **Three orthogonal selector bytes** (fixing the blueprint sketch, which overloaded `0x01`/`0x02` across all
  three axes):
  - `kem_profile`: `0x01` ML-KEM-768 standalone (1088-B ct) · **`0x02` hybrid X25519+ML-KEM-768 (default, 1120-B
    ct = 1088 ML-KEM ‖ 32 X25519, X-Wing order)** · `0x03` reserved (ML-KEM-1024, level 5).
  - `aead_suite`: **`0x01` AES-256-GCM (default — 256-bit Grover margin, AES-NI, suite-consistent with the
    level-3 KEM/sig)** · `0x02` Ascon-AEAD128 (SP 800-232, constrained/embedded) · `0x03` ChaCha20-Poly1305 (RFC
    8439, no-AES-NI alt) · `0x04` reserved (XChaCha20-Poly1305, 24-B nonce — distinct primitive, not v0).
  - `dem_mode`: `0x01` single-shot · `0x02` segmented STREAM (large media).
- **DEM key schedule = SHAKE256** (suite-consistent — the whole stack is Keccak: TMX-256, ML-KEM, ML-DSA, the
  hybrid combiner): `K_aead = SHAKE256(LP("tmf-dem-kdf-v0") ‖ LP(shared_secret) ‖ LP(aead_context))[:32]`.
- **AAD-committing AEAD:** `key_commit = SHAKE256(LP("tmf-dem-commit-v0") ‖ LP(K_aead))[:32]`; the AEAD AAD =
  `aead_context ‖ key_commit`. This **binds the ciphertext to `H(K_aead)`** (substitution-hardening, Albertini
  et al. 2022) — **honestly scoped**: it is *not* a full CMT-1 key-commitment proof for GCM (a fully-committing
  profile is a future option).
- **36-byte AAD context** (resolves the open AAD-binding question Q5): `section_id` u64 ‖ `coord` 16B ‖ `modality`
  u16 ‖ `kem_profile`/`aead_suite`/`dem_mode`/`conf_flags` (4×u8) ‖ `epoch` u32 ‖ reserved u16. Binds
  TVCID‖modality‖crypto-profile‖epoch into every tag, so a section can't be lifted/replanted or opened under the
  wrong context. The context is **reconstructed** from section metadata, not stored redundantly.
- **Segmented STREAM nonce:** `prefix8 (64-bit random) ‖ BE-u32((index << 1) | last_flag)` — defeats
  truncation/reorder/splice; the 1-bit last-flag makes the final chunk unforgeable; nonce is position-derived
  (not stored). History `+1` appends advance the epoch and hash-link the previous segment's root; per-epoch key
  rotation gives forward secrecy; dropping a segment key = crypto-erasure without breaking the chain.
- **Metadata minimization on the wire:** the `coord`/TVCID is opaque/non-semantic; embedding sections are
  encrypted; fine semantic filtering happens only at trusted endpoints (verdict 5).
- **Status:** byte-precise + golden-vectored for every **deterministic** part (KDF, commitment, context, STREAM
  nonces — reproducible in stdlib: `K_aead = 9b4fdce2…`, `key_commit = bc8eee3b…`). The **KEM/AEAD ciphertext
  bytes are labelled placeholders** (no vetted KEM/AEAD in stdlib; we don't hand-roll). The verified `@noble`
  bench produces the **real** ct/tag and passes 11/11. Adversarially verified by a multi-agent workflow (4
  findings → 3 fixed, 1 dismissed). The bench KDF is **reconciled to the spec's SHAKE256**, and
  `bench/oracle-check.mjs` proves the JS (`@noble`) and Python (stdlib) DEM key schedules are **byte-identical**
  (`K_aead 9b4fdce2…`, `key_commit bc8eee3b…`) — the oracle is airtight across both implementations.

### 5.6 Governance — the K3 gate (`tri-encription/spore/k3-gate.spore`)
The verify-before-decrypt **decision** layer cloned in real `.spore`: `galerina check` → 0 errors/0 warnings, and it
**executes on the compile→WASM path** (`collapse(0)=-1`; `keyRelease(1,1,1)=1`; `(1,1,0)/(0,1,1)/(1,0,1)=-1`
fail-closed; Kleene min/max/neg; TMR median). **Crypto math is honestly Blocked in `.spore`** — `galerina check`
rejects even bitwise `^` — so the cipher math stays the engine layer. *Galerina governs whether it runs; the host
lib computes the exact bytes.*

---

## 6. The conformance oracle — 5 generators + golden vectors

The byte-exact "anyone can implement this in any language and match the bytes" property is what makes Galerina
adoption *safe*. Five **stdlib-only** Python reference generators emit committed golden vectors (in
`tmf/spec/_vectors/`):

| Generator | Produces | Self-check |
|---|---|---|
| `gen_tmx_vectors.py` | TMX-256 root + leaf/node digests | root = `43386e64…` |
| `gen_tmf_container.py` | 203-byte 2-section container | `integrity_root` == TMX root |
| `gen_nvfp4_block.py` | 9-byte NVFP4 block (16×E2M1 + E4M3) | vs NVIDIA source |
| `gen_sig_block.py` | 5379-byte hybrid sig block (structural) | round-trip parse; placeholders labelled |
| `gen_inclusion_proof.py` | 133-byte Merkle-path proof | reconstructs root; tamper/wrong-leaf fail |
| `gen_tmf_encryption.py` | encryption key-schedule + framing | KDF deterministic + context/epoch/secret-bound; STREAM nonce bit-packing |

Where real crypto can't run in stdlib (ML-KEM, ML-DSA, AES-GCM), the generators emit **zero-filled placeholders
of the correct standard sizes, clearly labelled** — never fake crypto. The measured-crypto oracle is the
`@noble` bench (§7).

---

## 7. What's measured (the bench) — honest numbers, attributed

`tri-encription/bench/` is the executable reference: **11 correctness cases pass** (`node --test`), real
`@noble` primitives (not stubs). **Machine:** Intel i9-9900K @ 3.6 GHz, Node v24.16.0, win32 x64; `@noble`
post-quantum 0.6.1 / hashes-ciphers-curves 2.2.0 (pure JS).

| Primitive | Operation | Result |
|---|---|---|
| ML-KEM-768 | keygen / encaps / decaps | 2,498 / 2,123 / 1,719 ops/s |
| Hybrid X25519+ML-KEM-768 | keygen / encaps / decaps | 606 / 237 / 285 ops/s |
| ML-DSA-65 | keygen / sign / verify | 545 / 114 / 505 ops/s |
| SHA-256 | 1 MiB | 210 MB/s |
| SHA3-256 / SHAKE256 | 1 MiB | 26 MB/s |
| AES-256-GCM | 1 MiB seal/open | 38 MB/s (pure-JS **floor**) — **native AES-NI = 1,273 MB/s (34×)** |
| HKDF-SHA256 | derive 32 B | 111,016 ops/s |
| TMX-256 (leaf+tree) | 1024 × 1 KiB leaves | 21 MB/s |
| Reed-Solomon GF(256) k=10 m=4 | encode / recover | 159 / 248 MB/s |

**Byte constants validated at runtime:** ML-KEM-768 ct = 1088 B, hybrid ct = 1120 B, ML-DSA-65 sig = 3309 B,
shared secret = 32 B. Two honesty issues were self-caught and fixed: a `negTrit(0) → -0` non-canonical-trit bug,
and a mislabelled TMX throughput line (corrected 284 → 21 MB/s). **These are micro-benchmarks** — no `.tmf`
RPS, no end-to-end pipeline, no parallelism, nothing photonic; orders of magnitude only.

---

## 8. The honesty ledger — what was rejected (and why)

Every one of these from the source notes was triaged out:
- **"12.5M RPS / sub-0.01 ms / single clock cycle"** — unsubstantiated; no benchmark, physically implausible as stated.
- **In-cache / DMA neighbourhood-convolution self-heal** — fabricates unsigned data; in-gate attacker target. Replaced by RS-outside-the-gate + re-verify.
- **"Store a 0 in 0 bits"** — contradicts fixed-width layout.
- **"Photonic SHA-256"** — precision wall vs avalanche; SHA-256 is already Grover-OK (verdict 2).
- **"Firewalls filter on cleartext meaning in-network"** — killed by embedding-inversion attacks (verdict 5).
- **`M·D_root ≡ S (mod q)`** ML-DSA "equation" — not how FIPS-204 verifies; corrected to norm-bound + challenge-hash.
- **`galerina-substrate-mytri`** — a fictional/rejected package.
- **Mandatory NVFP4** — kept opt-in; NVFP4 is real but lossy, so never integrity bytes.
- **A custom photonic/analog-trit cipher** — would be unvetted "invented crypto"; rejected (verdict 3).

---

## 9. The 3 Galerina dogfooding gaps — IN FULL

These were found while building and running the `.spore` governance clone (`k3-gate.spore`) against
`C:\wwwprojects\Galerina\galerina.mjs` (Phase 27 WASM), reproduced 2026-06-15/16. Source of record:
[`tri-encription/spore/galerina-gaps-candidate-issues.md`](tri-encription/spore/galerina-gaps-candidate-issues.md).

> **Status (re-verified 2026-06-16): GAP-1 ✅ FIXED · GAP-3 ✅ FIXED · GAP-2 ⚠️ PARTIAL · GAP-4 🆕 NEW (major).**
> GAP-1/GAP-3 fixed in Galerina and re-confirmed against `galerina.mjs`. GAP-2's diagnostic is now clear (documents
> the invokable surface) but executing an effectful `main` via the CLI is still missing. **GAP-4 (new):** while
> expanding the `.spore` clone (`spore/k3-policy.spore` — `allOf`/`anyOf` + the `authorizeRead`/`egressRedact` egress
> seam, all `--invoke`-verified), a `for … in` fold was found to **type-check clean but silently not compile to
> WASM** (`(i32.const 0) ;; unhandled stmt: forEachStmt`), returning the first arg verbatim — a silent
> correctness gap. To file: GAP-2 (functional half) + GAP-4. Full repros: `galerina-gaps-candidate-issues.md`.

### GAP-1 — `governance` reserved word, no hint — ✅ FIXED (2026-06-16)
- **Was:** a `pure flow` with a parameter named `governance` → `❌ SPORE-PARSE-001: Expected parameter name, got
  "governance".` — the diagnostic never said it was reserved, so the cause was opaque.
- **Fix (verified):** the diagnostic now names the cause — *"…"governance" is a reserved Galerina keyword and
  cannot be used as an identifier. Rename the parameter (e.g. "governance_")."* The opaqueness (the real defect)
  is resolved. `governance` stays reserved **by design** (the chosen fix was the clear diagnostic). Minor
  cosmetic residual: a few follow-on parse errors still print after the primary one (parser error-recovery;
  not the gap). Re-checked with `probe-gap1-governance.spore`.

### GAP-2 — `secure flow main` (returning `Result<Void,Error>`, using `console.log`) is absent from the WASM `--invoke` surface
- **Repro:** `galerina run k3-gate.spore --invoke main` → `Flow 'main' not found. Available: <pure numeric flows>`.
- **Impact:** a `console.log`-driven demo/entry `main` cannot be executed via `run --invoke`; only pure,
  numerically-typed flows are invokable. Real results had to come from invoking those pure flows directly.
- **Fix / clarify:** document the invokable surface, **or** expose `secure` / `console`-effecting flows to `--invoke`.
- **Severity:** medium (affects runnability / demos).

### GAP-3 — CLI `Bool` args silently mis-marshal (`true`/`false` → `false`) — ✅ FIXED (2026-06-16)
- **Was:** `--invoke keyRelease true true 1` → `-1` (wrong) because the string `"true"` decoded as `false` — a
  plausible argument **silently produced a fail-closed (wrong) answer** instead of an error.
- **Fix (verified):** `true`/`false` now marshal correctly to `Bool`. Re-run on the unchanged `k3-gate.spore`:
  `keyRelease true true 1` → **`1`** (was `-1`); `keyRelease false true 1` → **`-1`** (correct fail-closed);
  `keyRelease 1 1 1` → `1`. No more silent mis-marshal.

### Corroborating (not a new gap): no bitwise operators — the "crypto is Blocked in `.spore`" evidence
- **Repro:** `spore/probe-no-bitwise.spore` (`return a ^ b`) → `❌ SPORE-PARSE-001: Unexpected character: '^' (U+005E)`.
- Galerina's lexer doesn't recognize `^`, so the bit-twiddling that SHA/AES/Reed-Solomon/Keccak are built from
  **cannot be expressed** in `.spore`. This is **expected/known** (corroborates `galerina-issues/0002` and the
  "crypto math stays the engine layer; `.spore` governs" split) — listed for completeness, not as a defect.

---

## 10. The two crypto paths (from the charter)

The owner asked for two paths; mapped honestly onto crypto-on-core:

- **Path A — fast (runtime / hot path), deterministic-digital:** symmetric **AES-256-GCM via AES-NI** (measured
  1,273 MB/s, 34× the pure-JS floor) for per-message confidentiality (ChaCha20-Poly1305 where AES-NI is absent);
  plus the **tri-logic K3 gate** as the fast *authorization* decision. Photonics stays **outside** the gate
  (ANN/vector search on decrypted+re-verified plaintext, QRNG entropy, optical-PUF root-of-trust). Photonics
  never computes the cipher/hash.
- **Path B — strong (slow generation OK), cold path:** higher-assurance PQ profile **`0x03` = ML-KEM-1024 +
  ML-DSA-87 (NIST level 5)** for long-lived data; **SLH-DSA (FIPS 205)** hash-based signature as the
  conservative backup. Once-per-artifact, so keygen/sign latency is irrelevant. **FHE** (compute-on-encrypted) is
  a separate digital, research-grade track — never line-rate.

> Honest line: the "fast" path is fast **digital** crypto (AES-NI) + the tri-logic gate; the "strong" path is
> slow **PQ/level-5** crypto on the cold path. Neither runs the cipher on analog photonics.

---

## 11. Roadmap

**Done & verified:** TMX-256 + container + NVFP4 codec + sig/custody (TASK 2 frozen) + inclusion proof (Phase
1c) + the confidentiality spec (Phase 1d); confidentiality design + bench (11/11) + runnable K3 `.spore`; AEAD
crypto-profile registry, committing AEAD, SHAKE256 KDF, metadata-routing kill — all ratified and propagated;
**bench KDF reconciled to SHAKE256 (1e) with JS↔Python byte-identical key schedules** (`bench/oracle-check.mjs`).
**Phase 3 (Assurance & profiles) DONE:** level-5 tier — `kem_profile` 0x03/0x04 (ML-KEM-1024 / hybrid+P-384)
+ signature {ML-DSA-87, SLH-DSA-256s}, sizes measured (`profile-l5-sizes.mjs`); section round-trip measured
(`section-roundtrip.mjs`); `.spore` clone expanded (`k3-policy.spore`). **Phase 4 (Storage & query) DESIGN DONE:**
`storage-and-query-v0.md` — mesh-coordinate index + HNSW (measured recall, `hnsw-recall.mjs`) + MeshQL.
**Phase 5 (rich media/data) DONE:** `tmf-modalities-v0.md` codec registry (image/audio/video/math/chemistry/
JSON/XML), codec-agnostic integrity proven. **`+1` history chain DONE:** `tmf-history-chain-v0.md` — hash-linked
signed segments + key-erasure ratchet + crypto-erasure; rollback explicitly needs verifier monotone-epoch state
(adversarially reviewed: 2 blockers + 3 majors fixed pre-commit). Full suite green: **8 generators**, npm test
11/11, oracle byte-identical, both `.spore` 0/0.

**Next (R&D folder, no owner go needed):**
- A fully key-committing (CMT-1) AEAD profile sketch; expand the `.spore` governance clone (`allOf`/`anyOf`,
  `authorizeRead`/egress-redaction seam); end-to-end `.tmf` section round-trip *composition* measurement.

**Gated on owner go (production repo, currently R&D-only):** engine build. Note the language directive has
shifted — **prefer Galerina + a governed host crypto library over a Rust engine** (Rust is unusable in the main
project); for #34 the no-new-dependency path is `@noble/post-quantum` across the Galerina attestation boundary.

**Later (labelled, not promised):** `0x03`/SLH-DSA assurance tier; the `+1` append-chain wire format; FHE for
encrypted similarity (digital research only); photonic ANN benchmark (the only earnable photonic perf claim,
behind a reproducible benchmark); digital-ternary NTRU/ML-KEM backend (optimization, not a security feature).

---

## 12. Open owner decisions (the genuine forks — not blockers)

1. **Profile scope** — ship only `0x01`/`0x02` now, or also add the `0x03` (ML-KEM-1024 + ML-DSA-87) / SLH-DSA
   level-5 assurance tier this pass? *(Default taken: reserved `0x03`, did not spec it — speculative until a
   long-lived-archive requirement lands.)*
2. **Lift the R&D-only gate** — production-repo access / any engine build is currently held. Lift it when?
   *(Default: stay R&D-only / spec-only.)*
3. **Where to file the remaining Galerina gap** (§9) — GAP-1 + GAP-3 are now **fixed**; only **GAP-2** (`secure
   flow main` absent from the WASM `--invoke` surface) remains to file. Owner picks the tracker; the TritMesh
   repo is off-limits to this session. *(Default: left staged in `galerina-gaps-candidate-issues.md`.)*

---

## 13. Constraints & boundaries (binding)

- **Off-limits to this R&D:** `C:\wwwprojects\Galerina-TritMesh` (the product repo) and
  `C:\wwwprojects\Galerina\packages-galerina` (production code) — R&D only until the owner says otherwise.
- All `.tmf` / encryption R&D lives in **`C:\wwwprojects\Galerina-R-AND-D\`**.
- No performance number without a reproducible benchmark + the machine; no invented crypto; honest-core vs
  aspirational kept separate; fail-closed throughout.

---

## 14. File map (hard paths)

**Top-level (start here):**
- `C:\wwwprojects\Galerina-R-AND-D\ENCRYPTION-RND-FULL-BRIEF.md` — **this file** (full narrative).
- `C:\wwwprojects\Galerina-R-AND-D\CROSSOVER-encryption-rnd.md` — merged index/reconciliation.
- `C:\wwwprojects\Galerina-R-AND-D\RD-DIRECTION.md` — owner's ranked priorities + directives.

**`.tmf` spec track — `C:\wwwprojects\Galerina-R-AND-D\tmf\`:**
- `README.md` · `STATUS-AND-NEXT-STEPS.md`
- `research\` — `encryption-architecture.md` (start), `real-vs-aspirational-ledger.md`,
  `ternary-in-cryptography.md`, `external-repos-analysis.md`, `findings-and-next-intentions.md`, `open-questions.md`
- `spec\` — `tmx-256-construction-v0.md` (SHIP) · `tmf-container-v0.md` · `nvfp4-codec-v0.md` ·
  `signature-custody-v0.md` (TASK 2) · `inclusion-proof-v0.md` · **`tmf-encryption-v0.md`** (new)
- `spec\_vectors\` — `gen_tmx_vectors.py` · `gen_tmf_container.py` · `gen_nvfp4_block.py` · `gen_sig_block.py` ·
  `gen_inclusion_proof.py` · **`gen_tmf_encryption.py`** (+ matching `*_vectors.txt` / `*.txt` golden outputs)

**tri-encryption track — `C:\wwwprojects\Galerina-R-AND-D\tri-encription\`:**
- `FINDINGS-AND-ROADMAP.md` (checkpoint)
- `research\` — `quantum-resilient-tri-encryption.md` · `photonic-sha256-integrity.md` ·
  `metadata-confidentiality.md` · `SPORE-AMD-024-tmf-confidentiality.md` (the blueprint, now promoted)
- `bench\` — `bench.mjs`, `tmf-crypto.test.mjs`, `aes-native-vs-purejs.mjs`, `lib\{k3,kemdem,rs,stream,tmx}.mjs`,
  `README.md` (`npm install && npm test && npm run bench`)
- `spore\` — `k3-gate.spore` · `README.md` · `probe-no-bitwise.spore` · **`galerina-gaps-candidate-issues.md`** (the 3 gaps)

**Adjacent (not merged):** `FFSM\` (task #199) · `photonic-tri-governance\`.

---

## 15. How to resume / re-verify

```sh
# Conformance oracle (stdlib, no deps) — regenerate every golden vector:
cd C:\wwwprojects\Galerina-R-AND-D\tmf
python spec/_vectors/gen_tmx_vectors.py
python spec/_vectors/gen_tmf_container.py
python spec/_vectors/gen_inclusion_proof.py
python spec/_vectors/gen_sig_block.py
python spec/_vectors/gen_tmf_encryption.py        # the new encryption layer

# Measured crypto oracle (@noble, pure JS) — 11/11 tests + benchmark:
cd C:\wwwprojects\Galerina-R-AND-D\tri-encription\bench
npm install && npm test && npm run bench
node oracle-check.mjs        # proves the JS SHAKE256 DEM key schedule == the Python golden vector (byte-identical)

# Governance gate on the real Galerina compile->WASM path:
#   galerina check  C:\wwwprojects\Galerina-R-AND-D\tri-encription\spore\k3-gate.spore      -> 0 errors / 0 warnings
#   galerina run    ...\k3-gate.spore --invoke keyRelease 1 1 1                          -> 1   (and (1,1,0)->-1, etc.)
```

**The single most valuable output** is the frozen TASK 2 spec (`tmf/spec/signature-custody-v0.md`): it makes
Galerina **#34** a safe mechanical port with zero crypto-invention. After that, the natural next pushes are
reconciliation **1e** (align the bench KDF to the spec's SHAKE256) and, only on owner go, the engine build
(Galerina + host crypto lib, not Rust).
