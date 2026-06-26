# API Duplicate Detection and Idempotency Examples

Status: Draft.

These examples show how Galerina should detect duplicate API structure and control
duplicate side effects with idempotency, webhook replay protection and
source-mapped reports.

---

## Good Examples

Idempotent order creation:

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

Intentional non-idempotent analytics route:

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

Intentional duplicate type shape:

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

Webhook duplicate protection:

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

External API duplicate payload warning:

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

---

## Bad Examples

Duplicate route:

```Galerina
api OrdersApi {
  POST "/orders" {
    request CreateOrderRequest
    response CreateOrderResponse
    handler createOrder
  }
}

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
```

Side-effecting route without idempotency:

```Galerina
api PaymentsApi {
  POST "/payments/capture" {
    request CapturePaymentRequest
    response CapturePaymentResponse
    handler capturePayment
  }
}

secure flow capturePayment(req: CapturePaymentRequest) -> Result<CapturePaymentResponse, ApiError>
effects [payment.capture, database.write] {
  ...
}
```

Expected warning:

```text
API idempotency warning:
POST /payments/capture performs side effects but has no idempotency policy.
```

Webhook without replay protection:

```Galerina
webhook PaymentWebhook {
  path "/webhooks/payment"
  method POST
  handler handlePaymentWebhook
}
```

Expected error in strict/release builds:

```text
Webhook security error:
PaymentWebhook is missing signature verification, replay protection and idempotency key.
```

Duplicate external API client:

```Galerina
external_api PaymentProvider {
  base_url env.string("PAYMENT_API_URL")
}

external_api StripeApi {
  base_url env.string("PAYMENT_API_URL")
}
```

Expected warning:

```text
Possible duplicate external API client:
PaymentProvider and StripeApi use the same base URL.
```

---

## Expected Reports

```text
app.api-manifest.json
app.duplicate-api-report.json
app.idempotency-report.json
app.webhook-report.json
app.security-report.json
app.map-manifest.json
app.ai-guide.md
```

Reports should show:

```text
which method/path declarations are unique
which route names conflict
which schemas have similar shapes
which routes declare idempotency
which risky routes are missing idempotency
which webhook routes have replay protection
which external APIs may be duplicates
which duplicate outbound calls were observed or can be warned about
```
