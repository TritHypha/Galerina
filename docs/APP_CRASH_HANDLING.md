# Galerina App Crash Handling

Galerina should make application crashes easier to detect without copying another
language's exception model or relying on F#-style concepts.

The core rule is:

```text
Galerina should not allow an app to just crash.
Every failure should become a typed error, a controlled panic or a structured
crash report.
```

This is primarily a Secure App Kernel and runtime-reporting concern. The core
language should define explicit typed results, panic/crash categories and source
maps. The optional app kernel should enforce crash boundaries around routes,
webhooks, workers, scheduled tasks and other application entry points.

## Error Categories

Galerina should separate expected application problems from runtime integrity
failures.

| Category | Meaning | Example |
|---|---|---|
| Error | Expected problem that code should handle | bad request, failed payment, invalid JSON |
| Failure | External or system problem | database down, timeout, missing secret |
| Crash / Panic | Unexpected serious problem | memory violation, impossible state, runtime bug |

Example:

```Galerina
enum OrderError {
  BadRequest
  PaymentDeclined
  DatabaseUnavailable
}

enum RuntimeCrash {
  OutOfMemory
  UnsafeBoundaryViolation
  ImpossibleState
  RuntimeBug
}
```

Expected problems should flow through `Result<T, E>` or a readable `try`/`catch`
form that still compiles to explicit typed outcomes. Unexpected runtime faults
should cross a crash boundary and produce a secret-safe report.

## App Kernel Boundaries

The Secure App Kernel should wrap application entry points:

```text
API routes
webhooks
background jobs
scheduled tasks
database calls
file operations
AI or compute tasks
external API calls
```

Example policy:

```Galerina
app MyApp {
  kernel secure

  crash_policy {
    report true
    redact_secrets true
    include_source_map true
    include_request_id true
    include_compute_target true

    on crash {
      write_report "./runtime/crashes/"
      return_safe_response
    }
  }
}
```

The kernel should never expose an internal stack trace or secret-bearing context
to users. It should return a safe response and write structured crash evidence.

## Route Crash Boundaries

Every route, webhook and job should have a crash boundary, either declared
directly or inherited from an app-level default.

```Galerina
api OrdersApi {
  POST "/orders" {
    request CreateOrderRequest
    response CreateOrderResponse

    errors [
      BadRequest,
      PaymentDeclined,
      DatabaseUnavailable
    ]

    crash_boundary ApiCrashBoundary

    handler createOrder
  }
}
```

Boundary example:

```Galerina
crash_boundary ApiCrashBoundary {
  on error BadRequest {
    return http 400
  }

  on error PaymentDeclined {
    return http 402
  }

  on error DatabaseUnavailable {
    return http 503
  }

  on crash {
    Log.safe("Unexpected crash in API route")
    Report.crash()
    return http 500 safe_message "Unexpected server error"
  }
}
```

The compiler and app-kernel route checker should reject public routes that can
write data, call external systems or process payments without a crash boundary.

## Expected Errors

Expected problems should not crash the app.

```Galerina
flow createOrder(input: CreateOrderRequest) -> Result<OrderResponse, OrderError> {
  let validOrder = validateOrder(input)
    Err(error) => return Err(BadRequest)

  let payment = Payments.authorise(validOrder)
    Err(error) => return Err(PaymentDeclined)

  let savedOrder = Orders.save(validOrder)
    Err(error) => return Err(DatabaseUnavailable)

  return Ok(OrderResponse.from(savedOrder))
}
```

Hidden exceptions should not be the default application error model. A fallible
operation should expose its failure type:

```Galerina
Database.save(order) -> Result<SavedOrder, DatabaseError>
```

not:

```Galerina
Database.save(order) -> SavedOrder
```

unless the operation is guaranteed not to fail.

## Compile-Time Crash Risk Checks

Galerina should warn or fail route checks when it finds risky application code:

```text
route has no crash boundary
external API call has no timeout
database write has no error handling
webhook has no idempotency policy
secret may be logged
large object copied without clone or move policy
match has unhandled cases
unsafe package has undeclared permissions
compute target has no fallback
```

Example diagnostic:

```json
{
  "severity": "error",
  "code": "GALERINA-CRASH-004",
  "message": "External API call has no timeout or failure handler.",
  "file": "payments.spore",
  "line": 28,
  "suggestion": "Add a timeout and typed Err handler."
}
```

## Crash Reports

Galerina should produce structured crash reports that are useful to developers,
operators and AI tools without leaking secrets.

Example file:

```text
runtime/crashes/2026-05-13-145500-crash.json
```

Example report:

```json
{
  "app": "orders-api",
  "environment": "production",
  "crashId": "crash_01HABC",
  "requestId": "req_99",
  "flow": "Payments.authorise",
  "sourceFile": "payments.spore",
  "sourceLine": 54,
  "compiledTarget": "node",
  "computeTarget": "cpu",
  "errorClass": "DatabaseUnavailable",
  "crashType": "HandledFailure",
  "safeResponse": true,
  "secretLeakDetected": false,
  "memoryPressure": "normal",
  "lastSafeStep": "validateOrder",
  "nextExpectedStep": "saveOrder"
}
```

Reports should include source maps, request or job IDs, named checkpoints,
runtime target, compute target, memory summary and redaction status when those
facts are available.

## Checkpoints

