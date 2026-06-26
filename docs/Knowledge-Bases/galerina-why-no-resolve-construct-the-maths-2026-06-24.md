# Why we are NOT adding the `resolve … at boundary` construct (the maths in full)

**Date:** 2026-06-24 · **Companion:** [`galerina-third-logic-delivery-and-governed-quantum-substrate-2026-06-24.md`](galerina-third-logic-delivery-and-governed-quantum-substrate-2026-06-24.md) (RD-0122, §8 decision)
**Posture:** verify-before-build · trust the math · fail-closed (unknown→deny) · No-Coercion · Govern-Don't-Absorb · crypto-on-core (SPORE-SUBSTRATE-001)

> Owner: *"can you make a document explaining in detail why no, and explain the maths in detail."*

The answer to *"are we adding the `resolve … at boundary` construct + the signed `toleranceWitness` as new technology?"* is **NO — not now, not speculatively.** This document gives the three independent reasons, each grounded in maths.

The short version: **(A)** the capability already ships in the core, provably — so the construct adds *zero* capability; **(B)** every physical/substrate advantage that could justify ABSORBING exotic compute into the trusted core is refuted by information theory and physics — so there is nothing to chase; **(C)** adding a parser/verifier production with no consumer is pure attack surface, which is the opposite of the most-secure choice. The only honest net-new (`toleranceWitness`) is a fail-closed *admission rail*, built on-demand when a real device exists.

---

## A. The capability already ships — the K3 maths

The "third execution paradigm" is **resolution/collapse delivery**: *hold a possibility-space, collapse it once to one outcome at a boundary, ordered by constraint/probability instead of time.* Galerina already realizes this as a governance discipline — **the K3 resolution boundary**. Here is the algebra, exactly as shipped.

### A.1 The verdict lattice

Verdicts live in the strong-Kleene three-valued domain (Kleene 1952), cited in-code:

```
V = { −1 (DENY),  0 (INDETERMINATE),  +1 (ALLOW) },   ordered  −1 < 0 < +1
```

Conjunction and disjunction are the lattice meet/join:

```
vAnd(a,b) = min(a,b)        vOr(a,b) = max(a,b)
```

Truth tables (note the Kleene "contagion" of the unknown):

```
 vAnd │ −1   0  +1        vOr  │ −1   0  +1
 ─────┼───────────        ─────┼───────────
  −1  │ −1  −1  −1         −1  │ −1   0  +1
   0  │ −1   0   0          0  │  0   0  +1
  +1  │ −1   0  +1         +1  │ +1  +1  +1
```

**`0` is the held possibility-space.** An `INDETERMINATE` verdict is precisely "the outcome is not yet resolved" — the superposition of {could-allow, could-deny} that has not collapsed. This is the *third* state that binary {allow, deny} cannot express, and it is the formal object the third paradigm is about.

### A.2 The deliberate, safe-direction divergence on the empty fold

The pure lattice identity of `min` is the top element `⊤ = +1` (the empty meet is "vacuously true"). Galerina **overrides** this:

```
allOf([])  =  0  (INDETERMINATE)      — NOT +1
```

i.e. an empty set of obligations is **not** "vacuously allowed"; it is "nothing is known," which must not read as permission. This is a deliberate divergence from the algebra in the *safe* direction (toward deny), and it is test-pinned (RD-0113, 145/145). It is the deny-by-default reflex encoded into the fold.

### A.3 The collapse — `decideAtBoundary`

At a governed sink, the held `0` collapses to a definite, fail-closed outcome:

```
decideAtBoundary(v)  =  ALLOW   if v = +1
                     =  DENY    otherwise            (v ∈ {0, −1})
```

emitting `SPORE-GOV-3VL-001` whenever the collapse turns `0 → DENY`, so it is **never silent**. This single rule — *unknown → deny, at the boundary, loudly* — is the fail-closed collapse of resolution/collapse delivery. The possibility-space is held through the computation and resolved **once**, at the boundary, by a constraint (the governance contract), not by wall-clock time. That is the third paradigm, executing today.

### A.4 No-Coercion — why an untrusted operand can only lower trust

For any untrusted/degrade-only input `t` combined with a verdict `v`:

```
combined = vAnd(v, t) = min(v, t) ≤ v
```

`min` is monotone-decreasing in each argument, so an untrusted operand can **only push toward DENY, never raise toward ALLOW.** This is the formal statement of "a substrate may degrade availability, never escalate authority" — and it is why exotic substrates can be admitted *without* being trusted (see §B).

**Conclusion of A:** the construct `resolve … at boundary` would be *syntactic sugar* over a discipline (§A.1–A.3) that is already enforced on every governed sink. It adds **zero** capability.

---

## B. No substrate advantage justifies ABSORBING exotic compute — the refutation maths

The only reason to *change the core* (rather than add sugar) would be a substrate that makes resolution/collapse delivery fundamentally cheaper or more powerful than digital K3. Every such claim is refuted. (Full ledger D1–D11 in the companion doc; the load-bearing maths:)

### B.1 "Compute anything in O(1) by field propagation" — latency O(1), **work Θ(N²)**

