# Galerina — Compiler Optimizations and Backend Architecture

## Overview

Five compiler optimization features, plus the LLVM/MLIR backend pathway, provide the
performance foundation for Galerina. Each builds on the language's existing pure-flow
semantics, effect graph, ownership model, and pipeline type system.

1. **Compile-Time Flow Evaluation (`comptime`)** — pure flows folded to constants
2. **Pipeline Loop Fusion** — adjacent filter/map/fold stages merged to one pass
3. **Bounds-Check Elimination** — proven-safe index accesses lowered to unchecked output
4. **Profile-Guided Kernel Launch Tuning** — trusted execution evidence feeds target selection
5. **LLVM/MLIR Backend** — native codegen path via typed MIR

All five are MIR-level optimizations — not JS-emitter hacks. They benefit all backends.

---

## Part 1: Compile-Time Flow Evaluation (`comptime`)

### Concept

Pure flows called with compile-time-known arguments are evaluated during compilation and
folded into constants. Zero runtime cost.

```galerina
pure flow square(x: Int) -> Int {
  return x * x
}

let result = square(4)    // lowers to: let result = 16
```

### Pure vs Comptime

Not all pure flows should auto-evaluate at compile time. Galerina distinguishes:

```galerina
// Automatic optimisation — compiler may fold
pure flow add(a: Int, b: Int) -> Int { return a + b }

// Guaranteed compile-time — must succeed or fail build
pure comptime flow generateMask(bits: Int) -> Vector<Bool, 8> { ... }
const Mask = generateMask(8)
```

### Good Comptime Candidates

```text
math and constant folding
policy validation
shape computation (tensor dimensions)
lookup table generation
routing table generation
compile-time regex/state-machine
serialization layout
permission map generation
crypto policy validation
```

### What Must Not Be Comptime

```text
network, filesystem, current time, randomness,
environment variables, process state, secret access,
database queries, runtime device inspection
```

These fail purity analysis before comptime analysis.

### Security Rule

Comptime evaluation runs in a deterministic sandbox with no filesystem, network, secret,
system clock or host-process access. A comptime flow that attempts any of these fails the build.

```galerina
comptime_policy {
    max_eval_time 5s
    max_memory 256mb
    max_recursion 1024
    max_generated_size 16mb
}
```

### Reproducibility

Comptime output must be identical across Linux/macOS/Windows/CI. This requires avoiding
host-dependent behavior (locale, timezone, float-point edge cases, OS-specific APIs).

### Pipeline Position

```text
parse → type check → effect analysis → purity analysis
→ comptime evaluation → constant propagation → dead code elimination
→ MIR generation → backend lowering
```

### Diagnostics

| Code | Meaning |
|---|---|
| `SPORE-COMPTIME-001` | Effectful flow cannot execute at compile time |
| `SPORE-COMPTIME-002` | Nondeterministic operation in comptime flow |
| `SPORE-COMPTIME-003` | Compile-time evaluation exceeded resource budget |
| `SPORE-COMPTIME-004` | Comptime flow attempted forbidden runtime access |
| `SPORE-COMPTIME-005` | Secret value cannot be embedded into compile-time constant |
| `SPORE-COMPTIME-006` | Target-dependent comptime result detected |
| `SPORE-COMPTIME-007` | Recursive comptime evaluation exceeded limit |
| `SPORE-COMPTIME-008` | Unsupported type for compile-time serialization |

---

## Part 2: Pipeline Loop Fusion

### Concept

Adjacent collection pipeline stages such as `filter`, `map`, `fold` are fused into a single
traversal when the compiler proves it is safe.

```galerina
// Source — three separate iterations
let total =
    orders
        .filter(order => order.status == Paid)
        .map(order => order.total)
        .fold(0, (sum, t) => sum + t)
```

Fused lowering:

```text
sum = 0
for order in orders:
    if order.status == Paid:
        sum = sum + order.total
```

One pass. No intermediate allocations.

### Pipeline IR Node

Rather than lowering to chained runtime calls, Galerina should first represent pipelines as
a single IR node:

```text
Pipeline {
    source: orders
    stages: [Filter(isPaid), Map(toLine), Fold(total)]
    effects: pure
    result: Money
}
```

The fusion pass then lowers to a `FusedLoop` node, preserving source maps.

### Fusion Legality

Fusion is only valid when:

```text
stage order is preserved
effects are ordered correctly
errors report the original stage
short-circuit semantics are preserved
lifetimes/allocations are equivalent
no intermediate collection is observed elsewhere
```

### What Fuses Safely

```text
pure map → map
pure filter → map
filter → map → fold
map → fold
filter → take
filter → collect (when result not observed mid-pipeline)
```

### What Does Not Fuse

```text
effectful stages where order matters
stages that intentionally materialise a collection
lazy/infinite streams without a terminal bound
flatMap with large expansion (cost model dependent)
```

