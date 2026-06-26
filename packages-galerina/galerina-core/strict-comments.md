# Galerina Strict Comments

This document describes the proposed **Strict Comments** feature for **Galerina / Galerina**.

Galerina is a strict, memory-safe, security-first, JSON-native, API-native and accelerator-aware programming language concept.

Strict comments are structured, machine-readable comments that improve communication between developers, teams, reviewers, compilers, linters and AI coding assistants.

Prototype status:

```text
v0.1 extracts strict comments into AST, source-map, security and AI-context reports.
v0.1 warns on obvious declaration mismatches.
v0.1 rejects literal secret-looking values in strict comments.
v0.1 does not require strict comments on every helper yet.
```

---

## Summary

Most programming languages support comments, but comments are usually ignored by the compiler.

Galerina should support normal comments, but also introduce **strict comments**.

Strict comments are:

```text
structured
machine-readable
compiler-checkable
AI-readable
security-aware
source-map friendly
useful for documentation
useful for team communication
```

The goal is to reduce the gap between:

```text
what the developer meant
what the comment says
what the code actually does
what an AI assistant understands
what the compiler can verify
```

---

## Core Idea

A normal comment explains code to humans.

Example:

```Galerina
// Creates an order
```

A strict comment explains code to humans, the compiler, tools and AI assistants.

Example:

```Galerina
/// @purpose Creates an order from a validated API request.
/// @input CreateOrderRequest
/// @output Result<CreateOrderResponse, OrderError>
/// @security Requires authenticated user.
/// @effects [database.write, network.outbound]
/// @ai-note Do not bypass payment validation.
secure flow createOrder(input: CreateOrderRequest) -> Result<CreateOrderResponse, OrderError>
effects [database.write, network.outbound] {
  ...
}
```

The compiler or linter should be able to check whether the strict comment matches the code.

---

## Why Strict Comments Matter

Strict comments help with:

```text
team communication
AI-assisted development
security reviews
code reviews
documentation generation
compiler reports
source maps
API reports
AI context reports
onboarding new developers
reducing comment drift
```

---

## Comment Drift

Comment drift happens when a comment says one thing but the code does another.

Example:

```Galerina
/// @effects [database.read]
secure flow createOrder(input: CreateOrderRequest) -> Result<CreateOrderResponse, OrderError>
effects [database.write] {
  ...
}
```

The comment says:

```text
database.read
```

The code declares:

```text
database.write
```

Galerina should warn:

```text
Strict comment mismatch:
Comment says effects [database.read].
Flow declares effects [database.write].

Original source:
  src/services/order-service.spore:12:1

Suggestion:
  Update the strict comment or correct the effect declaration.
```

---

## Existing Similar Ideas

Strict comments are inspired by existing concepts such as:

```text
JSDoc
TSDoc
structured doc comments
Doxygen
doctests
annotations
attributes
design by contract
preconditions and postconditions
```

However, Galerina strict comments are different because they are designed to combine:

```text
structured documentation
compiler/linter checking
security rules
effect checking
API/webhook checking
AI context extraction
source-map reporting
token reduction for AI tools
```

So Galerina strict comments are not just documentation.

They are part of the language’s safety and communication model.

---

## Comment Types

Galerina should support several comment levels.

```text
normal comments
documentation comments
strict comments
AI comments
security comments
```

---

## Normal Comments

Normal comments are ignored by the compiler.

```Galerina
// This is a normal comment
```

Use normal comments for small explanations.

---

## Documentation Comments

Documentation comments explain public types, flows, APIs or modules.

```Galerina
/// Creates a new order.
secure flow createOrder(input: CreateOrderRequest) -> Result<CreateOrderResponse, OrderError> {
  ...
}
```

Documentation comments may be used to generate developer documentation.

---

## Strict Comments

Strict comments use structured tags.

```Galerina
/// @purpose Creates a new order.
/// @input CreateOrderRequest
/// @output Result<CreateOrderResponse, OrderError>
/// @effects [database.write]
secure flow createOrder(input: CreateOrderRequest) -> Result<CreateOrderResponse, OrderError>
effects [database.write] {
  ...
}
```

