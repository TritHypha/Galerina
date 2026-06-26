# Runtime Assembler

## Status

Status: Future — This feature is not yet implemented in Stage A (Phase 1-15).
Planned for: Stage B

## Definition

The **Galerina Runtime Assembler** (also called Result Assembler) collects, orders, validates, and finalises results from asynchronous or parallel execution, restoring them to the correct governed output order.

```text
Parallel execution may finish out of order.
Governed output must return in contract order.
```

## Why It Is Needed

When the Scheduler distributes work across multiple hardware targets:

```text
CPU core 1
CPU core 2
GPU
NPU
TPU
VPU
ASIC
```

Results may complete in a different order than they were dispatched. The Assembler restores the correct sequence.

## Example

Request: process 100 images

Runtime dispatches:

```text
images 1-20   -> VPU
images 21-60  -> GPU
images 61-100 -> CPU cores
```

Results arrive as: GPU first, CPU second, VPU last.

Assembler returns:

```text
image 1 result
image 2 result
...
image 100 result
```

in the expected contract order.

## Assembler Responsibilities

```text
partial results collection
result ordering restoration
output contract validation
join points management
dependency completion tracking
stream ordering
failure merging
retry results incorporation
final response construction
audit linkage
```

## Security Rule

The Assembler must not grant authority. It may only assemble results produced by approved execution modules. It validates that output contracts are met before the Response Gate receives the result.

## Runtime Chain Placement

```text
Execution planning   = Director    — what should happen
Governance enforcement = Sheriff   — what may happen
Resource optimisation = Steward    — how to do it efficiently
Hardware selection   = Balancer    — where it should run
Execution timing     = Scheduler   — when it runs
Ordered restoration  = Assembler   — how results are put back together
                       Audit       — proves it happened
```

## Core Principle

```text
Run in parallel.
Return in order.
Prove the path.
```
