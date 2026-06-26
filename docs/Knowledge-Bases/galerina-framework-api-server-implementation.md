# galerina-framework-api-server — Full Implementation Specification

Version: v0.2 Implementation-Ready
Status: Architecture Depth Complete
Package: `galerina-framework-api-server`
Depends On: `galerina-framework-app-kernel`, `galerina-core-runtime`,
            `galerina-core-security`, `galerina-core-network`, `galerina-core-reports`

See also: `galerina-framework-api-server-v02.md` (formal type spec),
`galerina-api-boundary-architecture.md` (prior boundary architecture).

Update status: webhook HMAC, replay and idempotency semantics must map to
`galerina-core-network-webhook.md`. Any local API-server names such as
`ReplayStore.exists/save` are adapter-level names unless this document
explicitly defines a mapping to network `has/put` and idempotency
`get/put(IdempotencyRecord)`.

---

## Architecture Position

```text
HTTP Client
    ↓
galerina-framework-api-server      ← transport boundary: parse bytes, enforce limits
    ↓
galerina-framework-app-kernel      ← govern meaning, policy, authorization
    ↓
galerina-core-runtime              ← execute typed Galerina flows
    ↓
galerina-framework-app-kernel
    ↓
galerina-framework-api-server
    ↓
HTTP Response
```

Design principle:
```text
Transport parses bytes.
Kernel governs meaning.
Runtime executes typed flows.
Reports prove what happened.
```

---

## Package Layout

```text
packages-galerina/
  galerina-framework-api-server/
    README.md
    TODO.md
    package.json           (type:module, exports, bin: galerina-api-server)
    tsconfig.json          (ES2022, NodeNext, strict)

    src/
      index.ts             (public API exports)
      cli.ts               (minimal CLI entrypoint)
      create-server.ts     (startApiServer — full 10-step pipeline)
      load-manifest.ts     (loadManifest, assertLogicnApiManifest)
      route-table.ts       (buildRouteTable, compileRoute, :param matching)
      read-body-with-limit.ts  (streaming body limit enforcement)
      write-response.ts    (writeKernelResponse, writeJson)
      error-mapper.ts      (LogicnHttpError, mapErrorToHttpResponse)
      webhook.ts           (verifyHmacSha256Webhook, assertWebhookVerified)
      replay-store.ts      (MemoryReplayStore implementation)
      openapi.ts           (exportOpenApi — OpenAPI 3.1 from manifest)
      safe-log.ts          (safeRequestLog — header redaction)
      types.ts             (all v0.2 interfaces and enums)

    examples/
      basic-api/manifest.json + server.ts
      webhook-api/manifest.json + server.ts

    tests/
      basic-server.test.ts
      route-table.test.ts
      body-limit.test.ts
      error-mapper.test.ts
      webhook-signature.test.ts
      replay-store.test.ts
      openapi-export.test.ts
```

---

## v0.2 Type Model (src/types.ts)

### HttpMethod

```ts
export enum HttpMethod {
  GET = "GET", POST = "POST", PUT = "PUT",
  PATCH = "PATCH", DELETE = "DELETE",
  OPTIONS = "OPTIONS", HEAD = "HEAD"
}
```

### LogicnApiManifest

```ts
export interface LogicnApiManifest {
  schemaVersion: "galerina.api.manifest.v2"
  api: string
  version: string
  generatedAt: string
  routes: LogicnRouteManifest[]
}
```

### LogicnRouteManifest

```ts
export interface LogicnRouteManifest {
  id: string
  method: HttpMethod
  path: string
  handler: string
  requestType?: string
  responseType: string
  policies: RoutePolicy[]
  body: BodyPolicy
  limits: RouteLimits
  reports: RouteReportPolicy
  webhook?: WebhookVerificationConfig
}
```

### RoutePolicy (7 discriminated kinds)

```ts
export type RoutePolicy =
  | AuthRoutePolicy        // kind:"auth"   — type: "none"|"bearer"|"apiKey"|"jwt"|"oauth2"|"mtls"
  | ScopeRoutePolicy       // kind:"scope"  — required: string[]
  | BodyRoutePolicy        // kind:"body"   — maxSizeBytes, unknownFields, duplicateKeys, rawBodyRequired
  | EffectRoutePolicy      // kind:"effect" — allow: string[], deny: string[]
  | NetworkRoutePolicy     // kind:"network" — denyByDefault, allowPlainHttp, outbound[]
  | RateLimitRoutePolicy   // kind:"rateLimit" — rate: string, keyBy: "ip"|"authSubject"|"apiKey"|"route"
  | IdempotencyRoutePolicy // kind:"idempotency" — required, header, ttlSeconds, onDuplicate
```

