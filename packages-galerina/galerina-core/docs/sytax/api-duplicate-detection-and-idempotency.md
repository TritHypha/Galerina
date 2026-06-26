# API Duplicate Detection and Idempotency Syntax

Status: Draft.

This file defines syntax direction for duplicate route checks, duplicate API
type warnings, API manifests, idempotency blocks, webhook duplicate protection,
external API duplicate warnings and API duplicate reports.

Galerina should provide syntax, metadata, compiler checks and reports. It should not
become a fixed router, controller framework, middleware stack or API gateway.

---

## Purpose

```text
detect duplicate method/path declarations
detect duplicate route names
warn about duplicate request/response type shapes
declare idempotency for side-effecting routes
declare webhook replay and duplicate event protection
warn about duplicate external API clients
warn about repeated outbound API calls where configured
generate API manifests and duplicate/idempotency reports
```

---

## Grammar Direction

```text
api_policy                 = "api_policy" block
duplicate_routes           = "duplicate_routes" string
duplicate_route_names      = "duplicate_route_names" string
duplicate_type_shapes      = "duplicate_type_shapes" string
duplicate_external_clients = "duplicate_external_clients" string
idempotency_block          = "idempotency" block
idempotency_exception      = "idempotency" string "reason" string
idempotency_key            = "idempotency_key" expression
duplicate_policy           = "duplicate_policy" block
external_api               = "external_api" identifier block
```

---

## Route Idempotency Example

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
      payload_mismatch "reject"
    }
  }
}
```

---

## Policy Example

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
    store "default_cache"
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

## Intentional Duplicate Type Shape

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

## Webhook Duplicate Protection

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

---

## External API Duplicate Policy

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

Intentional same base:

```Galerina
external_api PaymentProviderAdmin
intentionally_same_base_as PaymentProvider {
  base_url env.string("PAYMENT_API_URL")
  purpose "Admin-only payment API operations"
}
```

---

## Security Rules

```text
Same method/path declarations are errors by default.
Duplicate route names should be errors or explicit warnings.
Duplicate type shapes should be warnings unless marked intentional.
Side-effecting POST/PATCH/DELETE routes should declare idempotency or an exception.
Webhook blocks should declare signature verification, replay protection and idempotency keys.
Idempotency requires key source, TTL, conflict behaviour and payload mismatch behaviour.
Idempotency storage belongs to packages/frameworks, not Galerina core.
Outbound duplicate call detection should warn, not block by default.
```

---

## Report Output

Suggested reports:

```text
app.api-manifest.json
app.duplicate-api-report.json
app.idempotency-report.json
app.webhook-report.json
app.security-report.json
app.map-manifest.json
app.ai-guide.md
```

Report fields should include:

```text
route method and path
route source location
handler
request and response types
route conflict diagnostics
duplicate route name diagnostics
similar type shape warnings
idempotency key source
idempotency TTL
conflict mode
payload mismatch mode
webhook replay protection
external API duplicate client warnings
outbound duplicate payload warnings
```

---

## Open Parser and Runtime Work

```text
parse api_policy duplicate settings
parse idempotency blocks and exceptions
parse intentionally_same_shape_as
parse external_api duplicate_policy
parse intentionally_same_base_as
detect duplicate API method/path declarations
detect duplicate route names
detect duplicate API type shapes
recommend idempotency from route effects
check idempotency key, TTL, conflict and payload mismatch settings
check webhook replay/idempotency requirements
warn about duplicate external API clients
emit API manifest, duplicate API and idempotency reports
emit AI guide API duplicate/idempotency summaries
```
