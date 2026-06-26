# Galerina AI Instructions

This document provides guidance for AI coding assistants working on **Galerina / Galerina**.

Galerina is a strict, memory-safe, security-first, JSON-native, API-native and accelerator-aware programming language concept.

AI assistants should use this file to understand the project goals, rules, naming conventions, design boundaries and expected behaviour when generating code, documentation, examples or architecture notes.

---

## Project Summary

Galerina / Galerina is a programming language concept designed to compile one `.spore` source project into multiple outputs.

Target outputs may include:

```text
CPU binary
WebAssembly
GPU plan
photonic plan
ternary simulation
OpenAPI contract
JSON schemas
security reports
target reports
source maps
AI context files
build manifests
```

The language should be practical on normal computers today while preparing for future accelerator hardware.

---

## Core Identity

Galerina should be:

```text
strictly typed
memory safe
security-first
JSON-native
API-native
AI-friendly
maths-oriented
accelerator-aware
source-map friendly
deployment-friendly
```

Galerina core is the language, compiler and safety contract. The optional Galerina Secure
App Kernel enforces request lifecycle, validation, auth, rate-limit,
idempotency, job and runtime-report boundaries. Full frameworks such as CMS,
admin UI, ORM, templates and frontend adapters must stay above the kernel.

Galerina should not become:

```text
a clone of another language
a loose scripting language
a photonic-only research language
a language that requires future hardware to be useful
a full web framework
a CMS or admin dashboard
a frontend framework clone
a mandatory ORM or template system
```

---

## Critical Rules

AI assistants must preserve these rules when helping with Galerina:

```text
Do not add undefined.
Do not add silent null.
Do not weaken strict typing.
Do not allow accidental truthy/falsy logic.
Do not hide errors.
Do not compile secrets into output files.
Do not remove source-map support.
Do not make photonic hardware mandatory.
Do not remove CPU fallback.
Do not make JSON fully dynamic by default.
Do not make unsafe memory normal.
Do not design or implement kernel, driver, privileged native binding or raw hardware access work without explicit maintainer or project permission.
Treat kernel and driver development as last-stage work.
Do not put full framework features into Galerina core.
Do not treat the Secure App Kernel as a CMS, ORM, UI framework or page builder.
```

---

## Backend Suggestion Rule

When updating Galerina core, preserve the backend runtime priorities from
`docs/backend-runtime-capability-roadmap.md`:

```text
language editions and compatibility rules
Bool, Tri, Decision and Galerina conversion rules
algebraic variants and exhaustive match
generic constraints, traits or protocols
structured concurrency, cancellation and streams
deterministic resource cleanup
safe compile-time metadata and attributes
native ABI and foreign-call boundaries
matrix/vector shape rules with scalar fallback
stable diagnostics and AI report schemas
```

Treat these as language/compiler concerns. Runtime enforcement belongs in the
Secure App Kernel. Full application opinions belong in frameworks.

---

## Kernel and Driver Boundary

AI assistants should not introduce kernel modules, operating-system drivers,
privileged runtimes, vendor SDK driver bindings or raw hardware access into Galerina
docs, examples, compiler code or runtime code unless the user or maintainer has
explicitly approved that work.

Default guidance:

```text
applications first
safe compiler and reports first
normal targets first
kernel and driver development last
permission required before planning or implementation
```

---

## File Extension Rule

Galerina source files use:

```text
.spore
```

Use:

```text
boot.spore
main.spore
order-service.spore
payment-webhook.spore
fraud-check.spore
```

## Entry File Rule

For full projects, prefer:

```text
boot.spore
```

For small examples or scripts, `main.spore` is acceptable.

Recommended:

```text
boot.spore = project entry and configuration
src/main.spore = application entry flow
```

---

## Naming Guidance

Use clear names.

Preferred:

```text
Galerina
Galerina
boot.spore
Galerina.config
Galerina.lock
packages/
vendor/
build/
```

Avoid vague names such as:

```text
future-safe-language
my-new-lang
```

