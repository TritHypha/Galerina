# Galerina — Data Layout Hints, Profiling and Nondeterministic Annotation

## Overview

Three features that improve compute planning at the memory, observability and runtime layers:

1. **Data Layout Hints** (`packed`, `aligned`, `simd`) — explicit struct/buffer layout for
   SIMD, GPU transfer and native interop
2. **Profiling and Observability** — kernel telemetry, bandwidth analysis, performance-aware
   scheduling and PGO integration
3. **Nondeterministic Annotation** — explicit labelling of probabilistic execution paths for
   AI-native orchestration and adaptive runtime planning

---

## Part 1: Data Layout Hints

### Problem

Without layout hints, the compiler cannot know:

```text
whether fields are padded
whether memory is aligned for SIMD loads
whether a struct is safe for GPU upload
whether zero-copy is safe
whether packed binary parsing is allowed
```

These are required for safe GPU transfer planning, SIMD vectorization and native ABI interop.

### Three Keywords

#### `packed`

No implicit padding between fields:

```galerina
packed struct NetworkHeader {
    version: UInt8
    flags:   UInt8
    length:  UInt16
}
```

Use cases: binary file formats, network packet parsing, compact storage.
Note: packed structs may not be directly SIMD-safe without an aligned copy.

#### `aligned(N)`

Instance must start at an N-byte boundary (N must be a power of two ≥ 8):

```galerina
aligned(16) struct Vec4 {
    x: Float32
    y: Float32
    z: Float32
    w: Float32
}
```

Use cases: SIMD loads, GPU buffers, native ABI interop.

#### `simd`

Layout declares SIMD-friendly access; fields must be SIMD-compatible types:

```galerina
simd aligned(16) struct Float4 {
    x: Float32
    y: Float32
    z: Float32
    w: Float32
}
```

`packed simd` is invalid — packed layout breaks alignment required for SIMD.

### Combined Examples

GPU-safe particle:

```galerina
aligned(32) struct Particle {
    position: Vector<4, Float32>
    velocity: Vector<4, Float32>
    mass:     Float32
    lifetime: Float32
}

deterministic flow updateParticles(
    pinned borrow particles: Array<Particle>
) -> Array<Particle> {
    compute target gpu { fallback cpu }
    return particles.map(updateParticle)
}
```

### AST Additions

```text
LayoutHint            — attached to StructDecl, FieldDecl, ParameterDecl
StructDecl.layout     — { packed?: bool, simd?: bool, alignment?: number }
```

Prefer structured metadata on `structDecl` over duplicate node kinds.

### Compiler Rules

| Scenario | Result |
|---|---|
| `aligned(7)` | LN-LAYOUT-001 — invalid alignment (not power-of-two) |
| `packed simd` together | LN-LAYOUT-002 — packed/SIMD conflict |
| `simd` struct with `String` field | LN-LAYOUT-003 — field not SIMD-compatible |
| Dynamic-field struct used in GPU transfer | LN-LAYOUT-004 — GPU requires stable layout |
| Layout conversion needed | LN-LAYOUT-006 — explicit `copy aligned(N) buffer` required |

### Layout Report

```json
{
    "type": "Particle",
    "layout": {
        "packed": false,
        "simd": false,
        "alignment": 32,
        "stable": true,
        "gpuUploadable": true,
        "copyRequired": false
    }
}
```

### Diagnostics

| Code | Meaning |
|---|---|
| `LN-LAYOUT-001` | Invalid alignment value |
| `LN-LAYOUT-002` | Packed/SIMD conflict |
| `LN-LAYOUT-003` | Unsupported SIMD field type |
| `LN-LAYOUT-004` | GPU transfer requires stable layout |
| `LN-LAYOUT-005` | Target does not support requested alignment |
| `LN-LAYOUT-006` | Layout conversion requires explicit copy |
| `LN-LAYOUT-007` | Dynamic field prevents zero-copy |
| `LN-LAYOUT-008` | Native ABI layout is unstable |

---

## Part 2: Profiling and Observability for Compute

### Problem

Galerina currently has strong governance observability (security audit, policy enforcement,
orchestration traces) but lacks equivalent observability for compute performance:

```text
no profiling annotations
no kernel timing reports
no memory bandwidth analysis
no occupancy metrics
no transfer latency telemetry
no accelerator utilization traces
```

Without profiling, bottlenecks remain hidden and accelerator tuning is manual guesswork.

