# Scheduled Actions

## Status

Status: Future — This feature is not yet implemented in Stage A (Phase 1-15).
Planned for: Stage B

## Definition

A **scheduled action** is the flow that runs because a trigger fired and the Scheduler dispatched it.

```text
trigger          = what activates work
scheduler        = runtime timing engine
scheduled action = the flow that runs
```

A scheduled action is not a distinct keyword or language concept. It is an ordinary flow named in a trigger's `run:` field.

```galerina
trigger nightly_cleanup {
  on: schedule.daily("02:00")
  run: cleanup_expired_sessions   // cleanup_expired_sessions is the scheduled action
}

flow cleanup_expired_sessions() -> CleanupResult { ... }
```

## Core Principle

A scheduled action is normal Galerina flow code. It must still obey:

```text
safe / unsafe
uses permissions
validation
Query safety
GlobalVault restrictions
runtime audit
provenance
cleanup rules
```

A scheduled action does not get special authority just because it is scheduled.

```text
scheduled does not mean trusted
```

## Execution Flow

```text
trigger fires
  -> Scheduler decides timing
  -> scheduled action runs
  -> runtime audits result
```

## Full Example

```galerina
trigger nightly_cleanup {
  on: schedule.daily("02:00")
  run: cleanup_expired_sessions
  overlap: deny
  retry: 2
  timeout: 60s
}

flow cleanup_expired_sessions() -> CleanupResult
  uses database.sessions.write
{
  let q: Query = sql {
    DELETE FROM sessions
    WHERE expires_at < :now
  }

  let now: safe Time = runtime.now()

  let raw_result: unsafe Any = database.sessions.run(q, {
    now: now
  })

  let result: safe CleanupResult = validate.cleanup_result(raw_result)

  release raw_result   // optional early cleanup for large values

  return result
}
```

## What The Runtime Does

When the scheduled action runs, the runtime automatically:

```text
1. confirms the trigger is allowed
2. checks overlap rules
3. checks flow permissions
4. runs the scheduled flow
5. applies timeout
6. retries if configured
7. audits execution
8. cleans up local runtime values
```

## Unsafe External Inputs

Data arriving from queues, files, APIs, or events must enter as `unsafe`:

```galerina
trigger upload_received {
  on: queue.message("uploads")
  run: process_upload
}

flow process_upload(message: unsafe Json) -> Result
  uses worker.image_processor
{
  let upload: safe UploadMessage = validate.upload_message(message)
  let result: safe ImageResult = run worker image_processor(upload)
  return result
}
```

## No External Input

Even without external input, database output still returns `unsafe`:

```galerina
trigger daily_report {
  on: schedule.daily("06:00")
  run: build_daily_report
}

flow build_daily_report() -> Report
  uses database.analytics.read
{
  let q: Query = sql {
    SELECT total_orders, total_revenue
    FROM daily_stats
    WHERE day = :today
  }

  let raw_stats: unsafe Any = database.analytics.run(q, {
    today: runtime.today()
  })

  let stats: safe DailyStats = validate.daily_stats(raw_stats)
  return Report(stats)
}
```

## With Worker Dispatch

```galerina
trigger image_batch_nightly {
  on: schedule.daily("01:00")
  run: process_pending_images
}

flow process_pending_images() -> BatchResult
  uses database.images.read
  uses worker.image_processor
{
  let q: Query = sql {
    SELECT id, path FROM images WHERE status = 'pending'
  }

  let raw_images: unsafe Any = database.images.run(q, {})
  let images: safe Array<ImageJob> = validate.image_jobs(raw_images)
  let result: safe BatchResult = run worker image_processor(images)
  return result
}
```

## Relationship With Extension Points

After a scheduled action completes, an extension point may let a sandboxed plugin observe limited metadata:

```galerina
extension after_scheduled_action {
  plugin schedule_metrics
  mode: observe
}
```

The plugin cannot control or modify the scheduled action.

## Invalid Pattern

External data must not enter as `safe` without showing where it came from:

```galerina
// Wrong
flow charge_all_users(raw_users: safe Json) -> Result { ... }

// Correct
flow charge_all_users(raw_users: unsafe Json) -> Result
  uses vault.payments.write
{
  let users: safe Array<UserPayment> = validate.user_payments(raw_users)
  return GlobalVault.payments.charge(users)
}
```

## Best Uses

```text
cleanup jobs
report generation
batch processing
queue draining
reminders
recurring maintenance
delayed processing
retry workflows
```

## Runtime Audit

The runtime audits scheduled actions automatically:

```text
trigger name
scheduled time
actual run time
delay
timeout
retry count
overlap decision
flow executed
permissions used
unsafe inputs
validation path
success/failure
```

## Core Principle

```text
A scheduled action is just a governed flow started by the Scheduler.
It does not gain trust, safety, or authority automatically.
```
