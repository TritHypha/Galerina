# Galerina Compute Blocks

This document defines the Galerina core language contract for `compute` blocks.

Status: draft language and compiler contract. Detailed compute planning belongs
in `packages-galerina/galerina-core-compute/`. Target-specific output belongs in target packages
such as `packages-galerina/galerina-target-native/`, `packages-galerina/galerina-target-wasm/`,
`packages-galerina/galerina-target-gpu/` and `packages-galerina/galerina-target-photonic/`.

## Purpose

Compute blocks mark pure, data-heavy work that may be suitable for target
planning.

They let the compiler answer:

```text
What work is compute-heavy?
Which effects are forbidden?
Which targets are preferred?
Which fallbacks are allowed?
Is CPU reference verification required?
What report entries should be generated?
```

## Core Rule

```text
compute blocks describe targetable pure work.
compute blocks do not perform I/O.
target packages decide how targetable work is emitted.
fallbacks must be explicit.
reports must explain every target decision.
```

## Example

```Galerina
pure flow scoreFraud(features: FraudFeatures) -> Float {
  compute target best verify cpu_reference {
    prefer photonic
    fallback gpu
    fallback cpu

    score = fraudModel(features)
  }

  return score
}
```

## Syntax Contract

The core syntax shape is:

```Galerina
compute target <target-policy> <verify-policy>? {
  <target preference declarations>
  <pure compute statements>
}
```

Target policy examples:

```text
best
cpu
wasm
gpu
photonic
```

Verification policy examples:

```text
verify cpu_reference
```

Preference declarations:

```Galerina
prefer photonic
fallback gpu
fallback cpu
```

## Allowed Work

Compute blocks should allow pure compute operations such as:

```text
numeric operations
vector operations
matrix operations
tensor operations
pure model inference calls
pure helper flow calls
local immutable value reads
```

## Denied Work

Compute blocks should reject:

```text
file reads or writes
network access
database access
environment access
secret access
time reads
random reads
console logging
mutation of shared state
route handling
webhook handling
task runner execution
```

Invalid:

```Galerina
compute target photonic {
  result = readFile("./data.txt")
}
```

Diagnostic:

```text
Target error:
readFile cannot run inside a photonic compute block.

Suggestion:
Move file reading outside the compute block and pass parsed data into the model.
```

## Compiler Checks

`galerina-core` and `galerina-core-compiler` should define checks for:

```text
valid compute target policy
valid prefer declarations
valid fallback declarations
valid verify declaration
unsupported effects inside compute block
unsupported operations for requested target category
missing fallback when fallback is required
CPU reference requirement where precision matters
source-mapped diagnostics
```

## Reports

Compute block report entries should include:

```text
source location
flow name
target policy
preferred targets
fallback targets
verify mode
allowed operations
unsupported operations
selected target
fallback reason
precision policy
target package handoff
diagnostics
```

Reports may feed:

```text
app.target-report.json
app.precision-report.json
app.failure-report.json
app.ai-context.json
target package reports
```

## Package Boundaries

```text
galerina-core
  compute block syntax, compiler-facing contract and report fields

galerina-core-compiler
  parser, checker pipeline, diagnostics and IR handoff

galerina-core-compute
  compute capability model, budgets, target selection and fallback planning

galerina-core-vector
  vector, matrix and tensor operation semantics

galerina-target-native
  native executable output planning

galerina-target-wasm
  WebAssembly output planning

galerina-target-gpu
  GPU target planning and reports

galerina-target-photonic
  photonic target planning and reports
```

## First Version Scope

Version 0.1 should focus on:

```text
parse compute blocks
validate purity
collect target preferences
collect fallback declarations
collect CPU reference verification mode
emit target compatibility reports
emit safe diagnostics
handoff summary data to target packages later
```

It should not require:

```text
real GPU execution
real photonic execution
native executable compilation
vendor SDK integration
opaque accelerator precision claims
```

Final rule:

```text
galerina-core defines what a compute block means in source.
galerina-core-compute decides how work should be planned.
target packages decide how planned work is emitted.
```
