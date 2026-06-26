# Galerina Flow Trace API

## Definition

The Flow Trace API gives developers debugger-style visibility into request
execution — but emitted as structured, governed logs rather than raw debug
output.

```text
Trace data is not debug dumping.
Trace data is governed evidence.
```

Every step of a flow emits a trace event. Secrets and PII are redacted by
policy before any event is written. No raw body, headers, tokens, or sensitive
field values may appear in trace output.

---

## Package Ownership

| Concern | Package |
| --- | --- |
| `trace flow` syntax and `capture`/`redact` blocks | `galerina-core` / `galerina-core-compiler` |
| `FlowTraceEvent` type contract | `galerina-core-reports` |
| JSONL emission and governed trace writer | `galerina-core-reports` |
| CLI viewing (`galerina trace`) | `galerina-core-cli` |
| Runtime trace correlation IDs | `galerina-core` / `galerina-core-runtime` |

---

## Trace Pipeline

Every request passes through a fixed set of governed stages:

```text
request/data in
  → decode
  → validate
  → policy check
  → capability check
  → handler
  → response
  → audit/proof
```

Each stage emits one or more `FlowTraceEvent` records to the trace stream.

---

## Galerina Syntax

### trace flow declaration

```galerina
trace flow OrderCreateTrace {
  capture request.metadata
  capture route.id
  capture validation.status
  capture policy.decision
  capture effects.used
  capture response.status

  redact secrets
  redact personal_data
}
```

### Attaching a trace to a flow

```galerina
flow createOrder(request: CreateOrderRequest)
  uses database.write
  trace OrderCreateTrace
{
  ...
}
```

### Trace redaction rules

```galerina
trace flow PaymentTrace {
  capture request.metadata
  capture policy.decision
  capture effects.used

  redact secrets          // all ProtectedSecret values
  redact personal_data    // fields marked with @pii or @sensitive
  redact request.body     // raw body never included
  redact response.body    // raw response body never included
}
```

---

## FlowTraceEvent Type

```ts
export interface FlowTraceEvent {
  /**
   * Stable correlation ID for the full request lifecycle.
   */
  traceId: string;

  /**
   * Span ID for this individual step within the trace.
   */
  spanId: string;

  /**
   * Parent span ID for nested or derived steps.
   */
  parentSpanId?: string;

  /**
   * ISO 8601 timestamp.
   */
  timestamp: string;

  /**
   * Which stage of the governed pipeline this event covers.
   */
  stage:
    | "request.received"
    | "request.decoded"
    | "validation.completed"
    | "policy.checked"
    | "capability.checked"
    | "effect.executed"
    | "handler.started"
    | "handler.completed"
    | "response.encoded"
    | "request.denied";

  /**
   * Outcome of this step.
   */
  status: "ok" | "warning" | "denied" | "error";

  /**
   * Route identifier from the compiler manifest.
   */
  routeId?: string;

  /**
   * Effect category exercised at this step (e.g. "database.write").
   */
  effect?: string;

  /**
   * Capability checked at this step.
   */
  capability?: string;

  /**
   * Decision outcome — matches canonical Decision kind values.
   * review and unknown are treated as denied at runtime boundaries.
   */
  decision?: "allow" | "deny" | "review" | "unknown";

  /**
   * Non-sensitive structured metadata for this step.
   * Must not include raw secret values, PII, or request body content.
   */
  metadata?: Record<string, unknown>;
}
```

---

## JSONL Output Format

Trace output is line-delimited JSON (JSONL). One object per line.

### Full request trace example

```jsonl
{"traceId":"trace_123","spanId":"recv","stage":"request.received","route":"POST /orders","status":"ok","timestamp":"2026-05-26T10:00:00.001Z"}
{"traceId":"trace_123","spanId":"decode","stage":"request.decoded","status":"ok","metadata":{"type":"CreateOrderRequest"},"timestamp":"2026-05-26T10:00:00.003Z"}
{"traceId":"trace_123","spanId":"validate","stage":"validation.completed","status":"ok","timestamp":"2026-05-26T10:00:00.005Z"}
{"traceId":"trace_123","spanId":"policy","stage":"policy.checked","status":"ok","decision":"allow","timestamp":"2026-05-26T10:00:00.006Z"}
{"traceId":"trace_123","spanId":"cap_db","stage":"capability.checked","capability":"database.write","decision":"allow","status":"ok","timestamp":"2026-05-26T10:00:00.007Z"}
{"traceId":"trace_123","spanId":"effect_db","stage":"effect.executed","effect":"database.write","status":"ok","timestamp":"2026-05-26T10:00:00.012Z"}
{"traceId":"trace_123","spanId":"resp","stage":"response.encoded","status":"ok","metadata":{"statusCode":201},"timestamp":"2026-05-26T10:00:00.014Z"}
```

