# CSRF Protection

Galerina should make CSRF protection a default route security rule in the
language, compiler checks and Secure App Kernel, not a manual step every
developer has to remember.

CSRF matters because browsers can automatically attach cookies to requests. A
malicious site can try to make an authenticated browser send a state-changing
request to a trusted site. Galerina should treat this as a route-intent problem:

```text
Any route that changes state must prove user intent.
```

Galerina should follow current OWASP guidance: state-changing requests should use
CSRF protections such as synchronizer tokens for stateful applications, signed
double-submit cookies for stateless applications, custom request headers for
API-driven sites, Fetch Metadata checks, SameSite cookie policy, Origin/Referer
validation where appropriate, and no state-changing `GET` routes. CSRF must be
paired with XSS prevention because XSS can bypass CSRF defenses.

## Default Policy

Unsafe by default:

```text
POST
PUT
PATCH
DELETE
file upload
payment action
trade action
password change
email change
account deletion
admin action
```

Required unless explicitly exempted by a safe non-cookie auth model:

```text
CSRF token
Origin or Referer validation
Fetch Metadata validation
SameSite cookie policy
route-level security report
```

Example policy direction:

```Galerina
security csrf {
  enabled true

  apply_to ["POST", "PUT", "PATCH", "DELETE"]

  token {
    mode auto
    stateful synchronizer_token
    stateless signed_double_submit_cookie
    bind_to_session true
    header "X-CSRF-Token"
    form_field "_csrf"
  }

  fetch_metadata {
    enabled true
    block_cross_site_state_change true
    allow_same_origin true
    same_site_requires_token true
  }

  origin_check {
    enabled true
    fallback_to_referer true
  }

  cookies {
    same_site Lax
    secure true
    http_only_session_cookie true
  }

  deny_state_change_get true
}
```

This is design-direction syntax. It must not be treated as frozen Galerina syntax
until the language docs and compiler agree.

## Route Policy

Example route:

```Galerina
api AccountApi {
  POST "/account/email" {
    request ChangeEmailRequest
    response ChangeEmailResponse

    auth required
    csrf required

    handler changeEmail
  }
}
```

Compiler or route-check failure:

```text
Galerina_SECURITY_ERROR:
Route POST /account/email changes user state but has no CSRF protection.

Fix:
- add csrf required
- or declare a safe non-cookie auth method such as bearer-token API auth
```

## GET Must Not Change State

Galerina should block this:

```Galerina
GET "/delete-account" {
  handler deleteAccount
}
```

Expected diagnostic:

```text
Galerina_ROUTE_ERROR:
GET route cannot call a state-changing handler.

Route:
GET /delete-account

Problem:
deleteAccount performs a write/delete operation.

Fix:
Use POST or DELETE with csrf required.
```

`GET`, `HEAD` and `OPTIONS` must be treated as read-safe routes. If a handler
declares write, delete, payment, trade, account-change, file-write or admin
effects, it must not be reachable through a read-safe method.

## Cookie Auth Versus Bearer Auth

CSRF mainly applies when authentication is automatic through browser behavior,
especially session cookies.

Cookie-authenticated browser route:

```Galerina
auth session_cookie {
  csrf required
}
```

Pure API route using explicit authorization headers:

```Galerina
auth bearer_token {
  csrf not_required
  require_header "Authorization"
}
```

Rule:

```text
If authentication is automatic through cookies, CSRF is required.
If authentication is manually attached through Authorization headers, CSRF may not be required.
```

Bearer-token routes must still enforce:

```text
CORS policy
Origin checks where useful
rate limits
request validation
audit logging
```

## Runtime Request Flow

Secure App Kernel request flow:

```text
1. Request arrives.
2. Galerina checks HTTP method.
3. If method is GET/HEAD/OPTIONS, allow only read-safe behaviour.
4. If method is POST/PUT/PATCH/DELETE, mark as state-changing.
5. Check Fetch Metadata headers.
6. Reject cross-site unsafe requests.
7. Check Origin or Referer where policy requires it.
8. Check CSRF token.
9. Check token is bound to session when using session state.
10. Reject if token is missing, expired, mismatched or forged.
11. Log failed CSRF attempt without leaking token values.
12. Continue to handler only if all checks pass.
```

## Reports

Galerina should generate a CSRF section in the security report:

```json
{
  "csrf": {
    "enabled": true,
    "stateChangingMethods": ["POST", "PUT", "PATCH", "DELETE"],
    "tokenMode": "auto",
    "statefulMode": "synchronizer_token",
    "statelessMode": "signed_double_submit_cookie",
    "fetchMetadata": true,
    "originCheck": true,
    "sameSiteCookie": "Lax",
    "unsafeGetRoutes": 0,
    "unprotectedStateChangingRoutes": 0
  }
}
```

Reports must not include raw CSRF token values, session identifiers, cookies or
authorization headers.

## High-Risk Routes

Financial, admin and account-control routes should require more than a CSRF
token:

```Galerina
api TradingApi {
  POST "/trade/buy" {
    auth required
    csrf required
    user_interaction required
    audit required
    idempotency_key required

    handler buyStock
  }
}
```

High-risk examples:

```text
stock trade
payment
withdrawal
password change
email change
account deletion
admin permission change
large file deletion
```

These routes should also require audit logging, idempotency where appropriate,
rate limits, typed request validation and user interaction checks for sensitive
operations.

## Package Ownership

CSRF policy spans several existing packages:

```text
galerina-core-network
  secure cookie, Fetch Metadata, Origin/Referer and network route policy

galerina-framework-app-kernel
  route-level runtime enforcement before handlers run

galerina-framework-api-server
  HTTP header/cookie extraction and transport-level request normalization

galerina-core-security
  token policy, redaction, route security decisions and reports

galerina-core-compiler
  route/effect checks for state-changing methods and missing CSRF policy

galerina-core-reports
  shared security report contracts if report schemas become package-owned
```

Do not create a standalone CSRF package unless the policy surface grows large
enough to justify package ownership.

## Non-Goals

CSRF protection should not become:

```text
a claim that XSS no longer matters
a replacement for authentication
a replacement for authorization
a replacement for CORS policy
a reason to allow state-changing GET routes
a reason to log token values
```

CSRF is one layer in Galerina's route security model.

## References

- OWASP CSRF Prevention Cheat Sheet: <https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html>
- OWASP XSS Prevention Cheat Sheet: <https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html>
