# Tri-Pipe `hardware()` directive + per-tier packages (R&D 0054, absorbed 2026-06-20)

> **Source:** `Galerina-R-AND-D/_session-bridge/done/0054-hardware-capability-directive-and-per-tier-packages.done.md`
> + spec `photonic-tri-governance/tri-pipe-per-tier-packages-and-hardware-directive-spec.md`.
> **Hub production:** built 2026-06-20 as `packages-galerina/galerina-hardware-tier` (directive + loader +
> H1–H5/O1–O4 proofs). Builds on [[rd-photonic-ppu-emulator-and-switch]] (0053). Owner-directed.

## What it is

The owner's Tri-Pipe (Binary / Hybrid / Photonic) realized as **two orthogonal mechanisms over the
EXISTING one-router / N-bridge seam** — NOT three CPUs/lanes (0009 rejected that framing), NOT a
re-architecture:

1. **D1 — `hardware()` passive directive.** A cached capability value `{binary|hybrid|photonic}`, resolved
   ONCE at boot/admission, **ATTESTED** (derived from `manifest.hardwareIdentity` behind
   `verifyAttestation`, not the self-asserted `nativeAvailable`), reused as a Passive Execution Plan input.
   Cache-invalidation = re-attestation. Deployment-stable (rides the `planHash` pre-image, `generatedAt`
   stripped). Binds the **BRIDGE** attestation surface (`logicn.bridge.manifest.v1`), NOT the audit surface.
2. **D2 — per-tier package topology.** One interface (`InferenceBridge`), three peer packages per component
   (`-binary`/`-hybrid`/`-photonic`), each shipping a `BridgeRegistry`. A loader selects by cached
   `hardware()`: **photonic > hybrid > binary**, fall-through, binary the unconditional floor. Injected via
   `createHybridEngine({ bridges })` — **no Tower change** (the dispatch key stays `decision.precision`;
   the capability axis is a SECOND discriminator composed on top — do not conflate them).

## Resolution order (§1.2) + fail-closed

`!attested ⇒ binary` · `profiles.get(target)=undefined ⇒ binary` (K3 DENY, SPORE-HW-004) ·
`requiresAttestation && !verified ⇒ binary` · `AcceleratorPlane && fully-eligible ⇒ photonic` ·
`AcceleratorPlane(whole)/ExecutionPlane ⇒ hybrid` · else `⇒ binary`. The tier MAP mirrors
`HARDWARE_TRUST_PROFILES` (`type-registry.ts:455-505`): cpu/wasm=GovernancePlane(binary);
gpu/npu/intel/amd/arm=ExecutionPlane(hybrid); photonic/neuromorphic=AcceleratorPlane+requiresAttestation
(photonic); quantum=ExperimentalPlane (out of 0054's scope ⇒ binary).

## The two axes compose orthogonally (proven)

AXIS-1 (capability **preference**) picks the package; AXIS-2 (the 0053 `route()` per-kernel **net-win**
gate) decides whether to actually offload. **Preference NEVER forces compute onto photonics:** a
crypto / control-flow / small / vote-infeasible kernel runs the binary-fallback bridge regardless of tier.
**Worst case == binary == today.** Proven (hub `prove-hardware-tier.mjs`, 9/9): H1 total+fail-closed ·
H2 deployment-stable idempotence · H3 attested-not-asserted · H4 monotonicity (photonic≻hybrid≻binary) ·
H5 K3→DENY · O1 product ≤ Tdigital (12,288 tier×kernel sweep, 0 over) · O2 preference-no-force-offload ·
O3 fall-through · O4 whole-component convergence to `-hybrid`.

## Honest nuance (§4) — the DOMINANT real story

Whole components **converge** photonic ≈ hybrid: control flow + crypto are always present (every component
runs validate/capability steps), and 0053 M5 proves crypto/control kernels NEVER offload. So a whole
`<component>-photonic` package **cannot exist** — it degrades to **`-hybrid`** (digital core +
photonic-offloaded *eligible* kernels). `-hybrid` is the DOMINANT real package; `-photonic` is a true
distinct package ONLY for fully-eligible pure-tensor / governance-reduction components.

## Hub production mapping

| Spec piece | Hub artifact |
|---|---|
| D1 `hardware()` directive + cache | `galerina-hardware-tier/src/hardware-directive.ts` (`resolveHardware`, `HardwareDirective`) |
| Tier MAP | `galerina-hardware-tier/src/trust-profiles.ts` (mirrors type-registry.ts:455-505) |
| D2 loader + selection contract | `galerina-hardware-tier/src/tier-loader.ts` (`selectTier`, `createTierLoader`) |
| `-binary` tier | `createStubRegistry()` (shipped, byte-unchanged) |
| `-photonic` tier | `galerina-ext-photonic-emulator` (0053, built) |
| `-hybrid` tier | modeled on `galerina-ext-bridge-cpp` (`createCppBridgeRegistry`) |
| H1–H5 / O1–O4 proofs | `galerina-hardware-tier/scripts/prove-hardware-tier.mjs` + `tests/*` |

## EXCLUDED (carried)

Real-PIC packaging / measured photonic latency (HW-gated, no named PIC; `Tphotonic` = aspirational
Meech envelopes); whole-component `-photonic` (converges to `-hybrid`); the `quantum` tier (separate
Tier-3 toxic-border PQ path); audit-surface attestation binding (wrong surface — bind the bridge surface).
