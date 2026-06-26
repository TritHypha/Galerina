<!-- ABSORBED R&D SOURCE — verbatim mirror. Galerina is the main library; the R&D repo is upstream/authoring.
     Source: Galerina-R-AND-D/tri-encription/research/metadata-confidentiality.md  ·  Pinned: R&D fb68d06 (2026-06-16)
     Integrated Galerina view: galerina-privacy-embedding-egress.md  ·  Catalog: galerina-rd-absorption-catalog.md
     Rule: edit the upstream source then re-vendor; do not fork this copy (feedback-auto-import-rd-docs). -->

> **Absorbed R&D source (verbatim).** This is the archived upstream document. Curated/integrated view: `galerina-privacy-embedding-egress.md`. See `galerina-rd-absorption-catalog.md` for the full ledger. Internal links below point at the upstream R&D tree.

---
# Metadata confidentiality vs. in-network semantic routing for `.tmf` (R&D)

> **Status:** Research note (grounded, cited, adversarially verified). **Date:** 2026-06-16.
> **Question:** The `.tmf`/TUFC design puts a dense **semantic attribute/embedding vector in the cleartext
> packet header** so routers/firewalls can filter/route on *meaning* without decrypting the KEM-DEM payload
> (`notes/2.md:45`, `notes/3.md:58`). Does that leak content, and is there any practical way to keep the
> in-network semantic-routing feature without the leak?
> **Posture:** commodity/grounded; every claim cited; the four core verdict claims were stress-tested by
> independent agents tasked to *falsify* them — **all four held**.
> **Resolves:** Open Question #2 of [`SPORE-AMD-024`](SPORE-AMD-024-tmf-confidentiality.md) (the item I flagged
> as the sharpest unresolved security question). Companion: [`quantum-resilient-tri-encryption.md`](quantum-resilient-tri-encryption.md).

---

## 0. Verdict (TL;DR)

**A dense semantic embedding in the cleartext `.tmf` header is, in security terms, close to shipping the
plaintext — it largely negates the KEM-DEM payload encryption it sits beside. There is no practical way to
route/filter on *meaning* in-network at line rate without leaking content. The grounded, zero-trust answer is
metadata minimization: encrypt the embedding inside the DEM, expose only integrity/authenticity metadata on
the wire, and do all fine semantic filtering at trusted, key-holding endpoints.**

| The four findings | Verdict |
|---|---|
| **1. Cleartext embeddings *are* content.** Inversion attacks reconstruct text from the vector alone — vec2text ~92% exact recovery of 32-token text (BLEU 97.3), names from clinical-note embeddings; ZSinvert (2025) ">80% leakage for all encoders." | leaks **reconstructable content** (worst tier) [[vec2text]] [[ZSinvert]] |
| **2. "Filter on encrypted data instead" (SSE/OPE/encrypted-ANN)** all leak access/search/order/distance patterns that published leakage-abuse attacks exploit — and are offline/stateful, **not line-rate in-network**. `.tmf` is *weaker* than SSE (cleartext vector vs. opaque token). | **no leak-free in-network filtering** [[Cash15]] [[NKW15]] [[Grubbs17]] |
| **3. Heavyweight private compute (FHE/FE/PIR/PSI)** is 4–9 orders of magnitude too slow for line rate, and FE/predicate eval *inverts zero-trust* (the router must hold a secret key → a compromised router becomes an inversion oracle) while still leaking the score. | **impractical + breaks zero-trust** [[FHIPE]] [[SimplePIR]] |
| **4. Metadata minimization is the established pattern** (ECH, Oblivious HTTP/RFC 9458, Tor, RFC 6973) — route on opaque transport, never on meaning; the whole trend *removes* semantic metadata from middleboxes. Coarse LSH buckets still leak (Google FLoC: 10%+ history reconstructed for 30% of users → abandoned). | **the right pattern; `.tmf` inverts it** [[OHTTP]] [[FLoC]] |

**Recommended default for `.tmf`:** *do not expose the embedding on the wire.* Carry only the existing
integrity/authenticity metadata (the signed TMX-256 root, coordinate, modality, version) in cleartext;
**encrypt the attribute vector inside the AEAD payload**; perform semantic filtering at trusted endpoints
(the OHTTP/ECH pattern). If — and only if — an owner explicitly accepts a *measured* confidentiality loss for
a real routing need, the least-bad in-network option is a **coarse, keyed/salted, k-anonymous, few-bit routing
tag** (never the raw or distance-preserving vector), labelled as leaking that bucket + access/order/frequency
patterns. This is consistent with `encryption-on-photonic-substrates.md` §5.2/§7, which already keeps the
ANN/similarity layer *outside* the trust gate on decrypted-and-verified plaintext.

