# Galerina TPL ↔ BitNet I2_S fidelity audit (verified in code, not asserted)

**Subject:** `packages-galerina/galerina-tower-citizen/src/tpl-simulator.ts` — the Virtual Photonic
Processor (VPP) core whose header (lines 4–16) claims **byte-compatibility** with Microsoft BitNet's
I2_S ternary kernel.
**Reference (MIT):** `C:\wwwprojects\BitNet\src\ggml-bitnet-mad.cpp`, with `include/ggml-bitnet.h`.
**Status:** verification record. Every claim below is a **direct quote from current source** (Galerina
working tree + the BitNet reference), with `file:line`. Nothing here is paraphrase or recollection.
Dated **2026-06-15**.
**Companion to:** `notes/33-tmx-non-transfer-evidence.md` (the TMX non-transfer dossier, same house style),
`docs/Knowledge-Bases/galerina-photonic-tri-substrate-rd-agenda.md` (the governance-layer R&D agenda
that sits on this foundation), and `galerina-three-valued-governance.md` / `galerina-substrate-failure-model.md`
(Directions A and C, which reason over the trit this kernel represents).

> **Why this dossier?** The `Verdict` calculus (Direction A) and the substrate noise model
> (Direction C) both reason about *the trit BitNet packs on the wire*. If `tpl-simulator`'s
> representation diverged from BitNet's, the governance layer would be reasoning about a fiction.
> This file proves — line by line — that it does not, so the foundation can be re-checked and can't
> rot silently.

**Guardrails honoured:** read-only audit of BitNet; **no BitNet code copied into Galerina**; Galerina
stays TypeScript; no `.tmf`/TritMesh coupling. The only Galerina-side change is a *test* (a golden
vector pinning the representation) + this doc + its index row — `tpl-simulator.ts`'s gate semantics
are **untouched**.

---

## Verification method

`tpl-simulator.ts` (372 lines) and `ggml-bitnet-mad.cpp` (1,056 lines) were both read in full. The
four load-bearing BitNet sites — the `q8` value map, the byte-pack expression, the `i2_scale`
reduction, and the dot-product decode — were re-read by hand and are marked **✔ re-confirmed**. A
hand-computed golden vector (below, §6) was then encoded by an *independent* re-implementation of
BitNet's packing math and pinned as a regression test against Galerina's actual backing store.

**Scope note (what "byte-compatible" means).** The header's load-bearing claim is that *a buffer
packed by `tpl-simulator` is byte-identical to one packed by `bitnet.cpp`* — i.e. the **on-the-wire
representation** (Claims 1 & 2). Claims 3 & 4 concern **compute semantics** (how the trit is *used*),
which the header also states. Galerina is explicitly **not** a perf-identical SIMD twin (header line 4:
"a bespoke, governance-wrapped take"); the bar is *semantic faithfulness to the trit the governance
layer reasons about*. Findings are graded against that bar.

---

## Result at a glance

| # | Claim | Verdict | Evidence |
|---|---|---|---|
| 1 | 2-bit trit encoding `00=-1 · 01=0 · 10=+1 · 11=ILLEGAL` | ✅ **CONFIRMED (exact)** | BitNet `q8` map + comment |
| 2 | Pack 4 trits/byte, high-bits-first `(q0<<6)\|(q1<<4)\|(q2<<2)\|(q3<<0)` | ✅ **CONFIRMED (exact)** | BitNet packs with that literal expression |
| 3 | T-MAC = add / subtract / skip (ternary dot product, no multiply) | ✅ **CONFIRMED (semantics)** · ⚠ impl. differs, non-affecting | BitNet weights are {-1,0,+1}; SIMD realizes it via a biased-encoding `maddubs` trick |
| 4 | `i2_scale = max(\|weights\|)`, applied **after** accumulation | ✅ **CONFIRMED** | BitNet reduction + scale stored, never applied inside the dot kernel |

**Bottom line:** the header's **byte-compatibility claim is VERIFIED as of 2026-06-15** — it rests on
Claims 1 & 2, which match BitNet *exactly* (one stated assumption: little-endian serialization of the
`Int32Array`, which holds on WASM and x86). Claims 3 & 4 (compute semantics) are faithful; Claim 3
carries one documented implementation divergence that **does not** affect `tpl-simulator`'s
correctness as a governance-wrapped model — if anything Galerina computes the *cleaner, unbiased* form.

