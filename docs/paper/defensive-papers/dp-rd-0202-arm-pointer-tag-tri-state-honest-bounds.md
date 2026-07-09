# Defensive Publication — Packing a ternary capability state into an ARM top-byte-ignore pointer tag: a deny-only pre-filter with honest bounds (not a 2x speed-up, not authentication)

**Disclosure ID:** DP-RD-0202 · **Date:** 2026-07-01 · **Type:** Prior-art disclosure (defensive) · **Not** a patent claim.
**Provenance:** RD-0202 · analysis `galerina-rd-0200-0208-77mesh-tristate-meshql.md` (RD-0202 section) · machine-checkable proof `proofs/rd-0202-proof.mjs` (re-run GREEN).

> **Purpose of this document.** This is a defensive publication: it places the sound technique — and, just as importantly, the *honest bounds* on that technique — into the public domain as prior art. The goal is **not** to claim a patent; it is to ensure that neither the technique nor the refuted overclaims around it can be monopolised, and to put the corrected numbers on record so downstream implementers are not misled. Where the underlying R&D note made stronger claims (a 2x traversal speed-up, halved bandwidth, single-cycle denial, and the pointer tag as a security decision), those claims are **refuted here** by a re-runnable proof, and the refutation is treated as part of the contribution.

---

## 1. Technical field

Software-defined pointer tagging on 64-bit ARM (AArch64) using the **Top-Byte-Ignore (TBI)** feature, applied to the edge pointers of an in-memory graph / mesh database. Specifically: encoding a small **ternary capability posture** (a K3 tri-state: `+1` allow-hint / `0` unknown / `−1` deny) into the otherwise-ignored top byte of a graph edge pointer, and using that in-register byte as a **deny-only pre-filter** in front of a cryptographically signed capability check during graph traversal / access-control routing.

The field spans: ARM AArch64 memory-tagging features (TBI and, separately, MTE), in-memory graph traversal cost models, and zero-trust admission control (the distinction between a routing *hint* and an authorization *verdict*).

## 2. Background & problem

A graph/mesh database that enforces per-edge access control conceptually performs two things at each traversed edge: (a) load the neighbour **pointer** `P` to know where to go, and (b) consult a **permission / ACL** record to decide whether traversal is allowed. In a naive model these are two separate memory accesses.

AArch64's TBI feature causes the CPU to **ignore the top 8 bits** (bits 56–63) of a virtual address when it dereferences a pointer. Those 8 bits are therefore free for software to use as a tag that rides along inside a pointer value the program was going to load anyway. The tempting idea: pack an access-posture byte into that top byte so that the permission posture is *already in the register* the instant `P` is loaded — no separate ACL fetch, and a denial can be taken by a single in-register shift-and-compare.

The problem this disclosure addresses is twofold:

1. **What is actually true and reusable** about riding a ternary posture in the TBI top byte, stated with an honest cost model; and
2. **Which of the natural-sounding claims are false or dangerous** — namely that this "doubles traversal speed", "halves memory bandwidth", "denies in a single clock cycle", or constitutes an *authentication* / admission decision. Each of those, left unchallenged, would be an attractive but unsound monopolisable claim and a security footgun. This document refutes them with machine-checked arithmetic and a runnable forgery.

## 3. Prior art (nearest existing work, stated honestly)

This disclosure does **not** claim novelty over the following. It is published precisely so that the *combination* and its *honest bound* are prior art, not a private claim.

- **ARM TBI (Top-Byte-Ignore) and MTE (Memory Tagging Extension).** Both are documented, open-silicon AArch64 features usable from mainline GCC/LLVM with no license. TBI provides 8 software-defined, **hardware-unchecked** ignored bits (a pure software convention / HINT). MTE provides a **4-bit** (16-colour) tag that the hardware lock/key-checks on access as a memory-safety aid. These are distinct features and must not be conflated (see §6).
- **Hardware/partition-level QoS and cache control** — Intel **CAT** (Cache Allocation Technology), page-colouring, and research systems such as **CATalyst** — establish the general practice of steering/partitioning memory behaviour via low-level tags/attributes. Riding metadata alongside memory addressing is well-trodden ground.
- **Paged / block-indexed memory management for graph & attention workloads** — e.g. **vLLM PagedAttention** — establishes indexing large structures via compact handles rather than repeated full-record fetches; the "carry a small tag with the handle" idea is not new.
- **Signed graph theory** — e.g. **Kunegis' signed Laplacian** — establishes ternary/signed edge semantics (`+1 / 0 / −1`) on graph edges as prior art for the *tri-state* itself.
- **Parameterised / prepared queries** — the canonical prior art for "carry the sensitive value as *data*, and make the real decision on a trusted path", which is exactly why the pointer-tag hint must sit in front of, not replace, the signed capability.
- **ECC / TRR and other Rowhammer mitigations** — prior art for the general principle that an in-band, attacker-influenceable bit pattern must not be trusted as an integrity/authorization guarantee without an independent check.
- **b-ary (radix) search theory** — establishes that changing the branching *constant* (e.g. binary → b-ary) reduces a constant factor / log base but does not change asymptotic order; the direct analogue of "the tag cuts the constant, not the O()".

