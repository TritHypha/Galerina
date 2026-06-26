# Galerina Design

This document describes the design direction for **Galerina / Galerina**.

Galerina is a strict, memory-safe, security-first, JSON-native, API-native and accelerator-aware programming language concept.

The design should make Galerina practical for normal software development today while preparing for future targets such as GPU, WebAssembly, photonic compute and ternary / 3-way logic systems.

---

## Design Summary

Galerina should be designed around the foLOwing idea:

> Write one safe, strict `.spore` source project and compile it into multiple target outputs.

The design combines:

```text
strict types
memory safety
explicit errors
explicit missing values
JSON-native data handling
API-native routing and webhooks
safe concurrency
secure runtime configuration
source-mapped debugging
AI-readable compiler reports
multi-target compilation
accelerator-aware compute blocks
```

Galerina should be useful without photonic hardware.

Photonic and ternary support should begin as planning, validation and simulation targets.

---

## Design Goals

Galerina should be:

```text
safe by default
strict by default
clear to read
easy to explain
hard to misuse
practical for APIs
efficient with JSON
suitable for scripts
suitable for larger applications
friendly to AI coding assistants
ready for future hardware targets
```

---

## Design Non-Goals

Galerina should not try to be:

```text
a replacement for every language
a photonic-only language
a loose scripting language
a JavaScript clone
a PHP clone
a clone of another language
a full operating system
a kernel or driver development project by default
a hardware-vendor-specific language
```

Galerina should not make futuristic hardware support more important than practical developer experience.

---

## Source Files

Galerina source files use the `.spore` extension.

Examples:

```text
boot.spore
main.spore
order-service.spore
payment-webhook.spore
fraud-check.spore
```

## Entry File Design

The recommended project entry file is:

```text
boot.spore
```

Reason:

```text
boot.spore clearly means the project starts here
main.spore can still be used for simple scripts or small projects
```

A full project should normally use:

```text
boot.spore
```

A short script may use:

```text
hello.spore
```

---

## Project Mode and Script Mode

Galerina should support two modes:

```text
script mode
project mode
```

### Script Mode

Script mode is for quick tasks.

Example:

```text
hello.spore
```

Run:

```bash
Galerina run hello.spore
```

Script mode should use secure defaults:

```text
strict types on
memory safety on
undefined denied
silent null denied
unsafe denied
source maps enabled
CPU target enabled
```

### Project Mode

Project mode is for larger applications.

Example:

```text
my-app/
â”œâ”€â”€ boot.spore
â”œâ”€â”€ Galerina.config
â”œâ”€â”€ Galerina.lock
â”œâ”€â”€ src/
â”œâ”€â”€ app/
â”œâ”€â”€ config/
â”œâ”€â”€ tests/
â””â”€â”€ build/
```

Run:

```bash
Galerina build
```

---

## Recommended Project Structure

```text
galerina-project/
â”œâ”€â”€ boot.spore
â”œâ”€â”€ Galerina.config
â”œâ”€â”€ Galerina.lock
â”œâ”€â”€ .env.example
â”‚
â”œâ”€â”€ src/
â”‚   â”œâ”€â”€ main.spore
â”‚   â”œâ”€â”€ routes.spore
â”‚   â””â”€â”€ services/
â”‚       â”œâ”€â”€ order-service.spore
â”‚       â”œâ”€â”€ payment-service.spore
â”‚       â””â”€â”€ fraud-service.spore
â”‚
â”œâ”€â”€ app/
â”‚   â”œâ”€â”€ controllers/
â”‚   â”œâ”€â”€ models/
â”‚   â”œâ”€â”€ views/
â”‚   â”œâ”€â”€ middleware/
â”‚   â””â”€â”€ services/
â”‚
â”œâ”€â”€ components/
â”œâ”€â”€ packages/
â”œâ”€â”€ vendor/
â”œâ”€â”€ config/
â”œâ”€â”€ public/
â”œâ”€â”€ storage/
â”œâ”€â”€ tests/
â””â”€â”€ build/
```

---

## Package Folder Design

Galerina should separate native Galerina packages from external vendor code.

Recommended:

```text
packages-galerina/ = Galerina ecosystem packages
vendor/   = external third-party code, SDKs, native libraries or generated files
```

Example:

```text
packages/
â”œâ”€â”€ galerina-http/
â”œâ”€â”€ galerina-json/
â””â”€â”€ galerina-security/

vendor/
â”œâ”€â”€ c-libs/
â”œâ”€â”€ wasm-modules/
â””â”€â”€ external-sdk/
```

---

## Language Style

Galerina should use clear, compact and predictable syntax.

Preferred qualities:

```text
few ways to do the same thing
explicit types where needed
clear blocks
clear keywords
no hidden behaviour
consistent formatting
easy-to-parse grammar
AI-friendly structure
```

The syntax should be approachable but not loose.

---

## Function / Flow Design

Galerina should use `flow` as the primary unit of executable logic.

Example:

```Galerina
flow add(a: Int, b: Int) -> Int {
  return a + b
}
```

Security-sensitive functions can use:

```Galerina
secure flow
```

Example:

```Galerina
secure flow processPayment(order: Order) -> Result<Payment, PaymentError> {
  return paymentGateway.charge(order)
}
```

Reason:

```text
flow suggests controlled data flow
secure flow makes sensitive code obvious
```

---

## Type Design

Galerina should be strictly typed.

Example:

```Galerina
let name: String = "Galerina"
let count: Int = 10
let active: Bool = true
```

Mutable values must be explicit:

```Galerina
mut retryCount: Int = 0
retryCount = retryCount + 1
```

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

## Core Types

Initial core types:

```text
Void
Bool
Int
Float
Decimal
String
Char
Bytes
Array<T>
Map<K, V>
Option<T>
Result<T, E>
Decision
Tri
Json
JsonObject
JsonArray
Timestamp
Duration
SecureString
Money<Currency>
Vector<N, T>
Matrix<R, C, T>
Tensor<Shape, T>
```

---

## Option Design

Galerina should use `Option<T>` for missing values.

Example:

```Galerina
let customer: Option<Customer> = findCustomer(customerId)

match customer {
  Some(c) => processCustomer(c)
  None    => return Review("Customer missing")
}
```

Galerina should not use JavaScript-style `undefined`.

Galerina should avoid silent null.

---

## Result Design

Galerina should use `Result<T, E>` for operations that can fail.

Example:

```Galerina
flow loadOrder(id: OrderId) -> Result<Order, OrderError> {
  let order = database.findOrder(id)

  match order {
    Some(o) => return Ok(o)
    None    => return Err(OrderError.NotFound)
  }
}
```

Unhandled errors should fail compilation.

---

## Decision Design

Galerina should include a first-class decision type for 3-way business/security decisions.

Example:

```Galerina
enum Decision {
  ALOw
  Deny
  Review
}
```

Example usage:

```Galerina
secure flow checkPayment(status: PaymentStatus) -> Decision {
  match status {
    Paid    => ALOw
    Failed  => Deny
    Pending => Review
    Unknown => Review
  }
}
```

This avoids unsafe boolean logic for uncertain situations.

---

## Tri Design

Galerina should support `Tri` for more general 3-way logic.

Example states:

```text
Positive
Neutral
Negative
```

or:

```text
True
Unknown
False
```

`Decision` should be preferred for business logic.

`Tri` should be used for mathematical, signal or model-state logic.

---

## Boolean Design

Booleans should be used only where true/false is genuinely enough.

Example:

```Galerina
let isEnabled: Bool = true
```

Galerina should not allow non-boolean values inside `if`.

Invalid:

```Galerina
if customer {
  process(customer)
}
```

Valid:

```Galerina
if isEnabled == true {
  start()
}
```

Better when multiple states exist:

```Galerina
match customer {
  Some(c) => process(c)
  None    => return Review("Customer missing")
}
```

---

## match Design (Pattern Matching)

Galerina uses `match value { ... }` for exhaustive state handling.

Example:

```Galerina
match order.payment.status {
  Paid    => shipOrder(order)
  Pending => holdForReview(order)
  Failed  => cancelOrder(order)
  Unknown => holdForReview(order)
}
```