---

## Claim 1 — 2-bit trit encoding → ✅ CONFIRMED (exact)

**Galerina asserts** (`tpl-simulator.ts:57-60`):
```ts
const ENC_REJECT = 0b00; // -1
const ENC_HOLD   = 0b01; //  0
const ENC_COMMIT = 0b10; // +1
const ENC_ILLEGAL = 0b11; // never written; reading it = corruption
```

**BitNet evidence ✔ re-confirmed** — the quantizer maps each weight to a 2-bit `q8` code, and a
comment fixes the code↔value correspondence explicitly (`ggml-bitnet-mad.cpp:66-78`, AVX path; the
NEON path repeats it verbatim at `:164-176`):
```cpp
for (int i=0; i<n; i++) {
    if (fabs((double)(src[i])) < 1e-6) {
        q8[i] = 1;                                  // weight 0  -> code 1
        continue;
    }
    q8[i] = (double)src[i] * i2_scale > 0 ? 2 : 0;  // weight +  -> code 2 ; weight - -> code 0
}
...
// q8 -> 0, 1, 2
//       |  |  |
//      -1, 0, 1                                     // :76-78  the canonical code↔trit map
```

So BitNet's mapping is **`0b00 → -1`, `0b01 → 0`, `0b10 → +1`** — identical to Galerina's `ENC_*`. And
`q8` is only ever assigned `0`, `1`, or `2`: **`0b11` is never emitted by BitNet**, exactly as
Galerina's header claims (`tpl-simulator.ts:20`, "BitNet never emits it; its presence = corruption").
Galerina turns that into a hard trap — `decodeTrit`'s `default` branch (`tpl-simulator.ts:79-81`):
```ts
default:         // ENC_ILLEGAL
  throw new TPLIntegrityFault(`Illegal trit encoding 0b11 at decode — buffer corruption`);
```

**Verdict: CONFIRMED, exact.** The value↔bit mapping matches bit-for-bit, and BitNet's never-emitting
`0b11` corroborates Galerina's use of it as a corruption sentinel.

---

## Claim 2 — Packing layout (4 trits/byte, high-bits-first) → ✅ CONFIRMED (exact)

**Galerina asserts** (header `tpl-simulator.ts:12-13`; mechanized in `tritBitShift`, `:170-175`):
```ts
//   packing  →  4 trits per byte, high-bits-first: (q0<<6)|(q1<<4)|(q2<<2)|(q3<<0)
...
function tritBitShift(index: number): number {
  const local = index % TRITS_PER_I32; // 0..15
  const byteIdx = (local / 4) | 0;     // 0..3  (which byte of the i32)
  const posInByte = local % 4;         // 0..3  (which trit of the byte)
  return byteIdx * 8 + (3 - posInByte) * 2; // high-bits-first within the byte  (:174)
}
```
`posInByte 0 → shift +6`, `1 → +4`, `2 → +2`, `3 → +0`: the first trit of a byte occupies the **high**
2 bits — i.e. `(q0<<6)|(q1<<4)|(q2<<2)|(q3<<0)`.

**BitNet evidence ✔ re-confirmed** — the scalar packer writes exactly that expression
(`ggml-bitnet-mad.cpp:132-138`):
```cpp
uint8_t q0 = q8[r0 * n_per_row + col];
uint8_t q1 = q8[r1 * n_per_row + col];
uint8_t q2 = q8[r2 * n_per_row + col];
uint8_t q3 = q8[r3 * n_per_row + col];

uint8_t packed = (uint8_t)((q0 << 6) | (q1 << 4) | (q2 << 2) | (q3 << 0));   // :137
out[base + col] = packed;
```
A **literal character-for-character match** of Galerina's documented expression. Two independent
corroborations in the same file:

- **Pack side, SIMD path** (`:83-86`): `temp = (q8[...] << (6 - 2 * group_idx))`, where
  `group_idx ∈ {0,1,2,3}` ⇒ shifts `{6,4,2,0}` — first group to the high bits, same order.
