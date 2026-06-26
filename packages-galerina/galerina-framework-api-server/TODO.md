# Galerina API Server TODO

## Coverage Reconciliation

```text
[ ] Map API-server ReplayStore.exists/save adapter names to galerina-core-network has/put or adopt network names
[ ] Align webhook/idempotency implementation docs with galerina-core-network-webhook.md
```

## Architecture Depth (v0.2) — Completed

```text
[x] Create /packages-galerina/galerina-framework-api-server
[x] Add README.md
[x] Document package boundary
[x] Define v0.2 architecture position (transport boundary → kernel → runtime)
[x] Define LogicnApiManifest: schemaVersion "galerina.api.manifest.v2", api, version, generatedAt, routes[]
[x] Define LogicnRouteManifest: id, method, path, handler, requestType?, responseType, policies[], body, limits, reports, webhook?
[x] Define HttpMethod enum: GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD (7 values)
[x] Define RoutePolicy as 7-kind discriminated union: auth|scope|body|effect|network|rateLimit|idempotency
[x] Define AuthRoutePolicy: kind:"auth", type: "none"|"bearer"|"apiKey"|"jwt"|"oauth2"|"mtls"
[x] Define ScopeRoutePolicy: kind:"scope", required: string[]
[x] Define BodyRoutePolicy: kind:"body", maxSizeBytes, unknownFields, duplicateKeys, rawBodyRequired
[x] Define EffectRoutePolicy: kind:"effect", allow: string[], deny: string[]
[x] Define NetworkRoutePolicy: kind:"network", denyByDefault, allowPlainHttp, outbound[]
[x] Define RateLimitRoutePolicy: kind:"rateLimit", rate: string, keyBy: "ip"|"authSubject"|"apiKey"|"route"
[x] Define IdempotencyRoutePolicy: kind:"idempotency", required, header, ttlSeconds, onDuplicate
[x] Define BodyPolicy: contentType?, maxSizeBytes, unknownFields "deny"|"strip"|"allow", duplicateKeys "deny"|"lastWins", rawBodyRequired
[x] Define RouteLimits: rate?, maxConcurrent?, memoryBytes?, timeoutMs?
[x] Define RouteReportPolicy: audit, security, memory, network, failure (all boolean)
[x] Define WebhookVerificationConfig: provider, secret, signatureHeader, timestampHeader?, replayWindowSeconds, expectedPrefix?, eventIdHeader?, eventIdPath?
[x] Define ReplayStore interface: exists(key): Promise<boolean>, save(key, ttlSeconds): Promise<void>
[x] Define LogicnAppKernel interface: handleApiRequest(input): Promise<LogicnKernelResponse>
[x] Define HandleApiRequestInput: route, request, replayStore?
[x] Define LogicnKernelRequest: method, url, path, query, headers, body (Buffer), rawBody?, remoteAddress?, requestId, receivedAt
[x] Define LogicnKernelResponse: status, headers, body?
[x] Define StartApiServerOptions: manifestPath, port, host?, env, appKernel, replayStore?
[x] Define LogicnHttpError(status, code, message, safeDetails?): extends Error
[x] Define 10-step request pipeline (create-server.ts)
[x] Define webhook verification functions (verifyHmacSha256Webhook, assertWebhookVerified, timingSafeHexEqual)
[x] Define route table: buildRouteTable(manifest), :param regex matching, RouteMatch
[x] Define safe log header redaction: 8 headers (authorization, cookie, set-cookie, x-api-key, x-signature, x-hub-signature, x-hub-signature-256, stripe-signature)
[x] Define OpenAPI 3.1 export from manifest (exportOpenApi)
[x] Define 17 HTTP status codes contract
[x] Define 10 security rules
[x] Define full src layout (13 files: index, cli, create-server, load-manifest, route-table, read-body-with-limit, write-response, error-mapper, webhook, replay-store, openapi, safe-log, types)
[x] Define what package may / must not do
```

## Implementation — Package Setup

```text
[ ] Add package.json (type:module, exports map, bin: galerina-api-server)
[ ] Add tsconfig.json (ES2022, NodeNext, strict)
[ ] Add src/index.ts with public API exports
[ ] Add src/cli.ts minimal CLI entrypoint
```

## Implementation — src/types.ts

```text
[ ] Implement HttpMethod enum (7 values)
[ ] Implement LogicnApiManifest interface with schemaVersion literal "galerina.api.manifest.v2"
[ ] Implement LogicnRouteManifest interface
[ ] Implement all 7 RoutePolicy discriminated kinds
[ ] Implement BodyPolicy interface
[ ] Implement RouteLimits interface
[ ] Implement RouteReportPolicy interface
[ ] Implement WebhookVerificationConfig interface (use secret field, not sharedSecret)
[ ] Implement ReplayStore interface (async: exists/save with ttlSeconds)
[ ] Implement LogicnAppKernel interface
[ ] Implement HandleApiRequestInput interface
[ ] Implement LogicnKernelRequest interface (body as Buffer)
[ ] Implement LogicnKernelResponse interface
[ ] Implement StartApiServerOptions interface
```

## Implementation — src/load-manifest.ts

