<!-- ABSORBED R&D SOURCE — verbatim mirror. Galerina is the main library; the R&D repo is upstream/authoring.
     Source: Galerina-R-AND-D/tri-encription/research/quantum-resilient-tri-encryption.md  ·  Pinned: R&D fb68d06 (2026-06-16)
     Integrated Galerina view: galerina-tmf-engine.md  ·  Catalog: galerina-rd-absorption-catalog.md
     Rule: edit the upstream source then re-vendor; do not fork this copy (feedback-auto-import-rd-docs). -->

> **Absorbed R&D source (verbatim).** This is the archived upstream document. Curated/integrated view: `galerina-tmf-engine.md`. See `galerina-rd-absorption-catalog.md` for the full ledger. Internal links below point at the upstream R&D tree.

---
# Quantum-Resilient, Zero-Trust, Tri-Logic Encryption for the `.tmf` / photonic-Galerina ecosystem

> **Status:** Research note (grounded & cited, per request). **Date:** 2026-06-15.
> **Question (from `notes/1.md`–`3.md` + brief):** what can *encryption* look like for the `.tmf`
> container and the photonic Galerina ecosystem, given that we need **(1) zero-trust**,
> **(2) quantum-resilience**, and **(3) tri-logic** woven in — across DB comms, images/audio/
> video, and API-to-API packages, with append-only `+1` history and self-healing?
> **Posture (your choice):** design for commodity hardware first, cite real sources, and label
> every throughput/hardware claim from the notes as an *aspirational target*, not a fact.
> **Hard guardrails:** **no invented crypto**; distinguish *hash ≠ signature ≠ KEM ≠ AEAD ≠ FHE*
> precisely; keep integrity/crypto on a **deterministic bit-exact core**; tri-logic governs *whether*
> crypto runs, never *how* it computes.
> **Grounding:** every "Galerina says…" claim below carries a `file:line` into
> `C:\wwwprojects\Galerina\docs\Knowledge-Bases\` (abbreviated `KB/…`). External claims are cited in §13.

---

## 0. Verdict (TL;DR)

1. **The honest answer to "in theory it should already do this": it does NOT.** Both Galerina and the
   `.tmf` notes deliver **integrity** (hashing / TMX-256) and **authenticity** (ML-DSA-65 signing) but
   **no confidentiality primitive at all**. Galerina ships hashing + signing only; encryption is a *policy
   stub* and ML-KEM is explicitly deferred: *"Galerina does **not** encrypt artifacts today … If confidential
   data-at-rest/in-transit is ever added, use ML-KEM (FIPS 203). Not currently needed."*
   (`KB/galerina-quantum-resistance-posture.md:34-37`). The `.tmf` notes encrypt nothing — they even
   advertise routers scanning the semantic **attribute layer "without … decrypting the main file payload"**
   (`notes/2.md:45`, `notes/3.md:58`), i.e. payloads and semantic embeddings travel **in clear**.
   **Confidentiality is the missing layer; this doc specifies how to add it.**

2. **It can be made quantum-resilient AND zero-trust on a fully deterministic digital core, with only
   standardized primitives** — the **KEM-DEM / HPKE** shape: **ML-KEM-768** (hybrid X25519+ML-KEM during
   transition) → **HKDF/SHAKE** → **AEAD** (AES-256-GCM / streaming AEAD), layered *under* the existing
   **TMX-256 + ML-DSA-65** gate. No new crypto is invented. (§4)

3. **Tri-logic's correct primary home is the governance / key-release gate**, not the cipher. Galerina's
   three-valued calculus is *proven* fail-closed (`authorize(v) ⇔ v=+1`; `collapse(0)=deny`;
   No-Coercion theorem — `KB/galerina-three-valued-governance.md:139-179`). Use it to decide *whether* a key
   is released; keep the cipher math bit-exact. (§5.1)

4. **Tri-logic already lives *inside* PQ crypto — and that is the only honest "trit-native" path.**
   NTRU and Kyber use **balanced-ternary / small-signed polynomial coefficients** ({−1,0,+1}); so "ternary
   in the crypto" is real — but it is **exact, digital, modular** arithmetic, **never an analog three-level
   signal**. A *new* analog/photonic trit cipher would be unvetted, would violate crypto-on-core, and would
   be "inventing crypto" (forbidden). **Adopt NTRU/ML-KEM; don't invent a trit cipher.** (§5.2)

5. **Photonics cannot run the bit-exact crypto** (≤~10 effective bits in *any* analog computer; lattice/FHE
   need exact modular reduction). It legitimately helps the **DB's ANN/vector layer** (outside the gate) and,
   in FHE research, **interconnect bandwidth + transforms** — with **modular reduction kept digital**. (§6, §7)

6. **"Self-heal" must be redefined to survive zero-trust + encryption.** The notes' neighbourhood-convolution
   repair, hot-committed into a live cache (`notes/3.md:160-168`), *fabricates* data, **can't apply to
   ciphertext**, and is an **in-the-gate attacker target**. Replace it with **erasure coding (Reed-Solomon)
   for availability *outside* the gate + mandatory re-verification against the signed TMX root, fail-closed.**
   (§8)

7. **One internal KB contradiction to fix (the "check"):** `KB/galerina-hardware-future-substrates.md:63`
   lists *"Encryption → Photonic matrix operations"* — which **directly contradicts** the canonical
   crypto-on-core invariant **`SPORE-SUBSTRATE-001 / CRYPTO_ON_NOISY_LANE`** (always-error;
   `KB/galerina-substrate-failure-model.md:186,247`). The future-substrates file is the superseded 2026-06-01
   outlier (it assumes photonic = "Full" determinism, `:42`); the 2026-06-15 substrate model overturns that.
   **Recommend correcting line 63.** (§6.3)

### Verdict-at-a-glance

| Requirement | Answer | Where it runs |
|---|---|---|
| Confidentiality at rest / in transit | **ADD** ML-KEM-768 (hybrid) + AEAD (KEM-DEM/HPKE) | deterministic digital core |
| Quantum-resilience | KEM = ML-KEM (FIPS 203); sig = ML-DSA-65 (FIPS 204); hash = SHA-256/SHAKE (keep) | digital core |
| Zero-trust | verify-before-decrypt, fail-closed; tri-logic `unknown→deny` key-release | `.spore` governance + engine |
| Tri-logic in crypto | adopt NTRU/Kyber ternary polynomials (exact, digital) | digital core |
| Compute-on-encrypted (FHE) | research track only; digital; not a near-term `.tmf` feature | digital core |
| Self-heal | erasure coding + re-verify vs signed root, **outside** the gate | engine, fail-closed |
| Photonics | ANN/vector layer + FHE interconnect/transform — **never the exact crypto** | outside trust gate |

---

## 1. Scope & method

**What "encryption" must cover here** (your scope: *all of them*):

- **Data at rest** — `.tmf` section/payload bytes (DB records, images, photo, video, audio, blobs).
- **Data in transit** — `.tmf` packets over TUFC / API-to-API, for small packets *and* large media streams.
- **Compute on encrypted data** — keeping payload encrypted during processing (FHE / PQ-homomorphic). §7.
- **Key custody & release** — derive / seal / release / rotate keys under zero-trust. §4.5, §5.1.
- **Append-only `+1` history** — confidentiality that composes with an immutable, hash-linked timeline. §4.4.
- **Self-healing** — availability under corruption, reconciled with fail-closed integrity. §8.

**Method.** Grounded first in the Galerina Knowledge-Bases (four parallel readers covered the crypto/PQ/custody,
tri-logic, photonic/substrate, and resilience clusters), then cross-checked against NIST/IETF standards and the
optical-computing + lattice-crypto literature. Posture: grounded & cited; commodity-first; aspirational claims
labelled.

**The vocabulary that prevents category errors** (used precisely throughout):

| Primitive | Question it answers | Keyed? | Quantum risk |
|---|---|---|---|
| **Hash** (SHA-256/SHAKE) | "are these the exact same bytes?" | no | Grover only (quadratic) → **safe** |
| **Signature** (ML-DSA-65) | "did the key-holder vouch for this?" | private→public | Shor breaks classical sigs → **migrated** |
| **KEM** (ML-KEM) | "can we agree a shared secret over a public channel?" | public→shared | Shor breaks classical KEX → **use PQ KEM** |
| **AEAD** (AES-GCM) | "encrypt these bytes + detect tampering, given a key" | symmetric | Grover only → **safe at 256-bit** |
| **FHE** (BFV/CKKS/TFHE) | "compute on the bytes *without* decrypting" | symmetric/public | lattice-based → **PQ**, but huge cost |

You **sign over a hash**; you **derive an AEAD key from a KEM secret**; you never "replace a hash with a
signature" or "use a KEM as an AEAD." (This is the exact boundary the Galerina notes 31–34 were written to
defend.)

---

## 2. What the ecosystem already has — and the confidentiality gap (the "check")

### 2.1 Galerina today: integrity + authenticity + strong custody, **no encryption**

- **Hashing + signing only.** Signed attestation uses SHA-256/512 + Ed25519 today, with **ML-DSA-65 (FIPS
  204)** the planned PQ signature (`KB/galerina-signed-attestation.md:114-129,138-141`). The crypto **effects**
  that exist are `Hash` / `Sign` (`KB/galerina-quantum-resistance-posture.md:44-47`).
- **Encryption is a *policy stub*, not a primitive.** `EncryptionPolicy.Aes256Gcm` / `TlsPolicy` are sealed
  *declarations* of which algorithm *would* be used (`KB/galerina-security-compile-time-crypto.md:122-158`); the
  `security crypto { key_exchange { prefer ML_KEM } }` block is marked **"Future — not yet implemented"**
  (`KB/quantum-readiness.md:5-7,80-98`). ML-KEM is deferred (§0.1).
- **Key custody is already zero-trust-grade** (this is the strong foundation to build on):
  - Sealed sources `env < vault < kms < hsm`, non-exportable hardware keys, declared `rotate every Nd`
    (`KB/galerina-security-secret-safety.md:180-198`).
  - `KeyHandle<T>` / `ProtectedSecret<T>`: *"never enters application memory as key material. Only operations
    (sign, decrypt, verify) are performed through the handle"* (`:209-221`).
  - Constant-time only: no `==`, only `.constantTimeEquals()`; secrets may not drive branches/indices/loops
    (`:24-46,88-114`).
  - Fail-closed release: runtime *"must NOT silently translate `hsm → env → string`"*; diagnostics
    `SPORE-SECURITY-HSM-002/003/005/006` deny downgrade/reveal/fallback (`:228-249`).
  - Compile-time crypto: cipher suite / min key bits / AEAD mode are **compile-time constants**, *"a tampered
    config file must not be able to downgrade encryption"*, fallback **must fail closed**
    (`KB/galerina-security-compile-time-crypto.md:5-9,82-98`; `SPORE-CRYPTO-007`).
  - Scoped vaults (request/flow/session/service/secure), owner-checked, TTL'd, audited
    (`KB/scoped-vaults.md:48-56,308-320`); session cookie holds only a UUID — *"the SessionVault holds the
    authority"* (`KB/session-vault.md:122-138`).

> **Implication.** Galerina gives us a production-grade *key-custody and constant-time discipline* to plug an
> encryption layer into — but the encryption layer itself (KEM + AEAD) does not exist and must be built
> (engine-side, governed by `.spore` — §10).

### 2.2 The `.tmf` notes today: integrity + authenticity, **payload in clear**

The notes specify **TMX-256** (3-ary TriMerkle-XOF, coordinate-bound leaves) for integrity and **ML-DSA-65**
signing the root (`notes/1.md:120-145`, `notes/3.md:108-146`) — sound, and matching the NIST hash-then-sign
order. But:

- **No confidentiality primitive appears anywhere** in `1.md`/`2.md`/`3.md`. There is no KEM, no AEAD, no key.
- **Semantic metadata is explicitly cleartext on the wire:** the attribute layer (AI latent-space embeddings)
  is scanned by routers/firewalls *"without ever unpacking or decrypting the main file payload"*
  (`notes/2.md:45`, `notes/3.md:58`). Embeddings leak a great deal about content — for a confidentiality
  design this is a **first-class metadata-confidentiality leak**, flagged in §11.

**Net:** integrity and authenticity are in good, PQ-correct shape across the ecosystem; **confidentiality is
absent end-to-end.** Everything below adds it without disturbing the working integrity/authenticity gate.

---

## 3. The quantum threat model, stated precisely (requirement #2)

Galerina's posture is already correct and we adopt it verbatim:

- **Shor → asymmetric / signatures / key-exchange** break in polynomial time (RSA, ECDSA, Ed25519, classical
  DH/ECDH). *"This is the real quantum threat."* (`KB/galerina-quantum-resistance-posture.md:11-12`).
- **Grover → symmetric + hashes** get only a quadratic speedup; SHA-256's preimage work drops to ~2¹²⁸ —
  *"still infeasible. NIST treats SHA-256 as quantum-acceptable."* (`:13-14`). AES-256 likewise stays safe.

**The encryption-specific risk is *Harvest-Now-Decrypt-Later* (HNDL).** Today the signed-not-encrypted posture
has **no HNDL exposure** — there is nothing encrypted to harvest (`:34-37`). **The moment `.tmf` carries
confidential payloads** (at rest or over TUFC), an adversary can record ciphertext now and decrypt it once a
cryptographically-relevant quantum computer exists. **Therefore confidentiality must be PQ from day one** — a
classical-only KEM (ECDH/X25519 alone) would be an HNDL trap. Hence **ML-KEM**, ideally **hybrid** so security
holds if *either* component holds.

| Job | Primitive | Quantum status |
|---|---|---|
| Integrity | SHA-256 / SHAKE256 | **keep** (Grover-acceptable) |
| Authenticity | ML-DSA-65 (FIPS 204) | already chosen (Shor-resistant) |
| **Confidentiality (new)** | **ML-KEM (FIPS 203) + AES-256-GCM** | **add** (Shor-resistant KEM; Grover-safe AEAD) |

---

## 4. The design — zero-trust, quantum-resilient `.tmf` encryption (KEM-DEM / HPKE)

### 4.1 The construction: KEM-DEM, instantiated as HPKE

Confidentiality for arbitrary data is the textbook **KEM-DEM** split, standardized two ways we follow:

- **NIST SP 800-227** (*Recommendations for KEMs*): a KEM establishes a shared secret; a **DEM** (symmetric AEAD)
  encrypts the message; **hybrid KEM** deployment (e.g. **X25519 + ML-KEM**) is encouraged during the PQC
  transition. [[SP-800-227]]
- **IETF RFC 9180 (HPKE)**: *"works for any combination of an asymmetric KEM, key derivation function (KDF),
  and AEAD"* — and modern HPKE implementations already wire **ML-KEM-768** as the KEM. [[RFC-9180]]

```
ENCRYPT a confidential .tmf section:
  1. (ct_kem, K) = ML-KEM-768.Encaps(pk_recipient)         [lattice math — exact, digital]
       hybrid: K = KDF( X25519_shared ‖ MLKEM_shared )      (secure if EITHER holds)
  2. K_aead      = HKDF-SHA256 / SHAKE256( K ‖ context )     [Keccak — exact, digital]
       context binds: TVCID ‖ modality ‖ codex_version ‖ tmf_profile ‖ epoch
  3. (ct, tag)   = AEAD.Seal( K_aead, nonce, AAD=context, payload )   [AES-256-GCM — exact]
  4. store [ct_kem ‖ nonce ‖ ct ‖ tag] as the section payload
  5. TMX-256 leaf/root computed over the STORED (cipher) bytes        [SHAKE — exact]
  6. ML-DSA-65.Sign( sk_signer, root )                                 [lattice math — exact]
