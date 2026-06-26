# Contracts: Flow

## Purpose

A flow contract defines executable application behavior.

## Short Definition

Flow contracts combine parameters, return type, recoverable errors and effects.

## Syntax

```galerina
secure flow createOrder(request: CreateOrderRequest)
  -> Result<OrderResponse, OrderError>
effects [database.write] {
  ...
}
```

## Security Rules

- Flow effects must be explicit.
- Recoverable errors must be visible in the return type.
- Secret values must not escape safe scopes.
- Flow reports must connect to route and policy reports.

## Generated Reports

```text
flow-contract-report.json
effect-report.json
error-report.json
```

## v1 Scope

`secure flow`, explicit return types, `Result`, `Option`, `match` and effects.
