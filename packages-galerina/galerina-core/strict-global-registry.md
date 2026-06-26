# Galerina Strict Global Registry

This document describes the proposed Strict Global Registry feature for Galerina /
Galerina.

The registry provides one safe, typed and auditable place to define project-wide
readonly values, runtime configuration, secrets and controlled shared state.

## Summary

```text
Local state by default.
Registered runtime configuration when needed.
Mutable global state restricted.
Secrets protected through SecureString.
```

## Core Principle

```text
Local variables belong to flows.
Shared values belong to vaults or approved registry declarations.
Mutable global state should be explicit, controlled and rare.
```

## Local Variables

Variables declared inside a `flow` should stay inside that flow and be cleaned
up when the flow finishes.

```Galerina
secure flow createOrder(input: CreateOrderRequest) -> Result<Order, OrderError> {
  let orderId: OrderId = generateOrderId()
  let total: Money<GBP> = calculateTotal(input.items)

  return Ok(Order {
    id: orderId
    total: total
  })
}
```

Sensitive values should usually stay local for as short a time as possible.

## Global Registry

Project-wide values should be declared in `boot.spore`.

```Galerina
globals {
  readonly APP_NAME: String = "OrderRiskDemo"
  readonly APP_VERSION: String = "0.1.0"

  config APP_PORT: Int = env.int("APP_PORT", default: 8080)
  config API_TIMEOUT: Duration = 5s
  config MAX_BODY_SIZE: Size = 1mb

  secret PAYMENT_WEBHOOK_SECRET: SecureString = env.secret("PAYMENT_WEBHOOK_SECRET")
  secret PAYMENTS_API_KEY: SecureString = env.secret("PAYMENTS_API_KEY")
}
```

Recommended v0.1 categories:

```text
readonly
config
secret
vault
```

## Readonly Values

Use `readonly` for values that do not change after creation, such as
application names, versions, fixed limits and known identifiers.

`const` is deferred for v0.1. Add it later only if Galerina needs compile-time
constants distinct from runtime readonly values.

## Runtime Config

Use `config` for runtime configuration such as ports, timeouts, feature flags,
body limits and deployment settings.

Config values may come from `.env` during local development, server environment
variables, container secrets, cloud configuration or deployment platform
variables.

## Secrets

Use `secret` for sensitive runtime values.

Secrets must use `SecureString`.

Secret values must not be:

```text
printed
logged
compiled into binaries
included in AI guides
included in generated documentation
included in source maps as values
```

## Controlled State

Use `vault` for controlled shared runtime state.

```Galerina
vault {
  OrderCache: Shared<Map<OrderId, Order>> {
    access "locked"
    max_size 10000
    ttl 10m
  }
}
```

Shared state should always define access control, size limits, lifetime rules
and concurrency behaviour.

## Reports

Galerina builds generate:

```text
app.global-report.json
app.security-report.json
app.ai-context.json
app.map-manifest.json
docs/global-registry-guide.md
```

Secret values are always redacted.

## AI Guide Integration

The AI guide should include global names, types and categories without exposing
secret values.

## Source Map Integration

Global registry values are source-mapped. If a global is misused, the compiler
should point to both where it was declared and where it was used incorrectly.

## Compiler Checks

The compiler should check:

```text
missing global types
secret values assigned to String
SecureString printed or logged
duplicate global names
unsafe mutation of global config or readonly values
vault/state without access control
```

## Build Manifest Integration

The build manifest includes a hash of the global registry structure and the
required environment variables. It must not include secret values.

## Run Mode and Compile Mode

In Run Mode, Galerina should load and validate registry values before execution.

In Compile Mode, Galerina should validate the registry and include it in reports,
deployment docs, the map manifest and AI context.

## Final Rule

```text
Local by default.
Shared by vault declaration.
Mutable only by controlled vault state.
Secrets always protected.
```
