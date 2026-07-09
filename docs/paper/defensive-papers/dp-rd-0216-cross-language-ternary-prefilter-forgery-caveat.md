# Defensive Publication — Packaging a branchless ternary/tropical engine cross-language (FFI/N-API/WASM, zero-copy) as a DENY-ONLY performance pre-filter — with the forgery caveat that it is not a security boundary

**Disclosure ID:** DP-RD-0216 · **Date:** 2026-07-01 · **Type:** Prior-art disclosure (defensive) · **Not** a patent claim.
**Provenance:** RD-0216 · analysis `galerina-rd-0209-0217-77mesh-tritopology-graphblas.md` (RD-0216 section) · machine-checkable proof `proofs/rd-0216-proof.mjs` (re-run GREEN, 8/8 assertions).

> **Purpose of this document.** This is a defensive publication (prior-art disclosure), not a patent application. Its goal is twofold: (1) place into the public record the *sound, standard-engineering* technique described below so it cannot be monopolised by a later patent; and (2) — equally important — put on record the **honest bound** on that technique. The load-bearing contribution here is as much the disclosed *limitation* (the functional is forgeable and is therefore not a security boundary) as the disclosed mechanism. We do not claim the security framing that the source note attached to this technique; we refute it, in public, with a re-runnable proof.

---

## 1. Technical field

Cross-language software packaging and deployment of a compute kernel: specifically, a branchless integer kernel over ternary-valued (`{-1, 0, +1}`) data and/or a tropical / min-plus (min-plus semiring) linear-algebra sweep over a sparse graph or matrix, compiled once in a systems language (Rust or C++) to a native shared library (`.so` / `.dll` / `.dylib`) and/or to WebAssembly, and exposed to higher-level runtimes through a Foreign Function Interface (PHP FFI, Python `ctypes`/`cffi`), a native addon interface (Node.js N-API), or a WASM instance — with argument and result buffers passed by **zero-copy** shared-memory pointer / TypedArray rather than by serialise-transport-deserialise. The field also touches Zero-Trust admission control, because this document's central caveat is about what such a kernel must **not** be used for at a trust boundary.

## 2. Background & problem

A recurring proposal in the source R&D corpus is to ship the ternary/tropical mesh engine as a drop-in library — "`npm install` a branchless, quantum-resistant firewall" — whose per-connection call `firewall.evaluate() → {-1, 0, +1}` returns an admit/abstain/deny verdict, marketed as (a) a security **admission boundary** and (b) effectively **O(1)** ("a million connections evaluated in the same time as ten").

Two independent problems motivate this disclosure:

1. **A sound engineering technique is entangled with an unsound security claim.** The *packaging* — native core + FFI/N-API/WASM bridge + zero-copy buffers — is exactly how `numpy`, `onnxruntime`, and `sharp` ship, and it delivers a genuine, measurable latency and garbage-collection win. That technique deserves to be on the public record as prior art. But it is being *sold* attached to a security framing (an "admission boundary", "quantum-resistant") that does not hold. Publishing the technique without the caveat would let the unsound framing ride along.

2. **The performance claim and the security claim are both overstated, and the overstatement is exploitable.** "Same time for a million as for ten" is a latency-vs-work confusion (the sweep is `Θ(nnz)`, not constant). More seriously, the min-plus functional is evaluated over a **public** capability vector and holds **no secret**, so an adversary can compute the maximal accept score directly. If such a kernel were used as an admission gate, that would be a forgeable gate — a security regression relative to keyed cryptography.

The problem this disclosure addresses is therefore: **how to record the useful, standard technique as prior art while making the honest bound (forgeable → not a boundary; `Θ(nnz)` → not O(1)) inseparable from it.**

## 3. Prior art (closest existing work, stated honestly)

The technique disclosed here is deliberately *not novel* in its sound parts — that is the point of a defensive publication. The closest existing, well-established work:

