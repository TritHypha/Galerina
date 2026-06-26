# Production Scaling Model

## Definition

Galerina treats scale as a **runtime contract**, not only infrastructure
configuration. Scale is declared in syntax, kept pure in logic, and enforced by
the runtime.

```text
syntax  -> declares intent
logic   -> keeps work safe and predictable
runtime -> executes, balances, limits, and observes
```

## 1. Scaling Through Syntax

### Worker Pool Declaration

```galerina
worker image_processor {
  min: 2
  max: 20
  isolation: strict
  memory: 512mb
  timeout: 30s
}
```

### Flow Runtime Policy

```galerina
flow process_upload(file: unsafe File) -> Result
  uses worker.image_processor
  uses database.main.write
{
  let safe_file: safe File = validate.file(file)
  let result = run worker image_processor(safe_file)
  return result
}
```

### Queue Declaration

```galerina
queue uploads {
  worker: image_processor
  max_pending: 10000
  retry: 3
  dead_letter: uploads_failed
}
```

## 2. Scaling Through Logic

Galerina encourages:

```text
small flows
pure fn helpers
explicit boundaries
safe validation before work
no hidden global side effects
```

Good pattern:

```galerina
fn resize_plan(file: safe File) -> ResizePlan {
  return build_plan(file)
}

flow resize_upload(file: unsafe File) -> Result
  uses worker.image_processor
{
  let safe_file: safe File = validate.file(file)
  let plan: safe ResizePlan = resize_plan(safe_file)
  return run worker image_processor(plan)
}
```

Avoid monolithic flows:

```galerina
flow do_everything(raw: unsafe Any) { ... }
```

## 3. Scaling Through Runtime

The runtime handles:

```text
worker autoscaling
queue backpressure
timeouts
retries
circuit breakers
memory limits
CPU limits
rate limits
flow cleanup
audit trails
```

Runtime config example:

```galerina
runtime {
  backpressure: enabled
  autoscale: enabled
  max_flow_time: 60s
  cleanup: end_of_flow
}
```

## 4. Database Scaling

Multiple named databases are declared explicitly:

```galerina
database main {
  source: GlobalVault.database.main
}

database analytics {
  source: GlobalVault.database.analytics
}
```

Using multiple databases in a flow:

```galerina
flow build_report(id: safe Id) -> Report
  uses database.main.read
  uses database.analytics.read
{
  let stats_query: Query = sql {
    SELECT visits, purchases
    FROM user_stats
    WHERE user_id = :id
  }

  let raw_stats: unsafe Any = database.analytics.run(stats_query, { id: id })
  let stats: safe UserStats = validate.user_stats(raw_stats)
  return make_report(stats)
}
```

Rule: database output is unsafe until validated.

## Scaling Primitives

```text
flow         = unit of scaling
worker       = unit of parallel execution
queue        = unit of load smoothing
fn           = pure helper logic
GlobalVault  = secure config/secrets
Query        = protected external-boundary query
safe/unsafe  = trust control
release      = early cleanup for large/sensitive values
```

## Core Principle

```text
Galerina should not scale by hiding complexity.
It should scale by making runtime behaviour explicit.

Declare scale in syntax.
Keep logic pure and bounded.
Let the runtime enforce limits, isolation, cleanup and observability.
```