The compiler should warn or fail if a map is not exhaustive.

---

## Error Handling Design

Errors should be explicit.

Galerina should support:

```text
Result<T, E>
match result
attempt
catch
rollback
```

Example:

```Galerina
result = attempt shipOrder(order)

match result {
  Ok(order) => return Ok(order)
  Err(error) => return Err(error)
}
```

For larger flows:

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

---

## Rollback Design

Rollback should be first-class for multi-step workflows.

Use cases:

```text
payments
stock reservations
file changes
database updates
external API calls
security workflows
```

Design:

```Galerina
checkpoint beforeAction

performAction()

rollback beforeAction
```

Structured example:

```Galerina
secure flow completeOrder(order: Order) -> Result<Order, OrderError> {
  checkpoint beforeOrderComplete

  reserveStock(order)
  takePayment(order)
  dispatchOrder(order)

  return Ok(order)

} rollback error {
  restore beforeOrderComplete
  return Err(error)
}
```

Rollback should not be magic.

Every reversible action should either:

```text
declare its rollback operation
or be marked as non-reversible
```

---

## Async Design

Galerina should support `await` for async operations.

Example:

```Galerina
payment = await paymentGateway.confirm(order)
```

Async should support:

```text
timeouts
cancellation
structured concurrency
safe error handling
source-mapped failures
```

---

## Wait-Until Design

Galerina should separate `await` from condition-based waiting.

Example:

```Galerina
wait until order.payment.status == Paid timeout 30s {
  shipOrder(order)
} timeout {
  holdForReview(order)
}
```

This is clearer than using `await` for every kind of waiting.

---

## Parallel Design

Galerina should support structured parallel blocks.

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
error collection
safe shared state
source-mapped errors
```

---

## Channel Design

Galerina should support channels for event processing.

Example:

```Galerina
channel orders: Channel<OrderEvent> {
  buffer 1000
  overflow "reject"
  dead_letter "./storage/dead/orders.jsonl"
}
```

Workers can consume from channels:

```Galerina
worker OrderWorker count 8 {
  for event in orders {
    processOrderEvent(event)
  }
}
```

---

## Backpressure Design

Galerina should make backpressure explicit.

Options may include:

```text
reject
wait
drop_oldest
drop_newest
dead_letter
scale_worker
```

Example:

```Galerina
channel webhooks: Channel<WebhookEvent> {
  buffer 5000
  overflow "dead_letter"
  dead_letter "./storage/dead/webhooks.jsonl"
}
```

---

## JSON Design

Galerina should be JSON-native but strict.

Rule:

```text
JSON is easy to receive.
JSON is easy to inspect.
JSON is easy to transform.
JSON is easy to output.
But production JSON should be decoded into strict Galerina types.
```

Preferred:

```Galerina
let order: CreateOrderRequest = json.decode<CreateOrderRequest>(req.body)
```

ALOwed when needed:

```Galerina
let raw: Json = req.json()
let eventType: String = raw.path("$.type").asString()
```

---

## JSON Types

Galerina should include:

```text
Json
JsonObject
JsonArray
JsonString
JsonNumber
JsonBool
JsonNull
```

However, most production code should use typed decoding.

Example:

```Galerina
type CreateOrderRequest {
  customerId: CustomerId
  items: Array<OrderItem>
  currency: Currency
}
```

Then:

```Galerina
let input: CreateOrderRequest = json.decode<CreateOrderRequest>(req.body)
```

---

## JSON Safety Design

Galerina should support JSON policies.

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

This protects against:

```text
large payload attacks
deep nesting attacks
duplicate keys
unexpected null
wrong types
missing fields
schema drift
unsafe number conversion
date ambiguity
secret leakage
```

---

## Streaming JSON Design

Galerina should support streaming JSON.

Example:

```Galerina
for item in json.stream<OrderItem>(req.body) {
  process(item)
}
```

This is important for large payloads.

---

## Partial JSON Decoding Design

Galerina should support partial decoding.

Example:

```Galerina
let eventType: String = json.pick<String>(req.body, "$.type")
```

This avoids decoding full payloads when only a small part is needed.

---

## JSON Lines Design

Galerina should support JSON Lines.

Example:

```Galerina
for event in jsonl.read<Event>("./events.jsonl") {
  process(event)
}
```

This is useful for:

```text
logs
events
data imports
worker queues
dead-letter queues
audit trails
```

---

## Transform Design

Galerina should support structured JSON/data transformation.

Example:

```Galerina
transform ShopifyOrder -> InternalOrder {
  id = source.id
  customerId = source.customer.id
  total = Money<GBP>(source.total_price)
  email = source.customer.email
  items = source.line_items.map(toInternalItem)
}
```

This would help with API integrations.

---

## API Design

Galerina should support API contracts.

Example:

```Galerina
api OrdersApi {
  POST "/orders" {
    request CreateOrderRequest
    response CreateOrderResponse
    errors [ValidationError, PaymentError]
    handler createOrder
  }

  GET "/orders/{id}" {
    params {
      id: OrderId
    }

    response OrderResponse
    handler getOrder
  }
}
```

The compiler should generate:

```text
OpenAPI
JSON schemas
request validators
response validators
test mocks
API reports
```

---

## Webhook Design

Webhooks should be first-class.

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

This makes webhook safety part of the language rather than something developers must manually remember.

---

## API Client Design

Galerina should support external API clients.

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

## Compute Block Design

Compute blocks identify code that may be suitable for accelerator targets.

Example:

```Galerina
compute target best {
  prefer photonic
  fallback gpu
  fallback cpu

  riskScore = fraudModel(features)
}
```

The compiler should analyse the block and report:

```text
whether it can run on CPU
whether it can run on GPU
whether it can map to photonic plan
whether it can be represented in ternary simulation
why any target failed
which fallback will be used
```

---

## Compute Block Restrictions

Not everything should be aLOwed inside compute blocks.

Bad:

```Galerina
compute target photonic {
  result = readFile("./data.txt")
}
```

Reason:

```text
file I/O is not a photonic compute operation
```

Better:

```Galerina
data = readFile("./data.txt")

