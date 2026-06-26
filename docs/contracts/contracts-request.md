# Contracts: Request

## Purpose

A request contract defines data accepted from an external caller.

## Short Definition

Request contracts are typed input boundaries.

## Syntax

```galerina
type CreateOrderRequest {
  sku: String
  quantity: Int
}
```

## Security Rules

- Input starts untrusted.
- Unknown fields are rejected or reported.
- Field types are validated before flow logic.
- Request size and parsing limits must be route-visible.

## Generated Reports

```text
request-contract-report.json
validation-report.json
route-input-report.json
```

## v1 Scope

Typed JSON request contracts and strict decode reports.
