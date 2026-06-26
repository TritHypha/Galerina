# @galerina/tri-pipe

The **Tri-Pipe capstone** — one governed engine, selected by hardware capability. `createTriPipeEngine()`
composes the three pieces of Galerina's photonic line into a single deployment call:

- **`@galerina/hardware-tier`** — the cached, **attested** `hardware()` capability directive (AXIS-1)
- **`@galerina/ext-photonic-emulator`** — the physics-faithful photonic backend + the 0053 net-win router (AXIS-2)
- **`@galerina/tower-citizen`** — the governed `HybridInferenceEngine` (the digital default)

```ts
import { createTriPipeEngine } from "@galerina/tri-pipe";

const { tier, photonicEnabled, engine } = createTriPipeEngine({
  targetId: "photonic",            // the attested hardware target
  attestationVerified: true,        // = verifyAttestation(att, policy).ok (NOT a self-claim)
  componentFullyEligible: true,     // pure tensor / no crypto-control
  // hybridBridges: createCppBridgeRegistry(),   // optional digital backend for hybrid/photonic tiers
  // kernelFor: (op) => ({ n: realDim, lane: "photonic", tolerance: 0.05 }),  // real kernel sizes
});
const receipt = await engine.infer({ prompt, correlationId });
```

## How selection works

`hardware()` resolves the tier `{binary | hybrid | photonic}` (attested, fail-closed). The tier then drives:

| Tier | Digital registry | Photonic offload port |
|---|---|---|
| `binary` (cpu/wasm, or unknown/unattested) | the in-package stub | **off** — purely digital |
| `hybrid` (gpu/npu, or whole components) | `hybridBridges` (or stub) | **on** — for net-win eligible kernels |
| `photonic` (attested photonic + fully eligible) | `hybridBridges` (or stub) | **on** — for net-win eligible kernels |

The capability tier is only the *preference* (AXIS-1) — it picks the package. The **0053 per-kernel net-win
router (AXIS-2) still decides each actual offload**, so a crypto / control-flow / sub-crossover kernel runs
digitally regardless of tier. **Preference never forces compute onto photonics; worst case == binary ==
identical to today.** Unknown / unattested capability ⇒ binary ⇒ no offload (fail-closed).

## Proofs

```
npm test       # 7 node:test — end-to-end through the real engine (binary→stub, hybrid/photonic→photonic
               #   backend, fail-closed unattested/unknown→binary, per-kernel gating still applies)
npm run prove  # the selection logic: tier == hardware() for every input; offload IFF offload-capable
               #   tier; fail-closed unattested/unknown → binary (exit 0)
```

## The Galerina Execution Router — one decision across all routing axes

Galerina's execution routing lived in three separate routers a caller had to consult individually.
`createExecutionRouter()` is the single front door that **composes** them (it re-derives no routing maths)
into one `ExecutionDecision`:

```ts
import { createExecutionRouter } from "@galerina/tri-pipe";
const router = createExecutionRouter();
const decision = router.route({
  opClass: "feedforward",
  routing: { governanceTier: 2, fp4HardwareAvailable: false, airGapped: false },  // precision context
  capability: { targetId: "photonic", attestationVerified: true, componentFullyEligible: true }, // tier
  kernel: { n: 1024, lane: "photonic", tolerance: 0.05 },                          // offload cost
});
// → { tier, precision, offloadTarget, photonic, reason }
```

| Axis | Source router | Decides |
|---|---|---|
| AXIS-1 capability tier | `hardware()` (`@galerina/hardware-tier`) | binary / hybrid / photonic |
| AXIS-2 precision technique | `routePrecision` (`@galerina/tower-citizen`) | ternary / fp4 / fp8 / fp16 |
| AXIS-3 per-kernel offload | `PartitionDecider` (`@galerina/ext-photonic-emulator`) | digital / photonic |

**Photonic IFF** offload-capable tier (hybrid/photonic) **∧** ternary precision **∧** the per-kernel
net-win router says photonic. A binary tier, a non-ternary precision (e.g. an fp16 sensitivity-critical
op), a crypto/control kernel, or any uncertainty ⇒ the **digital** path. Fail-closed; worst case == binary
digital == today. (`npm test` includes a property sweep proving `photonic` matches that conjunction exactly.)

License: Apache-2.0.
