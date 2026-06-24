# R&D 0117 — The JOIN: 0110's reuse-crossover WHEN married to the shipped Tri-Pipe HOW, with a proved Safe-Floor Theorem

**Date:** 2026-06-24 · **Workflow:** `w0w76fzt3` · **Status:** R&D record + **one build shipped** (the safe-floor proof, plan step 1)
**Posture:** verify-before-build · trust the math · fail-safe to digital · crypto-on-core (LLN-SUBSTRATE-001) · measured-negatives-only · **no measured photonic speedup until a named PIC** (aspirational constants stay labelled `partition-decider.ts:11-14`).
**Named machine (== 0110/0115):** Intel i9-9900K @ 3.60 GHz · node v24.16.0 · win32 x64.
**Companion docs:** [`logicn-rd-0115-hybrid-photonic-binary-placement-2026-06-24.md`](logicn-rd-0115-hybrid-photonic-binary-placement-2026-06-24.md) · [`logicn-rd-0110-photonic-matmul-refutation-deepened-2026-06-24.md`](logicn-rd-0110-photonic-matmul-refutation-deepened-2026-06-24.md) · [`logicn-rd-reference-index.md`](logicn-rd-reference-index.md)

> Owner ask: "the switch exists (shipped, fail-safe), the cross-over math exists (0110), but they haven't been formally joined — and nobody has measured the cross-over on a real LogicN workload. Go for it." Executes `RD-0115-E1/E2/E3`.

---

## 1) HEADLINE — the switch and the cross-over math are now JOINED  `[RD-0117-O1]`

0110 gave the **WHEN** (`reuse · core_saving > conversion + weightLoad`); the shipped Tri-Pipe is the **HOW** (`ExecutionRouter.route()` + `PartitionDecider.decide()`). The unified **optimal placement rule** — an op offloads to photonic iff every conjunct holds:

```
route_photonic ⇔ vAnd( attested(tier ∈ {hybrid,photonic}),   // hardware-directive.ts:46,53-54,59
                       laneGranted(deny-by-default fold),      // execution-router.ts:124-130
                       ternary(precision),                     // execution-router.ts:108
                       eligible(¬crypto ∧ ¬controlFlow),       // partition-decider.ts:112
                       canVote(feasible & finite N),           // partition-decider.ts:131-138
                       reuse · core_saving(n,N) > oneTimeCost(n) )  // ← the 0110 net-win conjunct
```

**The shipped router implements every conjunct except the last in its general form** — it substitutes the **reuse=1, weightLoad=0** special case `Tphotonic(n,N) < Tdigital(n)` (`partition-decider.ts:141`, closed form `n* = (c_opt + c_verify·k)·N/c_d = 20.106` at N=1), which is the **R→∞ asymptotic floor** of the optimal rule. Algebra (CPU-verified identical over 5,000 points):

```
Tphotonic(n,N,R) < Tdigital(n)  ⇔  R·[c_d·n³ − (c_opt+c_verify·k)·N·n²] > conv·n + c_wl·n² + fixed
                                ⇔  R · core_saving(n,N) > oneTimeCost(n)      ← exactly 0110's inequality
```

> **The shipped router is a SAFE LOWER BOUND on the optimal rule.** It refuses photonic *at least as often* as the amortized rule (the missing `reuse` term can only reclaim wins; the missing `weightLoad` term can only make R=1 more conservative). It can leave wins on the table; it can never break the digital floor. **Worst case == binary == today.**

## 2) THE SAFE-FLOOR THEOREM — proved + shipped as a runtime gate  `[RD-0117-O2]`

> **Theorem (never worse than binary == today).** For all well-typed `decide()` inputs — any tier/precision/cost/cap operands, including adversarial/garbage that survives the type boundary — `realized_cost(decide(kernel), n) ≤ Tdigital(n)`, with **strict** inequality on the single photonic branch. Equivalently: `decide()` returns `photonic` only when `Tphotonic(n,N) < Tdigital(n)` was **proven** on that exact `(n,N)`; otherwise the realized cost **is** `Tdigital(n)`.

**Proof skeleton (finite case analysis, file:line-cited).** `decide()` has exactly **7 returns — 6 syntactic `digital`, 1 gated `photonic`**:

| # | Branch | Site | Guard | Returns |
|---|--------|------|-------|---------|
| B1 | crypto / control-flow | `:112-113` | `isCrypto ∥ isControlFlow` | **digital** (LLN-SUBSTRATE-001) |
| B2 | declared `lane:digital` | `:115-116` | `lane === "digital"` | **digital** |
| B3 | garbage size | `:121-122` | `!isFinite(n) ∥ n<1` | **digital** (fail-closed) |
| B4 | systematic ADC floor | `:132-133` | `!isFinite(feasibleN)` | **digital** (LLN-SUBSTRATE-003; re-derived regardless of caller `redundancyN`) |
| B5 | cannot vote | `:136-137` | `!isFinite(N) ∥ N<1` | **digital** (fail-closed) |
| **B6** | **net-win** | `:140-142` | `tphot < tdig` (**strict**) | **photonic** ← the only non-digital return |
| B7 | no net win | `:143-144` | else | **digital** (REFUSE) |

Photonic ⟺ control reaches B6 ⟺ `{¬B1..¬B5} ∧ Tphotonic<Tdigital`. So on photonic `realized = Tphotonic < Tdigital`; otherwise `realized = Tdigital`. `route()` only ever makes the result **more** digital (eligibility short-circuit `:108-116`; cap-gate fallback `:124-130`; tier anchor `hardware-directive.ts:40-60` → binary on any uncertainty). ∎

**SHIPPED (plan step 1):** [`rd-0117-safe-floor-theorem-proof.mjs`](../../../LogicN-R-AND-D/scripts/rd-0117-safe-floor-theorem-proof.mjs) — **imports the REAL shipped package** (`logicn-ext-photonic-emulator/dist`), so a live-decider regression turns it RED. **15/15 PASS, exit 0:**
- **P1** (200k seeded kernels incl. garbage): photonic chosen 36,415× / digital 163,585×, **0 violations** — every photonic return is a proven strict net-win on finite n, and `tphot ≤ Tdigital(n)` always. Plus a deterministic self-check.
- **P2**: one witness per branch B1–B7 (a flipped guard or a new unguarded 8th path → RED).
- **P4**: `crossover(1)=20.106` (= shipped n*), monotone in N (`20.1 < 60.3 < 181.0 < 502.7`), numeric first-win **22** (≥ floor n*, within the convert+fixed band).
- **Honesty:** the proof asserts **relative** dominance — invariant to a uniform rescale of the ns-constants, so **the safe-floor survives the constants being wrong** (the decider re-checks the inequality per call with whatever constants are loaded).

## 3) THE REUSE-CROSSOVER WIRING SPEC (CPU-doable, closes the named gap)  `[RD-0117-O3]`

`KernelCost` (`partition-decider.ts:24-38`) has no `reuse` operand and no Θ(n²) weight-load term → silently fixes reuse=1. Wiring it makes the gate exactly 0110's `R·coreSaving > oneTimeCost`. **Measured cross-over (N=1, new aspirational `c_wl_ns = 2.5`):**

| Quantity | Closed form | Value (N=1) |
|---|---|---|
| `n*_∞` (R→∞ floor) | `(c_opt + c_verify·k)·N / c_d` | **20.106** (= shipped `crossover(N)`) |
| `n*_{R=1}` (+ weightLoad) | smallest n with `Tphot_reuse(n,N,1) < Tdig` | **30** |
| **reuse-reclaimed band** | `[⌈n*_∞⌉, n*_{R=1}−1]` | **n ∈ [21, 29]** |

