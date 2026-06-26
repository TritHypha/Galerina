# High-value compute domains — can Galerina do anything? (2026-06-25)

Expands notes/62's "can we" list to the owner's high-value scientific/compute domains. Adversarially
verified (`wf wlh53trp9`, 20 agents) under the photonic-tri fences. **Domain names are kept verbatim as
the owner gave them.** Most domains **split by sub-kernel**: the *tolerant MAC part* can ride the governed
analog lane; the *exact part* must stay on the bit-exact digital lane.

## The one honest thing, repeated
Galerina governs a **tolerant analog MAC sub-kernel** as a **deny-by-default Tier-3 compute-only lane** —
route via `ExecutionRouter`, run on the **CPU photonic emulator today** (`executedNatively=false`),
Freivalds cheap-verify, fold the result as a **degrade-only K3 verdict** under a signed `toleranceWitness`
— **while every DECISION stays bit-exact on the binary core** (`decideAtBoundary`). For the "can-do"
domains the net-new deliverable is a **worked-example `.spore` cloned from `examples/gaming-substrate/` (#44)
+ a compute-only profile — NOT a new math kernel**. The rails all ship and pass on a normal CPU (no
silicon): `precision-strategy.routePrecision`, `partition-decider` (net-win + ∞-redundancy fail-closed),
`freivalds.ts`, `emulator.tmacPhotonic/tmacVoted`, `three-valued-governance.vAnd=min` (No-Coercion),
`substrate-model.toleranceWitness`.

## ✅ Can do something

| Domain (owner's words) | Verdict | ZT | What Galerina actually does | Fence that bites |
|---|---|---|---|---|
| **Weather prediction** | build | 86 | Governs the **ML-surrogate half** (GraphCast-style GNN/attention MAC, sensitivities ~0.3–0.6 → ternary/fp8 eligible) on the analog lane, Freivalds-verified, degrade-only K3 | The chaotic physics core → `requiredRedundancy=∞` → **REFUSED** (SPORE-SUBSTRATE-003); only the surrogate is eligible |
| **Finance / stocks** | build | 82 | Bigger win already ships: deterministic pricing/VaR/P&L stays **digital** under K3 admission + two-channel signed receipt + `.tmf` audit ledger; *plus* a covariance MVM on the compute-only analog lane | A price/Greek "to the penny" is bit-exact → digital; only the covariance contribution is analog-tolerant |
| **3D modelling** | build | 85 | Governs the **tolerant render/physics half** (transform batches, GI/AO accumulation, particle/soft-body steps), dense ternary/low-bit MAC, TMR-voted to a committed frame | Forbids CAD B-rep solids, watertight topology, deterministic replay, asset signing (all bit-exact) |
| **DNA computing / genomics** | track | 73 | Analog lane for the **tolerant similarity/embedding inner-products** (k-mer-embedding/score-matrix MVM, folding-energy MVMs); exact alignment/variant-calling stays digital | ~8-bit ENOB → only error-tolerant embedding/screening MAC, never exact scores |
| **Computational chemistry** | track | 66 | Analog lane for the **MD non-bonded force sub-kernel** only (dense pairwise-MAC), `calibrate()`-bound witness; the integrator stays digital | DFT/quantum-chem (SCF/eigensolvers) need fp64 → no analog win |
| **Algebra** *(tolerant low-precision matrix)* | track | 64 | Analog lane for **ternary/low-bit GEMM/MVM** (e.g. a BitNet weight matrix); default-digital, degrade-only, Freivalds-verified | High-precision / ill-conditioned / symbolic algebra stays digital (see Cannot) |
| **K3 (ternary) logic for intelligent API routing** | **already ships** | 94 | The literal admission/routing/feedback spine (notes/62 §2): `decideAtBoundary` (+1 allow / 0 deny-audited+SPORE-GOV-3VL-001 / −1 deny) + `ExecutionRouter.route` deny-by-default `vAnd` lane-gate + `telemetryToSideSignal` degrade-only self-throttle. **Net-new increment** = the `0→STEP-UP` (MFA/captcha) branch | Routing + JWT/OAuth verification stay binary bit-exact; no AI in the decision path |
| **Low-level quantum** | **already ships** *(governance)* | 90 | The deny-by-default, fail-closed **governed-backend gate for ffsim** (#199 — Hardened Border Stage-2 + Tower LOAD→TRAP→ERASE, 8-op allow-list, `maxSubspaceDim` governor). It **governs** the job; it does **not execute** ffsim (`executedNatively=false`, Phase 2 unbuilt) | Crypto stays digital (SPORE-SUBSTRATE-001); result admits degrade-only via a signed tolerance witness + QBER→K3 trit; never enters the `.tmf` ledger |

## ❌ Cannot (refuted — bit-exact required)

| Domain (owner's words) | Verdict | Why |
|---|---|---|
| **Number theory** (primes, factorization, modular arithmetic) | refute | Exact-integer domain — a ~8-bit-ENOB analog lane cannot represent a multi-bit residue; **any** error breaks correctness. Stays digital. |
| **Algebra — symbolic / high-precision** | refute | Bit-exact + **no kernel exists** in the tree (grep found none). The high-precision/ill-conditioned numeric case stays digital. |
| **Computational chemistry — DFT / quantum-chem core** | refute | SCF/eigensolvers need fp64; the ~8-bit-ENOB floor makes the analog lane useless → stays on the deterministic digital lane. |

## The fences (never move)
- **Crypto + bit-exact + determinism stay DIGITAL** (SPORE-SUBSTRATE-001; `partition-decider` derives crypto-eligibility authoritatively from `declaredEffects`, so a hostile `isCrypto:false` can't route crypto onto optics).
- **Optics is a precision-limited analog accelerator, ~8-bit ENOB** (`emulator.ts` `ENOB_CEILING=8`). **latency-O(1) ≠ work-O(1)**: Θ(N²) weight-load + Θ(N) DAC/ADC I/O; measured realized speedup **median ~1.9×** (Meech 2023), Amdahl-capped — never "instant / O(1) / unmatchable".
- **Governed as an untrusted Tier-3 compute-only lane**, deny-by-default, **degrade-only**: the analog result folds via `vAnd=min`, so it can only **False-DENY, never manufacture a False-ALLOW**.
- **No AI in the decision path.**

## Build note (if pursued, owner-gated)
Each "can-do" domain is a **worked-example `.spore`** cloned from `examples/gaming-substrate/` (the #44
template) declaring `substrate { lane: photonic; tolerance; redundancy }` for the tolerant sub-kernel +
an `@experimental_profile { compute_only }` capability fence (crypto/network/ledger denied by omission).
No new kernel, no silicon. The HW (a real PIC, native execution) is aspirational/Phase-2.

*Source: `wf wlh53trp9` (2026-06-25). Companion sweeps: `w33z54eq4` (photonic-noise counter/work-with),
`wvpc3yq6g` (the 17-NOs solutions). Feeds notes/62.*