### BodyPolicy / RouteLimits / RouteReportPolicy

```ts
export interface BodyPolicy {
  contentType?: string
  maxSizeBytes: number
  unknownFields: "deny" | "strip" | "allow"
  duplicateKeys: "deny" | "lastWins"
  rawBodyRequired: boolean
}

export interface RouteLimits {
  rate?: string
  maxConcurrent?: number
  memoryBytes?: number
  timeoutMs?: number
}

export interface RouteReportPolicy {
  audit: boolean; security: boolean; memory: boolean
  network: boolean; failure: boolean
}
```

### WebhookVerificationConfig

```ts
export interface WebhookVerificationConfig {
  provider: string
  secret: string           // HMAC signing secret
  signatureHeader: string  // e.g. "stripe-signature"
  timestampHeader?: string
  replayWindowSeconds: number
  expectedPrefix?: string  // e.g. "v1" → strips "v1=" prefix
  eventIdHeader?: string
  eventIdPath?: string
}
```

Note: Uses `secret` field (not `sharedSecret`). See conflict note in
`galerina-core-network-v02.md`.

### ReplayStore

```ts
export interface ReplayStore {
  exists(key: string): Promise<boolean>
  save(key: string, ttlSeconds: number): Promise<void>
}
```

Note: Async form with `ttlSeconds` parameter. The `MemoryReplayStore`
implementation auto-prunes expired entries.

### Kernel Interfaces

```ts
export interface LogicnAppKernel {
  handleApiRequest(input: HandleApiRequestInput): Promise<LogicnKernelResponse>
}

export interface HandleApiRequestInput {
  route: LogicnRouteManifest
  request: LogicnKernelRequest
  replayStore?: ReplayStore
}

export interface LogicnKernelRequest {
  method: HttpMethod; url: string; path: string
  query: Record<string, string | string[]>
  headers: Record<string, string | string[]>
  body: Buffer; rawBody?: Buffer
  remoteAddress?: string; requestId: string; receivedAt: string
}

export interface LogicnKernelResponse {
  status: number
  headers: Record<string, string>
  body?: unknown
}

export interface StartApiServerOptions {
  manifestPath: string; port: number; host?: string
  env: "development" | "production"
  appKernel: LogicnAppKernel
  replayStore?: ReplayStore
}
```

---

## LogicnHttpError (src/error-mapper.ts)

```ts
export class LogicnHttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly safeDetails?: Record<string, unknown>
  ) { super(message); this.name = "LogicnHttpError" }
}
```

`mapErrorToHttpResponse()` — in development mode includes `safeDetails`; in
production returns public message only via `publicMessageForStatus(status)`.

---

## 10-Step Request Pipeline (src/create-server.ts)

```text
1.  Receive HTTP request
2.  Match method and path against LogicnApiManifest
3.  Reject unknown route or invalid method before body read where possible
4.  Enforce transport-level body limit (streaming via readBodyWithLimit)
5.  Normalize headers, path, query, request-id, and raw body
6.  Verify webhook HMAC and replay policy before JSON decoding (when configured)
7.  Execute App Kernel route policies
8.  Decode and validate typed request
9.  Execute typed Galerina runtime flow and validate typed response
10. Map result/error to safe HTTP response and emit reports/logs
```

---

## Webhook Verification (src/webhook.ts)

```ts
// verifyHmacSha256Webhook() — HMAC-SHA256 with timing-safe comparison
// assertWebhookVerified()   — full verification flow (HMAC + replay check)
// assertWebhookNotReplayed() — timestamp window + ReplayStore.exists/save
// extractSignature()        — strips prefix (e.g. "v1=abc123" → "abc123")
// timingSafeHexEqual()      — constant-time hex comparison
```

Webhook HMAC verification MUST happen before JSON decoding.

---

## Route Table (src/route-table.ts)

