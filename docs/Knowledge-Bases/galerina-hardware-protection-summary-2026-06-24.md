# Hardware protection in Galerina — what is BUILT vs R&D'd (2026-06-24)

**Question answered:** *"Did we put anything in to protect hardware, and did we R&D it?"* — **Yes to both.** There is a real, enforced-today hardware-protection spine on bit-exact silicon, plus a large R&D/design corpus for the substrate/cyber-physical tiers. This doc consolidates it (the protections were scattered across packages + KB docs).
**Posture:** fail-closed, deny-by-default, crypto-on-core (SPORE-SUBSTRATE-001) — "Govern, Don't Absorb": the trusted core never absorbs analog/exotic-substrate physics; it admits/denies hardware as a *signed, governed capability*.

---

## 1) BUILT + ENFORCED TODAY (digital, on bit-exact silicon)

| Protection | Where | What it stops |
|---|---|---|
| **Hardware-tier fail-closed attestation** | `galerina-hardware-tier/src/hardware-directive.ts` (`resolveHardware`), `trust-profiles.ts` | An **unattested or unknown** hardware accelerator never rises above the **binary** floor. Strict boolean identity (`attestationVerified !== true ⇒ binary` — a string `"false"`/`{}`/`1` from a JSON round-trip cannot coerce-pass); unknown `targetId ⇒ binary` (K3 DENY, `SPORE-HW-004`). Only an *attested* AcceleratorPlane reaches hybrid/photonic. Binary == today is the structural floor. |
| **SPORE-RETAIN-001 sound-erasure gate + signed eraseModel rail** (R&D 0116/0118) | `galerina-tower-citizen/src/substrate-erasure.ts` (`admitSubstrateWrite`, `admitStorageSubstrate`) | A new storage drive cannot **silently break the data-deletion guarantee**: overwrite-erasure is unsound on write-once/fixed media (WORM glass / fixed holograms). An eraseModel is **never** taken from a drive's self-report — `overwrite` needs a verified Ed25519-signed `storage.admit` attestation, else fail-closed to `crypto-only` (a lying drive can't downgrade itself); a cleartext secret to crypto-only media is DENIED. 20/20 tests. |
| **Photonic-admission signed-config 4-gate rail** (R&D 0108) | `galerina-tower-citizen/src/photonic-admission.ts` (`admitPhotonicConfig`) | A **hot-swap of the transformation/mesh-config blob** that reprograms a photonic co-processor is admitted as **signed code** (hash-pin + Ed25519 + revocation + capability, deny-by-default) BEFORE the PPU reprograms — closing the unsigned-reprogram code path that result-verification alone can't catch. |
| **Substrate noise/fault model + tolerance contracts** | `galerina-tower-citizen/src/substrate-model.ts` (SPORE-SUBSTRATE-001..004) | Photonic/ternary substrate noise is governed **degrade-only** (`vAnd` — availability-not-safety: noise can cost availability, never silently flip a verdict to ALLOW). Closed-form von Neumann NMR is the canonical check. |
| **Safe-Floor Theorem** (R&D 0117) | `galerina-tri-pipe` ExecutionRouter + `galerina-ext-photonic-emulator` PartitionDecider; proof `rd-0117-safe-floor-theorem-proof.mjs` (15/15) | A hardware accelerator can **never make a flow worse than all-digital** — `realized_cost ≤ Tdigital`, strict on the single photonic branch; the router fails safe to digital on every uncertain/garbage/ungranted path. Worst case == binary == today. |
| **Calibration-as-attestation** (R&D 0057) | `galerina-ext-photonic-emulator/src/photonic-bridge.ts` (`calibrate()`) | The hardware ToleranceWitness now binds a **MEASURED** band (real bifurcated-parity sweep), not a hardcoded literal; a lane that is not bifurcation-conformant is **refused** (never attests a divergent lane). |
| **Bridge attestation (signed manifest)** | `galerina-tower-citizen/src/bridge-attestation.ts` | The native/hardware execution bridge (Brain/Brawn FFI seam) verifies a signed manifest before trusting a backend; revocation-registry + trust-anchor pinning enforced. |

**In one line:** plugging in new hardware (an accelerator, a WORM drive, a photonic co-processor) cannot silently gain trust, reprogram the substrate, or break a guarantee — every hardware capability is a **signed, revocable, deny-by-default admission** that fails closed to the binary floor.

## 2) R&D'd + DESIGNED (not built; gated on real silicon #102-106 or owner)

| Design | KB doc | Status |
|---|---|---|
| **ASIC cyber-physical shielding** — `contract.target { cyber_physical_hardening {} }` grammar | `galerina-asic-cyber-physical.md` | design proposal |
| **DRCM (Deterministic Runtime Containment Model)** — 7-module containment, DSS bootstrap via a Wasmtime TCB, V_DPM in linear memory, `step`-isolated DWI | `galerina-drcm.md`, `galerina-drcm-phase1-specs.md` | locked design, tasks #30-#44 pending |
| **Hardware-as-capabilities** — hardware features admitted as governed capabilities | `galerina-hardware-as-capabilities.md` | design |
| **Cross-layer resilience matrix** — physical + mathematical + economic invariants, fault strategies | `galerina-cross-layer-resilience.md` | design |
| **Photonic-PPU virtualisation** — govern real photonic HW without bottlenecking software (PPU co-processor, crypto stays digital) | `galerina-photonic-ppu-virtualisation.md` | proven claims (no-HW rungs), HW-gated |
| **Future substrates** (photonic / quantum / holographic) — all "Govern, Don't Absorb", integrity anchor stays digital | `galerina-hardware-future-substrates.md`, RD-0110..0118 | refute-and-park / track / HW-gated |
| **Per-vendor hardware compatibility** (AMD / Apple / ARM / Google) + the compatibility matrix | `galerina-hardware-{amd,apple,arm,google}.md`, `galerina-hardware-compatibility-matrix.md` | reference |
| **TOCTOU medium-binding** (bind an attestation to a *live* medium via TPM/DICE/SPDM re-challenge) | RD-0118 §3 residual | genuinely HW-gated (the one open hardware primitive) |

## 3) The honest hardware-threat boundary (no overclaim)

What is **real today** is the *governance/admission* spine — all on bit-exact silicon, all fail-closed. What is **not** real and must not be overclaimed: there is no runtime hardware root-of-trust binding an attestation to a *live* physical medium (so the physical-swap TOCTOU of RD-0118 is open until a TPM/DICE/SPDM seam exists, #102-106); the photonic/quantum/holographic substrates themselves are emulated (Rung-2), not silicon, so no *measured* hardware speedup is claimed; and the in-RAM secret zeroize is best-effort on a GC VM. The protection is that **uncertainty always collapses to the binary floor** — the worst case is always "ran on trusted digital silicon, today."

**See also:** [`galerina-rd-0118-retain-hardware-directive-2026-06-24.md`](galerina-rd-0118-retain-hardware-directive-2026-06-24.md) · [`galerina-rd-0117-hybrid-join-2026-06-24.md`](galerina-rd-0117-hybrid-join-2026-06-24.md) · [`galerina-rd-0116-holographic-storage-2026-06-24.md`](galerina-rd-0116-holographic-storage-2026-06-24.md) · [`galerina-drcm.md`](galerina-drcm.md) · [`galerina-asic-cyber-physical.md`](galerina-asic-cyber-physical.md).
