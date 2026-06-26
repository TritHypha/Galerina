# Galerina Syntax

This document describes the proposed syntax for **Galerina / Galerina**.

Galerina is a strict, memory-safe, security-first, JSON-native, API-native and accelerator-aware programming language concept.

The syntax is currently a design proposal and may change as the language develops.

---

## Per-Syntax Files

Detailed one-file-per-feature syntax notes live in:

```text
docs/sytax/
```

When syntax changes, update both this overview and the relevant file under
`docs/sytax/`.

Matching good/bad usage examples live in:

```text
docs/sytax-examples/
```

Update the matching examples file whenever syntax changes.

Current syntax files:

```text
docs/syntax-logic-status.md
docs/sytax/api-data-security-and-load-control.md
docs/sytax-examples/api-data-security-and-load-control.md
docs/sytax/api-duplicate-detection-and-idempotency.md
docs/sytax-examples/api-duplicate-detection-and-idempotency.md
docs/sytax/patterns-and-regex.md
docs/sytax-examples/patterns-and-regex.md
```

For a compact status table showing what Galerina has, what is TODO and what is
intentionally not core syntax, see
`docs/syntax-logic-status.md`.

---

## Syntax Goals

Galerina syntax should be:

```text
clear
strict
predictable
AI-friendly
easy to parse
easy to format
easy to debug
safe by default
not overly clever
```

Galerina should avoid having many different ways to express the same idea.

---

## Untrusted Syntax Rule

Every syntax feature starts untrusted.

A syntax feature is not considered safe or production-ready just because it can
be written in source. It must be managed by at least one explicit governance
surface before it can be treated as usable:

```text
type contract
effect declaration
permission policy
security policy
target policy
fallback policy
strict comment
compiler diagnostic
generated report
source map
test fixture
```

This applies to core syntax and package-owned syntax. New syntax should therefore
default to:

```text
untrusted until typed
untrusted until effect-checked
untrusted until permissioned
untrusted until bounded
untrusted until source-mapped
untrusted until reportable
```

Examples:

| Syntax | Default trust state | Required management |
|---|---|---|
| `flow` | Untrusted until typed | Parameters, return type and diagnostics |
| `secure flow` | Security-sensitive | Effects, permissions, strict comments and reports |
| `api` | Externally reachable | Request/response contracts, limits and security reports |
| `webhook` | Externally controlled | Signature, replay, idempotency and body-size policy |
| `await` | Scheduler-sensitive | Timeout, cancellation and effect rules |
| `vector` | Target-sensitive | Purity, fallback and precision reports |
| `unsafe` or native interop | Denied by default | Explicit trusted module and audit report |

If a feature cannot be managed this way yet, it must remain documented as
`Documented draft`, `TODO`, `Package-owned` or `Not core for v1`.

---

## Source File Extension

Galerina source files use:

```text
.spore
```

Examples:

```text
boot.spore
main.spore
hello.spore
routes.spore
order-service.spore
payment-webhook.spore
fraud-check.spore
```

## Entry File

Recommended project entry file:

```text
boot.spore
```

Example project:

```text
my-app/
├── boot.spore
├── src/
│   └── main.spore
└── build/
```

---

## Basic hello World

```Galerina
secure flow main() -> Result<Void, Error> {
  print("hello from Galerina")
  return Ok()
}
```

---

## Comments

Single-line comments:

```Galerina
// This is a single-line comment
```

Documentation comments:

```Galerina
/// Starts the application.
secure flow main() -> Result<Void, Error> {
  print("hello from Galerina")
  return Ok()
}
```

AI-readable structured comments may be supported later:

```Galerina
/// @ai-purpose Handles payment webhooks safely.
/// @ai-risk Duplicate webhook delivery.
/// @ai-rule Verify HMAC before decoding JSON.
secure flow handlePaymentWebhook(req: Request) -> Result<Response, WebhookError> {
  ...
}
```

---

## Variables

Immutable variables use:

```Galerina
let
```

Example:

