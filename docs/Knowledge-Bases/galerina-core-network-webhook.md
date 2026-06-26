# Galerina Core Network: Webhook Security Specification

Package: `packages-galerina/galerina-core-network`

Status: **fully specified v0.2, not yet implemented**

---

## Position

`galerina-core-network` defines the **contracts** for secure webhook verification.

It does not own full HTTP framework routing, TLS implementation, or application business logic.

The webhook contract surface is explicitly typed, reusable, auditable, and safe by default.

---

## Why Webhook Governance

Webhook endpoints receive requests from external systems.

Galerina treats every webhook as untrusted until it has passed four explicit checks:

```ts
// 1. HMAC verification — proves the body was signed with the shared secret
// 2. Timestamp validation — rejects stale or future-dated requests
// 3. Replay protection — rejects previously seen delivery IDs, signatures, or nonces
// 4. Idempotency validation — prevents the same business event from executing twice
```

Without these checks, webhooks expose applications to:

- forged requests
- intercepted-and-replayed payloads
- duplicate business processing
- credential injection
- timing attacks

---

## Directory Layout

```text
src/
  webhook/
    config.ts              # WebhookVerificationConfig and defaults
    hmac.ts                # verifyWebhookHmac
    timestamp.ts           # validateWebhookTimestamp
    replay.ts              # ReplayStore and validateReplayProtection
    idempotency.ts         # IdempotencyStore and validateIdempotency
    types.ts               # shared result and error types
    index.ts               # public exports
```

---

## Public Export Surface

```ts
import {
  type WebhookVerificationConfig,
  type VerifyWebhookHmacInput,
  type VerifyWebhookHmacResult,
  type ValidateWebhookTimestampInput,
  type ValidateWebhookTimestampResult,
  type ReplayStore,
  type ValidateReplayProtectionInput,
  type ValidateReplayProtectionResult,
  type IdempotencyRecord,
  type IdempotencyStore,
  type ValidateIdempotencyInput,
  type ValidateIdempotencyResult,
  verifyWebhookHmac,
  validateWebhookTimestamp,
  validateReplayProtection,
  validateIdempotency,
} from "@galerina/core-network/webhook";
```

The API is composed from small explicit functions so applications can mix verification stages per provider.

---

## `WebhookVerificationConfig`

`WebhookVerificationConfig` describes how a provider signs webhook requests.

```ts
export interface WebhookVerificationConfig {
  /** Human-readable provider name used in reports and diagnostics. */
  provider: string;

  /** Shared signing secret. Must never be logged or included in reports. */
  secret: string | Uint8Array;

  /** HMAC hash algorithm. Default is sha256. */
  algorithm?: "sha256" | "sha384" | "sha512";

  /** Header that contains the HMAC signature (e.g. x-hub-signature-256). */
  signatureHeader: string;

  /** Optional header that contains a provider timestamp (e.g. x-timestamp). */
  timestampHeader?: string;

  /** Optional header that contains a delivery/event ID for replay keying. */
  deliveryIdHeader?: string;

  /** Prefix before the signature value (e.g. sha256=). */
  signaturePrefix?: string;

  /** Maximum allowed clock skew in seconds. Default is 300 (5 minutes). */
  toleranceSeconds?: number;

  /** Encoding format for the received signature value. */
  signatureEncoding?: "hex" | "base64" | "base64url";

  /** Optional separator used when provider signs timestamp + body together. */
  signedPayloadSeparator?: string;
}
```

### Design Constraints

```ts
// The secret is always sensitive.
// It must never appear in:
// - thrown errors
// - audit events
// - structured reports
// - debug logs
// - source maps
// - network diagnostics
```

```ts
// The raw body must be used for HMAC verification.
// Parsing JSON and re-serialising changes whitespace, key ordering, and escaping.
// A valid provider signature would fail against a re-serialised payload.
```

### Example Config

