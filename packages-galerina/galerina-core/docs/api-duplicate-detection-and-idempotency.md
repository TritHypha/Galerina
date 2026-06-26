# Galerina API Duplicate Detection and Idempotency

Status: Draft.

Galerina, short for **Galerina**, is a programming language and
compiler/toolchain. Galerina source files use the `.spore` extension.

Example files:

```text
boot.spore
main.spore
api.spore
routes.spore
webhooks.spore
external-apis.spore
```

This document describes how Galerina should help detect duplicate API problems and
declare idempotency contracts without becoming a web framework.

Galerina should not provide a fixed routing framework, controller framework,
middleware stack or API gateway.

Instead, Galerina should provide:

```text
typed API declarations
duplicate route checks
duplicate schema warnings
API manifests
idempotency primitives
webhook replay protection
duplicate outbound API warnings
source-mapped reports
security reports
AI-readable API guidance
```

The optional Galerina Secure App Kernel may enforce idempotency and replay protection
at runtime through configured storage and adapter packages.

Related API input, body policy, load control, rate limiting and memory budget
planning lives in `docs/api-data-security-and-load-control.md`.

---

## Summary

Duplicate API problems can happen in several ways.

Examples:

```text
same route declared twice
same method and path with different handlers
same request/response schema duplicated under different names
same external API client configured more than once
same user request submitted twice
same payment request processed twice
same webhook event received twice
same queue event replayed
same API version exposed with conflicting schema
```

Galerina should help detect these problems at check/build time and reduce runtime
duplicate side effects through idempotency and replay protection.

---

## Core Principle

```text
Galerina core should not be an API framework.

Galerina should provide language/toolchain checks that make APIs safer to build.
The Secure App Kernel may enforce the checked contracts at runtime.
```

Final rule:

```text
Duplicate API structure should be detected by Galerina.
Duplicate API behaviour should be controlled by idempotency, replay protection and reports.
Actual routing remains framework/package territory.
```

---

## 1. What Belongs in Galerina

Galerina should support:

```text
API declaration syntax
typed request/response declarations
duplicate method/path checks
duplicate API name checks
duplicate schema shape warnings
idempotency declarations
webhook replay protection declarations
external API duplicate-call warnings
API manifest generation
source-mapped API reports
security report integration
AI guide integration
```

These are language/toolchain features.

---

## 2. What Should Stay in Frameworks or Packages

Galerina should not hard-code:

```text
a fixed router
a controller framework
middleware stacks
request lifecycle hooks
API gateway UI
admin route dashboards
OpenAPI hosting UI
framework-specific decorators
Express/Fastify/Laravel-style routing systems
```

These should be packages or frameworks built on top of Galerina.

Galerina should provide the safe metadata and checks those tools can use.

---

## 3. Duplicate API Meanings

The phrase "duplicate API" can mean several different things.

Galerina should distinguish them clearly.

| Duplicate Type | Meaning | Galerina Behaviour |
|---|---|---|
| Duplicate route | Same HTTP method and path declared twice | Error |
| Duplicate route name | Same API route name used twice | Error or warning |
| Duplicate schema shape | Two types have same fields but different names | Warning |
| Duplicate external client | Same external API configured more than once | Warning |
| Duplicate request | Same user/API request submitted twice | Idempotency |
| Duplicate webhook | Same provider event delivered more than once | Replay protection |
| Duplicate API version | Same route exposed in conflicting versions | Warning or error |

---

## 4. Duplicate Route Detection

If two files declare the same method and path, Galerina should detect it.

Example:

```Galerina
api OrdersApi {
  POST "/orders" {
    request CreateOrderRequest
    response CreateOrderResponse
    handler createOrder
  }
}
```

Conflicting route:

```Galerina
api AdminOrdersApi {
  POST "/orders" {
    request AdminCreateOrderRequest
    response AdminCreateOrderResponse
    handler adminCreateOrder
  }
}
```

Expected error:

```text
API route conflict:
POST /orders is declared more than once.

First:
  src/api/orders.spore:4

Second:
  src/api/admin-orders.spore:6

Suggestion:
  Rename the route, version it, or merge the handlers.
```

This is a compiler/check-time feature.

---

## 5. API Manifest

Galerina should generate a complete API manifest.

Suggested output:

```text
build/app.api-manifest.json
```

Example:

```json
{
  "routes": [
    {
      "method": "POST",
      "path": "/orders",
      "handler": "createOrder",
      "source": "src/api/orders.spore:4",
      "request": "CreateOrderRequest",
      "response": "CreateOrderResponse",
      "idempotency": true
    }
  ],
  "duplicates": []
}
```

The API manifest can be used by:

```text
framework adapters
API gateways
OpenAPI generators
documentation generators
AI coding assistants
security reports
test generators
```

