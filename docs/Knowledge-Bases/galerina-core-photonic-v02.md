> ⚠️ **SUPERSEDED** — This is a v0.2 historical document. Current spec: see See Also links.

# Galerina Core Photonic v0.2

## Formal Specification — Governance Architecture and Optical Runtime Control

**Status: SUPERSEDED — This is a v0.2 design document. The current canonical specification
is in the corresponding Phase 9-15 implementation docs. See galerina-roadmap.md for
the up-to-date architecture. This file is retained for historical context only.**

This document is the v0.2 canonical specification for `galerina-core-photonic`.

Update status: `docs/COVERAGE.md` records unresolved conflicts between this
formal v0.2 spec, the governance overlay and the vector photonic proposal. This
file is not implementation-ready for `OpticalTransportMode` or
`SPORE-PHOTONIC-*` until the owner package reconciles one canonical enum and one
diagnostic table.

See also: `galerina-core-photonic-backend-architecture.md` (prior KB),
`native-photonic-compute-future.md`, `photonic-resolution-boundary.md`.

---

## Core Philosophy

```text
all optical execution paths are governed runtime resources
```

Every optical execution must pass:
- transport validation
- topology validation
- runtime capability checks
- photonic safety rules
- deterministic scheduling validation

---

## OpticalTransportMode Enum

```ts
enum OpticalTransportMode {
    Waveguide,
    Coherent,
    Mesh,
    FreeSpace,
    Hybrid,
    Experimental
}
```

| Mode         | Description                     |
| ------------ | ------------------------------- |
| Waveguide    | Structured optical wave routing |
| Coherent     | Coherent optical transport      |
| Mesh         | Distributed optical mesh        |
| FreeSpace    | Open optical propagation        |
| Hybrid       | Mixed electronic/optical        |
| Experimental | Unsafe or research mode         |

Note: The prior KB used a string union `"photonic" | "electrical" | "hybrid"`.
The v0.2 formal spec defines this 6-value enum.

---

## PhotonicRuntimeTarget

```ts
interface PhotonicRuntimeTarget {
    id: string;

    transport:
        OpticalTransportMode;

    realtime: boolean;

    deterministic: boolean;

    supportsIsolation: boolean;

    maxPropagationDepth: number;
}
```

Example:
```json
{
  "id": "photonic-runtime-01",
  "transport": "Waveguide",
  "realtime": true,
  "deterministic": true,
  "supportsIsolation": true,
  "maxPropagationDepth": 32
}
```

---

## PhotonicExecutionPlan

```ts
interface PhotonicExecutionPlan {
    target:
        PhotonicRuntimeTarget;

    topology: string;

    propagationDepth: number;

    estimatedLatencyNs: number;

    isolated: boolean;

    warnings: string[];
}
```

Example:
```json
{
  "target": { "id": "photonic-runtime-01", "transport": "Waveguide" },
  "topology": "OpticalMesh",
  "propagationDepth": 12,
  "estimatedLatencyNs": 8,
  "isolated": true,
  "warnings": []
}
```

Note: The prior KB had `recommendedTransport` and `reasoning[]` fields.
The v0.2 formal spec uses the interface above.

---

## buildPhotonicPlan()

```ts
function buildPhotonicPlan(
    target:
        PhotonicRuntimeTarget
): PhotonicExecutionPlan {

    return {
        target,

        topology:
            "OpticalMesh",

        propagationDepth: 12,

        estimatedLatencyNs: 8,

        isolated: true,

        warnings: []
    };
}
```

---

## Isolation Validation

### validateIsolation()

```ts
function validateIsolation(
    target:
        PhotonicRuntimeTarget
): boolean {

    return target.supportsIsolation;
}
```

Isolation prevents cross-runtime optical leakage.

---

### Isolation Rules

| Rule                               | Purpose                 |
| ---------------------------------- | ----------------------- |
| Optical channels isolated          | Runtime separation      |
| Mesh propagation bounded           | Deterministic execution |
| Experimental transports restricted | Runtime safety          |
| Hybrid execution validated         | Safe fallback           |
| Free-space transport sandboxed     | Signal containment      |

---

## Propagation Governance

### validatePropagation()

