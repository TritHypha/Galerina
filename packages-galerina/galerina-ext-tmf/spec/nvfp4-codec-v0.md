# NVFP4 `Vector`-modality codec — v0

**Status:** Draft, buildable + **verified** (executable reference + golden vector). This defines **one
opt-in payload codec** for `modality = Vector` (§4.2 of [`tmf-container-v0.md`](tmf-container-v0.md)). It
is grounded against the **verified** NVFP4 structure in NVIDIA Model-Optimizer / TransformerEngine (see
[`../research/external-repos-analysis.md`](../research/external-repos-analysis.md) §2).

> **Three rules that bound this codec:**
> 1. **Opt-in, never mandatory.** A `Vector` section MAY use NVFP4, or raw `f32`/`f16`, or any codec. Other
>    modalities (Graph/Relation/Attribute/Blob) use their own. The container does not require NVFP4.
> 2. **Lossy ⇒ never integrity bytes.** NVFP4 rounds (the golden vector below shows `0.75 → 0.5`). It is for
>    embeddings/tensors only — never a signed root, a hash, a key, or any byte whose exact value is load-bearing.
> 3. **Opaque to TMX.** TMX-256 hashes the *resulting payload bytes* (the leaf binds `kind ∥ modality ∥ coord ∥ payload`).
>    The codec changes what bytes a `Vector` payload *contains*; it never changes how those bytes are hashed.

---

## 1. Where the codec sits (Vector section payload layout)

A `Vector` section's `payload` (the bytes after `coord`, per the container §3 slice rule) is:

```
0   1   vector_codec  u8         0x01 = NVFP4-v0  (reserves 0x02=raw-f32, 0x03=MXFP4, …)
1   4   vec_len       u32 LE     number of logical scalars in the vector
5   4   global_scale  f32 LE     per-tensor FP32 scale (the 2nd level of NVFP4's two-level scaling)
9   …   blocks        ⌈vec_len/16⌉ × 9-byte NVFP4 blocks (last block zero-padded to 16 elements)
```

So `payload_len = 9 + ⌈vec_len/16⌉ × 9`. This whole byte string is what TMX hashes as the leaf payload.
The leading **`vector_codec` byte** lets a reader dispatch (NVFP4 vs raw-`f32` vs MXFP4…) without any
out-of-band agreement; an unknown codec id is a hard reject (fail-closed), not a guess.

---

## 2. The 9-byte NVFP4 block (verified structure)

```
0     1   scale     E4M3 (FP8) per-block scale            (1 byte)
1..8  8   elements  16 × E2M1 (4-bit), two nibbles/byte   (8 bytes)
                                                        = 9 bytes / 16 elements
```

Verified against NVIDIA source: `NVFP4_BLOCK_SCALING_SIZE = 16`, element dtype `kFloat4E2M1`, per-block
scale cast to `float8_e4m3fn`. (Contrast **MXFP4**: 32-element blocks with an E8M0 scale — a *different*
format; do not conflate.)

**Nibble packing (modelopt order):** byte `1+k` (k=0..7) holds element `2k` in its **low** nibble and
element `2k+1` in its **high** nibble: `byte = elem[2k] | (elem[2k+1] << 4)`.

---

## 3. E2M1 element — the exact value set

An E2M1 nibble is `sign(1) ∥ exp(2) ∥ mant(1)` with exponent bias 1. The **16 representable values** are
fixed (this is the whole point — 8 magnitudes, **not** 3 ternary states):

```
magnitudes by (exp,mant): (0,0)=0  (0,1)=0.5  (1,0)=1  (1,1)=1.5  (2,0)=2  (2,1)=3  (3,0)=4  (3,1)=6
value = (-1)^sign × magnitude
full table (codes 0..15):
  [ 0, 0.5, 1, 1.5, 2, 3, 4, 6,  -0, -0.5, -1, -1.5, -2, -3, -4, -6 ]
```

> **Correction to the idealized IEEE formula.** The "explainer" form `x = 2^(E−bias)·(1+M)` is only right
> for the *normal* range; it does **not** yield the subnormal values `0` and `0.5` (E=0). The authoritative
> definition is the **value table above**, which a decoder MUST use. (Encoders pick the nearest table value.)

---

## 4. E4M3 per-block scale + two-level scaling