- **Decode side** (`:225-234`): the dot kernel extracts the four fields as
  `xq8_0 = byte>>6`, `xq8_1 = byte>>4`, `xq8_2 = byte>>2`, `xq8_3 = byte & 3` (after `& 0x03`).
  So `q0` is recovered from the **high** 2 bits and `q3` from the **low** 2 bits — confirming the
  high-bits-first order from the reading end too. Galerina's `getTrit` extracts the same way with an
  unsigned shift (`tpl-simulator.ts:236`): `(this.mem[wordIdx]! >>> shift) & 0x03`.

**Byte-order caveat (stated, not a divergence).** BitNet writes a flat `uint8_t[]`; Galerina packs into
an `Int32Array` (`tpl-simulator.ts:184`, header line 25 "Int32Array backing store"). The two byte
streams coincide **iff** the `Int32Array` is serialized little-endian — which is the WASM-defined and
x86 byte order Galerina targets (header line 26, "unsigned shifts for sign-safe extraction"). Under that
(always-true on the target platforms) assumption, a contiguous trit vector packed by Galerina is
byte-identical to BitNet's `out[]`. §6's regression test pins this per-byte.

**Verdict: CONFIRMED, exact** (modulo the documented little-endian serialization assumption).

---

## Claim 3 — T-MAC = add / subtract / skip → ✅ CONFIRMED (semantics); ⚠ implementation differs (non-affecting)

**Galerina asserts** (header `:14-15`; `tmacVector`, `:310-315`):
```ts
let acc = 0; // integer accumulator — no FP in the hot loop
for (let i = 0; i < count; i++) {
  const w = this.getTrit(weightStartTrit + i); // -1 | 0 | 1
  if (w === 1) acc += activations[i]!;
  else if (w === -1) acc -= activations[i]!;
  // w === 0 → skip (BitNet's zero-cost path)
}
```
This is the **canonical ternary dot product** `Σ wᵢ·aᵢ` with `wᵢ ∈ {-1,0,+1}` — add on `+1`,
subtract on `-1`, skip on `0`, no multiply.

**BitNet evidence ✔ re-confirmed.** BitNet's *representation* is unambiguously the same ternary MAC:
the weights are `{-1,0,+1}` (Claim 1) and `ggml_vec_dot_i2_i8_s` computes their dot product against
int8 activations. **But the SIMD kernel does not branch add/sub/skip.** It decodes each weight to the
*biased* code `e ∈ {0,1,2}` and multiplies with `_mm256_maddubs_epi16` (`ggml-bitnet-mad.cpp:231-245`):
```cpp
xq8_3 = _mm256_and_si256(xq8_3, mask);   // e ∈ {0,1,2}   (mask = 0x03)
...
xq8_0 = _mm256_maddubs_epi16(xq8_0, yq8_0);   // Σ e·y  (unsigned weight × signed activation)
...
int sumi = hsum_i32_8(accu);
s[row] = (float)sumi;                    // :294-295  raw integer sum written out
```
Because the decoded code is `e = w + 1`, the kernel's raw output is
`Σ eᵢ·yᵢ = Σ(wᵢ+1)·yᵢ = (Σ wᵢ·yᵢ) + Σ yᵢ` — the true ternary dot product **plus a `Σactivations`
bias**, which BitNet corrects downstream in the ggml mul-mat pipeline (not in this file). This is a
performance technique: one `maddubs` over a uniform unsigned encoding instead of data-dependent
add/sub/skip branches.

**Assessment of impact: none — and arguably positive.** Three reasons it does not affect
`tpl-simulator`'s correctness as a governance-wrapped *model*:
1. **It is the same operation.** Both compute the dot product of ternary weights with activations.
   Galerina implements the *definition* (`Σ wᵢ·aᵢ`); BitNet implements an *equivalent biased-encoding
   optimization of* that definition.
2. **Galerina never claims SIMD parity.** The header says "governance-wrapped take" (`:4`) and the
   byte-compatibility claim is about the **wire format** (Claims 1 & 2), not the instruction stream.
3. **Galerina's form is the cleaner one.** `tmacVector` emits the *unbiased* dot product directly — it
   does **not** carry BitNet's raw-kernel `+Σactivations` bias (which BitNet must correct later). For
   a layer whose job is to *reason about* "this weight adds / subtracts / skips this activation", the
   transparent add/sub/skip is strictly more faithful to the semantics than a biased `maddubs`.

