# Galerina Core Vector: Photonic Governance Architecture

Package: `packages-galerina/galerina-core-vector`

Status: **fully specified (prior + v0.2), not yet implemented**

> **Boundary conflict note**: The `galerina-core-vector` README (boundary rules) states that photonic representation belongs in `galerina-core-photonic` and `galerina-target-photonic`, not in `galerina-core-vector`. This specification documents what has been proposed for `galerina-core-vector` in the notes files. The conflict must be resolved before implementation. See [Boundary Conflict](#boundary-conflict) section below.

Update status: this file is a proposal/reference note, not the canonical owner
of photonic runtime contracts. `galerina-core-photonic` owns final
`OpticalTransportMode`, `PhotonicRuntimeTarget`, `PhotonicExecutionPlan` and
`SPORE-PHOTONIC-*` definitions after reconciliation.

---

## Prior Governance Architecture

The original governance architecture established:

- optical execution planning contracts
- runtime targeting
- optical suitability estimation
- deterministic fallback handling
- deny-by-default execution governance
- photonic transport abstractions

### Directory Layout (Prior)

```text
src/
  photonic/
    transport.ts         # OpticalTransportMode
    target.ts            # PhotonicRuntimeTarget
    plan.ts              # PhotonicExecutionPlan
    estimate.ts          # estimateOpticalSuitability
    build.ts             # buildPhotonicPlan
    fallback.ts          # resolveFallback
    validate.ts          # validation helpers
    codes.ts             # SPORE-PHOTONIC-001–006
    index.ts             # public exports
```

### `OpticalTransportMode` (Prior — 3 values)

```ts
export type OpticalTransportMode =
  | "electrical"
  | "hybrid"
  | "photonic";
```

| Value | Meaning |
|---|---|
| `"electrical"` | Traditional electronic execution and transport |
| `"hybrid"` | Mixed optical/electrical execution path |
| `"photonic"` | Fully optical-oriented execution target |

### `PhotonicRuntimeTarget` (Prior)

```ts
export interface PhotonicRuntimeTarget {
  runtimeId: string;

  transport: OpticalTransportMode;

  supportsOpticalExecution: boolean;

  supportsFallback: boolean;

  topology?: string;

  metadata?: Record<string, unknown>;
}
```

Example:

```ts
const target: PhotonicRuntimeTarget = {
  runtimeId: "galerina-photonic-runtime-01",
  transport: "photonic",
  supportsOpticalExecution: true,
  supportsFallback: true,
  topology: "ring-mesh",
};
```

### `PhotonicExecutionPlan` (Prior)

```ts
export interface PhotonicExecutionPlan {
  executionId: string;

  runtimeTarget: PhotonicRuntimeTarget;

  opticalSuitability: number;

  fallbackRequired: boolean;

  fallbackTarget?: string;

  metadata?: Record<string, unknown>;
}
```

```ts
// opticalSuitability represents a deterministic suitability score.
// Runtime planning must not depend on nondeterministic heuristics.
```

### `estimateOpticalSuitability` (Prior)

```ts
export interface EstimateOpticalSuitabilityInput {
  workloadType: string;
  memoryRequirements?: number;
  bandwidthRequirements?: number;
  latencySensitivity?: number;
  parallelismFactor?: number;
}

export function estimateOpticalSuitability(
  input: EstimateOpticalSuitabilityInput,
): number;
```

Suggested scoring:

```ts
export function estimateOpticalSuitability(input) {
  let score = 0;

  // High bandwidth = strong photonic candidate.
  if ((input.bandwidthRequirements ?? 0) > 1000) {
    score += 30;
  }

  // High parallelism = strong photonic candidate.
  if ((input.parallelismFactor ?? 0) > 64) {
    score += 30;
  }

  // High latency sensitivity = good photonic candidate.
  if ((input.latencySensitivity ?? 0) > 8) {
    score += 20;
  }

  return Math.min(score, 100);
}
```

### `buildPhotonicPlan` (Prior)

```ts
export interface BuildPhotonicPlanInput {
  executionId: string;
  target: PhotonicRuntimeTarget;
  suitability: number;
}

export function buildPhotonicPlan(
  input: BuildPhotonicPlanInput,
): PhotonicExecutionPlan;
```

Suggested implementation:

```ts
export function buildPhotonicPlan(input) {
  return {
    executionId: input.executionId,
    runtimeTarget: input.target,
    opticalSuitability: input.suitability,
    fallbackRequired: input.suitability < 50,
    fallbackTarget:
      input.suitability < 50
        ? "galerina-electrical-runtime"
        : undefined,
  };
}
```

### `resolveFallback` (Prior)

```ts
export interface ResolveFallbackInput {
  target: PhotonicRuntimeTarget;
  suitability: number;
}

export function resolveFallback(
  input: ResolveFallbackInput,
): string | undefined;
```

```ts
// Deny-by-default:
// If fallback is not explicitly allowed, execution must be denied.
export function resolveFallback(input) {
  if (!input.target.supportsFallback) {
    return undefined; // deny
  }

  if (input.suitability < 50) {
    return "galerina-electrical-runtime";
  }

  return undefined;
}
```

### SPORE-PHOTONIC-001–006 (Prior Meanings)

```ts
export const PHOTONIC_CODES = {
  LN_PHOTONIC_001: "Invalid optical transport mode",
  LN_PHOTONIC_002: "Unsupported photonic runtime target",
  LN_PHOTONIC_003: "Optical suitability estimation failure",
  LN_PHOTONIC_004: "Photonic execution plan invalid",
  LN_PHOTONIC_005: "Fallback resolution denied",
  LN_PHOTONIC_006: "Nondeterministic execution planning detected",
} as const;
```

### Determinism Rule (Prior)

```ts
// Runtime planning must remain deterministic.
//
// Identical inputs must produce:
// - identical plans
// - identical fallback decisions
// - identical suitability scores
//
// Hidden mutable state must never influence planning.
```

---

## v0.2 Formal Specification

The v0.2 specification expands transport modes, formalises capabilities and topologies, adds explicit validation functions, and mandates determinism.

### Directory Layout (v0.2)

```text
src/
  photonic/
    transport.ts         # OpticalTransportMode v0.2 (6 values)
    capability.ts        # PhotonicCapability
    topology.ts          # PhotonicTopology
    target.ts            # PhotonicRuntimeTarget v0.2
    plan.ts              # PhotonicExecutionPlan v0.2
    validate.ts          # validateTransportMode, validatePhotonicTarget, validatePhotonicPlan
    estimate.ts          # optical suitability estimation
    build.ts             # buildPhotonicPlan
    fallback.ts          # resolveFallback
    codes.ts             # SPORE-PHOTONIC-001–006 v0.2 meanings
    index.ts             # public exports
```

### `OpticalTransportMode` (v0.2 — 6 values)

```ts
export type OpticalTransportMode =
  | "electrical"
  | "hybrid"
  | "photonic"
  | "waveguide"
  | "plasmonic"
  | "coherent";
```

| Value | Meaning |
|---|---|
| `"electrical"` | Traditional electronic execution and transport |
| `"hybrid"` | Mixed optical/electrical execution path |
| `"photonic"` | Fully optical-oriented execution target |
| `"waveguide"` | Waveguide-oriented optical transport |
| `"plasmonic"` | Plasmonic transport or acceleration path |
| `"coherent"` | Coherent optical execution or signalling mode |

> **Breaking change from prior**: 3-value string union → 6-value string union. The 3 original values are preserved; 3 new values are added.

### `PhotonicCapability`

```ts
export type PhotonicCapability =
  | "optical-routing"
  | "waveguide-switching"
  | "coherent-signalling"
  | "hybrid-fallback"
  | "deterministic-routing"
  | "topology-awareness";
```

```ts
// Capabilities represent governance permissions.
// They do not imply automatic enablement.
// Runtime must explicitly declare which capabilities are active.
```

### `PhotonicTopology`

```ts
export type PhotonicTopology =
  | "mesh"
  | "ring"
  | "star"
  | "ring-mesh"
  | "hierarchical"
  | "distributed";
```

| Value | Meaning |
|---|---|
| `"mesh"` | Fully interconnected runtime graph |
| `"ring"` | Ring-structured optical routing |
| `"star"` | Star topology with central hub |
| `"ring-mesh"` | Hybrid ring and mesh topology |
| `"hierarchical"` | Multi-layer governance hierarchy |
| `"distributed"` | Geographically or logically distributed topology |

### `PhotonicRuntimeTarget` (v0.2)

```ts
export interface PhotonicRuntimeTarget {
  runtimeId: string;

  transport: OpticalTransportMode;

  topology: PhotonicTopology;

  capabilities: PhotonicCapability[];

  supportsOpticalExecution: boolean;

  supportsFallback: boolean;

  /** Determinism is mandatory. Must always be true for compliant runtimes. */
  deterministic: boolean;

  metadata?: Record<string, unknown>;
}
```

Example:

```ts
const target: PhotonicRuntimeTarget = {
  runtimeId: "galerina-photonic-runtime-v02",
  transport: "coherent",
  topology: "ring-mesh",
  capabilities: [
    "coherent-signalling",
    "deterministic-routing",
    "hybrid-fallback",
  ],
  supportsOpticalExecution: true,
  supportsFallback: true,
  deterministic: true,
};
```

### `PhotonicExecutionPlan` (v0.2)

```ts
export interface PhotonicExecutionPlan {
  executionId: string;

  runtimeTarget: PhotonicRuntimeTarget;

  opticalSuitability: number;

  /** Must be true for all compliant execution plans. */
  deterministic: boolean;

  /** True only after all governance checks pass. */
  validated: boolean;

  fallbackRequired: boolean;

  fallbackTarget?: string;

  /** List of passed governance validation checks. */
  governanceChecks: string[];

  metadata?: Record<string, unknown>;
}
```

Example:

```ts
const plan: PhotonicExecutionPlan = {
  executionId: "exec_v02_001",
  runtimeTarget: {
    runtimeId: "galerina-coherent-runtime",
    transport: "coherent",
    topology: "ring-mesh",
    capabilities: ["coherent-signalling", "deterministic-routing"],
    supportsOpticalExecution: true,
    supportsFallback: true,
    deterministic: true,
  },
  opticalSuitability: 88,
  deterministic: true,
  validated: true,
  fallbackRequired: false,
  governanceChecks: [
    "transport-validated",
    "topology-validated",
    "determinism-validated",
  ],
};
```

### Validation Functions (v0.2)

```ts
export function validateTransportMode(
  mode: OpticalTransportMode,
): boolean;

export function validatePhotonicTarget(
  target: PhotonicRuntimeTarget,
): boolean;

export function validatePhotonicPlan(
  plan: PhotonicExecutionPlan,
): boolean;
```

Suggested `validateTransportMode`:

```ts
export function validateTransportMode(mode) {
  return [
    "electrical",
    "hybrid",
    "photonic",
    "waveguide",
    "plasmonic",
    "coherent",
  ].includes(mode);
}
```

### SPORE-PHOTONIC-001–006 (v0.2 Meanings)

```ts
export const PHOTONIC_CODES = {
  LN_PHOTONIC_001: "Invalid photonic transport mode",
  LN_PHOTONIC_002: "Invalid photonic capability",
  LN_PHOTONIC_003: "Invalid photonic topology",
  LN_PHOTONIC_004: "Photonic target validation failed",
  LN_PHOTONIC_005: "Photonic execution plan validation failed",
  LN_PHOTONIC_006: "Deterministic governance violation detected",
} as const;
```

### SPORE-PHOTONIC-006

```ts
// Triggered when runtime planning becomes nondeterministic.
//
// Examples of violations:
// - randomised routing decisions
// - hidden mutable state influencing plans
// - timing-sensitive plan generation
// - inconsistent governance outputs from identical inputs
```

### Determinism Rule (v0.2)

```ts
// Determinism is mandatory.
//
// Planning logic:
// - must not use randomness
// - must not use mutable hidden state
// - must not depend on timing side effects
// - must produce reproducible governance results
//
// Deterministic governance enables:
// - audit reproducibility
// - execution replay
// - governance verification
// - execution proof compatibility
```

---

## Security Rules

```ts
// Rule 1: Determinism is mandatory. SPORE-PHOTONIC-006 fires on violations.
```

```ts
// Rule 2: Fallback is deny-by-default.
// If supportsFallback is false, resolveFallback must return undefined.
```

```ts
// Rule 3: Unsupported transport modes must be rejected.
```

```ts
// Rule 4: Unsupported capabilities must be rejected.
```

```ts
// Rule 5: Invalid topologies must be rejected.
```

```ts
// Rule 6: Governance validation must happen before any execution attempt.
```

---

## Boundary Conflict

The `galerina-core-vector` README states:

```text
galerina-core-vector should not own photonic representation.
That belongs in galerina-core-photonic and galerina-target-photonic.
```

This specification proposes placing `PhotonicRuntimeTarget`, `PhotonicExecutionPlan`, and related types in `galerina-core-vector`. The existing `galerina-core-photonic` package already has these types specified in:

- `galerina-core-photonic-backend-architecture.md` (prior KB)
- `galerina-core-photonic-v02.md` (v0.2 formal spec)
- `galerina-core-photonic-governance-architecture.md` (governance architecture)

**Resolution required before implementation**:

| Option | Implication |
|---|---|
| Keep in `galerina-core-photonic` | Vector uses photonic types as an import, not an owner |
| Move to `galerina-core-vector` | Vector package boundary must be updated; photonic package imports from vector |
| Split | Shared types in a common package; both vector and photonic consume them |

Until resolved, no photonic types should be implemented in `galerina-core-vector`.

---

## Implementation Checklist

- [ ] **Resolve boundary conflict** between `galerina-core-vector` and `galerina-core-photonic` ownership
- [ ] Add `src/photonic/transport.ts` — `OpticalTransportMode` v0.2 (6 values)
- [ ] Add `src/photonic/capability.ts` — `PhotonicCapability`
- [ ] Add `src/photonic/topology.ts` — `PhotonicTopology`
- [ ] Add `src/photonic/target.ts` — `PhotonicRuntimeTarget` v0.2
- [ ] Add `src/photonic/plan.ts` — `PhotonicExecutionPlan` v0.2
- [ ] Add `src/photonic/validate.ts` — `validateTransportMode`, `validatePhotonicTarget`, `validatePhotonicPlan`
- [ ] Add `src/photonic/estimate.ts` — `estimateOpticalSuitability`
- [ ] Add `src/photonic/build.ts` — `buildPhotonicPlan`
- [ ] Add `src/photonic/fallback.ts` — `resolveFallback`
- [ ] Add `src/photonic/codes.ts` — `SPORE-PHOTONIC-001–006` v0.2
- [ ] Add `src/photonic/index.ts` — public export surface
- [ ] Add deterministic planning tests
- [ ] Add transport mode validation tests
- [ ] Add topology validation tests
- [ ] Add capability validation tests
- [ ] Add governance plan validation tests
- [ ] Add deny-by-default fallback tests
- [ ] Add suitability scoring tests

---

## Final Contract Summary

```text
OpticalTransportMode (6 values: electrical|hybrid|photonic|waveguide|plasmonic|coherent)
PhotonicCapability (6 values)
PhotonicTopology (6 values)
PhotonicRuntimeTarget v0.2 { runtimeId, transport, topology, capabilities[], supportsOpticalExecution, supportsFallback, deterministic, metadata? }
PhotonicExecutionPlan v0.2 { executionId, runtimeTarget, opticalSuitability, deterministic, validated, fallbackRequired, fallbackTarget?, governanceChecks[], metadata? }
estimateOpticalSuitability (EstimateOpticalSuitabilityInput → number)
buildPhotonicPlan (BuildPhotonicPlanInput → PhotonicExecutionPlan)
resolveFallback (ResolveFallbackInput → string | undefined)
validateTransportMode (OpticalTransportMode → boolean)
validatePhotonicTarget (PhotonicRuntimeTarget → boolean)
validatePhotonicPlan (PhotonicExecutionPlan → boolean)
SPORE-PHOTONIC-001–006 (v0.2 meanings)
```

> **Version conflict**: `OpticalTransportMode` v0.2 (6-value: electrical|hybrid|photonic|waveguide|plasmonic|coherent) differs from the governance architecture spec in `galerina-core-photonic-governance-architecture.md` which defines: DIRECT|WAVELENGTH|PACKETIZED|HYBRID|EMULATED|SIMULATED. These must be reconciled before implementation.
