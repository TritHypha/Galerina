# `.tmf` append-only history chain (`+1`) — v0 (byte-precise)

**Status:** Draft, buildable. Specifies the **append-only `+1` timeline** deferred by
[`tmf-encryption-v0.md`](tmf-encryption-v0.md) §8 and described in the charter (`..\..\RD-DIRECTION.md` §3.3):
each append is its own AEAD-sealed, signed **segment** whose root binds the **previous segment's root** (a
hash-linked chain) — tamper-evident order — with a per-epoch **key-erasure ratchet** and **crypto-erasure**
(drop a segment key) for right-to-be-forgotten. Reuses the encryption layer's key schedule + AEAD **unchanged**
(it only substitutes the secret input). Reference generator:
[`_vectors/gen_tmf_history_chain.py`](_vectors/gen_tmf_history_chain.py).

> **What the chain guarantees, precisely.** The links make the chain's **contents and interior order**
> tamper-evident: insert, drop-from-the-middle, reorder, or splice ⇒ a root mismatch ⇒ fail closed.
> **Freshness is a separate guarantee:** because a writer re-signs on every append, an *old, shorter* head is
> itself validly signed, so **end-truncation / rollback is NOT prevented by the signature alone** — it requires
> verifier-side monotone-epoch state or a trusted head pointer (§5). This spec states both, and conflates
> neither.

---

## 1. Segments, the chain header, and the hash-link
A history is an ordered list of **segments** `S₀, S₁, …, Sₙ`. Each `Sₖ` is a normal encrypted `.tmf` section
group (its own TMX-256 leaves over ciphertext, sealed via KEM-DEM, encryption §2–4) with a **24-byte chain
header** bound into its root as `header_core`, plus a **link-leaf** carrying `prev_root`:

### Chain header — 24 bytes, fed into the root as `header_core` (TMX §5)
| Off | Size | Field | Notes |
|---|---|---|---|
| 0 | 4 | `epoch` u32 | append index `k` (monotone; `0` = genesis) |
| 4 | 4 | `flags` u32 | bit0 `sealed` · bit1 `signed` · bit2 `erased` (key dropped, §6) · bits 3–31 reserved (0) |
| 8 | 16 | reserved / `chain_id` | MUST be 0 in a standalone segment; **carries the 128-bit `chain_id` when packed (§8)** — so `chain_id` is under the signed root and a verifier's rollback state (§5) can't be dodged by relabeling |

Because the whole 24-byte header is `header_core`, **`epoch` and `flags` (including `erased`) are under the
signed root** — they cannot be altered without breaking `rₖ` and the signature.

**Versioning note (v1.1).** Carrying `chain_id` in the reserved-16 is a **wire change** from the all-zero v0
reserved field: a packed segment's reserved-16 is **non-zero by design**, so a strict v0 reader that enforced
"reserved MUST be 0" must **not** be fed packed segment bodies, and a packed-aware reader must not require the
field to be zero. The interpretation is selected by **context** — a segment inside a §8 pack carries `chain_id`;
a standalone segment keeps it zero. Either way the 16 bytes are inside `header_core`, hence authenticated.

### The link-leaf (binds the predecessor)
`prev_root = rₖ₋₁` (genesis `S₀` uses `0³²`) is bound into `rₖ` as a synthetic **link-leaf**:
`leaf(kind = LINK(7), modality = 0, coord = u32le(epoch), payload = prev_root)`. `LINK = 7` **extends the
container `kind` registry** (container §4.1 reserves `0–4`; `7` is added here for the chain link — register it
there too). The link-leaf is an ordinary TMX leaf, so `prev_root` is integrity-bound under the signed root.
(The binding is the link-leaf only — there is no separate AEAD-AAD copy; see §3.)

**Signing.** Only the **head** root `rₙ` is ML-DSA-signed (hybrid / level-5 per signature-custody). Because each
`rₖ` binds `rₖ₋₁` (link-leaf) and its own `epoch/flags` (header_core), one signature over `rₙ` authenticates the
**contents and order** of the whole chain back to genesis. It does **not** by itself prove `rₙ` is the *latest*
head — that is freshness (§5).

---

## 2. Key-erasure forward secrecy — the per-epoch ratchet (SHAKE256)
A symmetric **hash ratchet** gives each epoch its own key and makes past epochs unrecoverable *once the state is
erased*. All Keccak (suite-consistent), `LP(x) = u32le(len(x)) ‖ x`:

```
CK₀         = the chain key established once at creation (e.g. from the recipient KEM secret, encryption §2.1)
MK_k        = SHAKE256( LP("tmf-hist-msg-v0")  ‖ LP(CK_k) ) [:32]      # this epoch's message key
CK_{k+1}    = SHAKE256( LP("tmf-hist-step-v0") ‖ LP(CK_k) ) [:32]      # ratchet forward
  -- the writer MUST securely DELETE CK_k and MK_k once segment k is sealed --
```

`SHAKE256` is one-way, so an attacker who compromises the **current** state `CK_{k+1}` cannot derive `CK_k`,
`MK_k`, or any earlier key — every segment sealed before the compromise stays confidential. This is
**key-erasure forward secrecy**, and it holds **only** under two stated preconditions:
1. the writer actually erases `CK_k`/`MK_k`/`K_aead[k]` (an implementation obligation, not a property of the hash); and
2. `CK₀`'s own provenance is forward-secret. **If `CK₀` is derived from a long-term KEM secret, compromise of
   that long-term key later re-derives `CK₀ → CK₁ … → MK_k` and breaks the whole chain.** Full forward secrecy
   against long-term-key compromise needs an *ephemeral asymmetric* ratchet (Signal-style DH/KEM rekeying) —
   out of scope for v0. So: this is the symmetric, key-erasure guarantee, **not** unqualified forward secrecy.