- **Native-core + language-binding packaging.** `numpy`, `onnxruntime`, `sharp`, `Pillow-SIMD`, and thousands of other packages already ship a C/C++/Rust core reached through Python `ctypes`/`cffi`, Node N-API, PHP FFI, or WASM. This is decades-old, standard practice; the disclosed packaging is an instance of it, not an invention over it.
- **Zero-copy buffer passing.** Passing `TypedArray` / `ArrayBuffer` / `SharedArrayBuffer` views and raw pointers across the FFI boundary to avoid serialise-deserialise round-trips is standard (WASM linear memory views, Node `Buffer`/N-API `napi_create_external_arraybuffer`, Python buffer protocol / `memoryview`, Apache Arrow's zero-copy IPC). The disclosed embodiment uses the same mechanism.
- **Tropical / min-plus and GraphBLAS.** Min-plus (min-plus semiring) shortest-path and the GraphBLAS standard for expressing graph algorithms as sparse linear algebra are established (Kepner et al., the GraphBLAS C API). The branchless min-cascade is a correct, known formulation.
- **Signed-graph / signed-Laplacian analysis** (Kunegis et al., signed spectral analysis) is the closest published work to using `{-1, 0, +1}` edge signs meaningfully — and, notably, it treats signs as *data to analyse*, not as an *unkeyed admission verdict*.
- **Deny-only / allow-list pre-filtering as a performance stage** is standard defense-in-depth: e.g., a cheap bloom-filter or WAF rule that can only *reject* early, never *admit*, in front of an authoritative check. **Parameterised queries** are the canonical example of the correct pattern this disclosure endorses — the cheap layer never becomes the trust decision.
- **Hardware partitioning / isolation** (Intel CAT / Cache Allocation Technology, page-colouring, CATalyst) and **memory-integrity mitigations** (ECC, TRR / Target Row Refresh for Rowhammer) are cited as the class of work that *is* a real boundary — to contrast with the disclosed kernel, which is not.
- **vLLM PagedAttention** (Kwon et al., SOSP 2023) is the closest published "real zero-copy / paging" performance technique in the adjacent AI-inference space; it is cited to show what a genuine constant-factor memory win looks like (and to disclaim that it, too, is not a security control).
- **b-ary search theory** establishes that changing the branching factor of a search (e.g., ternary vs binary) changes the logarithm's *base* — a constant factor `1/log₂b` — never the *order*. This is the theoretical basis for refuting the "O(log₃N) beats O(log₂N) in order" style of claim.

Against all of this, the disclosed subject matter is an *instance* of standard packaging plus an *explicit negative result* about its misuse — not a claim of novelty over the above.

## 4. Summary of the disclosed subject matter

A branchless ternary / tropical (min-plus) compute kernel, implemented once in Rust or C++ and exposed cross-language via FFI / N-API / WASM with zero-copy shared-memory buffers, is disclosed as sound, standard engineering that yields a genuine **constant-factor** latency/GC improvement (still `Θ(N)` / `Θ(nnz)` in work). It is disclosed that when the kernel computes a min-plus / linear functional `I = Σ Sᵢ·Cᵢ` over a **public** capability vector `C`, the functional **holds no secret and is forgeable**: an attacker who sees `C` can set `S = sign(C)` and reach the maximal accept score `I = Imax` with no key. Therefore the kernel is disclosed to be usable **only** as a **deny-only performance pre-filter** — a cheap early-reject stage ANDed *in front of* real keyed post-quantum (PQ) cryptography — and is disclosed to be **not** an admission gate and **not** "quantum-resistant". The claim "a million connections in the same time as ten" is disclosed to be false: the work is `Θ(nnz)`.

## 5. Detailed description / embodiment (with the key maths result and the proof number)

**Embodiment — the packaging (sound).** A core library implements: (i) a branchless ternary dot-product / min-plus gate over a vector of trits `S ∈ {-1,0,+1}ᴺ` against a public capability/weight vector `C ∈ {-1,0,+1}ᴺ`, and (ii) a tropical (min-plus) sweep over a sparse graph with `nnz` non-zeros. It is compiled to `.so`/`.dll`/`.dylib` and to WASM, and reached from PHP FFI, Python `ctypes`/`cffi`, Node N-API, and WASM instances. Buffers cross the boundary as zero-copy TypedArray / pointer views. This removes the serialise → transport → deserialise round-trip, a real GC/latency win.

- **Zero-copy is a real constant win — but stays `Θ(N)`.** For `N = 1,000,000`, replacing a 3-pass serialise/copy path with a 1-pass zero-copy read saves `2 × O(N)` element-touches (≈ 2,000,000 fewer touches) yet still reads the buffer once — it is **not** `O(1)`. *(Proof Part 3.)*

**Embodiment — the correct security composition (deny-only pre-filter).** The kernel is deployed strictly as an early-reject stage whose output is combined with the authoritative keyed PQ verdict by logical AND: `admit ⇔ (preFilter = ALLOW) ∧ (PQ = ALLOW)`. A false-ALLOW from the pre-filter therefore cannot manufacture an admission — `AND(ALLOW, DENY) = DENY`. The pre-filter can only *cheapen denials*; it can never *launder a verdict* into an admission. *(Proof Part 1.)*

**Key maths result — the functional is forgeable (the honest core of this disclosure).** With `C` public, define `Imax = Σ |Cᵢ|`. The forged input `S = sign(C)` (a pure function of the public `C`, requiring no secret) yields

`I = Σ sign(Cᵢ)·Cᵢ = Σ |Cᵢ| = Imax`,

i.e. the **maximal accept score is reachable with no key**. In the machine-checked run this is `I == Imax` (e.g. `I = 180 == Imax = 180` on the captured run; the exact number varies per run because `C` is randomised, but `I == Imax` holds every run by construction). By contrast, a keyed control — `HMAC-SHA256(secret, S)` — is **not** forgeable without the secret: an attacker guessing the key produces a MAC that does not match the genuine one. The lesson disclosed: **keep the secret in keyed digital crypto; never in the public vector.** *(Proof Part 1.)*

**Key maths result — the work is `Θ(nnz)`, not O(1).** The tropical sweep performs a fixed amount of work per non-zero. Scaling `nnz` from `10` to `1,000,000` scales operations `20 → 2,000,000` — a factor of `×100,000`, exactly linear. SIMD with a 32-wide lane cuts the `2,000,000` scalar steps to `62,500` — a real constant-factor win that leaves the *order* unchanged and still costs far more than the 10-nnz case. "A million in the same time as ten" is therefore **refuted**. *(Proof Part 2.)*

**Duplication note.** By construction the deliverable (cross-language ternary bit-pack + SIMD pre-filter; "NOT a boundary"; forgery-front-and-centre) is byte-for-byte the same object as the earlier RD-0163 track; the proof asserts `deepEqual(RD-0216, RD-0163)`. No new build is implied — the technique folds into the existing owner-gated RD-0163 line with the forgery caveat attached. *(Proof Part 4.)*

## 6. Honest limitations & scope (what this does NOT do)

This section is the primary contribution and must remain prominent.

- **It is NOT a security boundary and NOT an admission gate.** The min-plus / ternary functional over a public vector holds no key. Anyone who can read `C` can forge the maximal accept score (`S = sign(C) → I = Imax`) with no secret. Using `firewall.evaluate() → {-1,0,+1}` as the admit/deny verdict is a forgeable gate.
- **It is NOT "quantum-resistant".** "Quantum-resistant" is a property of *keyed lattice / PQ cryptography*. An unkeyed public functional has no such property; the label is false and is refuted here.
- **Deny-only, never an admission gate.** The only sound placement is as a cheap early-reject stage ANDed *in front of* real keyed PQ crypto. It may **cheapen a DENY**; it must **never** be the thing that produces an ALLOW. Admission must stay keyed on the signed `.fungi` capability.
- **Constant-factor, not order.** Zero-copy, SIMD, and native compilation cut the *constant*. They do **not** change algorithmic order: the sweep is `Θ(nnz)`, the buffer read is `Θ(N)`. Any "O(1)" / "million == ten" framing is false.
- **Detect/reject-early, not prevent.** The pre-filter's legitimate value is latency and early rejection of obviously-bad traffic; it does not *prevent* anything on its own and confers no integrity or authenticity guarantee.
- **Forgeable-if-misused is the whole risk.** The technique is safe *only* under the deny-only composition. Promote it to a verdict and it becomes an exploitable, unauthenticated admission path — a Zero-Trust regression (tenet T6 COST: forgeable admission; T4 WEAK: unkeyed public functional, not dynamic keyed policy).
- **No new build claimed.** This is an exact duplicate of the RD-0163 deliverable; nothing novel is asserted beyond the packaging-plus-caveat already recorded there.
- **Scope of the proof.** The proof is an executable model of the *arithmetic and composition* claims (forgeability, AND-composition, `Θ(nnz)`, zero-copy pass-count, duplication). It is not a benchmark of any specific Rust/C++ binary and does not measure wall-clock FFI latency; the constant-factor *win* is asserted as standard engineering, not measured here.

## 7. Illustrative disclosure claims (defensively broad but TRUE)

Phrased as disclosed embodiments to establish prior art. Each is a statement of what is disclosed, not a claim of novelty.

1. **A method** wherein a branchless integer kernel operating on ternary-valued (`{-1, 0, +1}`) data and/or a tropical (min-plus semiring) sweep over a sparse structure is implemented in a compiled systems language, exposed to one or more higher-level runtimes via FFI, N-API, and/or WASM, and invoked with input and output buffers passed by zero-copy shared-memory reference, whereby the serialise-transport-deserialise round-trip is eliminated to yield a constant-factor latency and garbage-collection improvement while the computational work remains `Θ(N)` in buffer size and `Θ(nnz)` in the number of non-zeros.

2. **A method** wherein the output of said kernel is used as a **deny-only** pre-filter that is combined with an authoritative keyed cryptographic (including post-quantum) verdict by logical conjunction, such that the pre-filter can only cause or accelerate a denial and can never, by any output value, cause an admission — i.e. `admit ⇔ (preFilter = ALLOW) ∧ (keyedVerdict = ALLOW)`.

3. **A disclosure** that where said kernel computes a linear or min-plus functional `I = Σ Sᵢ·Cᵢ` over a **public** capability vector `C`, the functional holds no secret and is forgeable: the input `S = sign(C)`, computable from public data alone, attains the maximal accept score `I = Σ|Cᵢ| = Imax` with no key; and therefore said functional is disclosed to be unsuitable as an authentication, admission, or "quantum-resistant" control.

4. **A method** wherein authenticity and admission are retained by a *keyed* digital primitive (e.g. `HMAC-SHA256(secret, ·)` or a keyed PQ signature over the signed capability), while the unkeyed ternary/tropical kernel is confined to advisory early-rejection, the secret residing in the keyed primitive and never in the public vector operated on by the kernel.

5. **A disclosure** that constant-factor accelerators applied to said kernel — SIMD lane-width parallelism (e.g. 32-wide), native compilation, and zero-copy buffer passing — reduce the multiplicative constant of the work but preserve algorithmic order, such that a workload of one million non-zeros necessarily costs more than one of ten (refuting any "constant-time regardless of load" or "O(1)" characterisation).

6. **A disclosure** that the ternary/tropical pre-filter kernel described in claims 1–5 is functionally identical to the previously recorded cross-language ternary bit-pack + SIMD pre-filter deliverable (RD-0163), carries the same "not a security boundary / forgery-front-and-centre" caveat, and implies no new security primitive.

## 8. Machine-checkable evidence

**Proof file:** `proofs/rd-0216-proof.mjs` — Node built-ins only (`node:assert/strict`, `node:crypto`); re-run GREEN, 8/8 assertions passed.

Structure and checks:

- **Part A (forgeability + keyed control + deny-only composition).**
  - `[PASS] ternary/min-plus watchdog forgeable` — forged `S = sign(C)` over public `C` gives `I == Imax`, ADMITTED with no secret.
  - `[PASS] keyed control resists forgery` — `HMAC(secret, ·)` is unforgeable without the key; crypto stays digital and keyed, not in the vector.
  - `[PASS] sound use = deny-only pre-filter` — `AND(preFilter = ALLOW, PQ = DENY) = DENY`; the pre-filter can never launder a verdict into an admission.
- **Part B (work is `Θ(nnz)`, not O(1)).**
  - `[PASS] tropical sweep is Theta(nnz)` — `nnz 10 → 1e6` : ops `20 → 2,000,000` (×100,000), NOT constant.
  - `[PASS] SIMD cuts constant not order` — 1e6 nnz: scalar `2,000,000` vs SIMD `62,500` steps — a constant cut, order unchanged, still ≫ the 10-nnz case.
- **Part C (zero-copy real win, still `Θ(N)`; bridges are real).**
  - `[PASS] zero-copy = real constant win` — saves `2× O(N)` serialise passes (~2,000,000 element-touches) but stays `Θ(N)` (one read, not `O(1)`).
  - `[PASS] FFI/N-API/WASM bridges are real` — PHP-FFI, Python-ctypes/cffi, Node-N-API, WASM: the packaging is sound.
- **Part D (duplication).**
  - `[PASS] RD-0216 == RD-0163 (duplicate)` — same forge kernel, same perf-pre-filter deliverable, same caveat (`deepEqual`).

**GREEN result lines (captured 2026-07-01):**

```
ALL ASSERTIONS PASSED
Corrected: FFI/N-API/WASM packaging + zero-copy = SOUND ENGINEERING (constant-factor wins).
REFUTED: "quantum-resistant firewall" (forgeable, no secret) ; "a million == ten" (work is Theta(nnz)).
DUPLICATE of RD-0163. Ship only as a deny-only PERF pre-filter, ANDed in front of real PQ crypto.
```

*(The forged accept score printed by Part A is `I == Imax` every run by construction; the specific integer — e.g. `180` on the captured run, `179` as quoted in the source analysis — varies because the public vector `C` is randomised per run. The invariant `I == Imax`, not any particular number, is what the assertion proves.)*

---

*This defensive publication establishes public prior art for the sound cross-language packaging technique and, with equal weight, for the negative result that the underlying ternary/tropical functional over a public vector is forgeable and is therefore a deny-only performance pre-filter — never a security boundary, never an admission gate, and not "quantum-resistant". Provenance: RD-0216; analysis `galerina-rd-0209-0217-77mesh-tritopology-graphblas.md`; proof `proofs/rd-0216-proof.mjs` (re-run GREEN).*
