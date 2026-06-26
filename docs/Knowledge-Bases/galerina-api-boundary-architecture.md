# Galerina API Boundary Architecture

## Definition

The Galerina API boundary is the layer where untrusted external HTTP input enters
the governed Galerina runtime. It is not a general web framework — it is a
typed, permissioned, auditable, memory-bounded, secret-safe request gateway.

## Package

```text
galerina-framework-api-server   — HTTP transport, body limits, server, logs
galerina-framework-app-kernel   — request lifecycle, route policy, validation
```

## Status

```text
Architecture specified — not yet implemented.
New package: galerina-framework-api-server must be created.
```

---

## Request Flow

```text
HTTP Client
    ↓
galerina-framework-api-server
    ↓
galerina-framework-app-kernel
    ↓
galerina-core-runtime
    ↓
typed Galerina flow
    ↓
galerina-core-runtime
    ↓
galerina-framework-app-kernel
    ↓
galerina-framework-api-server
    ↓
HTTP Response
```

Principle:

```text
Transport parses bytes.
Kernel governs meaning.
Runtime executes typed flows.
Reports prove what happened.
```

### Detailed Step Sequence

```text
1.  API server receives HTTP request.
2.  Server rejects unknown method/path before reading body where possible.
3.  Server enforces transport-level limits.
4.  Server passes normalised request metadata/body stream to App Kernel.
5.  App Kernel matches route manifest entry.
6.  App Kernel validates content type, headers, body size, raw-body policy.
7.  App Kernel decodes request into a typed Galerina value.
8.  App Kernel checks auth, scopes, effects, network policy, rate limits.
9.  App Kernel checks idempotency/replay policy where required.
10. Runtime executes typed Galerina flow.
11. App Kernel validates and projects typed response.
12. API server writes safe HTTP response.
13. Reports/logs are emitted with secrets redacted.
```

---

## Package Ownership

```text
galerina-core
    Language syntax, types, effects, diagnostics.

galerina-core-compiler
    Parse/check API declarations; emit route manifests, validators, reports.

galerina-core-runtime
    Execute checked Galerina flows safely.

galerina-core-network
    Network policy contracts, TLS rules, destination allowlists, network reports.

galerina-core-security
    Permissions, capabilities, redaction, auth/security checks.

galerina-framework-app-kernel
    Request lifecycle, route policy, auth, validation, rate limits, replay checks.

galerina-framework-api-server
    HTTP transport, request normalisation, response writing, server limits, logs.

galerina-api-adapters
    Express, Fastify, Lambda, Cloudflare, Node HTTP, future runtime adapters.

galerina-core-reports
    Shared report schema and report conventions.
```

Non-goals — the API boundary must not become:

```text
a full web framework
a CMS or ORM
a template engine or frontend router
a payment/email provider abstraction
a TLS implementation
a packet driver or firewall product
```

---

## API Route Manifest

### TypeScript Types

```ts
export type HttpMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE"
  | "OPTIONS"
  | "HEAD"

export interface LogicnApiManifest {
  schemaVersion: "galerina.api.manifest.v1"
  api: string
  version: string
  generatedAt: string
  routes: LogicnRouteManifest[]
}

export interface LogicnRouteManifest {
  id: string
  method: HttpMethod
  path: string
  handler: string
  requestType?: string
  responseType: string
  auth: AuthPolicy
  body: BodyPolicy
  limits: RouteLimits
  idempotency?: IdempotencyPolicy
  webhook?: WebhookPolicy
  effects: EffectsPolicy
  reports: RouteReportPolicy
}

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

export interface AuthPolicy {
  type: "none" | "bearer" | "apiKey" | "jwt" | "oauth2" | "mtls"
  required: boolean
  scopes?: string[]
}

export interface IdempotencyPolicy {
  required: boolean
  header: string
  ttlSeconds: number
}

export interface WebhookPolicy {
  provider: string
  signatureHeader: string
  timestampHeader?: string
  replayWindowSeconds: number
  rawBodyRequired: true
}

export interface EffectsPolicy {
  allow: string[]
  deny: string[]
}

export interface RouteReportPolicy {
  audit: boolean
  security: boolean
  memory: boolean
}
```

### Example Manifest Output

