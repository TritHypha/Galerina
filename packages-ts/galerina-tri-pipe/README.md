# @galerina/tri-pipe

Proposal, routing and composition only (RD-0855 §4.3). Tri-Pipe **cannot
authorise its own route**. Independent SLIDE admission and VOK lease are the
only later acts that may execute a proposed route.

`createTriPipeEngine()` resolves the attested `hardware()` capability tier and
returns a digest-bound **proposal**. It does not construct a
`HybridInferenceEngine` and does not dispatch.

```ts
import { createTriPipeEngine, dispatchTriPipeEngine } from "@galerina/tri-pipe";

const proposal = createTriPipeEngine({
  targetId: "photonic",
  attestationVerified: true,      // verifyAttestation(att, policy).ok
  componentFullyEligible: true,   // pure tensor / no crypto-control
  representationProfile: 1,       // RD-0855 scalar oracle; default 1
});
// proposal.kind === "PROPOSAL"
// proposal.authorityReleased === false
// proposal.dataBrand === "Trit"
// proposal.governanceBrand === "Verdict"
dispatchTriPipeEngine(proposal);
// → { refused: true, code: "ROUTE_DISPATCH_FORBIDDEN" }
```

## How selection works

`hardware()` resolves `{binary | hybrid | photonic}` (attested, fail-closed).
Unknown or unattested capability ⇒ binary. Photonic offload is only a
**flag on the proposal**; AXIS-3 still decides each kernel.

| Tier | Photonic flag on the proposal |
|---|---|
| `binary` (cpu/wasm, unknown, unattested) | off |
| `hybrid` (gpu/npu, or whole components) | on as a candidate |
| `photonic` (attested photonic + fully eligible) | on as a candidate |

Preference never forces compute onto photonics. Worst case == binary.

## RD-0855 representation profiles

Architectural execution profiles are **1, 64 and 256**. **32** is a
compatibility fallback. **128 and 512** are experimental and have **no ABI**:
`createTriPipeEngine` returns `{ kind: "REFUSED", code: "REPRESENTATION_PROFILE_NOT_ADMITTED" }`.
The router floors those requests to digital. Default is **1** (scalar first).
Changing the profile changes `candidateRouteDigest`. The proposal still does
not admit.

Trit is arithmetic data `{−1,0,+1}`. Verdict is governance. They are separate
brands on every proposal and decision.

Every proposal carries a `ComputeTransferV1` addressed as
`(owner=galerina.tri-pipe, kind=route-proposal, digest)`.

## Execution router

`createExecutionRouter()` composes the three existing routers. It re-derives
no routing maths.

```ts
import { createExecutionRouter } from "@galerina/tri-pipe";
const router = createExecutionRouter();
const decision = router.route({
  opClass: "feedforward",
  routing: { governanceTier: 2, fp4HardwareAvailable: false, airGapped: false },
  capability: { targetId: "photonic", attestationVerified: true, componentFullyEligible: true },
  kernel: { n: 1024, lane: "photonic", tolerance: 0.05 },
  representationProfile: 1,
});
// decision.authorityReleased === false
// photonic IFF offload-capable tier ∧ ternary precision ∧ net-win ∧ granted dispatched lane
```

| Axis | Source | Decides |
|---|---|---|
| AXIS-1 capability tier | `hardware()` | binary / hybrid / photonic |
| AXIS-2 precision | `routePrecision` | ternary / fp4 / fp8 / fp16 |
| AXIS-3 per-kernel offload | `PartitionDecider` | digital / photonic |
| Representation | RD-0855 | candidate 1 / 32 / 64 / 256 |

**Photonic IFF** offload-capable tier **∧** ternary precision **∧** net-win
**∧** the dispatched lane is granted. Capability is checked against the
**dispatched** backend (RD-0236 #6), not the declared `kernel.lane`.

## RD-0855 admission-time alternatives

`proposeInitialAttempt()` and `proposeAlternative()` return **attempt proposals**,
never admission. The owner's three-tier order is fixed:

| Tier | Candidate | When |
|---|---|---|
| 1 | requested trit width (32/64/256, `SCIENCE` only) | first attempt |
| 2 | standard K3 scalar (profile 1) | first attempt for a width-1 request, or after a refused tier 1 |
| 3 | binary carrier, same K3 semantics, K3 decides permission | only after a refused tier 2 |

An alternative needs a parent refused **before any effect** for an
authenticated candidate-local reason (`CANDIDATE_LOCAL_UNAVAILABLE` or
`CANDIDATE_LOCAL_INCOMPATIBLE`) permitted by the same task policy. The host
injects `verifyReasonEvidence`, which must return exactly `true`. DENY,
revocation, invalid evidence, unknown outcome, partial effect and cleanup
failure refuse `TP_ALT_PRIOR_OUTCOME_TERMINAL`; the parent's typed refusal is
kept. Every proposal has `authorityReleased: false`, `admissionAuthority: false`
and `requires` fresh SLIDE admission, a fresh VOK decision and lease, and a
linked terminal receipt. `dispatchTriPipeEngine` refuses it like any other input.

## Proofs

```
npm test       # node:test — proposal-only engine + execution-router composition
npm run prove  # tier == hardware(); photonicEnabled IFF hybrid|photonic; unattested → binary
```

License: Apache-2.0.
