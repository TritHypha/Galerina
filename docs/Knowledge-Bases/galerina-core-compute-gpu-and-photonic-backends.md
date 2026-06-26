# Galerina Core Compute: GPU, Photonic, WASM, and Target Compatibility

## Status

```text
Package: galerina-core-compute
Area: GPU planning, photonic planning, WASM target compatibility, target compatibility reporting
Version target: v0.2
Implementation status: fully specified, planning only
v0.1 baseline: CPU + compute planner only
Canonical diagnostics:
  - SPORE-COMPUTE-001 through SPORE-COMPUTE-005
  - SPORE-WASM-001 through SPORE-WASM-005
  - SPORE-COMPAT-001 through SPORE-COMPAT-005
```

`galerina-core-compute` owns compute planning contracts, not backend execution.

It describes workload shape, target suitability, compatibility blockers, fallback options, and planning reports for CPU, GPU, WASM, optical I/O, photonic targets, and generic AI accelerators.

It must remain hardware-neutral.

Correct:

```text
target gpu
target ai_accelerator
target optical_io
target photonic
target wasm
```

Incorrect:

```text
target cuda
target nvidia
target gaudi
target rocm
target metal
```

Vendor-specific support belongs in target adapters and device profiles, not Galerina language syntax.

---

## v0.2 Completeness Contract

This KB is the complete v0.2 planning contract for:

```text
GpuSuitability
GpuPlan
OpticalNeed
OpticalPlan
PhotonicPlan
WasmTarget
DEFAULT_WASM_FORBIDDEN_EFFECTS
BROWSER_WASM_FORBIDDEN_EFFECTS
CompatibilityLevel
CompatibilityBlocker
CompatibilityWarning
CompatibilityResult
TargetProfile
CompatibilityReport
ComputeWorkload
DataShape
ComputePlan
estimateTarget
```

Any implementation of `galerina-core-compute` should treat these as the minimum public contracts for v0.2.

---

## Design Goals

```text
hardware-neutral planning
CPU fallback by default
explicit target compatibility
safe WASM restrictions
GPU suitability scoring
photonic/optical planning without false maturity claims
policy-aware target selection
explainable compute decisions
manifest/report integration
```

The compute planner recommends. Runtime and deployment policy decide.

---

## Core Flow

```text
ComputeWorkload
  -> DataShape
  -> target profiles
  -> compatibility checks
  -> suitability scoring
  -> ComputePlan
  -> CompatibilityReport
  -> runtime/deploy/explain tooling
```

---

## Shared DataShape

```ts
export interface DataShape {
  rank: number
  dimensions: number[]

  /** Element type: f32, f64, i32, u8, bool, etc. */
  elementType: string

  /** Approximate total bytes required by this value. */
  byteSize: number

  /** True when data may include protected or sensitive values. */
  sensitive: boolean

  /** True when streaming is possible. */
  streamable: boolean
}
```

---

## Shared ComputeWorkload

```ts
export interface ComputeWorkload {
  id: string

  kind:
    | "scalar"
    | "vector"
    | "matrix"
    | "tensor"
    | "image"
    | "ai_inference"
    | "batch"
    | "stream"
    | "route"

  dataShape: DataShape

  /** Estimated operation count. */
  operationCount: number

  /** Estimated memory in MB. */
  memoryMb: number

  /** Whether the result must be bit-for-bit deterministic. */
  deterministic: boolean

  /** Effects required by this workload. */
  effects: string[]

  /** Runtime capabilities required by this workload. */
  requiredCapabilities: string[]

  /** Preferred targets declared by user/config/policy. */
  preferredTargets: RuntimeTarget[]

  /** Fallback targets, ordered safest first. */
  fallbackTargets: RuntimeTarget[]
}
```

---

## RuntimeTarget

```ts
export type RuntimeTarget =
  | "cpu"
  | "server"
  | "edge"
  | "browser"
  | "worker"
  | "wasm"
  | "gpu"
  | "ai_accelerator"
  | "optical_io"
  | "photonic"
```

---

# GPU Planning

## GpuSuitability

```ts
export interface GpuSuitability {
  suitable: boolean

  /** 0 to 100. Higher means better fit. */
  score: number

  reasons: string[]
  blockers: string[]
  warnings: string[]

  /** Whether CPU fallback is available and safe. */
  cpuFallbackAvailable: boolean
}
```

---

## GpuPlan v0.2

