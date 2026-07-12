# Defensive Publication — Tri-state z-partitioned graph-index memory layout: a bounded constant-factor cache win, and a refutation of the "O(1) tensor-slice" claim

**Disclosure ID:** DP-RD-0209 · **Date:** 2026-07-01 · **Type:** Prior-art disclosure (defensive) · **Not** a patent claim.
**Provenance:** RD-0209 · analysis `galerina-rd-0209-0217-77mesh-tritopology-graphblas.md` · machine-checkable proof `proofs/rd-0209-proof.mjs` (re-run GREEN).

> **Purpose of this document.** This is a *defensive publication* — a prior-art disclosure whose sole purpose is to place a sound-but-bounded technique, and an explicit refutation of an accompanying over-claim, into the public record so that neither can later be monopolised by a patent. It is **not** a patent application and asserts **no** exclusive rights. Two things are being disclosed: (a) a real, modest, order-preserving cache-layout technique, and (b) the honest, machine-checked bound on that technique — namely that a widely-repeated "O(1) tensor-slice / single clock cycle / disconnected from database size" performance claim built on the same structure is **false**. The honesty *is* the contribution: the disclosure exists as much to stop the false claim being patented as to stop the true-but-narrow one.

---

## 1. Technical field

Data-structure and memory-layout techniques for in-memory graph indexes and sparse adjacency structures, in particular the physical arrangement (cache-line packing, plane/partition assignment, SIMD-friendly masking) of a graph whose edges carry a three-valued (tri-state / ternary) label drawn from `{-1, 0, +1}` — for example `{deny, pending/unknown, allow}` or `{repulsion, neutral, attraction}`. The field also covers the cost analysis (read cost, build/maintenance cost, asymptotic order versus constant factor) of slicing such a structure by its tri-state dimension, and the security discipline governing whether a value read from such an index may participate in an access-control decision.

## 2. Background & problem

A common design move when adding a third logical state to a graph is to promote the 2-D adjacency matrix `A[i,j]` to a 3-D tensor `T[i,j,k]`, where the new `k` ("z") axis selects one of the three tri-state planes. The intuitive appeal is that all edges in a given state — say all *pending* edges, `k = 0` — now live contiguously in their own plane, so "extracting all pending edges" becomes "take the `k = 0` slice."

From this true observation a **false performance claim** is frequently derived and repeated:

> *"The tensor slice `T[i,j,0]` extracts all pending edges in a single clock cycle. It is O(1), disconnected from database size — 100 orders or 100 billion orders take the same nanosecond."*

Two distinct errors are bundled into that sentence:

1. **A cost-model error.** It conflates *"the pending edges are pre-grouped"* with *"reading them is free."* Grouping does not make reading the group free; you still must touch every entry you return, and you must have paid to place every entry where it is.
2. **A security error (in the systems this layout was proposed for).** It invites treating a value read out of the index — e.g. "this cell is `-1`" — as an *admission verdict* ("deny access"), turning an unauthenticated, mutable data cell into an access-control gate.

The problem this disclosure addresses is therefore twofold: to record the *narrow, real* benefit of the layout so it is freely usable, and to record the *machine-checked refutation* of the O(1) claim and the security mis-use so that neither the false speed claim nor the unsound "index-cell-as-gate" pattern can be captured as exclusive intellectual property.

## 3. Prior art (closest existing work, stated honestly)

The disclosed subject matter is a re-dressing and combination of well-established techniques; none of the sound parts is novel, and that is the point. The closest prior art includes:

- **Cache partitioning / page colouring, Intel Cache Allocation Technology (CAT), and CATalyst** — the general principle that physically partitioning data by a class label to keep a hot subset in its own cache region buys a *constant-factor* locality improvement, not an asymptotic change. The tri-state z-partition is an application of exactly this principle to graph-edge state.
- **vLLM PagedAttention** — paged, partitioned physical layout of otherwise-contiguous logical tensors to improve locality and reduce waste; again a constant-factor systems win, not an order reduction.
- **Kunegis et al. (2010) signed Laplacian and signed-graph literature** — the `{-1, 0, +1}` edge labelling and the "−1 = repulsion" reading are textbook signed-graph theory; the label alphabet is not novel.
- **Sparse-matrix / CSR and 2-bit / bit-packed representations, and SIMD bitwise masking** — the mechanism by which per-plane extraction is made fast (mask, gather) is standard SIMD sparse-linear-algebra practice; it lowers the constant.
- **Parameterised queries / prepared statements and the general "data is not code / data is not a decision" discipline** — the security half of this disclosure (an index cell must not *be* the authorisation verdict) is the graph-layout analogue of the long-standing rule that untrusted data must be treated as data, not as an executable or authoritative control signal.
- **ECC memory and Targeted Row Refresh (TRR) / Rowhammer mitigations** — cited as the class of *integrity* mechanisms that would be required before any value read from such an index could be trusted; the disclosed layout, unprotected, is a silent read-redirection surface exactly because a flipped/forged cell is not detected.
- **b-ary search theory** — the accompanying "ternary (O(log₃N)) beats binary (O(log₂N))" claim is the classical b-ary search fallacy; the depth shrinks by the constant `log₃2 ≈ 0.6309` but per-node comparison work rises, for a net **increase** in total comparisons. This is textbook and is included only to mark it as prior art, not invention.

## 4. Summary of the disclosed subject matter

Partitioning an in-memory tri-state graph index by its 2-bit `{-1, 0, +1}` state along a z-axis, with SIMD masking and signed accumulation, is disclosed as a sound, order-preserving, **constant-factor** cache-layout optimisation: pre-grouping each state into its own plane removes the scan of the other two planes when extracting one state. This disclosure simultaneously refutes, with a re-runnable machine proof, the associated claim that slicing this structure is O(1) / a single clock cycle / independent of size: reading a state's slice is **O(#entries in the slice)** and building/maintaining the structure is **O(N) per mutation**; SIMD/z-layout cut the *constant*, never the *order*. It further discloses, as a security bound, that a tri-state index cell must never serve as an admission verdict — admission must remain on a signed capability, and any in-band index must be signature-covered or it is a silent read-redirection surface.

## 5. Detailed description / embodiment (with the key result and the proof numbers)

**Embodiment.** Represent a directed graph on `N` vertices whose edges each carry a tri-state label `k ∈ {NEG = −1, ZERO = 0, POS = +1}`. Rather than one flat adjacency store, maintain three *planes* — one per state — each holding the edge keys with that label, packed 2 bits per state and addressed so that plane membership is a bitmask test. "Extract all edges in state `k`" is then "walk plane `k`," which visits only the entries actually in that state, skipping the other two planes' entries entirely.

**What that buys (the true part).** For a workload dominated by single-state extraction (e.g. sweeping the *pending* set), the per-extraction work drops from *scan-all-edges-and-test* to *walk-one-plane*. With the tri-state roughly balanced across three planes, the saved work is the two planes you no longer scan — a bounded constant factor near 3×, and strictly below the number of planes. SIMD masking further lowers the constant within a plane. Crucially the *result set is unchanged* and the extraction remains linear in the entries returned.

**What it does not buy (the refuted part — the key maths result).** Let the pending fraction be `1/3` and build the tensor for `N ∈ {1000, 10000, 100000}` with a fixed out-degree. The proof measures three quantities directly:

- **Build/maintain cost is O(N), not O(1).** Total structure writes scale **15,952 (N = 10³) → 1,600,000 (N = 10⁵)** — a strictly linear growth across the 100× size jump. Every entry must be *placed* into its plane; the plane structure is a *precompute*, and the precompute cost is paid in full and grows with the data. Slicing is only "instant" because the linear work was done earlier, not because it vanished.
- **Read of a state slice is O(#slice), not one clock cycle.** The largest pending slice at `N = 10⁵` required **265,348 touches, not 1**. You cannot enumerate a quarter-million pending edges in one cycle; the read is linear in the size of the slice you return.
- **The z-partition win is a bounded constant, not an order change.** Measured against a flat scan of all edges, the z-partition gave a **3.01× speedup — below the 4× ceiling and independent of an asymptotic improvement**. The tensor merely removes the other-plane scan; both the partitioned and flat readers remain O(#entries).

Two further textbook checks accompany the result: enumerating all 2-simplices over the vertices is ~`C(N,3) ~ N³/6` (super-linear, not O(1)); and the ternary-tree depth advantage is exactly `log₃2 ≈ 0.6309×` the binary depth but with **~1.262× total comparison work**, i.e. a net loss — the b-ary fallacy, machine-confirmed.

**The security embodiment (the deny-only / never-a-gate bound).** In the systems for which this layout was proposed, it is disclosed that a tri-state index cell may act *only* as an advisory **pre-filter that can narrow or deny a candidate set**, and **never** as the affirmative admission gate. Concretely: "escrow state = −1 instantly drops the whole geometric surface" — making an index cell the access decision — is unsound, because a forged or bit-flipped cell would then admit or deny with no secret in the loop. Admission must remain bound to a signed capability (in this corpus, a signed `.fungi` capability); and any index carried in-band with that capability must be covered by its signature, or the index is a silent read-redirection surface (an attacker who flips a cell reroutes reads without detection). A deny produced by the pre-filter is acceptable *only* as an early-out that a subsequent keyed check would also have produced; it is never itself the reason access is granted.

## 6. Honest limitations & scope (what this does NOT do)

- **Constant-factor, not order.** The layout improves a constant (measured 3.01×, ceiling < 4× for three planes). It does **not** change asymptotic complexity. Any claim of O(1), "single clock cycle," "same time for 100 or 100 billion rows," or "disconnected from database size" is false and is expressly refuted here.
- **Read is O(#slice).** Extraction is linear in the number of entries returned. A large state set costs proportionally to its size.
- **Build/maintain is O(N) per mutation.** The plane structure is a **precompute trade**: fast slicing is bought by linear placement work done up front and re-paid on every mutation. It is not free maintenance.
- **SIMD/photonics/2-bit packing cut only the constant.** These accelerate within the same order; they never convert O(N) into O(1). (Re-derives the constant-only findings of RD-0036/0156/0157/0166.)
- **Deny-only pre-filter, never an admission gate.** A tri-state index cell may narrow or reject a candidate set but must **never** be the affirmative reason access is granted. Admission stays on the signed capability. Treating a cell as the verdict is a fail-open (a fresh instance of the RD-0169 class).
- **Forgeable if misused / integrity-gated.** An unsigned in-band index is a silent read-redirection and poisoning surface: a flipped or forged cell reroutes reads or flips a filter with no detection. The layout is only safe when the index is signature-covered (or otherwise integrity-protected, cf. ECC/TRR for the hardware analogue). This is a HW/OS/crypto-gated property, not a property of the layout alone.
- **Nothing net-new.** The sound residue re-derives already-shipped work (Ternary-CSR, 2-bit packing, branchless trit-gate, graph-as-index security shape); the disclosure's value is the recorded *bound and refutation*, not a new mechanism.

## 7. Illustrative disclosure claims (defensively broad, but true)

These are disclosed **embodiments placed in the public record as prior art**; they assert no exclusive right and are worded to be true under the machine proof of §8.

1. **A method** wherein an in-memory graph index whose edges carry a three-valued label `{-1, 0, +1}` is partitioned into three physical planes, one per label, such that extracting all edges of a single label walks only that label's plane and skips the other two, yielding a **bounded constant-factor** reduction in touched entries (empirically ~3×, strictly below the plane count) while leaving the asymptotic read cost at O(#entries returned).

2. **A method** as in claim 1 wherein the per-plane entries are packed at 2 bits per state and plane membership is tested by SIMD bitwise masking with signed accumulation, reducing the *constant* factor of extraction without altering its order.

3. **A method** wherein the cost of the structure of claim 1 is characterised, and disclosed to the public, as: read of a single-label slice is O(#entries in that slice); build and per-mutation maintenance of the partitioned structure is O(N); and no operation on the structure is O(1) or size-independent — such that any assertion of single-clock-cycle or database-size-independent slicing is disclosed as false.

4. **A method** wherein a value read from the tri-state index of claim 1 is used **only** as an advisory pre-filter that may narrow or deny a candidate set, and is **never** used as the affirmative admission verdict, with admission instead bound to a cryptographically signed capability.

5. **A method** as in claim 4 wherein the tri-state index, when carried in-band with the signed capability, is covered by that capability's signature, so that a forged or bit-flipped index cell is detected rather than silently redirecting reads or flipping a filter outcome.

6. **A method** wherein a claimed asymptotic advantage of a ternary (radix-3) search or index tree over a binary one is disclosed as false: the tree depth is reduced by the constant `log₃2 ≈ 0.6309` but total comparison work rises by ~1.262×, for a net increase — so radix-3 partitioning is disclosed as offering no asymptotic search advantage.

## 8. Machine-checkable evidence

**Proof artifact:** `proofs/rd-0209-proof.mjs` (Node built-ins only; `node:assert`). The proof asserts the O(1)/single-clock-cycle over-claim **FALSE** and the corrected cost model **TRUE**, across five checks:

- **A (T1) — Build/maintain is O(N), not O(1):** structure writes grow strictly linearly, **15,952 (N = 10³) → 1,600,000 (N = 10⁵)** across a 100× size jump (asserts write-ratio > 5 per 10× step; asserts *not* O(1)).
- **B (T2) — Read slice is O(#slice), not one cycle:** largest pending slice = **265,348 touches, not 1** (asserts touches scale > 5× per 10× step and every touch is a real entry).
- **C (T3) — Z-partition is a bounded constant win:** partitioned vs flat-scan speedup = **3.01×**, asserted `> 1 and < 4` (a constant factor, not an order change); both readers remain linear.
- **D (T4) — Simplicial enumeration is super-linear:** one 2-simplex covers 3 fixed vertices (`C(3,3)=1`), but all 2-simplices ~ `C(N,3) ~ N³/6`, asserted super-linear (`C(1000,3)/C(100,3) > 100`).
- **E (T5) — Ternary is no free lunch:** depth factor `log₃2 = 0.6309` (asserted), total comparison work `≈ 1.262×` binary, asserted `> 1` (net *more* work).

**GREEN result line (re-run 2026-07-01):**

```
=== RD-0209 PROOF: 3D tri-state tensor index / O(1) slice ===
T1 build writes: N=1e3 15952 -> N=1e5 1600000 (O(N), not O(1))
T2 pending slice touches: N=1e5 = 265348 (O(#slice), not 1)
T3 z-partition vs flat scan speedup = 3.01x (bounded constant < 4)
T4 2-simplex face = 1; all 2-simplices ~ C(N,3) ~ N^3/6 (super-linear)
T5 ternary depth x0.6309; total comparisons x1.262 (>1)
VERDICT: O(1)/single-clock-cycle REFUTED. READ=O(#slice), BUILD=O(N).
Tri-state-as-Z-axis = sound LAYOUT (constant factor). Re-derives RD-0157/0036/0166.
ALL ASSERTIONS PASSED (overclaim asserted-FALSE, corrected model asserted-TRUE).
```

The proof exits 0 with all assertions passing. It confirms the corrected cost model (read O(#slice), build O(N), z-partition a bounded constant < 4×) and refutes the O(1)/single-clock-cycle/size-independent claim, re-deriving the constant-only findings of RD-0036/0156/0157/0166.

---

*This defensive publication is released as prior art. It asserts no exclusive rights and is intended to prevent the disclosed technique, its honest cost bound, and the refutation of the associated over-claims from being monopolised.*
