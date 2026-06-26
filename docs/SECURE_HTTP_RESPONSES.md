# Secure HTTP Responses

Galerina should treat every HTTP response as a typed, policy-checked contract,
not as a loose string, object or raw header map.

Core rule:

```text
No raw response leaves the app without a declared type, status code, content
type, cache rule and security profile.
```

A route should not return data unless Galerina knows the response type, content
type, status code, cache policy, security headers, private-field filtering,
cookie safety, redirect policy and whether the response can be embedded,
cached, indexed or downloaded.

## Response Contract

Denied pattern:

```Galerina
return {
  user: user
}
```

Preferred pattern:

```Galerina
return Response<UserProfileResponse> {
  status: 200
  content_type: "application/json"
  body: safeUserProfile
  cache: "private-no-store"
  security_profile: "authenticated_json"
}
```

## Response Profiles

Galerina should provide built-in response security profiles.

```Galerina
response_profile public_json {
  content_type: "application/json; charset=utf-8"
  headers {
    "X-Content-Type-Options": "nosniff"
    "Referrer-Policy": "strict-origin-when-cross-origin"
    "Cross-Origin-Resource-Policy": "same-origin"
  }
  cache: "public-short"
}

response_profile authenticated_json {
  content_type: "application/json; charset=utf-8"
  headers {
    "X-Content-Type-Options": "nosniff"
    "Referrer-Policy": "strict-origin-when-cross-origin"
    "Cross-Origin-Resource-Policy": "same-origin"
  }
  cache: "private-no-store"
}

response_profile html_page {
  content_type: "text/html; charset=utf-8"
  headers {
    "Content-Security-Policy": "default-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'self'"
    "X-Content-Type-Options": "nosniff"
    "Referrer-Policy": "strict-origin-when-cross-origin"
  }
  cache: "private-no-store"
}
```

## Secure Headers

For JSON APIs:

```text
Content-Type: application/json; charset=utf-8
X-Content-Type-Options: nosniff
Cache-Control: no-store for private/authenticated data
Referrer-Policy: strict-origin-when-cross-origin
Cross-Origin-Resource-Policy: same-origin
```

For HTML pages:

```text
Content-Type: text/html; charset=utf-8
Content-Security-Policy: strict default
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
X-Frame-Options: DENY or CSP frame-ancestors
Cache-Control: no-store for private pages
```

For downloads:

```text
Content-Type: correct file MIME type
Content-Disposition: attachment; filename="safe-name.pdf"
X-Content-Type-Options: nosniff
Cache-Control: private/no-store depending on sensitivity
X-Robots-Tag: noindex, nofollow for private files
```

Headers Galerina should avoid or remove:

```text
X-Powered-By
verbose Server values
Public-Key-Pins
Expect-CT
X-XSS-Protection except possibly X-XSS-Protection: 0
```

## Typed Status Codes

Status codes should be tied to response body types.

```Galerina
route GET "/orders/{orderId: UUID}" {
  response {
    200: OrderResponse
    401: AuthErrorResponse
    403: ForbiddenResponse
    404: NotFoundResponse
    429: RateLimitResponse
    500: SafeServerErrorResponse
  }

  handler getOrder
}
```

This should fail:

```Galerina
return Response<OrderResponse> {
  status: 500
  body: order
}
```

`500` should not return a successful business object.

## Field Filtering

Response filtering should be automatic and checked.

```Galerina
response UserProfileResponse {
  public id: UUID
  public displayName: String

  private email: Email
  private mobile: Phone
  admin_only accountStatus: AccountStatus
}
```

```Galerina
GET "/users/{userId: UUID}" {
  auth required

  object_access {
    resource: User
    id: userId
    rule: "user owns profile OR user is admin"
  }

  response UserProfileResponse filtered_by current_user

  handler getUserProfile
}
```

Handlers should not return raw database models directly when those models may
contain private fields.

## Safe Errors

Production routes must not expose stack traces, SQL strings, file paths,
secrets or internal exception messages.

```Galerina
error_response SafeError {
  expose: ["code", "message", "requestId"]
  hide: ["stack", "sql", "filePath", "secret", "internalMessage"]
}
```

## Cache, Cookies and Redirects

Every response should declare a cache rule. Authenticated or private pages must
not use public cache.

Sensitive cookies should default to `HttpOnly`, `Secure`, `SameSite=Lax` or
`Strict`, a short session lifetime and no token in URLs.

Redirects should be a separate safe response type:

```Galerina
return Redirect {
  status: 303
  to: trustedRoute("account.dashboard")
}
```

Unvalidated redirects from query strings should be rejected unless wrapped in a
validated safe redirect helper with an allowlist.

## CSP, Negotiation and Streaming

HTML responses should generate CSP by default. API routes should declare
`accepts` and `produces` to prevent accidental wrong-format output. Large
downloads should stream instead of loading whole files into memory.

```Galerina
response_limits {
  max_json_size: 512kb
  max_html_size: 1mb
  stream_large_files: true
  compress_min_size: 2kb
}
```

## Fast Response Handling

At build time, Galerina can compile response schemas, header profiles, cache
policies, CSP templates, field filters, error mappers and serializers.

At runtime, Galerina should select the response profile, serialize the typed body,
apply precompiled headers, apply the field filter, apply the cache rule and
return the response.

Avoid runtime header guessing, dynamic response-shape scanning, string-based
JSON building, manual HTML escaping, late security middleware chains and raw
response mutation.

## Response Security Report

Galerina should generate a response security report during build.

```json
{
  "httpResponses": {
    "totalRoutes": 42,
    "rawResponses": 0,
    "missingContentType": 0,
    "missingNosniff": 0,
    "publicCacheOnPrivateRoutes": 0,
    "unsafeRedirects": 0,
    "stackTraceExposure": 0,
    "xPoweredByRemoved": true,
    "serverHeader": "non_informative",
    "cspEnabledForHtml": true,
    "deprecatedHeaders": {
      "Public-Key-Pins": 0,
      "Expect-CT": 0,
      "X-XSS-Protection": "disabled_or_not_set"
    }
  }
}
```

## Package Ownership

```text
galerina-core
  response syntax, status/body contract vocabulary and diagnostics

galerina-core-compiler
  response contract checking, profile compilation and response report generation

galerina-framework-app-kernel
  response policy enforcement, field filtering, safe error mapping and cookie policy

galerina-framework-api-server
  transport-level headers, content negotiation, streaming and response writing

galerina-core-security
  header safety, cookie safety, redirect safety, redaction and secret leakage checks

galerina-core-reports
  shared response security report schema
```

## Design Rule

```text
Galerina should make secure responses the default.
Unsafe or unclear HTTP responses should not compile.
Raw responses should be denied by default except inside trusted low-level packages.
```

## References

- OWASP HTTP Security Response Headers Cheat Sheet:
  <https://cheatsheetseries.owasp.org/cheatsheets/HTTP_Headers_Cheat_Sheet.html>
- OWASP REST Security Cheat Sheet:
  <https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html>
- MDN Content Security Policy:
  <https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CSP>
