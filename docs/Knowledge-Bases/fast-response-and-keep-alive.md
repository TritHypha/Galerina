# Fast Response And Keep-Alive

## Purpose

Galerina treats fast response time as a full request-path problem, not only a
language execution problem.

Fast response combines:

- fast boot
- warm route/runtime state
- connection reuse
- prevalidated request handling
- safe outbound connection pooling
- early rejection of invalid work

The short rule is:

```text
Boot warmup makes Galerina ready faster.
Keep-alive keeps the network path warm after it is ready.
```

## Fast Response Chain

A Galerina API request should follow a known-safe path:

```text
Client
  -> existing keep-alive / HTTP2 / HTTP3 connection
Galerina API Server
  -> precompiled method/path route lookup
Galerina App Kernel
  -> prevalidated schema and security policy
Galerina Runtime
  -> warmed typed flow
Response
  -> same connection reused where policy allows
Client
```

The goal is to reduce avoidable application overhead, not to claim that Galerina
makes physical networks faster.

## Known Safe Path

Galerina should be fast to respond because it knows the safe path before the
request arrives.

This means:

- route already known
- schema already known
- policy already known
- effects already known
- network limits already known
- connection reusable where policy allows
- bad requests rejected early
- good requests enter typed flows quickly

## What Galerina Should Prewarm

At boot, Galerina may warm:

- route trie or method/path lookup table
- request schema validators
- response schema validators
- security policy table
- rate-limit buckets
- auth provider metadata
- database connection pool
- outbound HTTP client pools
- TLS/session configuration
- common JSON encoders and decoders
- worker pool
- health-check state

Warmup must remain bounded and profile-controlled. Heavy optional packages must
not delay readiness unless the production profile requires them.

## Transport Policy

Keep-alive must be policy-controlled and transport-aware.

HTTP/1.x keep-alive, HTTP/2 multiplexing and HTTP/3/QUIC should be treated as
transport capabilities selected by deployment profile, not as core language
syntax.

Example concept:

```galerina
network transport {
  http1 {
    keepAlive: true
    idleTimeoutMs: 5000
    maxRequestsPerConnection: 200
  }

  http2 {
    enabled: auto
    multiplexing: true
  }

  http3 {
    enabled: optional
    requireProfile: "edge-modern"
  }
}
```

## Inbound Connection Reuse

Inbound keep-alive lets clients reuse connections to the Galerina server.

Example concept:

```galerina
server api {
  listen https on 443

  transport {
    prefer http2
    allow http1

    http1 {
      keepAlive: true
      keepAliveTimeoutMs: 5000
      maxRequestsPerConnection: 200
      maxIdleConnections: 10000
    }

    http2 {
      enabled: auto
      maxConcurrentStreams: 100
    }
  }

  limits {
    requestTimeoutMs: 30000
    headerTimeoutMs: 5000
    maxBodyMb: 10
  }
}
```

## Outbound Connection Pooling

Outbound keep-alive helps Galerina reuse safe connections to external services
such as payment APIs, email APIs, internal services, search services and AI
services.

Example concept:

```galerina
outbound service OpenAI {
  host: "api.openai.com"
  protocol: https

  connectionPool {
    keepAlive: true
    maxSockets: 50
    maxFreeSockets: 10
    idleTimeoutMs: 10000
  }

  timeoutMs: 30000
  retry: safeOnly
}
```

Outbound pooling must not bypass TLS policy, timeout policy, rate limits,
backpressure, authentication, validation, secret-safe logging or audit rules.

## Network Performance Report

Galerina should generate a network performance report:

```text
build/reports/app.network-performance-report.json
```

Example:

```json
{
  "http": {
    "inbound": {
      "http1KeepAlive": true,
      "http2": "auto",
      "http3": "not_enabled",
      "keepAliveTimeoutMs": 5000,
      "maxRequestsPerConnection": 200
    },
    "outbound": [
      {
        "service": "OpenAI",
        "keepAlive": true,
        "maxSockets": 50,
        "timeoutMs": 30000
      }
    ]
  },
  "startupWarmup": {
    "routeTable": "preloaded",
    "schemaValidators": "prebuilt",
    "policyTable": "preloaded",
    "workerPool": "ready",
    "dbPool": "warming"
  },
  "warnings": []
}
```

## Safety Rules

Keep-alive must never bypass:

- authentication
- authorization
- request validation
- response validation
- TLS policy
- rate limits
- body limits
- timeout policy
- backpressure
- secret-safe logging
- audit/event policy

HTTP/1.x keep-alive, HTTP/2 multiplexing and HTTP/3/QUIC are transport
capabilities selected by deployment profile. They are not core language syntax.

## Design Statement

Galerina should be fast to respond because it knows the safe path before the
request arrives.

This means:

- route already known
- schema already known
- policy already known
- effects already known
- network limits already known
- connection reusable where policy allows
- bad requests rejected early
- good requests enter typed flows quickly
