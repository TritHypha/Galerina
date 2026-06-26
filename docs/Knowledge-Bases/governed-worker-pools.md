# Governed Worker Pools

## Status

Status: Future — This feature is not yet implemented in Stage A (Phase 1-15).
Planned for: Stage B

## Definition

A **Galerina Governed Worker Pool** is a bounded, isolated execution group managed by the runtime for processing approved flows, events, streams, jobs, and compute operations under explicit governance control.

```text
Workers execute approved plans.
Workers do not approve plans.
```

Authority remains with Authority Control, not the worker itself.

## Why Not Traditional Worker Models

Traditional workers (PHP-FPM, thread pools, background workers) assume: shared mutable state, ambient authority, unsafe caches, manual thread tuning. These create cross-request leakage, stale permissions, worker poisoning, and race conditions.

## Runtime Placement

Workers exist **after** governance checks:

```text
Request/Event/Stream
 -> Intake Guard
 -> Permission & Authority Control
 -> Execution Classification
 -> Runtime Logistics
 -> Resource Deployment
 -> Execution Coordination Scheduler
 -> Governed Worker Pool
 -> Result Assembler
 -> Response Gate
 -> Audit
```

## Worker Pool Declaration

```galerina
worker pool WebPool auto {
  isolate per_request
  memory max 128mb
  time max 5s
  queue max 500
  audit required
}
```

The `auto` keyword means the runtime manages pool sizing within declared limits.

## Runtime Responsibilities

The runtime may automatically: increase/decrease worker count, rebalance queues, move work between cores, isolate high-risk execution, shift compute to GPU/NPU, terminate poisoned workers, restart unhealthy workers — but **only within declared policy boundaries**.

## Isolation Modes

| Isolation Mode | Meaning |
|---|---|
| `per_request` | Reset runtime state after every request |
| `per_actor` | Isolate actor execution contexts |
| `per_job` | Isolate background jobs |
| `per_stream` | Isolate stream processing |
| `per_module` | Isolate high-risk/native modules |
| `per_compute_target` | Separate CPU/GPU/NPU execution |

## Worker Pool Types

| Pool | Purpose |
|---|---|
| WebPool | request/response execution |
| EventPool | declared event handling |
| JobPool | deferred/background work |
| StreamPool | governed streams |
| ComputePool | CPU/GPU/NPU/TPU execution |
| IsolationPool | high-risk/native workloads |

## Security Rules

```text
1. no shared mutable globals
2. no cached actor authority
3. no secret retention between requests
4. no cross-request memory exposure
5. bounded execution time
6. bounded memory
7. bounded queue depth
8. permission checked before dispatch
9. audit on execution completion
10. worker reset between actors when required
```

## Cache Rules

Workers MAY cache: verified execution plans, Governed IR, read-only metadata, package verification state, static schemas.

Workers MUST NOT cache: actor permissions, private user data, session authority, secrets, mutable request state, unverified external input.

## Developer vs Runtime Responsibilities

| Developer declares | Runtime manages |
|---|---|
| safety boundaries | worker shape and count |
| resource limits | scheduling |
| isolation intent | hardware placement |
| audit requirements | resource balancing |

## Core Principle

```text
Developers declare intent.
Runtime coordinates execution.
Governance controls authority.
```

```text
Galerina worker pools exist to coordinate execution safely,
not merely to maximise concurrency.
```
