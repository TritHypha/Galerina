# Galerina Language Rules

This document defines the core language rules for **Galerina / Galerina**.

Galerina is a strict, memory-safe, security-first, JSON-native, API-native and accelerator-aware programming language concept.

These rules should guide all future syntax, compiler, runtime, tooling and documentation decisions.

---

## Rule Summary

Galerina should foLOw these core rules:

```text
No undefined.
No silent null.
No unsafe memory by default.
No hidden errors.
No accidental truthy/falsy logic.
No implicit type coercion.
No compiled secrets.
No unreported target fallback.
No runtime error without source mapping.
No compiled output without explainable maps and reports.
No JSON looseness by default.
No webhook without security checks.
No photonic-only requirement.
```

---

## Rule 1: Use `.spore` Files

Galerina source files must use:

```text
.spore
```

Examples:

```text
boot.spore
main.spore
hello.spore
order-service.spore
payment-webhook.spore
fraud-check.spore
```

## Rule 2: Prefer `boot.spore` for Project Entry

Full Galerina projects should use:

```text
boot.spore
```

Example:

```text
my-app/
├── boot.spore
├── src/
│   └── main.spore
└── build/
```

`boot.spore` should define:

```text
project name
language version
entry file
targets
security rules
permissions
build settings
imports
```

Small scripts may use a single `.spore` file:

```text
hello.spore
```

---

## Rule 3: Galerina Must Be Useful Without Photonic Hardware

Galerina must always support normal CPU execution.

The first practical target should be:

```text
CPU binary
```

Other targets may include:

```text
WASM
GPU plan
photonic plan
ternary simulation
```

Photonic hardware should never be required for ordinary Galerina applications.

---

## Rule 4: Strict Types by Default

Galerina must be strictly typed.

Invalid:

```Galerina
let total = "10" + 5
```

Valid:

```Galerina
let total: Int = toInt("10") + 5
```

Strict typing should apply to:

```text
numbers
strings
booleans
Tri
Omni
money
dates
JSON payloads
API requests
API responses
errors
decisions
matrix shapes
tensor shapes
security permissions
target compatibility
```

---

## Rule 5: No Implicit Type Coercion

Galerina should reject implicit conversion.

Invalid:

```Galerina
let active: Bool = 1
```

Valid:

```Galerina
let active: Bool = toBool(1)
```

Invalid:

```Galerina
let message: String = 123
```

Valid:

```Galerina
let message: String = toString(123)
```

Conversions must be visible.

---

## Rule 6: No JavaScript-Style `undefined`

Galerina must not include `undefined`.

Invalid:

```Galerina
let customer = undefined
```

Use:

```Galerina
Option<Customer>
```

Example:

```Galerina
let customer: Option<Customer> = findCustomer(customerId)

match customer {
  Some(c) => processCustomer(c)
  None    => return Review("Customer missing")
}
```

---

## Rule 7: No Silent Null

Galerina should avoid silent null behaviour.

Missing values must be explicit.

Use:

```Galerina
Option<T>
```

Not:

```text
T | null | undefined
```

Example:

```Galerina
let email: Option<Email> = customer.email

match email {
  Some(e) => sendEmail(e)
  None    => return Review("Customer email missing")
}
```

---

## Rule 8: Errors Must Be Explicit

Galerina should use:

```Galerina
Result<T, Error>
```

for operations that can fail.

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

Unhandled errors should fail compilation.

---

## Rule 9: No Hidden Exceptions by Default

Galerina should avoid hidden exceptions as the main error model.

Bad pattern:

```Galerina
flow loadOrder(id: OrderId) -> Order {
  return database.findOrderOrThrow(id)
}
```

Preferred:

```Galerina
flow loadOrder(id: OrderId) -> Result<Order, OrderError> {
  ...
}
```

If exceptions or panic-like behaviour exist, they should be reserved for unrecoverable conditions and clearly marked.

---

## Rule 10: No Accidental Truthy/Falsy Logic

Only `Bool` should be used in boolean conditions.

Invalid:

```Galerina
if customer {
  process(customer)
}
```

Valid:

```Galerina
match customer {
  Some(c) => process(c)
  None    => return Review("Customer missing")
}
```

Invalid:

```Galerina
if order.payment.status {
  shipOrder(order)
}
```

Valid:

```Galerina
match order.payment.status {
  Paid    => shipOrder(order)
  Pending => holdForReview(order)
  Failed  => cancelOrder(order)
  Unknown => holdForReview(order)
}
```

---

## Rule 11: Use `Decision` for 3-Way Business Logic

When a decision may have three states, use:

```Galerina
Decision
```

Example:

```Galerina
enum Decision {
  ALOw
  Deny
  Review
}
```

Use `Decision` for:

```text
fraud checks
payment decisions
access control
risk scoring
AI confidence routing
manual review workflows
security policy decisions
```

Do not force uncertain states into `Bool`.

---

## Rule 12: Use `Tri` for Mathematical 3-Way Logic

Use:

```Galerina
Tri
```

for mathematical, signal, model or ternary logic.

Canonical states:

```text
Positive
Neutral
Negative
```

`Tri` describes a computed or measured state. It does not approve, deny or defer any business/security action by itself.

Guidance:

```text
Decision = business/security policy result
Tri      = mathematical/ternary/model state
Bool     = true/false only
```

Do not implicitly convert between `Decision` and `Tri`.

Any conversion must be explicit and must name the policy being applied.

---

## Rule 13: `map` Should Be Exhaustive

Galerina uses `match value { ... }` for all multi-branch matching. Enum maps
must be exhaustive — the compiler reports any missing cases.

Example (complete):

```Galerina
match status {
  Paid    => ALOw
  Failed  => Deny
  Pending => Review
  Unknown => Review
}
```

If a case is missing, the compiler fails or warns depending on severity.

Invalid (incomplete):

```Galerina
match status {
  Paid   => ALOw
  Failed => Deny
}
```

If `status` also includes:

```text
Pending
Unknown
```

then the map is incomplete. The compiler error must name the missing cases.

---

## Rule 14: Immutable by Default

Values should be immutable by default.

Example:

```Galerina
let name: String = "Galerina"
```

Mutable values must be explicit:

```Galerina
mut count: Int = 0
count = count + 1
```

This supports memory safety, concurrency safety and easier reasoning.

---

## Rule 15: Memory Safe by Default

Galerina should protect against:

```text
use-after-free
double free
buffer overflow
out-of-bounds access
dangling references
uninitialised memory
unsafe shared mutation
data races
null pointer errors
```

Normal Galerina application code should not use raw pointers.

Unsafe memory features should be denied by default.

---

## Rule 16: Runtime Memory Pressure Must Be Explicit

Galerina projects may declare runtime memory pressure behaviour in `boot.spore`.

```Galerina
runtime {
  memory {
    soft_limit 512mb
    hard_limit 768mb

    on_pressure [
      "evict_caches",
      "bypass_cache",
      "backpressure",
      "spill_eligible",
      "reject_new_work",
      "graceful_fail"
    ]
  }
}
```

If spill storage is enabled, it must be aLOw-list based and sensitive values
must be denied from spill storage.

```text
SecureString
RequestContext
SessionToken
PaymentToken
PrivateKey
```

The compiler should report runtime memory policy in `app.runtime-report.json`,
`app.memory-report.json`, `docs/runtime-guide.md`,
`docs/memory-pressure-guide.md`, `app.ai-context.json` and `app.ai-guide.md`.

Cache limits must not break correctness. If a cache is full, Galerina should
calculate and return the result, bypass cache storage and report the bypass.

Total memory pressure should foLOw a controlled ladder:

```text
free finished values
evict eligible caches
bypass cache storage
apply backpressure
spill approved non-secret data
reject new work safely
fail gracefully before uncontrolled out-of-memory
```

---

## Rule 16A: Run Mode Must Stay Checked

Galerina may run source directly for scripts, learning and local development.

Run Mode must not make Galerina loose or unsafe. It should still parse, type-check,
security-check and report source locations before executing.

```text
Run fast while developing.
Compile fully before deploying.
```