`R_needed = ⌈oneTimeCost/coreSaving⌉`: n=22→6, n=24→3, n=29→2, n≥30→1. Below n=21, `coreSaving ≤ 0` ⇒ **no R ever wins** (0110's losing / TritMesh regime). Edits: add `c_wl_ns` to `NS`; `readonly reuse?: number` (≥1, default 1) to `KernelCost`; amortize `Tphotonic`; expose `crossoverN`/`reuse`/`reuseToWin` on `Decision`+`ExecutionDecision` for the audit trail. **`reuse=1` stays the conservative default → backward-compatible, safe-floor preserved (the decider still re-checks `Tphotonic < Tdigital` per call).**

## 4) THE REAL-WORKLOAD MEASUREMENT + the headline measured-negative  `[RD-0117-O4]`

The honest finding: **`decide()`/`route()` have no production call sites yet, and the governance workload is small/sparse/reuse-1** (`tmacVector` GEMV `tpl-simulator.ts:298-332`; `T_reach` `reach.ts:25`; the only matmul bench is `matMulScalar(32)`). So the matmul-fraction **p ≈ 0**, and with the honest `A = meechRealizedRatio().realizedRatio ≈ 1.9` the Amdahl ceiling `S = 1/((1−p)+p/A)` is **~1.0–1.1×** — even a *free* O(1) optical MVM core. **A correct router refuses photonic almost everywhere**, which is itself the result. Methodology (`rd-0117-workload-crossover-proof.mjs`, W1–W6): reuse fixpoint reproduces Meech ~1.94×; the governance regime (n≤256, density 0.3–0.7, reuse=1) lands 100% digital; the dense/high-reuse regime (S3) *can* win (rule not vacuous) but is off the governance regime; safe-floor preserved over the full (n,N,R) sweep.

## 5) ORDERED BUILDABLE PLAN — steps 1–7 CPU-now, only step 8 HW-gated

| # | Step | Effort | CPU-now? |
|---|------|--------|----------|
| **1** | **Ship `rd-0117-safe-floor-theorem-proof.mjs`** (P1–P4) — locks the theorem before any wiring | **S** | ✅ **DONE (15/15)** |
| 2 | Wiring Edits A–E (`c_wl_ns`, `reuse`, amortized `Tphotonic`, crossover helpers, `decide()` thread) | M | ✅ |
| 3 | Audit Edits G–H (`crossoverN`/`reuse`/`reuseToWin` on `Decision`+`ExecutionDecision`) | S | ✅ |
| 4 | Extend the 25/25 cost-model proof with an M8 reuse block (R=1≥shipped · monotone-in-R · identity over 5k pts · 0 floor-violations · band [21,29]) | S | ✅ |
| 5 | Re-run step-1 proof post-wiring — must stay GREEN (the wiring's own regression gate) | S | ✅ |
| 6 | Ship `rd-0117-workload-crossover-proof.mjs` (W1–W6) — measure the negative | M | ✅ |
| 7 | Instrument `tmacVector`/`reach.ts` for real (n, density, reuse) → feed measured `p` into W3 | M | ✅ |
| 8 | Pin the absolute photonic constants to a real device | — | **HW-gated (0110 #10 only)** |

Steps 2–7 are owner-gated next builds; until step 8 all photonic constants stay labelled aspirational and **no measured speedup is claimed** — the floor is structural and survives the constants being wrong.

## 6) PAPER / DEFENSIVE-PUB NOTE (measured-negative only)

Two publishable artifacts, both negatives, consistent with the no-new-crypto/no-new-science posture (0 patents): (1) **the Safe-Floor Theorem** — a governed per-op accelerator router *provably never slower than its digital baseline by construction*, with a machine-checkable proof importing the real shipped code (the guarantee is what survives when the speedup does not); (2) **the Amdahl measured-negative** — on LogicN's governed-dataflow shape, p≈0 and matrices are small/sparse/reuse-1, so even a free optical core is capped near ~1.0–1.1× and a correct router refuses photonic almost everywhere (novel because measured on *LogicN's workload*, not optics — the optical ceiling is already published: McMahon 2023; Meech arXiv:2308.01719). Claims discipline: report relative dominance + the structural floor only; label `c_wl_ns` and all `NS` constants Tier-B aspirational; the band `[21,29]` is conditional on the aspirational weight-load rate while its *structure* is invariant.

**BOTTOM LINE.** 0110 = the WHEN, the Tri-Pipe = the HOW; 0117 is the JOIN. The shipped router is a **safe lower bound** on the optimal rule — it can leave wins unclaimed but never breaks the digital floor (Safe-Floor Theorem, now a green runtime gate). Wiring `reuse` reclaims only the thin band n∈[21,29] and is inert in the TritMesh governance regime; the corpus measurement shows that regime is all there is (p≈0 ⇒ ~1.0–1.1× Amdahl ceiling). The value is **formalizing + measuring, not claiming a speedup.**
