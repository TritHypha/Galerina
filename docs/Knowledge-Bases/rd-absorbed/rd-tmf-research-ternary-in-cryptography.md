<!-- ABSORBED R&D SOURCE — verbatim mirror. Galerina is the main library; the R&D repo is upstream/authoring.
     Source: Galerina-R-AND-D/tmf/research/ternary-in-cryptography.md  ·  Pinned: R&D fb68d06 (2026-06-16)
     Integrated Galerina view: galerina-quantum-resistance-posture.md  ·  Catalog: galerina-rd-absorption-catalog.md
     Rule: edit the upstream source then re-vendor; do not fork this copy (feedback-auto-import-rd-docs). -->

> **Absorbed R&D source (verbatim).** This is the archived upstream document. Curated/integrated view: `galerina-quantum-resistance-posture.md`. See `galerina-rd-absorption-catalog.md` for the full ledger. Internal links below point at the upstream R&D tree.

---
# Ternary in cryptography — what's real, what's not, and how to actually use "tri-logic"

**Question driving this note:** *"Use Tri logic to help you find the answer."* Good instinct —
but it pays to be precise about **which** kind of "ternary" helps, because there are three very
different things wearing the same word, and only two of them are load-bearing for a quantum-
resilient, zero-trust design.

---

## 1. Three different "ternaries" — don't conflate them

| Sense | What it means | Where it actually helps you |
|---|---|---|
| **(T1) Three-valued *logic*** | Kleene K3: `allow / deny / unknown` ( `+1 / −1 / 0` ), with `unknown → deny` | **The zero-trust spine.** Real, proved, deployable today. This is the big win. |
| **(T2) Ternary *arithmetic* in lattices** | Polynomials with coefficients in {−1,0,1}, small modulus `p=3` | **Real but only in NTRU-family schemes**, *not* in the NIST ML-KEM/ML-DSA you chose. |
| **(T3) Ternary *hardware / storage*** | Balanced-ternary trits packed in memory; ternary photonic ALUs | **Storage/modeling = real & modest; hardware speed = aspirational.** Not a crypto argument. |

The notes' mistake is using **(T3)** language ("ntt_mul single clock cycle," "1.58-bit ternary
matrices") to justify **crypto** claims, while the genuinely strong card — **(T1)** — is barely
played. This note swaps the emphasis.

---

## 2. (T1) Three-valued logic — the real zero-trust lever

This is where ternary genuinely changes the security story, and Galerina already proves it
(`galerina-three-valued-governance.md`, `galerina-substrate-failure-model.md`).

- **Model.** A verdict is a trit: `+1 = allow`, `−1 = deny`, `0 = unknown/indeterminate`.
  Combine with Kleene operators: `min = ∧`, `max = ∨`, `neg = ¬` (with `¬0 = 0`).
- **Fail-closed collapse.** At the trust boundary, `collapse(+1) = allow`, `collapse(0) = deny`,
  `collapse(−1) = deny`. Only a *positive, definite* allow authorizes.
- **No-Coercion theorem (proved).** A definite verdict (`±1`) never depends on an `unknown`
  input; the `0`s are not load-bearing. So an attacker who can only push something *into*
  "unknown" can never manufacture an "allow."
- **Substrate-cannot-fail-open (proved).** With `effective = vAnd(ideal, reading)`, you get
  `effective ≤ ideal`, and `effective = +1 ⇔ ideal = +1 ∧ reading = +1`. A failed/noisy lane
  (`reading = 0`) can only *lose* availability, never *gain* authority.

**Why this matters for encryption specifically:** it gives you a principled way to handle the
*third state every real verification has and binary pretends it doesn't*: "I could not
determine this." Examples that should be `0 → deny`, not silently `true`:

- a signature that is **not yet verified** (vs. verified-valid vs. verified-invalid);
- a key whose **attestation is stale or missing**;
- a PQC negotiation where the peer offered an **unknown algorithm**;
- a Merkle path that is **incomplete** (you have the leaf but not all siblings).

Binary code tends to encode these as `false` *or* leak them as `true`; three-valued logic makes
"unknown" first-class and forces it to deny. **This is the answer "tri-logic" was pointing at.**

---

## 3. (T2) Ternary arithmetic in lattices — real, but it's NTRU, not Kyber

Your instinct that "ternary connects to lattice crypto" is **not baseless** — but it lands on a
different scheme than the one you picked:

- **NTRU** (Hoffstein–Pipher–Silverman, 1998) is built on **ternary polynomials**: secret/blinding
  polynomials have coefficients in **{−1, 0, 1}**, and the small modulus is literally **p = 3**.
  NTRU is one of the oldest, most-studied lattice schemes and **influenced CRYSTALS-Kyber and
  Falcon**. So "balanced ternary is natural for some lattice crypto" is true *for NTRU*.
- **But ML-KEM (FIPS 203, ex-Kyber)** — the KEM you chose — works in **ℤ_q with q = 3329**.
  Coefficients are 12-bit; secrets/errors come from a **centered binomial distribution** (small,
  e.g. in [−2,2] or [−3,3]), **not** strictly {−1,0,1}. **ML-DSA (FIPS 204)** uses **q = 8380417**.
  Their speed comes from the **Number-Theoretic Transform (NTT)**, which is **O(n log n)** and
  fundamentally a **modular** (not balanced-ternary) operation.