`buildRouteTable(manifest)` compiles routes into regex patterns with named
`:param` segments. `RouteTable.match(method, url)` returns `RouteMatch | undefined`.

---

## Safe Request Logging (src/safe-log.ts)

`safeRequestLog()` redacts these headers before any log output:
```text
authorization, cookie, set-cookie, x-api-key, x-signature,
x-hub-signature, x-hub-signature-256, stripe-signature
```

Raw bodies MUST never be logged.

---

## OpenAPI Export (src/openapi.ts)

`exportOpenApi(manifest)` generates OpenAPI 3.1.0 from the `LogicnApiManifest`.
OpenAPI is generated FROM the Galerina manifest — it is not the source of truth.

Includes: `bearerAuth` / `apiKeyAuth` security schemes, path parameters from
`:param` segments, request/response `$ref` schema references, standard response
codes 200/400/401/403/404/409/413/415/422/429/500.

---

## HTTP Status Contract

| Status | Use |
| -----: | --------------------------------------- |
| 200 | Successful read/update |
| 201 | Resource created |
| 202 | Accepted async job/webhook |
| 204 | Success with no body |
| 400 | Invalid request body/query/path |
| 401 | Missing or invalid authentication |
| 403 | Authenticated but not authorised |
| 404 | Route/resource not found |
| 405 | Method not allowed |
| 409 | Idempotency conflict or duplicate webhook |
| 413 | Body too large |
| 415 | Unsupported content type |
| 422 | Semantically invalid typed input |
| 429 | Rate limit exceeded |
| 500 | Internal server error |
| 503 | Service unavailable/backpressure |
| 504 | Timeout |

---

## Security Rules

1. Raw request bodies MUST never be logged.
2. Authorization, cookies, API keys, and signature headers MUST be redacted from logs.
3. Production errors MUST expose public messages only.
4. Webhook HMAC verification MUST happen before JSON decoding.
5. Replay checks MUST happen before handler execution.
6. Route matching SHOULD happen before body read where possible.
7. Body limits MUST be enforced while streaming.
8. Network policy MUST be deny-by-default.
9. OpenAPI MUST be generated from the Galerina manifest.
10. App Kernel and Runtime must remain the source of semantic execution authority.

---

## Example Manifest (orders.create route)

```json
{
  "schemaVersion": "galerina.api.manifest.v2",
  "api": "OrdersApi",
  "version": "0.2.0",
  "generatedAt": "2026-05-25T00:00:00.000Z",
  "routes": [{
    "id": "orders.create",
    "method": "POST",
    "path": "/orders",
    "handler": "createOrder",
    "requestType": "CreateOrderRequest",
    "responseType": "CreateOrderResponse",
    "policies": [
      { "kind": "auth", "type": "bearer", "required": true },
      { "kind": "scope", "required": ["orders.write"] },
      { "kind": "body", "contentType": "application/json",
        "maxSizeBytes": 262144, "unknownFields": "deny",
        "duplicateKeys": "deny", "rawBodyRequired": false },
      { "kind": "effect", "allow": ["database.write"], "deny": ["network.any"] },
      { "kind": "network", "denyByDefault": true, "allowPlainHttp": false, "outbound": [] },
      { "kind": "rateLimit", "rate": "30/minute", "keyBy": "authSubject" },
      { "kind": "idempotency", "required": true, "header": "Idempotency-Key",
        "ttlSeconds": 86400, "onDuplicate": "returnConflict" }
    ],
    "body": { "contentType": "application/json", "maxSizeBytes": 262144,
              "unknownFields": "deny", "duplicateKeys": "deny", "rawBodyRequired": false },
    "limits": { "rate": "30/minute", "maxConcurrent": 5,
                "memoryBytes": 33554432, "timeoutMs": 5000 },
    "reports": { "audit": true, "security": true, "memory": true,
                 "network": true, "failure": true }
  }]
}
```

---

## What This Package May / Must Not Do

May:
- Accept HTTP requests; enforce transport safety; preserve raw webhook bodies
- Verify webhook signatures; normalize request data; call the App Kernel
- Write safe HTTP responses; export OpenAPI from manifests

Must not:
- Become a web framework; own typed Galerina semantics; bypass the App Kernel
- Execute Galerina flows directly; log secrets or raw bodies
- Treat OpenAPI as source of truth; silently skip policy enforcement