A passive photonic mesh applies a linear map `y = T·x` at the speed of light, but an `N`-mode unitary needs `~N²/2` Mach-Zehnder interferometers (Reck/Clements). For `N = 1024` that is `n²/2 = 523,776` modulators, plus `Θ(N)` DAC inject + `Θ(N)` ADC readout. The work/area/energy is `Θ(N²)`; only the *latency* is `O(1)`. The ideal `9.4×` collapses to a **measured `~1.9×`** after data conversion (Meech). The work does not vanish — it relocates to the periphery. There is no free compute to justify trusting the substrate.

### B.2 Governance branching is **non-linear** — a linear substrate cannot even represent it

A passive transform is linear: `T·(αx) = αT·x`. But a logical AND / multiply is `z = x·y`, a degree-2 surface — the hyperbolic paraboloid `z = xy` (a saddle). It has three zero-product points `(0,0),(0,1),(1,0)→0` yet `(1,1)→1`, and those four points are **not coplanar**, so **no linear `T`** reproduces them. Therefore "flatten the governance decision tree into one matrix and resolve it in one shot" is **mathematically impossible**, independent of cost. A linear substrate cannot represent a branch; it can only carry data the digital core branches on.

### B.3 MBQC is **not** instant/non-local — no-signaling makes it time-bound

Measurement-based quantum computation is the genuine quantum form of resolution/collapse, but it is not FTL. For any bipartite state `ρ_AB`, Bob's reduced state

```
ρ_B = Tr_A(ρ_AB)
```

is **invariant** under any local operation Alice performs. So **zero readable bits** move to Bob until the classical measurement outcome is transmitted at speed `≤ c`. MBQC requires adaptive **classical feed-forward** of measurement results; it is time-ordered async, not instantaneous. The boundary's time-ordering is physical law, not an implementation limit.

### B.4 Spectral/WDM is parallelism, not a new trigger — Holevo

Holevo's bound caps the classical information extractable from a quantum state at **≤ 1 bit per qubit/mode**. So `K` wavelengths give `K` independent channels = `K`-fold parallelism, with a DAC/ADC tax that grows with `K`. It is more lanes, not a new kind of logic delivery.

### B.5 Integrity still needs a keyed MAC — EUF-CMA, no quantum shortcut

"Let entanglement self-prove integrity, drop the MAC" fails: a MAC's security is **EUF-CMA** (existential unforgeability under chosen-message attack) — keyed binding of *payload* to *origin*. Entanglement/QBER senses *channel disturbance*, not payload authenticity, and there is **no quantum advantage over classical MACs** (Boneh–Zhandry 2013). Crypto stays digital (SPORE-SUBSTRATE-001).

**Conclusion of B:** across cost (B.1), representability (B.2), causality (B.3), capacity (B.4) and integrity (B.5), there is **no substrate advantage** that a trusted-core change could capture. The work doesn't disappear, the substrate can't represent the branch, the physics is time-bound, and crypto gains nothing. Hence **Govern, Don't Absorb**: admit the substrate as an untrusted Tier-3 co-processor (the §A.4 No-Coercion guarantee makes this safe), never fold it into the trusted core.

---

## C. Adding the construct now is pure attack surface — the security-economics argument

Let `S` be the trusted compiler/verifier surface (every grammar production, every verifier pass is a place a fail-open can hide — this session alone found and fixed several). A new source construct `resolve … at boundary` adds:

- a new **parser production** (new tokens, new precedence, new error states),
- a new **AST node** + a new **verifier obligation** (does the collapse point dominate every sink? is it fail-closed? does it interact with taint/effect/secret checks?),
- a new **lowering** path through GIR → WAT/WASM that must preserve the fail-closed semantics on all three tiers.

Each is a net addition to `S` with a non-zero probability of harboring a fail-open. The benefit, today, is **zero** (no flow needs it; §A proves the capability already exists). The most-secure choice minimizes `S` subject to delivering the required capability — so a construct with **no consumer** is strictly dominated by *not adding it*. Build it only when a real `.spore` flow needs to *name* the collapse point explicitly, at which point the benefit becomes non-zero and the surface cost is justified.

---

## D. The one honest net-new — and why it's an *admission rail*, not a core change

The single buildable that is genuinely new is the signed **`toleranceWitness`**: a fail-closed rail to *admit a probabilistic Tier-3 co-processor* (analog/photonic/MBQC) by validating its readout against a **signed tolerance attestation** — exactly like `admitPhotonicConfig` / `admitStorageSubstrate` already do for their substrates:

```
admit(device, witness) = ALLOW  iff  verifySig(witness) ∧ readoutWithinTolerance(device, witness)
                       = DENY    otherwise        (fail-closed; unknown → deny, per §A.3)
```

This **does not lower the core** — it extends the *untrusted* admission surface. The device stays degrade-only (§A.4), crypto + determinism stay digital, and the verdict stays exact. It is built **on-demand**, when a concrete probabilistic device with measured tolerance enters the roadmap (hardware-gated) — not as speculative syntax.

---

## Bottom line

**NO new technology now.** (A) The K3 resolution boundary already executes the third paradigm — the construct adds zero capability. (B) The maths refutes every substrate advantage that absorbing exotic compute could chase — there is nothing to capture, and the linear substrate cannot even represent a governance branch. (C) Adding an unused construct is pure attack-surface growth, the opposite of the most-secure choice. (D) The only honest net-new is a fail-closed admission rail (`toleranceWitness`), built on-demand — governing the substrate, not trusting it.

This is the most-secure zero-trust choice: keep the trusted core minimal and exact; make the *untrusted* zone richer.
