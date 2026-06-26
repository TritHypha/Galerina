# Runtime Extension Points

## Definition

A **runtime extension point** is an approved, governed place where extra
behaviour may be attached without editing the core runtime.

```text
core runtime stays sealed
extension points are approved
plugins are sandboxed
data exposure is limited
security rules cannot be bypassed
```

## Terminology

| Term | Meaning |
| --- | --- |
| Runtime extension point | Approved place where extra behaviour may attach |
| hook | Informal/technical alias |
| event | Something happened in the runtime |
| listener | Code that reacts to an event |
| observer | Code that watches runtime activity |
| plugin | External module attached to an extension point |

Official term: `extension point`. `hook` is an informal alias.

## Why Not Just Hooks

`hook` can imply arbitrary code injection. Galerina should communicate:

```text
controlled extension
approved boundary
sandboxed execution
runtime-governed behaviour
```

## Plugin Declaration

```galerina
plugin metrics_collector {
  runtime: wasm
  source: "./plugins/metrics_collector.wasm"
  mode: observe

  receives: [
    flow.name,
    flow.duration,
    result.status
  ]

  uses: []
}
```

`mode: observe` means the plugin can read approved metadata but cannot change
the runtime result.

## Extension Point Declaration

```galerina
extension after_flow_execute {
  plugin metrics_collector
}
```

The runtime calls `metrics_collector` after a flow completes. The plugin
cannot edit the flow, cannot see sensitive data, cannot bypass safe/unsafe
rules.

## Event and Listener (Internal Implementation)

Extension points may be implemented internally as event/listener systems:

```galerina
event FlowExecuted {
  flow_name: String
  duration_ms: Int
  status: String
}

listener metrics_listener on FlowExecuted {
  metrics.record({
    flow: event.flow_name,
    duration: event.duration_ms,
    status: event.status
  })
}
```

Developers should think in terms of extension points. Events/listeners may be
how the runtime implements them internally.

## Observer

An observer watches runtime activity without changing it:

```galerina
observer permission_denial_observer on PermissionDenied {
  audit.record({
    flow: event.flow_name,
    permission: event.permission,
    reason: event.reason
  })
}
```

```text
Observer  = watches and records
Listener  = reacts to an event
Extension = approved runtime place where this is allowed
```

## Data Exposure Rule

Plugins should receive metadata by default, not full runtime data:

```galerina
// Bad - too much exposure
receives: [request, response, context]

// Good - metadata only
receives: [flow.name, flow.duration, result.status]
```

## Security Rules

Extension points must not allow plugins/listeners/observers to:

```text
edit the core runtime
bypass safe / unsafe
promote unsafe to safe
skip validation
rewrite Query blocks silently
access GlobalVault without permission
hide audit logs
disable provenance
change runtime identity
alter route/channel policy
```

## Good Use Cases

```text
metrics
audit logging
tracing
rate-limit signals
security alerts
policy warnings
monitoring
fraud signals
debugging tools
```

## Avoid Using for

```text
core business logic
payment logic
validation that must always happen
database writes
permission enforcement
safe/unsafe conversion
```

Core logic stays in normal Galerina flows.

## Core Principle

```text
Runtime extension points allow extra behaviour
without editing the core runtime.

They must remain governed, sandboxed,
permission-scoped and audited.
```