```ts
const config: WebhookVerificationConfig = {
  provider: "billing-provider",
  secret: process.env.BILLING_WEBHOOK_SECRET!,
  algorithm: "sha256",
  signatureHeader: "x-billing-signature",
  timestampHeader: "x-billing-timestamp",
  deliveryIdHeader: "x-billing-delivery-id",
  signaturePrefix: "sha256=",
  toleranceSeconds: 300,
  signatureEncoding: "hex",
};
```

---

## `verifyWebhookHmac`

`verifyWebhookHmac` validates that the received signature matches the HMAC of the raw payload.

```ts
export interface VerifyWebhookHmacInput {
  config: WebhookVerificationConfig;

  /** Raw request body bytes — not parsed JSON. */
  rawBody: Uint8Array | string;

  /** Request headers normalised to a simple Record by the caller. */
  headers: Record<string, string | string[] | undefined>;

  /** Optional timestamp value when the provider signs timestamp + body together. */
  timestamp?: string;
}

export interface VerifyWebhookHmacResult {
  ok: boolean;
  provider: string;
  algorithm: string;
  signatureHeader: string;
  error?:
    | "missing_signature"
    | "unsupported_algorithm"
    | "invalid_signature_format"
    | "signature_mismatch";
}

export function verifyWebhookHmac(
  input: VerifyWebhookHmacInput,
): VerifyWebhookHmacResult;
```

### Implementation Requirements

```ts
// Use a constant-time comparison for signatures.
// Standard string equality allows timing attacks:
// the comparison exits early on a mismatch, leaking how many bytes matched.
// crypto.timingSafeEqual (Node.js) or equivalent must be used.
```

```ts
// Normalise received signatures by:
// 1. reading the configured header case-insensitively
// 2. removing the configured prefix (e.g. sha256=)
// 3. decoding according to config.signatureEncoding
// 4. rejecting malformed values immediately
```

```ts
// Build the signed payload deterministically.
// Some providers sign only the body.
// Others sign: timestamp + separator + body.
const signedPayload = timestamp
  ? `${timestamp}${config.signedPayloadSeparator ?? "."}${rawBody}`
  : rawBody;
```

### Usage

```ts
const hmacResult = verifyWebhookHmac({
  config,
  rawBody,
  headers,
  timestamp,
});

if (!hmacResult.ok) {
  // Reject before parsing or processing.
  // Do not leak the expected signature or secret in the error response.
  return reject(401, hmacResult.error);
}
```

---

## `validateWebhookTimestamp`

`validateWebhookTimestamp` rejects stale, missing, malformed, or suspicious future timestamps.

```ts
export interface ValidateWebhookTimestampInput {
  provider: string;
  timestamp: string | number | undefined;
  nowMs?: number;
  toleranceSeconds?: number;
  requireTimestamp?: boolean;
}

export interface ValidateWebhookTimestampResult {
  ok: boolean;
  provider: string;
  timestampMs?: number;
  ageSeconds?: number;
  error?:
    | "missing_timestamp"
    | "invalid_timestamp"
    | "timestamp_too_old"
    | "timestamp_too_far_in_future";
}

export function validateWebhookTimestamp(
  input: ValidateWebhookTimestampInput,
): ValidateWebhookTimestampResult;
```

### Purpose

```ts
// Timestamp validation limits the time window in which a stolen signed payload
// can be reused.
//
// Note: timestamp validation does NOT replace replay protection.
// An attacker can replay the same payload inside the valid timestamp window.
// Both controls must be applied.
```

### Usage

```ts
const timestampResult = validateWebhookTimestamp({
  provider: config.provider,
  timestamp: headers[config.timestampHeader ?? ""],
  toleranceSeconds: config.toleranceSeconds ?? 300,
  requireTimestamp: true,
});

if (!timestampResult.ok) {
  // A valid HMAC from yesterday must not be accepted today.
  return reject(401, timestampResult.error);
}
```

---

## `ReplayStore`

`ReplayStore` defines the minimal storage contract to track previously seen webhook keys.

```ts
export interface ReplayStore {
  /**
   * Returns true when the key has already been seen and is still within TTL.
   */
  has(key: string): Promise<boolean> | boolean;

  /**
   * Stores the key for the configured TTL in seconds.
   */
  put(key: string, ttlSeconds: number): Promise<void> | void;
}
```

