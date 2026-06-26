# Galerina Concept

Galerina, short for Galerina, is a strict, memory-safe, security-first programming
language concept for modern backend systems and future compute targets.

The core idea is simple:

```text
Write explicit, typed, safe Galerina code once.
Check it with the compiler.
Generate source-mapped outputs and reports.
Run on normal CPU systems first.
Plan future accelerator targets where appropriate.
```

## What Galerina Is

Galerina is intended to be:

```text
strictly typed
memory safe
security-first
JSON-native
API-aware
AI-readable
source-map friendly
CPU-compatible by default
accelerator-aware for pure compute
```

Galerina should be practical before future hardware is common.

## What Galerina Is Not

Galerina core is not:

```text
a full web framework
a CMS
an admin dashboard
a React or Angular clone
a mandatory ORM
a template system
a photonic-only research language
a loose scripting language
```

Application runtime enforcement belongs in the optional Galerina Secure App Kernel.
Full frameworks can build on top of that kernel.

## Layer Model

```text
Galerina Core
  strict types, flows, effects, memory safety, compute planning, compiler reports

Galerina Standard Library
  Json, Xml, SafeHtml, File, Stream, Request, Response, DateTime, Money, SecureString

Galerina Secure App Kernel
  optional runtime layer for APIs, validation, auth, rate limits, jobs and reports

Galerina API Server
  built-in HTTP API server that loads route manifests and calls the app kernel

Full Frameworks
  CMS, admin panels, UI systems, templates, ORM, page builders and frontend adapters
```

Final rule:

```text
Galerina the language defines safety.
Galerina the kernel enforces safe runtime boundaries.
Galerina the API server serves HTTP for kernel-backed APIs.
Frameworks provide opinions and user-facing structure.
```

## Why Galerina Exists

Modern backend applications increasingly depend on:

```text
REST APIs
webhooks
JSON payloads
auth tokens
idempotency
queues
workers
AI model calls
large datasets
source-mapped debugging
secure deployment
multi-target output
```

Existing languages can handle these areas, but much of the safety often lives in
framework conventions, external packages or developer discipline. Galerina aims to
make the core safety contracts explicit, typed and reportable.

## Backend Language Suggestions

Galerina should adopt the safest lessons from other backend languages without copying
their unsafe or framework-specific features.

Highest-value additions:

```text
language editions and compatibility rules
Bool, Tri, Decision and Galerina conversion rules
algebraic variants and exhaustive match
generic constraints, traits or protocols
structured concurrency, cancellation and streams
deterministic resource cleanup
safe compile-time metadata and attributes
Native ABI and foreign-call boundaries
matrix/vector shape rules with scalar fallback
stable diagnostics and AI report schemas
```

These suggestions belong in Galerina core because they affect safety, typing,
compatibility, compilation or AI readability.

## JSON-Native but Strict

Galerina should treat JSON as a first-class data format, but it must not become
loosely typed.

```text
JSON is easy to receive.
JSON is easy to inspect.
JSON is easy to transform.
JSON is easy to output.
Production JSON is decoded into strict Galerina types.
```

Preferred:

```Galerina
let order: CreateOrderRequest = json.decode<CreateOrderRequest>(req.body)
```

Allowed when raw inspection is required:

```Galerina
let raw: Json = req.json()
let eventType: String = raw.path("$.type").asString()
```

Galerina should support streaming JSON, JSON Lines, schema generation, OpenAPI output,
safe redaction, duplicate key policy, depth limits and payload size limits.

## API and Webhook Contracts

Galerina should be API-aware without becoming an API framework.

Galerina core should define:

```text
typed request bodies
typed response bodies
route contracts
webhook contracts
schema generation
OpenAPI generation
idempotency declarations
replay-protection declarations
source-mapped API reports
```

The Secure App Kernel can enforce those contracts at runtime.

The `galerina-framework-api-server` package can serve compiled API route manifests over HTTP by
normalising requests and passing them into the Secure App Kernel. This keeps the
HTTP server separate from Galerina core and keeps auth, validation and typed handler
execution in the kernel.

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

## AI Explanation Mode

Galerina should support:

```bash
Galerina explain --for-ai
```

This command should produce compact, machine-readable explanations of compiler
errors, target failures, security warnings and API contract problems.

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
  "suggestedFix": "Move readFile outside the compute block and pass parsed data into the model."
}
```

The goal is to reduce how much code and context a developer must paste into an
AI assistant.

## Compute Model

Galerina should remain scalar-first for normal backend workflows.

Pure numeric, matrix, vector and model-inference workloads may use compute
blocks:

```Galerina
compute target best verify cpu_reference {
  prefer photonic
  fallback gpu
  fallback cpu

  result = scoreRisk(features)
}
```

I/O, payment actions, database writes, secret access and security decisions
should remain exact CPU-compatible application logic unless an explicit safe
offload pattern is defined.

## Core Principle

Galerina should make safe code easier to write and unsafe code harder to hide.

```text
No undefined.
No silent null.
No hidden errors.
No unsafe memory by default.
No accidental truthy/falsy logic.
No implicit type coercion.
No compiled secrets.
No unreported target fallback.
No runtime error without original source mapping.
```
