# Galerina GPU Target

This document defines the Galerina core language contract for GPU target declarations
and reports.

Status: draft language and compiler contract. GPU target planning and output
contracts belong in `packages-galerina/galerina-target-gpu/`. Compute target selection belongs
in `packages-galerina/galerina-core-compute/`.

## Purpose

Galerina should support GPU as a planning target for pure compute work.

The core language should let developers declare intent:

```text
this work prefers GPU
this work may fall back to CPU
this work needs reportable precision and data movement decisions
```

The core language should not become a GPU programming language.

## Example

```Galerina
pure flow matrixScore(
  weights: Matrix<4, 4, Float32>,
  input: Vector<4, Float32>
) -> Vector<4, Float32> {
  compute target gpu {
    fallback cpu

    output = weights * input
  }

  return output
}
```

## Syntax Contract

GPU targeting appears inside a `compute` block:

```Galerina
compute target gpu {
  fallback cpu

  output = pureCompute(input)
}
```

GPU may also be used as a preference:

```Galerina
compute target best {
  prefer gpu
  fallback cpu

  output = pureCompute(input)
}
```

## Compiler Checks

`galerina-core` and `galerina-core-compiler` should check:

```text
compute block is pure
GPU target syntax is valid
fallback is declared where required
operations are target-candidate operations
side effects are denied
source location is preserved
diagnostics are safe and actionable
```

Candidate operations may include:

```text
matrix multiplication
vector transforms
tensor operations
batch numeric operations
pure model inference calls
```

Denied operations include:

```text
file I/O
network I/O
database access
environment access
secret access
console logging
shared mutable state writes
```

## Reports

GPU target report entries should include:

```text
flow name
source location
requested target
actual target
fallback target
mapped operations
unsupported operations
data movement estimate
precision policy
target package handoff
diagnostics
safe suggested fixes
```

Possible output paths:

```text
build/gpu/app.gpu.plan.json
build/reports/gpu-target-report.json
build/reports/gpu-fallback-report.json
build/reports/gpu-data-movement-report.json
```

## Fallback Rules

GPU targeting must fail safely.

Rules:

```text
do not silently fall back without a report
fall back only when fallback is declared
require CPU reference verification where precision matters
report unsupported operations
report data movement costs where known
do not claim vendor execution unless a backend exists
```

## Package Boundaries

```text
galerina-core
  target syntax, compiler-facing checks and report contracts

galerina-core-compute
  target selection, capability model, budgets and fallback planning

galerina-core-vector
  vector, matrix and tensor operation semantics

galerina-target-gpu
  GPU capability model, kernel mapping plans, precision/data movement reports
```

Final rule:

```text
galerina-core defines GPU target syntax.
galerina-core-compute decides whether GPU is suitable.
galerina-target-gpu produces GPU plans and reports.
```
