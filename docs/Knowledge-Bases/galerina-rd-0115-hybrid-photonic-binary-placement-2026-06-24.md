# R&D 0115 — Optimal hybrid photonic/binary placement: joining 0110's cross-over math to the shipped ExecutionRouter

**Date:** 2026-06-24 · **Workflow:** `wjx7k0y8g` · **Status:** R&D record (design/measurement plan; no build)
**Posture:** verify-before-build · trust the math · fail-safe to digital · crypto-on-core (SPORE-SUBSTRATE-001)
**Companion docs:** [`galerina-rd-0110-photonic-matmul-refutation-deepened-2026-06-24.md`](galerina-rd-0110-photonic-matmul-refutation-deepened-2026-06-24.md) · [`galerina-photonic-ppu-virtualisation.md`](galerina-photonic-ppu-virtualisation.md) · [`galerina-rd-0113-tower-citizen-deepened-2026-06-24.md`](galerina-rd-0113-tower-citizen-deepened-2026-06-24.md)

> Owner ask: "did 0110 look at the hybrid option where we can switch between photonic and binary for the best placement of maths/use?"

---

## 1) DIRECT ANSWER

**No — not fully. 0110 gave the math (WHEN); the shipped Tri-Pipe is the switch (HOW); they were never *joined* and never *measured together*.**

- **0110 = the WHEN** — the cross-over inequality `reuse·core_saving > conversion_overhead`, the Θ(N²) work/area/energy refutation, latency-O(1) vs work-O(N²), Meech's ~1.94× measured median (arXiv:2308.01719).
- **The shipped Tri-Pipe = the HOW** — `ExecutionRouter` + `PartitionDecider` already decide per-op placement, fail-safe to digital, with a net-win cost gate.

## 2) THE SHIPPED SWITCH IS REAL, SOUND, AND FAIL-SAFE

`ExecutionRouter.route()` (`galerina-tri-pipe/src/execution-router.ts:96-141`) composes **three axes** into one pure, deterministic decision, plus a deny-by-default cap-gate:

- **Axis-1 capability tier** (`galerina-hardware-tier/src/hardware-directive.ts:40-60`) — fail-closed by construction: `attestationVerified !== true ⇒ binary` (strict boolean identity, so a JSON-round-tripped `'false'`/object/`1` cannot coerce-pass); unknown `targetId ⇒ binary` (K3 INDETERMINATE→DENY, SPORE-HW-004). Only an attested, fully-eligible AcceleratorPlane reaches photonic. **Binary is the structural floor.**
- **Axis-2 precision** — `routePrecision(opClass, routing)`.
- **Axis-3 per-kernel offload** (`galerina-ext-photonic-emulator/src/partition-decider.ts:109-146`) — only *considered* when `offloadEligible = (tier∈{hybrid,photonic}) && precision==='ternary'`; otherwise `target=digital`. Deny-by-default: crypto / control-flow ⇒ digital (SPORE-SUBSTRATE-001); non-finite / n<1 ⇒ digital; systematic ADC-quant floor exceeding tolerance ⇒ digital **regardless of caller redundancyN** (SPORE-SUBSTRATE-003); cannot-vote ⇒ digital. Photonic returned **only** when an absolute-ns model proves `t_phot < t_dig`.
- **Cap-gate** (`execution-router.ts:89-130`) — `laneIsGranted` is deny-by-default: digital always granted (safe floor); a non-digital lane survives only if allowed by **both** the grant allow-list **and** the cap predicate (ANDed). An ungranted net-win lane collapses to `{target:digital}` — never throws, never routes to an ungranted lane.

**Worst case == binary == today: verified.** Ran `Galerina-R-AND-D/scripts/rd-photonic-ppu-cost-model-proof.mjs` on the repo i9 / node: **25/25 PASS, exit 0** — including M2d "never a slowdown" (0 cases where routed cost > digital over a 4096-n × {1,3,9,25}-N sweep) and M2c (0 mis-routes; photonic chosen 15620×, digital 764×).

## 3) THE PROMPT'S SUSPECTED GAP IS REFUTED — and the REAL gap identified

**Does the router count DAC/ADC conversion cost? YES — refuting the hypothesis.** `Tphotonic` charges `(c_convIn + c_convOut)·n` (`partition-decider.ts:98`); `meechRealizedRatio()` (lines 66-72) reproduces Meech's ~1.9× realized after DAC/ADC; the closed-form crossover is `n* = (c_opt + c_verify·k)·N / c_d` (line 103). The conversion tax IS modeled and IS what dominates below `n*` (proof M7a: at n=8 photonic 546 ns ≥ digital 154 ns — the tax dominates).

**The real gap is REUSE.** The shipped crossover is a **single-application (reuse=1)** inequality keyed on `(n, N)`. 0110's `reuse·core_saving > conversion_overhead` amortizes the conversion **plus an unmodeled Θ(n²) weight-load** across many applications of the *same loaded matrix*. The shipped `KernelCost` (`partition-decider.ts:24-38`) has **no `reuse` operand and no weight-load term** — it implicitly fixes reuse=1 and, for the dense-N×N-map regime, under-charges the photonic side (it models the GEMV n³-vs-n² regime, where the O(n) conversion is correct, but conflates it with the matrix-map regime where weight-load is O(n²)).