### Error Semantics

Fused loops must preserve which error occurred first and which stage produced it. Source
spans for each original stage are embedded in the fused loop IR.

### Diagnostics

| Code | Meaning |
|---|---|
| `SPORE-PIPELINE-001` | Pipeline fused successfully (report) |
| `SPORE-PIPELINE-002` | Fusion skipped — effect ordering conflict |
| `SPORE-PIPELINE-003` | Fusion skipped — intermediate materialisation required |
| `SPORE-PIPELINE-004` | Fusion skipped — lifetime escape |
| `SPORE-PIPELINE-005` | Fusion skipped — error order ambiguity |
| `SPORE-PIPELINE-006` | Fusion would change short-circuit behavior |

---

## Part 3: Compile-Time Bounds-Check Elimination

### Concept

When the compiler can prove from control flow that an index is within bounds, the runtime
check is omitted from generated output. The developer still writes the safe form.

```galerina
// Source always safe
for i in 0..items.length {
    let item = items.get(i)
    process(item)
}
```

When proof holds: `items.get(i)` → `unchecked_load(items, i)` in output.
When proof fails: `items.get(i)` → `checked_get(items, i)` — the check remains.

### Required Proof Facts

```text
i starts at 0 and is monotonically increasing
loop exits before i == items.length
items.length is stable for the loop body
items is the same collection being indexed
no alias can mutate the collection inside the loop
integer arithmetic cannot overflow
```

### Proof Inputs at MIR Level

```text
control-flow graph, range analysis, integer overflow rules,
collection identity, mutation/alias analysis, borrow/lifetime info,
effect analysis, loop induction variables, dominance analysis
```

Syntax patterns alone are not enough — the pass operates on typed MIR.

### Fail-Safe Default

If proof fails: keep the bounds check. Never emit unchecked access without proof.

### Policy Options

```galerina
optimization {
    bounds_check_elimination "safe"     // default
    bounds_check_elimination "report"   // keep + report
    bounds_check_elimination "deny"     // always check (audit mode)
}
```

### Diagnostics

| Code | Meaning |
|---|---|
| `SPORE-BOUNDS-001` | Bounds check eliminated by range proof |
| `SPORE-BOUNDS-002` | Bounds check retained — collection may mutate |
| `SPORE-BOUNDS-003` | Bounds check retained — index range is unknown |
| `SPORE-BOUNDS-004` | Bounds check retained — alias may resize collection |
| `SPORE-BOUNDS-005` | Bounds check retained — integer overflow proof failed |
| `SPORE-BOUNDS-006` | Unsafe unchecked access rejected |

---

## Part 4: Profile-Guided Kernel Launch Tuning

### Concept

`compute target best` can consume trusted execution evidence from prior runs to tune:

```text
grid and block dimensions, tile sizes, vector widths,
memory layout selection, shared memory usage, batch size,
CPU thread count, GPU vs CPU thresholds, transfer batching
```

The source says *what is allowed*. Profile data helps decide *how to run it*.

### Typed Profile Evidence

```json
{
    "workload_hash": "sha256:...",
    "kernel_hash": "sha256:...",
    "target": "gpu",
    "device_profile": "nvidia-sm_89",
    "input_shape_class": "matrix_4096x4096",
    "launch": { "grid": [256, 256, 1], "block": [16, 16, 1], "tile": [32, 32] },
    "metrics": { "p50_ms": 3.4, "p95_ms": 4.1, "memory_mb": 512, "transfer_ms": 0.8 },
    "correctness": { "verified_against_cpu_reference": true, "tolerance": "exact_or_declared" },
    "valid_until": "2026-06-30"
}
```

### Governance Rules

Profile data must not override permissions, precision policy or fallback authorization:

```galerina
compute_profile_policy {
    use_profile_data true
    require_correctness_evidence true
    require_same_kernel_hash true
    allow_precision_relaxation false
    max_memory 2gb
    stale_profile "warn"
}
```

### Priority Order

```text
1. authority and policy    — always first
2. correctness             — before tuning
3. resource budgets        — declared limits
4. profile-guided performance — fourth
```

### Build-Time vs Runtime

- **Build-time PGO**: compiler consumes profile file and emits tuned artefacts → reproducible
- **Runtime adaptive**: runtime updates choices from live evidence → adds after build-time PGO is stable

### Diagnostics

| Code | Meaning |
|---|---|
| `SPORE-PGO-001` | Profile evidence ignored — workload hash changed |
| `SPORE-PGO-002` | Profile evidence ignored — target is not approved |
| `SPORE-PGO-003` | Profile evidence stale for current backend version |
| `SPORE-PGO-004` | Tuned launch exceeds memory budget |
| `SPORE-PGO-005` | Tuned launch failed correctness verification |
| `SPORE-PGO-006` | Profile requested forbidden precision relaxation |
| `SPORE-PGO-007` | No profile evidence available; using baseline planner |
| `SPORE-PGO-008` | Tuned launch selected from trusted profile evidence |