### Replay Key Construction

```ts
// A replay key should combine provider + delivery ID + signature.
// This makes each unique delivery uniquely identifiable.
const replayKey = [
  "webhook",
  config.provider,
  deliveryId,
  signature,
].join(":");
```

```ts
// Replay keys must not include:
// - raw secrets
// - full payload contents
// - sensitive user data
```

```ts
// Production deployments must use a shared store (Redis, distributed KV)
// when multiple app instances receive webhooks behind a load balancer.
// An in-memory store is only appropriate for tests and single-instance deployments.
```

---

## `validateReplayProtection`

`validateReplayProtection` rejects previously seen webhook delivery keys.

```ts
export interface ValidateReplayProtectionInput {
  provider: string;
  replayKey: string | undefined;
  store: ReplayStore;
  ttlSeconds: number;
  requireReplayKey?: boolean;
}

export interface ValidateReplayProtectionResult {
  ok: boolean;
  provider: string;
  replayKey?: string;
  error?:
    | "missing_replay_key"
    | "replay_detected"
    | "replay_store_error";
}

export async function validateReplayProtection(
  input: ValidateReplayProtectionInput,
): Promise<ValidateReplayProtectionResult>;
```

### Suggested Implementation

```ts
export async function validateReplayProtection(input) {
  if (!input.replayKey) {
    return input.requireReplayKey
      ? { ok: false, provider: input.provider, error: "missing_replay_key" }
      : { ok: true, provider: input.provider };
  }

  // Check first: if the key exists, this is a replay.
  if (await input.store.has(input.replayKey)) {
    return {
      ok: false,
      provider: input.provider,
      replayKey: input.replayKey,
      error: "replay_detected",
    };
  }

  // Store after successful check — the next identical request is then rejected.
  await input.store.put(input.replayKey, input.ttlSeconds);

  return {
    ok: true,
    provider: input.provider,
    replayKey: input.replayKey,
  };
}
```

### Usage

```ts
const replayResult = await validateReplayProtection({
  provider: config.provider,
  replayKey: `webhook:${config.provider}:${deliveryId}:${signature}`,
  store: replayStore,
  ttlSeconds: config.toleranceSeconds ?? 300,
  requireReplayKey: true,
});

if (!replayResult.ok) {
  return reject(409, replayResult.error);
}
```

---

## `IdempotencyStore` and `IdempotencyRecord`

`IdempotencyStore` records logical event processing outcomes.

**Replay protection** answers: *Have we seen this signed request before?*

**Idempotency** answers: *Have we already processed this business event?*

```ts
export interface IdempotencyRecord {
  key: string;
  provider: string;
  status: "processing" | "processed" | "failed";
  createdAtMs: number;
  expiresAtMs?: number;
}

export interface IdempotencyStore {
  get(
    key: string,
  ): Promise<IdempotencyRecord | undefined> | IdempotencyRecord | undefined;

  put(
    record: IdempotencyRecord,
    ttlSeconds?: number,
  ): Promise<void> | void;
}
```

### Status Semantics

```ts
// "processing"
// The event is currently being handled.
// A concurrent request for the same key should wait or reject.

// "processed"
// The event completed successfully.
// Future requests for the same key should be safely short-circuited.

// "failed"
// The event failed.
// Depending on policy, retries may be allowed for failed events.
```

---

## `validateIdempotency`

`validateIdempotency` prevents duplicate business event processing.

```ts
export interface ValidateIdempotencyInput {
  provider: string;
  idempotencyKey: string | undefined;
  store: IdempotencyStore;
  ttlSeconds?: number;
  nowMs?: number;
  requireIdempotencyKey?: boolean;
}

export interface ValidateIdempotencyResult {
  ok: boolean;
  provider: string;
  idempotencyKey?: string;
  status?: "new" | "processing" | "processed" | "failed";
  error?:
    | "missing_idempotency_key"
    | "already_processing"
    | "already_processed"
    | "idempotency_store_error";
}

export async function validateIdempotency(
  input: ValidateIdempotencyInput,
): Promise<ValidateIdempotencyResult>;
```