Strict comments should be checkable.

---

## AI Comments

AI comments give AI assistants safe guidance.

```Galerina
/// @ai-note Do not bypass payment validation.
/// @ai-risk This flow writes to the database and calls an external payment provider.
```

AI comments should be extracted into:

```text
build/app.ai-context.json
build/app.ai-context.md
```

---

## Security Comments

Security comments describe security requirements.

```Galerina
/// @security HMAC must be verified before JSON decoding.
/// @idempotency Required using $.id
/// @max-body-size 512kb
```

Security comments should be checked against the actual API, webhook or flow configuration.

---

## Suggested Strict Comment Tags

Galerina should support a small, clear set of strict comment tags.

```text
@purpose
@summary
@input
@output
@errors
@security
@effects
@permissions
@route
@request
@response
@target
@fallback
@rollback
@rollback-risk
@precision
@verify
@idempotency
@timeout
@max-body-size
@json-policy
@ai-note
@ai-risk
@ai-todo
@test
@owner
@since
```

The required set should stay small.

Too many required tags would make the language annoying to use.

---

## Recommended Required Tags

Strict comments should not be required everywhere.

Recommended rule:

```text
normal internal helper        optional
exported flow                 recommended
secure flow                   required
API route                     required
webhook                       required
compute block                 required
public package interface      required
```

---

## Required for Secure Flows

Secure flows should have strict comments.

Example:

```Galerina
/// @purpose Captures payment for an order.
/// @input Order
/// @output Result<Payment, PaymentError>
/// @security Requires validated order and payment token.
/// @effects [network.outbound, database.write]
/// @ai-risk Do not log payment tokens or SecureString values.
secure flow capturePayment(order: Order) -> Result<Payment, PaymentError>
effects [network.outbound, database.write] {
  ...
}
```

---

## Required for APIs

API declarations should have strict comments.

Example:

```Galerina
/// @purpose Creates a new order.
/// @route POST /orders
/// @request CreateOrderRequest
/// @response CreateOrderResponse
/// @errors [ValidationError, PaymentError]
/// @security Requires authenticated user.
/// @timeout 5s
/// @max-body-size 1mb
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

The compiler or linter should check that:

```text
@request matches request
@response matches response
@errors matches errors
@timeout matches timeout
@max-body-size matches max_body_size
```

---

## Required for Webhooks

Webhook declarations should use strict comments because webhooks are security-sensitive.

Example:

```Galerina
/// @purpose Handles payment provider webhook events.
/// @route POST /webhooks/payment
/// @security HMAC must be verified before JSON decoding.
/// @idempotency Required using $.id
/// @max-body-size 512kb
/// @ai-risk Never process the webhook before signature verification.
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

## Required for Compute Blocks

Compute blocks should include strict comments because target behaviour matters.

Example:

```Galerina
/// @purpose Runs fraud scoring using the best available compute target.
/// @target prefer photonic, fallback gpu, fallback cpu
/// @precision Float16 accepted
/// @verify cpu_reference
/// @ai-note Do not place file, network or database access inside this block.
compute target best verify cpu_reference {
  prefer photonic
  fallback gpu
  fallback cpu

  score = fraudModel(features)
}
```

The target checker should compare the comment with the compute block.

---

## Required for Rollback Workflows

Rollback workflows should include strict comments.

Example:

```Galerina
/// @purpose Completes an order using reversible steps where possible.
/// @rollback Required
/// @rollback-risk Email sending is not reversible.
/// @effects [database.write, network.outbound]
secure flow completeOrder(order: Order) -> Result<Order, OrderError>
effects [database.write, network.outbound] {
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

This helps developers and AI assistants understand the risk.

---

## Compiler and Linter Behaviour

Galerina should provide checks for strict comments.

Possible commands:

```bash
Galerina lint --comments
Galerina check --strict-comments
Galerina explain --for-ai
Galerina ai-context
```

---

## Example: Effect Mismatch

Code:

```Galerina
/// @effects [database.read]
secure flow updateOrder(order: Order) -> Result<Order, OrderError>
effects [database.write] {
  ...
}
```

Warning:

```text
Strict comment mismatch:
@effects says [database.read].
Flow declares [database.write].

