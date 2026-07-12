# Galerina API Server

> **APP-LAYER TEMPLATE / SCAFFOLD — not a finished package.**
> `galerina-framework-api-server` is one of three **app-layer framework templates**
> (`galerina-framework-app-kernel`, `galerina-framework-api-server`,
> `galerina-framework-example-app`). It is the **REST/HTTP protocol-adapter template**
> that sits **above** the Galerina language + core runtime; it is **not** part of the
> Galerina language or compiler, and it is **not** the workspace default build target.
> Most of this document is a **v0.2 specification** the eventual implementation
> builds to — treat it as a scaffold/spec, not shipped code. The single source of
> truth for the layer's scope, the one-kernel/many-protocols architecture, and the
> phased build order is the layer design doc:
> [`../../../ZTF-Knowledge-Bases/galerina-framework-layer-design.md`](../../../ZTF-Knowledge-Bases/galerina-framework-layer-design.md).

`galerina-framework-api-server` is the first concrete HTTP API-serving package for Galerina.

## Coverage Reconciliation Status

This package may expose adapter-level request handling names, but webhook HMAC,
replay and idempotency semantics must map to the canonical
`galerina-core-network` v0.2 contract:

```text
WebhookVerificationConfig.secret: string | Uint8Array
ReplayStore.has(key) / put(key, ttlSeconds)
IdempotencyStore.get(key) / put(IdempotencyRecord, ttlSeconds?)
```

Existing `ReplayStore.exists/save` wording is an API-server adapter shape, not
the canonical network package API. Implementation docs should either adopt the
network names or document the adapter mapping explicitly.

In the current prototype/runtime phase, this package is expected to be
Node-hosted for practical web/API serving. Future implementations may use
native, WASM, serverless or other checked runtime adapters, but those are later
targets.

It belongs in:

```text
/packages-galerina/galerina-framework-api-server
```

It is designed to be used by:

```text
Galerina App Kernel
Galerina partial framework
bespoke frameworks
Node/Express/Fastify adapters
compiled native Galerina services
future serverless/cloud adapters
```

`galerina-framework-api-server` is **not** a full web framework.

It should not try to become Express, Laravel, Django, Rails, Symfony, Next.js,
NestJS or a CMS.

It should also not try to become Nginx, Apache or Caddy. Those are deployment
and reverse-proxy targets. Galerina deployment tooling may generate config for
them, while this package focuses on serving Galerina API route manifests.

Its job is smaller and stricter:

```text
receive HTTP requests
normalise requests
load Galerina API route manifests
pass requests into the Galerina App Kernel
apply server-level limits
return typed HTTP responses
write safe logs
generate runtime reports
```

---

## 1. Purpose

Galerina Core defines the language.

Galerina Runtime executes compiled Galerina safely.

Galerina App Kernel defines the secure application boundary.

Galerina Core Network defines network policy, profile and report contracts.

`galerina-framework-api-server` provides the HTTP server implementation that allows Galerina API routes
to run as real services.

The relationship is:

```text
HTTP Request
  ->
galerina-framework-api-server
  ->
galerina-framework-app-kernel
  ->
galerina-core-runtime
  ->
typed Galerina flow
  ->
galerina-core-runtime
  ->
galerina-framework-app-kernel
  ->
galerina-framework-api-server
  ->
HTTP Response
```

---

## 2. Package Position

Recommended package layout:

```text
/packages
  /galerina-core
  /galerina-core-compiler
  /galerina-core-runtime
  /galerina-core-network
  /galerina-framework-app-kernel
  /galerina-framework-api-server
  /galerina-api-adapters
```

Responsibilities:

| Package           | Responsibility                                      |
| ----------------- | --------------------------------------------------- |
| `galerina-core`         | Language rules, core types, syntax, diagnostics     |
| `galerina-core-compiler`     | Parse, check, compile, generate reports             |
| `galerina-core-runtime`      | Safe execution, memory limits, effects, permissions |
| `galerina-core-network`      | Network policy, profiles, backend capabilities and reports |
| `galerina-framework-app-kernel`   | API policy, auth, validation, route execution       |
| `galerina-framework-api-server`   | Built-in HTTP server for Galerina APIs                    |
| `galerina-api-adapters` | Express, Fastify, Lambda, Cloudflare, native adapters |

---

## 3. Main Design Rule

```text
Galerina Core should not serve APIs.
Galerina App Kernel should define API behaviour.
galerina-framework-api-server should serve HTTP.
Bespoke frameworks may use either galerina-framework-api-server or galerina-framework-app-kernel directly.
```

This keeps Galerina modular.

