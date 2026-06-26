# Preplanned Startup And Fast Response

## Purpose

Galerina should treat startup and response speed as governed planning problems,
not runtime guessing problems.

The core rule is:

```text
Do expensive thinking at build/check time.
Do only verified loading at boot time.
```

This concept combines two related positions:

- preplanned startup through verified boot profiles
- fast response through warm request paths and safe connection reuse

The goal is not to claim that Galerina is automatically faster than mature
runtimes. The goal is to make startup and request handling predictable,
explainable, measurable and reportable.

## Why This Fits Galerina

Galerina is strict, permissioned, typed, report-driven and deny-by-default.

That means many startup decisions can be known before the application starts:

- route contracts
- request and response schemas
- permissions and effects
- package profiles
- runtime target plans
- security policy tables
- generated report paths
- safe cache metadata

Traditional dynamic systems often discover these facts at boot. Galerina should
prefer to generate and verify them before production startup.

## Boot Profile

A production build should be able to generate:

```text
build/galerina/boot-profile.json
```

The boot profile contains deterministic startup facts only:

```json
{
  "schema": "galerina.boot-profile.v1",
  "profile": "production",
  "entry": "boot.spore",
  "targets": ["cpu", "wasm"],
  "routeGraphHash": "sha256:...",
  "policyGraphHash": "sha256:...",
  "schemaValidatorHash": "sha256:...",
  "packageGraphHash": "sha256:...",
  "runtimePlan": {
    "loadMode": "minimal",
    "eagerPackages": [
      "galerina-core",
      "galerina-core-runtime",
      "galerina-core-security",
      "galerina-framework-app-kernel"
    ],
    "lazyPackages": [
      "galerina-ai",
      "galerina-data-search",
      "galerina-target-gpu"
    ]
  },
  "cache": {
    "safe": true,
    "contentAddressed": true,
    "secretsCached": false
  }
}
```

The profile may be produced by future commands such as:

```bash
Galerina check --profile production
Galerina build --profile production
Galerina warmup --profile production
```

At boot, Galerina should verify the profile and load the smallest safe production
surface first.

## Startup Phases

Galerina startup should be split into three phases.

| Phase | What Happens | Goal |
| --- | --- | --- |
| Cold boot | Load minimal runtime, config handoff, route table and security table | App becomes ready quickly |
| Safe warmup | Preload validators, common routes, CPU feature plan and safe caches | First real requests are faster |
| Deferred warmup | Load AI, search, reports, graph tools, benchmarks and optional targets later | Heavy features do not delay readiness |

## Precompiled App Kernel Decisions

For web and API apps, the safe app kernel should not discover everything at
runtime.

Build/check time may generate:

```text
build/galerina/routes.json
build/galerina/security-policy.json
build/galerina/schema-validators.json
build/galerina/effects-map.json
build/galerina/runtime-plan.json
build/galerina/startup-report.json
```

Boot should verify and load these artefacts instead of rebuilding them from
scratch.

## Galerina Boot Snapshot

Galerina may later support a boot snapshot.

For the first design, this should not be a raw runtime memory dump. It should
be a verified bundle of deterministic startup artefacts:

```text
.galerina/cache/
  boot-profile.json
  route-table.bin
  policy-table.bin
  validators.bin
  package-graph.bin
  target-plan.json
  startup-report.json
```

A future native runtime may support a true runtime snapshot, but the initial
model should remain safer: verify artefacts, load minimal runtime state, then
warm optional parts after readiness.

## Minimal Production Package Loading

Production startup should use:

```text
package-galerina.json
galerina.lock.json
boot-profile.json
```

Only packages required by the selected production profile should be loaded at
cold boot.

Development tools, benchmark tools, graph tools, AI packages, search packages
and optional hardware targets should be lazy-loaded or excluded unless the
profile explicitly requires them.

## Safe Startup Cache Rule

Cache only deterministic, non-secret, rebuildable startup data.

Safe to cache:

- route graph
- schema validators
- package graph
- compiled safe parsers
- CPU/WASM target plan
- generated reports
- AI-readable project map

Do not cache by default:

- API keys
- session tokens
- payment tokens
- private keys
- raw request bodies
- authorization decisions
- database query results
- external API responses

Any startup cache must be bounded, content-addressed where practical, safe to
delete, safe to bypass and never required for correctness.

## Startup Commands

Future command concepts:

```bash
Galerina startup:plan --profile production
Galerina startup:warm --profile production
Galerina startup:report
Galerina serve --profile production --use-boot-profile
```

Example report output:

```text
Galerina Startup Plan

Profile: production
Mode: preplanned
Routes: 42 loaded from route-table
Policies: 18 loaded from policy-table
Schemas: 31 validators prebuilt
Packages loaded at boot: 7
Packages lazy-loaded: 12
Secrets cached: no
Cache required for correctness: no
Startup risk: low

Report:
build/reports/startup-report.json
```

## Fast Response Chain

Boot warmup makes Galerina ready faster. Keep-alive keeps the network path warm
after it is ready.

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

Galerina should be fast to respond because it knows the safe path before the
request arrives.

## Prewarmed Runtime State

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

Warmup must be bounded, profile-controlled and safe to cancel.

## Transport Policy And Keep-Alive

Keep-alive must be policy-controlled. It should not be a single global
`keepAlive: true` switch.

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

Inbound keep-alive allows clients to reuse connections into the Galerina server.

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

Outbound keep-alive helps Galerina reuse safe connections to external services.

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

## Reports

Galerina should emit startup and network performance reports:

```text
build/reports/startup-report.json
build/reports/app.network-performance-report.json
```

Example network report:

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

Preplanned startup, boot snapshots, keep-alive and connection pooling must
never bypass:

- authentication
- authorization
- request validation
- response validation
- TLS policy
- rate limits
- body limits
- timeout policy
- memory policy
- backpressure
- secret-safe logging
- audit/event policy

## Positioning

Galerina should not claim:

```text
Galerina makes the internet faster.
```

Galerina should claim:

```text
Galerina reduces avoidable application overhead by knowing the safe startup and
request path before runtime work begins.
```

## Relationship To Other Concepts

This concept connects:

- startup and boot warmup
- fast response and keep-alive
- verified fast paths
- secure app kernel
- core network policy
- core runtime reports
- package profile loading
- deployment readiness gates

## Final Principle

```text
Galerina should be fast to start and fast to respond because it has already
planned, verified and reported the safe path before production work begins.
```