```Galerina
let name: String = "Galerina"
let count: Int = 10
let active: Bool = true
```

Mutable variables use:

```Galerina
mut
```

Example:

```Galerina
mut retryCount: Int = 0
retryCount = retryCount + 1
```

Galerina should be immutable by default.

---

## Type Annotations

Use:

```Galerina
name: Type
```

Example:

```Galerina
let age: Int = 35
let email: String = "hello@example.com"
let total: Money<GBP> = Money(100.00)
```

---

## Auto — Compile-Time Type Inference

`Auto` asks the compiler to infer the concrete type from the value. It is not
`Any`. The compiler resolves `Auto` at compile time to a single concrete type.

```Galerina
let count: Auto = 42          // inferred: Int
let name: Auto  = "Phillip"   // inferred: String
let active: Auto = true       // inferred: Bool
```

Invalid — ambiguous branches cannot resolve to one type:

```Galerina
let result: Auto = match status {
  "ok"    => "continue"
  "error" => 500
}
// ERROR: compiler cannot infer a single type
```

Rule: prefer explicit types in flow signatures, API boundaries and
security-sensitive values. Use `Auto` only for obvious local bindings.

---

## Explicit Conversion

Galerina should not allow implicit type coercion.

Invalid:

```Galerina
let total = "10" + 5
```

Valid:

```Galerina
let total: Int = toInt("10") + 5
```

---

## Basic Types

Example:

```Galerina
let name: String = "Galerina"
let count: Int = 1
let price: Decimal = 19.99
let enabled: Bool = true
let createdAt: Timestamp = now()
let timeout: Duration = 5s
```

---

## Flow Syntax

Galerina uses:

```Galerina
flow
```

for the language's version of a function, but with extra meaning for security,
effects, reports, rollback, AI context and target optimisation.

A generic function keyword would mainly say:

```text
this is a function
```

`flow` can mean more:

```text
a checked unit of behaviour
a data path
an API handler
a webhook handler
a pure calculation
a secure action
a rollback-safe process
a vector/compute block
```

Example:

```Galerina
flow add(a: Int, b: Int) -> Int {
  return a + b
}
```

The simple rule:

```text
In Galerina, a flow is the language's version of a function, but with extra meaning for security, effects, reports, rollback, AI context and target optimisation.
```

This:

```Galerina
secure flow handlePaymentWebhook(req: Request) -> Result<Response, WebhookError>
effects [network.inbound, database.write] {
  ...
}
```

reads better than:

```Galerina
secure function handlePaymentWebhook(...)
```

because the code is not just a function. It is a controlled workflow with
inputs, outputs, effects, security rules, reports and source maps.

Keyword decision:

| Keyword | Pros | Cons |
|---|---|---|
| `function` | Clear and widely understandable | Longer, less connected to Galerina reports/effects |
| `def` | Short | Less descriptive for security-sensitive workflows |
| `fn` | Short | Too technical for the default app-layer style |
| `flow` | Fits Galerina security/API/AI/reporting concept | New keyword to learn |

Recommendation:

```text
Use `flow`.
```

Galerina is intended to be API-native, security-first, AI-readable,
report-generating and multi-target. `flow` better describes a unit of behaviour
that Galerina can analyse, map, report, secure, optimise and compile.

---

## Secure Flow Syntax

Use:

```Galerina
secure flow
```

for security-sensitive logic.

Example:

```Galerina
secure flow processPayment(order: Order) -> Result<Payment, PaymentError> {
  return paymentGateway.charge(order)
}
```

---

## Pure Flow Syntax

Use:

```Galerina
pure flow
```

for deterministic logic with no side effects.

Example:

```Galerina
pure flow calculateTax(amount: Money<GBP>) -> Money<GBP> {
  return amount * 0.20
}
```

A pure flow should not:

```text
read files
write files
use network
read environment variables
access time
generate random numbers
change global state
```

---

## Effects Syntax

Flows that perform side effects should declare effects.

Example:

```Galerina
flow sendEmail(email: Email) -> Result<Void, EmailError>
effects [network.external] {
  return mailer.send(email)
}
```