A simple Galerina API can run through `galerina-framework-api-server`.

A larger framework can reuse the same safe kernel without being forced to use
Galerina's built-in server.

## Current Node-Hosted Position

Current practical serving path:

```text
HTTP request
  -> Node.js server
  -> galerina-framework-api-server
  -> galerina-framework-app-kernel
  -> galerina-core-runtime
  -> typed Galerina flow
  -> HTTP response
```

This package should not claim to be a standalone native web server until a
non-Node runtime, async/event loop and HTTP stack exist as implemented, tested
and reportable components.

---

## 4. What galerina-framework-api-server Should Do

`galerina-framework-api-server` should provide:

```text
HTTP listening
request normalisation
route manifest loading
precompiled method/path dispatch where available
request size enforcement
server timeout enforcement
safe error responses
safe response writing
transport-level response header application
health endpoint support
runtime report output
structured logging
graceful shutdown
development reload support
production-safe defaults
```

It should work behind generated reverse-proxy config for Nginx, Apache or Caddy
and expose enough route metadata for body limits, timeouts, health checks,
security headers and raw-body webhook handling to be configured consistently.

When the compiler emits a route trie or equivalent method-indexed lookup table,
`galerina-framework-api-server` should use it instead of scanning route patterns
one by one. Unknown methods and paths should be rejected before body parsing,
auth work or handler execution.

It may also provide:

```text
TLS configuration
HTTP/2 support later
zero-copy send path where safe and supported
platform I/O backend integration where safe and supported
worker mode later
cluster mode later
serverless bridge later
metrics endpoint later
```

---

## 5. What galerina-framework-api-server Should Not Do

`galerina-framework-api-server` should not provide:

```text
CMS
admin dashboard
template engine
theme system
ORM
database migrations
page builder
frontend routing
React components
Angular components
Vue components
session-heavy web framework behaviour
plugin marketplace
large middleware ecosystem
business logic
payment logic
email provider logic
core network policy ownership
kernel packet-filter implementation
DPDK runtime bindings
```

Those belong in packages, frameworks or user applications.

---

## 6. Galerina App Kernel vs galerina-framework-api-server

### Galerina App Kernel

The App Kernel owns the safe application rules.

It should handle:

```text
typed route declarations
typed request decoding
typed response encoding
auth policy
scope checks
role checks
rate limit policy
idempotency policy
webhook replay protection
body validation
unknown field policy
duplicate key policy
memory budget policy
effect policy
error policy
audit report generation
```

### galerina-framework-api-server

The API server owns the HTTP transport.

It should handle:

```text
network socket
port binding
network policy loading
TLS policy application
HTTP request parsing
connection timeout
body stream handoff
server shutdown
response writing
server logs
server health checks
server config
```

The split should be strict.

`galerina-core-network` defines the network policy contracts consumed by the
server. The API server implements HTTP transport and emits transport facts for
network reports; it does not own the whole Galerina network model.

`galerina-framework-api-server` should not decide whether a user is authorised.

It should ask `galerina-framework-app-kernel`.

---

## 7. Example Galerina API Declaration

Example Galerina source:

```Galerina
api OrdersApi {
  POST "/orders" {
    request CreateOrderRequest
    response CreateOrderResponse
    handler createOrder

    auth {
      bearer required
      scopes ["orders.write"]
    }

    body {
      content_type "application/json"
      max_size 256kb
      unknown_fields "deny"
      duplicate_keys "deny"
    }

    limits {
      rate "30/minute"
      max_concurrent 5
      memory 32mb
      timeout 5s
    }

    idempotency {
      required true
      header "Idempotency-Key"
      ttl 24h
    }
  }
}
```

The compiler should turn this into a route manifest.

`galerina-framework-api-server` should load the manifest and serve it.

The route manifest should preserve security and resource policy, including
auth, CSRF, CORS, object/property authorization, declared effects, body limits,
timeouts, concurrency limits, response filtering and audit requirements.
It should also preserve response policy, including status/body contracts,
content type, cache policy, security headers, cookie attributes, redirect
safety, content negotiation and streaming requirements.

---

## 8. Example Runtime Flow

```text
1. Client sends POST /orders
2. galerina-framework-api-server receives the HTTP request
3. galerina-framework-api-server checks basic server limits
4. galerina-framework-api-server passes the request to galerina-framework-app-kernel
5. galerina-framework-app-kernel matches the route
6. galerina-framework-app-kernel validates content type
7. galerina-framework-app-kernel checks request body size
8. galerina-framework-app-kernel decodes the body into CreateOrderRequest
9. galerina-framework-app-kernel checks auth and scopes
10. galerina-framework-app-kernel checks rate limits and idempotency
11. galerina-framework-app-kernel calls the typed Galerina flow
12. Galerina Runtime executes the flow safely
13. galerina-framework-app-kernel encodes CreateOrderResponse
14. galerina-framework-api-server writes the HTTP response
15. reports and safe logs are generated
```