```json
{
  "schemaVersion": "galerina.api.manifest.v1",
  "api": "OrdersApi",
  "version": "0.1.0",
  "generatedAt": "2026-05-25T00:00:00.000Z",
  "routes": [
    {
      "id": "orders.create",
      "method": "POST",
      "path": "/orders",
      "handler": "createOrder",
      "requestType": "CreateOrderRequest",
      "responseType": "CreateOrderResponse",
      "auth": { "type": "bearer", "required": true, "scopes": ["orders.write"] },
      "body": {
        "contentType": "application/json",
        "maxSizeBytes": 262144,
        "unknownFields": "deny",
        "duplicateKeys": "deny",
        "rawBodyRequired": false
      },
      "limits": { "rate": "30/minute", "maxConcurrent": 5, "memoryBytes": 33554432, "timeoutMs": 5000 },
      "idempotency": { "required": true, "header": "Idempotency-Key", "ttlSeconds": 86400 },
      "effects": { "allow": ["database.write"], "deny": ["network.any"] },
      "reports": { "audit": true, "security": true, "memory": true }
    }
  ]
}
```

---

## API Server

### startApiServer()

```ts
interface StartApiServerOptions {
  manifestPath: string
  port: number
  host?: string
  env: "development" | "production"
  appKernel: LogicnAppKernel
}

export async function startApiServer(options: StartApiServerOptions) {
  const manifest = await loadManifest(options.manifestPath)
  const routeTable = buildRouteTable(manifest)

  const server = http.createServer(async (req, res) => {
    const startedAt = Date.now()
    try {
      const route = routeTable.match(req.method ?? "GET", req.url ?? "/")

      if (!route) {
        return writeJson(res, 404, {
          error: { code: "GALERINA_ROUTE_NOT_FOUND", message: "Route not found" }
        })
      }

      const body = await readBodyWithLimit(req, route.body.maxSizeBytes)

      const request: LogicnKernelRequest = {
        method: req.method ?? "GET",
        url: req.url ?? "/",
        headers: normalizeHeaders(req.headers),
        body,
        rawBody: route.body.rawBodyRequired ? body : undefined,
        remoteAddress: req.socket.remoteAddress,
        receivedAt: new Date().toISOString()
      }

      const kernelResult = await options.appKernel.handle(route, request)
      writeKernelResponse(res, kernelResult)
    } catch (error) {
      writeJson(res, 500, {
        error: { code: "GALERINA_API_INTERNAL_ERROR", message: "Request could not be processed" }
      })
    } finally {
      safeRequestLog(req, Date.now() - startedAt)
    }
  })

  await new Promise<void>((resolve) => {
    server.listen(options.port, options.host ?? "0.0.0.0", resolve)
  })

  return { close: () => new Promise<void>((resolve) => server.close(() => resolve())) }
}
```

### readBodyWithLimit()

```ts
export async function readBodyWithLimit(
  req: IncomingMessage,
  maxBytes: number
): Promise<Buffer> {
  const chunks: Buffer[] = []
  let total = 0

  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    total += buffer.length

    if (total > maxBytes) {
      throw new LogicnHttpError(413, "GALERINA_API_BODY_TOO_LARGE", "Request body is too large")
    }

    chunks.push(buffer)
  }

  return Buffer.concat(chunks)
}
```

---

## App Kernel

### Interfaces

```ts
export interface LogicnAppKernel {
  handle(
    route: LogicnRouteManifest,
    request: LogicnKernelRequest
  ): Promise<LogicnKernelResponse>
}

export interface LogicnKernelRequest {
  method: string
  url: string
  headers: Record<string, string | string[]>
  body: Buffer
  rawBody?: Buffer
  remoteAddress?: string
  receivedAt: string
}

export interface LogicnKernelResponse {
  status: number
  headers: Record<string, string>
  body: unknown
}
```

### handleApiRequest()

```ts
export async function handleApiRequest(
  route: LogicnRouteManifest,
  request: LogicnKernelRequest,
  runtime: LogicnRuntime
): Promise<LogicnKernelResponse> {
  assertContentType(route, request)
  await assertRateLimit(route, request)
  await assertAuth(route, request)

  const decoded = decodeRequestBody(route, request.body)
  const typedRequest = await runtime.validateType(route.requestType, decoded)

  await assertEffectsAllowed(route.effects, request)

  const result = await runtime.callFlow(route.handler, typedRequest, {
    timeoutMs: route.limits.timeoutMs,
    memoryBytes: route.limits.memoryBytes
  })

  const typedResponse = await runtime.validateType(route.responseType, result)

  return {
    status: 200,
    headers: { "content-type": "application/json" },
    body: typedResponse
  }
}
```