```

Choose **ML-KEM-768** (NIST level-3) to match the already-chosen **ML-DSA-65** (also level-3) — equal security
margins, no weak link. AEAD = **AES-256-GCM** (FIPS-approved; keeps the FIPS posture Galerina already targets,
`KB/galerina-security-compile-time-crypto.md:65-76`) or **ChaCha20-Poly1305** where AES-NI is absent.

### 4.2 Per-modality DEM (DB comms, images, photo, video, audio, API packets)

The KEM layer is identical for every modality; only the **DEM** differs by payload shape:

- **Small / fixed (API-to-API packets, DB rows, the 1 KB TUFC wire cell of `notes/3.md:42`):** single-shot
  **AES-256-GCM**, AAD = the binding context (§4.1 step 2). One nonce per object.
- **Large media (image, photo, video, audio, blobs):** **streaming AEAD** — the **STREAM** construction
  (segment the plaintext, encrypt each segment with a per-segment nonce = `prefix ‖ chunk_index ‖ last_flag`).
  This is exactly Google **Tink's `AES256-GCM-HKDF-Streaming`** (1 MB segments) and the
  ImperialViolet/`aead-stream` pattern: it gives random-access decryption for video/audio **and** defeats
  **truncation, reordering, and rollback** (a dropped or replayed segment fails its tag). [[Tink-Stream]]
  [[IV-Stream]] This also dovetails with the notes' "elastic resolution slicing" (`notes/3.md:154-158`):
  dropping *trailing* high-frequency segments is safe *iff* each retained segment still authenticates and the
  TMX tree validates the lower-resolution prefix (open question §11).

### 4.3 Layering with the existing gate — verify *before* decrypt, fail-closed

Confidentiality sits **under** the integrity+authenticity gate that already exists. The order is load-bearing:

```
READ a confidential .tmf section:
  a. ML-DSA-65.Verify( pk, root, sig )      → else REJECT (fail closed)   [authenticity first]
  b. recompute TMX-256 root over stored bytes → else REJECT (fail closed) [integrity over ciphertext]
  c. tri-logic AUTHORIZE key-release (caller, object) → unknown/deny ⇒ REJECT (§5.1)
  d. K   = ML-KEM-768.Decaps( sk_handle, ct_kem )    (via KeyHandle — key never in app memory)
  e. K_aead = KDF(K ‖ context)
  f. payload = AEAD.Open( K_aead, nonce, AAD=context, ct‖tag ) → AUTH-FAIL ⇒ REJECT