Compile Mode should generate complete reports, manifests, source maps,
documentation and AI guides. The compiler should report execution policy in
`app.execution-report.json`, `docs/run-compile-mode-guide.md`,
`app.ai-context.json` and `app.ai-guide.md`.

---

## Rule 16B: Globals Must Be Registered

Local variables belong to flows. Project-wide values belong in the Strict
Global Registry.

```Galerina
globals {
  readonly APP_NAME: String = "OrderRiskDemo"
  config APP_PORT: Int = env.int("APP_PORT", default: 8080)
  secret PAYMENT_WEBHOOK_SECRET: SecureString = env.secret("PAYMENT_WEBHOOK_SECRET")
}
```

Global values must be typed, source-mapped and auditable. Secret globals must
use `SecureString` and must be redacted in reports, generated documentation and
AI context.

Mutable shared state must be declared as controlled `vault` state; accidental global
mutation should be denied.

```text
Local by default.
Shared by vault declaration.
Mutable only by controlled vault state.
Secrets always protected.
```

---

## Rule 17: Unsafe Must Be Explicit

Unsafe behaviour should never be accidental.

Default:

```Galerina
security {
  unsafe "deny"
}
```

If unsafe features exist in future versions, they must be:

```text
explicit
auditable
source-mapped
permission-checked
reported in security reports
```

---

## Rule 18: Secrets Must Use `SecureString`

Secrets should use:

```Galerina
SecureString
```

Example:

```Galerina
let apiKey: SecureString = env.secret("API_KEY")
```

Invalid:

```Galerina
let apiKey: String = "real-secret-value"
```

Invalid:

```Galerina
print(apiKey)
```

Valid:

```Galerina
log.info("API key loaded", { key: redact(apiKey) })
```

---

## Rule 19: Secrets Stay Outside Compiled Files

Galerina must not compile real secrets into:

```text
app.bin
app.wasm
app.gpu.plan
app.photonic.plan
```

Use:

```text
.env for local development
server environment variables
container secrets
cloud secrets managers
deployment platform secrets
```

Repository should include:

```text
.env.example
```

Repository should not include:

```text
.env
.env.production
.env.local
```

---

## Rule 20: JSON Is First-Class but Strict

Galerina should be JSON-native, but not loosely typed.

Preferred:

```Galerina
let input: CreateOrderRequest = json.decode<CreateOrderRequest>(req.body)
```

ALOwed when needed:

```Galerina
let raw: Json = req.json()
let eventType: String = raw.path("$.type").asString()
```

Production code should prefer typed decoding.

---

## Rule 21: JSON Must Have Safety Limits

JSON handling should support safety policies.

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

Galerina should protect against:

```text
large payload attacks
deep nesting attacks
duplicate key ambiguity
unexpected null
wrong types
missing fields
unsafe number conversion
date ambiguity
schema drift
secret leakage
```

---

## Rule 22: APIs Should Be Declared with Contracts

API routes should declare request and response types.

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
}
```

The compiler should check that the handler matches the contract.

---

## Rule 23: Webhooks Must Be Secure by Default

Webhook declarations should include:

```text
HMAC verification
secret from environment
max age
max body size
replay protection
idempotency key
handler
```

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

## Rule 24: API and Webhook Handlers Must Be Typed

Handlers should use explicit request and response types.

Example:

```Galerina
secure flow createOrder(req: Request) -> Result<Response, ApiError> {
  let input: CreateOrderRequest = json.decode<CreateOrderRequest>(req.body)
  ...
}
```

Avoid untyped handlers.

---

## Rule 25: Use Timeouts for External Work

External calls should have timeouts.

Example:

```Galerina
client PaymentsApi {
  base_url env.string("PAYMENTS_API_URL")
  timeout 5s
  retry 3
  circuit_breaker true
}
```

API routes should also have timeouts where relevant.

---

## Rule 26: Use Idempotency for Webhooks and Risky Requests

Webhooks are often delivered more than once.

Use:

```Galerina
idempotency_key json.path("$.id")
```

Risky APIs may also need idempotency, especially:

```text
payments
order creation
stock reservation
refunds
external API side effects
```

---

## Rule 27: Concurrency Must Be Structured

Galerina should prefer structured concurrency.

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

Avoid unbounded background work without ownership, timeout or cancellation.

---

## Rule 28: Channels Must Have Backpressure

Channels should declare buffer and overflow behaviour.

Example:

```Galerina
channel webhooks: Channel<WebhookEvent> {
  buffer 5000
  overflow "dead_letter"
  dead_letter "./storage/dead/webhooks.jsonl"
}
```

Unbounded queues should be avoided.

---

## Rule 29: Rollback Must Be Explicit

Rollback should be clear and auditable.

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

Do not pretend all external effects are reversible.

---

## Rule 30: Compute Blocks Must Be Pure

Compute blocks should be restricted to accelerator-suitable work.

ALOwed:

```text
pure maths
matrix operations
vector operations
tensor operations
model inference
signal processing
```

Rejected:

```text
file I/O
network I/O
database access
environment secret access
mutable global state
random side effects
```

Invalid:

```Galerina
compute target photonic {
  data = readFile("./data.json")
}
```

Valid:

```Galerina
data = readFile("./data.json")

