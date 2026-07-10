# Galerina Secure App Kernel

> **APP-LAYER TEMPLATE / SCAFFOLD — not a finished package.**
> `galerina-framework-app-kernel` is one of three **app-layer framework templates**
> (`galerina-framework-app-kernel`, `galerina-framework-api-server`,
> `galerina-framework-example-app`). It sits **above** the Galerina language + core
> runtime and exists to scaffold how an app *would* run as a governed service — it
> is **not** part of the Galerina language or compiler, and it is **not** the
> workspace default build target. The single source of truth for what this layer
> is, is explicitly NOT, and the phased build order is the layer design doc:
> [`../../../ZTF-Knowledge-Bases/galerina-framework-layer-design.md`](../../../ZTF-Knowledge-Bases/galerina-framework-layer-design.md).
> Anything here may change as the design doc's phases (P1+) are approved and built.

The Galerina Secure App Kernel is the optional partial framework layer for Galerina
applications. It is not a full web framework.

Its job is to enforce safe runtime boundaries that the language and compiler can
describe:

```text
receive requests
validate input
apply security policy
rate-limit traffic
decode typed data
control memory
route to typed flows
handle errors
contain crashes
queue heavy work
generate reports
```

The kernel is route-first and contract-first. It must not require traditional
MVC controllers. Routes define contracts, typed actions/handlers perform work,
policies define security, effects define allowed access and reports explain the
result. Controller-style grouping may exist later as framework sugar only if it
compiles into the same secure route graph.

## Position

```text
Galerina Core
  strict types, flows, effects, memory safety, compute planning, compiler reports

Galerina Standard Library
  Json, Xml, SafeHtml, File, Stream, Request, Response, DateTime, Money, SecureString

Galerina Secure App Kernel
  optional runtime layer for APIs, routing, validation, auth, rate limits, jobs and reports

Full Frameworks
  CMS, admin panels, UI systems, templates, ORM, page builders and frontend adapters
```

Final rule:

```text
Galerina the language defines safety.
Galerina the kernel enforces safe runtime boundaries.
Frameworks provide opinions and user-facing structure.
```

## Responsibilities

- Typed API request and response boundaries.
- Route-first contract enforcement for route declarations, typed actions,
  policies, effects, limits and generated route reports.
- Response policy enforcement for status/body contracts, content types,
  cache rules, security header profiles, field filtering, safe errors, safe
  cookies and safe redirects.
- Runtime enforcement of `boot.fungi` security policy.
- Strict input validation before handlers run.
- Deny-by-default application effects for file, network, database, shell, AI,
  GPU and interop access unless declared by policy.
- Network policy consumption from `galerina-core-network`, including inbound
  ports, outbound host allowlists, TLS requirements, raw socket restrictions,
  timeout policy and backpressure.
- Production gates for auth, rate limits, typed input, secret-safe logging,
  unsafe interop, raw SQL and shell execution.
- Runtime secret policy enforcement for declared `.env` secrets, protected
  `Secret<T>` references, scope checks, secret lifetime blocks, safe sinks and
  secret reports.
- Auth provider boundaries for bearer tokens, JWT, OAuth2/OIDC, DPoP, mTLS,
  API keys, webhook signatures and capability tokens.
- CSRF policy enforcement for cookie-authenticated state-changing browser
  routes, including token checks, Fetch Metadata checks, Origin/Referer checks,
  SameSite cookie posture and denial of state-changing read-safe methods.
- Crash policy enforcement for routes, webhooks, workers and scheduled tasks,
  including typed error mapping, safe panic/crash containment, safe responses,
  secret-safe crash reports, checkpoint metadata and crash-loop detection.
- Idempotency and replay protection policy.
- Workload control for rate limits, concurrency limits, memory budgets,
  timeouts, queue handoff and backpressure.
- Request-scoped Structured Await policy for `await all`, `await race`,
  cancellation, external wait timeouts and bounded stream processing.
- Standard job contracts and queue-driver boundaries.
- Runtime reports for APIs, auth, idempotency, memory, load control, data and
  target behaviour.

## Startup And Fast Response

The app kernel should consume verified boot-profile artefacts instead of
discovering route and security policy at production startup.

Build/check time may provide:

```text
route graph
policy graph
request validators
response validators
effects map
permission table
runtime plan
startup report
```

At boot, the kernel should verify those artefacts, preload the route table,
preload security policy, warm common validators and become ready before
deferred optional packages start.

Fast response should come from a known-safe path:

```text
precompiled route lookup
prevalidated request schema
preloaded permission and effect policy
bounded request body handling
warmed typed flow dispatch
safe response projection
runtime and security reports
```

The kernel must still reject invalid requests early and must not let startup
warmup bypass auth, validation, rate limits, idempotency, replay protection,
body limits, secret policy or audit requirements.

## Non-Goals

The kernel must not include:

```text
CMS
admin dashboard
page builder
theme system
React clone
Angular clone
mandatory template engine
mandatory ORM
search engine
media editor
AI platform
```

Those belong in packages or full frameworks built on top of the kernel.

## Reports

Kernel-enabled builds should be able to generate:

```text
app.api-manifest.json
app.security-report.json
app.response-security-report.json
app.secret-report.json
app.auth-report.json
app.csrf-report.json
app.crash-risk-report.json
app.crash-report.json
app.idempotency-report.json
app.memory-report.json
app.load-control-report.json
app.data-report.json
app.target-report.json
app.ai-guide.md
app.map-manifest.json
```

## Checked Test Run

The kernel package can run checked fixtures through Galerina core Run Mode. This is
not a compiled build.

```bash
npm.cmd --prefix packages-galerina/galerina-framework-app-kernel test
```

Current fixtures cover:

```text
hello-world.fungi
vector-function.fungi
sum.fungi
decimal-sum.fungi
json-return.fungi
```

The hello-world fixture uses:

```Galerina
secure flow main() -> Result<Void, Error> {
  console.log("hello from Galerina app kernel test")
  return Ok()
}
```