### JSON Decoding Rules

```text
unknown fields:   deny by default
duplicate keys:   deny by default
silent null:      deny unless explicit Optional/Null type exists
large numbers:    deny if unsafe for target numeric type
string encoding:  require valid UTF-8
```

---

## Webhook Raw-Body and Signature Verification

Webhooks require the raw request body bytes for HMAC signature verification.
Signature check must happen before JSON decoding.

```ts
export function verifyHmacSha256Webhook(input: {
  rawBody: Buffer
  secret: string
  signatureHeader: string
  expectedPrefix?: string
}): boolean {
  const expected = crypto
    .createHmac("sha256", input.secret)
    .update(input.rawBody)
    .digest("hex")

  const received = extractSignature(input.signatureHeader, input.expectedPrefix)
  return timingSafeHexEqual(expected, received)
}

function timingSafeHexEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, "hex")
  const right = Buffer.from(b, "hex")
  if (left.length !== right.length) return false
  return crypto.timingSafeEqual(left, right)
}
```

Webhook verification order:

```text
1. Enforce body limit.
2. Verify HMAC signature.
3. Check timestamp replay window.
4. Check event idempotency.
5. Decode JSON.
6. Call handler.
```

The raw body must never be logged.

---

## Webhook Replay and Idempotency

### Types

```ts
export interface WebhookReplayPolicy {
  timestampHeader?: string
  replayWindowSeconds: number
  nonceHeader?: string
  eventIdPath?: string
}

export interface WebhookIdempotencyPolicy {
  required: true
  eventIdPath: string
  ttlSeconds: number
  onDuplicate: "returnAccepted" | "returnConflict" | "ignore"
}

export interface ReplayStore {
  insertOnce(input: { key: string; ttlSeconds: number }): Promise<boolean>
}
```

### assertWebhookNotReplayed()

```ts
export async function assertWebhookNotReplayed(input: {
  route: LogicnRouteManifest
  request: LogicnKernelRequest
  eventId: string
  receivedTimestamp: number
  replayStore: ReplayStore
}) {
  const now = Math.floor(Date.now() / 1000)
  const age = Math.abs(now - input.receivedTimestamp)

  if (age > input.route.webhook!.replayWindowSeconds) {
    throw new LogicnHttpError(
      401,
      "GALERINA_WEBHOOK_REPLAY_WINDOW_EXPIRED",
      "Webhook timestamp is outside the allowed replay window"
    )
  }

  const inserted = await input.replayStore.insertOnce({
    key: `${input.route.id}:${input.eventId}`,
    ttlSeconds: input.route.idempotency?.ttlSeconds ?? 86400
  })

  if (!inserted) {
    throw new LogicnHttpError(409, "GALERINA_WEBHOOK_DUPLICATE_EVENT", "Webhook event has already been processed")
  }
}
```

### ReplayStore Adapters

```text
memory replay store    — development only
sqlite replay store    — local apps
postgres replay store  — production apps
redis replay store     — high-throughput services
cloud KV store         — serverless/edge
```

---

## OpenAPI Export

OpenAPI output is a publication artefact generated from the Galerina API
manifest. It is not the source of truth — the Galerina manifest is authoritative.

```ts
export function exportOpenApi(manifest: LogicnApiManifest): OpenApiDocument {
  const doc: OpenApiDocument = {
    openapi: "3.1.0",
    info: { title: manifest.api, version: manifest.version },
    paths: {},
    components: {
      schemas: {},
      securitySchemes: { bearerAuth: { type: "http", scheme: "bearer" } }
    }
  }

  for (const route of manifest.routes) {
    doc.paths[route.path] ??= {}
    doc.paths[route.path][route.method.toLowerCase()] = {
      operationId: route.id,
      security: toOpenApiSecurity(route.auth),
      requestBody: toOpenApiRequestBody(route),
      responses: toOpenApiResponses(route),
      parameters: toOpenApiParameters(route)
    }
  }

  return doc
}
```

---

## Error Contract

### LogicnHttpError

```ts
export class LogicnHttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly safeDetails?: Record<string, unknown>
  ) {
    super(message)
  }
}
```

