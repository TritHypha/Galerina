# Secure Fast Routing

Galerina routing should be compiled, typed and policy-checked before the app runs.

Core rule:

```text
No route should be callable unless its security, input, output and resource
rules are known.
```

Routes should not be loose strings handled by ad hoc middleware at runtime.
They should become a compiled security graph and route manifest.

Before deployment, Galerina should know:

```text
which route exists
which method it accepts
what request body is allowed
what auth is required
what roles/scopes are allowed
whether CSRF is required
what CORS policy applies
what rate limit applies
what database/network/file/AI effects are allowed
what response fields are safe to return
what response security profile applies
how many concurrent requests are allowed
```

## Route Contract

Instead of this style:

```javascript
app.post("/orders/:id", handler)
```

Galerina should prefer a typed route contract:

```Galerina
route POST "/orders/{orderId: UUID}" {
  auth required
  csrf required
  rate_limit "user:60/min"
  body CreateOrderRequest
  response OrderResponse

  allow_roles ["customer", "admin"]

  object_access {
    resource: Order
    id: orderId
    rule: "user owns order OR user is admin"
  }

  effects {
    database: ["orders.read", "orders.write"]
    network: []
    files: []
  }

  limits {
    timeout: 2s
    max_body_size: 64kb
    max_concurrency_per_user: 5
  }

  handler createOrder
}
```

This gives Galerina two advantages:

```text
1. Security can be checked before deployment.
2. Runtime routing can be fast because route matching is precompiled.
```

## Fast Routing

Galerina should compile routes into a method-indexed radix tree or trie.

Example:

```text
GET
  /users
  /users/{userId}
  /orders/{orderId}

POST
  /orders
  /payments
  /account/email

DELETE
  /orders/{orderId}
```

Runtime routing should:

```text
1. Read HTTP method.
2. Jump to method-specific route tree.
3. Match static path segments first.
4. Match typed parameters second.
5. Reject unknown routes early.
6. Run precompiled route policy.
7. Run handler.
```

Fast path:

```text
method lookup
path lookup
typed parameter extraction
security policy check
body parser selection
schema validation
handler call
```

Avoid on the hot path:

```text
runtime regex building
dynamic middleware discovery
rechecking route definitions
untyped body parsing
late permission lookup
large global middleware chains
```

## Secure Routing Layers

Galerina routing should apply explicit layers:

```text
Layer 1: Method and path match
Layer 2: Transport/security headers
Layer 3: CORS/Origin/Fetch Metadata/CSRF checks
Layer 4: Authentication
Layer 5: Function-level authorization
Layer 6: Object-level authorization
Layer 7: Property-level authorization
Layer 8: Input validation
Layer 9: Resource limits
Layer 10: Handler effects
Layer 11: Response filtering
Layer 12: Audit/reporting
```

CORS should be explicit per app, group or route. Galerina should not emit broad
CORS headers by default when cross-domain calls are not expected.

## Route Groups

Group-level policy should compile into each route's final policy.

```Galerina
route_group "/admin" {
  auth required
  roles ["admin"]
  csrf required
  rate_limit "user:30/min"

  cors {
    enabled: false
  }

  headers {
    frame_options: "DENY"
    content_type_options: "nosniff"
    referrer_policy: "strict-origin-when-cross-origin"
  }

  routes {
    GET "/users" {
      response AdminUserList
      handler listUsers
    }

    POST "/users/{userId: UUID}/suspend" {
      body SuspendUserRequest
      response SuspendUserResponse

      object_access {
        resource: User
        id: userId
        rule: "admin can suspend user"
      }

      audit required

      handler suspendUser
    }
  }
}
```

Security headers should be supported at app, group and route level, then emitted
in route reports and reverse-proxy/server config where appropriate.

## Compile-Time Checks

Galerina should fail route checks for dangerous routes.

State-changing GET:

```Galerina
GET "/delete-account" {
  handler deleteAccount
}
```

Diagnostic:

```text
GALERINA-ROUTE-SECURITY-001
GET route cannot perform a state-changing action.

Route:
GET /delete-account

Handler:
deleteAccount

Fix:
Use POST or DELETE with csrf required.
```

Missing auth for financial state:

```Galerina
POST "/payments" {
  body PaymentRequest
  handler createPayment
}
```

Diagnostic:

```text
GALERINA-ROUTE-SECURITY-002
POST /payments changes financial state but has no auth rule.

Required:
auth required
csrf required
idempotency_key required
audit required
```

Missing object-level authorization:

```Galerina
GET "/orders/{orderId: UUID}" {
  auth required
  response OrderResponse
  handler getOrder
}
```

Diagnostic:

```text
GALERINA-AUTHZ-OBJECT-001
Route uses user-supplied object ID but has no object_access rule.

Route:
GET /orders/{orderId}

Fix:
Add object_access rule proving the user can access this order.
```

## Property-Level Response Security

Galerina should check which fields a caller may see, not only whether the caller
can access an object.

```Galerina
response UserProfile {
  public id: UUID
  public displayName: String

  private email: Email
  private mobile: Phone
  admin_only accountStatus: AccountStatus
}
```

Route:

```Galerina
GET "/users/{userId: UUID}" {
  auth required

  object_access {
    resource: User
    id: userId
    rule: "user owns profile OR user is admin"
  }

  response UserProfile filtered_by current_user

  handler getUserProfile
}
```

The response filter should be compiled from the response schema and route
policy so sensitive fields are not accidentally returned.

