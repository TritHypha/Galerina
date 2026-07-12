# Framework: Events

## Purpose

Events define asynchronous or externally delivered payloads that cross a Galerina
boundary.

Events are useful for queues, webhooks, background workers and data-platform
integrations, but they should not replace the core request/flow/response model
for normal API execution.

## Short Definition

An event is a typed message that enters, leaves or moves through the system
outside a direct request/response call.

## Boundary Role

Events belong under the core `boundary` concept:

```text
boundary = package + storage + external + event + AI/tool + compute
```

An event crosses a trust boundary because it may be produced by another service,
queue, webhook provider, package, job or runtime component.

## Syntax Example

```galerina
event OrderCreated {
  orderId: UUID view: public
  customerId: UUID view: internal
  total: Money view: regulated
}
```

```galerina
contract event OrderCreatedContract {
  event OrderCreated
  topic "orders.created"
  schemaVersion "1"
  idempotency required
  deny view: secret
}
```

## Security Rules

- Event payloads must be typed.
- Event payloads must classify fields.
- Event handlers must validate schema version.
- External event sources must be authenticated where possible.
- Webhooks and queues must use idempotency or replay protection for
  state-changing work.
- Events must not carry secrets unless an explicit secure event boundary exists.
- Event handlers must declare effects and permissions before writing data,
  calling external services or publishing follow-up events.
- Unknown event kinds must be handled explicitly with typed errors, safe ignored
  responses, quarantine or review.

## V1 Position

Events are a documented boundary concept for v1 planning, but full queue, job,
schedule and event-runtime implementation can remain later work unless required
by a secure web runtime feature such as webhooks.

## Generated Reports

```text
event-boundary-report.json
event-contract-report.json
event-idempotency-report.json
event-replay-report.json
```

## Knowledge Base

See [Boundary Extension Concepts](../../../ZTF-Knowledge-Bases/boundary-extension-concepts.md).
