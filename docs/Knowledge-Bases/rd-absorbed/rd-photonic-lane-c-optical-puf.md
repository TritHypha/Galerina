<!-- ABSORBED R&D SOURCE — verbatim mirror. Galerina is the main library; the R&D repo is upstream/authoring.
     Source: Galerina-R-AND-D/tmf/research/photonic-lane-C-optical-puf.md  ·  Pinned: R&D fb68d06 (2026-06-16)
     Integrated Galerina view: (this archive copy is the primary KB home)  ·  Catalog: galerina-rd-absorption-catalog.md
     Rule: edit the upstream source then re-vendor; do not fork this copy (feedback-auto-import-rd-docs). -->

> **Absorbed R&D source (verbatim).** This is the archived upstream document. See `galerina-rd-absorption-catalog.md` for the full ledger. Internal links below point at the upstream R&D tree.

---
# Photonic Lane C — optical-PUF physical authenticator ("signing by physical possession")

> **Status:** research findings (Lane C of the photonic-signing phase, 2026-06-16). **Posture (binding,
> inherited from the phase charter and `ENCRYPTION-RND-FULL-BRIEF.md`):** grounded + cited (FIPS/NIST/RFC/
> peer-reviewed only; every citation below was retrieved this session); honest-core vs aspirational kept
> strictly separate; **no performance number without a reproducible benchmark + the machine it ran on**; no
> invented crypto; fail-closed (`unknown → deny`).
> **Charter:** [`../../RESEARCH-PHASE-photonic-signing-and-trust-capsule.md`](../../RESEARCH-PHASE-photonic-signing-and-trust-capsule.md) §1 Lane C, §4 acceptance.
> **Builds on / never replaces:** [`../spec/signature-custody-v0.md`](../spec/signature-custody-v0.md) — the
> #34 hybrid **Ed25519 + ML-DSA-65** digital signature this phase signs with — and
> `ENCRYPTION-RND-FULL-BRIEF.md` §3 (crypto-on-core) / §10 (two crypto paths).

---

## 0. The one-line verdict (read this first)

An optical PUF is a **device-binding authenticator**, not a signature. It can prove *"this Trust Capsule was
presented by the one physical device enrolled for it"* (sender-constrained, non-exportable possession). It
**cannot** give public verifiability, non-repudiation, or trusted-channel-free verification — the bar a
signature must clear (charter §0). And the noisy optical PUF most people mean is, for the *linear-scattering*
class, **provably learnable in polynomial time** (Albright, Gelfand & Dixon 2023). Therefore Lane C ships only
as **defense-in-depth hardware binding *under* the digital hybrid signature, never as sole custody, never as a
replacement for the digital sig.** The CWT profile is what makes that binding honest: it carries a PUF-derived
key only as a `cnf` proof-of-possession confirmation (RFC 8747) *inside* a payload that is still
ML-DSA-65-signed and verified first.

---

## 1. What an optical PUF is, and the precise line vs. a signature

A **physical unclonable function** maps a challenge to a response via uncontrollable physical microstructure
that is infeasible to clone or reverse-engineer; the seminal instance is the **optical PUF** — a laser through
an inhomogeneous scattering token yields a speckle pattern, the "physical one-way function" of Pappu, Recht,
Taylor & Gershenfeld (Science, 2002). The challenge is `(point, angle)` of incidence; the response is a
transform of the captured speckle image; a set of challenge–response pairs (CRPs) is the device's fingerprint.

**This is authentication-by-possession, categorically not a digital signature.** The distinction is not a
detail — it is the whole reason Lane C lives *under* the signature, not in its place:

| Property the charter §0 bar demands of a signature | Digital hybrid sig (#34, custody spec) | Optical PUF |
|---|---|---|
| EUF-CMA unforgeability | ✔ ML-DSA-65 / Ed25519 | ✘ not a signature scheme |
| Public verifiability (anyone with the pubkey) | ✔ | ✘ needs the verifier's secret CRP/enrollment DB |
| Non-repudiation (classical) | ✔ | ✘ verifier shares the secret, so it can forge → no non-repudiation |
| No trusted-channel / no shared-secret enrollment | ✔ | ✘ requires a confidential enrollment phase |
| PKI-compatible | ✔ | ✘ no public key; per-verifier secret state |
| Bit-exact deterministic verification | ✔ | ✘ responses are **noisy/analog**, need fuzzy reconstruction |

This is the **CRYPTO-ON-CORE hard line** restated for Lane C: a photon (a speckle response) **cannot *be* the
signature**. A signature requires bit-exact, deterministic, error-free arithmetic where one flipped bit fails
verification (EUF-CMA); an optical response is `~≤10`-bit-equivalent and error-tolerant — the same
precision-wall-vs-avalanche argument that already rejected "photonic SHA-256"
([`photonic-sha256-integrity.md`](../../tri-encription/research/photonic-sha256-integrity.md), brief §3).
The PUF's *only* legitimate cryptographic output is **a noisy seed for a key**, reconstructed by a fuzzy
extractor and then used inside standard digital primitives — never an artifact that stands in for a signature.

---

## 2. Deliverable 1 — hardware-binding SPEC SKETCH

The design uses three standard building blocks so nothing here is invented crypto: a **controlled PUF**
wrapper (Gassend, Clarke, van Dijk & Devadas) to stop raw responses leaking, a **fuzzy extractor**
(Dodis, Reyzin & Smith, Eurocrypt 2004) to turn a noisy response into a stable key, and **RFC 8747** CWT
proof-of-possession to bind that key into the Trust Capsule. The PUF binds; the digital sig signs.

### 2.1 Roles (RATS-aligned, RFC 9334)

| Role | Who | What they hold |
|---|---|---|
| **Enroller / Verifier-of-record** | the issuing authority | the confidential CRP enrollment store (or its derived helper-data + key-commitments) |
| **Attester** | the sending device with the optical token | the physical PUF; reconstructs the key on demand; never exports it |
| **Relying party** | the Trust Capsule recipient | verifies the **digital sig first**, then the `cnf` proof-of-possession |

Mapping onto RFC 9334 (RATS): the device is the *Attester*, the PUF-derived key is the root of the
*Evidence* of possession, and the capsule recipient is the *Relying Party*. The PUF is the hardware
root-of-trust; everything trust-bearing above it is digital.

### 2.2 Enrollment (one-time, confidential channel) — fail-closed

```
1. Verifier selects a challenge set C = {c_1 … c_n} (see §3 for why the *distribution* of C matters).
2. For each c_i: measure raw speckle response r_i  (controlled-PUF: r_i never leaves the device boundary
   in the clear; only derived values do — Gassend/van Dijk/Devadas).
3. Run the fuzzy-extractor Gen(r_i) -> (K_i, P_i):
      K_i = a uniform, reproducible key   (Dodis-Reyzin-Smith strong extractor over a secure sketch)
      P_i = helper data (public, leaks no usable key material by the FE security proof)
4. Verifier stores enrollment record: { device_id, c_i, P_i, commit = H(K_i) }.
      - store ONLY a commitment H(K_i), never K_i in the clear (so a DB leak ≠ a forgery oracle).
      - the enrollment DB is the irreducible secret state. No DB ⇒ no verification. This is exactly the
        "no public verifiability" limitation, made explicit and fail-closed.
5. Enrollment channel is confidential + authenticated; if it is not, abort (unknown -> deny).
```

### 2.3 Challenge–response use (per Trust Capsule presentation)

```
1. Relying party / verifier issues a fresh challenge c_i (single-use; never replay an exhausted CRP).
2. Device measures r_i' (noisy: r_i' ≈ r_i but not equal).
3. Device runs FE.Rep(r_i', P_i) -> K_i        (reproduces the exact enrolled key from helper data + ECC).
4. K_i is used as a proof-of-possession key:
      - the capsule carries a `cnf` confirmation (RFC 8747) keyed to K_i (a COSE_Key, an Encrypted_COSE_Key,
        or a kid — RFC 8747 §3.x methods);
      - the device proves possession over a fresh nonce (challenge ⊕ epoch ⊕ audience), e.g. a COSE_Mac0/
        signature-of-knowledge of K_i, so the proof is replay-bound to this exchange.
5. Verifier checks H(K_i) == stored commit. Mismatch -> verdict 0 -> deny (K3 unknown->deny, charter §0).
```

### 2.4 How it binds into the Trust Capsule / CWT — and the ordering that keeps it honest

The capsule is a **profile of CWT/COSE** (RFC 8392 / RFC 9052), signed by the **#34 hybrid Ed25519 +
ML-DSA-65 over the 32-byte integrity root** (custody spec §1–§2). Lane C adds **one optional claim**:

```
Trust Capsule (CWT, COSE_Sign over integrity_root):
  claims:
     ... standard capsule claims (aud, exp, epoch, channel, purpose) ...
     cnf (RFC 8747):                      <-- Lane C, OPTIONAL, defense-in-depth
        confirmation method binding the PUF-derived proof-of-possession key K_i
        (the device must demonstrate possession of K_i to *use* the capsule)
  signature block (custody §4):
     hybrid { Ed25519, ML-DSA-65 } over integrity_root   <-- the trust boundary; verified FIRST
```

**Verification order is load-bearing and fail-closed (custody §6 → then Lane C):**

```
step 1  Verify the hybrid digital signature over integrity_root (AND over both algs).  Fail -> AuthError.
step 2  Resolve pubkey against the Trust Capsule registry (not the file's own key).    Fail -> AuthError.
step 3  (Lane C, if cnf present) Require the presenter to prove possession of K_i bound by cnf.
        Verify H(K_i) == enrollment commit; possession proof fresh (nonce-bound).      Fail -> deny.
step 4  Apply K3 capability policy.                                                     unknown -> deny.
```

The PUF check is **strictly subordinate**: it runs only *after* the digital signature already established
authenticity and integrity. A capsule with a valid hybrid signature but a failed/absent PUF proof is a
**policy** decision (e.g. deny for a sender-constrained surface), not a forged document. A capsule with a
valid PUF proof but an invalid signature is **always rejected**. The PUF can *tighten* trust to a specific
device; it can never *manufacture* trust. (`cnf` is exactly the RFC 8747 idiom: the issuer declares the
presenter holds a particular key and the recipient can cryptographically confirm possession — the CBOR/CWT
analogue of RFC 7800 for JWT.)

### 2.5 What Lane C earns over the digital sig alone

- **Sender-constraint / non-exportability.** A stolen capsule + stolen signing key still cannot be *used* on
  a different machine, because the `cnf` proof requires the physical token to reconstruct `K_i`. This is the
  PoP property RFC 8747 exists for, with a *physical* (non-copyable) key store instead of an HSM-resident one.
- **A hardware root for the device identity** in the RATS sense (RFC 9334): the PUF is the attester's
  root-of-trust, beneath the digital evidence.

---

## 3. Deliverable 2 — MODELING-ATTACK analysis

> **Guardrail (verbatim):** *"explicitly address the polynomial-time learnability of noisy Optical PUFs and
> detail how the CWT profile mitigates machine-learning extraction attacks."*

### 3.1 The general result: strong PUFs are ML-modelable

The dominant and most effective attack on a *strong* PUF (one with an exponentially large CRP space, used
directly for challenge–response) is the **machine-learning modeling attack**: collect a subset of CRPs,
train a model that predicts unseen CRPs, and you have a software clone — no physical cloning needed.
Rührmair, Sehnke, Sölter, Dror, Devadas & Schmidhuber (CCS 2010, *"Modeling Attacks on Physical Unclonable
Functions"*) broke standard **Arbiter PUFs and Ring-Oscillator PUFs of arbitrary size, plus XOR-Arbiter,
Lightweight-Secure, and Feed-Forward Arbiter** PUFs using **logistic regression and evolution strategies**,
with model sizes and CRP counts that scale *polynomially*. The lesson: any strong PUF whose internal map is
(close to) linear is a regression target.

The relevant taxonomy:

| PUF class | Direct CRP use? | ML-modeling exposure |
|---|---|---|
| **Weak PUF** (few CRPs, e.g. SRAM PUF for *key storage*) | No — derives one key | low CRP-modeling exposure, but small response space |
| **Strong PUF** (huge CRP space, used for challenge–response auth) | Yes | **high** — the Rührmair-2010 attack target |

### 3.2 Optical PUFs specifically — and the decisive "noisy / polynomial-time" finding

The original Pappu (2002) optical PUF was argued secure because the scattering process is physically complex.
That argument **does not survive** for linear structures with image access:

- **Rührmair et al., *Optical PUFs Reloaded* (IACR ePrint 2013/215).** Built the first *integrated* optical
  PUF (no moving parts) and showed it **can be broken by machine learning if the scattering structure is
  linear and the raw interference/speckle images are available** to the adversary. Their conclusion *enforces
  the use of non-linear scattering structures*. This is the prior art the next paper extends.

- **Albright, Gelfand & Dixon, *Polynomial Bounds for Learning Noisy Optical Physical Unclonable Functions
  and Connections to Learning With Errors* (arXiv:2308.09199, 2023; later in IEEE).** This is the
  guardrail's central citation. They extend Rührmair-2013 from the noise-free case to the **noisy** case and
  prove that this class of optical PUFs is **learnable to arbitrary precision with arbitrarily high
  probability using polynomially many CRPs and polynomially bounded computation, under mild assumptions** on
  the noise and challenge-vector distributions — via a **linear-regression** attack. They derive explicit
  polynomial sample-complexity and time bounds (in PUF size, challenge/noise distribution parameters, and the
  target accuracy/confidence), with an analysis mirroring attacks on weakly-implemented **Learning With
  Errors**. **Plain statement: measurement noise does not save a linear optical PUF — it is still
  poly-time PAC-learnable.**

**Honest consequence:** a naive "authenticate the device by replaying optical CRPs over the wire" scheme is
*broken on arrival* for the linear class. This is precisely why Lane C is defense-in-depth and never sole
custody — and why the charter (§1 Lane C) already flags "ML-model attacks ⇒ not sole custody."

### 3.3 How the CWT profile mitigates ML extraction (the required detail)

The CWT/controlled-PUF profile does **not** claim to make a linear optical PUF unlearnable — it removes the
*preconditions* the proofs require, and confines any residual leak below the digital signature so it is
never load-bearing. Mitigations, mapped to the exact attack premise each one denies:

| Attack premise (from §3.1–§3.2) | Profile mitigation | Standard / source |
|---|---|---|
| Adversary obtains **raw speckle/response images** (the explicit precondition in Rührmair-2013 and Albright-2023) | **Controlled PUF**: raw `r_i` never crosses the device boundary; only `FE.Rep` output and a possession proof do. No raw image ⇒ the regression has no labels. | Gassend/van Dijk/Devadas (controlled PUF) |
| Adversary **collects many CRPs** to fit a model | **No CRP is ever sent in the clear.** The wire carries only `cnf` proofs over fresh nonces (a MAC/SoK of `K_i`), not `(c_i, r_i)` pairs. CRPs are **single-use** and the usable set is bounded; helper data `P_i` is FE-proven to leak no key. | RFC 8747 `cnf`; Dodis-Reyzin-Smith FE |
| The **map is linear** (the learnability class) | Enrollment SHOULD use **non-linear scattering** optical tokens; Rührmair-2013 *enforces* non-linearity, and recent devices are explicitly hardened (non-linear wave optics leaves significant private info intact under DNN attack; multilevel/all-optical PUFs). This is an **enrollment-time requirement**, not a claim the linear class is safe. | Rührmair 2013; Nature Materials 2023 (all-optical multilevel); Sci. Rep. 2025 (ML-resilient optical PUFs) |
| Even a *partial* model lets the attacker impersonate | **Possession is verified against `H(K_i)` with fail-closed equality**, and the **digital hybrid signature is checked first and independently** (custody §6). A modeled-but-imperfect `K_i` fails the commitment check → deny; and the attacker still lacks the ML-DSA-65/Ed25519 secret. | custody spec §4–§6; FIPS 204 |
| Helper-data / commitment **DB leak** turns into a forgery oracle | Store only `H(K_i)` (commitments), never `K_i`; FE helper data is public-by-design. A DB leak reveals no usable key and no signing key. | Dodis-Reyzin-Smith; commitment hiding |

**The honest core of the mitigation:** controlled-PUF + fuzzy-extractor + `cnf` means the adversary never
sees the `(challenge, raw-response)` labels the polynomial-time proofs *require*, and even a successful model
must still defeat the bit-exact ML-DSA-65/Ed25519 signature that is verified first. ML-resistance is **not**
asserted as a property of the optics; it is achieved by (a) denying the attack its training data and (b)
keeping the optical layer strictly subordinate to the digital signature.

### 3.4 Residual risks kept explicit (fail-closed, honest ledger)

- **Invasive / side-channel characterization** of the device (not over-the-wire ML) remains a hardware
  threat; controlled-PUF helps but is not a tamper-proofing claim. **[partly uncited — general PUF hardware-
  security caveat; treat as a known open risk, not a quantified result.]**
- **Non-linearity is a requirement, not a guarantee.** "Non-linear ⇒ hard to learn" is supported by
  Rührmair-2013 and recent device papers, but is an *empirical* device property, not a reduction to a hard
  problem. Any specific token MUST be re-evaluated against the current modeling literature before trust.
- **THEORETICAL GAP — no benchmark.** This doc reports **zero** PUF performance/security numbers (enrollment
  time, FE failure rate, model-attack CRP counts on a *specific* token) because we have **no reproducible
  benchmark on named hardware**. Per the binding posture, those are not synthesized or extrapolated. Any
  future Lane-C number must come with the device and the measurement rig.

---

## 4. Conclusion (mandated)

Lane C is **defense-in-depth hardware binding *under* the digital hybrid signature — never sole custody, never
a replacement for the digital sig.** An optical PUF binds a Trust Capsule to a specific, non-exportable
physical device (sender-constraint via RFC 8747 `cnf`), giving a hardware root-of-trust in the RATS sense
(RFC 9334). It is **not** a signature: no public verifiability without the enrollment DB, no classical
non-repudiation, and — for the linear-scattering class — **provably polynomial-time learnable even under
noise** (Albright, Gelfand & Dixon 2023, extending Rührmair 2013). The CWT/controlled-PUF profile mitigates
ML extraction by denying the attack its raw-CRP training data (controlled PUF + fuzzy extractor), requiring
non-linear tokens at enrollment, and keeping the optical proof strictly subordinate to the bit-exact
ML-DSA-65 + Ed25519 signature that is always verified first. The photon binds; it does not, and cannot, sign.

---

## 5. Honest ledger for Lane C

| Claim | Status |
|---|---|
| Optical PUF = device-binding authenticator (PoP), not a signature | **Honest core**, grounded |
| Linear noisy optical PUFs are poly-time learnable (PAC) | **Honest core** — Albright/Gelfand/Dixon 2023, Rührmair 2013 |
| Controlled-PUF + FE + `cnf` removes the ML attack's preconditions | **Honest core** — standards-composed, no invented crypto |
| Non-linear optical tokens resist ML | **Supported but device-specific** — must re-verify per token |
| The PUF is verified *after* and *under* the hybrid digital sig | **Honest core** — fail-closed ordering |
| Any Lane-C performance/security number | **THEORETICAL GAP** — no benchmark on named hardware; not synthesized |
| Photonics as the signing primitive | **Rejected** (charter §0, §3) — precision wall vs EUF-CMA |

---

## 6. Sources (all retrieved this session)

- Pappu, Recht, Taylor & Gershenfeld, *Physical One-Way Functions*, **Science 297(5589):2026–2030, 2002** —
  the seminal optical PUF. (Confirmed via Nature/PMC citing literature, this session.)
- Rührmair, Sehnke, Sölter, Dror, Devadas & Schmidhuber, *Modeling Attacks on Physical Unclonable Functions*,
  **ACM CCS 2010** — https://eprint.iacr.org/2010/251.pdf (broke Arbiter/RO/XOR/Lightweight/Feed-Forward via
  logistic regression + evolution strategies).
- Rührmair et al., *Optical PUFs Reloaded*, **IACR ePrint 2013/215** — https://eprint.iacr.org/2013/215
  (integrated linear optical PUFs are ML-attackable with image access; enforces non-linear scattering).
- Albright, Gelfand & Dixon, *Polynomial Bounds for Learning Noisy Optical Physical Unclonable Functions and
  Connections to Learning With Errors*, **arXiv:2308.09199, 2023** — https://arxiv.org/abs/2308.09199
  (noisy linear optical PUFs are poly-time PAC-learnable via linear regression; LWE connection). **The
  guardrail's central citation.**
- Dodis, Reyzin & Smith, *Fuzzy Extractors: How to Generate Strong Keys from Biometrics and Other Noisy
  Data*, **EUROCRYPT 2004, LNCS 3027:523–540** — https://link.springer.com/chapter/10.1007/978-3-540-24676-3_31
  (the noisy-source → stable-key construction; secure sketch + strong extractor).
- Gassend, Clarke, van Dijk & Devadas — *Controlled Physical Random Functions* / *Silicon Physical Random
  Functions* (controlled-PUF: never return the raw response; ACM CCS 2002 / ACSAC 2002). [Cited from canonical
  knowledge; corroborated by survey results retrieved this session.]
- *All-optical multilevel physical unclonable functions*, **Nature Materials, 2023** —
  https://www.nature.com/articles/s41563-023-01734-7 (non-linear/multilevel optical PUFs).
- *Optimal performance of simple low-cost optical PUFs resilient to machine learning attacks*, **Scientific
  Reports, 2025** — https://www.nature.com/articles/s41598-025-23840-z (challenge-distribution & non-linearity
  determine ML resilience).
