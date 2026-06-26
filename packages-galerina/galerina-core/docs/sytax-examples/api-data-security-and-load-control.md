# API Data Security and Load Control Examples

Status: Draft.

These examples show how Galerina should declare API data safety, body parsing,
rate limits, memory budgets, streaming uploads, queue handoff and overload
behaviour without becoming a web framework or load balancer.

---

## Good Examples

Strict JSON route:

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

Typed handler:

```Galerina
secure flow createOrder(input: CreateOrderRequest) -> Result<CreateOrderResponse, ApiError>
effects [database.write] {
  let orderId: OrderId = Orders.create(input)?

  return Ok(CreateOrderResponse {
    orderId: orderId
  })
}
```

Proxy-safe client identity:

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
}
```

Streaming upload:

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

Queue handoff for heavy work:

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

Read-only request reference:

```Galerina
secure flow processWebhook(req: Request) -> Result<Response, ApiError>
effects [network.inbound] {
  let bodyRef: ReadOnlyBytes = req.bodyRef(max_size: 256kb)

  let verified: Bool = webhook.verifySignature(bodyRef, req.headers)?
  let event: PaymentEvent = json.decode<PaymentEvent>(bodyRef)?

  return handlePaymentEvent(event)
}
```

---

## Bad Examples

Raw body passed into business logic:

```Galerina
secure flow createOrder(req: Request) -> Result<Response, ApiError> {
  return Orders.create(req.body())
}
```

Problem:

```text
The body is not decoded into a strict request type.
Content-Type, schema, unknown fields and body size are unclear.
```

Unsafe content-type trust:

```Galerina
secure flow importData(req: Request) -> Result<Response, ApiError> {
  if req.headers.ContentType == "application/json" {
    return importJson(req.body())
  }
}
```

Problem:

```text
The route trusts the declared Content-Type without validating the body.
```

Unsafe proxy header trust:

```Galerina
rate_limit {
  key req.headers["X-Forwarded-For"]
  limit 100
  window 1m
}
```

Problem:

```text
X-Forwarded-For can be client-controlled unless the request came through a trusted proxy.
```

Large upload loaded into memory:

```Galerina
secure flow uploadVideo(req: Request) -> Result<Response, ApiError> {
  let body: Bytes = req.body()
  return videoStore.save(body)
}
```

Problem:

```text
Large uploads should stream with a bounded buffer.
```

Request-scoped reference stored globally:

```Galerina
secure flow handleUpload(req: Request) -> Result<Response, ApiError> {
  let body = req.bodyRef()
  globalCache.store(body)
  return JsonResponse({ "ok": true })
}
```

Expected diagnostic:

```text
Lifetime error:
Request-scoped body reference cannot be stored globally.
```

Route concurrency exceeds database pool:

```Galerina
api OrdersApi {
  POST "/orders" {
    request CreateOrderRequest
    response CreateOrderResponse
    handler createOrder

    limits {
      max_concurrent 100
    }
  }
}

database main {
  driver "postgres"

  pool {
    max_connections 20
  }
}
```

Expected warning:

```text
Load policy warning:
POST /orders allows 100 concurrent handlers,
but database main has max_connections 20.
```

---

## Expected Reports

```text
app.api-security-report.json
app.api-memory-report.json
app.load-control-report.json
app.map-manifest.json
app.ai-guide.md
```

Reports should show:

```text
which routes require strict body policies
which routes deny unknown fields
which routes have rate and concurrency limits
which routes stream request bodies
which routes queue heavy work
which routes risk memory growth
which routes conflict with downstream connection pools
which client identity rules trust proxy headers
```
