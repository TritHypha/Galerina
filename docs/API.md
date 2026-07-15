# API

## API Serving Model

Galerina API serving is split across three layers:

```text
Galerina Core
  defines API contracts, types, diagnostics and generated reports

Galerina App Kernel
  enforces validation, auth, idempotency and typed handler dispatch
  (rate-limit POLICY is declared per route; kernel enforcement is planned — not yet wired)

galerina-framework-api-server
  serves HTTP, loads route manifests and passes normalised requests to the kernel
```

`galerina-framework-api-server` is the default built-in HTTP API server package for simple Galerina API
services. Bespoke frameworks can use it directly, use `galerina-framework-app-kernel` directly,
or later use adapter packages such as Express, Fastify, Lambda or Cloudflare
Workers.

Galerina should support server ecosystems without becoming them. Nginx, Apache
and Caddy are deployment/reverse-proxy targets; Node.js is a tooling platform
and optional runtime target; Express and similar frameworks are optional
adapters; the long-term preferred runtime is a Galerina-native secure API server.
See `SERVER_PLATFORM_SUPPORT.md`.

## Runtime Flow

```text
HTTP request
  -> galerina-framework-api-server
  -> galerina-framework-app-kernel
  -> Galerina runtime / typed Galerina flow
  -> galerina-framework-app-kernel
  -> galerina-framework-api-server
  -> HTTP response
```

## Boundaries

`galerina-framework-api-server` owns:

```text
HTTP listener
request normalisation
route manifest loading
server-level body limits
server timeouts
safe response writing
health endpoint
safe server logs
runtime report files
graceful shutdown
```

`galerina-framework-app-kernel` owns:

```text
route matching policy
typed request decoding
auth and scopes
idempotency
webhook replay protection
rate-limit policy (declared per route; enforcement gate planned, not yet wired)
memory budget policy
effect policy
typed handler execution
audit reports
```

Galerina Core owns:

```text
language syntax
API contract checks
schema generation
OpenAPI generation (planned — no shipped generator yet)
source maps
diagnostics
security report contracts
```

## Secure Fast Routing

Routes should compile into a typed route graph and route manifest. The manifest
should include method, path parameters, request/response types, auth, CSRF,
CORS, rate limits, object/property authorization, declared effects, body limits,
timeouts, concurrency limits and audit policy.

At runtime, route matching should use method-indexed precompiled lookup rather
than scanning loose route strings. Invalid requests should be rejected before
expensive parsing, auth, database, network or handler work.

See `SECURE_FAST_ROUTING.md`.

## Response And Error Handling Style

Galerina should support both readable `try`/`catch` style and explicit `match`
style for `Result<T, E>` values:

```text
try/catch = simple readable application flow
match     = explicit branch-by-branch logic
```

Future targets such as GPU, photonic or AI accelerator backends should not make
either style legacy. They should affect internal compilation, not force
developers to rewrite clear source code.

Preferred naming:

```text
Http         = framework HTTP response builder
AppResponses = app response body schemas
```

Example:

```Galerina
return Http.created(
  AppResponses.Order.from(order)
)
```

Routes should declare allowed HTTP responses, and handlers/actions should not
return undeclared statuses or body schemas. Use `match` when every possible
result branch matters; use `try`/`catch` for simple happy-path code with safe
generic error mapping.

See `API_RESPONSE_ERROR_HANDLING.md`.

HTTP responses should also be typed security contracts. Each route response
should declare status code, body type, content type, cache policy, security
header profile, cookie policy where relevant and response field filtering.
Raw responses should be denied by default outside trusted low-level packages.

See `SECURE_HTTP_RESPONSES.md`.

## Controller Policy

Galerina should not require MVC controllers as a core API concept.

The API model is:

```text
route contract
typed request
typed response
security policy
declared effects
handler / action
generated route report
```

Controller-style grouping may be supported later by framework adapters, but it
must compile into the same route manifest and route graph. It must not hide
auth, CSRF, object access, idempotency, validation, rate limits, audit or
effects from the compiler, app kernel or reports.

See `why-controllers-not-used-in-Galerina.md`.

## Non-Goals

`galerina-framework-api-server` must not become:

```text
a full web framework
a CMS
an ORM
a template engine
a frontend router
a React/Angular/Vue component system
a middleware marketplace
business logic
payment provider logic
email provider logic
```

Those belong in packages, frameworks or application code.

## First Practical Target

The first version should focus on:

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
write basic reports
```
