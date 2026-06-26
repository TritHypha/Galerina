> ⚠️ **SUPERSEDED** — This is a v0.2 historical document. Current spec: see See Also links.

# Galerina Core Compute v0.2

## Formal Specification — GPU, Photonic, WASM, Compatibility

**Status: SUPERSEDED — This is a v0.2 design document. The current canonical specification
is in the corresponding Phase 9-15 implementation docs. See galerina-roadmap.md for
the up-to-date architecture. This file is retained for historical context only.**

This document is the v0.2 canonical specification for `galerina-core-compute`.

See also: `galerina-core-compute-gpu-and-photonic-backends.md` (prior KB).

---

## Shared Types

### ComputeWorkload

```ts
interface ComputeWorkload {
    operations: number;

    parallelism: number;

    memoryBytes: number;

    requiresRealtime: boolean;

    effects: string[];
}
```

---

### DataShape

```ts
interface DataShape {
    dimensions: number[];

    format: string;

    mutable: boolean;
}
```

---

## GPU Backend

### GpuSuitability (v0.2)

```ts
interface GpuSuitability {
    suitable: boolean;

    score: number;

    reasons: string[];
}
```

Note: The prior KB modelled GpuSuitability as an enum or string values.
The v0.2 formal spec defines it as a scored interface with reasons list.

```json
{
  "suitable": true,
  "score": 0.91,
  "reasons": [
    "High parallelism",
    "Large tensor operations"
  ]
}
```

---

### GpuPlan

```ts
interface GpuPlan {
    enabled: boolean;

    backend: string;

    estimatedSpeedup: number;

    memoryRequirement: number;

    warnings: string[];
}
```

Example:
```json
{
  "enabled": true,
  "backend": "CUDA",
  "estimatedSpeedup": 18.2,
  "memoryRequirement": 8589934592,
  "warnings": []
}
```

---

### buildGpuPlan()

```ts
function buildGpuPlan(
    workload: ComputeWorkload
): GpuPlan {

    return {
        enabled:
            workload.parallelism > 512,

        backend: "CUDA",

        estimatedSpeedup: 18.2,

        memoryRequirement:
            workload.memoryBytes,

        warnings: []
    };
}
```

Suitability threshold: `parallelism > 512`.
Below threshold: `GPU unsuitable: insufficient parallelism.`

---

### GPU Forbidden Effects

```ts
const forbiddenGpuEffects = [
    "Unsafe",
    "BlockingIO",
    "RuntimeMutation"
];
```

---

### GPU Suitability Rules

| Metric            | Purpose              |
| ----------------- | -------------------- |
| Parallelism       | GPU occupancy        |
| Memory throughput | VRAM suitability     |
| Tensor density    | Compute efficiency   |
| Branch divergence | SIMD compatibility   |
| Runtime effects   | Safety compatibility |

---

## Photonic Backend

### OpticalNeed

```ts
interface OpticalNeed {
    required: boolean;

    confidence: number;

    reasons: string[];
}
```

---

### OpticalPlan

```ts
interface OpticalPlan {
    enabled: boolean;

    topology: string;

    latencyEstimateNs: number;

    warnings: string[];
}
```

---

### buildOpticalPlan()

```ts
function buildOpticalPlan(
    workload: ComputeWorkload
): OpticalPlan {

    return {
        enabled:
            workload.requiresRealtime,

        topology: "WaveguideMesh",

        latencyEstimateNs: 18,

        warnings: []
    };
}
```

---

### Photonic Forbidden Effects

```ts
const forbiddenOpticalEffects = [
    "Unsafe",
    "State",
    "RuntimeMutation"
];
```

---

## WASM Target

### WasmTarget

```ts
interface WasmTarget {
    runtime: string;

    forbiddenEffects: string[];
}
```

---

### DEFAULT_WASM_TARGET

```ts
const DEFAULT_WASM_TARGET: WasmTarget = {
    runtime: "default",

    forbiddenEffects: [
        "Unsafe"
    ]
};
```

---

### BROWSER_WASM_TARGET

```ts
const BROWSER_WASM_TARGET: WasmTarget = {
    runtime: "browser",

    forbiddenEffects: [
        "Unsafe",
        "Runtime",
        "BlockingIO"
    ]
};
```