### Suggested Implementation

```ts
export async function validateIdempotency(input) {
  if (!input.idempotencyKey) {
    return input.requireIdempotencyKey
      ? { ok: false, provider: input.provider, error: "missing_idempotency_key" }
      : { ok: true, provider: input.provider, status: "new" };
  }

  const existing = await input.store.get(input.idempotencyKey);

  if (existing?.status === "processing") {
    return {
      ok: false,
      provider: input.provider,
      idempotencyKey: input.idempotencyKey,
      status: "processing",
      error: "already_processing",
    };
  }

  if (existing?.status === "processed") {
    return {
      ok: false,
      provider: input.provider,
      idempotencyKey: input.idempotencyKey,
      status: "processed",
      error: "already_processed",
    };
  }

  // Mark as processing before handling.
  await input.store.put(
    {
      key: input.idempotencyKey,
      provider: input.provider,
      status: "processing",
      createdAtMs: input.nowMs ?? Date.now(),
    },
    input.ttlSeconds,
  );

  return {
    ok: true,
    provider: input.provider,
    idempotencyKey: input.idempotencyKey,
    status: "new",
  };
}
```

### Usage

```ts
const idempotencyKey = [
  "webhook-event",
  config.provider,
  event.id,
].join(":");

const idempotencyResult = await validateIdempotency({
  provider: config.provider,
  idempotencyKey,
  store: idempotencyStore,
  ttlSeconds: 86400,
  requireIdempotencyKey: true,
});

if (!idempotencyResult.ok) {
  return reject(409, idempotencyResult.error);
}
```

---

## End-to-End Verification Pipeline

Correct verification order:

```ts
async function handleWebhook(request: Request) {
  const rawBody = await request.text();
  const headers = Object.fromEntries(request.headers.entries());

  // Step 1. Validate timestamp first — cheapest check.
  const timestampResult = validateWebhookTimestamp({
    provider: config.provider,
    timestamp: headers[config.timestampHeader!],
    toleranceSeconds: config.toleranceSeconds,
    requireTimestamp: true,
  });
  if (!timestampResult.ok) {
    return new Response("Invalid webhook timestamp", { status: 401 });
  }

  // Step 2. Verify HMAC over raw body.
  const hmacResult = verifyWebhookHmac({
    config,
    rawBody,
    headers,
    timestamp: headers[config.timestampHeader!],
  });
  if (!hmacResult.ok) {
    return new Response("Invalid webhook signature", { status: 401 });
  }

  // Step 3. Replay protection — reject duplicate deliveries.
  const deliveryId = headers[config.deliveryIdHeader!];
  const signature = headers[config.signatureHeader];
  const replayResult = await validateReplayProtection({
    provider: config.provider,
    replayKey: `webhook:${config.provider}:${deliveryId}:${signature}`,
    store: replayStore,
    ttlSeconds: config.toleranceSeconds ?? 300,
    requireReplayKey: true,
  });
  if (!replayResult.ok) {
    return new Response("Duplicate webhook delivery", { status: 409 });
  }

  // Step 4. Parse JSON only after cryptographic verification.
  const event = JSON.parse(rawBody);

  // Step 5. Idempotency — reject duplicate business events.
  const idempotencyResult = await validateIdempotency({
    provider: config.provider,
    idempotencyKey: `webhook-event:${config.provider}:${event.id}`,
    store: idempotencyStore,
    ttlSeconds: 86400,
    requireIdempotencyKey: true,
  });
  if (!idempotencyResult.ok) {
    return new Response("Event already handled", { status: 409 });
  }

  // Safe to process.
  await processWebhookEvent(event);
  return new Response("ok", { status: 200 });
}
```

---

## Security Rules

```ts
// Rule 1: Always verify the raw body, never parsed JSON.
```

```ts
// Rule 2: Use constant-time comparison for signatures.
```

```ts
// Rule 3: Reject missing, malformed, stale, or future timestamps when required.
```

