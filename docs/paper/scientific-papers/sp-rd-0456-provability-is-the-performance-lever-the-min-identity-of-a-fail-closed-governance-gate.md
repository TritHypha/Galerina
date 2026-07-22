# Provability is the performance lever: the `min`-identity of a fail-closed governance gate

**Scientific / methodology publication · sp-rd-0456 (landed in `docs/paper/scientific-papers/` 2026-07-22; number = the source RD id, verified free in the canonical index) · 2026-07-17 · TritHypha (hello@trithypha.dev) · Prior-art disclosure — not a patent claim**
**Bar:** a machine-checked algebraic result (61/61 executed assertions, exhaustive over the trit lattice), plus one design-stage mechanism disclosed *with* its honest bound. No performance number is claimed. Strengths only.

## Abstract

A fail-closed governance gate whose conjunction is Kleene-`min` over `DENY(−1) < INDETERMINATE(0) < ALLOW(+1)` has a property that dissolves the usual security-vs-speed tradeoff: **`ALLOW` is the algebraic identity of `min`.** Therefore any gate input a compiler proves `ALLOW` at compile time contributes nothing to the runtime `min` and can be soundly removed. The consequence is that *proving more security deletes runtime checks* — provability is simultaneously the security strength and the performance lever, on one axis rather than in tension. We state the algebra, machine-check it exhaustively (identity, annihilation, no-coercion, monotonicity, and the empty-fold subtlety), and separate the **novel characterization** (this paper) from the **elision mechanism** (proof-driven dead-code removal, already standard in optimizing compilers).

## 1. The gate

Model an admission gate as the conjunction of `n` verdicts `v₁…vₙ ∈ {−1,0,+1}`, authorized iff the conjunction is exactly `+1`:

```
gate = allOf(v₁,…,vₙ) = v₁ ∧ … ∧ vₙ,   where a ∧ b = min(a,b),   authorize(x) ⟺ x = +1
```

This is the standard Kleene-K3 fail-closed boundary: `DENY` dominates, an unproven/`INDETERMINATE` operand holds the whole result short of `ALLOW`, and only an all-`ALLOW` conjunction authorizes.

## 2. The result

**Theorem (min-identity ⇒ elision).** For all `x ∈ {−1,0,+1}`, `min(+1, x) = x`. Hence in `allOf(…)`, any operand `vⱼ` that is **statically proven `+1`** is the identity of the fold and may be dropped without changing the verdict for *any* value of the remaining operands.

**Corollary (one lever).** Discharging a gate obligation at compile time (a security act — a proof) *removes* its runtime check (a performance act). A flow all of whose obligations are discharged has an **empty runtime gate**: it runs at raw compute speed while retaining the full K3 guarantee, because the removed checks were provably `+1` and `+1` is the identity. Security and performance are the same variable — provability — not a tradeoff.

This is exactly why a *fail-closed* gate is the right shape for this: the identity element (`+1 = ALLOW`) is the *permissive* verdict, so only a **proof of safety** licenses removal. The dangerous dual — using the identity as a *seed* — is a fail-open (see P5).

## 3. Machine-checked properties (61/61 executed assertions, exhaustive over the lattice)

A companion harness (Appendix A) checks, over all trits and all 3-vectors:

| # | Property | Meaning | checks |
|---|---|---|---|
| P1 | `min(+1,x) = x` | `ALLOW` is the identity → proven-`ALLOW` operands elide | 3/3 |
| P2 | `min(−1,x) = −1` | `DENY` is the annihilator → deny dominates by construction | 3/3 |
| P3 | `authorize(min(v,s)) ⟺ v=+1 ∧ s=+1` | **no-coercion**: a side-signal can never *manufacture* an allow | 9/9 |
| P4 | `s₂ ≤ s₁ ⟹ min(v,s₂) ≤ min(v,s₁)` | **monotone**: lowering an operand can only lower authority — asserted on the 18 of 27 ordered triples where the hypothesis `s₂ ≤ s₁` holds (no vacuous assertions) | 18/18 |
| P5 | `allOf([]) = 0` (INDETERMINATE), and `allOf` authorizes ⟺ every operand is `ALLOW` | the empty conjunction **denies** — it must NOT return the vacuous `+1` identity (1 empty-fold + 27 exhaustive 3-vectors) | 28/28 |
| — | **Total** | | **61/61** |