Original source:
  src/services/order-service.spore:8:1
```

---

## Example: API Mismatch

Code:

```Galerina
/// @response CreateOrderResponse
api OrdersApi {
  POST "/orders" {
    request CreateOrderRequest
    response OrderResponse
    handler createOrder
  }
}
```

Warning:

```text
Strict comment mismatch:
@response says CreateOrderResponse.
API route declares OrderResponse.

Original source:
  src/routes.spore:3:1
```

---

## Example: Webhook Security Mismatch

Code:

```Galerina
/// @security HMAC required before JSON decoding.
webhook PaymentWebhook {
  path "/webhooks/payment"
  method POST

  handler handlePaymentWebhook
}
```

Error:

```text
Strict comment security mismatch:
Comment requires HMAC verification, but webhook has no HMAC security block.

Original source:
  src/webhooks/payment-webhook.spore:1:1

Suggestion:
  Add security.hmac_header and secret env.secret(...).
```

---

## Example: Idempotency Mismatch

Code:

```Galerina
/// @idempotency Required using $.id
webhook PaymentWebhook {
  path "/webhooks/payment"
  method POST

  security {
    hmac_header "Payment-Signature"
    secret env.secret("PAYMENT_WEBHOOK_SECRET")
  }

  handler handlePaymentWebhook
}
```

Error:

```text
Strict comment mismatch:
@idempotency is required, but webhook has no idempotency_key.

Suggestion:
  Add idempotency_key json.path("$.id")
```

---

## Strict Comments and AI Context

Strict comments should be extracted into AI context reports.

Command:

```bash
Galerina ai-context
```

Output:

```text
build/app.ai-context.json
build/app.ai-context.md
```

Example AI context:

```json
{
  "flow": "handlePaymentWebhook",
  "purpose": "Handles payment provider webhook events.",
  "security": "HMAC must be verified before JSON decoding.",
  "effects": ["network.inbound", "database.write"],
  "idempotency": "Required using $.id",
  "aiRisk": "Never process the webhook before signature verification.",
  "source": "src/webhooks/payment-webhook.spore:1"
}
```

This reduces the amount of code that needs to be pasted into AI tools.

---

## Strict Comments and Token Reduction

Strict comments can reduce AI token use because they provide compact summaries.

Instead of sending an entire file, a developer could send:

```text
app.ai-context.json
app.failure-report.json
app.source-map.json
```

The AI assistant can then understand:

```text
what the flow does
what it accepts
what it returns
what effects it has
what security rules apply
what risks exist
where the source is
```

---

## Strict Comments and Source Maps

Strict comment checks should map back to original `.spore` files.

Example:

```text
Strict comment mismatch:
@output says Result<Order, OrderError>.
Flow returns Result<CreateOrderResponse, OrderError>.

Original source:
  src/services/order-service.spore:14:1