---

## 9. CLI Usage

The first version may expose the server through the main Galerina CLI:

```bash
Galerina serve
```

With environment:

```bash
Galerina serve --env development
Galerina serve --env production
```

With explicit manifest:

```bash
Galerina serve --manifest ./build/galerina-api-manifest.json
```

With explicit port:

```bash
Galerina serve --port 8080
```

Alternative direct binary/package command:

```bash
galerina-framework-api-server serve
```

Recommended long-term model:

```text
Galerina serve
```

is the normal developer command.

```text
galerina-framework-api-server
```

is the underlying package/tool.

---

## 10. Build Output

A compiled Galerina API project may output:

```text
/build
  /linux
    app
  /wasm
    app.wasm
  /reports
    target-report.json
    security-report.json
    memory-report.json
    api-report.json
    failure-report.json
  /manifest
    galerina-api-manifest.json
    galerina-permissions.json
    galerina-routes.json
    galerina-openapi.json
```

`galerina-framework-api-server` should primarily need:

```text
galerina-api-manifest.json
galerina-permissions.json
compiled runtime output
```

---

## 11. Manifest Example

Example route manifest:

```json
{
  "api": "OrdersApi",
  "version": "0.1.0",
  "routes": [
    {
      "method": "POST",
      "path": "/orders",
      "handler": "createOrder",
      "requestType": "CreateOrderRequest",
      "responseType": "CreateOrderResponse",
      "auth": {
        "type": "bearer",
        "required": true,
        "scopes": ["orders.write"]
      },
      "body": {
        "contentType": "application/json",
        "maxSize": "256kb",
        "unknownFields": "deny",
        "duplicateKeys": "deny"
      },
      "limits": {
        "rate": "30/minute",
        "maxConcurrent": 5,
        "memory": "32mb",
        "timeout": "5s"
      },
      "idempotency": {
        "required": true,
        "header": "Idempotency-Key",
        "ttl": "24h"
      }
    }
  ]
}
```

---

## 12. Server Configuration

Example config file:

```text
Galerina.server.config
```

Possible config:

```Galerina
server {
  host "0.0.0.0"
  port 8080
  env "production"

  request {
    max_body_size 1mb
    header_timeout 5s
    body_timeout 10s
    idle_timeout 30s
  }

  logging {
    level "info"
    redact_secure_values true
    include_request_id true
  }

  reports {
    output "./build/reports"
    security true
    memory true
    api true
  }

  health {
    enabled true
    path "/health"
  }
}
```

---

## 13. Recommended Folder Structure

Recommended first structure:

```text
/packages-galerina/galerina-framework-api-server
  README.md
  TODO.md
  package.json
  tsconfig.json

  /src
    index.ts

    /cli
      serve-command.ts
      config-loader.ts
      cli-options.ts

    /server
      create-server.ts
      start-server.ts
      stop-server.ts
      http-listener.ts
      graceful-shutdown.ts

    /request
      normalise-request.ts
      read-body-stream.ts
      request-context.ts
      request-id.ts
      parse-headers.ts

    /response
      write-response.ts
      response-context.ts
      error-response.ts
      safe-headers.ts

    /manifest
      load-api-manifest.ts
      validate-api-manifest.ts
      route-table.ts
      route-match.ts

    /kernel
      call-app-kernel.ts
      kernel-result.ts
      kernel-error.ts

    /limits
      body-size-limit.ts
      timeout-limit.ts
      concurrency-limit.ts
      memory-budget.ts

    /logging
      logger.ts
      redact-secure-values.ts
      request-log.ts

    /reports
      api-server-report.ts
      runtime-report-writer.ts
      failure-report-writer.ts

    /errors
      server-error.ts
      manifest-error.ts
      request-error.ts
      response-error.ts

    /types
      api-server-config.ts
      api-manifest.ts
      http-method.ts
      server-result.ts

  /examples
    /basic-api
      boot.fungi
      routes.fungi
      Galerina.server.config

    /webhook-api
      boot.fungi
      webhook.fungi
      Galerina.server.config

  /tests
    server-start.test.ts
    route-match.test.ts
    manifest-load.test.ts
    request-normalise.test.ts
    response-write.test.ts
    limits.test.ts
```

---