Important flow steps should be nameable so a crash report can identify the last
safe point.

```Galerina
flow createOrder(input: CreateOrderRequest) -> Result<OrderResponse, OrderError> {
  checkpoint "validate_order"
  let order = validateOrder(input)
    Err(error) => return Err(BadRequest)

  checkpoint "authorise_payment"
  let payment = Payments.authorise(order)
    Err(error) => return Err(PaymentDeclined)

  checkpoint "save_order"
  let saved = Orders.save(order)
    Err(error) => return Err(DatabaseUnavailable)

  return Ok(OrderResponse.from(saved))
}
```

If the app crashes, Galerina can report:

```text
Crashed after checkpoint: authorise_payment
Next expected checkpoint: save_order
```

## Health and Readiness

The app kernel should generate health and readiness checks from declared
dependencies.

```Galerina
app MyApp {
  dependencies {
    database mainDb
    secret PAYMENT_WEBHOOK_SECRET
    external_api PaymentProvider
    storage OrderFiles
  }

  health {
    endpoint "/health"
    readiness "/ready"
  }
}
```

Checks should cover database reachability, required secrets, storage access,
external API configuration, runtime health and recent crash state.

## Supervised Workers

Workers, scheduled tasks and queues should be supervised.

```Galerina
worker SendOrderEmails {
  run every 1 minute

  crash_policy {
    restart on crash
    max_restarts 3 per 10 minutes
    backoff exponential
    report true
  }

  handler sendPendingEmails
}
```

The kernel should record the crash, restart safely when allowed, stop after too
many failures and write a clear report.

Crash loop report example:

```json
{
  "alert": "CrashLoopDetected",
  "worker": "SendOrderEmails",
  "crashes": 5,
  "window": "10 minutes",
  "action": "worker_stopped",
  "reason": "Maximum restart limit reached"
}
```

## Safe Logging

Crash reports and logs must never leak secrets.

Denied pattern:

```Galerina
Log.info(secret)
```

Preferred pattern:

```Galerina
Log.safe("Payment provider failed", {
  orderId: order.id,
  provider: "stripe"
})
```

Galerina should redact API keys, passwords, tokens, cookies, authorization
headers, payment data and private customer data from crash reports, logs and
AI-readable context.

## AI-Readable Crash Context

After a crash, Galerina may generate a small AI debugging context file:

```text
runtime/ai-context/crash-context.json
```

Example:

```json
{
  "summary": "Order creation failed because the payment provider timed out.",
  "likelyCause": "External API unavailable or timeout too short.",
  "safeFilesToInspect": [
    "routes/orders.spore",
    "services/payments.spore"
  ],
  "doNotExpose": [
    "PAYMENT_API_KEY",
    "customer.cardToken"
  ],
  "suggestedFixes": [
    "Add retry policy",
    "Increase timeout",
    "Add circuit breaker",
    "Return PaymentUnavailable instead of generic ProcessingFailed"
  ]
}
```

AI context must be redacted, bounded and generated from known-safe fields.

## Project Shape

A Galerina app may organise crash policy like this:

```text
my-galerina-app/
|-- boot.spore
|-- main.spore
|-- routes/
|   `-- orders.spore
|-- services/
|   `-- payments.spore
|-- workers/
|   `-- send-order-emails.spore
|-- policies/
|   |-- crash-policy.spore
|   |-- security-policy.spore
|   `-- logging-policy.spore
|-- reports/
|   |-- compile-report.json
|   |-- security-report.json
|   |-- crash-risk-report.json
|   `-- target-report.json
`-- runtime/
    |-- logs/
    |-- crashes/
    `-- ai-context/
```

Example policy:

```Galerina
crash_policy DefaultCrashPolicy {
  classify {
    BadRequest => handled_error
    ValidationFailed => handled_error
    PaymentDeclined => handled_error
    DatabaseUnavailable => recoverable_failure
    Timeout => recoverable_failure
    OutOfMemory => fatal_crash
    UnsafeBoundaryViolation => fatal_crash
    ImpossibleState => panic
  }

  report {
    write_json true
    include_source_map true
    include_checkpoints true
    include_request_id true
    include_memory_summary true
    redact_secrets true
  }

  response {
    expose_internal_error false
    default_http_status 500
    default_message "Unexpected server error"
  }

  restart {
    workers true
    api_process false
    max_restarts 3 per 10 minutes
  }
}
```

## Required Capabilities

Galerina needs these capabilities to support safe crash handling:

| Capability | Needed for |
|---|---|
| `Result<T, E>` | Expected errors |
| `panic` / `crash` categories | Unexpected runtime failures |
| `crash_boundary` | Route, webhook and worker containment |
| `crash_policy` | App-wide crash rules |
| source maps | Link runtime faults back to `.spore` source |
| structured crash reports | Developer, operator and AI debugging |
| checkpoints | Identify the last successful step |
| safe logging | Prevent secret leaks |
| health checks | Detect broken app state |
| worker supervisor | Restart failed background tasks safely |
| crash-loop detection | Stop repeated failures |
| crash-risk report | Find issues before deployment |

## Design Rule

```text
Every app must have a crash policy.
Every route, webhook and worker must have a crash boundary.
Every expected failure must return Result<T, E> or an equivalent typed result.
Every unexpected crash must produce a structured report.
Every report must be safe for AI and operators to read.
```