*(Tally erratum: an earlier draft read "64/64" by counting P4's full 27-triple iteration space rather than its 18 executed assertions and mis-tallying P5. The executed count — measured by running Appendix A verbatim with a counting shim, 2026-07-22 — is 61, all passing. The properties and the algebra are unchanged; the appendix now prints its own count so the figure cannot drift from the code again.)*

P5 is the load-bearing subtlety and the reason this is a *fail-closed* result: because `+1` is the identity of `min`, seeding an empty fold with `+1` would spuriously authorize an empty obligation set — a vacuous-authority fail-open. The correct boundary fold seeds `INDETERMINATE` on empty (denying) and is otherwise seedless. The identity is safe to *eliminate a proven operand* (§2) but unsafe to *seed a fold* — the same algebraic fact cuts both ways, and only the fail-closed direction is sound.

## 4. Novelty boundary (stated so nothing here overclaims)

- **Not novel:** proof-driven elimination of provably-true guards is standard optimizing-compiler practice (constant folding, dead-branch elimination); shipping compilers already skip a check whose predicate is compile-time `true`.
- **The contribution:** the *algebraic characterization* that makes such elision **sound for a fail-closed governance conjunction specifically** — `ALLOW` is the `min`-identity, so elision is verdict-preserving for all residual inputs — together with the framing that this **collapses the security/performance tradeoff onto the single axis of provability**, and the P5 boundary result that the same identity is a fail-open if used as a seed. This is a governance-algebra statement, not a claim to have invented dead-code elimination.

## 5. A second mechanism — disclosed with its bound, no speedup claimed

**Verdict-as-mask.** Encode the final verdict as an address mask so that a non-`ALLOW` route directs memory accesses into a trap region — folding the gate into the **bounds-check the sandbox already pays**. When the verdict is provably `+1` the mask is provably all-ones and an optimizer elides it, recovering §2.

**Honest bound (why no number is claimed):** wasm32 has no guard page, so on wasm32 this reduces to a reserved-band + poison-output postcondition rather than a free bounds-check fold; the full form needs a native/CPU-direct guard page. **No measured speedup is asserted** — this is a design with a stated caveat, published to bank the construction, not a benchmark result. (Consistent with the standing rule that a governance mechanism's cost is not claimed until measured under work-equivalent conditions.)

## 6. Relation to prior TritHypha results

Complements *"assurance relocation: the hot/cold split for proofs"* (dp-rd-0409 — move proofs off the hot path) with the stronger case: a proof that lands at compile time doesn't relocate, it **vanishes** from the runtime by the min-identity. Complements *"latency is not work"* (the benchmark-honesty corpus) by giving the one legitimate way a governed path reaches raw speed — not by removing governance, but by discharging it into a proof that the identity then elides. The third-state fail-closed calculus (sp-rd-0439) supplies the K3 semantics this rides.

## Appendix A — the harness (reproducible; prints its own count — 61 checks hold)

```js
let n = 0;                                     // executed-assertion counter (self-verifying tally)
const assert = (c) => { if (!c) throw new Error(`check ${n + 1} failed`); n++; };

const T = [-1, 0, 1];                          // DENY < INDETERMINATE < ALLOW
const min = (a, b) => (a < b ? a : b);         // Kleene AND (fail-closed conjunction)
const authorize = (v) => v === 1;              // the exact fail-closed boundary
const allOf = (xs) => xs.length === 0 ? 0 : xs.reduce((a, b) => min(a, b));
// P1 identity: min(+1,x)=x  → a proven-ALLOW operand elides                    (3)
for (const x of T) assert(min(1, x) === x);
// P2 annihilator: min(-1,x)=-1                                                 (3)
for (const x of T) assert(min(-1, x) === -1);
// P3 no-coercion: authorize(min(v,s)) ⟺ v=+1 ∧ s=+1                            (9)
for (const v of T) for (const s of T) assert(authorize(min(v, s)) === (v === 1 && s === 1));
// P4 monotone: s2≤s1 ⟹ min(v,s2) ≤ min(v,s1) — 18 triples satisfy s2≤s1       (18)
for (const v of T) for (const s1 of T) for (const s2 of T) if (s2 <= s1) assert(min(v, s2) <= min(v, s1));
// P5 empty-fold denies (not vacuous ALLOW); allOf authorizes ⟺ all ALLOW      (1 + 27)
assert(allOf([]) === 0 && !authorize(allOf([])));
for (const a of T) for (const b of T) for (const c of T)
  assert(authorize(allOf([a, b, c])) === (a === 1 && b === 1 && c === 1));

console.log(`${n} checks hold.`);              // → prints "61 checks hold." (re-run 2026-07-22)
```

## Declarations

- **Type / tier:** defensive-pub tier, eprint-shaped methodology/construction disclosure (harness-backed; novelty boundary stated in §4) — not a flagship/workshop novelty claim; no new cryptography, no new science; no performance number is claimed (§5's mechanism is design-stage with its bound stated).
- **Authorship & AI assistance:** drafted with AI assistance under human direction; grounded in the project's min-identity R&D (the RD-0456 line) and the Appendix A harness (executed verbatim, 61/61, 2026-07-22).
- **Funding:** none.
- **Competing interests:** none.
- **Data / artifact availability:** the harness is Appendix A itself — dependency-free, self-counting, runnable as printed; no external data.
- **Licence:** Apache-2.0.

*Published as a defensive/methodology disclosure. Machine-checked algebra; one design-stage mechanism with an explicit bound; no performance claim. Contact hello@trithypha.dev.*