compute target photonic fallback gpu fallback cpu {
  result = model(data)
}
```

Compute blocks should usually aLOw:

```text
matrix operations
vector operations
tensor operations
supported model inference
signal processing
certain pure maths functions
```

Compute blocks should usually reject:

```text
file I/O
network I/O
database access
random side effects
secret access
general HTTP routing
mutable global state
```

---

## Maths Design

Galerina should include maths-first types.

Examples:

```text
Vector<N, T>
Matrix<R, C, T>
Tensor<Shape, T>
Decimal
Money<Currency>
```

Example:

```Galerina
let weights: Matrix<1024, 1024, Float16>
let input: Vector<1024, Float16>
let output: Vector<1024, Float16>

output = weights * input
```

The compiler should check:

```text
matrix shape compatibility
precision compatibility
target compatibility
memory limits
fallback options
```

---

## Money Design

Galerina should treat money safely.

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

Compiler error:

```text
Cannot add Money<GBP> and Money<USD>.
Convert currency explicitly before adding.
```

---

## Security Design

Security should be declared at project level.

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

Security rules should be enforced by the compiler and runtime.

---

## Permission Design

Galerina should support permission declarations.

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

Packages should also declare permissions.

This helps protect projects from risky dependencies.

---

## Effect System Design

Galerina should support effects.

Example pure flow:

```Galerina
pure flow calculateTax(amount: Money<GBP>) -> Money<GBP> {
  return amount * 0.20
}
```

A pure flow must not:

```text
read files
write files
use network
read environment variables
access current time
generate random numbers
change global state
```

Example effectful flow:

```Galerina
flow sendEmail(email: Email) -> Result<Void, EmailError>
effects [network.external] {
  return mailer.send(email)
}
```

---

## Runtime Configuration Design

Runtime configuration should live outside compiled outputs.

Recommended:

```text
.env for local development
environment variables for servers
container secrets for containers
cloud secrets managers for cloud deployments
```

Never compile real secrets into:

```text
app.bin
app.wasm
app.gpu.plan
app.photonic.plan
```

---

## Environment Access Design

Galerina should make environment access explicit.

Example:

```Galerina
let port: Int = env.int("APP_PORT", default: 8080)
let apiKey: SecureString = env.secret("API_KEY")
```

`env.secret` should return `SecureString`.

---

## Build Pipeline Design

Galerina should use a multi-stage build pipeline.

Recommended stages:

```text
1. Read project config
2. Load source files
3. Parse source
4. Build AST
5. Type-check
6. Security-check
7. Memory-check
8. JSON/API contract check
9. Lower to intermediate representation
10. Optimise intermediate representation
11. Link modules
12. Split CPU/GPU/photonic-compatible workloads
13. Emit target outputs
14. Generate source maps
15. Generate reports
16. Generate AI context files
```

---

## Intermediate Representation Design

Galerina should compile to an intermediate representation before final outputs.

```text
.spore source
   â†“
