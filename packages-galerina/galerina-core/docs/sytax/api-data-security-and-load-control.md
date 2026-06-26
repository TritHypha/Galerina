# API Data Security and Load Control Syntax

Status: Draft.

This file defines syntax direction for API body policies, strict decoding,
rate limits, concurrency limits, memory budgets, backpressure, queue handoff
and load-control reports.

Galerina should provide policy syntax and compiler/runtime checks. It should not
become a web framework, load balancer, API gateway or rate-limit storage
backend.

---

## Purpose

```text
declare request body safety policy
decode API input into strict request types
reject unsafe content-type and schema mismatches
limit route memory and concurrency
declare route/user/IP/global rate limits
declare queue handoff for heavy routes
declare backpressure behaviour
align API concurrency with downstream pool limits
generate API security, memory and load reports
```

---

## Grammar Direction

```text
api_policy        = "api_policy" block
body_block        = "body" block
limits_block      = "limits" block
memory_block      = "memory" block
rate_limits       = "rate_limits" block
concurrency       = "concurrency" block
backpressure      = "backpressure" block
queue_block       = "queue" block
runtime_policy    = "runtime_policy" block
load_distribution = "load_distribution" block
```

---

## Minimal Route Example

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

---

## API Policy Example

```Galerina
api_policy {
  request_bodies {
    require_content_type true
    reject_mismatch true
    sniffing "limited_safe"
  }

  coercion {
    string_to_int "deny_by_default"
    string_to_bool "deny_by_default"
    null_to_default "deny"
    explicit_cast_required true
  }

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

---

## Rate and Concurrency Example

```Galerina
api_policy {
  rate_limits {
    route "POST /orders" {
      per_ip "30/minute"
      per_user "60/minute"
      global "1000/minute"
      burst 10
    }
  }

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

---

## Streaming and Queue Example

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

    memory {
      max_buffer 8mb
      reject_on_exceed true
    }

    queue {
      target "video_jobs"
      response "accepted"
    }
  }
}
```

---

## Backpressure Example

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

---

## Security Rules

```text
API input is unsafe until decoded into a strict type.
Content-Type must be validated before decoding.
Route policy must override payload classifier guesses.
Unknown fields should be denied where configured.
Duplicate JSON keys should be denied where configured.
Unsafe implicit coercion should be denied by default.
Large bodies should stream with bounded buffers.
Request-scoped references must not escape request lifetime.
Do not trust X-Forwarded-For unless the proxy is trusted.
Heavy routes should queue or reject under load.
Rate-limit storage and queue implementations belong in packages/frameworks.
```

---

## Report Output

Suggested reports:

```text
app.api-security-report.json
app.api-memory-report.json
app.load-control-report.json
app.map-manifest.json
app.ai-guide.md
```

Report fields should include:

```text
route
source
request type
content type
body mode
max body size
unknown-field policy
idempotency policy
rate limits
max concurrent requests
memory budget
streaming mode
queue handoff
backpressure action
downstream pool alignment warnings
```

---

## Open Parser and Runtime Work

```text
parse api_policy blocks
parse route body blocks
parse route limits blocks
parse route memory blocks
parse route queue blocks
parse runtime_policy load_distribution blocks
check content-type and body policy requirements
check strict JSON unknown-field and duplicate-key policy
check unsafe coercion policy
check trusted proxy rules for client IP use
check request-scoped lifetime rules
check large-body streaming requirements
check route concurrency against downstream pool limits
emit API security, memory and load-control reports
emit AI guide API data boundary summaries
```