Possible effects:

```text
file.read
file.write
network.inbound
network.outbound
database.read
database.write
environment.read
secret.read
time.read
random.read
```

---

## Return Types

Every flow should declare a return type.

Example:

```Galerina
flow getName() -> String {
  return "Galerina"
}
```

Fallible flows should return:

```Galerina
Result<T, Error>
```

Example:

```Galerina
flow loadOrder(id: OrderId) -> Result<Order, OrderError> {
  ...
}
```

---

## Type Definitions

Example:

```Galerina
type Customer {
  id: CustomerId
  name: String
  email: Option<Email>
}
```

---

## Enum Definitions

Example:

```Galerina
enum PaymentStatus {
  Paid
  Unpaid
  Pending
  Failed
  Refunded
  Unknown
}
```

---

## Decision Type

Business and security decisions should use:

```Galerina
enum Decision {
  ALOw
  Deny
  Review
}
```

Example:

```Galerina
secure flow paymentDecision(status: PaymentStatus) -> Decision {
  match status {
    Paid     => ALOw
    Failed   => Deny
    Pending  => Review
    Unknown  => Review
    Unpaid   => Review
    Refunded => Review
  }
}
```

---

## Tri Syntax

Mathematical, signal, model and ternary target logic should use:

```Galerina
enum Tri {
  Positive
  Neutral
  Negative
}
```

Example:

```Galerina
pure flow signalState(score: Float) -> Tri {
  match score {
    score > 0.1  => Positive
    score < -0.1 => Negative
    _ => Neutral
  }
}
```

`Tri` values must not be used directly as business or security decisions. Convert them through an explicit policy flow that returns `Decision`.

---

## Option Syntax

Use `Option<T>` for values that may be missing.

Example:

```Galerina
let customer: Option<Customer> = findCustomer(customerId)
```

Handle with `match`:

```Galerina
match customer {
  Some(c) => processCustomer(c)
  None    => return Review("Customer missing")
}
```

Do not use `undefined`.

Do not rely on silent `null`.

---

## Result Syntax

Use `Result<T, E>` for operations that can fail.

Example:

```Galerina
flow loadOrder(id: OrderId) -> Result<Order, OrderError> {
  let order: Option<Order> = database.findOrder(id)

  match order {
    Some(o) => return Ok(o)
    None    => return Err(OrderError.NotFound)
  }
}
```

---

## Pattern Matching (match)

Galerina uses `match value { ... }` for all multi-branch matching. The `_ =>`
arm is the catch-all and is always written inside the closing `}`.

`match` replaces `switch`, `case`, `elseif` from other languages.

Basic enum matching:

```Galerina
match order.payment.status {
  Paid    => shipOrder(order)
  Pending => holdForReview(order)
  Failed  => cancelOrder(order)
  Unknown => holdForReview(order)
}
```

Enum matching must be exhaustive. The compiler reports any missing cases.

---

## Pattern Matching with Blocks

```Galerina
match order.payment.status {
  Paid => {
    shipOrder(order)
    return Ok(ALOw)
  }

  Pending => {
    holdForReview(order, reason: "Payment pending")
    return Ok(Review)
  }

  Failed => {
    cancelOrder(order)
    return Ok(Deny)
  }

  Unknown => {
    holdForReview(order, reason: "Payment status unknown")
    return Ok(Review)
  }
}
```

---

## If Syntax

Use `if` only with `Bool`.

Example:

```Galerina
if isEnabled == true {
  startService()
} else {
  stopService()
}
```

Invalid:

```Galerina
if customer {
  process(customer)
}
```

Use `match` for `Option<T>`:

```Galerina
match customer {
  Some(c) => process(c)
  None    => return Review("Customer missing")
}
```

---

## Loop Syntax

Galerina supports explicit loop forms rather than a single unbounded `loop` keyword in the initial syntax.

Use:

```text
for    = iterate over a bounded collection or stream
while  = repeat while a Bool condition is true
```

