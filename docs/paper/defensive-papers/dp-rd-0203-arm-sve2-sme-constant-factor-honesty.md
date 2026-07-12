# Defensive Publication — ARM SVE2/SME and weak memory ordering for graph/GraphBLAS: a constant-factor lane, not an order change (disclosure of the honest ceiling)

**Disclosure ID:** DP-RD-0203 · **Date:** 2026-07-01 · **Type:** Prior-art disclosure (defensive) · **Not** a patent claim.
**Provenance:** RD-0203 · analysis `galerina-rd-0200-0208-77mesh-tristate-meshql.md` (§ "RD-0203 — ARM SVE2 + SME + weak memory ordering") · machine-checkable proof `proofs/rd-0203-proof.mjs` (re-run GREEN, `ALL ASSERTIONS GREEN`).

> **Purpose.** This document is published to establish public prior art. Its aim is *not* to claim a novel invention but to place an **honest performance and security ceiling** on record so that (a) the genuinely sound engineering technique cannot be later monopolised by a patent, and (b) the specific overclaims that ride alongside it (an "exponential" SME speedup, "linear" 128-core scaling, and a pointer-tag admission gate) are documented as **refuted**, with a re-runnable proof, before anyone builds a security control on top of them. The contribution here *is* the bound and the refutation — not a speedup.

---

## 1. Technical field

Hardware-accelerated execution of graph and sparse-linear-algebra workloads on ARM/AArch64 processors, specifically: (i) the ARM Scalable Vector Extension 2 (SVE2) vector-length-agnostic (VLA) programming model as applied to a trit-packed compressed-sparse-row ("T-CSR") filter/traversal kernel; (ii) the ARM Scalable Matrix Extension (SME) 2-D outer-product tile engine as applied to the GraphBLAS semiring product `C ← C ⊕ (A ⊗ B)` and to dense/sparse matrix multiply; (iii) the AArch64 weak (relaxed) memory-ordering model and Top-Byte-Ignore / Memory-Tagging-Extension (TBI/MTE) pointer-tagging feature as applied to lock-free concurrent access and to admission decisions in a zero-trust data mesh. The field spans both the **performance** question (what is the true asymptotic and constant-factor effect of these features) and the **security** question (whether any of these features may serve as an admission/authorization gate).

## 2. Background & problem

Graph databases and GraphBLAS-style semiring engines are memory-bound, branch-heavy workloads. ARM's recent SIMD/matrix extensions are frequently advertised — in vendor material and in internal design notes — with language suggesting an **order-of-complexity** improvement: that SME makes a matrix product "exponentially faster," that lock-free access "scales linearly across 128 cores," and that a pointer's tag byte or a node's health state can be consulted to "fetch instantly" (i.e. admit a request) without a cryptographic check.

The problem this disclosure addresses is that **these three claims are false or unsafe as written**, yet they are attractive enough to be designed into a product where they would either (a) mislead capacity planning by promising super-linear scaling that the hardware cannot deliver, or (b) — the load-bearing danger — become a **fail-open admission gate**, where an attacker who can write a pointer tag byte or spoof a health signal is admitted **with no secret**. A defensive publication is warranted because the *sound* residue of these claims (SVE2 VLA fat-binaries; the Apache-2.0 GraphBLAS lane; stale-read-as-Unknown *when* used as a downgrade) is real and useful, and should remain in the public domain rather than being patent-fenced, while the *unsound* residue must be recorded as prior-art-refuted so no one relies on it.

## 3. Prior art (stated honestly)

This disclosure claims **no novelty** over the following. Each item is named because the RD-0203 result either *re-derives* it (and so is not new) or *depends on* it (and so must credit it):