Browser WASM restrictions:

| Effect     | Reason                  |
| ---------- | ----------------------- |
| Unsafe     | Memory safety           |
| Runtime    | Host runtime isolation  |
| BlockingIO | Browser execution model |

---

### validateWasmTarget()

```ts
function validateWasmTarget(
    effects: string[],
    target: WasmTarget
): boolean {

    for (const effect of effects) {

        if (
            target.forbiddenEffects
                .includes(effect)
        ) {
            return false;
        }
    }

    return true;
}
```

---

## Target Compatibility

### CompatibilityLevel Enum (v0.2)

```ts
enum CompatibilityLevel {
    Compatible,
    Warning,
    Blocked
}
```

Note: The prior KB used `full|partial|degraded|incompatible` as string
literals. The v0.2 formal spec uses this 3-value enum.

---

### CompatibilityResult

```ts
interface CompatibilityResult {
    level: CompatibilityLevel;

    blockers: string[];

    warnings: string[];
}
```

---

### TargetProfile

```ts
interface TargetProfile {
    name: string;

    runtime: string;

    supportedEffects: string[];

    forbiddenEffects: string[];

    memoryLimitMb: number;
}
```

Example:
```json
{
  "name": "browser-wasm",
  "runtime": "browser",
  "supportedEffects": ["Compute", "Pure"],
  "forbiddenEffects": ["Unsafe", "BlockingIO"],
  "memoryLimitMb": 512
}
```

---

### CompatibilityReport

```ts
interface CompatibilityReport {
    target: string;

    compatible: boolean;

    result: CompatibilityResult;

    recommendations: string[];
}
```

Example:
```json
{
  "target": "browser-wasm",
  "compatible": false,
  "result": {
    "level": "Blocked",
    "blockers": ["Unsafe effect prohibited"]
  },
  "recommendations": [
    "Remove Unsafe effect",
    "Use Local runtime target"
  ]
}
```

---

### checkCompatibility()

```ts
function checkCompatibility(
    target: WasmTarget,
    effects: string[]
): CompatibilityResult {

    const blockers: string[] = [];

    for (const effect of effects) {

        if (
            target.forbiddenEffects
                .includes(effect)
        ) {
            blockers.push(
                `${effect} prohibited`
            );
        }
    }

    return {
        level:
            blockers.length > 0
                ? CompatibilityLevel.Blocked
                : CompatibilityLevel.Compatible,

        blockers,

        warnings: []
    };
}
```

---

## Diagnostic Codes (v0.2)

### SPORE-COMPUTE

| Code           | Meaning                  |
| -------------- | ------------------------ |
| SPORE-COMPUTE-001 | Invalid compute workload |
| SPORE-COMPUTE-002 | GPU planning failure     |
| SPORE-COMPUTE-003 | Optical planning failure |

### SPORE-WASM

| Code        | Meaning                     |
| ----------- | --------------------------- |
| SPORE-WASM-001 | Forbidden WASM effect       |
| SPORE-WASM-002 | Invalid runtime capability  |
| SPORE-WASM-003 | Unsupported browser runtime |

### SPORE-COMPAT

| Code          | Meaning                        |
| ------------- | ------------------------------ |
| SPORE-COMPAT-001 | Runtime incompatibility        |
| SPORE-COMPAT-002 | Forbidden target effect        |
| SPORE-COMPAT-003 | Unsupported deployment profile |

---

## Compute Planning Flow

```text
Analyze workload
      ↓
Extract runtime effects
      ↓
Evaluate GPU suitability
      ↓
Evaluate optical suitability
      ↓
Validate WASM compatibility
      ↓
Generate compatibility report
      ↓
Emit execution plan
```

---

## Planned v0.3 Features

| Feature                  | Purpose                  |
| ------------------------ | ------------------------ |
| TPU Backends             | Tensor acceleration      |
| FPGA Targets             | Custom logic execution   |
| Distributed GPU Mesh     | Cluster acceleration     |
| Quantum Compatibility    | Experimental planning    |
| Adaptive Runtime Routing | Dynamic target selection |
| Multi-target Compilation | Hybrid execution         |