**Why the gap is safe.** The missing reuse term would only ever make photonic look **better** (amortization) or charge it **more** (weight-load); the router fails safe to digital; and the absolute-ns net-win (`Tphotonic < Tdigital`) is *strictly more conservative* than the bare asymptotic `n*` (it adds the +O(n) convert + fixed handshake that `n*` drops). **So the shipped router can only refuse *more* often than the 0110 cross-over, never less. It is a safe lower bound on the optimal rule, not the optimal rule itself.**

**Optimal rule:** `vAnd(hardware attested, lane granted, precision ternary, eligible, can-vote, reuse·core_saving > conversion + weightload)`. The shipped router implements every conjunct **except the last**, substituting the reuse=1 single-call `n*` for it.

> ⚠️ `docs/Knowledge-Bases/galerina-photonic-crossover-analysis.md` is **STALE** (500M element-count heuristic, "Phase-44 pending", no ns model) — superseded by the PartitionDecider ns model. Do not cite it as the live rule.

## 4) THE AMDAHL BITE (the headline negative)

With offloadable fraction `p` and per-op acceleration `A`: `S = 1/((1-p) + p/A)`; free-core ceiling `S_max = 1/(1-p)`. Computed (Intel i9-9900K / node v24 / win32): **p=0.1→1.11×, p=0.3→1.43×, p=0.5→2.00×, p=0.9→10.0×.** The honest `A` input is **≤ ~1.9** (Meech *realized*, not the 9.4× ideal). Governed dataflow has **small p** and small/sparse governance matrices (the TritMesh regime: sparse / single-source / low-reuse — the **losing** side of `n*`), so even a *free* optical core is capped near **~1.1×**. That is itself the result: **the router will correctly refuse photonic almost everywhere.**

## 5) WHAT 0115 ADDS (net-new) + ORDERED PLAN — all CPU-doable, no PIC

| # | Action | Effort | Proves |
|---|--------|--------|--------|
| **1** | **Formalize the Safe-Floor Theorem** (hybrid ≥ all-digital) as a machine-checked invariant. `scripts/rd-0115-safe-floor-proof.mjs` importing the REAL `PartitionDecider`/`Tphotonic`/`Tdigital`: property-test `decide()` asserting `T_chosen ≤ Tdigital` for all inputs, and re-derive `n*` symbolically vs the numeric first-net-win sweep. Lift M2d from a 4096-point sample to an exhaustive/symbolic argument over the four default-digital branches + the cap-gate fallback (each a syntactic `return digital`). | **S** | Per-op safe-floor as a *tested theorem*, not a comment |
| **2** | **Wire 0110's cross-over as the router rule.** Add `reuse:number` + a `weightLoad_ns` Θ(n²) term to `KernelCost`; amortize `Tphotonic` → crossover `reuse·core_saving > conversion + weightLoad`. **Keep `reuse=1` as the conservative default** (omitted ⇒ 1, backward-compatible, still fail-safe). Optionally expose `crossover(N)` in `ExecutionDecision` so the audit trail records `n` vs `n*` and "reuse needed to win". | **M** (Tier-B constants until a named PIC) | The 0110 inequality becomes the named, auditable router rule |
| **2b** | **Degrade-on-overrun latch.** After a photonic offload, compare realized wall-time to `Tphotonic`; if realized > `Tdigital`, mark `(lane, op-class)` latency-untrusted → subsequent `decide()` fails closed to digital (a Freivalds-style timing assertion). Makes never-slower hold *empirically* even if the aspirational envelope is wrong. | **S–M** | Runtime half of the safe-floor; airtight without a PIC |
| **3** | **Measure the cross-over + Amdahl bound on a real Galerina workload** (0110 action #8, the one genuinely-unpublished sliver). Reuse sweep + Θ(n²) weight-load; reproduce ~1.94× at the amortized fixpoint on a named/seeded machine; instrument a governed-flow corpus for `p` and the TritMesh matrix distribution; show the governance regime lands on the **losing** side of `n*` and the router correctly stays digital. | **M** | Hybrid claims the dense/high-reuse win AND refuses the TritMesh regime — reproducible |

Only 0110 action #10 (a real PIC measurement) stays hardware-gated. No measured photonic speedup is claimed until a named PIC; the constants remain labelled aspirational (`partition-decider.ts:11-14`); the never-slower guarantee is the **structural** one, not a hardware number.

## 6) HONEST BOTTOM LINE

The hybrid is the **right design**: route per-op by a measured cross-over, fail-safe to digital. The shipped `ExecutionRouter` + `PartitionDecider` already implement it across three axes plus a deny-by-default cap-gate, and the safe-floor is **structural** — `T_hybrid ≤ Tdigital` pointwise, **worst case == binary == today** (0 slowdowns / 0 mis-routes on the repo i9). It can only ever HELP (≥ today); it can never make a flow slower. The router already counts the conversion tax; the real gap is **reuse**, and because the missing term only makes photonic look better or charges it more — and the router fails safe — the gap cannot break the floor, only leave wins unclaimed. **0110 tells the switch WHEN to flip; 0115 joins them** — formalize the safe-floor theorem, wire the reuse cross-over as the explicit rule, measure it on a real workload — all CPU-doable.

**Key files:** `galerina-tri-pipe/src/execution-router.ts` · `galerina-ext-photonic-emulator/src/partition-decider.ts` · `galerina-hardware-tier/src/hardware-directive.ts` · `Galerina-R-AND-D/scripts/rd-photonic-ppu-cost-model-proof.mjs` · (proposed) `Galerina-R-AND-D/scripts/rd-0115-safe-floor-proof.mjs`.