- **Therefore:** the claim "ML-KEM coefficients clamp to {+1,−1,0} and run multiplication-free
  in `ntt_mul` at O(1)" is **false**. The NTT is not free, not O(1), and not ternary.

**Design consequence (a genuine fork worth flagging):**
- If you want a **standards-first, certifiable** stack → keep **ML-KEM / ML-DSA**, and drop the
  ternary-arithmetic framing for them (their merit is the M-LWE hardness + NIST standardization,
  not ternary).
- If "ternary-native lattice crypto" is a real research goal → **NTRU / NTRU-Prime** is the
  honest place to pursue it (ternary polys, p=3). Caveats: NTRU was **not** selected for
  FIPS standardization (ML-KEM was), lacks ML-KEM's worst-case-to-average-case reduction story,
  and would be a **non-FIPS** choice. Reasonable as an *aspirational/parallel* track, not the
  certifiable default.

---

## 4. (T3) Ternary hardware & storage — modest-real, mostly aspirational

- **Storage (real, modest):** balanced ternary packs at `log₂3 ≈ 1.585` bits/trit. At **5
  trits/byte** (`3⁵=243≤256`) the overhead vs. ideal is ≈ **1%**. That's a true *storage* fact,
  not a speed or crypto fact. The notes' 2-bit packing (4 trits/byte) is simpler but wastes 25%.
- **BitNet (real, but it's NN weights):** Microsoft's BitNet uses balanced-ternary {−1,0,1}
  *weights*; Galerina verified its simulator is byte-compatible with BitNet's I2_S encoding
  (`galerina-tpl-bitnet-fidelity-audit.md`). This is about **neural-network quantization**, *not*
  lattice polynomial arithmetic — do not borrow it as evidence that crypto is ternary.
- **Photonic/ternary ALUs (aspirational):** real research, immature, no hardware in this stack.
  And critically — see §5 — **you would not run crypto on it even if you had it.**

---

## 5. The invariant that ties it together: crypto stays on a deterministic core

Galerina's durable conclusion from this whole thread (`galerina-photonic-tri-substrate-rd-agenda.md`,
`galerina-substrate-contracts.md`, diagnostic `SPORE-SUBSTRATE-001`):

> **Bulk compute may be photonic/ternary/noisy; integrity must stay on a deterministic core.**

Cryptographic correctness requires **bit-exactness**. A hash, a signature verification, an NTT
in ML-KEM — every one demands the *exact* bits, every time. A noisy or approximate substrate
(the very thing that would make ternary/photonic "fast") cannot carry a crypto effect, because
"close enough" is a verification failure. So:

- ✅ Run **ANN vector math, embeddings, NVFP4 tensor ops** on whatever fast/approximate
  substrate you like (their error is tolerable and measurable).
- ❌ Never run **TMX hashing, ML-KEM/ML-DSA, Ascon** on a tolerance-bounded/noisy lane. They are
  digital-core only. This is enforceable as a contract (`Crypto`/`Hash`/`Sign` effect ⇒
  `lane: digital`, else deny).

This single rule is what keeps the aspirational ternary/photonic story from ever weakening the
security story — they live on opposite sides of a hard line.

---

## 6. Recommendations (how to "use tri-logic" honestly)

1. **Lead with (T1).** Make three-valued, fail-closed verdicts the spine of the zero-trust gate:
   signature-state, attestation-state, authorization, and Merkle-completeness all as
   `allow/deny/unknown` with `unknown → deny`. This is real, proved, and differentiating.
2. **Use standard PQC for the math.** ML-KEM-768 (hybrid with X25519) for confidentiality;
   ML-DSA-65 over the TMX root for authenticity; Ascon-AEAD128 for bulk symmetric; SHAKE256 for
   the tree. Don't dress them in ternary-arithmetic claims.
3. **If you want literal ternary crypto, scope it as research** on **NTRU-family** (the honest
   home of ternary lattices) — clearly non-FIPS, clearly parallel-track.
4. **Bind the crypto-on-deterministic-core invariant into the design** so no future "ternary
   accelerator" can ever pull a hash or a signature onto a noisy lane.

## Sources
- Galerina KB (read 2026-06-15): `galerina-three-valued-governance.md`, `galerina-substrate-failure-model.md`, `galerina-substrate-contracts.md`, `galerina-photonic-tri-substrate-rd-agenda.md`, `galerina-tpl-bitnet-fidelity-audit.md`
- NTRU: Hoffstein, Pipher, Silverman, *NTRU: A Ring-Based Public Key Cryptosystem*, 1998 — https://www.ntru.org/f/hps98.pdf ; IETF draft-fluhrer-cfrg-ntru — https://www.ietf.org/archive/id/draft-fluhrer-cfrg-ntru-03.html
- FIPS 203 (ML-KEM, q=3329) — https://csrc.nist.gov/pubs/fips/203/final ; FIPS 204 (ML-DSA, q=8380417) — https://csrc.nist.gov/pubs/fips/204/final
- NIST SP 800-232 (Ascon) — https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-232.pdf
