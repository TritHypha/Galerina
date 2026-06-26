# Galerina — Compiler Enforcement Gaps for Compute Targets

## Overview

Galerina defines ambitious semantics for heterogeneous compute, deterministic execution
and governed runtime orchestration. However, three critical enforcement systems are
currently incomplete, creating a mismatch between language promises and compiler guarantees.

Without these, "governed" compute constructs fail at runtime instead of compile time:
governance becomes advisory rather than enforced.

---

## Gap 1: Capability Gating Not Enforced for GPU/WASM Flows (CRITICAL)

### The Problem

A flow can currently declare a GPU/WASM target and still include forbidden effects:

```galerina
flow inference targets [gpu] {
    database.write(results)   // should be a compile error — currently compiles
}
```

GPU and WASM environments cannot safely support:

```text
blocking IO
arbitrary system calls
unrestricted networking
dynamic OS interaction
uncontrolled side effects
```

### Required Compiler Behavior

The compiler must reject forbidden effects inside compute-restricted contexts:

```galerina
// These must fail compilation inside targets [gpu] or targets [wasm]:
network.call()
filesystem.write()
database.insert()
random()
clock.now()
process.spawn()
```

Compile error:

```text
SPORE-TARGET-CAP-001: database.write is forbidden inside GPU-targeted flow

Flow:  inference
Target: gpu
Effect: database.write (forbidden in this target context)

Suggestion:
  Move the database write to a CPU flow that calls inference,
  or use an output buffer to collect results.
```

### Required AST Additions

```text
CapabilityConstraint
TargetCapabilityRule
ForbiddenEffect
AllowedEffect
```

### Required Compiler Passes

```text
effect propagation         — collect all effects transitively for a flow
capability validation      — check effects against target capability rules
target compatibility       — verify flow effects are permitted for declared targets
deterministic safety       — reject nondeterministic operations in deterministic flows
```

---

## Gap 2: Cross-Target Numeric Equivalence Unspecified (CRITICAL)

### The Problem

Galerina supports `verify cpu_reference` syntax:

```galerina
compute target best verify cpu_reference
```

But the verification semantics are undefined:
- no tolerance rules
- no mismatch handling
- no numeric equivalence definition

Cross-target execution rarely produces bit-identical results due to floating-point
precision, instruction ordering, SIMD vectorization, GPU reduction order and fused
multiply-add operations.

### Required Semantics

Tolerance-based verification:

```galerina
compute target gpu verify cpu_reference {
    tolerance {
        relative 1e-5
        absolute 1e-7
        per_element true
    }
    on_mismatch {
        policy fallback_cpu
        report diagnostics
    }
}
```

| Mode | Description |
|---|---|
| `relative: N` | Result must be within N× of reference value |
| `absolute: N` | Result must be within N units of reference value |
| `per_element` | Compare tensor element-by-element |
| `aggregate` | Compare aggregate statistics (mean, max error) |
| `ulp: N` | Within N units in the last place |

Mismatch handling policies:

```text
fallback_cpu       — re-execute on CPU reference
warn               — emit diagnostic warning
abort              — fail the execution
telemetry          — log divergence without action
```

### Required Features

**Compiler:**
```text
numeric verification metadata attached to compute flows
precision propagation through tensor operations
target-aware comparison policies
```

**Runtime:**
```text
reference execution (CPU shadow run)
tolerance-aware validation
mismatch diagnostics
reproducibility telemetry
```

---

## Gap 3: Compute Resource Budgets Unspecified (CRITICAL)

### The Problem

The current resource system governs ownership and runtime services but not compute
hardware budgets. A GPU kernel exceeding VRAM or register limits may cause:

```text
10–50× performance collapse
unpredictable latency
scheduler instability
```

Without compiler visibility, these failures are silent until deployment.

### Required Syntax

Resource declarations at project/flow level:

```galerina
resource gpu {
    vram_limit 16GB
    shared_memory 64KB
    registers 128
    tensor_cores true
}

resource cpu {
    cores 8
    l3_cache 32MB
    numa_locality local
}
```

Flow-level budget:

```galerina
flow inference targets [gpu] {
    budget {
        vram 8GB
        timeout 100ms
        occupancy high
    }
    // ...
}
```

### Compiler Responsibilities

```text
estimate memory usage for tensor operations
validate occupancy constraints against declared budget
detect likely register spills
infer scheduling pressure
optimize placement decisions
```

### Runtime Responsibilities

```text
enforce declared budgets
reject unsafe deployments
monitor resource pressure
rebalance workloads
prevent accelerator starvation
```

---

## Summary

| Gap | Priority | Consequence If Missing |
|---|---|---|
| Capability gating not enforced for GPU/WASM | CRITICAL | Governance promises fail at runtime |
| Cross-target verification unspecified | CRITICAL | Correctness semantics undefined |
| Compute resource budgets absent | CRITICAL | Unpredictable performance collapse |

---

## Priority Order

### Immediate

1. Compiler-enforced capability gating for compute targets
2. Cross-target verification semantics and tolerance model
3. Compute resource budgeting model

### Next Phase

4. Occupancy-aware scheduling
5. Hardware-aware optimization passes
6. Predictive runtime placement

---

## Diagnostics

| Code | Meaning |
|---|---|
| `SPORE-TARGET-CAP-001` | Effect forbidden inside this compute target |
| `SPORE-TARGET-CAP-002` | Deterministic flow cannot use nondeterministic effect |
| `SPORE-VERIFY-001` | Cross-target verification failed within tolerance |
| `SPORE-VERIFY-002` | Verification tolerance not declared for this target |
| `SPORE-BUDGET-001` | Flow exceeds declared VRAM budget |
| `SPORE-BUDGET-002` | Register usage exceeds declared limit |
| `SPORE-BUDGET-003` | Occupancy constraint cannot be met for this kernel |
| `SPORE-BUDGET-004` | Timeout budget exceeded |

---

## Architecture Placement

| Layer | Responsibility |
|---|---|
| `galerina-core` | Effect/capability type definitions, budget policy syntax |
| `galerina-core-compiler` | Effect propagation, capability validation, target compatibility pass |
| `galerina-core-compute` | Target capability rules, resource budget model |
| `galerina-core-runtime` | Budget enforcement, mismatch handling, reference execution |
| `galerina-core-reports` | Target compatibility report, budget utilization report, verification report |
| `galerina-target-gpu` | GPU-specific capability rules and budget enforcement |
| `galerina-target-wasm` | WASM-specific capability restrictions |
