# Observability and Monitoring

## Definition

Galerina makes build and runtime behaviour explainable through structured,
machine-readable outputs. Every compiler warning, runtime event, and
performance signal is observable without requiring manual instrumentation.

## Core Rule

```text
Every warning, error, and fatal diagnostic is machine-readable and human-readable.
Runtime behaviour should be observable without modifying application code.
```

## What Galerina Makes Observable

### Compiler Outputs

```text
security-report.json    — permissions, unsafe usage, secret access, package permissions
build-manifest.json     — source hash, output hash, dependency hashes, timestamp
failure-report.json     — error type, source file, line, column, suggested fix
type-report.json        — type coverage, inferred vs explicit types
permission-report.json  — what permissions each flow requires
effect-report.json      — what effects each flow may perform
capability-report.json  — actor capability requirements
audit-actor-report.json — actor attribution per event
async-report.json       — task/wait usage, parallelism patterns
```

### Runtime Outputs

```text
execution trace per flow
scheduler timing
worker dispatch events
queue depth and pressure
trust capsule verification result
permission check events
safe/unsafe boundary crossings
validation events
audit log entries
memory pressure events
GC events
compute target routing decisions
```

## Runtime Extension Points for Observability

Observability plugins attach through approved extension points:

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
}

extension after_flow_execute {
  plugin metrics_collector
}
```

Plugins receive metadata only — not raw request/response data. This prevents
sensitive data leakage through the monitoring plane.

## Audit Logging

Audit events are generated automatically by the runtime:

```text
trigger name and source
flow name and execution time
permissions checked and granted
safe/unsafe boundary crossings
validation outcomes
worker dispatch
queue operations
trust verification
permission denials
```

Developers do not write audit log statements for most events. The runtime
generates them based on declared permissions and flow structure.

Observer example:

```galerina
observer permission_denial_observer on PermissionDenied {
  audit.record({
    flow: event.flow_name,
    permission: event.permission,
    reason: event.reason
  })
}
```

## Structured Diagnostics

All runtime diagnostics include source location and suggested fix. See
`compiler-diagnostics.md` for the full format.

Example runtime diagnostic:

```json
{
  "code": "LNN-TRUST-041",
  "severity": "error",
  "message": "Local self-signed artifact cannot run in production profile.",
  "suggestedFix": "Use CI/OIDC, trusted registry, or organisation signing."
}
```

## Memory Pressure as Observability Signal

The runtime emits memory pressure events before critical limits are reached:

```text
LNN-WARN-MEM-002: memory limit approaching — GC triggered
LNN-WARN-MEM-005: cache memory warning — entry eviction started
LNN-ERR-MEM-006:  memory integrity check failed — checkpoint restored
```

Memory pressure events feed into rate limiting and backpressure decisions.

## Target and Compute Observability

Compute routing decisions are emitted:

```text
preferred target: NPU
selected target: GPU (NPU unavailable)
fallback reason: LNN-WARN-TARGET-003 — accelerator unavailable
```

Target fallback must never be silent. Operators see why work moved.

## AI Context Output

The CLI can generate an AI-readable context summary:

```bash
galerina explain --for-ai
```

Output includes:

```text
error type and location
route summaries
type summaries
security settings
secret variable names (not values)
redacted placeholders for secrets
```

Never includes: API key values, passwords, tokens, private keys, production data.

## Observability in CI

CI pipelines consume observability outputs:

```bash
galerina check --security      # check security report
galerina lint --security       # lint for security patterns
galerina verify build/release/app.build-manifest.json
```

Build reports are checked against policy. CI fails on unsafe code, missing
timeouts, missing webhook verification, risky permissions.

## Best Practices

```text
Use extension points for metrics and alerting — not manual log calls.
Let the runtime audit security events — do not duplicate in application code.
Consume structured JSON reports in dashboards and CI — not log scraping.
Never log raw secrets or unsafe values.
Use redact() when explicitly logging sensitive identifiers.
```

## OpenTelemetry Integration

The preferred external observability integration model is OpenTelemetry.

### Supported Telemetry Types

```text
Metrics          — runtime performance and capability counters
Distributed traces — request spans across services and dependencies
Structured logs  — JSON-formatted correlated log events
```

### Example Runtime Trace

```text
request.start
  -> capability.check
  -> dependency.call
  -> db.query
  -> response.complete
```

Each span includes:

```text
service identity     — which service produced the span
artifact_digest      — cryptographic artifact identity
runtime_instance     — runtime node identifier
trace_id / span_id   — OTel-compatible correlation IDs
```

### Metrics Categories

#### Runtime Metrics

```text
cpu_utilisation
memory_usage
event_loop_latency
queue_depth
```

#### Capability Metrics

```text
capability_requests_total
capability_denials_total
policy_violations_total
```

#### Deployment Metrics

```text
deploy_frequency
rollback_frequency
verification_failures_total
```

### Structured Logging

Runtime logs are:

```text
JSON formatted          — machine-parseable
Trace-correlated        — linked to active spans
Immutable where required — audit events are append-only
Exportable              — forwarded to external systems
```

### Health and Readiness Endpoints

The runtime exposes:

```text
Liveness endpoint        — is the runtime alive?
Readiness endpoint       — is the runtime ready to serve?
Dependency health checks — are dependencies reachable?
Capability status        — are required capabilities available?
```

### Recommended Integrations

```text
OpenTelemetry Collector
Grafana
Prometheus
Datadog
Elastic
Honeycomb
Splunk
```

---

## Core Principle

```text
Galerina makes builds and runtime behaviour explainable by default.
Developers declare intent.
The runtime generates observability artifacts automatically.
Monitoring is a runtime capability, not an application burden.
Telemetry exports follow OpenTelemetry standards for ecosystem compatibility.
```