```

- **Integrity covers the ciphertext** (TMX root is over the stored cipher bytes), so tamper is caught *before*
  any key is touched. This matches Galerina's *"block hashes are re-checked at effect boundaries and at flow
  completion"* (`KB/galerina-governed-memory-blocks.md:219`) and *"verification gate distinct from execution"*
  (`KB/galerina-governance-verifier-architecture.md:91`).
- **Position binding is preserved twice:** coordinate+modality are in the TMX leaf (`notes/1.md:124-130`) *and*
  in the AEAD AAD (§4.1) — a ciphertext section can't be lifted/replanted, and can't be decrypted under the
  wrong context.
- **Sign over the root; never sign the plaintext, never use the signature as an address** — the corrected
  order from notes 31–34, preserved.

### 4.4 Append-only `+1` history with confidentiality + forward secrecy

The notes model writes as a *"constructive +1 timeline state rather than overwriting"* (`notes/2.md:21`,
`notes/3.md:71`). Encrypt it as a **hash-linked chain of independently-encrypted, signed segments**:

- Each `+1` append is its own AEAD-sealed segment with its own nonce; its AAD binds the **previous segment's
  TMX root** (hash-linking) → immutability + tamper-evidence of order, exactly like Galerina's hash-linked
  compliance ledger.
- **Per-epoch key rotation for forward secrecy:** rotate the KEM/DEM keys per epoch (declared with Galerina's
  `rotate every Nd`, `KB/galerina-security-secret-safety.md:189-198`) and derive segment keys from an epoch key
  via a one-way KDF ratchet. Compromise of a *current* key does not expose *past* segments.
- **Crypto-erasure for "right to be forgotten":** because history is append-only (you can't delete a signed
  segment without breaking the chain), honor erasure by **destroying the segment's key** (the ciphertext
  becomes permanently undecryptable). This composes cleanly with Galerina's existing *metadata-erasure /
  right-to-erasure* model (`KB/galerina-metadata-erasure.md`, `KB/galerina-compliance-governance.md:172`) — the
  immutable chain stays intact; the plaintext becomes unrecoverable.

### 4.5 Key custody & release under zero-trust (reuse Galerina's model)

No new custody design is needed — bind the new KEM/DEM keys into Galerina's existing zero-trust custody:

- KEM/DEM private keys live as **`KeyHandle` in HSM/KMS**; **decapsulation happens through the handle**, key
  material never enters app memory (`KB/galerina-security-secret-safety.md:209-221`).
- Suite (ML-KEM-768 + AES-256-GCM) pinned at **compile time**; config cannot downgrade; fallback fails closed
  (`KB/galerina-security-compile-time-crypto.md:82-98`).
- **Release is gated by the tri-logic decision** of §5.1 — the handle performs `Decaps` *only* on a definite
  `allow (+1)`.

---

## 5. Tri-logic in BOTH layers (your choice)

### 5.1 Layer 1 — governance / key-release: the proven, recommended home

Use Galerina's **strong-Kleene K3** three-valued calculus as the **authorization + key-release gate** around the
crypto. This is where tri-logic is *earned*, not decorative:

- **Encoding & operators** (`KB/galerina-three-valued-governance.md:51-92`): `-1=DENY`, `0=INDETERMINATE/unknown`,
  `+1=ALLOW`; `min`=Kleene ∧ ("more-cautious input wins, fail-closed"), `max`=∨, `neg` (where `¬0=0` — *"a
  negation never turns 'we don't know' into a definite verdict"*, `:100-101`), and majority `consensusTrit`.
- **The release rule:** `authorizeDecrypt(caller, object) → {allow,deny,unknown}`; **`collapse(0)=deny`**
  (audited `SPORE-GOV-3VL-001`, `:124-128`); the `KeyHandle` runs `Decaps`/`Open` **only** when the verdict is
  `+1`. Mirrors Galerina's existing *Secret Access* example where `revealSecret()` requires definite `true` and
  *"unknown fails closed"* (`KB/galerina-core-logic-tristate-developer-guide.md:32-33,668-700`).
- **Why it satisfies zero-trust (provably):**
  - **Theorem — Fail-Closed Soundness:** `authorize(v) ⇔ v=+1`; *"No INDETERMINATE verdict can ever
    authorize"* (`KB/galerina-three-valued-governance.md:139-143`).
  - **Theorem — No Coercion:** *"`0` cannot be coerced into the `+1` that authorizes, anywhere in
    composition"*, proven exhaustively over expression trees to depth 4 (`:145-167`).
  - **Empty-set denies:** `allOf([])`/`anyOf([])` → `INDETERMINATE`, not vacuous-true (`:110-115`).
  - So a **missing attestation, stale calibration, ambiguous policy, expired session, or a substrate
    erasure-to-`0`** all collapse to **deny key release**. A literal analog `0` from a noisy lane is *itself*
    `unknown` (`:24,55`) → deny.
- **Crucially, tri-logic governs *whether* the cipher runs, never *how* it computes.** The KEM/AEAD math stays
  bit-exact binary/modular on the deterministic core (`SPORE-SUBSTRATE-001`, §6). Advisory/uncertain reasoning
  (e.g. an AI risk score) is **barred from authority** — *Omni Logic* "must never … grant runtime authority
  directly … convert uncertainty into allow", downgrading to `review` (`KB/galerina-core-logic-omni-logic.md:30-32,160-171`).

This is the single highest-value use of tri-logic in the whole design: a **machine-checked, fail-closed
key-release gate**.

### 5.2 Layer 2 — trit-native crypto primitive: research track + honest verdict

The seductive idea is a **balanced-ternary cipher / ternary lattice on a trit (or photonic) substrate.** Three
honest findings settle it:

- **Finding A — balanced ternary already lives *inside* standardized PQ crypto.** **NTRU** is a lattice KEM
  whose small polynomials have **ternary coefficients ({−1,0,+1})**; it is undergoing ISO standardization
  (**ISO/IEC 29192-4 Amd.2**) and has decades of cryptanalysis. [[NTRU]] Kyber/ML-KEM similarly samples small
  *signed* coefficients (centered binomial). So *"tri in the crypto"* is **not exotic — it is already there**,
  as the small-coefficient alphabet. Research variants (e.g. **NTRU-MCF**, multidimensional lattices) continue
  this line. [[NTRU-MCF]]
- **Finding B — but it is computed EXACTLY and DIGITALLY.** The ternary is the *coefficient representation*;
  the arithmetic is **exact modular** over a polynomial ring (mod `q`, mod `3`) — not an analog three-level
  signal. A noisy/photonic trit lane cannot perform it (crypto-on-core; ≤~10-bit analog precision, §6.1); a
  single wrong coefficient → wrong key → decapsulation fails closed.
- **Finding C — Galerina has no ternary arithmetic and the rules forbid inventing crypto.** Galerina's `Tri` is
  strictly a **3-state *logical/decision*** type, not an arithmetic substrate (*"Internal encoding … Surface
  language remains True/False/Unknown"*, `KB/galerina-photonic-ternary-bridge-spec.md:133-135`); the governance
  spec says to *"**govern** an emerging substrate, never **absorb** its hardware or crypto"* and **"no invented
  crypto"** (`KB/galerina-three-valued-governance.md:6-13`). `mathematics-and-tri-logic.md` provides exact
  numeric types (`FiniteField<p>`, `Polynomial<F>`, `:83-91`) **but no base-3 arithmetic**; the
  `ternary-balanced` photonic encoding that does exist is **tensor compute, forbidden from any crypto/authority
  role** (`KB/galerina-photonic-ternary-bridge-spec.md:113-123`).

> **Verdict for the trit-native track:** **Do NOT design a new balanced-ternary / analog-trit cipher.** It
> would be unvetted (zero cryptanalysis confidence — the cardinal sin of rolling your own crypto), a
> crypto-on-core violation if analog, and explicitly "inventing crypto." The standards-aligned way to honor
> "tri in the crypto" is to **adopt NTRU and/or ML-KEM** (which already use ternary/small-coefficient
> polynomials) and run them on a **deterministic digital** core. *If* a deterministic-digital ternary ALU
> (Setun-style, `KB/galerina-photonic-ternary-bridge-spec.md:169`) ever existed, it could host that exact
> arithmetic with **no crypto objection** — but it buys nothing over binary and is **not** the analog/photonic
> trit the notes imagine. (A "digital-ternary NTRU backend" is a legitimate *optimization* gap to file under
> Galerina purpose #2 — not a security feature.)

---

## 6. Can photonics do any of the crypto? (grounded "no" — with the honest "but")

### 6.1 The exactness / precision wall

- *"It is difficult to achieve an effective precision greater than 10 bits in any analog computer, including
  analog optical computers"*; photonic-electronic dot-product engines have demonstrated only **4-bit** weight
  encoding, limited by photodetector / shot / thermal noise. [[McMahon]] [[Analog-Precision]]
- Lattice crypto (ML-KEM `q=3329`; ML-DSA `q=8380417`) and FHE are **exact modular arithmetic** — a single
  ±1 coefficient error propagates through the NTT and yields the wrong key / a failed re-encryption check
  → **fail closed**. [[FIPS-203]] [[FIPS-204]] Error tolerance is *zero*; analog precision is ≤~10 bits. The
  gap is unbridgeable for the crypto math.
- Galerina already encodes this as a **rule, not an opinion**: **`SPORE-SUBSTRATE-001 / CRYPTO_ON_NOISY_LANE`** —
  *"a Hash/Sign/crypto effect declared on a noisy lane. Integrity is **never tolerated** — forbidden outright …
  **error** (always)"* (`KB/galerina-substrate-failure-model.md:186,247`); *"**Crypto cannot be analog.** …
  hashing/signing must be bit-exact, so it cannot run on a noisy lane"* (`KB/galerina-photonic-tri-substrate-rd-agenda.md:58-59`).
  Un-voted analog into a deterministic/crypto sink is `SPORE-SUBSTRATE-004` (`:189`).

### 6.2 What photonics *legitimately* accelerates (outside the crypto)

- **The database's ANN / vector-similarity layer** — error-tolerant real-valued matmul with a *measured*
  recall budget — is exactly what photonics is for: *"Good optical candidates: AI inference / matrix
  multiplication / … vector search / ranking / embeddings"* vs *"Bad optical candidates: … policy systems /
  capability enforcement"* (`KB/hybrid-electronic-optical-compute.md:69-92`); *"Governance enforcement stays
  electronic. Dense tensor compute may become optical."* (`:91-92`). This runs on **decrypted, verified
  plaintext, *outside* the trust gate**, with results re-checked against the signed store.
- **In FHE research, photonics helps *bandwidth* and *transforms*, not the exact reduction.** Recent work uses
  photonic **interconnects** (**OptoLink**, 1.6 TB/s, ~300× electrical bandwidth) and electro-optical
  **transform** acceleration (**CryptoLight**, **OFHE** for TFHE; **Optalysys**) — but explicitly notes that
  *"non-transform operations, including very large vector operations such as addition and **modular
  reduction**"* need digital supporting hardware, and that RNS optical arithmetic *"displays higher sensitivity
  to noise."* [[OptoLink]] [[CryptoLight]] [[OFHE]] [[Optalysys]] **Even bleeding-edge photonic-FHE keeps exact
  modular reduction on a digital core** — precisely the split this doc argues.

### 6.3 The KB contradiction to fix (the "check")

`KB/galerina-hardware-future-substrates.md:63` lists **"Encryption → Photonic matrix operations"** as an
accelerated-math use. This **contradicts `SPORE-SUBSTRATE-001`**. The future-substrates file is the **superseded
2026-06-01 outlier**: it assumes photonic = *"Full"* determinism (`:42`), an assumption the 2026-06-15
substrate-failure model explicitly overturns (photonic is analog/probabilistic;
`KB/galerina-photonic-tri-substrate-rd-agenda.md:48-51`). **Recommendation:** correct `future-substrates:63` to
move "Encryption" out of the photonic plane and add a pointer to `SPORE-SUBSTRATE-001` — and keep its own correct
rule that photonic is *"Suitable only for mathematical operations (never governance logic)"* (`:54`) and *"No
hardware may become a source of authority"* (`:304-324`).

---

## 7. Compute-on-encrypted-data (FHE) — the honest assessment of the most speculative ask

"Encryption that stays encrypted *during* processing" means **Fully Homomorphic Encryption** (BFV/BGV/CKKS/
TFHE). It is **lattice-based (RLWE) → post-quantum**, so it satisfies requirement #2 in principle, and it is the
real technology behind note 1's "homomorphic" gesture (`notes/1.md:253`).

**Honest constraints:**

- **Cost:** FHE is orders of magnitude slower/larger than plaintext compute — not a hot-path technology today.
- **The "noise budget" is cryptographic, not analog.** FHE ciphertexts carry a *managed integer noise term*;
  it is **not** a tolerance for *hardware* analog error. Analog photonic error corrupts the exact modular
  ciphertext arithmetic unpredictably and **blows the budget** — so FHE does **not** make analog photonics
  viable for crypto (§6.1). Photonic-FHE research accelerates interconnect/transform, reduction stays digital
  (§6.2).
- **Where it *might* fit `.tmf`:** privacy-preserving operations over **encrypted attribute vectors** —
  encrypted similarity / private set intersection on the semantic layer — as a **labelled research track**,
  **digital**, never load-bearing for the at-rest/in-transit path.

**Verdict:** confidentiality = **KEM-DEM now** (§4). FHE is a **separate, digital, research-grade track** for
"query without decrypting," not a substitute for at-rest/in-transit encryption, and not a justification for
photonic crypto.

---

## 8. Self-healing reconciled with encryption + zero-trust

### 8.1 Why the notes' self-heal is unsafe

`notes/3.md:160-168` proposes **Matrix Neighbourhood Convolution**: interpolate a corrupted trit from its
3×3×3 neighbours and *"hot-commit … straight back into the active cache line register … while the data is being
actively read."* Three independent problems:

1. **It fabricates data.** Interpolation invents a value that was **never signed** — there is no guarantee the
   "healed" value equals the original. For money/PII/health/gov data that is corruption, not repair.
2. **It cannot apply to ciphertext.** Ciphertext has no smooth spatial gradient; convolving encrypted bytes
   produces garbage. (And convolving *plaintext* requires having already decrypted — defeating confidentiality
   and still fabricating.)
3. **In-the-gate repair is an attacker target.** An attacker who corrupts a cell gets it "healed" to an
   attacker-influenceable interpolation that was never in the signed root — a **silent integrity bypass**.

This contradicts Galerina's actual posture: there is **no data-reconstruction self-heal** in Galerina; "self-heal"
means **zeroize-on-tamper** (destroy, not rebuild — `KB/galerina-cross-layer-resilience.md:156-172`) or
availability degradation via `resilience{}` (retry/fallback/quarantine, never reconstruct —
`KB/galerina-resilience-observability-design.md:68-82`). The substrate theorem guarantees recovery/voting *"can
cost availability … never safety"* (`vAnd(t*,r) ≤ t*`, `KB/galerina-substrate-failure-model.md:159-170`).

### 8.2 The honest self-heal: erasure coding *outside* the gate + re-verify against the signed root

```
   corrupted/lost segment
            │
            ▼
   [ erasure-code recovery ]   ← Reed-Solomon (MDS) parity, or fountain codes for local repair
            │                     OUTSIDE the trust gate; operates on CIPHERTEXT segments
            ▼
   recompute TMX-256 leaf+root over the reconstructed CIPHER bytes
            │
   ┌────────┴─────────┐
   │ matches signed   │ no  → REJECT (fail closed); request re-fetch/re-transmit; verdict = unknown(0) = deny
   │ ML-DSA-65 root?  │
   └────────┬─────────┘ yes
            ▼
   admit the segment → (only on +1 key-release, §5.1) → decapsulate + AEAD-open
