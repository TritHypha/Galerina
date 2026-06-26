# Galerina Core Photonic: Backend Architecture and Governance Model

Update status: this is a legacy/backend architecture note. It contains older
three-value `OpticalTransportMode` and older `SPORE-PHOTONIC-*` meanings. Use it as
historical context only until `galerina-core-photonic` reconciles the current
coverage conflicts.

## Definition

`galerina-core-photonic` is the governance-first runtime coordination architecture
for future optical compute systems in Galerina. It is not a vendor-specific hardware
wrapper.

## Package

```text
packages-galerina/galerina-core-photonic
```

## Status

```text
Real photonic backend:    not implemented
Optical transport planning: conceptually specified
Photonic execution runtime: planning only
Optical scheduler:          planning only
Distributed optical coord:  planning only
Runtime optical proofs:     planning only
```

Real photonic execution depends on hardware ecosystems that are immature,
vendor-specific, and rapidly changing. The architecture therefore remains
conceptual, runtime-oriented, backend-neutral and future-compatible until
production hardware ecosystems stabilize.

---

## Philosophy

Galerina does not treat photonics as a magical execution model.

Photonic systems must still remain:

```text
runtime-governed
policy-controlled
capability-aware
audit-safe
deterministic where required
fallback-safe
```

The runtime always remains authoritative.

Application code expresses execution intent. The runtime determines:

```text
whether optical transport is available
whether optical coordination is beneficial
whether policy allows optical execution
whether fallback is required
```

The application must not directly manage photonic hardware.

---

## Why Photonic Systems Matter

Future compute systems may increasingly rely on:

```text
optical interconnects
distributed accelerator pooling
memory disaggregation
high-bandwidth tensor movement
cluster-scale AI coordination
```

Galerina therefore prepares a governance-first architecture early.

---

## Governance-First Photonics

Photonic execution must never bypass:

```text
runtime policy
deployment validation
capability enforcement
effect declarations
audit generation
execution proof generation
```

Even advanced hardware remains governed.

---

## Relationship to Other Packages

```text
galerina-core-photonic
    → future optical runtime contracts

galerina-core-compute
    → compute planning

galerina-core-runtime
    → execution scheduling

galerina-core-network
    → distributed transport policy

galerina-core-security
    → capability and trust rules

galerina-core-reports
    → optical execution evidence
```

---

## What Galerina Avoids

The architecture explicitly rejects:

```text
vendor lock-in
hardcoded optical syntax
unsafe DMA assumptions
hidden distributed execution
implicit optical escalation
non-auditable transport
```

---

## Photonic vs Traditional Networking

Traditional networking:

```text
packet transport
general communication
application routing
```

Photonic runtime transport:

```text
accelerator coordination
tensor movement
distributed memory movement
runtime compute scheduling
```

Galerina models them differently.

---

## Optical Transport Effect

Optical coordination requires explicit effects:

```galerina
fn distribute_training_batch(batch: TensorBatch)
    effect optical_io, distributed_compute
{
    runtime.distribute(batch)
}
```

Meaning:

```text
runtime may coordinate optical transport
runtime still controls execution
```

Without optical effects the runtime cannot safely reason about:

```text
distributed tensor movement
cross-node transport
cluster scheduling
bandwidth requirements
optical fallback behavior
```

---

## Photonic Capability Model

```galerina
capability OpticalTransport
```

Usage:

```galerina
fn synchronize_cluster()
    effect optical_io
    capability OpticalTransport
{
    runtime.sync()
}
```

This ensures:

```text
effect declared
capability granted
runtime authority explicit
```

---

## Core Photonic Types

### OpticalTransportMode

```ts
export type OpticalTransportMode =
  | "photonic"
  | "electrical"
  | "hybrid"
```

### PhotonicRuntimeTarget

```ts
export interface PhotonicRuntimeTarget {
  name: string
  distributed: boolean
  transportMode: OpticalTransportMode
  fallbackTarget: string
}
```

Example runtime target:

```json
{
  "name": "cluster-optical-v1",
  "distributed": true,
  "transportMode": "photonic",
  "fallbackTarget": "gpu"
}
```

### PhotonicExecutionPlan

```ts
export interface PhotonicExecutionPlan {
  module: string
  distributed: boolean
  recommendedTransport: string
  fallbackTarget: string
  reasoning: string[]
}
```

---

## Planning Functions

```ts
export function estimateOpticalSuitability(
  graph: ExecutionGraph
): boolean {
  return (
    graph.parallelism === "high" &&
    graph.transferPressure === "high"
  )
}
```

```ts
export function buildPhotonicPlan(
  module: string
): PhotonicExecutionPlan {
  return {
    module,
    distributed: true,
    recommendedTransport: "optical_io",
    fallbackTarget: "gpu",
    reasoning: [
      "large distributed tensor movement"
    ]
  }
}
```

---

## Fallback Philosophy

Photonic systems must degrade safely.

Fallback targets may include:

```text
gpu
distributed-gpu
cpu
hybrid transport
```

Fallback must remain deterministic, auditable, and runtime-governed.

### Fallback Resolution Example

```ts
export function resolveFallback(
  opticalAvailable: boolean
): string {
  if (!opticalAvailable) {
    return "gpu"
  }

  return "photonic"
}
```

---

## Example Conceptual Runtime Flow