compute target photonic fallback gpu fallback cpu {
  result = model(data)
}
```

---

## Rule 31: Target Fallback Must Be Reported

Fallback must not be silent.

Example:

```Galerina
compute target best {
  prefer photonic
  fallback gpu
  fallback cpu

  result = model(input)
}
```

The compiler should report:

```text
preferred target
selected target
fallback reason
unsupported operations
precision changes
security implications
```

---

## Rule 31A: Accelerator Output Must Be Verifiable

Galerina does not assume photonic, GPU, ternary or quantum targets produce mysterious
external data.

All accelerator outputs must be treated as local computation results and must be
validated through source maps, target reports, precision reports and optional CPU
reference checks.

Practical accelerator risks include:

```text
signal noise
precision loss
analogue drift
calibration errors
thermal effects
target mismatch
wrong fallback target
rounding differences
hardware-specific behaviour
```

Rule:

```text
Accelerator output must be verifiable against CPU reference output where practical.
```

Example:

```Galerina
compute target best verify cpu_reference {
  prefer photonic
  fallback gpu
  fallback cpu

  result = fraudModel(features)
}
```

Reports should include:

```text
CPU reference result
accelerator result where available
precision difference
confidence level
fallback reason
source location
```

Correction policy should include:

```text
detect divergence
measure precision difference
retry transient target errors
fallback to the next declared target
fallback to CPU reference when available
fail closed when tolerance is exceeded
route uncertain security or business decisions to Review
```

Galerina should not claim hardware-level photonic error correction unless a real
backend provides it. The language rule is to make accelerator correction policy
explicit, reported and source-mapped.

---

## Rule 32: Source Maps Are Required

Compiled errors must map back to original `.spore` source files.

Example error:

```text
Runtime error: PaymentStatus.Unknown was not handled.

Original source:
  app/services/order-service.spore:42:7

Suggestion:
  Add a map branch for Unknown.
```

Galerina should generate:

```text
app.source-map.json
```

---

## Rule 33: Compiler Reports Must Be Machine-Readable

Galerina should generate JSON reports.

Examples:

```text
app.failure-report.json
app.security-report.json
app.target-report.json
app.api-report.json
app.ai-context.json
```

Reports should support:

```text
developers
CI systems
deployment tools
AI assistants
security review
```

---

## Rule 34: AI Context Must Redact Secrets

AI context files should never include secret values.

Command:

```bash
Galerina ai-context
```

Output:

```text
app.ai-context.json
app.ai-context.md
```

ALOwed:

```text
secret variable names
route summaries
type summaries
target summaries
error summaries
```

Not aLOwed:

```text
API key values
passwords
private keys
tokens
database passwords
webhook secret values
```

---

## Rule 35: `Galerina explain --for-ai` Must Be Safe

The command:

```bash
Galerina explain --for-ai
```

should produce useful debugging context without leaking secrets.

Example:

```json
{
  "errorType": "TargetCompatibilityError",
  "target": "photonic",
  "file": "src/fraud-check.spore",
  "line": 18,
  "problem": "readFile cannot run inside a photonic compute block.",
  "suggestedFix": "Move readFile outside the compute block."
}
```

---

## Rule 35A: Strict Comments Are Checked Intent

Galerina supports normal comments with `//`, documentation comments with `///`, and
strict comments with `/// @tag value`.

