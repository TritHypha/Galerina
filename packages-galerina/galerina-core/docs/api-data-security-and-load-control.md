# Galerina API Data Security and Load Control

Status: Draft.

Galerina, short for **Galerina**, is a programming language and
compiler/toolchain. Galerina source files use the `.spore` extension.

Example files:

```text
boot.spore
main.spore
api.spore
routes.spore
security.spore
data-policy.spore
load-policy.spore
```

This document builds on:

```text
API duplicate detection
idempotency
webhook replay protection
safe data access
rate limits
queues
memory safety
compute auto
```

Detailed duplicate route, duplicate schema, API manifest, idempotency, webhook
replay and duplicate outbound API planning lives in
`docs/api-duplicate-detection-and-idempotency.md`.

It describes how Galerina could define strong API data security and safe request
processing contracts without becoming a web framework or load balancer.

Galerina should not be a full web framework.

Galerina core should provide language/toolchain primitives that help the optional Galerina
Secure App Kernel, frameworks and runtime adapters process API data safely,
identify types correctly, protect memory and handle large numbers of
simultaneous requests.

The Secure App Kernel is the runtime enforcement layer for these contracts when
an application opts into a galerina-managed request lifecycle.

`galerina-framework-api-server` is the built-in HTTP API server package for that lifecycle. It
should own HTTP listening, request normalisation, route manifest loading,
server-level body/timeout limits, safe response writing and server reports. It
should delegate typed decoding, auth, idempotency, rate-limit policy and handler
execution to the Secure App Kernel.

---

## Summary

APIs receive data from many sources:

```text
browsers
mobile apps
servers
webhooks
third-party APIs
bots
malicious clients
unknown clients
```

Galerina should assume API input is unsafe until proven otherwise.

Galerina should support:

```text
typed request contracts
content-type validation
safe body parsing
schema validation
type detection
unknown-field policy
size limits
streaming request bodies
per-route memory budgets
rate limits
IP-aware throttling
user-aware throttling
idempotency
backpressure
queue handoff
load distribution hints
worker pool limits
connection pool limits
security reports
memory reports
API reports
```

Core rule:

```text
Do not trust API input.
Decode into strict types.
Limit memory.
Limit concurrency.
Queue or reject overload safely.
Report everything.
```

---

## 1. Scope

This document covers Galerina language/toolchain support for API request safety.

It does not define a full framework.

Galerina should provide:

```text
Request
Response
ApiError
typed API declarations
request body policies
safe decoders
validation rules
effects
rate-limit declarations
memory budgets
queue handoff declarations
load-control policies
reports
source maps
AI guide summaries
```

Packages and frameworks should provide:

```text
actual HTTP server implementation
router implementation
middleware stack
load balancer integration
API gateway integration
admin dashboard
rate-limit storage backend
distributed cache backend
request analytics UI
```

The default built-in HTTP server implementation is expected to live in
`packages-galerina/galerina-framework-api-server/`. External framework integrations should live in
adapter packages rather than Galerina core.

Galerina should provide the rules, metadata and safety checks. Frameworks/packages
should implement the runtime details.

---

## 2. Core API Security Principle

```text
Every API request must pass through a controlled boundary before application logic sees it.
```

That boundary should check:

```text
method
route
content type
body size
schema
field types
unknown fields
malformed input
authentication
authorisation
rate limit
memory budget
idempotency
```

Only after that should the request reach a handler.

---

## 3. API Request Pipeline

Recommended Galerina request pipeline:

```text
1. Accept request
2. Identify client source safely
3. Check method and route policy
4. Check rate limits
5. Check content length and body limits
6. Validate content type
7. Decode body safely
8. Validate schema/type
9. Reject unknown unsafe fields
10. Apply idempotency/replay protection
11. Pass typed value to handler
12. Stream or queue heavy work
13. Return typed response
14. Report route, memory, errors and decisions
```

---

