# Getting Started with Galerina

This guide explains how to try **Galerina / Galerina** from this repository.

Galerina is a strict, memory-safe, security-first, JSON-native, API-native and
accelerator-aware programming language concept. The repository now includes a
runnable v0.1 Node.js prototype CLI, but it is not a production compiler.

---

## Current Status

Galerina is currently a concept, documentation and v0.1 prototype project.

The repository includes:

```text
documented language rules and design notes
draft grammar and JSON schemas
runnable .spore examples
a Node.js prototype CLI in compiler/galerina.js
lexer, parser, formatter and smoke-test commands
prototype type, target, security, memory and strict-comment diagnostics
development report/documentation generation
placeholder production build artefacts with manifests and hashes
```

CPU output, WebAssembly output and browser JavaScript output are placeholders.
GPU, photonic, ternary and Omni-logic outputs are plans, simulations or
compatibility reports.

---

## Requirements

Use Node.js 18 or newer.

From the repository root:

```bash
node --version
npm --version
node compiler/galerina.js --help
```

No npm install step is required for the current prototype because
`package.json` declares no runtime dependencies.

---

## Quick Start

Run the checked hello example:

```bash
node compiler/galerina.js run examples/hello.spore
```

Expected output:

```text
hello from Galerina
```

Run the main checks:

```bash
npm run check
npm test
npm run fmt:check
```

Build the examples into placeholder artefacts and reports:

```bash
npm run build:examples
npm run verify
```

Generate development reports and docs without production build outputs:

```bash
npm run generate:dev
npm run dev
```

---

## Prototype CLI

Common npm scripts:

```bash
npm run check
npm test
npm run ast
npm run tokens
npm run fmt:check
npm run build:examples
npm run verify
npm run generate:dev
npm run dev
npm run schema
npm run openapi
npm run targets
npm run ai-context
```

Direct CLI commands:

```bash
node compiler/galerina.js init my-galerina-app
node compiler/galerina.js run examples/hello.spore
node compiler/galerina.js run examples/hello.spore --generate --out .build-dev-run
node compiler/galerina.js generate examples --exclude source-map-error.spore --out .build-dev
node compiler/galerina.js dev examples/hello.spore --out .build-dev
node compiler/galerina.js dev examples/hello.spore --watch --out .build-dev
node compiler/galerina.js serve examples --dev
node compiler/galerina.js check examples --exclude source-map-error.spore
node compiler/galerina.js tokens examples/hello.spore
node compiler/galerina.js fmt examples --check
node compiler/galerina.js test examples
node compiler/galerina.js schema examples/api-orders.spore --type CreateOrderRequest
node compiler/galerina.js openapi examples/api-orders.spore
node compiler/galerina.js build examples --exclude source-map-error.spore --out build/examples
node compiler/galerina.js verify build/examples
node compiler/galerina.js targets examples
node compiler/galerina.js ai-context examples --out build/examples
node compiler/galerina.js explain examples/source-map-error.spore --for-ai
```

`dev --watch` is accepted by the prototype, but it currently performs one
checked generate/run cycle and reports that watch mode is planned. `serve
--dev` reports the planned development runtime state; it does not start an HTTP
server yet.

---

## Create a Project

Create a small project:

```bash
node compiler/galerina.js init my-galerina-app
```

Generated structure:

```text
my-galerina-app/
|-- boot.spore
`-- src/
    `-- main.spore
```

Run it from this repository root:

```bash
node compiler/galerina.js run my-galerina-app
```

The generated `boot.spore` includes target declarations, global registry entries,
runtime memory/spill policy, documentation settings, AI guide settings,
manifest settings and required build outputs.

---

## Build Outputs

Compile Mode writes placeholder target artefacts plus JSON/Markdown reports.

```bash
node compiler/galerina.js build examples --exclude source-map-error.spore --out build/examples
```

Typical production build output:

```text
build/examples/
|-- app.bin
|-- app.wasm
|-- app.browser.js
|-- app.gpu.plan
|-- app.photonic.plan
|-- app.ternary.sim
|-- app.omni-logic.sim
|-- app.openapi.json
|-- app.schemas.json
|-- app.api-report.json
|-- app.global-report.json
|-- app.runtime-report.json
|-- app.memory-report.json
|-- app.execution-report.json
|-- app.precision-report.json
|-- app.target-report.json
|-- app.security-report.json
|-- app.failure-report.json
|-- app.source-map.json
|-- app.map-manifest.json
|-- app.tokens.json
|-- app.ai-guide.md
|-- app.ai-context.json
|-- app.ai-context.md
|-- app.build-manifest.json
`-- docs/
    |-- api-guide.md
    |-- webhook-guide.md
    |-- type-reference.md
    |-- global-registry-guide.md
    |-- security-guide.md
    |-- runtime-guide.md
    |-- memory-pressure-guide.md
    |-- run-compile-mode-guide.md
    |-- deployment-guide.md
    |-- ai-summary.md
    `-- docs-manifest.json
```