**Verdict: CONFIRMED at the representation/semantics level.** Documented implementation divergence
(SIMD `maddubs` on `{0,1,2}` + downstream bias correction, vs. Galerina's canonical add/sub/skip) is a
performance detail outside the byte-compatibility claim and does not affect correctness.

---

## Claim 4 — Scale `i2_scale = max(|weights|)`, applied after accumulation → ✅ CONFIRMED

**Galerina asserts** (header `:16`; field `:189`; application `:320`):
```ts
/** Per-tensor scale (BitNet i2_scale = max|weights|). T-MAC results are scaled by this. */
private scale = 1;
...
const scaled = acc * this.scale;   // :320 — AFTER the accumulation loop (:310-315)
```

**BitNet evidence ✔ re-confirmed.** The per-tensor scale is the max absolute weight
(`ggml-bitnet-mad.cpp:103-107`; identical reductions at `:59-63` and `:157-161`):
```cpp
double max = 0;
for (int64_t i = 0; i < n; ++i) {
    max = fmax(max, (double)fabs((double)src[i]));
}
double i2_scale = max;        // :107 — max|weights|
```
And it is **applied after accumulation**, not inside the dot product: the scale is stored as a
trailing float (`:90-91` and `:143-144`, `scale_ptr[0] = i2_scale;`), while the dot kernel writes the
**raw** integer sum (`:294-295`, `s[row] = (float)sumi;`). The scale multiplies the accumulated result
downstream — exactly Galerina's `acc * this.scale` after the loop.

**Two scope notes (neither a divergence):**
- **Who computes `max`.** BitNet computes `max|weights|` inside `quantize_i2_s`; Galerina delegates it to
  the caller via `setScale` (`tpl-simulator.ts:208-210`). This is a separation of concerns:
  `loadWeights` receives already-ternary weights (`:333-341`), so the original float magnitudes that
  define `max|weights|` are not available to it — they must come from the quantizer that produced the
  trits. The *formula* and the *application point* match.
- **Activation scale.** BitNet's full result also folds in an activation-quantization scale; Galerina
  operates on integer activations directly (`tmacVector(activations: Int32Array, …)`, `:294-299`) and
  applies only the weight `i2_scale`. Consistent with a model that does not quantize its activations.

**Verdict: CONFIRMED.** `i2_scale = max(|weights|)`, applied post-accumulation, matches BitNet.

---

## Summary — the four claims, each backed by code

| # | Galerina header claim | Galerina site | BitNet evidence (`ggml-bitnet-mad.cpp`) | Verdict |
|---|---|---|---|---|
| 1 | `00=-1 · 01=0 · 10=+1 · 11=ILLEGAL` | `tpl-simulator.ts:57-60, 79-81` | `q8` map `:66-72` + comment `:76-78`; `0b11` never emitted | ✅ exact |
| 2 | `(q0<<6)\|(q1<<4)\|(q2<<2)\|(q3<<0)` | `tpl-simulator.ts:170-175, 236` | literal pack `:137`; SIMD shift `:85`; decode `:225-234` | ✅ exact |
| 3 | T-MAC add / subtract / skip | `tpl-simulator.ts:310-315` | ternary weights {-1,0,+1}; SIMD `maddubs` on biased `{0,1,2}` `:231-245` | ✅ semantics (impl. differs, non-affecting) |
| 4 | `i2_scale = max(\|w\|)`, post-accum | `tpl-simulator.ts:189, 208-210, 320` | `max|w|` `:103-107`; stored `:90-91/143-144`; raw sum `:294-295` | ✅ |

**Net:** the on-the-wire trit representation `tpl-simulator` produces is **byte-identical** to BitNet
I2_S (Claims 1 & 2, exact), and its compute semantics are faithful (Claims 3 & 4). The header's
byte-compatibility claim is **verified as of 2026-06-15.** The single nuance (Claim 3) is an
implementation choice — BitNet's SIMD `maddubs`-on-biased-encoding vs. Galerina's canonical
add/sub/skip — that is *outside* the byte-compatibility claim and leaves Galerina, if anything, with the
cleaner (unbiased) realization of the same operation.

---

## Recommendations

1. **No code change to `tpl-simulator.ts`.** No correctness bug was found; the encoding, packing, and
   scale match BitNet exactly, and the T-MAC computes the correct ternary dot product. The gate
   semantics other Galerina code depends on (`gate()`, `tmacVector()`, the `minTrit`/`maxTrit`/`negTrit`
   ops feeding Direction A's `Verdict` calculus, and `setScale`) are correct and must stay.
2. **The header does not over-claim.** Line 14–15 describes the T-MAC *semantically* ("ternary dot
   product = add / subtract / skip"), which is accurate and is exactly what `tmacVector` implements; it
   does **not** assert instruction-identity with BitNet's SIMD kernel. **Optional, non-urgent:** a
   half-sentence could be added near the header's T-MAC line noting that BitNet's *SIMD* path realizes
   the same operation via a `maddubs` trick on the biased `{0,1,2}` encoding, so a future reader does
   not expect instruction parity. This is a clarity nicety, not a correction — deliberately **not**
   applied here to keep this audit read-only w.r.t. `tpl-simulator.ts`.
3. **Regression test added** (§6) pinning the encoding + packing against a hand-computed golden vector,
   so a future refactor of `ENC_*` / `tritBitShift` / `tmacVector` cannot silently break
   byte-compatibility. Registered in the test suite via the package's `tests/*.test.mjs` glob.

---

## §6 — Golden vector (hand-computed, pinned by the regression test)

The regression test (`packages-galerina/galerina-tower-citizen/tests/tpl-bitnet-fidelity.test.mjs`)
re-implements BitNet's packing math independently and asserts Galerina's backing store matches, byte for
byte. The 16-trit golden vector and its BitNet-packed bytes:

| Byte | Trits (Galerina indices) | Codes `e=w+1` | `(q0<<6)\|(q1<<4)\|(q2<<2)\|(q3<<0)` | Golden |
|---|---|---|---|---|
| 0 | `[-1, 0, +1, +1]` (0–3) | `0,1,2,2` | `(0<<6)\|(1<<4)\|(2<<2)\|(2<<0)` | `0x1A` |
| 1 | `[+1, +1, 0, -1]` (4–7) | `2,2,1,0` | `(2<<6)\|(2<<4)\|(1<<2)\|(0<<0)` | `0xA4` |
| 2 | `[0, -1, -1, 0]` (8–11) | `1,0,0,1` | `(1<<6)\|(0<<4)\|(0<<2)\|(1<<0)` | `0x41` |
| 3 | `[+1, 0, +1, -1]` (12–15) | `2,1,2,0` | `(2<<6)\|(1<<4)\|(2<<2)\|(0<<0)` | `0x98` |

Little-endian `Int32` word = `0x9841A41A`. The test asserts each byte of Galerina's state word equals
the golden, plus: encode/decode round-trips for all three trits; `tmacVector` add/sub/skip × scale
equals a hand-computed result (`[10,20,30,40,50]·[+1,-1,0,+1,-1] = -20`, ×scale 3 = `-60`); a toxic
input traps (`SecurityTrap`); and a planted `0b11` field traps on read (`TPLIntegrityFault`).

---

## Where this sits — the foundation under the photonic/ternary governance work

This audit closes the open question under `notes/33-tmx-non-transfer-evidence.md` §"Where this led" and the R&D agenda: the
governance-layer directions are sound *because the trit they reason about is real*.

- **Direction A** (`galerina-three-valued-governance.md`) — the `Verdict` K3 calculus reuses
  `tpl-simulator`'s `minTrit`(∧)/`maxTrit`(∨)/`negTrit`(¬). Those operate on the **same `{-1,0,+1}`
  trit** this audit confirms is BitNet-faithful (Claim 1). The `ALLOW +1 / DENY -1 / INDETERMINATE 0`
  encoding is the BitNet trit, governed.
- **Direction C** (`galerina-substrate-failure-model.md`) — the noise model perturbs *readings of this
  trit*; `effectiveVerdict = vAnd(ideal, reading)` proves noise costs availability, never safety. That
  guarantee is only meaningful if the trit representation is the genuine article — which Claims 1 & 2
  establish.

The boundary from `notes/31–33` holds: Galerina **governs** the ternary substrate, it does not absorb
it. This audit was a *read-only* check against BitNet; no BitNet code crossed into Galerina, the core
stayed TypeScript, and the only artifacts produced are this record, a golden-vector test, and an index
row.