Against that backdrop, the only arguably net-new framing here is the specific use of the **TBI top byte to carry a K3 tri-state as a per-edge deny-only ACL-fetch-elision pre-filter** — and even that is disclosed **with its honest ceiling**, not as a performance or security breakthrough.

## 4. Summary of the disclosed subject matter

A ternary capability posture can be packed into the ignored top byte of an AArch64 graph edge pointer such that the byte is recovered by `S = P >> 56` and the usable address by `addr = P & 0x00FFFFFFFFFFFFFF`, and this round-trips exactly for all 256 top-byte values. Used soundly, the tag is a **deny-only pre-filter**: a `−1` (`0xFF`) top byte lets a traversal fast-reject before any ACL work, while `0`/`+1` **never** grant access on their own — the real admission decision remains on a separately signed capability. The honest bounds are that this is a **constant-factor** micro-optimisation (measured ~1.14x on a full-edge cost model, ~1.02x once the small ACL line is cached), that both the tagged and untagged traversals remain **O(E)**, and that the tag is a **plaintext, unauthenticated hint with zero unforgeability** — so it must never be an admission gate.

## 5. Detailed description / embodiment (with the key result and the actual numbers)

### 5.1 Bit layout (CLAIM 1 — verified)

Given a 64-bit pointer `P` whose usable address occupies the low bits:

```
S    = P >> 56                       # top byte = the ternary posture (0..255)
addr = P & 0x00FFFFFFFFFFFFFF        # low 56 bits = the address the CPU actually uses
```

The K3 posture is encoded as three of the 256 byte values:

```
+1 (ALLOW-hint) = 0x01
 0 (UNKNOWN)    = 0x00
-1 (DENY)       = 0xFF
```

The proof constructs `P = (stateByte << 56) | addr` and checks that `S` recovers `stateByte` and `addr` recovers the address **for the full byte range** (it exercises `0x00, 0x01, 0x7F, 0x80, 0xFF`), confirming an exact round-trip for all 256 top-byte values, and that TBI's "top byte" is exactly bits 56–63 (8 bits). **This layout is correct.**

> **Address-width caveat (disclosed, not hidden):** plain TBI ignores the top **8** bits, but the OS/hardware uses the bottom ~48 bits (up to 52 with Large-VA) to address RAM. Bits 52–55 are **not** unconditionally free — on hardware that addresses more than 48 bits, a naive 56-bit address field can collide with translation. An implementation must confine the tag to genuinely-ignored bits for its target hardware.

### 5.2 The key maths result — constant factor, not order (CLAIM 2)

The R&D note claimed the tag "saves an entire memory lookup per edge, doubling traversal speed" and "cuts memory bandwidth for security routing in half". That is true **only** inside a degenerate model where each edge does exactly one separate, equally-costly ACL fetch and nothing else:

- baseline = 2 fetches (pointer `P`, then a separate ACL record) → tagged = 1 fetch (tag rides inside `P`)
- best-case bandwidth ratio = **0.5**, best-case step speedup = **2.0** — but only for that isolated, ACL-fetch-dominated sub-step.

Once a **realistic full-edge cost model** is used, the separate ACL fetch is only **1 of 8** per-edge memory operations (node header, colidx, payload cache-line, embedding, misc + the ACL). Then:

```
total_baseline / total_tagged = 8 / 7  ≈  1.14x        # NOT 2x
```

And because an ACL record is small, hot, and shared across millions of edges, it is typically cache-resident. Modelling a 98%-cached ACL line, the separate fetch costs ~2%, so removing it yields:

```
cached speedup  ≈  1.02x   (~2%)                        # NOT a 50% saving
```

**Order check (the load-bearing result):** both the tagged and untagged traversals cost `E × perEdge` and are therefore **O(E)** regardless of `E` (the proof verifies the ratio is scale-invariant across `E = 10^3, 10^6, 10^9`). **The tag cuts the constant, never the order.** This is the same constant-vs-order result recorded in the related RD-0154 / RD-0166 work.

### 5.3 The one-cycle-denial claim (CLAIM 3)

The in-register `S = P >> 56; cmp −1` is indeed ~1 cycle. But seeing the tag at all required `P` to be **loaded** — tens to hundreds of cycles on a DRAM miss (modelled at ~200). A cold denial is dominated by that load, not by the shift/compare. "Drops the packet in a single clock cycle" is therefore misleading for any pointer that was not already resident.