### Desired Profiling Syntax

```galerina
// Flow-level profiling
profile flow inference {
    targets [timing, bandwidth, occupancy]
}

// Kernel-level profiling
profile kernel matmul {
    targets [timing, bandwidth]
}
```

### Structured Telemetry Schema

```text
Timing:          kernel_duration_ms, transfer_duration_ms, queue_wait_time
Memory:          vram_usage, shared_memory_usage, cache_pressure
Accelerator:     occupancy, warp_efficiency, tensor_core_utilization
```

### Required AST Additions

```text
ProfileAnnotation
ProfileTarget
KernelProfile
BandwidthMetric
OccupancyMetric
```

### Profile-Guided Optimization Path

**First execution:**

```galerina
profile flow inference
```

Runtime collects occupancy, latency, memory bandwidth, sync overhead.

**Subsequent compilation:**

```galerina
optimize using profile inference_profile
```

Compiler adjusts tiling, modifies launch parameters, changes placement strategy.

**Adaptive syntax:**

```galerina
compute target best using profile
optimize profile guided
```

### Required AST Additions (PGO)

```text
ProfileGuidedOptimization
OptimizationProfile
AdaptivePlacement
PerformanceHint
```

### Governance vs Performance Observability

AI-native systems require both:

| Current | Missing |
|---|---|
| Security audit logs | Kernel timing reports |
| Policy decision traces | Memory bandwidth analysis |
| Orchestration histories | Occupancy metrics |
| Permission enforcement | Adaptive target selection |

### Priority Order

**Immediate:**
1. Profiling annotations (`profile flow`, `profile kernel`)
2. Structured telemetry generation
3. Runtime performance tracing

**Next Phase:**
4. Profile persistence and evidence management
5. Profile-guided optimization
6. Adaptive target selection

---

## Part 3: Nondeterministic Annotation Framework

### Concept

AI-native systems — LLM outputs, retrieval results, agent interactions, external tools —
introduce uncertainty at every stage. Galerina should model this uncertainty explicitly rather
than hiding it.

**Status: FUTURE** — depends on AI orchestration runtime layer.

### Annotation Types

#### Probabilistic Decision Nodes

```galerina
decision nondeterministic {
    confidence_threshold 0.82
    fallback_route human_review
}
```

#### Multi-Path Runtime Planning

```galerina
execution adaptive {
    possible_paths [retrieval_augmented, direct_reasoning, tool_augmented]
}
```

#### Agent Uncertainty Annotation

```galerina
agent uncertain {
    uncertainty_score 0.34
    requires_validation true
}
```

#### Dynamic Context Expansion

```galerina
context exploratory {
    expand_if_low_confidence true
}
```

### Runtime Planning Benefits

Annotations allow the runtime to:

```text
dynamically route workflows
select inference strategies
escalate to humans when confidence is low
trigger retries or alternate models
expand context windows
perform self-verification
choose alternate execution paths
```

### Relationship to Determinism

Nondeterministic annotations are the complement of `deterministic flow`:

```text
deterministic flow  — must reject random, clock, unordered effects
nondeterministic flow — explicitly models uncertainty; runtime may branch adaptively
```

These are not replacements. A language needs both to describe the full spectrum from
pure compute (deterministic) to AI orchestration (probabilistic).

### Future Runtime Flow

```text
Input
  ↓ Intent Detection
  ↓ Nondeterministic Annotation Layer
  ↓ Runtime Planner
  ↓ Inference / Agent Execution
  ↓ Evaluation & Confidence Scoring
  ↓ Adaptive Routing
  ↓ Output
```

---

## Architecture Placement

| Layer | Responsibility |
|---|---|
| `galerina-core` | Layout hint syntax, `packed`/`aligned`/`simd` definitions |
| `galerina-core-compiler` | Layout validation, SIMD compatibility checker, GPU upload safety |
| `galerina-core-compute` | Layout-aware placement planning, GPU upload compatibility |
| `galerina-core-runtime` | Actual alignment enforcement, copy requirements, DMA-safe allocator |
| `galerina-target-gpu` | GPU layout requirements and transfer ABI |
| `galerina-target-cpu` | SIMD layout reports, vectorization eligibility |
| `galerina-core-reports` | Layout reports, profiling telemetry, optimization reports |
| `galerina-tools-benchmark` | Profile generation, performance regression detection |
| `galerina-ai-neural` | Nondeterministic annotation for AI orchestration flows |
