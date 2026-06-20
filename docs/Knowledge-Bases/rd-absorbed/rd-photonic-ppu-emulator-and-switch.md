# Photonic PPU — emulator + cost-model + switchable-package (R&D 0053, absorbed 2026-06-20)

> **Source:** `LogicN-R-AND-D/_session-bridge/done/0053-photonic-ppu-emulator-and-cost-model.done.md`
> + proofs `scripts/rd-photonic-ppu-emulator-proof.mjs` (**D1, 18/18**) and
> `scripts/rd-photonic-ppu-cost-model-proof.mjs` (**D2, 25/25, imports D1**) + spec
> `photonic-tri-governance/photonic-ppu-switchable-package-spec.md`. **Hub-verified 2026-06-20:** both
> proofs re-run independently, exit 0. Governs under the **Bifurcated Execution Invariant**
> (`architecture-charter.md` §Future-Capable Compute). Builds on the earlier hub spike (11/11).

## What it is
The Rung-2 **physics-faithful photonic emulator** (replaces the perfect `TPLSimulator` stub) + the
**partition cost-model/router** that drives a `target.photonic` switch — as a **switchable package**:
the digital path stays the **default and byte-unchanged**; eligible kernels only route to a *separate*
photonic backend, behind the existing bridge-attestation + `substrate {}` tolerance contract,
**fail-closed to digital**. This is the production-bound proof-and-design; the package + selector are the
remaining (owner-gated) production edits.

## Proven (computed vs independent ground truth)
- **Emulator (D1):** converges to the exact digital product in the high-SNR/more-bits limit (residual ≤ LSB/2);
  **MC variance == first-principles closed form** `Var = σ_phase²·Σa² + σ_readout²`, and N-modular voting cuts
  it by exactly 1/N; the **precision wall is DEMONSTRATED** — RMS-vs-bits flattens at the cited **~8-bit ENOB
  knee** (past it, more ADC bits buy nothing); WDM crosstalk is **energy-bounded** (row-stochastic coupler,
  drift 6e-16); Freivalds catches a corrupted matmul 100% at k=20, **4.3× cheaper** than the op; **fail-closed**
  (a noisy lane pBad≥0.5 cannot vote into tolerance → refuse; a confident K3 DENY **never flips OPEN**, P≈3e-138).
- **Router (D2):** absolute-ns model (DAC + optical MAC + ADC + Freivalds + voting), constants anchored to
  **Meech 2023** (ideal 9.4×, realized 1.91× after the conversion tax); closed-form crossover
  **n\* = (c_opt + c_verify·k)·N / c_d**; over an **exhaustive sweep n=1..4096 × N∈{1,3,9,25} → 0 mis-routes,
  0 slowdowns** (worst case = stayed digital); the **Lane-A 0.87× wash reproduced in ns** → the router REFUSES
  it; **crypto / control-flow / `lane:digital` stay digital regardless of size** (crypto-on-core eligibility gate).

## Key findings (carry forward)
1. **The shipped noise model is DISCRETE** (trit-flip + NMR tail) — a physics-faithful emulator must **add**
   the continuous SNR/ENOB/quantization + WDM-matrix layer (D1 does); it cannot be copied from the repo.
2. **The switch is a registry key, not a rewrite.** The Brain→Brawn dispatch is already a registry lookup
   (`hybrid-engine.ts:489` `bridges.get(decision.precision)`); **`SubstrateLane="photonic"` is already shipped**
   (`substrate-inference.ts:28`, `LANE_PROFILES.photonic`). The governance side of photonic exists.
3. **The ffsim tolerance-backend manifest path is the ready-made template** for a non-bit-exact backend
   (`determinismMode:"tolerance"` + `ToleranceWitness` = calibration-as-attestation).
4. **ADC quantization is a systematic floor voting cannot beat** — fixed by more bits, not more votes; this is
   why `requiredRedundancy()` returns Infinity for a coarse-ADC lane → refuse.

## GAP — the remaining production edits (owner-gated; design + interfaces proven, not yet wired)
1. The **`logicn-ext-photonic-emulator`** package (the D1 emulator behind the `InferenceBridge` contract).
2. The **`PartitionDecider`** selector (= D2 `route()`) + the **net-win cost gate** between the router and
   `bridges.get(...)`.
3. The post-`execute` **Freivalds re-verify hook** (fail-closed to digital on out-of-tolerance).
Closest shipped precedent: the `BridgeDomain` discriminator + the ffsim tolerance-backend path.

## EXCLUDED (HW-gated — recorded with reason)
Measured silicon MAC speedup; the real PHASE_GAIN/XTALK/READOUT noise floor; the real coupler S-parameter
WDM matrix. The ns figures are **aspirational envelopes** (Meech-anchored), not measurements; the only measured
datapoint remains the Lane-A 0.87× wash (reproduced structurally). No speedup claimed without a named PIC.