### 5.4 The security result — the tag is a HINT, not a verdict (CLAIM 4)

This is the most important honesty bound. The tag is a **plaintext byte inside a pointer**. Anyone who can author the pointer can set the byte to `+1`. There is no secret, no signature — it is **forgeable with zero unforgeability**. The proof runs the forgery:

```
legitDeny = (0xFF << 56) | addr          # a real DENY pointer
forged    = (0x01 << 56) | (legitDeny & MASK56)   # attacker flips the top byte to ALLOW
admitByTagOnly(forged) == true           # FORGERY: admitted with NO secret
```

Trusting the byte as an admission decision is **fail-open**, in the exact same class as the RD-0169 `tri_state_vector` and the RD-0162/0164/0165 ternary-dot-product forgeries.

**Sound composition (deny-only, verified):** the tag may be used *only* as a deny-only pre-filter ANDed in **front** of the signed `.fungi` capability:

```
admitSound(P, signedCapValid):
    if (P >> 56) == 0xFF:  return false     # deny-only fast reject (a false-DENY is safe)
    return signedCapValid                    # the REAL decision is on the SIGNATURE
```

The proof confirms: the forged `+1` no longer buys admission (`admitSound(forged, false) == false`), a real DENY still fast-rejects even alongside a valid cap, and a clean pointer admits **only because the signed capability validated**. The deny-only direction is safe because its worst-case failure (a spurious DENY) removes access, never grants it.

### 5.5 WASM cannot do this natively (CLAIM 5 — confirmed)

wasm32 linear memory is a **flat 4 GiB byte array** indexed by 32-bit offsets that are significant in full — there is no 64-bit tagged pointer and no top-byte-ignore semantics, so there is no spare high byte to carry a tag. TBI is a 64-bit AArch64 feature; realising this technique requires native AArch64 (not a portable wasm sandbox path).

## 6. Honest limitations & scope (what it does NOT do)

- **Hardware / ISA-gated.** Requires native AArch64 with TBI. Not available in wasm32 (§5.5), and not portable across ISAs without a fallback that stores the posture elsewhere.
- **Constant factor, not order.** The best honest figure is **~1.14x** on a full-edge model and **~1.02x** with a hot cached ACL. Both paths are **O(E)**. This is **not** a 2x speed-up and **not** a halving of overall bandwidth — those hold only for an isolated, ACL-fetch-dominated sub-step.
- **Not a single-cycle denial in general.** The 1-cycle shift/compare presupposes `P` is already resident; a cold deny is dominated by the ~200-cycle pointer load.
- **Detect / pre-filter, never an admission gate.** The tag is a **plaintext, unauthenticated, mutable posture byte with zero unforgeability**. A forged `+1` is admitted with no secret (§5.4). It MUST be used **deny-only**, ANDed in front of a signed capability; it MUST NEVER be the sole authorization verdict. Its only safe grant-direction is DENY.
- **TBI is not MTE.** TBI gives **8 software-defined, hardware-UNCHECKED** bits (a hint). MTE gives **4 hardware-checked** tag bits (16 colours) as a memory-safety aid — it cannot hold an arbitrary 8-bit capability, and its check is a memory-safety lock/key, not a capability authorization. Conflating them overstates the security posture; this disclosure keeps them separate.
- **Address-width fragility.** The 56-bit address field can collide with translation on hardware that addresses more than 48 bits (§5.1); the usable tag width depends on the target's actual VA width.
- **Wire-crossing exposure.** If the tagged pointer ever leaves the local address space (crosses a wire), the tag is plaintext and observable/mutable; it provides no confidentiality and no integrity by itself.
- **Not novel in most parts.** The tri-state, the pointer-tagging practice, and the constant-vs-order result are all prior art (§3). The disclosure's value is the honest bound on the specific combination, not a breakthrough.

## 7. Illustrative disclosure claims (defensively broad but TRUE)

These are published as disclosed embodiments to establish prior art. They are deliberately worded to be **true**, including their limitations.

1. **A method** wherein a ternary access-posture value (`+1` / `0` / `−1`) is encoded into the top byte of a 64-bit AArch64 graph edge pointer such that the posture is recovered by an arithmetic right-shift `S = P >> 56` and the usable virtual address by `addr = P & 0x00FFFFFFFFFFFFFF`, the encoding round-tripping exactly for all 256 top-byte values, relying on the AArch64 Top-Byte-Ignore feature so the tagged pointer dereferences to the same address as the untagged pointer.

