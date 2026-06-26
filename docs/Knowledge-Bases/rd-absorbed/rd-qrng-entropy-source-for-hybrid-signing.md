<!-- ABSORBED R&D SOURCE — verbatim mirror. Galerina is the main library; the R&D repo is upstream/authoring.
     Source: Galerina-R-AND-D/tmf/research/photonic-lane-D-qrng.md  ·  Pinned: R&D fb68d06 (2026-06-16)
     Integrated Galerina view: (this archive copy is the primary KB home)  ·  Catalog: galerina-rd-absorption-catalog.md
     Rule: edit the upstream source then re-vendor; do not fork this copy (feedback-auto-import-rd-docs). -->

> **Absorbed R&D source (verbatim).** This is the archived upstream document. See `galerina-rd-absorption-catalog.md` for the full ledger. Internal links below point at the upstream R&D tree.

---
# Photonic-era signing — Lane D: QRNG for hedged-signing randomness and key generation

> **Status:** research findings (2026-06-16). **Lane:** D of four (charter
> [`../../RESEARCH-PHASE-photonic-signing-and-trust-capsule.md`](../../RESEARCH-PHASE-photonic-signing-and-trust-capsule.md) §1).
> **Posture (binding, inherited):** grounded + cited (FIPS/NIST/RFC/peer-reviewed only); no performance
> number without a reproducible benchmark + the machine it ran on; no invented crypto; fail-closed
> (`unknown → deny`); honest-core vs aspirational kept strictly separate.
> **Scope note:** this is the **smallest** lane by design. QRNG is an *entropy source outside the cipher*,
> not a signing primitive. It earns one short doc, not a build.

---

## 0. One-paragraph verdict

A quantum random number generator (QRNG) is a real, useful, standards-recognised **entropy source**, and it
maps cleanly onto exactly two entropy needs of the digital hybrid signature this phase signs with
([`../spec/signature-custody-v0.md`](../spec/signature-custody-v0.md), the #34 hybrid Ed25519 + ML-DSA-65
over a 32-byte digest): the **`rnd` value in FIPS-204 hedged signing** and the **seed for key generation**.
But it changes nothing about the trust primitive. Per the CRYPTO-ON-CORE hard line
([`../../ENCRYPTION-RND-FULL-BRIEF.md`](../../ENCRYPTION-RND-FULL-BRIEF.md) §3), a photon cannot *be* the
signature — the ~≤10-bit, error-tolerant analog precision wall is incompatible with the bit-exact,
EUF-CMA, one-flipped-bit-fails-verification bar a digital signature must clear. QRNG sits **before** the
signer, never inside it, and even there it must go through a NIST SP 800-90B-validated entropy source with
health tests and an SP 800-90A DRBG conditioner — **never raw QRNG bits straight into a key**. Hence:
peripheral, by construction.

---

## 1. What FIPS-204 actually needs from an entropy source, and where it enters

There are exactly two entry points. Both are *inputs* to the standardized algorithm; neither is a place
where photonics computes anything.

| Entry point | What FIPS-204 consumes | Quality bar | If entropy is absent |
|---|---|---|---|
| **Key generation** (`ML-DSA.KeyGen`) | a random seed `ξ` (xi) | "a source of randomness with security strength **≥ the security strength of the ML-DSA parameter set**" must be used during KeyGen | **Hard requirement** — there is no safe fallback. A weak/duplicated keygen seed is catastrophic (key-recovery / multi-user collisions). |
| **Hedged signing** (`ML-DSA.Sign`) | a 256-bit `rnd`, mixed with the secret key + message to derive the private per-signature seed `ρ′` (rho-prime) | `rnd` **should** be from an approved RBG; other fresh-random methods are permitted | **Graceful degradation:** if the RBG yields no entropy (all-zeros), the hedged variant produces *exactly* the deterministic variant's output — still a valid, secure signature. |

Two facts to keep honest and separate:

