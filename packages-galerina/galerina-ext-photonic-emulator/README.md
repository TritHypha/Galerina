# @galerina/ext-photonic-emulator

A **physics-faithful (Rung-2) photonic-PPU backend** for Galerina: a noise-carrying MZI-mesh /
micro-ring **ternary-MAC emulator** plus the **partition cost-model router** that decides, per
kernel, whether to offload to it. It plugs into the neutral Brain/Brawn contract
(`@galerina/inference-bridge-contract`) — the same contract the stub ternary bridge and the native
cpp/quantum bridges implement.

> **Digital stays the default and is byte-unchanged.** An eligible kernel routes to the emulator
> **only on a proven net win**, and every photonic result is **re-verified**. Anything that is
> ineligible, not a net win, unattested, or out-of-tolerance lands on the **unchanged digital
> path**. The photonic backend can only ever *add* speed on a proven-win eligible kernel — it can
> never subtract it or corrupt a result. **Fail-closed to digital, everywhere.**

> **EMULATED, not silicon.** Every result reports `executedNatively = false` and
> `deterministic = false`. The ns cost model is a **conservative aspirational envelope** anchored to
> Meech 2023 (ideal optical 9.4× / median realized 1.9× after DAC/ADC). **No measured speedup is
> claimed without a named PIC.** `crypto-on-core`: crypto / control-flow never offload.

## What's inside

| Module | Role |
|---|---|
| `emulator.ts` | D1 device-physics ternary MAC: per-element MZI phase-drift gain noise, photodiode shot+thermal readout noise, finite-ADC quantization, N-modular voting, the WDM row-stochastic crosstalk coupler, and the substrate-math closed forms. |
| `partition-decider.ts` | D2 router: the absolute-ns cost model (`Tdigital`/`Tphotonic`/`crossover`), `requiredRedundancy()` from D1's closed-form variance, and `PartitionDecider.decide()` — default digital, photonic only on a proven win, crypto-on-core eligibility gate, fail-closed. |
| `freivalds.ts` | Verify-cheap, never re-execute: Freivalds O(k·n²) GEMM check + a scalar tolerance bound check. |
| `photonic-bridge.ts` | `PhotonicEmulatorBridge implements InferenceBridge` — the emulator behind the contract, with a `determinismMode:"tolerance"` manifest that passes the shipped `validateManifestShape` only when fully pinned + witnessed. |
| `runner.ts` | `PhotonicRuntime` — the LOAD → decide → exec → re-verify → **fall-back** runtime path, demonstrated end-to-end without the Tower. |

## Proven maths (computed vs ground truth)

Ports — and re-proves against this package's own compiled code — the prove-own-maths artifacts:

- **D1 emulator** — `Galerina-R-AND-D/scripts/rd-photonic-ppu-emulator-proof.mjs` (18/18): converges to
  the exact digital product in the high-SNR/more-bits limit (≤ LSB/2); Monte-Carlo variance ==
  `Var = σ_phase²·Σa² + σ_readout²` and the N-vote cuts it by exactly 1/N; the **precision wall is
  demonstrated** (RMS-vs-bits flattens at the cited ~8-bit ENOB knee); WDM crosstalk is
  energy-bounded; Freivalds catches an out-of-tolerance product (≥ 1−2⁻ᵏ); a degraded lane fails closed.
- **D2 router** — `Galerina-R-AND-D/scripts/rd-photonic-ppu-cost-model-proof.mjs` (25/25): an
  absolute-ns crossover `n*`; the router **refuses below n*, offloads above, with 0 slowdowns over an
  exhaustive n=1..4096 × N∈{1,3,9,25} sweep**; crypto/control-flow gated off; fail-closed to digital.

```
npm run build && npm test     # 25 node:test cases (the D1/D2/bridge/runner properties)
npm run prove                 # re-runnable prove-own-maths, exit 0 iff all pass
```

## Honest scope / EXCLUDED (HW-gated)

- Real PIC (Rung 4) and any **measured** photonic speedup — needs a named PIC (Lightmatter/Q.ANT/…).
  The ns figures are aspirational envelopes, not measurements; the only measured datapoint remains the
  Lane-A ~0.87× wash (reproduced structurally, not re-measured).
- The real PHASE_GAIN/XTALK/READOUT noise floor and the real coupler S-parameter WDM matrix — the
  emulator's floor is a conservative model, a calibration/attestation obligation (`ToleranceWitness`),
  not silicon.

## Integration status

This is the **standalone backend package** (R&D task 0053 GAP, items §3/§2.1/§4). The **Tower-side
wiring** — the photonic dispatch path inside `hybrid-engine.ts` that routes via the decider and
re-verifies via Freivalds/tolerance *instead of* the bit-exact ternary determinism oracle (an honest
photonic ternary result correctly fails `assertDeterminism`) — is a separate, deliberately-reviewed
change. Until then this package is fully usable and tested on its own via `PhotonicRuntime`.

License: Apache-2.0.
