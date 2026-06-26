# Galerina Route Runtime Specification

## Status

```text
Route runtime: implemented — live (Phases 34–51)
Applies to:    Stage 1 TypeScript HTTP server
```

This document defines how checked Galerina `route` declarations are registered,
matched, hydrated, dispatched, and serialized by the Stage 1 TypeScript runtime.

---

## Rules at a Glance

- Routes are declared entry points, not automatic HTTP permissions.
- Route matching is method plus path, in declaration order.
- Request bodies are unsafe until decoded and validated against the route type.
- Route dispatch checks deployment-profile effect permissions before flow
  execution.
- Flow results are serialized through standard `Response` helpers.
- No route contains business logic; routes delegate to named flows.

---

## Route Registration

At startup, the runtime builds a route table from all checked `routeDecl` nodes
or route manifest entries.

Each entry contains:

```typescript
interface RuntimeRouteEntry {
  method: string;
  path: string;
  flowName: string;
  requestType: string;
  responseType: string;
}
```

Path parameters use braces:

```text
/users/{id}
```

The `{id}` segment becomes a named parameter in `request.params`.

## Route Matching Algorithm

For each incoming request:

1. Normalize the HTTP method to uppercase.
2. Match against the route table in declaration order.
3. Bind path parameter captures into `request.params`.
4. If no path matches, return `404` with a structured error body.
5. If the path matches but the method does not, return `405`.
6. If method and path match, continue to hydration and effect gating.

HTTP method declaration semantics are specified in
`http-method-declarations.md`.

## Request Hydration

The runtime builds:

```galerina
readonly request: Request
```

from the raw HTTP request:

| Request field | Runtime value |
|---|---|
| `request.method` | HTTP method string |
| `request.path` | URL path |
| `request.params` | path parameter map |
| `request.query` | query string map |
| `request.headers` | header map |
| `request.body` | raw body bytes (`Bytes`) |
| `request.rawBody` | same bytes, explicitly typed as unsafe `Bytes` |

The `Request` value is readonly. The flow cannot reassign it. `request.body` and
`request.rawBody` are unsafe by default because they originate outside the runtime.

## Response Serialization

Galerina API flows normally return:

```galerina
Result<Response, ApiError>
```

Runtime mapping:

| Flow result | HTTP response |
|---|---|
| `Ok(Response.created(id))` | `201` JSON body |
| `Ok(Response.ok(data))` | `200` JSON body |
| `Ok(Response.noContent())` | `204` empty |
| `Err(ApiError.notFound(msg))` | `404` JSON error body |
| `Err(ApiError.badRequest(msg))` | `400` JSON error body |
| `Err(ApiError.internal(msg))` | `500` JSON error body |

Response output passes through the response gate before bytes leave the runtime.

## Standard Response Helpers

The Stage 1 stdlib provides:

| Helper | HTTP result |
|---|---|
| `Response.ok(data)` | `200` JSON |
| `Response.created(id)` | `201` JSON |
| `Response.accepted()` | `202` JSON or empty body |
| `Response.noContent()` | `204` empty body |
| `Response.redirect(url)` | `302` with `Location` header |

## Request Validation

Each route declares a request type:

```galerina
route POST "/orders" {
  request CreateOrderRequest
  response OrderResponse
  flow createOrder
}
```

Before the flow runs:

1. The runtime deserializes `request.body`.
2. The decoded shape is checked against `CreateOrderRequest`.
3. On failure, the runtime returns `400` with an `SPORE-PARSE-*` or decode-related
   structured error body.
4. On success, the typed value is passed to the flow or attached to the hydrated
   request according to the route ABI.

JSON decoding and raw-body constraints are owned by the API boundary and stdlib
contracts.

## Effect Enforcement at Route Boundary

When a route dispatches to a flow, the runtime checks:

- the named flow exists in the runtime manifest
- the flow's declared effects are permitted in the current deployment profile
- the route boundary allows those effects
- denied effects cause a `403` governance denial response

The effect checker proves declared and observed effects at compile time. The
runtime enforces deployment policy at the boundary.

## Compiler Status

```text
Route runtime:       implemented — live (Phases 34–51)
Route manifest load: implemented — live (Phases 34–51)
Request hydration:   implemented — live (Phases 34–51)
Response gate:       implemented — live (Phases 34–51)
```

## See Also

- `docs/Knowledge-Bases/http-method-declarations.md`
- `docs/Knowledge-Bases/galerina-framework-api-server-v02.md`
- `docs/Knowledge-Bases/galerina-api-boundary-architecture.md`
- `docs/Knowledge-Bases/hello-world-api-pattern.md`
- `docs/Knowledge-Bases/galerina-runtime-lifecycle.md`
- `docs/Knowledge-Bases/galerina-stdlib-reference.md`
- `docs/Knowledge-Bases/galerina-core-compiler-manifest-generation-pass-14.md`