---

## 1. The tension

The notes sell a headline feature: routers/firewalls scan the semantic attribute layer to filter/route
*"without ever unpacking or decrypting the main file payload."* The implicit security claim is that this is
safe because the payload is KEM-DEM-encrypted (SPORE-AMD-024) and the attribute layer is "just metadata." This
note tests that claim. It is false: the attribute layer is **content-bearing**, and there is no practical
mechanism that preserves in-network semantic routing without leaking it.

Throughout, leakage is graded: **(i)** leaks nothing · **(ii)** leaks access/search/order/distance/frequency
*patterns* · **(iii)** leaks *reconstructable content*. The `.tmf` attribute layer is **(iii)**.

---

## 2. Finding 1 — a cleartext embedding *is* content (embedding inversion)

Dense embeddings are not opaque semantic tags; they are lossy-but-rich encodings of the input that
published attacks invert back to text:

- **vec2text** (Morris et al., EMNLP 2023): iteratively reconstructs text from embeddings — **~92% exact
  recovery of 32-token inputs, BLEU up to 97.3**, and recovered **full patient names from clinical-note
  embeddings**. [[vec2text]]
- **GEIA** (Li et al., ACL Findings 2023): a generative decoder reconstructs **whole coherent sentences**
  from one embedding in a single pass, recovering sensitive spans. [[GEIA]]
- **Song & Raghunathan** (CCS 2020): three attacks on the *same* embedding — inversion (50–70% of input
  words), **attribute inference** (authorship from "a handful of labeled vectors"), and membership inference.
  [[SongR]]
- **ZSinvert** (2025): *universal, zero-shot, encoder-independent, black-box* inversion — ">80% leakage rate
  for all encoders," **robust to Gaussian noise at utility-preserving levels**, concluding bluntly that
  *"sharing the embeddings of confidential or sensitive documents … is equivalent to sharing the documents
  themselves."* [[ZSinvert]]

**Two distinctions the `.tmf` premise blurs:**
1. **The inversion cost is on the *attacker's offline* side, not the router.** "It's too expensive to invert
   at line rate" is a non-argument — the leak is in the *bytes on the wire*; anyone who logs `.tmf` headers
   inverts offline. The router doing cheap dot-products changes nothing.
2. **Defenses trade away the exact utility the feature needs.** Noise / quantization / product-quantization
   reduce recoverability *only by degrading semantic precision* — and ZSinvert survives utility-preserving
   noise. There is a measured privacy/utility tension, not a free lunch. [[Vec2TextDefense]]

Even with **no** inverter, a cleartext vector trivially leaks tier-(ii) structure: cluster, dedup, rank, and
link packets by their geometry. **So exposing the embedding largely defeats the payload encryption.**

---

## 3. Finding 2 — "filter on encrypted data instead" leaks, and isn't line-rate

The encrypted-search literature is the definitive evidence that *filtering on protected data without
decrypting is not leak-free in practice*, and it doesn't fit the in-network model:

- **SSE** (sublinear) leaks **access pattern, search pattern, and volume** *by design*; a decade of
  leakage-abuse attacks turns those into query/content recovery: IKK (NDSS 2012); **Count** (Cash et al., CCS
  2015 — 63% of the 500 top keywords have unique result-counts on Enron); **file-injection** (USENIX 2016 —
  **100% query recovery** with `⌈log₂|K|⌉` injected docs); **LEAP** (CCS 2021 — exact recovery from partial
  knowledge); **Oya–Kerschbaum** (USENIX 2021 — search-pattern leakage defeats access-pattern-hiding
  defenses). [[Cash15]] [[FileInj]] [[OyaK]]
- **OPE/ORE & property-preserving DBs** leak order/frequency/distance and fall to pure inference: **Naveed–
  Kamara–Wright** (CCS 2015) recovered attributes for **near-100% of patients** across 200 hospitals from
  ciphertext + public data; **Grubbs et al.** (S&P 2017) recovered **99% of first names, 97% of last names,
  90% of birthdates** from ORE; **Boldyreva** proved ideal OPE is impractical (exponential ciphertexts).
  [[NKW15]] [[Grubbs17]] [[Boldyreva]]
- **Encrypted ANN / kNN** leaks the query-result set, enabling reconstruction (Kornaropoulos et al., S&P 2019
  — relative error down to 0.003%); distance-comparison-preserving encryption (DCPE) leaks approximate
  distances **by design** — exactly the quantity a router would route on. [[kNNleak]] [[DCPE]]

