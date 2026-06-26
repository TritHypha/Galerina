# `.tmf` TMX-256 inclusion (Merkle) proof — v0

**Status:** Draft, buildable + **verified**. Makes [`tmx-256-construction-v0.md`](tmx-256-construction-v0.md)
§9 byte-precise: a self-contained proof that **one section is bound under the signed root**, without
shipping the whole file (selective disclosure / streaming verification). The reference generator
[`_vectors/gen_inclusion_proof.py`](_vectors/gen_inclusion_proof.py) reconstructs the **same published golden
root `43386e64…`** from `(leaf_hash + path)` — so this spec is cross-consistent with the TMX-256 and
container vectors by construction.

> **What a proof proves (and does not).** An inclusion proof shows `leaf_hash` is in the tree whose root is
> `R`. It is only meaningful when the verifier independently trusts `R` — i.e. **verifies the ML-DSA-65
> signature over the reconstructed `R`** (or compares `R` to a pinned signed root). A proof alone is
> membership, not authenticity; authenticity is still the signature over the root (`tmx-256` §6 / `signature-custody-v0`).

---

## 1. Purpose

To let a verifier confirm section `i`'s `(kind, modality, coord, payload)` is part of a signed `.tmf` while
receiving only: `header_core` (24 B), the section's `leaf_hash` (or the data to recompute it), and the
sibling digests on the path from leaf `i` to the root. The verifier recomputes `top_node`, then `root`, then
checks the signature. Enables selective disclosure (reveal one section, prove it belongs) and streaming
verification (verify sections as they arrive) — a property of the 3-ary tree shape, no special hardware.

## 2. Wire format (byte-precise; all integers little-endian)

```
Off  Size  Field
0    1     version        u8   = 0
1    2     tmx_profile    u16  = 0 (SHAKE256; only profile with vectors)
3    4     leaf_index     u32  target section index (informational; security rests on root-match)
7    4     leaf_count     u32  total sections n (lets the verifier check expected path_len)
11   1     path_len       u8   number of levels on the path = number of triples to fold
12   24    header_core    the 24 bound header bytes (tmx-256 §5 / container §2)
36   32    leaf_hash      the §2 leaf digest of the target section
68   …     PATH           path_len entries, each 65 bytes:
             0   1    pos      u8     target's index within this triple (0/1/2)
             1   32   sib_a           digest at the LOWER of the two non-target positions
             33  32   sib_b           digest at the HIGHER of the two non-target positions
```

Proof size = `68 + 65 · path_len` bytes (e.g. **133 B** for `path_len = 1`).

## 3. Prover (how the path is extracted)

Build the tree exactly as `tmx-256` §4 (reduce leaves in groups of 3, pad short final groups with `ABSENT`,
always reduce ≥ 1 level). For the target index, at each level below the top: record `pos` (the target's
index within its triple) and the **two sibling digests in ascending non-`pos` position order** (a padded
slot's sibling is `ABSENT`). Ascend (`idx //= 3`) until the top-only level. `header_core` and `leaf_hash`
complete the proof.

## 4. Verifier algorithm (fail-closed)

```
cur = leaf_hash
for each path entry (bottom -> top):
    triple = [None,None,None]; triple[pos] = cur
    fill the two None slots, in ascending index order, with sib_a then sib_b
    cur = SHAKE256( LP("TMX-NODE-v0") ∥ triple[0] ∥ triple[1] ∥ triple[2] , 32 )
R = SHAKE256( LP("TMX-ROOT-v0") ∥ LP(header_core) ∥ cur , 32 )
REQUIRE  ML-DSA-65.Verify(pk, R, signature)   == true        else AuthError   (R must be the TRUSTED root)
(optionally also: leaf_hash == leaf(kind,modality,coord,payload) if the data is supplied)
```

Any mismatch — wrong sibling, wrong leaf, wrong shape, or a reconstructed `R` whose signature does not
verify — fails closed. (`LP(b) = LE32(len(b)) ∥ b`, per `tmx-256` §1.)

## 5. Golden vector (reproduces the published root)

From `python spec/_vectors/gen_inclusion_proof.py` over the canonical 2-section file
(`sec0: kind=1 mod=0 coord=i32le(3,5,7) "hello"` · `sec1: kind=1 mod=2 coord=i32le(3,5,8) "world!"`):

```
ABSENT          = 1758f20e501b1baaf42d5b2d5a07a9054e2134132139ae3d3af35f95f158d563
top_node        = 0970038c1fe3b538db6f896672f560ceaf17cb8f0bdaf1fb53c8fe542667af0c
integrity_root  = 43386e644c7b53aa0900cda21c15acd15f30b3fdf997950e39e7dd3dbc685212   (== published golden root)

inclusion proof, section 0  (path_len=1, 133 bytes):
  leaf_hash = 34eb47169cfaf5b3fac19670624c4dc4d7002838be5542625d6a90d2a5eefc72
  level pos=0  sib_a=65a4d5568838d568e1bfe45f96997b251674425a6243dc04da1ca548d211594b (leaf1)
               sib_b=1758f20e501b1baaf42d5b2d5a07a9054e2134132139ae3d3af35f95f158d563 (ABSENT)
  proof hdr = 000000000000000200000001   (ver=0|profile=0|index=0|count=2|path_len=1)
  reconstructs -> 43386e64…685212   ✓ (== golden root)

inclusion proof, section 1  (path_len=1, 133 bytes):
  leaf_hash = 65a4d5568838d568e1bfe45f96997b251674425a6243dc04da1ca548d211594b
  level pos=1  sib_a=34eb…fc72 (leaf0)   sib_b=1758…d563 (ABSENT)
  reconstructs -> 43386e64…685212   ✓ (== golden root)

negative checks (both MUST be False):
  tamper(flip one sibling byte)        -> reconstructs golden root? False
  wrong-leaf (leaf1 via leaf0's path)  -> reconstructs golden root? False
```

Any conforming implementation, in any language, MUST reproduce these bytes and the root-match.

## 6. Security notes
- The proof inherits the root's bindings: `leaf_hash` covers `(kind, modality, coord, payload)` (`tmx-256`
  §2) and the path covers section order and shape; `header_core` is folded in at the root. A relabel,
  cell-swap, reorder, or shape change all break reconstruction.
- **Trust the signature, not the proof.** The reconstructed `R` MUST be checked against the ML-DSA-65
  signature (or a pinned signed root). Without that, an attacker supplies an internally-consistent
  `(leaf, path, R')` of their own — membership in an *unsigned* root proves nothing.
- `ABSENT` is the fixed public sentinel (`tmx-256` §3); it appears in proofs as ordinary sibling material.
- No self-healing in this path; mismatch is a hard, fail-closed error.

## 7. Sources & cross-references
- [`tmx-256-construction-v0.md`](tmx-256-construction-v0.md) §2–§5, §9 (the tree this proves over) ·
  [`signature-custody-v0.md`](signature-custody-v0.md) (the ML-DSA-65 signature the proof is checked against) ·
  [`tmf-container-v0.md`](tmf-container-v0.md) §2 (`header_core`).
- FIPS 202 SHAKE256 — https://csrc.nist.gov/pubs/fips/202/final · FIPS 204 ML-DSA — https://csrc.nist.gov/pubs/fips/204/final