The per-block scale is one byte in **E4M3FN** (`sign(1) ∥ exp(4) ∥ mant(3)`, bias 7, finite range
`[2⁻⁹, 448]`, NaN only at `S.1111.111`):

```
exp == 0      : value = (mant/8) · 2⁻⁶            (subnormal; min 2⁻⁹)
0 < exp < 15  : value = (1 + mant/8) · 2^(exp−7)  (normal; max finite 448 at exp=15,mant=6)
```

**Decoded scalar** for element *i* in a block:

```
x_i = global_scale (f32) × block_scale (E4M3) × element_value (E2M1)
```

This is NVFP4's genuine **two-level** scaling: a per-tensor FP32 `global_scale` (stored once in the payload
header, §1) times a per-block E4M3 scale (byte 0 of each block). Typical encoder choice: per-block scale ≈
`block_amax / (6 × global_scale)` (6 = max |E2M1|), snapped to the nearest E4M3 value.

---

## 5. Decode / encode (reference)

Implemented and run by [`_vectors/gen_nvfp4_block.py`](_vectors/gen_nvfp4_block.py) (stdlib only):

```
decode_block(block9, global_scale):
    s = E4M3_decode(block9[0])
    for k in 0..7:
        b = block9[1+k]
        emit global_scale * s * E2M1_decode(b & 0xF)        # element 2k
        emit global_scale * s * E2M1_decode((b >> 4) & 0xF) # element 2k+1

encode_block(vals16, global_scale):
    amax        = max|vals16 / global_scale|
    scale_byte  = nearest_E4M3(amax / 6)
    for each v:  nibble = nearest_E2M1( v / (global_scale*scale_value) )
    pack nibbles (low=even, high=odd)
```

A decoder is total over all 256×16 inputs (every nibble and every scale byte has a defined value, modulo
the single E4M3 NaN code which a `Vector` payload MUST NOT use for a scale).

---

## 6. Golden vector (generated, reproducible)

`python spec/_vectors/gen_nvfp4_block.py` →

```
E2M1 value set   = [0, 0.5, 1, 1.5, 2, 3, 4, 6, -0, -0.5, -1, -1.5, -2, -3, -4, -6]

input (16)       = [0.5, -1.0, 0.0, 3.0, 0.75, 2.0, -6.0, 1.5, 0,0,0,0,0,0,0,0]
block (9 bytes)  = 38a150413f00000000          scale_byte=0x38 → E4M3 = 1.0
decoded          = [0.5, -1.0, 0.0, 3.0, 0.5,  2.0, -6.0, 1.5, 0,0,0,0,0,0,0,0]
max abs error    = 0.25                         (0.75 → 0.5 — LOSSY by design)

Vector payload   = 01 10000000 0000803f 38a150413f00000000
                   │  └vec_len=16┘ └global=1┘ └── one 9-byte block ──┘
                   └ vector_codec = 0x01 (NVFP4-v0)
decode_vector    = [0.5, -1.0, 0.0, 3.0, 0.5, 2.0, -6.0, 1.5, 0,0,0,0,0,0,0,0]
```

Byte check: `0xa1` → low `0x1`=+0.5, high `0xa`=−1.0; `0x50` → 0.0, +3.0; `0x41` → +0.5 (the rounded
0.75), +2.0; `0x3f` → −6.0, +1.5; trailing `0x00` → zeros.

---

## 7. Integrity interaction (the only thing that matters cryptographically)

A `Vector` section with an NVFP4 payload is hashed exactly like any other section:
`leaf = SHAKE256(LP("TMX-LEAF-v0") ∥ LE16(kind) ∥ LE16(modality=0) ∥ LP(coord) ∥ LP(payload), 32)`,
where `payload` is the §1 byte string. **The codec never enters the trust math** — TMX sees opaque bytes,
the root binds them, ML-DSA-65 signs the root. Re-encoding a vector with different NVFP4 rounding produces
*different payload bytes* → a *different, honestly distinct* leaf and root (NVFP4's lossiness is visible to
integrity as a content change, which is correct).

## 8. Not in v0 / open
- **Decided & included:** the 1-byte `vector_codec` discriminator at payload offset 0 (`0x01 = NVFP4-v0`).
- Other `Vector` codecs (raw `f32`/`f16` = `0x02`, MXFP4 = `0x03`, PQ-compressed, …) — define when needed;
  the discriminator already reserves the space.
- Hardware/SIMD decode — out of scope; this is a byte-format spec, no perf claims.