### Sealing a segment — encryption §3/§4 reused unchanged, with `shared_secret := MK_k`
The segment is sealed by the **unchanged** encryption key schedule, substituting the ratchet output for the
KEM shared secret:
```
K_aead[k]      = SHAKE256( LP("tmf-dem-kdf-v0")    ‖ LP(MK_k) ‖ LP(aead_context_k) ) [:32]   # encryption §3, verbatim
key_commit[k]  = SHAKE256( LP("tmf-dem-commit-v0") ‖ LP(K_aead[k]) ) [:32]                    # encryption §4, verbatim
committed_aad  = aead_context_k (36 B) ‖ key_commit[k] (32 B)                                  # encryption §4, verbatim
```
with `aead_context_k.epoch = k`. The **committing-AEAD construction is preserved** (the base layer added it to
fix AES-256-GCM's non-key-commitment, Albertini et al. 2022); the history layer does not weaken it. The KEM
(encryption §2.1) still establishes `CK₀` for the recipient.

---

## 3. Append (`+1`) and verify (fail-closed)
```
APPEND segment k (writer):
  1. MK_k = msg(CK_k); seal sections with K_aead[k] (§2); compute r_k over the ciphertext leaves + the
     link-leaf(prev_root = r_{k-1}), with header_core = chain header (epoch=k, flags)
  2. CK_{k+1} = step(CK_k);  securely DELETE CK_k, MK_k  (and K_aead[k] once written)
  3. (re)sign r_k -> head signature
VERIFY chain (reader, fail-closed):
  1. verify the head signature over r_n                                              else AuthError
  2. FRESHNESS (anti-rollback, §5): r_n's epoch >= highest epoch previously accepted  else RollbackError
     (requires verifier state or a trusted head pointer; epoch is in the signed header_core)
  3. for k = n..1: recompute r_k; confirm S_k's link-leaf prev_root == r_{k-1};        else IntegrityError
     genesis S_0 link prev_root == 0^32
  4. K3 governance gate (ALLOW); then per non-erased segment: decapsulate + AEAD-open (committed_aad, §2) else CryptoError
  5. an ERASED segment (flags.erased, §6) is chain-verified but intentionally NOT decryptable -> skipped, not an error
```
Any signature/freshness/link/tag failure ⇒ reject (no partial accept). Order and freshness are checked **before**
any plaintext. The AEAD AAD is exactly encryption §4's `committed_aad` — **unchanged**; `prev_root` is bound via
the link-leaf in the signed root (§1), not duplicated into the AAD.

---

## 4. (reserved)

## 5. Rollback / end-truncation — the freshness boundary
The hash-link is transitive **backward** only, and a streaming writer re-signs every head, so each prefix
`S₀..Sⱼ` (`j < n`) is a fully valid, validly-signed chain. Serving that old head is a **rollback/truncation**
attack that passes steps 1, 3–5 above. It is **not** stopped by the signature. To enforce freshness:
- **Verifier monotone-epoch state:** reject a head whose `epoch` is below the highest previously accepted for
  this `chain_id` (epoch is in the signed `header_core`, so it is authenticated). Requires per-chain verifier
  state. **(default)**
- **Trusted head pointer:** a separately-published, signed `{chain_id, latest_epoch, r_n}` the verifier
  consults (the Trust Capsule is the natural home). Stateless for the verifier, but needs the pointer service.
This spec **mandates one of the two** for any deployment that must resist rollback; without it, only interior
tamper-evidence (not freshness) is guaranteed. (Stating this is the point — do not assume the chain is
rollback-proof.)

---

## 6. Crypto-erasure (right-to-be-forgotten without rewriting the timeline)
To forget segment `k`: **drop `MK_k` / `K_aead[k]`** (the ratchet has already deleted `CK_k`). One-wayness makes
the key unrecoverable ⇒ `Sₖ`'s plaintext is permanently gone. The chain stays intact: `rₖ` (over *ciphertext*)
is unchanged, so `Sₖ₊₁.prev_root == rₖ` and the head signature still verify. The segment is marked
`flags.erased` — **which is in `header_core`, hence under the signed root**, so the erased status is itself
authenticated (a verifier cannot be tricked into treating a non-erased segment as erased, or vice-versa). What
is **not** erased, stated honestly: the ciphertext bytes and the hash-link remain (the timeline is not
rewritten); only the *key* is destroyed.

---

## 7. Golden vector (`gen_tmf_history_chain.py`)
Deterministic parts are **real SHAKE256** (KEM/AEAD ciphertext is structural placeholder, as in
`gen_tmf_encryption.py`). It proves: (a) the ratchet is deterministic and evolving (`CK_{k+1} ≠ CK_k`, distinct
`MK_k`); (b) **`epoch` and `flags` are bound** — flipping `flags.erased` changes `rₖ` (so the erased bit is
authenticated, §6); (c) the **hash-link chains** (`Sₖ.prev_root == rₖ₋₁`, genesis `0³²`); (d) **interior
tamper** (reorder) changes a root; (e) **crypto-erasure** preserves the chain (`S₂.prev_root == r₁` after
dropping `MK_1`). It does **not** claim to prove rollback-resistance — that is the verifier-state property of §5,
which a single self-check cannot demonstrate.

## 8. On-wire multi-segment packaging — the segment offset table

Carries an ordered chain `S₀..Sₙ` in **one blob** with a **segment offset table** so a reader can locate each
segment. **Trust is unchanged** (§1/§3): only the **head** root `rₙ` is signed; interior integrity + order come
from the backward hash-link (each `rₖ` binds `rₖ₋₁` via the LINK leaf) and from **recomputing every root**. The
segment table is an **untrusted index** — bounds-checked, then every `rₖ` recomputed and every link re-matched —
exactly the container's philosophy (container §6: offsets bounds-checked, leaves/roots recomputed).

### Pack header — 48 bytes (all integers little-endian)
| Off | Size | Field | Notes |
|---|---|---|---|
| 0 | 8 | `MAGIC` | `0x89 'T' 'M' 'H' 0x0D 0x0A 0x1A 0x0A` — history pack (distinct from the container's `'TMF'`) |
| 8 | 2 | `version_major` u16 | `0`; reader rejects unknown major |
| 10 | 2 | `version_minor` u16 | `0` |
| 12 | 2 | `pack_flags` u16 | bit0 = `head_signed`; bits 1–15 reserved (MUST be 0) |
| 14 | 2 | reserved u16 | MUST be 0 |
| 16 | 16 | `chain_id` | 128-bit chain id; **also bound in each segment's chain-header reserved-16 (§1)**, hence under the signed root |
| 32 | 8 | `segment_count` u64 | number of segment-table entries |
| 40 | 4 | `head_index` u32 | table index of the head segment `Sₙ` (the signed one); cross-checked against the chain walk |
| 44 | 4 | `head_epoch` u32 | convenience hint; **authoritative** epoch = `Sₙ`'s signed `header_core.epoch` |

### Segment-table entry — 56 bytes each (same width as a container section entry)
| Off | Size | Field | Notes |
|---|---|---|---|
| 0 | 4 | `epoch` u32 | index hint (authoritative value is the segment's signed `header_core`) |
| 4 | 4 | `seg_flags` u32 | mirror of chain `flags` (bit2 `erased`, §6); authoritative copy in the signed `header_core` |
| 8 | 8 | `seg_off` u64 | offset of the segment body from the **start of the segment region** |
| 16 | 8 | `seg_len` u64 | segment body length |
| 24 | 32 | `seg_root` | `rₖ` — **index hint only, re-verified**; the reader recomputes `rₖ` from the body, so a forged hint is caught |

`region_off = 48 + segment_count × 56`. Segment body for entry *i* = `file[region_off+seg_off_i :
region_off+seg_off_i+seg_len_i]`. The body is the bytes that recompute `rₖ`: the **24-byte chain header (§1)** as
`header_core`, then the segment's container-§3 section group (section entries + payload region, including the
LINK leaf). `rₖ = TMX.root(chain_header₂₄, [leaf_hashes])` (§1). The optional head **signature block** (iff
`pack_flags.head_signed`) follows the region — format per signature-custody, signing **only** `rₙ`.

### Reader algorithm (extends §3; fail-closed)
```
1. MAGIC ok; version_major == 0                                                    else BadMagic / UnsupportedVersion
2. BOUNDS (MUST, before any hashing): region_off = 48 + segment_count*56 <= len;
   head_index < segment_count; ∀ entry: region_off + seg_off + seg_len <= len       else MalformedTable
3. ∀ segment: recompute r_k from its body (§1); confirm chain-header chain_id == pack.chain_id  else IntegrityError
   (the table seg_root is only an index hint; the recomputed r_k is authoritative)
4. head = segment[head_index]; head.epoch == head_epoch                             else IntegrityError
   verify head ML-DSA signature over r_n (Blocked on a vetted lib; golden vectors unsigned)      else AuthError
5. FRESHNESS (anti-rollback, §5): head.epoch >= monotone-epoch state for chain_id   else RollbackError
6. backward link walk: cur = head; while cur.epoch > 0: find the segment whose recomputed root == cur's
   LINK prev_root AND epoch == cur.epoch-1 (index BY root, so table order is irrelevant);
   genesis prev_root == 0^32                                                        else IntegrityError
6b. STRICT MEMBERSHIP (no orphans): the set of segments visited by the walk MUST equal the full table set
    (walked_count == segment_count)                                                 else IntegrityError
7. K3 govern (ALLOW); decapsulate + AEAD-open each segment ON THE WALKED CHAIN, NON-erased (§2/§3);
   an erased segment (§6) is chain-verified but skipped, NOT an error
8. on success, advance the monotone-epoch state to head.epoch
```

Because lookups are **by recomputed root**, shuffling the table is harmless; dropping or reordering a segment
breaks the **link walk** (step 6); an **inserted off-path segment** (a valid extra segment that links some
existing root) is caught by **strict membership** (step 6b) — *not* by the link walk, and crucially *not* by the
signature either: `rₙ` commits only **backward to genesis**, never to table/region membership, so without step 6b
a real ML-DSA signature would still pass while attacker-injected payload rode along to step 7. Tampering any body
changes its `rₖ` and breaks the next link; relabeling `chain_id` fails step 3 (it is in `header_core`). A
**fork** (two segments at the same epoch) likewise leaves one branch off the head's walk ⇒ rejected by 6b.
Reference encoder/decoder/verifier: [`bench/history-pack.mjs`](../../tri-encription/bench/history-pack.mjs) —
**9/9** (round-trip, table-order independence, interior tamper, drop-middle, rollback-caught-by-§5-state + the §5
caveat, `chain_id` relabel, erased-segment, **off-path insertion → orphan**). As in the other golden vectors, the head signature is format-normative but **Blocked on a vetted
FIPS-204 lib** (unsigned reference).

---

## 9. Not in v0
Ephemeral asymmetric ratchet (full FS, §2); the head-pointer service (§5); intra-segment streaming/mmap. Real
KEM/AEAD + head-signature bytes remain Blocked on a vetted lib.

## 10. Sources / companions
Symmetric hash ratchet (Signal double-ratchet's *symmetric* chain; TLS 1.3 key schedule) — adapted, not
reimplemented; the asymmetric ratchet that would give full FS is explicitly out of scope (§2). Committing AEAD:
Albertini et al., USENIX Security 2022 (via encryption §4). Companions:
[`tmf-encryption-v0.md`](tmf-encryption-v0.md), [`signature-custody-v0.md`](signature-custody-v0.md),
[`tmx-256-construction-v0.md`](tmx-256-construction-v0.md), charter `..\..\RD-DIRECTION.md` §3.3.