## 14. Minimal Early Structure

For the first prototype, keep it smaller:

```text
/packages-galerina/galerina-framework-api-server
  README.md
  TODO.md
  package.json
  tsconfig.json

  /src
    index.ts
    cli.ts
    create-server.ts
    load-manifest.ts
    route-match.ts
    call-kernel.ts
    write-response.ts
    errors.ts
    types.ts

  /examples
    /basic-api
      boot.fungi
      routes.fungi
      Galerina.server.config

  /tests
    basic-server.test.ts
```

This avoids overbuilding too early.

---

## 15. Public API Idea

The package should expose a small API.

Example TypeScript-style API for the prototype:

```ts
import { createLoApiServer } from "galerina-framework-api-server";

const server = await createLoApiServer({
  manifestPath: "./build/manifest/galerina-api-manifest.json",
  port: 8080,
  env: "production"
});

await server.start();
```

Adapter usage:

```ts
import { createLoApiHandler } from "galerina-framework-api-server";

const handler = await createLoApiHandler({
  manifestPath: "./build/manifest/galerina-api-manifest.json"
});

const response = await handler.handle(request);
```

The second model is important because bespoke frameworks can use the handler
without using Galerina's built-in HTTP listener.

---

## 16. Bespoke Framework Usage

A bespoke framework should have two options.

### Option 1: Use galerina-framework-api-server directly

```text
Bespoke Framework
  ->
galerina-framework-api-server
  ->
galerina-framework-app-kernel
  ->
Galerina Runtime
```

Good when the bespoke framework wants Galerina to own API serving.

### Option 2: Use galerina-framework-app-kernel directly

```text
Bespoke Framework HTTP Layer
  ->
galerina-framework-app-kernel
  ->
Galerina Runtime
```

Good when the bespoke framework already has its own HTTP server, routing, CMS,
admin area or frontend rendering.

### Option 3: Use adapter mode

```text
Express/Fastify/Lambda/Cloudflare
  ->
galerina-api-adapter
  ->
galerina-framework-app-kernel
  ->
Galerina Runtime
```

Good for existing ecosystems.

---

## 17. Adapter Strategy

Adapters should be separate from the server package where possible.

Recommended:

```text
/packages-galerina/galerina-api-adapters
  /express
  /fastify
  /aws-lambda
  /cloudflare-worker
  /node-http
```

`galerina-framework-api-server` may use a default Node/native HTTP adapter internally, but
external framework support should not bloat the core server package.

---

## 18. Security Defaults

`galerina-framework-api-server` should default to secure behaviour.

Default rules:

```text
deny unbounded request bodies
deny missing manifest
deny invalid manifest
deny unknown route unless fallback explicitly configured
deny insecure auth bypass
redact SecureString values
do not log bearer tokens
do not log cookies by default
do not expose stack traces in production
generate failure reports
require production config checks
```

Production warnings:

```text
missing rate limit
missing request size limit
missing timeout
missing auth on non-public route
idempotency missing on payment/order/webhook route
raw body access enabled
unsafe adapter enabled
debug logging enabled
```

---

## 19. Error Handling

`galerina-framework-api-server` should return safe error responses.

Example production error:

```json
{
  "error": {
    "code": "Galerina_API_REQUEST_INVALID",
    "message": "Request could not be processed",
    "requestId": "req_123"
  }
}
```

Example development error may include more detail:

```json
{
  "error": {
    "code": "Galerina_API_BODY_TOO_LARGE",
    "message": "Request body exceeded 256kb",
    "requestId": "req_123",
    "route": "POST /orders"
  }
}
```

Internal reports may contain more diagnostic information, but public responses
should remain safe.

---

## 20. Health Endpoint

`galerina-framework-api-server` may provide a simple health endpoint:

```text
GET /health
```

Example response:

```json
{
  "status": "ok",
  "service": "galerina-framework-api-server",
  "api": "OrdersApi",
  "version": "0.1.0"
}
```

Production rule:

```text
Health endpoints must not expose secrets, environment variables, tokens, stack traces or internal file paths.
```

---

## 21. Reports

`galerina-framework-api-server` should help generate runtime reports.

Possible reports:

```text
api-server-report.json
api-runtime-report.json
api-failure-report.json
api-security-report.json
api-memory-report.json
api-route-report.json
```

Example:

```json
{
  "server": "galerina-framework-api-server",
  "env": "production",
  "routesLoaded": 12,
  "routesPublic": 2,
  "routesProtected": 10,
  "warnings": [
    {
      "code": "Galerina_API_RATE_LIMIT_MISSING",
      "route": "GET /public-search",
      "message": "Route has no explicit rate limit"
    }
  ]
}
```