**Critically, all of this is offline, stateful, client–server encrypted *search* — not stateless, line-rate,
midpath routing.** And `.tmf` is *strictly weaker* than SSE: SSE hides the keyword behind an opaque
pseudorandom token and only leaks side-channels; `.tmf` puts the embedding itself in cleartext. The only way
to suppress access-pattern leakage is **ORAM** (polylog–linear blowup) — orders of magnitude from line rate.

---

## 4. Finding 3 — FHE / FE / PIR / PSI: impractical *and* zero-trust-breaking

The heavyweight primitives that *could* hide an attribute during a predicate evaluation fail on two axes —
speed and trust model:

- **Functional / predicate encryption** is the only one whose operation resembles "evaluate a function on a
  ciphertext," but (a) the router must **hold a function secret key** — turning it into a trusted decryptor,
  so a compromised router becomes an **embedding-inversion oracle** (a direct zero-trust violation); and (b)
  it leaks the **inner-product/score** (distance), which over repeated routing reconstructs the embedding.
  Practical function-hiding IPE is **~100 ms for length-50 vectors** — ~8 orders of magnitude from
  per-packet line rate. [[FHIPE]]
- **FHE** computes on ciphertext at **~10,000× slowdown**, and produces an **encrypted result the router
  can't read** to make a forwarding decision — the trust model is inverted even ignoring speed. [[FHEsurvey]]
- **PIR** requires a full DB scan per query and hides the *client's* access — the inverse of a router
  filtering attributes; second-scale, not a packet primitive. **PSI** is a two-party *endpoint* protocol
  (~seconds, ~100s of MB for 100K elements); an on-path router is an undefined third party. [[SimplePIR]] [[PSI]]

**The only thing that actually runs at line rate is the opposite of private compute:** P4/programmable-switch
ML that classifies traffic from **plaintext** side-channels (packet sizes, timing) — i.e. it *embraces*
leakage, which is exactly what the `.tmf` cleartext-attribute layer already does. [[P4ETC]]

---

## 5. Finding 4 — metadata minimization is the established (and opposite) pattern

Every deployed system that "routes without revealing content" does so by routing on **opaque transport
encapsulation** and decrypting content only at **trusted, key-holding endpoints**:

- **Oblivious HTTP (RFC 9458, 2024):** the relay sees the client IP but not the content; the gateway decrypts
  content but never sees the IP — *no single party holds both*. Routing is on encapsulation, not meaning.
  [[OHTTP]]
- **Encrypted Client Hello (ECH):** encrypts the real SNI/ALPN so middleboxes see only a generic outer
  ClientHello — the explicit goal is to *remove* content/destination metadata from the wire. Firewall vendors
  treat ECH as an **evasion problem** — i.e. the network is *supposed* to be denied semantic visibility.
  [[ECH]] [[CiscoECH]]
- **RFC 6973 (data minimization):** "limiting the data … to only what is necessary … is the most
  straightforward way to reduce privacy risks." A dense cleartext embedding maximizes amount, identifiability,
  and persistence — the antithesis. [[RFC6973]]

And **coarsening to an LSH bucket does not rescue it:** Google's **FLoC** (cohort = coarse LSH bucket) was
shown to leak — **10%+ of browsing history reconstructed for 30% of users from cohort hashes alone** (PETS
2023) — and was **abandoned** over re-identification/fingerprinting. A coarse tag can be made *tolerably*
leaky only as a small, fixed, low-entropy, keyed/salted, k-anonymous label — and even then it leaks the bucket
plus access/order/frequency/linkage patterns. [[FLoC]] [[EFFFLoC]]

> There is **no "leaks nothing" in-network point** on this curve — even Tor leaks timing/volume
> (website-fingerprinting), and SSE leaks access/search patterns. Any honest `.tmf` claim must state what it
> leaks, never "leaks nothing."

---

## 6. The recommendation for `.tmf`

The realistic options, scored against zero-trust:

| Option | What's on the wire | Leakage | In-network semantic routing? | Verdict |
|---|---|---|---|---|
| **(a) Integrity-only header** *(recommended default)* | signed TMX-256 root, coord, modality, version; **embedding encrypted in DEM** | tier (ii) only: type/size/coordinate + access/frequency | No (moved to endpoints) | **Adopt.** Fail-closed, zero-trust-consistent |
| **(b) Encrypt attribute layer, filter at trusted endpoints** | same as (a) | tier (ii) on the wire; endpoint sees plaintext (it's trusted) | At endpoints, yes; in-network, no | Correct posture; gives up *in-network* filtering |
| **(c) Coarse keyed/salted non-invertible routing tag** *(only with explicit owner sign-off)* | few-bit, low-cardinality, k-anonymous, per-epoch-keyed bucket | tier (ii) + bucket membership + linkage; **measured, not zero** | Coarse only | Least-bad *if* a real routing need is documented and the loss is accepted |
| **(d) Searchable/functional/distance-preserving encryption** | encrypted vector | explicit, bounded distance/order leakage; **not line-rate** | Not at line rate today | Reject for the fast path (offline/endpoint only) |

**Concrete amendment to SPORE-AMD-024:** the `.tmf` header must **not** carry a full cleartext semantic
embedding. The attribute vector moves *inside* the AEAD-sealed payload (bound by the existing AAD =
`TVCID ‖ modality ‖ crypto_profile ‖ epoch`). Routing/filtering on meaning happens at trusted, post-verify
endpoints. Two further hardening notes:
- The **always-present cleartext metadata** (modality, coord, payload-length, section-count) is itself tier-(ii)
  leakage; minimize it where the threat model warrants (length padding, coarse coordinate buckets).
- If option (c) is ever taken, the tag's safety must be **enforced by bounded information content** (small
  fixed vocabulary, keyed/salted per epoch, k-anonymity floor, optional DP noise) — *never* by assuming
  practical inversion hardness, because embedding inversion shows practical hardness is not a defense.

This is the same boundary the photonic-substrate note already drew: keep the ANN/similarity layer **outside
the trust gate**, on decrypted-and-verified plaintext.

---

## 7. Adversarial verification — we tried to prove this wrong

All four core claims survived independent refutation attempts (`refuted: false`). The strongest would-be
counterexamples *confirmed* the verdict:

| Claim | Result | Strongest counterexample → why it fails |
|---|---|---|
| Cleartext embeddings leak reconstructable content (not "metadata") | **confirmed** | Gaussian-noise defense → broken by ZSinvert at utility-preserving noise; encrypted/oblivious search (Compass/ORAM) → not keyless line-rate [[ZSinvert]] |
| SSE/OPE/encrypted-ANN leak patterns attacks exploit; none leak-free at line rate | **confirmed** | P4/Tofino line-rate classification → routes on *plaintext* side-channels (a leak, not a cure) [[P4ETC]] |
| FHE/FE/PIR can hide attributes in principle but none practical at line rate | **confirmed** | PINOT line-rate field encryption → *hides* a field (unroutable), opposite of routing on it |
| Metadata minimization (coarse non-invertible tag + endpoint filtering) is the zero-trust answer | **confirmed (nuance)** | BlindBox in-network DPI → exact-token, leaky, per-conn setup, weakened in follow-ups; **nuance:** even a coarse tag leaks bounded pattern info — enforce non-invertibility by bounded info, not assumed hardness |

---

## 8. Open questions / residual

1. **Tag design, if option (c) is taken:** exact bit-budget, salting/key-rotation cadence, k-anonymity floor,
   and whether DP noise on the bucket is worth the routing-precision loss — and a *measured* statement of what
   it leaks (no unbenchmarked "negligible").
2. **Cleartext-metadata minimization:** is length-padding / coarse-coordinate-bucketing of the always-present
   header fields warranted for the target threat model?
3. **Endpoint-side filtering throughput:** moving semantic filtering to trusted endpoints is correct; quantify
   the latency/throughput cost vs. the (insecure) in-network path so the trade-off is explicit.

---

## 9. Sources

**Embedding inversion (cleartext embedding = content)**
- [[vec2text]] Morris, Kuleshov, Shmatikov, Rush, *Text Embeddings Reveal (Almost) As Much As Text*, EMNLP 2023 — <https://arxiv.org/abs/2310.06816>
- [[GEIA]] Li et al., *Sentence Embedding Leaks More Information than You Expect (GEIA)*, ACL Findings 2023 — <https://arxiv.org/abs/2305.03010>
- [[SongR]] Song, Raghunathan, *Information Leakage in Embedding Models*, ACM CCS 2020 — <https://arxiv.org/abs/2004.00053>
- [[ZSinvert]] *Universal Zero-shot Embedding Inversion*, 2025 — <https://arxiv.org/abs/2504.00147>
- [[Vec2TextDefense]] Zhuang et al., *Understanding and Mitigating the Threat of Vec2Text*, SIGIR-AP 2024 — <https://arxiv.org/abs/2402.12784>

