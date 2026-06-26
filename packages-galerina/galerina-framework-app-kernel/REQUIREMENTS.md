# Secure App Kernel Requirements

## Core Requirements

- Provide a safe request lifecycle for Galerina applications.
- Decode raw API input into strict typed values before handlers run.
- Enforce route, webhook and job security policy declared by Galerina source.
- Treat routes as compiled security graph entries with known method, path
  parameters, request/response types, auth, authorization, CSRF/CORS, rate
  limits, resource limits, effects, response filtering and audit rules.
- Enforce typed HTTP response contracts, including status/body type pairing,
  content type, cache policy, security headers, cookie policy, redirect safety,
  field filtering and safe error exposure.
- Treat routes, typed actions/handlers, policies, effects and reports as the
  secure API core. Traditional controllers must not be required by the app
  kernel.
- Allow controller-style grouping only as optional framework sugar that compiles
  into the same route graph and does not hide auth, CSRF, object access,
  idempotency, validation, limits, audit or effects.
- Support auth provider declarations without hard-coding one identity system.
- Enforce declared `.env` secret policy before handlers, webhooks, workers or
  jobs can read secrets.
- Reject secret values flowing into logs, errors, cache, LLM input, build
  output, reports or undeclared outbound hosts unless an explicit safe sink
  policy allows metadata-only or controlled use.
- Generate secret reports with names, required flags, scopes, allowed
  operations, allowed destinations, fingerprints and exposure status, but no
  secret values.
- Enforce CSRF policy before state-changing cookie-authenticated route handlers
  run.
- Enforce crash boundaries around routes, webhooks, workers and scheduled tasks
  that can perform state-changing work, call external systems or process
  sensitive operations.
- Support app-level `crash_policy` defaults for safe responses, source-map
  metadata, checkpoints, request/job IDs, compute target metadata and secret
  redaction.
- Distinguish expected typed errors from external failures and unexpected
  panic/crash states in route and job reports.
- Generate structured crash-risk and crash reports that are safe for operators
  and AI tools to inspect.
- Support supervised worker restart policy, bounded retries, backoff and
  crash-loop detection without becoming a queue product.
- Reject state-changing `GET`, `HEAD` and `OPTIONS` routes during route checks.
- Reject routes with user-supplied object identifiers when no object-level
  authorization rule is declared or inherited.
- Reject route responses that expose sensitive/private fields without a
  property-level response filter or explicit policy.
- Reject raw responses, public caching on private routes, unsafe redirects,
  unsafe cookies, missing content types, missing `nosniff`, deprecated security
  headers and stack-trace exposure in production profiles.
- Reject handler effects that exceed the route's declared database, network,
  file, AI, cache, secret or shell permissions.
- Distinguish cookie/session authentication, where CSRF is required, from
  explicit bearer-token/API-header authentication, where CSRF may be explicitly
  marked not required.
- Generate CSRF route report fields for protected, exempted and unsafe routes.
- Support idempotency and replay protection for risky side effects.
- Support memory, timeout, concurrency and rate-limit policies.
- Support request-scoped Structured Await policy so child work is cancelled,
  completed or queued according to explicit route/job policy.
- Deny hidden background work by default; require typed queue/job handoff for
  work that outlives a request.
- Support queue and job contracts without becoming a queue product.
- Generate machine-readable runtime and audit reports.
- Provide a non-compiled checked Run Mode smoke test for basic framework
  development feedback.

## Boundary Requirements

- The kernel is optional.
- Galerina core must remain usable without the kernel.
- Frameworks can build on the kernel.
- The kernel must not become a CMS, admin UI, ORM, page builder, frontend
  framework or template system.

## Example Stack

```text
Galerina language
  -> Galerina Secure App Kernel
  -> Galerina HTTP Adapter for Node / native server / WASM edge
  -> optional framework such as Galerina Web, Galerina CMS, Galerina API Framework, React adapter or Angular adapter
```

## Test Requirements

The package should keep a hello-world `.spore` fixture that runs through Galerina core
Run Mode without compiling:

```bash
npm.cmd --prefix packages-galerina/galerina-framework-app-kernel run test:hello
```

The package should also keep small checked Run Mode fixtures for vector-style
function calls, integer sums, decimal sums and JSON payload return shapes:

```bash
npm.cmd --prefix packages-galerina/galerina-framework-app-kernel test
```
