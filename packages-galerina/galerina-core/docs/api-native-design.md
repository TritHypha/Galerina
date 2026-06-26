# API-Native Design

Galerina should make APIs a first-class language and compiler concern.

## Goals

```text
typed requests
typed responses
route contracts
webhook contracts
OpenAPI generation
JSON schema generation
timeouts
retries
rate limits
structured diagnostics
```

## Rule

API code should be source-mapped, contract-checked and explainable through generated reports.

## Service, API and Webhook Boundaries

`service`, `api` and `webhook` blocks solve different problems.

```text
service = runtime server boundary
api     = typed HTTP contract boundary
webhook = secured inbound event boundary
```

Use `service` when code owns a listener, port, server lifecycle, health route or mount table.

Use `api` when code defines normal request/response routes with typed requests, typed responses, route parameters, query parameters, errors and OpenAPI output.

Use `webhook` when code receives event callbacks from an external provider and must enforce signature verification, replay protection, idempotency and tight payload limits.

Compiler rules:

```text
Only service blocks may define listen.
API blocks must not define listener ownership.
Webhook blocks must not be treated as general API route groups.
Webhook blocks require security defaults unless explicitly compiled in development mode.
Service blocks may mount api and webhook blocks.
API and webhook blocks must generate report entries with distinct kinds.
```

Runtime positioning:

```text
Galerina Core checks service/api/webhook contracts.
galerina-framework-api-server serves HTTP and loads generated route manifests.
galerina-framework-app-kernel enforces validation, auth, idempotency and typed execution.
```

`galerina-framework-api-server` may be the default implementation for `Galerina serve`, but it remains
an HTTP server package, not a full web framework.

Example relationship:

```Galerina
service ApiServer {
  listen port env.int("APP_PORT", default: 8080)
  mount OrdersApi
  mount PaymentWebhook
}

api OrdersApi {
  POST "/orders" {
    request CreateOrderRequest
    response CreateOrderResponse
    handler createOrder
  }
}

webhook PaymentWebhook {
  path "/webhooks/payment"
  method POST
  idempotency_key json.path("$.id")
  handler handlePaymentWebhook
}
```

## Query Params, Middleware and Auth

API routes should declare query parameters separately from path parameters.

```Galerina
GET "/orders" {
  query {
    status: Option<OrderStatus>
    limit: Int
  }

  response Array<OrderResponse>
  handler listOrders
}
```

Middleware should be named, ordered and reportable.

```Galerina
middleware [
  request_id,
  audit_log,
  rate_limit("orders-list"),
  auth.required(UserSession)
]
```

Authentication hooks should return explicit `Result<AuthContext, AuthError>` values and should not silently attach unaudited global user state.

```Galerina
auth required UserSession using authenticateRequest
```

For modern API auth, routes may declare bearer/JWT/OAuth requirements, scopes,
proof-of-possession and replay protection as contract metadata.

Example:

```Galerina
api AccountApi {
  GET "/account" {
    request AccountRequest
    response AccountResponse
    handler getAccount

    auth {
      provider MainIdentity
      bearer required
      scopes ["account.read"]
    }
  }
}
```

High-risk mutating routes should combine auth with replay protection:

```Galerina
auth {
  bearer required
  dpop required
  scopes ["payments.capture"]
}

idempotency {
  key header "Idempotency-Key"
  ttl 24h
  payload_mismatch "reject"
}
```

Detailed JWT, OAuth, DPoP, mTLS, capability-token and request-proof planning
lives in `docs/auth-token-verification-boundaries.md`.

Rate limits should be source-mapped and included in API/security reports.

```Galerina
rate_limit {
  key request.ip
  limit 100
  window 1m
  on_exceeded TooManyRequests
}
```

## API Data Security and Load Control

API input should be treated as unsafe until it has crossed a controlled
boundary.

Routes may declare body, idempotency, limit, memory and queue policies:

```Galerina
api OrdersApi {
  POST "/orders" {
    request CreateOrderRequest
    response CreateOrderResponse
    handler createOrder

    body {
      content_type "application/json"
      max_size 256kb
      parse_mode "strict"
      unknown_fields "deny"
    }

    limits {
      rate "30/minute"
      max_concurrent 5
      timeout 5s
      memory 32mb
    }
  }
}
```

The handler should receive a typed request value, not raw JSON or unbounded
request bytes.

Detailed API input, content-type, unknown-field, memory-budget, streaming,
queue handoff, backpressure and load-control planning lives in
`docs/api-data-security-and-load-control.md`.

## Duplicate API Detection and Idempotency

Galerina should detect duplicate API structure at check/build time and help control
duplicate side effects at runtime.

Examples of duplicate API problems:

```text
same method/path declared twice
same route name reused
same request/response schema shape duplicated accidentally
same external API client configured more than once
same user request submitted twice
same webhook event replayed
same outbound API payload sent repeatedly by mistake
```

Route conflicts should be source-mapped errors:

```text
API route conflict:
POST /orders is declared more than once.
```

Side-effecting routes should declare idempotency or an explicit reason why it
is not required:

```Galerina
idempotency {
  key header "Idempotency-Key"
  ttl 24h
  conflict "return_previous_response"
  payload_mismatch "reject"
}
```

Detailed duplicate route, duplicate schema, API manifest, idempotency,
webhook duplicate protection and duplicate outbound API planning lives in
`docs/api-duplicate-detection-and-idempotency.md`.

## Generated Client SDK Scope

Generated client SDKs should be contract wrappers, not full application frameworks.

Allowed generated SDK scope:

```text
typed request and response models
route methods
query and path parameter binding
JSON encode/decode helpers
timeout and retry policy metadata
source-map links back to the API contract
```

Out of scope for generated SDKs:

```text
business logic
secret storage
UI code
database access
server middleware implementation
provider-specific auth flows unless declared in the API contract
```
