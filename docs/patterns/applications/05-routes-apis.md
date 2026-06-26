# Galerina Application Pattern 05 — Routes and API Contracts

**When to use:** Every HTTP endpoint — GET /users/:id, POST /orders, PATCH /invoices/:id, DELETE /sessions/:id.

---

## Route as authorised entry point

A route in Galerina is not a URL pattern. It is an authorised entry point that binds a public HTTP surface to a governed flow.

```galerina
route GET "/users/:id" {
  params { id: UserId }
  trigger getUser
}

route POST "/users" {
  body   UserInput
  trigger createUser
}

route PATCH "/users/:id" {
  params { id: UserId }
  body   UserInput
  trigger updateUser
}

route DELETE "/users/:id" {
  params { id: UserId }
  trigger deleteUser
}
```

The `trigger` clause names the flow. The route declaration holds no logic. All business logic, effect declarations, and audit requirements live in the triggered flow. The route is a thin contract boundary — it declares what comes in (params, body) and what goes out (the flow's declared return type).

---

## The five protections routes provide

Every route declaration automatically enforces five protections that a plain function call does not:

1. **Typed params** — URL path parameters are parsed and validated against their declared type before the flow is called. A `UserId` that cannot be parsed from the path segment causes a 400 before the flow runs. No raw string reaches the flow body.

2. **Typed response** — The flow's return type becomes the HTTP response schema. If the flow returns `Result<User, ApiError>`, the serialiser knows the exact shape. Untyped or partial responses are rejected.

3. **Capability bounds** — Routes are entry points into the capability system. The caller's token is checked against the flow's declared capability requirements before the flow body executes. A missing capability causes a 403.

4. **No ambient access** — Only flows with a `route` binding are publicly callable. Internal flows (helpers, sub-flows) cannot be reached via HTTP regardless of their names. The route declaration is the only way to make a flow externally accessible.

5. **Audit per request** — If the triggered flow declares `audit.write`, every HTTP request through that route produces an audit record. The route context (method, path, caller IP, actor identity) is automatically included in the audit payload.

---

## Route to flow binding

The route is thin. The flow is the unit of logic.

```galerina
// Route: declares the surface
route GET "/users/:id" {
  params { id: UserId }
  trigger getUser
}

// Flow: declares the logic and effects
query getUser(id: UserId) -> Result<User, ApiError>
  effects [database.read]
{
  let user = database.read({ id })
  return Ok(user)
}
```

This separation means:
- A flow can be tested independently of HTTP (unit tests call the flow directly)
- A route can be changed (path, method) without touching the flow
- Multiple routes can trigger the same flow (versioned APIs: `GET /v1/users/:id` and `GET /v2/users/:id` may both trigger `getUser` or route to separate versioned flows)

---

## OpenAPI generation (future: galerina emit --openapi)

Because routes declare typed params, typed bodies, and typed return values, the compiler has everything it needs to generate an OpenAPI 3.1 spec. This is a Phase 17+ feature:

```bash
galerina emit --openapi --service UserService --out openapi.yaml
```

The generated spec will include:
- Path and method from the `route` declaration
- Parameter schemas from `params` block types
- Request body schema from `body` type
- Response schema from the flow's return type
- Security requirements from the flow's capability declarations
- Description annotations from any doc comments on the route or flow

Until this feature lands, routes are documented by reading the Galerina source. The GIR output already contains enough information to generate the spec by hand.

---

## Semantic graph: route nodes to flow nodes to effect nodes

The GIR represents each route as a node that chains to its triggered flow:

```
service:UserService
  ├── route:GET:/users/:id → flow:getUser → [effect:database.read]
  ├── route:POST:/users    → flow:createUser → [effect:database.write, effect:audit.write, effect:validation.run, effect:event.emit]
  ├── route:PATCH:/users/:id → flow:updateUser → [effect:database.write, effect:audit.write, effect:validation.run]
  └── route:DELETE:/users/:id → flow:deleteUser → [effect:database.write, effect:audit.write]
```

This chain is the basis for the security surface map. A reviewer reading the GIR can identify every public entry point, its full effect set, and whether audit is present, without reading a single line of flow code.

---

## Service manifest: routes.json per service

The compiler emits a `routes.json` manifest alongside each service. This manifest is consumed by the API gateway, the load balancer configuration, and the integration test harness:

```json
{
  "service": "UserService",
  "version": "1.0.0",
  "routes": [
    { "method": "GET",    "path": "/users/:id",  "flow": "getUser",    "capabilities": [] },
    { "method": "POST",   "path": "/users",       "flow": "createUser", "capabilities": ["role.admin"] },
    { "method": "PATCH",  "path": "/users/:id",   "flow": "updateUser", "capabilities": ["role.admin"] },
    { "method": "DELETE", "path": "/users/:id",   "flow": "deleteUser", "capabilities": ["role.admin"] }
  ]
}
```

---

## Entry point security

Non-routed flows are not publicly callable. This is a hard compiler guarantee: if a flow has no `route` binding, it cannot be reached via HTTP regardless of how the service is deployed.

The compiler also enforces:
- A route may not bind to a flow declared in another service's contract — SPORE-ROUTE-001
- A route's `params` types must match the triggered flow's parameter types — SPORE-ROUTE-002
- A route's `body` type must match the triggered flow's input type — SPORE-ROUTE-003

---

## What "route" does NOT mean

A `route` declaration is not:
- A place to put validation logic (that belongs in the flow)
- A place to put authentication logic (that belongs in the capability system)
- A place to put business rules (that belongs in the flow)
- A middleware chain (Galerina has no middleware; effects replace it)
- An HTTP handler function (the runtime generates the handler from the route + flow contract)

The route declaration is pure contract. It is a boundary marker, not a code container.
