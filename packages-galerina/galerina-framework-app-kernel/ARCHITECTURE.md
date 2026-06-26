# Secure App Kernel Architecture

## Overview

The Secure App Kernel is an optional runtime foundation for Galerina applications. It
connects checked Galerina declarations to runtime adapters without turning Galerina into a
full application framework.

## Runtime Pipeline

```text
adapter request
  -> request normalisation
  -> security policy check
  -> auth verification
  -> body limits and content-type check
  -> typed decode and validation
  -> idempotency and replay check
  -> workload limits
  -> request Structured Await scope
  -> typed flow handler
  -> child cancellation and queue handoff policy
  -> typed response encode
  -> reports and audit events
```

Handlers should receive typed values, not unsafe raw JSON, unless a route
explicitly opts into raw access and accepts the security consequences.

## Kernel Modules

```text
request lifecycle
validation
security policy
auth providers
idempotency
replay protection
load control
jobs
queues
request await scopes
error handling
reports
adapter contracts
```

## Structured Await Policy

The Secure App Kernel owns application/request policy around Galerina Structured
Await. Galerina core defines `await`, `await all`, `await race`, `await stream` and
effect checks. `galerina-core-runtime` executes scoped work. The kernel decides how
those scopes are bounded for API requests, jobs and queue handoff.

Kernel policy should enforce:

```text
every route handler runs inside a request scope
request cancellation cancels unfinished child work unless a queue handoff was declared
route limits define maximum request timeout and maximum concurrency
external network/database awaits must have timeout policy in production
background work is denied unless represented as a typed queue/job
queue jobs declare payload, retry, timeout, idempotency/audit policy where relevant
async, timeout, queue and audit facts are reportable
```

Example route policy:

```Galerina
route GET "/dashboard/{userId}" {
  input DashboardRequest
  output DashboardResponse

  limits {
    timeoutMs 3000
    maxConcurrency 6
  }

  handler {
    await all timeout 2500ms cancelOnError {
      user = UserDb.find(input.userId)
      orders = OrderDb.recent(input.userId)
      alerts = AlertService.get(input.userId)
      permissions = AuthService.permissions(input.userId)
    }

    return DashboardResponse.from(user, orders, alerts, permissions)
  }
}
```

## Adapter Boundary

The kernel defines contracts. Concrete implementations belong in packages:

```text
HTTP adapter for Node
native server adapter
WASM edge adapter
Redis queue adapter
SQS queue adapter
Pub/Sub queue adapter
RabbitMQ queue adapter
Kafka queue adapter
SQL idempotency store adapter
OpenAPI generator package
```

## Framework Boundary

Full frameworks may build on the kernel, but the kernel must stay opinion-light.
It should not define page layouts, CMS data models, admin panels, frontend
component syntax, mandatory ORM conventions or theme systems.