Loops should be source-mapped, bounds-checked where applicable and rejected when they rely on truthy/falsy conditions.

---

## For Loop Syntax

Example:

```Galerina
for item in order.items {
  processItem(item)
}
```

---

## While Loop Syntax

Example:

```Galerina
mut count: Int = 0

while count < 10 {
  count = count + 1
}
```

Loops should be source-mapped and safe.

---

## Await Syntax

Use `await` for async operations inside an explicit `async flow`.

Galerina is synchronous by default. A flow becomes async only when declared with the
`async` marker.

Example:

```Galerina
async flow confirmPayment(order: Order) -> Result<Payment, PaymentError>
effects [network.outbound] {
  let payment = await paymentGateway.confirm(order)
  return Ok(payment)
}
```

Rules:

```text
await is valid only inside async flow bodies
flows that use await must be marked async
flows that await async flows must also be marked async
async flows may appear anywhere normal flows are allowed
source order must not decide async validity
```

For Dart output, an async Galerina flow should lower to a Dart function returning
`Future<T>`.

---

## Async Task Syntax

Use `task` for a named async unit of work that must be awaited, cancelled or reported by its owning structured-concurrency scope.

```Galerina
task paymentTask = PaymentApi.charge(order)

let payment = await paymentTask timeout 5s
```

Unbounded detached tasks are not part of the initial Galerina syntax.

---

## Wait Until Syntax

Use `wait until` for condition-based waiting.

Example:

```Galerina
wait until order.payment.status == Paid timeout 30s {
  shipOrder(order)
} timeout {
  holdForReview(order)
}
```

`await` waits for an async operation.

`wait until` waits for a condition.

---

## Parallel Syntax

Use `parallel` for structured concurrency.

Example:

```Galerina
parallel {
  customer = await CustomersApi.get(input.customerId)
  stock = await StockApi.check(input.items)
  risk = await RiskApi.score(input)
} timeout 5s catch error {
  return Err(ApiError.ExternalServiceFailed(error))
}
```

Parallel blocks should support:

```text
timeouts
cancellation
safe error handling
source-mapped failures
```

---

## Channel Syntax

Example:

```Galerina
channel orders: Channel<OrderEvent> {
  buffer 1000
  overflow "reject"
  dead_letter "./storage/dead/orders.jsonl"
}
```

Channel rules:

```text
buffer is required
overflow must be reject, backpressure or dead_letter
dead_letter requires a target path or named queue
messages move ownership unless immutable and share-safe
```

---

## Worker Syntax

Example:

```Galerina
worker OrderWorker count 8 {
  for event in orders {
    processOrderEvent(event)
  }
}
```

Worker rules:

```text
count defines worker pool size
workers consume from declared channels
worker errors must be returned, retried, dead-lettered or reported
workers cannot capture unsafe mutable state
```

---

## Rollback Syntax

Use checkpoints and rollback blocks for multi-step workflows.

Example:

```Galerina
secure flow completeOrder(order: Order) -> Result<Order, OrderError> {
  checkpoint beforeOrderComplete

  reserveStock(order)
  takePayment(order)
  dispatchOrder(order)

  return Ok(order)

} rollback error {
  restore beforeOrderComplete
  releaseStock(order)
  refundPayment(order)

  return Err(error)
}
```

Rollback should not pretend every side effect is reversible.

---

## Attempt Syntax

A possible syntax for explicit fallible operations:

```Galerina
let result = attempt shipOrder(order)

match result {
  Ok(o)      => return Ok(o)
  Err(error) => return Err(error)
}
```

This is useful where a flow may fail but the developer wants explicit control.

---

## JSON Type Syntax

Example:

```Galerina
type CreateOrderRequest {
  customerId: CustomerId
  items: Array<OrderItem>
  currency: Currency
}
```

Decode JSON into a strict type:

```Galerina
let input: CreateOrderRequest = json.decode<CreateOrderRequest>(req.body)
```

Raw JSON when needed:

```Galerina
let raw: Json = req.json()
let eventType: String = raw.path("$.type").asString()
```

---

## JSON Policy Syntax

Example:

```Galerina
json_policy {
  max_body_size 1mb
  max_depth 32
  duplicate_keys "deny"
  unknown_fields "warn"
  null_fields "deny"
  date_format "iso8601"
}
```

---

## JSON Transform Syntax

Transform blocks map one typed shape into another typed shape.

```Galerina
transform ShopifyOrder -> InternalOrder {
  id = source.id
  customerId = source.customer.id
  total = Money<GBP>(source.total_price)
  email = source.customer.email
  items = source.line_items.map(toInternalItem)
}
```

The compiler should type-check every target field, reject unknown source fields and require explicit conversions for money, timestamps, IDs and nullable values.

---

## API Syntax

Example:

```Galerina
api OrdersApi {
  POST "/orders" {
    request CreateOrderRequest
    response CreateOrderResponse
    errors [ValidationError, PaymentError]
    timeout 5s
    max_body_size 1mb
    handler createOrder
  }

  GET "/orders/{id}" {
    params {
      id: OrderId
    }

    query {
      includeItems: Bool
    }

    response OrderResponse
    timeout 5s
    handler getOrder
  }
}
```

---

## API Middleware and Auth Syntax

Routes may declare middleware, auth and rate limits.

```Galerina
api OrdersApi {
  GET "/orders" {
    query {
      status: Option<OrderStatus>
      limit: Int
    }

    middleware [
      request_id,
      audit_log,
      rate_limit("orders-list")
    ]

    auth required UserSession using authenticateRequest

    rate_limit {
      key request.ip
      limit 100
      window 1m
      on_exceeded TooManyRequests
    }

    response Array<OrderResponse>
    handler listOrders
  }
}
```

Middleware should be ordered, named and included in API/security reports.

---

## Service, API and Webhook Boundary Syntax

Use `service` for listener ownership and runtime mounting.

Use `api` for normal typed HTTP request/response contracts.

Use `webhook` for secured inbound event callbacks.

```Galerina
service ApiServer {
  listen port env.int("APP_PORT", default: 8080)
  mount OrdersApi
  mount PaymentWebhook
}
```

`api` and `webhook` blocks should not contain `listen`. They are mounted by a `service` block or compiled as standalone development entry points.

---

## API Handler Syntax

Example:

```Galerina
secure flow createOrder(req: Request) -> Result<Response, ApiError> {
  let input: CreateOrderRequest = json.decode<CreateOrderRequest>(req.body)

  let order = createOrderFromInput(input)

  return JsonResponse(order)
}
```

---

## Service Syntax

Possible service declaration:

```Galerina
service ApiServer {
  listen port env.int("APP_PORT", default: 8080)

  route GET "/health" -> healthCheck
  route POST "/orders" -> createOrder
  mount OrdersApi
}
```

This may be useful for simpler projects.

For larger API contracts, prefer the `api` block.

Use `mount` when a service hosts a named `api` or `webhook` block.

---

## Webhook Syntax

Example:

```Galerina
webhook PaymentWebhook {
  path "/webhooks/payment"
  method POST

  security {
    hmac_header "Payment-Signature"
    secret env.secret("PAYMENT_WEBHOOK_SECRET")
    max_age 5m
    max_body_size 512kb
    replay_protection true
  }

  idempotency_key json.path("$.id")
  handler handlePaymentWebhook
}
```

---

## Webhook Handler Syntax

Example:

```Galerina
secure flow handlePaymentWebhook(req: Request) -> Result<Response, WebhookError>
effects [network.inbound] {
  let event: PaymentEvent = json.decode<PaymentEvent>(req.body)

  match event.type {
    "payment.succeeded" => handlePaymentSucceeded(event)
    "payment.failed"    => handlePaymentFailed(event)
    _ => return JsonResponse({ "ignored": true })
  }

  return JsonResponse({ "received": true })
}
```

---

## API Client Syntax

Example:

```Galerina
client PaymentsApi {
  base_url env.string("PAYMENTS_API_URL")
  timeout 5s
  retry 3
  circuit_breaker true

  headers {
    Authorization "Bearer " + env.secret("PAYMENTS_API_KEY")
  }

  POST "/payments/{id}/capture" -> capturePayment
}
```

Usage:

```Galerina
let result = await PaymentsApi.capturePayment(paymentId)

match result {
  Ok(payment) => return Ok(payment)
  Err(error)  => return Err(error)
}
```

---

## Compute Block Syntax

Use compute blocks for accelerator-suitable work.

Example:

```Galerina
compute target best {
  prefer photonic
  fallback gpu
  fallback cpu

  score = fraudModel(features)
}
```

ALOwed inside compute blocks:

```text
pure maths
matrix operations
vector operations
tensor operations
model inference
signal processing
```

Not aLOwed inside compute blocks:

```text
file I/O
network I/O
database access
secret access
mutable global state
```

---

## Matrix Syntax

Example:

```Galerina
let weights: Matrix<1024, 1024, Float16>
let input: Vector<1024, Float16>
let output: Vector<1024, Float16>

output = weights * input
```

The compiler should check shape compatibility.

---

## Money Syntax

Example:

```Galerina
let amount: Money<GBP> = Money(100.00)
let tax: Money<GBP> = Money(20.00)

let total: Money<GBP> = amount + tax
```

Invalid:

```Galerina
let amount: Money<GBP> = Money(100.00)
let tax: Money<USD> = Money(20.00)

let total = amount + tax
```

Compiler should require explicit currency conversion.

---

## Security Block Syntax

Example:

```Galerina
security {
  memory_safe true
  strict_types true
  null "deny"
  undefined "deny"
  unsafe "deny"
  unhandled_errors "deny"
  implicit_casts "deny"
  truthy_falsy "deny"
  secret_logging "deny"
}
```

---

## Permissions Block Syntax

Example:

```Galerina
permissions {
  network "restricted"
  file_read "aLOw"
  file_write "restricted"
  environment "restricted"
  native_bindings "deny"
}
```

---

## Package Policy Syntax

Possible future syntax:

```Galerina
package_policy {
  aLOw_network false
  aLOw_file_write false
  aLOw_native false
  aLOw_unsafe false
}
```

---

## Import Syntax

Final import syntax uses `imports` with `use` entries:

```Galerina
imports {
  use system
  use logic
  use math
  use json
  use api
  use environment
  use target.binary
  use target.gpu
  use target.photonic
  use target.threeway
}
```

Do not use module names that start with numbers.

Avoid:

```Galerina
import 3way
```

Prefer:

```Galerina
use target.threeway
```

This settles the `import` vs `use` direction: `use` is used inside an `imports` block for capabilities, standard modules and target-facing modules.

---

## `boot.spore` Syntax

Example:

```Galerina
project "OrderRiskDemo"

language {
  name "Galerina"
  version "0.1"
  compatibility "stable"
}

entry "./src/main.spore"

targets {
  binary {
    enabled true
    platform "linux-x64"
    output "./build/release/app.bin"
  }

  wasm {
    enabled true
    output "./build/release/app.wasm"
  }

  javascript {
    enabled true
    module "esm"
    typescript_declarations true
    source_maps true
  }

  node {
    enabled false
    module "esm"
    version ">=22"
    workers true
    source_maps true
  }

  react_adapter {
    enabled false
    hooks true
    fetch_clients true
    validation_schemas true
  }

  angular_adapter {
    enabled false
    services true
    validators true
    signal_wrappers true
  }

  mobile_native {
    enabled false
    output "./build/mobile/generated"
    source_maps true

    permissions {
      camera "deny_by_default"
      microphone "deny_by_default"
      location "deny_by_default"
      bluetooth "deny_by_default"
      notifications "deny_by_default"
    }

    reports {
      permissions true
      device_capabilities true
      native_bindings true
      compute_targets true
    }
  }

  gpu {
    enabled true
    mode "plan"
    check true
    fallback "binary"
    output "./build/release/app.gpu.plan"
  }

  photonic {
    enabled true
    mode "plan"
    check true
    fallback "gpu"
    output "./build/release/app.photonic.plan"
  }

  ternary {
    enabled true
    mode "simulation"
    output "./build/release/app.ternary.sim"
  }

  flutter {
    enabled false
    language "dart"
    output "./build/flutter/generated"

    async {
      enabled true
      default "off"
    }

    bytes {
      portable "Bytes"
      dart "Uint8List"
      conversion "explicit"
      zero_copy "when_safe"
    }

    render {
      framework "flutter"
      drawing "dart_ui"
      backend "auto"
      supports ["skia", "impeller"]
    }
  }
}
```

