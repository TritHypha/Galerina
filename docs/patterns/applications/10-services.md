# Galerina Application Pattern 10 — Microservices

**When to use:** Separating concerns into independently deployable units (UserService, PaymentService, NotificationService)

---

## Service as Governed Unit

Phase 17 introduces the `service` keyword. A service is a governed deployment unit — it declares its effects, access rules, resource limits, and inter-service communication contracts in one place.

```galerina
service UserService
contract {
  effects { database.read, audit.write }
  rules {
    deny network.outbound
    require tls
    require deadline <= 2000ms
  }
  limits {
    max memory 128 MB
    max request size 512 KB
  }
}
```

The compiler verifies that all flows declared inside `UserService` do not use effects outside the declared set. Attempting to call `email.send` inside a flow that belongs to `UserService` (which does not declare `email.send`) is a compile error.

---

## Service Manifest Outputs

At build time, `galerina build --service` emits three manifest files per service:

| File | Contents |
|------|----------|
| `service.manifest.json` | Name, version, entry points, declared effects, limits |
| `service.capabilities.json` | Capability set derived from declared effects (for least-privilege IAM policy generation) |
| `service.routes.json` | HTTP routes, expected request/response types, deadline requirements |

These files are consumed by deployment tooling, API gateways, and inter-service call validators. They are the machine-readable source of truth for what the service is allowed to do.

---

## Least Privilege

A service only receives the infrastructure permissions required by its declared effects. The capability manifest is generated from the effect declarations — not from deployment configuration written by hand.

```galerina
effects { database.read, audit.write }
```

Generates a capability set that includes read access to the declared database and write access to the audit store. Network outbound is not in the set. The `deny network.outbound` rule is explicit, but least privilege would exclude it even without the explicit denial.

This eliminates the class of misconfiguration where a service is granted permissions broader than its code requires.

---

## Scale-to-Zero Manifests

When deploying to platforms that support scale-to-zero (Cloudflare Workers, AWS Lambda, Fly Machines), `galerina build --platform <target>` emits a platform-specific deployment manifest:

```
galerina build --platform cloudflare-workers
→ worker.toml + service.manifest.json

galerina build --platform lambda
→ template.yaml (SAM) + service.manifest.json

galerina build --platform fly
→ fly.toml + service.manifest.json
```

The platform manifest inherits resource limits and declared effects from the service contract. Memory limits and timeout values are written into the platform configuration automatically.

---

## Inter-Service Communication

Services communicate via typed call contracts, not raw HTTP. Each inter-service call is declared:

```galerina
call PaymentService.chargeCard {
  request: ChargeCardRequest
  response: ChargeCardResponse
  deadline: 3000ms
  fallback: PaymentResult.timeout
}
```

The compiler validates that:

- The request and response types match the declarations in `PaymentService`'s exported contract
- The deadline is within the calling service's own deadline budget
- The fallback type matches the response type

At runtime, the call is made over a governed channel. If `PaymentService` does not respond within the declared deadline, the fallback is returned — no unhandled timeout exception.

---

## Key Principle

> Secure-by-default services with explicit runtime cost.

A `service` block makes the security posture and cost model of a deployment unit explicit in the source. There are no implicit network permissions, no unbounded memory allocations, and no untracked inter-service calls. Every deviation from declared behaviour is a compile error or a runtime report entry.

---

## Phase 17 Roadmap

The `service` keyword and associated manifest generation are targeted for Phase 17. The current implementation supports governed flows within a single process. Phase 17 milestones:

1. `service` keyword parsing and contract validation
2. Service manifest generation (`service.manifest.json`, `service.capabilities.json`, `service.routes.json`)
3. Typed inter-service call contracts with deadline propagation
4. Platform manifest generation (Cloudflare Workers, Lambda, Fly Machines)
5. `galerina services` CLI (`list`, `build`, `diff`, `validate`)
6. Least-privilege IAM policy generation from capability manifests