- **ARM SVE2 vector-length-agnostic ISA.** The property that a single binary runs unchanged across implemented vector lengths of 128…2048 bits (multiples of 128, 16 discrete lengths), with lane count = VL / element-width, is a documented ISA feature (ARM Architecture Reference Manual, SVE/SVE2). The COMPACT/MATCH instructions accelerating a filter are likewise ISA-standard. **We add nothing to the ISA;** we only pin the *effect* to a constant factor.
- **ARM SME (Scalable Matrix Extension) outer-product tile engine.** The `ZA` tile and outer-product FMA are documented ARM features. The relevant fact — that a tile batches MACs, it does not delete them — is arithmetic, not invention.
- **SuiteSparse:GraphBLAS (Davis et al.), Apache-2.0.** A mature, permissively-licensed C implementation of the GraphBLAS specification. Licensing is a checked fact, not a contribution.
- **Amdahl's Law (Amdahl, 1967).** The bound `S(p, cores) = 1 / ((1−p) + p/cores)` on parallel speedup. We apply it unchanged.
- **Kleene three-valued logic / signed ternary min-gate.** The use of AND = `min` over `{ALLOW=+1, UNKNOWN=0, DENY=−1}` as a monotone downgrade-only composition is standard three-valued (strong Kleene) logic; the signed-Laplacian / signed-network intuition (Kunegis et al.) is adjacent prior art for the −1/0/+1 encoding. We reuse it; the safety argument `min(0, v) ≤ 0` is elementary.
- **Fail-open telemetry-as-verdict anti-pattern (internal RD-0169; general zero-trust / NIST SP 800-207 tenet that access is granted per-request on evaluated policy, never on observable state alone).** That health/topology/tag telemetry must not become a security verdict is *prior* internal art; RD-0203 re-derives it in the pointer-tag setting.
- **Branchless-SIMD constant-factor result (internal RD-0157, ~4.3× bandwidth-bound; cache result RD-0166; O()-invariance rule RD-0036/0156).** The finding that SIMD/SME move the constant, not the order, is already binding internal prior art; this disclosure is consistent with and re-confirms it, it does not supersede it.
- **Rowhammer / ECC / TRR mitigations, page-colouring / Intel CAT / CATalyst, vLLM PagedAttention, parameterised queries, b-ary search theory** — named for completeness as the broader family of "hardware feature repurposed for isolation/perf/security" work; none of them is improved upon here, and none makes a constant-factor look like an order change.

Against all of the above, the *only* thing this document contributes is the **explicit, machine-checked ceiling**: what these features do and — more importantly — what they do **not** do.

## 4. Summary of the disclosed subject matter

Disclosed is the finding, with a re-runnable proof, that ARM SVE2/SME and AArch64 weak memory ordering deliver at most a **bounded constant-factor** improvement to graph/GraphBLAS kernels and change **no** asymptotic order: an SVE2 VLA fat-binary spans 128…2048-bit lanes for a **≤ 16×** ideal (in practice ~4.3×, bandwidth-bound) constant while the T-CSR filter stays **Θ(N)**; an SME 16×16 tile is a **flat 256×** constant with the matrix product remaining **O(n³)** dense / **O(n·nnz)** sparse — refuting "exponentially faster"; lock-free 128-core scaling is **Amdahl-capped** (1% serial ⇒ 56.4×, not 128×) and is an *availability*, not a *security*, property; and a scheme that admits a request on a pointer-tag byte `S = P >> 56 == +1` is **fail-open** (an attacker writes the tag with no secret), whereas admission must stay keyed on a signed `.fungi` capability with the tag demoted to a deny-only hint. SuiteSparse:GraphBLAS is Apache-2.0 and may be adopted as the engine.

## 5. Detailed description / embodiment (with the key maths and the proof's actual numbers)

### 5.1 SVE2 VLA fat-binary — TRUE, but a constant (proof CLAIM 1)

A single SVE2 binary is vector-length-agnostic across the 16 implemented lengths
`VL ∈ {128, 256, 384, 512, 640, 768, 896, 1024, 1152, 1280, 1408, 1536, 1664, 1792, 1920, 2048}` bits (each a multiple of 128, min 128, max 2048). For a T-CSR filter over `N` 8-bit trit-packed elements, lanes-per-instruction = `VL/8` and instruction count = `⌈N / (VL/8)⌉`. The speedup versus a 128-bit baseline is **exactly `VL/128`** — a constant factor, order unchanged. The proof fixes `N = 2048·8·1000` (divisible by every `VL/8`, so ratios are exact) and asserts the 2048-bit speedup = **16×** constant. Critically, the work stays **Θ(N)**: doubling `N` doubles the instruction count at every VL (`instr(2N)/instr(N) = 2`). One binary, portable across all 16 lane widths, is a genuine engineering win — but a bounded constant, never a reduction in order.