```

- **Availability** comes from **Reed-Solomon erasure coding** (MDS — minimal storage overhead) or **fountain
  codes** (cheaper *local* repair, more storage) across cells/segments. [[RS-vs-Fountain]] [[MinIO-EC]]
  [[Founsure]]
- **Confidentiality is preserved**: erasure coding is content-agnostic and operates on **ciphertext**; parity
  blocks reveal nothing beyond the ciphertext they protect.
- **Zero-trust is preserved**: a reconstructed segment is **re-hashed and re-checked against the
  ML-DSA-65-signed TMX root**; mismatch ⇒ fail closed. This is the documented pattern — *"Reed-Solomon erasure
  coding … combined with a cryptographic integrity layer to deliver both self-healing redundancy and
  mathematical proof that data is intact"* [[Integrity-Storage]] [[Self-Repair-Untrusted]] — and it matches
  Galerina's *"hashes re-checked at effect boundaries"* (`KB/galerina-governed-memory-blocks.md:219`) and
  *"recovered/cached evidence requires re-verification before reuse"* (`KB/galerina-adaptive-runtime-profiles.md:234`).
- **Tri-logic ties in:** a segment whose reconstruction does not verify is `unknown(0)` → **deny** → re-fetch;
  it never silently enters the store. This is the `SPORE-SUBSTRATE` *erasure-to-`0`* discipline applied to
  storage (`KB/galerina-substrate-failure-model.md:48,71`).

This delivers everything the notes wanted from "self-heal" (data survives bit-rot / dropped sub-vectors /
degraded lanes) **without** fabricating data, decrypting prematurely, or opening an in-gate bypass.

---

## 9. The notes, checked and dispositioned (skeptic's ledger)

| Claim in `notes/1.md`–`3.md` | Status | Honest disposition |
|---|---|---|
| TMX-256 (3-ary tree XOF) + ML-DSA-65 signs root + coordinate binding | **Sound** | Keep — correct hash-then-sign order, position-binding is textbook |
| **Confidentiality / encryption** | **Absent** | **Add** KEM-DEM (ML-KEM-768 + AEAD), §4 — the headline gap |
| Attribute (embedding) layer scanned on the wire "without decrypting" (`2.md:45`,`3.md:58`) | **Leak** | Semantic embeddings in clear = metadata-confidentiality leak; see §11 tension |
| "12,500,000 RPS … sub-0.01 ms P99" (`3.md:15`) | **Aspirational** | Label as target; no benchmark/machine ⇒ not a fact (matches `KB/…rd-agenda.md:39-40,210`) |
| "single hardware clock cycle" dot-products (`2.md:20`,`3.md:67`) | **Aspirational** | Hardware that does not exist; not a claim |
| `0` stored in **"0 bits"** via "hardware-level bypass" (`1.md:53-59`) while layout is "fixed-width, non-variable" (`1.md:67`) | **Self-contradictory** | Can't be both O(1) fixed-width-indexable *and* zero-allocation-sparse; pick one (fixed-width OR sparse+index) |
| Payload is **NVFP4** 4-bit float blocks (`1.md:100-116`) but file is a "balanced ternary substrate" (`1.md:24`) | **Incoherent** | NVFP4 ≠ trits; choose representation per modality, don't claim both |
| In-cache **convolution self-heal** hot-committed live (`3.md:160-168`) | **Unsafe** | Replace with erasure-coding + re-verify vs signed root, §8 |
| `SPORE-SUBSTRATE-001` crypto-on-core (from Galerina) | **Sound** | Adopt — keep all crypto on the deterministic core |
| `future-substrates.md:63` "Encryption → Photonic" | **Contradiction** | Correct the KB (superseded outlier), §6.3 |

---

## 10. Concrete recommendation — how to *extend* the `.tmf` spec

**Add a confidentiality layer, engine-side, governed by `.spore`, leaving the integrity/authenticity gate intact:**

1. **Container changes (`.tmf`):**
   - Header `flags` **bit1 = encrypted** (alongside existing `bit0 = signed`); a **`crypto_profile`** field
     selecting the KEM/DEM suite (e.g. `0 = X25519+ML-KEM-768 / AES-256-GCM`).
   - A **KEM block** (carrying `ct_kem`, and both shares for hybrid) — likely a new section *kind* rather than
     stretching the fixed section-table entry (open question §11).
   - Per-section **nonce + AEAD tag**; AAD = `TVCID ‖ modality ‖ codex_version ‖ crypto_profile ‖ epoch`.
   - **Streaming AEAD** layout for large-media sections (segment size, per-segment nonce, last-segment flag).
   - **`+1` history**: per-epoch key, KDF ratchet, hash-linked segment roots; crypto-erasure tombstones.
2. **Placement (non-negotiable):** all KEM/AEAD/hash math on the **deterministic digital core**
   (`SPORE-SUBSTRATE-001`). **Tri-logic key-release gate** in `.spore` governance (`collapse_deny`). **Erasure-code
   self-heal outside the gate**, re-verify vs signed root.
3. **Defaults:** ML-KEM-768 (hybrid X25519+ML-KEM-768 during transition); AES-256-GCM / streaming AEAD;
   HKDF-SHA256 or SHAKE256 KDF; suite pinned at compile time; fail-closed downgrade.

**Galerina gaps this surfaces** (noted here since the deliverable is doc-only; candidates to file under
purpose #2 if/when the `.spore` governance side is built):

- **No encryption / KEM / AEAD effect** exposed to `.spore` (only `Hash`/`Sign`) — the core gap.
- **No bytes/buffer primitive** to assemble container bytes from `.spore` (already a known TritMesh blocker).
- **No streaming-AEAD abstraction** for large media.
- *(Optional, optimization not security)* **No balanced-ternary arithmetic** — only needed if a digital-ternary
  NTRU/ML-KEM backend is ever pursued.

The crypto itself stays **engine-side** (per the Galerina↔TritMesh boundary: *Galerina governs, the engine
stores/computes*); `.spore` makes the **policy/key-release** decisions only.

---

## 11. Open questions

1. **Metadata confidentiality vs. in-network filtering.** The notes' headline feature — routers/firewalls
   scanning the semantic attribute layer *without decrypting* — **requires that layer to be cleartext**, which
   leaks content semantics. Encrypting it kills the feature. Options: (a) accept the leak (integrity-only on
   metadata); (b) encrypt metadata and move filtering to the trusted endpoints; (c) explore *searchable
   encryption* / encrypted indexes (research-grade, with their own leakage profiles). This trade-off should be
   decided explicitly, not by default.
2. **Hybrid-KEM packaging** in the fixed-width `.tmf` layout (`ct_kem` for X25519+ML-KEM-768 is large vs the
   56-byte/section table) — new section kind vs header extension.
3. **Committing AEAD.** AES-GCM is not key-committing; a confidential, multi-recipient store should use a
   **committing AEAD** (or bind `H(K_aead)` into the AAD/leaf) to prevent key/ciphertext-substitution attacks.
4. **Elastic resolution slicing + AEAD.** Confirm that dropping trailing media segments still leaves a
   TMX-validatable, AEAD-authenticated prefix (a truncation that *validates* is the goal; a truncation that
   *forges* must fail).
5. **FHE for encrypted similarity** over attribute vectors — digital research track (§7).
6. **Digital-ternary NTRU/ML-KEM backend** — pursue as an optimization gap, or not at all? (§5.2)

---

## 12. The answer, in one paragraph

The `.tmf`/photonic-Galerina ecosystem today proves *who signed* data and *that it is intact*, but it does **not
keep it secret** — confidentiality is genuinely missing, not merely unfinished. It can be made **quantum-resilient
and zero-trust** by adding a standards-only **KEM-DEM** layer (**ML-KEM-768**, hybrid X25519+ML-KEM during
transition, → **HKDF/SHAKE** → **AES-256-GCM / streaming AEAD**), layered **under** the existing TMX-256 +
ML-DSA-65 gate, with **verify-before-decrypt, fail-closed** ordering and an append-only `+1` history that rotates
keys per epoch and supports crypto-erasure. **Tri-logic earns its place in the governance / key-release gate** —
a *proven* fail-closed (`unknown→deny`) authorization that decides *whether* a key is released — while the cipher
math stays **bit-exact on a deterministic digital core**; the only honest "trit in the crypto" is **adopting
NTRU/ML-KEM, whose polynomials are already balanced-ternary**, computed exactly and digitally — **not** an
invented analog-trit cipher. **Photonics cannot run the bit-exact crypto** (≤~10-bit analog precision vs exact
modular arithmetic); it belongs on the database's ANN/vector layer and, in FHE research, on interconnect/transform
— **modular reduction always digital**. And **"self-healing"** is reconciled with both encryption and zero-trust
by **erasure coding for availability *outside* the trust gate, re-verified against the signed root, fail-closed** —
never the notes' fabricating in-cache convolution.

---

## 13. Sources

**NIST / IETF standards**
- [[FIPS-203]] NIST FIPS 203 — *Module-Lattice-Based KEM (ML-KEM)*. <https://csrc.nist.gov/pubs/fips/203/final>
- [[FIPS-204]] NIST FIPS 204 — *Module-Lattice-Based Digital Signature (ML-DSA)*. <https://nvlpubs.nist.gov/nistpubs/fips/nist.fips.204.pdf>
- [[SP-800-227]] NIST SP 800-227 — *Recommendations for Key-Encapsulation Mechanisms* (KEM-DEM, hybrid KEM). <https://csrc.nist.gov/pubs/sp/800/227/final>
- [[RFC-9180]] IETF RFC 9180 — *Hybrid Public Key Encryption (HPKE)* (KEM+KDF+AEAD; modern impls wire ML-KEM-768). <https://www.rfc-editor.org/rfc/rfc9180.html>

**Symmetric / streaming AEAD**
- [[Tink-Stream]] Google Tink — *Streaming AEAD* (`AES256-GCM-HKDF-Streaming`, 1 MB segments, per-chunk nonce; prevents rollback/truncation). <https://developers.google.com/tink/streaming-aead>
- [[IV-Stream]] A. Langley, *Encrypting streams* (STREAM rationale; per-chunk nonce + last-flag). <https://www.imperialviolet.org/2014/06/27/streamingencryption.html>

**Photonic / analog precision limits**
- [[McMahon]] P. L. McMahon, *The physics of optical computing* (≤~10-bit analog precision). <https://arxiv.org/abs/2308.00088>
- [[Analog-Precision]] *Achieving high precision in analog in-memory computing systems*, npj Unconventional Computing (2025). <https://www.nature.com/articles/s44335-025-00044-2>

**Photonic FHE (interconnect/transform, reduction stays digital)**
- [[OptoLink]] *OptoLink / Leveraging Photonic Interconnects for Scalable FHE* (1.6 TB/s; non-transform ops incl. modular reduction need digital HW). <https://arxiv.org/abs/2506.12962>
- [[CryptoLight]] *CryptoLight: An Electro-Optical Accelerator for FHE*. <https://arxiv.org/pdf/2211.13780>
- [[OFHE]] *OFHE: An Electro-Optical Accelerator for Discretized TFHE*. <https://arxiv.org/pdf/2405.11607>
- [[Optalysys]] Optalysys — photonic FHE accelerator program. <https://medium.com/optalysys>

**Ternary lattice crypto**
- [[NTRU]] NTRU (ternary-coefficient lattice KEM; ISO/IEC 29192-4 Amd.2 standardization). <https://info.isl.ntt.co.jp/crypt/ntru/>
- [[NTRU-MCF]] *NTRU-MCF: A Chaos-Enhanced Multidimensional Lattice Signature Scheme*, Sensors (2025). <https://www.mdpi.com/1424-8220/25/11/3423>

**Erasure coding / self-healing + integrity**
- [[RS-vs-Fountain]] *Reed-Solomon vs Fountain Codes in Distributed Storage* (MDS overhead vs local repair). <https://www.linkedin.com/pulse/reed-solomon-rs-vs-fountain-codes-distributed-storage-suayb-s-arslan>
- [[MinIO-EC]] MinIO — *What is Erasure Coding?* <https://blog.min.io/erasure-coding/>
- [[Founsure]] *Founsure 1.0: An Erasure Code Library with Efficient Repair*. <https://arxiv.org/pdf/1702.07409>
- [[Integrity-Storage]] *Ensuring Data Integrity in Storage: Techniques and Applications* (hash digests before fragmentation, verify after). <https://www.fsl.cs.sunysb.edu/docs/integrity-storagess05/integrity.html>
- [[Self-Repair-Untrusted]] *Towards Self-Repairing Replication-Based Storage Using Untrusted Clouds* (repair + periodic integrity checks). <https://web.njit.edu/~crix/publications/acm-codaspy13.pdf>

**Side-channel / constant-time (why the digital core must be hardened)**
- KyberSlash (secret-dependent division timing → key recovery): <https://eprint.iacr.org/2024/1049> · FO comparison timing: <https://eprint.iacr.org/2020/743> · Sapphire digital lattice processor (constant-time): <https://eprint.iacr.org/2019/1140>

**Galerina Knowledge-Bases** (`C:\wwwprojects\Galerina\docs\Knowledge-Bases\`)
- `galerina-quantum-resistance-posture.md` (Shor/Grover; keep SHA-256; ML-KEM deferred; PQ cold-paths) ·
  `galerina-three-valued-governance.md` (K3 operators; fail-closed + no-coercion theorems; collapse) ·
  `galerina-substrate-failure-model.md` (`SPORE-SUBSTRATE-001..004`; noise model; TMR; "cannot fail open") ·
  `galerina-photonic-tri-substrate-rd-agenda.md` ("crypto cannot be analog"; no invented crypto) ·
  `galerina-substrate-contracts.md` (substrate `{lane/tolerance/redundancy}`; crypto-on-core fix) ·
  `galerina-security-secret-safety.md` (HSM/KMS; `KeyHandle`/`ProtectedSecret`; constant-time; fail-closed) ·
  `galerina-security-compile-time-crypto.md` (sealed crypto policy; no downgrade; `SPORE-CRYPTO-*`) ·
  `scoped-vaults.md` / `session-vault.md` (scoped, audited custody) ·
  `galerina-signed-attestation.md` (Ed25519→ML-DSA-65; "signs what it proves") ·
  `hybrid-electronic-optical-compute.md` (good vs bad optical candidates; governance stays electronic) ·
  `galerina-hardware-future-substrates.md` (**:63 contradiction**; "no hardware is a source of authority") ·
  `galerina-photonic-ternary-bridge-spec.md` (`Tri` is logic not arithmetic; `ternary-balanced` is compute-only) ·
  `mathematics-and-tri-logic.md` (exact numeric types; no base-3 arithmetic) ·
  `galerina-cross-layer-resilience.md` / `galerina-resilience-observability-design.md` (self-heal = zeroize/degrade) ·
  `galerina-governed-memory-blocks.md` / `galerina-governance-verifier-architecture.md` (re-check hashes; gate ≠ exec) ·
  `galerina-core-logic-tristate-developer-guide.md` / `galerina-core-logic-omni-logic.md` (secret-access; advisory barred from authority).

> **Companion analysis:** a focused treatment of "can crypto run on a photonic substrate" exists in the sister
> repo at `Galerina-TritMesh/research/encryption-on-photonic-substrates.md` (same verdict, narrower scope).