### mapErrorToHttpResponse()

```ts
export function mapErrorToHttpResponse(
  error: unknown,
  env: "development" | "production",
  requestId: string
): LogicnKernelResponse {
  if (error instanceof LogicnHttpError) {
    return {
      status: error.status,
      headers: { "content-type": "application/json" },
      body: {
        error: {
          code: error.code,
          message: env === "production" ? publicMessageForStatus(error.status) : error.message,
          requestId,
          ...(env === "development" ? { details: error.safeDetails } : {})
        }
      }
    }
  }

  return {
    status: 500,
    headers: { "content-type": "application/json" },
    body: { error: { code: "GALERINA_API_INTERNAL_ERROR", message: "Request could not be processed", requestId } }
  }
}
```

### HTTP Status Codes

| Status | Use |
| --- | --- |
| `200` | Successful read/update |
| `201` | Resource created |
| `202` | Accepted async job/webhook |
| `204` | Success with no body |
| `400` | Invalid request body/query/path |
| `401` | Missing or invalid authentication |
| `403` | Authenticated but not authorised |
| `404` | Route/resource not found |
| `405` | Method not allowed |
| `409` | Idempotency conflict or duplicate webhook |
| `413` | Body too large |
| `415` | Unsupported content type |
| `422` | Semantically invalid typed input |
| `429` | Rate limit exceeded |
| `500` | Internal server error |
| `503` | Service unavailable/backpressure |
| `504` | Timeout |

---

## Network Policy Enforcement

```ts
export async function assertNetworkAllowed(input: {
  policy: NetworkPolicy
  protocol: string
  host: string
  port?: number
  capability: string
}) {
  if (input.protocol === "http" && !input.policy.allowPlainHttp) {
    throw new LogicnHttpError(403, "LN_NETWORK_INSECURE_TRANSPORT_DENIED", "Plain HTTP is not allowed")
  }

  const allowed = input.policy.outbound.some((rule) =>
    rule.protocol === input.protocol &&
    rule.host === input.host &&
    (rule.port === undefined || rule.port === input.port)
  )

  if (!allowed) {
    throw new LogicnHttpError(403, "LN_NETWORK_DESTINATION_NOT_ALLOWLISTED", "Network destination is not allowlisted")
  }
}
```

---

## Build Output

```text
build/
  manifest/
    galerina-api-manifest.json
    galerina-permissions.json
    galerina-routes.json
    galerina-openapi.json

  reports/
    api-report.json
    api-server-report.json
    api-route-report.json
    api-security-report.json
    api-memory-report.json
    api-network-report.json
    api-failure-report.json
```

---

## Package Layout

```text
packages-galerina/
  galerina-framework-api-server/
    README.md
    TODO.md
    package.json
    tsconfig.json

    src/
      index.ts
      cli.ts
      create-server.ts
      load-manifest.ts
      route-table.ts
      read-body-with-limit.ts
      write-response.ts
      error-mapper.ts
      safe-log.ts
      types.ts

    examples/
      basic-api/
      webhook-api/

    tests/
      basic-server.test.ts
      route-table.test.ts
      body-limit.test.ts
      error-mapper.test.ts
      webhook-signature.test.ts
```

---

## Key Design Rules

```text
1. Galerina Core defines the language.
2. The compiler emits checked route manifests.
3. The API Server owns HTTP transport only.
4. The App Kernel owns request meaning and policy.
5. The Runtime executes typed flows.
6. Network policy is deny-by-default.
7. Webhook raw bodies must be preserved for signatures.
8. Public errors must be safe.
9. Reports must be machine-readable.
10. OpenAPI is generated from Galerina, not the source of truth.
```

---

## Relationship to Other Systems

```text
galerina-core-compiler    → emits LogicnApiManifest from checked API declarations
galerina-core-network     → provides NetworkPolicy for assertNetworkAllowed()
galerina-core-security    → redaction, auth checks, capability validation
galerina-core-runtime     → executes typed Galerina flows
galerina-core-reports     → consumes route audit/security/memory reports
galerina-framework-app-kernel → owns request governance lifecycle
galerina-framework-api-server → owns HTTP transport and body limits
```

See also: `galerina-core-network-governance.md`,
`effect-checker-and-boundary-checker.md`,
`runtime-audit-log-format.md`.