### 5.2 SME "exponentially faster" — REFUTED (proof CLAIM 2, the key result)

An SME outer-product tile of side `r` accumulates `r·r` products per step but performs the **same total MAC count** as scalar. The proof encodes `smeTiledCost(n,r) = ⌈n/r⌉³·(r·r·r)` and asserts it **equals** `naiveMatmulCost(n) = n³` for `n ∈ {64,128,256,512}` at `r = 16` — SME batches MACs, it does not delete them. The scalar-over-SME speedup is therefore the **flat tile area** `r² = 256×` for a 16×16 tile, and the proof confirms it is **constant across `n ∈ {64,128,256,512,1024}`**: the ratio `speedup(1024)/speedup(64) = 1` (exactly), which is the machine-checkable refutation of "exponential" (an exponential speedup would need this ratio ≫ 1). The order is preserved: `naiveMatmulCost(256)/naiveMatmulCost(128) = 8`, i.e. **O(n³)** — doubling `n` multiplies work by 8 at any tile size. **Key number: 256× flat constant, O(n³) intact.** The corresponding GREEN line:

```
CLAIM 2 SME       : "exponentially faster" REFUTED — same MAC count, flat 256x constant (16x16 tile); matmul stays O(n^3). Order UNCHANGED. PASS(corrected)
```

### 5.3 Weak-memory stale-read-as-0 — SOUND ONLY as a min-downgrade (proof CLAIM 3a)

Under the signed ternary calculus `K3 = {ALLOW:+1, UNKNOWN:0, DENY:−1}` with AND = `vAnd(a,b) = min(a,b)` and `authorize(s) = (s === +1)`, a stale/pending concurrent read resolved to `UNKNOWN(0)` and ANDed with the true signed verdict `v` yields `min(0, v) ≤ 0` for **all** `v` — so a stale read can **never** launder to ALLOW; it can only DENY (fail-closed). The proof checks `vAnd(0, DENY) = DENY` and `vAnd(ALLOW, 0) = UNKNOWN ≠ ALLOW`. This is the one safe reading of "resolve stale reads as 0," and it is safe **only** because 0 is a downgrade, not a bypass.

### 5.4 Pointer-tag admission — FAIL-OPEN (proof CLAIM 3b, the load-bearing defect)

The note's Phase-2 model `S = (P >> 56) & 0xFF; admit iff S == +1` makes the **pointer-tag byte the admission verdict** with no secret checked. The proof exhibits a runnable forgery: `forged = (1 << 56) | 0xDEADBEEF` (attacker simply writes the top byte to +1) is **admitted** exactly like a legitimate capability — `admitByTagOnly(forged) === true`. This is the RD-0169 class defect: telemetry/tag state used as a security verdict is forgeable and therefore fail-open. The corrected embodiment `admitCorrect(signedOk, tag)` computes `signedVerdict = signedOk ? ALLOW : DENY` (from an Ed25519 / ML-DSA `verify()` over the `.fungi` capability), treats the tag as at most a non-objecting deny-only hint, and returns `authorize(min(signedVerdict, tagHint))` — so **both** must be ALLOW and the tag can only subtract. The proof confirms: no valid signature ⇒ DENY **even with a +1 tag** (forgery blocked); valid signature + non-objecting tag ⇒ admit; valid signature + deny-tag ⇒ DENY (tag downgrades only).

### 5.5 "Linear across 128 cores" — Amdahl-capped availability, not security (proof CLAIM 3c)

Lock-free access improves **throughput (availability)**, which is not a security property, and it is not literally linear. The proof applies Amdahl's Law: a perfectly parallel workload reaches the 128× ceiling only in theory, and even a **1% serial fraction caps speedup at `amdahl(0.99, 128) = 56.4×`** — well under 128×. "Linear scaling across 128 cores" is therefore an idealization.

### 5.6 Licensing and SIMD-constant reconciliation (proof CLAIMs 4–5)

