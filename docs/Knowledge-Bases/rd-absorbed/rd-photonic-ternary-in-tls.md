<!-- ABSORBED R&D SOURCE — verbatim mirror. Galerina is the main library; the R&D repo is upstream/authoring.
     Source: Galerina-R-AND-D/tmf/research/photonic-ternary-in-tls.md  ·  Pinned: R&D fb68d06 (2026-06-16)
     Integrated Galerina view: (this archive copy is the primary KB home)  ·  Catalog: galerina-rd-absorption-catalog.md
     Rule: edit the upstream source then re-vendor; do not fork this copy (feedback-auto-import-rd-docs). -->

> **Absorbed R&D source (verbatim).** This is the archived upstream document. See `galerina-rd-absorption-catalog.md` for the full ledger. Internal links below point at the upstream R&D tree.

---
# Photonic / ternary in TLS·SSL (HTTPS) — honest role-mapping

> **Status:** research findings (2026-06-16). **Lane:** the HTTPS sibling of the photonic-lane-{A,B,C,D}
> family and the encryption/signing notes — *not* a fifth signing lane, but the transport-layer projection of
> the same crypto-on-core verdict onto TLS 1.3.
> **Posture (binding, inherited from `../../ENCRYPTION-RND-FULL-BRIEF.md` and the phase charter
> [`../../RESEARCH-PHASE-photonic-signing-and-trust-capsule.md`](../../RESEARCH-PHASE-photonic-signing-and-trust-capsule.md)):**
> grounded + cited (FIPS/NIST/RFC/IETF/peer-reviewed only); honest-core vs aspirational kept strictly separate;
> **no performance number without a reproducible benchmark + the machine it ran on**; **no invented crypto**
> (no "ternary X.509", no analog cipher/hash); fail-closed (`unknown → deny`).
> **REUSE — do not re-derive.** The crypto-on-core / precision-wall-vs-exact-modular proof is already written
> for the encryption sibling: `Galerina-TritMesh/TritMesh/research/encryption-on-photonic-substrates.md` **§2.1**
> (hardware: analog optics ≈4–8 ENOB, error-tolerant *by design*), **§2.2** (crypto: lattice math is
> exact-modular, fail-closed via the FO re-encrypt/compare), **§4** (the per-stage analog-eligible? table), and
> **§5** (photonics' one honest home = the ANN layer, outside the trust gate). The "no photonic SHA-256"
> verdict is `../../ENCRYPTION-RND-FULL-BRIEF.md` §3 (and verdict 2 of §4) and
> `../../tri-encription/research/photonic-sha256-integrity.md` §0. **This note cites those — it does not
> rebuild them.** TLS is just the place those primitives get *composed* on the wire; the substrate verdict is
> inherited unchanged.
> **Cross-refs:** charter §1 (the four lanes), `governed-trust-capsule-v0.md` (the COSE token that rides over
> TLS), `signature-custody-v0.md` (the #34 hybrid Ed25519 + ML-DSA-65 sig), crypto-on-core `SPORE-SUBSTRATE-001`,
> three-valued governance `SPORE-GOV-3VL-001`.
> **Boundary:** R&D-only. `Galerina/packages-galerina` (production) and `Galerina-TritMesh` (product) are read-only
> grounding; any change they need is recorded here as a recommendation, not an edit.

---

## 0. Bottom line up front

**No part of the TLS trust path can run on a noisy photonic/analog substrate, and no "ternary TLS" cipher or
cert format should be invented.** Every cryptographic operation TLS 1.3 performs — the certificate signature,
the key-exchange (ECDHE / ML-KEM), the handshake **transcript hash + HKDF**, and the **AEAD** record protection
— is bit-exact, fail-closed arithmetic of exactly the kind the encryption note already proved analog optics
cannot compute (`encryption-on-photonic-substrates.md` §2). TLS does not introduce a new substrate question; it
**composes the same primitives** the encryption and signing notes already adjudicated, so the verdict is
inherited, not re-litigated.

Where Galerina and photonics *do* have honest, in-scope roles around TLS:

1. **Digital PQ-TLS is the real "post-quantum HTTPS"** — hybrid **X25519 + ML-KEM-768** key exchange + **ML-DSA**
   certificate signatures, both 100% digital, and both already aligned with Galerina's shipped **hybrid
   Ed25519 + ML-DSA-65** posture. This is the recommendation, and it reuses primitives we already have.
2. **Photonics sits strictly *around* the TLS gate, never inside it** — **QRNG** as a handshake-entropy *source*;
   **optical-PUF** as hardware-bound mTLS device identity (defense-in-depth, with the modeling-attack caveat);
   **photonic-ANN** for traffic analysis on **already-decrypted-and-verified plaintext**. None of these is a
   TLS cryptographic primitive.
3. **The genuine "Tri" fit is a governance decision, not a signal.** A **K3 three-valued cert-validation gate**
   (`valid / invalid / unknown → deny`, **revocation-unknown ⇒ deny**) is where Galerina adds value: *govern the
   TLS trust decision*, do not rebuild TLS. This is three-valued **logic**, not three-level analog signaling.
4. **The Trust Capsule binds to the TLS channel** via `cnf` / holder-of-key (RFC 8705 / RFC 9449 / RFC 8473
   token binding), so a stolen token cannot be replayed off-channel.

No performance number is asserted anywhere in this note.

---

## 1. The inherited proof (cited, not re-derived)

The task's binding constraint is the **same two-argument proof** as the encryption note. Stated once, by
reference, so the rest of the note can lean on it:

- **Hardware argument** (`encryption-on-photonic-substrates.md` §2.1): analog photonic processors are
  **≈4–8 effective bits**, noise-limited, and "well-suited for AI inference and optimization … *rather than
  applications requiring deterministic, exact arithmetic precision*." That is a textbook **anti-spec** for
  cryptography. [[ENC-NOTE]]
- **Crypto argument** (`encryption-on-photonic-substrates.md` §2.2): the lattice/EC/symmetric math TLS runs is
  **exact-modular** over a finite ring (q = 3329 for ML-KEM, q = 8380417 for ML-DSA, GF(2¹²⁸) for GHASH, the
  Keccak/SHA-2 permutations), where a single wrong coefficient/bit fails closed — a wrong shared secret, a
  failed FO re-encryption compare, a wrong AEAD tag, a different transcript hash. The gap between "exact integer
  to <0.5 LSB" and "≈4–8 ENOB" is **>16 bits — fundamental, not a calibration problem.** [[ENC-NOTE]]
- **The hash corollary** (`ENCRYPTION-RND-FULL-BRIEF.md` §3 / §4 verdict 2;
  `photonic-sha256-integrity.md` §0): there is **no photonic SHA-256/SHA-3** and there should not be — the
  precision wall vs the strict-avalanche property is irreconcilable, and SHA-256 is already Grover-acceptable so
  a photonic hash buys nothing. The TLS transcript hash and HKDF are Keccak/SHA-2; the same verdict applies
  verbatim. [[BRIEF]] [[SHA-NOTE]]

The crypto-on-core invariant this enforces is Galerina's `SPORE-SUBSTRATE-001`: integrity/keying/signing **must**
run on a deterministic, bit-exact lane; binding them to a noisy/photonic lane is a build error, every profile,
and the fix is structural (move to a digital lane), never "raise redundancy." [[ENC-NOTE §1.3]]

**Everything in §2 below is an *application* of this proof to the four TLS layers — no new substrate claim is
made.**

---

## 2. Per-TLS-layer table — what must stay digital, and why

TLS 1.3 (RFC 8446) has four cryptographic jobs. Each is classified by **operation type** and **analog-eligible?**
exactly as the encryption note's §4 table classifies the KEM-DEM pipeline. "Analog-eligible?" asks only whether
the *operation type* could in principle tolerate analog error — **not** whether we recommend it (we do not, for
anything in the trust path). The answer is **No** for every TLS trust-path operation, citing the §2 proof.

| TLS 1.3 layer | Operation type | Analog-eligible? | Must be deterministic-digital because… (cites §2 proof) |
|---|---|---|---|
| **Certificate signature** — issuance `Sign` + chain `Verify` (`CertificateVerify`, RFC 8446 §4.4.3) | exact-modular lattice / EdDSA / RSA-PSS / ECDSA | **No** | EUF-CMA: one flipped bit ⇒ a different signature ⇒ verify fails. Same precision-wall-vs-unforgeability bar as the signing note (`photonic-lane-A` §1; `encryption-on-photonic-substrates.md` §4 row 2). A photon cannot *be* the cert signature. |
| **Key exchange — (EC)DHE** (X25519 / P-256) | exact modular EC point arithmetic over a prime field | **No** | A wrong field element ⇒ a wrong shared point ⇒ a wrong `(EC)DHE` secret ⇒ the derived `handshake_secret` differs ⇒ the `Finished` MAC fails ⇒ fail closed. Exact, not error-tolerant. [[RFC8446 §7.1]] |
| **Key exchange — ML-KEM** (FIPS 203, in PQ/hybrid TLS) | exact-modular lattice (NTT over ℤ_q, q=3329) + FO re-encrypt/compare | **No** | The encryption note's central case (§2.2): a single analog coefficient error ⇒ FO re-encryption mismatch ⇒ wrong shared secret ⇒ downstream AEAD fails. The cryptographic decryption-failure budget (~2⁻¹³⁹) **cannot** absorb few-percent analog error. [[ENC-NOTE §2.2]] [[FIPS-203]] |
| **Transcript hash + key schedule (HKDF)** — `Transcript-Hash`, `HKDF-Extract`/`Expand-Label` (RFC 8446 §7.1, RFC 5869) | bit/permutation logic (SHA-256/384, HMAC) | **No** | A hash is **not** error-tolerant by definition; one flipped bit ⇒ a totally different digest ⇒ a totally different key. This is exactly the "no photonic SHA-256" verdict (`BRIEF` §3; `photonic-sha256-integrity.md` §0). HKDF is keyed Keccak/SHA-2 — same wall. [[BRIEF]] [[SHA-NOTE]] [[RFC5869]] |
| **AEAD record protection** — AES-128/256-GCM or ChaCha20-Poly1305 (RFC 8446 §5.2) | block/stream cipher + GF(2¹²⁸)/(2¹³⁰−5) MAC | **No** | One bit flip ⇒ wrong plaintext / tag-verify fail; GHASH and Poly1305 are exact finite-field MACs. Identical to the encryption note's §4 AEAD row. Fail closed on tag mismatch. [[ENC-NOTE §4]] [[RFC8446 §5.2]] |

**The pattern is identical to the encryption note's §4: everything inside the TLS trust boundary is "No."** The
only "Yes" anywhere near TLS is the *application* layer (traffic-analysis ANN over already-decrypted-and-verified
plaintext), which is **not TLS crypto** and lives **outside** the trust gate (§5.3). A "ternary cipher" or
"ternary X.509" would be invented, unvetted, crypto-on-core-violating crypto — **rejected** (§7).

> **Why TLS adds nothing new to the substrate question.** TLS does not invent a primitive; it *sequences*
> primitives the encryption and signing notes already adjudicated — KEX (encryption note), cert signature
> (signing note), hash/KDF (the SHA-256 verdict), AEAD (encryption note). The transport layer is therefore a
> **composition** of already-settled "must-stay-digital" verdicts. Re-deriving the wall here would be redundant;
> the cite-and-apply above is the honest move.

---

## 3. The real post-quantum HTTPS — PQ-TLS, mapped onto Galerina's shipped posture

This is the genuinely actionable, 100%-digital recommendation. It is the HTTPS instance of the same hybrid the
project already ships.

### 3.1 The IETF state of PQ-TLS (cited, real, digital)

- **Hybrid key exchange in TLS 1.3** — `draft-ietf-tls-hybrid-design` defines concatenating a classical and a
  PQ KEM share so the session is secure if **either** holds. The deployed instantiation is **X25519MLKEM768**
  (codepoint `0x11ec`), registered for the TLS `supported_groups`/`key_share` and **already shipping at scale**
  (Chrome/Firefox enabled it through 2024–2025; Cloudflare and AWS report it on production endpoints). It
  defends against **harvest-now-decrypt-later** from day one. [[HYBRID-DESIGN]] [[X25519MLKEM768]] [[NIST-PQTLS]]
- **PQ certificate signatures** — `draft-ietf-tls-mldsa` (and the LAMPS X.509 work,
  `draft-ietf-lamps-dilithium-certificates`) define **ML-DSA** (FIPS 204) as a TLS/X.509 signature algorithm.
  Cert-chain signing/verification stays exact-modular and digital (§2 row 1). Adoption is earlier-stage than the
  KEM (larger sigs/keys are the cost; see §3.3). [[TLS-MLDSA]] [[LAMPS-MLDSA]]
- **Transcript hash + HKDF + AEAD are unchanged** by PQ — they were already quantum-acceptable (SHA-256 is
  Grover-only-quadratic; AES-256-GCM has a 256-bit key). No PQ swap is needed there; "post-quantum TLS" is a
  **KEX + signature** upgrade, not a hash/AEAD upgrade. [[BRIEF]]

### 3.2 The mapping onto Galerina's hybrid Ed25519 + ML-DSA-65

Galerina already ships a **hybrid Ed25519 + ML-DSA-65** signature, AND-verified, as the mandatory certified-mode
posture (`signature-custody-v0.md` §2.1 = the #34 construction; charter §0). The TLS picture lines up almost
one-for-one:

| TLS PQ component (digital) | Galerina's shipped analog (same family) | Reuse |
|---|---|---|
| **Hybrid KEX** X25519 + ML-KEM-768 (NIST L3) | the encryption sibling's recommended KEM-DEM uses exactly **X25519 + ML-KEM-768** (`encryption-on-photonic-substrates.md` §7.1) — the confidentiality half of the same posture | **Direct** — the `.tmf` confidentiality recommendation *is* the TLS hybrid-KEM choice; one decision serves both at rest and in transit. |
| **PQ cert sig** ML-DSA (FIPS 204) | Galerina's **ML-DSA-65** half of the #34 hybrid (NIST L3, pairs with ML-KEM-768's L3) | **Direct** — the PQ half of a Galerina cert signature is the same primitive/level Galerina already signs `.tmf` roots and Trust Capsules with. |
| **Hybrid (classical + PQ) AND-composition** | Galerina's **AND-verified** Ed25519 + ML-DSA-65 (both must verify, downgrade = fail closed) | **Direct** — TLS hybrid is `secure-if-either`; Galerina sig hybrid is `valid-only-if-both`. Same defense-in-depth instinct, applied at the layer each is meant for (KEX = OR for availability; signature = AND for unforgeability). The distinction is worth keeping explicit and is honoured in `governed-trust-capsule-v0.md` §4. |
| **Transcript hash / HKDF / AEAD** | SHAKE256/SHA-256 + AES-256-GCM already in-tree (TMX-256, `tmf-encryption-v0`) | **Direct** — same Keccak/SHA-2 + AEAD cores; no new primitive. |

**Recommendation (digital, no perf claim):** when Galerina endpoints speak HTTPS, prefer **TLS 1.3 with
X25519MLKEM768 hybrid KEX and an ML-DSA(-65)-bearing certificate chain** (hybrid with a classical sig during
transition), which is the transport projection of the posture Galerina already enforces for signatures and
recommends for `.tmf` confidentiality. Galerina does **not** re-implement TLS; it **governs** the trust decision
over it (§4) and may **bind a Trust Capsule to the channel** (§6).

### 3.3 The PQ tax — honest, and *not* quantified here

PQ-TLS is not free: ML-KEM-768 shares and ML-DSA signatures/keys are larger than their classical counterparts,
which inflates handshake bytes and can spill the TLS `ClientHello`/cert across more packets (the well-documented
"PQ handshake size" concern in the IETF drafts). **No latency or throughput number is asserted here.** The
project's measurement path for the PQ cost already exists and is the only place such a number may be earned: the
`crypto-ops` / Lane-A benchmark harness (`tri-encription/bench/`, e.g. `lane-a-baseline.mjs`) measured ML-DSA-65
sign/verify on a **stated** machine (Intel Core i9-9900K @ 3.60 GHz, Node v24.16.0, `@noble/post-quantum` 0.6.1
— `photonic-lane-A-accelerated-signing.md` §6.5: sign ≈ 5.63 ms mean, verify ≈ 1.566 ms mean over 10⁴ runs,
pure-JS single-thread, order-of-magnitude not a production ceiling). Any PQ-TLS handshake-cost figure must come
from a comparable reproducible bench **with its machine**, not from this note. [[LANE-A]] [[BRIEF]]

---

## 4. The K3 three-valued cert-validation governance gate (where Galerina adds value)

This is the genuine "Tri" fit, and it is **decision logic, not analog signaling** — the same distinction the
encryption note draws in §6 ("three-valued *logic* ≠ three-level *analog signaling*"). Galerina does **not**
rebuild TLS or X.509; it **governs the trust decision** over a validated chain, fail-closed.

Standard X.509 path validation (RFC 5280) is effectively two-valued (valid / invalid) but leaves **revocation
status genuinely unknown** when OCSP/CRL is unreachable, stapling is absent, or a soft-fail client silently
proceeds — the well-known *soft-fail* hole. A K3 (strong-Kleene) gate makes the third value first-class and
collapses it to deny:

```
cert_verdict : Trit ∈ { +1 = valid, 0 = unknown, −1 = invalid }

valid (+1)   ⇐ chain builds to a pinned/trusted root  AND  names/constraints/EKU satisfied
              AND  not-expired  AND  revocation == definitively-good (stapled OCSP / fresh CRL)
invalid (−1) ⇐ signature fails  OR  expired  OR  name/constraint/EKU mismatch
              OR  revocation == definitively-revoked
unknown (0)  ⇐ revocation status indeterminate (OCSP/CRL unreachable, no staple, stale)
              OR  chain incomplete  OR  policy/pin not yet resolvable

collapse(unknown) = deny            ; K3 collapseDeny — the No-Coercion rule (SPORE-GOV-3VL-001)
authorize(channel) ⇔ cert_verdict == +1
```

- **Revocation-unknown ⇒ deny (hard-fail).** This is the policy the soft-fail TLS ecosystem usually *doesn't*
  enforce; the K3 gate makes it the default. It mirrors the Trust Capsule reader's `unknown → deny`
  (`governed-trust-capsule-v0.md` §8 step 8) and Galerina's proven K3 calculus (`BRIEF` §4 finding 3:
  `authorize(v) ⇔ v=+1`, `collapse(0)=deny`, No-Coercion theorem). [[BRIEF]]
- **What it governs** (over a TLS-library-validated chain — Galerina consumes the library's verdict, it does not
  re-implement ASN.1/path-building): pinning (SPKI pin match), name constraints, EKU/usage, freshness, and the
  revocation tri-state. Any branch that is not a definitive `+1` is `0` or `−1`, both → deny.
- **Three-valued logic, not analog.** The trit here is a *governance verdict* (a decision), exactly like the
  encryption note's `deny/unknown/allow`. It is **not** a three-level optical signal and carries no substrate
  claim — `SPORE-SUBSTRATE-001` is untouched. [[ENC-NOTE §6]]

> **Honest scope:** "revocation-unknown ⇒ deny" is a *strict* policy; on the public web it can cause
> availability failures when responders are flaky (the reason browsers soft-fail). For Galerina's
> zero-trust/fail-closed posture it is the correct default; the gate should expose the verdict and reason so an
> operator can see *why* a connection was denied, not silently downgrade. This is a policy stance, not a
> performance or security-proof claim.

---

## 5. Photonics' honest roles AROUND TLS (outside the trust gate)

The same three roles the encryption/signing notes already license — re-projected onto a TLS handshake. **None of
these is a TLS cryptographic primitive.** Each maps to a charter lane.

### 5.1 QRNG → handshake entropy (Lane D — an entropy *source*, never the cipher)
TLS needs strong randomness: ephemeral (EC)DHE private keys, ML-KEM encapsulation randomness, the
`ClientHello.random`/`ServerHello.random`, session-ticket nonces, and FIPS-204 hedged-signing randomness for an
ML-DSA cert sig. A QRNG can **feed** the entropy pool. The hard constraints (inherited from
`governed-trust-capsule-v0.md` §9 and the brief): it is **behind SP 800-90B health tests + a SP 800-90A DRBG
conditioner**, it is an entropy *source* **outside** the cipher, never a crypto primitive, and a QRNG failure
must **fall back / fail closed**, never silently weaken key generation. Weak randomness here is catastrophic
(predictable ephemeral keys ⇒ session compromise), so the QRNG is defense-in-depth on entropy *quality*, not a
new trust root. [[CAPSULE §9]] [[SP-90B]]

### 5.2 Optical-PUF → mTLS device identity (Lane C — defense-in-depth, with the modeling-attack caveat)
For **mutual TLS**, the client presents a certificate. An optical-PUF can bind that client identity to specific,
non-exportable hardware: the client key is PUF-derived/PUF-wrapped and the device proves possession via
challenge-response. This is a **sender-constraint** (a "physical signature of possession"), complementary to —
**never a replacement for** — the digital client-cert signature.
- **The hard caveat (must travel with every mention):** optical PUFs are **ML-model-learnable** — a sufficiently
  sampled challenge-response set can be modeled/cloned in polynomial time for many constructions — so a PUF gives
  **no public verifiability** (needs an enrollment database) and **no classical non-repudiation**. It is
  **defense-in-depth only, never sole custody** (charter §1 Lane C; `governed-trust-capsule-v0.md` §9 row 1;
  `BRIEF` §3). Compromise of the PUF still leaves the digital client-cert signature standing.
- **Where it binds in TLS:** as a `cnf` holder-of-key confirmation on the client credential (§6) — the PUF
  proves the holder possesses the bound hardware key, *under* the digital mTLS signature, not instead of it.
  [[CAPSULE §9]] [[BRIEF]]

### 5.3 Photonic-ANN → TLS traffic analysis on verified plaintext only (the only earnable perf claim)
A photonic ANN is **error-tolerant real-valued GEMM** — the encryption note's §5.2 "one honest home" for
photonics. Its TLS-adjacent use is **traffic analysis / anomaly detection / attribute policy** on
**already-decrypted-and-verified plaintext at a trusted endpoint**, strictly **outside** the trust boundary,
with results **re-checked** against the verified store. Hard rules (inherited):
- **Never on the ciphertext, never in-network, never on the key.** Cleartext semantic embeddings on the wire
  ≈ plaintext (vec2text recovers ~92% of short text — `BRIEF` §4 finding 5), so any attribute/embedding vector
  is **encrypted in transit and matched only at the trusted end**. There is no leak-free in-network semantic
  routing. [[BRIEF]]
- **The only place a photonic *performance* claim could ever be earned, and only behind a reproducible benchmark
  + the machine.** No such benchmark exists here; no number is asserted (charter §4; `encryption-on-photonic-
  substrates.md` §5.2, §9 Q4).

---

## 6. Trust Capsule ↔ TLS channel binding (`cnf` / holder-of-key)

The Governed Trust Capsule (`governed-trust-capsule-v0.md`) is a COSE/CWT token that **rides over** a TLS
session; it does not replace TLS and is not a TLS primitive. The honest tie-in is **channel binding**, so a
stolen Capsule cannot be replayed off the channel it was issued for:

- **`cnf` (RFC 8747) key-confirmation** — the Capsule already carries an `8`=`cnf` claim
  (`governed-trust-capsule-v0.md` §2, §9). For TLS this becomes a **holder-of-key / sender-constrained** binding:
  the Capsule is bound to the key proven in the TLS handshake (an mTLS client cert, or an optical-PUF-derived key
  via §5.2), so only the holder of that channel key can present it. This is the standard
  **certificate-bound / DPoP-style** sender-constraint (RFC 8705 mTLS-bound tokens; RFC 9449 DPoP; RFC 8473
  token binding) expressed in the Capsule's `cnf`. [[RFC8747]] [[RFC8705]] [[RFC9449]]
- **`external_aad` channel binding** — the Capsule's signed-but-not-transmitted `external_aad` already binds
  *audience ‖ channel ‖ epoch ‖ purpose* (`governed-trust-capsule-v0.md` §5). Folding a TLS channel identifier
  (e.g. the exporter value from RFC 5705 *Keying Material Exporters for TLS*, or the connection's certificate
  hash) into that AAD means a Capsule replayed over a **different TLS channel** reconstructs a different `M` ⇒
  both hybrid signatures fail ⇒ replay denied, with the binding never appearing in the payload. [[RFC5705]]
  [[CAPSULE §5]]
- **Fail-closed under K3** — Capsule verification (`governed-trust-capsule-v0.md` §8) and the §4 cert gate are
  **both** K3 fail-closed: an absent/mismatched `cnf`, a channel-binding mismatch, or a `cert_verdict ≠ +1` all
  collapse to **deny**. The Capsule's trust decision is thus *composed under* the TLS channel's trust decision,
  both governed by the same `unknown → deny` rule. [[CAPSULE §8]]

**The honest framing:** the Capsule **complements** TLS (application-layer, end-to-end, PQ-hybrid-signed,
selectively-disclosable claims) and **binds to** TLS (channel binding stops cross-channel replay). It is not a
TLS alternative and introduces no TLS primitive.

---

## 7. Honest ledger — rejected claims (do not let these into the note as fact)

| Rejected claim | Why rejected (cite) |
|---|---|
| ❌ A photonic/analog computation that **is** the cert signature, the (EC)DHE/ML-KEM KEX, the transcript hash, or the AEAD | The §2 proof: precision wall (≈4–8 ENOB) vs exact-modular/fail-closed math; a photon cannot *be* any TLS trust primitive. (`encryption-on-photonic-substrates.md` §2, §4; `photonic-lane-A` §1) |
| ❌ "Ternary X.509" / a custom ternary cert format or a ternary TLS cipher | Invented, unvetted crypto — crypto-on-core violation. The only honest "trit" is a **governance verdict** (§4), and the fact that ML-KEM/ML-DSA polynomials are *already* balanced-ternary/small-signed but computed **exactly and digitally** (`BRIEF` §4 finding 3). [[BRIEF]] |
| ❌ "Photonic SHA-256" for the TLS transcript hash / HKDF | No photonic SHA-256 exists or should — precision wall vs avalanche; SHA-256 is already Grover-acceptable. (`BRIEF` §3; `photonic-sha256-integrity.md` §0) |
| ❌ Three-level **analog optical signaling** dressed up as "three-valued TLS" | The K3 gate (§4) is three-valued **logic** (a deny/unknown/allow decision), **not** an analog signal level. Conflating them is the category error the encryption note §6 names explicitly. [[ENC-NOTE §6]] |
| ❌ Optical-PUF as a TLS *signature* or sole device custody | PUFs are ML-modeling-attackable, need an enrollment DB, give no public verifiability / non-repudiation — **defense-in-depth only** (§5.2). (charter §1 Lane C; `CAPSULE` §9) |
| ❌ Photonic-ANN traffic analysis on ciphertext / in-network / on cleartext-on-the-wire | vec2text ⇒ embeddings ≈ plaintext; no leak-free in-network semantic routing exists. ANN runs **only** on decrypted-and-verified plaintext at the trusted endpoint, re-checked. (§5.3; `BRIEF` §4 finding 5) |
| ❌ Any handshake throughput / latency / "PQ is free or X× faster" number without a bench | Honesty rule: no performance number without a reproducible benchmark + the machine. The PQ tax is real (§3.3) and unquantified here; the `crypto-ops`/Lane-A harness on a stated machine is the only place a figure may be earned. [[LANE-A]] |
| ❌ QRNG as a TLS "cipher" or trust root | QRNG is an entropy **source** outside the cipher, behind SP 800-90B/90A; never a primitive (§5.1). [[CAPSULE §9]] |

---

## 8. Verdict, restated

- **Bit-exact TLS crypto on a noisy photonic/ternary substrate: impossible** — by hardware precision and by the
  exact-modular, fail-closed nature of the cert signature, KEX, transcript hash/HKDF, and AEAD. TLS composes
  primitives already adjudicated; the verdict is **inherited, not re-derived** (§1, §2; `encryption-on-photonic-
  substrates.md` §2/§4/§5). [[ENC-NOTE]]
- **The real post-quantum HTTPS is digital**: hybrid **X25519 + ML-KEM-768** KEX + **ML-DSA** cert signatures,
  which **map directly onto Galerina's shipped hybrid Ed25519 + ML-DSA-65** and its recommended `.tmf` hybrid-KEM
  confidentiality — one posture, reused at rest and in transit (§3). The PQ size tax is real and **unquantified
  here** (§3.3). [[HYBRID-DESIGN]] [[TLS-MLDSA]] [[LANE-A]]
- **Photonics' honest TLS roles are all *around* the gate**: QRNG handshake entropy (source, not cipher),
  optical-PUF mTLS device identity (defense-in-depth, modeling-attack caveat), photonic-ANN traffic analysis (on
  verified plaintext only) (§5). [[CAPSULE]] [[BRIEF]]
- **Galerina's value-add is governance, not a TLS rebuild**: a **K3 three-valued cert-validation gate**
  (`valid/invalid/unknown → deny`; **revocation-unknown ⇒ deny**) — three-valued *logic*, not analog signaling —
  and **Trust-Capsule ↔ TLS channel binding** via `cnf`/holder-of-key + `external_aad` (§4, §6). [[BRIEF]]
  [[CAPSULE]]

This is the crypto-on-core invariant, proven out for the transport layer: **TLS's cryptographic core stays on a
deterministic digital lane; photonics serves entropy, device identity, and post-verify analytics around it; and
Galerina governs the trust decision over it.** [[ENC-NOTE]] [[BRIEF]]

---

## Sources

Internal R&D (the reused proof — cite, do not re-derive):

- [[ENC-NOTE]] *Encryption on photonic / ternary substrates for `.tmf`*,
  `Galerina-TritMesh/TritMesh/research/encryption-on-photonic-substrates.md` — **§2.1** (analog optics ≈4–8 ENOB,
  error-tolerant by design), **§2.2** (lattice crypto is exact-modular, FO fail-closed), **§4** (per-stage
  analog-eligible? table), **§5** (the ANN layer = photonics' one honest home, outside the gate), **§6**
  (three-valued logic ≠ three-level analog signaling), **§1.3** (`SPORE-SUBSTRATE-001` crypto-on-core). *(Read-only
  grounding; not edited.)*
- [[BRIEF]] *Encryption R&D full brief*, `../../ENCRYPTION-RND-FULL-BRIEF.md` — **§3** (crypto-on-core; no
  photonic SHA-256 / cipher), **§4** verdicts 2 (no photonic SHA-256), 3 (tri-logic in the gate, not the cipher),
  5 (vec2text ⇒ embeddings ≈ plaintext; no leak-free in-network semantic routing).
- [[SHA-NOTE]] *Is there a "photonic SHA-256"?*,
  `../../tri-encription/research/photonic-sha256-integrity.md` — §0 (no photonic SHA-256; digest stays digital).
- [[LANE-A]] *Lane A — photonic-accelerated lattice signing*,
  [`photonic-lane-A-accelerated-signing.md`](photonic-lane-A-accelerated-signing.md) — §1 (precision-wall vs
  EUF-CMA), §6.5 (measured ML-DSA-65 sign/verify on a stated machine: i9-9900K, `@noble/post-quantum` 0.6.1).
- [[CAPSULE]] *Governed Trust Capsule v0*, [`../spec/governed-trust-capsule-v0.md`](../spec/governed-trust-capsule-v0.md)
  — §4 (closed alg registry, AND-hybrid), §5 (`external_aad` channel binding), §8 (K3 fail-closed reader),
  §9 (photonic bindings: optical-PUF `cnf`, QRNG, ANN — all around the digital sig).
- charter: [`../../RESEARCH-PHASE-photonic-signing-and-trust-capsule.md`](../../RESEARCH-PHASE-photonic-signing-and-trust-capsule.md)
  (the four lanes A–D; §0 the honesty line; §3 honest ledger).

Standards / IETF / NIST (canonical):

- [[RFC8446]] RFC 8446, *The Transport Layer Security (TLS) Protocol Version 1.3* — handshake, transcript hash
  (§7.1), `CertificateVerify` (§4.4.3), record AEAD (§5.2). https://www.rfc-editor.org/rfc/rfc8446
- [[HYBRID-DESIGN]] `draft-ietf-tls-hybrid-design`, *Hybrid key exchange in TLS 1.3* (IETF TLS WG) — classical+PQ
  concatenation; secure-if-either. https://datatracker.ietf.org/doc/draft-ietf-tls-hybrid-design/
- [[X25519MLKEM768]] `draft-kwiatkowski-tls-ecdhe-mlkem` / IANA TLS `supported_groups` codepoint **0x11ec**
  X25519MLKEM768 — the deployed hybrid group.
  https://datatracker.ietf.org/doc/draft-kwiatkowski-tls-ecdhe-mlkem/
- [[TLS-MLDSA]] `draft-ietf-tls-mldsa`, *Use of ML-DSA in TLS 1.3* (IETF TLS WG).
  https://datatracker.ietf.org/doc/draft-ietf-tls-mldsa/
- [[LAMPS-MLDSA]] `draft-ietf-lamps-dilithium-certificates`, *Internet X.509 … ML-DSA* (IETF LAMPS WG) — ML-DSA
  in X.509 certs. https://datatracker.ietf.org/doc/draft-ietf-lamps-dilithium-certificates/
- [[FIPS-203]] NIST **FIPS 203**, *Module-Lattice-Based Key-Encapsulation Mechanism Standard* (ML-KEM; NTT over
  ℤ_q, q=3329; FO transform). https://csrc.nist.gov/pubs/fips/203/final
- [[FIPS-204]] NIST **FIPS 204**, *Module-Lattice-Based Digital Signature Standard* (ML-DSA; q=8380417;
  hedged signing). https://csrc.nist.gov/pubs/fips/204/final
- [[RFC5280]] RFC 5280, *Internet X.509 PKI Certificate and CRL Profile* — path validation, revocation (CRL).
  https://www.rfc-editor.org/rfc/rfc5280
- [[RFC5869]] RFC 5869, *HMAC-based Extract-and-Expand Key Derivation Function (HKDF)* — the TLS 1.3 key
  schedule KDF. https://www.rfc-editor.org/rfc/rfc5869
- [[RFC8747]] RFC 8747, *Proof-of-Possession Key Semantics for CBOR Web Tokens (CWTs)* — the `cnf` claim.
  https://www.rfc-editor.org/rfc/rfc8747
- [[RFC8705]] RFC 8705, *OAuth 2.0 Mutual-TLS Client Authentication and Certificate-Bound Access Tokens* —
  certificate-bound (sender-constrained) tokens. https://www.rfc-editor.org/rfc/rfc8705
- [[RFC9449]] RFC 9449, *OAuth 2.0 Demonstrating Proof of Possession (DPoP)* — sender-constrained tokens.
  https://www.rfc-editor.org/rfc/rfc9449
- [[RFC8473]] RFC 8473, *Token Binding over HTTP* — channel-bound tokens.
  https://www.rfc-editor.org/rfc/rfc8473
- [[RFC5705]] RFC 5705, *Keying Material Exporters for TLS* — the exporter used as a channel identifier.
  https://www.rfc-editor.org/rfc/rfc5705
- [[SP-90B]] NIST **SP 800-90B**, *Recommendation for the Entropy Sources Used for Random Bit Generation*
  (+ SP 800-90A DRBG conditioner) — the QRNG health-test / conditioner gate.
  https://csrc.nist.gov/pubs/sp/800/90/b/final
- [[NIST-PQTLS]] NIST NCCoE, *Migration to Post-Quantum Cryptography* (TLS/PKI migration profiles) — context for
  PQ-TLS deployment. https://www.nccoe.nist.gov/crypto-agility-considerations-migrating-post-quantum-cryptographic-algorithms

> **Note on draft citations.** The TLS-hybrid, X25519MLKEM768, ML-DSA-in-TLS, and ML-DSA-in-X.509 items are
> **IETF Internet-Drafts** (work in progress), cited as the canonical *standards-track* sources for PQ-TLS;
> X25519MLKEM768 already has an IANA TLS codepoint (0x11ec) and shipping browser/CDN support, but the surrounding
> documents are not yet RFCs. Per the posture they are cited as the real, in-progress standards — not as
> finished RFCs — and no claim rests on a draft being final.