### Denied request example

```jsonl
{"traceId":"trace_456","spanId":"recv","stage":"request.received","route":"DELETE /users/99","status":"ok","timestamp":"2026-05-26T10:01:00.001Z"}
{"traceId":"trace_456","spanId":"policy","stage":"policy.checked","status":"denied","decision":"deny","timestamp":"2026-05-26T10:01:00.003Z"}
{"traceId":"trace_456","spanId":"denied","stage":"request.denied","status":"denied","metadata":{"reason":"insufficient capability"},"timestamp":"2026-05-26T10:01:00.004Z"}
```

---

## Trace Writer API

```ts
export interface FlowTraceWriter {
  /**
   * Emit a single trace event to the governed trace stream.
   * The writer redacts secrets and PII before writing.
   */
  emit(event: FlowTraceEvent): void;

  /**
   * Flush buffered events (for async writers).
   */
  flush(): Promise<void>;

  /**
   * Close the trace stream.
   */
  close(): Promise<void>;
}
```

### emit() example

```ts
trace.emit({
  traceId,
  spanId: "validation",
  stage: "validation.completed",
  status: "ok",
  routeId: "orders.create",
  metadata: {
    validator: "CreateOrderRequest"
  }
});
```

---

## Redaction Contract

The trace writer must enforce these rules before any event is persisted:

```text
secrets            → always [REDACTED_SECRET]
personal_data      → always [REDACTED_PII] (fields marked @pii or @sensitive)
request.body       → omitted unless flow declares capture request.body with explicit policy
response.body      → omitted unless flow declares capture response.body with explicit policy
Authorization      → always [REDACTED_HEADER]
Cookie             → always [REDACTED_HEADER]
Set-Cookie         → always [REDACTED_HEADER]
tokens             → always [REDACTED_TOKEN]
```

The redaction writer must fail closed: if it cannot confirm a field is safe,
it redacts it.

---

## CLI — Developer View

```bash
galerina trace --request trace_123
```

Output:

```text
POST /orders
  ✓ request received
  ✓ decoded as CreateOrderRequest
  ✓ validation passed
  ✓ policy checked — allow
  ✓ capability database.write — allow
  ✓ effect database.write — ok
  ✓ response encoded 201
```

Denied request:

```bash
galerina trace --request trace_456
```

```text
DELETE /users/99
  ✓ request received
  ✗ policy check — DENIED
    reason: insufficient capability
```

### Filtering

```bash
galerina trace --request trace_123 --stage capability.checked
galerina trace --request trace_123 --status denied
galerina trace --route orders.create --last 20
```

---

## FlowTraceReport

For audit and long-term storage, traces are rolled up into a report:

```ts
export interface FlowTraceReport {
  schemaVersion: "galerina.trace.report.v1";
  traceId: string;
  routeId?: string;
  startedAt: string;
  completedAt?: string;
  outcome: "completed" | "denied" | "error";
  stagesCompleted: FlowTraceEvent["stage"][];
  eventCount: number;
  diagnostics: TraceDiagnostic[];
}
```

---

## Diagnostic Codes (SPORE-TRACE series)

| Code | Name | Meaning |
| --- | --- | --- |
| `SPORE-TRACE-001` | SECRET_IN_TRACE | Secret value attempted to flow into trace output |
| `SPORE-TRACE-002` | PII_IN_TRACE | PII field attempted to flow into trace output |
| `SPORE-TRACE-003` | BODY_CAPTURE_DENIED | Raw body capture requested without approved policy |
| `SPORE-TRACE-004` | HEADER_CAPTURE_DENIED | Sensitive header capture requested without approved policy |
| `SPORE-TRACE-005` | TRACE_WRITER_CLOSED | Trace event emitted after writer was closed |

---

## Safety Contracts

```text
Trace data is governed evidence, not a debug tool.

Secrets must never appear in trace output.
PII must never appear in trace output without explicit data-processor approval.
Raw request/response bodies must be explicitly declared in the trace flow block.
Authorization and credential headers are always redacted.
Trace output must be suitable for audit and compliance review.
```

---

## Integration Points

```text
galerina-core-compiler   → validates trace flow declarations; verifies redact rules cover all PII fields
galerina-core-reports    → FlowTraceEvent type contract; JSONL writer; FlowTraceReport schema
galerina-core-cli        → galerina trace command; formatted terminal output
galerina-core-runtime    → trace ID generation; governed trace stream injection
galerina-framework-api-server → injects trace writer into request lifecycle
```