## Multiple Requests and Resource Limits

Galerina should handle concurrent requests through the runtime and app-kernel
scheduler. Developers should declare route limits, not manually manage
asynchronous complexity.

```Galerina
limits {
  timeout: 2s
  max_body_size: 128kb
  max_concurrency_global: 1000
  max_concurrency_per_ip: 20
  max_concurrency_per_user: 10
  queue: "short"
  backpressure: "reject_with_429"
}
```

Runtime behaviour:

```text
1. Accept request.
2. Apply cheap checks first.
3. Reject oversized bodies before parsing.
4. Reject blocked methods before auth.
5. Reject rate-limited requests before handler work.
6. Parse only the expected body type.
7. Run handler inside declared resource budget.
8. Apply backpressure if overloaded.
9. Return 429/503 safely rather than crash.
```

## Request Pipeline

The request pipeline should reject bad requests before expensive work.

```text
1. Method allowed?
2. Path exists?
3. Host allowed?
4. TLS/security headers policy valid?
5. Request body size allowed?
6. Rate limit allowed?
7. CORS/Origin/Fetch Metadata valid?
8. CSRF token valid if required?
9. Auth token/session valid?
10. Role/scope allowed?
11. Object-level access allowed?
12. Input schema valid?
13. Handler effects allowed?
14. Handler runs.
15. Response filtered.
16. Audit/report written.
```

This is both safer and faster because invalid requests are stopped before
parsing, database calls, network calls or paid-provider usage.

## Route Effects

Every route should declare its allowed effects.

```Galerina
effects {
  database: ["orders.read", "orders.write"]
  network: ["payments.stripe"]
  files: []
  ai: []
}
```

The compiler/runtime can block:

```text
A route that only declares database read cannot perform database write.
A route that does not declare network access cannot call an external API.
A route that does not declare file access cannot read or write files.
```

This protects against route handlers becoming hidden backdoors.

## Route Security Profiles

Galerina may provide default route security profiles:

```Galerina
security_profile public_read {
  auth optional
  csrf not_required
  methods ["GET"]
  cache allowed
  rate_limit "ip:300/min"
}

security_profile user_write {
  auth required
  csrf required
  methods ["POST", "PUT", "PATCH", "DELETE"]
  rate_limit "user:60/min"
  audit required
}

security_profile finance_action {
  auth required
  csrf required
  mfa required
  idempotency_key required
  audit required
  user_interaction required
  rate_limit "user:10/min"
}
```

Usage:

```Galerina
POST "/trade/buy" uses finance_action {
  body BuyStockRequest
  response TradeResponse
  handler buyStock
}
```

## Route Manifest

Builds should generate a route manifest.

```json
{
  "routes": [
    {
      "method": "POST",
      "path": "/orders/{orderId}",
      "handler": "createOrder",
      "auth": "required",
      "csrf": "required",
      "rateLimit": "user:60/min",
      "body": "CreateOrderRequest",
      "response": "OrderResponse",
      "objectAccess": true,
      "propertyFilter": "current_user",
      "effects": {
        "database": ["orders.read", "orders.write"],
        "network": [],
        "files": [],
        "ai": []
      },
      "limits": {
        "timeout": "2s",
        "maxBodySize": "64kb",
        "maxConcurrencyPerUser": 5
      }
    }
  ]
}
```

This helps:

```text
developers
security reviewers
AI coding assistants
CI/CD pipelines
auditors
framework tooling
```

The route manifest can also map routes to OWASP/ASVS-style control checks.
Secure HTTP response policy is detailed in `SECURE_HTTP_RESPONSES.md`.

## Architecture

Compile time:

```text
parse routes
type-check path parameters
validate auth policy
validate CSRF policy
validate CORS policy
validate request/response schemas
validate object/property authorization declarations
validate effects
generate route trie
generate route manifest
generate security report
```

Runtime:

```text
method lookup
path trie lookup
cheap rejection first
rate limit
auth/session/token check
authorization check
schema validation
handler execution
response filtering
audit logging
```

## Package Ownership

```text
galerina-core
  route syntax, typed path parameters, schema references and diagnostics

galerina-core-compiler
  route parsing, route graph checks, trie generation and manifest generation

galerina-framework-app-kernel
  auth, CSRF, CORS, authorization, effects, limits, response filtering and audit policy

galerina-framework-api-server
  HTTP method/path dispatch, request normalisation and server-level limits

galerina-core-reports
  shared route manifest, security report and route audit report shapes
```

## Design Rule

```text
Galerina should make secure routing the default.
Galerina should make unsafe routing difficult.
Galerina should make fast routing a compiler/runtime feature rather than a developer burden.
```

## References

- OWASP API Security Top 10 2023:
  <https://owasp.org/API-Security/editions/2023/en/0x11-t10/>
- OWASP REST Security Cheat Sheet:
  <https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html>
- OWASP HTTP Security Response Headers Cheat Sheet:
  <https://cheatsheetseries.owasp.org/cheatsheets/HTTP_Headers_Cheat_Sheet.html>
- OWASP API3:2023 Broken Object Property Level Authorization:
  <https://owasp.org/API-Security/editions/2023/en/0xa3-broken-object-property-level-authorization/>
- OWASP API4:2023 Unrestricted Resource Consumption:
  <https://owasp.org/API-Security/editions/2023/en/0xa4-unrestricted-resource-consumption/>
- OWASP Application Security Verification Standard:
  <https://owasp.org/www-project-application-security-verification-standard/>
