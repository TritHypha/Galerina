# Structured Task/Wait Syntax

Status: draft.

## Purpose

Galerina uses `task` and `wait` for governed asynchronous work inside `flow`
declarations. This replaces `async`/`await` from other languages and avoids
implying uncontrolled async execution models.

```text
task = start governed async work
wait = collect result
```

## Core Rule

```text
flow may use task and wait
fn may not use task or wait — fn is always synchronous
```

## Grammar Direction

```text
task_expr        = "task" expression
wait_expr        = "wait" expression timeout_clause?
wait_all         = "wait" "all" timeout_clause? cancel_policy? block
wait_race        = "wait" "race" timeout_clause? race_policy block
wait_stream      = "wait" "stream" identifier "from" expression stream_block
wait_queue       = "wait" "queue" expression timeout_clause?
timeout_clause   = "timeout" duration
cancel_policy    = "cancelOnError" | "waitForAll" | "timeoutCancel" | "manualCancel"
race_policy      = "firstSuccess" | "firstResult"
```

## Examples

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

Grouped wait:

```galerina
wait all timeout 2500ms cancelOnError {
  user = database.users.find(user_id)
  orders = database.orders.recent(user_id)
  alerts = alerts.get(user_id)
}
```

Race wait:

```galerina
wait race timeout 200ms firstSuccess {
  cached = cache.get(key)
  fresh = database.get(key)
}
```

## Security Rules

```text
task/wait requires an effect-declared context (flow only)
fn cannot use task or wait
external network/database waits require timeout policy in production
all child work must belong to a scope
unbounded streams and hidden background tasks are rejected
queue handoff must use declared queue/job contracts
```

## Report Output

Structured task/wait should feed async, wait, timeout, queue, runtime and
concurrency reports. Diagnostics should include source locations and suggested
fixes for independent sequential waits that should use `wait all`.

## Open Work

```text
parse wait all/race/stream/queue
check task/wait effects and fn restrictions
check timeout policy for external waits
emit async report fields
lower grouped waits into runtime scoped task groups
```