- **Keygen entropy is load-bearing; signing entropy is a hardening countermeasure.** FIPS-204's default
  signing mode is *hedged* (randomized), not because the signature is insecure without randomness — the
  fully deterministic mode is secure — but because injecting fresh `rnd` into the computation of the
  commitment `y` makes repeated signing of the same message diverge, which is the standard mitigation
  against **side-channel and fault attacks** on deterministic lattice signatures. The CFRG security-
  considerations draft states the rationale plainly: even a *weak* RBG can be preferable to the fully
  deterministic variant for fault resistance.
- **This is why hedged-signing entropy can never be a "performance" or "security level" claim for QRNG.**
  The degradation property means the signature is correct and unforgeable whether `rnd` is quantum,
  pseudorandom, or all-zeros. QRNG's only contribution at the signing entry point is *defence-in-depth
  side-channel/fault resistance*, not the unforgeability the signature already has from the lattice problem.

> The signing input here is the 32-byte `integrity_root` (`.tmf`) or `.lmanifest` SHA-256 digest (Galerina
> #34), signed with **pure ML-DSA** (`M` = the digest) under a per-surface domain-separation `ctx`
> (`signature-custody-v0.md` §2.1). `rnd` enters *that* call; it is orthogonal to the digest and to `ctx`.

---

## 2. The QRNG interface — what "use QRNG correctly" means

The non-negotiable rule, drawn straight from the NIST SP 800-90 series: **a QRNG is an entropy source, and
an entropy source is not an RBG.** You do not feed raw QRNG output into a key. The standards define a
three-part pipeline, and QRNG occupies only the first box.

```
[ QRNG noise source ]→[ SP 800-90B health tests ]→[ SP 800-90A DRBG conditioner ]→ rnd / keygen seed ξ
   quantum shot noise     startup + continuous +        (e.g. CTR_DRBG/Hash_DRBG;        consumed by
   (photonic)             on-demand; min-entropy        conditions + expands entropy)    FIPS-204
                          estimate (IID / non-IID)
        └─────────────── SP 800-90C RBG construction (RBG2/RBG3/...) ────────────────┘
```

### 2.1 SP 800-90B — the entropy-source contract
SP 800-90B governs the design and validation of the noise source itself. The pieces that bind a QRNG:

- **Min-entropy estimation** on two tracks — **IID** (independent and identically distributed) or
  **non-IID** — via SP 800-90B's estimator suite (most-common-value, collision, Markov, compression,
  t-tuple, LRS, and the prediction estimators: MultiMCW, lag, MultiMMC, LZ78Y). Min-entropy, not Shannon
  entropy, is the unit, because it bounds the *best single-guess* probability — the adversary-relevant
  quantity.
- **Health tests** in three categories: **start-up**, **continuous** (run on the noise source during
  operation — the Repetition-Count and Adaptive-Proportion tests are the SP 800-90B baseline), and
  **on-demand**. These detect a noise source that has silently degraded or failed — which for a QRNG is
  exactly the failure modes the literature flags (detector dead-time, afterpulsing, bias, drift,
  non-stationarity). A failing health test must take the source out of service: **fail-closed**, matching
  Galerina's `unknown → deny`.
- **Optional conditioning** inside the entropy source. Validation evidence is published as an SP 800-90B
  document and certified under NIST's **Entropy Source Validation (ESV)** program.

### 2.2 SP 800-90A / SP 800-90C — turning an entropy source into an RBG
- **SP 800-90A** specifies the approved DRBG mechanisms (e.g. CTR_DRBG, Hash_DRBG, HMAC_DRBG). A DRBG both
  **conditions** the entropy-source output (de-biases, decorrelates) and **expands** it, so a modest-rate
  quantum noise source can back a high-rate `rnd`/keygen demand.
- **SP 800-90C** specifies the **RBG constructions** that combine an SP 800-90A DRBG with an SP 800-90B
  entropy source into a complete RBG, in four classes: **RBG1** (seeded once from an external RBG),
  **RBG2** (entropy source available on demand), **RBG3** (continuously accessed, full-entropy output),
  and **RBGC** (a chain of RBGC constructions on one platform). A QRNG-backed signer would target an
  RBG2/RBG3-style construction with the QRNG as the SP 800-90B source.

**The hard rule, restated:** *raw QRNG → key* is prohibited by this architecture. Raw physical output —
quantum or not — carries bias and correlation from implementation artifacts; only the validated
`source → health-tested → DRBG-conditioned` chain produces output fit for a FIPS-204 keygen seed or `rnd`.

