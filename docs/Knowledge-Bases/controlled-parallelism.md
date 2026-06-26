# Controlled Parallelism

## Status

Status: Future — This feature is not yet implemented in Stage A (Phase 1-15).
Planned for: Stage B

## Definition

Galerina supports parallelism through governed, explicit mechanisms: `task`/`wait`
in flows, worker pools, queues, and the Execution Coordination Scheduler. There
is no uncontrolled thread spawning or hidden async execution.

```text
Parallelism is declared.
The Scheduler governs timing.
Workers provide isolation.
Budgets prevent runaway execution.
```

## What Galerina Avoids

```text
uncontrolled thread spawning
hidden async execution trees
shared mutable concurrency
global mutable state
background tasks without runtime registration
direct thread control
unbounded queues
invisible task chains
```

## task / wait

The primary developer-facing mechanism for parallel work in a `flow`:

```galerina
flow build_report(user_id: safe Id) -> Report
  uses database.users.read
  uses database.analytics.read
{
  // Start both independently
  let user_task = task database.users.get(user_id)
  let stats_task = task database.analytics.get(user_id)

  // Collect results — flow does not return until both complete
  let user: safe User = wait user_task
  let stats: safe Stats = wait stats_task

  return make_report(user, stats)
}
```

The Scheduler dispatches `task` work. The runtime governs:

```text
task scheduling
cancellation
timeout
budget tracking
result ordering
cleanup on completion or failure
audit
```

## Grouped Waits

```galerina
// All must succeed
wait all timeout 2500ms cancelOnError {
  user  = database.users.find(user_id)
  prefs = database.preferences.get(user_id)
  flags = flags_service.get(user_id)
}

// First to succeed wins
wait race timeout 200ms firstSuccess {
  cached = cache.get(key)
  fresh  = database.get(key)
}
```

## Cancellation Policy

```text
cancelOnError   — cancel all remaining tasks if any fails
waitForAll      — complete all tasks regardless of individual failures
firstSuccess    — stop when one task succeeds
firstResult     — stop when one task returns (success or failure)
timeoutCancel   — cancel if the overall time budget is exceeded
manualCancel    — explicit cancellation signal
```

## Worker Pools

For background and isolated parallel work:

```galerina
worker image_processor {
  max: 8
  isolation: strict
  timeout: 30s
}

flow process_images(images: safe Array<ImageJob>) -> BatchResult
  uses worker.image_processor
{
  let result = run worker image_processor(images)
  return result
}
```

Workers run in isolated contexts. They cannot share mutable state between
invocations.

## Queue-Based Parallelism

Queues allow producers and consumers to work independently:

```galerina
queue risk_jobs {
  source: GlobalVault.queue.risk
  max_concurrent: 4
  overflow: dead_letter
}

trigger risk_check {
  on: queue.message("risk_jobs")
  run: evaluate_risk
}
```

The Scheduler handles message dispatch, worker assignment, and backpressure.

## Execution Coordination Scheduler

The Scheduler understands task dependencies:

```text
Independent tasks → may run in parallel
Dependent tasks  → must execute in order
```

The Scheduler tracks:

```text
Which tasks are independent
Which tasks share dependencies
Which tasks require ordered output
Which tasks may use verified fast paths
```

It avoids:

```text
oversaturating compute targets
infinite execution trees
runaway background work
```

## Runtime Budgets

All parallel work runs under tracked budgets:

```text
CPU time
wall time
memory usage
queue depth
loop counts
recursion depth
AI/tool call counts
spawned task count
accelerator usage
```

If a budget is exceeded:

```text
Scheduler → notifies Authority Control
Authority Control → throttles, pauses, or terminates
```

## Isolation Guarantee

Worker execution is isolated:

```text
no shared mutable globals
no cached actor authority between requests
no cross-request memory exposure
no secret retention between jobs
```

## fn Cannot Use Parallelism

`fn` is always synchronous and has no runtime authority:

```galerina
// Compiler error — fn cannot use task
fn bad_parallel(id: safe Id) -> safe Data {
  let t = task database.get(id)   // ERROR: LNN-SEC-014
  return wait t
}
```

Only `flow` may use `task`, `wait`, `run worker`, and `wait all/race/stream`.

## Core Principle

```text
Parallelism in Galerina is:
  explicit — declared by the developer
  governed — scheduled by the runtime
  bounded — limited by declared budgets
  isolated — workers share no mutable state
  auditable — every parallel task is tracked
```