---

## 22. Development Mode

Development mode may allow:

```text
detailed route errors
manifest reload
local debug logging
source-mapped error output
local-only unsafe feature warnings
```

Development mode must still deny:

```text
token logging
SecureString logging
unbounded body size
silent auth bypass
unsafe native bindings without explicit permission
```

---

## 23. Production Mode

Production mode should enforce:

```text
safe error responses
no stack traces in HTTP responses
strict manifest validation
strict server config validation
redacted logs
timeouts
body limits
safe shutdown
security report generation
```

Production mode should fail startup if critical requirements are missing.

Examples:

```text
missing route manifest
invalid route manifest
invalid permissions file
production route with no body limit
production route with raw body access and no reason
production webhook with no replay protection
```

Production mode should also prefer verified boot-profile artefacts over runtime
discovery. The server should load the route manifest, security policy, schema
validators and runtime plan from checked build output, verify their hashes, and
defer optional packages until after readiness.

Fast response should be implemented through:

```text
precompiled method/path dispatch
early rejection of unknown method/path before body parsing
prebuilt request and response validators
warmed security policy tables
bounded worker pools
inbound transport policy
outbound connection pools
network performance reports
```

Keep-alive must be profile-controlled. HTTP/1.x keep-alive, HTTP/2
multiplexing and HTTP/3/QUIC should be selected by deployment profile and
reported, not assumed. Connection reuse must never bypass validation, auth,
TLS policy, rate limits, body limits, timeout policy, backpressure, secret-safe
logging or graceful shutdown.

---

## 24. Example Commands

Build a project:

```bash
Galerina build
```

Serve compiled API:

```bash
Galerina serve
```

Serve with explicit manifest:

```bash
Galerina serve --manifest ./build/manifest/galerina-api-manifest.json
```

Serve on a specific port:

```bash
Galerina serve --port 8080
```

Generate reports only:

```bash
Galerina serve --check
```

Run in development mode:

```bash
Galerina serve --env development
```

Run in production mode:

```bash
Galerina serve --env production
```

---

## 25. Naming Decision

Use these names:

```text
Galerina App Kernel
galerina-framework-app-kernel
galerina-framework-api-server
galerina-api-adapters
```

Avoid using:

```text
Galerina Kernel Framework
galerina-kernal-framework
```

Reason:

```text
kernel is the correct spelling
framework sounds too large
server is clearer for the HTTP package
```

Recommended wording:

```text
Galerina App Kernel is the secure application boundary.
galerina-framework-api-server is the built-in HTTP API server implementation.
```

---

## 26. First Version Scope

The first version of `galerina-framework-api-server` should support:

```text
load route manifest
start HTTP server
match method and path
normalise request
pass request to app kernel handler
write typed response
return safe errors
support health endpoint
support body size limit
support request timeout
write simple logs
write basic report
```

Do not start with:

```text
full middleware system
plugin system
ORM integration
template rendering
WebSocket support
GraphQL server
HTTP/2
TLS automation
cluster mode
serverless adapters
admin dashboard
```

Those can come later.

---

## 27. TODO

### Phase 1: Package Setup

```text
[ ] Create /packages-galerina/galerina-framework-api-server
[ ] Add README.md
[ ] Add TODO.md
[ ] Add package.json if using TypeScript prototype
[ ] Add tsconfig.json if using TypeScript prototype
[ ] Add src/index.ts
[ ] Export createLoApiServer()
[ ] Export createLoApiHandler()
```

### Phase 2: Manifest Loading

```text
[ ] Define ApiManifest type
[ ] Load galerina-api-manifest.json
[ ] Validate manifest structure
[ ] Validate route methods
[ ] Validate route paths
[ ] Validate handler references
[ ] Fail startup on invalid manifest
[ ] Add manifest-load tests
```

### Phase 3: HTTP Server

```text
[ ] Create basic HTTP server
[ ] Support host config
[ ] Support port config
[ ] Add graceful shutdown
[ ] Add health endpoint
[ ] Add request ID generation
[ ] Add basic request logging
[ ] Add safe error responses
```

### Phase 4: Route Matching

```text
[ ] Match static routes
[ ] Match route parameters
[ ] Reject unsupported HTTP methods
[ ] Return 404 for unknown routes
[ ] Return 405 for known path but wrong method
[ ] Add route matching tests
```

### Phase 5: Request Handling

```text
[ ] Normalise headers
[ ] Enforce max body size
[ ] Enforce request timeout
[ ] Support JSON request body
[ ] Preserve raw body only when allowed
[ ] Pass normalised request to galerina-framework-app-kernel
[ ] Add request handling tests
```

