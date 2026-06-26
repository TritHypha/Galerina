<!-- ABSORBED R&D SOURCE — verbatim mirror. Galerina is the main library; the R&D repo is upstream/authoring.
     Source: Galerina-R-AND-D/tmf/research/encryption-architecture.md  ·  Pinned: R&D fb68d06 (2026-06-16)
     Integrated Galerina view: galerina-tmf-engine.md  ·  Catalog: galerina-rd-absorption-catalog.md
     Rule: edit the upstream source then re-vendor; do not fork this copy (feedback-auto-import-rd-docs). -->

> **Absorbed R&D source (verbatim).** This is the archived upstream document. Curated/integrated view: `galerina-tmf-engine.md`. See `galerina-rd-absorption-catalog.md` for the full ledger. Internal links below point at the upstream R&D tree.

---
# Encryption architecture for `.tmf` / TritMesh on a (photonic) Galerina substrate

**Scope.** A grounded, quantum-resilient, zero-trust **encryption + integrity + authenticity**
design for the `.tmf` data fabric, usable on commodity hardware today, with a clearly-separated
aspirational track for photonic/ternary acceleration. Built on your four-pillar primitive choice
(ML-KEM, ML-DSA, Ascon, ZK-SNARKs), grounded in the finalized NIST PQC standards and the Galerina
Knowledge-Bases.

**Companion docs:**
[ledger](real-vs-aspirational-ledger.md) ·
[ternary-in-crypto](ternary-in-cryptography.md) ·
[TMX-256 construction](../spec/tmx-256-construction-v0.md) ·
[open questions](open-questions.md) ·
[external-repos analysis](external-repos-analysis.md).