```ts
export interface GpuPlan {
  target: "gpu"

  workloadId: string

  suitability: GpuSuitability

  /** Required precision: f32, f16, bf16, int8, etc. */
  precision: string

  /** Estimated transfer cost in bytes. */
  transferBytes: number

  /** Estimated GPU memory required. */
  estimatedVramMb: number

  /** Required runtime capabilities. */
  requiredCapabilities: string[]

  /** Ordered fallback targets. */
  fallbackTargets: RuntimeTarget[]

  /** Explanation strings for galerina explain. */
  explanation: string[]
}
```

---

## estimateGpuSuitability()

```ts
export function estimateGpuSuitability(
  workload: ComputeWorkload
): GpuSuitability {
  const blockers: string[] = []
  const warnings: string[] = []
  const reasons: string[] = []

  if (workload.dataShape.sensitive) {
    warnings.push("Workload contains sensitive data; GPU target requires explicit policy approval.")
  }

  if (workload.memoryMb > 24_000) {
    blockers.push("Estimated memory exceeds common single-device GPU memory.")
  }

  if (workload.operationCount < 100_000) {
    warnings.push("Workload may be too small to justify GPU transfer cost.")
  }

  if (workload.kind === "matrix" || workload.kind === "tensor" || workload.kind === "ai_inference") {
    reasons.push("Workload shape is parallelisable.")
  }

  return {
    suitable: blockers.length === 0 && reasons.length > 0,
    score: blockers.length > 0 ? 0 : Math.min(100, reasons.length * 30 + warnings.length * 5),
    reasons,
    blockers,
    warnings,
    cpuFallbackAvailable: workload.fallbackTargets.includes("cpu")
  }
}
```

---

# Photonic and Optical Planning

Galerina distinguishes optical I/O from photonic compute.

```text
optical_io -> data movement, interconnects, transfer planning
photonic   -> future photonic compute backend planning
```

`galerina-core-compute` must not claim that photonic execution exists until a real backend exists.

---

## OpticalNeed

```ts
export interface OpticalNeed {
  required: boolean

  /** Why optical transport might help. */
  reasons: string[]

  /** Estimated transfer volume. */
  transferBytes: number

  /** Whether fallback to normal network/PCIe/Ethernet is available. */
  fallbackAvailable: boolean
}
```

---

## OpticalPlan

```ts
export interface OpticalPlan {
  target: "optical_io"

  workloadId: string

  need: OpticalNeed

  /** Data movement topology. */
  topology:
    | "single_node"
    | "multi_device"
    | "rack_scale"
    | "cluster"
    | "unknown"

  /** Transport profile, not language syntax. */
  transportProfile?: string

  fallbackTargets: RuntimeTarget[]

  explanation: string[]
}
```

---

## PhotonicPlan

```ts
export interface PhotonicPlan {
  target: "photonic"

  workloadId: string

  /** Simulation/planning only unless a real runtime backend is configured. */
  planningOnly: boolean

  blockers: string[]
  warnings: string[]
  fallbackTargets: RuntimeTarget[]

  explanation: string[]
}
```

---

# WASM Target

WASM is a runtime target with stricter boundary rules.

## WasmTarget v0.2

```ts
export interface WasmTarget {
  target: "wasm"

  /** browser, edge, server, embedded, wasi. */
  runtime:
    | "browser"
    | "edge"
    | "server"
    | "embedded"
    | "wasi"

  /** Effects forbidden for this WASM runtime. */
  forbiddenEffects: string[]

  /** Whether host imports are allowed. */
  allowHostImports: boolean

  /** Whether WASI filesystem access is available. */
  allowWasiFilesystem: boolean

  /** Whether network access is available through host capabilities. */
  allowHostNetwork: boolean
}
```

---

## Default WASM Forbidden Effects

```ts
export const DEFAULT_WASM_FORBIDDEN_EFFECTS = [
  "process.spawn",
  "native.call",
  "ffi.call",
  "filesystem.raw",
  "secret.raw"
]
```

---

## Browser WASM Forbidden Effects

```ts
export const BROWSER_WASM_FORBIDDEN_EFFECTS = [
  ...DEFAULT_WASM_FORBIDDEN_EFFECTS,
  "filesystem.read",
  "filesystem.write",
  "environment.read",
  "network.raw_socket"
]
```

---

# Compatibility Model

## CompatibilityLevel

```ts
export type CompatibilityLevel =
  | "compatible"
  | "compatible_with_warnings"
  | "requires_fallback"
  | "incompatible"
```

---

## CompatibilityBlocker

```ts
export interface CompatibilityBlocker {
  code: string
  message: string
  effect?: string
  capability?: string
  target?: RuntimeTarget
  sourceLocation?: SourceLocation
}
```

