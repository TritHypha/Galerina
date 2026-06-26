# Photonic PPU — emulator + cost-model + switchable-package (R&D 0053, absorbed 2026-06-20)

> **Source:** `Galerina-R-AND-D/_session-bridge/done/0053-photonic-ppu-emulator-and-cost-model.done.md`
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

## GAP — the remaining production edits

**✅ BUILT 2026-06-20 (hub, iteration 1) — `packages-galerina/galerina-ext-photonic-emulator`** (new package,
depends ONLY on the neutral `@galerina/inference-bridge-contract` via the repo's relative-dist convention;
production/tower-citizen left byte-unchanged). Ports the proven D1+D2 maths into real TS + re-proves it
against the package's own compiled code (25 node:test cases + `npm run prove` 10/10, exit 0):
1. ✅ The **`galerina-ext-photonic-emulator`** package — `PhotonicEmulatorBridge implements InferenceBridge`
   (the D1 emulator: `emulator.ts`), `determinismMode:"tolerance"` manifest that passes the shipped
   `validateManifestShape` only when fully pinned + witnessed. Honest: `executedNatively=false`,
   `deterministic=false` (so `assertDeterminism` correctly THROWS on it — proving it can't masquerade as
   the bit-exact ternary path).
2. ✅ The **`PartitionDecider`** selector (= D2 `route()`, `partition-decider.ts`) + the **net-win cost gate**
   (default digital, photonic only on a proven absolute-ns win; crypto/control-flow gated off; fail-closed).
3. ✅ The post-`execute` **Freivalds re-verify hook** (`freivalds.ts`) + the `PhotonicRuntime` orchestrator
   (`runner.ts`) demonstrating the §4 path end-to-end: decide → exec → re-verify → **fall back to digital**
   on out-of-tolerance (verify-cheap, never re-execute).

**✅ DONE 2026-06-20 (Tower-side dispatch wiring):** `hybrid-engine.ts` now has an additive, opt-in,
off-by-default `photonic?: PhotonicConfig` — for a ternary op `dispatchPlan` consults the injected
`PhotonicOffloadPort` first, accepts a tolerance-verified hit WITHOUT `assertDeterminism` (the analog lane
is tolerance-verified, not bit-exact), and falls through to the unchanged digital dispatch on `null`
(ineligible/no-win/out-of-tolerance). NEVER consulted in certified mode. Adapter
`createPhotonicRouterPort()` ships in `galerina-ext-photonic-emulator`. tower-citizen 194/194 (default path
byte-unchanged), photonic 29/29.

**STILL OPEN (next):** certified-mode photonic admission (an attested/signed tolerance backend so the
photonic path runs under the certified profile too — today certified fail-closes to digital); the `-hybrid`
tier package (modeled on `galerina-ext-bridge-cpp`). Closest shipped precedent for the manifest side: the
`BridgeDomain` discriminator + the ffsim tolerance-backend path.

## EXCLUDED (HW-gated — recorded with reason)
Measured silicon MAC speedup; the real PHASE_GAIN/XTALK/READOUT noise floor; the real coupler S-parameter
WDM matrix. The ns figures are **aspirational envelopes** (Meech-anchored), not measurements; the only measured
datapoint remains the Lane-A 0.87× wash (reproduced structurally). No speedup claimed without a named PIC.