---

## Build Block Syntax

Example:

```Galerina
build {
  mode "release"
  deterministic true
  source_maps true
  reports true
  ai_context true

  stages [
    "parse",
    "type_check",
    "security_check",
    "memory_check",
    "api_contract_check",
    "lower_ir",
    "optimise_ir",
    "link_modules",
    "emit_targets",
    "write_reports"
  ]
}
```

---

## Target Syntax

Example:

```Galerina
targets {
  binary {
    enabled true
    output "./build/release/app.bin"
  }

  gpu {
    enabled true
    mode "plan"
    check true
    fallback "binary"
    output "./build/release/app.gpu.plan"
  }

  photonic {
    enabled true
    mode "plan"
    check true
    fallback "gpu"
    output "./build/release/app.photonic.plan"
  }
}
```

---

## Environment Syntax

Example:

```Galerina
let port: Int = env.int("APP_PORT", default: 8080)
let apiKey: SecureString = env.secret("API_KEY")
let appName: String = env.string("APP_NAME", default: "LOApp")
```

Secrets should use `SecureString`.

---

## Logging Syntax

Example:

```Galerina
log.info("Application started")
```

With safe redaction:

```Galerina
log.info("API key loaded", { key: redact(apiKey) })
```

Invalid:

```Galerina
log.info("API key", { key: apiKey })
```

if `apiKey` is a `SecureString`.

---

## Error Syntax

Example custom error:

```Galerina
enum OrderError {
  NotFound
  PaymentFailed
  InvalidStatus
}
```

Use with `Result`:

```Galerina
flow loadOrder(id: OrderId) -> Result<Order, OrderError> {
  ...
}
```

---

## Testing Syntax

Possible future test syntax:

```Galerina
test "payment decision returns review for pending payment" {
  let decision = paymentDecision(Pending)

  expect decision == Review
}
```

API test:

```Galerina
test "POST /orders rejects invalid payload" {
  let response = testClient.post("/orders", body: {})

  expect response.status == 400
}
```

---

## Formatting Rules

Galerina should have one official formatter.

General style:

```text
two-space indentation or consistent project standard
opening brace on same line
blank line between major match branches
explicit return types
clear block structure
```

Example:

```Galerina
secure flow main() -> Result<Void, Error> {
  print("hello from Galerina")
  return Ok()
}
```

---

## Syntax Non-Goals

Galerina syntax should not include:

```text
JavaScript-style undefined
PHP-style loose typing
implicit truthy/falsy checks
hidden exceptions as the main error model
untracked global mutation
magic target fallback
untyped production JSON by default
```

---

## Syntax Design Questions

Open syntax questions:

```text
Should semicolons ever be aLOwed?
Should `flow` remain the function keyword?
Should `secure flow` be a keyword or annotation?
Should effects appear before or after the return type?
Should `Decision` be built-in or standard library?
Should `boot.spore` contain all config or import config from Galerina.config?
Should API route syntax use HTTP verbs directly or string names?
```

---

## Final Syntax Principle

Galerina syntax should make safe code the easiest code to write.

The syntax should be:

```text
strict enough for compilers
clear enough for humans
predictable enough for AI assistants
safe enough for security-sensitive systems
practical enough for JSON/API applications
future-ready enough for accelerator targets
```