### 2.3 QRNG is real and standardized as an entropy source — not as crypto
The honest grounding for "QRNG is real":

- **ITU-T X.1702 (2019)** defines a generic functional architecture for a *quantum noise random number
  generator*, including a method to estimate/validate noise-source entropy and to distinguish quantum from
  non-quantum physical sources, and to specify randomness extractors — i.e. it standardizes QRNG **as an
  entropy source**, consistent with the SP 800-90B framing.
- **NIST ESV certification of real QRNGs exists.** ID Quantique's Quantis QRNG chips were certified under
  NIST's Entropy Source Validation program on the **IID track** (SP 800-90B). Software/seed QRNG offerings
  (e.g. Quantinuum's Quantum Origin) have likewise pursued NIST validation. In every case the certification
  is of an **SP 800-90B entropy source**, not of a cipher, hash, or signature — which is the whole point.

This is the honest line: QRNG has standards (ITU-T X.1702) and certifications (NIST ESV), but they certify
*entropy quality*, not a new trust primitive. It slots into the SP 800-90 pipeline that the digital signer
already requires; it does not change the signer.

---

## 3. Why it is peripheral (the honest scope)

1. **It is a source, not a primitive.** QRNG supplies bits *to* `ML-DSA.KeyGen` and *to* the `rnd` input of
   `ML-DSA.Sign`. It never computes the signature, the digest, or the verification. The CRYPTO-ON-CORE wall
   (`ENCRYPTION-RND-FULL-BRIEF.md` §3) and the charter's honesty line (charter §0/§3) both reject "the
   photon signs it"; QRNG respects that wall by sitting entirely before the deterministic core.
2. **For signing specifically, its security contribution is bounded by FIPS-204's own design.** Because the
   hedged variant degrades gracefully to the secure deterministic variant, no QRNG can make a signature
   "more unforgeable" — unforgeability comes from the lattice problem, not the nonce. QRNG's signing value
   is side-channel/fault hardening, full stop.
3. **A standard PRNG/DRBG seeded by any SP 800-90B source is already sufficient.** FIPS-204 asks for an
   approved RBG; an approved RBG (SP 800-90A DRBG over an SP 800-90B source) meets the bar whether the
   source is a ring-oscillator TRNG or a QRNG. QRNG is an *upgrade to the entropy source*, not a
   requirement. That is the definition of peripheral.
4. **No reproducible benchmark, so no performance claim is made.** Per posture, this lane reports **no**
   throughput or latency number for any QRNG. Whether a QRNG's bit-rate suffices for a given signing load
   is an integration question to be answered by a measured RBG2/RBG3 throughput test on named hardware if
   the capability is ever wired — it has **not** been benchmarked here. **THEORETICAL GAP — unbenchmarked.**

### Galerina role
An **entropy capability behind the governance boundary**: if/when a QRNG is integrated, it is a host-side
SP 800-90 RBG invoked through the Galerina capability boundary (crypto and entropy cannot live in `.spore` —
`galerina check` rejects even bitwise ops, per `signature-custody-v0.md` §7). The governance layer's job is
the fail-closed posture: a failed SP 800-90B health test → entropy source unavailable → `unknown → deny`,
identical to how a missing vetted verifier makes the reader reject every signed file. Galerina governs the
*availability and admission* of the entropy capability; it does not generate or condition the bits itself.

---

## 4. Honest ledger for this lane

| Claim | Status |
|---|---|
| QRNG = quantum entropy source, standardized (ITU-T X.1702), NIST-ESV-certifiable (SP 800-90B) | **Grounded, cited** |
| FIPS-204 keygen needs entropy ≥ the parameter set's security strength; signing `rnd` should be from an approved RBG and degrades gracefully to deterministic | **Grounded, cited** (FIPS-204 §3.6.1 via CFRG draft) |
| Raw QRNG → key is prohibited; must pass SP 800-90B health tests + SP 800-90A DRBG conditioning (SP 800-90C construction) | **Grounded, cited** |
| QRNG makes ML-DSA signatures "more unforgeable" / faster | **REJECTED** — graceful-degradation + CRYPTO-ON-CORE; no such claim |
| A photon *is* the signature / signs the digest | **REJECTED** — precision wall vs EUF-CMA bar (charter §0, brief §3) |
| Any QRNG throughput/latency number | **THEORETICAL GAP — unbenchmarked**; no number synthesized |

---

## 5. Sources (all retrieved 2026-06-16)

- NIST FIPS 204, *Module-Lattice-Based Digital Signature Standard (ML-DSA)* (2024) —
  https://csrc.nist.gov/pubs/fips/204/final
- D. Connolly (Deirdre Connolly, sole author), *Security Considerations for ML-DSA* (CFRG Internet-Draft,
  draft-connolly-cfrg-ml-dsa-security-considerations-02) — hedged `rnd`, approved-RBG guidance (FIPS-204
  §3.6.1), graceful all-zeros degradation, KeyGen security-strength requirement, side-channel/fault
  rationale — https://www.ietf.org/archive/id/draft-connolly-cfrg-ml-dsa-security-considerations-02.html
- NIST SP 800-90A Rev. 1, *Recommendation for Random Number Generation Using Deterministic Random Bit
  Generators* — https://csrc.nist.gov/pubs/sp/800/90/a/r1/final
- NIST SP 800-90B, *Recommendation for the Entropy Sources Used for Random Bit Generation* (2018) —
  min-entropy estimators (IID/non-IID), three-category health tests, conditioning —
  https://nvlpubs.nist.gov/nistpubs/SpecialPublications/nist.sp.800-90b.pdf
- NIST SP 800-90C, *Recommendation for Random Bit Generator (RBG) Constructions* (Final, 25 Sep 2025;
  DOI 10.6028/NIST.SP.800-90C) — RBG1/RBG2/RBG3/RBGC; combines SP 800-90A DRBGs with SP 800-90B sources —
  https://csrc.nist.gov/pubs/sp/800/90/c/final
- ITU-T Recommendation X.1702 (11/2019), *Quantum noise random number generator architecture* —
  https://www.itu.int/rec/T-REC-X.1702-201911-I/en
- ID Quantique, *Quantis QRNG chips — first quantum-based RNGs to receive NIST Entropy Source Validation
  (ESV) on the IID track* — https://www.idquantique.com/qrng-chip-nist-certification/
- NIST CMVP, *IDQ SP 800-90B Non-Proprietary Public Use Document* (entropy-source validation evidence) —
  https://csrc.nist.gov/CSRC/media/projects/cryptographic-module-validation-program/documents/entropy/E63_PublicUse.pdf
- Implementation-artifact caveat (single-photon-detector dead-time, afterpulsing, bias, drift,
  non-stationarity in real QRNG deployments) — Herrero-Collantes & García-Escartín, *Quantum random number
  generators*, Rev. Mod. Phys. **89**, 015004 (2017) — https://doi.org/10.1103/RevModPhys.89.015004
  (the canonical QRNG review; covers detector non-idealities + post-processing). *(An earlier draft mis-cited
  PMC12307882, a system-jitter TRNG paper that does not treat photonic-detector artifacts — corrected on
  adversarial citation review.)*

### Cross-references (built work)
- [`../spec/signature-custody-v0.md`](../spec/signature-custody-v0.md) — the #34 hybrid Ed25519 + ML-DSA-65
  signature over a 32-byte digest that this lane's entropy feeds (KeyGen seed + hedged `rnd`); §2.1
  pure-ML-DSA + per-surface `ctx`; §7 host-side crypto behind the Galerina boundary.
- [`../../ENCRYPTION-RND-FULL-BRIEF.md`](../../ENCRYPTION-RND-FULL-BRIEF.md) §3 (crypto-on-core — QRNG named
  as entropy outside the gate), §10 (two crypto paths; photonics never computes the cipher/hash).
- Charter [`../../RESEARCH-PHASE-photonic-signing-and-trust-capsule.md`](../../RESEARCH-PHASE-photonic-signing-and-trust-capsule.md)
  §1 Lane D, §2 Trust Capsule (QRNG nonces/ephemeral keys row), §3 honest ledger.