```text
[ ] Implement loadManifest(manifestPath): Promise<LogicnApiManifest>
[ ] Implement assertLogicnApiManifest(data): asserts data is LogicnApiManifest
[ ] Validate schemaVersion === "galerina.api.manifest.v2"
[ ] Validate all route fields present
[ ] Fail fast on invalid manifest (startup blocker)
```

## Implementation — src/route-table.ts

```text
[ ] Implement buildRouteTable(manifest): RouteTable
[ ] Implement compileRoute(route): CompiledRoute with named :param regex
[ ] Implement RouteTable.match(method, url): RouteMatch | undefined
[ ] Support :param path segments (e.g. /orders/:id)
[ ] Return 405 when path matches but method does not
[ ] Return 404 when no path match found
[ ] Add route-table.test.ts coverage
```

## Implementation — src/read-body-with-limit.ts

```text
[ ] Implement readBodyWithLimit(req, maxSizeBytes): Promise<Buffer>
[ ] Enforce limit while streaming (not after full read)
[ ] Throw LogicnHttpError(413, "BODY_TOO_LARGE", ...) on oversize
[ ] Add body-limit.test.ts coverage
```

## Implementation — src/error-mapper.ts

```text
[ ] Implement LogicnHttpError class: status, code, message, safeDetails?
[ ] Implement mapErrorToHttpResponse(error, env): { status, headers, body }
[ ] In development: include safeDetails in response body
[ ] In production: return publicMessageForStatus(status) only
[ ] Implement publicMessageForStatus(status): string (safe generic messages)
[ ] Add error-mapper.test.ts coverage
```

## Implementation — src/webhook.ts

```text
[ ] Implement verifyHmacSha256Webhook(payload: Buffer, signature: string, secret: string): boolean
[ ] Implement timingSafeHexEqual(a: string, b: string): boolean (constant-time)
[ ] Implement extractSignature(header: string, expectedPrefix?: string): string
[ ] Implement assertWebhookVerified(payload, headers, config, replayStore): Promise<void>
[ ] Implement assertWebhookNotReplayed(eventId, replayStore, windowSeconds): Promise<void>
[ ] Enforce: HMAC verification BEFORE JSON decoding
[ ] Enforce: replay check BEFORE handler execution
[ ] Add webhook-signature.test.ts coverage
```

## Implementation — src/replay-store.ts

```text
[ ] Implement MemoryReplayStore class
[ ] MemoryReplayStore.exists(key): Promise<boolean>
[ ] MemoryReplayStore.save(key, ttlSeconds): Promise<void>
[ ] Implement pruneExpired() — auto-prune entries past TTL
[ ] Add replay-store.test.ts coverage
```

## Implementation — src/create-server.ts

```text
[ ] Implement startApiServer(options: StartApiServerOptions): Promise<void>
[ ] Step 1: Receive HTTP request
[ ] Step 2: Match method and path (buildRouteTable)
[ ] Step 3: Reject unknown route/method BEFORE body read
[ ] Step 4: Enforce body limit (readBodyWithLimit)
[ ] Step 5: Normalize headers, path, query, request-id, raw body
[ ] Step 6: Verify webhook HMAC and replay (when webhook configured)
[ ] Step 7: Execute App Kernel route policies
[ ] Step 8: Decode and validate typed request
[ ] Step 9: Execute typed Galerina runtime flow, validate typed response
[ ] Step 10: Map result/error to HTTP response, emit reports/logs
[ ] Add basic-server.test.ts coverage
```

## Implementation — src/write-response.ts

```text
[ ] Implement writeKernelResponse(res, kernelResponse): void
[ ] Implement writeJson(res, status, body, headers?): void
[ ] Apply safe default headers (Content-Type, X-Request-Id)
[ ] Never expose stack traces in response body
```

## Implementation — src/safe-log.ts

```text
[ ] Implement safeRequestLog(req, route): SafeLogEntry
[ ] Redact: authorization, cookie, set-cookie, x-api-key, x-signature
[ ] Redact: x-hub-signature, x-hub-signature-256, stripe-signature
[ ] Never log raw bodies
[ ] Replace redacted values with "[REDACTED]"
```

## Implementation — src/openapi.ts

```text
[ ] Implement exportOpenApi(manifest: LogicnApiManifest): OpenApiSpec
[ ] Generate OpenAPI 3.1.0 output
[ ] Map :param segments to path parameter objects
[ ] Add bearerAuth / apiKeyAuth security schemes from auth policies
[ ] Add request/response $ref schema references
[ ] Include standard response codes: 200/400/401/403/404/409/413/415/422/429/500
[ ] OpenAPI is output from manifest — manifest is source of truth
[ ] Add openapi-export.test.ts coverage
```

## Implementation — Examples

```text
[ ] Add examples/basic-api/manifest.json (schemaVersion: "galerina.api.manifest.v2")
[ ] Add examples/basic-api/server.ts
[ ] Add examples/webhook-api/manifest.json (with WebhookVerificationConfig)
[ ] Add examples/webhook-api/server.ts
```

## Implementation — Production Safety

```text
[ ] Fail startup if manifest missing or invalid schemaVersion
[ ] Fail startup in production if any route has no body limit
[ ] Fail startup in production if webhook route has no replay protection
[ ] Verify all handler references resolvable at startup
[ ] Never expose safeDetails in production error responses
[ ] Enforce network deny-by-default at route level
```