Unless discussing historical notes or alternatives.

---

## Recommended Project Structure

Use this structure for examples unless a smaller script is more appropriate:

```text
my-galerina-app/
├── boot.spore
├── Galerina.config
├── Galerina.lock
├── .env.example
├── src/
│   ├── main.spore
│   ├── routes.spore
│   └── services/
├── app/
│   ├── controllers/
│   ├── models/
│   ├── views/
│   ├── middleware/
│   └── services/
├── components/
├── packages/
├── vendor/
├── config/
├── public/
├── storage/
├── tests/
└── build/
```

For short scripts:

```text
hello.spore
```

---

## Language Style

Prefer clear, compact and predictable syntax.

Good Galerina examples should be:

```text
easy to read
strictly typed
explicit about errors
explicit about missing values
clear about permissions
clear about target fallback
clear about JSON types
clear about API contracts
```

Avoid clever syntax that is hard to explain.

---

## Function / Flow Style

Use:

```Galerina
flow
```

for normal functions.

Use:

```Galerina
secure flow
```

for security-sensitive workflows.

Use:

```Galerina
pure flow
```

for deterministic logic without side effects.

Example:

```Galerina
secure flow processOrder(order: Order) -> Result<Decision, OrderError> {
  return Ok(Review)
}
```

---

## Strict Type Rule

Always prefer strict types.

Bad:

```Galerina
let total = "10" + 5
```

Good:

```Galerina
let total: Int = toInt("10") + 5
```

Bad:

```Galerina
if customer {
  process(customer)
}
```

Good:

```Galerina
match customer {
  Some(c) => process(c)
  None    => return Review("Customer missing")
}
```

---

## Missing Value Rule

Do not use `undefined`.

Do not use silent `null`.

Use:

```Galerina
Option<T>
```

Example:

```Galerina
let customer: Option<Customer> = findCustomer(customerId)

match customer {
  Some(c) => processCustomer(c)
  None    => return Review("Customer not found")
}
```

---

## Error Handling Rule

Use:

```Galerina
Result<T, Error>
```

for fallible operations.

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

Unhandled errors should be treated as invalid Galerina design.

---

## Decision Rule

For business and security decisions, prefer:

```Galerina
Decision
```

Example:

```Galerina
enum Decision {
  Allow
  Deny
  Review
}
```

Use `Decision` instead of `Bool` when a third state is needed.

Bad:

```Galerina
let allowed: Bool = checkRisk(order)
```

Good:

```Galerina
let decision: Decision = checkRisk(order)
```

---

## Boolean Rule

Use `Bool` only for genuine true/false values.

Do not use booleans for uncertain states.

Good:

```Galerina
let isEnabled: Bool = true
```

Better for risk/security:

```Galerina
enum Decision {
  Allow
  Deny
  Review
}
```

---

## Tri Rule

Use `Tri` for mathematical, signal or model-state 3-way logic.

Example states:

```text
Positive
Neutral
Negative
```

Use `Decision` for business workflows.

Use `Tri` for lower-level ternary or model concepts.

---

## JSON Rule

Galerina is JSON-native but strict.

Preferred:

```Galerina
let order: CreateOrderRequest = json.decode<CreateOrderRequest>(req.body)
```

Allowed when needed:

```Galerina
let raw: Json = req.json()
let eventType: String = raw.path("$.type").asString()
```

Do not make JSON handling loosely typed by default.

---

## JSON Safety Rule

