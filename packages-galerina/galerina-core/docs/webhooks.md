# Webhooks

Galerina should support secure webhook handling as a first-class API pattern.
Galerina core defines the webhook contract and reports. The optional Galerina Secure App
Kernel enforces verification, replay protection, idempotency and typed decode at
runtime when an application uses a kernel-backed adapter.

## Current Canonical Package Contract

The package-owned v0.2 webhook contract lives in
`../../../../ZTF-Knowledge-Bases/galerina-core-network-webhook.md` and
`../../galerina-core-network/README.md`.

Use these canonical names unless an adapter explicitly maps local names:

```text
WebhookVerificationConfig.secret: string | Uint8Array
ReplayStore.has(key)
ReplayStore.put(key, ttlSeconds)
IdempotencyStore.get(key)
IdempotencyStore.put(IdempotencyRecord, ttlSeconds?)
```

Older `sharedSecret`, `exists/save` and `has/store` wording is legacy or
adapter-specific and must not be treated as the canonical network package API.

## Required Defaults

```text
HMAC verification
replay protection
idempotency key support
payload size limits
typed JSON decoding
structured diagnostics
safe logging
secret redaction
```

## Rule

Webhook failures should return explicit errors and should never expose secrets in generated reports.

## Boundary

A `webhook` block is not a general API route group.

It is a secured inbound event boundary for provider callbacks such as payment events, subscription events, repository events or third-party system notifications.

Use `api` for normal request/response product routes.

Use `service` for listener ownership, health routes and mounting APIs or webhooks.

Webhook compiler checks should require:

```text
method
path
handler
payload size limit
signature or explicit development-mode override
replay protection or explicit development-mode override
idempotency key or explicit reason why replayed events are harmless
```

Duplicate webhook events should be handled through replay protection and
idempotency metadata. Detailed duplicate API, webhook duplicate and
idempotency planning lives in
`docs/api-duplicate-detection-and-idempotency.md`.