### Phase 6: Response Handling

```text
[ ] Accept KernelResult
[ ] Write status code
[ ] Write response headers
[ ] Write JSON response body
[ ] Add safe default headers
[ ] Prevent unsafe header injection
[ ] Add response tests
```

### Phase 7: Kernel Integration

```text
[ ] Define AppKernel interface
[ ] Add callAppKernel()
[ ] Pass route match into kernel
[ ] Pass request context into kernel
[ ] Receive typed response from kernel
[ ] Receive typed error from kernel
[ ] Add kernel integration tests
```

### Phase 8: Server Limits

```text
[ ] Add body size limit
[ ] Add header timeout
[ ] Add body timeout
[ ] Add idle timeout
[ ] Add concurrency limit
[ ] Add memory budget placeholder
[ ] Add limit report output
```

### Phase 9: Logging and Redaction

```text
[ ] Add structured logger
[ ] Redact Authorization header
[ ] Redact Cookie header by default
[ ] Redact SecureString values
[ ] Add request ID to logs
[ ] Add route ID to logs
[ ] Add safe production logging mode
```

### Phase 10: Reports

```text
[ ] Generate api-server-report.json
[ ] Generate api-route-report.json
[ ] Generate api-failure-report.json
[ ] Include loaded routes
[ ] Include server config
[ ] Include startup warnings
[ ] Include production safety warnings
```

### Phase 11: CLI

```text
[ ] Add galerina-framework-api-server serve command
[ ] Add --manifest option
[ ] Add --port option
[ ] Add --host option
[ ] Add --env option
[ ] Add --check option
[ ] Add --report option
```

### Phase 12: Examples

```text
[ ] Add basic API example
[ ] Add webhook example
[ ] Add protected route example
[ ] Add rate-limited route example
[ ] Add idempotent order route example
```

### Phase 13: Adapter Preparation

```text
[ ] Keep createLoApiHandler() independent from HTTP listener
[ ] Make handler usable by Express/Fastify later
[ ] Document adapter contract
[ ] Add placeholder /packages-galerina/galerina-api-adapters
```

---

## 28. Future Ideas

Later versions may support:

```text
HTTP/2
WebSocket
server-sent events
streaming responses
multipart upload
serverless adapters
Cloudflare Worker adapter
AWS Lambda adapter
Express adapter
Fastify adapter
native Linux service mode
Windows service mode
Docker health checks
Kubernetes probes
Prometheus metrics
OpenTelemetry export
```

These should be added only after the basic secure API server is stable.

---

## 29. Final Principle

`galerina-framework-api-server` should make Galerina practical without making Galerina heavy.

Final rule:

```text
Galerina Core defines the language.
Galerina Runtime executes safely.
Galerina App Kernel controls API security.
galerina-framework-api-server serves HTTP.
Bespoke frameworks can reuse galerina-framework-api-server or plug directly into galerina-framework-app-kernel.
```

`galerina-framework-api-server` should be:

```text
small
strict
secure
typed
reportable
replaceable
adapter-friendly
```

It should not be:

```text
a full web framework
a CMS
an ORM
a frontend framework
a plugin marketplace
a copy of Express
a copy of Laravel
```

Best positioning:

```text
Express is a flexible web framework.
Galerina App Kernel is a secure typed API runtime.
galerina-framework-api-server is the built-in HTTP server for that runtime.
```

---

## 30. v0.2 Implementation Specification

This section captures the full v0.2 architecture depth specification for implementation.

### Architecture Position

```text
HTTP Client
    ↓
galerina-framework-api-server      ← transport boundary: parse bytes, enforce limits
    ↓
galerina-framework-app-kernel      ← govern meaning, policy, authorization
    ↓
galerina-core-runtime              ← execute typed Galerina flows
    ↓
galerina-framework-app-kernel
    ↓
galerina-framework-api-server
    ↓
HTTP Response
```

Design principle:

```text
Transport parses bytes.
Kernel governs meaning.
Runtime executes typed flows.
Reports prove what happened.
```

### Package Layout (v0.2)