When generating JSON/API examples, include safe defaults where relevant.

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
oversized payloads
deep nesting attacks
duplicate keys
unexpected null
wrong types
missing fields
unsafe number conversion
schema drift
secret leakage
```

---

## API Rule

Galerina should be API-native.

Prefer explicit API contracts.

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

When generating API examples, include:

```text
typed request
typed response
errors where useful
timeout where useful
max body size where useful
handler name
```

---

## Webhook Rule

Webhooks should be secure by default.

A webhook example should usually include:

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

## Secrets Rule

Never compile secrets into output files.

Use:

```Galerina
let apiKey: SecureString = env.secret("API_KEY")
```

Do not use:

```Galerina
let apiKey: String = "real-secret-value"
```

`SecureString` values must not be printed or logged by default.

Bad:

```Galerina
print(apiKey)
```

Good:

```Galerina
log.info("API key loaded", { key: redact(apiKey) })
```

---

## Environment Rule

Runtime configuration should stay outside compiled files.

Use:

```text
.env for local development
.env.example for repository examples
server environment variables for production
container secrets
cloud secrets managers
```

Do not suggest committing real `.env` files.

---

## Compute Block Rule

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

Compute blocks should normally contain:

```text
pure maths
matrix operations
vector operations
tensor operations
model inference
signal processing
```

Do not place I/O inside compute blocks.

Bad:

```Galerina
compute target photonic {
  data = readFile("./data.json")
}
```

Good:

```Galerina
data = readFile("./data.json")

compute target photonic fallback gpu fallback cpu {
  result = model(data)
}
```

---

## Target Rule

Galerina should always preserve CPU compatibility.

Target priority:

```text
CPU binary first
WASM for portability
GPU planning because GPUs exist today
photonic planning for future hardware
ternary simulation for 3-way logic testing
```

Never make photonic hardware required for normal Galerina applications.

---

## Build Output Rule

Use this build output structure unless a smaller example is needed:

```text
build/
├── app.bin
├── app.wasm
├── app.gpu.plan
├── app.photonic.plan
├── app.ternary.sim
├── app.openapi.json
├── app.api-report.json
├── app.target-report.json
├── app.security-report.json
├── app.failure-report.json
├── app.source-map.json
├── app.ai-context.json
└── app.build-manifest.json
```

---

## Source Map Rule

Source maps are essential.

Never remove them from the Galerina concept.

Errors should map back to original `.spore` files.

Example:

```text
Runtime error: PaymentStatus.Unknown was not handled.

Original source:
  app/services/order-service.spore:42:7

Suggestion:
  Add a match branch for Unknown.
```

---

## AI Context Rule

Galerina should generate AI-readable context.

Suggested command:

```bash
Galerina ai-context
```

Suggested outputs:

```text
build/app.ai-context.json
build/app.ai-context.md
```

The AI context should summarise:

```text
project
entry file
source files
routes
webhooks
types
imports
permissions
targets
errors
suggested next actions
```

Purpose:

```text
Reduce AI token usage.
Reduce the need to paste large files.
Make AI debugging easier.
```

---

## AI Explain Rule

Galerina should support:

```bash
Galerina explain --for-ai
```

This should produce compact machine-readable explanations.

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

Do not include secrets in AI output.

---

## Security Report Rule

Galerina should generate:

```text
build/app.security-report.json
```

The security report should include:

```text
security settings
permissions
unsafe usage
secret access
package permissions
webhook security checks
JSON policy checks
API timeout checks
source-map status
target fallback security notes
```

---

## Target Report Rule

Galerina should generate:

```text
build/app.target-report.json
```

The target report should explain:

```text
which targets passed
which targets failed
which targets used fallback
which compute blocks were compatible
which operations could not be accelerated
```

---

## Failure Report Rule

Galerina should generate:

```text
build/app.failure-report.json
```

Failure reports should include:

```text
error type
source file
source line
source column
build stage
target
problem
suggested fix
safe example where possible
```

---

## Build Manifest Rule

Galerina should generate:

```text
build/app.build-manifest.json
```

The manifest should include:

```text
project name
project version
compiler version
build mode
target outputs
source hash
output hash
dependency hashes
created timestamp
```

---

## Deployment Rule

Galerina should support build-once, deploy-many.

Recommended flow:

```text
1. Build once
2. Generate manifest
3. Generate hashes
4. Verify artefact
5. Deploy same artefact to many servers
6. Each server loads its own environment variables
7. Health check each server
8. Roll back if checks fail
```

Do not recommend compiling secrets into the build.

---

## Decompilation Rule

Assume compiled output can be reverse engineered.

Do not treat compiled files as secret.

Use:

```text
external secrets
symbol stripping
separate source maps
build signing
checksums
optional obfuscation
```

But never rely on obfuscation for secret protection.

---

## Licence Rule

Galerina uses the Apache License 2.0.

The repository should include:

```text
LICENSE
LICENCE.md
NOTICE.md
```

When writing licence text:

```text
Use Apache-2.0.
Preserve attribution.
Do not imply forks are official.
Do not claim the licence prevents all similar ideas.
```

---

## Git Documentation Rule

The documentation bundle should include two Git documents:

```text
GIT.md
COMPILED_APP_GIT.md
```

`GIT.md` should cover the Git workflow for the Galerina language repository.

`COMPILED_APP_GIT.md` should cover Git and deployment practices for applications built with Galerina.

---

## Example Quality Rules

Examples should be:

```text
short enough to understand
strictly typed
safe by default
source-map friendly
JSON/API aware where relevant
explicit about errors
explicit about missing values
explicit about target fallback
```

Avoid examples that:

```text
use undefined
use silent null
hide errors
log secrets
place I/O in compute blocks
use loose typing
use booleans for uncertain decisions
ignore webhook security
```

---

## Preferred Example Pattern

For order/payment examples, prefer:

```Galerina
enum PaymentStatus {
  Paid
  Unpaid
  Pending
  Failed
  Refunded
  Unknown
}