Blockers are hard failures. A target with blockers must not be selected unless the planner selects an explicit fallback instead.

---

## CompatibilityWarning

```ts
export interface CompatibilityWarning {
  code: string
  message: string
  effect?: string
  capability?: string
  target?: RuntimeTarget
  sourceLocation?: SourceLocation
}
```

Warnings are explainable risk notices. They may allow selection only when policy permits warning-level compatibility.

---

## CompatibilityResult

```ts
export interface CompatibilityResult {
  target: RuntimeTarget
  level: CompatibilityLevel
  blockers: CompatibilityBlocker[]
  warnings: CompatibilityWarning[]
  fallbackTargets: RuntimeTarget[]
}
```

---

## TargetProfile

```ts
export interface TargetProfile {
  target: RuntimeTarget

  /** Effects this target supports. */
  supportedEffects: string[]

  /** Effects this target explicitly forbids. */
  forbiddenEffects: string[]

  /** Required runtime capabilities. */
  requiredCapabilities: string[]

  /** Memory limit, if known. */
  memoryLimitMb?: number

  /** Whether sensitive data is allowed. */
  allowsSensitiveData: boolean

  /** Ordered fallback targets. */
  fallbackTargets: RuntimeTarget[]
}
```

---

## CompatibilityReport

```ts
export interface CompatibilityReport {
  schemaVersion: "galerina.compatibility.report.v0.2"
  workloadId: string
  selectedTarget: RuntimeTarget
  results: CompatibilityResult[]
  selectedFallback?: RuntimeTarget
  diagnostics: CompilerDiagnostic[]
}
```

---

## checkTargetCompatibility()

```ts
export function checkTargetCompatibility(
  workload: ComputeWorkload,
  profile: TargetProfile
): CompatibilityResult {
  const blockers: CompatibilityBlocker[] = []
  const warnings: CompatibilityWarning[] = []

  for (const effect of workload.effects) {
    if (profile.forbiddenEffects.includes(effect)) {
      blockers.push({
        code: "SPORE-COMPAT-001",
        message: `Effect ${effect} is forbidden on target ${profile.target}.`,
        effect,
        target: profile.target
      })
    }

    if (!profile.supportedEffects.includes(effect)) {
      warnings.push({
        code: "SPORE-COMPAT-002",
        message: `Effect ${effect} is not explicitly supported on target ${profile.target}.`,
        effect,
        target: profile.target
      })
    }
  }

  if (profile.memoryLimitMb !== undefined && workload.memoryMb > profile.memoryLimitMb) {
    blockers.push({
      code: "SPORE-COMPAT-003",
      message: `Workload memory ${workload.memoryMb}MB exceeds target limit ${profile.memoryLimitMb}MB.`,
      target: profile.target
    })
  }

  if (workload.dataShape.sensitive && !profile.allowsSensitiveData) {
    blockers.push({
      code: "SPORE-COMPAT-004",
      message: `Target ${profile.target} does not allow sensitive data.`,
      target: profile.target
    })
  }

  return {
    target: profile.target,
    level: blockers.length > 0
      ? "incompatible"
      : warnings.length > 0
        ? "compatible_with_warnings"
        : "compatible",
    blockers,
    warnings,
    fallbackTargets: profile.fallbackTargets
  }
}
```

---

# ComputePlan v0.2

```ts
export interface ComputePlan {
  schemaVersion: "galerina.compute.plan.v0.2"

  workload: ComputeWorkload

  selectedTarget: RuntimeTarget

  gpuPlan?: GpuPlan

  opticalPlan?: OpticalPlan

  photonicPlan?: PhotonicPlan

  wasmTarget?: WasmTarget

  compatibilityReport: CompatibilityReport

  fallbackTargets: RuntimeTarget[]

  explanation: string[]
}
```

---

## estimateTarget()

```ts
export function estimateTarget(
  workload: ComputeWorkload,
  profiles: TargetProfile[]
): ComputePlan {
  const results = profiles.map(profile =>
    checkTargetCompatibility(workload, profile)
  )

  const compatible = results.find(result => result.level === "compatible")
  const warningOnly = results.find(result => result.level === "compatible_with_warnings")
  const selected = compatible ?? warningOnly ?? results[0]

  return {
    schemaVersion: "galerina.compute.plan.v0.2",
    workload,
    selectedTarget: selected.target,
    compatibilityReport: {
      schemaVersion: "galerina.compatibility.report.v0.2",
      workloadId: workload.id,
      selectedTarget: selected.target,
      results,
      selectedFallback: selected.level === "incompatible"
        ? selected.fallbackTargets[0]
        : undefined,
      diagnostics: []
    },
    fallbackTargets: selected.fallbackTargets,
    explanation: [
      `Selected ${selected.target} with compatibility level ${selected.level}.`
    ]
  }
}
```