---

## 6. Duplicate Schema Warnings

Galerina should detect request/response types that have the same shape but different
names.

Example:

```Galerina
type CreateCustomerRequest {
  name: String
  email: Email
}
```

and:

```Galerina
type NewCustomerRequest {
  name: String
  email: Email
}
```

Galerina should warn:

```text
Possible duplicate API type:
CreateCustomerRequest and NewCustomerRequest have the same shape.

Suggestion:
  Reuse one type or mark them as intentionally separate.
```

This should usually be a warning, not an error.

Reason:

```text
Some types intentionally share the same shape but mean different things.
```

Example of intentional separation:

```Galerina
type BillingAddress {
  line1: String
  postcode: String
}

type DeliveryAddress
intentionally_same_shape_as BillingAddress {
  line1: String
  postcode: String
}
```

---

## 7. Idempotency

Idempotency prevents duplicate side effects.

Duplicate requests can happen because:

```text
user double-clicks submit
browser retries a request
mobile app retries after timeout
load balancer retries
network connection drops
payment request is retried
queue message is replayed
```

Galerina should support idempotency declarations for unsafe or side-effecting routes.

Example:

```Galerina
api OrdersApi {
  POST "/orders" {
    request CreateOrderRequest
    response CreateOrderResponse
    handler createOrder

    idempotency {
      key header "Idempotency-Key"
      ttl 24h
      conflict "return_previous_response"
    }
  }
}
```

Meaning:

```text
If the same Idempotency-Key is received again within 24 hours,
Galerina/framework should not create a second order.
```

---

## 8. Idempotency Conflict Modes

Galerina should support different conflict modes.

```text
return_previous_response
reject_duplicate
hold_for_review
raise_error
```

Example:

```Galerina
idempotency {
  key header "Idempotency-Key"
  ttl 24h
  conflict "return_previous_response"
}
```

For risky operations:

```Galerina
idempotency {
  key header "Idempotency-Key"
  ttl 24h
  conflict "hold_for_review"
}
```

---

## 9. Idempotency Report

Galerina should generate an idempotency report.

Suggested output:

```text
build/app.idempotency-report.json
```

Example:

```json
{
  "idempotencyReport": {
    "routes": [
      {
        "route": "POST /orders",
        "source": "src/api/orders.spore:4",
        "key": "header:Idempotency-Key",
        "ttl": "24h",
        "conflict": "return_previous_response"
      }
    ],
    "missingRecommendedIdempotency": []
  }
}
```

---

## 10. Routes That Should Usually Have Idempotency

Galerina should recommend idempotency for routes such as:

```text
POST /orders
POST /payments
POST /bookings
POST /subscriptions
POST /uploads/complete
POST /account/create
PATCH routes that change important state
DELETE routes that remove important state
webhook routes
```

Example warning:

```text
API idempotency warning:
POST /orders performs database.write but has no idempotency policy.

Source:
  src/api/orders.spore:4

Suggestion:
  Add an idempotency block or mark as intentionally non-idempotent.
```

Allow intentional exception:

```Galerina
api AnalyticsApi {
  POST "/analytics/event" {
    request AnalyticsEvent
    response AnalyticsResponse
    handler recordAnalyticsEvent

    idempotency "not_required"
    reason "Analytics events may intentionally be recorded multiple times."
  }
}
```

---

## 11. Webhook Duplicate Protection

Webhooks are often delivered more than once by providers.

Galerina should support webhook replay protection and idempotency.

Example:

```Galerina
webhook PaymentWebhook {
  path "/webhooks/payment"
  method POST

  security {
    hmac_header "Payment-Signature"
    secret env.secret("PAYMENT_WEBHOOK_SECRET")
    replay_protection true
    max_age 5m
  }

  idempotency_key json.path("$.id")

  handler handlePaymentWebhook
}
```

This means:

```text
verify the webhook signature
reject old events
prevent replay
do not process the same event id twice
```

Webhook duplicate error example:

```text
Webhook duplicate blocked:
Event id has already been processed.

Webhook:
  PaymentWebhook

Event id:
  evt_123

Source:
  src/api/webhooks.spore:3

Action:
  Previous successful result returned.
```

---

## 12. Duplicate External API Client Detection

A project may accidentally configure the same external API more than once.

Example:

```Galerina
external_api PaymentProvider {
  base_url env.string("PAYMENT_API_URL")
}
```

and:

```Galerina
external_api StripeApi {
  base_url env.string("PAYMENT_API_URL")
}
```

Galerina should warn:

```text
Possible duplicate external API client:
PaymentProvider and StripeApi use the same base URL.

Suggestion:
  Reuse one external_api declaration or mark as intentionally separate.
```

Allow explicit separation:

```Galerina
external_api PaymentProviderAdmin
intentionally_same_base_as PaymentProvider {
  base_url env.string("PAYMENT_API_URL")
  purpose "Admin-only payment API operations"
}
```

---

## 13. Duplicate Outbound API Call Detection

Sometimes an app calls the same external API repeatedly by mistake.

Galerina could support outbound duplicate detection.

Example:

```Galerina
external_api PaymentProvider {
  base_url env.string("PAYMENT_API_URL")

  duplicate_policy {
    detect_same_payload true
    window 10s
    action "warn"
  }
}
```

Warning:

```text
Duplicate outbound API warning:
Same payload sent to PaymentProvider.capture 3 times in 10 seconds.

Source:
  src/payments/capture.spore:22

Suggestion:
  Check retry logic or add idempotency key.
```

This should usually be a warning because repeated outbound calls may be valid.

---

## 14. API Version Conflict Checks

Galerina should support clear API versioning metadata.

Example:

```Galerina
api OrdersApi version "v1" {
  POST "/v1/orders" {
    request CreateOrderRequestV1
    response CreateOrderResponseV1
    handler createOrderV1
  }
}
```

```Galerina
api OrdersApi version "v2" {
  POST "/v2/orders" {
    request CreateOrderRequestV2
    response CreateOrderResponseV2
    handler createOrderV2
  }
}
```

Galerina should warn if different versions accidentally expose the same path without
version separation.

Example warning:

```text
API version warning:
OrdersApi v1 and OrdersApi v2 both expose POST /orders.

Suggestion:
  Use explicit versioned paths, headers, or mark this as intentional.
```

---

## 15. API Policy in `boot.spore`

Example policy:

```Galerina
api_policy {
  duplicate_routes "error"
  duplicate_route_names "error"
  duplicate_type_shapes "warn"
  duplicate_external_clients "warn"

  idempotency {
    recommend_for [POST, PATCH, DELETE]
    require_for [payments, orders, bookings, webhooks]
    default_ttl 24h
  }

  webhooks {
    require_signature true
    require_replay_protection true
    require_idempotency_key true
    max_age 5m
  }

  outbound_api {
    duplicate_payload_detection "warn"
    duplicate_window 10s
  }

  reports {
    api_manifest true
    duplicate_api_report true
    idempotency_report true
    webhook_report true
    security_report true
    ai_guide true
  }
}
```

---

## 16. Duplicate API Report

Suggested output:

```text
build/app.duplicate-api-report.json
```

Example:

```json
{
  "duplicateApiReport": {
    "status": "warning",
    "routeConflicts": [],
    "duplicateRouteNames": [],
    "similarTypes": [
      {
        "typeA": "CreateCustomerRequest",
        "typeB": "NewCustomerRequest",
        "sourceA": "src/api/customers.spore:3",
        "sourceB": "src/api/users.spore:8",
        "severity": "warning",
        "recommendation": "Reuse one type or mark intentionally separate."
      }
    ],
    "duplicateExternalClients": []
  }
}
```

---

## 17. Security Report Integration

The main security report should include API duplicate/idempotency checks.

Example:

```json
{
  "securityReport": {
    "apiSafety": {
      "duplicateRoutes": "none",
      "idempotency": {
        "requiredRoutesMissing": [],
        "recommendedRoutesMissing": [
          {
            "route": "POST /contact",
            "source": "src/api/contact.spore:4",
            "severity": "info"
          }
        ]
      },
      "webhooks": {
        "signatureRequired": true,
        "replayProtectionRequired": true,
        "missingReplayProtection": []
      }
    }
  }
}
```

---

## 18. AI Guide Integration

Generated AI guide section:

```markdown
## API Duplicate and Idempotency Rules

Duplicate route policy:
- Duplicate method/path declarations are errors.
- Duplicate route names are errors.
- Duplicate request/response shapes are warnings.

Idempotency:
- Required for orders, payments, bookings and webhooks.
- Recommended for POST, PATCH and DELETE routes.
- Default TTL: 24h.

Webhook rules:
- Signature verification required.
- Replay protection required.
- Idempotency key required.

AI note:
Do not create another POST `/orders` route.
Do not add payment/order/webhook routes without idempotency.
```

---

## 19. Map Manifest Integration

Example:

```json
{
  "apiRoutes": [
    {
      "method": "POST",
      "path": "/orders",
      "handler": "createOrder",
      "source": "src/api/orders.spore:4",
      "request": "CreateOrderRequest",
      "response": "CreateOrderResponse",
      "idempotency": {
        "key": "header:Idempotency-Key",
        "ttl": "24h"
      }
    }
  ],
  "webhooks": [
    {
      "name": "PaymentWebhook",
      "method": "POST",
      "path": "/webhooks/payment",
      "source": "src/api/webhooks.spore:3",
      "signatureRequired": true,
      "replayProtection": true,
      "idempotencyKey": "json.path:$.id"
    }
  ]
}
```