SuiteSparse:GraphBLAS is **Apache-2.0** (permissive, no copyleft) — checked, TRUE. And the realized SIMD/SVE2 constant is consistent with the prior binding internal result **~4.3×** (bandwidth-bound), a modest constant that does not change O(). The engine lane may be adopted; the perf expectation must be single-to-low-double-digit constants, not orders.

## 6. Honest limitations & scope (what this does NOT do)

This section is the centre of the disclosure. Every limitation below is deliberate and load-bearing:

1. **Constant-factor, not order.** Nothing disclosed reduces asymptotic complexity. The SVE2 filter stays Θ(N); the SME/GraphBLAS product stays O(n³) dense / O(n·nnz) sparse. The 16×/256×/4.3× figures are **constants** and are bandwidth-bound in practice; they must never be quoted as "exponential," "order-of-magnitude-per-doubling," or "single clock cycle over 256 orders."
2. **HW/OS-gated.** The SVE2/SME benefit is realised only on silicon that implements the extension at a useful vector length and on an OS that exposes it; the fat-binary is portable but the *speed* is entirely a function of the deployed VL and memory bandwidth.
3. **Refute-not-adopt for SME "exponential."** The "exponentially faster" claim is **refuted**, not qualified. It is recorded here as prior-art-false so no downstream design or patent may rest on it.
4. **The stale-read result is safe ONLY as a downgrade.** `min(0, v)` is sound; any use of a stale/Unknown read that could *raise* privilege is unsafe. This is a conditional result, not an unconditional one.
5. **Detect/deny-only, never an admission gate.** The pointer-tag (and any health/topology telemetry) is at most a **deny-only pre-filter / hint** ANDed *in front of* real cryptographic admission. It is **never** an admission (allow) gate. As written in the source note it is **fail-open and forgeable-if-misused** (an attacker who can write the tag byte is admitted with no secret). Admission must stay keyed on a **signed `.fungi` capability** verified with real (PQ-grade) crypto.
6. **Availability ≠ security.** Lock-free 128-core scaling is an availability/throughput property, is Amdahl-capped (≈56× at 1% serial), and confers **no** confidentiality, integrity, or authorization guarantee.
7. **No novelty claimed.** Per §3, the sound parts re-derive shipped internal results (RD-0157/0166 constants, RD-0169 telemetry-≠-verdict, RD-0036/0156 O()-invariance) and standard external art (SVE2 ISA, GraphBLAS, Amdahl, Kleene min). The disclosure's value is the **honest bound and the refutation**, published to the public domain.
8. **Zero-trust tenet impact.** Against NIST SP 800-207, the source design as written **costs** T4 (routes on observable tag/health state as policy), T6 (tag-only admission is fail-open, not signed-cap-before-access), and mildly T5/T7; the **corrected** design (min-downgrade + signed-cap admission) restores T4/T6. This is disclosed openly rather than hidden.

## 7. Illustrative disclosure claims

The following are disclosed embodiments, phrased as defensively broad but **true** statements. They are prior-art disclosures, **not** patent claims.

1. **A method** wherein a single ARM SVE2 vector-length-agnostic binary executes a trit-packed T-CSR graph filter unchanged across the sixteen implemented vector lengths 128…2048 bits, yielding a throughput improvement bounded above by `VL/128` (≤ 16×, in practice ~4.3× bandwidth-bound) as a **constant factor**, while the filter's work remains **Θ(N)** and its asymptotic order is unchanged.

2. **A method** wherein an ARM SME 2-D outer-product tile of side `r` computes a GraphBLAS or dense semiring product `C ← C ⊕ (A ⊗ B)` by batching the **same** total multiply-accumulate count into `r×r` tiles, yielding a **flat constant** speedup equal to the tile area `r²` (256× for a 16×16 tile) that does **not** grow with matrix dimension `n`, whereby the product remains **O(n³)** dense / **O(n·nnz)** sparse and is therefore **not** "exponentially faster."

3. **A method** wherein, under a signed three-valued calculus `{ALLOW=+1, UNKNOWN=0, DENY=−1}` with logical AND implemented as `min`, a stale or pending concurrent (weakly-ordered) read is resolved to `UNKNOWN=0` and composed by `min` with the true signed verdict, such that `min(0, v) ≤ 0` for every `v` and the stale read can only **downgrade** the decision and can **never** launder a DENY or UNKNOWN into an ALLOW.