```text
packages-galerina/
  galerina-framework-api-server/
    README.md
    TODO.md
    package.json           (type:module, exports, bin: galerina-api-server)
    tsconfig.json          (ES2022, NodeNext, strict)

    src/
      index.ts             (public API exports)
      cli.ts               (minimal CLI entrypoint)
      create-server.ts     (startApiServer — full 10-step pipeline)
      load-manifest.ts     (loadManifest, assertGalerinaApiManifest)
      route-table.ts       (buildRouteTable, compileRoute, :param matching)
      read-body-with-limit.ts  (streaming body limit enforcement)
      write-response.ts    (writeKernelResponse, writeJson)
      error-mapper.ts      (GalerinaHttpError, mapErrorToHttpResponse)
      webhook.ts           (verifyHmacSha256Webhook, assertWebhookVerified)
      replay-store.ts      (MemoryReplayStore implementation)
      openapi.ts           (exportOpenApi — OpenAPI 3.1 from manifest)
      safe-log.ts          (safeRequestLog — header redaction)
      types.ts             (all v0.2 interfaces and enums)

    examples/
      basic-api/manifest.json + server.ts
      webhook-api/manifest.json + server.ts

    tests/
      basic-server.test.ts
      route-table.test.ts
      body-limit.test.ts
      error-mapper.test.ts
      webhook-signature.test.ts
      replay-store.test.ts
      openapi-export.test.ts
```

### v0.2 Type Model (src/types.ts)

#### HttpMethod

```ts
export enum HttpMethod {
  GET = "GET", POST = "POST", PUT = "PUT",
  PATCH = "PATCH", DELETE = "DELETE",
  OPTIONS = "OPTIONS", HEAD = "HEAD"
}
```

#### GalerinaApiManifest

```ts
export interface GalerinaApiManifest {
  schemaVersion: "galerina.api.manifest.v2"
  api: string
  version: string
  generatedAt: string
  routes: GalerinaRouteManifest[]
}
```

#### GalerinaRouteManifest

```ts
export interface GalerinaRouteManifest {
  id: string
  method: HttpMethod
  path: string
  handler: string
  requestType?: string
  responseType: string
  policies: RoutePolicy[]
  body: BodyPolicy
  limits: RouteLimits
  reports: RouteReportPolicy
  webhook?: WebhookVerificationConfig
}
```

#### RoutePolicy (7 discriminated kinds)

```ts
export type RoutePolicy =
  | AuthRoutePolicy        // kind:"auth"   — type: "none"|"bearer"|"apiKey"|"jwt"|"oauth2"|"mtls"
  | ScopeRoutePolicy       // kind:"scope"  — required: string[]
  | BodyRoutePolicy        // kind:"body"   — maxSizeBytes, unknownFields, duplicateKeys, rawBodyRequired
  | EffectRoutePolicy      // kind:"effect" — allow: string[], deny: string[]
  | NetworkRoutePolicy     // kind:"network" — denyByDefault, allowPlainHttp, outbound[]
  | RateLimitRoutePolicy   // kind:"rateLimit" — rate: string, keyBy: "ip"|"authSubject"|"apiKey"|"route"
  | IdempotencyRoutePolicy // kind:"idempotency" — required, header, ttlSeconds, onDuplicate
```

#### BodyPolicy / RouteLimits / RouteReportPolicy

```ts
export interface BodyPolicy {
  contentType?: string
  maxSizeBytes: number
  unknownFields: "deny" | "strip" | "allow"
  duplicateKeys: "deny" | "lastWins"
  rawBodyRequired: boolean
}

export interface RouteLimits {
  rate?: string
  maxConcurrent?: number
  memoryBytes?: number
  timeoutMs?: number
}

export interface RouteReportPolicy {
  audit: boolean; security: boolean; memory: boolean
  network: boolean; failure: boolean
}
```

#### WebhookVerificationConfig

```ts
export interface WebhookVerificationConfig {
  provider: string
  secret: string           // HMAC signing secret
  signatureHeader: string  // e.g. "stripe-signature"
  timestampHeader?: string
  replayWindowSeconds: number
  expectedPrefix?: string  // e.g. "v1" → strips "v1=" prefix
  eventIdHeader?: string
  eventIdPath?: string
}
```

#### ReplayStore

```ts
export interface ReplayStore {
  exists(key: string): Promise<boolean>
  save(key: string, ttlSeconds: number): Promise<void>
}
```

`MemoryReplayStore` implementation auto-prunes expired entries.

#### Kernel Interfaces

```ts
export interface GalerinaAppKernel {
  handleApiRequest(input: HandleApiRequestInput): Promise<GalerinaKernelResponse>
}

export interface HandleApiRequestInput {
  route: GalerinaRouteManifest
  request: GalerinaKernelRequest
  replayStore?: ReplayStore
}

export interface GalerinaKernelRequest {
  method: HttpMethod; url: string; path: string
  query: Record<string, string | string[]>
  headers: Record<string, string | string[]>
  body: Buffer; rawBody?: Buffer
  remoteAddress?: string; requestId: string; receivedAt: string
}

export interface GalerinaKernelResponse {
  status: number
  headers: Record<string, string>
  body?: unknown
}

export interface StartApiServerOptions {
  manifestPath: string; port: number; host?: string
  env: "development" | "production"
  appKernel: GalerinaAppKernel
  replayStore?: ReplayStore
}
```