**Encrypted search / property-preserving leakage**
- [[Cash15]] Cash, Grubbs, Perry, Ristenpart, *Leakage-Abuse Attacks Against Searchable Encryption*, CCS 2015 — <https://eprint.iacr.org/2016/718.pdf>
- [[FileInj]] Zhang, Katz, Papamanthou, *All Your Queries Are Belong to Us (File-Injection)*, USENIX Security 2016 — <https://www.usenix.org/conference/usenixsecurity16/technical-sessions/presentation/zhang>
- [[OyaK]] Oya, Kerschbaum, *Hiding the Access Pattern is Not Enough*, USENIX Security 2021 — <https://arxiv.org/abs/2010.03465>
- [[NKW15]] Naveed, Kamara, Wright, *Inference Attacks on Property-Preserving Encrypted Databases*, CCS 2015 — <https://cs.brown.edu/people/seny/pubs/edb.pdf>
- [[Grubbs17]] Grubbs et al., *Leakage-Abuse Attacks against Order-Revealing Encryption*, IEEE S&P 2017 — <https://eprint.iacr.org/2016/895>
- [[Boldyreva]] Boldyreva, Chenette, O'Neill, *Order-Preserving Encryption Revisited*, CRYPTO 2011 — <https://eprint.iacr.org/2012/625>
- [[kNNleak]] Kornaropoulos, Papamanthou, Tamassia, *Data Recovery on Encrypted DBs with kNN Query Leakage*, IEEE S&P 2019 — <https://eprint.iacr.org/2018/719>
- [[DCPE]] Fuchsbauer, Ghosal, Hauke, O'Neill, *Approximate Distance-Comparison-Preserving Symmetric Encryption*, SCN 2022 — <https://eprint.iacr.org/2021/1666>

**Heavyweight private compute**
- [[FHIPE]] Kim, Lewi et al., *Function-Hiding Inner Product Encryption Is Practical*, SCN 2018 — <https://eprint.iacr.org/2016/440>
- [[FHEsurvey]] *Survey of optimization techniques for FHE bootstrapping*, Springer Cybersecurity 2026 — <https://link.springer.com/article/10.1186/s42400-026-00571-w>
- [[SimplePIR]] Henzinger et al., *SimplePIR/DoublePIR*, USENIX Security 2023 — <https://www.usenix.org/system/files/sec23summer_27-henzinger-prepub.pdf>
- [[PSI]] *PsiBench: Pragmatic Benchmark of Two-party PSI*, IACR ePrint 2020/1541 — <https://eprint.iacr.org/2020/1541.pdf>
- [[P4ETC]] Akem et al., *Encrypted Traffic Classification at Line Rate in Programmable Switches with ML*, IEEE NOMS 2024 — <https://dspace.networks.imdea.org/handle/20.500.12761/1791>

**Metadata minimization / network anonymity**
- [[OHTTP]] *Oblivious HTTP*, RFC 9458, IETF 2024 — <https://www.rfc-editor.org/rfc/rfc9458.html>
- [[ECH]] *TLS Encrypted Client Hello*, draft-ietf-tls-esni — <https://datatracker.ietf.org/doc/draft-ietf-tls-esni/>
- [[CiscoECH]] Cisco, *Encrypted Client Hello Defense Strategies* — <https://secure.cisco.com/secure-firewall/docs/encrypted-client-hello-defense-strategies-how-cisco-secure-firewall-tackles-ech>
- [[RFC6973]] *Privacy Considerations for Internet Protocols*, RFC 6973, IETF 2013 — <https://www.rfc-editor.org/rfc/rfc6973>
- [[FLoC]] Turati, Cotrini, Kubicek, Basin, *Locality-Sensitive Hashing Does Not Guarantee Privacy! Attacks on Google's FLoC*, PETS 2023 — <https://arxiv.org/abs/2302.13635>
- [[EFFFLoC]] EFF, *Google's FLoC Is a Terrible Idea*, 2021 — <https://www.eff.org/deeplinks/2021/03/googles-floc-terrible-idea>
- BlindBox: Sherry et al., *Deep Packet Inspection over Encrypted Traffic*, SIGCOMM 2015 — <http://iot.stanford.edu/pubs/sherry-blindbox-sigcomm15.pdf>

**Internal cross-refs:** `SPORE-AMD-024-tmf-confidentiality.md` (this resolves its Open Question #2) ·
`quantum-resilient-tri-encryption.md` (§11 metadata-confidentiality open question) ·
`Galerina-TritMesh/.../research/encryption-on-photonic-substrates.md` §5.2/§7 (ANN stays outside the trust gate).
