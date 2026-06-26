# Triggers

## Status

Status: Future — This feature is not yet implemented in Stage A (Phase 1-15).
Planned for: Stage B

## Definition

A **trigger** tells the runtime: when this condition happens, run this flow.

```text
trigger = starts work
extension point = allows optional extra behaviour around runtime work
scheduler = runtime component that decides when work happens
```

A trigger is not a runtime extension point and is not the Scheduler.

## Core Principle

Galerina triggers are:

```text
explicit
auditable
permission-aware
runtime-governed
safe by default
```

A trigger never bypasses normal Galerina rules. Triggered flows must still obey:

```text
safe / unsafe
uses permissions
validation
runtime authority
GlobalVault restrictions
Query restrictions
audit/provenance rules
```

## Basic Syntax

```galerina
trigger trigger_name {
  on: event_or_schedule
  run: flow_name
}
```

## Trigger Sources

```text
schedule.daily("02:00")           — time-based schedule
http.post("/orders")               — HTTP method + path
queue.message("uploads")           — queue message arrives
file.upload("incoming-files")      — file arrives at boundary
runtime.event("name")              — runtime alert/event fires
worker.complete("name")            — worker finishes
database.event("table", "insert")  — database event occurs
```

## Trigger Options

```text
overlap: deny | queue | replace | parallel
retry: N
timeout: Ns
```

Recommended overlap default: `deny`

## Example: Scheduled Trigger

```galerina
trigger nightly_cleanup {
  on: schedule.daily("02:00")
  run: cleanup_expired_sessions
  overlap: deny
  retry: 2
}

flow cleanup_expired_sessions() -> CleanupResult
  uses database.sessions.write
{
  let q: Query = sql {
    DELETE FROM sessions
    WHERE expires_at < :now
  }

  let raw_result: unsafe Any = database.sessions.run(q, {
    now: runtime.now()
  })

  let result: safe CleanupResult = validate.cleanup_result(raw_result)
  return result
}
```

## Example: HTTP Trigger

```galerina
trigger create_order_http {
  on: http.post("/orders")
  run: create_order
}

flow create_order(body: unsafe Json) -> Receipt
  uses database.orders.write
  uses channel.payments.write
{
  let order: safe Order = validate.order(body)

  let q: Query = sql {
    INSERT INTO orders (id, total) VALUES (:id, :total)
  }

  let raw_saved: unsafe Any = database.orders.run(q, {
    id: order.id,
    total: order.total
  })

  let saved: safe SavedOrder = validate.saved_order(raw_saved)
  let raw_payment: unsafe Any = payments.send(order)
  let receipt: safe Receipt = validate.receipt(raw_payment)
  return receipt
}
```

## Example: Queue Trigger

```galerina
trigger upload_received {
  on: queue.message("uploads")
  run: process_upload
}

flow process_upload(message: unsafe Json) -> Result
  uses worker.image_processor
  uses database.files.write
{
  let upload: safe UploadMessage = validate.upload_message(message)
  let processed: safe ImageResult = run worker image_processor(upload)
  return save_image_result(processed)
}
```

## Example: File Upload Trigger

```galerina
trigger file_uploaded {
  on: file.upload("incoming-files")
  run: scan_uploaded_file
}

flow scan_uploaded_file(file: unsafe File) -> Result
  uses worker.malware_scanner
{
  let safe_file: safe File = validate.file(file)
  let scan_result: safe ScanResult = run worker malware_scanner(safe_file)
  return scan_result
}
```

## Example: Runtime Alert Trigger

```galerina
trigger permission_failure_alert {
  on: runtime.event("permission_denied_rate_high")
  run: notify_security_team
}

flow notify_security_team(event: unsafe Json) -> Result
  uses channel.security_alerts.write
{
  let alert: safe RuntimeAlert = validate.runtime_alert(event)
  let response: unsafe Any = security_alerts.send(alert)
  return validate.alert_response(response)
}
```

## Trigger vs Extension Point

```text
trigger       = starts a flow
extension point = lets extra plugin behaviour observe or attach around runtime execution
```

Example showing both:

```galerina
trigger nightly_cleanup {
  on: schedule.daily("02:00")
  run: cleanup_expired_sessions
}

extension after_scheduled_action {
  plugin schedule_metrics
  mode: observe
}
```

The trigger starts the flow. The extension point allows a sandboxed plugin to observe after completion.

## Invalid Pattern

HTTP request body must enter as `unsafe`, not `safe`:

```galerina
// Wrong — HTTP body is external data
flow charge_card(body: safe Json) -> Receipt { ... }

// Correct
flow charge_card(body: unsafe Json) -> Receipt
  uses vault.payments.write
{
  let payment: safe Payment = validate.payment(body)
  return GlobalVault.payments.charge(payment)
}
```

## Trigger Safety Rules

Triggers must not:

```text
bypass safe / unsafe
pass raw external data as safe
grant permissions automatically
access GlobalVault directly
disable validation
bypass Scheduler rules
hide audit/provenance records
```

A trigger only activates a flow. The flow still needs its own permissions.

## Runtime Audit

The runtime automatically audits:

```text
trigger name
trigger source
execution time
flow started
permissions requested
success/failure
retry count
unsafe inputs received
validation path
runtime identity
```

## Runtime Policy

```galerina
runtime {
  audit_triggers: true
  deny_unsafe_trigger_payloads_as_safe: true
  prevent_trigger_overlap: true
}

runtime profile production {
  audit_triggers: true
  require_trigger_provenance: true
  deny_unknown_triggers: true
}
```

## Core Principle

```text
A trigger starts a governed flow.
It does not grant trust, authority, or safety.
```