```text
execution graph
    ↓
compute planner
    ↓
optical suitability estimation
    ↓
runtime policy validation
    ↓
distributed optical coordination
    ↓
audit proof generation
```

---

## Example Optical Execution Graph

```text
node-1 preprocess
      ↓
optical transport
      ↓
node-2 tensor execution
      ↓
optical transport
      ↓
node-3 aggregation
```

Distributed coordination must remain explainable.

---

## Runtime Scheduler Integration

Photonic systems integrate with the compute scheduler.

Example scheduler decision:

```text
Planner recommends photonic transport.
Runtime detects unavailable optical node.
Scheduler falls back to GPU cluster.
Audit event generated.
```

---

## Vendor-Neutral Architecture

Application code must never hardcode:

```text
vendor photonic APIs
vendor optical drivers
device-specific routing logic
```

All vendor coordination must remain runtime adapters.

---

## Planned Package Architecture

```text
galerina-core-photonic
    → shared contracts

galerina-target-photonic-runtime
    → future runtime execution

galerina-target-photonic-routing
    → future routing layer

galerina-target-photonic-audit
    → runtime evidence generation
```

---

## Suggested Internal Structure

```text
packages-galerina/galerina-core-photonic/src/
```

Suggested files:

```text
photonic-runtime.ts
photonic-planner.ts
photonic-routing.ts
photonic-fallback.ts
photonic-audit.ts
photonic-targets.ts
```

---

## Memory Coordination Philosophy

Photonic systems may eventually support:

```text
high-speed memory movement
distributed memory graphs
shared tensor routing
```

However, memory safety remains deterministic. Photonic transport must never
bypass runtime memory governance.

---

## AI Governance Rules

AI orchestration must still obey:

```text
runtime policy
capability rules
effect declarations
audit requirements
deployment policy
```

No privileged AI transport exists.

---

## Runtime Audit Integration

### Audit Event Example

```json
{
  "traceId": "trace-900",
  "category": "photonic",
  "event": "transport.coordinate",
  "status": "completed",
  "metadata": {
    "transport": "photonic",
    "distributed": true
  }
}
```

### Fallback Audit Event Example

```json
{
  "traceId": "trace-901",
  "category": "photonic",
  "event": "transport.fallback",
  "status": "fallback",
  "metadata": {
    "planned": "photonic",
    "actual": "gpu"
  }
}
```

---

## Execution Proof Integration

Photonic execution should contribute to execution proofs:

```json
{
  "transport": "photonic",
  "distributed": true,
  "fallback": false
}
```

---

## Runtime Manifest Integration

Runtime manifests may eventually contain:

```json
{
  "effects": ["optical_io"],
  "targets": ["photonic"],
  "distributed": true
}
```

---

## CLI Integration

```bash
galerina plan app/ai/training
```

Output:

```text
Recommended transport: photonic
Fallback target: gpu
Distributed execution: enabled
```

```bash
galerina explain app/ai/training
```

Output:

```text
Reasoning:
- high distributed tensor movement
- optical transport recommended
```

---

## Compatibility Reporting

```json
{
  "target": "photonic",
  "compatible": false,
  "reason": "optical runtime unavailable"
}
```

---

## Security Rules

Photonic systems must never:

```text
bypass capability checks
ignore runtime policy
perform hidden routing
skip audit generation
expose unsafe memory access
```

---

## Diagnostic Codes (SPORE-PHOTONIC series)

| Code | Meaning |
| --- | --- |
| `SPORE-PHOTONIC-001` | optical runtime unavailable |
| `SPORE-PHOTONIC-002` | optical transport denied by policy |
| `SPORE-PHOTONIC-003` | distributed optical scheduler unavailable |
| `SPORE-PHOTONIC-004` | photonic fallback occurred |
| `SPORE-PHOTONIC-005` | unsupported optical target |
| `SPORE-PHOTONIC-006` | invalid distributed transport graph |

---

## Recommended Implementation Order

### Phase 1

```text
photonic contracts
transport planning metadata
runtime target models
```

### Phase 2

```text
distributed planning graphs
fallback metadata
compatibility reports
```

### Phase 3

```text
runtime audit integration
execution proof integration
CLI explain integration
```

### Phase 4

```text
real optical runtime experimentation
hardware adapter prototypes
distributed optical scheduling
```

---

## v0.1 Scope

Implement first:

```text
planning metadata only
compute planner integration
compatibility reporting
fallback metadata
audit event schemas
```

Defer:

```text
real optical runtime
photonic execution engine
hardware adapters
distributed optical scheduling
memory disaggregation runtime
```

---

## Future Research Areas

```text
optical tensor routing
distributed photonic scheduling
memory disaggregation
wave-based transport coordination
AI accelerator pooling
cluster-wide execution proofs
```

---

## Relationship to Other Systems

```text
galerina-core-photonic      → governance-first photonic architecture and contracts
galerina-target-photonic    → future hardware/simulator target output
galerina-core-compute       → compute planning (optical as transport, not compute device)
galerina-core-logic         → binary-safe governance model (photonic does not replace determinism)
galerina-core-runtime       → runtime enforcement and scheduling
galerina-core-reports       → optical execution evidence and audit
```

See also: `native-photonic-compute-future.md`, `hybrid-electronic-optical-compute.md`,
`photonic-resolution-boundary.md`, `galerina-core-compute-gpu-and-photonic-backends.md`,
`package-completion-status.md`.
