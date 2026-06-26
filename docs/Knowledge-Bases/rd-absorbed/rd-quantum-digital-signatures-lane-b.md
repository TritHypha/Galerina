<!-- ABSORBED R&D SOURCE — verbatim mirror. Galerina is the main library; the R&D repo is upstream/authoring.
     Source: Galerina-R-AND-D/tmf/research/photonic-lane-B-quantum-digital-signatures.md  ·  Pinned: R&D fb68d06 (2026-06-16)
     Integrated Galerina view: (this archive copy is the primary KB home)  ·  Catalog: galerina-rd-absorption-catalog.md
     Rule: edit the upstream source then re-vendor; do not fork this copy (feedback-auto-import-rd-docs). -->

> **Absorbed R&D source (verbatim).** This is the archived upstream document. See `galerina-rd-absorption-catalog.md` for the full ledger. Internal links below point at the upstream R&D tree.

---
# Photonic-era signing — Lane B: Quantum Digital Signatures (QDS / MDI-QDS)

> **Status:** research findings (2026-06-16). **Lane:** B of four (charter
> [`../../RESEARCH-PHASE-photonic-signing-and-trust-capsule.md`](../../RESEARCH-PHASE-photonic-signing-and-trust-capsule.md) §1).
> **Posture (binding, inherited):** grounded + cited (FIPS/NIST/RFC/peer-reviewed only); no performance
> number without a reproducible benchmark + the machine it ran on; no invented crypto; fail-closed
> (`unknown → deny`); honest-core vs aspirational kept strictly separate.
> **Scope note:** this is the **track-only** lane by design. QDS is a genuinely *different, genuinely
> photonic* signing paradigm — real academic field, not invented crypto — but its hardware, throughput, and
> PKI gaps put it firmly in "survey the literature + define the governance interface, **do not build**" (charter
> §1 Lane B, §4 acceptance: *"an honest survey table … + a defined Galerina governance interface; no build."*).

---

## 0. One-paragraph verdict