```ts
function validatePropagation(
    depth: number,
    target:
        PhotonicRuntimeTarget
): boolean {

    return (
        depth <=
        target.maxPropagationDepth
    );
}
```

Unlimited propagation creates unstable execution and non-deterministic
signal routing. The `maxPropagationDepth` constraint prevents this.

---

## Hybrid Runtime Governance

### validateHybridMode()

```ts
function validateHybridMode(
    target:
        PhotonicRuntimeTarget
): boolean {

    return (
        target.transport ===
            OpticalTransportMode.Hybrid &&
        target.deterministic
    );
}
```

Hybrid runtimes combine optical execution, GPU execution, CPU fallback,
and distributed compute routing. Determinism is required.

---

## Real-Time Constraints

### validateRealtime()

```ts
function validateRealtime(
    plan:
        PhotonicExecutionPlan
): boolean {

    return (
        plan.estimatedLatencyNs <
        100
    );
}
```

---

## PhotonicCapability Enum

```ts
enum PhotonicCapability {
    OpticalExecution,
    HybridExecution,
    ExperimentalRouting,
    RealtimeScheduling
}
```

---

### validateCapability()

```ts
function validateCapability(
    capability:
        PhotonicCapability
): boolean {

    return capability !==
        PhotonicCapability
            .ExperimentalRouting;
}
```

ExperimentalRouting is blocked by default. Requires explicit override.

---

## Experimental Runtime Restrictions

| Restriction                  | Purpose        |
| ---------------------------- | -------------- |
| No production deployment     | Runtime safety |
| Sandboxed execution only     | Isolation      |
| Explicit capability required | Governance     |
| Full audit logging           | Traceability   |

---

## Optical Topologies

| Topology     | Purpose                 |
| ------------ | ----------------------- |
| OpticalMesh  | Distributed propagation |
| WaveguideBus | Structured routing      |
| CoherentRing | Low-latency execution   |
| HybridBridge | CPU/GPU bridging        |

---

## Diagnostic Codes (v0.2)

| Code            | Meaning                            |
| --------------- | ---------------------------------- |
| SPORE-PHOTONIC-001 | Isolation guarantee missing        |
| SPORE-PHOTONIC-002 | Propagation depth exceeded         |
| SPORE-PHOTONIC-003 | Experimental runtime prohibited    |
| SPORE-PHOTONIC-004 | Invalid optical topology           |
| SPORE-PHOTONIC-005 | Non-deterministic runtime detected |
| SPORE-PHOTONIC-006 | Unsafe hybrid transition           |

Note: The prior KB had different meanings for these codes:
- Prior 001: optical runtime unavailable
- Prior 002: optical transport denied by policy
- Prior 003: distributed optical scheduler unavailable
- Prior 004: photonic fallback occurred
- Prior 005: unsupported optical target
- Prior 006: invalid distributed transport graph

The v0.2 formal spec codes above are from the governance architecture spec.

---

## File Layout

```text
galerina-core-photonic/

  runtime/
    PhotonicRuntime.ts
    transport.ts            (OpticalTransportMode enum)
    isolation.ts            (validateIsolation)

  planning/
    PhotonicExecutionPlan.ts
    topology.ts             (topologies list)
    scheduling.ts           (validateRealtime)

  governance/
    validation.ts           (validatePropagation, validateHybridMode)
    capabilities.ts         (PhotonicCapability enum, validateCapability)
    policies.ts

  diagnostics/
    PhotonicDiagnostic.ts
    codes.ts                (SPORE-PHOTONIC-001–006)

  targets/
    runtimeTargets.ts       (PhotonicRuntimeTarget)
    OpticalTransportMode.ts
```

---

## Planned v0.3 Features

| Feature                         | Purpose                  |
| ------------------------------- | ------------------------ |
| Quantum-Photonic Hybrid Routing | Experimental compute     |
| Adaptive Optical Scheduling     | Dynamic optimization     |
| Distributed Optical Meshes      | Cluster propagation      |
| Optical Replay Verification     | Runtime proof validation |
| Hardware-backed Isolation       | Secure photonic enclaves |
| Optical Capability Federation   | Distributed governance   |

---

## Determinism Rule

Given identical workloads, runtime targets, optical topology, and transport
modes — the runtime must produce:
- identical execution plans
- identical propagation routes
- identical runtime schedules
- identical diagnostics