4. **A method** wherein admission of a request in a data mesh is keyed on cryptographic verification of a signed capability (e.g. Ed25519 / ML-DSA over a `.fungi` capability), and any AArch64 pointer-tag byte, memory-tag, or node-health signal is treated as at most a **deny-only** hint composed by `min` in front of that verification — such that a request lacking a valid signature is **denied even when the tag byte equals +1** — thereby closing the fail-open forgery in which a tag byte alone admits a request with no secret.

5. **A method** wherein lock-free concurrent access across many cores is characterised as an **availability/throughput** optimisation bounded by Amdahl's Law `1 / ((1−p) + p/cores)` — capped at 56.4× for a 1% serial fraction on 128 cores — and is explicitly **not** relied upon as a security, authorization, confidentiality, or integrity property.

6. **A system** employing SuiteSparse:GraphBLAS (Apache-2.0) as the semiring engine for the above, wherein all hardware-acceleration (SVE2/SME) is documented and provisioned as a **constant-factor** lane and no asymptotic-order or "exponential" performance guarantee is asserted or relied upon.

## 8. Machine-checkable evidence

**Proof artifact:** `proofs/rd-0203-proof.mjs` (Node.js built-ins only, `node:assert/strict`; assert-FAIL the overclaim, assert-PASS the corrected value). Re-run with `node proofs/rd-0203-proof.mjs`.

**Checks A–E** (mapped to the proof's CLAIM 1–5):

- **A — SVE2 VLA (CLAIM 1):** 16 vector lengths 128…2048 verified as multiples of 128; 2048-bit speedup = **16× constant**; T-CSR filter proven **Θ(N)** (`instr(2N)/instr(N) = 2`). PASS.
- **B — SME refutation (CLAIM 2):** `smeTiledCost = naiveMatmulCost = n³` for `n ∈ {64,128,256,512}` (same MAC count); speedup a **flat 256×** across `n ∈ {64…1024}` with ratio = 1 (not exponential); order **O(n³)** confirmed (`n³` ratio = 8 per doubling). PASS(corrected).
- **C — Weak-memory stale→0 & tag admission (CLAIM 3a/3b/3c):** `min(0, v) ≤ 0` never authorizes (3a, PASS); forged +1 pointer tag admitted with **no secret** — fail-open — while `admitCorrect` requires a valid signature and blocks the forgery (3b, PASS-corrected); Amdahl 1%-serial = **56.4×**, not 128× (3c, PASS).
- **D — Licensing (CLAIM 4):** SuiteSparse:GraphBLAS = **Apache-2.0**. PASS.
- **E — SIMD-constant reconciliation (CLAIM 5):** realized constant **~4.3×**, consistent with RD-0157, order unchanged. PASS.

**GREEN result line (verbatim from re-run):**

```
=== ALL ASSERTIONS GREEN ===
Summary: SVE2-VLA TRUE(constant), SME "exponentially faster" FALSE(flat 256x constant, O(n^3) intact),
weak-mem stale->0 SOUND ONLY as min-downgrade / tag-admit FAIL-OPEN(RD-0169), 128-core=availability(Amdahl),
Apache-2.0 TRUE. Net: hardware plumbing re-derives RD-0157/0166; security caveats re-derive RD-0169.
```

**Verification status:** HIGH confidence, confirmed. The proof exits 0 with all assertions green; the analysis of record is `galerina-rd-0200-0208-77mesh-tristate-meshql.md` § RD-0203 (verdict: MIXED — SVE2/GraphBLAS TRACK; SME + pointer-tag-admit REFUTE; ZT 4/10; DEFENSIVE).

---

*This defensive publication is released to establish prior art. The sound techniques disclosed herein (SVE2 VLA fat-binaries as a constant-factor lane; Apache-2.0 GraphBLAS adoption; stale-read-as-Unknown used strictly as a `min` downgrade; signed-capability admission with tags demoted to deny-only hints) are placed in the public domain. The refuted claims (SME "exponentially faster," "linear" 128-core scaling, pointer-tag-as-admission-gate) are recorded as prior-art-false so that no party may patent them or build a security control upon them.*