Quantum Digital Signatures (QDS) are the one lane in this phase where photonics is **the signing primitive
itself**, not an accelerator (Lane A), a hardware binder (Lane C), or an entropy source (Lane D). The security
comes from quantum mechanics — the impossibility of perfectly distinguishing or copying non-orthogonal quantum
states (no-cloning) — rather than from a number-theoretic hardness assumption, so QDS is **information-theoretically
secure** and **not Shor-breakable** ([Gottesman & Chuang 2001](https://arxiv.org/abs/quant-ph/0105032)). That
makes it the honest answer to "is there a new way of *signing* using photonics?" — yes, and it is real published
science. It does **not** contradict the CRYPTO-ON-CORE hard line
([`../../ENCRYPTION-RND-FULL-BRIEF.md`](../../ENCRYPTION-RND-FULL-BRIEF.md) §3): that line rejects an *analog
photonic computation that is the classical digital signature* (the ~≤10-bit, error-tolerant precision wall vs the
bit-exact EUF-CMA bar). QDS sidesteps that wall by changing the **security model entirely** — it never tries to
compute a deterministic EUF-CMA signature in analog optics; it builds a *different* unforgeability guarantee out
of quantum state distinguishability. But that different model comes with three blockers that keep it Tier-B
cold-path-only for years: it needs **quantum channels and specialized hardware** (single-photon sources/detectors,
often cryogenic), it has **tiny throughput** (seconds-to-minutes per signed bit on early demos), and it has **no
public-key infrastructure** — it relies on pre-distributed, quantum-correlated key material between a *fixed,
pre-enrolled* set of parties, and its verification semantics are **transferability/repudiation bounds, not
classical universal non-repudiation**. Galerina's role: **define the governance interface as a future Tier-B
"strong/slow/cold-path" lane (brief §10 Path B), and track the field. Do not build.**

---

## 1. The honest framing — why QDS is "real photonic signing" and not the rejected trap

The phase charter (§0) rejects, permanently, "a photonic/analog computation that *is* the signature." That
rejection is about a specific failure mode: trying to make analog optics emit the bytes of an Ed25519 / ML-DSA
signature, where one flipped bit fails verification and analog precision (~≤10 bit, error-tolerant) physically
cannot hold the bit-exact, EUF-CMA, deterministic line. QDS is **categorically different** and must not be
conflated with that:

| | Rejected "photonic signature" trap | Quantum Digital Signatures (this lane) |
|---|---|---|
| What the photons do | *compute* a classical digital signature in analog optics | *carry* non-orthogonal quantum states that recipients cannot copy or perfectly distinguish |
| Security rests on | nothing — analog precision can't hold EUF-CMA | quantum no-cloning / indistinguishability of non-orthogonal states (information-theoretic) ([Gottesman & Chuang 2001](https://arxiv.org/abs/quant-ph/0105032)) |
| Verification | bit-exact digital recompute (one bit off ⇒ reject) | statistical: count mismatches against per-recipient thresholds |
| Verdict | invented crypto — **rejected** | published, peer-reviewed science — **real, but track-only** |

So the verdict is not "no." It is: **yes, this is a legitimate, fundamentally different, genuinely photonic
signing paradigm — and it is not deployable on Galerina's near-term path.** Honesty requires holding both halves.

---

## 2. The foundational scheme — Gottesman–Chuang (2001)

**Gottesman, D. & Chuang, I. L., "Quantum Digital Signatures," arXiv:quant-ph/0105032 (2001).**
([abstract](https://arxiv.org/abs/quant-ph/0105032))

The core idea, in the authors' own framing: the signer (Alice) generates a private classical string and a
corresponding **quantum public key** — "a set of quantum states whose exact identity is known only to Alice."
Because non-orthogonal quantum states cannot be perfectly distinguished or copied (no-cloning), a forger who
holds only copies of the public quantum states cannot reproduce Alice's private string. Security against forgery
rests on "the impossibility of perfectly distinguishing between nonorthogonal quantum states"
([Collins et al. 2014, PRL 113, 040502](https://link.aps.org/doi/10.1103/PhysRevLett.113.040502)).

**The original-scheme limitations the charter already anticipated** (all from the 2001 paper):

- **Quantum public keys are hard.** The paper concedes "quantum public keys are more difficult to deal with than
  classical public keys" — they are quantum states, not bit strings, so they cannot be freely copied, posted, or
  cached the way a classical public key can.
- **Only a few copies may circulate.** "Only a limited number of copies can be in circulation, or the scheme
  becomes insecure" — every extra copy a forger can obtain erodes the no-cloning advantage. This is the deep
  reason there is **no PKI** (see §5).
- **Cost scales with message length and recipients.** An *m*-bit message requires *O(m)* qubits **per recipient**.
- **Original scheme needed long-term quantum memory** to hold the public-key states until verification — a serious
  practical drawback removed only later (§3).

This is the seminal reference and the security foundation. Everything since is engineering toward practicality.

---

## 3. The practicality arc — removing quantum memory, then adopting QKD machinery

QDS became experimentally serious through two moves, both peer-reviewed:

1. **Removing the quantum-memory requirement (2014).**
   Collins, Donaldson, Dunjko, Wallden, Clarke, Andersson, Jeffers & Buller, *"Realization of Quantum Digital
   Signatures without the Requirement of Quantum Memory,"* **Phys. Rev. Lett. 113, 040502 (2014)**
   ([APS](https://link.aps.org/doi/10.1103/PhysRevLett.113.040502)). First realization needing **no quantum
   memory**, using "only standard linear optical components and photodetectors." Recipients measure the signature
   states immediately using a new measurement type, **quantum state elimination**, recording which states are
   *excluded* rather than storing the states. This is what made fielded demos possible.

2. **Reusing QKD components (2014→).**
   QDS protocols were re-cast to run on the same hardware as Quantum Key Distribution
   ([Wallden, Dunjko, Kent, Andersson, *"Quantum digital signatures with quantum-key-distribution components,"*
   Phys. Rev. A 91, 042304 (2015)](https://journals.aps.org/pra/abstract/10.1103/PhysRevA.91.042304)). This
   matters because it lets QDS ride the entire QKD engineering ecosystem (sources, detectors, decoy states) — but
   it is also exactly why the **MDI-QDS vs QKD differentiation** below is essential: sharing hardware does **not**
   make them the same protocol, and conflating them is the single most common error in this space.

A later efficiency leap — **One-Time Universal Hashing QDS (OTUH-QDS)** — lets the signer directly sign the
**hash** of a multi-bit message with one key string, instead of one expensive quantum round per bit
([Li, Xie, Cao, Li, Fu, Yin & Chen, *"One-Time Universal Hashing Quantum Digital Signatures without Perfect
Keys,"* Phys. Rev. Applied 20, 044011 (2023)](https://link.aps.org/doi/10.1103/PhysRevApplied.20.044011)). It
claims "nearly eight orders of magnitude" higher signature rate for a megabit message vs single-bit schemes, and
notably proves that **imperfect** quantum keys (error-corrected but *not* privacy-amplified) suffice — which
later enabled chip integration (§4). OTUH-QDS is the protocol behind today's longest-distance and chip demos.

---

## 4. Honest survey table — security model, hardware, throughput, PKI gap

All throughput numbers below are **from the cited demonstrations**, on **their** apparatus (single-photon-grade
optics, superconducting nanowire detectors). They are **not** Galerina benchmarks and there is **no Galerina bench**
for this lane — per posture, performance claims carry their source machine, and the Galerina-side number is a
**THEORETICAL GAP**: none exists because there is no hardware to run it on (§7).

| Scheme / demo | Security model | Hardware assumptions | Throughput (on cited apparatus) | PKI / key model | Citation |
|---|---|---|---|---|---|
| Gottesman–Chuang (2001) — original | Info-theoretic; forgery hardness from no-cloning of non-orthogonal states | Quantum public-key states + **long-term quantum memory**; *O(m)* qubits per recipient | Theoretical (no demo) | Quantum public keys, limited copies, **no classical PKI** | [arXiv:quant-ph/0105032](https://arxiv.org/abs/quant-ph/0105032) |
| Collins et al. (2014) — no quantum memory | Info-theoretic; forgery from non-orthogonal-state indistinguishability | Linear optics + photodetectors; **no quantum memory** (quantum state elimination) | First memory-free realization (lab) | Pre-distributed quantum signature states; fixed parties | [PRL 113, 040502](https://link.aps.org/doi/10.1103/PhysRevLett.113.040502) |
| Roberts et al. (2017) — **MDI-QDS** | Info-theoretic; **closes all detector side-channels**; non-repudiation prob. set < 0.5 × 10⁻¹⁰ | MDI link (untrusted central measurement); single-photon sources; **untrusted detectors** | **1 signed bit / 45 s** over 50 km MDI fiber; signature block 2.5 × 10⁶ bits; QBER 0.5% | 3-party (Alice signs; Bob, Charlie verify); pre-shared correlated material; **no PKI** | [Nat. Commun. 8, 1098 (2017)](https://pmc.ncbi.nlm.nih.gov/articles/PMC5653667/) |
| Roberts et al. (2017) — QKD-mediated (comparison) | Info-theoretic; **trusts detectors** (not MDI) | Standard QKD detectors (trusted) | **1 signed bit / 72 ms** over 25 km | Same 3-party / pre-shared model | [Nat. Commun. 8, 1098 (2017)](https://pmc.ncbi.nlm.nih.gov/articles/PMC5653667/) |
| Yin group (2023) — OTUH-QDS | Info-theoretic; signs hash of multi-bit msg; works with **imperfect (non-PA) keys** | Twin-field QKD class hardware; SNSPDs | ~0.01 signatures/s at 650 km (twin-field, cited model) | Secret-sharing-derived **asymmetric** key relation among 3 fixed parties; **no PKI** | [Phys. Rev. Applied 20, 044011 (2023)](https://link.aps.org/doi/10.1103/PhysRevApplied.20.044011) |
| Du et al. (2025) — **chip-integrated** QDS network | Info-theoretic; security bound ϵ = 4.72 × 10⁻⁸ (forge/repudiate/tamper) | **Silicon-photonic** encoder (6×3 mm²) + decoder (1.6×1.7 mm²) chips; SNSPDs; **trusted-relay** star (BB84 prepare-and-measure, **not MDI**; MDI is named only as a future upgrade) | **0.0414 signatures/s for a 1 Mbit message** over 200 km | 1-decoy OTUH-QDS; 3-node network; pre-enrolled parties; **no PKI** | [Light: Sci. Appl. 14 (2025)](https://www.nature.com/articles/s41377-025-01775-4) |
| Lin et al. (2026) — 250 km fiber **[recent preprint, not peer-reviewed]** | Info-theoretic; ϵ = 10⁻⁹; ϵ_repudiation = 0 (deterministic), ϵ_forge ≤ m/2^(n−1) | 1.25 GHz DFB-laser transmitters; SNSPDs (>70% eff.); BB84 one-decoy | 5186.8 / 1500.2 / **1.25** signatures/s at 75 / 100 / 250 km (1 Mbit doc) | OTUH-QDS; fixed parties; **no PKI** | [arXiv:2603.16764 (Mar 2026)](https://arxiv.org/abs/2603.16764) |

**Reading the throughput column honestly:** the headline is that even the **best peer-reviewed** results are
fractions of a signature per second over metro-to-regional distances (0.0414 sig/s for a 1 Mbit message at
200 km, chip-integrated; ~0.01 sig/s at 650 km twin-field). The 2026 preprint reports thousands of signatures/s
at short distance (75 km) collapsing to 1.25/s at 250 km — but it is a **recent, non-peer-reviewed preprint**
(arXiv:2603.16764, submitted March 2026) and is cited here only as a *trend indicator*, **not** as a settled
result. The peer-reviewed envelope is sub-1-Hz at useful range. That is the throughput reality.

---

## 5. The PKI gap — why there is no public-key infrastructure (and why that is structural, not fixable by engineering)

This is the blocker that most directly clashes with how Galerina signs today, so it gets its own section.

A classical public key (Ed25519, ML-DSA-65 — see [`../spec/signature-custody-v0.md`](../spec/signature-custody-v0.md))
is a **freely copyable bit string**. Anyone can fetch it, cache it, mirror it, and verify against it without
ever talking to the signer. That copyability is the entire foundation of PKI: certificate chains, key endpoints,
trust registries, the Trust Capsule's `key_id → trusted pubkey` resolution (custody §7).

QDS has **no such object**. Its "public key" is either (a) a set of *quantum states* that — per Gottesman–Chuang —
**cannot be freely copied** without destroying security ("only a limited number of copies can be in circulation,
or the scheme becomes insecure"), or (b) in the modern QKD-component schemes, **pre-distributed, quantum-correlated
classical key material** shared pairwise between a *fixed, pre-enrolled set of parties* over authenticated quantum
channels. In OTUH-QDS the three parties' keys satisfy a secret-sharing relation (e.g. `Xa = Xb ⊕ Xc`) established
during the quantum key-generation phase ([PRA 20, 044011 (2023)](https://link.aps.org/doi/10.1103/PhysRevApplied.20.044011)).

Consequences, stated plainly:

- **No "fetch the signer's public key and verify offline."** Verification requires the verifier to already hold
  pre-shared quantum-correlated material with the signer. New, previously-unknown verifiers cannot join after the
  fact the way they can with a classical certificate.
- **It is closed-set, not open-world.** QDS authenticates among a fixed enrolled group with prior quantum-channel
  setup. The open-world, anyone-can-verify model that Galerina's Trust Capsule depends on does not exist here.
- **This is structural, not a missing feature.** It follows directly from no-cloning. You cannot bolt a classical
  PKI onto QDS without giving up the very property (un-copyable key material) that provides the security. There is
  no known engineering path that turns QDS into a classical-PKI-compatible primitive.

For the charter's bar — *"public verifiability · non-repudiation · no trusted-channel requirement ·
PKI-compatible"* (§0) — QDS **fails PKI-compatible and fails no-trusted-channel-requirement by construction.**
That is precisely why it stays Tier-B cold-path and why the **near-term Trust Capsule signs with the digital
hybrid (#34), not with QDS.**

---

## 6. GUARDRAIL — MDI-QDS vs standard QKD, and the non-repudiation arbitration mechanics

> Charter guardrail (verbatim): *"ensure the survey strictly differentiates MDI-QDS from standard QKD,
> specifically addressing the non-repudiation arbitration mechanics."*

### 6.1 MDI-QDS is not QKD — they solve different problems on shared hardware

They run on overlapping hardware (§3), which is exactly why they get conflated. They are not the same:

| Axis | QKD (e.g. BB84, MDI-QKD) | (MDI-)QDS |
|---|---|---|
| **Goal** | **Secrecy** — establish a shared *secret key* between two parties for later encryption | **Authenticity + non-repudiation** — let one signer convince *multiple* recipients a message is genuinely hers and was not altered |
| Output | a shared secret key | a verifiable signature with transferability/repudiation guarantees |
| Parties | 2 (sender, receiver) | ≥ 3 (1 signer + ≥ 2 verifiers — the extra verifier is *required* for non-repudiation, see 6.2) |
| What "MDI" adds | removes trust in the *measurement detectors* (closes all detector side-channel attacks) | **same** — MDI-QDS removes trust in detectors, "arguably most exposed to external attacks" ([Nat. Commun. 8, 1098](https://pmc.ncbi.nlm.nih.gov/articles/PMC5653667/)) |
| Non-repudiation | **not a goal** — QKD says nothing about repudiation | **central goal** — and it is what forces the 3-party structure |

The 2017 MDI-QDS authors state the distinction directly: "the goal of digital signatures is demonstrating the
authenticity of a signed message to multiple recipients rather than keeping it secret"
([Nat. Commun. 8, 1098 (2017)](https://pmc.ncbi.nlm.nih.gov/articles/PMC5653667/)). **MDI-QDS uses MDI-QKD-style
hardware to distribute the signing key material, but the protocol on top is a signature scheme, not key
agreement.** "MDI" qualifies the *detector trust assumption*, not the cryptographic function.

### 6.2 Non-repudiation arbitration mechanics (the guardrail's specific demand)

QDS does **not** provide classical, universal non-repudiation. It provides a **bounded** form built out of
**transferability** + a **multi-party majority/symmetrization arbitration**, and the bound is explicit and
statistical, not absolute. Mechanics, grounded in the cited schemes:

**(a) The dual-threshold structure.** Each recipient verifies a signature by counting mismatches against
**two thresholds**, not one. A signature is accepted as authentic below a *stricter* threshold, and accepted as
*transferable* (safe to forward to another party) only below an even *stricter* one. The gap between the two
thresholds is the engineering room that makes the next step work.

**(b) Transferability ≈ non-repudiation for the 3-party case.** The repudiation question — *can the signer later
deny a message a verifier accepted?* — is, for one signer + two receivers, **identical** to transferability: if
an honest receiver (Bob) accepts, any other honest receiver (Charlie) must also accept with high probability. If
that holds, the signer cannot have it accepted by one and rejected by another, i.e. cannot repudiate. The MDI-QDS
demo sets the **repudiation probability < 0.5 × 10⁻¹⁰** ([Nat. Commun. 8, 1098](https://pmc.ncbi.nlm.nih.gov/articles/PMC5653667/)).

**(c) Symmetrization / arbitration — the actual dispute-resolution step.** Because Bob's and Charlie's raw key
shares differ, the protocol forces them to a **symmetric decision** before verdicts are final. In OTUH-QDS the
mechanic is explicit ([PRA 20, 044011 (2023)](https://link.aps.org/doi/10.1103/PhysRevApplied.20.044011)):

  1. Bob forwards the message, signature, *and his key bit strings* `{Xb, Yb, Zb}` to Charlie;
  2. Charlie forwards *his* key bit strings `{Xc, Yc, Zc}` to Bob;
  3. each combines the shares by XOR (`KXb = Xb ⊕ Xc`, …) so both now hold the **same** combined key;
  4. each independently recomputes the expected hash digest and accepts iff it matches;
  5. because they hold identical combined keys and run identical hash checks, **"when Bob rejects (accepts) the
     message, Charlie also rejects (accepts) it."**

This symmetrization is the **arbitration mechanism**: a dispute over whether the signer signed is resolved by the
two verifiers exchanging shares and reaching a forced-identical verdict; with > 2 verifiers it generalizes to a
**majority vote**. The asymmetric key relation (`Xa = Xb ⊕ Xc`) ensures **only the signer** could have produced a
digest that verifies against the combined key — that is what stops the signer repudiating and stops either
verifier forging unilaterally.

**(d) The bounds are explicit and statistical — and this is the honesty point.** The guarantees are
ε-parameterized failure probabilities, not the absolute "computationally infeasible" of classical EUF-CMA:

| Bound | Meaning | Example value (cited) |
|---|---|---|
| ε_forge | prob. a forger produces an accepted signature | ≤ m·2^(1−H_n) (LFSR-Toeplitz); ϵ ≤ m/2^(n−1) ([arXiv:2603.16764](https://arxiv.org/abs/2603.16764)) |
| ε_rep (repudiation) | prob. signer makes two honest verifiers disagree | < 0.5 × 10⁻¹⁰ ([Nat. Commun. 8, 1098](https://pmc.ncbi.nlm.nih.gov/articles/PMC5653667/)); ε_rep = 0 deterministic in some OTUH variants |
| ε_rob (robustness) | prob. an honest signature is wrongly rejected | 2ε_cor + 2ε′ ([PRA 20, 044011](https://link.aps.org/doi/10.1103/PhysRevApplied.20.044011)) |

**So the honest verification-semantics statement is:** QDS non-repudiation is a **statistically-bounded,
arbitration-dependent, closed-group** property — it requires the verifiers to be enrolled, to hold pre-shared
quantum-correlated material, and (in dispute) to run the symmetrization exchange. It is **not** the open-world,
offline, anyone-can-check non-repudiation of a classical digital signature. Different guarantee, honestly labelled.

---

## 7. Honest blockers — why track-not-build (the charter's four, confirmed)

1. **Needs quantum channels + specialized hardware.** Every demo above requires single-photon-grade sources and
   **superconducting nanowire single-photon detectors (SNSPDs)** — typically cryogenically cooled — plus a
   quantum channel (installed fiber or free space). This is lab/metro-network infrastructure, not commodity. Even
   the chip-integrated demo ([Light: Sci. Appl. 2025](https://www.nature.com/articles/s41377-025-01775-4)) puts
   the cheap part on silicon but still needs SNSPDs at the relay.

2. **Tiny throughput.** Peer-reviewed best is **sub-1-Hz at useful range** (0.0414 sig/s for 1 Mbit at 200 km;
   ~0.01 sig/s at 650 km). The MDI demo was **45 seconds per signed bit**. Adequate for rare, ultra-high-value
   cold-path signing; useless for anything interactive or high-volume.

3. **No PKI** (see §5). Pre-distributed, quantum-correlated key material among a fixed enrolled set; not
   classical-public-key-compatible; structural, follows from no-cloning.

4. **Verification semantics differ** (see §6). Transferability/repudiation **bounds** + arbitration, not classical
   universal non-repudiation. Closed-group, statistical, dispute-resolution-dependent.

**The performance THEORETICAL GAP (stated explicitly per posture):** there is **no Galerina benchmark** for this
lane and there cannot be one — we have no quantum-channel hardware to run it on. All numbers in this doc are the
cited authors' results on the cited authors' apparatus. No Galerina-side throughput, latency, or cost number is
asserted, synthesized, or extrapolated. When/if a hardware path opens, the acceptance bar would be a reproducible
demo with its machine, exactly as for the digital lanes.

---

## 8. Galerina role — define the governance interface (Tier-B Path B), do **not** build

The charter directs (§1 Lane B, §4): track the literature + **define the governance interface** for a future
Tier-B "strong/slow/cold-path" lane (brief §10 Path B); no build. Here is that interface, defined so that QDS
*could* be slotted in later **without weakening any current guarantee** — and so the system **fails closed** until
real hardware + a real key story exist.

### 8.1 How QDS would appear to the existing signature machinery

The built signature block ([`../spec/signature-custody-v0.md`](../spec/signature-custody-v0.md) §4) is an
extensible, length-prefixed list of `(alg, pubkey, signature)` entries with **AND** (logical-conjunction)
verification across entries. QDS slots in as a **reserved future `alg` id** in that table — but with three
governance constraints that are non-negotiable:

| Interface element | Definition for the QDS Tier-B lane |
|---|---|
| **Algorithm id** | A new reserved `alg` value (the current table uses 1=Ed25519, 2=ML-DSA-65, 3=SLH-DSA-256s, 4=ML-DSA-87; QDS would be a **future** id, **not** allocated until a vetted impl + hardware exist). |
| **Hybrid posture** | QDS is **only ever an additional AND-term**, never a replacement. A `.tmf` would be `{Ed25519, ML-DSA-65 (or ML-DSA-87/SLH-DSA), QDS}` — verification = AND. A QDS-only profile is **forbidden** because it would forfeit open-world public verifiability (§5). The artifact stays classically verifiable by anyone; QDS adds an *extra*, closed-group, quantum guarantee on top for the parties who can check it. |
| **Verifier capability gate** | Whether a verifier *can* check the QDS term is a **capability**, resolved through the Galerina governance/capability boundary — exactly the host-call seam the digital signer already uses (custody §7; crypto cannot live in `.spore`). A verifier **without** QDS capability MUST treat the QDS term as **`unknown → deny`** for the cold-path tier (fail-closed), **not** silently skip it. |
| **Key/trust resolution** | The QDS pre-shared/quantum-correlated material is enrolled and resolved through the **Trust Capsule / attestation surface** (custody §7), the same `key_id`-style registry that admits `mlDsaPublicKey` today — **never** trust-on-first-use, **never** trust material carried in the file. Because QDS keys are not freely copyable (§5), this registry entry is a *capability + enrollment record*, not a copyable public key. |
| **Tier** | **Tier-B "strong/slow/cold-path"** only (brief §10 Path B). Never on the hot path. Pairs naturally with the existing L5 long-lived cold-path profile (`{ML-DSA-87, SLH-DSA-256s}`, custody §5) for decades-lived archives where 45 s/bit is irrelevant. |

### 8.2 The fail-closed rule for this lane (the load-bearing line)

> A `.tmf` whose signature block contains a QDS AND-term, presented to a verifier that **cannot** evaluate that
> term (no quantum-channel capability / not enrolled), MUST resolve the QDS term to **`unknown → deny`** for any
> policy that *requires* the Tier-B guarantee — and MUST NOT downgrade by dropping the term. (A policy that only
> requires the classical hybrid still verifies via the AND-surviving classical terms; the QDS term is then an
> un-asserted bonus, not a silently-failed requirement. The governance policy, not the file, decides which.)

This keeps the honest separation: **honest-core = the digital hybrid #34 that ships now and is verifiable by
anyone; aspirational = the QDS Tier-B term, fully spec'd as an interface, gated behind capability + enrollment,
inert and deny-by-default until the hardware and key story are real.**

### 8.3 What would move QDS from "track" to "build" (acceptance criteria for a future phase)

- A vetted, standardized QDS implementation behind the Galerina host-call boundary (today: none — no NIST/FIPS QDS
  standard exists; the field is research-grade).
- A quantum-channel / hardware path actually available to the relevant parties (today: none in scope).
- A reproducible benchmark **with its machine** showing the Tier-B lane meets its cold-path latency budget (today:
  THEORETICAL GAP, §7).
- An enrollment/registry story for non-copyable key material that fits the Trust Capsule model (today: design
  sketch only, §8.1).

Until **all four** hold, the directive stands: **track the literature, keep the interface defined and inert, do
not build.**

---

## 9. Cross-references

- [`../spec/signature-custody-v0.md`](../spec/signature-custody-v0.md) — the digital hybrid **#34** (Ed25519 +
  ML-DSA-65 over a 32-byte digest) the near-term Trust Capsule signs with; §4 extensible `alg` block QDS would
  slot into; §5 L5 cold-path profile; §7 custody/Trust-Capsule resolution this lane reuses.
- [`../../ENCRYPTION-RND-FULL-BRIEF.md`](../../ENCRYPTION-RND-FULL-BRIEF.md) §3 (CRYPTO-ON-CORE — why a photon
  cannot *be* a classical signature, and why QDS sidesteps that by changing the security model), §10 Path B
  (the "strong/slow/cold-path" Tier-B lane this doc defines the interface for).
- [`../../RESEARCH-PHASE-photonic-signing-and-trust-capsule.md`](../../RESEARCH-PHASE-photonic-signing-and-trust-capsule.md)
  §0 (the bar any "new way of signing" must clear), §1 Lane B, §3 (honest ledger), §4 (Lane B acceptance).
- Sibling lane docs in this folder: [`photonic-lane-D-qrng.md`](photonic-lane-D-qrng.md) (entropy source, the
  other quantum-but-peripheral lane).

## 10. Sources (all retrieved 2026-06-16)

1. Gottesman, D. & Chuang, I. L., *"Quantum Digital Signatures,"* arXiv:quant-ph/0105032 (2001) —
   https://arxiv.org/abs/quant-ph/0105032 *(foundational scheme; quantum public keys, no-cloning security,
   limited-copies / quantum-memory limitations).*
2. Collins, R. J., Donaldson, R. J., Dunjko, V., Wallden, P., Clarke, P. J., Andersson, E., Jeffers, J. & Buller,
   G. S., *"Realization of Quantum Digital Signatures without the Requirement of Quantum Memory,"* Phys. Rev.
   Lett. **113**, 040502 (2014) — https://link.aps.org/doi/10.1103/PhysRevLett.113.040502 *(no quantum memory;
   quantum state elimination; forgery security from non-orthogonal-state indistinguishability).*
3. Wallden, P., Dunjko, V., Kent, A. & Andersson, E., *"Quantum digital signatures with quantum-key-distribution
   components,"* Phys. Rev. A **91**, 042304 (2015) — https://journals.aps.org/pra/abstract/10.1103/PhysRevA.91.042304
   *(QDS on QKD hardware — the basis for the QKD-vs-QDS differentiation).*
4. Roberts, G. L., Lucamarini, M., Yuan, Z. L., Dynes, J. F., Comandar, L. C., Sharpe, A. W., Shields, A. J.,
   Curty, M., Puthoor, I. V. & Andersson, E., *"Experimental measurement-device-independent quantum digital
   signatures,"* Nature Communications **8**, 1098 (2017) — https://pmc.ncbi.nlm.nih.gov/articles/PMC5653667/
   *(MDI-QDS; detector-side-channel removal; 1 signed bit/45 s over 50 km; repudiation < 0.5×10⁻¹⁰; QDS≠QKD
   statement).*
5. Li, B.-H., Xie, Y.-M., Cao, X.-Y., Li, C.-L., Fu, Y., Yin, H.-L. & Chen, Z.-B., *"One-Time Universal Hashing
   Quantum Digital Signatures without Perfect Keys,"* Phys. Rev. Applied **20**, 044011 (2023) —
   https://link.aps.org/doi/10.1103/PhysRevApplied.20.044011 *(OTUH-QDS; secret-sharing asymmetric keys;
   symmetrization arbitration mechanics; ε_forge/ε_rep/ε_rob bounds).*
6. Du, Y. et al., *"Chip-integrated quantum signature network over 200 km,"* Light: Science & Applications **14**
   (2025) — https://www.nature.com/articles/s41377-025-01775-4 *(silicon-photonic encoder/decoder chips;
   0.0414 sig/s for 1 Mbit at 200 km; ϵ = 4.72×10⁻⁸; 1-decoy OTUH-QDS trusted-relay star network, **not MDI** — MDI named only as a future upgrade).*
7. Lin, J. et al., *"High-rate quantum digital signatures over 250 km of optical fiber,"* **arXiv:2603.16764
   (submitted Mar 2026) — RECENT PREPRINT, NOT PEER-REVIEWED** — https://arxiv.org/abs/2603.16764 *(cited only
   as a trend indicator: 5186.8/1500.2/1.25 sig/s at 75/100/250 km; ε = 10⁻⁹; treat as provisional).*
8. FIPS 204, *Module-Lattice-Based Digital Signature Standard (ML-DSA)* — https://csrc.nist.gov/pubs/fips/204/final
   *(the classical-PQ primitive #34 / the Trust Capsule actually signs with; the EUF-CMA bar QDS does NOT meet in
   the classical sense).*