### GalerinaHttpError

```ts
export class GalerinaHttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly safeDetails?: Record<string, unknown>
  ) { super(message); this.name = "GalerinaHttpError" }
}
```

`mapErrorToHttpResponse()` — in development mode includes `safeDetails`; in
production returns public message only via `publicMessageForStatus(status)`.

### 10-Step Request Pipeline (src/create-server.ts)

```text
1.  Receive HTTP request
2.  Match method and path against GalerinaApiManifest
3.  Reject unknown route or invalid method before body read where possible
4.  Enforce transport-level body limit (streaming via readBodyWithLimit)
5.  Normalize headers, path, query, request-id, and raw body
6.  Verify webhook HMAC and replay policy before JSON decoding (when configured)
7.  Execute App Kernel route policies
8.  Decode and validate typed request
9.  Execute typed Galerina runtime flow and validate typed response
10. Map result/error to safe HTTP response and emit reports/logs
```

### Webhook Verification (src/webhook.ts)

```text
verifyHmacSha256Webhook() — HMAC-SHA256 with timing-safe comparison
assertWebhookVerified()   — full verification flow (HMAC + replay check)
assertWebhookNotReplayed() — timestamp window + ReplayStore.exists/save
extractSignature()        — strips prefix (e.g. "v1=abc123" → "abc123")
timingSafeHexEqual()      — constant-time hex comparison
```

Webhook HMAC verification MUST happen before JSON decoding.

### Route Table (src/route-table.ts)

`buildRouteTable(manifest)` compiles routes into regex patterns with named
`:param` segments. `RouteTable.match(method, url)` returns `RouteMatch | undefined`.

### Safe Request Logging (src/safe-log.ts)

`safeRequestLog()` redacts these headers before any log output:

```text
authorization, cookie, set-cookie, x-api-key, x-signature,
x-hub-signature, x-hub-signature-256, stripe-signature
```

Raw bodies MUST never be logged.

### OpenAPI Export (src/openapi.ts)

`exportOpenApi(manifest)` generates OpenAPI 3.1.0 from the `GalerinaApiManifest`.
OpenAPI is generated FROM the Galerina manifest — it is not the source of truth.

Includes: `bearerAuth` / `apiKeyAuth` security schemes, path parameters from
`:param` segments, request/response `$ref` schema references, standard response
codes 200/400/401/403/404/409/413/415/422/429/500.

### HTTP Status Contract (v0.2)

| Status | Use |
| -----: | --------------------------------------- |
| 200 | Successful read/update |
| 201 | Resource created |
| 202 | Accepted async job/webhook |
| 204 | Success with no body |
| 400 | Invalid request body/query/path |
| 401 | Missing or invalid authentication |
| 403 | Authenticated but not authorised |
| 404 | Route/resource not found |
| 405 | Method not allowed |
| 409 | Idempotency conflict or duplicate webhook |
| 413 | Body too large |
| 415 | Unsupported content type |
| 422 | Semantically invalid typed input |
| 429 | Rate limit exceeded |
| 500 | Internal server error |
| 503 | Service unavailable/backpressure |
| 504 | Timeout |

### Security Rules (v0.2)

```text
1. Raw request bodies MUST never be logged.
2. Authorization, cookies, API keys, and signature headers MUST be redacted from logs.
3. Production errors MUST expose public messages only.
4. Webhook HMAC verification MUST happen before JSON decoding.
5. Replay checks MUST happen before handler execution.
6. Route matching SHOULD happen before body read where possible.
7. Body limits MUST be enforced while streaming.
8. Network policy MUST be deny-by-default.
9. OpenAPI MUST be generated from the Galerina manifest.
10. App Kernel and Runtime must remain the source of semantic execution authority.
```

### What This Package May / Must Not Do

May:

```text
Accept HTTP requests; enforce transport safety; preserve raw webhook bodies
Verify webhook signatures; normalize request data; call the App Kernel
Write safe HTTP responses; export OpenAPI from manifests
```

Must not:

```text
Become a web framework; own typed Galerina semantics; bypass the App Kernel
Execute Galerina flows directly; log secrets or raw bodies
Treat OpenAPI as source of truth; silently skip policy enforcement
```