Galerina IR
   â†“
optimised Galerina IR
   â†“
binary / wasm / gpu plan / photonic plan / ternary sim
```

The IR aLOws:

```text
multi-target output
optimisation
better diagnostics
security checking
AI-readable reporting
future backend support
```

---

## Output Design

Recommended build output:

```text
build/
â”œâ”€â”€ app.bin
â”œâ”€â”€ app.wasm
â”œâ”€â”€ app.gpu.plan
â”œâ”€â”€ app.photonic.plan
â”œâ”€â”€ app.ternary.sim
â”œâ”€â”€ app.openapi.json
â”œâ”€â”€ app.api-report.json
â”œâ”€â”€ app.target-report.json
â”œâ”€â”€ app.security-report.json
â”œâ”€â”€ app.failure-report.json
â”œâ”€â”€ app.source-map.json
â”œâ”€â”€ app.ai-context.json
â””â”€â”€ app.build-manifest.json
```

---

## Source Map Design

Galerina should generate source maps.

Source maps should connect compiled output back to original `.spore` files.

They should include:

```text
original file
original line
original column
flow/function name
compiled target
compiled location
optimisation stage
```

Example error:

```text
Runtime error: PaymentStatus.Unknown was not handled.

Original source:
  app/services/order-service.spore:42:7

Suggestion:
  Add a match branch for Unknown.