---

## Part 5: LLVM/MLIR Backend

### Staged Backend Path

The JavaScript prototype output path cannot be the final performance foundation. The right
path is:

```text
Galerina AST
  → Galerina HIR
  → Galerina MIR  (typed, carries effects/ownership/boundaries/source spans)
  → Galerina MLIR dialect  (preserves high-level semantics for multi-target lowering)
  → LLVM IR / GPU dialect / WASM lowering
  → native object / WASM module / target artefact
```

### LLVM vs MLIR

| Layer | Best For |
|---|---|
| LLVM | Native CPU codegen, DCE, LTO, auto-vectorisation, WASM backend |
| MLIR | Multi-level IR, domain dialects, gradual lowering, tensor/vector ops, GPU-oriented transforms |

MLIR is the better bridge for Galerina's multi-target ambition. LLVM is the final native backend.

### Why Not Direct LLVM?

Lowering directly to LLVM IR too early loses:

```text
effect boundaries, security boundaries, taint/provenance, request scopes,
secret-safe operations, compute block intent, vector shape, fallback policies,
audit metadata, source-map richness
```

MLIR preserves this metadata while applying transformations.

### Galerina Graphs as IR Drivers

| Graph | Drives |
|---|---|
| Effect graph | Pure-function optimisation, safe DCE, permission checks |
| Boundary graph | Security diagnostics, runtime guard insertion, taint checks |
| Compute graph | CPU/WASM/GPU planning, vector lowering, data movement reports |
| Ownership graph | Arena allocation, stack vs heap, escape analysis, bounds-check elimination |

### Staging

**Stage 1 — Typed MIR**: JSON or textual `.lmir` carrying types, ownership, effects,
capabilities, boundaries, basic blocks, control flow, source spans.

**Stage 2 — LLVM textual IR prototype**: lower a tiny safe subset (Int, Bool, String
reference, pure arithmetic, simple flows, Result/Option).

**Stage 3 — WASM/native CPU target**: emit native object, WASM module, debug info, source maps.

**Stage 4 — MLIR dialect**: introduce `galerina.effect`, `galerina.boundary`, `galerina.secret`,
`galerina.taint`, `galerina.compute`, `galerina.vector` operations.

**Stage 5 — Optimisation and LTO**: DCE, inlining, escape analysis, bounds elimination,
vectorisation, LTO, PGO — only after correctness and source maps are stable.

### Diagnostics

| Code | Meaning |
|---|---|
| `SPORE-BACKEND-001` | Target backend not available |
| `SPORE-BACKEND-002` | Feature not lowerable to selected backend |
| `SPORE-BACKEND-003` | Runtime ABI mismatch |
| `SPORE-BACKEND-004` | Unsafe native lowering requires explicit permission |
| `SPORE-BACKEND-005` | Source map unavailable for optimised output |
| `SPORE-BACKEND-006` | Backend optimisation would violate security boundary |
| `SPORE-BACKEND-007` | Target fallback denied by policy |

---

## Optimization Priority Table

| Feature | Priority | Prerequisite |
|---|---|---|
| Comptime evaluation | IMPORTANT | Purity analysis, MIR |
| Pipeline loop fusion | IMPORTANT | Pipeline IR node, MIR |
| Bounds-check elimination | IMPORTANT | Range + alias analysis, MIR |
| Profile-guided tuning | NEXT PHASE | Baseline compute planner, compute reports |
| LLVM/MLIR backend | LONG-TERM | Typed MIR, effect/boundary graphs |

---

## Architecture Placement

| Layer | Responsibility |
|---|---|
| `galerina-core` | Purity semantics, comptime syntax, pipeline semantics |
| `galerina-core-compiler` | Comptime evaluator, pipeline IR, fusion pass, range analysis, MIR generation |
| `galerina-core-runtime` | Unfused fallback operations, runtime arenas |
| `galerina-core-compute` | Target capability rules, workload fingerprints, PGO trust policy |
| `galerina-core-security` | Sandboxing rules for comptime, secret restrictions |
| `galerina-target-cpu` | CPU feature detection, LLVM target policy |
| `galerina-target-wasm` | WASM module metadata |
| `galerina-target-native` | Native artefact metadata |
| `galerina-target-gpu` | GPU kernel launch parameters, PGO evidence |
| `galerina-core-vector` | Vector/matrix/tensor operations feeding IR |
| `galerina-core-reports` | Optimisation reports, PGO evidence, comptime reports, backend reports |
| `galerina-tools-benchmark` | Reproducible benchmarks, PGO generation, regression detection |