enum Decision {
  Allow
  Deny
  Review
}

secure flow processOrder(order: Order) -> Result<Decision, OrderError> {
  match order.payment.status {
    Paid => {
      shipOrder(order)
      return Ok(Allow)
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
}
```

---

## Preferred API Example Pattern

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

secure flow createOrder(req: Request) -> Result<Response, ApiError> {
  let input: CreateOrderRequest = json.decode<CreateOrderRequest>(req.body)

  match validateOrder(input) {
    Ok(order) => return JsonResponse(order)
    Err(error) => return Err(error)
  }
}
```

---

## Preferred Webhook Example Pattern

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

## Tone for Documentation

Use clear technical writing.

Prefer:

```text
short sections
plain explanations
concrete examples
tables where useful
consistent terminology
explicit rules
```

Avoid:

```text
marketing hype
unsupported claims
over-promising hardware support
vague futuristic language without practical use
```

Galerina should be presented as practical first, future-facing second.

---

## Claims to Avoid

Do not claim:

```text
Galerina can do impossible maths before a real backend exists.
Galerina makes all software secure automatically.
Galerina requires photonic hardware.
Galerina already has a real photonic backend.
Galerina prevents all reverse engineering.
Galerina eliminates all AI token usage.
```

Better wording:

```text
Galerina is designed to reduce boilerplate and generate AI-readable context.
Galerina can target normal CPU systems today and plan future accelerator support.
Galerina aims to make safe code easier and unsafe code harder.
```

---

## Current Project Stage

The project is currently:

```text
concept and documentation stage
```

Do not write as if a full compiler already exists unless clearly marked as future design.

Use phrases such as:

```text
should
could
planned
proposed
future version
initial prototype
```

When writing future-facing sections.

---

## AI Assistant TODO

AI assistants can help with:

```text
documentation
syntax examples
grammar drafts
AST design
source-map schema
compiler report schema
AI context schema
security rules
JSON/API examples
webhook examples
target planning examples
Git workflow docs
compiled app deployment docs
```

AI assistants should not:

```text
weaken the core rules
invent unsupported runtime claims
remove practical CPU support
ignore JSON/API use cases
skip security defaults
```

---

## Final AI Instruction

When helping with Galerina, prioritise:

```text
safety
clarity
strict typing
JSON/API usefulness
debuggability
AI-readable reports
CPU compatibility
future accelerator planning
```

The best Galerina answer should make the language more practical today while keeping it ready for future compute targets.