```

This is important when working with compiled output.

---

## Strict Comments and Documentation Generation

Strict comments should be usable for generating documentation.

Example generated documentation:

```text
Flow: createOrder
Purpose: Creates an order from a validated API request.
Input: CreateOrderRequest
Output: Result<CreateOrderResponse, OrderError>
Effects: database.write, network.outbound
Security: Requires authenticated user.
AI Note: Do not bypass payment validation.
```

Possible command:

```bash
Galerina docs
```

---

## Strict Comments and Security Reports

Security-related tags should appear in:

```text
build/app.security-report.json
```

Example:

```json
{
  "strictComments": {
    "secureFlowsDocumented": true,
    "webhooksDocumented": true,
    "mismatches": []
  }
}
```

If mismatches exist:

```json
{
  "strictComments": {
    "mismatches": [
      {
        "file": "src/webhooks/payment-webhook.spore",
        "line": 1,
        "tag": "@security",
        "problem": "HMAC required by comment but missing from webhook declaration."
      }
    ]
  }
}
```

---

## Strict Comments and Code Review

Strict comments help reviewers answer:

```text
What is this flow supposed to do?
What input does it accept?
What output does it return?
What errors can happen?
What side effects does it have?
What security rules apply?
What should AI assistants avoid changing?
```

This is useful for teams and open-source projects.

---

## Strict Comments and Public Packages

Public package interfaces should use strict comments.

Example:

```Galerina
/// @purpose Sends a signed HTTP request.
/// @input SignedRequest
/// @output Result<HttpResponse, HttpError>
/// @effects [network.outbound]
/// @security Redacts Authorization headers from logs.
/// @since 0.1.0
export secure flow sendSignedRequest(req: SignedRequest) -> Result<HttpResponse, HttpError>
effects [network.outbound] {
  ...
}
```

---

## Strict Comments and Tests

Strict comments may define expected tests.

Example:

```Galerina
/// @test rejects unsigned webhook
/// @test rejects replayed webhook
/// @test accepts valid signed webhook
webhook PaymentWebhook {
  ...
}
```

The test runner could warn if required tests are missing.

Example warning:

```text
Strict comment test warning:
@test "rejects replayed webhook" has no matching test.
```

---

## Strict Comments and Ownership

Strict comments may include ownership metadata.

Example:

```Galerina
/// @owner payments-team
/// @since 0.2.0
secure flow capturePayment(order: Order) -> Result<Payment, PaymentError> {
  ...
}
```

This can help larger teams.

Ownership should be optional.

---

## Strict Comments and TODOs

AI-visible TODOs can be structured.

Example:

```Galerina
/// @ai-todo Replace temporary fraud rule with model-backed score.
/// @ai-risk Do not weaken Review fallback.
secure flow fraudDecision(order: Order) -> Decision {
  ...
}
```

The compiler should not fail because of TODOs, but AI context can include them.

---

## Strict Comments and Security Boundaries

Strict comments should be especially useful around security boundaries.

Examples:

```text
API boundary
webhook boundary
database boundary
file system boundary
secret boundary
compute target boundary
package boundary
network boundary
```

These areas should have stronger documentation requirements.

---

## Normal Comments vs Strict Comments

| Comment Type | Checked? | Extracted to Docs? | Extracted to AI Context? | Best Use |
|---|---:|---:|---:|---|
| `// comment` | No | No | No | Small notes |
| `/// doc` | Maybe | Yes | Maybe | Human documentation |
| `/// @tag value` | Yes | Yes | Yes | Strict comments |
| `/// @ai-note` | Maybe | Maybe | Yes | AI guidance |
| `/// @security` | Yes | Yes | Yes | Security intent |

---

## Required vs Optional Tags

Recommended required tags by code type:

| Code Type | Required Tags |
|---|---|
| Internal helper | none |
| Exported flow | `@purpose`, `@output` |
| Secure flow | `@purpose`, `@security`, `@effects` |
| API route | `@purpose`, `@request`, `@response`, `@timeout` |
| Webhook | `@purpose`, `@security`, `@idempotency`, `@max-body-size` |
| Compute block | `@purpose`, `@target`, `@fallback` |
| Public package flow | `@purpose`, `@input`, `@output`, `@effects`, `@since` |

---

## Strict Comment Rules

Galerina should foLOw these rules:

```text
Strict comments must not lie silently.
Strict comments must not contain secrets.
Strict comments should be checked where possible.
Strict comments should be extracted into AI context.
Strict comments should be source-mapped.
Strict comments should not be required for every tiny helper.
Strict comments should be required for high-risk boundaries.
```

---

## Strict Comment Security

Strict comments must not include secret values.

Bad:

```Galerina
/// @security Uses API key sk_live_123456
```

Good:

```Galerina
/// @security Uses env.secret("PAYMENT_API_KEY")
```

Generated AI context should redact sensitive values.