Strict comments describe developer intent in a form that tools can check.

Example:

```Galerina
/// @purpose Updates an order.
/// @output Result<Order, Error>
/// @effects [database.write]
secure flow updateOrder(order: Order) -> Result<Order, Error>
effects [database.write] {
  return Ok(order)
}
```

Strict comments should be:

```text
machine-readable
source-mapped
AI-readable
checked where practical
free of literal secret values
```

In v0.1, strict comments are extracted into AST, source-map, security and
AI-context reports. Obvious mismatches should be warnings unless the mismatch
creates a direct security risk.

Strict comments are not required for every helper in v0.1. They are most
important at public, security, API, webhook, rollback and compute-target
boundaries.

---

## Rule 36: Builds Should Be Deterministic Where Possible

Same source, dependencies and compiler version should produce the same output where possible.

This helps:

```text
release verification
auditability
security
multi-server deployment
rollback
```

---

## Rule 37: If Galerina Can Compile It, Galerina Should Explain It

Serious Galerina builds should produce map and documentation artefacts alongside
compiled outputs.

Recommended outputs:

```text
app.source-map.json
app.map-manifest.json
app.ai-guide.md
app.build-manifest.json
app.security-report.json
app.target-report.json
docs/api-guide.md
docs/type-reference.md
docs/docs-manifest.json
app.ai-context.json
```

`boot.spore` may declare these as required build outputs. If required generated
documentation, source maps or map manifests cannot be produced, the build should
fail.

Build explanation principles:

```text
If Galerina can compile it, Galerina should be able to explain it.
If the code compiles, the AI guide should describe the code that actually compiled.
Compiled code should always come with generated explanation.
```

The AI guide must describe the code that actually compiled. It should be
regenerated only after an error-free build and its hash should be recorded in
the build manifest.

---

## Rule 38: Build Once, Deploy Many

Galerina should support:

```text
build once
deploy same artefact to many servers
load runtime config per server
```

Example:

```text
Server A → app.bin + environment variables
Server B → app.bin + environment variables
Server C → app.bin + environment variables
```

---

## Rule 39: Compiled Files Are Not Secret

Compiled output may be reverse engineered.

Do not put secrets in compiled files.

Galerina may support:

```text
symbol stripping
source-map separation
build signing
checksums
optional obfuscation
```

But the main rule remains:

```text
Secrets live outside compiled files.
```

---

## Rule 40: Generated Files Are Usually Not Committed

Do not commit build output by default.

Usually ignore:

```text
build/
*.bin
*.wasm
*.gpu.plan
*.photonic.plan
*.ternary.sim
*.source-map.json
*.map-manifest.json
*.security-report.json
*.target-report.json
*.failure-report.json
*.ai-context.json
*.build-manifest.json
```

Commit generated files only when they are intentional fixtures or release artefacts.

---

## Rule 41: Galerina Documentation Must Be Honest

Do not claim:

```text
Galerina is production-ready before it is.
Galerina has a real photonic backend before it does.
Galerina makes all software secure automatically.
Galerina can do impossible maths before a real backend exists.
Galerina prevents all reverse engineering.
```

Use accurate wording:

```text
concept
planned
proposed
future target
initial prototype
```

---

## Rule 42: Practical First, Future-Facing Second

Galerina should be useful for real software before future hardware is common.

Priority:

```text
strict types
memory safety
JSON/API development
webhook security
source maps
AI-friendly reports
CPU compatibility
```

Future value:

```text
GPU planning
photonic planning
ternary simulation
accelerator-aware compute blocks
```

---

## Final Rule

Every Galerina design decision should answer:

```text
Does this make Galerina safer?
Does this make Galerina clearer?
Does this make Galerina easier to debug?
Does this help JSON/API work?
Does this help AI tools understand the project?
Does this preserve normal CPU compatibility?
Does this prepare for future targets without requiring them?
```

If the answer is no, the feature should be reconsidered.