`app.browser.js` is only emitted when a browser target is declared.

Verify a build:

```bash
node compiler/galerina.js verify build/examples
node compiler/galerina.js verify build/examples/app.build-manifest.json
```

---

## Development Outputs

Development generation writes reports and docs without production binaries or
the production build manifest:

```bash
node compiler/galerina.js generate examples --exclude source-map-error.spore --out .build-dev
```

This is useful when you want generated docs, source maps, AI context and safety
reports while still keeping Compile Mode as the production path.

---

## Explain Diagnostics

`source-map-error.spore` intentionally contains invalid compute-block I/O so the
prototype can demonstrate source-mapped diagnostics.

```bash
node compiler/galerina.js explain examples/source-map-error.spore
node compiler/galerina.js explain examples/source-map-error.spore --for-ai
```

The AI-friendly explanation includes structured fields such as error type,
target, source location, problem and suggested fix.

---

## AI Context

Generate compact context for AI tools:

```bash
node compiler/galerina.js ai-context examples --out build/examples
```

Generated output:

```text
build/examples/app.ai-context.json
build/examples/app.ai-context.md
```

The context summarises source hashes, changed-file status when Git is
available, routes, webhooks, types, flows, strict comments, targets, security
summary, diagnostics and suggested next actions.

---

## Core Language Ideas

Galerina is based on these rules:

```text
strict types
memory safety
security-first defaults
no undefined
no silent null
explicit errors
JSON-native data handling
API-native routing and webhooks
safe concurrency
source-mapped compiled errors
AI-readable compiler reports
multi-target build outputs
```

Source files use the `.spore` extension. The recommended project entry file is
`boot.spore`; simple scripts can expose `secure flow main()`.

---

## Example Script

```Galerina
secure flow main() -> Result<Void, Error> {
  print("hello from Galerina")
  return Ok()
}
```

Short scripts should still use secure defaults:

```text
strict types on
memory safety on
undefined denied
null denied
unhandled errors denied
```

---

## JSON Example

Galerina should be JSON-native but strict.

```Galerina
type CreateOrderRequest {
  customerId: CustomerId
  items: Array<OrderItem>
  currency: Currency
}
```

Prefer typed decoding:

```Galerina
let input: CreateOrderRequest = json.decode<CreateOrderRequest>(req.body)
```

Raw JSON should be used deliberately:

```Galerina
let raw: Json = req.json()
let eventType: String = raw.path("$.type").asString()
```

---

## API Example

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

Generate API contract drafts:

```bash
node compiler/galerina.js schema examples/api-orders.spore --type CreateOrderRequest
node compiler/galerina.js openapi examples/api-orders.spore
```

---

## Webhook Example

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

## Option and Result

Use `Option<T>` for values that may be missing.

```Galerina
let customer: Option<Customer> = findCustomer(customerId)

match customer {
  Some(c) => processCustomer(c)
  None    => return Review("Customer missing")
}
```

Use `Result<T, E>` for operations that can fail.

```Galerina
flow loadOrder(id: OrderId) -> Result<Order, OrderError> {
  let order = database.findOrder(id)

  match order {
    Some(o) => return Ok(o)
    None    => return Err(OrderError.NotFound)
  }
}
```

Do not use `undefined`. Do not rely on silent `null`.

---

## Compute Blocks

Accelerator-aware work should be pure and have a CPU-compatible fallback.

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

Avoid inside compute blocks:

```text
file I/O
network I/O
database access
environment secret access
mutable global state
```

---

## Secrets

Secrets should be loaded as `SecureString` and redacted from generated reports,
documentation and AI context.

```Galerina
let apiKey: SecureString = env.secret("API_KEY")
```

Do not commit real `.env` files, and do not compile real secret values into
target outputs.

---

## Recommended Reading Order

Read:

```text
README.md
docs/README.md
compiler/README.md
examples/README.md
docs/feature-status.md
GETTING_STARTED.md
REQUIREMENTS.md
DESIGN.md
ARCHITECTURE.md
SECURITY.md
COMPILED_APP_GIT.md
```

Then use `docs/README.md` as the index for the detailed language, target,
safety, API, interop and tooling notes.

---

## Final Rule

```text
Run fast while developing.
Generate explanations while checking.
Compile fully before deploying.
```
