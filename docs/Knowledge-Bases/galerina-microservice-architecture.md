# Galerina — Secure Microservice Architecture

## Status

```
Phase 17+ — Architecture Proposal
Foundation: route declarations (implemented), contract enforcement (Phase 11C), capability provider (Phase 14)
Service manifest output: Phase 17
Serverless adapter: Phase 21+
Honest claim: secure-by-default services with explicit runtime cost — not magic zero-cost execution
```

## TL;DR

- Galerina microservice = a **governed unit** that declares authority before deployment
- Least-privilege runtime: each service only receives the capabilities declared in its contract
- Scale-to-zero is a host-platform concern (Cloudflare Workers, Lambda, Fly Machines) — Galerina produces the manifests that make it safe
- The honest goal: **secure-by-default services with explicit runtime cost**

---

## 1. Service as a Governed Unit

A Galerina service declares its contract at the service level, not just the flow level:

```galerina
// Future syntax — Phase 17
service UserService

contract {
  effects {
    database.read
    audit.write
  }

  rules {
    deny network.outbound
    require tls
    require deadline <= 2000 milliseconds
  }

  limits {
    max memory 128 MB
    max request size 512 KB
  }
}
```

This makes the service's authority **visible before deployment**. DevOps can read the service contract and know exactly what it can and cannot do — no source code archaeology required.

---

## 2. Routes as Typed Flows

```galerina
route GET "/users/:id" {
  trigger getUser
}

secure flow getUser(readonly request: Request) -> GetUserResult

contract {
  types {
    type GetUserResult = Result<Response, ApiError>
  }

  request {
    params { id: unsafe String }
  }

  response {
    exposes { userId username }
    denies { email passwordHash }
  }

  effects {
    database.read
    audit.write
  }
}
{
  unsafe let rawId: String = request.params.id
  let userId: protected UserId = validate.userId(rawId)?
  let user = UsersDB.find(userId)?
  AuditLog.write({ event: "UserRead", userId: redact(user.id) })
  return Ok(Response.okJson({ userId: user.id, username: user.username }))
}
```

What this buys over a traditional Node.js route:
- Typed request params (`id: unsafe String` — compiler knows it needs validation)
- Typed response body (email/passwordHash denied by contract)
- No accidental DB/network access (capability-bounded)
- Audit trail generated automatically by the runtime
- Safe typed error handling (`Result<Response, ApiError>`)

---

## 3. Least-Privilege Runtime

Each service gets only the capabilities it declares:

```
UserService:
  ALLOWED:  database.read, audit.write
  DENIED:   filesystem.write, network.outbound, secret.read, email.send

PaymentService:
  ALLOWED:  database.write, network.outbound, audit.write
  DENIED:   filesystem.write, secret.read
```

This is **much safer** than typical Node.js/Python services where the process has:
- Full filesystem access
- Unrestricted network access
- Process environment (including secrets)
- Global state shared across requests

Galerina's `capabilityHost.ts` enforces this at runtime — no capabilities beyond what's declared.

---

## 4. Better Idle and Scale-to-Zero Behaviour

"Zero CPU cost when idle" is a host-platform concern, not a Galerina feature.
Galerina helps by producing artefacts that make scale-to-zero safe:

```
service.manifest.json           ← what the service is
service.capabilities.json       ← what it can access
service.routes.json             ← which routes it exposes
service.audit-policy.json       ← what audit evidence it produces
service.semantic.json           ← galerina.ai.json for this service
```

The host platform (Cloudflare Workers, AWS Lambda, Fly Machines, Knative) handles actual cold-start and idle scaling. Galerina produces the **pre-verified execution plans** and **cold-start-safe dependency lists** that make scaling predictable.

---

## 5. Per-Request Memory Boundary

```
request boundary starts
  ↓
decode typed body (request.params validated)
  ↓
run flow (request data owned by this boundary)
  ↓
emit response (only allowed fields per response.exposes)
  ↓
destroy request boundary (protected values freed, no global leak)
```

No request data leaks into global state. Each request is a short-lived governed execution unit. This prevents the class of bugs where request-scoped data persists across requests in global caches.

---

## 6. Service Manifest Outputs

Every Galerina service build emits machine-readable manifests:

```json
// service.manifest.json
{
  "service": "UserService",
  "version": "0.1.0",
  "routes": [
    { "method": "GET", "path": "/users/:id", "flow": "getUser" }
  ],
  "effects": ["database.read", "audit.write"],
  "deniedEffects": ["network.outbound", "filesystem.write"],
  "limits": { "maxMemoryMB": 128, "maxRequestSizeKB": 512 }
}
```

```json
// service.capabilities.json
{
  "capabilities": [
    { "id": "host.database.read", "effect": "database.read", "allowed": true },
    { "id": "host.network.outbound", "effect": "network.outbound", "allowed": false }
  ]
}
```

These manifests let:
- DevOps see exactly what the service can do before deployment
- AI tools understand the service without reading source code
- Security reviewers audit authority boundaries statically
- Infrastructure tools configure least-privilege IAM roles automatically

---

## Roadmap

```
Phase 16A (now):  route declarations (implemented), typed request/response
Phase 16B:        effect/capability enforcement per request (capabilityHost wired)
Phase 17:         per-request memory boundary (request lifecycle tracking)
Phase 17:         service manifest output (service.manifest.json, service.capabilities.json)
Phase 21:         serverless/scale-to-zero adapter (Cloudflare Workers, Lambda)
Phase 21:         service.semantic.json (galerina.ai.json at service level)
```

---

## What Is Not Claimed

- Not "zero cost at idle" — that's a host platform feature
- Not "better performance than expert hand-tuned Express.js"
- Not "absolute security" — capability model runs on V8

**What IS true:**
> Galerina makes the service's authority visible, verifiable, and enforced — not assumed.
> The safest service is also the most declarative and the most deployable.

---

## See Also

- `galerina-governed-request-execution.md` — per-flow request governance
- `galerina-flow-entry-points.md` — routes as authorised entry points
- `galerina-static-capability-proofs.md` — compiler-verified authority
- `galerina-javascript-escape-hatch.md` — no ambient process/globalThis
- `capability-registry.yaml` — effect → capability mapping
- `galerina-stage-b-root-capability-provider.md` — compiler vs service authority isolation