```ts
// Rule 4: Apply replay protection even when timestamp validation is active.
// Both controls serve different threat models.
```

```ts
// Rule 5: Apply idempotency for business events, not just HTTP deliveries.
```

```ts
// Rule 6: Never log secrets, raw signatures, full payloads, or sensitive headers.
```

```ts
// Rule 7: Production replay and idempotency stores must be shared across instances.
```

---

## Diagnostic Codes

These error codes appear in `error` fields of result types.

| Code | Meaning |
|---|---|
| `missing_signature` | No signature header present |
| `unsupported_algorithm` | Algorithm not in sha256/sha384/sha512 |
| `invalid_signature_format` | Signature could not be decoded |
| `signature_mismatch` | HMAC digest does not match |
| `missing_timestamp` | No timestamp header present |
| `invalid_timestamp` | Timestamp is not a parseable number |
| `timestamp_too_old` | Timestamp falls outside the tolerance window |
| `timestamp_too_far_in_future` | Timestamp is suspiciously ahead of server time |
| `missing_replay_key` | No replay key supplied when required |
| `replay_detected` | Replay key already exists in store |
| `replay_store_error` | Store lookup or write failed |
| `missing_idempotency_key` | No idempotency key supplied when required |
| `already_processing` | Event is currently being processed |
| `already_processed` | Event was already processed successfully |
| `idempotency_store_error` | Store lookup or write failed |

---

## Non-Goals

This package must not implement:

```text
full webhook route handling
provider-specific business logic
HTTP server lifecycle
TLS internals
database-specific replay store adapters
Redis-specific idempotency stores
application event processing
payment or billing provider SDKs
```

---

## Implementation Checklist

- [ ] Add `src/webhook/config.ts` — `WebhookVerificationConfig`
- [ ] Add `src/webhook/hmac.ts` — `VerifyWebhookHmacInput`, `VerifyWebhookHmacResult`, `verifyWebhookHmac`
- [ ] Add `src/webhook/timestamp.ts` — `ValidateWebhookTimestampInput`, `ValidateWebhookTimestampResult`, `validateWebhookTimestamp`
- [ ] Add `src/webhook/replay.ts` — `ReplayStore`, `ValidateReplayProtectionInput`, `ValidateReplayProtectionResult`, `validateReplayProtection`
- [ ] Add `src/webhook/idempotency.ts` — `IdempotencyRecord`, `IdempotencyStore`, `ValidateIdempotencyInput`, `ValidateIdempotencyResult`, `validateIdempotency`
- [ ] Add `src/webhook/types.ts` — shared utility types
- [ ] Add `src/webhook/index.ts` — public export surface
- [ ] Unit test: missing signature headers
- [ ] Unit test: malformed signature encodings
- [ ] Unit test: valid and invalid HMAC signatures
- [ ] Unit test: constant-time comparison behaviour
- [ ] Unit test: old, future, missing, and valid timestamps
- [ ] Unit test: replay detection with in-memory `ReplayStore`
- [ ] Unit test: idempotency detection with in-memory `IdempotencyStore`
- [ ] Ensure diagnostics and reports redact secrets and sensitive headers

---

## Final Contract Summary

```text
WebhookVerificationConfig
verifyWebhookHmac (VerifyWebhookHmacInput → VerifyWebhookHmacResult)
validateWebhookTimestamp (ValidateWebhookTimestampInput → ValidateWebhookTimestampResult)
ReplayStore { has(key), put(key, ttlSeconds) }
validateReplayProtection (ValidateReplayProtectionInput → Promise<ValidateReplayProtectionResult>)
IdempotencyRecord { key, provider, status:"processing"|"processed"|"failed", createdAtMs, expiresAtMs? }
IdempotencyStore { get(key), put(record, ttlSeconds?) }
validateIdempotency (ValidateIdempotencyInput → Promise<ValidateIdempotencyResult>)
```

The implementation must be:

- secure by default
- secret-safe in all diagnostics and error values
- compatible with Galerina's network governance model (encrypted, authenticated, permissioned, auditable)
