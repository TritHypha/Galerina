# Async Task Model

## Status

Status: Future — This feature is not yet implemented in Stage A (Phase 1-15).
Planned for: Stage B

## Definition

Galerina uses `task` and `wait` for governed asynchronous work. These keywords replace `async`/`await` from other languages.

```text
task = start governed async work
wait = collect result
```

## Core Rule

```text
flow may use task and wait
fn may not use task or wait
```

`fn` is a pure synchronous helper. It has no runtime authority. It cannot start background work or wait on async results.

`flow` is the governed executable unit. It may start tasks, wait for results, and return only after all required work is complete.

## Why Not async/await

Galerina avoids `async/await` as keywords to:

```text
avoid implying uncontrolled async execution
make parallel work explicit and visible to the runtime
allow the runtime to govern, audit, and budget task execution
keep fn purely synchronous and authority-free
```

## Syntax

```galerina
flow build_report(user_id: safe Id) -> Report
  uses database.users.read
  uses database.analytics.read
{
  let user_task = task database.users.get(user_id)
  let stats_task = task database.analytics.get(user_id)

  let user: safe User = wait user_task
  let stats: safe Stats = wait stats_task

  return make_report(user, stats)
}
```

`task` starts work. `wait` collects the result. The flow does not return until all required `wait` calls complete.

## fn Cannot Use task or wait

```galerina
// Correct — fn is synchronous only
fn format_name(first: safe String, last: safe String) -> safe String {
  return first + " " + last
}

// Compiler error LNN-SEC-014 — fn cannot use task
fn bad_helper(id: safe Id) -> safe User {
  let t = task database.users.get(id)   // ERROR
  return wait t                          // ERROR
}
```

## What fn Cannot Do

```text
fn cannot use task
fn cannot use wait
fn cannot call network/database/vault/workers
fn cannot create background work
fn cannot declare uses
fn cannot cross trust boundaries
```

Use `flow` for anything that needs async work or external authority.

## Runtime Handling

The runtime manages:

```text
task scheduling
task cancellation
timeout enforcement
task budget tracking
result ordering
cleanup on completion or failure
audit of task execution
```

Developers do not implement this logic.

## Safe/Unsafe in Tasks

Data returned from task work that crosses a runtime boundary still returns `unsafe`:

```galerina
flow fetch_user_data(user_id: safe Id) -> Report
  uses database.users.read
  uses channel.analytics.read
{
  let user_task = task database.users.get(user_id)
  let stats_task = task analytics.get(user_id)

  let raw_user: unsafe Any = wait user_task
  let raw_stats: unsafe Any = wait stats_task

  let user: safe User = validate.user(raw_user)
  let stats: safe Stats = validate.stats(raw_stats)

  return Report(user, stats)
}
```

## Relationship to Scheduler

The runtime Scheduler coordinates task execution:

```text
task = developer declares parallel intent
Scheduler = runtime executes and governs timing
```

Tasks declared with `task` are not uncontrolled threads. The Scheduler dispatches them with governed concurrency, timeout, and audit.

## Controlled Parallelism

Galerina avoids:

```text
uncontrolled thread spawning
hidden async execution
infinite task trees
runaway background work
```

Galerina prefers:

```text
explicit task declarations
bounded task groups
Scheduler-governed execution
auditable parallel work
```

## Grouped Waits

```galerina
// Wait for all tasks to complete
let results: safe Array<Result> = wait all [task_a, task_b, task_c]

// Take the first to succeed
let result: safe Result = wait race [fast_source, fallback_source]

// Stream processing
wait stream image_tasks { ... }
```

## Cancellation Policy

Cancellation is declared explicitly:

```text
cancelOnError   — cancel remaining tasks if one fails
waitForAll      — complete all tasks regardless of failures
firstSuccess    — stop when one succeeds
firstResult     — stop when one returns (success or failure)
timeoutCancel   — cancel if overall time exceeded
manualCancel    — explicit cancellation signal
```

## Core Principle

```text
flow may start tasks and wait for results.
fn is synchronous and authority-free.
The runtime governs, audits, and budgets all async work.
task and wait replace async/await.
```