---

## Strict Comments and `Galerina explain --for-ai`

When an error occurs, `Galerina explain --for-ai` should include relevant strict comment context.

Example:

```json
{
  "errorType": "SecurityError",
  "file": "src/webhooks/payment-webhook.spore",
  "line": 22,
  "problem": "Webhook JSON decoded before HMAC verification.",
  "strictComment": {
    "security": "HMAC must be verified before JSON decoding.",
    "aiRisk": "Never process the webhook before signature verification."
  },
  "suggestedFix": "Move JSON decoding after signature verification."
}
```

This helps AI assistants make safer changes.

---

## Possible CLI Commands

Current v0.1 prototype support:

```bash
Galerina check
Galerina ast
Galerina build
Galerina ai-context
Galerina explain --for-ai
```

Planned dedicated strict-comment commands:

```bash
Galerina lint --comments
Galerina check --strict-comments
Galerina docs
```

---

## Example Full Flow

```Galerina
/// @purpose Creates an order from a validated request.
/// @input CreateOrderRequest
/// @output Result<CreateOrderResponse, OrderError>
/// @errors [ValidationError, PaymentError, StockError]
/// @security Requires authenticated user and validated payment state.
/// @effects [database.write, network.outbound]
/// @rollback Required for stock reservation and payment capture.
/// @ai-note Do not bypass payment validation or Review fallback.
export secure flow createOrder(input: CreateOrderRequest) -> Result<CreateOrderResponse, OrderError>
effects [database.write, network.outbound] {
  checkpoint beforeCreateOrder

  let validation = validateOrder(input)

  match validation {
    Ok(validOrder) => {
      reserveStock(validOrder)
      capturePayment(validOrder)

      return Ok(CreateOrderResponse {
        id: validOrder.id
        decision: ALOw
        status: Created
      })
    }

    Err(error) => {
      return Err(error)
    }
  }

} rollback error {
  restore beforeCreateOrder
  releaseStock(input)
  refundPayment(input)

  return Err(error)
}
```

---

## Example Full Webhook

```Galerina
/// @purpose Handles payment provider webhook events.
/// @input Request
/// @output Result<Response, WebhookError>
/// @security HMAC must be verified before JSON decoding.
/// @effects [network.inbound, database.write]
/// @idempotency Required using $.id
/// @max-body-size 512kb
/// @ai-risk Do not process event data before signature verification.
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
effects [network.inbound, database.write] {
  verify PaymentWebhook.signature(req)

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

## Open Questions

```text
Should strict comments be required for all exported flows?
Should strict comments be compiler errors or linter warnings?
Should @ai-note and @ai-risk be aLOwed in production builds?
Should @owner be part of the language or only tooling?
Should strict comments support Markdown?
Should strict comments be stored in source maps?
Should strict comment mismatch fail CI by default?
Should strict comments be generated automatically from code?
Should AI assistants be required to preserve strict comments?
```

---

## Recommended Early Version

For early Galerina, strict comments should begin as a linter and report feature.

Version 0.1:

```text
define strict comment tags
extract strict comments into AST
extract strict comments into source maps
extract strict comments into AI context
include strict comment summaries in security reports
warn on obvious mismatches
fail only when strict comments contain literal secret values
```

Version 0.2:

```text
make strict-comment checking configurable for CI
expand effect mismatch checks
expand API route mismatch checks
expand webhook security mismatch checks
add dedicated Galerina lint --comments command
```

Version 0.3:

```text
support strict comment checks in CI
include strict comments in AI explain output
generate documentation from strict comments
```

---

## Final Principle

Strict comments should make Galerina easier to understand and safer to change.

They should help humans and AI assistants answer:

```text
What is this code meant to do?
What must not be changed?
What security rules apply?
What side effects are expected?
What target behaviour is expected?
What risks should be preserved?
```

The best version of strict comments is not just documentation.

It is checked intent.

Galerina should treat strict comments as a bridge between:

```text
human reasoning
team communication
compiler checking
security review
AI-assisted development
```
