> ⚠️ **SUPERSEDED** — This is a v0.2 historical document. Current spec: see See Also links.

# Galerina Framework API Server v0.2

## Formal Specification — Full API Server Implementation

**Status: SUPERSEDED — This is a v0.2 design document. The current canonical specification
is in the corresponding Phase 9-15 implementation docs. See galerina-roadmap.md for
the up-to-date architecture. This file is retained for historical context only.**

This document is the v0.2 canonical specification for
`galerina-framework-api-server`.

See also: `galerina-api-boundary-architecture.md` (prior KB).

---

## Core Philosophy

```text
all requests are untrusted by default
```

Every request must pass:
- route validation
- capability checks
- replay protection
- boundary enforcement
- effect validation
- runtime governance

---

## HttpMethod Enum

```ts
enum HttpMethod {
    GET,
    POST,
    PUT,
    PATCH,
    DELETE,
    OPTIONS,
    HEAD
}
```

| Method  | Purpose              |
| ------- | -------------------- |
| GET     | Safe retrieval       |
| POST    | Mutation/creation    |
| PUT     | Full replacement     |
| PATCH   | Partial update       |
| DELETE  | Resource deletion    |
| OPTIONS | Capability discovery |
| HEAD    | Metadata retrieval   |

---

## LogicnRouteManifest

```ts
interface LogicnRouteManifest {
    method: HttpMethod;

    path: string;

    capability: string;

    boundary: string;

    effects: string[];

    authRequired: boolean;

    replayProtected: boolean;

    webhook: boolean;
}
```

Example:
```json
{
  "method": "POST",
  "path": "/api/users",
  "capability": "users.write",
  "boundary": "Internal",
  "effects": ["IO", "State"],
  "authRequired": true,
  "replayProtected": true,
  "webhook": false
}
```

---

## LogicnApiManifest

```ts
interface LogicnApiManifest {
    version: string;

    routes:
        LogicnRouteManifest[];

    policies:
        RoutePolicy[];
}
```

---

## RoutePolicy

```ts
interface RoutePolicy {
    name: string;

    enabled: boolean;

    description: string;
}
```

Supported policies:

| Policy           | Purpose                    |
| ---------------- | -------------------------- |
| AuthPolicy       | Authentication enforcement |
| ReplayPolicy     | Replay protection          |
| RateLimitPolicy  | Request throttling         |
| CapabilityPolicy | Capability validation      |
| BoundaryPolicy   | Runtime isolation          |
| AuditPolicy      | Runtime audit logging      |
| WebhookPolicy    | Webhook validation         |

---

## Request Pipeline

### handleApiRequest()

```ts
async function handleApiRequest(
    request: Request
): Promise<Response>
```

Full pipeline:

```text
Resolve route
      ↓
Validate HTTP method
      ↓
Validate capabilities
      ↓
Validate authentication
      ↓
Validate replay protection
      ↓
Validate boundaries
      ↓
Validate effects
      ↓
Execute handler
      ↓
Audit request
      ↓
Return response
```

Implementation:

```ts
async function handleApiRequest(
    request: Request
): Promise<Response> {

    const route =
        resolveRoute(request);

    validateMethod(route);

    validateCapabilities(route);

    validateReplay(request);

    validateBoundary(route);

    const result =
        await executeHandler(route);

    auditRequest(request);

    return result;
}
```

---

## Replay Protection

### ReplayStore

```ts
interface ReplayStore {
    exists(key: string): boolean;

    save(key: string): void;
}
```

---

### validateReplay()

```ts
function validateReplay(
    request: Request
) {

    const key =
        request.headers.get(
            "x-request-id"
        );

    if (
        replayStore.exists(key)
    ) {
        throw new LogicnHttpError(
            409,
            "Replay detected."
        );
    }

    replayStore.save(key);
}
```

---

## Webhook Governance

### WebhookVerificationConfig