> **Ratified architecture decisions (2026-06-15).** Engine = capability-bounded **wrapped backend**
> (*govern, don't absorb*), TS/`.spore` governance in `packages-galerina/`, declared **`lane: digital`** so the
> *already-shipped* `verifySubstrate()` / `SPORE-SUBSTRATE-001` enforces §6 for free. **Confidentiality
> (ML-KEM + Ascon) is DEFERRED** — Integrity + Authenticity ship first (TMX-256 root +
> `BridgeManifest` Ed25519→ML-DSA-65, one shared attestation idiom). The §6 "hard line" below is therefore
> *existing machinery*, not a proposal; and **provenance integrity ≠ value reproducibility** (the signature
> proves *which bytes*, not that a re-run agrees within ε).

---

## 0. Amendments ratified on takeover (2026-06-16)

*Both encryption tracks are now under one owner (see `..\..\CROSSOVER-encryption-rnd.md`). These amendments
supersede the cipher/metadata specifics below where they differ.*

1. **AEAD = a crypto-profile registry; default AES-256-GCM** (not Ascon-AEAD128). `.tmf` is a data fabric on
   commodity/server hardware holding presumptively long-lived confidential data, so the **256-bit** Grover
   margin + AES-NI throughput + suite-consistency with the level-3 ML-KEM-768/ML-DSA-65 make AES-256-GCM the
   default. **Ascon-AEAD128** (SP 800-232) is retained as the **constrained/embedded** profile;
   **ChaCha20-Poly1305** is the no-AES-NI alternate (XChaCha20-Poly1305 for random/extended nonces). The
   §1/§2/§4/§7 "Ascon" lines below predate this and are now the *constrained* profile, not the default.
2. **Committing AEAD + pinned KDF.** Bind `H(K_aead)` into the AAD (committing construction); KDF = SHAKE256
   + domain-separation context, KMAC256 the FIPS alternate.
3. **Metadata-routing kill.** A cleartext semantic attribute/embedding layer cannot survive zero-trust —
   embeddings invert to ~plaintext (vec2text ~92% on 32-token text). The attribute/Vector sections are
   **encrypted inside the DEM**; fine semantic filtering happens **only at trusted, post-verify endpoints**,
   never on cleartext in-network; any cleartext routing coordinate must be opaque/non-semantic. (Drops the
   source notes' "firewalls filter on meaning" feature.) See `..\..\tri-encription\research\metadata-confidentiality.md`.

---

## 1. The three jobs (don't blur them)

Most of the confusion in the source notes comes from collapsing three distinct cryptographic
jobs into one "make it secure" blob. Keep them separate; they use different primitives and have
different failure modes.

| Job | Question it answers | Primitive | Failure mode |
|---|---|---|---|
| **Integrity** | "Are these the exact bytes, at these coordinates?" | **TMX-256** (SHAKE256 tree XOF) | detect → **fail closed** |
| **Authenticity** | "Did the right key-holder vouch for this?" | **ML-DSA-65** (FIPS 204) over the root | verify → **fail closed** |
| **Confidentiality** | "Can only the intended party read this?" | **ML-KEM** (FIPS 203) + **Ascon-AEAD128** (SP 800-232) | decrypt-or-reject |

Plus two optional/contextual jobs:

| Job | Primitive | Notes |
|---|---|---|
| **Private query** | **ZK-SNARK** (Groth16/Plonk) | hide query *parameters* from an untrusted host; optional add-on |
| **Transport** | **TLS 1.3** (hybrid PQC) + Trust Capsule | reuse Galerina's data-in-motion layer; don't reinvent |

The golden rule, applied throughout: **sign over a hash; encrypt the data, sign the root; never
substitute one primitive's job for another.**

---

## 2. Quantum resilience — what "quantum-safe" actually requires here

A quantum adversary breaks **public-key** crypto (Shor → RSA/ECC/ECDH/EdDSA) and **halves**
symmetric/hash security (Grover). The grounded consequences:

- **Public-key must migrate to PQC.** Replace ECDH→**ML-KEM**, EdDSA/ECDSA→**ML-DSA** (and/or
  **SLH-DSA** as a hash-based backup; **FN-DSA/Falcon** is still draft FIPS 206 — don't depend
  on it yet).
- **Hashes mostly stay.** SHA-256 / SHAKE256 keep ~128-bit security under Grover at 256-bit
  output — **fine**. This is why TMX uses SHAKE256 and Galerina **keeps** SHA-256. Do **not**
  "replace SHA-256 with a signature" (category error).
- **Symmetric: use ≥256-bit-flavored strength.** Ascon-AEAD128 targets 128-bit security
  (adequate vs. Grover for most data); for long-lived archival confidentiality consider an
  additional AES-256-GCM or Ascon layer per the data's retention horizon.
- **Harvest-now-decrypt-later is the live threat** for confidentiality: data exfiltrated today
  can be decrypted once a CRQC exists. So confidentiality (ML-KEM) is the part that needs PQC
  *first*, even before signatures — anything you encrypt now with classical KEX is already at
  risk.

**Hybrid during transition (recommended).** Use **X25519 + ML-KEM-768** for key establishment
and **Ed25519 + ML-DSA-65** dual-signatures. You stay secure if *either* component holds — this
is also Galerina's stated posture (Ed25519 live, ML-DSA-65 migration on cold paths).

---

## 3. The zero-trust spine: three-valued, fail-closed (the real "tri-logic")

NIST SP 800-207 zero trust = **"never trust, always verify,"** per-session least privilege,
continuous verification, all data sources treated as resources. Galerina already encodes this as
**deny-by-default + taint/unsafe types + capability gating + mandatory audit**, and adds the
piece binary security models fumble: a **proved three-valued decision**.

**Every verification in this system yields a trit, not a bool:**

```
verify(x) ∈ { +1 allow/valid , 0 unknown/indeterminate , −1 deny/invalid }
collapse(+1) = allow ;  collapse(0) = deny ;  collapse(−1) = deny     // fail closed
```

Applied across the encryption stack:

| Check | `+1` | `0` (→ deny) | `−1` (→ deny) |
|---|---|---|---|
| TMX root vs. recomputed | match | path incomplete / not yet computed | mismatch |
| ML-DSA-65 signature | verified valid | not yet verified / stale attestation | verified invalid |
| ML-KEM decapsulation | key established | peer offered unknown alg / negotiation incomplete | dec*aps* failure |
| Authorization (`query-access.spore`) | clearance+region OK | cross-region / touches protected | clearance too low |

The **No-Coercion** and **substrate-cannot-fail-open** theorems (see
[ternary-in-crypto §2](ternary-in-cryptography.md)) guarantee that "unknown" can never be
coerced into "allow" — including by a noisy substrate. This is what lets you put *bulk* compute
on fast/approximate hardware while the *gate* stays safe (§6).

---

## 4. The layered architecture (data at rest, in motion, in use)

```
                          ┌───────────────────────────────────────────────┐
  GOVERN (.spore)           │ 3-valued authz · egress redaction · audit      │  allow/deny/unknown→deny
                          └───────────────────────┬───────────────────────┘
                                                  │ governed effect calls
  PRIVATE QUERY (opt.)    ┌───────────────────────▼───────────────────────┐
                          │ ZK-SNARK: prove query is well-formed/authorized │  Groth16/Plonk
                          │ without revealing parameters to the host        │
                          └───────────────────────┬───────────────────────┘
  TRANSPORT (in motion)   ┌───────────────────────▼───────────────────────┐
                          │ TLS 1.3 + HYBRID KEX (X25519 + ML-KEM-768)      │  data-in-motion
                          │ Trust Capsule / attestation binds the session   │  unsafe-until-verified
                          └───────────────────────┬───────────────────────┘
  CONFIDENTIALITY (rest)  ┌───────────────────────▼───────────────────────┐
                          │ ML-KEM encapsulates a data key → Ascon-AEAD128  │  per-section AEAD
                          │ encrypts section payloads (AAD = coord∥modality)│
                          └───────────────────────┬───────────────────────┘
  AUTHENTICITY           ┌───────────────────────▼───────────────────────┐
                          │ ML-DSA-65 signs the TMX-256 root (hybrid w/ Ed) │  sign over hash
                          └───────────────────────┬───────────────────────┘
  INTEGRITY              ┌───────────────────────▼───────────────────────┐
                          │ TMX-256 3-ary tree XOF over coordinate-bound    │  SHAKE256, fail-closed
                          │ leaves  →  signed root                          │
                          └───────────────────────┬───────────────────────┘
  STORE                  ┌───────────────────────▼───────────────────────┐
                          │ .tmf container (typed sections, payload region) │
                          └───────────────────────────────────────────────┘
  ───────────────────────────────────────────────────────────────────────────────────────
  ACCEL (aspirational, OUTSIDE the trust gate): SIMD → GPU → ternary/photonic for ANN/tensor only
```

### 4.1 Confidentiality detail — how ML-KEM and Ascon combine (KEM-DEM)

This is the standard, safe **KEM-DEM** pattern; don't invent a new one:

1. **Encapsulate (ML-KEM-768).** Sender runs `(ct, K) = ML-KEM.Encaps(pk_recipient)`. `K` is a
   shared secret; `ct` is stored/transmitted alongside the data.
2. **Derive keys.** `k_data = KDF(K, "tmf-aead-v0" ∥ context)` using SHAKE256/KMAC as the KDF
   (FIPS-friendly).
3. **Encrypt (Ascon-AEAD128).** For each section: `(c, tag) = Ascon.Enc(k_data, nonce, payload,
   AAD = LE16(kind) ∥ LE16(modality) ∥ coord)`. Binding the **coordinate + modality as AAD**
   means a ciphertext can't be replayed at a different mesh position (confidentiality-layer echo
   of TMX's position-binding).
4. **Integrity/authenticity over ciphertext.** Build the TMX tree over the **encrypted** section
   bytes (encrypt-then-MAC discipline: the signed root covers ciphertext, so tampering is caught
   before any decryption attempt). Sign the root with ML-DSA-65.
5. **Nonce discipline.** Per-section random/counter nonce, never reused under the same `k_data`;
   rotate `k_data` per file (fresh ML-KEM encapsulation per `.tmf`).

> Why encrypt-then-sign-the-root (not sign-then-encrypt): the verifier checks integrity +
> authenticity on the ciphertext and **fails closed before spending a decryption** on attacker-
> controlled bytes — smaller attack surface, classic AEAD ordering.

### 4.2 What to reuse, not reinvent (from Galerina KBs)

- **Data-in-motion:** all boundary data is `unsafe` until validated; channels/portals enforce
  TLS + cert + identity. Use these — don't hand-roll transport crypto.
- **Trust Capsule / signed attestation:** compiler-generated identity + hashes + signature
  (SPIFFE/SPIRE + Sigstore/Cosign-inspired). Bind the `.tmf` root and the public keys into it.
- **Compile-time crypto policy (`SPORE-CRYPTO-001..008`):** algorithm choices are compile-time
  constants, not runtime strings — so a config tweak can't downgrade you to a weak cipher.
- **SecureRandom vs Random:** keys/nonces/tokens must come from `SecureRandom`, never `Random`.

---

## 5. Threat model (abridged STRIDE, fail-closed responses)

| Threat | Vector | Mitigation | Residual / open |
|---|---|---|---|
| **Tamper** with stored data | flip bytes / swap a cell to another coordinate | TMX leaf binds `(kind,modality,coord)`; signed root; fail-closed reader | unsigned files: no defense vs. full rewrite (by design) |
| **Spoof** authorship | forge a `.tmf` | ML-DSA-65 over root; hybrid w/ Ed25519 | key custody (see open Q) |
| **Harvest-now-decrypt-later** | capture ciphertext, decrypt post-CRQC | ML-KEM-768 (PQC KEX) now, not classical | choice of ML-KEM param set vs. size |
| **Replay** a ciphertext elsewhere | move a valid encrypted cell | coord∥modality as AEAD AAD + TMX binding | cross-file replay needs per-file key + context in KDF |
| **Downgrade** crypto | force weak alg / drop PQC half | compile-time const policy; hybrid requires *both* | negotiation must treat unknown alg as `0 → deny` |
| **Side channel** (timing) | observe verify/decrypt timing | constant-time ML-DSA/ML-KEM/Ascon impls; Ascon is side-channel-friendly | requires vetted libraries, not hand-rolled |
| **Info leak** via results | egress of protected fields | `.spore` egress redaction; 3-valued authz | needs the Galerina gaps closed (bytes/closures) |
| **Self-heal abuse** | reconstruction path inside the gate | **forbidden**: repair is out-of-gate, must re-verify vs. signed root | availability-only feature |

---

## 6. The hard line: crypto on a deterministic core (photonic stays out)

The one durable engineering insight to carry forward from the whole photonic/ternary thread,
stated as an enforceable rule (Galerina `SPORE-SUBSTRATE-001`):

> **Bulk compute may be photonic/ternary/approximate; integrity and crypto must stay on a
> deterministic, bit-exact core.**

- ✅ On the fast/approximate substrate (SIMD/GPU/ternary/photonic, *if it ever exists*): ANN
  vector search, embeddings, NVFP4 tensor ops — error-tolerant, measurable.
- ❌ Never on it: TMX hashing, ML-KEM, ML-DSA, Ascon — they need exact bits; "close enough" is a
  verification failure and an attacker target.

Encode this as a contract: any flow carrying a `Crypto`/`Hash`/`Sign` effect must declare
`lane: digital`; a noisy-lane declaration with a crypto effect is rejected. This is what makes
the aspirational track *safe to keep* — it can never reach into the trust gate.

---

## 7. Recommended v0 (buildable now) vs. later

**v0 — build on commodity hardware:**
- TMX-256-SHAKE integrity tree (✅ spec'd + test-vectored).
- ML-DSA-65 (hybrid w/ Ed25519) signing the root — wire a *vetted* FIPS-204 library; until
  then, mark signing **Blocked**, don't fake it.
- KEM-DEM confidentiality: X25519+ML-KEM-768 → SHAKE256 KDF → Ascon-AEAD128 per section.
- Three-valued, fail-closed verification spine; reuse Galerina data-in-motion + Trust Capsule.

**Later / opt-in:**
- ZK-SNARK private query (Groth16/Plonk) — real, but trusted-setup + proving cost; scope it.
- Speed hash profiles (KT256 / BLAKE3) — non-FIPS, only with benchmarks.
- Ternary/photonic acceleration for *non-crypto* bulk math — aspirational, benchmark-gated.

**Don't ship:** any fixed RPS/latency number, "single clock cycle," "signature is the address,"
"ternary ML-KEM," in-gate self-healing.

## Sources
- NIST SP 800-207 *Zero Trust Architecture* — https://csrc.nist.gov/pubs/sp/800/207/final
- FIPS 203 ML-KEM — https://csrc.nist.gov/pubs/fips/203/final · FIPS 204 ML-DSA — https://csrc.nist.gov/pubs/fips/204/final · FIPS 205 SLH-DSA — https://csrc.nist.gov/pubs/fips/205/final
- NIST SP 800-232 Ascon (AEAD128/Hash256/XOF128/CXOF128) — https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-232.pdf
- FIPS 202 SHA-3/SHAKE — https://csrc.nist.gov/pubs/fips/202/final · SP 800-185 cSHAKE/KMAC/ParallelHash — https://nvlpubs.nist.gov/nistpubs/specialpublications/nist.sp.800-185.pdf
- RFC 9861 KangarooTwelve/TurboSHAKE — https://www.rfc-editor.org/rfc/rfc9861.html
- FIPS 206 FN-DSA (Falcon) status, draft 2025 — https://csrc.nist.gov/presentations/2025/fips-206-fn-dsa-falcon
- Galerina KBs (read 2026-06-15): `galerina-quantum-resistance-posture.md`, `galerina-post-quantum-hardware-security.md`, `galerina-security-compile-time-crypto.md`, `data-in-motion-security.md`, `automated-runtime-trust-strategy.md`, `galerina-three-valued-governance.md`, `galerina-substrate-contracts.md`