---

# Diagnostic Codes

## SPORE-COMPUTE

| Code | Meaning |
| --- | --- |
| `SPORE-COMPUTE-001` | Workload cannot be planned |
| `SPORE-COMPUTE-002` | No safe fallback target exists |
| `SPORE-COMPUTE-003` | Compute capability missing |
| `SPORE-COMPUTE-004` | Sensitive workload requires explicit target approval |
| `SPORE-COMPUTE-005` | Compute plan report could not be generated |

## SPORE-WASM

| Code | Meaning |
| --- | --- |
| `SPORE-WASM-001` | Forbidden effect used by WASM target |
| `SPORE-WASM-002` | Host import required but not allowed |
| `SPORE-WASM-003` | WASI filesystem required but not enabled |
| `SPORE-WASM-004` | Host network required but not enabled |
| `SPORE-WASM-005` | WASM runtime profile missing or unsupported |

## SPORE-COMPAT

| Code | Meaning |
| --- | --- |
| `SPORE-COMPAT-001` | Target forbids required effect |
| `SPORE-COMPAT-002` | Target does not explicitly support effect |
| `SPORE-COMPAT-003` | Workload exceeds target memory limit |
| `SPORE-COMPAT-004` | Target does not allow sensitive data |
| `SPORE-COMPAT-005` | Target compatibility report incomplete |

---

# Report Outputs

```text
build/reports/compute-plan.json
build/reports/compatibility-report.json
build/reports/gpu-plan.json
build/reports/optical-plan.json
build/reports/wasm-target-report.json
```

---

# Package Boundaries

`galerina-core-compute` owns:

```text
ComputeWorkload
DataShape
GpuSuitability
GpuPlan
OpticalNeed
OpticalPlan
PhotonicPlan
WasmTarget
TargetProfile
CompatibilityBlocker
CompatibilityWarning
CompatibilityResult
CompatibilityReport
ComputePlan
estimateTarget
```

It does not own:

```text
actual GPU kernels
actual WASM codegen
photonic hardware drivers
vendor runtime bindings
AI model file formats
network transport implementations
```

---

# Recommended File Layout

```text
packages-galerina/galerina-core-compute/src/

  workload/
    compute-workload.ts
    data-shape.ts

  gpu/
    gpu-suitability.ts
    gpu-plan.ts

  optical/
    optical-need.ts
    optical-plan.ts
    photonic-plan.ts

  wasm/
    wasm-target.ts
    wasm-policy.ts

  compatibility/
    target-profile.ts
    compatibility-result.ts
    compatibility-report.ts
    target-compatibility.ts

  planning/
    compute-plan.ts
    estimate-target.ts
```

---

# Testing Strategy

```ts
describe("target compatibility", () => {
  it("rejects filesystem effects in browser WASM", () => {
    const result = checkTargetCompatibility(
      {
        ...fixtureWorkload,
        effects: ["filesystem.read"]
      },
      browserWasmProfile
    )

    expect(result.blockers.some(blocker => blocker.code === "SPORE-COMPAT-001")).toBe(true)
  })
})
```

```ts
describe("GPU suitability", () => {
  it("warns when workload is too small for GPU transfer cost", () => {
    const suitability = estimateGpuSuitability({
      ...fixtureWorkload,
      operationCount: 1000
    })

    expect(suitability.warnings.length).toBeGreaterThan(0)
  })
})
```

---

# Fail-Closed Rules

The compute planner must never:

```text
silently select forbidden targets
silently move sensitive data to unapproved devices
silently fall back without reporting
claim real GPU/photonic execution when only planning exists
turn vendor names into permanent language syntax
ignore WASM forbidden effects
```

If no compatible target exists, the planner must return diagnostics and require runtime/deployment denial.

---

# Summary

The v0.2 compute architecture defines:

```text
ComputeWorkload
DataShape
GpuSuitability
GpuPlan
OpticalNeed
OpticalPlan
PhotonicPlan
WasmTarget
TargetProfile
CompatibilityBlocker
CompatibilityWarning
CompatibilityResult
CompatibilityReport
ComputePlan
estimateTarget
```

The core rule is:

```text
Galerina source declares intent; compute planning recommends safe targets; runtime/deployment policy decides execution.
```
