<!-- ABSORBED R&D SOURCE — verbatim mirror. Galerina is the main library; the R&D repo is upstream/authoring.
     Source: Galerina-R-AND-D/tmf/research/fhe-encrypted-similarity-v0.md (roadmap "Later/research" — the LAST open in-bounds R&D item; verdict TRACK-NOT-BUILD) · Pinned: R&D rnd-session 2026-06-17 (9-agent web-cited workflow, accuracy + no-synthesized-number audit)
     Integrated Galerina view: galerina-tmf-engine.md · Companion (the SHIPPED answer for Galerina's actual threat model): rd-selective-disclosure-ann-v0.md · Catalog: galerina-rd-absorption-catalog.md
     Rule: edit the upstream source then re-vendor; do not fork this copy (feedback-auto-import-rd-docs). -->

> **Absorbed R&D source (verbatim).** See `galerina-rd-absorption-catalog.md`. Internal links point at the upstream R&D tree.

---

# FHE for encrypted similarity — survey + verdict

> **Status:** research note (2026-06-17). Resolves the last open in-bounds R&D item (the "later/research"
> FHE-encrypted-similarity question). Companion to the shipped trusted-zone selective-disclosure ANN
> ([`../spec/selective-disclosure-ann-v0.md`](../spec/selective-disclosure-ann-v0.md)) — the two are competing
> answers to "search without exposing data," under different threat models.
> **Posture (binding):** grounded + cited (peer-reviewed papers / official library docs only); **no performance
> number without a citable apparatus (the machine it ran on)**; no invented crypto; **crypto-on-core** — FHE is
> digital, bit-exact lattice arithmetic (NOT analog/photonic); fail-closed; honest-core vs aspirational separate.

---

## TL;DR

Fully homomorphic encryption (FHE) can compute an encrypted similarity score — a dot product, cosine, or Euclidean distance — without ever decrypting the vectors. It is digital, bit-exact lattice arithmetic, so it does **not** violate Galerina's crypto-on-core rule. But two things are true at once: (1) the encrypted *distance* is cheap-ish, while the encrypted *argmax/top-k* (the part that makes it a search) is the genuine bottleneck, often forcing scheme-switching or bootstrapping that costs seconds to tens of thousands of seconds; and (2) FHE's only real win is one narrow threat model — an **untrusted server that must score similarity on ciphertext with no trusted decryption point and minimal interaction**. The shipped `.tmf` selective-disclosure ANN already places a legitimate trusted decryptor in the loop and runs native-speed HNSW, so FHE would re-acquire a property the system does not need, at a large slowdown. Verdict: **track-not-build**, with concrete acceptance criteria to flip it.

---

## 1. FHE schemes for similarity

Three scheme families matter for encrypted ANN, and they split cleanly along the arithmetic/comparison line.

**CKKS — the natural fit for embeddings.** CKKS (Cheon, Kim, Kim, Song, *Homomorphic Encryption for Arithmetic of Approximate Numbers*, Asiacrypt 2017, [eprint 2016/421](https://eprint.iacr.org/2016/421)) does *approximate* arithmetic on real/complex vectors, packing a vector into SIMD "slots" of one ciphertext. After each multiplication a **rescaling** step (`ct_rs ← ⌊(q'/q)·ct⌉`) divides out the scale factor Δ, converting exponential noise growth to linear ([HEAAN/Wikipedia](https://en.wikipedia.org/wiki/HEAAN)). An encrypted **dot product** is element-wise multiply, then a **rotate-and-sum**: ~log₂(N) slot rotations via Galois automorphisms (each needing a Galois/rotation key) collapse the slots into the inner product ([SEAL issue #449](https://github.com/microsoft/SEAL/issues/449)). Cosine/Euclidean follow from inner products. This is why CKKS (Microsoft SEAL, OpenFHE, Lattigo) is the default for ML-on-encrypted-data: SEAL lists CKKS for "computing distances of encrypted locations" ([SEAL README](https://github.com/microsoft/SEAL)).

**BFV/BGV — exact integers, but comparison is costly.** BGV (Brakerski–Gentry–Vaikuntanathan, 2011/2012) and BFV (Brakerski / Fan–Vercauteren, 2012) do exact modular-integer SIMD arithmetic. Distance is computable; the problem is comparisons, which require deep circuits ([eprint 2021/315](https://eprint.iacr.org/2021/315.pdf)).

**The hard part is top-k / argmax (comparisons), not the distance.** SEAL states plainly: "encrypted comparison, sorting, or regular expressions, are in most cases not feasible" and "it is not possible to branch on encrypted data" ([SEAL README](https://github.com/microsoft/SEAL)). In CKKS, comparison means approximating the non-polynomial **sign function** by a high-degree composite polynomial — high multiplicative depth (complexity ~O(√n), depth ~log₂(n)), often forcing **bootstrapping** ([eprint 2020/834](https://eprint.iacr.org/2020/834), *Minimax Approximation of Sign Function by Composite Polynomial*). The "seconds to hours per op" range for word-wise bootstrapping rests on the SoK survey below, not on 2020/834 itself (which is a polynomial-approximation/depth paper) ([SoK arXiv:2504.11604](https://arxiv.org/html/2504.11604v2)).

**TFHE/FHEW — fast bootstrapped boolean for the argmax bottleneck.** TFHE (Chillotti–Gama–Georgieva–Izabachène, Asiacrypt 2016) bootstraps **every binary gate** in ~13 ms single-core (~76 gates/s/core, MUX ~26 ms, 110-bit security; **the page does not name the CPU**) ([tfhe.github.io](https://tfhe.github.io/tfhe/)), making it the go-to for thresholds/argmax. OpenFHE supports **scheme-switching** CKKS↔FHEW to do the comparison step via (scalar) functional bootstrapping ([OpenFHE](https://github.com/openfheorg/openfhe-development)).

**Concrete costs (all on one AMD Ryzen Threadripper PRO 3955WX @ 2.2 GHz, single-thread, 125 GB RAM)** ([SoK arXiv:2504.11604](https://arxiv.org/html/2504.11604v2)):

| Operation | TFHE | Encoding-switching | CKKS↔FHEW scheme-switching |
|---|---|---|---|
| Sort 8-element 8-bit array | 59.9 s | 645 s | 27,457 s |
| 8-bit comparison | — | — | 32.1 s (6-bit: 9.87 s) |
| Ciphertext, 1×100 8-bit vector | 4.8 MB | 47.6 MB (~10×) | — |

(The SoK also reports TFHE multiplying two 16-bit integers at "up to ~30 s" — **machine for that specific line not stated** in the extracted text.)

---

## 2. The cost reality (cited apparatus only)

Encrypted similarity is bit-exact but pays a large constant-factor and latency tax. Every figure below is paired with the machine the authors ran it on; where a paper omits the machine, that is stated, not filled in. There is no line-rate path here.

**One encrypted pair (cosine/Euclidean over a 512-d face vector).** Boddeti (BTAS 2018) reports a naive FHE match of two encrypted templates at **12.8 s and 48.7 MB per pair**; a Fan–Vercauteren (BFV) variant at **0.6 s and 16.5 MB**; and his batched scheme at **0.01 s and 16 KB per pair**, on a **4-core Intel i5-6400 @ 2.7 GHz** ([arXiv:1805.00577](https://arxiv.org/abs/1805.00577); Table 1, "Security Parameters, Timing and Memory").

**Search at scale.** HERS (IEEE T-BIOM 2022) searches a probe against a **1M-template, 512-d gallery** using Microsoft SEAL (BFV, n=4096), on a **10-core Intel i9-7900X @ 3.30 GHz, single-threaded** ([arXiv:2003.12197](https://arxiv.org/abs/2003.12197)). Its Table 1 lists prior-art 1M-gallery search at **500 s (2.67 GHz) up to 12.7M s (3.3 GHz)**; HERS claims encrypted search of a **100M gallery "within 10 minutes"** — that headline is the 192-d fingerprint representation compressed to **32-d**, not the 512-d face vector — an 11× SIMD speed-up at 1M and 186× over 1:1 matching.

**Bootstrapping (the per-refresh tax).** FAB (HPCA 2023) benchmarks a **Lattigo CPU bootstrap at 3.5 GHz, 2^15 slots = 101.78 µs/slot amortized**, vs FAB's FPGA (Xilinx Alveo U280, 0.3 GHz) at 0.477 µs/slot — a **213×** gap ([arXiv:2207.11872](https://arxiv.org/pdf/2207.11872), Table 7; the table gives 3.5 GHz but **not the full CPU model**). Bossuat et al. (ACNS 2022) report bootstrapping **C^32768 in 20.2 s** at 128-bit security, 32.11-bit precision, using Lattigo 3.0.2 ([eprint 2022/024](https://eprint.iacr.org/2022/024)); **the exact CPU for this number could not be confirmed from accessible text** (eprint Cloudflare-blocked) — treat as indicative.

**Library ops.** A cross-platform study on an **Intel Core i7-8550U, 16 GB RAM** reports OpenFHE doing **300 CKKS additions in ~4 s vs SEAL ~7 s**; the notable large figure in that paper is **SEAL BGV *addition* at operation-depth 300 reaching 182 s on Windows** (not CKKS multiplication — the SEAL multiplication outlier there is >530 s at depth 20 on Windows) ([arXiv:2503.11216](https://arxiv.org/pdf/2503.11216)).

**ANN co-design datapoint (indicative).** PANTHER (eprint 2024/1774) answers an ANN query on 10M points in **18 s** (confirmed via abstract) using a co-design of PIR, secret-sharing, garbled circuits and HE; its 284 MB communication and the server/network apparatus **could not be confirmed** (eprint blocked).

**Bottom line:** cleartext cosine is sub-microsecond (asserted from general knowledge, **not a cited benchmark**); encrypted equivalents run µs-to-seconds *per element* plus seconds-class bootstraps. **Never line-rate** — viable only for batched/offline gallery scans.

---

## 3. Threat-model fit vs the alternatives

FHE's *genuine* niche is narrow and precise: **an untrusted server must compute similarity over ciphertext, with no trusted decryption point anywhere in the loop, and minimal interaction.** That niche is real and shipped — Apple's [Enhanced Visual Search / Live Caller ID](https://machinelearning.apple.com/research/homomorphic-encryption) uses **BFV** for private nearest-neighbour and PIR where "the server does not decrypt the original request or even have access to the decryption key," computing dot-products/cosine on encrypted embeddings (client-side cluster-centroid sharding, DP at ε=0.8, δ=1e-6). Apple publishes **no latency/throughput/DB-size numbers**, so this proves the niche exists, not its cost.

**This model does not match the shipped `.tmf`/Galerina design.** `tmf/spec/selective-disclosure-ann-v0.md` *already has a trusted decryption point*: `K_emb` is decrypted **only inside the trusted zone** to run HNSW, the bulk stays sealed under an independent `K_bulk` that is never released for search, and egress is opaque `{object_id, score}` only (§5–§6). Once a trusted zone legitimately holds keys, FHE's precondition ("no trusted decryptor") is gone — you can run plaintext HNSW on the decrypted embedding at full speed. FHE would buy nothing here except a large slowdown.

**By threat model:**

- **SSE / structured encryption** is fast but leaks access/search/volume patterns, and the leakage-abuse literature is damning: Cash et al. (CCS 2015) recover **>80%** of queries on Enron via the count attack ([ccs15.pdf](http://www.cs.lewisu.edu/~perryjn/ccs15.pdf)); Zhang–Katz–Papamanthou (USENIX Sec 2016) recover *all* queries with probability 1 using only **14 injected files for a 10,000-keyword universe** ([eprint 2016/172](https://eprint.iacr.org/2016/172.pdf)); Grubbs et al. reconstruct DBs from volume leakage alone ([Pump up the Volume, CCS 2018](https://eprint.iacr.org/2018/965)). Severity is data-knowledge-dependent — Blackstone–Kamara–Moataz (NDSS 2020) show the IKK attack "could not recover any queries" with independent train/test data and that the count attack needs ~80%+ known data ([NDSS 2020](https://www.ndss-symposium.org/wp-content/uploads/2020/02/23103-paper.pdf)). FHE's advantage over SSE is *zero ciphertext leakage*, not speed.
- **TEE / secure enclaves** give near-plaintext speed but "SGX does not protect against side-channel attacks"; Foreshadow/L1TF (CVE-2018-3615, disclosed 2018-08-14) is a transient-execution channel that breaches SGX confidentiality and can extract enclave secrets including attestation/sealing keys ([Foreshadow](https://en.wikipedia.org/wiki/Foreshadow)). FHE wins when you refuse to trust the server's hardware. (Note: the `.tmf` trusted zone is a **post-verify software endpoint, not a hardware TEE** per spec §8, so these caveats describe an alternative the system has *not* adopted — they would apply only if a hardware TEE were later used to host the zone.)
- **MPC / PIR** meet FHE's no-single-decryptor goal but trade interaction/bandwidth; FHE wins specifically when the server must compute **non-interactively** on sealed data.

### Head-to-head vs the shipped trusted-zone selective-disclosure ANN

| Axis | FHE encrypted similarity | Selective-disclosure ANN (`selective-disclosure-ann-v0`) | SSE / structured enc. | TEE / SGX enclave | MPC / PIR |
|---|---|---|---|---|---|
| **Trust model fit** | Untrusted server, **no** decryptor | Legitimate **trusted zone** decrypts only `K_emb` | Server holds index; client trusts leakage profile | Trusts CPU vendor + microarch | No single decryptor, multi-party |
| **Search speed** | Seconds–hours/query (argmax bottleneck) | **Native HNSW** (plaintext-speed in zone) | Fast (sublinear) | Near-plaintext | Round-trip / bandwidth bound |
| **Leakage on ciphertext** | **None** | None on wire/egress; `{object_id, score}` only | Access/search/volume → LSAs | Side-channel (Foreshadow) | Pattern leakage scheme-dependent |
| **Interaction** | Non-interactive | Non-interactive after release | Low | Low | **High** (rounds/bandwidth) |
| **Ciphertext blow-up** | Large (e.g. 4.8–47.6 MB / 100-d vec) | None (decrypted in zone) | Index overhead | None | Comm. overhead |
| **Composes w/ inclusion-proof + revocation** | Not out of the box | **Yes, already** | Partial | Partial | Partial |
| **Needs trusted decryptor?** | **No** (its whole point) | **Yes** (the design assumption) | Yes (server-side) | Yes (enclave) | No |

Where a trusted zone exists, the shipped design **dominates FHE on every axis**: native-speed ANN vs seconds/query, no ciphertext-noise budget, and it already composes inclusion-proof + revocation + per-section keys. For comparison, state-of-the-art secure-kNN without a trusted decryptor (SANNS, garbled circuits + AHE + distributed ORAM, USENIX Sec 2020) is **18–31× faster than prior work and first to scale to 10M entries** — still a **seconds-class two-party protocol, not native speed** (CPU/RAM/network apparatus not stated in the abstract).

---

## 4. Fit to `.tmf`/Galerina + crypto-on-core, and the verdict

### Does FHE violate crypto-on-core? No — but it isn't the cipher

`SPORE-SUBSTRATE-001` requires cryptography to run **bit-exact on a deterministic digital core**. FHE qualifies: every mainstream scheme — **BGV** (2011), **BFV** (2012), **CKKS** (ASIACRYPT 2017), **TFHE/CGGI** (2016) — is **lattice-based (R)LWE arithmetic on integer polynomials**, computed digitally (Gentry's 2009 first construction was lattice-based). It is **not** analog/photonic. The "approximate" in CKKS is a property of the *plaintext*: it does approximate real-number (fixed/block-floating-point) arithmetic ([Microsoft SEAL](https://en.wikipedia.org/wiki/Microsoft_SEAL): CKKS "yields only approximate results"; for exact values "the BFV scheme is the only choice"). The **ciphertext operations themselves are deterministic, bit-exact integer ops** — same security model as the shipped KEM-DEM. So FHE is *allowed* on the core.

But FHE is **not a cipher** — it is a **compute-on-ciphertext layer**. It does not replace ML-KEM/AES-GCM; it would sit *beside* them as a way to evaluate a similarity score without decrypting. That is the only thing it buys.

### Where it could slot in `.tmf`

A **governed, cold-path, never-line-rate** capability for one threat model: **no trusted decryption anywhere** (a fully untrusted compute host that must score similarity on sealed embeddings without ever holding a key). Cost is prohibitive at line rate — Gentry-Halevi's original bootstrap was [~30 min/bit-op](https://en.wikipedia.org/wiki/Homomorphic_encryption); third-generation FHEW/TFHE first cut bootstrapping to "a fraction of a second" per refresh; **modern CKKS bootstrapping is order-of-magnitude tens-of-seconds single-thread, but this is parameter-dependent and is not stated on the Wikipedia HE page** — it must not be cited there, and no apparatus-paired CKKS bootstrap latency was confirmed in this pass (eprint sources Cloudflare/403-blocked).

### Head-to-head: the shipped answer for Galerina's actual threat model

Galerina **already shipped** the answer for its threat model: `selective-disclosure-ann-v0` (reference bench `tri-encription/bench/selective-disclosure-ann.mjs`, **17/17, `verdict5_clean`**, measured on the named i9-9900K / Node v24.16.0 box, recall@10 = 1.000). A `.tmf` carries two independently-keyed sections; a trusted zone decrypts *only* `K_emb` to run plaintext-speed HNSW, never `K_bulk`, and egress is opaque `{object_id, score}` only (filed in `RND-STATE.md` Roadmap §1 #4; FHE is already in the "Later / research — FHE encrypted similarity (digital, never line-rate)" bucket).

### Verdict: TRACK-NOT-BUILD

FHE solves a threat model **Galerina does not currently have**. The two-zone storage model + selective-disclosure ANN answer the use case at native speed. FHE stays in the labelled "Later/research (track)" bucket — *digital, never line-rate*.

**Acceptance criteria to move track → build:**
1. A concrete requirement for ANN **with zero trusted decryption** (the trusted-zone assumption is formally rejected by a customer/regulator).
2. A reproducible bench showing acceptable cold-path latency on a **named machine** (the current literature spans 0.01 s/pair batched up to 27,457 s for an 8-element encrypted sort, all parameter- and machine-dependent — none of it is a kNN top-k end-to-end on a pinned box).
3. FHE leakage (which ciphertexts were touched) bounded below the SSE access-pattern leakage that leakage-abuse attacks exploit ([Islam–Kuzu–Kantarcioglu, NDSS 2012](https://www.ndss-symposium.org/ndss2012/ndss-2012-programme/access-pattern-disclosure-searchable-encryption-ramification-attack-and-mitigation/)) — stated as a requirement, not yet a sourced comparison.

---

## Verdict

TRACK-NOT-BUILD. FHE for encrypted similarity is technically legitimate on Galerina's terms — it is digital, bit-exact, lattice-based RLWE arithmetic, so it satisfies crypto-on-core (SPORE-SUBSTRATE-001) and is not analog/photonic — but it solves a threat model Galerina does not have. Its only genuine win is the untrusted-server, no-trusted-decryptor, low-interaction case (the niche Apple ships with BFV), and it pays for that with a never-line-rate tax: the encrypted distance is tractable but the encrypted argmax/top-k is the real bottleneck, costing seconds to tens of thousands of seconds (e.g. 27,457 s to sort an 8-element 8-bit array via CKKS↔FHEW on a Threadripper PRO 3955WX), plus seconds-class bootstraps. Head-to-head, the shipped selective-disclosure ANN (selective-disclosure-ann-v0, bench 17/17, verdict5_clean) wins decisively for Galerina's actual threat model: it already has a legitimate trusted zone that decrypts only the tiny K_emb to run native-speed HNSW while K_bulk stays sealed and egress is opaque {object_id, score} — dominating FHE on speed, noise budget, and composition (inclusion-proof + revocation) on every axis, because once a trusted decryptor legitimately exists, FHE re-acquires a property the system does not need at a large slowdown. Park it in the labelled track bucket; flip to build only if (1) a customer/regulator formally rejects the trusted-zone assumption, (2) a reproducible cold-path bench lands on a named machine, and (3) FHE's touched-ciphertext leakage is shown bounded below SSE access-pattern leakage.

## Honesty ledger & residual gaps

**Flags (numbers softened / unsourced, fixed during the accuracy audit):**
- Boddeti BTAS 2018 figures (12.8 s/0.6 s/0.01 s per pair) are now correctly attributed to a 4-core Intel i5-6400 @ 2.7 GHz, Table 1 — the upstream draft's 'machine not stated, Table 2, extended abstract' claims were all corrected per the D2 audit.
- The 182 s cross-platform figure (arXiv:2503.11216) is SEAL BGV ADDITION at operation-depth 300 on Windows, NOT CKKS multiplication — corrected per the D2 audit; the SEAL multiplication outlier in that paper is >530 s at depth 20 on Windows.
- Modern CKKS bootstrapping '~tens of seconds single-thread' is presented as an order-of-magnitude anchor with NO stated apparatus and is parameter-dependent; it must NOT be cited to the Wikipedia 'Homomorphic encryption' page (which contains only Gentry-Halevi ~30 min/bit-op and FHEW 'fraction of a second'). The Gentry-Halevi ~30 min/bit-op figure IS on that page and is correctly cited.
- Bossuat ACNS 2022 '20.2 s for C^32768' and PANTHER '284 MB communication' lack a confirmed CPU/network apparatus (eprint 2022/024 and 2024/1774 Cloudflare/403-blocked); marked indicative. PANTHER's 18 s/10M-points is confirmed via abstract only.
- TFHE ~13 ms/gate carries no CPU on tfhe.github.io ('single-core' only) — marked machine-not-stated. The SoK '~30 s' 16-bit-mult line likewise has no machine in the extracted text.
- FAB Lattigo CPU baseline (101.78 µs/slot @ 3.5 GHz) names the frequency but NOT the full CPU model — partial apparatus, flagged.
- Cleartext sub-microsecond cosine baseline is asserted from general knowledge, not a cited benchmark.
- HERS '100M gallery within 10 minutes' applies to the 32-d compressed fingerprint config, not the 512-d face vector — clarified in the prose.

**Coverage gaps (verify against a primary source before relying on the specific figure):**
- No single peer-reviewed encrypted-kNN (k-selection / argsort over encrypted distances) paper with a fully stated apparatus (CPU + RAM + OS) and a per-query end-to-end top-k latency was retrieved. The cited apparatus-anchored datapoints are encrypted similarity/search (HERS, Boddeti) and generic sort/comparison microbenchmarks (SoK), plus ANN co-design (PANTHER/SANNS) — not a full encrypted top-k kNN on a pinned box. This is exactly acceptance criterion (2).
- No apparatus-paired CKKS bootstrapping latency number was confirmed this pass — IACR eprint 2022/024, 2023/149, and 2024/767 PDFs returned 403/Cloudflare. The '~20 s' figure is real in the literature (spanning ~215 ms on a 32-core CPU to ~23 s for 2^16 bits on a Xeon Gold 6242 @ 2.8 GHz depending on parameters) but remains order-of-magnitude only here.
- The original CKKS paper (eprint 2016/421) and the sign-function paper (eprint 2020/834) PDFs returned 403; CKKS scheme details were grounded via the HEAAN Wikipedia summary and the SoK paper, and the 45%/41% comparison-runtime-reduction figures are search-snippet-derived (not cited as machine-bearing).
- No primary source quantifies FHE's own leakage profile (which ciphertext slots/indices an FHE-ANN touches) vs SSE access-pattern leakage; acceptance criterion (3) is stated as a requirement, not a sourced comparison.
- Lattigo's exact scheme support and Apple's production latency/throughput/DB-size numbers were not obtained (Apple publishes none); the production-niche claim is qualitative — it proves the niche exists, not its cost.
- Whether CKKS approximate arithmetic perturbs similarity scores enough to change ANN ranking in a governed cold path was not investigated against a primary encrypted-kNN accuracy study.
- MPC/PIR interaction-round and bandwidth costs for a hypothetical no-trusted-zone .tmf routing tier were not benchmarked; only the qualitative non-interactive-vs-interactive trade-off is stated.
