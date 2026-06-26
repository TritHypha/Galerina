# Contracts: Model

## Purpose

A model contract defines internal application data.

## Short Definition

Model contracts describe view-governed internal data the application owns or
processes. They are security contracts, not public DTOs and not active-record
database objects.

## Syntax

```galerina
model Order {
  id: UUID view: public
  userId: UUID view: internal
  total: Money view: regulated
  status: OrderStatus view: public
}
```

## Security Rules

- Internal models are not public output contracts.
- Production fields must declare a view.
- Storage shape and API shape should be separate.
- Models should not own hidden storage effects.
- Model mutations should be explicit and policy-controlled.
- Relationships should be explicit and reportable.
- Model exposure reports must show possible public leaks.

## Generated Reports

```text
model-index.json
model-definitions.json
model-effective.json
model-exposure.json
model-relationships.json
model-mutation-report.json
model-ai-summary.json
```

## v1 Scope

Typed records, field views and exposure reports.

## Knowledge Base

See [Model Security Contracts](../Knowledge-Bases/model-security-contracts.md).
