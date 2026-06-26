Title: Galerina Contract Pattern — Secure HTTP Flow

### When to use

Use this pattern when a flow handles an inbound HTTP request that must be authenticated, validated, and fully audited before any response is returned. It is appropriate for any API endpoint where the caller's identity, request shape, and response must all be traceable. Apply it whenever security classification of the data is anything above public.

### Correct example

```galerina
flow SecureHttpFlow(readonly request: Request) -> SecureHttpFlowResult {

  contract {

    types {
      SecureHttpFlowResult = { status: Int, body: String, requestId: String }
    }

    intent = "Receive an authenticated HTTP request, validate its structure, process it, and emit a full audit trail."

    request {
      requires request.headers["Authorization"] is String
      requires request.body is JsonObject
      requires request.method in ["GET", "POST"]
    }

    response {
      guarantees result.status in [200, 400, 401, 403, 500]
      guarantees result.requestId is String
    }

    context {
      requires context.actor is AuthenticatedUser
      requires context.actor.roles contains "api:access"
    }

    model {
      reads []
      writes []
    }

    effects {
      audit {
        on: always
        level: full
        includes: [request.method, request.headers["Authorization"], result.status, result.requestId]
      }
    }

    security {
      classification: internal
      requires tls: true
    }

    on_error {
      emit: AuditEvent(type: "request.failed", actor: context.actor, reason: error.message)
      return: { status: 500, body: "Internal error", requestId: request.id }
    }

  }

  let requestId = generate_id()
  let validated = validate_json(request.body)

  if !validated.ok {
    return { status: 400, body: "Invalid request body", requestId: requestId }
  }

  let result = process_request(request, context.actor)

  return { status: 200, body: result.body, requestId: requestId }

}
```

### What each contract section does

- `types` — declares `SecureHttpFlowResult` so the return shape is checked at compile time
- `intent` — human-readable description used by the audit system and governance tooling
- `request` — guards: Authorization header present, body is JSON, method is one of GET/POST
- `response` — guarantees the status code is always a known value and requestId is always a String
- `context` — requires a real authenticated user with the `api:access` role before execution begins
- `model` — declares no database reads or writes (pure HTTP processing)
- `effects.audit` — mandates a full audit record on every invocation, capturing method, auth header, status, and requestId
- `security` — marks data as internal classification and enforces TLS at the transport layer
- `on_error` — ensures a structured audit event is always emitted even when the flow fails

### Common mistakes

**Mistake 1 — Using `req` instead of `readonly request`**
```galerina
flow SecureHttpFlow(req: Request) -> SecureHttpFlowResult {
```
The parameter must be `readonly request`. Omitting `readonly` allows mutation; using `req` breaks the canonical naming convention enforced by the linter.

**Mistake 2 — Putting effects in the flow body instead of the contract**
```galerina
flow SecureHttpFlow(readonly request: Request) -> SecureHttpFlowResult {
  effects [audit(level: full)]
  contract { ... }
}
```
Effects must live inside `contract.effects`. Effects declared outside the contract are not tracked by the governance runtime and will not appear in audit reports.

**Mistake 3 — Omitting the `context` block when actor is required**
```galerina
contract {
  request { requires request.headers["Authorization"] is String }
  response { guarantees result.status in [200, 400] }
}
```
If the flow uses `context.actor` in the body, a `context` block with the actor requirement must be declared. Without it the runtime cannot enforce identity before entry.

### Expected diagnostics (if incorrect)

| Mistake | Diagnostic |
|---|---|
| Parameter named `req` instead of `readonly request` | `E401 — parameter must be named 'request' and marked readonly` |
| `effects` block outside `contract` | `E210 — effects must be declared inside contract block` |
| `context.actor` used in body without `context` block | `E305 — context.actor referenced but no context contract declared` |
| Missing `types` declaration for return type | `E102 — return type 'SecureHttpFlowResult' not declared in contract.types` |
| `security.requires tls` omitted for internal data | `W501 — internal-classified flow missing tls requirement` |

### One-click fix

If `E305 — context.actor referenced but no context contract declared` is raised, add this block inside `contract { }`:

```galerina
context {
  requires context.actor is AuthenticatedUser
  requires context.actor.roles contains "api:access"
}
```
