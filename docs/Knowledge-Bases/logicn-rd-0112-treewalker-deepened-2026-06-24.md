# R&D 0112 — Tree-walker, deepened: maths recheck, compliance, and the 0110 cross-compare

**Date:** 2026-06-24 · **Workflow:** `wp23sd2t9` · **Status:** R&D record (one build action taken — see §6)
**Posture:** verify-before-build · trust the math · fail-closed · crypto-on-core (LLN-SUBSTRATE-001)
**Companion docs:** [`logicn-tree-walker-speed-and-photonic-governance.md`](logicn-tree-walker-speed-and-photonic-governance.md) · [`logicn-rd-0110-photonic-matmul-refutation-deepened-2026-06-24.md`](logicn-rd-0110-photonic-matmul-refutation-deepened-2026-06-24.md) · [`logicn-formal-verification-direction.md`](logicn-formal-verification-direction.md) · [`logicn-aot-tricks-verdict.md`](logicn-aot-tricks-verdict.md)

> Owner ask: "put the tree-walker back into R&D — recheck maths, compliance, deep research, extend the maths; when it comes back, cross-compare with the TritMesh O(1)-matmul refutation (0110) to see if it helps."

---

## 1) MATHS RECHECK — verdict: SOUND, exact, complete for the expressible op set, byte-identical across all three tiers

The interpreter's integer core was re-derived edge-by-edge and re-run live (fidelity-differential 6/6 + i32-arith 7/7, re-confirmed this session 13/13).

- **Checked i32 algebra** (`i32-arith.ts:34-75`) is the single source of truth: `i32{Add,Sub,Mul,Div,Mod,Neg}Checked`. Overflow **traps (Fork-A)**, never silently wraps. `|0` canonicalizes `-0→+0`. `i32NegChecked(a)=i32SubChecked(0,a)` so `-INT32_MIN` traps.
- **Edge predicates re-derived and correct:** the `46340` mul-magnitude threshold (`46340² = 2,147,395,600 < 2³¹-1 < 46341²`), the `INT32_MIN / -1` and `INT32_MIN % -1` overflow edges, the `-0` leak point, div-by-zero. The textbook signed-overflow predicates match.
- **Three-tier byte-exact conformance** (the 0014 differential harness): tree-walker ≡ bytecode-VM ≡ real-WASM, value **and** trap, over the i32 edges and seeded edge-biased fuzz, asserted with `Object.is`. The walker's arithmetic is deliberately **stricter (trapping) than its own WASM reference tier**, which silently wraps — LogicN chose the safe divergence.

**No maths errors found.** The catalogued historical divergences (D1 `-INT32_MIN` no-trap; D2 `-0` leak; the `/0` split) are all already closed in-tree.

## 2) ACTIONABLE FINDING — a latent fail-open in the sync-tier arithmetic fallback (now hardened)

The mixed-type binary-op fallback in the **sync** evaluator (`interpreter.ts:498-510`) ran **raw** arithmetic for int operands — `lv + rv`, `Math.imul(lv,rv)` (silently wraps), `lv / rv` / `lv % rv` (skip the `/0` trap). That is a **fail-OPEN of the three-tier-divergence class**: were it reachable for int×int, the walker would diverge from the bytecode-VM/WASM tiers.

R&D 0112 **proved it is dead today**: every int×int op key (`+ - * / %`) is present in `BINARY_DISPATCH` (`interpreter.ts:112-116`), so `fn !== undefined` always short-circuits before the fallback for int×int. It is **one edit from fail-open** — exactly the class that bit the sync-`whileStmt` path in 2026-06-19.

**Action taken (this session, commit `152dc0b`):** the both-int fallback now routes through `i32{Add,Sub,Mul,Div,Mod}Checked` (traps on overflow / div-by-zero, byte-exact with the other tiers); float-involving ops keep native arithmetic. Defense-in-depth; all reachable paths unchanged; fidelity + i32 suites 13/13 green. A companion **completeness lemma** (prove every `(int,op,int)` key is present in the map) would mechanically rule out the fallthrough ever being reached for int×int — see §4.

## 3) COMPLIANCE / HONEST RESIDUALS (none is a live fail-open)

1. ~~Dead-but-undefended raw-arith fallthrough~~ → **fixed** (§2).
2. **Conformance is sampled, not proven** — 600 random pairs + edges, not a proof over all 2³²/2⁶⁴ inputs. Close with the Z3 QF_BV proof (§4).
3. **The proven envelope is i32-only** — float/i64 are computed but cross-tier-untested; **float NaN-payload nondeterminism** is a latent walker-vs-WASM divergence the harness *cannot currently catch*.
4. **"Constant-time" is a local kernel property, not a global invariant** — `i32MulChecked`'s magnitude split is a real (small) timing channel; do not overclaim it.

## 4) HIGHEST-VALUE EXTENSION — Z3 QF_BV cross-tier proof (the do-first item)

Converts the brand-critical claim from "no counterexample in 600 random pairs" to "no counterexample **exists** over all inputs," in milliseconds (the bitvector theory is finite and decidable). It would have *proven* D1/D2/the `/0` split rather than sampling them; it upgrades the slice-2/5b trap-*occurrence* check to trap-*reason* equivalence; and on any future edit that drops a dispatch entry it returns the **exact `(a,b,op)` divergence witness** — converting §2's latent fail-open into a caught proof obligation. Already named in [`logicn-formal-verification-direction.md`](logicn-formal-verification-direction.md). Proposed deliverable: `scripts/rd-treewalker-depth-work-smt-proof.mjs` (paired with the existing `scripts/rd-aot-tensor-precompute-proof.mjs`), plus the `BINARY_DISPATCH` completeness lemma.