## 4. API Declaration Example

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

    idempotency {
      key header "Idempotency-Key"
      ttl 24h
      conflict "return_previous_response"
      payload_mismatch "reject"
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

This tells Galerina:

```text
this route accepts JSON
body size is limited
unknown fields are denied
duplicate requests are controlled
rate, concurrency and memory limits apply
```

---

## 5. Typed Request Contracts

API data should decode into typed request values.

Example:

```Galerina
type CreateOrderRequest {
  customerId: CustomerId
  items: Array<OrderItem>
  currency: CurrencyCode
}

type OrderItem {
  productId: ProductId
  quantity: Int min 1 max 100
}
```

Handler:

```Galerina
secure flow createOrder(input: CreateOrderRequest) -> Result<CreateOrderResponse, ApiError>
effects [database.write] {
  let orderId: OrderId = Orders.create(input)?

  return Ok(CreateOrderResponse {
    orderId: orderId
  })
}
```

The handler receives `CreateOrderRequest`, not raw JSON.

---

## 6. Request Body Decoding

Galerina should support safe decoders for common API body types:

```text
JSON
XML
form-urlencoded
multipart form data
plain text
binary stream
file upload
```

Example:

```Galerina
secure flow decodeOrderRequest(req: Request) -> Result<CreateOrderRequest, ApiError>
effects [network.inbound] {
  return req.decodeJson<CreateOrderRequest>()?
}
```

Decoder rules:

```text
reject malformed input
enforce max size
enforce content type
enforce schema
enforce field types
reject unknown fields when configured
return typed errors
```

---

## 7. Content-Type Validation

Galerina should not trust the body just because a client says it is JSON.

Policy:

```Galerina
api_policy {
  request_bodies {
    require_content_type true
    reject_mismatch true
    sniffing "limited_safe"
  }
}
```

Example error:

```text
API body error:
Content-Type says application/json but body is not valid JSON.

Route:
  POST /orders

Source:
  src/api/orders.spore:4
```

---

## 8. Type Identification

Galerina should help identify what data is being received.

For example, an API may receive:

```text
JSON object
JSON array
XML document
HTML fragment
text
image
audio
video
PDF
CSV
binary file
```

Galerina should support a safe classifier:

```Galerina
type ApiPayloadKind {
  JsonObject
  JsonArray
  XmlDocument
  HtmlFragment
  Text
  Image
  Audio
  Video
  Pdf
  Csv
  Binary
  Unknown
}
```

Example:

```Galerina
secure flow identifyPayload(req: Request) -> Result<ApiPayloadKind, ApiError>
effects [network.inbound] {
  return api.identifyPayload(req.body, req.headers)?
}
```

Rule:

```text
Identification helps route validation.
Identification should not bypass explicit route policy.
```

A route expecting JSON must still reject an image, even if Galerina correctly
identifies it as an image.

---

## 9. Strict JSON Handling

Recommended JSON policy:

```Galerina
json_policy {
  parse_mode "strict"
  unknown_fields "deny"
  duplicate_keys "deny"
  max_depth 64
  max_nodes 100000
  max_string_length 64kb
  number_policy "typed"
}
```

Galerina should reject:

```text
malformed JSON
duplicate keys
excessive nesting
overly large strings
unexpected fields
wrong value types
unsafe number coercion
```

Example:

```json
{
  "customerId": "123",
  "items": [],
  "isAdmin": true
}
```

If `isAdmin` is not in the request type:

```text
API schema error:
Unknown field `isAdmin` is not allowed.

Route:
  POST /orders

Request type:
  CreateOrderRequest
```

---

## 10. Type Coercion Rules

Galerina should avoid unsafe automatic coercion.

Bad automatic behaviour:

```text
"123" silently becomes Int
"false" silently becomes Bool
null silently becomes empty string
```

Recommended:

```Galerina
api_policy {
  coercion {
    string_to_int "deny_by_default"
    string_to_bool "deny_by_default"
    null_to_default "deny"
    explicit_cast_required true
  }
}
```

If explicit conversion is needed:

```Galerina
let quantity: Int = Int.parse(input.quantityText)?
```

---

## 11. API Error Types

Galerina should use typed API errors.

```Galerina
error ApiError {
  InvalidContentType
  BodyTooLarge
  MalformedJson
  SchemaMismatch
  UnknownField
  RateLimited
  TooManyConcurrentRequests
  Timeout
  MemoryLimitExceeded
  PermissionDenied
  DuplicateRequest
  ReplayDetected
  QueueFull
}
```

Example:

```Galerina
secure flow handleApiError(error: ApiError) -> Response {
  match error {
    BodyTooLarge   => return JsonResponse({ "error": "body_too_large" }, status: 413)
    RateLimited    => return JsonResponse({ "error": "rate_limited" }, status: 429)
    SchemaMismatch => return JsonResponse({ "error": "invalid_request" }, status: 400)
    _ => return JsonResponse({ "error": "request_failed" }, status: 400)
  }
}
```

---

## 12. IP-Aware Rate Limiting

Galerina should support IP-aware rate limits, but with proxy safety.

Example:

```Galerina
api_policy {
  client_identity {
    source_ip {
      trust_proxy_headers false
    }

    trusted_proxies [
      "10.0.0.0/8"
    ]

    forwarded_for {
      allow_only_from_trusted_proxies true
    }
  }

  rate_limits {
    per_ip {
      max_requests 120
      window 1m
    }
  }
}
```

Important rule:

```text
Do not trust X-Forwarded-For unless the request came through a trusted proxy.
```

---

## 13. User-Aware and Route-Aware Rate Limits

IP rate limits are not enough.

Galerina should also support:

```text
per IP
per authenticated user
per route
per API key
per organisation/account
per webhook provider
global route limit
global app limit
```

Example:

```Galerina
api_policy {
  rate_limits {
    route "POST /orders" {
      per_ip "30/minute"
      per_user "60/minute"
      global "1000/minute"
      burst 10
    }

    route "POST /login" {
      per_ip "10/minute"
      per_account "5/minute"
      burst 3
    }
  }
}
```

---

## 14. Rate Limit Algorithms

Galerina can expose policy names without hard-coding the storage implementation.

Recommended algorithms:

```text
token_bucket
leaky_bucket
fixed_window
sliding_window
adaptive
```

Example:

```Galerina
rate_limit {
  algorithm "token_bucket"
  refill 10 per 1s
  capacity 30
}
```

Framework/package implements the actual storage:

```text
in-memory dev store
Redis
database
distributed cache
API gateway
edge provider
```

---

## 15. Concurrency Limits

Rate limits control frequency.

Concurrency limits control how many requests run at the same time.

Example:

```Galerina
api_policy {
  concurrency {
    global_max 1000

    route "POST /orders" {
      max_concurrent 50
    }

    route "POST /video/process" {
      max_concurrent 3
      overflow "queue"
    }
  }
}
```

This prevents memory overload from many simultaneous heavy requests.

---

## 16. Memory Budgets Per Route

Each route should have a memory budget.

Example:

```Galerina
api OrdersApi {
  POST "/orders" {
    request CreateOrderRequest
    response CreateOrderResponse
    handler createOrder

    memory {
      max_request_body 256kb
      max_decoded_body 1mb
      max_handler_memory 32mb
      reject_on_exceed true
    }
  }
}
```

Large media endpoints need different policies:

```Galerina
api UploadApi {
  POST "/files/upload" {
    request FileUploadRequest
    response FileUploadResponse
    handler uploadFile

    body {
      mode "stream"
      max_size 100mb
    }

    memory {
      max_buffer 2mb
      stream_to_object_store true
    }
  }
}
```

---

## 17. Streaming Request Bodies

Large requests should stream instead of loading into memory.

Bad:

```Galerina
let body = req.body()
```

Better:

```Galerina
secure flow uploadFile(req: Request) -> Result<Response, ApiError>
effects [network.inbound, object.write] {
  stream input = req.bodyStream(max_buffer: 2mb)

  let objectRef: ObjectRef = objectStore.uploads.writeStream(input)?

  return JsonResponse({
    objectId: objectRef.id
  })
}
```

Memory benefit:

```text
request body is not fully loaded
fixed buffer size
backpressure can apply
object storage receives chunks
```

---

## 18. Backpressure

Galerina should support backpressure when the system is overloaded.

Example:

```Galerina
api_policy {
  backpressure {
    enabled true

    when {
      memory_above "80%"
      route_concurrency_above "configured_limit"
      queue_depth_above 10000
    }

    action "queue_or_reject"

    reject_response {
      status 429
      message "System busy. Try again later."
    }
  }
}
```

Behaviour:

```text
normal load -> process now
high load -> queue if safe
dangerous load -> reject with 429/503
```

---

## 19. Queue Handoff for Heavy Work

Heavy API tasks should be queued.

Good candidates:

```text
video processing
audio transcription
image analysis
large imports
bulk database updates
embedding generation
search indexing
large exports
translation jobs
```

Example:

```Galerina
api VideoApi {
  POST "/video/process" {
    request VideoProcessRequest
    response QueuedJobResponse
    handler queueVideoProcess

    body {
      mode "stream"
      max_size 2gb
    }

    queue {
      target "video_jobs"
      response "accepted"
    }
  }
}
```

Handler:

```Galerina
secure flow queueVideoProcess(req: Request) -> Result<QueuedJobResponse, ApiError>
effects [network.inbound, object.write, queue.write] {
  let upload: ObjectRef = objectStore.videos.writeStream(req.bodyStream(max_buffer: 8mb))?

  let jobId: JobId = queue.video_jobs.dispatch(ProcessVideoFile {
    objectRef: upload
  })?

  return Ok(QueuedJobResponse {
    status: "queued"
    jobId: jobId
  })
}
```

---

## 20. Load Distribution

Galerina should not be a load balancer, but it can support load distribution through
metadata and safe runtime primitives.

Galerina should support:

```text
stateless handler design
worker pool declarations
queue handoff
sharding hints
partition keys
connection pool limits
compute target scheduling
backpressure
distributed rate-limit metadata
deployment reports
```

Example:

```Galerina
runtime_policy {
  workers {
    api_workers 8
    background_workers 4
    max_request_memory 64mb
  }

  load_distribution {
    stateless_routes true

    partition_keys {
      orders "customerId"
      uploads "userId"
      webhooks "providerEventId"
    }

    queue_heavy_routes true
  }
}
```

Framework/deployment tooling can use this to distribute load across:

```text
multiple processes
multiple containers
multiple servers
edge workers
queue workers
serverless workers
```

---

## 21. Avoiding Memory Growth Under Load

Galerina should keep memory stable under high request load.

Strategies:

```text
stream large bodies
limit decoded body size
limit request concurrency
avoid hidden copies
use read-only references
use bounded queues
use fixed-size buffers
use connection pools
use worker pools
reject overload early
queue heavy work
avoid per-request global state
avoid loading full result sets
```

Example memory policy:

```Galerina
runtime_policy {
  memory {
    avoid_hidden_copies true
    max_request_memory 64mb
    max_global_queue_memory 512mb
    bounded_buffers true
    reject_on_memory_pressure true
  }
}
```

---

## 22. Zero-Copy and Read-Only Request References

Galerina should avoid unnecessary request body copies.

Example:

```Galerina
secure flow processWebhook(req: Request) -> Result<Response, ApiError>
effects [network.inbound] {
  let bodyRef: ReadOnlyBytes = req.bodyRef(max_size: 256kb)

  let verified: Bool = webhook.verifySignature(bodyRef, req.headers)?

  let event: PaymentEvent = json.decode<PaymentEvent>(bodyRef)?

  return handlePaymentEvent(event)
}
```

Memory benefit:

```text
same request body reference used for signature verification and JSON decoding
no repeated copies
body remains read-only
lifetime tied to request
```

---

## 23. Request Lifetime and Cleanup

Galerina should make request-scoped memory explicit.

Rule:

```text
Request-scoped values are cleaned up when the request completes.
They cannot escape into global state unless explicitly copied or stored.
```

Example:

```Galerina
secure flow handleUpload(req: Request) -> Result<Response, ApiError> {
  let body = req.bodyRef()

  process(body)

  return JsonResponse({ "ok": true })
}
```

Invalid:

```Galerina
globalCache.store(body)
```

Expected error:

```text
Lifetime error:
Request-scoped body reference cannot be stored globally.

Suggestion:
Store a copied value explicitly or stream it to object storage.
```

---

## 24. Connection Pool Limits

Galerina should support connection pool declarations.

```Galerina
database main {
  driver "postgres"

  pool {
    max_connections 20
    acquire_timeout 2s
    idle_timeout 30s
  }
}
```

API overload should not create unlimited database connections.

Rule:

```text
Request concurrency must respect downstream pool limits.
```

Example warning:

```text
Load policy warning:
POST /orders allows 100 concurrent handlers,
but database main has max_connections 20.

Suggestion:
Lower route concurrency or queue overflow.
```

---

## 25. Different IPs at the Same Time

Large numbers of different IPs can bypass simple per-IP limits.

Galerina should support layered limits:

```text
per IP
per route
per user
per API key
per account
per ASN/provider if available
global application limit
global memory limit
global queue limit
```

Example:

```Galerina
api_policy {
  rate_limits {
    route "POST /search" {
      per_ip "60/minute"
      per_user "120/minute"
      global "5000/minute"
      max_concurrent 100
    }
  }

  abuse_controls {
    many_ips_same_route {
      enabled true
      route_threshold "POST /search"
      global_burst_limit 1000 per 10s
      action "challenge_or_throttle"
    }
  }
}
```

This helps with distributed traffic spikes.

---

## 26. Suspicious Traffic Detection

Galerina can provide policy hooks for suspicious behaviour.

Signals:

```text
many IPs hitting same route
many failed validations
many malformed bodies
many missing idempotency keys
many oversized requests
many requests with different IP but same API key
high error rate from one user/account
high memory pressure caused by one route
```

Example:

```Galerina
api_policy {
  abuse_detection {
    malformed_request_threshold 50 per 1m
    oversized_body_threshold 10 per 1m
    failed_auth_threshold 20 per 1m

    action "rate_limit"
    report true
  }
}
```

---

## 27. Safe Response Handling

Responses can also use memory.

Galerina should support:

```text
response size limits
streaming responses
pagination
compression policy
no secret leakage
safe error messages
```

Example:

```Galerina
api_policy {
  responses {
    max_json_size 2mb
    stream_large_responses true
    redact_errors true
    include_source_in_dev_only true
  }
}
```

---

## 28. API Security Reports

Galerina should generate API security reports.

Suggested output:

```text
build/app.api-security-report.json
```

Example:

```json
{
  "apiSecurityReport": {
    "routes": [
      {
        "method": "POST",
        "path": "/orders",
        "source": "src/api/orders.spore:4",
        "requestType": "CreateOrderRequest",
        "contentType": "application/json",
        "maxBodySize": "256kb",
        "unknownFields": "deny",
        "idempotency": true,
        "rateLimit": "30/minute",
        "maxConcurrent": 5,
        "memoryBudget": "32mb"
      }
    ]
  }
}
```

---

## 29. API Memory Reports

Suggested output:

```text
build/app.api-memory-report.json
```

Example:

```json
{
  "apiMemoryReport": {
    "routes": [
      {
        "route": "POST /files/upload",
        "mode": "stream",
        "maxBodySize": "100mb",
        "maxBuffer": "2mb",
        "hiddenCopies": 0,
        "streamToObjectStore": true
      },
      {
        "route": "POST /orders",
        "mode": "buffered",
        "maxBodySize": "256kb",
        "maxDecodedBody": "1mb",
        "maxHandlerMemory": "32mb"
      }
    ]
  }
}
```

---

## 30. Load Control Reports

Suggested output:

```text
build/app.load-control-report.json
```

Example:

```json
{
  "loadControlReport": {
    "global": {
      "maxApiWorkers": 8,
      "maxRequestMemory": "64mb",
      "backpressure": true
    },
    "routes": [
      {
        "route": "POST /video/process",
        "maxConcurrent": 3,
        "overflow": "queue",
        "queue": "video_jobs"
      },
      {
        "route": "POST /orders",
        "maxConcurrent": 5,
        "overflow": "reject"
      }
    ]
  }
}
```

---

## 31. AI Guide Integration

Generated AI guide section:

```markdown
## API Data Security and Load Control

Input handling:
- API inputs must decode into typed request values.
- Unknown JSON fields are denied by default.
- Content-Type is validated.
- Large bodies must stream.

Rate limits:
- Per-IP, per-user, per-route and global limits are configured.
- Route concurrency is limited.
- Heavy routes are queued.

Memory:
- Request-scoped values cannot escape request lifetime.
- Uploads stream with bounded buffers.
- Hidden request body copies are avoided.

AI note:
Do not pass raw `req.body` into business logic.
Decode into a typed request first.
Do not load large uploads into memory.
Use streaming and queue handoff for heavy work.
```

---

## 32. Map Manifest Integration

```json
{
  "apiDataBoundaries": [
    {
      "route": "POST /orders",
      "source": "src/api/orders.spore:4",
      "requestType": "CreateOrderRequest",
      "bodyPolicy": {
        "contentType": "application/json",
        "maxSize": "256kb",
        "unknownFields": "deny"
      },
      "limits": {
        "rate": "30/minute",
        "maxConcurrent": 5,
        "memory": "32mb"
      }
    }
  ]
}
```

---

## 33. Non-Goals

Galerina API data security and load control should not:

```text
be a complete web framework
be a load balancer
be an API gateway product
hard-code one rate-limit storage backend
hard-code one queue backend
silently trust request bodies
silently trust proxy headers
silently load large bodies into memory
silently coerce unsafe types
silently allow unknown fields
hide memory usage
hide overload behaviour
```

---

## 34. Open Questions

```text
Should unknown JSON fields be denied by default?
Should duplicate JSON keys be denied by default?
Should route memory budgets be required in production?
Should every POST route require a body policy?
Should per-IP limits be enabled by default?
Should global route limits be required to protect against many-IP attacks?
Should trusted proxy headers be denied by default?
Should large request bodies automatically require streaming?
Should heavy routes automatically require queue handoff?
Should request body references be read-only by default?
```

---

## Recommended Early Version

Version 0.1:

```text
typed request decoding
content-type validation
body size limits
unknown-field policy
strict JSON policy
typed API errors
API security report
```

Version 0.2:

```text
per-route rate limits
per-IP/user/API-key limits
concurrency limits
memory budgets
load-control report
```

Version 0.3:

```text
streaming request bodies
zero-copy read-only request references
request lifetime checks
connection pool alignment warnings
```

Version 0.4:

```text
backpressure
queue handoff
distributed rate-limit metadata
many-IP abuse controls
suspicious traffic reports
```

---

## Final Principle

Galerina should make API input safe before it reaches application logic.

Final rule:

```text
Identify the payload.
Validate the content type.
Decode into strict types.
Deny unsafe unknowns.
Limit request size.
Stream large bodies.
Avoid hidden copies.
Use request-scoped memory.
Rate-limit by IP, user, route and globally.
Limit concurrency.
Queue heavy work.
Apply backpressure under load.
Reject safely when overloaded.
Report every decision clearly.
```

Galerina should not be a web framework or load balancer, but it should give
frameworks and runtimes the tools to process API data securely, efficiently and
predictably.
