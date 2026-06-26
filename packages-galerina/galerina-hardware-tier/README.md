# @galerina/hardware-tier

The **Tri-Pipe topology** for Galerina: a cached, **attested** `hardware()` capability directive
`{binary | hybrid | photonic}` plus the **per-tier package loader** that selects which `BridgeRegistry`
answers the engine's dispatch — **photonic > hybrid > binary**, with the owner's fall-through *"clearly
photonic if not hybrid if not binary"* and **binary as the unconditional floor**.

> **Two orthogonal axes.** AXIS-1 (this package) is a *capability preference* — it picks the **package**.
> AXIS-2 (the 0053 `route()` in `@galerina/ext-photonic-emulator`) decides, **per kernel**, whether to
> actually offload. Preference **never forces** compute onto photonics: a crypto / control-flow / small /
> vote-infeasible kernel runs the binary-fallback bridge regardless of tier. **Worst case == binary ==
> identical to today.**

> **Fail-closed & neutral.** UNKNOWN or UNATTESTED capability ⇒ `binary` (the K3 dead-zone collapses to
> DENY → binary, `SPORE-HW-004`). The directive is derived from the **attested** `manifest.hardwareIdentity`
> behind `verifyAttestation` — never from the gameable self-claimed `nativeAvailable` boolean. This package
> stays neutral (no `node:crypto`, no Tower dependency): the caller runs `verifyAttestation` (the Tower's
> **bridge** attestation surface — not the audit surface) and passes the `ok` result in.

## API

| Export | Role |
|---|---|
| `resolveHardware({ targetId, attestationVerified, componentFullyEligible })` → `Tier` | The directive resolution order (spec §1.2), pure + total + fail-closed. |
| `resolveHardwareFromIdentity({ hardwareIdentity, … })` | As above, normalizing a manifest `hardwareIdentity` → targetId first. |
| `HardwareDirective` | The **cached**, deployment-stable directive (resolve once; `invalidate()` = re-attestation). `capabilityPreimage()` is the wall-clock-free pre-image that hashes into the Passive Execution Plan's `planHash`. |
| `HARDWARE_TIER_PROFILES` | The tier MAP, mirrored from `HARDWARE_TRUST_PROFILES` (`type-registry.ts:455-505`). |
| `selectTier(registries, requested)` / `createTierLoader(registries, resolveTier)` | The loader: photonic > hybrid > binary fall-through; returns the `BridgeRegistry` to inject via `createHybridEngine({ bridges })` — **no Tower edit**. |

## Resolution order (spec §1.2)

```
hardware() :: () -> 'binary' | 'hybrid' | 'photonic'         // cached, deployment-stable
  1. read attested manifest hardwareIdentity → targetId
  2. attestation verified?            → NO  ⇒ 'binary'        (UNATTESTED — the floor)
  3. profiles.get(targetId)           → undefined ⇒ 'binary'  (UNKNOWN ⇒ K3 DENY, SPORE-HW-004)
  4. requiresAttestation && !verified ⇒ 'binary'             (defensive)
  5. AcceleratorPlane && fully-eligible ⇒ 'photonic'         (the preference ceiling)
  6. AcceleratorPlane (whole component) / ExecutionPlane ⇒ 'hybrid'
  7. else (GovernancePlane / ExperimentalPlane) ⇒ 'binary'
```

## Honest nuance (spec §4)

For **whole components**, photonic ≈ hybrid **converge** — control flow + crypto are always present, and the
0053 router proves crypto/control kernels **never** offload (crypto-on-core). So a whole `<component>-photonic`
package cannot exist; it degrades to **`-hybrid`** (digital core + photonic-offloaded *eligible* kernels). A
true `-photonic` package exists **only** for fully-eligible pure-tensor / governance-reduction components.

- **REAL / honest-core:** the topology, the directive resolution + fail-closed defaults, the orthogonal
  compose with 0053's structurally-proven never-a-slowdown.
- **ASPIRATIONAL (labelled):** the photonic per-op latencies priced by `Tphotonic` are conservative
  Meech-anchored envelopes — **no measured speedup without a named PIC.**

## Proofs

```
npm test          # 14 node:test cases (H1–H5 directive, the loader/selection contract, O1–O4 orthogonality)
npm run prove     # re-runnable prove-own-maths, exit 0 (H1–H5 + O1–O4; O1 sweeps 12,288 products)
```

Discharges the 0054 spec's design-added obligations (§1.4 H1–H5, §5 O1–O4) against this package's compiled
code. Composes `@galerina/ext-photonic-emulator`'s `route()`/cost model for the AXIS-2 sweep.

License: Apache-2.0.