The **speed** levers are unchanged from the prior verdict and remain a faithful re-derivation of Ertl-Gregg / PEP-659 / Ignition — **none is a substrate claim**: de-color the hot path **7.4×** (#1, measured), flat-SoA AST **2.22×**, closure-compile **2.2×**, const-fold+DCE **1.64× / 7.1×-fewer-nodes**. NaN-boxing is only 1.15× (a negative against the "boxing is the bottleneck" folk wisdom).

## 5) CROSS-COMPARE WITH 0110 (the O(1)-matmul refutation) — NOT orthogonal: same refutation, two workloads, plus a sharp synergy

**(a) Shared refutation.** "Compile the tree into a tensor and run it in O(1)" **is** 0110's refuted precompute trade, already on record in [`logicn-tree-walker-speed-and-photonic-governance.md`](logicn-tree-walker-speed-and-photonic-governance.md) §5. Applying a dense N×N map is **Θ(N²) work** on any substrate (N inputs in / N outputs out through O(1)-width transducers). An AST is a **sparse tree (V−1 edges)** walked **once (reuse = 1)** — squarely the **losing side** of 0110's amortization cross-over (sparse / single-source / low-reuse). *Distinct second kill, do not collapse into 0110:* "flatten any expression → one matrix" also fails because **multiply is nonlinear** (three zero-product points yet 1·1=1) — linear algebra cannot even *represent* the computation, before any cost argument.

**(b) Help is asymmetric.** 0110 → tree-walker: its latency-vs-work theorem is the clean general frame showing the §5 tensor pitches are category errors (they *relocate*, not remove, the work). Tree-walker → 0110: the *genuine* tree-walker levers all live on the **work axis** 0110 says a parallel substrate cannot touch (7.4× de-color, 2.22× SoA, const-fold+DCE). Partial-evaluation toward the bytecode VM (the Futamura-projection direction) is the **sound** work-reducing amortization 0110 endorses, not the refuted matrix-precompute.

**(c) The genuine synergy — depth-vs-work, sharp and decisive.** A strict (call-by-value) tree-walk is inherently sequential: a parent `binaryExpr` cannot reduce until **both** children resolve (data dependency, confirmed in `interpreter.ts`), so the latency floor is the tree's **dependency depth** regardless of substrate, and total **work** is Θ(#nodes). A parallel/photonic substrate collapses only the latency of *mutually-independent* fan-out at a given depth — **never** the serial dependency spine, never the work. This is precisely the **dual** of 0110: **0110 lower-bounds WORK by output fan-in (Ω(N²)); the tree-walker lower-bounds LATENCY by dependency DEPTH.** The "matrix-of-the-tree" pitch trades depth for O(N²) work it doesn't have → strictly worse on **both** axes for a single walk. The one genuine substrate win — **governance-as-T-MAC** — is explicitly *"mathematical, NOT a photonic speed claim,"* consistent with 0110 (and see R&D 0113 for why it should be renamed an *associative ternary-semiring reduction*).

## 6) BOTTOM LINE + paper / defensive-pub note

The tree-walker's integer core is **mathematically sound, exact, complete for the expressible op set, and byte-identically conformant across all three tiers** — verified live, re-derived edge-by-edge, with tight correct bounds. Its distinctiveness is **not speed** (a faithful re-derivation of known interpreter techniques, #1 lever still unbuilt) but using **differential cross-tier conformance + fail-closed trapping arithmetic + constant-time discipline** — normally crypto / Wasm-spec tooling — as a first-class **governance/security contract** on an ordinary interpreter, *stricter than its own WASM reference tier*.

- **Defensive-pub (positive, citable):** "Differential cross-tier conformance as a governance contract" — three independent lowerings locked byte-identical via `Object.is` + seeded edge-biased fuzz, arithmetic deliberately *trapping* where the WASM reference wraps. Real, unusual outside spec test suites; **not patentable** (no new science).
- **Paper-worthy measured negatives** (the standing "papers only for negatives" lane): (i) the **tree-as-tensor / O(1)-matmul refutation unified with 0110** — latency-O(1) but work-Θ(N²); sparse-tree reuse=1 loses on both axes — pairing the CPU witness with a proposed SMT depth-vs-work UNSAT certificate; (ii) the **speed-lever ranking** (7.4× async tax dominates; NaN-boxing only 1.15×) against the "boxing is the bottleneck" folk wisdom.
- **No new IP value, 0 patents** — consistent with [`logicn-ip-paper-strategy.md`](../../../LogicN-R-AND-D).

**Key files:** `i32-arith.ts:34-75` · `interpreter.ts:68-70` (`i32R`), `:112-164` (`BINARY_DISPATCH`), `:498-510`/`:1521-1530` (raw-arith fallthrough — now hardened), `:517`/`:1457` (unary) · `bytecode-vm.ts:330-346` · `wat-emitter.ts:744-819` (`:763-764` unguarded float/NaN lowering) · `tests/fidelity-differential.test.mjs` + `tests/i32-arith.test.mjs`.
**Proposed deliverables:** `scripts/rd-treewalker-depth-work-smt-proof.mjs`; `i64-arith.ts`; fidelity slice-6 (the unary blind-spot is closed; add f64/i64 corpus).