---

## 20. Runtime Behaviour

At runtime, framework/package adapters should use Galerina metadata to enforce:

```text
route uniqueness
idempotency key storage
previous response replay
duplicate webhook rejection
webhook replay protection
duplicate outbound API warnings
```

Galerina itself should generate the rules and reports.

The framework/package implements the actual runtime storage and routing.

---

## 21. Storage for Idempotency

Idempotency requires storage.

Possible storage backends:

```text
database table
NoSQL collection
Redis/cache
key-value store
queue/event store
provider-specific idempotency system
```

Galerina should define the rule, not force the storage engine.

Example config:

```Galerina
api_policy {
  idempotency {
    store "default_cache"
    default_ttl 24h
  }
}
```

Framework/package territory:

```text
Redis implementation
database table implementation
cache implementation
cleanup job
admin UI
```

---

## 22. Idempotency Key Safety

Galerina should validate idempotency key settings.

Recommended checks:

```text
key source exists
TTL is defined
conflict behaviour is defined
storage backend is declared
route is side-effecting
response replay behaviour is clear
payload mismatch behaviour is clear
```

Payload mismatch example:

```text
Same Idempotency-Key used with different request body.
```

Suggested policy:

```Galerina
idempotency {
  key header "Idempotency-Key"
  ttl 24h
  conflict "return_previous_response"
  payload_mismatch "reject"
}
```

---

## 23. API Effects and Idempotency

Galerina can use effects to recommend idempotency.

Example:

```Galerina
secure flow createOrder(req: Request) -> Result<Response, ApiError>
effects [network.inbound, database.write] {
  ...
}
```

Because this has:

```text
network.inbound
database.write
```

Galerina can warn if the route has no idempotency policy.

Side-effecting effects:

```text
database.write
database.update
database.delete
queue.write
event.publish
object.write
email.send
payment.capture
subscription.create
```

These should trigger idempotency recommendations.

---

## 24. Comparison With Other Languages

Most existing general-purpose languages do not provide this as a language
feature.

For example:

```text
Runtimes without route manifests do not natively detect duplicate API routes or require idempotency.
PHP does not natively detect duplicate API routes or require idempotency.
General-purpose runtimes do not natively detect duplicate API routes or require idempotency.
JavaScript does not natively detect duplicate API routes or require idempotency.
```

Frameworks and services may provide parts of this.

Examples:

```text
web frameworks may detect route conflicts
OpenAPI tools may detect duplicate operation IDs
payment APIs may support idempotency keys
webhook providers may recommend replay protection
API gateways may provide route reports
```

Galerina's advantage should be:

```text
the compiler/toolchain can check API declarations consistently
the reports are source-mapped back to .spore files
security/idempotency guidance is generated automatically
AI tools can understand the API map
```

---

## 25. Non-Goals

Galerina API duplicate support should not:

```text
be a full web framework
provide a fixed router implementation
provide a fixed controller pattern
provide a fixed API gateway
provide an admin route dashboard
force one idempotency storage backend
make every POST route idempotent by force
block intentionally duplicate type shapes without override
silently process duplicate webhooks
hide duplicate outbound calls
```

---

## 26. Open Questions

```text
Should duplicate route names be errors or warnings?
Should duplicate type shapes be warnings only?
Should idempotency be required for all POST routes or only risky routes?
Should PATCH and DELETE require idempotency by default?
Should webhooks always require replay protection?
Should idempotency storage be declared in boot.spore?
Should payload mismatch reject by default?
Should duplicate outbound API detection be runtime-only or also static where possible?
Should the API manifest generate OpenAPI directly or feed an OpenAPI package?
```

---

## Recommended Early Version

Version 0.1:

```text
API manifest generation
duplicate method/path route detection
duplicate route name detection
source-mapped API route errors
duplicate type shape warnings
```

Version 0.2:

```text
idempotency declarations
idempotency reports
effect-based idempotency recommendations
payload mismatch policy
```

Version 0.3:

```text
webhook replay protection declarations
webhook idempotency keys
webhook security report integration
```

Version 0.4:

```text
external API duplicate client warnings
duplicate outbound API call warnings
API version conflict checks
AI guide API safety summary
```

---

## Final Principle

Galerina should make API duplication and duplicate side effects visible.

Final rule:

```text
Detect duplicate routes.
Warn about duplicate schemas.
Require or recommend idempotency for risky side effects.
Protect webhooks from replay.
Warn about duplicate outbound calls.
Generate API manifests.
Map every warning back to .spore source.
Leave actual routing and storage implementation to frameworks/packages.
```