- **RFC 8747**, *Proof-of-Possession Key Semantics for CBOR Web Tokens (CWTs)* (the `cnf` claim) —
  https://www.rfc-editor.org/info/rfc8747 (the binding mechanism into the Trust Capsule).
- **RFC 9334**, *Remote ATtestation procedureS (RATS) Architecture* — https://www.rfc-editor.org/info/rfc9334/
  (attester / evidence / relying-party roles; hardware root-of-trust framing).
- **RFC 8392** (CWT) / **RFC 9052** (COSE) — the Trust Capsule's base format (referenced via the charter §2).
- FIPS 204, *ML-DSA* — https://csrc.nist.gov/pubs/fips/204/final (the digital signing primitive Lane C sits
  under; see custody spec).

### Cross-references (built work)
- [`../spec/signature-custody-v0.md`](../spec/signature-custody-v0.md) — the #34 hybrid Ed25519 + ML-DSA-65
  signature over the 32-byte integrity root that Lane C is subordinate to (§1–§6).
- `ENCRYPTION-RND-FULL-BRIEF.md` §3 (crypto-on-core: cryptography runs bit-exact on a deterministic core;
  optical-PUF is a device root-of-trust *outside* the primitive), §10 (two crypto paths).
- [`../../tri-encription/research/photonic-sha256-integrity.md`](../../tri-encription/research/photonic-sha256-integrity.md)
  — verdict 2: the same precision-wall reasoning that keeps the digest digital; lists optical-PUF as device
  root-of-trust, re-verified, never inside the hash.
- Charter [`../../RESEARCH-PHASE-photonic-signing-and-trust-capsule.md`](../../RESEARCH-PHASE-photonic-signing-and-trust-capsule.md)
  §1 Lane C, §2 (Trust Capsule hardware-binding row), §4 (Lane C acceptance: spec sketch + modeling-attack analysis).
