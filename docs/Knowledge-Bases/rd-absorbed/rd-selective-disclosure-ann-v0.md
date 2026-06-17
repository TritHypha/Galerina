<!-- ABSORBED R&D SOURCE — verbatim mirror. LogicN is the main library; the R&D repo is upstream/authoring.
     Source: LogicN-R-AND-D/tmf/spec/selective-disclosure-ann-v0.md (roadmap §1 #4; bench 17/17; commit a69bb6a)  ·  Pinned: R&D rnd-session 2026-06-17
     Integrated LogicN view: logicn-tmf-engine.md  ·  Catalog: logicn-rd-absorption-catalog.md
     Rule: edit the upstream source then re-vendor; do not fork this copy (feedback-auto-import-rd-docs). -->

> **Absorbed R&D source (verbatim).** See `logicn-rd-absorption-catalog.md`. Internal links point at the upstream R&D tree.

---

# `.tmf` selective embedding disclosure → trusted-zone ANN — v0 (byte-precise, buildable)

**Status:** Draft, buildable + **verified** (the deterministic key-schedule / framing bytes are reproduced by
the reference bench using **real `@noble`** SHAKE256 + AES-256-GCM + ML-KEM-768; the HNSW recall, the
withheld-bulk-key non-leak, the inclusion-proof gating, the revocation compose, the capability fail-closed,
the egress rule and the key-independence checks are all exercised in
[`../../tri-encription/bench/selective-disclosure-ann.mjs`](../../tri-encription/bench/selective-disclosure-ann.mjs)).
This is the **one genuine in-bounds refinement** flagged in RD-ROADMAP §1 #4: a `.tmf` record carries **two
independently-keyed sections** so a trusted zone can run approximate-nearest-neighbour (HNSW) semantic search
on the **small embedding** while the **bulk payload stays sealed**.

> **The one rule (selective disclosure, fail-closed).** Two sections, two keys: the **bulk** payload (an NVFP4
> tensor, a document body, a media blob) is sealed under `K_bulk`; the **embedding/attribute** vector is sealed
> under a *separate, independent* `K_emb`. A trusted zone may decrypt **only `K_emb`** to run HNSW — `K_bulk` is
> **never** released for search. Every uncertainty collapses to **deny**: an embedding whose TMX inclusion proof
> is absent/wrong is **rejected** (never silently searched), a **revoked** embedding key_id is **denied**, and
> **without the trusted-zone capability** the embedding section stays sealed (`unknown → deny`).

> **This does NOT violate verdict 5.** Verdict 5 forbids cleartext embeddings *on the wire / on egress*
> (vec2text inverts them to ≈plaintext, `metadata-confidentiality.md`). Here the embedding is **never** in
> cleartext on any wire or egress: it is decrypted **only inside the trusted zone** (post verify-before-decrypt),
> it is the **only** thing decrypted (the bulk is never decrypted for search), and **nothing semantic leaves the
> trusted zone** — egress is **opaque result ids + scores only** (§6). This is the
> [`storage-and-query-v0.md`](../research/storage-and-query-v0.md) §1 trusted-zone-only ANN, refined so the
> trusted zone need open *only the tiny embedding*, not the bulk.

Grounded only — composes **shipped** primitives, invents nothing:
[`tmf-encryption-v0.md`](tmf-encryption-v0.md) §2–§4 (per-section KEM-DEM, SHAKE256 key schedule, 36-byte AAD
context), [`inclusion-proof-v0.md`](inclusion-proof-v0.md) (selective disclosure: a 1-of-N section admitted in
O(log₃N) bytes, verified against the signed TMX root), [`storage-and-query-v0.md`](../research/storage-and-query-v0.md)
§3 (HNSW, trusted-zone only), [`revocation-registry-v0.md`](revocation-registry-v0.md) (revoked key_id ⇒ deny),
[`tmf-modalities-v0.md`](tmf-modalities-v0.md) §2 (`modality=0` Vector / `2` Attribute for the embedding;
`modality=3` Blob / `0` tensor for the bulk). No invented crypto: SHAKE256 (FIPS 202), ML-KEM-768 (FIPS 203),
AES-256-GCM (SP 800-38D), ML-DSA-65 (FIPS 204) only.

---

## 1. What this layer adds, and what it reuses

| Job | Owner | This layer |
|---|---|---|
| Per-section confidentiality | [`tmf-encryption-v0`](tmf-encryption-v0.md) KEM-DEM | **reused** — each of the two sections is a normal sealed section with its own AAD context |
| Membership of one section under the signed root | [`inclusion-proof-v0`](inclusion-proof-v0.md) | **reused** — the embedding section is admitted by its O(log₃N) inclusion proof, root checked against the ML-DSA-65 signature |
| Semantic similarity over embeddings | [`storage-and-query-v0`](../research/storage-and-query-v0.md) §3 HNSW | **reused** — but the trusted zone now opens **only** the embedding section |
| Is this embedding-key still trusted? | [`revocation-registry-v0`](revocation-registry-v0.md) | **reused** — a revoked embedding `key_id` ⇒ deny (no decrypt) |
| **Two independent section keys + the trusted-zone release protocol + the opaque-egress rule** | **this layer** | the §3 key-independence derivation, the §5 release protocol, the §6 egress rule |

Nothing below the section key changes: TMX hashes both ciphertext sections opaquely, the ML-DSA-65 signature
covers the same root, and the KEM-DEM pipeline is unmodified. This composes as a **record-shape convention**
(two sections, two keys) over the v1 container — no new crypto primitive, no new wire framing.

---

## 2. Record shape — two independently-keyed sections

A selective-disclosure record is an ordinary multi-section `.tmf` record in which **two** logical sections
describe the **same object**, joined by a shared `object_id`:

| Section | `modality` | typical `codec` | sealed under | size | who may open it |
|---|---|---|---|---|---|
| **BULK** | `0` Vector (NVFP4 tensor) / `3` Blob / `8` Document | `0x0701` NVFP4 / `0x0000` / `0x0601` JSON … | **`K_bulk`** | large (KB–GB) | only a holder of the **bulk** capability — **never released for search** |
| **EMB** (embedding/attribute) | `0` Vector / `2` Attribute | `0x0702` f32 / `0x0701` NVFP4 | **`K_emb`** | small (e.g. 32–1536 × 4 B) | the **trusted zone** under the **embedding** capability — opened *only* for ANN |

Both sections are leaves of the same TMX tree, so both are bound under the **one** signed root: a relabel,
reorder, or cross-record splice breaks reconstruction (inclusion-proof §6). The `object_id` is carried in the
opaque `coord`/TVCID (encryption §4 offset 0–23), so the untrusted routing tier can pair EMB↔BULK **without
seeing either plaintext**.

The crucial property: **the trusted zone is handed only the EMB section's ciphertext + its inclusion proof +
the embedding capability.** It is *never* handed `K_bulk`, the bulk capability, or the bulk ciphertext. ANN
therefore physically *cannot* touch the bulk — proved by the §7 "search succeeds with `K_bulk` withheld
entirely" test.

---

## 3. Section-key derivation — `K_emb` ⟂ `K_bulk` (byte-precise independence)

Each section is sealed exactly as [`tmf-encryption-v0`](tmf-encryption-v0.md) §3: a KEM encapsulation yields a
32-byte `shared_secret`, and the DEM key is `K_aead = SHAKE256(LP("tmf-dem-kdf-v0") ‖ LP(shared_secret) ‖
LP(aead_context))[:32]`. Independence between the two section keys is achieved **two ways at once** (defence in
depth — either alone suffices):

### 3.1 Independence via distinct KEM encapsulations (the strong guarantee)

Each section gets its **own KEM encapsulation** against the recipient public key, so each derives from an
**independent 32-byte `shared_secret`** (`ss_emb`, `ss_bulk`) drawn from the KEM's CCA-secure randomness:

```
(ct_kem_emb,  ss_emb)  = ML-KEM-768.Encapsulate(recipient_pk)      # fresh randomness
(ct_kem_bulk, ss_bulk) = ML-KEM-768.Encapsulate(recipient_pk)      # fresh randomness, INDEPENDENT
K_emb  = SHAKE256( LP("tmf-dem-kdf-v0") ‖ LP(ss_emb)  ‖ LP(aead_context_emb)  )[:32]
K_bulk = SHAKE256( LP("tmf-dem-kdf-v0") ‖ LP(ss_bulk) ‖ LP(aead_context_bulk) )[:32]
```

`ss_emb` and `ss_bulk` are independent ML-KEM secrets — recovering one tells you nothing about the other
(IND-CCA2). So `K_emb` and `K_bulk` are independent **even if** an attacker learns one shared secret. This is
the deployed guarantee: the trusted zone is given **only** the material to decapsulate `ct_kem_emb` (the
embedding capability, §4), never `ct_kem_bulk`.

### 3.2 Independence via a per-purpose key-split (so one key cannot derive the other)

So that **`K_emb` alone cannot derive `K_bulk`** (and vice-versa) **even if** an implementation were to seal
both sections from a *single* shared secret (e.g. one KEM encapsulation, two purposes), the section key is a
**domain-separated split** of the DEM key. Define a per-purpose label and split:

```
purpose ∈ { "emb", "bulk" }                       # the section's role, bound into the split

K_section(purpose) = SHAKE256(
        LP("tmf-sdann-split-v0")                   # domain-separation tag (this spec)
      ‖ LP(purpose)                                # "emb" or "bulk" — distinct per section
      ‖ LP(K_aead_section)                         # the §3 DEM key for THIS section's own aead_context
   )[:32]

K_emb  = K_section("emb")
K_bulk = K_section("bulk")
```

- `K_emb` is `SHAKE256(… ‖ LP("emb")  ‖ LP(K_aead_emb))` and `K_bulk` is `SHAKE256(… ‖ LP("bulk") ‖
  LP(K_aead_bulk))`. **Neither output is an input to the other** — there is no function the holder of `K_emb`
  can apply to obtain `K_bulk`: that would require inverting SHAKE256 to recover `K_aead_bulk` (and the
  distinct `ss_bulk`/`aead_context_bulk` behind it), a preimage break. The split is **one-way and
  purpose-bound**.
- The two `aead_context`s already differ (distinct `section_id`, distinct `coord`/`modality`, encryption §4),
  so even the §3.1 KEM-derived keys differ; the §3.2 split adds an explicit, label-bound one-wayness so the
  independence does **not rely** on the two encapsulations being distinct. Both hold simultaneously.

**The independence theorem (what the bench asserts, §7 test g).** Given `K_emb`, deriving `K_bulk` is a
SHAKE256 preimage problem (you would need `K_aead_bulk`, hence `ss_bulk`); given `K_bulk`, deriving `K_emb` is
the same. Empirically: `K_emb ≠ K_bulk`; opening the BULK ciphertext with `K_emb` (and any nonce/AAD) **fails
the AEAD tag** (`CryptoError`); opening the EMB ciphertext with `K_bulk` **fails the AEAD tag**. The keys are
cryptographically siloed.

### 3.3 What is sealed in each section

```
EMB section:   ct_emb  ‖ tag_emb  = AES-256-GCM.Seal(K_emb,  nonce_emb,  embedding_bytes, committed_aad_emb)
BULK section:  ct_bulk ‖ tag_bulk = AES-256-GCM.Seal(K_bulk, nonce_bulk, bulk_bytes,      committed_aad_bulk)
   committed_aad_s = aead_context_s (36 B) ‖ SHAKE256(LP("tmf-dem-commit-v0") ‖ LP(K_section))[:32]   # encryption §4
```

The AAD-commitment (encryption §4) binds each ciphertext to `H(K_section)`, so a section sealed for "emb"
cannot be opened with a "bulk"-derived key even if the bytes were swapped — the tag fails.

---

## 4. Capabilities — what the trusted zone is (and is not) given

A **capability** is the out-of-band authorization (resolved from the Trust Capsule / k3-policy, like the
verifier policy inputs of [`revocation-registry-v0`](revocation-registry-v0.md) §5 — **never** read from the
record). For this layer there are two **disjoint** capabilities:

| Capability | Grants | Used for |
|---|---|---|
| `cap_emb` | decapsulate `ct_kem_emb` → derive **`K_emb`** only | trusted-zone ANN over the embedding |
| `cap_bulk` | decapsulate `ct_kem_bulk` → derive **`K_bulk`** only | full retrieval of the bulk payload (a *separate*, post-match, fully-gated read) |

The ANN service is provisioned with **`cap_emb` only**. It has **no path** to `K_bulk` (it never receives
`ct_kem_bulk` nor `cap_bulk`). **Fail-closed:** a request with **no** `cap_emb` ⇒ the embedding section stays
sealed, `unknown → deny` (§7 test e). This is the K3 calculus (`allow / deny / unknown → deny`,
governed-trust-capsule §8) applied to selective disclosure.

---

## 5. Trusted-zone release protocol (fail-closed; extends encryption §7)

A trusted-zone ANN ingest of one embedding section runs **in this exact order**; **any** failure ⇒ reject,
zeroize, deny — fail-closed:

```
INPUT: emb_ciphertext_section, inclusion_proof, signed_root_R, signature, registry_bytes, policy, caps

 1. AUTHENTICITY OF ROOT:  ML-DSA-65.Verify(pk, R, signature) == true            else AuthError   → DENY
                           (R is the trusted root; inclusion-proof §4 — trust the signature, not the proof)
 2. INCLUSION PROOF:       reconstructRoot(leaf_hash_emb, path, header_core) == R else ProofError  → DENY
                           (the embedding section is bound under the signed root; inclusion-proof §2–§4.
                            An ABSENT / wrong / tampered proof is REJECTED, NOT silently searched — §7 test c)
 3. REVOCATION:            verify_and_lookup(registry, emb_key_id, policy) == ALLOW else Revoked/Unknown → DENY
                           (revocation-registry §6; a revoked emb key_id ⇒ DENY, NO decrypt — §7 test d.
                            registry missing/stale/unverifiable + require_fresh ⇒ unknown → DENY)
 4. CAPABILITY:            policy has cap_emb for this object                     else NoCapability → DENY
                           (no cap_emb ⇒ section STAYS SEALED, unknown → deny — §7 test e.
                            cap_bulk is NEVER consulted here; the bulk is out of scope for ANN)
 5. DERIVE ONLY K_emb:     ss_emb = ML-KEM-768.Decapsulate(ct_kem_emb, sk via cap_emb)
                           K_aead_emb = SHAKE256(LP("tmf-dem-kdf-v0") ‖ LP(ss_emb) ‖ LP(aead_context_emb))[:32]
                           K_emb      = SHAKE256(LP("tmf-sdann-split-v0") ‖ LP("emb") ‖ LP(K_aead_emb))[:32]
                           ── K_bulk is NEVER derived; ct_kem_bulk is NEVER decapsulated here ──
 6. DECRYPT ONLY EMB:      embedding = AES-256-GCM.Open(K_emb, nonce_emb, ct_emb‖tag_emb, committed_aad_emb)
                                                                                 else CryptoError → DENY
 7. ANN:                   insert `embedding` into the trusted-zone HNSW index (storage-and-query §3).
 8. ZEROIZE:               wipe ss_emb, K_aead_emb, K_emb, embedding from memory after indexing.
```

Search (query time) runs HNSW over the trusted-zone index built in steps 1–8 and returns **only** opaque
`object_id`s + distance scores (§6). The bulk payload is touched **at no point** in this protocol — `K_bulk` is
never derived, `ct_kem_bulk` never decapsulated. A later, *separate* full-retrieval of a matched object runs the
**full** encryption §7 gate under `cap_bulk` (out of scope here; it is a distinct, fully-gated read).

### 5.1 Error taxonomy (extends encryption §7.1 / revocation §6.1)

| Error | Cause | Disposition |
|---|---|---|
| `AuthError` | ML-DSA-65 signature over the root fails | reject (fail-closed) |
| `ProofError` | inclusion proof absent / wrong / tampered (reconstructed root ≠ signed `R`) | reject — **not** silently searched |
| `Revoked` / `Unknown` | embedding `key_id` revoked, or registry unusable + `require_fresh` | reject (no decrypt) |
| `NoCapability` | no `cap_emb` for this object (`unknown → deny`) | reject — section stays sealed |
| `CryptoError` | AEAD tag fail (wrong key incl. trying `K_bulk` on EMB, tamper, wrong AAD) | reject (fail-closed) |

---

## 6. The egress rule — only opaque ids/scores leave the trusted zone

This is the verdict-5 guarantee made a **hard interface contract**:

> **Egress rule (normative).** The ANN search result that crosses the trusted-zone boundary is **exactly** a
> list of `{ object_id, score }` — an **opaque object id** (the `coord`/TVCID handle, non-semantic) and a
> **numeric distance/similarity score**. It **MUST NOT** contain: any cleartext embedding vector or any
> component of one, any bulk plaintext or ciphertext, any `K_emb`/`K_bulk`/shared secret, or any decrypted
> attribute. The decrypted embedding lives and dies **inside** the trusted zone (built into the in-memory HNSW
> graph, then zeroized); it is **never** serialized to egress.

- A caller that wants the bulk for a matched `object_id` performs a **separate** `cap_bulk` retrieval through
  the full encryption §7 gate — it does **not** get the bulk "for free" from a search hit.
- The score is a **scalar distance**, not the vector; it does not invert (vec2text needs the vector, not a
  single L2 number to one query). Returning ranks/scores is the standard ANN egress and is verdict-5-safe.
- The bench (§7 test f) inspects the on-egress result object and asserts it contains **only** `object_id` +
  `score` keys — no `embedding`, no `bulk`, no key material — by structural check.

---

## 7. Reference bench & tests (`selective-disclosure-ann.mjs`)

[`../../tri-encription/bench/selective-disclosure-ann.mjs`](../../tri-encription/bench/selective-disclosure-ann.mjs)
(`@noble` SHAKE256 + AES-256-GCM + ML-KEM-768; HNSW per `hnsw-recall.mjs`; inclusion proof per
`inclusion-proof.mjs`) builds N two-section records, seals EMB under `K_emb` and BULK under `K_bulk`, runs the
§5 release protocol inside a modelled trusted zone, and asserts (prints `[PASS]/[FAIL] … N passed, M failed`):

| # | Test | Asserts |
|---|---|---|
| a | **HNSW recall works on the decrypted embeddings** | recall@10 of the trusted-zone HNSW vs exact brute-force kNN is reasonable, **measured on this box** |
| b | **DECISIVE non-leak — `K_bulk` WITHHELD entirely** | the whole search runs (and recall holds) with `K_bulk` / `ct_kem_bulk` / `cap_bulk` **never provided** — proves the bulk key is never needed for ANN |
| c | **Inclusion-proof gating** | an embedding whose inclusion proof is **absent / tampered** ⇒ `ProofError` → **rejected** (not searched); a valid proof admits it |
| d | **Revocation compose** | a **revoked** embedding `key_id` ⇒ `Revoked` → DENY, **no decrypt** |
| e | **Capability / egress fail-closed** | **without `cap_emb`** the section stays sealed (`NoCapability`, `unknown → deny`) |
| f | **Egress rule** | the search result objects contain **only** `{object_id, score}` — no cleartext embedding, no bulk plaintext, no key material |
| g | **Key independence** | `K_emb ≠ K_bulk`; opening BULK with `K_emb` fails the tag; opening EMB with `K_bulk` fails the tag; `K_bulk` is not derivable from `K_emb` (preimage) |

No throughput/RPS/latency is claimed; the recall numbers and candidate-visit counts are **measured** on the
stated machine (i9-9900K / Node v24.16.0), reproducible from the seeded RNG.

---

## 8. Security notes & honesty

- **Verdict 5 respected.** No embedding is cleartext on any wire or egress; decryption is trusted-zone-only;
  egress is opaque ids + scores. The refinement over `storage-and-query-v0` §3 is only that the trusted zone
  opens **the tiny embedding section**, not the bulk — strictly *less* plaintext is ever materialized.
- **Bulk never decrypted for search** — the load-bearing property, proved by test (b): the search succeeds with
  `K_bulk` withheld entirely. Selective disclosure is the *point*, not a side effect.
- **Fail-closed throughout.** Missing/wrong inclusion proof, revoked key_id, missing capability, AEAD failure
  → all DENY (`unknown → deny`, K3 collapse). A trusted zone with no vetted KEM/AEAD/ML-DSA lib MUST deny every
  ingest (encryption §7 / revocation §6 posture).
- **No invented crypto.** SHAKE256 (FIPS 202), ML-KEM-768 (FIPS 203), AES-256-GCM (SP 800-38D), ML-DSA-65
  (FIPS 204). The only new bytes are the §3.2 domain-separation label `"tmf-sdann-split-v0"` and the §6 egress
  contract — both pure composition.
- **Not in v0:** photonic ANN (a labelled later item, behind its own benchmark, storage-and-query §3); a
  hardware trusted zone (TEE attestation) — here the "trusted zone" is the modelled post-verify endpoint, the
  same abstraction `meshql.mjs`/`storage-and-query` use.

## 9. Sources & cross-references

- [`tmf-encryption-v0.md`](tmf-encryption-v0.md) §2–§4, §7 (per-section KEM-DEM, SHAKE256 schedule, 36-byte AAD
  context, fail-closed reader) · [`inclusion-proof-v0.md`](inclusion-proof-v0.md) (selective disclosure /
  O(log₃N) membership against the signed root) · [`storage-and-query-v0.md`](../research/storage-and-query-v0.md)
  §1/§3 (two-zone split, trusted-zone-only HNSW) · [`revocation-registry-v0.md`](revocation-registry-v0.md)
  §5/§6 (revoked key_id ⇒ deny, fail-closed) · [`tmf-modalities-v0.md`](tmf-modalities-v0.md) §2 (Vector /
  Attribute / Blob modalities).
- FIPS 202 SHAKE256 — https://csrc.nist.gov/pubs/fips/202/final · FIPS 203 ML-KEM —
  https://csrc.nist.gov/pubs/fips/203/final · SP 800-38D AES-GCM — https://csrc.nist.gov/pubs/sp/800/38/d/final
  · FIPS 204 ML-DSA — https://csrc.nist.gov/pubs/fips/204/final
- HNSW: Malkov & Yashunin, *Efficient and robust approximate nearest neighbor search using HNSW graphs*
  (2016/2018). vec2text inversion risk: `tri-encription/research/metadata-confidentiality.md` (verdict 5).