```ts
interface WebhookVerificationConfig {
    algorithm: string;

    secret: string;

    headerName: string;
}
```

Note: Field is `secret` (not `sharedSecret` as in the network package).

---

### verifyHmacSha256Webhook()

```ts
function verifyHmacSha256Webhook(
    body: string,
    signature: string,
    secret: string
): boolean {

    const expected =
        createHmac(
            "sha256",
            secret
        )
        .update(body)
        .digest("hex");

    return expected === signature;
}
```

---

## Boundary Enforcement

```ts
function validateBoundary(
    route:
        LogicnRouteManifest
) {

    if (
        route.boundary ===
            "Sandbox" &&
        route.effects.includes(
            "Network"
        )
    ) {
        throw new Error(
            "Sandbox cannot access network."
        );
    }
}
```

Boundary rules:

| Boundary | Purpose                 |
| -------- | ----------------------- |
| Internal | Trusted runtime         |
| External | Third-party integration |
| Sandbox  | Restricted execution    |
| Runtime  | Runtime-level access    |

---

## Authentication Governance

```ts
function validateAuth(
    request: Request
): boolean {

    return Boolean(
        request.headers.get(
            "authorization"
        )
    );
}
```

---

## OpenAPI Export

### exportOpenApi()

```ts
function exportOpenApi(
    manifest:
        LogicnApiManifest
): object {

    return {
        openapi: "3.1.0",

        paths:
            buildPaths(
                manifest.routes
            )
    };
}
```

OpenAPI exports preserve: route policies, capability metadata, boundary
annotations, authentication requirements, runtime effects.

Extended metadata:
```json
{
  "x-galerina-capability": "users.read",
  "x-galerina-boundary": "Internal"
}
```

---

## Error Handling

### LogicnHttpError

```ts
class LogicnHttpError
    extends Error {

    constructor(
        readonly status: number,
        readonly message: string
    ) {
        super(message);
    }
}
```

---

### mapErrorToHttpResponse()

```ts
function mapErrorToHttpResponse(
    error: Error
): Response {

    if (
        error instanceof
            LogicnHttpError
    ) {
        return new Response(
            error.message,
            {
                status:
                    error.status
            }
        );
    }

    return new Response(
        "Internal Server Error",
        {
            status: 500
        }
    );
}
```

---

## Diagnostics

| Code            | Meaning                           |
| --------------- | --------------------------------- |
| SPORE-NETWORK-001  | SSRF-protected destination denied |
| SPORE-NETWORK-006  | Replay attack detected            |
| SPORE-NETWORK-007  | Invalid webhook signature         |
| SPORE-BOUNDARY-001 | Invalid runtime boundary          |
| SPORE-EFFECT-002   | Effect propagation violation      |

---

## File Layout

```text
galerina-framework-api-server/

  runtime/
    handleApiRequest.ts
    executeHandler.ts
    mapErrorToHttpResponse.ts

  routing/
    LogicnRouteManifest.ts
    resolveRoute.ts
    exportOpenApi.ts

  policies/
    auth.ts                 (validateAuth)
    replay.ts               (validateReplay)
    capabilities.ts         (validateCapabilities)
    boundaries.ts           (validateBoundary)

  webhook/
    verifyHmacSha256Webhook.ts
    ReplayStore.ts
    verification.ts

  diagnostics/
    LogicnHttpError.ts
    codes.ts

  manifests/
    LogicnApiManifest.ts
    RoutePolicies.ts        (7 policies)
```

---

## Planned v0.3 Features

| Feature                    | Purpose                |
| -------------------------- | ---------------------- |
| Streaming Runtime APIs     | Realtime execution     |
| Distributed API Federation | Cluster routing        |
| Policy DSL                 | Declarative governance |
| API Replay Proofs          | Runtime verification   |
| mTLS Runtime Policies      | Service authentication |
| GraphQL Export             | Multi-protocol APIs    |