```

---

## Compiler Report Design

Galerina should generate machine-readable reports.

Examples:

```text
app.failure-report.json
app.security-report.json
app.target-report.json
app.api-report.json
app.ai-context.json
```

These reports help:

```text
developers
CI pipelines
AI coding assistants
deployment tools
security review
debugging
```

---

## AI Context Design

Galerina should support:

```bash
Galerina ai-context
```

Output:

```text
build/app.ai-context.json
build/app.ai-context.md
```

The AI context should summarise:

```text
project name
entry file
source files
routes
webhooks
types
imports
permissions
targets
compiler errors
changed files
suggested next actions
```

This reduces the need to paste large code blocks into AI tools.

---

## AI Explain Design

Galerina should support:

```bash
Galerina explain --for-ai
```

This should produce compact, structured explanations.

Example:

```json
{
  "errorType": "TargetCompatibilityError",
  "target": "photonic",
  "file": "src/fraud-check.spore",
  "line": 18,
  "column": 12,
  "problem": "readFile cannot run inside a photonic compute block.",
  "why": "Photonic targets only support approved maths, tensor, matrix and model operations.",
  "suggestedFix": "Move readFile outside the compute block and pass the parsed data into the model."
}
```

---

## Build Manifest Design

Galerina should generate a build manifest.

Example:

```json
{
  "project": "order-risk-demo",
  "version": "0.1.0",
  "language": "Galerina",
  "compiler": "0.1.0",
  "mode": "release",
  "targets": ["binary", "wasm", "gpu-plan", "photonic-plan"],
  "sourceHash": "sha256:...",
  "binaryHash": "sha256:...",
  "createdAt": "2026-05-02T09:00:00Z"
}
```

The manifest helps:

```text
deployment
rollback
verification
auditing
multi-server release control
```

---

## Debug and Release Design

Galerina should support debug and release builds.

### Debug

Debug builds should keep:

```text
source maps
IR output
detailed reports
symbols
target diagnostics
```

### Release

Release builds should:

```text
optimise output
strip unnecessary symbols
keep separate source maps
produce build manifest
produce security report
```

---

## Target Design

Galerina should support these targets:

```text
binary
wasm
gpu-plan
photonic-plan
ternary-sim
```

Long-term targets may include:

```text
gpu-native
photonic-native
ternary-native
llvm
mlir
onnx
```

---

## Target Fallback Design

Galerina should make fallback explicit.

Example:

```Galerina
compute target best {
  prefer photonic
  fallback gpu
  fallback cpu

  result = model(input)
}
```

Fallback decisions must be included in target reports.

---

## Decompilation Design

Galerina should assume compiled output can potentially be reverse engineered.

Therefore:

```text
compiled files are not secret
secrets must stay outside compiled files
source maps should be separate where needed
release builds may strip symbols
builds may be signed and verified
```

Optional hardening:

```text
symbol stripping
debug metadata separation
code signing
build checksums
optional obfuscation
```

---

## Deployment Design

Galerina should support build-once, deploy-many.

Flow:

```text
1. Build once
2. Generate hashes
3. Generate build manifest
4. Sign or verify artefact
5. Upload artefact
6. Deploy same artefact to many servers
7. Each server loads its own environment variables
8. Health check each server
9. Roll back if checks fail
```

---

## CLI Design

Suggested CLI commands:

```bash
Galerina init
Galerina run
Galerina build
Galerina check
Galerina test
Galerina fmt
Galerina lint
Galerina explain
Galerina explain --for-ai
Galerina verify
Galerina targets
Galerina ai-context
Galerina schema
```

---

## Formatting Design

Galerina should include an official formatter.

Command:

```bash
Galerina fmt
```

The formatter should produce consistent output and reduce arguments about style.

This also helps AI tools because the code has predictable formatting.

---

## Linting Design

Galerina should include an official linter.

Command:

```bash
Galerina lint
```

The linter should check:

```text
style issues
unused imports
weak security patterns
unsafe package permissions
large JSON policies missing
API handlers without timeouts
webhooks without idempotency
compute blocks with unsupported operations
```

---

## Documentation Design

Galerina documentation should be clear, structured and example-heavy.

Core documentation files:

```text
README.md
ABOUT.md
CONCEPT.md
LICENSE
LICENCE.md
NOTICE.md
REQUIREMENTS.md
DESIGN.md
TASKS.md
TODO.md
ROADMAP.md
ARCHITECTURE.md
SECURITY.md
CONTRIBUTING.md
CODE_OF_CONDUCT.md
AI-INSTRUCTIONS.md
CHANGELOG.md
GETTING_STARTED.md
DEMO_hello_WORLD.md
GIT.md
COMPILED_APP_GIT.md
.env.example
.gitignore
docs/
```

---

## Design Priorities

Priority order:

```text
1. Clear concept
2. Strict type rules
3. Memory safety model
4. JSON-native design
5. API-native design
6. Source maps
7. Compiler reports
8. AI context output
9. CPU execution
10. GPU/photonic planning
11. Ternary simulation
12. Future native accelerator targets
```

---

## Version 0.1 Design Scope

Version 0.1 should include:

```text
documentation
syntax examples
basic grammar draft
parser prototype
AST prototype
interpreter prototype
strict type concept
Option and Result concept
Decision type concept
JSON decode concept
API contract concept
source-map format concept
security report format
target report format
AI context format
```

Version 0.1 should not require:

```text
real photonic hardware
real GPU backend
full MVC framework
production compiler
formal verification
package manager
```

---

## Final Design Statement

Galerina should be designed as a practical language first and a future-hardware language second.

The immediate value should come from:

```text
strict typing
memory safety
JSON-native development
API-native workflows
source-mapped compiled errors
security-first defaults
AI-readable project reports
normal CPU compatibility
```

The future value should come from:

```text
GPU planning
photonic planning
ternary simulation
multi-target compilation
accelerator-aware compute blocks
```

The best design outcome is a language that is useful today and ready for the hardware changes that may come next.