2. **A method** as in claim 1 wherein, during graph traversal, a top-byte value denoting `−1` (deny) is used as a **deny-only pre-filter** that fast-rejects an edge **before** any separate access-control-list fetch, while top-byte values denoting `0` or `+1` are treated **only** as non-authoritative hints and never, by themselves, grant traversal.

3. **A method** as in claim 2 wherein the actual admission decision for a non-denied edge is taken on a **separately signed capability** (e.g. a signed `.fungi` capability), the top-byte hint being logically ANDed **in front of** that signed check, such that a forged or attacker-set top byte cannot manufacture an admission that the signed capability does not independently grant.

4. **A method** as in claim 1 wherein the per-edge saving from eliminating a separate access-control fetch is disclosed as a **constant-factor** optimisation only — measured at approximately **1.14x** on a full-edge memory-cost model and approximately **1.02x** when the access-control record is cache-resident — with both the tagged and untagged traversal remaining **O(E)** in the number of edges; and wherein no claim is made of doubling traversal speed, halving overall memory bandwidth, or single-cycle denial in the general (cache-cold) case.

5. **A method** as in claim 1 wherein the top-byte hint is expressly characterised as a **plaintext, unauthenticated, forgeable** value carrying **zero unforgeability**, distinct from the AArch64 Memory Tagging Extension (which provides 4 hardware-checked tag bits / 16 colours as a memory-safety aid), such that the top-byte hint is confined to a detection / deny-only role and is never relied upon as an authentication or sole authorization mechanism.

6. **A system** implementing any of claims 1–5 on native AArch64, wherein the technique is disclosed as unavailable in a wasm32 linear-memory sandbox (which lacks a tagged 64-bit pointer and any top-byte-ignore semantics) and therefore requires a non-wasm native execution path.

## 8. Machine-checkable evidence

**Proof:** `proofs/rd-0202-proof.mjs` — Node built-ins only (`node:assert/strict`), re-runnable, no external dependencies. It **asserts-FAIL the overclaims** ("doubles speed", "halves bandwidth", "single clock cycle", tag-as-security) and **asserts-PASS the corrected values** (constant-factor at best; tag is a forgeable hint, safe only as a deny-only pre-filter in front of a signed capability).

Checks:

- **Check A — bit-packing layout (CLAIM 1):** `S = P >> 56` and `addr = P & 0x00FFFFFFFFFFFFFF` round-trip for all 256 top-byte values; TBI ignores bits 56–63 (8 bits). Records the caveat that TBI's 8 unchecked software bits ≠ MTE's 4 hardware-checked bits (16 colours).
- **Check B — "doubles speed / halves bandwidth" (CLAIM 2):** best-case 0.5 bandwidth ratio / 2x speedup holds **only** for the isolated ACL sub-step; full-edge model gives **~1.14x**, hot-cached ACL gives **~1.02x**; both paths verified **O(E)** by scale-invariance across `E = 10^3, 10^6, 10^9`. Refutes "doubling traversal speed".
- **Check C — "single clock cycle" deny (CLAIM 3):** the shift/compare is ~1 cycle, but a cold deny is dominated by the ~200-cycle pointer load that surfaced the tag.
- **Check D — tag-as-admission forgery (CLAIM 4):** runs a forgery in which an attacker-set `+1` top byte is admitted with **no secret** (fail-open), then shows the sound `admitSound` deny-only composition in front of the signed capability rejects the forgery.
- **Check E — WASM cannot do TBI natively (CLAIM 5):** wasm32 is a flat 32-bit index with no tagged 64-bit pointer and no TBI/SME opcodes; requires native AArch64.

**GREEN result line (from a re-run on 2026-07-01):**

```
================ VERDICT (machine-checked) ================
bit layout round-trips (OK), but note conflates TBI[8 unchecked SW bits] with MTE[4 HW-checked tag bits].
"doubles traversal speed": REFUTED -> ~1.14x full-edge (~1.02x with a hot ACL); constant-factor, stays O(E).
"halves bandwidth": only for the isolated ACL sub-step in an ACL-dominated model; ~2% once cached.
"single clock cycle deny": ignores the pointer load that surfaced the tag.
tag as admission: REFUTED (runnable forgery, no secret) -> DENY-ONLY pre-filter in front of signed .fungi cap.
WASM cannot do TBI/SME natively: CONFIRMED.
ALL ASSERTS PASSED.
```

**Re-run:** `node proofs/rd-0202-proof.mjs` (exit status 0, `ALL ASSERTS PASSED.`).

---

*This defensive publication is released to establish prior art. The sound technique (a deny-only ternary pre-filter in the TBI top byte, in front of a signed capability) and its honest bounds (constant-factor ~1.14x / ~1.02x, O(E) unchanged, forgeable hint — never an authentication or admission gate) are hereby placed in the public domain and may not be monopolised.*
