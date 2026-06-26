# Runtime Scheduler (Execution Coordination Scheduler)

## Definition

The **Execution Coordination Scheduler** is the LSGR component responsible for
coordinating approved execution work across runtime modules and compute targets.

It controls when work runs, what may run concurrently and how partially
asynchronous execution is managed. It is not a fully uncontrolled async runtime
— it provides governed partially asynchronous execution.

## Purpose

The Execution Coordination Scheduler exists to:

```text
improve hardware utilisation
improve multicore execution
improve GPU/NPU/TPU pipeline usage
reduce idle compute
reduce waiting between stages
support Verified Pipeline Interfaces (VPI)
support batching and streaming
preserve governed execution
preserve auditability
preserve output correctness
```

## Partially Asynchronous Execution

LSGR supports partially asynchronous execution:

```text
Independent work may run in parallel.
Dependent work must preserve execution order.
```

The Scheduler understands:

```text
which tasks are independent
which tasks share dependencies
which tasks require ordered output
which tasks may use verified fast paths
which tasks may execute simultaneously
which tasks require sequential execution
```

The runtime avoids uncontrolled async execution trees.

## Scheduler Responsibilities

The Execution Coordination Scheduler manages:

```text
task queues
execution lanes
partially asynchronous task groups
dependency tracking
execution timing
retries
cancellation
backpressure
queue pressure
timeout handling
workload coordination
VPI lane coordination
CPU/GPU/NPU/TPU/VPU/ASIC execution queues
```

## Scheduler Behaviour

The Scheduler determines:

```text
What may run now?
What must wait?
What may run together?
What depends on another task?
What should be paused?
What should be cancelled?
What exceeded runtime budget?
```

The Scheduler may coordinate:

```text
parallel execution
streaming execution
batched execution
staged execution
accelerator execution
multicore execution
```

while preserving runtime governance.

## Controlled Parallelism

The Scheduler prefers controlled parallelism over unrestricted concurrency.

The runtime avoids:

```text
uncontrolled thread spawning
hidden async execution
infinite execution trees
runaway background work
unbounded queues
invisible task chains
```

The runtime prefers:

```text
bounded task groups
explicit execution plans
dependency-aware scheduling
governed concurrency
deterministic cancellation
runtime-visible execution
```

## Verified Pipeline Interface (VPI)

The Scheduler supports Verified Pipeline Interfaces (VPI).

VPI lanes allow compatible workloads to reuse:

```text
validated data structures
verified execution plans
memory layouts
compute routing
batching strategies
hardware pipelines
```

without repeating unnecessary work.

VPI lanes must never bypass:

```text
policy enforcement
capability enforcement
runtime budgets
audit requirements
trust validation
```

## Runtime Coordination Position

The Execution Coordination Scheduler operates after:

```text
Runtime Command          -> builds execution plan
Authority Control        -> approves authority
Runtime Logistics        -> optimises execution strategy
Resource Deployment Balancer -> selects available hardware
```

The Scheduler then coordinates execution timing and parallel workload flow.

The Scheduler does not grant authority.

## Hardware-Aware Scheduling

The Scheduler coordinates with the Resource Deployment Balancer to support:

```text
efficiency-core routing
performance-core routing
GPU scheduling
NPU scheduling
TPU scheduling
VPU scheduling
ASIC scheduling
thermal-aware execution
overload-aware execution
safe fallback routing
```

The Scheduler avoids oversaturating compute targets.

## Runtime Budgets

The Scheduler tracks runtime budgets:

```text
CPU time
wall time
memory usage
queue depth
loop counts
recursion depth
AI/tool calls
spawned tasks
accelerator usage
```

If budgets are exceeded:

```text
Execution Coordination Scheduler -> notifies Authority Control
Authority Control -> throttles, pauses or terminates
```

## Ordered Result Integrity

Partially asynchronous execution may complete out of order.

The Scheduler preserves execution linkage so the Result Assembler can:

```text
restore output order
merge partial results
preserve contracts
preserve audit linkage
```

Parallel execution must never break output correctness.

## Application-Level Scheduling

In addition to coordinating compute execution, the Scheduler manages trigger-based and time-based job scheduling.

```text
trigger = activation rule (what starts work)
Scheduler = runtime timing engine (when and how work runs)
scheduled action = the flow that executes
```

### Scheduler Config Syntax

```galerina
scheduler {
  timezone: "Europe/London"
  max_concurrent_jobs: 10
  default_timeout: 30s
  prevent_overlap: true
  retry_policy: standard
}
```

### Retry Policy

```galerina
scheduler {
  retry_policy standard {
    attempts: 3
    backoff: exponential
    max_delay: 5m
  }
}
```

### Overlap Policy

Overlap modes for triggers:

```text
deny     — do not start a second copy if one is still running (recommended default)
queue    — queue the next run until the current one completes
replace  — cancel the current run and start fresh
parallel — allow both runs simultaneously
```

### Scheduler Security Rules

The Scheduler must not:

```text
bypass safe / unsafe
grant permissions automatically
skip validation
ignore uses
expose secrets to plugins
allow untrusted plugins to alter scheduling
allow unsafe payloads to enter as safe
hide audit/provenance records
```

### Runtime Profiles

Production:

```galerina
runtime profile production {
  scheduler: enabled
  audit_scheduled_actions: true
  prevent_trigger_overlap: true
  deny_unknown_triggers: true
  require_trigger_provenance: true
}
```

Development:

```galerina
runtime profile development {
  scheduler: enabled
  audit_scheduled_actions: basic
  allow_manual_trigger_run: true
}
```

### Extension Points

The Scheduler may emit extension events but is not itself an extension point:

```galerina
extension after_scheduled_action {
  plugin schedule_metrics
  mode: observe
}
```

Plugins cannot control the Scheduler.

## Core Principle

```text
The Runtime Command plans.
The Authority Control governs.
The Runtime Logistics optimises.
The Resource Deployment Balancer selects hardware.
The Execution Coordination Scheduler coordinates partially asynchronous execution.
The Result Assembler restores governed order.
The modules execute.
The audit proves.
```

```text
Run independent work in parallel.
Preserve governed execution in order.
The Scheduler decides when governed work runs.
It does not grant trust, authority, or safety.
```
